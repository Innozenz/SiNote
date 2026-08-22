import { SITE_TAGLINE } from "@/lib/seo/config";
import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderOgImage,
} from "@/lib/seo/og";

/** Vignette Twitter/X par défaut — même rendu que l'image OpenGraph. */
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
