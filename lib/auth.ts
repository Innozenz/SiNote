import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { buildResetPasswordEmail } from "./notifications/account";
import { sendNotification } from "./notifications/send";
import prisma from "./prisma";

/** Validité du lien de réinitialisation. */
const RESET_TOKEN_MINUTES = 60;

/**
 * Origines de confiance.
 *
 * Better Auth rejette (403 `INVALID_ORIGIN`) toute requête dont l'origine n'est
 * pas listée ; par défaut la liste ne contient que `baseURL` (BETTER_AUTH_URL).
 * Or le site répond à la fois sur l'apex (`sinote.fr`) et sur `www.sinote.fr`
 * selon la façon dont le domaine résout : si l'un manque, la connexion échoue
 * depuis cette origine. On liste donc les deux variantes de chaque URL connue.
 *
 * Le vrai remède côté prod reste de choisir UNE origine canonique et de
 * rediriger l'autre en 301 (config d'hébergement/DNS) — ceci garantit surtout
 * que l'authentification marche quelle que soit celle qu'ouvre le visiteur.
 */
function withWwwVariant(url: string): string[] {
    try {
        const parsed = new URL(url);
        const bare = parsed.hostname.replace(/^www\./, "");
        return [
            `${parsed.protocol}//${bare}`,
            `${parsed.protocol}//www.${bare}`,
        ];
    } catch {
        return [];
    }
}

const trustedOrigins = [
    ...new Set(
        [process.env.BETTER_AUTH_URL, process.env.NEXT_PUBLIC_APP_URL]
            .filter((value): value is string => Boolean(value))
            .flatMap(withWwwVariant)
    ),
];

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    // En dev, les deux variables valent localhost : la liste contient donc
    // localhost (+ sa variante www, inoffensive). Si aucune n'est définie, on
    // laisse Better Auth sur son défaut plutôt que d'imposer une liste vide.
    ...(trustedOrigins.length > 0 ? { trustedOrigins } : {}),
    emailAndPassword: {
        enabled: true,
        /**
         * Envoi du lien de réinitialisation.
         *
         * Attendu, contrairement aux notifications de réservation : ici l'envoi
         * *est* la fonctionnalité. Si l'e-mail ne part pas, l'utilisateur reste
         * bloqué sans le savoir, et il vaut mieux le tracer.
         *
         * L'URL vient de Better Auth et porte déjà le jeton — la réécrire le
         * casserait.
         */
        sendResetPassword: async ({ user, url }) => {
            const result = await sendNotification(
                buildResetPasswordEmail({
                    email: user.email,
                    name: user.name ?? null,
                    url,
                    expiresInMinutes: RESET_TOKEN_MINUTES,
                })
            );

            if (!result.ok) {
                console.error("[RESET_PASSWORD] envoi impossible :", result.error);
            }
        },
        resetPasswordTokenExpiresIn: RESET_TOKEN_MINUTES * 60,
        /**
         * Un mot de passe réinitialisé signifie souvent un compte compromis :
         * les sessions ouvertes ailleurs doivent tomber, sinon un intrus déjà
         * connecté le reste malgré le changement.
         */
        revokeSessionsOnPasswordReset: true,
    },
    /**
     * Limitation par IP des routes d'authentification. Sans elle, la
     * connexion s'essaie en boucle (force brute) et le reset de mot de passe
     * devient un canon à e-mails vers n'importe quelle adresse.
     *
     * `enabled: true` force la limite aussi en développement : une protection
     * qu'on ne voit jamais fonctionner localement finit par casser en
     * production sans qu'on le remarque. Stockage en mémoire — suffisant tant
     * que l'application tourne sur une seule instance ; passer à un stockage
     * partagé (base ou Redis) le jour où elle est répliquée.
     */
    rateLimit: {
        enabled: true,
        window: 60,
        max: 100,
        customRules: {
            // 5 tentatives de connexion par minute et par IP.
            "/sign-in/email": { window: 60, max: 5 },
            // 3 e-mails de réinitialisation par heure et par IP. Le chemin
            // doit être exactement celui de l'endpoint (comparaison stricte
            // côté Better Auth) : c'est /request-password-reset, pas
            // /forget-password, sinon la règle ne s'applique jamais et la
            // route retombe sur la limite globale (100/min).
            "/request-password-reset": { window: 3600, max: 3 },
            "/reset-password": { window: 3600, max: 5 },
        },
    },
});
