import { SITE_TAGLINE } from "@/lib/seo/config";
import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderOgImage,
} from "@/lib/seo/og";

/**
 * Image OpenGraph par défaut, appliquée à toutes les pages qui n'en fournissent
 * pas (la fiche prof, elle, met la photo du prof via `generateMetadata`).
 */
export const alt = "SiNote — cours de musique en ligne";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    eyebrow: "Cours de musique",
    title: "Trouvez votre prof, réservez en ligne",
    subtitle: SITE_TAGLINE,
  });
}
