import React from "react";

/**
 * Crossweave brand lockup for the top nav: the four-colour woven "X" mark +
 * the "crossweave" wordmark. Drawn as inline SVG/text (no asset files) so it
 * scales and themes cleanly. `height` controls the mark size and the wordmark
 * is sized to sit on the same vertical baseline — matching the footprint of the
 * old logo (icon height unchanged; the wordmark is wider, which is expected).
 *
 * To swap in the exact brand raster instead, drop the files in /public and
 * replace the <svg>/<span> below with <img> tags.
 */
const NAVY = "#1c2b4a";
const TEAL = "#45a99e";
const CORAL = "#e15c52";
const AMBER = "#f0a83e";

export function CrossweaveLogo({ height = 28 }: { height?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <svg
        width={height}
        height={height}
        viewBox="0 0 100 100"
        role="img"
        aria-label="crossweave logo"
        style={{ display: "block", flexShrink: 0 }}
      >
        {/* ↘ diagonal: navy (top-left) + amber (bottom-right) */}
        <rect x="20" y="10" width="26" height="46" rx="13" fill={NAVY} transform="rotate(45 33 33)" />
        <rect x="54" y="44" width="26" height="46" rx="13" fill={AMBER} transform="rotate(45 67 67)" />
        {/* ↙ diagonal: teal (top-right) + coral (bottom-left) */}
        <rect x="54" y="10" width="26" height="46" rx="13" fill={TEAL} transform="rotate(-45 67 33)" />
        <rect x="20" y="44" width="26" height="46" rx="13" fill={CORAL} transform="rotate(-45 33 67)" />
      </svg>
      <span
        style={{
          fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
          fontSize: height * 0.85,
          fontWeight: 600,
          color: NAVY,
          letterSpacing: "-0.005em",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        crossweave
      </span>
    </div>
  );
}

export default CrossweaveLogo;
