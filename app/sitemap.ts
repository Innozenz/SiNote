import type { MetadataRoute } from "next";

import prisma from "@/lib/prisma";
import { absoluteUrl } from "@/lib/seo/config";
import {
  getInstrumentCityCombos,
  getLandingInstruments,
  instrumentCityPath,
  instrumentPath,
} from "@/lib/seo/landing";
import { visibleTeacherWhere } from "@/lib/teacher/visibility";

/**
 * Régénéré toutes les heures plutôt que figé au build : les profs s'inscrivent
 * et leur visibilité expire en continu, donc un sitemap gelé au déploiement
 * manquerait les nouvelles fiches jusqu'au build suivant. L'horaire évite en
 * même temps un accès base à chaque passage de robot.
 */
export const revalidate = 3600;

/**
 * Sitemap dynamique.
 *
 * C'est le levier de découverte n°1 : sans lui, un moteur ne trouve les fiches
 * profs et les pages de cours que par le maillage interne, plus lent et
 * incomplet. On y liste :
 *   - les pages fixes (accueil, recherche, page prof) ;
 *   - une page par instrument réellement enseigné (`/cours/[instrument]`) ;
 *   - une page par couple instrument × ville peuplé (`/cours/[i]/[ville]`) ;
 *   - chaque fiche prof visible (`/profs/[slug]`).
 *
 * On ne liste **que ce qui existe vraiment** — mêmes requêtes de visibilité que
 * les pages elles-mêmes — pour ne jamais promettre une URL qui répond 404.
 *
 * Rendu à la demande (les profs et leur visibilité changent en continu). À
 * l'échelle de dizaines de milliers d'URLs il faudra passer à un index de
 * sitemaps ; en deçà, un seul fichier suffit (limite Google : 50 000 URLs).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const [instruments, combos, teachers] = await Promise.all([
    getLandingInstruments(),
    getInstrumentCityCombos(),
    prisma.teacherProfile.findMany({
      where: visibleTeacherWhere(now),
      select: { slug: true, updatedAt: true },
    }),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/profs"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/enseigner"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const instrumentPages: MetadataRoute.Sitemap = instruments.map(
    (instrument) => ({
      url: absoluteUrl(instrumentPath(instrument.slug)),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    })
  );

  const cityPages: MetadataRoute.Sitemap = combos.map((combo) => ({
    url: absoluteUrl(instrumentCityPath(combo.instrumentSlug, combo.citySlug)),
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const teacherPages: MetadataRoute.Sitemap = teachers.map((teacher) => ({
    url: absoluteUrl(`/profs/${teacher.slug}`),
    lastModified: teacher.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [
    ...staticPages,
    ...instrumentPages,
    ...cityPages,
    ...teacherPages,
  ];
}
