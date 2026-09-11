import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SubscriptionPanel } from "@/components/subscription-panel";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/teacher/visibility";

/**
 * Abonnement du prof.
 *
 * L'état affiché est celui de la base, alimentée par les webhooks Stripe. Les
 * paramètres `success` et `canceled` de l'URL ne sont qu'un retour de
 * navigation : ils ne prouvent rien, le webhook peut arriver après. L'écran le
 * dit plutôt que d'annoncer une activation qui n'est pas encore enregistrée.
 */
export const metadata: Metadata = { title: "Abonnement" };

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      timezone: true,
      teacherProfile: {
        select: {
          status: true,
          stripeCustomerId: true,
          stripeCurrentPeriodEnd: true,
        },
      },
    },
  });

  if (!user.teacherProfile) redirect("/dashboard");

  const params = await searchParams;
  const profile = user.teacherProfile;

  return (
    <SubscriptionPanel
      isActive={isSubscriptionActive(profile.stripeCurrentPeriodEnd, new Date())}
      currentPeriodEnd={profile.stripeCurrentPeriodEnd?.toISOString() ?? null}
      hasCustomer={profile.stripeCustomerId !== null}
      isPublished={profile.status === "PUBLISHED"}
      timezone={user.timezone}
      flash={params.success ? "success" : params.canceled ? "canceled" : null}
    />
  );
}
