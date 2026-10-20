import { useLocalSearchParams } from "expo-router";

import { CollectionView } from "../../../../components/collection-view";

/** Any collection by handle, reached from the collection links (SHO-60). */
const CollectionScreen = () => {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  return <CollectionView handle={handle} titleInHeader />;
};

export { CollectionScreen as default };
