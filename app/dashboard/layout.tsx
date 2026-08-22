import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { isStudentNews } from "@/lib/bookings/student-news";
import { messageUnreadCount } from "@/lib/messages/unread-count";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * Porte d'entrée de l'espace connecté.
 *
 * C'est ici, et pas dans le proxy, que se fait le contrôle du rôle. Le proxy
 * pourrait le faire — sous Next 16 il tourne sur le runtime Node, il n'est plus
 * cantonné à l'edge —, mais on ne veut pas d'une requête Prisma à chaque
 * requête `/dashboard/*` qu'il intercepte. Le layout, lui, lit la base une fois
 * par navigation et redirige vers l'onboarding tant que `role` est nul.
 *
 * Ce layout porte aussi le shell de tout l'espace : une seule barre latérale
 * (marque, navigation, compte) au lieu d'un en-tête. Elle couvre donc le hub
 * /dashboard comme les sous-espaces prof et élève, dont les layouts ne gardent
 * plus que leur contrôle de rôle. Chaque page se re-plafonne elle-même
 * (formulaires à `max-w-4xl`, agenda pleine largeur) ; le `main` ne pose que le
 * gouttière et la marge verticale.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/");
  }

  // L'identité voyage avec le rôle : la sidebar l'affiche, et la lire ici plutôt
  // que côté client évite à la fois une requête et un nom périmé après un
  // changement sur /dashboard/compte.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      isAdmin: true,
      name: true,
      email: true,
      image: true,
      teacherProfile: { select: { id: true, reportsSeenAt: true } },
      studentProfile: {
        select: { id: true, coursSeenAt: true, reportsSeenAt: true },
      },
    },
  });

  // Cet espace est celui d'un prof ou d'un élève. Sans rôle marketplace, un
  // admin n'a rien à y faire : on l'envoie à son espace plutôt qu'à l'onboarding
  // (qui l'obligerait à se choisir prof/élève). Sinon, onboarding.
  if (!user || (user.role !== "TEACHER" && user.role !== "STUDENT")) {
    redirect(user?.isAdmin ? "/admin/utilisateurs" : "/onboarding");
  }

  // Compteurs de la barre latérale, en parallèle — un rôle n'en alimente que
  // les siens :
  // - « Demandes » (prof) : une demande en attente immobilise un créneau ;
  // - « Mes cours » (élève) : le prof a tranché depuis la dernière visite (même
  //   règle que `isStudentNews` ; un élève a peu de cours, on filtre en mémoire) ;
  // - « Messages » : fils non lus, comptés en une requête indexée plutôt qu'en
  //   rapatriant les messages (cf. `messageUnreadCount`).
  // - « Comptes rendus » (prof) / « Mes dossiers » (élève) : commentaires de
  //   compte rendu écrits par l'autre partie depuis la dernière consultation
  //   (`reportsSeenAt`), même patron que « Mes cours ».
  const teacherProfile = user.teacherProfile;
  const studentProfile = user.studentProfile;
  const profile = teacherProfile ?? studentProfile;

  const [
    pendingCount,
    studentNewsCount,
    messagesUnread,
    reportCommentsUnread,
  ] = await Promise.all([
    teacherProfile
      ? prisma.booking.count({
          where: {
            teacherId: teacherProfile.id,
            status: "PENDING",
            endsAt: { gt: new Date() },
          },
        })
      : Promise.resolve(0),
    studentProfile
      ? prisma.booking
          .findMany({
            where: { studentId: studentProfile.id },
            take: 200,
            select: {
              status: true,
              confirmedAt: true,
              cancelledAt: true,
              cancelledById: true,
              updatedAt: true,
            },
          })
          .then(
            (recent) =>
              recent.filter((b) =>
                isStudentNews(b, studentProfile.coursSeenAt, session.user.id)
              ).length
          )
      : Promise.resolve(0),
    profile
      ? messageUnreadCount(teacherProfile ? "TEACHER" : "STUDENT", profile.id)
      : Promise.resolve(0),
    teacherProfile
      ? prisma.message.count({
          where: {
            teacherId: teacherProfile.id,
            reportId: { not: null },
            sender: "STUDENT",
            createdAt: { gt: teacherProfile.reportsSeenAt },
          },
        })
      : studentProfile
        ? prisma.message.count({
            where: {
              studentId: studentProfile.id,
              reportId: { not: null },
              sender: "TEACHER",
              createdAt: { gt: studentProfile.reportsSeenAt },
            },
          })
        : Promise.resolve(0),
  ]);

  return (
    <div className="lg:flex">
      <DashboardSidebar
        role={user.role}
        isAdmin={user.isAdmin}
        user={{ name: user.name, email: user.email, image: user.image }}
        badges={{
          "/dashboard/prof/demandes": pendingCount,
          "/dashboard/prof/comptes-rendus": teacherProfile ? reportCommentsUnread : 0,
          "/dashboard/cours": studentNewsCount,
          "/dashboard/dossiers": studentProfile ? reportCommentsUnread : 0,
          "/dashboard/messages": messagesUnread,
        }}
      />
      <main className="min-w-0 flex-1 px-4 py-8 lg:py-10">{children}</main>
    </div>
  );
}
