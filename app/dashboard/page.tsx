import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  MessageSquare,
  Search,
  UserCog,
  Video,
} from "lucide-react";

import { PageHeader, Row, RowList, SectionTitle } from "@/components/editorial";
import {
  TeacherVisibilityNotice,
  visibilityBlocker,
} from "@/components/teacher-visibility-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { lessonTitle } from "@/lib/bookings/title";
import { formatPrice } from "@/lib/format/price";
import { messageUnreadCount } from "@/lib/messages/unread-count";
import prisma from "@/lib/prisma";
import { checkPublishable } from "@/lib/teacher/publishable";
import { isSubscriptionActive } from "@/lib/teacher/visibility";
import { givenName } from "@/lib/user/name";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tableau de bord" };

/**
 * Aiguillage de l'espace connecté.
 *
 * Server Component, comme tout ce qui lit un rôle. La version précédente
 * répétait la barre latérale : quatre chiffres puis cinq liens vers des pages
 * déjà listées à gauche, et rien de ce que la personne venait chercher — le
 * prochain cours, les demandes qui attendent, les messages non lus. Le hub
 * montre désormais ce qui *bouge* ; la navigation reste à la sidebar.
 *
 * L'abonnement se gère à un seul endroit, /dashboard/prof/abonnement ; ici
 * seulement un lien discret.
 */
export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/connexion");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      name: true,
      firstName: true,
      role: true,
      timezone: true,
      teacherProfile: {
        select: {
          id: true,
          status: true,
          headline: true,
          bio: true,
          hourlyRateCents: true,
          teachesOnline: true,
          teachesInPerson: true,
          teachesAtHome: true,
          city: true,
          stripeCurrentPeriodEnd: true,
          _count: { select: { instruments: true, rules: true } },
        },
      },
      studentProfile: { select: { id: true } },
    },
  });

  const firstName = givenName(user);
  const now = new Date();
  const isTeacher = user.role === "TEACHER";

  const when = (date: Date) =>
    date.toLocaleString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: user.timezone,
    });

  if (isTeacher && user.teacherProfile) {
    const teacher = user.teacherProfile;

    const [pendingRows, upcomingRows, completed, unreadThreads] =
      await Promise.all([
        prisma.booking.findMany({
          where: { teacherId: teacher.id, status: "PENDING", endsAt: { gt: now } },
          orderBy: { startsAt: "asc" },
          take: 5,
          select: {
            id: true,
            startsAt: true,
            isTrial: true,
            instrument: { select: { name: true } },
            student: {
              select: { user: { select: { name: true, firstName: true } } },
            },
          },
        }),
        prisma.booking.findMany({
          where: {
            teacherId: teacher.id,
            status: "CONFIRMED",
            startsAt: { gt: now },
          },
          orderBy: { startsAt: "asc" },
          take: 3,
          select: {
            id: true,
            startsAt: true,
            mode: true,
            isTrial: true,
            instrument: { select: { name: true } },
            student: {
              select: { user: { select: { name: true, firstName: true } } },
            },
          },
        }),
        prisma.booking.aggregate({
          where: { teacherId: teacher.id, status: "COMPLETED" },
          _count: { _all: true },
          _sum: { priceCents: true },
        }),
        messageUnreadCount("TEACHER", teacher.id),
      ]);

    const [pendingCount, upcomingCount] = await Promise.all([
      prisma.booking.count({
        where: { teacherId: teacher.id, status: "PENDING", endsAt: { gt: now } },
      }),
      prisma.booking.count({
        where: {
          teacherId: teacher.id,
          status: "CONFIRMED",
          startsAt: { gt: now },
        },
      }),
    ]);

    // Ce qui empêche la fiche d'être trouvée passe avant tout le reste : c'est
    // la seule chose à faire tant qu'elle n'est pas visible.
    const blocker = visibilityBlocker({
      publishable: checkPublishable({
        headline: teacher.headline,
        bio: teacher.bio,
        hourlyRateCents: teacher.hourlyRateCents,
        teachesOnline: teacher.teachesOnline,
        teachesInPerson: teacher.teachesInPerson,
        teachesAtHome: teacher.teachesAtHome,
        city: teacher.city,
        instrumentCount: teacher._count.instruments,
        availabilityRuleCount: teacher._count.rules,
      }).ok,
      published: teacher.status === "PUBLISHED",
      subscribed: isSubscriptionActive(teacher.stripeCurrentPeriodEnd, now),
    });

    const stats = [
      {
        label: "Demandes en attente",
        value: String(pendingCount),
        highlight: pendingCount > 0,
      },
      { label: "Cours à venir", value: String(upcomingCount) },
      { label: "Cours donnés", value: String(completed._count._all) },
      { label: "CA estimé", value: formatPrice(completed._sum.priceCents ?? 0) },
    ];

    return (
      <div className="flex flex-col gap-10">
        <PageHeader
          size="page"
          eyebrow="Espace professeur"
          title={firstName ? `Bonjour ${firstName}` : "Bonjour"}
          lead="Ce qui attend une réponse, vos prochains cours, et l'essentiel de votre activité."
        />

        {blocker ? <TeacherVisibilityNotice blocker={blocker} /> : null}

        <section>
          {/* Séparateurs en filet plutôt que des cartes : la grille a un fond
              `border` et des cellules `background`, l'écart d'un pixel laisse
              voir le trait entre les chiffres. */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-background p-5">
                <p
                  className={cn(
                    "font-display text-3xl font-semibold leading-none",
                    stat.highlight ? "text-warning" : "text-foreground"
                  )}
                >
                  {stat.value}
                </p>
                <p className="mt-2 text-sm text-muted">{stat.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-subtle">
            CA estimé : total des cours que vous avez clôturés. Le règlement se
            fait directement entre vous et l&apos;élève, hors plateforme.
          </p>
        </section>

        {pendingRows.length > 0 ? (
          <section className="flex flex-col gap-4">
            <SectionTitle
              trailing={
                <Badge variant="warning">
                  {pendingCount} à traiter
                </Badge>
              }
            >
              À traiter
            </SectionTitle>
            <p className="text-sm text-muted">
              Chaque demande bloque son créneau tant que vous n&apos;avez pas
              répondu.
            </p>
            <RowList>
              {pendingRows.map((booking) => (
                <Row
                  key={booking.id}
                  href="/dashboard/prof/demandes"
                  main={
                    <div>
                      <p className="font-medium text-foreground">
                        {givenName(booking.student.user) ?? "Élève"}
                        <span className="text-muted">
                          {" — "}
                          {lessonTitle(booking.instrument.name, booking.isTrial)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-sm text-muted first-letter:uppercase">
                        {when(booking.startsAt)}
                      </p>
                    </div>
                  }
                  meta={<ArrowRight className="mt-1 h-4 w-4 text-subtle" />}
                />
              ))}
            </RowList>
            {pendingCount > pendingRows.length ? (
              <Link
                href="/dashboard/prof/demandes"
                className="text-sm text-primary hover:underline"
              >
                Voir les {pendingCount} demandes →
              </Link>
            ) : null}
          </section>
        ) : null}

        <section className="flex flex-col gap-4">
          <SectionTitle>Prochains cours</SectionTitle>
          {upcomingRows.length === 0 ? (
            <p className="text-sm text-muted">
              Aucun cours confirmé à venir.{" "}
              <Link
                href="/dashboard/prof/agenda"
                className="text-primary hover:underline"
              >
                Ouvrir l&apos;agenda
              </Link>
            </p>
          ) : (
            <RowList>
              {upcomingRows.map((booking) => (
                <Row
                  key={booking.id}
                  href="/dashboard/prof/agenda"
                  main={
                    <div>
                      <p className="font-medium text-foreground">
                        {givenName(booking.student.user) ?? "Élève"}
                        <span className="text-muted">
                          {" — "}
                          {lessonTitle(booking.instrument.name, booking.isTrial)}
                        </span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                        <span className="first-letter:uppercase">
                          {when(booking.startsAt)}
                        </span>
                        {booking.mode === "ONLINE" ? (
                          <Video className="h-3.5 w-3.5 text-subtle" />
                        ) : null}
                      </p>
                    </div>
                  }
                  meta={<ArrowRight className="mt-1 h-4 w-4 text-subtle" />}
                />
              ))}
            </RowList>
          )}
        </section>

        {unreadThreads > 0 ? (
          <Link
            href="/dashboard/messages"
            className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm transition-colors hover:bg-surface"
          >
            <MessageSquare className="h-4 w-4 text-primary" />
            <span className="flex-1">
              {unreadThreads === 1
                ? "1 conversation avec un message non lu"
                : `${unreadThreads} conversations avec des messages non lus`}
            </span>
            <ArrowRight className="h-4 w-4 text-subtle" />
          </Link>
        ) : null}

        <div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/prof/abonnement">
              Gérer mon abonnement
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // ----- Élève
  const student = user.studentProfile;

  const [nextLesson, pendingCount, unreadThreads] = student
    ? await Promise.all([
        prisma.booking.findFirst({
          where: {
            studentId: student.id,
            status: "CONFIRMED",
            endsAt: { gt: now },
          },
          orderBy: { startsAt: "asc" },
          select: {
            id: true,
            startsAt: true,
            mode: true,
            isTrial: true,
            meetingUrl: true,
            address: true,
            instrument: { select: { name: true } },
            teacher: { select: { user: { select: { name: true } } } },
          },
        }),
        prisma.booking.count({
          where: { studentId: student.id, status: "PENDING", endsAt: { gt: now } },
        }),
        messageUnreadCount("STUDENT", student.id),
      ])
    : [null, 0, 0];

  const MODE_LABELS = {
    ONLINE: "en visio",
    TEACHER_PLACE: "chez le prof",
    STUDENT_PLACE: "chez vous",
  } as const;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        size="page"
        eyebrow="Espace élève"
        title={firstName ? `Bonjour ${firstName}` : "Bonjour"}
        lead="Votre prochain cours, vos demandes en attente et vos messages."
      />

      <section className="flex flex-col gap-4">
        <SectionTitle>Prochain cours</SectionTitle>
        {nextLesson ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border p-5">
            <p className="font-display text-xl font-medium text-foreground">
              {lessonTitle(nextLesson.instrument.name, nextLesson.isTrial)} avec{" "}
              {nextLesson.teacher.user.name ?? "votre prof"}
            </p>
            <p className="text-sm text-muted">
              <span className="first-letter:uppercase">
                {when(nextLesson.startsAt)}
              </span>
              {` · ${MODE_LABELS[nextLesson.mode]}`}
              {nextLesson.address ? ` · ${nextLesson.address}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {nextLesson.meetingUrl ? (
                <Button size="sm" asChild>
                  <a
                    href={nextLesson.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Video className="mr-2 h-4 w-4" />
                    Rejoindre le cours
                  </a>
                </Button>
              ) : null}
              <Button size="sm" variant="outline" asChild>
                <Link href="/dashboard/agenda">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Mon agenda
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface px-5 py-4">
            <p className="text-sm text-muted">
              {pendingCount > 0
                ? "Aucun cours confirmé pour l'instant : le prof doit encore répondre à votre demande."
                : "Aucun cours prévu. Trouvez un prof et réservez votre premier créneau."}
            </p>
            <Button size="sm" asChild>
              <Link href="/profs">
                <Search className="mr-2 h-4 w-4" />
                Trouver un prof
              </Link>
            </Button>
          </div>
        )}
      </section>

      {pendingCount > 0 || unreadThreads > 0 ? (
        <section className="flex flex-col gap-2">
          {pendingCount > 0 ? (
            <Link
              href="/dashboard/cours"
              className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm transition-colors hover:bg-surface"
            >
              <CalendarDays className="h-4 w-4 text-warning" />
              <span className="flex-1">
                {pendingCount === 1
                  ? "1 demande en attente de réponse du prof"
                  : `${pendingCount} demandes en attente de réponse`}
              </span>
              <ArrowRight className="h-4 w-4 text-subtle" />
            </Link>
          ) : null}
          {unreadThreads > 0 ? (
            <Link
              href="/dashboard/messages"
              className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm transition-colors hover:bg-surface"
            >
              <MessageSquare className="h-4 w-4 text-primary" />
              <span className="flex-1">
                {unreadThreads === 1
                  ? "1 conversation avec un message non lu"
                  : `${unreadThreads} conversations avec des messages non lus`}
              </span>
              <ArrowRight className="h-4 w-4 text-subtle" />
            </Link>
          ) : null}
        </section>
      ) : null}

      <RowList>
        <Row
          href="/dashboard/cours/profil"
          main={
            <div className="flex items-start gap-3">
              <UserCog className="mt-1 h-5 w-5 shrink-0 text-subtle" />
              <div>
                <p className="font-display text-lg font-medium text-foreground">
                  Mon profil
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  Niveau, objectifs et contact du responsable si vous êtes
                  mineur. C&apos;est ce que le prof lit avec votre demande.
                </p>
              </div>
            </div>
          }
          meta={<ArrowRight className="mt-1 h-4 w-4 text-subtle" />}
        />
      </RowList>
    </div>
  );
}
