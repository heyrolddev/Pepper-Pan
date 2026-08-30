import { ImageResponse } from "next/og";
import { SHOP } from "@/lib/site";

/**
 * The card people actually see when the shop's link is pasted into Messenger,
 * Facebook or a group chat.
 *
 * Drawn rather than photographed: a generated image can't 404, can't be the
 * wrong crop on one platform and right on another, and costs no storage. The
 * shape is deliberately loud and legible at thumbnail size, because that is
 * the size it will nearly always be seen at.
 */

export const alt = `${SHOP.name} — ${SHOP.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#1a1310",
          color: "#fdf8f0",
          position: "relative",
        }}
      >
        {/* Two warm blooms, the same ones the site's hero uses. */}
        <div
          style={{
            position: "absolute",
            top: -140,
            left: -100,
            width: 460,
            height: 460,
            borderRadius: 999,
            background: "#c1121f",
            opacity: 0.5,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -180,
            right: -120,
            width: 520,
            height: 520,
            borderRadius: 999,
            background: "#f2b705",
            opacity: 0.28,
          }}
        />

        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            background: "#f2b705",
            color: "#1a1310",
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: 4,
            padding: "10px 26px",
            borderRadius: 999,
          }}
        >
          MADE FRESH DAILY
        </div>

        <div
          style={{
            fontSize: 128,
            fontWeight: 800,
            lineHeight: 1.02,
            marginTop: 34,
            letterSpacing: -3,
          }}
        >
          {SHOP.name}
        </div>

        <div
          style={{
            fontSize: 44,
            marginTop: 18,
            color: "#f2b705",
            fontWeight: 700,
            maxWidth: 900,
            lineHeight: 1.2,
          }}
        >
          {SHOP.tagline}
        </div>

        <div
          style={{
            display: "flex",
            gap: 18,
            marginTop: 44,
            fontSize: 30,
            opacity: 0.75,
          }}
        >
          <span>{SHOP.locality}, {SHOP.region}</span>
          <span>·</span>
          <span>Pickup &amp; delivery</span>
        </div>
      </div>
    ),
    size
  );
}
