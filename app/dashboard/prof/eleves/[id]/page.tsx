import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, FileText } from "lucide-react";

import { PageTitle } from "@/components/editorial";
import { FicheTabs } from "@/components/fiche-tabs";
import { ListFilters } from "@/components/list-filters";
import { MarkReportsSeen } from "@/components/mark-reports-seen";
import { MarkThreadRead } from "@/components/mark-thread-read";
import { MessageThread } from "@/components/message-thread";
import { ReportEditor } from "@/components/report-editor";
import { StudentNoteEditor } from "@/components/student-note-editor";
import {
  StudentProfileBody,
  type StudentProfileView,
} from "@/components/student-profile-detail";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { lessonTitle } from "@/lib/bookings/title";
import prisma from "@/lib/prisma";
import { reportPlainText, sanitizeReportHtml } from "@/lib/reports/sanitize";
import { isMinor } from "@/lib/student/profile";
import { ageOn } from "@/lib/user/age";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  CONFIRMED: "Confirmé",
  CANCELLED: "Annulé",
  COMPLETED: "Terminé",
  NO_SHOW: "Non honoré",
  DECLINED: "Refusé",
};

/**
 * Fiche d'un élève, vue par le prof.
 *
 * Agrège tout ce que le prof sait de cet élève, organisé en onglets (profil,
 * historique, comptes rendus, messages, note privée). L'onglet actif vit dans
 * l'URL. Accessible seulement si le prof a au moins un cours avec lui — sinon
 * 404, comme partout.
 */
export default async function StudentFilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    onglet?: string;
    cr_q?: string;
    cr_instrument?: string;
    cr_from?: string;
    cr_to?: string;
  }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/");

  const teacher = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, user: { select: { timezone: true } } },
  });

  if (!teacher) redirect("/dashboard");

  const { id } = await params;

  const student = await prisma.studentProfile.findFirst({
    where: { id, bookings: { some: { teacherId: teacher.id } } },
    select: {
      id: true,
      birthDate: true,
      city: true,
      goals: true,
      musicalBackground: true,
      readsSheetMusic: true,
      voiceType: true,
      prefersOnline: true,
      preferredGenres: true,
      guardianName: true,
      guardianEmail: true,
      guardianPhone: true,
      user: { select: { name: true, image: true } },
      instruments: {
        select: {
          level: true,
          yearsPracticed: true,
          ownsInstrument: true,
          instrument: { select: { name: true } },
        },
      },
      bookings: {
        where: { teacherId: teacher.id },
        orderBy: { startsAt: "desc" },
        select: {
          id: true,
          startsAt: true,
          status: true,
          isTrial: true,
          instrument: { select: { name: true } },
          report: {
            select: {
              title: true,
              content: true,
              attachments: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  filename: true,
                  contentType: true,
                  kind: true,
                  sizeBytes: true,
                },
              },
              comments: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  sender: true,
                  content: true,
                  createdAt: true,
                  attachments: {
                    select: {
                      id: true,
                      filename: true,
                      contentType: true,
                      kind: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      teacherNotes: {
        where: { teacherId: teacher.id },
        select: { content: true },
        take: 1,
      },
      // Fil général du couple (messages hors compte rendu).
      messages: {
        where: { teacherId: teacher.id, reportId: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          sender: true,
          content: true,
          createdAt: true,
          attachments: {
            select: { id: true, filename: true, contentType: true, kind: true },
          },
        },
      },
    },
  });

  // Inexistant, ou sans aucun cours avec ce prof : indiscernables, et c'est voulu.
  if (!student) notFound();

  const now = new Date();
  const name = student.user.name ?? "Élève";
  const age = student.birthDate ? ageOn(student.birthDate, now) : null;

  const profileView: StudentProfileView = {
    age,
    isMinor: isMinor(student.birthDate, now),
    city: student.city,
    goals: student.goals,
    background: student.musicalBackground,
    readsSheetMusic: student.readsSheetMusic,
    voiceType: student.voiceType,
    prefersOnline: student.prefersOnline,
    genres: student.preferredGenres,
    instruments: student.instruments.map((e) => ({
      name: e.instrument.name,
      level: e.level,
      yearsPracticed: e.yearsPracticed,
      ownsInstrument: e.ownsInstrument,
    })),
    guardian: {
      name: student.guardianName,
      email: student.guardianEmail,
      phone: student.guardianPhone,
    },
  };

  const lessons = student.bookings.filter(
    (b) => b.status === "CONFIRMED" || b.status === "COMPLETED"
  );
  const stats = {
    total: lessons.length,
    upcoming: lessons.filter((b) => b.startsAt > now).length,
    completed: student.bookings.filter((b) => b.status === "COMPLETED").length,
  };
  const first = lessons
    .map((b) => b.startsAt)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: teacher.user.timezone,
  });
  const monthFormat = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: teacher.user.timezone,
  });
  // Date civile (AAAA-MM-JJ) dans le fuseau du prof, pour comparer au filtre de
  // dates sans arithmétique de fuseau : la comparaison de chaînes ISO suffit.
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: teacher.user.timezone,
  });

  // Cours documentables : confirmés/terminés et déjà commencés. C'est l'atelier
  // de rédaction scopé à cet élève — le prof y complète ou modifie chaque compte
  // rendu (les cours sans compte rendu y figurent aussi, « À documenter »).
  const documentable = student.bookings.filter(
    (b) =>
      (b.status === "CONFIRMED" || b.status === "COMPLETED") &&
      b.startsAt <= now
  );
  const messages = student.messages.map((m) => ({
    ...m,
    createdAt: m.createdAt.toISOString(),
  }));

  const tabs = [
    { key: "profil", label: "Profil" },
    { key: "historique", label: "Historique", badge: student.bookings.length },
    {
      key: "comptes-rendus",
      label: "Comptes rendus",
      badge: documentable.length,
    },
    { key: "messages", label: "Messages", badge: messages.length },
    { key: "note", label: "Note privée" },
  ];
  const sp = await searchParams;
  const active = tabs.some((t) => t.key === sp.onglet) ? sp.onglet! : "profil";
  const basePath = `/dashboard/prof/eleves/${student.id}`;

  const crNeedle = (sp.cr_q ?? "").trim().toLowerCase();
  const crInstrument = sp.cr_instrument ?? "";
  const crFrom = sp.cr_from ?? "";
  const crTo = sp.cr_to ?? "";
  const reportInstruments = [
    ...new Set(documentable.map((b) => b.instrument.name)),
  ]
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map((name) => ({ value: name, label: name }));
  const visibleReports = documentable.filter((b) => {
    const day = isoDate.format(b.startsAt);
    return (
      (!crInstrument || b.instrument.name === crInstrument) &&
      (!crFrom || day >= crFrom) &&
      (!crTo || day <= crTo) &&
      (!crNeedle ||
        reportPlainText(b.report?.content ?? "").toLowerCase().includes(crNeedle) ||
        b.instrument.name.toLowerCase().includes(crNeedle))
    );
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link
          href="/dashboard/prof/eleves"
          className="flex w-fit items-center gap-1 text-sm text-muted hover:underline"
        >
          <ChevronLeft className="h-3 w-3" />
          Mes élèves
        </Link>

        <div className="flex items-center gap-4 border-b border-border pb-6">
          <Avatar className="h-16 w-16 shrink-0 border border-border">
            <AvatarImage src={student.user.image || undefined} alt={name} />
            <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <PageTitle size="page">{name}</PageTitle>
            <p className="mt-1 text-sm text-muted">
              {[
                age !== null ? `${age} ans` : null,
                student.city,
                first ? `élève depuis ${monthFormat.format(first)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-3 gap-3">
        <Stat value={stats.total} label="Cours" />
        <Stat value={stats.upcoming} label="À venir" />
        <Stat value={stats.completed} label="Terminés" />
      </div>

      <FicheTabs tabs={tabs} active={active} basePath={basePath} />

      {active === "profil" ? <StudentProfileBody profile={profileView} /> : null}

      {active === "note" ? (
        <StudentNoteEditor
          studentId={student.id}
          initialContent={student.teacherNotes[0]?.content ?? ""}
        />
      ) : null}

      {active === "messages" ? (
        <>
          <MarkThreadRead teacherId={teacher.id} studentId={student.id} />
          <MessageThread
            initial={messages}
            me="TEACHER"
            postUrl={`/api/teacher/students/${student.id}/messages`}
            emptyLabel="Démarrez la conversation avec cet élève."
          />
        </>
      ) : null}

      {active === "historique" ? (
        <ul className="divide-y divide-border border-y border-border">
          {student.bookings.map((b) => {
            const documented =
              b.report &&
              (b.report.content ||
                b.report.attachments.length > 0 ||
                b.report.comments.length > 0);

            return (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <p className="min-w-0 text-sm">
                  <span className="font-medium">
                    {lessonTitle(b.instrument.name, b.isTrial)}
                  </span>
                  <span className="text-muted">
                    {" "}
                    · {dateFormat.format(b.startsAt)}
                  </span>
                </p>
                <div className="flex shrink-0 items-center gap-3">
                  {documented ? (
                    <Link
                      href={`${basePath}?onglet=comptes-rendus#cr-${b.id}`}
                      className="flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Compte rendu
                    </Link>
                  ) : null}
                  <Badge
                    variant={b.status === "CONFIRMED" ? "success" : "secondary"}
                  >
                    {STATUS_LABELS[b.status] ?? b.status}
                  </Badge>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {active === "comptes-rendus" ? (
        <>
          {/* Lire/répondre ici vaut consultation : la pastille « Comptes
              rendus » tombe aussi depuis la fiche élève, pas seulement l'atelier. */}
          <MarkReportsSeen />
          {documentable.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
              Aucun cours à documenter pour cet élève pour l&apos;instant. Un
              compte rendu s&apos;ouvre dès qu&apos;un cours confirmé a commencé.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
            <ListFilters
              searchKey="cr_q"
              searchPlaceholder="Rechercher dans les comptes rendus…"
              chips={
                reportInstruments.length >= 2
                  ? [
                      {
                        key: "cr_instrument",
                        label: "Instrument",
                        options: reportInstruments,
                      },
                    ]
                  : undefined
              }
              dateRange={{ fromKey: "cr_from", toKey: "cr_to" }}
            />

            {visibleReports.length === 0 ? (
              <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
                Aucun cours ne correspond à ces filtres.
              </p>
            ) : null}

            <div className="flex flex-col gap-3">
              {visibleReports.map((b, i) => (
                <ReportEditor
                  key={b.id}
                  hashId={`cr-${b.id}`}
                  defaultOpen={i === 0}
                  me="TEACHER"
                  lesson={{
                    bookingId: b.id,
                    dateLabel: dateFormat.format(b.startsAt),
                    studentName: name,
                    instrumentName: b.instrument.name,
                    isTrial: b.isTrial,
                    title: b.report?.title ?? "",
                    content: b.report?.content ? sanitizeReportHtml(b.report.content) : "",
                    attachments: b.report?.attachments ?? [],
                  }}
                  comments={(b.report?.comments ?? []).map((c) => ({
                    ...c,
                    createdAt: c.createdAt.toISOString(),
                  }))}
                />
              ))}
            </div>
          </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 text-center">
      <p className="font-display text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
