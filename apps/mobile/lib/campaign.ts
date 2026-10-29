import {
  activeCampaign,
  CampaignByHandleQuery,
  campaignNow,
  CampaignsQuery,
  describeError,
  type CampaignView,
} from "@formulate/shopify";
import { useQuery } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

import { storefront } from "./storefront";

/**
 * Campaigns in the app (SHO-169). The dates are checked at render, against
 * the visitor's view, so a campaign appears and disappears on time even from
 * a cached query.
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

let state: { preview: string | null; access: ReadonlySet<string> } = {
  preview: null,
  access: new Set(),
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
// safe side.
void SecureStore.getItemAsync(ACCESS_KEY)
  .then((value) =>
    set({ access: new Set((value ?? "").split(",").filter((h) => HANDLE.test(h))) }),
  )
  .catch(() => undefined);

/** Remembers that this device came through a campaign's email link. */
export const grantCampaignAccess = async (handle: string): Promise<void> => {
  if (!HANDLE.test(handle)) return;
  const access = [...state.access].filter((known) => known !== handle).slice(-9);
  const next = new Set([...access, handle]);
  set({ access: next });
  await SecureStore.setItemAsync(ACCESS_KEY, [...next].join(",")).catch(() => undefined);
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
  const current = useSyncExternalStore(subscribe, () => state);
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
    queryFn: async () => unwrap(await storefront.request(CampaignsQuery, {})),
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
