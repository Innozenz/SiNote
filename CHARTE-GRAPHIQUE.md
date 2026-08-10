# 🎨 SiNote — Charte graphique

**« Bleu conservatoire ».** Un bleu de Prusse profond sur une crème chaude, un or antique rare pour l'emphase, et un serif haute-classe (Cormorant) en titres. L'exigence d'un conservatoire, dans une exécution claire et éditoriale.

**La règle qui tient tout : une teinte nomme quelque chose.** Les familles d'instruments nomment une famille, les statuts nomment un état, les gris sont de la mise en page, l'or est l'emphase éditoriale. Rien ne prend une couleur juste parce que « c'est plus joli » — c'est ce qui rend les couleurs lisibles comme de l'information.

> Thème **clair uniquement**, par choix. Pas de mode sombre, pas de variantes `dark:`. (La barre latérale est un panneau bleu foncé **assumé**, posé sur ses propres jetons — ce n'est pas un thème sombre.)

> **On change l'identité en éditant les jetons, pas les composants.** C'est ainsi qu'on est passé de « encre sur papier » (épicéa/bronze, Fraunces) à ce bleu/or (Cormorant) sans toucher aux écrans. Ne jamais appliquer via `shadcn add`.

---

## 🎨 Palette

### Neutres — crème chaude (aucune teinte de marque)

| Aperçu | Token | Hex | Rôle |
| --- | --- | --- | --- |
| ⬜ | `--background` | `#f5efe1` | Fond de page (crème) |
| ◽ | `--surface` | `#efe6d2` | Surface douce (zones, survols) |
| ◽ | `--surface-strong` | `#e6dcc4` | Surface plus marquée (heures fermées de l'agenda) |
| ⬜ | `--elevated` | `#fdfaf2` | Surfaces élevées (cartes, en-têtes) — crème très clair, pas blanc pur |
| ⬛ | `--foreground` | `#1f2b33` | Encre bleu-ardoise (texte principal) |
| 🟦 | `--muted` | `#5f6a72` | Texte secondaire |
| 🩶 | `--subtle` | `#8b9299` | Texte discret, légendes |
| ◽ | `--border` | `#e0d6bf` | Filets, séparateurs |
| ◽ | `--border-strong` | `#cfc3a6` | Filets appuyés |

### Marque

| Aperçu | Token | Hex | Rôle |
| --- | --- | --- | --- |
| 🔵 | `--primary` | `#123551` | Bleu de Prusse — actions, liens, tout ce qui se clique |
| 🔵 | `--primary-hover` | `#1b4a6e` | Survol du primaire |
| 🟦 | `--primary-soft` | `#e0e8ef` | Fond doux primaire (sélection, surlignage) |
| ⬜ | `--primary-foreground` | `#f6f0e2` | Texte (crème) sur le primaire |
| 🟡 | `--accent` | `#a97f38` | Or antique — emphase éditoriale, **rare** (soulignés, fleurons, eyebrows, pastilles de section) |
| 🟨 | `--accent-soft` | `#ece0c6` | Fond doux or |

### Barre latérale — panneau bleu foncé

| Aperçu | Token | Hex | Rôle |
| --- | --- | --- | --- |
| 🔵 | `--sidebar` | `#10293f` | Fond du panneau |
| ⬜ | `--sidebar-foreground` | `#eef1f5` | Texte clair du panneau |
| 🩶 | `--sidebar-muted` | `#93a3b0` | Texte secondaire du panneau |
| 🔵 | `--sidebar-accent` | `#17364f` | Fond de survol |
| ◽ | `--sidebar-border` | `#244a67` | Filets du panneau |
| 🔵 | `--sidebar-active` | `#1a3e5c` | Fond de l'item sélectionné |

*(L'item **sélectionné** est signalé en **or** : liseré gauche `--accent` + icône dorée, libellé clair.)*

### États

| Aperçu | Token | Hex | Rôle |
| --- | --- | --- | --- |
| 🟢 | `--success` | `#059669` | Succès (confirmé, essai, terminé) |
| 🟠 | `--warning` | `#b45309` | Attention (en attente, à compléter) |
| 🔴 | `--danger` | `#d92626` | Erreur / danger (annulé, non honoré) |

*(Chaque état a aussi une variante `-soft` pour les fonds : `--success-soft`, `--warning-soft`, `--danger-soft`.)*

### Familles d'instruments

Une teinte par famille — c'est le référent des couleurs sur les puces et les notes de la portée. **Espacées sur la roue** (il faut d'abord les distinguer), puis choisies par analogie. La théorie est volontairement neutre : le solfège, c'est la page elle-même. **Conservées telles quelles à travers toutes les refontes.**

| Aperçu | Famille | Token | Hex |
| --- | --- | --- | --- |
| 💗 | Voix | `--family-voice` | `#be185d` |
| 🟣 | Claviers | `--family-keyboard` | `#4f46e5` |
| 🟠 | Cordes | `--family-strings` | `#c2410c` |
| 🩵 | Vents | `--family-winds` | `#0f766e` |
| 🟡 | Cuivres | `--family-brass` | `#a16207` |
| 🟢 | Percussions | `--family-percussion` | `#15803d` |
| 🔵 | Électronique | `--family-electronic` | `#0369a1` |
| ⚫ | Théorie | `--family-theory` | `#52525b` |

*(Chaque famille a une variante `-soft` pour les fonds de puces.)*

---

## 🔤 Typographie

- **Corps : Inter** — grotesque neutre, très lisible aux petites tailles.
- **Titres (`h1`–`h3`) : Cormorant** — un serif haute-classe à fort contraste, registre « affiche de concert / diplôme ». L'italique doré sert d'accent (« *progresser* »).
- Chargées via `next/font` (variables `--font-sans-custom` / `--font-display`).

| Usage | Détail |
| --- | --- |
| Interlettrage du corps | `-0.01em` |
| Interlettrage des titres | `+0.005em` — **positif** : une Didone/garalde ne se resserre pas, ses pleins et déliés se toucheraient |
| Poids des titres | 600 |
| Titre de vitrine (`PageTitle` « display ») | Cormorant, `clamp(2.25rem, 5vw, 3.75rem)` |
| Titre d'écran interne (`PageTitle` « page ») | Cormorant, `text-3xl` / `sm:text-4xl` |

---

## 📐 Mise en page éditoriale

**La règle : des filets et des lignes, pas des cartes.** La carte est réservée à une vraie surface d'action (widget de réservation, item qui porte ses boutons) ; tout le reste — résultats, navigation, sections de formulaire, listes — est une ligne ou une section sur la crème.

Primitives partagées (`components/editorial.tsx`) :

| Primitive | Rôle |
| --- | --- |
| `Eyebrow` | Petit intitulé en capitales espacées, **en or**, au-dessus d'un titre |
| `PageTitle` | Titre d'affichage démesuré (Cormorant), tailles `display` / `page` |
| `PageHeader` | Fleuron + titre + méta alignée à droite (asymétrie) + filet de clôture |
| `SectionTitle` | Pastille tête-de-note (or) + libellé en capitales + filet qui file au bord |
| `RowList` / `Row` | Liste séparée de filets ; le survol lave le fond (`surface`) au lieu d'encadrer |

**Sur l'accueil**, les en-têtes de section prennent le style « programme de concert » : un **fleuron doré ❧**, le titre en Cormorant, puis un filet qui file jusqu'au bord.

Largeurs : les pages « texte » se plafonnent (`max-w-4xl`, activité `max-w-5xl`) ; **l'agenda prend toute la largeur** pour que les sept colonnes respirent.

---

## 🔘 Rayons & ombres

| Token | Valeur |
| --- | --- |
| `--radius` | `0.75rem` (12 px) — défaut |
| `--radius-sm` | `0.5rem` (8 px) |
| `--radius-lg` | `1.25rem` (20 px) |

Ombres **discrètes** : la hiérarchie vient du trait, pas du flou.

---

## 🧩 Composants

- `components/ui/*` : primitives façon shadcn (Radix + `class-variance-authority`), toutes **branchées sur les tokens** (`bg-primary`, jamais `bg-zinc-50`).
- **Boutons** : variantes `default` (primaire), `outline`, `ghost`, plus `success` et `accent`.
- **Badges** : doux-teintés (`secondary`, `success`, `warning`, `accent`) — ils annotent, ils ne rivalisent pas avec les boutons.
- **Modale / tiroir** : `components/ui/dialog.tsx` (Radix Dialog), overlay + panneau centré. La navigation mobile est un **tiroir** (burger) monté sur Radix Dialog.
- Cases à cocher / radios natives teintées via la classe `.accent-primary`.

---

## 🖼️ Identité

- **Logo « sceau » (`components/site-logo.tsx`)** : une note dans un anneau doré, façon médaille de conservatoire, suivie de « SiNote » en Cormorant. Note **bleue** sur clair ; sur la barre latérale foncée, un disque crème clair (en retrait de l'anneau) derrière la note. Partagé par l'en-tête public, la barre latérale et l'en-tête admin.
- **Favicon** : croche blanche sur une tuile arrondie bleue (`app/icon.svg`, + `favicon.ico` / `apple-icon.png` générés avec `sharp`).
- **Médaillon de l'accueil** : disque bleu gravé, note dorée, anneau doré (étoiles en orbite) qui tourne lentement.
- **Couleurs codées en dur** (hors tokens, à tenir synchronisées à chaque changement de palette) :
  - la favicon (`#123551`),
  - les aurores et le spotlight de l'accueil (`app/page.tsx` : `rgb(18 53 81)` primaire, `rgb(169 127 56)` or),
  - `app/global-error.tsx` (`#123551`, styles en ligne car la feuille de style peut ne pas être chargée),
  - les logos `brand/` (mark SVG/PNG).

---

## ⚙️ Principes & garde-fous

- **Une teinte nomme quelque chose** — familles = familles, statuts = états, gris = mise en page, or = emphase. Les neutres ne portent **aucune** teinte de marque.
- **L'or reste rare** — c'est le seul point chaud d'une palette bleue ; le diluer lui ferait perdre son sens.
- **Les huit familles ne bougent pas** — c'est la partie la plus aboutie de la palette.
- **Thème clair uniquement** (`color-scheme: light`) — pas de `dark:`.
- **Pièges Tailwind 4 à éviter** : pas de valeur à virgules dans une classe (dégradés → `style` en ligne), `var()` obligatoire dans une valeur arbitraire, classes de familles écrites **en toutes lettres** (le scanner ne génère pas une classe montée à l'exécution).
