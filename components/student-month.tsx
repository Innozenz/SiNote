import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { MonthMark, StudentMonth } from "@/lib/student/month";
import { cn } from "@/lib/utils";

/**
 * Mini-mois de l'élève, en colonne latérale.
 *
 * Server Component : rien que de l'affichage et deux liens. Le mois affiché vit
 * dans l'URL (`?mois=AAAA-MM`), jamais dans un état React — même raison que la
 * semaine de l'agenda du prof et les filtres de recherche : une adresse
 * partageable, un bouton retour qui se comporte bien, et un rendu qui reste
 * serveur. La mise en page vient de `buildStudentMonth`, pure et testée.
 *
 * Les jours ne sont pas cliquables : il n'y a pas de « vue jour » côté élève, et
 * un lien qui ne mène nulle part vaut moins que pas de lien. La liste de gauche
 * est l'endroit où l'on agit sur un cours.
 */

const WEEKDAY_INITIALS = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * Pastilles : plein primaire = confirmé, anneau ambre = en attente d'une
 * réponse, gris = passé. Écrites en toutes lettres — Tailwind lit les sources
 * au texte, une classe montée à l'exécution n'est jamais générée.
 */
const MARK_STYLES: Record<MonthMark, string> = {
  confirmed: "bg-primary",
  pending: "border border-warning bg-transparent",
  past: "bg-border-strong",
};

const MARK_LABELS: Record<MonthMark, string> = {
  confirmed: "Confirmé",
  pending: "En attente",
  past: "Passé",
};

/** Ce que la légende nomme, dans l'ordre où on les rencontre. */
const LEGEND: MonthMark[] = ["confirmed", "pending", "past"];

export function StudentMonth({
  month,
  previousHref,
  nextHref,
}: {
  month: StudentMonth;
  previousHref: string;
  nextHref: string;
}) {
  const cells = month.weeks.flat();
  const total = cells
    .filter((cell) => cell.inMonth)
    .reduce((sum, cell) => sum + cell.count, 0);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-medium text-foreground first-letter:uppercase">
          {monthTitle(month.month)}
        </h2>

        {/* Deux cibles de 44 px : sur téléphone, la navigation du mois est ce
            qu'on touche le plus souvent dans cette colonne. */}
        <div className="flex items-center gap-1">
          <Link
            href={previousHref}
            aria-label="Mois précédent"
            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <Link
            href={nextHref}
            aria-label="Mois suivant"
            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {WEEKDAY_INITIALS.map((initial, index) => (
          <div
            key={`${initial}-${index}`}
            aria-hidden
            className="pb-1 text-center text-[0.7rem] font-medium uppercase tracking-[0.1em] text-subtle"
          >
            {initial}
          </div>
        ))}

        {cells.map((cell) => (
          <div
            key={cell.date}
            title={
              cell.count > 0
                ? `${cell.count} ${cell.count === 1 ? "cours" : "cours"} le ${dayTitle(cell.date)}`
                : undefined
            }
            className="flex flex-col items-center gap-1 py-1"
          >
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums",
                cell.isToday
                  ? "bg-primary font-semibold text-primary-foreground"
                  : cell.inMonth
                    ? "text-foreground"
                    : "text-subtle"
              )}
            >
              {Number(cell.date.slice(8, 10))}
            </span>

            {/* Hauteur réservée même sans pastille : sans elle, les lignes
                sautent d'un jour à l'autre et la grille ondule. */}
            <span className="flex h-1.5 items-center justify-center gap-0.5">
              {cell.marks.map((mark) => (
                <span
                  key={mark}
                  aria-hidden
                  className={cn("h-1.5 w-1.5 rounded-full", MARK_STYLES[mark])}
                />
              ))}
            </span>
          </div>
        ))}
      </div>

      <p className="sr-only">
        {total === 0
          ? "Aucun cours ce mois-ci."
          : `${total} cours ce mois-ci.`}
      </p>

      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted">
        {LEGEND.map((mark) => (
          <li key={mark} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn("h-1.5 w-1.5 rounded-full", MARK_STYLES[mark])}
            />
            {MARK_LABELS[mark]}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** « Septembre 2026 » — le mois est une date civile, donc lu en UTC. */
function monthTitle(month: string): string {
  const [year, m] = month.split("-").map(Number);

  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** « 18 septembre », pour l'infobulle d'un jour. */
function dayTitle(dayKey: string): string {
  const [year, m, d] = dayKey.split("-").map(Number);

  return new Date(Date.UTC(year, m - 1, d)).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
