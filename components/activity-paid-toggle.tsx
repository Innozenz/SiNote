"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

import { postJson, type Failure } from "@/lib/http/failure";
import { cn } from "@/lib/utils";

/**
 * Bascule « réglé / à encaisser » d'un cours donné, depuis le journal d'activité.
 *
 * Îlot client au sein d'une page serveur : il écrit `paidAt` via
 * `PATCH /api/bookings/[id]` (aucun débit — l'élève paie le prof en direct),
 * puis `router.refresh()` pour que les chiffres du haut (encaissé, reste à
 * encaisser) se recalculent côté serveur. Optimiste : l'état bascule tout de
 * suite et revient en arrière si l'appel échoue.
 */
export function ActivityPaidToggle({
  bookingId,
  paid: initialPaid,
}: {
  bookingId: string;
  paid: boolean;
}) {
  const router = useRouter();
  const [paid, setPaid] = useState(initialPaid);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = async () => {
    const next = !paid;
    setPaid(next);
    setFailure(null);

    const result = await postJson(`/api/bookings/${bookingId}`, {
      method: "PATCH",
      body: JSON.stringify({ paid: next }),
    });

    if (!result.ok) {
      setPaid(!next); // on remet l'état d'avant l'échec
      setFailure(result.failure);
      return;
    }

    // Rafraîchit les agrégats serveur (encaissé / reste à encaisser).
    startTransition(() => router.refresh());
  };

  const busy = pending;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={paid}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60",
          paid
            ? "border-success/30 bg-success-soft text-success"
            : "border-border text-muted hover:border-border-strong hover:text-foreground"
        )}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check
            className={cn("h-3.5 w-3.5", paid ? "opacity-100" : "opacity-40")}
          />
        )}
        {paid ? "Réglé" : "À encaisser"}
      </button>
      {failure ? (
        <span className="text-xs text-danger">{failure.message}</span>
      ) : null}
    </div>
  );
}
