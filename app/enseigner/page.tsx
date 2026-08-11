import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { Spotlight } from "@/components/spotlight";

/**
 * Page vitrine côté professeurs — « Enseigner sur SiNote ».
 *
 * Server Component avec `generateMetadata` : c'est une page publique et
 * indexable, contrairement à `/connexion` (en `noindex`). Le lien « Devenir
 * prof » de l'accueil menait droit au formulaire de compte, sans jamais
 * expliquer l'offre — or l'argument central du modèle (l'élève paie le prof en
 * direct, aucune commission, un simple abonnement pour l'accès plateforme) doit
 * se lire avant qu'on demande à quelqu'un de s'inscrire.
 *
 * Elle reprend le langage éditorial de l'accueil (Cormorant, filets plutôt que
 * cartes, œil-de-bœuf doré, encre pleine pour se refermer) et pointe, en bas,
 * vers `/connexion` où commence réellement l'inscription.
 */

export const metadata: Metadata = {
  title: "Enseigner sur SiNote",
  description:
    "Publiez votre fiche de professeur de musique ou de chant, gérez vos disponibilités et recevez des demandes de cours. Vos élèves vous règlent en direct — aucune commission, un simple abonnement mensuel.",
  alternates: { canonical: "/enseigner" },
  openGraph: {
    title: "Enseigner sur SiNote",
    description:
      "Remplissez votre agenda, gardez vos tarifs. Aucune commission sur vos cours — un simple abonnement mensuel.",
    url: "/enseigner",
    type: "website",
  },
};

/** L'abonnement, écrit à un seul endroit. */
const PRICE = "39,95 €";

/** Les trois arguments de fond, chacun sur sa ligne de filet. */
const ARGUMENTS = [
  {
    title: "Aucune commission",
    text: "Vos élèves vous règlent directement, hors plateforme. Vous gardez 100 % de ce que vous facturez — SiNote ne prélève rien sur vos cours.",
  },
  {
    title: "Vos tarifs, vos règles",
    text: "Vous fixez librement votre prix, votre durée de cours, vos délais d'annulation. La plateforme affiche vos conditions, elle ne les impose pas.",
  },
  {
    title: "Vos élèves restent les vôtres",
    text: "SiNote vous met en relation, puis s'efface. La relation avec vos élèves vous appartient, sur la plateforme comme en dehors.",
  },
];

/** Ce que fait la plateforme, côté outils. */
const TOOLS = [
  "Une fiche publique, indexée par les moteurs de recherche",
  "Un agenda avec vos disponibilités récurrentes et vos jours de congé",
  "Des demandes de cours à confirmer ou décliner d'un geste",
  "Des rappels automatiques envoyés à vos élèves avant chaque cours",
  "Des comptes rendus de cours à partager avec vos élèves",
  "Les avis de vos élèves, auxquels vous pouvez répondre",
];

/** Le parcours d'inscription, en quatre mesures. */
const STEPS = [
  {
    title: "Créez votre compte",
    text: "Quelques secondes suffisent. Vous choisissez « enseigner » et vous êtes prof.",
  },
  {
    title: "Complétez votre fiche",
    text: "Instruments, niveaux, tarif, ville ou visio, présentation : ce que verront vos futurs élèves.",
  },
  {
    title: "Ouvrez votre agenda",
    text: "Définissez vos créneaux récurrents. Les élèves ne voient que vos disponibilités réelles.",
  },
  {
    title: "Recevez des demandes",
    text: "Un abonnement, et votre fiche devient visible. Vous confirmez les demandes qui vous conviennent.",
  },
];

/** Questions fréquentes. Rien n'y promet ce que la plateforme ne fait pas. */
const FAQ = [
  {
    q: "Comment mes élèves me règlent-ils ?",
    a: "Directement, comme vous en convenez avec eux — espèces, virement, ou tout autre moyen. Aucun paiement ne transite par SiNote, et la plateforme ne prend aucune commission sur vos cours.",
  },
  {
    q: "Que comprend l'abonnement ?",
    a: `${PRICE} par mois donnent accès à tout : fiche publique visible des élèves, agenda, demandes de cours, rappels, comptes rendus et avis. Il n'y a pas d'autre frais, et rien n'est prélevé sur ce que vous facturez.`,
  },
  {
    q: "Puis-je préparer ma fiche avant de payer ?",
    a: "Oui. Vous pouvez créer votre compte, remplir et publier votre fiche gratuitement. Elle devient visible des élèves dès que votre abonnement est actif.",
  },
  {
    q: "Y a-t-il une période d'essai ?",
    a: "Pas pour le moment. L'abonnement est sans engagement : vous pouvez le résilier à tout moment depuis votre espace, et votre accès reste ouvert jusqu'à la fin de la période déjà réglée.",
  },
  {
    q: "Comment se passe la résiliation ?",
    a: "Depuis votre espace, en quelques clics. Votre fiche cesse simplement d'être visible à la fin de la période en cours ; vos données et votre historique de cours vous restent accessibles.",
  },
];

export default function TeachLandingPage() {
  return (
    <>
      <SiteHeader />

      <main>
        {/* Accroche. Même registre que l'accueil : aurores discrètes, eyebrow
            doré, titre Cormorant avec un mot en italique doré, filet or. */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            <div
              className="absolute -left-40 -top-56 h-[38rem] w-[38rem] rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgb(18 53 81 / 0.24), transparent 68%)",
              }}
            />
            <div
              className="absolute -right-40 -top-24 h-[32rem] w-[32rem] rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgb(169 127 56 / 0.2), transparent 68%)",
              }}
            />
          </div>

          <div className="relative mx-auto max-w-4xl px-4 py-16 sm:py-24">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
              Enseigner sur SiNote
            </p>

            <h1
              className="mt-4 font-display font-semibold leading-[1.03]"
              style={{ fontSize: "clamp(2.6rem, 6.4vw, 4.6rem)" }}
            >
              Remplissez votre agenda,{" "}
              <em className="italic text-accent">gardez vos tarifs</em>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
              SiNote met en relation les élèves et les professeurs de musique et
              de chant. Vous publiez votre fiche, vous définissez vos
              disponibilités, vous recevez des demandes. Vos élèves vous règlent
              en direct — la plateforme ne prend aucune commission.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href="/connexion"
                className="inline-flex h-12 items-center gap-2 rounded-[var(--radius-sm)] bg-primary px-6 text-base font-medium text-white transition-all hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
              >
                Créer ma fiche
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <span className="text-sm text-muted">
                {PRICE}/mois · sans engagement · aucune commission
              </span>
            </div>
          </div>
        </section>

        {/* Arguments de fond, en filets plutôt qu'en cartes. */}
        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-4xl px-4 py-16">
            <SectionHead>Pourquoi SiNote</SectionHead>

            <dl className="mt-10 divide-y divide-border border-y border-border">
              {ARGUMENTS.map((item) => (
                <div
                  key={item.title}
                  className="grid gap-2 py-7 sm:grid-cols-[0.8fr_1.2fr] sm:gap-8"
                >
                  <dt className="font-display text-2xl font-semibold leading-tight text-primary">
                    {item.title}
                  </dt>
                  <dd className="leading-relaxed text-muted">{item.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Fonctionnement, comme l'accueil : quatre mesures numérotées,
            séparées par des filets. */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <SectionHead>Comment ça marche</SectionHead>

            <ol className="mt-10 grid gap-px overflow-hidden rounded-[var(--radius)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="bg-background p-7">
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
          </div>
        </section>

        {/* Tarif. Un seul chiffre, ce qu'il comprend, et le rappel qu'il n'y a
            aucune commission par-dessus. */}
        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-4xl px-4 py-16">
            <SectionHead>L’abonnement</SectionHead>

            <div className="mt-10 grid items-start gap-10 rounded-[var(--radius)] border border-border bg-elevated p-8 sm:grid-cols-[0.9fr_1.1fr] sm:p-10">
              <div className="border-b border-border pb-6 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-10">
                <p className="flex items-baseline gap-1">
                  <span className="font-display text-6xl font-bold leading-none text-primary">
                    {PRICE}
                  </span>
                  <span className="text-lg text-muted">/mois</span>
                </p>
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  Sans engagement, résiliable à tout moment. Aucune commission
                  sur vos cours : vous gardez l’intégralité de ce que vous
                  facturez.
                </p>
                <Link
                  href="/connexion"
                  className="mt-7 inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-primary px-5 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
                >
                  Créer ma fiche
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>

              <ul className="space-y-3">
                {TOOLS.map((tool) => (
                  <li key={tool} className="flex gap-3">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                    <span className="leading-relaxed text-foreground">
                      {tool}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Questions fréquentes, en filets. */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-4xl px-4 py-16">
            <SectionHead>Questions fréquentes</SectionHead>

            <dl className="mt-10 divide-y divide-border border-y border-border">
              {FAQ.map((item) => (
                <div key={item.q} className="py-7">
                  <dt className="font-display text-xl font-semibold leading-snug text-foreground">
                    {item.q}
                  </dt>
                  <dd className="mt-2 max-w-2xl leading-relaxed text-muted">
                    {item.a}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Appel final sur encre pleine — la page se referme sur un contraste
            franc, comme l'accueil. */}
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

            <div className="relative mx-auto max-w-4xl px-4 py-20">
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.22em]">
                <span aria-hidden className="text-base text-accent">
                  ❧
                </span>
                <span className="text-accent">Prêt à enseigner ?</span>
              </p>
              <h2
                className="mt-4 font-display font-extrabold uppercase leading-[0.92] tracking-[-0.03em]"
                style={{ fontSize: "clamp(1.875rem, 4.6vw, 3rem)" }}
              >
                Votre premier élève
                <br />
                vous attend
              </h2>
              <p className="mt-6 max-w-xl leading-relaxed text-white/65">
                Créez votre fiche gratuitement, publiez-la, et rendez-la visible
                d’un simple abonnement. Vos cours, vos tarifs, vos élèves.
              </p>

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
 * Cormorant, puis un filet qui file jusqu'au bord. Repris de l'accueil pour
 * garder une seule et même voix.
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
