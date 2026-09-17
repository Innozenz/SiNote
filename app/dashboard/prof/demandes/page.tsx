import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/editorial";
import {
  TeacherBookings,
  type BookingRow,
  type BookingTab,
} from "@/components/teacher-bookings";
import {
  TeacherVisibilityNotice,
  visibilityBlocker,
} from "@/components/teacher-visibility-notice";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { guardianSummary } from "@/lib/student/profile";
import { checkPublishable } from "@/lib/teacher/publishable";
import { isSubscriptionActive } from "@/lib/teacher/visibility";

/**
 * Boîte de réception du prof.
 *
 * Chargée côté serveur : le prof arrive sur ses demandes affichées, sans état
 * de chargement. Les actions passent ensuite par PATCH /api/bookings/[id], qui
 * porte la machine à états — cet écran n'en réimplémente aucune règle.
 */
export const metadata: Metadata = { title: "Demandes de cours" };

/**
 * L'onglet d'arrivée vit dans l'URL. L'accueil renvoie directement sur « à
 * clôturer » : sans ce paramètre, le prof atterrissait sur « en attente » et
 * devait retrouver lui-même ce qu'on venait de lui montrer.
 */
const TABS: Record<string, BookingTab> = {
  "en-attente": "pending",
  "a-venir": "upcoming",
  "a-cloturer": "toReview",
  historique: "past",
};

export default async function TeacherBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
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
    },
  });

  if (!user.teacherProfile) redirect("/dashboard");

  const bookings = await prisma.booking.findMany({
    where: { teacherId: user.teacherProfile.id },
    orderBy: { startsAt: "desc" },
    take: 200,
    select: {
      id: true,
      status: true,
      startsAt: true,
      endsAt: true,
      createdAt: true,
      mode: true,
      isTrial: true,
      priceCents: true,
      studentMessage: true,
      instrument: { select: { id: true, name: true, family: true } },
      student: {
        select: {
          user: { select: { name: true } },
          // Profil complet : le prof peut le consulter à l'ouverture d'une
          // demande. Le résumé de carte reste ciblé (niveau sur l'instrument
          // demandé, objectifs, responsable si mineur) ; la modale montre tout.
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
          instruments: {
            select: {
              instrumentId: true,
              level: true,
              yearsPracticed: true,
              ownsInstrument: true,
              instrument: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const now = new Date();
  const { onglet } = await searchParams;

  const rows: BookingRow[] = bookings.map((booking) => {
    const student = booking.student;
    // Niveau sur l'instrument demandé, pas sur les autres : un élève avancé au
    // piano peut être débutant au chant.
    const practice = student.instruments.find(
      (entry) => entry.instrumentId === booking.instrument.id
    );
    const guardian = guardianSummary(student, now);

    return {
      id: booking.id,
      status: booking.status,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      createdAt: booking.createdAt.toISOString(),
      mode: booking.mode,
      isTrial: booking.isTrial,
      priceCents: booking.priceCents,
      studentMessage: booking.studentMessage,
      instrumentName: booking.instrument.name,
      instrumentFamily: booking.instrument.family,
      studentName: student.user.name,
      studentLevel: practice?.level ?? null,
      studentYears: practice?.yearsPracticed ?? null,
      studentOwnsInstrument: practice?.ownsInstrument ?? null,
      studentReadsSheetMusic: student.readsSheetMusic,
      studentGoals: student.goals,
      studentAge: guardian.age,
      guardianContact: guardian.contact,
      studentIsMinor: guardian.isMinor,
      // Profil complet, pour la modale « Voir le profil ».
      studentProfile: {
        age: guardian.age,
        isMinor: guardian.isMinor,
        city: student.city,
        goals: student.goals,
        background: student.musicalBackground,
        readsSheetMusic: student.readsSheetMusic,
        voiceType: student.voiceType,
        prefersOnline: student.prefersOnline,
        genres: student.preferredGenres,
        instruments: student.instruments.map((entry) => ({
          name: entry.instrument.name,
          level: entry.level,
          yearsPracticed: entry.yearsPracticed,
          ownsInstrument: entry.ownsInstrument,
        })),
        guardian: {
          name: student.guardianName,
          email: student.guardianEmail,
          phone: student.guardianPhone,
        },
      },
    };
  });

  const profile = user.teacherProfile;

  // L'avertissement ne s'affiche que quand rien n'est en cours — ni demande
  // à traiter, ni cours confirmé à venir. Un prof dont l'agenda vit sait que
  // sa fiche fonctionne, et le répéter serait du bruit ; un prof qui n'a que
  // de l'historique et une fiche invisible, lui, conclurait que personne ne
  // cherche de cours.
  const live = bookings.some(
    (booking) =>
      (booking.status === "PENDING" || booking.status === "CONFIRMED") &&
      booking.endsAt > now
  );
  const blocker = !live
      ? visibilityBlocker({
          publishable: checkPublishable({
            headline: profile.headline,
            bio: profile.bio,
            hourlyRateCents: profile.hourlyRateCents,
            teachesOnline: profile.teachesOnline,
            teachesInPerson: profile.teachesInPerson,
            teachesAtHome: profile.teachesAtHome,
            city: profile.city,
            instrumentCount: profile._count.instruments,
            availabilityRuleCount: profile._count.rules,
          }).ok,
          published: profile.status === "PUBLISHED",
          subscribed: isSubscriptionActive(profile.stripeCurrentPeriodEnd, now),
        })
      : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        size="page"
        eyebrow="Espace professeur"
        title="Demandes de cours"
        lead="Les demandes à traiter, les cours à venir, ceux à clôturer, et l'historique."
      />
      {blocker ? <TeacherVisibilityNotice blocker={blocker} /> : null}
      <TeacherBookings
        initial={rows}
        timezone={user.timezone}
        initialTab={(onglet && TABS[onglet]) || "pending"}
      />
    </div>
  );
}
