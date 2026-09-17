import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Music4 } from "lucide-react";

import { AuthButtons } from "@/components/auth-buttons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Connectez-vous à SiNote pour réserver ou donner des cours.",
  robots: { index: false },
};

/**
 * Connexion et inscription.
 *
 * Page dédiée : la page d'accueil servait d'écran de connexion, ce qui est un
 * reste du boilerplate — elle doit d'abord expliquer le service à un visiteur
 * qui ne connaît pas SiNote.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  // Chemin de retour, p. ex. depuis une fiche prof (« Se connecter pour
  // réserver »). Restreint aux chemins internes : jamais `//` ni `/\` — sans
  // quoi ce serait une redirection ouverte vers un autre site.
  const raw = (await searchParams).callbackUrl ?? "";
  const callbackUrl =
    raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")
      ? raw
      : null;

  // Déjà connecté : renvoyer là où l'utilisateur a affaire.
  if (session?.user) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    // Un rôle posé et un retour demandé : on l'y renvoie (il vient d'une fiche
    // prof). Sans rôle, l'onboarding passe d'abord.
    redirect(
      !user?.role
        ? "/onboarding"
        : (callbackUrl ??
            (user.role === "TEACHER" ? "/dashboard/prof" : "/dashboard"))
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Link
        href="/"
        className="mb-8 flex items-center justify-center gap-2 text-lg font-semibold"
      >
        <Music4 className="h-5 w-5 text-primary" />
        SiNote
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
          <CardDescription>
            Connectez-vous ou créez un compte. Vous choisirez ensuite si vous
            venez apprendre ou enseigner.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuthButtons callbackUrl={callbackUrl} />
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/profs" className="hover:underline">
          Parcourir les profs sans compte
        </Link>
      </p>
    </main>
  );
}
