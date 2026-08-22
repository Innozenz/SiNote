"use client";

import { useState } from "react";
import { Pencil, Star } from "lucide-react";

import { ReviewForm } from "@/components/review-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Review = { rating: number; comment: string | null; published: boolean };

/**
 * Avis global de l'élève sur un prof, côté élève (onglet « Mon avis » du dossier).
 *
 * Un seul avis par prof : ce bloc le crée, l'affiche et le laisse modifier. Il
 * n'apparaît en mode saisie que si l'élève a eu au moins un cours terminé
 * (`canReview`) — la même règle que la route, via `canReviewTeacher`. Un avis
 * retiré par la modération (`published` faux) est signalé : l'élève doit savoir
 * qu'il n'est plus en ligne.
 */
export function TeacherReview({
  teacherId,
  canReview,
  initial,
}: {
  teacherId: string;
  canReview: boolean;
  initial: Review | null;
}) {
  const [review, setReview] = useState<Review | null>(initial);
  const [editing, setEditing] = useState(false);

  if (!canReview) {
    return (
      <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
        Vous pourrez laisser un avis sur ce prof dès votre premier cours terminé.
      </p>
    );
  }

  if (editing || !review) {
    return (
      <ReviewForm
        teacherId={teacherId}
        initial={review ? { rating: review.rating, comment: review.comment } : undefined}
        onDone={(saved) => {
          // On garde l'état publié courant : une modification ne remet pas en
          // ligne un avis que la modération a retiré.
          setReview({ ...saved, published: review?.published ?? true });
          setEditing(false);
        }}
        onCancel={review ? () => setEditing(false) : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <Stars value={review.rating} />
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="mr-2 h-3.5 w-3.5" />
          Modifier
        </Button>
      </div>

      {review.comment ? (
        <p className="text-sm text-muted">{review.comment}</p>
      ) : null}

      {!review.published ? (
        <p className="text-xs text-warning">
          Votre avis a été retiré par la modération : il n&apos;est plus visible
          sur la fiche du prof.
        </p>
      ) : (
        <p className="text-xs text-subtle">
          Publié sur la fiche du prof, avec votre prénom.
        </p>
      )}
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((v) => (
        <Star
          key={v}
          className={cn(
            "h-4 w-4",
            v <= value ? "fill-warning text-warning" : "text-border-strong"
          )}
        />
      ))}
    </span>
  );
}
