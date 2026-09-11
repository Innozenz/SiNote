/**
 * Ossature d'attente d'une page de l'espace connecté.
 *
 * Rendue par les `loading.tsx` : sans eux, une navigation vers l'agenda ou les
 * demandes n'affichait rien tant que la requête n'avait pas répondu, et le
 * clic paraissait mort. La forme reprend celle de toutes les pages — eyebrow,
 * titre, filet, puis des lignes — pour que le contenu vienne se poser dessus.
 */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-8">
      <span className="sr-only">Chargement…</span>
      <div className="flex flex-col gap-4 border-b border-border pb-6">
        <div className="h-3 w-32 animate-pulse rounded bg-surface-strong" />
        <div className="h-9 w-64 animate-pulse rounded bg-surface-strong" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-surface" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="h-16 animate-pulse rounded-lg bg-surface"
            style={{ opacity: 1 - index * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}
