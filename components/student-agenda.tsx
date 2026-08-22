"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Globe,
  Home,
  Info,
  Loader2,
  MapPin,
  Sparkles,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { checkTransition } from "@/lib/bookings/transitions";
import { postJson } from "@/lib/http/failure";
import { notifyFailure, notifySuccess } from "@/lib/toast";
import { localMinutesInZone } from "@/lib/availability/zone";
import {
  buildWeekAgenda,
  type AgendaDay,
  type PlacedEvent,
} from "@/lib/teacher/agenda";
import { formatTime } from "@/lib/teacher/weekly-grid";
import { cn } from "@/lib/utils";

/**
 * Agenda hebdomadaire de l'élève.
 *
 * Pendant du côté prof, mais adapté : l'élève n'a ni disponibilités à dessiner
 * ni cours à confirmer ; l'agenda ne montre que ses propres cours, tous profs
 * confondus, en lecture — un clic ouvre le détail, avec l'annulation pour seule
 * action (la même que le serveur autorise, via `checkTransition`). La mise en
 * page vient du même module pur `buildWeekAgenda`, sans règles ni exceptions.
 */

/**
 * Cibles de navigation de l'agenda élève, calculées côté serveur — l'état (vue,
 * semaine) vit dans l'URL. Deux vues seulement, jour et semaine : l'élève n'a
 * pas l'usage d'un aperçu mensuel dense comme le prof.
 */
export type StudentAgendaNav = {
  previousHref: string;
  nextHref: string;
  currentHref: string | null;
  currentLabel: string;
  dayHref: string;
  weekHref: string;
};

export type StudentAgendaRow = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "NO_SHOW";
  /** Instants ISO — l'affichage est dans le fuseau de l'élève. */
  startsAt: string;
  endsAt: string;
  mode: "ONLINE" | "TEACHER_PLACE" | "STUDENT_PLACE";
  isTrial: boolean;
  priceCents: number | null;
  meetingUrl: string | null;
  address: string | null;
  instrumentName: string;
  teacherName: string | null;
  teacherSlug: string;
};

type StudentLesson = Omit<StudentAgendaRow, "startsAt" | "endsAt"> & {
  startsAt: Date;
  endsAt: Date;
};

const HOUR_HEIGHT = 56;

/**
 * Plage horaire affichée par défaut (8h → 21h).
 *
 * Sans disponibilités, `buildWeekAgenda` cale ses bornes sur les seuls cours :
 * une semaine avec un cours de 14h à 15h donnerait une grille d'une heure de
 * haut. On impose donc une amplitude de journée, élargie seulement si un cours
 * tombe en dehors — la grille reste lisible et ne « saute » pas d'une semaine à
 * l'autre.
 */
const DISPLAY_START = 8 * 60;
const DISPLAY_END = 21 * 60;

const HOUR_LINES = [
  `repeating-linear-gradient(to bottom, var(--border) 0, var(--border) 1px, transparent 1px, transparent ${HOUR_HEIGHT}px)`,
  `repeating-linear-gradient(to bottom, color-mix(in oklab, var(--border) 45%, transparent) 0, color-mix(in oklab, var(--border) 45%, transparent) 1px, transparent 1px, transparent ${HOUR_HEIGHT / 2}px)`,
].join(", ");

const WEEKDAY_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const MODE_LABELS: Record<StudentAgendaRow["mode"], string> = {
  ONLINE: "Visio",
  TEACHER_PLACE: "Chez le prof",
  STUDENT_PLACE: "Chez vous",
};

const MODE_ICONS: Record<StudentAgendaRow["mode"], typeof Globe> = {
  ONLINE: Globe,
  TEACHER_PLACE: Home,
  STUDENT_PLACE: MapPin,
};

const STATUS_LABELS: Record<StudentAgendaRow["status"], string> = {
  PENDING: "En attente",
  CONFIRMED: "Confirmé",
  COMPLETED: "Terminé",
  NO_SHOW: "Non honoré",
};

// Neutres à la grille, teintes aux cours — même règle que l'agenda prof.
const STATUS_STYLES: Record<StudentAgendaRow["status"], string> = {
  PENDING: "border-dashed border-warning/60 bg-warning-soft text-warning",
  CONFIRMED: "border-primary/40 bg-primary-soft text-primary",
  COMPLETED: "border-success/40 bg-success-soft text-success",
  NO_SHOW: "border-danger/40 bg-danger-soft text-danger",
};

const STATUS_BAR: Record<StudentAgendaRow["status"], string> = {
  PENDING: "bg-warning",
  CONFIRMED: "bg-primary",
  COMPLETED: "bg-success",
  NO_SHOW: "bg-danger",
};

export function StudentAgenda({
  rows: initial,
  weekStart,
  days,
  view,
  timezone,
  nav,
}: {
  rows: StudentAgendaRow[];
  weekStart: string;
  days: number;
  view: "jour" | "semaine";
  timezone: string;
  nav: StudentAgendaNav;
}) {
  const [rows, setRows] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => new Date());

  useEffect(() => {
    setRows(initial);
    setSelectedId(null);
  }, [initial]);

  const agenda = useMemo(
    () =>
      buildWeekAgenda<StudentLesson>({
        timezone,
        weekStart,
        days,
        // L'élève n'a pas de disponibilités : seuls ses cours dessinent la grille.
        rules: [],
        exceptions: [],
        events: rows.map((row) => ({
          ...row,
          startsAt: new Date(row.startsAt),
          endsAt: new Date(row.endsAt),
        })),
        now,
      }),
    [rows, weekStart, days, timezone, now]
  );

  const title =
    view === "jour"
      ? dayTitle(agenda.days[0]?.date ?? weekStart)
      : weekLabel(agenda.days);

  // Bornes d'affichage : au moins la journée standard, élargie si un cours
  // déborde (tôt le matin ou tard le soir).
  const startMinute = Math.min(agenda.startMinute, DISPLAY_START);
  const endMinute = Math.max(agenda.endMinute, DISPLAY_END);
  const span = endMinute - startMinute;
  const height = (span / 60) * HOUR_HEIGHT;
  const offset = (minute: number) => ((minute - startMinute) / span) * 100;

  const todayIndex = agenda.days.findIndex((day) => day.isToday);
  const nowMinute = localMinutesInZone(now, timezone);
  const showNow =
    todayIndex >= 0 && nowMinute >= startMinute && nowMinute <= endMinute;

  const selected = rows.find((row) => row.id === selectedId) ?? null;

  const lessons = rows.filter(
    (row) => row.status === "PENDING" || row.status === "CONFIRMED"
  );
  const totalMinutes = lessons.reduce(
    (sum, row) =>
      sum +
      (new Date(row.endsAt).getTime() - new Date(row.startsAt).getTime()) /
        60_000,
    0
  );

  const cancel = async (id: string) => {
    setBusy(true);
    try {
      const result = await postJson<{
        status: string;
        lateCancellation?: boolean;
      }>(`/api/bookings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "cancel" }),
      });

      if (!result.ok) {
        notifyFailure(result.failure, { onRetry: () => cancel(id) });
        return;
      }

      setRows((current) => current.filter((row) => row.id !== id));
      setSelectedId(null);
      notifySuccess(
        "Cours annulé.",
        result.data.lateCancellation
          ? "C'était dans le délai de prévenance du prof : pensez à le prévenir."
          : undefined
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>
                {lessons.length === 0
                  ? "Aucun cours prévu."
                  : `${lessons.length} cours · ${formatDuration(totalMinutes)}`}
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ViewSwitch view={view} dayHref={nav.dayHref} weekHref={nav.weekHref} />
              <div className="flex items-center gap-1">
                <Button asChild variant="outline" size="sm">
                  <Link href={nav.previousHref} aria-label="Précédent">
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                </Button>
                {nav.currentHref ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={nav.currentHref}>{nav.currentLabel}</Link>
                  </Button>
                ) : null}
                <Button asChild variant="outline" size="sm">
                  <Link href={nav.nextHref} aria-label="Suivant">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="-mx-2 overflow-x-auto overflow-y-clip px-2">
            <div className={cn(days > 1 ? "min-w-[44rem]" : "min-w-[18rem]")}>
              <div className="flex">
                <div className="sticky left-0 z-20 w-12 shrink-0 bg-elevated" />
                {agenda.days.map((day) => (
                  <DayHeader key={day.date} day={day} />
                ))}
              </div>

              <div className="flex" style={{ height }}>
                <div className="sticky left-0 z-20 w-12 shrink-0 bg-elevated">
                  {hourMarks(startMinute, endMinute).map(
                    (minute) => (
                      <span
                        key={minute}
                        className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-subtle"
                        style={{ top: `${offset(minute)}%` }}
                      >
                        {formatTime(minute)}
                      </span>
                    )
                  )}
                </div>

                <div className="relative flex flex-1 border-t border-border">
                  {agenda.days.map((day) => (
                    <DayColumn
                      key={day.date}
                      day={day}
                      offset={offset}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                    />
                  ))}

                  {showNow ? (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute z-10 h-px bg-accent"
                      style={{
                        top: `${offset(nowMinute)}%`,
                        left: `${(todayIndex / agenda.days.length) * 100}%`,
                        width: `${100 / agenda.days.length}%`,
                      }}
                    >
                      <span className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full bg-accent" />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <Legend />

          {rows.length === 0 ? (
            <p className="flex items-start gap-2 rounded-md bg-surface p-3 text-sm text-muted">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Aucun cours cette semaine.{" "}
                <Link href="/profs" className="font-medium underline">
                  Trouver un prof
                </Link>
              </span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent>
          {selected ? (
            <BookingDetail
              row={selected}
              timezone={timezone}
              now={now}
              busy={busy}
              onCancel={cancel}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Légende des statuts de cours. Pas de volet « grille » comme chez le prof :
 * l'élève n'a pas de disponibilités, la grille ne porte donc que ses cours.
 */
function Legend() {
  const lessons = [
    { label: "Confirmé", className: "border-primary/40 bg-primary-soft" },
    {
      label: "En attente",
      className: "border-dashed border-warning/60 bg-warning-soft",
    },
    { label: "Terminé", className: "border-success/40 bg-success-soft" },
    { label: "Non honoré", className: "border-danger/40 bg-danger-soft" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
      {lessons.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            className={cn("h-3 w-3 shrink-0 rounded-xs border", item.className)}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Bascule Jour / Semaine, en liens (partageable, retour arrière). */
function ViewSwitch({
  view,
  dayHref,
  weekHref,
}: {
  view: "jour" | "semaine";
  dayHref: string;
  weekHref: string;
}) {
  const items = [
    { key: "jour" as const, label: "Jour", href: dayHref },
    { key: "semaine" as const, label: "Semaine", href: weekHref },
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

function DayHeader({ day }: { day: AgendaDay<StudentLesson> }) {
  return (
    <div
      className={cn(
        "flex-1 border-l border-border px-1 pb-2 text-center",
        day.isToday && "bg-primary-soft"
      )}
    >
      <p
        className={cn(
          "text-xs font-medium",
          day.isToday ? "text-primary" : "text-muted"
        )}
      >
        {WEEKDAY_SHORT[day.weekday - 1]}
      </p>
      <p
        className={cn(
          "text-sm tabular-nums",
          day.isToday ? "font-semibold text-primary" : "text-foreground"
        )}
      >
        {Number(day.date.slice(8, 10))}
      </p>
    </div>
  );
}

function DayColumn({
  day,
  offset,
  selectedId,
  onSelect,
}: {
  day: AgendaDay<StudentLesson>;
  offset: (minute: number) => number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="relative flex-1 border-l border-border">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: HOUR_LINES }}
      />

      {day.events.map((placed) => (
        <EventBlock
          key={`${placed.event.id}-${day.date}`}
          placed={placed}
          offset={offset}
          selected={placed.event.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function EventBlock({
  placed,
  offset,
  selected,
  onSelect,
}: {
  placed: PlacedEvent<StudentLesson>;
  offset: (minute: number) => number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { event, column, columns } = placed;
  const top = offset(placed.startMinute);
  const height = offset(placed.endMinute) - top;
  const showTime = columns === 1 && !placed.continuesBefore;
  const ModeIcon = MODE_ICONS[event.mode];

  return (
    <button
      type="button"
      onClick={() => onSelect(event.id)}
      title={`${event.teacherName ?? "Prof"} — ${event.instrumentName} · ${MODE_LABELS[event.mode]}`}
      className={cn(
        "absolute overflow-hidden rounded-sm border py-0.5 pl-2.5 pr-1 text-left text-[11px] leading-tight transition-shadow hover:z-10 hover:shadow-md",
        STATUS_STYLES[event.status],
        placed.continuesBefore && "rounded-t-none border-t-0",
        placed.continuesAfter && "rounded-b-none border-b-0",
        selected && "ring-2 ring-primary ring-offset-1"
      )}
      style={{
        top: `${top}%`,
        height: `${height}%`,
        left: `calc(${(column / columns) * 100}% + 1px)`,
        width: `calc(${100 / columns}% - 2px)`,
      }}
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1", STATUS_BAR[event.status])}
      />
      <span className="block truncate font-medium">
        {showTime ? `${formatTime(placed.startMinute)} ` : ""}
        {event.teacherName ?? "Prof"}
      </span>
      <span className="flex items-center gap-1 opacity-80">
        <ModeIcon className="h-3 w-3 shrink-0" />
        <span className="truncate">{event.instrumentName}</span>
      </span>
    </button>
  );
}

function BookingDetail({
  row,
  timezone,
  now,
  busy,
  onCancel,
}: {
  row: StudentAgendaRow;
  timezone: string;
  now: Date;
  busy: boolean;
  onCancel: (id: string) => void;
}) {
  const startsAt = new Date(row.startsAt);
  const endsAt = new Date(row.endsAt);

  // L'annulation est la seule action de l'élève, et seulement si le serveur
  // l'accepte (avant la fin, depuis en attente ou confirmé).
  const canCancel = checkTransition({
    action: "cancel",
    currentStatus: row.status,
    actor: "student",
    startsAt,
    endsAt,
    now,
  }).ok;

  const format = (date: Date, options: Intl.DateTimeFormatOptions) =>
    date.toLocaleString("fr-FR", { ...options, timeZone: timezone });

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>
          {row.teacherName ?? "Prof"}
          <span className="text-muted"> — {row.instrumentName}</span>
        </DialogTitle>
        <DialogDescription>
          <span className="first-letter:uppercase">
            {format(startsAt, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          {" · "}
          {format(startsAt, { hour: "2-digit", minute: "2-digit" })}
          {" – "}
          {format(endsAt, { hour: "2-digit", minute: "2-digit" })}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{STATUS_LABELS[row.status]}</Badge>
        <Badge variant="secondary">{MODE_LABELS[row.mode]}</Badge>
        {row.priceCents !== null ? (
          <Badge variant="secondary">
            {`${(row.priceCents / 100).toFixed(2)} €`}
          </Badge>
        ) : null}
        {row.isTrial ? (
          <Badge variant="secondary">
            <Sparkles className="mr-1 h-3 w-3" />
            Essai
          </Badge>
        ) : null}
      </div>

      {/* Lien visio (visio confirmée) ou adresse (présentiel), quand disponible. */}
      {row.status === "CONFIRMED" && row.mode === "ONLINE" && row.meetingUrl ? (
        <a
          href={row.meetingUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <Globe className="h-4 w-4" />
          Rejoindre la visio
        </a>
      ) : null}
      {row.mode !== "ONLINE" && row.address ? (
        <p className="flex items-start gap-2 text-sm text-muted">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
          {row.address}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/profs/${row.teacherSlug}`}>
            <User className="mr-2 h-3 w-3" />
            Voir le prof
          </Link>
        </Button>

        {canCancel ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onCancel(row.id)}
          >
            {busy ? (
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            ) : (
              <CalendarX className="mr-2 h-3 w-3" />
            )}
            Annuler le cours
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function hourMarks(startMinute: number, endMinute: number): number[] {
  const marks: number[] = [];
  for (let minute = startMinute; minute <= endMinute; minute += 60) {
    marks.push(minute);
  }
  return marks;
}

function weekLabel(days: { date: string }[]): string {
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const render = (key: string, options: Intl.DateTimeFormatOptions) =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString("fr-FR", {
      ...options,
      timeZone: "UTC",
    });
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  return `${render(first, sameMonth ? { day: "numeric" } : { day: "numeric", month: "long" })} – ${render(last, { day: "numeric", month: "long", year: "numeric" })}`;
}

function dayTitle(dateKey: string): string {
  const label = new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}
