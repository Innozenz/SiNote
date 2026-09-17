import { redirect } from "next/navigation";

/**
 * Ancienne adresse de « Mes réservations ».
 *
 * La refonte a fondu réservations, agenda et dossiers dans une seule entrée,
 * « Mes cours », qui est la page d'accueil de l'élève. L'adresse reste servie
 * (favoris, e-mails déjà envoyés) et renvoie là où le contenu vit désormais.
 */
export default function LegacyStudentBookingsPage() {
  redirect("/dashboard");
}
