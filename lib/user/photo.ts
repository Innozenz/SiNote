import { AVATAR_SIZE } from "./photo-constants";

/**
 * Traitement de la photo de profil (serveur uniquement — `sharp`).
 *
 * Le retraitement n'est pas cosmétique : `sharp` ré-encode l'image, ce qui
 * **supprime les métadonnées EXIF** (le GPS d'une photo prise au téléphone est
 * une fuite RGPD réelle) et borne le poids stocké. On normalise en WebP carré.
 *
 * Les bornes (types, taille) vivent dans `photo-constants.ts` pour être
 * partagées avec le client sans embarquer `sharp`.
 */

/**
 * Redimensionne en carré, ré-encode en WebP, sans métadonnées.
 *
 * `.rotate()` sans argument applique l'orientation EXIF *avant* que le
 * ré-encodage ne la supprime — sinon une photo prise en paysage ressortirait
 * couchée. `fit: cover` remplit le carré, `position: attention` cadre sur la
 * zone la plus détaillée (souvent le visage).
 *
 * Lève si l'entrée n'est pas une image lisible — l'appelant traduit en 400.
 */
export async function processAvatar(input: Buffer): Promise<Buffer> {
  // Import paresseux : sharp (module natif) n'est chargé qu'au traitement d'une
  // photo, jamais à l'import du module.
  const sharp = (await import("sharp")).default;
  return sharp(input)
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();
}
