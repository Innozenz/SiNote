import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { auth } from "./auth";

/**
 * Client Better Auth (navigateur).
 *
 * Pas de `baseURL` : l'API d'auth (`/api/auth/*`) est toujours servie depuis le
 * même domaine que la page, donc le client suit l'origine courante. C'est le
 * réglage correct et il retire une classe de bug entière — auparavant on lisait
 * `NEXT_PUBLIC_APP_URL`, et un build de prod où cette variable valait encore
 * `http://localhost:3000` faisait tenter au site public une requête vers le
 * localhost du visiteur, ce que le navigateur bloque avec un avertissement
 * « ce site veut accéder à d'autres services sur votre appareil ».
 *
 * `NEXT_PUBLIC_APP_URL` reste utile ailleurs (liens des e-mails, `metadataBase`,
 * URLs Stripe), mais le client d'auth n'en dépend plus.
 *
 * `inferAdditionalFields` fait connaître au client les champs `firstName` /
 * `lastName` déclarés côté serveur, pour que `signUp.email` les accepte. Import
 * **de type** uniquement : le module serveur (Prisma, secrets) ne doit pas
 * entrer dans le bundle navigateur.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});
