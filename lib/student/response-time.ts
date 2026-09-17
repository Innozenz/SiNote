/**
 * Délai de réponse habituel d'un prof, tel qu'on peut l'annoncer à l'élève qui
 * attend.
 *
 * « {prof} répond en général sous 24 h » n'est affiché que si la phrase est
 * vraie, et elle n'est vraie que si elle a été mesurée. D'où deux garde-fous :
 *
 * - **la médiane, pas la moyenne** — un prof qui répond en dix minutes quatre
 *   fois sur cinq et oublie la cinquième une semaine a une moyenne de trente
 *   heures et une médiane de dix minutes ; c'est la médiane qui décrit ce que
 *   l'élève va vivre ;
 * - **un minimum d'observations** (`MIN_SAMPLES`) — sur deux réponses, on ne
 *   mesure rien, on raconte. En deçà, la fonction rend `null` et l'écran se
 *   rabat sur ce qui est vrai sans mesure : le créneau reste réservé.
 *
 * Le résultat est ensuite arrondi vers le **haut** sur une échelle de paliers
 * lisibles. Annoncer « sous 3 h » quand la médiane est de 2 h 50 est tenable ;
 * annoncer « sous 2 h » ne le serait pas — une promesse tenue de justesse une
 * fois sur deux n'est pas une promesse.
 *
 * Fonction pure, testée sans base.
 */

/** En deçà, on ne dit rien : trois réponses, c'est déjà une habitude. */
export const MIN_SAMPLES = 3;

/** Paliers annonçables, en heures. Au-delà du dernier, on se tait. */
const BUCKETS = [1, 2, 3, 6, 12, 24, 48, 72];

export type ResponseSample = {
  createdAt: Date;
  /** Date de la réponse du prof ; `null` s'il n'a jamais répondu. */
  confirmedAt: Date | null;
};

export function medianResponseHours(samples: ResponseSample[]): number | null {
  const delays = samples
    .filter((s): s is { createdAt: Date; confirmedAt: Date } => s.confirmedAt !== null)
    .map((s) => (s.confirmedAt.getTime() - s.createdAt.getTime()) / 3_600_000)
    // Une réponse antérieure à la demande n'existe pas ; si la base en porte
    // une, elle est fausse et ne doit pas tirer la médiane vers le bas.
    .filter((hours) => hours >= 0)
    .sort((a, b) => a - b);

  if (delays.length < MIN_SAMPLES) return null;

  const middle = Math.floor(delays.length / 2);
  const median =
    delays.length % 2 === 0
      ? (delays[middle - 1] + delays[middle]) / 2
      : delays[middle];

  return BUCKETS.find((bucket) => median <= bucket) ?? null;
}
