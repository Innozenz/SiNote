"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, ShieldAlert, Trash2 } from "lucide-react";

import { SectionTitle } from "@/components/editorial";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { postJson } from "@/lib/http/failure";
import { notifyFailure, notifySuccess } from "@/lib/toast";

export type AdminRole = "TEACHER" | "STUDENT" | null;

/** Type d'accès d'une fiche prof, pour distinguer comp manuel et vrai Stripe. */
export type AccessKind = "stripe" | "manual" | "none";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: AdminRole;
  /** Capacité admin, orthogonale au rôle : affichée comme un badge à part. */
  isAdmin: boolean;
  createdAt: string;
  timezone: string;
  teacher: {
    status: "DRAFT" | "PUBLISHED";
    slug: string;
    city: string | null;
    headline: string | null;
    priceId: string | null;
    /** Instant ISO ; null si aucun accès. */
    currentPeriodEnd: string | null;
    active: boolean;
    kind: AccessKind;
    counts: { bookings: number; reviews: number; instruments: number };
  } | null;
  student: {
    city: string | null;
    age: number | null;
    isMinor: boolean;
    guardianName: string | null;
    guardianEmail: string | null;
    guardianPhone: string | null;
    goals: string | null;
    musicalBackground: string | null;
    prefersOnline: boolean;
    counts: { bookings: number };
  } | null;
};

const ROLE_BADGE: Record<
  "TEACHER" | "STUDENT",
  { label: string; variant: "default" | "secondary" }
> = {
  TEACHER: { label: "Professeur", variant: "default" },
  STUDENT: { label: "Élève", variant: "secondary" },
};

function formatDate(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString("fr-FR", opts);
}

/** Date civile AAAA-MM-JJ d'un instant ISO (fuseau local du navigateur). */
function toDateInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** AAAA-MM-JJ dans un mois, pour proposer une valeur par défaut. */
function inOneMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * Liste des utilisateurs (administration).
 *
 * Îlot client d'une page serveur : la recherche et le filtre de rôle vivent
 * dans l'URL (`ListFilters`, côté serveur) ; ici on ne fait qu'afficher les
 * lignes reçues et ouvrir le détail. Tout est en lecture sauf **l'accès d'un
 * prof** — offrir / prolonger / révoquer une date, jamais un appel Stripe — et
 * la **suppression du compte**, refusée pour un administrateur.
 */
export function AdminUsers({ rows }: { rows: AdminUserRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId]
  );

  return (
    <>
      <ul className="divide-y divide-border border-y border-border">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => setSelectedId(row.id)}
              className="group -mx-3 flex w-full items-center justify-between gap-4 rounded-lg px-3 py-4 text-left transition-colors hover:bg-surface"
            >
              <span className="flex min-w-0 items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  {row.image ? <AvatarImage src={row.image} alt="" /> : null}
                  <AvatarFallback>{initials(row.name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {row.name}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {row.email}
                  </span>
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-2">
                {row.isAdmin ? <Badge variant="accent">Admin</Badge> : null}
                <RoleBadge role={row.role} />
                {row.teacher ? <AccessBadge teacher={row.teacher} /> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {selected ? (
            <UserDetail row={selected} onDeleted={() => setSelectedId(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RoleBadge({ role }: { role: AdminRole }) {
  if (role === null) {
    return <Badge variant="warning">Onboarding incomplet</Badge>;
  }
  const { label, variant } = ROLE_BADGE[role];
  return <Badge variant={variant}>{label}</Badge>;
}

function AccessBadge({ teacher }: { teacher: NonNullable<AdminUserRow["teacher"]> }) {
  if (teacher.active) {
    return <Badge variant="success">Abonné</Badge>;
  }
  if (teacher.kind === "none") {
    return <Badge variant="secondary">Pas d&apos;abonnement</Badge>;
  }
  return <Badge variant="destructive">Expiré</Badge>;
}

function UserDetail({
  row,
  onDeleted,
}: {
  row: AdminUserRow;
  onDeleted: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          {row.name}
          {row.isAdmin ? <Badge variant="accent">Admin</Badge> : null}
          <RoleBadge role={row.role} />
        </DialogTitle>
        <DialogDescription>{row.email}</DialogDescription>
      </DialogHeader>

      <section className="flex flex-col gap-3">
        <SectionTitle>Compte</SectionTitle>
        <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
          <Field label="E-mail vérifié">{row.emailVerified ? "Oui" : "Non"}</Field>
          <Field label="Fuseau">{row.timezone}</Field>
          <Field label="Inscrit le">
            {formatDate(row.createdAt, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </Field>
          <Field label="Identifiant">
            <span className="font-mono text-xs text-muted">{row.id}</span>
          </Field>
        </dl>
      </section>

      {row.teacher ? <TeacherSection userId={row.id} teacher={row.teacher} /> : null}
      {row.student ? <StudentSection student={row.student} /> : null}

      <DangerZone row={row} onDeleted={onDeleted} />
    </div>
  );
}

/**
 * Suppression du compte.
 *
 * Absente pour un administrateur : la capacité s'accorde et se retire à la
 * main en base, et l'API refuse de toute façon (409). Le dialogue nomme ce qui
 * part avec le compte, chiffres à l'appui, parce que la cascade emporte aussi
 * l'historique de l'autre partie de chaque cours.
 */
function DangerZone({
  row,
  onDeleted,
}: {
  row: AdminUserRow;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (row.isAdmin) {
    return (
      <section className="flex flex-col gap-3">
        <SectionTitle>Suppression</SectionTitle>
        <p className="text-sm text-muted">
          Un administrateur ne peut pas être supprimé depuis cette interface.
        </p>
      </section>
    );
  }

  const bookings =
    (row.teacher?.counts.bookings ?? 0) + (row.student?.counts.bookings ?? 0);
  const reviews = row.teacher?.counts.reviews ?? 0;

  const remove = async () => {
    setBusy(true);
    try {
      const result = await postJson(`/api/admin/users/${row.id}`, {
        method: "DELETE",
      });
      if (!result.ok) {
        notifyFailure(result.failure);
        return;
      }
      setOpen(false);
      onDeleted();
      notifySuccess("Compte supprimé.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>Suppression</SectionTitle>
      <p className="text-sm text-muted">
        Supprime le compte et tout ce qui s&apos;y rattache. Irréversible.
      </p>
      <div>
        <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Supprimer ce compte
        </Button>
      </div>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Supprimer le compte de ${row.name} ?`}
        description={`${row.email} ne pourra plus se connecter et son compte disparaît définitivement.`}
        confirmLabel="Supprimer définitivement"
        destructive
        busy={busy}
        onConfirm={remove}
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {row.teacher ? (
            <li>
              Sa fiche prof, ses disponibilités
              {row.teacher.kind === "stripe"
                ? " et son abonnement Stripe (résilié immédiatement)"
                : ""}
              .
            </li>
          ) : null}
          <li>
            {bookings} cours, y compris dans l&apos;historique des{" "}
            {row.teacher ? "élèves" : "profs"} concernés.
          </li>
          {reviews > 0 ? <li>{reviews} avis reçus.</li> : null}
          <li>Ses avis donnés, ses messages, ses comptes rendus et leurs pièces jointes.</li>
        </ul>
      </ConfirmDialog>
    </section>
  );
}

function TeacherSection({
  userId,
  teacher,
}: {
  userId: string;
  teacher: NonNullable<AdminUserRow["teacher"]>;
}) {
  return (
    <>
      <section className="flex flex-col gap-3">
        <SectionTitle>Profil professeur</SectionTitle>
        <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
          <Field label="Statut">
            <Badge variant={teacher.status === "PUBLISHED" ? "success" : "secondary"}>
              {teacher.status === "PUBLISHED" ? "Publié" : "Brouillon"}
            </Badge>
          </Field>
          <Field label="Fiche">
            {teacher.status === "PUBLISHED" ? (
              <Link
                href={`/profs/${teacher.slug}`}
                target="_blank"
                className="text-primary hover:underline"
              >
                /profs/{teacher.slug}
              </Link>
            ) : (
              <span className="text-muted">/profs/{teacher.slug}</span>
            )}
          </Field>
          {teacher.headline ? (
            <Field label="Accroche">{teacher.headline}</Field>
          ) : null}
          {teacher.city ? <Field label="Ville">{teacher.city}</Field> : null}
          <Field label="Activité">
            {teacher.counts.bookings} cours · {teacher.counts.reviews} avis ·{" "}
            {teacher.counts.instruments} instrument
            {teacher.counts.instruments > 1 ? "s" : ""}
          </Field>
        </dl>
      </section>

      <AccessManager userId={userId} teacher={teacher} />
    </>
  );
}

/**
 * Gestion de l'accès d'un prof : offrir / prolonger / révoquer une date de fin.
 * Aucun appel Stripe — on n'écrit que `stripeCurrentPeriodEnd` via l'API admin.
 */
function AccessManager({
  userId,
  teacher,
}: {
  userId: string;
  teacher: NonNullable<AdminUserRow["teacher"]>;
}) {
  const router = useRouter();
  const [until, setUntil] = useState(() =>
    teacher.currentPeriodEnd ? toDateInput(teacher.currentPeriodEnd) : inOneMonth()
  );
  const [busy, setBusy] = useState(false);

  // La ligne sélectionnée change quand `rows` se rafraîchit : on resynchronise
  // le champ sur la nouvelle date de fin.
  useEffect(() => {
    setUntil(
      teacher.currentPeriodEnd ? toDateInput(teacher.currentPeriodEnd) : inOneMonth()
    );
  }, [teacher.currentPeriodEnd]);

  const act = async (body: { action: "grant" | "revoke"; until?: string }) => {
    setBusy(true);
    try {
      const result = await postJson(`/api/admin/users/${userId}/subscription`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!result.ok) {
        notifyFailure(result.failure);
        return;
      }
      notifySuccess(
        body.action === "grant" ? "Accès accordé." : "Accès révoqué."
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const hasAccess = teacher.currentPeriodEnd !== null;

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>Abonnement</SectionTitle>

      <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
        <Field label="État">
          {teacher.active ? (
            <span className="text-success">Actif</span>
          ) : hasAccess ? (
            <span className="text-danger">Expiré</span>
          ) : (
            <span className="text-muted">Aucun accès</span>
          )}
        </Field>
        {teacher.currentPeriodEnd ? (
          <Field label="Fin d'accès">
            {formatDate(teacher.currentPeriodEnd, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </Field>
        ) : null}
        <Field label="Type">
          {teacher.kind === "stripe"
            ? "Abonnement Stripe"
            : teacher.kind === "manual"
              ? "Accès manuel (offert)"
              : "—"}
        </Field>
        {teacher.priceId ? (
          <Field label="Offre">
            <span className="font-mono text-xs text-muted">{teacher.priceId}</span>
          </Field>
        ) : null}
      </dl>

      {/* Avertissements : ce que la date ne fait pas toute seule. */}
      {teacher.status !== "PUBLISHED" ? (
        <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-xs text-warning">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          La fiche est en brouillon : un accès accordé ne la rendra visible
          qu&apos;une fois publiée par le prof.
        </p>
      ) : null}
      {teacher.kind === "stripe" ? (
        <p className="flex items-start gap-2 rounded-md bg-surface-strong p-3 text-xs text-muted">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Ce prof a un abonnement Stripe actif : un changement manuel sera
          réécrit au prochain événement Stripe.
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Accès jusqu&apos;au
          <Input
            type="date"
            value={until}
            disabled={busy}
            onChange={(e) => setUntil(e.target.value)}
            className="w-auto"
          />
        </label>
        <Button
          size="sm"
          disabled={busy || !until}
          onClick={() => act({ action: "grant", until })}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CalendarClock className="mr-2 h-4 w-4" />
          )}
          {hasAccess ? "Prolonger / modifier" : "Accorder un accès"}
        </Button>
        {hasAccess ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => act({ action: "revoke" })}
          >
            Révoquer
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function StudentSection({
  student,
}: {
  student: NonNullable<AdminUserRow["student"]>;
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>Profil élève</SectionTitle>
      <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
        {student.age !== null ? (
          <Field label="Âge">
            {student.age} ans{student.isMinor ? " · mineur" : ""}
          </Field>
        ) : null}
        {student.city ? <Field label="Ville">{student.city}</Field> : null}
        <Field label="Cours en ligne">
          {student.prefersOnline ? "Préféré" : "Non"}
        </Field>
        {student.goals ? <Field label="Objectifs">{student.goals}</Field> : null}
        {student.musicalBackground ? (
          <Field label="Parcours">{student.musicalBackground}</Field>
        ) : null}
        {student.isMinor ? (
          <Field label="Responsable légal">
            {student.guardianName ?? "—"}
            {student.guardianEmail ? ` · ${student.guardianEmail}` : ""}
            {student.guardianPhone ? ` · ${student.guardianPhone}` : ""}
          </Field>
        ) : null}
        <Field label="Activité">{student.counts.bookings} cours</Field>
      </dl>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
