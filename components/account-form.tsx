"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { SectionTitle } from "@/components/editorial";
import { FormFailure } from "@/components/form-failure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localFailure, postJson, type Failure } from "@/lib/http/failure";
import { notifySuccess } from "@/lib/toast";

export type IdentityData = {
  email: string;
  firstName: string;
  lastName: string;
};

/**
 * Prénom et nom du compte connecté.
 *
 * Deux champs et non un seul : la coupure d'un nom complet ne se devine pas, et
 * c'est le prénom qui signe les avis publics (voir `lib/user/name.ts`).
 */
export function AccountForm({ initial }: { initial: IdentityData }) {
  const router = useRouter();
  const [identity, setIdentity] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Failure | null>(null);

  const save = async () => {
    setError(null);

    // Vérifié ici aussi : le serveur refuserait, mais faire l'aller-retour pour
    // apprendre qu'un champ vide est vide n'apprend rien à personne.
    if (!identity.firstName.trim()) {
      setError(
        localFailure(
          "Le prénom est obligatoire : c'est lui qui signe vos avis et qui vous nomme auprès des profs."
        )
      );
      return;
    }

    setIsSaving(true);

    try {
      const result = await postJson<IdentityData>("/api/user/identity", {
        method: "PATCH",
        body: JSON.stringify({
          firstName: identity.firstName,
          lastName: identity.lastName,
        }),
      });

      if (!result.ok) {
        setError(result.failure);
        return;
      }

      setIdentity(result.data);
      notifySuccess("Nom enregistré.");

      // L'en-tête affiche le nom et ses initiales. Il les reçoit du layout, un
      // Server Component, donc `refresh()` suffit à les remettre à jour. Tant
      // qu'il lisait `authClient.useSession()`, rien n'y faisait : Better Auth
      // garde la session en cache côté client, et on enregistrait son nom pour
      // continuer à voir l'ancien juste au-dessus.
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    // Un vrai `<form>` : Entrée dans un champ enregistre, comme partout ailleurs.
    <form
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        if (!isSaving) void save();
      }}
    >
      <section className="flex flex-col gap-5">
        <div>
          <SectionTitle>Identité</SectionTitle>
          <p className="mt-2 text-sm text-muted">
            Votre nom apparaît sur vos demandes de cours. Les avis que vous
            écrivez sont signés de votre prénom seul.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                value={identity.firstName}
                maxLength={80}
                autoComplete="given-name"
                onChange={(event) =>
                  setIdentity({ ...identity, firstName: event.target.value })
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                value={identity.lastName}
                maxLength={80}
                autoComplete="family-name"
                onChange={(event) =>
                  setIdentity({ ...identity, lastName: event.target.value })
                }
              />
              <p className="text-xs text-subtle">Facultatif.</p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Adresse e-mail</Label>
            <Input id="email" value={identity.email} autoComplete="email" disabled readOnly />
            {/* Dire pourquoi c'est bloqué : un champ grisé sans explication
                passe pour une fonctionnalité oubliée. */}
            <p className="text-xs text-subtle">
              L&apos;adresse ne se change pas ici : elle sert à vous connecter
              et doit être revérifiée avant d&apos;être remplacée.
            </p>
          </div>
        </div>
      </section>

      <FormFailure failure={error} onRetry={save} />

      {/* Même barre que les autres formulaires : un bouton collant sans fond
          passe par-dessus le contenu qu'il survole. */}
      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-end gap-3">
          <span className="text-sm text-subtle">
            Les modifications ne sont enregistrées qu&apos;ici.
          </span>
          <Button type="submit" size="lg" disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Enregistrer
          </Button>
        </div>
      </div>
    </form>
  );
}
