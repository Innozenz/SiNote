import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/editorial";
import {
  StudentBookings,
  type StudentBookingRow,
} from "@/components/student-bookings";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { MarkCoursSeen } from "./mark-seen";

/**
 * Cours de l'élève.
 *
 * Pendant de la boîte de réception du prof, avec une différence de fond :
 * l'élève n'a qu'une action, annuler. Confirmer, refuser et clôturer
 * appartiennent au prof, et la machine à états le fait déjà respecter côté
 * serveur — cet écran ne fait que ne pas proposer ce qui serait refusé.
 */
export const metadata: Metadata = { title: "Mes réservations" };

export default async function StudentBookingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { timezone: true, studentProfile: { select: { id: true } } },
  });

  // Un compte prof n'a pas de profil élève : il n'a rien à voir ici.
  if (!user.studentProfile) redirect("/dashboard");

  const bookings = await prisma.booking.findMany({
    where: { studentId: user.studentProfile.id },
    orderBy: { startsAt: "desc" },
    take: 200,
    select: {
      id: true,
      status: true,
      startsAt: true,
      endsAt: true,
      mode: true,
      isTrial: true,
      priceCents: true,
      meetingUrl: true,
      address: true,
      cancellationReason: true,
      // Le compte rendu se lit dans le dossier du prof ; ici on ne dit que
      // s'il existe et s'il a quelque chose à montrer.
      report: {
        select: {
          content: true,
          _count: { select: { attachments: true, comments: true } },
        },
      },
      instrument: { select: { name: true } },
      teacher: {
        select: { id: true, slug: true, user: { select: { name: true } } },
      },
    },
  });

  const rows: StudentBookingRow[] = bookings.map((booking) => ({
    id: booking.id,
    status: booking.status,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    mode: booking.mode,
    isTrial: booking.isTrial,
    priceCents: booking.priceCents,
    meetingUrl: booking.meetingUrl,
    address: booking.address,
    cancellationReason: booking.cancellationReason,
    instrumentName: booking.instrument.name,
    teacherName: booking.teacher.user.name,
    teacherSlug: booking.teacher.slug,
    teacherId: booking.teacher.id,
    hasReport: Boolean(
      booking.report &&
        (booking.report.content ||
          booking.report._count.attachments > 0 ||
          booking.report._count.comments > 0)
    ),
  }));

  return (
    <div className="flex flex-col gap-8">
      <MarkCoursSeen />
      <PageHeader
        size="page"
        eyebrow="Espace élève"
        title="Mes réservations"
        lead="Vos demandes en attente, vos cours à venir et l'historique. Les comptes rendus se lisent dans le dossier de chaque prof."
      />
      <StudentBookings initial={rows} timezone={user.timezone} />
    </div>
  );
}
