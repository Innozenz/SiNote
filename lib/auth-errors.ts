import { describeFailure, type Failure } from "@/lib/http/failure";

/**
 * Échecs d'authentification, ramenés à la forme commune `Failure`.
 *
 * Deux raisons d'exister :
 *
 * 1. **`authClient` rejette sur panne réseau.** Vérifié : contre un port fermé,
 *    `requestPasswordReset` lève un `TypeError: fetch failed`. Les écrans de
 *    mot de passe n'avaient pas de `try/catch` — le `setIsLoading(false)`
 *    placé après l'`await` n'était donc jamais atteint, et le bouton restait
 *    indéfiniment en chargement, sans un mot. L'écran de connexion, lui, avait
 *    un `finally` mais pas de `catch` : le bouton se débloquait et rien ne
 *    s'affichait.
 *
 * 2. **Les messages de Better Auth sont en anglais** (« Invalid email or
 *    password »), et c'est ce que l'utilisateur lisait. On s'appuie sur le
 *    `code`, qui est stable, plutôt que sur le message, qui ne l'est pas.
 *
 * Le 401 est traité à part : sur un écran de connexion il signifie « mauvais
 * identifiants », pas « session expirée ». Reprendre le message générique
 * enverrait l'utilisateur se reconnecter alors qu'il est précisément en train
 * d'essayer.
 */

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou mot de passe incorrect.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "Un compte existe déjà avec cette adresse. Connectez-vous plutôt.",
  PASSWORD_TOO_SHORT: "Le mot de passe doit contenir au moins 8 caractères.",
  PASSWORD_TOO_LONG: "Ce mot de passe est trop long.",
  INVALID_TOKEN:
    "Ce lien n'est plus valable. Les liens expirent au bout d'une heure et ne servent qu'une fois.",
  INVALID_EMAIL: "Cette adresse e-mail n'est pas valide.",
  EMAIL_NOT_VERIFIED:
    "Confirmez d'abord votre adresse e-mail : un lien vient de vous être renvoyé.",
};

type AuthError = { status?: number; code?: string; message?: string };

/**
 * `caught` est ce qu'a levé le `catch` ; `error` l'objet rendu par le client
 * quand il n'a pas levé. Les deux sont acceptés pour n'avoir qu'un chemin
 * d'appel côté formulaire.
 */
export function authFailure(input: {
  caught?: unknown;
  error?: AuthError | null;
}): Failure {
  // Rien n'est parvenu au serveur.
  if (input.caught !== undefined) {
    return describeFailure({ status: null });
  }

  const error = input.error ?? {};
  const known = error.code ? MESSAGES[error.code] : undefined;

  if (known) {
    return {
      kind: error.status === 401 ? "forbidden" : "validation",
      message: known,
      canRetry: false,
      needsSignIn: false,
    };
  }

  // Code inconnu : on retombe sur le classement par statut, sans jamais
  // reprendre le message anglais du fournisseur.
  const failure = describeFailure({ status: error.status ?? 500 });

  if (error.status === 401) {
    return {
      ...failure,
      kind: "forbidden",
      message: "E-mail ou mot de passe incorrect.",
      needsSignIn: false,
    };
  }

  return failure;
}
