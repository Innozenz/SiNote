import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { StudentHome } from "@/components/home/student-home";
import { TeacherHome } from "@/components/home/teacher-home";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { givenName } from "@/lib/user/name";

/**
 * Accueil de l'espace connecté.
 *
 * Server Component, comme tout ce qui lit un rôle. Il aiguille vers l'accueil
 * du rôle — « Aujourd'hui » pour un prof, « Mes cours » pour un élève — qui
 * vivent chacun dans leur composant : les deux n'ont rien en commun, et un
 * seul fichier les mêlait sur cinq cents lignes.
 */
export const metadata: Metadata = { title: "Accueil" };

export default async function DashboardPage({
  searchParams,
}: {
  // L'accueil de l'élève porte un mini-mois dont le mois affiché vit dans
  // l'URL (`?mois=AAAA-MM`), comme la semaine de l'agenda du prof : partageable,
  // rendu côté serveur, bouton retour correct. La page se contente de le
  // transmettre.
  searchParams: Promise<{ mois?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/connexion");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { name: true, firstName: true, role: true, timezone: true },
  });

  const props = {
    userId: session.user.id,
    firstName: givenName(user),
    timezone: user.timezone,
  };

  return user.role === "TEACHER" ? (
    <TeacherHome {...props} />
  ) : (
    <StudentHome {...props} month={(await searchParams).mois} />
  );
}
