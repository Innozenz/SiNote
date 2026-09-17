import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Cibles de navigation de l'agenda, calculées côté serveur — l'état (vue,
 * période) vit dans l'URL. Partagé par les vues jour/semaine et la vue mois.
 */
export type AgendaNav = {
  previousHref: string;
  nextHref: string;
  /** « Aujourd'hui » / « Cette semaine » / « Ce mois », ou `null` si on y est. */
  currentHref: string | null;
  currentLabel: string;
  dayHref: string;
  weekHref: string;
  monthHref: string;
};

export type AgendaView = "jour" | "semaine" | "mois" | "horaires";

/** Adresse de l'onglet « Horaires » (la semaine type et les absences). */
export const HOURS_HREF = "/dashboard/prof/disponibilites";

/**
 * Bascule Jour / Semaine / Mois / Horaires, en liens (partageable, retour
 * arrière). « Horaires » n'est pas une vue du calendrier mais son réglage :
 * c'est la même page « Agenda » vue depuis l'autre côté, et la refonte l'a
 * rangée ici plutôt que dans une entrée de menu à part.
 */
export function AgendaViewSwitch({
  view,
  nav,
}: {
  view: AgendaView;
  nav: Pick<AgendaNav, "dayHref" | "weekHref" | "monthHref">;
}) {
  const items: { key: AgendaView; label: string; href: string }[] = [
    { key: "jour", label: "Jour", href: nav.dayHref },
    { key: "semaine", label: "Semaine", href: nav.weekHref },
    { key: "mois", label: "Mois", href: nav.monthHref },
    { key: "horaires", label: "Horaires", href: HOURS_HREF },
  ];

  return (
    <div className="flex rounded-md border border-border p-0.5">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={view === item.key ? "page" : undefined}
          className={cn(
            "rounded px-2.5 py-1 text-sm transition-colors",
            item.key === "horaires" && "ml-1 border-l border-border pl-3",
            view === item.key
              ? "bg-surface font-medium text-foreground"
              : "text-muted hover:text-foreground"
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
