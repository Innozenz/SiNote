import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  FileText,
  Inbox,
  Search,
  UserCog,
  Users,
} from "lucide-react";

import { PageHeader, Row, RowList } from "@/components/editorial";
import {
  TeacherVisibilityNotice,
  visibilityBlocker,
} from "@/components/teacher-visibility-notice";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPublishable } from "@/lib/teacher/publishable";
import { isSubscriptionActive } from "@/lib/teacher/visibility";
import { givenName } from "@/lib/user/name";
import { cn } from "@/lib/utils";

/** Centimes → euros, sans décimales, séparateur français (« 1 250 € »). */
function formatEuros(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", {
    maximumFractionDigits: 0,
  })} €`;
}

/**
 * Aiguillage de l'espace connecté.
 *
 * Server Component, comme tout ce qui lit un rôle. La version précédente était
 * la démonstration du boilerplate : `"use client"`, framer-motion, une carte
 * « Profil » qui répétait le nom et l'e-mail, un bouton vert « S'abonner » et
 * un bouton rouge « Se déconnecter » — deux couleurs qui n'existent nulle part
 * ailleurs dans le système.
 *
 * Elle affichait surtout un état d'abonnement calculé par une route qui avait
 * dérivé de la règle unique : un prof abonné y lisait « Inactif » pendant que
 * son propre espace lui disait « Actif ». Le doublon disparaît ici ;
 * l'abonnement se gère à un seul endroit, /dashboard/prof/abonnement.
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
    },
  });

  const firstName = givenName(user);

  const now = new Date();

  // Statistiques du prof : ce qui appelle une action (demandes en attente,
  // chacune immobilise un créneau) et ce qui fait le bilan (cours à venir,
  // cours donnés, CA). Le CA est un **estimé** — le règlement se fait hors
  // plateforme — calculé sur les seuls cours clôturés (COMPLETED).
  const [pendingCount, upcomingCount, completed] = user.teacherProfile
    ? await Promise.all([
        prisma.booking.count({
          where: {
            teacherId: user.teacherProfile.id,
            status: "PENDING",
            endsAt: { gt: now },
          },
        }),
        prisma.booking.count({
          where: {
            teacherId: user.teacherProfile.id,
            status: "CONFIRMED",
            startsAt: { gt: now },
          },
        }),
        prisma.booking.aggregate({
          where: { teacherId: user.teacherProfile.id, status: "COMPLETED" },
          _count: { _all: true },
          _sum: { priceCents: true },
        }),
      ])
    : [0, 0, null];

  const lessonsGiven = completed?._count._all ?? 0;
  const caCents = completed?._sum.priceCents ?? 0;

  const isTeacher = user.role === "TEACHER";

  // Ce qui empêche la fiche d'être trouvée passe avant tout le reste : c'est
  // la seule chose à faire tant qu'elle n'est pas visible.
  const blocker = user.teacherProfile
    ? visibilityBlocker({
        publishable: checkPublishable({
          headline: user.teacherProfile.headline,
          bio: user.teacherProfile.bio,
          hourlyRateCents: user.teacherProfile.hourlyRateCents,
          teachesOnline: user.teacherProfile.teachesOnline,
          teachesInPerson: user.teacherProfile.teachesInPerson,
          teachesAtHome: user.teacherProfile.teachesAtHome,
          city: user.teacherProfile.city,
          instrumentCount: user.teacherProfile._count.instruments,
          availabilityRuleCount: user.teacherProfile._count.rules,
        }).ok,
        published: user.teacherProfile.status === "PUBLISHED",
        subscribed: isSubscriptionActive(
          user.teacherProfile.stripeCurrentPeriodEnd,
          new Date()
        ),
      })
    : null;

  const links = isTeacher
    ? [
        {
          href: "/dashboard/prof/demandes",
          icon: Inbox,
          title: "Demandes de cours",
          text:
            pendingCount > 0
              ? `${pendingCount} demande${pendingCount > 1 ? "s" : ""} en attente — chacune bloque son créneau.`
              : "Aucune demande en attente.",
          highlight: pendingCount > 0,
        },
        {
          href: "/dashboard/prof/comptes-rendus",
          icon: FileText,
          title: "Comptes rendus",
          text: "Documentez chaque cours : texte, images, note audio.",
          highlight: false,
        },
        {
          href: "/dashboard/prof/eleves",
          icon: Users,
          title: "Mes élèves",
          text: "Fiches, historique et comptes rendus par élève.",
          highlight: false,
        },
        {
          href: "/dashboard/prof/disponibilites",
          icon: CalendarDays,
          title: "Mes disponibilités",
          text: "La semaine type et les exceptions ponctuelles.",
          highlight: false,
        },
        {
          href: "/dashboard/prof",
          icon: UserCog,
          title: "Ma fiche",
          text: "Présentation, instruments, tarif et règles de réservation.",
          highlight: false,
        },
      ]
    : [
        {
          href: "/dashboard/agenda",
          icon: CalendarDays,
          title: "Mon agenda",
          text: "Vos cours de la semaine en un coup d'œil.",
          highlight: false,
        },
        {
          href: "/dashboard/cours/profil",
          icon: UserCog,
          title: "Mon profil",
          text: "Niveau, objectifs et contact du responsable si vous êtes mineur.",
          highlight: false,
        },
        {
          href: "/profs",
          icon: Search,
          title: "Trouver un prof",
          text: "Par instrument, par ville, ou en visio.",
          highlight: false,
        },
      ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow={isTeacher ? "Espace professeur" : "Espace élève"}
        title={firstName ? `Bonjour ${firstName}` : "Bonjour"}
      />

      {blocker ? (
        <div className="mt-8">
          <TeacherVisibilityNotice blocker={blocker} />
        </div>
      ) : null}

      {isTeacher ? (
        <section className="mt-10">
          {/* Séparateurs en filet plutôt que des cartes : la grille a un fond
              `border` et des cellules `background`, l'écart d'un pixel laisse
              voir le trait entre les chiffres. */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
            {[
              {
                label: "Demandes en attente",
                value: String(pendingCount),
                highlight: pendingCount > 0,
              },
              { label: "Cours à venir", value: String(upcomingCount) },
              { label: "Cours donnés", value: String(lessonsGiven) },
              { label: "CA estimé", value: formatEuros(caCents) },
            ].map((stat) => (
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
      ) : null}

      <RowList className="mt-10">
        {links.map((link) => {
          const Icon = link.icon;

          return (
            <Row
              key={link.href}
              href={link.href}
              main={
                <div className="flex items-start gap-3">
                  <Icon
                    className={cn(
                      "mt-1 h-5 w-5 shrink-0",
                      link.highlight ? "text-warning" : "text-subtle"
                    )}
                  />
                  <div>
                    <p className="font-display text-lg font-medium text-foreground">
                      {link.title}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 text-sm",
                        link.highlight ? "text-warning" : "text-muted"
                      )}
                    >
                      {link.text}
                    </p>
                  </div>
                </div>
              }
              meta={
                <ArrowRight className="mt-1 h-4 w-4 text-subtle transition-transform group-hover:translate-x-0.5" />
              }
            />
          );
        })}
      </RowList>

      {isTeacher ? (
        <div className="mt-8">
          <Button variant="outline" asChild>
            <Link href="/dashboard/prof/abonnement">
              Gérer mon abonnement
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
