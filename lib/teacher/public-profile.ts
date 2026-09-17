import { cache } from "react";

import prisma from "@/lib/prisma";
import { isTeacherVisible } from "@/lib/teacher/visibility";

/**
 * Chargement d'une fiche prof publique.
 *
 * Enveloppé dans `cache()` : `generateMetadata` et le composant de page ont
 * tous deux besoin de la fiche, et sans mémoïsation la requête partirait deux
 * fois par rendu. React déduplique sur la durée d'une même requête.
 *
 * Rend `null` pour une fiche non visible, ce que l'appelant traduit en 404 —
 * jamais en 403, qui confirmerait l'existence de la fiche.
 */
export const getPublicTeacher = cache(async (slug: string) => {
  const teacher = await prisma.teacherProfile.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      status: true,
      stripeCurrentPeriodEnd: true,
      headline: true,
      bio: true,
      videoUrl: true,
      birthDate: true,
      showAge: true,
      city: true,
      country: true,
      teachesOnline: true,
      teachesInPerson: true,
      teachesAtHome: true,
      languages: true,
      hourlyRateCents: true,
      trialLessonOffered: true,
      trialLessonMinutes: true,
      defaultDurationMin: true,
      // Le pas de la grille : le widget s'en sert pour n'afficher d'abord que
      // les départs à l'heure ronde, et ne proposer les intermédiaires que si
      // le prof en a.
      slotGranularityMin: true,
      publishedAt: true,
      createdAt: true,
      user: { select: { name: true, image: true, timezone: true } },
      // Signaux de confiance de la fiche : cours réellement donnés, et la
      // semaine type pour un résumé « disponible lun. soir, jeu. matin ».
      _count: { select: { bookings: { where: { status: "COMPLETED" } } } },
      rules: {
        select: { weekday: true, startMinute: true, endMinute: true },
        orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      },
      instruments: {
        select: {
          yearsExperience: true,
          levelsTaught: true,
          instrument: { select: { slug: true, name: true, family: true } },
        },
      },
    },
  });

  if (!isTeacherVisible(teacher, new Date())) return null;

  return teacher;
});
