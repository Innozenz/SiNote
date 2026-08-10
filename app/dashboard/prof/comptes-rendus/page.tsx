import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PageTitle } from "@/components/editorial";
import { ListFilters } from "@/components/list-filters";
import { ReportEditor, type ReportEditorLesson } from "@/components/report-editor";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportPlainText, sanitizeReportHtml } from "@/lib/reports/sanitize";

/**
 * Comptes rendus de cours.
 *
 * Liste les cours que le prof peut documenter — confirmés ou terminés et déjà
 * commencés — du plus récent au plus ancien. Chaque carte s'ouvre sur l'éditeur
 * (texte + pièces jointes + note audio). L'élève retrouve le compte rendu sur
 * son propre tableau de bord.
 *
 * C'est l'atelier de rédaction, tous élèves confondus — le pendant chronologique
 * de la fiche élève, qui n'en montre que la consultation. Comme la liste mêle
 * tous les élèves, elle se filtre (élève, instrument, dates, texte) via le même
 * îlot `ListFilters` que les autres listes : la page reste serveur, l'URL porte
 * l'état.
 */
export default async function TeacherReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    eleve?: string;
    instrument?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/");

  const teacher = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, user: { select: { timezone: true } } },
  });

  if (!teacher) redirect("/dashboard");

  const now = new Date();

  const bookings = await prisma.booking.findMany({
    where: {
      teacherId: teacher.id,
      status: { in: ["CONFIRMED", "COMPLETED"] },
      startsAt: { lte: now },
    },
    orderBy: { startsAt: "desc" },
    take: 100,
    select: {
      id: true,
      startsAt: true,
      isTrial: true,
      instrument: { select: { name: true } },
      student: { select: { id: true, user: { select: { name: true } } } },
      report: {
        select: {
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
        },
      },
    },
  });

  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: teacher.user.timezone,
  });
  // Date civile (AAAA-MM-JJ) dans le fuseau du prof, pour comparer au filtre de
  // dates par simple comparaison de chaînes ISO.
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: teacher.user.timezone,
  });

  const sp = await searchParams;
  const needle = (sp.q ?? "").trim().toLowerCase();
  const eleve = sp.eleve ?? "";
  const instrument = sp.instrument ?? "";
  const from = sp.from ?? "";
  const to = sp.to ?? "";

  // Un élève peut apparaître plusieurs fois : on déduplique par identifiant, le
  // libellé restant le nom. L'instrument, lui, se déduplique par nom.
  const eleveOptions = [
    ...new Map(
      bookings.map((b) => [b.student.id, b.student.user.name ?? "Élève"])
    ),
  ]
    .sort((a, b) => a[1].localeCompare(b[1], "fr"))
    .map(([value, label]) => ({ value, label }));
  const instrumentOptions = [
    ...new Set(bookings.map((b) => b.instrument.name)),
  ]
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map((name) => ({ value: name, label: name }));

  // Un groupe ne sert que s'il offre au moins deux choix.
  const chips = [
    eleveOptions.length >= 2
      ? { key: "eleve", label: "Élève", options: eleveOptions }
      : null,
    instrumentOptions.length >= 2
      ? { key: "instrument", label: "Instrument", options: instrumentOptions }
      : null,
  ].flatMap((group) => (group ? [group] : []));

  const visible = bookings.filter((b) => {
    const day = isoDate.format(b.startsAt);
    return (
      (!eleve || b.student.id === eleve) &&
      (!instrument || b.instrument.name === instrument) &&
      (!from || day >= from) &&
      (!to || day <= to) &&
      (!needle ||
        (b.student.user.name ?? "").toLowerCase().includes(needle) ||
        b.instrument.name.toLowerCase().includes(needle) ||
        reportPlainText(b.report?.content ?? "").toLowerCase().includes(needle))
    );
  });

  const lessons: ReportEditorLesson[] = visible.map((b) => ({
    bookingId: b.id,
    dateLabel: dateFormat.format(b.startsAt),
    studentName: b.student.user.name ?? "Élève",
    instrumentName: b.instrument.name,
    isTrial: b.isTrial,
    content: b.report?.content ? sanitizeReportHtml(b.report.content) : "",
    attachments: b.report?.attachments ?? [],
    studentHref: `/dashboard/prof/eleves/${b.student.id}`,
  }));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-2 border-b border-border pb-6">
        <PageTitle size="page">Comptes rendus</PageTitle>
        <p className="text-sm text-muted">
          Documentez chaque cours pour votre élève : ce qui a été travaillé, des
          images ou partitions, une note audio.
        </p>
      </header>

      {bookings.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          Aucun cours à documenter pour l&apos;instant. Un compte rendu s&apos;ouvre
          dès qu&apos;un cours confirmé a commencé.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <ListFilters
            searchKey="q"
            searchPlaceholder="Rechercher par élève, instrument ou contenu…"
            chips={chips.length > 0 ? chips : undefined}
            dateRange={{ fromKey: "from", toKey: "to" }}
          />

          {lessons.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
              Aucun cours ne correspond à ces filtres.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {lessons.map((lesson) => (
                <ReportEditor key={lesson.bookingId} lesson={lesson} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
