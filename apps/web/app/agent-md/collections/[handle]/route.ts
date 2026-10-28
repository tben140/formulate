import { collectionMarkdown, markdownResponse } from "@/lib/agents";

/**
 * The collection page as Markdown, for AI agents. Reached as
 * `/collections/<handle>.md` or with `Accept: text/markdown` (next.config.ts).
 */
export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ handle: string }> },
): Promise<Response> => {
  const body = await collectionMarkdown((await params).handle);
  return body ? markdownResponse(body) : markdownResponse("# Not found\n", 404);
};
