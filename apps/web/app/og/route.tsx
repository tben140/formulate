import { colours } from "@formulate/tokens";
import { ImageResponse } from "next/og";

import { SITE_NAME } from "@/lib/site";

/**
 * The share image for pages without one of their own (home, collections,
 * search, policies): 1200 × 630, the size Open Graph and X's large card use.
 * Product pages use their own photo instead.
 *
 * Drawn from the design tokens rather than a stored PNG, so it follows a
 * palette change. Static: rendered once at build, then served from the CDN.
 */
export const dynamic = "force-static";

const OG_SIZE = { width: 1200, height: 630 } as const;

export const GET = () =>
  new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 96px",
        background: colours.brand[50],
        color: colours.ink[900],
      }}
    >
      <div style={{ fontSize: 96, fontWeight: 600, letterSpacing: -2 }}>{SITE_NAME}</div>
      <div style={{ marginTop: 24, fontSize: 40, color: colours.ink[600] }}>
        Supplements built around a 30-day rhythm.
      </div>
      <div
        style={{
          marginTop: 56,
          width: 160,
          height: 12,
          borderRadius: 6,
          background: colours.brand[600],
        }}
      />
    </div>,
    OG_SIZE,
  );
