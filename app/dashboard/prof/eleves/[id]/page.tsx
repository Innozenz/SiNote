import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CalendarPlus,
  ChevronLeft,
  FileAudio,
  FileText,
  Image as ImageIcon,
  PenLine,
} from "lucide-react";

import { Eyebrow, PageTitle, SectionTitle } from "@/components/editorial";
import { FicheTabs } from "@/components/fiche-tabs";
import { InstrumentChip } from "@/components/instrument-chip";
import { ListFilters } from "@/components/list-filters";
import { MarkReportsSeen } from "@/components/mark-reports-seen";
import { MarkThreadRead } from "@/components/mark-thread-read";
import { MessageThread } from "@/components/message-thread";
import { ReportEditor } from "@/components/report-editor";
import { StudentNoteEditor } from "@/components/student-note-editor";
import {
  TeacherStudentLessons,
  type StudentLessonRow,
} from "@/components/teacher-student-lessons";
import {
  LEVEL_LABELS,
  StudentProfileBody,
  type StudentProfileView,
} from "@/components/student-profile-detail";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stars } from "@/components/ui/stars";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportPlainText, sanitizeReportHtml } from "@/lib/reports/sanitize";
import { guardianSummary, isMinor } from "@/lib/student/profile";
import { ageOn } from "@/lib/user/age";
import { givenName } from "@/lib/user/name";

/**
 * Dossier d'un élève, vu par le prof.
 *
 * Tout ce que le prof sait de cet élève, en un endroit : qui il est (l'en-tête),
 * ce qui ne change pas (la colonne de droite — ses objectifs, le dernier compte
 * rendu, la note privée), et ce qui avance (les onglets — ses cours, leurs
 * comptes rendus, les messages, l'avis qu'il a laissé).
 *
 * La colonne de droite est le vrai apport : ses objectifs et la note privée
 * étaient rangés derrière des onglets, donc invisibles pendant qu'on relisait le
 * cours précédent — c'est-à-dire exactement au moment où ils servent.
 *
 * Accessible seulement si le prof a au moins un cours avec lui — sinon 404,
 * comme partout : « pas le vôtre » et « n'existe pas » se répondent pareil.
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
      // Repère de lecture de l'élève : c'est lui qui dit si un compte rendu a
      // été lu. Un prof qui ne le sait pas réécrit dans le vide.
      reportsSeenAt: true,
      // Le prénom seul signe la citation des objectifs (« Écrit par Léa ») :
      // il se lit avec `givenName`, jamais avec un découpage refait sur place.
      user: {
        select: { name: true, image: true, firstName: true, lastName: true },
      },
      instruments: {
        select: {
          level: true,
          yearsPracticed: true,
          ownsInstrument: true,
          instrument: { select: { id: true, name: true, family: true } },
        },
      },
      bookings: {
        where: { teacherId: teacher.id },
        orderBy: { startsAt: "desc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          mode: true,
          isTrial: true,
          meetingUrl: true,
          studentMessage: true,
          instrument: { select: { id: true, name: true, family: true } },
          report: {
            select: {
              title: true,
              content: true,
              updatedAt: true,
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
      // L'avis que cet élève a laissé à ce prof, s'il y en a un.
      reviews: {
        where: { teacherId: teacher.id },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          rating: true,
          comment: true,
          teacherRepl: true,
          publishedAt: true,
          createdAt: true,
          booking: { select: { instrument: { select: { name: true } } } },
        },
      },
    },
  });

  // Inexistant, ou sans aucun cours avec ce prof : indiscernables, et c'est voulu.
  if (!student) notFound();

  const now = new Date();
  const timezone = teacher.user.timezone;
  const name = student.user.name ?? "Élève";
  const age = student.birthDate ? ageOn(student.birthDate, now) : null;
  const guardian = guardianSummary(student, now);

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
  const upcoming = lessons.filter((b) => b.startsAt > now).length;
  const first = lessons
    .map((b) => b.startsAt)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
  const monthFormat = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: timezone,
  });
  // Date civile (AAAA-MM-JJ) dans le fuseau du prof, pour comparer au filtre de
  // dates sans arithmétique de fuseau : la comparaison de chaînes ISO suffit.
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  });

  // Cours documentables : confirmés/terminés et déjà commencés. C'est l'atelier
  // de rédaction scopé à cet élève — le prof y complète ou modifie chaque compte
  // rendu (les cours sans compte rendu y figurent aussi, « À documenter »).
  const documentable = student.bookings.filter(
    (b) =>
      (b.status === "CONFIRMED" || b.status === "COMPLETED") &&
      b.startsAt <= now
  );
  // Même règle que l'atelier des comptes rendus (`ReportEditor`) : un compte
  // rendu n'existe qu'avec du texte ou une pièce jointe. Un titre seul reste
  // « à écrire », sinon le dossier dirait « envoyé » là où l'atelier dit
  // « à documenter ».
  const isWritten = (
    report: { content: string | null; attachments: unknown[] } | null
  ) =>
    report !== null &&
    (reportPlainText(report.content ?? "").trim().length > 0 ||
      report.attachments.length > 0);
  const toWrite = documentable.filter((b) => !isWritten(b.report)).length;
  const messages = student.messages.map((m) => ({
    ...m,
    createdAt: m.createdAt.toISOString(),
  }));
  const review = student.reviews[0] ?? null;

  // Le dernier compte rendu écrit : c'est le fil d'où l'on reprend.
  const lastReport = documentable.find((b) => isWritten(b.report));

  const tabs = [
    { key: "cours", label: "Cours", badge: student.bookings.length },
    {
      key: "comptes-rendus",
      label: "Comptes rendus",
      badge: documentable.length,
      warn: toWrite > 0 ? `${toWrite} à écrire` : undefined,
    },
    { key: "messages", label: "Messages", badge: messages.length },
    { key: "avis", label: "Avis reçu" },
  ];
  const sp = await searchParams;
  const active = tabs.some((t) => t.key === sp.onglet) ? sp.onglet! : "cours";
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
        (b.report?.title ?? "").toLowerCase().includes(crNeedle) ||
        reportPlainText(b.report?.content ?? "").toLowerCase().includes(crNeedle) ||
        b.instrument.name.toLowerCase().includes(crNeedle))
    );
  });

  const lessonRows: StudentLessonRow[] = student.bookings.map((b) => ({
    id: b.id,
    status: b.status,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    mode: b.mode,
    isTrial: b.isTrial,
    meetingUrl: b.meetingUrl,
    studentMessage: b.studentMessage,
    instrumentName: b.instrument.name,
    instrumentFamily: b.instrument.family,
    report: isWritten(b.report) && b.report
      ? {
          attachments: b.report.attachments.length,
          // « Lu » = l'élève a ouvert ses comptes rendus après la dernière
          // retouche de celui-ci. Approximation assumée, et la seule dont on
          // dispose : il n'y a pas d'accusé de lecture par compte rendu.
          seen: student.reportsSeenAt >= b.report.updatedAt,
        }
      : null,
  }));

  // Niveau par instrument : un élève peut être avancé au piano et débutant au
  // chant, la pastille porte donc son niveau et non celui de la personne.
  const practiced = student.instruments.filter((entry) =>
    student.bookings.some((b) => b.instrument.id === entry.instrument.id)
  );
  const chips = (practiced.length > 0 ? practiced : student.instruments).map(
    (entry) => ({
      name: entry.instrument.name,
      family: entry.instrument.family,
      level: LEVEL_LABELS[entry.level].toLowerCase(),
    })
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link
          href="/dashboard/prof/eleves"
          className="flex w-fit items-center gap-1 text-sm text-muted hover:underline"
        >
          <ChevronLeft className="h-3 w-3" />
          Mes élèves
        </Link>

        {/* Même rythme que les autres en-têtes (œil-de-bœuf, titre, filet), avec
            l'avatar en plus : c'est un dossier, pas une page-liste. L'œil-de-bœuf
            porte l'ancienneté — ce qu'on veut savoir avant tout d'un élève. */}
        <header className="flex flex-col gap-6 border-b border-border pb-7 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-5">
            <Avatar className="h-20 w-20 shrink-0 border border-border sm:h-24 sm:w-24">
              <AvatarImage src={student.user.image || undefined} alt={name} />
              <AvatarFallback className="text-3xl">
                {name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <Eyebrow className="mb-2">
                {[
                  first ? `Élève depuis ${monthFormat.format(first)}` : "Nouvel élève",
                  `${lessons.length} cours`,
                  upcoming > 0 ? `${upcoming} à venir` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Eyebrow>

              <PageTitle size="page" className="text-4xl sm:text-5xl">
                {name}
              </PageTitle>

              {/* Les pastilles et le lieu tiennent sur la même ligne : ce sont
                  les mêmes faits — ce qu'il joue, et dans quelles conditions. */}
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                {chips.map((chip) => (
                  <InstrumentChip
                    key={chip.name}
                    name={chip.name}
                    family={chip.family}
                    detail={chip.level}
                  />
                ))}
                {student.city || student.prefersOnline ? (
                  <span className="text-sm text-muted">
                    {[
                      student.city,
                      student.prefersOnline ? "préfère la visio" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                ) : null}
              </div>

              {/* L'âge et le responsable sont un état civil, pas une alerte :
                  ils se lisent en gris. Seule l'absence de contact pour un
                  mineur en devient une — là, le prof ne peut ni prévenir ni
                  décaler. */}
              {guardian.isMinor ? (
                <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
                  <span>
                    {age !== null ? (
                      <>
                        <strong className="font-medium text-foreground">
                          {age} ans
                        </strong>{" "}
                        —{" "}
                      </>
                    ) : null}
                    mineur
                  </span>
                  {guardian.contact ? (
                    <span>
                      Responsable :{" "}
                      <strong className="font-medium text-foreground">
                        {guardian.contact}
                      </strong>
                    </span>
                  ) : (
                    <span className="text-warning">
                      Aucun contact de responsable renseigné
                    </span>
                  )}
                </div>
              ) : age !== null ? (
                <p className="mt-2.5 text-sm text-muted">
                  <strong className="font-medium text-foreground">
                    {age} ans
                  </strong>
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`${basePath}?onglet=messages`}>
                <PenLine className="mr-2 h-4 w-4" />
                Écrire
              </Link>
            </Button>
            {/* « Poser un cours » est l'action principale du dossier : c'est
                elle qui fait revenir l'élève. */}
            <Button size="sm" asChild>
              <Link href="/dashboard/prof/agenda">
                <CalendarPlus className="mr-2 h-4 w-4" />
                Poser un cours
              </Link>
            </Button>
          </div>
        </header>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <FicheTabs tabs={tabs} active={active} basePath={basePath} />

          {active === "cours" ? (
            <TeacherStudentLessons
              initial={lessonRows}
              timezone={timezone}
              basePath={basePath}
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

          {active === "avis" ? (
            review ? (
              <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Stars value={review.rating} />
                  <span className="text-sm text-muted">
                    {review.booking.instrument.name} ·{" "}
                    {dateFormat.format(review.publishedAt ?? review.createdAt)}
                  </span>
                  {review.publishedAt === null ? (
                    <Badge variant="secondary">Retiré par la modération</Badge>
                  ) : null}
                </div>
                {review.comment ? (
                  <p className="text-sm text-foreground">{review.comment}</p>
                ) : null}
                {review.teacherRepl ? (
                  <p className="rounded-md bg-surface p-3 text-sm text-muted">
                    <span className="text-subtle">Votre réponse : </span>
                    {review.teacherRepl}
                  </p>
                ) : (
                  <Link
                    href="/dashboard/prof/avis"
                    className="w-fit text-sm text-primary hover:underline"
                  >
                    Répondre publiquement →
                  </Link>
                )}
              </div>
            ) : (
              <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
                Cet élève ne vous a pas encore laissé d&apos;avis. Un avis ne
                s&apos;ouvre qu&apos;après un cours que vous avez clôturé.
              </p>
            )
          ) : null}

          {active === "comptes-rendus" ? (
            <>
              {/* Lire/répondre ici vaut consultation : la pastille « Élèves »
                  tombe aussi depuis le dossier, pas seulement l'atelier. */}
              <MarkReportsSeen />
              {documentable.length === 0 ? (
                <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
                  Aucun cours à documenter pour cet élève pour l&apos;instant. Un
                  compte rendu s&apos;ouvre dès qu&apos;un cours confirmé a
                  commencé.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  <ListFilters
                    searchKey="cr_q"
                    searchPlaceholder="Rechercher par titre ou contenu…"
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
                          content: b.report?.content
                            ? sanitizeReportHtml(b.report.content)
                            : "",
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

        {/* Ce qui ne change pas d'un onglet à l'autre reste à l'écran : ses
            objectifs, le dernier compte rendu écrit, la note privée. Ce sont
            précisément les trois choses qu'on relit *en* écrivant. */}
        <aside className="flex min-w-0 flex-col gap-8">
          {student.goals ? (
            <section className="flex flex-col gap-3">
              <SectionTitle>Ses objectifs</SectionTitle>
              {/* Cité, pas encadré : ce sont ses mots, et les guillemets le
                  disent mieux qu'un filet de couleur. */}
              <blockquote className="font-display text-[22px] italic leading-snug text-foreground">
                «&nbsp;{student.goals}&nbsp;»
              </blockquote>
              <p className="text-xs text-muted">
                {[
                  `Écrit par ${givenName(student.user) ?? name} dans son profil`,
                  student.preferredGenres.length > 0
                    ? `genres : ${student.preferredGenres.join(", ")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </section>
          ) : null}

          {lastReport?.report ? (
            <section className="flex flex-col gap-3">
              <SectionTitle>Dernier compte rendu</SectionTitle>
              {/* Une carte, ici, parce que c'est un document : le seul bloc de
                  la colonne qu'on relit *en* écrivant le suivant. */}
              <Link
                href={`${basePath}?onglet=comptes-rendus#cr-${lastReport.id}`}
                className="flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-elevated px-[18px] py-4 transition-colors hover:bg-surface"
              >
                <p className="text-sm text-muted first-letter:uppercase">
                  {dateFormat.format(lastReport.startsAt)} ·{" "}
                  {lastReport.instrument.name}
                </p>
                <p className="line-clamp-4 text-sm leading-relaxed">
                  {reportPlainText(lastReport.report.content ?? "") ||
                    "Aucun texte — seulement des pièces jointes."}
                </p>
                {lastReport.report.attachments.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {attachmentChips(lastReport.report.attachments)}
                  </div>
                ) : null}
              </Link>
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <SectionTitle>Votre note privée</SectionTitle>
            <StudentNoteEditor
              studentId={student.id}
              initialContent={student.teacherNotes[0]?.content ?? ""}
            />
          </section>

          {/* Le reste du profil ne se lit qu'une fois, à la première demande :
              replié, il reste accessible sans encombrer la colonne. */}
          <details className="group">
            <summary className="cursor-pointer list-none text-sm text-primary hover:underline">
              Tout son profil
            </summary>
            <div className="mt-4">
              <StudentProfileBody profile={profileView} />
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}

/** Pièces jointes résumées par nature : « 2 images · 1 partition ». */
function attachmentChips(
  attachments: { id: string; kind: "IMAGE" | "SCORE" | "AUDIO" }[]
) {
  const counts = {
    IMAGE: attachments.filter((a) => a.kind === "IMAGE").length,
    SCORE: attachments.filter((a) => a.kind === "SCORE").length,
    AUDIO: attachments.filter((a) => a.kind === "AUDIO").length,
  };

  const entries: { key: string; icon: typeof FileText; label: string }[] = [];

  if (counts.IMAGE > 0) {
    entries.push({
      key: "image",
      icon: ImageIcon,
      label: `${counts.IMAGE} image${counts.IMAGE > 1 ? "s" : ""}`,
    });
  }
  if (counts.SCORE > 0) {
    entries.push({
      key: "score",
      icon: FileText,
      label: `${counts.SCORE} partition${counts.SCORE > 1 ? "s" : ""}`,
    });
  }
  if (counts.AUDIO > 0) {
    entries.push({
      key: "audio",
      icon: FileAudio,
      label: `${counts.AUDIO} note${counts.AUDIO > 1 ? "s" : ""} audio`,
    });
  }

  return entries.map(({ key, icon: Icon, label }) => (
    <span
      key={key}
      className="inline-flex items-center gap-1 rounded-full bg-surface-strong px-2 py-0.5 text-[11px] text-muted"
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  ));
}
