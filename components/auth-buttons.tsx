"use client";

import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { FormFailure } from "@/components/form-failure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authFailure } from "@/lib/auth-errors";
import { type Failure } from "@/lib/http/failure";
import { composeName } from "@/lib/user/name";
import { LogOut, Loader2, Mail } from "lucide-react";

const signInSchema = z.object({
  email: z.string().email("Adresse email invalide"),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères"),
});

/**
 * À l'inscription s'ajoutent le prénom (obligatoire : c'est lui qui signe les
 * avis et nomme la personne auprès des profs) et le nom, facultatif comme sur
 * /dashboard/compte. Sans eux, le compte se voyait attribuer la partie locale
 * de l'adresse e-mail en guise de nom, et « csgosmurf31 » s'affichait partout.
 */
const signUpSchema = signInSchema.extend({
  firstName: z
    .string()
    .trim()
    .min(1, "Le prénom est obligatoire")
    .max(80, "Le prénom ne peut pas dépasser 80 caractères"),
  lastName: z
    .string()
    .trim()
    .max(80, "Le nom ne peut pas dépasser 80 caractères"),
});

type Field = "email" | "password" | "firstName" | "lastName";

type FieldErrors = Partial<Record<Field, string>>;

export function AuthButtons({ callbackUrl }: { callbackUrl?: string | null }) {
  const session = authClient.useSession();
  const router = useRouter();
  // Destination après connexion : le chemin de retour s'il a été fourni (fiche
  // prof → « Se connecter pour réserver »), sinon l'espace connecté qui routera
  // selon le rôle. Déjà validé côté serveur comme chemin interne.
  const destination = callbackUrl ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  // Adresse en attente de confirmation : bascule l'écran vers « vérifiez votre
  // boîte mail » (après inscription, ou connexion d'un compte non vérifié).
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  if (session.isPending) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  if (session.data) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col">
          <p className="text-sm text-muted">Connecté en tant que</p>
          <p className="font-medium">{session.data.user.email}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.push("/dashboard")}
          >
            Dashboard
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              await authClient.signOut();
              router.refresh();
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Déconnexion
          </Button>
        </div>
      </div>
    );
  }

  const validateField = (field: Field, value: string) => {
    const result = signUpSchema.shape[field].safeParse(value);
    setErrors((prev) => ({
      ...prev,
      [field]: result.success ? undefined : result.error.issues[0].message,
    }));
  };

  const handleEmailAuth = async () => {
    const result = isSignUp
      ? signUpSchema.safeParse({ email, password, firstName, lastName })
      : signInSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as Field;
        fieldErrors[field] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setFailure(null);
    setIsLoading(true);

    // Le message de Better Auth est en anglais (« Invalid email or password »)
    // et c'est ce que lisait l'utilisateur. On passe par le `code`, stable, que
    // `authFailure` traduit.
    const onError = (ctx: { error: { status?: number; code?: string } }) =>
      setFailure(authFailure({ error: ctx.error }));

    try {
      if (isSignUp) {
        // Vérification d'e-mail obligatoire : l'inscription ne connecte pas
        // encore. En cas de succès, on bascule sur l'écran « vérifiez votre
        // boîte mail » — un lien vient de partir (sendOnSignUp).
        // `name` est recomposé côté serveur par le hook de création (l'invariant
        // de `lib/user/name.ts`) ; on l'envoie quand même cohérent, Better Auth
        // exigeant un `name` à l'inscription.
        const given = firstName.trim();
        const family = lastName.trim();
        await authClient.signUp.email(
          {
            email,
            password,
            name: composeName(given, family) ?? given,
            firstName: given,
            lastName: family || undefined,
          },
          {
            onSuccess: () => setVerificationEmail(email),
            onError,
          }
        );
      } else {
        await authClient.signIn.email(
          { email, password },
          {
            // Navigation franche vers l'espace connecté, pas `router.refresh()` :
            // rafraîchir /connexion puis la voir renvoyer un `redirect()` fait
            // boucler le router client en production. `window.location` recharge,
            // et /dashboard route selon le rôle (ou /onboarding si nul).
            onSuccess: () => {
              window.location.href = destination;
            },
            onError: (ctx) => {
              // Compte non confirmé : Better Auth vient de renvoyer un lien. On
              // montre l'écran de vérification plutôt qu'une erreur sèche.
              if (ctx.error?.code === "EMAIL_NOT_VERIFIED") {
                setVerificationEmail(email);
                return;
              }
              onError(ctx);
            },
          }
        );
      }
    } catch (caught) {
      // Il y avait un `finally` mais pas de `catch` : sur coupure réseau le
      // bouton se débloquait et rien ne s'affichait. `authClient` rejette dans
      // ce cas — vérifié contre un port fermé.
      setFailure(authFailure({ caught }));
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerification = async () => {
    if (!verificationEmail) return;
    setResending(true);
    setResent(false);
    try {
      await authClient.sendVerificationEmail({
        email: verificationEmail,
        callbackURL: "/dashboard",
      });
      setResent(true);
    } catch {
      // Renvoi impossible (réseau) : l'utilisateur peut réessayer.
    } finally {
      setResending(false);
    }
  };

  if (verificationEmail) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Mail className="h-6 w-6" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-medium">Vérifiez votre boîte mail</p>
          <p className="text-sm text-muted">
            Nous avons envoyé un lien de confirmation à{" "}
            <span className="font-medium text-foreground">{verificationEmail}</span>.
            Ouvrez-le pour activer votre compte.
          </p>
        </div>

        {resent ? (
          <p className="text-sm text-success">Lien renvoyé.</p>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={resendVerification}
            disabled={resending}
          >
            {resending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Renvoyer le lien
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setVerificationEmail(null);
            setResent(false);
          }}
        >
          Retour
        </Button>
      </div>
    );
  }

  return (
    // Un vrai `<form>` : Entrée dans le champ mot de passe soumet, et les
    // gestionnaires de mots de passe reconnaissent la paire identifiant/secret.
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!isLoading) void handleEmailAuth();
      }}
    >
        {isSignUp ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                autoComplete="given-name"
                value={firstName}
                maxLength={80}
                onChange={(e) => setFirstName(e.target.value)}
                onBlur={(e) => validateField("firstName", e.target.value)}
                aria-invalid={!!errors.firstName}
              />
              {errors.firstName ? (
                <p className="text-sm text-danger">{errors.firstName}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                autoComplete="family-name"
                value={lastName}
                maxLength={80}
                onChange={(e) => setLastName(e.target.value)}
                aria-invalid={!!errors.lastName}
              />
              <p className="text-xs text-subtle">Facultatif.</p>
            </div>
          </div>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="nom@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={(e) => validateField("email", e.target.value)}
            aria-invalid={!!errors.email}
          />
          {errors.email ? (
            <p className="text-sm text-danger">{errors.email}</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={(e) => validateField("password", e.target.value)}
            aria-invalid={!!errors.password}
          />
          {errors.password ? (
            <p className="text-sm text-danger">{errors.password}</p>
          ) : null}
        </div>
        <FormFailure failure={failure} />
        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          {isSignUp ? "S'inscrire" : "Se connecter"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setIsSignUp(!isSignUp);
            setErrors({});
            setFailure(null);
          }}
        >
          {isSignUp
            ? "Déjà un compte ? Se connecter"
            : "Pas de compte ? S'inscrire"}
        </Button>
        {/* Sans ce lien, la réinitialisation n'est atteignable qu'en
            connaissant son URL. */}
        {!isSignUp ? (
          <Link
            href="/mot-de-passe-oublie"
            className="text-center text-sm text-muted hover:underline"
          >
            Mot de passe oublié ?
          </Link>
        ) : null}
    </form>
  );
}
