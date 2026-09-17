"use client";

import { useMemo, useState } from "react";
import type { InstrumentFamily } from "@prisma/client";
import { AlertCircle, Check, Eye, EyeOff, Loader2, Plus, X } from "lucide-react";

import { FormFailure } from "@/components/form-failure";
import { InstrumentChip } from "@/components/instrument-chip";
import { StudentProfilePreview } from "@/components/student-profile-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { localFailure, postJson, type Failure } from "@/lib/http/failure";
import { FAMILY_LABELS, FAMILY_ORDER } from "@/lib/instruments/family";
import { PREFERRED_GENRES } from "@/lib/student/genres";
import { checkStudentProfile } from "@/lib/student/profile";
import { notifySuccess } from "@/lib/toast";
import { ageOn } from "@/lib/user/age";
import { cn } from "@/lib/utils";

type Level = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "PROFESSIONAL";

/** Même seuil que `lib/student/profile.ts` : la règle serveur reste la vérité. */
const MAJORITY_AGE = 18;

const LEVELS: Level[] = [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
  "PROFESSIONAL",
];

const LEVEL_LABELS: Record<Level, string> = {
  BEGINNER: "Débutant",
  INTERMEDIATE: "Intermédiaire",
  ADVANCED: "Avancé",
  PROFESSIONAL: "Professionnel",
};

const VOICE_LABELS: Record<string, string> = {
  SOPRANO: "Soprano",
  MEZZO_SOPRANO: "Mezzo-soprano",
  ALTO: "Alto",
  COUNTERTENOR: "Contre-ténor",
  TENOR: "Ténor",
  BARITONE: "Baryton",
  BASS: "Basse",
  UNKNOWN: "Je ne sais pas",
};

export type StudentInstrumentRow = {
  slug: string;
  name: string;
  family: string;
  /** Nul tant que l'élève n'a pas choisi : « Débutant » par défaut aurait
   * été une réponse que personne n'a donnée. */
  level: Level | null;
  yearsPracticed: number | null;
  ownsInstrument: boolean;
};

export type StudentProfileData = {
  birthDate: string | null;
  guardianName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  goals: string | null;
  musicalBackground: string | null;
  readsSheetMusic: boolean;
  preferredGenres: string[];
  voiceType: string | null;
  prefersOnline: boolean;
  city: string | null;
  instruments: StudentInstrumentRow[];
  issues: { field: string; message: string }[];
};

/**
 * Profil de l'élève, et son aperçu côté prof.
 *
 * Deux colonnes dès `lg` : le formulaire à gauche, « Ce que voit le prof » à
 * droite, alimenté par l'état en direct. Un profil élève n'est pas une fiche
 * qu'on consulte — c'est ce qui part avec chaque demande de cours, et le voir
 * se construire est ce qui donne envie de le remplir.
 *
 * `checkStudentProfile` est la **seule** règle : elle alimente ici la liste des
 * manques, l'avertissement du bloc « Responsable légal » et l'aperçu, et c'est
 * elle que la route applique. Aucune de ces trois surfaces ne la réécrit.
 */
export function StudentProfileForm({
  initial,
  catalogue,
  identity,
}: {
  initial: StudentProfileData;
  catalogue: { slug: string; name: string; family: string }[];
  /** Identité de l'élève, pour l'aperçu : elle s'édite dans « Mon compte ». */
  identity: { name: string | null; image: string | null };
}) {
  const [profile, setProfile] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  // Choix d'un instrument à ajouter : le sélecteur n'est là que quand on le
  // demande, sinon la section s'ouvre sur trente-sept puces.
  const [adding, setAdding] = useState(false);
  // Sous `lg`, l'aperçu est replié : il vaut mieux qu'un écran de téléphone
  // commence par le formulaire.
  const [previewOpen, setPreviewOpen] = useState(false);

  // Figé au montage : l'âge — donc le bloc du responsable légal — ne doit pas
  // basculer pendant la saisie sous prétexte qu'il est minuit.
  const [now] = useState(() => new Date());

  const set = <K extends keyof StudentProfileData>(
    key: K,
    value: StudentProfileData[K]
  ) => setProfile((current) => ({ ...current, [key]: value }));

  const addInstrument = (item: { slug: string; name: string; family: string }) =>
    setProfile((current) =>
      current.instruments.some((i) => i.slug === item.slug)
        ? current
        : {
            ...current,
            instruments: [
              ...current.instruments,
              { ...item, level: null, yearsPracticed: null, ownsInstrument: false },
            ],
          }
    );

  const removeInstrument = (slug: string) =>
    setProfile((current) => ({
      ...current,
      instruments: current.instruments.filter((i) => i.slug !== slug),
    }));

  const updateInstrument = (slug: string, patch: Partial<StudentInstrumentRow>) =>
    setProfile((current) => ({
      ...current,
      instruments: current.instruments.map((i) =>
        i.slug === slug ? { ...i, ...patch } : i
      ),
    }));

  const toggleGenre = (genre: string) =>
    setProfile((current) => ({
      ...current,
      preferredGenres: current.preferredGenres.includes(genre)
        ? current.preferredGenres.filter((g) => g !== genre)
        : [...current.preferredGenres, genre],
    }));

  // La tessiture n'a de sens que pour un chanteur.
  const sings = profile.instruments.some((i) => i.family === "VOICE");

  // L'âge est calculé comme côté serveur (minuit UTC de la date civile). Sans
  // date de naissance, personne n'est présumé mineur.
  const birthDate = useMemo(
    () =>
      profile.birthDate
        ? new Date(`${profile.birthDate}T00:00:00.000Z`)
        : null,
    [profile.birthDate]
  );
  const age = birthDate ? ageOn(birthDate, now) : null;
  const minor = age !== null && age < MAJORITY_AGE;

  // Les manques sont recalculés à chaque frappe par la fonction du serveur :
  // l'écran ne peut pas diverger de ce que la route acceptera.
  const issues = useMemo(
    () =>
      checkStudentProfile(
        {
          birthDate,
          guardianName: profile.guardianName,
          guardianEmail: profile.guardianEmail,
          guardianPhone: profile.guardianPhone,
        },
        now
      ),
    [
      birthDate,
      profile.guardianName,
      profile.guardianEmail,
      profile.guardianPhone,
      now,
    ]
  );

  const available = catalogue.filter(
    (item) => !profile.instruments.some((i) => i.slug === item.slug)
  );

  const save = async () => {
    setError(null);

    // Le serveur remplacerait un niveau absent par « Débutant » ; on préfère
    // demander, en nommant l'instrument concerné.
    const unset = profile.instruments.find((i) => i.level === null);
    if (unset) {
      setError(localFailure(`${unset.name} : choisissez un niveau.`));
      return;
    }

    setIsSaving(true);

    try {
      const result = await postJson<StudentProfileData>("/api/student/profile", {
        method: "PATCH",
        body: JSON.stringify({
          birthDate: profile.birthDate || null,
          guardianName: profile.guardianName,
          guardianEmail: profile.guardianEmail || null,
          guardianPhone: profile.guardianPhone,
          goals: profile.goals,
          musicalBackground: profile.musicalBackground,
          readsSheetMusic: profile.readsSheetMusic,
          preferredGenres: profile.preferredGenres,
          voiceType: sings ? profile.voiceType : null,
          prefersOnline: profile.prefersOnline,
          city: profile.city,
          instruments: profile.instruments.map((i) => ({
            slug: i.slug,
            level: i.level,
            yearsPracticed: i.yearsPracticed,
            ownsInstrument: i.ownsInstrument,
          })),
        }),
      });

      if (!result.ok) {
        setError(result.failure);
        return;
      }

      setProfile(result.data);
      notifySuccess("Profil enregistré.");
    } finally {
      setIsSaving(false);
    }
  };

  const first = profile.instruments[0] ?? null;
  const preview = (
    <StudentProfilePreview
      name={identity.name}
      image={identity.image}
      age={age}
      city={profile.city}
      instrument={
        first
          ? {
              name: first.name,
              family: first.family as InstrumentFamily,
              level: first.level,
              yearsPracticed: first.yearsPracticed,
              ownsInstrument: first.ownsInstrument,
            }
          : null
      }
      readsSheetMusic={profile.readsSheetMusic}
      goals={profile.goals}
      blocked={issues.length > 0}
    />
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_340px] lg:gap-12">
      <div className="flex min-w-0 flex-col gap-10">
        {issues.length > 0 ? (
          <div className="rounded-[var(--radius-sm)] bg-warning-soft p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <AlertCircle className="h-4 w-4 text-warning" />
              Il reste à compléter
            </p>
            <ul className="space-y-1 text-sm text-muted">
              {issues.map((issue) => (
                <li key={issue.field}>{`— ${issue.message}`}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* ------------------------------------------- Ce que je pratique */}
        <section className="flex flex-col gap-4">
          <div>
            <SectionHeading>Ce que je pratique</SectionHeading>
            <p className="mt-2 text-sm text-muted">
              C&apos;est ce qui permet au prof de préparer un premier cours
              utile.
            </p>
          </div>

          {profile.instruments.length > 0 ? (
            <ul className="divide-y divide-border border-y border-border">
              {profile.instruments.map((entry) => (
                <li key={entry.slug} className="flex flex-col gap-3 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <InstrumentChip
                      name={entry.name}
                      family={entry.family as InstrumentFamily}
                      className="px-2.5 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeInstrument(entry.slug)}
                      aria-label={`Retirer ${entry.name}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-subtle transition-colors hover:bg-surface hover:text-danger"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <LevelChoice
                    slug={entry.slug}
                    name={entry.name}
                    value={entry.level}
                    onChange={(level) => updateInstrument(entry.slug, { level })}
                  />

                  <div className="flex flex-wrap items-end gap-4">
                    <div className="space-y-1">
                      <Label htmlFor={`years-${entry.slug}`}>
                        Années de pratique
                      </Label>
                      <Input
                        id={`years-${entry.slug}`}
                        type="number"
                        min={0}
                        max={80}
                        placeholder="0"
                        className="w-24"
                        value={entry.yearsPracticed ?? ""}
                        onChange={(e) =>
                          updateInstrument(entry.slug, {
                            yearsPracticed: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                      />
                    </div>

                    <label className="flex h-11 cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={entry.ownsInstrument}
                        onChange={(e) =>
                          updateInstrument(entry.slug, {
                            ownsInstrument: e.target.checked,
                          })
                        }
                        className="h-4 w-4 accent-primary"
                      />
                      J&apos;ai l&apos;instrument
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-subtle">
              Aucun instrument pour l&apos;instant. Ajoutez-en au moins un : sans
              lui, le prof ne sait pas ce que vous venez apprendre.
            </p>
          )}

          {/* Le catalogue ne s'étale pas : on demande à ajouter, puis on
              choisit. Un `<select>` natif reste navigable au clavier et se
              déroule correctement sur téléphone — un menu maison ne fait
              mieux ni l'un ni l'autre. */}
          {adding && available.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="add-instrument">Instrument</Label>
                <select
                  id="add-instrument"
                  autoFocus
                  defaultValue=""
                  onChange={(event) => {
                    const item = available.find(
                      (i) => i.slug === event.target.value
                    );
                    if (item) addInstrument(item);
                    setAdding(false);
                  }}
                  className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-elevated px-3 text-sm"
                >
                  <option value="" disabled>
                    Choisir un instrument…
                  </option>
                  {FAMILY_ORDER.filter((family) =>
                    available.some((i) => i.family === family)
                  ).map((family) => (
                    <optgroup key={family} label={FAMILY_LABELS[family]}>
                      {available
                        .filter((i) => i.family === family)
                        .map((item) => (
                          <option key={item.slug} value={item.slug}>
                            {item.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={() => setAdding(false)}
              >
                Annuler
              </Button>
            </div>
          ) : available.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-fit"
              onClick={() => setAdding(true)}
            >
              <Plus className="h-4 w-4" />
              Ajouter un instrument
            </Button>
          ) : null}

          {sings ? (
            <div className="space-y-1">
              <Label htmlFor="voiceType">Tessiture</Label>
              <select
                id="voiceType"
                value={profile.voiceType ?? "UNKNOWN"}
                onChange={(e) => set("voiceType", e.target.value)}
                className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-elevated px-3 text-sm sm:w-64"
              >
                {Object.entries(VOICE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <label className="flex h-11 w-fit cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={profile.readsSheetMusic}
              onChange={(e) => set("readsSheetMusic", e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Je lis le solfège
          </label>
        </section>

        {/* -------------------------------------------------- Mon projet */}
        <section className="flex flex-col gap-4">
          <SectionHeading>Mon projet</SectionHeading>

          <div className="space-y-1">
            <Label htmlFor="goals">Ce que je veux atteindre</Label>
            <Textarea
              id="goals"
              rows={3}
              value={profile.goals ?? ""}
              placeholder="Chanter en groupe, préparer le conservatoire, me faire plaisir…"
              onChange={(e) => set("goals", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="background">Mon parcours</Label>
            <Textarea
              id="background"
              rows={3}
              value={profile.musicalBackground ?? ""}
              placeholder="Cours suivis, groupes, chorale, autodidacte…"
              onChange={(e) => set("musicalBackground", e.target.value)}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Les genres qui me font venir
            </legend>
            <p className="text-sm text-muted">
              Facultatif. Un prof de guitare ne prépare pas le même premier cours
              pour du métal et pour de la bossa.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {PREFERRED_GENRES.map((genre) => {
                const selected = profile.preferredGenres.includes(genre);

                return (
                  <button
                    key={genre}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleGenre(genre)}
                    className={cn(
                      "flex h-11 items-center rounded-full border px-4 text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border text-muted hover:border-border-strong"
                    )}
                  >
                    {selected ? <Check className="mr-1.5 h-3.5 w-3.5" /> : null}
                    {genre}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </section>

        {/* --------------------------------------------------------- Moi */}
        <section className="flex flex-col gap-4">
          <SectionHeading>Moi</SectionHeading>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="city">Ville</Label>
              <Input
                id="city"
                value={profile.city ?? ""}
                onChange={(e) => set("city", e.target.value)}
              />
            </div>

            {/* La date de naissance vivait sous « Responsable légal » : un
                adulte se demandait pourquoi on la lui réclamait dans une
                section qui parle d'un tuteur. Elle ne sert qu'à savoir si ce
                tuteur est requis. */}
            <div className="space-y-1">
              <Label htmlFor="birthDate">Date de naissance</Label>
              <Input
                id="birthDate"
                type="date"
                value={profile.birthDate ?? ""}
                onChange={(e) => set("birthDate", e.target.value)}
              />
              <p className="text-xs text-subtle">
                Facultative. Sert uniquement à savoir si un responsable légal
                doit être joignable.
              </p>
            </div>
          </div>

          {/* Le bloc n'apparaît qu'à un mineur, et il se voit : c'est la seule
              chose du formulaire qui empêche une demande de partir. */}
          {minor ? (
            <div className="flex flex-col gap-4 rounded-[var(--radius-sm)] border border-warning bg-warning-soft p-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <AlertCircle className="h-4 w-4 text-warning" />
                  Responsable légal
                </p>
                <p className="mt-1 text-sm text-muted">
                  {`Vous avez ${age} ans : le prof doit pouvoir joindre un adulte. Un e-mail ou un téléphone suffit.`}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="guardianName">Nom</Label>
                  <Input
                    id="guardianName"
                    value={profile.guardianName ?? ""}
                    onChange={(e) => set("guardianName", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="guardianEmail">E-mail</Label>
                  <Input
                    id="guardianEmail"
                    type="email"
                    value={profile.guardianEmail ?? ""}
                    onChange={(e) => set("guardianEmail", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="guardianPhone">Téléphone</Label>
                  <Input
                    id="guardianPhone"
                    type="tel"
                    value={profile.guardianPhone ?? ""}
                    onChange={(e) => set("guardianPhone", e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : age === null ? (
            <p className="text-sm text-muted">
              Vous avez moins de 18 ans ? Indiquez votre date de naissance
              ci-dessus : le prof devra pouvoir joindre un adulte.
            </p>
          ) : null}
        </section>

        {/* Sous `lg`, l'aperçu se déplie ici, sous le formulaire. */}
        <div className="flex flex-col gap-4 lg:hidden">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-fit"
            aria-expanded={previewOpen}
            onClick={() => setPreviewOpen((open) => !open)}
          >
            {previewOpen ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {previewOpen ? "Masquer l'aperçu" : "Voir ce que voit le prof"}
          </Button>
          {previewOpen ? preview : null}
        </div>

        <FormFailure failure={error} onRetry={save} />

        {/* Même barre que la fiche prof : un bouton collant sans fond passe
            par-dessus le contenu qu'il survole et en masque les dernières
            lignes. */}
        <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="text-sm text-subtle">
              Les modifications ne sont enregistrées qu&apos;ici.
            </span>
            <Button size="lg" disabled={isSaving} onClick={save}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enregistrer
            </Button>
          </div>
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-8">{preview}</div>
      </aside>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-accent" />
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
        {children}
      </h2>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Niveau en contrôle segmenté plutôt qu'en liste déroulante.
 *
 * Quatre valeurs, toutes visibles : on compare avant de choisir, ce qu'un
 * `<select>` fermé interdit. Ce sont de vrais boutons radio masqués
 * visuellement — la navigation au clavier et l'annonce par un lecteur d'écran
 * viennent gratuitement, comme pour la note des avis.
 */
function LevelChoice({
  slug,
  name,
  value,
  onChange,
}: {
  slug: string;
  name: string;
  value: Level | null;
  onChange: (level: Level) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{`Niveau — ${name}`}</legend>
      <div
        className={cn(
          "grid grid-cols-2 overflow-hidden rounded-[var(--radius-sm)] border sm:grid-cols-4",
          value === null ? "border-warning" : "border-border"
        )}
      >
        {LEVELS.map((level) => {
          const selected = value === level;

          return (
            <label key={level} className="min-w-0">
              <input
                type="radio"
                name={`level-${slug}`}
                value={level}
                checked={selected}
                onChange={() => onChange(level)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex h-11 cursor-pointer items-center justify-center px-2 text-center text-xs font-medium transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2 peer-focus-visible:outline-primary",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-elevated text-muted hover:bg-surface"
                )}
              >
                {LEVEL_LABELS[level]}
              </span>
            </label>
          );
        })}
      </div>
      {value === null ? (
        <p className="mt-1 text-xs text-warning">Choisissez un niveau.</p>
      ) : null}
    </fieldset>
  );
}
