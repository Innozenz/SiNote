import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation",
  robots: { index: false, follow: true },
};

export default function CguPage() {
  return (
    <LegalPage
      eyebrow="Informations"
      title="Conditions générales d'utilisation"
      lead="Les règles du service, pour les élèves comme pour les professeurs."
      updatedOn="2026-09-11"
      sections={[
        {
          title: "Objet",
          paragraphs: [
            "Les présentes conditions régissent l'utilisation de la plateforme SiNote, éditée par [À compléter : raison sociale], qui met en relation des professeurs de musique et de chant indépendants (« professeurs ») et des personnes souhaitant prendre des cours (« élèves »).",
            "SiNote fournit un outil de mise en relation, de réservation et de suivi. Le contrat de cours est conclu directement entre le professeur et l'élève. SiNote n'intervient ni dans la fixation du prix, ni dans son règlement, ni dans l'exécution du cours.",
          ],
        },
        {
          title: "Compte",
          paragraphs: [
            "L'inscription requiert une adresse e-mail valide, un mot de passe et un prénom. L'adresse doit être confirmée avant la première connexion. Chaque personne choisit ensuite, une fois pour toutes, si elle vient apprendre ou enseigner : une fiche de professeur porte une adresse publique et un historique de cours qu'un changement de rôle rendrait orphelins.",
            "L'utilisateur est responsable de la confidentialité de son mot de passe. Une réinitialisation de mot de passe met fin à toutes les sessions ouvertes.",
            "Un élève mineur doit indiquer sa date de naissance et le contact d'un responsable légal ; le professeur doit pouvoir joindre un adulte.",
          ],
        },
        {
          title: "Réservation, confirmation et annulation",
          paragraphs: [
            "Une demande de cours est envoyée sur un créneau que le professeur a déclaré disponible. Elle bloque ce créneau jusqu'à ce que le professeur la confirme ou la refuse. Un cours n'est dû qu'une fois confirmé.",
            "Chaque partie peut annuler un cours avant son début. Le professeur peut définir un délai de préavis ; une annulation par l'élève dans ce délai lui est signalée, sans qu'aucun montant ne soit prélevé par SiNote. Les conditions financières d'une annulation tardive relèvent de l'accord entre le professeur et l'élève.",
            "À l'issue du cours, le professeur le marque comme donné ou signale l'absence de l'élève. Seul un cours marqué comme donné ouvre le droit de laisser un avis.",
          ],
        },
        {
          title: "Prix et règlement des cours",
          paragraphs: [
            "Le tarif horaire affiché sur une fiche est fixé librement par le professeur et donné à titre indicatif. Le règlement des cours s'effectue directement entre l'élève et le professeur, par le moyen qu'ils conviennent, en dehors de SiNote. SiNote ne perçoit aucune commission sur les cours et ne gère aucun litige de paiement entre les parties.",
          ],
        },
        {
          title: "Abonnement des professeurs",
          paragraphs: [
            "La visibilité d'une fiche de professeur dans la recherche et à son adresse publique est conditionnée à un abonnement mensuel de [À compléter : montant TTC] €, sans engagement, réglé par carte via Stripe. L'abonnement se gère, se modifie et se résilie depuis l'espace professeur. À l'expiration de la période payée, la fiche cesse d'être visible ; les cours déjà confirmés et l'historique sont conservés.",
            "Conformément à l'article L221-28 du Code de la consommation, le professeur qui souscrit en tant que consommateur reconnaît que le service est pleinement exécuté dès la mise en ligne de sa fiche et renonce à son droit de rétractation pour la période en cours.",
          ],
        },
        {
          title: "Contenus des utilisateurs",
          paragraphs: [
            "Chaque utilisateur est responsable des contenus qu'il publie : fiche, photo, messages, comptes rendus, avis. Sont interdits les contenus illicites, diffamatoires, discriminatoires, ou portant atteinte aux droits de tiers.",
            "Un avis ne peut être déposé que par un élève ayant suivi un cours confirmé et clôturé par le professeur, dans les soixante jours suivant ce cours. Il est publié immédiatement, signé du prénom de son auteur. Le professeur peut y répondre publiquement et le signaler ; il ne peut ni le modifier ni le supprimer. SiNote peut retirer un avis contraire aux présentes conditions.",
          ],
        },
        {
          title: "Responsabilité",
          paragraphs: [
            "SiNote met en œuvre les moyens raisonnables pour assurer la disponibilité du service, sans garantie d'absence d'interruption. SiNote ne garantit ni la qualité des cours, ni la ponctualité des parties, ni l'exactitude des informations publiées par les utilisateurs.",
            "SiNote peut suspendre ou supprimer un compte en cas de manquement aux présentes conditions, après notification par e-mail sauf urgence.",
          ],
        },
        {
          title: "Droit applicable",
          paragraphs: [
            "Les présentes conditions sont soumises au droit français. En cas de litige, les parties rechercheront une solution amiable avant toute action judiciaire. Le consommateur peut recourir gratuitement au médiateur de la consommation : [À compléter : nom et coordonnées du médiateur].",
          ],
        },
      ]}
    />
  );
}
