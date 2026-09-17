import { redirect } from "next/navigation";

/**
 * Ancienne adresse de « Mon agenda ».
 *
 * La grille hebdomadaire, presque toujours vide pour un élève à deux cours par
 * mois, est remplacée par le mini-mois de « Mes cours ». L'adresse renvoie là.
 */
export default function LegacyStudentAgendaPage() {
  redirect("/dashboard");
}
