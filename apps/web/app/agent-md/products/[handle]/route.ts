import { productMarkdown, markdownResponse } from "@/lib/agents";

/**
 * The product page as Markdown, for AI agents. Reached as
 * `/products/<handle>.md` or with `Accept: text/markdown` (next.config.ts).
 */
export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ handle: string }> },
): Promise<Response> => {
  const body = await productMarkdown((await params).handle);
  return body ? markdownResponse(body) : markdownResponse("# Not found\n", 404);
};
