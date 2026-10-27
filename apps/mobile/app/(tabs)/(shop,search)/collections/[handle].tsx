import { router, useLocalSearchParams } from "expo-router";

import { CollectionView } from "../../../../components/collection-view";

/**
 * Any collection by handle, reached from the collection links (SHO-60). The
 * chips at the top change the handle in place, so the route (and a shared
 * link) stays right without stacking a screen per tap.
 */
const CollectionScreen = () => {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  return (
    <CollectionView
      handle={handle}
      titleInHeader
      onSelectCollection={(next) => router.setParams({ handle: next })}
    />
  );
};

export { CollectionScreen as default };
