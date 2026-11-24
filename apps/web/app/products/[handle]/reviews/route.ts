import { NextResponse, type NextRequest } from "next/server";

import { fetchReviews } from "@/lib/reviews";

/**
 * The next page of a product's reviews, for "Show more reviews". The browser
 * can't call the Worker itself (no CORS, by design), so this passes it on.
 */
const page = async (
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) => {
  const { handle } = await params;
  const pageNumber = Number(request.nextUrl.searchParams.get("page") ?? "2");
  if (!Number.isInteger(pageNumber) || pageNumber < 2 || pageNumber > 100) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const result = await fetchReviews(handle, pageNumber);
  return result
    ? NextResponse.json(
        { ok: true, ...result },
        {
          headers: {
            "Cache-Control": "public, s-maxage=600, stale-while-revalidate=600",
          },
        },
      )
    : NextResponse.json({ ok: false }, { status: 502 });
};

export { page as GET };
