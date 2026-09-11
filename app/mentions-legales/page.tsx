import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Mentions légales",
  // Hors index tant que les crochets ne sont pas remplis (voir LegalPage).
  robots: { index: false, follow: true },
};

export default function MentionsLegalesPage() {
  return (
    <LegalPage
      eyebrow="Informations"
      title="Mentions légales"
      lead="Qui édite SiNote, qui l'héberge et comment nous joindre."
      updatedOn="2026-09-11"
      sections={[
        {
          title: "Éditeur du site",
          paragraphs: [
            "Le site sinote.fr est édité par [À compléter : raison sociale ou nom de l'entrepreneur individuel], [À compléter : forme juridique et capital le cas échéant], immatriculée sous le numéro [À compléter : SIREN / RCS], dont le siège est situé [À compléter : adresse complète].",
            "Directeur de la publication : [À compléter : prénom et nom].",
            "Contact : [À compléter : adresse e-mail de contact].",
          ],
        },
        {
          title: "Hébergement",
          paragraphs: [
            "Le site est hébergé par [À compléter : nom de l'hébergeur], [À compléter : adresse et pays de l'hébergeur]. La base de données est hébergée par [À compléter : prestataire de base de données et région].",
          ],
        },
        {
          title: "Nature du service",
          paragraphs: [
            "SiNote est une plateforme de mise en relation entre des professeurs de musique et de chant indépendants et des élèves. SiNote n'est pas partie au contrat de cours conclu entre le professeur et l'élève : le règlement des cours s'effectue directement entre eux, en dehors de la plateforme, et SiNote ne perçoit aucune commission sur ces cours.",
            "Les professeurs souscrivent un abonnement mensuel pour rendre leur fiche visible. Les paiements d'abonnement sont traités par Stripe Payments Europe Ltd.",
          ],
        },
        {
          title: "Propriété intellectuelle",
          paragraphs: [
            "La marque, le logo, la charte graphique et les contenus rédigés par SiNote sont protégés par le droit de la propriété intellectuelle. Les contenus publiés par les utilisateurs (fiches, photos, comptes rendus, avis) restent la propriété de leurs auteurs, qui accordent à SiNote une licence non exclusive d'affichage pour les besoins du service.",
          ],
        },
        {
          title: "Données personnelles",
          paragraphs: [
            "Le traitement des données personnelles est décrit dans la politique de confidentialité, accessible depuis le pied de page.",
          ],
        },
      ]}
    />
  );
}
