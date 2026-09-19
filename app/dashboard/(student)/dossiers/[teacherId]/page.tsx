import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CalendarPlus,
  ChevronLeft,
  FileText,
  MessageSquare,
  Star,
  Video,
} from "lucide-react";

import { Eyebrow, PageTitle, SectionTitle } from "@/components/editorial";
import { FicheTabs } from "@/components/fiche-tabs";
import { InstrumentChip } from "@/components/instrument-chip";
import {
  LESSON_STATUS_LABELS,
  LESSON_STATUS_VARIANTS,
} from "@/components/lesson-status";
import { ListFilters } from "@/components/list-filters";
import { MarkReportsSeen } from "@/components/mark-reports-seen";
import { MarkThreadRead } from "@/components/mark-thread-read";
import { MessageThread } from "@/components/message-thread";
import { ReportViewer } from "@/components/report-view";
import { TeacherReview } from "@/components/teacher-review";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stars } from "@/components/ui/stars";
import { auth } from "@/lib/auth";
import { lessonTitle } from "@/lib/bookings/title";
import { formatPrice } from "@/lib/format/price";
import prisma from "@/lib/prisma";
import { reportPlainText, sanitizeReportHtml } from "@/lib/reports/sanitize";
import { canReviewTeacher } from "@/lib/reviews/eligibility";
import { formatSlotShort, getNextSlotsForTeachers } from "@/lib/teacher/next-slots";
import { isTeacherVisible } from "@/lib/teacher/visibility";

/**
 * Les libellés partagés avec le prof, à la même divergence près que « Mes
 * cours » : l'élève attend *sa* réponse. Voir `components/student-bookings`.
 */
const STATUS_LABELS = {
  ...LESSON_STATUS_LABELS,
  PENDING: "En attente de sa réponse",
};

/**
 * Le lieu, dit du point de vue de l'élève. `LESSON_MODE_LABELS` écrit « chez
 * vous » pour le domicile du prof, ce qui, lu ici, désigne l'inverse exact —
 * même raison que la table jumelle de `components/student-bookings`.
 */
const MODE_LABELS: Record<string, string> = {
  ONLINE: "en visio",
  TEACHER_PLACE: "chez le prof",
  STUDENT_PLACE: "chez vous",
};

/**
 * Dossier partagé, vu par l'élève.
 *
 * Le pendant de la fiche élève côté prof : un hub par relation prof↔élève qui
 * centralise les cours, leurs comptes rendus (et commentaires) et les échanges.
 * La note privée du prof n'y figure pas — elle lui reste réservée. Accessible
 * seulement si l'élève a au moins un cours avec ce prof, sinon 404.
 *
 * Un compte rendu s'y **lit comme une page** : titre, texte, pièces jointes
 * groupées par type, fil de commentaires. Un seul est déplié à la fois — le
 * plus récent, ou celui que `?cr=` désigne ; les autres restent en titre
 * atténué avec « Lire → ». C'est ce que l'élève vient chercher, et le premier
 * onglet l'ouvre directement. La colonne de droite porte ce qui prolonge la
 * relation — le prochain cours, de quoi en reprendre un, et l'avis.
 *
 * Dates dans le fuseau du **prof** : un cours a une heure, et c'est celle-là
 * que les deux parties lisent, ici comme dans les e-mails de rappel.
 */
export default async function StudentDossierPage({
  params,
  searchParams,
}: {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<{
    onglet?: string;
    /** Compte rendu déplié ; les autres restent en titre, à ouvrir. */
    cr?: string;
    cr_q?: string;
    cr_instrument?: string;
    cr_from?: string;
    cr_to?: string;
  }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/");

  const student = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!student) redirect("/dashboard");

  const { teacherId } = await params;

  const teacher = await prisma.teacherProfile.findFirst({
    where: { id: teacherId, bookings: { some: { studentId: student.id } } },
    select: {
      id: true,
      slug: true,
      status: true,
      city: true,
      stripeCurrentPeriodEnd: true,
      user: { select: { name: true, image: true, timezone: true } },
      bookings: {
        where: { studentId: student.id },
        orderBy: { startsAt: "desc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          isTrial: true,
          mode: true,
          priceCents: true,
          meetingUrl: true,
          address: true,
          instrument: { select: { name: true, family: true } },
          report: {
            select: {
              title: true,
              content: true,
              createdAt: true,
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
      messages: {
        where: { studentId: student.id, reportId: null },
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
      // Avis global de cet élève sur ce prof (unique par couple), pour l'onglet
      // « Mon avis » : afficher/modifier l'existant.
      reviews: {
        where: { studentId: student.id },
        take: 1,
        select: { rating: true, comment: true, teacherRepl: true, publishedAt: true },
      },
    },
  });

  if (!teacher) notFound();

  const now = new Date();
  const name = teacher.user.name ?? "Professeur";
  const zone = teacher.user.timezone;
  const visible = isTeacherVisible(teacher, now);

  const lessons = teacher.bookings.filter(
    (b) => b.status === "CONFIRMED" || b.status === "COMPLETED"
  );
  const completedCount = teacher.bookings.filter(
    (b) => b.status === "COMPLETED"
  ).length;
  const nextLesson = teacher.bookings
    .filter((b) => b.status === "CONFIRMED" && b.endsAt > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];

  // Depuis quand : le premier cours réservé, pas la date du compte.
  const since = teacher.bookings.reduce<Date | null>(
    (earliest, b) => (!earliest || b.startsAt < earliest ? b.startsAt : earliest),
    null
  );

  // Familles travaillées avec ce prof — une pastille par instrument.
  const instruments = [
    ...new Map(
      teacher.bookings.map((b) => [b.instrument.name, b.instrument.family])
    ),
  ].map(([label, family]) => ({ name: label, family }));

  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
  });
  const longDayFormat = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: zone,
  });
  const writtenFormat = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
  });
  // Date civile (AAAA-MM-JJ) dans le fuseau du prof (celui qui date les cours),
  // pour comparer au filtre de dates par simple comparaison de chaînes ISO.
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: zone,
  });

  const reports = teacher.bookings.filter(
    (b) =>
      b.report &&
      (b.report.content ||
        b.report.attachments.length > 0 ||
        b.report.comments.length > 0)
  );
  const messages = teacher.messages.map((m) => ({
    ...m,
    createdAt: m.createdAt.toISOString(),
  }));

  const existingReview = teacher.reviews[0] ?? null;
  // Même règle que la route : un cours terminé suffit, et il n'y en a qu'un
  // par prof. `canReviewTeacher` tranche ici comme là-bas.
  const reviewable = canReviewTeacher(completedCount > 0);

  // Prochains créneaux libres, pour reprendre un cours sans passer par la
  // recherche. Inutile si la fiche n'est pas en ligne : elle ne se réserve pas.
  const nextSlots = visible
    ? (await getNextSlotsForTeachers([teacher.id], { count: 3, now })).get(
        teacher.id
      )
    : undefined;

  const tabs = [
    { key: "comptes-rendus", label: "Comptes rendus", badge: reports.length },
    { key: "historique", label: "Cours", badge: teacher.bookings.length },
    { key: "messages", label: "Messages", badge: messages.length },
    { key: "avis", label: "Mon avis" },
  ];
  const sp = await searchParams;
  const active = tabs.some((t) => t.key === sp.onglet)
    ? sp.onglet!
    : "comptes-rendus";
  const basePath = `/dashboard/dossiers/${teacher.id}`;

  const crNeedle = (sp.cr_q ?? "").trim().toLowerCase();
  const crInstrument = sp.cr_instrument ?? "";
  const crFrom = sp.cr_from ?? "";
  const crTo = sp.cr_to ?? "";
  const reportInstruments = [...new Set(reports.map((b) => b.instrument.name))]
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map((label) => ({ value: label, label }));
  const openReportId = sp.cr;
  const visibleReports = reports.filter((b) => {
    const day = isoDate.format(b.startsAt);
    // La recherche porte sur le texte **rendu**, pas sur le HTML : « gamme »
    // doit trouver « la <strong>gamme</strong> ».
    const haystack = [
      b.report?.title ?? "",
      reportPlainText(b.report?.content ?? ""),
      b.instrument.name,
    ]
      .join(" ")
      .toLowerCase();

    return (
      (!crInstrument || b.instrument.name === crInstrument) &&
      (!crFrom || day >= crFrom) &&
      (!crTo || day <= crTo) &&
      (!crNeedle || haystack.includes(crNeedle))
    );
  });

  /**
   * Un compte rendu se lit **comme une page**, dépliée ; les précédents
   * restent en titre, atténués, avec « Lire → ». Trois comptes rendus
   * dépliés bout à bout, c'est trois pages empilées où l'on ne sait plus
   * laquelle on lit — et le plus récent, celui qu'on vient chercher, se
   * retrouve à faire défiler.
   *
   * Lequel est ouvert vit dans l'URL (`?cr=`), jamais dans un état React :
   * l'adresse reste partageable, et « Lire le compte rendu » depuis « Mes
   * cours » ouvre le bon. L'ancre `#cr-…`, elle, ne sert qu'au défilement.
   */
  const openReport =
    visibleReports.find((b) => b.id === openReportId) ?? visibleReports[0] ?? null;

  /** Lien qui déplie un compte rendu en conservant les filtres en cours. */
  const openHref = (bookingId: string) => {
    const query = new URLSearchParams({ onglet: "comptes-rendus", cr: bookingId });

    if (crNeedle) query.set("cr_q", sp.cr_q!);
    if (crInstrument) query.set("cr_instrument", crInstrument);
    if (crFrom) query.set("cr_from", crFrom);
    if (crTo) query.set("cr_to", crTo);

    return `${basePath}?${query.toString()}#cr-${bookingId}`;
  };

  return (
    <div className="flex flex-col gap-8">
      {/* ------------------------------------------------------------ En-tête */}
      <div className="flex flex-col gap-4">
        <Link
          href="/dashboard/dossiers"
          className="flex w-fit items-center gap-1 py-2 text-sm text-muted hover:underline"
        >
          <ChevronLeft className="h-3 w-3" />
          Mes profs
        </Link>

        <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="h-20 w-20 shrink-0 border border-border sm:h-24 sm:w-24">
              <AvatarImage src={teacher.user.image || undefined} alt={name} />
              <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <Eyebrow className="mb-2">
                {[
                  since ? `Votre prof depuis ${monthYear(since, zone)}` : null,
                  `${lessons.length} ${lessons.length === 1 ? "cours" : "cours"}`,
                  teacher.city,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Eyebrow>

              <PageTitle size="page" className="sm:text-5xl">
                {name}
              </PageTitle>

              {/* Pastilles et lien sur la même ligne : ce qu'on travaille avec
                  lui, puis où le voir en public. */}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {instruments.map((instrument) => (
                  <InstrumentChip
                    key={instrument.name}
                    name={instrument.name}
                    family={instrument.family}
                  />
                ))}

                {/* Le lien menait à une 404 dès que la fiche n'était plus
                    visible (abonnement échu, fiche dépubliée) ; le serveur sait
                    pourquoi, autant le dire. */}
                {visible ? (
                  <Link
                    href={`/profs/${teacher.slug}`}
                    className="text-sm text-primary hover:underline"
                  >
                    Voir sa fiche publique →
                  </Link>
                ) : (
                  <p className="text-sm text-subtle">
                    Fiche actuellement hors ligne.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`${basePath}?onglet=messages`}>
                <MessageSquare className="h-4 w-4" />
                Écrire
              </Link>
            </Button>
            {visible ? (
              <Button asChild>
                <Link href={`/profs/${teacher.slug}`}>
                  <CalendarPlus className="h-4 w-4" />
                  Réserver un cours
                </Link>
              </Button>
            ) : null}
          </div>
        </header>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
        {/* --------------------------------------------------------- Onglets */}
        <div className="flex min-w-0 flex-col gap-6">
          <FicheTabs tabs={tabs} active={active} basePath={basePath} />

          {active === "avis" ? (
            <TeacherReview
              teacherId={teacher.id}
              canReview={reviewable.ok}
              initial={
                existingReview
                  ? {
                      rating: existingReview.rating,
                      comment: existingReview.comment,
                      published: existingReview.publishedAt !== null,
                    }
                  : null
              }
            />
          ) : null}

          {active === "messages" ? (
            <>
              <MarkThreadRead teacherId={teacher.id} studentId={student.id} />
              <MessageThread
                initial={messages}
                me="STUDENT"
                postUrl={`/api/student/teachers/${teacher.id}/messages`}
                emptyLabel="Écrivez un message à votre prof."
              />
            </>
          ) : null}

          {active === "historique" ? (
            <ul className="divide-y divide-border border-y border-border">
              {teacher.bookings.map((b) => {
                const documented =
                  b.report &&
                  (b.report.content ||
                    b.report.attachments.length > 0 ||
                    b.report.comments.length > 0);

                return (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <p className="min-w-0 text-sm">
                      <span className="font-medium">
                        {lessonTitle(b.instrument.name, b.isTrial)}
                      </span>
                      <span className="text-muted">
                        {` · ${dateFormat.format(b.startsAt)}`}
                      </span>
                    </p>
                    <div className="flex shrink-0 items-center gap-3">
                      {documented ? (
                        <Link
                          href={`${basePath}?onglet=comptes-rendus&cr=${b.id}#cr-${b.id}`}
                          className="flex items-center gap-1 py-2 text-sm text-primary hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Compte rendu
                        </Link>
                      ) : null}
                      <Badge variant={LESSON_STATUS_VARIANTS[b.status]}>
                        {STATUS_LABELS[b.status]}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {active === "comptes-rendus" ? (
            <>
              {/* Marque les comptes rendus de ce prof comme lus : la pastille
                  « Mes profs » tombe une fois l'onglet ouvert. */}
              <MarkReportsSeen />
              {reports.length === 0 ? (
                <p className="rounded-[var(--radius-sm)] bg-surface px-4 py-8 text-center text-sm text-muted">
                  Aucun compte rendu pour l&apos;instant. Votre prof en écrit un
                  après le cours quand il y a matière.
                </p>
              ) : (
                <div className="flex flex-col gap-6">
                  {/* Les filtres n'apparaissent qu'à partir du moment où ils
                      servent : trois comptes rendus se lisent sans chercher. */}
                  {reports.length >= 4 ? (
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
                  ) : null}

                  {visibleReports.length === 0 ? (
                    <p className="rounded-[var(--radius-sm)] bg-surface px-4 py-8 text-center text-sm text-muted">
                      Aucun compte rendu ne correspond à ces filtres.
                    </p>
                  ) : null}

                  <ul className="flex flex-col divide-y divide-border">
                    {visibleReports.map((b) => {
                      const open = b.id === openReport?.id;
                      const heading =
                        b.report!.title?.trim() ||
                        lessonTitle(b.instrument.name, b.isTrial);

                      return (
                        <li
                          key={b.id}
                          id={`cr-${b.id}`}
                          className={
                            open
                              ? "scroll-mt-20 py-7 first:pt-0"
                              : "scroll-mt-20 py-6 first:pt-0"
                          }
                        >
                          <article
                            className={
                              open
                                ? "flex flex-col gap-4"
                                : "flex flex-col gap-2.5 opacity-80 transition-opacity hover:opacity-100"
                            }
                          >
                            <div className="flex items-baseline justify-between gap-4">
                              <div className="min-w-0">
                                <Eyebrow className="mb-1.5 tracking-[0.14em]">
                                  <span className="first-letter:uppercase">
                                    {`${longDayFormat.format(b.startsAt)} · ${b.instrument.name}`}
                                  </span>
                                </Eyebrow>
                                <h2
                                  className={
                                    open
                                      ? "text-balance font-display text-3xl font-semibold leading-tight text-foreground"
                                      : "text-balance font-display text-2xl font-medium leading-tight text-foreground"
                                  }
                                >
                                  {open ? (
                                    heading
                                  ) : (
                                    <Link
                                      href={openHref(b.id)}
                                      className="hover:underline"
                                    >
                                      {heading}
                                    </Link>
                                  )}
                                </h2>
                              </div>

                              {open ? (
                                <p className="shrink-0 whitespace-nowrap text-xs text-subtle">
                                  {`Écrit le ${writtenFormat.format(b.report!.createdAt)}`}
                                </p>
                              ) : (
                                <Link
                                  href={openHref(b.id)}
                                  className="shrink-0 whitespace-nowrap text-sm font-medium text-primary hover:underline"
                                >
                                  Lire →
                                </Link>
                              )}
                            </div>

                            {/* Le HTML est assaini **ici**, à la frontière
                                serveur : le composant de rendu n'importe aucun
                                nettoyeur, et `sanitize-html` ne part pas dans
                                le bundle client. */}
                            {open ? (
                              <ReportViewer
                                bookingId={b.id}
                                me="STUDENT"
                                report={{
                                  content: b.report!.content
                                    ? sanitizeReportHtml(b.report!.content)
                                    : null,
                                  attachments: b.report!.attachments,
                                  comments: b.report!.comments.map((c) => ({
                                    ...c,
                                    createdAt: c.createdAt.toISOString(),
                                  })),
                                }}
                              />
                            ) : null}
                          </article>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* ------------------------------------------------- Colonne de droite */}
        <aside className="flex flex-col gap-8">
          {nextLesson ? (
            <section className="flex flex-col gap-3.5">
              <SectionTitle>Prochain cours</SectionTitle>
              <div className="flex flex-col items-start gap-2.5 rounded-[var(--radius)] border border-border bg-elevated px-4 py-4 shadow-sm">
                <p className="font-display text-2xl font-semibold leading-tight text-foreground first-letter:uppercase">
                  {dateFormat.format(nextLesson.startsAt)}
                </p>
                <p className="text-sm text-muted">
                  {[
                    lessonTitle(nextLesson.instrument.name, nextLesson.isTrial),
                    MODE_LABELS[nextLesson.mode],
                    nextLesson.priceCents !== null
                      ? formatPrice(nextLesson.priceCents)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {nextLesson.address ? (
                  <p className="text-sm text-muted">{nextLesson.address}</p>
                ) : null}

                {nextLesson.meetingUrl ? (
                  <Button asChild size="sm" className="h-11">
                    <a
                      href={nextLesson.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Video className="h-4 w-4" />
                      Rejoindre
                    </a>
                  </Button>
                ) : (
                  <Link
                    href="/dashboard"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Voir dans mes cours →
                  </Link>
                )}
              </div>
            </section>
          ) : null}

          {nextSlots && nextSlots.slots.length > 0 ? (
            <section className="flex flex-col gap-3.5">
              <SectionTitle>Réserver à nouveau</SectionTitle>
              <p className="text-sm text-muted">
                Ses prochains créneaux libres, à son heure :
              </p>
              {/* « Tous → » est une pastille de la même rangée : c'est le
                  dernier créneau de la liste, celui qui les ouvre tous. */}
              <div className="flex flex-wrap gap-1.5">
                {nextSlots.slots.map((slot) => (
                  <Link
                    key={slot.startsAt.toISOString()}
                    href={`/profs/${teacher.slug}`}
                    className="flex h-11 items-center rounded-full border border-border bg-elevated px-3 text-sm transition-colors hover:border-border-strong hover:bg-surface"
                  >
                    {formatSlotShort(slot.startsAt, nextSlots.timezone)}
                  </Link>
                ))}
                <Link
                  href={`/profs/${teacher.slug}`}
                  className="flex h-11 items-center rounded-full border border-primary px-3 text-sm font-medium text-primary transition-colors hover:bg-primary-soft"
                >
                  Tous →
                </Link>
              </div>
            </section>
          ) : null}

          {/* L'avis se dépose dans son onglet ; ici, seulement l'invitation ou
              le rappel de ce qui est déjà en ligne. Deux formulaires pour un
              seul avis se contrediraient. */}
          {existingReview || reviewable.ok ? (
            <section className="flex flex-col gap-3.5">
              <SectionTitle>Votre avis</SectionTitle>

              {existingReview ? (
                <>
                  <Stars value={existingReview.rating} size="md" />
                  {existingReview.comment ? (
                    <p className="text-sm text-muted">
                      {`« ${existingReview.comment} »`}
                    </p>
                  ) : null}
                  {existingReview.teacherRepl ? (
                    <div className="rounded-[var(--radius-sm)] bg-surface p-3">
                      <p className="text-xs font-medium text-subtle">
                        {`Réponse de ${name}`}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {existingReview.teacherRepl}
                      </p>
                    </div>
                  ) : null}
                  {existingReview.publishedAt === null ? (
                    <p className="text-xs text-warning">
                      Retiré par la modération : il n&apos;est plus visible sur
                      sa fiche.
                    </p>
                  ) : null}
                  <Link
                    href={`${basePath}?onglet=avis`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Modifier mon avis →
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted">
                    Vous avez suivi un cours avec {name} : vous pouvez laisser
                    un avis public, signé de votre prénom. Il aide les prochains
                    élèves à choisir.
                  </p>
                  <span
                    aria-hidden
                    className="flex items-center gap-0.5 text-accent"
                  >
                    {[1, 2, 3, 4, 5].map((position) => (
                      <Star key={position} className="h-5 w-5" />
                    ))}
                  </span>
                  <Button asChild variant="outline" size="sm" className="h-11 w-fit">
                    <Link href={`${basePath}?onglet=avis`}>Écrire un avis</Link>
                  </Button>
                </>
              )}
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/** « août 2026 » — le mois où la relation a commencé, dans le fuseau du prof. */
function monthYear(date: Date, timezone: string): string {
  return date.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: timezone,
  });
}
