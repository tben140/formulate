import {
  activeCampaign,
  CampaignByHandleQuery,
  campaignNow,
  CampaignsQuery,
  type CampaignNode,
  describeError,
  toCampaign,
  type CampaignView,
} from "@formulate/shopify";
import { useQuery } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

import { storefront } from "./storefront";

/**
 * Campaigns in the app (SHO-169). The dates are checked at render, against
 * the visitor's view, so a campaign appears and disappears on time even from
 * a cached query. An app left open across a start or end time re-renders
 * then (`scheduleNextChange`), so banners, badges and offers change together.
 *
 * The view, as on web:
 * - `preview`: a campaign opened through its preview link
 *   (`formulate://pages/campaigns/<handle>?preview=<token>`), for this app
 *   session. The token is checked by the web site, so it's never in the app.
 * - `access`: email-link campaigns reached through `/discount/<code>`,
 *   remembered on the device.
 *
 * `EXPO_PUBLIC_CAMPAIGN_PREVIEW_AT` (an ISO time) moves the clock instead.
 * Development builds only.
 */

const ACCESS_KEY = "doublehelix.campaign.access";
const HANDLE = /^[a-z0-9-]{1,64}$/;

let state: {
  preview: string | null;
  access: ReadonlySet<string>;
  /** Bumped when a campaign starts or ends, so everything re-renders. */
  tick: number;
} = {
  preview: null,
  access: new Set(),
  tick: 0,
};
const listeners = new Set<() => void>();
const set = (next: Partial<typeof state>) => {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// Restored once at startup; until then nothing email-only shows, which is the
// safe side. Merged with anything granted meanwhile (an email link that opened
// the app), and grants wait for it, so neither loses the other's handles.
const restored = SecureStore.getItemAsync(ACCESS_KEY)
  .then((value) => {
    const stored = (value ?? "").split(",").filter((h) => HANDLE.test(h));
    set({ access: new Set([...stored, ...state.access]) });
  })
  .catch(() => undefined);

/** Remembers that this device came through a campaign's email link. */
export const grantCampaignAccess = async (handle: string): Promise<void> => {
  if (!HANDLE.test(handle)) return;
  await restored;
  const access = [...state.access].filter((known) => known !== handle).slice(-9);
  const next = new Set([...access, handle]);
  set({ access: next });
  await SecureStore.setItemAsync(ACCESS_KEY, [...next].join(",")).catch(() => undefined);
};

let changeTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Re-renders every campaign-aware component at the next start or end time
 * within a day (timers further out aren't worth holding; the five-minute
 * refetch schedules again).
 */
const scheduleNextChange = (nodes: readonly (CampaignNode | null | undefined)[]) => {
  const now = campaignClock().getTime();
  const next = Math.min(
    ...nodes
      .map(toCampaign)
      .flatMap((campaign) =>
        campaign ? [campaign.startsAt.getTime(), campaign.endsAt.getTime()] : [],
      )
      .filter((time) => time > now && time - now <= 24 * 60 * 60 * 1000),
  );
  clearTimeout(changeTimer);
  if (Number.isFinite(next))
    changeTimer = setTimeout(() => set({ tick: state.tick + 1 }), next - now + 1000);
};

/**
 * Starts a preview if the web site accepts the token. Returns whether it did.
 * Needs EXPO_PUBLIC_WEB_URL, the web storefront's address.
 */
export const startCampaignPreview = async (handle: string, token: string) => {
  const web = process.env.EXPO_PUBLIC_WEB_URL ?? "";
  if (!web || !HANDLE.test(handle) || !token) return false;
  const ok = await fetch(`${web}/api/campaign-preview`, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: token,
  }).then(
    (response) => response.status === 204,
    () => false,
  );
  if (ok) set({ preview: handle });
  return ok;
};

export const stopCampaignPreview = () => set({ preview: null });

export const campaignClock = (): Date =>
  campaignNow(__DEV__ ? process.env.EXPO_PUBLIC_CAMPAIGN_PREVIEW_AT : null);

/** Who's looking, for the shared campaign rules. */
export const useCampaignView = (): CampaignView => {
  // The third snapshot is for the web build's static render, which throws
  // without one ("Missing getServerSnapshot"). The same state: there's no
  // access or preview on the server.
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  return { now: campaignClock(), preview: current.preview, access: current.access };
};

const unwrap = <T>(
  result: Awaited<ReturnType<typeof storefront.request<T, never>>>,
): T => {
  if (!result.ok) throw new Error(describeError(result.error));
  return result.data;
};

/** The live campaign for this visitor, or null. Refreshed every five minutes at most. */
export const useActiveCampaign = () => {
  const view = useCampaignView();
  const { data } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const data = unwrap(await storefront.request(CampaignsQuery, {}));
      scheduleNextChange(data.metaobjects.nodes);
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
  return data ? activeCampaign(data.metaobjects.nodes, view) : null;
};

/** One campaign and its products, for its screen. */
export const useCampaign = (handle: string) =>
  useQuery({
    queryKey: ["campaign", handle],
    queryFn: async () =>
      unwrap(await storefront.request(CampaignByHandleQuery, { handle })),
    enabled: handle.length > 0,
  });
