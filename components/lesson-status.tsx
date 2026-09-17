import type { BookingStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";

/**
 * Libellés et teintes d'un état de cours, en **un seul endroit**.
 *
 * Les mêmes six mots étaient recopiés dans l'agenda, la boîte de réception et
 * la fiche élève, avec déjà deux orthographes pour NO_SHOW (« Non honoré » ici,
 * « Absent » là). Un état affiché sous deux noms se lit comme deux états : le
 * prof qui passe de son agenda à ses demandes doit retrouver le même mot.
 *
 * Et la règle de couleur du site s'applique telle quelle : la teinte nomme
 * l'état du **cours** (ambre en attente, bleu confirmé, vert terminé, rouge
 * absent), jamais autre chose ; annulé et refusé n'ont plus d'état à colorer.
 */
export const LESSON_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: "En attente",
  CONFIRMED: "Confirmé",
  COMPLETED: "Terminé",
  NO_SHOW: "Absent",
  CANCELLED: "Annulé",
  DECLINED: "Refusé",
};

export const LESSON_STATUS_VARIANTS: Record<
  BookingStatus,
  "default" | "secondary" | "success" | "warning" | "destructive"
> = {
  PENDING: "warning",
  CONFIRMED: "default",
  COMPLETED: "success",
  NO_SHOW: "destructive",
  CANCELLED: "secondary",
  DECLINED: "secondary",
};

export function LessonStatusBadge({
  status,
  className,
}: {
  status: BookingStatus;
  className?: string;
}) {
  return (
    <Badge variant={LESSON_STATUS_VARIANTS[status]} className={className}>
      {LESSON_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Où se donne le cours, dit du point de vue du prof. */
export const LESSON_MODE_LABELS: Record<
  "ONLINE" | "TEACHER_PLACE" | "STUDENT_PLACE",
  string
> = {
  ONLINE: "Visio",
  TEACHER_PLACE: "Chez vous",
  STUDENT_PLACE: "Chez l'élève",
};
