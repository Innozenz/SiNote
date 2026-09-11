"use client";

import { useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";

import { SectionTitle } from "@/components/editorial";
import { FormFailure } from "@/components/form-failure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { localFailure, postJson, type Failure } from "@/lib/http/failure";
import { notifySuccess } from "@/lib/toast";
import { ageOn } from "@/lib/user/age";
import { cn } from "@/lib/utils";

type Level = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "PROFESSIONAL";

/** Même seuil que `lib/student/profile.ts` : la règle serveur reste la vérité. */
const MAJORITY_AGE = 18;

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

export function StudentProfileForm({
  initial,
  catalogue,
}: {
  initial: StudentProfileData;
  catalogue: { slug: string; name: string; family: string }[];
}) {
  const [profile, setProfile] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Failure | null>(null);

  const set = <K extends keyof StudentProfileData>(
    key: K,
    value: StudentProfileData[K]
  ) => setProfile((current) => ({ ...current, [key]: value }));

  const toggleInstrument = (item: { slug: string; name: string; family: string }) => {
    const has = profile.instruments.some((i) => i.slug === item.slug);

    set(
 "instruments",
      has
        ? profile.instruments.filter((i) => i.slug !== item.slug)
        : [
            ...profile.instruments,
            {
              ...item,
              level: null,
              yearsPracticed: null,
              ownsInstrument: false,
            },
          ]
    );
  };

  const updateInstrument = (
    slug: string,
    patch: Partial<StudentInstrumentRow>
  ) =>
    set(
 "instruments",
      profile.instruments.map((i) => (i.slug === slug ? { ...i, ...patch } : i))
    );

  // La tessiture n'a de sens que pour un chanteur.
  const sings = profile.instruments.some((i) => i.family === "VOICE");

  // L'âge est calculé comme côté serveur (minuit UTC de la date civile). Sans
  // date de naissance, personne n'est présumé mineur : le bloc du responsable
  // légal n'apparaît que lorsqu'il est réellement requis.
  const age = profile.birthDate
    ? ageOn(new Date(`${profile.birthDate}T00:00:00.000Z`), new Date())
    : null;
  const minor = age !== null && age < MAJORITY_AGE;

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

  return (
    <div className="flex flex-col gap-6">
      {profile.issues.length > 0 ? (
        <div className="rounded-lg bg-warning-soft p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium">
            <AlertCircle className="h-4 w-4 text-warning" />
            Il reste à compléter
          </p>
          <ul className="space-y-1 text-sm text-muted">
            {profile.issues.map((issue) => (
              <li key={issue.field}>— {issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="flex flex-col gap-5">
        <div>
          <SectionTitle>Ce que je pratique</SectionTitle>
          <p className="mt-2 text-sm text-muted">
            C&apos;est ce qui permet au prof de préparer un premier cours utile.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {catalogue.map((item) => {
              const selected = profile.instruments.some(
                (i) => i.slug === item.slug
              );

              return (
                <button
                  key={item.slug}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleInstrument(item)}
                  className={cn(
 "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    selected
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border text-muted hover:border-border-strong"
                  )}
                >
                  {selected ? <Check className="mr-1 inline h-3 w-3" /> : null}
                  {item.name}
                </button>
              );
            })}
          </div>

          {profile.instruments.map((entry) => (
            <div
              key={entry.slug}
              className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3"
            >
              <p className="w-full font-medium sm:w-auto sm:flex-1">
                {entry.name}
              </p>

              <div className="space-y-1">
                <Label htmlFor={`level-${entry.slug}`}>Niveau</Label>
                <select
                  id={`level-${entry.slug}`}
                  value={entry.level ?? ""}
                  aria-invalid={entry.level === null}
                  onChange={(e) =>
                    updateInstrument(entry.slug, {
                      level: (e.target.value || null) as Level | null,
                    })
                  }
                  className={cn(
                    "h-10 rounded-md border bg-white px-3 text-sm",
                    entry.level === null ? "border-warning" : "border-border"
                  )}
                >
                  <option value="">Choisir un niveau</option>
                  {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`years-${entry.slug}`}>Années de pratique</Label>
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

              <label className="flex h-10 cursor-pointer items-center gap-2 text-sm">
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
          ))}

          {sings ? (
            <div className="space-y-1">
              <Label htmlFor="voiceType">Tessiture</Label>
              <select
                id="voiceType"
                value={profile.voiceType ?? "UNKNOWN"}
                onChange={(e) => set("voiceType", e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm sm:w-64"
              >
                {Object.entries(VOICE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={profile.readsSheetMusic}
              onChange={(e) => set("readsSheetMusic", e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Je lis le solfège
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <SectionTitle>Mon projet</SectionTitle>
        <div className="flex flex-col gap-4">
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
        </div>
      </section>

      {/* Le bloc du responsable légal n'apparaît qu'à un mineur ; à défaut de
          date de naissance, une phrase dit pourquoi on la demande. Le serveur
          garde la règle (`checkStudentProfile`), l'écran ne fait que ne pas
          montrer trois champs à un adulte. */}
      {minor ? (
      <section className="flex flex-col gap-5">
        <div>
          <SectionTitle>Responsable légal</SectionTitle>
          <p className="mt-2 text-sm text-muted">
            Vous avez {age} ans : le prof doit pouvoir joindre un adulte. Un
            e-mail ou un téléphone suffit.
          </p>
        </div>
        <div className="flex flex-col gap-4">
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
      </section>
      ) : age === null ? (
        <p className="text-sm text-muted">
          Vous avez moins de 18 ans ? Indiquez votre date de naissance
          ci-dessus : le prof devra pouvoir joindre un adulte.
        </p>
      ) : null}

      <FormFailure failure={error} onRetry={save} />

      {/* Même barre que la fiche prof : un bouton collant sans fond passe
          par-dessus le contenu qu'il survole et en masque les dernières
          lignes. */}
      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-end gap-3">
          <span className="text-sm text-subtle">
            Les modifications ne sont enregistrées qu&apos;ici.
          </span>
          <Button size="lg" disabled={isSaving} onClick={save}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}
