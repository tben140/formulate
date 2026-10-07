import {
  DELETION_CONFIRMATION,
  readDeletionResponse,
  type DeletionFailureReason,
  type DeletionPreview,
} from "@formulate/shopify";

/**
 * Account deletion through the Worker (SHO-90). Server-side only: the Worker
 * sends no CORS headers, on purpose, so the browser can't call it, and the
 * customer's access token never leaves this server's cookie.
 */
const API_URL = process.env.FORMULATE_API_URL ?? "";

type Failure = { readonly ok: false; readonly reason: DeletionFailureReason };

const call = async <T extends { ok: true }>(
  path: string,
  accessToken: string,
  body: unknown,
): Promise<T | Failure> => {
  if (!API_URL) return { ok: false, reason: "not-configured" };
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: accessToken },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return (await readDeletionResponse(response)) as T | Failure;
  } catch {
    return { ok: false, reason: "network" };
  }
};

export const previewDeletion = (accessToken: string) =>
  call<DeletionPreview>("/account/deletion/preview", accessToken, {});

export const deleteAccount = (accessToken: string) =>
  call<{ ok: true; cancelled: number }>(
    "/account/deletion",
    accessToken,
    DELETION_CONFIRMATION,
  );
