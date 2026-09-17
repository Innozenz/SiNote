"use client";

import { useState } from "react";
import { AlertCircle, Check, Eye, EyeOff, Loader2 } from "lucide-react";

import { AvatarUploader } from "@/components/avatar-uploader";
import { SectionTitle } from "@/components/editorial";
import { MaFicheHeader } from "@/components/ma-fiche-tabs";
import { FormFailure } from "@/components/form-failure";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { postJson, type Failure } from "@/lib/http/failure";
import { formatMinute, previewStarts } from "@/lib/teacher/slot-preview";
import { notifySuccess } from "@/lib/toast";
import { ageOn } from "@/lib/user/age";
import { WEEKDAY_LABELS } from "@/lib/teacher/weekly-grid";
import { cn } from "@/lib/utils";

type Instrument = { slug: string; name: string };

type PublishCheck = {
  ok: boolean;
  missing: { field: string; message: string }[];
};

export type TeacherProfileData = {
  slug: string;
  status: "DRAFT" | "PENDING" | "PUBLISHED" | "SUSPENDED";
  headline: string | null;
  bio: string | null;
  /** Date civile AAAA-MM-JJ, ou null. Sert au seul affichage de l'âge. */
  birthDate: string | null;
  showAge: boolean;
  city: string | null;
  teachesOnline: boolean;
  teachesInPerson: boolean;
  teachesAtHome: boolean;
  hourlyRateCents: number | null;
  trialLessonOffered: boolean;
  trialLessonMinutes: number | null;
  defaultDurationMin: number;
  slotGranularityMin: number;
  bufferMin: number;
  minNoticeHours: number;
  bookingHorizonDays: number;
  cancellationWindowHours: number;
  instruments: Instrument[];
  publishCheck: PublishCheck;
  subscriptionActive: boolean;
  /** Première ouverture de la semaine type, pour l'aperçu des départs. */
  firstOpening: {
    weekday: number;
    startMinute: number;
    endMinute: number;
  } | null;
};

export function TeacherProfileForm({
  initial,
  catalogue,
  initialImage,
}: {
  initial: TeacherProfileData;
  catalogue: Instrument[];
  initialImage: string | null;
}) {
  const [profile, setProfile] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<Failure | null>(null);

  const set = <K extends keyof TeacherProfileData>(
    key: K,
    value: TeacherProfileData[K]
  ) => setProfile((current) => ({ ...current, [key]: value }));

  const toggleInstrument = (instrument: Instrument) => {
    const has = profile.instruments.some((i) => i.slug === instrument.slug);
    set(
 "instruments",
      has
        ? profile.instruments.filter((i) => i.slug !== instrument.slug)
        : [...profile.instruments, instrument]
    );
  };

  const save = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const result = await postJson<TeacherProfileData>("/api/teacher/profile", {
        method: "PATCH",
        body: JSON.stringify({
          headline: profile.headline,
          bio: profile.bio,
          birthDate: profile.birthDate,
          showAge: profile.showAge,
          city: profile.city,
          teachesOnline: profile.teachesOnline,
          teachesInPerson: profile.teachesInPerson,
          teachesAtHome: profile.teachesAtHome,
          hourlyRateCents: profile.hourlyRateCents,
          trialLessonOffered: profile.trialLessonOffered,
          trialLessonMinutes: profile.trialLessonMinutes,
          defaultDurationMin: profile.defaultDurationMin,
          slotGranularityMin: profile.slotGranularityMin,
          bufferMin: profile.bufferMin,
          minNoticeHours: profile.minNoticeHours,
          bookingHorizonDays: profile.bookingHorizonDays,
          cancellationWindowHours: profile.cancellationWindowHours,
          instrumentSlugs: profile.instruments.map((i) => i.slug),
        }),
      });

      if (!result.ok) {
        setError(result.failure);
        return;
      }

      setProfile(result.data);
      notifySuccess("Fiche enregistrée.");
    } finally {
      setIsSaving(false);
    }
  };

  const togglePublish = async () => {
    setIsPublishing(true);
    setError(null);

    try {
      const result = await postJson<{ status: TeacherProfileData["status"] }>(
        "/api/teacher/profile/publish",
        {
          method: "POST",
          body: JSON.stringify({ publish: profile.status !== "PUBLISHED" }),
        }
      );

      if (!result.ok) {
        setError(result.failure);
        return;
      }

      set("status", result.data.status);
      notifySuccess(
        result.data.status === "PUBLISHED"
          ? "Fiche publiée."
          : "Fiche dépubliée."
      );
    } finally {
      setIsPublishing(false);
    }
  };

  const isPublished = profile.status === "PUBLISHED";
  const canPublish = profile.publishCheck.ok;

  // Aperçu de l'âge, calculé comme côté serveur (minuit UTC de la date civile).
  const today = new Date().toISOString().slice(0, 10);
  const age = profile.birthDate
    ? ageOn(new Date(`${profile.birthDate}T00:00:00.000Z`), new Date())
    : null;

  return (
    <div className="flex flex-col gap-10">
      {/* En-tête + état de publication */}
      <div className="flex flex-col gap-4">
        <MaFicheHeader
          active="fiche"
          meta={
            <div className="flex items-center gap-3 sm:justify-end">
              <Badge variant={isPublished ? "success" : "secondary"}>
                {isPublished ? "Publiée" : "Brouillon"}
              </Badge>
              <Button
                variant={isPublished ? "outline" : "success"}
                disabled={isPublishing || (!isPublished && !canPublish)}
                onClick={togglePublish}
              >
                {isPublishing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : isPublished ? (
                  <EyeOff className="mr-2 h-4 w-4" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                {isPublished ? "Dépublier" : "Publier ma fiche"}
              </Button>
            </div>
          }
        />

        {/* L'adresse publique suit les onglets plutôt que l'accroche : elle
            appartient à cet onglet-là, pas aux trois. Visible au premier coup
            d'œil quand la fiche est en ligne. */}
        <p className="text-sm text-muted">
          Adresse publique : <code>/profs/{profile.slug}</code>
          {isPublished ? (
            <>
              {" · "}
              <a
                href={`/profs/${profile.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Voir ma fiche publique →
              </a>
            </>
          ) : null}
        </p>

        {!canPublish || !profile.subscriptionActive ? (
          <div className="flex flex-col gap-3">
            {!canPublish ? (
              <div className="rounded-lg bg-warning-soft p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <AlertCircle className="h-4 w-4 text-warning" />
                  Il reste à compléter
                </p>
                <ul className="space-y-1 text-sm text-muted">
                  {profile.publishCheck.missing.map((item) => (
                    <li key={item.field}>— {item.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {!profile.subscriptionActive ? (
              <p className="text-sm text-muted">
                Votre fiche restera invisible des élèves tant que votre
                abonnement n&apos;est pas actif, même une fois publiée.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Photo de profil — appartient à l'utilisateur, s'enregistre seule. */}
      <section className="flex flex-col gap-5">
        <div>
          <SectionTitle>Photo de profil</SectionTitle>
          <p className="mt-2 text-sm text-muted">
            Un visage rassure : les fiches avec photo sont plus consultées.
          </p>
        </div>
        <AvatarUploader initialImage={initialImage} />
      </section>

      {/* Présentation */}
      <section className="flex flex-col gap-5">
        <div>
          <SectionTitle>Présentation</SectionTitle>
          <p className="mt-2 text-sm text-muted">
            Ce que voit l&apos;élève en premier.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <Label htmlFor="headline">Accroche</Label>
            <Input
              id="headline"
              value={profile.headline ?? ""}
              maxLength={120}
              placeholder="Prof de chant diplômée, 10 ans d'expérience"
              onChange={(e) => set("headline", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bio">Votre approche</Label>
            <Textarea
              id="bio"
              rows={6}
              value={profile.bio ?? ""}
              placeholder="Votre parcours, votre méthode, le public que vous accompagnez…"
              onChange={(e) => set("bio", e.target.value)}
            />
            <p className="text-xs text-muted">
              {(profile.bio ?? "").length} caractères — 80 minimum pour publier.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="birthDate">Date de naissance</Label>
            <Input
              id="birthDate"
              type="date"
              max={today}
              value={profile.birthDate ?? ""}
              onChange={(e) => set("birthDate", e.target.value || null)}
            />
            <p className="text-xs text-muted">
              Facultative. Elle ne sert qu&apos;à afficher votre âge, et
              seulement si vous cochez la case ci-dessous.
            </p>
          </div>

          {profile.birthDate ? (
            <div className="space-y-2">
              <Checkbox
                label="Afficher mon âge sur ma fiche publique"
                checked={profile.showAge}
                onChange={(v) => set("showAge", v)}
              />
              {age !== null ? (
                <p className="text-xs text-subtle">
                  {profile.showAge
                    ? `Votre fiche indiquera « ${age} ans ».`
                    : `Décoché, votre âge (${age} ans) n'apparaît nulle part.`}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* Instruments */}
      <section className="flex flex-col gap-5">
        <div>
          <SectionTitle>Instruments enseignés</SectionTitle>
          <p className="mt-2 text-sm text-muted">
            Ce sont eux qui décident dans quelles recherches vous apparaissez.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {catalogue.map((instrument) => {
            const selected = profile.instruments.some(
              (i) => i.slug === instrument.slug
            );

            return (
              <button
                key={instrument.slug}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleInstrument(instrument)}
                className={cn(
 "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  selected
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border text-muted hover:border-border-strong"
                )}
              >
                {selected ? <Check className="mr-1 inline h-3 w-3" /> : null}
                {instrument.name}
              </button>
            );
          })}
        </div>
      </section>

      {/* Modalités et tarif */}
      <section className="flex flex-col gap-5">
        <div>
          <SectionTitle>Cours et tarif</SectionTitle>
          <p className="mt-2 text-sm text-muted">
            Le règlement se fait directement entre vous et l&apos;élève : SiNote
            n&apos;encaisse rien.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Modalités</legend>
            <Checkbox
              label="En visio"
              checked={profile.teachesOnline}
              onChange={(v) => set("teachesOnline", v)}
            />
            <Checkbox
              label="Chez moi"
              checked={profile.teachesInPerson}
              onChange={(v) => set("teachesInPerson", v)}
            />
            <Checkbox
              label="Chez l'élève"
              checked={profile.teachesAtHome}
              onChange={(v) => set("teachesAtHome", v)}
            />
          </fieldset>

          {profile.teachesInPerson || profile.teachesAtHome ? (
            <div className="space-y-1">
              <Label htmlFor="city">Ville</Label>
              <Input
                id="city"
                value={profile.city ?? ""}
                placeholder="Lyon"
                onChange={(e) => set("city", e.target.value)}
              />
            </div>
          ) : null}

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Le tarif est le seul champ qui peut rester vide — une fiche sans
                tarif est un brouillon légitime — et il est saisi en euros
                quand la base stocke des centimes. D'où son traitement à part. */}
            <div className="space-y-1">
              <Label htmlFor="rate">Tarif horaire (€)</Label>
              <Input
                id="rate"
                type="number"
                min={0}
                value={
                  profile.hourlyRateCents === null
                    ? ""
                    : String(profile.hourlyRateCents / 100)
                }
                onChange={(e) =>
                  set(
                    "hourlyRateCents",
                    e.target.value === ""
                      ? null
                      : Math.round(Number(e.target.value) * 100)
                  )
                }
              />
            </div>
            <NumberField
              id="duration"
              label="Durée d'un cours (min)"
              min={15}
              max={480}
              value={profile.defaultDurationMin}
              onChange={(v) => set("defaultDurationMin", v)}
            />
          </div>

          <Checkbox
            label="Je propose un cours d'essai"
            checked={profile.trialLessonOffered}
            onChange={(v) => set("trialLessonOffered", v)}
          />
          {profile.trialLessonOffered ? (
            <NumberField
              id="trial"
              label="Durée du cours d'essai (min)"
              min={10}
              max={120}
              value={profile.trialLessonMinutes ?? 30}
              onChange={(v) => set("trialLessonMinutes", v)}
            />
          ) : null}
        </div>
      </section>

      {/* Règles de réservation */}
      <section className="flex flex-col gap-5">
        <div>
          <SectionTitle>Règles de réservation</SectionTitle>
          <p className="mt-2 text-sm text-muted">
            Elles filtrent les créneaux proposés aux élèves.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              id="buffer"
              label="Battement entre deux cours (min)"
              min={0}
              max={120}
              value={profile.bufferMin}
              onChange={(v) => set("bufferMin", v)}
            />
            <NumberField
              id="granularity"
              label="Départs de cours toutes les (min)"
              min={5}
              max={240}
              value={profile.slotGranularityMin}
              onChange={(v) => set("slotGranularityMin", v)}
              hint="Indépendant de la durée du cours : c'est la fréquence à laquelle un cours peut commencer."
            />
            <NumberField
              id="notice"
              label="Préavis minimum (h)"
              min={0}
              max={720}
              value={profile.minNoticeHours}
              onChange={(v) => set("minNoticeHours", v)}
            />
            <NumberField
              id="horizon"
              label="Réservable jusqu'à (jours)"
              min={1}
              max={365}
              value={profile.bookingHorizonDays}
              onChange={(v) => set("bookingHorizonDays", v)}
            />
            <NumberField
              id="cancel"
              label="Préavis d'annulation (h)"
              min={0}
              max={720}
              value={profile.cancellationWindowHours}
              onChange={(v) => set("cancellationWindowHours", v)}
            />
          </div>

          <SlotPreviewNotice
            opening={profile.firstOpening}
            durationMin={profile.defaultDurationMin}
            stepMin={profile.slotGranularityMin}
          />
        </div>
      </section>

      <FormFailure failure={error} onRetry={save} />

      {/* Barre d'enregistrement collante. Le bouton flottait seul, sans fond :
          il passait par-dessus la liste d'instruments et masquait les
          dernières lignes. Une barre pleine bordée en haut sépare franchement
          l'action du contenu qu'elle survole. */}
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

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border accent-primary"
      />
      {label}
    </label>
  );
}

/**
 * Champ numérique borné.
 *
 * Les bornes sont posées sur l'`input` **et** écrites sous le champ : le
 * navigateur décourage la valeur absurde, et le prof sait ce qui est admis
 * avant d'essayer.
 *
 * `onChange` rend le nombre saisi tel quel, sans repli silencieux. La version
 * précédente faisait `Number(v) || 30` : taper `0` — qui est falsy — devenait
 * 30 sans un mot, et le prof voyait sa valeur changer toute seule après
 * enregistrement. Mieux vaut transmettre 0 et laisser le serveur répondre
 * « 5 au minimum ».
 */
function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Précision affichée sous le champ, quand l'intitulé ne suffit pas. */
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={String(value)}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          onChange(Number.isFinite(parsed) ? parsed : min);
        }}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-xs text-subtle">
        {hint ? `${hint} ` : ""}
        {`Entre ${min} et ${max}.`}
      </p>
    </div>
  );
}

/**
 * Aperçu des départs de cours.
 *
 * Un pas de 33 minutes est accepté et produit 9:00, 9:33, 10:06… Personne ne
 * peut le deviner en tapant un nombre : montrer le résultat vaut mieux que
 * fermer la saisie à une liste, qui exclurait au passage des pas légitimes
 * comme 20 ou 45.
 *
 * Se met à jour à la frappe, avant enregistrement — c'est tout l'intérêt.
 */
function SlotPreviewNotice({
  opening,
  durationMin,
  stepMin,
}: {
  opening: { weekday: number; startMinute: number; endMinute: number } | null;
  durationMin: number;
  stepMin: number;
}) {
  const preview = previewStarts({ opening, durationMin, stepMin });

  if (preview.kind === "no_opening") {
    return (
      <p className="rounded-md bg-surface px-3 py-2 text-sm text-muted">
        Définissez une plage dans <strong>Disponibilités</strong> pour voir les
        départs que ces règles produiront.
      </p>
    );
  }

  const day = opening ? WEEKDAY_LABELS[opening.weekday] : "";
  const range = opening
    ? `${formatMinute(opening.startMinute)}–${formatMinute(opening.endMinute)}`
    : "";

  if (preview.kind === "too_short") {
    return (
      <p className="rounded-md bg-warning-soft px-3 py-2 text-sm">
        {`Aucun cours ne tient dans votre plage du ${day.toLowerCase()} (${range}) : elle dure ${preview.openingMinutes} min et un cours en dure ${durationMin}. Aucun créneau ne sera proposé.`}
      </p>
    );
  }

  return (
    <div className="rounded-md bg-surface px-3 py-2 text-sm">
      <p className="text-muted">
        {`Sur votre plage du ${day.toLowerCase()} (${range}), les élèves verront :`}
      </p>
      <p className="mt-1 font-medium">
        {preview.starts.join("  ·  ")}
        {preview.total > preview.starts.length
          ? `  …  (${preview.total} départs)`
          : ""}
      </p>
    </div>
  );
}
