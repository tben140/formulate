import { Link } from "expo-router";
import { View } from "react-native";

import { useLegalLinks } from "../lib/queries";
import { EmailCapture } from "./email-capture";
import { PaymentIcons } from "./payment-icons";
import { SocialLinks } from "./social-links";
import { Text } from "./text";

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
export const SiteFooter = () => {
  const { data: legalLinks = [] } = useLegalLinks();

  return (
    <View className="-mx-4 mt-8 border-t border-border px-4 py-6">
      {/*
      Email capture lives here, as it does on the other two surfaces — in the
      footer, so it appears on every screen from one place rather than being
      remembered per screen.

      ⚠️ Every caller needs `automaticallyAdjustKeyboardInsets` and
      `keyboardShouldPersistTaps="handled"` on its scroll container because of
      this. Without the second, Sign up takes two taps while the keyboard is
      up: the first only closes it (SHO-120). The footer is the last thing in a scroll view,
      so the software keyboard covers the field it belongs to the moment it
      opens. On web the browser scrolls the focused input into view for free;
      here nothing does.
    */}
      <EmailCapture />

      <View className="mt-6">
        <SocialLinks />
      </View>

      <View className="mt-4">
        <PaymentIcons />
      </View>

      {/*
      The Shopify menu "Legal", as on web and the theme. Nothing renders while
      it loads or if it fails: the copyright line still closes the footer.
    */}
      {legalLinks.length > 0 ? (
        <View className="mt-4 flex-row flex-wrap gap-x-4 gap-y-2">
          {legalLinks.map((link) => (
            <Link
              key={link.id}
              href={link.path}
              className="py-1 text-sm text-foreground-muted underline"
            >
              {link.title}
            </Link>
          ))}
        </View>
      ) : null}

      <Text className="mt-4 text-sm text-foreground-muted">
        &copy; {new Date().getFullYear()} Double Helix
      </Text>
    </View>
  );
};
