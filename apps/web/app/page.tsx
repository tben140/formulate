import { DEFAULT_COLLECTION_HANDLE } from "@formulate/shopify";
import { redirect } from "next/navigation";

const HomePage = () => {
  redirect(`/collections/${DEFAULT_COLLECTION_HANDLE}`);
};

export { HomePage as default };
