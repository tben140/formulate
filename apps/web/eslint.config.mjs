import { next } from "@formulate/eslint-config/next";

export default [
  ...next,
  { ignores: [".next/**", "next-env.d.ts"] },
];
