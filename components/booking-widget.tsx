"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Moon,
  Sun,
  Sunrise,
} from "lucide-react";

import { FormFailure } from "@/components/form-failure";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  groupSlotsByPeriod,
  PERIOD_LABELS,
  type DayPeriod,
} from "@/lib/bookings/day-period";
import { postJson, type Failure } from "@/lib/http/failure";
import { cn } from "@/lib/utils";

type Slot = { startsAt: string; endsAt: string };
type Instrument = { slug: string; name: string };

const DAY_MS = 86_400_000;

/** Le repère visuel de la plage : lu avant le mot, et suffisant au rappel. */
const PERIOD_ICONS: Record<DayPeriod, typeof Sun> = {
  MORNING: Sunrise,
  AFTERNOON: Sun,
  EVENING: Moon,
};

/**
 * Sélection d'un créneau et envoi d'une demande.
 *
 * Îlot client au sein d'une page serveur : les créneaux ne peuvent pas être
 * rendus au build ni mis en cache, ils changent à chaque réservation. Ils sont
 * donc chargés ici, à l'ouverture de la page, pendant que le reste de la fiche
 * reste statique et indexable.
 */
export function BookingWidget({
  teacherSlug,
  instruments,
  timezone,
  trialOffered,
  viewer,
}: {
  teacherSlug: string;
  instruments: Instrument[];
  timezone: string;
  trialOffered: boolean;
  /**
   * État du visiteur, décidé côté serveur : `guest` (pas connecté),
   * `incomplete` (connecté mais sans profil élève — la réservation répondrait
   * 403) ou `student` (peut réserver). Détermine l'appel à l'action avant le
   * clic, plutôt que de laisser l'élève buter sur une erreur.
   */
  viewer: "guest" | "incomplete" | "student";
}) {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [instrument, setInstrument] = useState(instruments[0]?.slug ?? "");
  const [isTrial, setIsTrial] = useState(false);
  const [message, setMessage] = useState("");
  const [isBooking, setIsBooking] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [slotsFailed, setSlotsFailed] = useState(false);
  const [done, setDone] = useState(false);
  // La semaine initiale n'est fixée qu'après avoir cherché le premier créneau
  // disponible (ou restauré une sélection). Tant que non, on n'affiche que le
  // squelette — inutile de charger la semaine courante pour la remplacer aussitôt.
  const [ready, setReady] = useState(false);

  // Sélection conservée à travers l'aller-retour de connexion / onboarding : un
  // invité qui choisit un créneau puis part se connecter le retrouve à son
  // retour, prêt à confirmer. Écrite au moment de partir (clic sur l'appel à
  // l'action), relue une fois au montage.
  const storageKey = `sinote:booking:${teacherSlug}`;
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    // Sélection sauvegardée (retour de connexion / onboarding) : on la restaure
    // telle quelle, semaine comprise, et on affiche.
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      sessionStorage.removeItem(storageKey);
      try {
        const saved = JSON.parse(raw) as {
          selected?: string;
          instrument?: string;
          isTrial?: boolean;
          message?: string;
          weekStart?: string;
        };
        if (saved.weekStart) setWeekStart(new Date(saved.weekStart));
        if (saved.selected) setSelected(saved.selected);
        if (saved.instrument) setInstrument(saved.instrument);
        if (typeof saved.isTrial === "boolean") setIsTrial(saved.isTrial);
        if (saved.message) setMessage(saved.message);
      } catch {
        // Entrée illisible : on l'ignore, la sélection repart de zéro.
      }
      setReady(true);
      return;
    }

    // Sinon, on cherche la première semaine ayant un créneau et on ouvre
    // dessus : l'élève tombe directement sur du disponible plutôt que sur une
    // semaine courante souvent vide. Une seule requête large (l'horizon de
    // réservation par défaut ≈ 60 j), puis on retient le plus tôt.
    (async () => {
      const from = startOfWeek(new Date());
      const to = new Date(from.getTime() + 9 * 7 * DAY_MS);
      const result = await postJson<{ slots: Slot[] }>(
        `/api/teachers/${teacherSlug}/availability?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
        { method: "GET" }
      );

      if (result.ok && result.data.slots.length > 0) {
        const earliest = result.data.slots.reduce((a, b) =>
          a.startsAt <= b.startsAt ? a : b
        );
        setWeekStart(startOfWeek(new Date(earliest.startsAt)));
      }
      // Créneaux introuvables ou requête en échec : on reste sur la semaine
      // courante, l'affichage hebdo gère ensuite le vide / la relance.
      setReady(true);
    })();
  }, [storageKey, teacherSlug]);

  const persistSelection = () => {
    if (!selected) return;
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        selected,
        instrument,
        isTrial,
        message,
        weekStart: weekStart.toISOString(),
      })
    );
  };

  const loadSlots = useCallback(async () => {
    setSlots(null);
    setSelected(null);
    setSlotsFailed(false);

    const from = weekStart.toISOString();
    const to = new Date(weekStart.getTime() + 7 * DAY_MS).toISOString();

    const result = await postJson<{ slots: Slot[] }>(
      `/api/teachers/${teacherSlug}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { method: "GET" }
    );

    // Un échec de chargement rendait une liste vide, donc « Aucun créneau
    // disponible cette semaine » — un mensonge qui envoie l'élève chercher
    // ailleurs alors que le prof est peut-être libre toute la semaine.
    if (!result.ok) {
      setSlots([]);
      setSlotsFailed(true);
      return;
    }

    setSlots(result.data.slots);
  }, [teacherSlug, weekStart]);

  useEffect(() => {
    // On attend que la semaine initiale soit fixée (recherche du premier
    // créneau disponible ou restauration), pour ne pas charger la semaine
    // courante puis la remplacer.
    if (ready) loadSlots();
  }, [loadSlots, ready]);

  const book = async () => {
    if (!selected) return;

    setIsBooking(true);
    setError(null);

    try {
      const result = await postJson("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          teacherSlug,
          instrumentSlug: instrument,
          startsAt: selected,
          isTrial,
          studentMessage: message || undefined,
        }),
      });

      if (!result.ok) {
        setError(result.failure);

        // Un conflit veut dire que le créneau vient d'être pris : on recharge
        // plutôt que de laisser une liste périmée à l'écran.
        if (result.failure.kind === "conflict") loadSlots();
        return;
      }

      // La demande est passée : la sélection conservée n'a plus lieu d'être.
      sessionStorage.removeItem(storageKey);
      setDone(true);
      router.refresh();
    } finally {
      setIsBooking(false);
    }
  };

  if (done) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <CardTitle>Demande envoyée</CardTitle>
          </div>
          <CardDescription>
            Le prof reçoit votre demande et doit la confirmer. Vous serez prévenu
            et retrouverez ce cours dans votre espace.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard/cours">Voir mes cours</Link>
          </Button>
          <button
            type="button"
            onClick={() => {
              setDone(false);
              setSelected(null);
              setMessage("");
              loadSlots();
            }}
            className="text-center text-sm text-muted hover:underline"
          >
            Réserver un autre créneau
          </button>
        </CardContent>
      </Card>
    );
  }

  const byDay = groupSlotsByPeriod(
    slots ?? [],
    (slot) => new Date(slot.startsAt),
    timezone
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <CardTitle>Réserver un cours</CardTitle>
        </div>
        <CardDescription>
          Horaires affichés dans le fuseau du prof ({timezone}).
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Navigation par semaine */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={weekStart <= startOfWeek(new Date())}
            onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY_MS))}
          >
            <ChevronLeft className="h-4 w-4" />
            Semaine précédente
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY_MS))}
          >
            Semaine suivante
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {slots === null ? (
          <SlotsSkeleton />
        ) : slotsFailed ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm text-muted">
              Les créneaux n&apos;ont pas pu être chargés. Ce prof est
              peut-être disponible.
            </p>
            <Button variant="outline" size="sm" onClick={loadSlots}>
              Réessayer
            </Button>
          </div>
        ) : byDay.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Aucun créneau disponible cette semaine.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {byDay.map((day) => (
              <div key={day.date}>
                {/* `first-letter` et non `capitalize` : `capitalize` met une
                    majuscule à chaque mot et écrivait « Lundi 3 Août », alors
                    qu'en français le mois reste en minuscule. */}
                <p className="mb-2.5 text-sm font-medium first-letter:uppercase">
                  {formatDay(day.periods[0].slots[0].startsAt, timezone)}
                </p>

                <div className="flex flex-col gap-3">
                  {day.periods.map(({ period, slots: periodSlots }) => {
                    const Icon = PERIOD_ICONS[period];

                    return (
                      // Le titre de plage est rendu même quand la journée n'en
                      // compte qu'une : « Matin » seul dit que ce prof
                      // n'enseigne que le matin ce jour-là, ce qui est
                      // précisément l'information cherchée.
                      <div key={period}>
                        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-subtle">
                          <Icon className="h-3.5 w-3.5" />
                          {PERIOD_LABELS[period]}
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {periodSlots.map((slot) => (
                            <button
                              key={slot.startsAt}
                              type="button"
                              aria-pressed={selected === slot.startsAt}
                              onClick={() => setSelected(slot.startsAt)}
                              className={cn(
                                "rounded-md border px-3 py-1.5 text-sm transition-colors",
                                selected === slot.startsAt
                                  ? "border-primary bg-primary text-white"
                                  : "border-border hover:border-primary"
                              )}
                            >
                              {formatHour(slot.startsAt, timezone)}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {selected ? (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            {instruments.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {instruments.map((item) => (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => setInstrument(item.slug)}
                    className={cn(
 "rounded-full border px-3 py-1 text-sm",
                      instrument === item.slug
                        ? "border-primary text-primary"
                        : "border-border text-muted"
                    )}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            ) : null}

            {trialOffered ? (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isTrial}
                  onChange={(e) => setIsTrial(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Réserver le cours d&apos;essai
              </label>
            ) : null}

            <Textarea
              rows={3}
              value={message}
              placeholder="Un mot sur votre niveau, vos objectifs… (facultatif)"
              onChange={(e) => setMessage(e.target.value)}
            />

            {viewer === "student" ? (
              <>
                <FormFailure failure={error} onRetry={book} />
                <Button size="lg" disabled={isBooking} onClick={book}>
                  {isBooking ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Demander ce cours
                </Button>
              </>
            ) : viewer === "guest" ? (
              <div className="flex flex-col gap-2">
                <Button asChild size="lg">
                  <Link
                    href={`/connexion?callbackUrl=${encodeURIComponent(`/profs/${teacherSlug}`)}`}
                    onClick={persistSelection}
                  >
                    Se connecter pour réserver
                  </Link>
                </Button>
                <p className="text-center text-xs text-muted">
                  Pas encore de compte ? La création est gratuite, votre
                  sélection est conservée.
                </p>
              </div>
            ) : (
              // Connecté, mais pas encore de profil élève.
              <div className="flex flex-col gap-2">
                <Button asChild size="lg">
                  <Link
                    href={`/onboarding?callbackUrl=${encodeURIComponent(`/profs/${teacherSlug}`)}`}
                    onClick={persistSelection}
                  >
                    Créer mon profil élève
                  </Link>
                </Button>
                <p className="text-center text-xs text-muted">
                  Il ne manque que ça pour réserver — votre sélection est
                  conservée.
                </p>
              </div>
            )}
            <p className="text-center text-xs text-muted">
              Rien n&apos;est prélevé : vous réglez le prof directement.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Ossature de chargement des créneaux : des pastilles grises pulsées, disposées
 * comme la vraie liste. Un simple spinner ne disait pas « du contenu arrive
 * ici » ; l'ossature en donne la forme et rassure sur ce qui se charge.
 */
function SlotsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <span className="sr-only">Chargement des créneaux…</span>
      {[0, 1].map((day) => (
        <div key={day} aria-hidden>
          <div className="mb-2.5 h-4 w-40 animate-pulse rounded bg-surface-strong" />
          <div className="mb-1.5 h-3 w-16 animate-pulse rounded bg-surface" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: day === 0 ? 6 : 4 }).map((_, i) => (
              <div
                key={i}
                className="h-8 w-16 animate-pulse rounded-md bg-surface"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Lundi 00:00 de la semaine courante, heure locale du visiteur. */
function startOfWeek(date: Date): Date {
  const day = (date.getDay() + 6) % 7;
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - day);
  return monday;
}

/**
 * Étiquette du jour, formatée depuis l'**instant** d'un créneau et non depuis la
 * clé civile du regroupement : celle-ci est déjà exprimée dans le fuseau du
 * prof, la repasser dans ce fuseau la décalerait d'un jour.
 */
function formatDay(iso: string, timezone: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  });
}

function formatHour(iso: string, timezone: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}
