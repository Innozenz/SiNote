import { ImageResponse } from "next/og";

import { SITE_NAME } from "./config";

/**
 * Image de partage (OpenGraph / Twitter) de marque.
 *
 * Générée à la volée par `next/og` plutôt que servie en fichier statique : le
 * texte peut ainsi varier par page (un instrument, une ville) sans qu'on
 * exporte une image par combinaison. Les couleurs sont écrites en dur — une
 * `ImageResponse` ne lit pas les tokens CSS du site — et doivent suivre toute
 * évolution de la palette (Prussian `#123551`, or `#a97f38`, crème `#f5efe1`).
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const PRUSSIAN = "#123551";
const GOLD = "#a97f38";
const CREAM = "#f5efe1";

export function renderOgImage(options: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}): ImageResponse {
  const { title, subtitle, eyebrow } = options;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PRUSSIAN,
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Portée décorative en haut — cinq hairlines dorées translucides. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[0, 1, 2, 3, 4].map((line) => (
            <div
              key={line}
              style={{
                height: 2,
                width: "100%",
                background: "rgba(169,127,56,0.35)",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {eyebrow ? (
            <div
              style={{
                fontSize: 26,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: GOLD,
                marginBottom: 20,
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.05,
              color: CREAM,
              maxWidth: 980,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                fontSize: 34,
                lineHeight: 1.3,
                color: "rgba(245,239,225,0.75)",
                marginTop: 28,
                maxWidth: 940,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 999,
              background: GOLD,
            }}
          />
          <div style={{ fontSize: 40, fontWeight: 700, color: CREAM }}>
            {SITE_NAME}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}
