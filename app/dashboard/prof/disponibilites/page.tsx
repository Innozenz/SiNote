import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AgendaViewSwitch } from "@/components/agenda-view-switch";
import { AvailabilityEditor } from "@/components/availability-editor";
import { PageHeader } from "@/components/editorial";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * Onglet « Horaires » de l'agenda : la semaine type et les absences.
 *
 * Même en-tête que les vues jour/semaine/mois — c'est le même écran, vu du
 * côté réglage. L'adresse historique /dashboard/prof/disponibilites est
 * conservée (liens, favoris) ; seule la navigation a changé.
 */
export const metadata: Metadata = { title: "Agenda — horaires" };

const AGENDA = "/dashboard/prof/agenda";

export default async function TeacherAvailabilityPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { timezone: true, teacherProfile: { select: { id: true } } },
  });

  if (!user.teacherProfile) redirect("/dashboard");

  const [slots, exceptions] = await Promise.all([
    prisma.availabilityRule.findMany({
      where: { teacherId: user.teacherProfile.id },
      select: { weekday: true, startMinute: true, endMinute: true },
      orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
    }),
    prisma.availabilityException.findMany({
      where: { teacherId: user.teacherProfile.id, date: { gte: startOfToday() } },
      select: {
        id: true,
        date: true,
        type: true,
        startMinute: true,
        endMinute: true,
        reason: true,
      },
      orderBy: { date: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        size="page"
        eyebrow="Espace professeur"
        title="Agenda"
        lead="Votre semaine type et vos absences : c'est ce qui décide des créneaux proposés aux élèves."
        meta={
          <div className="flex sm:justify-end">
            <AgendaViewSwitch
              view="horaires"
              nav={{
                dayHref: `${AGENDA}?vue=jour`,
                weekHref: AGENDA,
                monthHref: `${AGENDA}?vue=mois`,
              }}
            />
          </div>
        }
      />
      <AvailabilityEditor
        timezone={user.timezone}
        initialSlots={slots}
        initialExceptions={exceptions.map((exception) => ({
          ...exception,
          // Colonne `@db.Date` : on la relit en UTC pour ne pas décaler d'un jour.
          date: exception.date.toISOString().slice(0, 10),
        }))}
      />
    </div>
  );
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}
