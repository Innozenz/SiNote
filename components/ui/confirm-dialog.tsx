"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Confirmation d'une action irréversible.
 *
 * Annuler un cours confirmé, refuser une demande, marquer un élève absent :
 * jusqu'ici un seul clic, sans retour possible. Le modèle stocke un motif
 * d'annulation et l'affiche à l'autre partie, mais aucun écran ne le
 * recueillait — d'où le champ facultatif.
 *
 * Contrôlé : l'appelant tient `open`, ce qui lui permet de fermer après un
 * succès et de laisser ouvert après un échec (le message d'erreur reste
 * visible). `onConfirm` reçoit le motif saisi (chaîne vide si aucun).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  reason,
  busy = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  /** Bouton en rouge : l'action retire quelque chose à quelqu'un. */
  destructive?: boolean;
  /** Affiche un champ de motif ; la valeur est le libellé du champ. */
  reason?: { label: string; placeholder?: string };
  busy?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
  /** Contenu supplémentaire (erreur, avertissement) sous la description. */
  children?: React.ReactNode;
}) {
  const [text, setText] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) setText("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {reason ? (
          <div className="mt-4 space-y-1">
            <Label htmlFor="confirm-reason">{reason.label}</Label>
            <Textarea
              id="confirm-reason"
              rows={3}
              value={text}
              maxLength={1000}
              placeholder={reason.placeholder}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        ) : null}

        {children ? <div className="mt-4">{children}</div> : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Retour
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={() => onConfirm(text.trim())}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
