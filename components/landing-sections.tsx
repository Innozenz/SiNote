import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { SectionTitle } from "@/components/editorial";

/**
 * Sections mutualisées des pages d'atterrissage `/cours/*` : fil d'Ariane
 * visible, FAQ et nuages de liens internes. Server-safe (aucun état client).
 * Le maillage interne qu'elles produisent est aussi important pour le SEO que
 * le contenu lui-même : il fait circuler le crawl entre instruments et villes.
 */

export function LandingBreadcrumb({
  items,
}: {
  items: { name: string; path?: string }[];
}) {
  return (
    <nav aria-label="Fil d'Ariane" className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => (
          <li key={item.name} className="flex items-center gap-1.5">
            {index > 0 ? (
              <ChevronRight className="h-3 w-3 text-subtle" />
            ) : null}
            {item.path ? (
              <Link href={item.path} className="hover:underline">
                {item.name}
              </Link>
            ) : (
              <span className="text-foreground">{item.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function LandingFaqSection({
  entries,
}: {
  entries: { question: string; answer: string }[];
}) {
  return (
    <section className="flex flex-col gap-5">
      <SectionTitle>Questions fréquentes</SectionTitle>
      <div className="divide-y divide-border border-y border-border">
        {entries.map((entry) => (
          <details key={entry.question} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-foreground">
              {entry.question}
              <ChevronRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-open:rotate-90" />
            </summary>
            <p className="mt-3 text-muted">{entry.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function LandingLinkCloud({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string; hint?: string }[];
}) {
  if (links.length === 0) return null;

  return (
    <section className="flex flex-col gap-5">
      <SectionTitle>{title}</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {link.label}
            {link.hint ? (
              <span className="text-subtle">{link.hint}</span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
