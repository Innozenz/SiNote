import { NextResponse } from "next/server";
import Stripe from "stripe";

import { requireAdmin } from "@/lib/admin/session";
import prisma from "@/lib/prisma";
import { avatarKey } from "@/lib/storage/keys";
import { deletePrivate, deletePublic } from "@/lib/storage/objects";
import { stripe } from "@/lib/stripe";

/**
 * Suppression d'un compte par un administrateur.
 *
 * **Un administrateur ne se supprime pas ici**, ni lui-même ni un autre : la
 * capacité `isAdmin` ne s'accorde qu'à la main en base (voir
 * `lib/admin/session.ts`), et elle se retire de la même façon. Une interface
 * qui permettrait de retirer le dernier administrateur laisserait la plateforme
 * sans personne pour l'administrer.
 *
 * Ce qui part avec le compte, par cascade en base : le profil, ses cours (donc
 * aussi l'historique de l'autre partie), ses avis donnés et reçus, ses messages
 * et comptes rendus. Deux choses ne suivent pas la cascade et sont traitées
 * ici :
 *
 * - **l'abonnement Stripe** d'un prof : le résilier d'abord, sinon un compte
 *   disparu continue d'être facturé. Si Stripe refuse, on **refuse la
 *   suppression** — laisser une facturation sans compte serait pire que de
 *   demander à l'admin de réessayer.
 * - **les objets stockés** (photo, pièces jointes) : leurs clés sont relevées
 *   avant la suppression, puis effacées au mieux après. Base d'abord, stockage
 *   ensuite : un objet orphelin ne coûte rien, une ligne qui pointe vers un
 *   objet disparu casse un écran.
 *
 * Aucune notification n'est envoyée aux profs ou élèves qui avaient un cours
 * avec ce compte, et aucune trace d'audit n'est gardée — même limite que la
 * modération des avis, tolérable tant qu'il n'y a qu'un administrateur.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();

    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: admin.status });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        isAdmin: true,
        image: true,
        teacherProfile: {
          select: { id: true, stripeSubscriptionId: true },
        },
        studentProfile: { select: { id: true } },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur introuvable." },
        { status: 404 }
      );
    }

    if (user.isAdmin) {
      return NextResponse.json(
        { error: "Un administrateur ne peut pas être supprimé." },
        { status: 409 }
      );
    }

    // Clés des objets à effacer, relevées tant que les lignes existent.
    const storageKeys = await collectStorageKeys({
      teacherId: user.teacherProfile?.id ?? null,
      studentId: user.studentProfile?.id ?? null,
    });

    const subscriptionId = user.teacherProfile?.stripeSubscriptionId ?? null;
    if (subscriptionId) {
      const cancelled = await cancelStripeSubscription(subscriptionId);
      if (!cancelled) {
        return NextResponse.json(
          {
            error:
              "L'abonnement Stripe n'a pas pu être résilié. Le compte n'a pas été supprimé.",
          },
          { status: 502 }
        );
      }
    }

    await prisma.user.delete({ where: { id: user.id } });

    // Au mieux, après la base : un échec ici laisse un objet orphelin, sans
    // conséquence pour l'application.
    await Promise.all([
      ...(user.image
        ? [
            deletePublic(avatarKey(user.id)).catch((error) =>
              console.error("[ADMIN_USER_DELETE_AVATAR_ERROR]", error)
            ),
          ]
        : []),
      ...storageKeys.map((key) =>
        deletePrivate(key).catch((error) =>
          console.error("[ADMIN_USER_DELETE_OBJECT_ERROR]", key, error)
        )
      ),
    ]);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("[ADMIN_USER_DELETE_ERROR]", error);
    return NextResponse.json(
      { error: "Impossible de supprimer le compte." },
      { status: 500 }
    );
  }
}

/**
 * Clés des pièces jointes (comptes rendus et messages) de tous les cours et
 * fils où ce compte est partie, prof ou élève.
 */
async function collectStorageKeys(ids: {
  teacherId: string | null;
  studentId: string | null;
}): Promise<string[]> {
  const party = [
    ...(ids.teacherId ? [{ teacherId: ids.teacherId }] : []),
    ...(ids.studentId ? [{ studentId: ids.studentId }] : []),
  ];

  if (party.length === 0) return [];

  const [reports, messages] = await Promise.all([
    prisma.reportAttachment.findMany({
      where: { report: { booking: { OR: party } } },
      select: { storageKey: true },
    }),
    prisma.messageAttachment.findMany({
      where: { message: { OR: party } },
      select: { storageKey: true },
    }),
  ]);

  return [...reports, ...messages].map((row) => row.storageKey);
}

/**
 * Résilie l'abonnement immédiatement. Un abonnement déjà résilié ou inconnu de
 * Stripe (requête invalide) compte comme résilié : il n'y a plus rien à
 * facturer. Toute autre erreur (réseau, clé) est un vrai échec.
 */
async function cancelStripeSubscription(subscriptionId: string): Promise<boolean> {
  try {
    await stripe.subscriptions.cancel(subscriptionId);
    return true;
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      console.info(
        `[ADMIN_USER_DELETE] abonnement ${subscriptionId} déjà résilié ou inconnu : ${error.message}`
      );
      return true;
    }
    console.error("[ADMIN_USER_DELETE_STRIPE_ERROR]", error);
    return false;
  }
}
