"use client";

import type { Role } from "@prisma/client";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CreditCard,
  LogOut,
  Settings,
  ShieldCheck,
  Star,
  UserCog,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";

export type NavUser = {
  name: string | null;
  email: string;
  image: string | null;
};

/**
 * Menu du compte.
 *
 * C'est le seul endroit d'où l'on peut se déconnecter : le bouton rouge de
 * l'ancien tableau de bord de démonstration a disparu avec lui, et une
 * application dont on ne peut pas sortir n'est pas une application.
 *
 * Les entrées dépendent du rôle. Auparavant elles pointaient toutes deux vers
 * /dashboard, ce qui donnait un menu où « Abonnement » n'ouvrait pas
 * l'abonnement.
 *
 * `isAdmin` est **orthogonal** au rôle : un prof ou un élève peut être admin,
 * et voit alors une entrée « Administration » en plus de ses entrées de rôle.
 * Un admin **sans** rôle marketplace (role null) n'a que cette entrée.
 *
 * **L'identité vient du layout, pas de `authClient.useSession()`.** Better Auth
 * garde la session en cache côté client : après un changement de nom sur
 * /dashboard/compte, l'en-tête continuait d'afficher l'ancien juste au-dessus
 * du formulaire qui venait de dire « enregistré ». Le layout lit déjà
 * l'utilisateur pour son contrôle de rôle, donc élargir son `select` ne coûte
 * aucune requête, et un `router.refresh()` suffit à remettre l'en-tête à jour.
 * C'est aussi la raison pour laquelle `SiteHeader` est un Server Component :
 * une identité lue côté client clignote.
 *
 * Le composant reste client pour le menu déroulant et la déconnexion.
 */
export function UserNav({
  role,
  isAdmin = false,
  user,
  showDetails = false,
  onNavigate,
}: {
  role: Role | null;
  isAdmin?: boolean;
  user: NavUser;
  /** Appelé avant chaque navigation du menu — sert au tiroir mobile à se
   * refermer quand on part vers une page depuis le compte. */
  onNavigate?: () => void;
  /**
   * Déclencheur « plein » : avatar + nom + e-mail, toute la rangée cliquable.
   * Utilisé en pied de barre latérale, où l'identité est déjà affichée à côté
   * de l'avatar — la cible de clic couvre alors tout le bloc, pas le seul
   * avatar. Ailleurs (en-têtes), le déclencheur reste l'avatar seul.
   */
  showDetails?: boolean;
}) {
  const router = useRouter();

  const initials = user.name
    ? user.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : user.email.charAt(0).toUpperCase();

  const byRole =
    role === "TEACHER"
      ? [
          { icon: UserCog, label: "Ma fiche", href: "/dashboard/prof" },
          { icon: Star, label: "Mes avis", href: "/dashboard/prof/avis" },
          {
            icon: CreditCard,
            label: "Abonnement",
            href: "/dashboard/prof/abonnement",
          },
        ]
      : role === "STUDENT"
      ? [
          { icon: CalendarDays, label: "Mes cours", href: "/dashboard/cours" },
          {
            icon: UserCog,
            label: "Mon profil",
            href: "/dashboard/cours/profil",
          },
        ]
      : [];

  // L'administration s'ajoute par-dessus le rôle (capacité orthogonale). « Mon
  // compte » n'apparaît qu'avec un rôle marketplace : c'est /dashboard/compte,
  // et l'espace connecté est fermé à un admin sans rôle. Le nom appartient à la
  // personne, pas à sa fiche prof ni à son profil élève.
  const items = [
    ...byRole,
    ...(isAdmin
      ? [{ icon: ShieldCheck, label: "Administration", href: "/admin/utilisateurs" }]
      : []),
    ...(role
      ? [{ icon: Settings, label: "Mon compte", href: "/dashboard/compte" }]
      : []),
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {showDetails ? (
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage
                src={user.image || undefined}
                alt={user.name || user.email}
              />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {user.name ?? "Mon compte"}
              </span>
              <span className="block truncate text-xs text-muted">
                {user.email}
              </span>
            </span>
            <span className="sr-only">Ouvrir le menu du compte</span>
          </button>
        ) : (
          <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0">
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={user.image || undefined}
                alt={user.name || user.email}
              />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="sr-only">Mon compte</span>
          </Button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            {user.name ? (
              <p className="text-sm font-medium leading-none">{user.name}</p>
            ) : null}
            <p className="truncate text-xs leading-none text-muted">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <DropdownMenuItem
                key={item.href}
                onClick={() => {
                  onNavigate?.();
                  router.push(item.href);
                }}
              >
                <Icon className="mr-2 h-4 w-4" />
                <span>{item.label}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={async () => {
            onNavigate?.();
            await authClient.signOut();
            router.push("/");
            router.refresh();
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Se déconnecter</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
