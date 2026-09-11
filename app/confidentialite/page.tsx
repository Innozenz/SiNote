import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  robots: { index: false, follow: true },
};

export default function ConfidentialitePage() {
  return (
    <LegalPage
      eyebrow="Informations"
      title="Politique de confidentialité"
      lead="Quelles données SiNote conserve, pourquoi, combien de temps, et vos droits."
      updatedOn="2026-09-11"
      sections={[
        {
          title: "Responsable du traitement",
          paragraphs: [
            "Le responsable du traitement est [À compléter : raison sociale], [À compléter : adresse]. Contact pour toute question relative aux données : [À compléter : adresse e-mail dédiée].",
          ],
        },
        {
          title: "Données collectées",
          paragraphs: [
            "Compte : adresse e-mail, mot de passe (haché), prénom, nom, photo de profil facultative, fuseau horaire.",
            "Profil élève : instruments pratiqués et niveaux, objectifs, parcours, ville, date de naissance, et pour un mineur le nom et le contact (e-mail ou téléphone) d'un responsable légal.",
            "Profil professeur : présentation, instruments enseignés, ville, tarif, disponibilités, date de naissance facultative.",
            "Activité : demandes et réservations de cours, messages échangés, comptes rendus et leurs pièces jointes (images, partitions, notes audio), avis et réponses, signalements.",
            "Abonnement professeur : identifiant client et état d'abonnement transmis par Stripe. SiNote ne stocke aucun numéro de carte.",
            "Technique : journaux de connexion et adresse IP, utilisés pour la sécurité (limitation du nombre de tentatives de connexion).",
          ],
        },
        {
          title: "Finalités et bases légales",
          paragraphs: [
            "Fournir le service de mise en relation, de réservation et de suivi des cours (exécution du contrat).",
            "Envoyer les e-mails liés au compte et aux cours : confirmation d'adresse, réinitialisation de mot de passe, demandes, confirmations, annulations, rappels la veille d'un cours, nouvel avis reçu (exécution du contrat). Aucun e-mail commercial n'est envoyé sans consentement.",
            "Protéger les mineurs en exigeant le contact d'un responsable légal (obligation légale et intérêt légitime).",
            "Assurer la sécurité du service et prévenir les abus (intérêt légitime).",
            "Gérer l'abonnement des professeurs et la facturation (exécution du contrat, obligations comptables).",
          ],
        },
        {
          title: "Destinataires",
          paragraphs: [
            "Les données d'un profil sont visibles des utilisateurs avec lesquels une relation de cours existe : le professeur voit le profil de l'élève qui lui adresse une demande, l'élève voit la fiche publique du professeur. La fiche d'un professeur est publique et indexable par les moteurs de recherche tant que son abonnement est actif.",
            "Sous-traitants : [À compléter : hébergeur] (hébergement de l'application), [À compléter : prestataire de base de données] (base de données), Resend (envoi des e-mails), Stripe (paiement des abonnements), [À compléter : stockage des pièces jointes]. Aucune donnée n'est vendue ni cédée à des tiers à des fins publicitaires.",
          ],
        },
        {
          title: "Durées de conservation",
          paragraphs: [
            "Les données du compte sont conservées tant que le compte existe, puis supprimées dans un délai de [À compléter : délai] après sa suppression, à l'exception des données que la loi impose de conserver (factures d'abonnement : dix ans).",
            "Les journaux techniques sont conservés au plus [À compléter : durée] mois.",
          ],
        },
        {
          title: "Vos droits",
          paragraphs: [
            "Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité de vos données. Prénom, nom et profil se modifient directement depuis votre espace. Pour toute autre demande, écrivez à [À compléter : adresse e-mail dédiée] ; une réponse vous sera apportée sous un mois.",
            "Vous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr).",
          ],
        },
        {
          title: "Cookies",
          paragraphs: [
            "SiNote n'utilise qu'un cookie de session, strictement nécessaire à la connexion, et aucun cookie de mesure d'audience ni de publicité. Ce cookie ne requiert pas de consentement. Le navigateur conserve par ailleurs localement une sélection de créneau en cours pendant la connexion, sans transmission à des tiers.",
          ],
        },
      ]}
    />
  );
}
