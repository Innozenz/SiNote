"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
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
import { civilDateKeyInZone, localMinutesInZone } from "@/lib/availability/zone";
import {
  groupSlotsByPeriod,
  PERIOD_LABELS,
  type DayPeriod,
} from "@/lib/bookings/day-period";
import { postJson, type Failure } from "@/lib/http/failure";
import { formatSlotLong } from "@/lib/teacher/slot-label";
import { cn } from "@/lib/utils";

type Slot = { startsAt: string; endsAt: string };
type Instrument = { slug: string; name: string };

/** Créneau mis en avant, déjà mis en forme côté serveur. */
export type InitialNextSlot = { startsAt: string; label: string };

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
 *
 * Trois choses structurent l'écran, dans cet ordre :
 *
 * 1. **Le prochain créneau**, mis en avant et réservable d'un clic. Sa valeur
 *    initiale vient du serveur (`initialNextSlot`) : elle est donc dans le HTML
 *    — lisible par un moteur, et affichée avant même que le fetch réponde.
 * 2. **La bande des sept jours**, avec le nombre de créneaux sous chaque jour.
 *    Un jour vide est grisé et inerte : un bouton qui n'ouvre rien est pire
 *    qu'un bouton absent.
 * 3. **Les créneaux du jour choisi**, groupés par plage (matin / après-midi /
 *    soir, via `lib/bookings/day-period.ts`) et **limités aux heures rondes**
 *    tant que l'élève ne demande pas les départs intermédiaires. Une grille à
 *    quinze minutes produit quatre fois trop de pastilles pour être lue, et
 *    c'est l'heure ronde que l'on cherche d'abord.
 */
export function BookingWidget({
  teacherSlug,
  instruments,
  timezone,
  granularityMin,
  trialOffered,
  hourlyRate = null,
  viewer,
  initialNextSlot = null,
}: {
  teacherSlug: string;
  instruments: Instrument[];
  timezone: string;
  /** Pas de la grille du prof — décide s'il existe des départs intermédiaires. */
  granularityMin: number;
  trialOffered: boolean;
  /**
   * Tarif horaire en euros, déjà arrondi côté serveur. En tête de la carte :
   * c'est ce que l'élève regarde avant le premier créneau, et l'afficher dans
   * un bloc séparé au-dessus en faisait un second objet à lire.
   */
  hourlyRate?: string | null;
  /**
   * État du visiteur, décidé côté serveur : `guest` (pas connecté),
   * `incomplete` (connecté mais sans profil élève — la réservation répondrait
   * 403) ou `student` (peut réserver). Détermine l'appel à l'action avant le
   * clic, plutôt que de laisser l'élève buter sur une erreur.
   */
  viewer: "guest" | "incomplete" | "student";
  /**
   * Prochain créneau calculé par la page serveur. Affiché tel quel jusqu'à ce
   * que le balayage client le remplace — c'est ce qui met la disponibilité dans
   * le HTML rendu, et pas seulement après hydratation.
   */
  initialNextSlot?: InitialNextSlot | null;
}) {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showQuarters, setShowQuarters] = useState(false);
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
  // Premier créneau trouvé par le balayage à 62 jours. Part de la valeur
  // calculée par le serveur : le bloc est donc rempli dès le premier rendu.
  const [nextSlot, setNextSlot] = useState<InitialNextSlot | null>(
    initialNextSlot
  );
  const [scanned, setScanned] = useState(false);
  // La note de fuseau n'a de sens que si celui du visiteur diffère. Calculée
  // après montage : le serveur ne connaît pas le fuseau du navigateur.
  const [foreignZone, setForeignZone] = useState(false);

  // Créneau à sélectionner dès que la semaine qui le contient est chargée —
  // c'est ce qui fait que « Réserver » sur le bloc du prochain créneau atterrit
  // sur le bon jour, sélection faite.
  const pendingSelect = useRef<string | null>(null);

  useEffect(() => {
    try {
      const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setForeignZone(Boolean(mine) && mine !== timezone);
    } catch {
      // Navigateur sans Intl complet : on n'affiche rien.
    }
  }, [timezone]);

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
        if (saved.selected) pendingSelect.current = saved.selected;
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
    // semaine courante souvent vide. Une seule requête large, puis on retient
    // le plus tôt. La plage est plafonnée à 62 jours côté route (MAX_RANGE_DAYS)
    // — la dépasser renvoie 400 et le saut n'aurait pas lieu.
    (async () => {
      const from = startOfWeek(new Date());
      const to = new Date(from.getTime() + 62 * DAY_MS);
      const result = await postJson<{ slots: Slot[] }>(
        `/api/teachers/${teacherSlug}/availability?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
        { method: "GET" }
      );

      if (result.ok && result.data.slots.length > 0) {
        const earliest = result.data.slots.reduce((a, b) =>
          a.startsAt <= b.startsAt ? a : b
        );
        setNextSlot({
          startsAt: earliest.startsAt,
          label: formatSlotLong(new Date(earliest.startsAt), timezone),
        });
        setWeekStart(startOfWeek(new Date(earliest.startsAt)));
      }
      // Balayage concluant et vide : le prochain créneau annoncé par le serveur
      // n'existe plus (il vient d'être pris). Le taire vaut mieux que le mentir.
      if (result.ok) {
        setScanned(true);
        if (result.data.slots.length === 0) setNextSlot(null);
      }
      setReady(true);
    })();
  }, [storageKey, teacherSlug, timezone]);

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

    // Créneau visé (bloc « Prochain créneau », ou retour de connexion) : il
    // n'est sélectionnable qu'une fois sa semaine chargée.
    const wanted = pendingSelect.current;
    pendingSelect.current = null;
    if (wanted && result.data.slots.some((slot) => slot.startsAt === wanted)) {
      setSelected(wanted);
      setSelectedDay(civilDateKeyInZone(new Date(wanted), timezone));
    }
  }, [teacherSlug, timezone, weekStart]);

  useEffect(() => {
    // On attend que la semaine initiale soit fixée (recherche du premier
    // créneau disponible ou restauration), pour ne pas charger la semaine
    // courante puis la remplacer.
    if (ready) loadSlots();
  }, [loadSlots, ready]);

  const byDay = useMemo(
    () =>
      groupSlotsByPeriod(slots ?? [], (slot) => new Date(slot.startsAt), timezone),
    [slots, timezone]
  );

  const dayMap = useMemo(
    () => new Map(byDay.map((day) => [day.date, day])),
    [byDay]
  );

  // Les sept jours civils de la semaine affichée, **dans le fuseau du prof** :
  // c'est dans ce fuseau que les créneaux sont regroupés, et une bande calée
  // sur le fuseau du visiteur décalerait les compteurs d'un jour.
  const dayKeys = useMemo(() => {
    const first = civilDateKeyInZone(weekStart, timezone);
    return Array.from({ length: 7 }, (_, index) => addDayKey(first, index));
  }, [weekStart, timezone]);

  const countFor = useCallback(
    (key: string) =>
      dayMap
        .get(key)
        ?.periods.reduce((total, period) => total + period.slots.length, 0) ?? 0,
    [dayMap]
  );

  // Jour affiché : celui déjà choisi s'il a encore des créneaux, sinon le
  // premier de la semaine qui en a. Conserver le choix évite qu'un simple
  // rechargement (après une réservation, par exemple) ramène l'élève au lundi.
  useEffect(() => {
    if (slots === null) return;
    setSelectedDay((current) =>
      current && countFor(current) > 0
        ? current
        : (dayKeys.find((key) => countFor(key) > 0) ?? null)
    );
  }, [slots, dayKeys, countFor]);

  const isRoundHour = useCallback(
    (slot: Slot) => localMinutesInZone(new Date(slot.startsAt), timezone) % 60 === 0,
    [timezone]
  );

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
            <Link href="/dashboard">Voir mes cours</Link>
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

  const dayEntry = selectedDay ? dayMap.get(selectedDay) : undefined;

  // Départs intermédiaires : n'existent que si la grille est plus fine qu'une
  // heure. On ne masque les non-ronds que s'il reste des heures rondes à
  // montrer — sinon un prof qui n'ouvre qu'à 9 h 15 aurait une journée vide.
  const daySlots = dayEntry?.periods.flatMap((period) => period.slots) ?? [];
  const hasQuarters =
    granularityMin < 60 && daySlots.some((slot) => !isRoundHour(slot));
  const hasRound = daySlots.some(isRoundHour);
  const selectedIsQuarter = selected
    ? localMinutesInZone(new Date(selected), timezone) % 60 !== 0
    : false;
  const showAll =
    showQuarters || selectedIsQuarter || !hasQuarters || !hasRound;

  return (
    <Card>
      <CardHeader className="gap-4">
        {/* Le titre reste, mais pour les lecteurs d'écran seulement : à l'œil,
            c'est le tarif qui ouvre la carte, et un intitulé « Réserver un
            cours » au-dessus du prix ne dirait rien que la carte ne montre. */}
        <CardTitle className="sr-only">Réserver un cours</CardTitle>

        {hourlyRate ? (
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-display text-[2.5rem] font-semibold leading-none text-foreground">
              {`${hourlyRate} €`}
              <span className="font-sans text-base font-medium text-muted">
                {" / heure"}
              </span>
            </p>
            <span className="shrink-0 text-right text-xs text-muted">
              réglé au prof, hors plateforme
            </span>
          </div>
        ) : null}

        {foreignZone ? (
          <CardDescription>
            {`Horaires affichés dans le fuseau du prof (${timezone}), pas dans le vôtre.`}
          </CardDescription>
        ) : null}

        {/* Le prochain créneau, réservable sans parcourir la grille. Rendu dès
            le serveur, donc présent dans le HTML. La date et le bouton sur une
            même ligne : c'est une proposition, pas une section. */}
        {nextSlot ? (
          <div className="flex items-center justify-between gap-3 rounded-[12px] bg-primary-soft p-4">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.08em] text-primary">
                Prochain créneau
              </p>
              <p className="mt-0.5 font-display text-xl font-semibold leading-tight text-primary first-letter:uppercase">
                {nextSlot.label}
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => {
                const target = new Date(nextSlot.startsAt);
                const week = startOfWeek(target);

                if (week.getTime() === weekStart.getTime()) {
                  setSelected(nextSlot.startsAt);
                  setSelectedDay(civilDateKeyInZone(target, timezone));
                } else {
                  // La sélection attend que sa semaine soit chargée.
                  pendingSelect.current = nextSlot.startsAt;
                  setWeekStart(week);
                }
              }}
            >
              Réserver
            </Button>
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Semaine et bande de jours **après montage seulement**.
            `startOfWeek` lit l'horloge locale : celle du serveur au rendu, celle
            du navigateur ensuite. Les deux peuvent tomber sur des lundis
            différents (à quelques minutes de minuit, ou sur un serveur en UTC),
            et React signalerait une divergence d'hydratation sur sept
            étiquettes de jour. Le bloc « Prochain créneau » au-dessus, lui, est
            calculé côté serveur et reste rendu dans le HTML — c'est lui qui
            porte l'information pour les moteurs. */}
        {!ready ? (
          <SlotsSkeleton />
        ) : (
          <>
        {/* Navigation par semaine. Le libellé au centre dit *quelle* semaine
            est affichée : sans lui, le saut initial vers la première semaine
            disponible laissait l'élève sans repère. */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Semaine précédente"
            disabled={weekStart <= startOfWeek(new Date())}
            onClick={() => {
              setShowQuarters(false);
              setWeekStart(new Date(weekStart.getTime() - 7 * DAY_MS));
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-medium first-letter:uppercase">
            {formatWeek(weekStart)}
          </p>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Semaine suivante"
            onClick={() => {
              setShowQuarters(false);
              setWeekStart(new Date(weekStart.getTime() + 7 * DAY_MS));
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* La bande des sept jours. Le compteur sous chaque jour est ce qui
            permet de choisir sans ouvrir : un jour à un créneau et un jour à
            douze ne se valent pas. */}
        <div className="grid grid-cols-7 gap-1">
          {dayKeys.map((key) => {
            const total = slots === null ? null : countFor(key);
            const active = key === selectedDay;
            const empty = total === 0;

            return (
              <button
                key={key}
                type="button"
                disabled={empty}
                aria-pressed={active}
                aria-label={`${formatDayKey(key)} — ${
                  total === null
                    ? "chargement"
                    : total === 0
                      ? "aucun créneau"
                      : `${total} créneau${total > 1 ? "x" : ""}`
                }`}
                onClick={() => {
                  setSelectedDay(key);
                  setShowQuarters(false);
                }}
                className={cn(
                  // Chaque jour est une pastille cernée : un jour ouvert est
                  // clair (papier), un jour vide s'enfonce dans le grège, et le
                  // jour choisi passe en bleu plein. Le compteur se lit avant
                  // d'ouvrir — un jour à un créneau et un jour à douze ne se
                  // valent pas.
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[10px] border px-0.5 py-1.5 transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : empty
                      ? "border-border bg-surface-strong text-subtle"
                      : "border-border bg-elevated text-foreground hover:border-primary"
                )}
              >
                <span
                  className={cn(
                    "text-[0.625rem] leading-none first-letter:uppercase",
                    active ? "text-primary-foreground/75" : "text-subtle"
                  )}
                >
                  {weekdayShort(key)}
                </span>
                <span className="text-[0.9375rem] font-semibold leading-none">
                  {Number(key.slice(8, 10))}
                </span>
                <span
                  className={cn(
                    "text-[0.625rem] leading-none",
                    active
                      ? "text-primary-foreground/90"
                      : empty
                        ? "text-subtle"
                        : "text-success"
                  )}
                >
                  {total === null ? "·" : total === 0 ? "—" : total}
                </span>
              </button>
            );
          })}
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
        ) : !dayEntry ? (
          <EmptyWeek
            nextSlotAt={nextSlot?.startsAt ?? null}
            scanned={scanned}
            weekStart={weekStart}
            timezone={timezone}
            onJump={(date) => setWeekStart(startOfWeek(date))}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {/* `first-letter` et non `capitalize` : `capitalize` met une
                majuscule à chaque mot et écrivait « Lundi 3 Août », alors
                qu'en français le mois reste en minuscule. */}
            <p className="text-sm font-medium first-letter:uppercase">
              {formatDayKey(dayEntry.date)}
            </p>

            {dayEntry.periods.map(({ period, slots: periodSlots }) => {
              const shown = showAll
                ? periodSlots
                : periodSlots.filter(isRoundHour);

              // Une plage vidée par le filtre ne s'affiche pas : un intitulé
              // « Après-midi » suivi de rien ferait passer le prof pour complet.
              if (shown.length === 0) return null;

              const Icon = PERIOD_ICONS[period];

              return (
                // Le titre de plage est rendu même quand la journée n'en
                // compte qu'une : « Matin » seul dit que ce prof n'enseigne
                // que le matin ce jour-là, ce qui est précisément
                // l'information cherchée.
                <div key={period}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-subtle">
                    <Icon className="h-3.5 w-3.5" />
                    {PERIOD_LABELS[period]}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {shown.map((slot) => (
                      <button
                        key={slot.startsAt}
                        type="button"
                        aria-pressed={selected === slot.startsAt}
                        onClick={() => setSelected(slot.startsAt)}
                        className={cn(
                          "min-h-11 rounded-full border px-4 text-sm transition-colors",
                          selected === slot.startsAt
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-elevated hover:border-primary"
                        )}
                      >
                        {formatHour(slot.startsAt, timezone)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Les départs intermédiaires restent à un clic. Les montrer tous
                d'emblée quadruple la liste pour une information que l'élève
                n'a demandée qu'en dernier recours. */}
            {hasQuarters && hasRound && !showAll ? (
              <button
                type="button"
                onClick={() => setShowQuarters(true)}
                className="inline-flex min-h-9 w-fit items-center rounded-full border border-dashed border-border px-3 text-xs text-muted transition-colors hover:border-primary hover:text-primary"
              >
                + quarts d’heure
              </button>
            ) : null}
          </div>
        )}
          </>
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
                      "min-h-9 rounded-full border px-3 text-sm",
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
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
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
          </div>
        ) : null}

        {/* Ce que devient la demande, dit avant de la faire — et notamment que
            le créneau ne file pas pendant que le prof réfléchit. Toujours
            visible : c'est la question qu'on se pose *avant* de choisir. */}
        <p className="text-xs leading-relaxed text-muted">
          Le prof confirme votre demande. Le créneau reste bloqué pour vous en
          attendant sa réponse, et rien n&apos;est prélevé : vous le réglez
          directement.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Semaine sans créneau. Trois cas, trois phrases : un prochain créneau connu
 * (on dit quand, et on y va d'un clic) ; un balayage à 62 jours revenu vide
 * (le prof n'a rien d'ouvert avant deux mois) ; pas encore de balayage
 * concluant (formulation neutre).
 */
function EmptyWeek({
  nextSlotAt,
  scanned,
  weekStart,
  timezone,
  onJump,
}: {
  nextSlotAt: string | null;
  scanned: boolean;
  weekStart: Date;
  timezone: string;
  onJump: (date: Date) => void;
}) {
  const next = nextSlotAt ? new Date(nextSlotAt) : null;
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
  const laterNext = next && next.getTime() >= weekEnd.getTime() ? next : null;

  if (laterNext) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-muted">
          Aucun créneau cette semaine. Prochain créneau :{" "}
          <span className="font-medium text-foreground first-letter:uppercase">
            {formatSlotLong(laterNext, timezone)}
          </span>
          .
        </p>
        <Button variant="outline" size="sm" onClick={() => onJump(laterNext)}>
          Aller à cette semaine
        </Button>
      </div>
    );
  }

  return (
    <p className="py-6 text-center text-sm text-muted">
      {scanned && !next
        ? "Aucun créneau dans les deux prochains mois. Ce prof n'a pas encore ouvert son agenda, ou il est complet."
        : "Aucun créneau disponible cette semaine."}
    </p>
  );
}

/**
 * Ossature de chargement des créneaux : des pastilles grises pulsées, disposées
 * comme la vraie liste. Un simple spinner ne disait pas « du contenu arrive
 * ici » ; l'ossature en donne la forme et rassure sur ce qui se charge.
 */
function SlotsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <span className="sr-only">Chargement des créneaux…</span>
      <div aria-hidden className="h-4 w-40 animate-pulse rounded bg-surface-strong" />
      <div aria-hidden className="h-3 w-16 animate-pulse rounded bg-surface" />
      <div aria-hidden className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-11 w-16 animate-pulse rounded-[var(--radius-sm)] bg-surface"
          />
        ))}
      </div>
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
 * Décalage d'une clé civile `AAAA-MM-JJ`, en jours.
 *
 * Fait en UTC, sans fuseau : une clé civile est **déjà** exprimée dans le
 * fuseau du prof, la repasser dans un fuseau la décalerait d'un jour.
 */
function addDayKey(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** « lun. » — la clé civile se lit en UTC, pour la même raison. */
function weekdayShort(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "short",
    timeZone: "UTC",
  });
}

/** « lundi 3 août » — même règle : la clé est déjà dans le bon fuseau. */
function formatDayKey(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** « Semaine du 21 septembre » — le lundi de la semaine, heure locale du visiteur. */
function formatWeek(weekStart: Date): string {
  return `Semaine du ${weekStart.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  })}`;
}

function formatHour(iso: string, timezone: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}
