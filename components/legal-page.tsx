import { AlertCircle } from "lucide-react";

import { PageHeader } from "@/components/editorial";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/**
 * Gabarit des pages légales (mentions légales, CGU, confidentialité).
 *
 * Le texte est structuré et rédigé, mais tout ce que seul l'éditeur connaît
 * — raison sociale, SIREN, adresse, hébergeur, contact DPO — est laissé en
 * crochets « [À compléter : …] ». Tant qu'un crochet subsiste, la page annonce
 * qu'elle est en cours de rédaction, et ses métadonnées la gardent hors des
 * moteurs : une page légale à trous indexée ferait plus de mal que pas de page.
 */
export type LegalSection = {
  title: string;
  paragraphs: string[];
};

const PLACEHOLDER = /\[À compléter/;

export function LegalPage({
  eyebrow,
  title,
  lead,
  updatedOn,
  sections,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  /** Date civile AAAA-MM-JJ de la dernière révision. */
  updatedOn: string;
  sections: LegalSection[];
}) {
  const draft = sections.some((section) =>
    section.paragraphs.some((paragraph) => PLACEHOLDER.test(paragraph))
  );

  const updated = new Date(`${updatedOn}T00:00:00Z`).toLocaleDateString(
    "fr-FR",
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <PageHeader
          size="page"
          eyebrow={eyebrow}
          title={title}
          lead={lead}
          meta={
            <p className="text-sm text-muted">Dernière mise à jour : {updated}</p>
          }
        />

        {draft ? (
          <p className="mt-8 flex items-start gap-2 rounded-md bg-warning-soft p-4 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            Page en cours de rédaction : les passages entre crochets restent à
            compléter par l&apos;éditeur du site.
          </p>
        ) : null}

        <div className="mt-10 flex flex-col gap-10">
          {sections.map((section, index) => (
            <section key={section.title} className="flex flex-col gap-3">
              <h2 className="text-xl">
                {index + 1}. {section.title}
              </h2>
              {section.paragraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  className={
                    PLACEHOLDER.test(paragraph)
                      ? "text-warning"
                      : "text-muted"
                  }
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
