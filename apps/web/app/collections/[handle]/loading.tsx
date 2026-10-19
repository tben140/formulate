import { ListingSkeleton } from "@/components/listing-skeleton";

/**
 * The Suspense boundary this page streams into (Cache Components): the
 * layout is a prerendered shell, and this page's results depend on the URL's
 * filters, so they arrive per request. See ListingSkeleton for why it's
 * page-shaped.
 */
const Loading = () => <ListingSkeleton />;

export { Loading as default };
