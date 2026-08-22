/**
 * Droit de déposer (ou modifier) un avis sur un prof.
 *
 * L'avis est **global au prof**, pas un par cours : un élève laisse un seul avis
 * par prof, qu'il peut ensuite modifier. La garantie anti-faux avis demeure —
 * il faut avoir eu **au moins un cours terminé** avec ce prof (`Review.bookingId`
 * ancre l'avis sur un cours réel). Une note libre sur une fiche s'achèterait ;
 * celle-ci suppose une relation d'enseignement effective.
 *
 * Une seule implémentation, comme `checkPublishable` et `checkStudentProfile` :
 * l'écran de l'élève n'affiche le formulaire que quand la route l'accepterait,
 * et la route ne dépend pas de l'écran pour se protéger.
 *
 * Fonction pure — testable sans base. Pas de fenêtre temporelle : contrairement
 * à l'ancien avis par cours, un avis global sur une relation en cours reste
 * modifiable tant qu'elle dure.
 */

export type ReviewBlocker = "no_completed_lesson";

export type ReviewEligibility =
  | { ok: true }
  | { ok: false; reason: ReviewBlocker; message: string };

const MESSAGES: Record<ReviewBlocker, string> = {
  no_completed_lesson:
    "Vous pourrez laisser un avis dès votre premier cours terminé avec ce prof",
};

/**
 * @param hasCompletedLesson l'élève a au moins un cours `COMPLETED` avec ce prof.
 */
export function canReviewTeacher(hasCompletedLesson: boolean): ReviewEligibility {
  if (!hasCompletedLesson) {
    return {
      ok: false,
      reason: "no_completed_lesson",
      message: MESSAGES.no_completed_lesson,
    };
  }

  return { ok: true };
}

/** Note valide : entier de 1 à 5, comme le CHECK `review_rating_range`. */
export function isValidRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}
