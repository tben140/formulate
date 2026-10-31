import {
  DELETION_CONFIRMATION,
  readDeletionResponse,
  type DeletionFailureReason,
  type DeletionPreview,
} from "@formulate/shopify";

import { getUsableTokens } from "./customer-account";

/**
 * Account deletion through the Worker (SHO-90), the app's side of
 * apps/web/lib/account-deletion.ts. The app calls the Worker directly, as it
 * does for consent: a native app isn't subject to CORS, and the Worker sends
 * none, so no website can make these calls.
 */
// No trailing slash, so `${API_BASE_URL}/account/...` never becomes "//account".
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

type Failure = { readonly ok: false; readonly reason: DeletionFailureReason };

const call = async <T extends { ok: true }>(
  path: string,
  body: unknown,
): Promise<T | Failure> => {
  if (!API_BASE_URL) return { ok: false, reason: "not-configured" };
  try {
    // Inside the try: reading or renewing stored tokens can reject (a
    // SecureStore error, a refresh that couldn't reach Shopify), and that's a
    // failed request like any other, not a crash of the mutation.
    const tokens = await getUsableTokens();
    if (!tokens) return { ok: false, reason: "unauthorized" };
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: tokens.accessToken },
      body: JSON.stringify(body),
    });
    return (await readDeletionResponse(response)) as T | Failure;
  } catch {
    return { ok: false, reason: "network" };
  }
};

export const previewDeletion = () =>
  call<DeletionPreview>("/account/deletion/preview", {});

export const deleteAccount = () =>
  call<{ ok: true; cancelled: number }>("/account/deletion", DELETION_CONFIRMATION);
