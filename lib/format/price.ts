/**
 * Prix en euros, une seule écriture pour toute l'application.
 *
 * L'espace prof écrivait « 135 € » sur le tableau de bord et « 45.00 € » dans
 * les demandes — deux formats pour la même donnée, dont un avec un point
 * décimal anglais. Ici : séparateur français, pas de décimales quand le montant
 * est rond (« 45 € »), deux sinon (« 42,50 € »). L'espace fine insécable avant
 * le symbole est celle de `Intl` pour `fr-FR`.
 */
export function formatPrice(cents: number): string {
  const euros = cents / 100;
  const whole = Number.isInteger(euros);

  return euros.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
