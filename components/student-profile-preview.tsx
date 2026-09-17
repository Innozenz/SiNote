"use client";

import type { InstrumentFamily } from "@prisma/client";
import { AlertCircle } from "lucide-react";

import { InstrumentChip } from "@/components/instrument-chip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * « Ce que voit le prof » — l'aperçu de la demande, à côté du formulaire.
 *
 * Un profil élève n'est pas une fiche qu'on consulte : c'est ce qui est envoyé
 * avec une demande de cours, et ce que le prof lit pour décider. Remplir les
 * champs sans voir le résultat revenait à écrire une lettre sans la relire —
 * d'où cet aperçu, alimenté par l'état du formulaire **en direct**, avant tout
 * enregistrement.
 *
 * Il ne montre que ce que le prof voit réellement de sa boîte de demandes : le
 * niveau de l'instrument *demandé* (et non les six lignes du catalogue), les
 * objectifs, et le contact du responsable si l'élève est mineur. La note sous la
 * carte le dit, sinon l'aperçu se lirait comme « voici tout mon profil ».
 *
 * Purement présentationnel : aucune règle n'est évaluée ici. Le blocage de la
 * demande vient de `checkStudentProfile`, calculé par le formulaire et passé en
 * `blocked` — une seule implémentation, comme côté serveur.
 */

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Débutant",
  INTERMEDIATE: "Intermédiaire",
  ADVANCED: "Avancé",
  PROFESSIONAL: "Professionnel",
};

export type PreviewInstrument = {
  name: string;
  family: InstrumentFamily;
  level: string | null;
  yearsPracticed: number | null;
  ownsInstrument: boolean;
};

export function StudentProfilePreview({
  name,
  image,
  age,
  city,
  instrument,
  readsSheetMusic,
  goals,
  blocked,
}: {
  name: string | null;
  image: string | null;
  age: number | null;
  city: string | null;
  /** Instrument mis en avant : le premier de la liste, faute de demande réelle. */
  instrument: PreviewInstrument | null;
  readsSheetMusic: boolean;
  goals: string | null;
  /** `checkStudentProfile` bloque la demande (mineur sans responsable joignable). */
  blocked: boolean;
}) {
  const displayName = name?.trim() || "Votre nom";
  const identity = [
    age !== null ? `${age} ans` : null,
    city?.trim() || null,
  ].filter(Boolean);

  const level = instrument?.level ? LEVEL_LABELS[instrument.level] : null;
  const levelLine = instrument
    ? [
        level ?? "Niveau à choisir",
        instrument.yearsPracticed !== null
          ? `${instrument.yearsPracticed} ${instrument.yearsPracticed === 1 ? "an" : "ans"}`
          : null,
      ]
        .filter(Boolean)
        .join(", ")
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-4 rounded-[var(--radius)] border border-border bg-elevated p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
          Ce que voit le prof
        </p>

        <div className="flex items-center gap-3">
          <Avatar className="h-11 w-11 shrink-0 border border-border">
            <AvatarImage src={image || undefined} alt={displayName} />
            <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{displayName}</p>
            <p className="truncate text-sm text-muted">
              {identity.length > 0 ? identity.join(" · ") : "—"}
            </p>
          </div>
        </div>

        <dl className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
          <Line label="Demande">
            {instrument ? (
              <InstrumentChip
                name={instrument.name}
                family={instrument.family}
              />
            ) : (
              <span className="text-subtle">Aucun instrument</span>
            )}
          </Line>

          <Line label="Niveau">
            {levelLine ?? <span className="text-subtle">—</span>}
          </Line>

          <Line label="Instrument">
            {instrument ? (instrument.ownsInstrument ? "Oui" : "Non") : "—"}
          </Line>

          <Line label="Solfège">{readsSheetMusic ? "Oui" : "Non"}</Line>
        </dl>

        {goals?.trim() ? (
          <blockquote className="rounded-[var(--radius-sm)] bg-surface p-3 text-sm italic text-muted">
            {`« ${goals.trim()} »`}
          </blockquote>
        ) : null}

        {blocked ? (
          <p className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-warning-soft p-3 text-sm text-warning">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Responsable légal : non renseigné — la demande ne pourra pas être
              envoyée.
            </span>
          </p>
        ) : null}
      </div>

      <p className="text-xs text-subtle">
        Le prof ne voit que le niveau de l&apos;instrument demandé, vos objectifs
        et, si vous êtes mineur, le contact de votre responsable. Le reste de
        votre profil ne lui est montré que s&apos;il ouvre « Voir le profil ».
      </p>
    </div>
  );
}

function Line({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-foreground">
        {children}
      </dd>
    </div>
  );
}
