import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MonthAgenda } from "@/lib/teacher/agenda";
import { cn } from "@/lib/utils";

/** Cours tel qu'affiché en vue mois : le minimum pour une pastille. */
export type MonthLesson = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "NO_SHOW";
  studentName: string | null;
  instrumentName: string;
};

const WEEKDAY_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/**
 * Pastille de cours en vue mois : fond doux + texte de la teinte du statut. Les
 * mêmes teintes que la vue semaine, en plus compact. Classes en toutes lettres —
 * Tailwind ne génère pas une classe montée à l'exécution.
 */
const CHIP_STYLES: Record<MonthLesson["status"], string> = {
  PENDING: "bg-warning-soft text-warning",
  CONFIRMED: "bg-primary-soft text-primary",
  COMPLETED: "bg-success-soft text-success",
  NO_SHOW: "bg-danger-soft text-danger",
};

/** Nombre de pastilles montrées avant de replier le reste en « +N ». */
const MAX_CHIPS = 3;

/**
 * Aperçu mensuel du prof : une grille façon calendrier, en lecture seule.
 *
 * Server Component — rien que de l'affichage et des liens (chaque jour renvoie
 * vers la vue jour) ; la mise en page vient de `buildMonthAgenda`, pure et
 * testée. Le placement horaire fin reste l'affaire des vues jour/semaine.
 */
export function TeacherMonth({
  agenda,
  openDays = [],
}: {
  agenda: MonthAgenda<MonthLesson>;
  /** Clés civiles des jours qui ont au moins une ouverture. */
  openDays?: string[];
}) {
  const cells = agenda.weeks.flat();
  const open = new Set(openDays);
  const total = cells
    .filter((cell) => cell.inMonth)
    .reduce((sum, cell) => sum + cell.events.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          {/* La période, et rien d'autre : la bascule de vue et la navigation
              vivent dans l'en-tête de la page, pas dans un second en-tête. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <CardTitle className="font-display text-2xl font-semibold tracking-[-0.01em]">
              {monthTitle(agenda.month)}
            </CardTitle>
            <CardDescription>
              {total === 0
                ? "Aucun cours ce mois-ci."
                : `${total} cours ce mois-ci`}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {/* La grille défile horizontalement sur téléphone plutôt que de se
              comprimer en cases illisibles. */}
          <div className="-mx-2 overflow-x-auto px-2">
            <div className="min-w-[40rem]">
              <div className="grid grid-cols-7">
                {WEEKDAY_SHORT.map((label) => (
                  <div
                    key={label}
                    className="pb-2 text-center text-xs font-medium text-muted"
                  >
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
                {cells.map((cell) => {
                  const shown =
                    cell.events.length > MAX_CHIPS
                      ? cell.events.slice(0, MAX_CHIPS - 1)
                      : cell.events;
                  const overflow = cell.events.length - shown.length;

                  return (
                    <Link
                      key={cell.date}
                      href={`/dashboard/prof/agenda?vue=jour&date=${cell.date}`}
                      className={cn(
                        "flex min-h-[5.5rem] flex-col gap-1 p-1.5 transition-colors hover:bg-surface",
                        // Même code que la semaine : crème clair = ouvert, gris
                        // soutenu = aucune ouverture ce jour-là.
                        !cell.inMonth
                          ? "bg-surface/50"
                          : open.has(cell.date)
                            ? "bg-elevated"
                            : "bg-surface-strong"
                      )}
                      title={
                        cell.inMonth && !open.has(cell.date)
                          ? "Aucune ouverture ce jour-là"
                          : undefined
                      }
                    >
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          cell.isToday
                            ? "inline-flex h-5 w-5 items-center justify-center self-start rounded-full bg-primary font-semibold text-primary-foreground"
                            : cell.inMonth
                              ? "text-foreground"
                              : "text-subtle"
                        )}
                      >
                        {Number(cell.date.slice(8, 10))}
                      </span>

                      {shown.map(({ event, startMinute }) => (
                        <span
                          key={event.id}
                          className={cn(
                            "truncate rounded px-1 py-0.5 text-[10px] leading-tight",
                            CHIP_STYLES[event.status]
                          )}
                          title={`${event.studentName ?? "Élève"} — ${event.instrumentName}`}
                        >
                          {formatMinute(startMinute)} {event.studentName ?? "Élève"}
                        </span>
                      ))}

                      {overflow > 0 ? (
                        <span className="px-1 text-[10px] text-muted">
                          {`+${overflow}`}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** « Janvier 2026 », première lettre en capitale. */
function monthTitle(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const label = new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Minutes locales → « 9:00 », sans dépendre d'un fuseau (déjà local). */
function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
