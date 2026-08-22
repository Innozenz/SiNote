import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/editorial";
import {
  StudentBookings,
  type StudentBookingRow,
} from "@/components/student-bookings";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sanitizeReportHtml } from "@/lib/reports/sanitize";
import { MarkCoursSeen } from "./mark-seen";

/**
 * Cours de l'élève.
 *
 * Pendant de la boîte de réception du prof, avec une différence de fond :
 * l'élève n'a qu'une action, annuler. Confirmer, refuser et clôturer
 * appartiennent au prof, et la machine à états le fait déjà respecter côté
 * serveur — cet écran ne fait que ne pas proposer ce qui serait refusé.
 */
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
            },
          },
        },
      },
      instrument: { select: { name: true } },
      teacher: {
        select: { slug: true, user: { select: { name: true } } },
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
    report: booking.report
      ? {
          title: booking.report.title,
          content: booking.report.content
            ? sanitizeReportHtml(booking.report.content)
            : null,
          attachments: booking.report.attachments,
          comments: booking.report.comments.map((c) => ({
            ...c,
            createdAt: c.createdAt.toISOString(),
          })),
        }
      : null,
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <MarkCoursSeen />
      <PageHeader eyebrow="Espace élève" title="Mes réservations" />

      <div className="mt-10">
        <StudentBookings initial={rows} timezone={user.timezone} />
      </div>
    </div>
  );
}
