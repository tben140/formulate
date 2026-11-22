import { appleAppSiteAssociation } from "@/lib/app-links";

/** iOS universal links (lib/app-links.ts). No extension: Apple asks for this path. */
export const GET = (): Response => appleAppSiteAssociation();
