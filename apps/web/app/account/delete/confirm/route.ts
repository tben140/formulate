import { NextResponse, type NextRequest } from "next/server";

import { deleteAccount } from "@/lib/account-deletion";
import { clearCartId } from "@/lib/cart";
import {
  clearCustomerTokens,
  readCustomerTokens,
  requestOrigin,
} from "@/lib/customer-account";

/**
 * Deletes the signed-in customer's account (SHO-90), from the form on
 * /account/delete.
 *
 * POST with an Origin check, as sign-out is: another site must not be able to
 * submit this form for someone. The checkbox is required in the form and
 * checked again here, so a request without it deletes nothing.
 *
 * On success the session and cart go too, as at sign-out. There's no Shopify
 * logout redirect: the account it would sign out of is being erased.
 */
const confirmDeletion = async (request: NextRequest) => {
  const origin = requestOrigin(request.headers, request.nextUrl.origin);
  const sentBy = request.headers.get("origin");
  if (sentBy && sentBy !== origin) {
    return new NextResponse(null, { status: 403 });
  }

  const back = (error: string) =>
    NextResponse.redirect(`${origin}/account/delete?error=${error}`, 303);

  const form = await request.formData().catch(() => null);
  if (form?.get("understood") !== "on") return back("not-confirmed");

  const tokens = await readCustomerTokens();
  if (!tokens) return NextResponse.redirect(`${origin}/account/login`, 303);

  const result = await deleteAccount(tokens.accessToken);
  if (!result.ok) return back(result.reason);

  await clearCustomerTokens();
  await clearCartId();
  return NextResponse.redirect(`${origin}/account/deleted`, 303);
};

export { confirmDeletion as POST };
