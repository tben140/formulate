import { Text, View } from "react-native";

/**
 * Site footer, mirroring apps/web's app/layout.tsx and apps/theme's
 * sections/footer.liquid so the three surfaces share the same chrome.
 *
 * Rendered at the end of scrollable content rather than docked to the bottom
 * of the screen. That matches what the other two surfaces actually do — a
 * footer at the end of the document, not fixed to the viewport — and avoids
 * permanently spending vertical space, which is scarcer on a phone.
 *
 * `-mx-4` deliberately cancels the `p-4` both screens apply to their scroll
 * content container, so the top border reaches the screen edges as it does on
 * web while the text stays aligned with the content above it. It therefore
 * assumes a parent with 16px horizontal padding — true of both callers, and
 * the reason this is a shared component rather than inline markup.
 */
export const SiteFooter = () => (
  <View className="-mx-4 mt-8 border-t border-border px-4 py-6">
    <Text className="text-sm text-foreground-muted">
      &copy; {new Date().getFullYear()} Formulate
    </Text>
  </View>
);
