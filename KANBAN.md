# SiNote — Kanban

Suivi du projet : ce qui est fait, ce qui vient ensuite, et les idées pour plus tard.
Marketplace où des élèves trouvent un prof de musique/chant et réservent des cours. Les profs s'abonnent à la plateforme ; les élèves règlent le prof directement, hors ligne (pas de paiement en ligne).

---

## ✅ Fait

### Fondations
- [x] Authentification e-mail + mot de passe (Better Auth), réinitialisation de mot de passe, limitation de débit
- [x] Onboarding : choix du rôle (prof / élève), rôle non modifiable ensuite
- [x] Modèle de données (Prisma / PostgreSQL Neon) : profils, instruments, disponibilités, réservations, avis
- [x] Moteur de disponibilités (règles + exceptions, calcul des créneaux, juste au changement d'heure)
- [x] Cycle de vie des réservations (machine à états) + garde anti-double-réservation (contrainte Postgres)
- [x] **Stockage de fichiers Scaleway** (Object Storage fr-par, RGPD) : bucket public (photos) + bucket privé (partitions/audio/comptes rendus) via URLs signées. Vérifié de bout en bout (upload, EXIF retiré, suppression)
- [x] **Relation prof ↔ élève** : fil persistant (modèle `Message`) + note privée (`TeacherStudentNote`), socle des fiches élèves

### Marketplace public
- [x] Page d'accueil (hero **médaillon gravé animé**, **searchbar** instrument/ville, **profs en vedette**, titres à fleuron) — direction « Bleu conservatoire »
- [x] Recherche `/profs` (filtres dans l'URL, classement bayésien, indexable, **photo du prof dans les résultats**)
- [x] Fiche prof publique (SEO, JSON-LD, créneaux groupés matin/après-midi/soir)
- [x] Widget de réservation (créneaux réels, une demande en quelques clics) — **tunnel sans impasse** : appel à l'action selon le visiteur (se connecter / créer un profil élève / réserver), retour sur la fiche après connexion (callbackUrl à travers l'onboarding), sélection conservée, squelette de chargement, confirmation renforcée
- [x] Âge sur les profils (prof : optionnel et opt-in sur la fiche publique ; élève : affiché sur la fiche)

### Espace prof
- [x] Ma fiche (présentation, instruments, tarif, règles de réservation, publier/dépublier)
- [x] Disponibilités (semaine type + congés, **+ indisponibilités ponctuelles sur une plage horaire**)
- [x] Demandes de cours (boîte de réception, confirmer/refuser/clôturer)
- [x] **Photo de profil** (sur `User`, publique côté prof ; traitée par sharp — redim/WebP/EXIF retiré)
- [x] **Comptes rendus de cours** : écrit par le prof, lu par l'élève, accroché au `Booking`. **Éditeur riche (TipTap, HTML assaini côté serveur)**, texte en **lecture/édition** (bouton Modifier), pièces jointes **groupées par type** (images/audio/partitions) + notes audio (lecteur sur mesure), visionneuse d'images plein écran, **pliage/dépliage animé**, accès direct **depuis l'agenda**
- [x] **Fiches élèves** (façon fiche client) : profil, historique, comptes rendus, messages, note privée — en onglets, avec filtres (recherche, instrument, **dates**) et **rédaction/édition des comptes rendus directement depuis la fiche**
- [x] **Messagerie prof ↔ élève** (asynchrone) : commentaires par compte rendu + fil général, notif e-mail, horodatage. Pièces jointes + notes audio dans les fils, via le stockage
- [x] Avis reçus + droit de réponse + signalement
- [x] Abonnement Stripe (checkout, portail, visibilité dérivée de l'abonnement)
- [x] **Suivi d'activité** : revenus par période, filtres, graphe mensuel, par instrument/élève, journal, export CSV
- [x] **Stats sur le tableau de bord** (demandes, cours à venir/donnés, CA estimé)

### Espace élève
- [x] Mes cours (demandes, à venir, historique, annulation)
- [x] Mon profil (niveau par instrument, objectifs, responsable si mineur)
- [x] Dépôt d'avis après un cours clôturé
- [x] **Dossier partagé** (pendant de la fiche élève) : cours, comptes rendus, échanges — en onglets, note privée du prof exclue
- [x] **Signal in-app** : pastille « Mes cours » quand le prof tranche une demande (confirmé / refusé / annulé), vidée à la consultation

### Messagerie
- [x] **Boîte de réception agrégée** (`/dashboard/messages`) : tous les fils prof↔élève au même endroit, aperçu du dernier message, tri par récence, des deux côtés
- [x] **Non-lus** : compteur par conversation + pastille « Messages » dans la barre (repère de lecture par participant, marqué lu à l'ouverture du fil, compté en SQL indexé)

### Agenda « pro »
- [x] Lignes de demi-heure + repère « maintenant »
- [x] Blocs de cours enrichis (barre de statut, mode, heure, survol)
- [x] Bascule jour / semaine
- [x] Vue mois (aperçu calendrier, lecture seule)
- [x] **Glisser-déposer** pour reprogrammer un cours confirmé (re-validation dispo + chevauchement, élève prévenu)
- [x] **Zones nommées à même la grille** : « Congé » sur la hachure, « Fermé » sur les plages fermées (partielles comme entières), en plus de la légende

### Avis & modération
- [x] Avis rattachés à une réservation (impossible à fabriquer), moyennes dérivées
- [x] Modération a posteriori (`/admin/avis`), masquer/restaurer
- [x] Signalements (le prof signale, la modération tranche)

### Administration
- [x] **Page utilisateurs** (`/admin/utilisateurs`) : liste de tous les comptes (rôle, infos, activité), recherche/filtre par rôle, **gestion d'accès d'un prof** (offrir/prolonger/révoquer une date — sans appel Stripe)
- [x] **Administration en capacité** (`User.isAdmin`, **orthogonale au rôle** : un prof/élève peut être admin), promotion manuelle en base (`UPDATE user SET "isAdmin"=true`), premier admin promu

### Notifications
- [x] E-mails : demande / confirmation / refus / annulation / avis reçu / **cours déplacé**
- [x] Rappels 24 h avant un cours : endpoint + table de réclamation + reprise sur échec

### Design & identité
- [x] Favicon sur mesure (croche)
- [x] **Refonte « Bleu conservatoire »** : bleu de Prusse / crème chaude / or antique, titres **Cormorant** (corps Inter), logo « sceau », médaillon gravé animé, page d'accueil refondue. Tout via les jetons — la charte à jour est dans `CHARTE-GRAPHIQUE.md`
- [x] Système de mise en page éditorial (filets, titres démesurés, plus de grilles de cartes) sur tout le site
- [x] **Barre latérale unique** de tout l'espace connecté (prof / élève / admin) ; **nav mobile en tiroir burger** (Radix Dialog : focus piégé, Échap, verrou de défilement), item sélectionné en doré
- [x] **Signature calligraphique** du prénom sur les avis publics (Pinyon Script)
- [x] **Retours d'action unifiés en toasts** (succès + échecs, réessai / reconnexion) : cycle de vie des cours, comptes rendus, avis, formulaires, agenda
- [x] Renommage **Noteva → SiNote** (marque + nom du projet)

### Infra & déploiement
- [x] Migration `middleware.ts` → `proxy.ts` (Next 16)
- [x] Génération du client Prisma en `postinstall` (build Vercel)
- [x] Correctifs auth prod : client relatif à l'origine, cookie `__Secure-` lu via `getSessionCookie`, redirection après connexion
- [x] Retrait de la connexion Google (e-mail + mot de passe uniquement pour l'instant)
- [x] **Perf tableau de bord** : compteur de messages non lus en SQL indexé (au lieu de rapatrier les messages), compteurs de la barre parallélisés
- [x] **Correctifs mobile** ciblés : zone de saisie des messages pleine largeur, pièces jointes audio qui ne débordent plus

---

## 🔜 Prochainement

- [ ] **Vérifier un domaine e-mail** — sans lui, les e-mails ne partent qu'à l'adresse du compte en prod ; envisager un émetteur FR (Scaleway TEM, Brevo)
- [ ] **Planifier le cron des rappels** (Vercel Cron ou GitHub Action) — l'endpoint existe, rien ne l'appelle encore
- [ ] **Conformité RGPD** — outils FR/UE (Scaleway fr-par déjà en place), consentement du responsable pour les mineurs (photo, audio, fiches), politique de conservation et de suppression
- [ ] **Régler le ressenti du glisser-déposer** (aimantation, fantôme, détection de colonne) après tests visuels
- [ ] Version **élève** du suivi (cours à venir / suivis / budget)
- [ ] **Audit visuel mobile** (navigateur ou test terrain) : agenda, inbox, formulaires — au-delà des correctifs déjà passés depuis la revue de code
- [ ] **Fils de comptes rendus dans l'inbox** : agréger aussi les commentaires (aujourd'hui seuls les fils généraux y figurent)

---

## 💡 Idées / plus tard

- [ ] Comparaison de périodes dans Activité (ce mois vs mois précédent, variation en %)
- [ ] Photo de profil côté élève (consentement du responsable si mineur, jamais indexée)
- [ ] Agenda : redimensionner un cours (durée) au drag ; glisser aussi les demandes en attente
- [ ] Vue mois : indices de disponibilité (jours ouverts) et petit aperçu horaire
- [ ] Journal d'audit de la modération (qui a masqué / pourquoi)
- [ ] Signalement d'avis aussi côté élève
- [ ] Pages d'atterrissage par instrument / par ville (SEO)
- [ ] Hiérarchie d'instruments (une recherche « guitare » couvre « guitare électrique »)
- [ ] Exploiter les champs déjà stockés : `preferredGenres`, `prefersOnline`, `postalCode`
- [ ] Réglage éditorial du classement (`PRIOR_WEIGHT`)
- [ ] Thème sombre (aujourd'hui volontairement clair uniquement)
