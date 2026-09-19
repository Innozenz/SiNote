import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/editorial";
import {
  StudentProfileForm,
  type StudentProfileData,
} from "@/components/student-profile-form";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkStudentProfile } from "@/lib/student/profile";

export const metadata: Metadata = { title: "Mon profil" };

/**
 * Profil de l'élève.
 *
 * La page ne fait que charger : la mise en deux colonnes (formulaire à gauche,
 * « Ce que voit le prof » à droite) vit dans le formulaire lui-même, parce que
 * l'aperçu se nourrit de l'état de saisie en direct et ne peut donc pas être
 * un frère côté serveur. La largeur reste celle du layout.
 */
export default async function StudentProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/");

  // L'identité (nom, photo) appartient à la personne et s'édite dans « Mon
  // compte » : elle n'est lue ici que pour l'aperçu, qui montre la demande
  // telle que le prof la recevra.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      image: true,
      studentProfile: {
        select: {
          birthDate: true,
          guardianName: true,
          guardianEmail: true,
          guardianPhone: true,
          goals: true,
          musicalBackground: true,
          readsSheetMusic: true,
          preferredGenres: true,
          voiceType: true,
          prefersOnline: true,
          city: true,
          instruments: {
            select: {
              level: true,
              yearsPracticed: true,
              ownsInstrument: true,
              instrument: { select: { slug: true, name: true, family: true } },
            },
          },
        },
      },
    },
  });

  const profile = user?.studentProfile;

  if (!profile) redirect("/dashboard");

  const catalogue = await prisma.instrument.findMany({
    select: { slug: true, name: true, family: true },
    orderBy: { name: "asc" },
  });

  const initial: StudentProfileData = {
    ...profile,
    birthDate: profile.birthDate?.toISOString().slice(0, 10) ?? null,
    instruments: profile.instruments.map((entry) => ({
      slug: entry.instrument.slug,
      name: entry.instrument.name,
      family: entry.instrument.family,
      level: entry.level,
      yearsPracticed: entry.yearsPracticed,
      ownsInstrument: entry.ownsInstrument,
    })),
    issues: checkStudentProfile(profile, new Date()),
  };

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        size="page"
        eyebrow="Espace élève"
        title="Mon profil"
        lead="Ce que le prof lit avec chaque demande de cours. À droite, exactement ce qu'il verra."
      />
      <StudentProfileForm
        initial={initial}
        catalogue={catalogue}
        identity={{ name: user.name, image: user.image }}
      />
    </div>
  );
}
