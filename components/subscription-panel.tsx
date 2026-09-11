"use client";

import { useState } from "react";
import { CreditCard, ExternalLink, Loader2, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/editorial";
import { Badge } from "@/components/ui/badge";
import { FormFailure } from "@/components/form-failure";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { localFailure, postJson, type Failure } from "@/lib/http/failure";

export function SubscriptionPanel({
  isActive,
  currentPeriodEnd,
  hasCustomer,
  isPublished,
  timezone,
  flash,
}: {
  isActive: boolean;
  currentPeriodEnd: string | null;
  hasCustomer: boolean;
  isPublished: boolean;
  timezone: string;
  flash: "success" | "canceled" | null;
}) {
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);
  const [error, setError] = useState<Failure | null>(null);

  const go = async (kind: "checkout" | "portal") => {
    setBusy(kind);
    setError(null);

    const result = await postJson<{ url?: string }>(`/api/stripe/${kind}`, {
      method: "POST",
    });

    if (!result.ok) {
      setError(result.failure);
      setBusy(null);
      return;
    }

    if (!result.data.url) {
      // Réponse 200 sans URL : Stripe n'a rien renvoyé d'exploitable. Le cas
      // ne devrait pas arriver, mais rediriger vers `undefined` sortirait le
      // prof du site sans explication.
      setError(
        localFailure(
          "Stripe n'a pas renvoyé de page de paiement. Réessayez dans un instant."
        )
      );
      setBusy(null);
      return;
    }

    // Pas de `setBusy(null)` : la page est en train de partir vers Stripe, et
    // réactiver le bouton inviterait à un second clic pendant la navigation.
    window.location.href = result.data.url;
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: timezone,
    });

  // Trois états, trois phrases : actif jusqu'à une date, expiré à une date,
  // jamais souscrit. « Inactif » seul ne disait pas à un prof dont l'accès
  // venait d'expirer *que* c'était le cas, ni depuis quand.
  const status = isActive
    ? currentPeriodEnd
      ? `Actif jusqu'au ${formatDate(currentPeriodEnd)}`
      : "Abonnement en cours"
    : currentPeriodEnd
      ? `Votre accès a expiré le ${formatDate(currentPeriodEnd)}`
      : "Aucun abonnement";

  return (
    <div className="flex flex-col gap-8">
      {/* Le retour de Stripe passe par l'URL : l'état réel, lui, arrive par
          webhook et peut avoir quelques secondes de retard. */}
      {flash === "success" && !isActive ? (
        <p className="rounded-lg bg-primary-soft p-4 text-sm">
          Paiement enregistré. L&apos;activation peut prendre quelques
          secondes — rechargez la page si rien ne change.
        </p>
      ) : null}
      {flash === "canceled" ? (
        <p className="rounded-lg bg-surface p-4 text-sm">
          Paiement abandonné. Rien n&apos;a été prélevé.
        </p>
      ) : null}

      <PageHeader
        size="page"
        eyebrow="Espace professeur"
        title="Abonnement"
        lead="L'abonnement rend votre fiche visible des élèves. Les cours, eux, vous sont réglés directement : SiNote ne prend aucune commission."
        meta={
          <div className="flex flex-col gap-2 sm:items-end">
            <Badge variant={isActive ? "success" : "secondary"}>{status}</Badge>
            {/* Le portail Stripe n'existe que pour un client Stripe : sans lui
                la route répond 409, et un prof sur accès manuel ne doit pas
                avoir deux boutons concurrents. */}
            {hasCustomer ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => go("portal")}
              >
                {busy === "portal" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                Gérer mon abonnement
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-col gap-4">
        {isActive ? (
            <>
              <div className="flex items-center gap-2 text-sm text-muted">
                <ShieldCheck className="h-4 w-4 text-success" />
                {currentPeriodEnd
                  ? `Prochain renouvellement le ${formatDate(currentPeriodEnd)}`
                  : "Abonnement en cours"}
              </div>

              {!isPublished ? (
                <p className="rounded-lg bg-warning-soft p-4 text-sm">
                  Votre abonnement est actif mais votre fiche est en brouillon :
                  elle reste invisible tant que vous ne l&apos;avez pas publiée.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm text-muted">
                Sans abonnement, votre fiche n&apos;apparaît ni dans la
                recherche ni à son adresse publique, même publiée.
              </p>

              <Separator />

              <ul className="flex flex-col gap-2 text-sm text-muted">
                <li>— Fiche visible dans la recherche</li>
                <li>— Réservations en ligne sur vos disponibilités</li>
                <li>— Agenda et gestion des demandes</li>
                <li>— Aucune commission sur vos cours</li>
              </ul>

              <Button
                size="lg"
                disabled={busy !== null}
                onClick={() => go("checkout")}
              >
                {busy === "checkout" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                M&apos;abonner
              </Button>
            </>
          )}

          <FormFailure failure={error} />
      </div>
    </div>
  );
}
