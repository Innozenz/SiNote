import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AccountForm, type IdentityData } from "@/components/account-form";
import { PageHeader } from "@/components/editorial";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { splitFullName } from "@/lib/user/name";

/**
 * Compte de l'utilisateur connecté.
 *
 * Sous `/dashboard`, donc derrière la porte de rôle du layout — inutile de la
 * refaire ici. Et **commun aux deux rôles** : le nom appartient à la personne,
 * pas à sa fiche prof ni à son profil élève. Le placer dans l'un des deux
 * écrans de profil aurait imposé de l'écrire deux fois, avec deux routes pour
 * mettre à jour la même colonne.
 */

export const metadata: Metadata = {
  title: "Mon compte",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/connexion");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { email: true, name: true, firstName: true, lastName: true },
  });

  // Un compte créé avant ces deux champs n'a que `name` : on amorce le
  // formulaire avec son découpage plutôt que d'afficher deux champs
  // vides à quelqu'un dont l'application connaît déjà le nom.
  const fallback = splitFullName(user.name);

  const initial: IdentityData = {
    email: user.email,
    firstName: user.firstName ?? fallback.firstName,
    lastName: user.lastName ?? fallback.lastName,
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        size="page"
        eyebrow="Espace connecté"
        title="Mon compte"
        lead="Votre identité sur SiNote, quel que soit votre rôle."
      />
      <AccountForm initial={initial} />
    </div>
  );
}
