import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import type { InstrumentFamily } from "@prisma/client";
import { ArrowUpRight } from "lucide-react";

import { HeroSearch } from "@/components/hero-search";
import { SiteHeader } from "@/components/site-header";
import { Spotlight } from "@/components/spotlight";
import prisma from "@/lib/prisma";
import { FAMILY_STYLES } from "@/lib/instruments/family";
import { buildScore } from "@/lib/instruments/score";
import { searchTeachers, type SearchResult } from "@/lib/search/teachers";
import { visibleTeacherWhere } from "@/lib/teacher/visibility";
import { cn } from "@/lib/utils";

/**
 * Page d'accueil.
 *
 * Server Component : c'est la porte d'entrée du trafic de recherche, elle doit
 * être lisible sans JavaScript. Elle n'est plus l'écran de connexion — celui-ci
 * vit désormais sur /connexion.
 *
 * Parti pris graphique : **la portée structure la page, le séquenceur l'anime**.
 * Cinq lignes en filet ouvrent l'accroche et reviennent en négatif sur le bloc
 * prof ; une tête de lecture les balaie en boucle et allume chaque note à son
 * passage. Tout est en CSS (`globals.css`, section « Mouvement ») : rien à
 * charger, rien à hydrater, et la page reste entièrement rendue par le serveur.
 * Le seul îlot client est `Spotlight`, parce qu'aucune feuille de style ne sait
 * où se trouve le curseur.
 *
 * La couleur ne décore pas, elle **nomme une famille d'instruments** (voir
 * `lib/instruments/family.ts`). Les notes posées sur la portée sont exactement
 * les familles du répertoire plus bas : le lecteur apprend la correspondance en
 * descendant la page, sans légende.
 *
 * Les instruments et les villes affichés viennent de la base et ne listent que
 * ce qui est réellement enseigné : des liens vers des recherches vides
 * feraient fuir autant les visiteurs que les moteurs.
 */

/**
 * Géométrie de la portée. L'interligne vaut `STAFF_GAP`, donc un demi-interligne
 * — le pas réel des hauteurs de notes — vaut la moitié.
 *
 * La hauteur est calculée pour rendre **exactement cinq lignes** : le dégradé se
 * répète tous les `STAFF_GAP` px, une boîte de `4 × GAP + 1` en montre donc cinq
 * et pas six.
 */
const STAFF_GAP = 14;
const STAFF_HEIGHT = STAFF_GAP * 4 + 1;
const STAFF_STEP = STAFF_GAP / 2;

/** Tête de note, hampe et ligature — les proportions de la gravure. */
const NOTE_WIDTH = 12;
const NOTE_HEIGHT = 9;
const STEM_OFFSET = NOTE_WIDTH / 2 - 1;
const BEAM_THICKNESS = 4;

/**
 * Durée d'un aller de la tête de lecture.
 *
 * Assez lent pour être une respiration et non un clignotant : au-delà d'une
 * poignée de secondes, l'œil cesse de suivre et l'effet devient un fond.
 */
const SEQUENCE_SECONDS = 7;

/**
 * Battue du médaillon.
 *
 * Un tempo lent, proche d'un andante : la note bat la mesure sans virer au
 * clignotant. La note et les ondes qui s'en échappent le partagent via
 * `--beat` — même procédé que `--sequence` sur la portée, si bien que les deux
 * ne peuvent pas se désynchroniser.
 */
const BEAT_SECONDS = 0.82;

/** Dégradés en style inline : en classe arbitraire, Tailwind découpe la valeur
    aux virgules et croit y voir des utilitaires. */
const staffLines = (color: string) =>
  `repeating-linear-gradient(to bottom, ${color} 0, ${color} 1px, transparent 1px, transparent ${STAFF_GAP}px)`;

const STEPS = [
  {
    title: "Trouvez un prof",
    text: "Filtrez par instrument, par ville, ou cherchez un cours en visio.",
  },
  {
    title: "Choisissez un créneau",
    text: "Vous voyez ses disponibilités réelles et vous envoyez une demande.",
  },
  {
    title: "Prenez votre cours",
    text: "Le prof confirme, vous convenez des détails, et c'est parti.",
  },
];

/** « 1 professeur », « 3 professeurs » — le pluriel se voit tout de suite. */
function count(n: number, singular: string, plural = `${singular}s`) {
  return `${n} ${n > 1 ? plural : singular}`;
}

/** Entrée décalée : les éléments arrivent dans l'ordre de lecture. */
const rise = (delay: number): CSSProperties => ({ animationDelay: `${delay}s` });

/**
 * Décalage d'apparition au défilement.
 *
 * Sur une ligne de temps `view()`, `animation-delay` ne veut plus rien dire —
 * l'avancement suit la position, pas l'horloge. Le décalage se fait donc en
 * repoussant la **plage**, ce qui est ce que lisent les variables déclarées
 * dans `globals.css`.
 */
const reveal = (index: number): CSSProperties =>
  ({
    "--reveal-from": `${index * 6}%`,
    "--reveal-to": `${60 + index * 6}%`,
  }) as CSSProperties;

export default async function HomePage() {
  const where = visibleTeacherWhere(new Date());

  const [instruments, cities, teacherCount, featuredResp] = await Promise.all([
    // Instruments effectivement enseignés, les plus représentés d'abord. La
    // limite dépasse le catalogue : le compteur affiché serait faux si la
    // requête tronquait.
    prisma.instrument.findMany({
      where: { teachers: { some: { teacher: where } } },
      select: {
        slug: true,
        name: true,
        family: true,
        _count: { select: { teachers: true } },
      },
      orderBy: { teachers: { _count: "desc" } },
      take: 60,
    }),
    prisma.teacherProfile.groupBy({
      by: ["city"],
      where: { ...where, city: { not: null } },
      _count: { city: true },
      orderBy: { _count: { city: "desc" } },
      take: 12,
    }),
    prisma.teacherProfile.count({ where }),
    // Profs en vedette : les mieux classés (moyenne bayésienne), tête de liste.
    // On réutilise la recherche pour ne pas dupliquer la logique de visibilité
    // et de note.
    searchTeachers({
      instrument: null,
      city: null,
      mode: null,
      maxRateCents: null,
      trialOnly: false,
      page: 1,
    }),
  ]);

  const featured = featuredResp.results.slice(0, 3);

  const tally = [
    teacherCount > 0 ? count(teacherCount, "professeur") : null,
    instruments.length > 0 ? count(instruments.length, "instrument") : null,
    cities.length > 0 ? count(cities.length, "ville") : null,
  ].filter(Boolean);

  return (
    <>
      <SiteHeader />

      <main>
        {/* Accroche */}
        <section className="relative overflow-hidden">
          {/* Aurores.
              Elles ne nomment rien — c'est de la lumière, pas un code couleur.
              Elles restent donc sous le seuil où l'œil lit une teinte comme une
              information, sans quoi elles entreraient en concurrence avec les
              couleurs de familles, qui, elles, veulent dire quelque chose. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            <div
              className="m-drift-a absolute -left-40 -top-56 h-[38rem] w-[38rem] rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgb(18 53 81 / 0.16), transparent 65%)",
              }}
            />
            <div
              className="m-drift-b absolute -right-40 -top-24 h-[32rem] w-[32rem] rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgb(169 127 56 / 0.14), transparent 65%)",
              }}
            />
          </div>

          {/* Accroche en deux colonnes : le texte à gauche, le médaillon gravé
              à droite. Registre « conservatoire » — eyebrow doré, titre en
              Cormorant avec un mot en italique doré, filet or. */}
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:py-24 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="m-rise" style={rise(0.05)}>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
                Cours de musique &amp; de chant
              </p>

              <h1
                className="mt-4 font-display font-semibold leading-[1.03]"
                style={{ fontSize: "clamp(2.6rem, 6.4vw, 4.6rem)" }}
              >
                Le professeur qui vous fait{" "}
                <em className="italic text-accent">progresser</em>
              </h1>

              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
                L’exigence d’un conservatoire, la simplicité d’une réservation en
                ligne. Trouvez votre professeur, consultez ses disponibilités,
                réservez votre premier cours.
              </p>

              {/* Filet doré — la touche or, en emphase éditoriale. */}
              <div
                aria-hidden
                className="mt-7 h-px max-w-sm"
                style={{
                  background: "linear-gradient(90deg, var(--accent), transparent)",
                }}
              />

              <div className="mt-6">
                <HeroSearch
                  instruments={instruments.map((item) => ({
                    slug: item.slug,
                    name: item.name,
                  }))}
                />

                <p className="mt-3 text-sm text-muted">
                  Vous enseignez ?{" "}
                  <Link
                    href="/connexion"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Devenir prof →
                  </Link>
                </p>
              </div>

              {tally.length > 0 ? (
                <p className="mt-5 text-sm text-subtle">
                  <span className="text-accent">★</span> Des profs vérifiés ·{" "}
                  {tally.join(" · ")}
                </p>
              ) : null}
            </div>

            {/* Médaillon : un anneau doré (étoiles en orbite) autour d'un sceau
                bleu de Prusse gravé qui tourne lentement à contresens, note dorée
                au centre. La note reste droite et bat la mesure ; le disque résonne
                à chaque temps. Remplace la portée-séquenceur ; l'animation vit dans
                `globals.css`. */}
            <div aria-hidden className="relative hidden lg:block">
              <div
                className="relative mx-auto grid h-[340px] w-[340px] place-items-center"
                style={{ "--beat": `${BEAT_SECONDS}s` } as CSSProperties}
              >
                {/* Ondes de résonance : à chaque temps, un anneau doré s'échappe
                    du disque — le médaillon « sonne ». Deux anneaux décalés d'un
                    demi-temps pour une émanation continue. Décoratifs et
                    invisibles au repos (opacity 0), donc rien à l'écran sous
                    reduced-motion. */}
                <span
                  aria-hidden
                  className="m-pulse-ring absolute left-1/2 top-1/2 h-60 w-60 -translate-x-1/2 -translate-y-1/2 rounded-full border opacity-0"
                  style={{ borderColor: "var(--accent)" }}
                />
                <span
                  aria-hidden
                  className="m-pulse-ring absolute left-1/2 top-1/2 h-60 w-60 -translate-x-1/2 -translate-y-1/2 rounded-full border opacity-0"
                  style={{
                    borderColor: "var(--accent)",
                    animationDelay: `-${BEAT_SECONDS / 2}s`,
                  }}
                />

                <div
                  className="m-medallion-ring absolute inset-6 rounded-full border"
                  style={{ borderColor: "var(--accent-soft)" }}
                >
                  <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 text-sm text-accent">
                    ✦
                  </span>
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 text-sm text-accent">
                    ✦
                  </span>
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 text-sm text-accent">
                    ✦
                  </span>
                  <span className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-accent">
                    ✦
                  </span>
                </div>

                {/* Enveloppe fixe : porte l'ombre portée, qui ne doit pas tourner
                    avec le sceau — une ombre décalée qui pivote donnerait une
                    source de lumière en orbite. */}
                <div
                  className="relative grid h-60 w-60 place-items-center rounded-full"
                  style={{ boxShadow: "0 24px 60px -26px rgb(18 53 81 / 0.55)" }}
                >
                  {/* Le sceau gravé, qui tourne. Le reflet décentré du dégradé et
                      le filet pointillé sont ses repères asymétriques : sans eux,
                      un disque circulaire tournerait sans que rien ne le montre. */}
                  <div
                    className="m-seal absolute inset-0 rounded-full"
                    style={{
                      background:
                        "radial-gradient(circle at 50% 38%, #1b4a6e, #123551 70%)",
                    }}
                  >
                    <div
                      className="absolute inset-3 rounded-full border"
                      style={{ borderColor: "var(--accent-soft)", opacity: 0.7 }}
                    />
                    <div
                      className="absolute inset-5 rounded-full border border-dashed"
                      style={{ borderColor: "var(--accent-soft)", opacity: 0.4 }}
                    />
                  </div>

                  {/* La note est posée sur le sceau, hors de sa rotation : elle
                      reste droite et lisible, et bat la mesure. `relative` la place
                      au-dessus du sceau opaque. */}
                  <span
                    className="m-beat relative font-display leading-none"
                    style={{ fontSize: "5rem", color: "#c6a260" }}
                  >
                    ♬
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Professeurs en vedette : les mieux notés, en cartes. */}
        {featured.length > 0 ? (
          <section className="border-t border-border">
            <div className="mx-auto max-w-6xl px-4 py-16">
              <div className="m-reveal">
                <SectionHead>Professeurs en vedette</SectionHead>
              </div>

              <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((teacher, index) => (
                  <div
                    key={teacher.slug}
                    className="m-reveal h-full"
                    style={reveal(index)}
                  >
                    <FeaturedCard teacher={teacher} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* Fonctionnement. Trois mesures séparées par des barres : des filets
            font le même travail qu'une carte, sans la boîte. */}
        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <div className="m-reveal">
              <SectionHead>Comment ça marche</SectionHead>
            </div>

            <ol className="mt-10 grid gap-px overflow-hidden rounded-[var(--radius)] border border-border bg-border sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="m-reveal bg-background p-7"
                  style={reveal(index)}
                >
                  <span
                    aria-hidden
                    className="block font-display text-5xl font-extrabold leading-none text-primary"
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-lg">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {step.text}
                  </p>
                </li>
              ))}
            </ol>

            <p className="m-reveal mt-8 text-sm text-muted">
              Le paiement des cours se fait directement entre vous et votre
              prof, hors plateforme — la plateforme ne prend aucune commission.
            </p>
          </div>
        </section>

        {/* Côté prof. Encre pleine : la page se referme sur un contraste franc
            plutôt que sur une énième carte claire. */}
        <section>
          <Spotlight className="relative overflow-hidden bg-foreground text-background">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 transition-opacity duration-500"
              style={{
                opacity: "var(--spot-opacity, 0)",
                background:
                  "radial-gradient(26rem 26rem at var(--spot-x, 50%) var(--spot-y, 50%), rgb(198 162 96 / 0.3), transparent 70%)",
              }}
            />

            <div aria-hidden className="absolute inset-x-0 top-0">
              <Staff
                line="rgb(255 255 255 / 0.22)"
                head="rgb(198 162 96 / 0.9)"
              />
            </div>

            <div className="relative mx-auto max-w-5xl px-4 py-20">
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.22em]">
                <span aria-hidden className="text-base text-accent">❧</span>
                <span className="text-accent">Vous enseignez ?</span>
              </p>
              {/* Pas de largeur maximale : elle reprenait la main sur le saut de
                  ligne explicite et laissait « agenda, » seul sur sa ligne. */}
              <h2
                className="mt-4 font-display font-extrabold uppercase leading-[0.92] tracking-[-0.03em]"
                style={{ fontSize: "clamp(1.875rem, 4.6vw, 3rem)" }}
              >
                Remplissez votre agenda,
                <br />
                gardez vos tarifs
              </h2>
              <p className="mt-6 max-w-xl leading-relaxed text-white/65">
                Publiez votre fiche, définissez vos disponibilités récurrentes
                et recevez des demandes de cours. Un abonnement mensuel, et
                aucune commission sur ce que vous facturez.
              </p>

              {/* Bouton en négatif écrit à la main : les variantes de `Button`
                  sont réglées pour un fond clair, aucune ne tient sur l'encre. */}
              <Link
                href="/connexion"
                className="mt-9 inline-flex h-12 items-center gap-2 rounded-[var(--radius-sm)] bg-background px-6 text-base font-medium text-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
              >
                Créer ma fiche
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </Spotlight>
        </section>

        <footer className="border-t border-border py-10">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-muted">
            <span className="font-display font-bold uppercase tracking-[0.14em] text-foreground">
              SiNote
            </span>
            {/* Pas de lien de connexion ici : l'en-tête l'affiche déjà, et
                selon l'état de session. Le dupliquer proposerait « Se
                connecter » à quelqu'un qui l'est déjà. */}
            <nav className="flex gap-4">
              <Link href="/profs" className="hover:underline">
                Trouver un prof
              </Link>
            </nav>
          </div>
        </footer>
      </main>
    </>
  );
}

/**
 * En-tête de section façon programme de concert : un fleuron doré, le titre en
 * Cormorant, puis un filet qui file jusqu'au bord.
 */
function SectionHead({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="text-xl leading-none text-accent">
        ❧
      </span>
      <h2 className="text-3xl sm:text-4xl">{children}</h2>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Carte d'un prof en vedette. La photo si elle existe, sinon un sceau bleu
 * gravé à l'initiale ; nom en Cormorant, instruments en italique, note dorée.
 */
function FeaturedCard({ teacher }: { teacher: SearchResult }) {
  const name = teacher.name ?? "Professeur";
  const place = teacher.city ?? (teacher.teachesOnline ? "En visio" : null);

  return (
    <Link
      href={`/profs/${teacher.slug}`}
      className="group flex h-full flex-col rounded-xl border border-border bg-elevated p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-lg"
    >
      <div className="flex items-center gap-3">
        {teacher.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={teacher.image}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full border border-border object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-accent-soft font-display text-xl font-semibold"
            style={{
              background:
                "radial-gradient(circle at 50% 38%, #1b4a6e, #123551 72%)",
              color: "#c6a260",
            }}
          >
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-semibold leading-tight text-primary">
            {name}
          </p>
          {place ? (
            <p className="truncate text-xs uppercase tracking-[0.12em] text-subtle">
              {place}
            </p>
          ) : null}
        </div>
      </div>

      {teacher.instruments.length > 0 ? (
        <p className="mt-3 line-clamp-2 font-display text-lg italic leading-snug text-foreground">
          {teacher.instruments
            .slice(0, 3)
            .map((instrument) => instrument.name)
            .join(" · ")}
        </p>
      ) : null}

      <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
        <span className="flex items-center gap-1 text-sm text-muted">
          <span className="text-accent">★</span>
          {teacher.rating.average !== null
            ? `${teacher.rating.average.toFixed(1).replace(".", ",")} (${teacher.rating.count})`
            : "Nouveau"}
        </span>
        {teacher.hourlyRateCents !== null ? (
          <span className="font-display text-lg font-semibold text-primary">
            {Math.round(teacher.hourlyRateCents / 100)} €
            <span className="font-sans text-xs font-normal text-muted">/h</span>
          </span>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * Une vraie portée : clef, chiffrage, quatre mesures de croches ligaturées,
 * barres de mesure — et une tête de lecture qui les joue.
 *
 * La gravure vient de `lib/instruments/score.ts`, qui rend des fractions et des
 * demi-interlignes ; ici on ne fait que les multiplier par la géométrie.
 *
 * **Les notes restent les familles réellement enseignées**, la phrase se
 * remplissant en les reprenant et en les transposant de mesure en mesure. La
 * couleur continue donc de nommer quelque chose, et le répertoire plus bas en
 * reste la légende.
 *
 * **La synchronisation est un décalage négatif, pas un minuteur.** La tête et
 * les notes partagent la durée `--sequence` ; chaque note démarre son cycle
 * comme s'il avait déjà tourné, de quoi placer sa frappe pile sous la tête.
 * Aucune horloge, aucun JavaScript, et rien qui puisse dériver : les deux
 * animations lisent la même variable.
 *
 * La tête de lecture vit dans la **zone de musique** et non sur toute la
 * largeur : elle lit les notes, pas la clef. C'est aussi ce qui garde les
 * fractions de `buildScore` et le balayage dans le même repère.
 *
 * Purement décorative, donc `aria-hidden` : le lecteur d'écran n'a que faire
 * d'une phrase qui ne dit rien de plus que le répertoire juste en dessous.
 */
function Staff({
  families = [],
  line = "var(--border)",
  head = "var(--primary)",
  notation = "var(--muted)",
}: {
  families?: InstrumentFamily[];
  line?: string;
  head?: string;
  notation?: string;
}) {
  // Bornée à droite : une barre finale posée à 100 % tomberait pile sur le
  // bord et se ferait rogner.
  const score = buildScore(families, { from: 0, to: 0.985 });

  return (
    <div
      aria-hidden
      className="relative flex"
      style={
        {
          height: STAFF_HEIGHT,
          backgroundImage: staffLines(line),
          "--sequence": `${SEQUENCE_SECONDS}s`,
        } as CSSProperties
      }
    >
      {/* Clef et chiffrage n'existent que s'il y a quelque chose à jouer : une
          clef seule devant une portée vide annonce une phrase qui ne vient
          jamais. */}
      {score.notes.length > 0 ? (
        <div className="relative w-16 shrink-0 sm:w-20">
          <TrebleClef color={notation} />

          <div
            className="absolute inset-y-0 flex flex-col justify-center font-display text-[1.3rem] font-bold leading-[1.28]"
            style={{ left: 38, color: notation }}
          >
            <span>4</span>
            <span>4</span>
          </div>
        </div>
      ) : null}

      <div className="relative flex-1">
        {/* Le conteneur fait la largeur de la zone de musique : le translater
            de 100 % promène le trait d'un bout à l'autre sans jamais animer la
            mise en page ni avoir à connaître cette largeur. */}
        <div className="m-playhead pointer-events-none absolute inset-0">
          <span
            className="absolute -bottom-3 -top-3 left-0 w-px"
            style={{
              background: `linear-gradient(to bottom, transparent, ${head}, transparent)`,
              boxShadow: `0 0 12px 1px ${head}`,
            }}
          />
        </div>

        {score.barLines.map((at) => (
          <span
            key={`bar-${at}`}
            className="absolute top-0 w-px opacity-60"
            style={{
              left: `${at * 100}%`,
              height: STAFF_HEIGHT - 1,
              background: notation,
            }}
          />
        ))}

        {score.beams.map((beam) => (
          <span
            key={`beam-${beam.from}`}
            className="absolute"
            style={{
              left: `${beam.from * 100}%`,
              width: `${(beam.to - beam.from) * 100}%`,
              // La hampe part du flanc de la tête, pas de son centre.
              marginLeft: beam.stemUp ? STEM_OFFSET : -STEM_OFFSET - 1,
              top:
                beam.pitch * STAFF_STEP - (beam.stemUp ? 0 : BEAM_THICKNESS),
              height: BEAM_THICKNESS,
              background: notation,
            }}
          />
        ))}

        {score.notes.map((note, index) => {
          const noteY = note.pitch * STAFF_STEP;
          const beamY = score.beams[note.bar].pitch * STAFF_STEP;

          return (
            <span key={`note-${index}`}>
              <span
                className="absolute w-px"
                style={{
                  left: `${note.at * 100}%`,
                  marginLeft: note.stemUp ? STEM_OFFSET : -STEM_OFFSET - 1,
                  top: Math.min(noteY, beamY),
                  height: Math.abs(noteY - beamY),
                  background: notation,
                }}
              />

              <span
                className={cn(
                  "m-note absolute h-[9px] w-3 -rotate-[18deg] rounded-full",
                  FAMILY_STYLES[note.family].dot,
                  // La lueur de la frappe est un `box-shadow` en
                  // `currentColor` : sans la couleur de texte, elle serait
                  // noire.
                  FAMILY_STYLES[note.family].text
                )}
                style={{
                  left: `${note.at * 100}%`,
                  marginLeft: -NOTE_WIDTH / 2,
                  top: noteY - NOTE_HEIGHT / 2,
                  // La position de la note dans la mesure est aussi la fraction
                  // du cycle à laquelle la tête de lecture l'atteint.
                  animationDelay: `${-(1 - note.at) * SEQUENCE_SECONDS}s`,
                }}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Clef de sol, tracée d'un trait d'épaisseur constante.
 *
 * Monolinéaire volontairement : une clef gravée a un plein et un délié, ce qui
 * demande une forme pleine et non un tracé. À cette taille le modelé ne se
 * verrait pas, et un trait régulier s'accorde au reste de la page — les filets
 * de la portée en sont un aussi.
 *
 * Le repère est celui de la portée : `y = 0` est la ligne du haut, `y = 42` la
 * ligne de sol, autour de laquelle s'enroule la spirale. C'est ce qui la pose
 * juste sans réglage à la main.
 */
function TrebleClef({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 -18 26 96"
      fill="none"
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="absolute"
      style={{ left: 6, top: -18, width: 26, height: 96 }}
    >
      <path
        d="M13 42C8 42 6 36 11 33C18 30 23 38 21 47C18 57 9 58 5 50C0 41 6 30 12 22C17 15 19 6 15 0C12 -4 8 0 8 7C8 16 12 28 14 42C16 56 16 66 11 70C6 73 2 69 4 64"
      />
    </svg>
  );
}
