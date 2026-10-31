import { llmsTxt, markdownResponse } from "@/lib/agents";

/** What the store is and how an AI agent can buy here (lib/agents.ts). */
export const GET = async (): Promise<Response> => markdownResponse(await llmsTxt());
