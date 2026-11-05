import { describe, expect, it } from "vitest";

import { previewLinks } from "../src/api";

describe("previewLinks", () => {
  it("builds web and app links when the preview token is set", () => {
    expect(previewLinks("black-friday", "https://web.example", "x".repeat(24))).toEqual({
      web: `https://web.example/pages/campaigns/black-friday/preview?token=${"x".repeat(24)}`,
      app: `formulate://pages/campaigns/black-friday?preview=${"x".repeat(24)}`,
    });
  });

  it("gives none without a token, or with one too short to be the real one", () => {
    expect(previewLinks("bf", "https://web.example", undefined)).toEqual({
      web: null,
      app: null,
    });
    expect(previewLinks("bf", "https://web.example", "short")).toEqual({
      web: null,
      app: null,
    });
  });
});
