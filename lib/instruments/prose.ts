/**
 * Nom d'instrument inséré dans une phrase.
 *
 * Le catalogue porte des noms capitalisés (« Piano », « Guitare électrique »),
 * ce qui convient à une puce ou un titre mais pas à une phrase : « prenez des
 * cours de Piano » n'est pas du français. Un sigle (« MAO », « DJ ») garde ses
 * capitales — il n'a pas de forme minuscule.
 */
export function instrumentInProse(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;

  // Sigle : au moins deux lettres, toutes en capitales (les accents comptent).
  const firstWord = trimmed.split(/\s+/)[0];
  if (firstWord.length >= 2 && firstWord === firstWord.toLocaleUpperCase("fr-FR")) {
    return trimmed;
  }

  return trimmed.charAt(0).toLocaleLowerCase("fr-FR") + trimmed.slice(1);
}
