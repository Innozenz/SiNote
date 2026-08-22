import prisma from "@/lib/prisma";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/seo/og";

/** Image de partage propre à chaque instrument (`/cours/[instrument]`). */
export const alt = "Cours de musique sur SiNote";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: { instrument: string };
}) {
  const instrument = await prisma.instrument.findUnique({
    where: { slug: params.instrument },
    select: { name: true },
  });

  const name = instrument?.name ?? "musique";

  return renderOgImage({
    eyebrow: "Cours de musique",
    title: `Cours de ${name}`,
    subtitle: `Trouvez votre professeur de ${name} et réservez en ligne.`,
  });
}
