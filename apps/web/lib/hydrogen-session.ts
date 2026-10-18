import "server-only";

import type { NextRequest } from "next/server";

/**
 * The session store `handleShopifyRoutes` requires.
 *
 * Hydrogen doesn't ship one; each app supplies get/set/remove/commit. With no
 * handler groups registered (proxy.ts), nothing writes to it today. It's the
 * smallest version, a JSON cookie, httpOnly. ⚠️ Not signed or encrypted:
 * adopting Hydrogen's cart or Customer Account handlers (ADR 0011 stages 3
 * and 4) needs an encrypted cookie first (iron-session or similar).
 */
const COOKIE = "dh_hydrogen_session";

export const createSessionManager = (request: NextRequest) => {
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(request.cookies.get(COOKIE)?.value ?? "{}") as Record<
      string,
      unknown
    >;
  } catch {
    data = {};
  }
  let dirty = false;

  return {
    getSessionOrigin: () => request.nextUrl.origin,
    getSessionItem: (key: string) => data[key],
    setSessionItem: (key: string, value: unknown) => {
      data = { ...data, [key]: value };
      dirty = true;
    },
    removeSessionItem: (key: string) => {
      const { [key]: _removed, ...rest } = data;
      data = rest;
      dirty = true;
    },
    commit: (): HeadersInit | void => {
      if (!dirty) return;
      const secure = request.nextUrl.protocol === "https:" ? "; Secure" : "";
      return {
        "Set-Cookie": `${COOKIE}=${encodeURIComponent(JSON.stringify(data))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`,
      };
    },
  };
};
