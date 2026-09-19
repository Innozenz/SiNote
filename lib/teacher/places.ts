/**
 * Où le cours a lieu, en une phrase.
 *
 * « Toulouse · chez le prof, chez vous ou en visio » : la ville, puis les
 * modalités réellement cochées par le prof. La même phrase sert à la ligne de
 * l'accueil, au résultat de recherche et à l'œil-de-bœuf de la fiche — trois
 * endroits qui l'écrivaient chacun à leur façon, ce qui finit toujours par
 * diverger. Aucun Prisma ici : la fonction ne travaille que sur trois booléens
 * et une ville, donc les composants clients peuvent aussi l'appeler.
 */

export type TeachingModes = {
  teachesInPerson: boolean;
  teachesAtHome: boolean;
  teachesOnline: boolean;
};

/** Les modalités cochées, dans l'ordre où on les lit sur la fiche. */
export function teachingPlaces(modes: TeachingModes): string[] {
  return [
    modes.teachesInPerson ? "chez le prof" : null,
    modes.teachesAtHome ? "chez vous" : null,
    modes.teachesOnline ? "en visio" : null,
  ].filter(Boolean) as string[];
}

/** « chez le prof, chez vous ou en visio » — la dernière prend « ou ». */
export function joinWithOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ou ${items[items.length - 1]}`;
}

/**
 * La ligne complète. Rend `null` quand le prof n'a renseigné ni ville ni
 * modalité — mieux vaut ne rien écrire qu'un séparateur orphelin.
 *
 * Cas particulier du prof sans ville qui n'enseigne qu'en visio : « en visio »
 * seul se lirait comme une option parmi d'autres, alors que c'est la seule.
 */
export function placeLine(
  city: string | null,
  modes: TeachingModes
): string | null {
  const places = teachingPlaces(modes);

  if (!city && places.length === 1 && modes.teachesOnline) {
    return "En visio uniquement";
  }

  const line = [city, places.length > 0 ? joinWithOr(places) : null]
    .filter(Boolean)
    .join(" · ");

  return line || null;
}
