import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { adminFromEnv, type Admin } from "./admin";
import { calendar, calendarMarkdown } from "./calendar";
import { campaignOf } from "./campaign-node";
import { checkCampaign } from "./check";
import { plannedEmails, plannedPushes } from "./emails";
import { perkKey, planPerks } from "./perks";
import { activeSubscriptions, addPerk, perkOnetimes } from "./recharge";
import { createDraft, createPushDraft, getEmails, getPushNames } from "./klaviyo";
import { campaignReport, reportMarkdown } from "./report";
import {
  createCampaign,
  getCollection,
  getDiscounts,
  getEntries,
  getEntry,
  getOrders,
  getPerkVariant,
  upsertFunctionDiscount,
} from "./shopify-data";
import { campaignDiscounts, discountConfig } from "./sync";
import { templateFields, TEMPLATES, type TemplateName } from "./templates";
import type { Snapshot } from "./types";

const USAGE = `Campaigns (docs/campaigns.md, "The campaigns CLI")

  pnpm campaigns calendar                     every campaign, overlaps and housekeeping
  pnpm campaigns check <handle>               everything that must agree before go-live
  pnpm campaigns new <template> <handle> --starts <ISO> --ends <ISO>
                                              a draft campaign and its collection
                                              templates: ${Object.keys(TEMPLATES).join(", ")}
  pnpm campaigns sync <handle> [--activate]   the Function discount, from the record
  pnpm campaigns emails <handle> [--create]   the planned emails; --create makes Klaviyo drafts
  pnpm campaigns pushes <handle> [--create]   launch and last-day pushes; --create makes Klaviyo
                                              drafts for KLAVIYO_PUSH_SEGMENT_ID
  pnpm campaigns report <handle>              results, as Markdown
  pnpm campaigns perks <handle> [--apply]     the subscriber perk on each next delivery after
                                              the campaign; plans unless --apply

Reads SHOPIFY_STORE_DOMAIN and SHOPIFY_APP_CLIENT_SECRET (and KLAVIYO_PRIVATE_KEY,
optional) from the environment or ~/.config/formulate/shopify-app.env, and
RECHARGE_API_TOKEN (perks only) from ~/.config/formulate/recharge.env.`;

const flag = (args: string[], name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const snapshot = async (
  admin: Admin,
  handle: string,
  includeExpired = false,
): Promise<Snapshot> => {
  const entry = await getEntry(admin, handle);
  if (!entry) throw new Error(`No campaign "${handle}".`);
  const linked = entry.fields.collection
    ? await getCollection(admin, entry.fields.collection, entry.id)
    : null;
  const key = process.env.KLAVIYO_PRIVATE_KEY;
  return {
    entry,
    collection: linked?.collection ?? null,
    products: linked?.products ?? [],
    discounts: await getDiscounts(admin, { includeExpired }),
    emails: key && entry.fields.title ? await getEmails(key, entry.fields.title) : null,
  };
};

const main = async (args: string[]): Promise<number> => {
  const envFile =
    process.env.CAMPAIGNS_ENV ?? join(homedir(), ".config/formulate/shopify-app.env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const rechargeEnv = join(homedir(), ".config/formulate/recharge.env");
  if (!process.env.RECHARGE_API_TOKEN && existsSync(rechargeEnv))
    process.loadEnvFile(rechargeEnv);
  const [command, ...rest] = args;
  const handle = rest[0];

  switch (command) {
    case "calendar": {
      const admin = await adminFromEnv();
      console.log(calendarMarkdown(calendar(await getEntries(admin))));
      return 0;
    }

    case "check": {
      if (!handle) break;
      const admin = await adminFromEnv();
      const data = await snapshot(admin, handle);
      const findings = checkCampaign(data);
      const mark = { error: "✗", warning: "!", ok: "✓" } as const;
      for (const finding of findings)
        console.log(`${mark[finding.level]} ${finding.message}`);
      if (!data.emails) console.log("- Emails not checked: no KLAVIYO_PRIVATE_KEY.");
      return findings.some((finding) => finding.level === "error") ? 1 : 0;
    }

    case "new": {
      const [template, newHandle] = rest;
      const starts = flag(rest, "starts");
      const ends = flag(rest, "ends");
      if (!template || !newHandle || !starts || !ends) break;
      if (!Object.hasOwn(TEMPLATES, template))
        throw new Error(`No template "${template}".`);
      if (!/^[a-z0-9-]{1,64}$/.test(newHandle))
        throw new Error("Handles are lowercase letters, digits and hyphens.");
      const startsAt = new Date(starts);
      const endsAt = new Date(ends);
      if (
        Number.isNaN(startsAt.getTime()) ||
        Number.isNaN(endsAt.getTime()) ||
        endsAt <= startsAt
      )
        throw new Error("--starts and --ends must be ISO times, the start first.");
      const admin = await adminFromEnv();
      const created = await createCampaign(admin, {
        handle: newHandle,
        fields: templateFields(template as TemplateName, startsAt, endsAt),
      });
      console.log(`Created ${newHandle} as a draft, with collection ${created.collectionId}.
Next:
  1. Tag products: set their Campaign field to ${newHandle}.
  2. Edit the copy in the admin; add an image (with alt text) and the subscriber perk.
  3. Publish the collection to the Online Store and the headless channel.
  4. pnpm campaigns sync ${newHandle}, then pnpm campaigns check ${newHandle}.
  5. Publish the entry (Active) when it's ready to be seen.`);
      return 0;
    }

    case "sync": {
      if (!handle) break;
      const admin = await adminFromEnv();
      const data = await snapshot(admin, handle);
      const campaign = campaignOf(data.entry, data.collection?.handle);
      if (!campaign) throw new Error("The campaign can't be shown; run check for why.");
      const result = discountConfig(data.entry, data.collection, data.products);
      if ("error" in result) throw new Error(`Can't sync: ${result.error}.`);
      const existing = campaignDiscounts(data.entry, data.discounts).find(
        (d) => d.kind === "app",
      );
      const id = await upsertFunctionDiscount(admin, {
        existingId: existing?.id ?? null,
        title: `${campaign.title} (campaign)`,
        code: campaign.discountCode,
        startsAt: campaign.startsAt.toISOString(),
        endsAt: campaign.endsAt.toISOString(),
        config: result.config,
        activate: rest.includes("--activate"),
      });
      console.log(
        existing
          ? `Updated ${id}.${rest.includes("--activate") ? " Updating doesn't switch it on: activate it in the admin." : ""}`
          : `Created ${id}${rest.includes("--activate") ? "" : ", switched off: activate it in the admin, and switch off any plain discount it replaces"}.`,
      );
      return 0;
    }

    case "emails": {
      if (!handle) break;
      const admin = await adminFromEnv();
      const entry = await getEntry(admin, handle);
      if (!entry) throw new Error(`No campaign "${handle}".`);
      const planned = plannedEmails(entry);
      const key = process.env.KLAVIYO_PRIVATE_KEY;
      const existing =
        key && entry.fields.title ? await getEmails(key, entry.fields.title) : [];
      for (const email of planned) {
        const found = existing.find((e) => e.name === email.name);
        console.log(
          `${email.sendAt}  ${email.name}  "${email.subject}"${found ? `  (exists: ${found.status})` : ""}`,
        );
        if (rest.includes("--create") && !found) {
          if (!key) throw new Error("--create needs KLAVIYO_PRIVATE_KEY.");
          console.log(`  created draft ${await createDraft(key, email)}`);
        }
      }
      return 0;
    }

    case "pushes": {
      if (!handle) break;
      const admin = await adminFromEnv();
      const entry = await getEntry(admin, handle);
      if (!entry) throw new Error(`No campaign "${handle}".`);
      const create = rest.includes("--create");
      const key = process.env.KLAVIYO_PRIVATE_KEY;
      const segment = process.env.KLAVIYO_PUSH_SEGMENT_ID;
      if (create && (!key || !segment))
        throw new Error(
          "--create needs KLAVIYO_PRIVATE_KEY and KLAVIYO_PUSH_SEGMENT_ID.",
        );
      // Reruns don't duplicate: a push whose draft already exists is skipped.
      const existing =
        create && entry.fields.title ? await getPushNames(key!, entry.fields.title) : [];
      for (const push of plannedPushes(entry)) {
        console.log(
          `${push.sendAt}  ${push.name}  "${push.title}: ${push.body}"  → ${push.deepLink}`,
        );
        if (create && existing.includes(push.name)) console.log("  draft already exists");
        else if (create)
          console.log(`  created draft ${await createPushDraft(key!, push, segment!)}`);
      }
      return 0;
    }

    case "report": {
      if (!handle) break;
      const admin = await adminFromEnv();
      const data = await snapshot(admin, handle, true);
      const campaign = campaignOf(data.entry);
      if (!campaign) throw new Error("The campaign can't be read; run check for why.");
      const titles = campaignDiscounts(data.entry, data.discounts).flatMap((d) => [
        d.title,
        ...d.codes,
      ]);
      if (campaign.discountCode) titles.push(campaign.discountCode);
      const orders = await getOrders(
        admin,
        campaign.startsAt.toISOString(),
        campaign.endsAt.toISOString(),
        titles,
      );
      console.log(
        reportMarkdown(
          campaign.title,
          campaignReport(orders, { handle, discountTitles: titles }),
        ),
      );
      return 0;
    }

    case "perks": {
      if (!handle) break;
      const token = process.env.RECHARGE_API_TOKEN;
      if (!token) throw new Error("perks needs RECHARGE_API_TOKEN.");
      const admin = await adminFromEnv();
      const entry = await getEntry(admin, handle);
      const campaign = entry ? campaignOf(entry) : null;
      if (!entry || !campaign)
        throw new Error(`No campaign "${handle}" that can be read.`);
      const variantId = entry.fields.perk_variant;
      if (!variantId)
        throw new Error("The campaign has no perk_variant: nothing to add.");
      const variant = await getPerkVariant(admin, variantId);
      if (!variant) throw new Error(`perk_variant ${variantId} doesn't exist.`);
      const plan = planPerks(
        handle,
        campaign.endsAt,
        await activeSubscriptions(token),
        await perkOnetimes(token),
      );
      const apply = rest.includes("--apply");
      console.log(
        `${variant.title}, free, with the next delivery after ${campaign.endsAt.toISOString()}:`,
      );
      for (const item of plan.add) {
        const line = `  subscription ${item.subscriptionId}: address ${item.addressId}, charge ${item.date}`;
        if (!apply) {
          console.log(`${line} (would add)`);
          continue;
        }
        const id = await addPerk(token, {
          ...variant,
          addressId: item.addressId,
          date: item.date,
          key: perkKey(handle, item.subscriptionId),
        });
        console.log(`${line}: added one-time ${id}`);
      }
      for (const item of plan.skip)
        console.log(`  subscription ${item.subscriptionId}: skipped, ${item.reason}`);
      if (!apply && plan.add.length > 0)
        console.log("Nothing changed. Run again with --apply to add them.");
      return 0;
    }
  }
  console.log(USAGE);
  return command ? 2 : 0;
};

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
