import { buildSubscriptionExpiryReminder } from "@/lib/notifications/subscription";
import { sendNotification } from "@/lib/notifications/send";
import prisma from "@/lib/prisma";
import { dueSubscriptionReminders, MAX_LEAD_HOURS } from "./schedule";

/**
 * Envoi des rappels d'expiration d'accès dus.
 *
 * Même dispositif que les rappels de cours (`lib/reminders/run.ts`) :
 * **réserver d'abord** (insérer la ligne `subscription_reminder`, dont
 * l'unicité arbitre la course entre deux passages), **envoyer ensuite**, et
 * relâcher la réservation si l'envoi échoue pour réessayer au passage suivant.
 *
 * On ne vise que les accès **manuels** (`stripeSubscriptionId` nul) : un vrai
 * abonnement Stripe se renouvelle tout seul et Stripe gère lui-même ses e-mails
 * de relance ; envoyer « votre accès expire » à un abonné qui se renouvelle
 * serait faux et anxiogène. Et seulement les fiches **publiées** — une fiche non
 * publiée n'est de toute façon pas visible, il n'y a rien à perdre à prévenir.
 */

export type SubscriptionReminderRun = {
  candidates: number;
  sent: number;
  failed: number;
  skipped: number;
};

export async function runSubscriptionReminders(
  now = new Date()
): Promise<SubscriptionReminderRun> {
  const horizon = new Date(now.getTime() + MAX_LEAD_HOURS * 3_600_000);

  const teachers = await prisma.teacherProfile.findMany({
    where: {
      status: "PUBLISHED",
      // Accès offert / manuel uniquement : pas de vrai abonnement Stripe.
      stripeSubscriptionId: null,
      stripeCurrentPeriodEnd: { gt: now, lte: horizon },
    },
    take: 200,
    select: {
      id: true,
      stripeCurrentPeriodEnd: true,
      user: { select: { name: true, email: true, timezone: true } },
    },
  });

  const run: SubscriptionReminderRun = {
    candidates: teachers.length,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  for (const teacher of teachers) {
    const periodEnd = teacher.stripeCurrentPeriodEnd;
    if (!periodEnd) continue; // filtré par la requête, filet de type

    for (const kind of dueSubscriptionReminders(periodEnd, now)) {
      let claimId: string;

      try {
        const claim = await prisma.subscriptionReminder.create({
          data: { teacherId: teacher.id, kind, periodEnd },
          select: { id: true },
        });
        claimId = claim.id;
      } catch {
        // Déjà réclamé (unicité teacherId+kind+periodEnd) : envoyé, ou pris par
        // un passage concurrent. Ce n'est pas une erreur.
        run.skipped += 1;
        continue;
      }

      const result = await sendNotification(
        buildSubscriptionExpiryReminder({
          teacherName: teacher.user.name,
          teacherEmail: teacher.user.email,
          periodEnd,
          timezone: teacher.user.timezone,
          kind,
          appUrl,
        })
      );

      if (!result.ok) {
        // Envoi raté : on relâche la réservation pour réessayer plus tard.
        await prisma.subscriptionReminder.delete({ where: { id: claimId } });
        run.failed += 1;
        console.error(
          `[ABONNEMENT] rappel ${kind} échoué pour ${teacher.id} : ${result.error}`
        );
        continue;
      }

      run.sent += 1;
    }
  }

  return run;
}
