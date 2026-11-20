import { markdownResponse, searchMarkdown } from "@/lib/agents";

/** Product search as Markdown, for AI agents: `/search.md?q=…` (next.config.ts). */
export const GET = async (request: Request): Promise<Response> =>
  markdownResponse(
    await searchMarkdown(new URL(request.url).searchParams.get("q") ?? ""),
  );
