import { API_VERSION, type Admin } from "@formulate/campaigns/admin";

import type { Session } from "./session";

/**
 * Admin API access for the calendar (SHO-205), through token exchange: the
 * page's session token is traded for an access token, server-side, here only.
 * No Admin token is stored, and none reaches the browser.
 *
 * - offline: the app's own token, for reading campaigns and running checks;
 * - online: a token tied to the staff member, whose name signs a campaign off.
 *
 * https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/token-exchange
 */

const OFFLINE = "urn:shopify:params:oauth:token-type:offline-access-token";
const ONLINE = "urn:shopify:params:oauth:token-type:online-access-token";

interface Exchanged {
  readonly access_token: string;
  readonly associated_user?: {
    readonly first_name?: string | null;
    readonly last_name?: string | null;
    readonly email?: string | null;
  } | null;
}

const exchange = async (
  session: Session,
  clientId: string,
  secret: string,
  type: string,
): Promise<Exchanged> => {
  const response = await fetch(`https://${session.shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: secret,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: session.token,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      requested_token_type: type,
    }),
  });
  // Only the status: the body can echo request details.
  if (!response.ok) throw new Error(`Token exchange failed (HTTP ${response.status}).`);
  return (await response.json()) as Exchanged;
};

const adminFor = (shop: string, token: string): Admin => ({
  async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(
      `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-shopify-access-token": token },
        body: JSON.stringify({ query, variables }),
      },
    );
    const body = (await response.json()) as { data?: T; errors?: unknown };
    if (!response.ok || body.errors || !body.data)
      throw new Error(`Admin API request failed (HTTP ${response.status}).`);
    return body.data;
  },
});

export const offlineAdmin = async (session: Session, clientId: string, secret: string) =>
  adminFor(
    session.shop,
    (await exchange(session, clientId, secret, OFFLINE)).access_token,
  );

/** The staff member's name, as Shopify knows it, for signing off. */
export const staffName = async (
  session: Session,
  clientId: string,
  secret: string,
): Promise<string | null> => {
  const user = (await exchange(session, clientId, secret, ONLINE)).associated_user;
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  return name || user?.email || null;
};
