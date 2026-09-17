import Link from "next/link";
import { EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Pourquoi il ne se passe rien.
 *
 * Un prof qui vient de s'inscrire ne reçoit aucune demande, et l'écran qui lui
 * annonçait « Aucune demande en attente » le laissait conclure que personne ne
 * cherche de cours. La cause réelle est ailleurs : sa fiche est en brouillon,
 * ou son abonnement n'est pas actif — donc elle n'apparaît ni dans la
 * recherche ni à son adresse publique.
 *
 * Un état vide doit dire la cause et proposer le geste suivant. Le seul cas où
 * « aucune demande » se suffit à lui-même est celui d'une fiche déjà visible :
 * là, il n'y a effectivement rien à corriger.
 */

export type VisibilityBlocker = "draft" | "incomplete" | "subscription";

/** Libellé court de chaque cause, pour la pastille de la barre latérale. */
export const VISIBILITY_BLOCKER_LABELS: Record<VisibilityBlocker, string> = {
  incomplete: "Fiche incomplète : elle n'est pas visible des élèves",
  draft: "Fiche en brouillon : elle n'est pas visible des élèves",
  subscription: "Abonnement inactif : la fiche n'est pas visible des élèves",
};

export function TeacherVisibilityNotice({
  blocker,
}: {
  blocker: VisibilityBlocker;
}) {
  const content = {
    incomplete: {
      text: "Votre fiche n'est pas encore complète : tant qu'elle ne l'est pas, elle n'apparaît ni dans la recherche ni à son adresse publique.",
      href: "/dashboard/prof",
      cta: "Compléter ma fiche",
    },
    draft: {
      text: "Votre fiche est complète mais reste en brouillon. Publiez-la pour que les élèves puissent la trouver.",
      href: "/dashboard/prof",
      cta: "Publier ma fiche",
    },
    subscription: {
      text: "Votre fiche est publiée, mais sans abonnement actif elle n'apparaît ni dans la recherche ni à son adresse publique.",
      href: "/dashboard/prof/abonnement",
      cta: "Activer mon abonnement",
    },
  }[blocker];

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-warning bg-warning-soft px-4 py-3">
      <p className="flex items-start gap-2 text-sm text-foreground">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        {content.text}
      </p>
      <Button size="sm" asChild>
        <Link href={content.href}>{content.cta}</Link>
      </Button>
    </div>
  );
}

/**
 * Détermine ce qui bloque, ou `null` si la fiche est bel et bien visible.
 *
 * L'ordre suit celui du parcours : compléter, publier, s'abonner. Annoncer
 * « abonnez-vous » à quelqu'un dont la fiche est vide le ferait payer pour
 * rien.
 */
export function visibilityBlocker(input: {
  publishable: boolean;
  published: boolean;
  subscribed: boolean;
}): VisibilityBlocker | null {
  if (!input.publishable) return "incomplete";
  if (!input.published) return "draft";
  if (!input.subscribed) return "subscription";

  return null;
}
