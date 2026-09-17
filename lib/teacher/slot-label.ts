/**
 * Libellés de créneaux, dans le fuseau du prof.
 *
 * Module **sans Prisma**, et c'est sa raison d'être : les mêmes phrases sont
 * écrites par le serveur (liste de résultats, bloc « Prochain créneau » de la
 * fiche, rendu pour les moteurs) et par le widget de réservation, qui est un
 * composant client. Les laisser dans `lib/teacher/next-slots.ts` embarquerait
 * le client Prisma dans le bundle du navigateur.
 *
 * L'heure est toujours celle du **prof** : c'est l'heure à laquelle le cours
 * aura lieu, et afficher aux deux parties des heures différentes est ce qui fait
 * manquer un cours.
 */

/** « ven. 18 · 09:00 » — la forme compacte des listes. */
export function formatSlotShort(startsAt: Date, timezone: string): string {
  const day = startsAt.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    timeZone: timezone,
  });
  const time = startsAt.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
  return `${day} · ${time}`;
}

/**
 * « vendredi 18 septembre à 09:00 » — la forme longue, pour le bloc mis en
 * avant sur la fiche.
 *
 * La capitale initiale est laissée au CSS (`first-letter:uppercase`) et non
 * posée ici : `capitalize` — ou une majuscule mot à mot — écrirait « Vendredi
 * 18 Septembre », alors qu'en français le mois reste en minuscule.
 */
export function formatSlotLong(startsAt: Date, timezone: string): string {
  const day = startsAt.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  });
  const time = startsAt.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
  return `${day} à ${time}`;
}
