import prisma from "@/lib/prisma";
import { resolveCity } from "@/lib/seo/landing";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/seo/og";

/** Image de partage propre à chaque couple instrument × ville. */
export const alt = "Cours de musique près de chez vous sur SiNote";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: { instrument: string; ville: string };
}) {
  const [instrument, city] = await Promise.all([
    prisma.instrument.findUnique({
      where: { slug: params.instrument },
      select: { name: true },
    }),
    resolveCity(params.ville),
  ]);

  const name = instrument?.name ?? "musique";
  const place = city?.name ?? "chez vous";

  return renderOgImage({
    eyebrow: `Cours de musique à ${place}`,
    title: `Cours de ${name} à ${place}`,
    subtitle: `Trouvez votre professeur près de chez vous et réservez en ligne.`,
  });
}
