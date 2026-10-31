import { NextResponse, type NextRequest } from "next/server";

import { PREVIEW_COOKIE } from "@/lib/campaign";

/** Ends a campaign preview in this browser (the strip's "Stop preview"). */
export const GET = (request: NextRequest) => {
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete(PREVIEW_COOKIE);
  response.headers.set("cache-control", "no-store");
  return response;
};
