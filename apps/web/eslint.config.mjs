import { next } from "@formulate/eslint-config/next";

export default [
  ...next,
  { ignores: [".next/**", "next-env.d.ts"] },
  {
    // Links come from components/link.tsx, which prefetches on intent rather
    // than whenever a link scrolls into view (CDN request allowance).
    files: ["**/*.{ts,tsx}"],
    ignores: ["components/link.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/link",
              message: "Use Link from @/components/link: it prefetches on intent only.",
            },
          ],
        },
      ],
    },
  },
];
