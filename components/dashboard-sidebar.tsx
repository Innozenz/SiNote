"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CalendarClock,
  CalendarDays,
  CreditCard,
  FileText,
  FolderOpen,
  Inbox,
  LayoutDashboard,
  type LucideIcon,
  Menu,
  MessageSquare,
  Music4,
  Search,
  Star,
  TrendingUp,
  UserCog,
  Users,
  X,
} from "lucide-react";

import { UserNav, type NavUser } from "@/components/user-nav";
import { cn } from "@/lib/utils";

/**
 * Navigation de l'espace connecté.
 *
 * Une barre latérale verticale sur grand écran (marque, navigation, recherche,
 * compte), avec une bordure à droite. Sur mobile, où une sidebar serait
 * inutilisable, un **bandeau** (logo · burger · compte) ouvre un **tiroir** qui
 * porte la même navigation verticale — une liste longue (onze entrées côté prof)
 * défilant horizontalement était impossible à parcourir, ses items partant hors
 * champ. Le tiroir est un Radix Dialog : piège de focus, `Échap`, verrou de
 * défilement, `aria-modal` et retour du focus au burger sont gérés pour nous ;
 * il ne nous reste qu'à le fermer au changement de route.
 *
 * Client Component pour marquer l'entrée courante (`usePathname`) et tenir
 * l'ouverture du tiroir ; les listes d'items vivent ici car les icônes ne
 * traversent pas la frontière serveur → client. Le layout ne passe que le rôle,
 * `isAdmin`, l'identité et un compteur.
 */
type Item = { href: string; icon: LucideIcon; label: string; exact?: boolean };

const TEACHER_ITEMS: Item[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Tableau de bord", exact: true },
  { href: "/dashboard/prof", icon: UserCog, label: "Ma fiche", exact: true },
  {
    href: "/dashboard/prof/disponibilites",
    icon: CalendarDays,
    label: "Disponibilités",
  },
  { href: "/dashboard/prof/agenda", icon: CalendarClock, label: "Agenda" },
  { href: "/dashboard/prof/demandes", icon: Inbox, label: "Demandes" },
  { href: "/dashboard/prof/comptes-rendus", icon: FileText, label: "Comptes rendus" },
  { href: "/dashboard/prof/eleves", icon: Users, label: "Mes élèves" },
  { href: "/dashboard/messages", icon: MessageSquare, label: "Messages" },
  { href: "/dashboard/prof/activite", icon: TrendingUp, label: "Activité" },
  { href: "/dashboard/prof/avis", icon: Star, label: "Avis" },
  { href: "/dashboard/prof/abonnement", icon: CreditCard, label: "Abonnement" },
];

const STUDENT_ITEMS: Item[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Tableau de bord", exact: true },
  { href: "/dashboard/cours", icon: CalendarClock, label: "Mes cours", exact: true },
  { href: "/dashboard/dossiers", icon: FolderOpen, label: "Mes dossiers" },
  { href: "/dashboard/messages", icon: MessageSquare, label: "Messages" },
  { href: "/dashboard/cours/profil", icon: UserCog, label: "Mon profil" },
];

// Bordure gauche transparente sur tous les items : l'actif la colore en épicéa
// (son « filet »), et la réserver dès l'état neutre évite tout décalage de 2px
// au changement de page.
const ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-md border-l-2 border-transparent px-3 py-2 text-sm font-medium transition-colors";

export function DashboardSidebar({
  role,
  isAdmin,
  user,
  badges,
}: {
  role: "TEACHER" | "STUDENT";
  /** Capacité admin, orthogonale au rôle : ajoute l'entrée « Administration »
   * au menu du compte. */
  isAdmin: boolean;
  user: NavUser;
  /** Compteur par href (demandes en attente, cours avec du nouveau…). */
  badges: Record<string, number>;
}) {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);

  const items = role === "TEACHER" ? TEACHER_ITEMS : STUDENT_ITEMS;
  const home = "/dashboard";

  // Le tiroir se ferme au clic, explicitement, plutôt que dans un effet réagissant
  // à la route (un `setState` synchrone y est déconseillé) : chaque lien appelle
  // `setOpen(false)`, et le menu du compte le fait via son `onNavigate`. Toutes
  // les navigations déclenchées depuis le tiroir le referment donc.

  // Amène l'entrée courante dans le champ de la nav verticale (desktop).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [pathname]);

  const isActive = (item: Item) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  const renderItem = (item: Item, attachRef = false) => {
    const Icon = item.icon;
    const active = isActive(item);
    const badge = badges[item.href] ?? 0;

    return (
      <Link
        key={item.href}
        ref={attachRef && active ? activeRef : undefined}
        href={item.href}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={cn(
          ITEM_CLASS,
          active
            ? "border-primary bg-sidebar-active text-sidebar-foreground"
            : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{item.label}</span>
        {badge > 0 ? (
          <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
            {badge}
          </span>
        ) : null}
      </Link>
    );
  };

  const findAProf = (
    <Link
      href="/profs"
      onClick={() => setOpen(false)}
      className={cn(
        ITEM_CLASS,
        "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="flex-1">Trouver un prof</span>
    </Link>
  );

  const brand = (
    <Link
      href={home}
      onClick={() => setOpen(false)}
      className="flex items-center gap-2 font-semibold"
    >
      <Music4 className="h-5 w-5 text-primary" />
      SiNote
    </Link>
  );

  return (
    <>
      {/* Bandeau mobile : la nav vit dans le tiroir, pas ici. */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          aria-expanded={open}
          aria-controls="dashboard-drawer"
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Menu className="h-5 w-5" />
        </button>
        {brand}
        <UserNav role={role} isAdmin={isAdmin} user={user} />
      </div>

      {/* Tiroir mobile — Radix Dialog : focus piégé, Échap, verrou de défilement,
          aria-modal et retour du focus au burger sont gérés par la primitive. */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="drawer-overlay fixed inset-0 z-40 bg-black/40 lg:hidden" />
          <Dialog.Content
            id="dashboard-drawer"
            aria-describedby={undefined}
            className="drawer-panel fixed inset-y-0 left-0 z-50 flex w-72 max-w-[82%] flex-col bg-sidebar text-sidebar-foreground shadow-xl lg:hidden"
          >
            <Dialog.Title className="sr-only">Menu de navigation</Dialog.Title>

            <div className="flex items-center justify-between gap-2 border-b border-sidebar-border px-4 py-3">
              {brand}
              <Dialog.Close
                aria-label="Fermer le menu"
                className="rounded-md p-1.5 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>

            <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3">
              {items.map((item) => renderItem(item))}
              <span aria-hidden className="my-2 h-px shrink-0 bg-sidebar-border" />
              {findAProf}
            </nav>

            <div className="border-t border-sidebar-border p-2">
              <UserNav
                role={role}
                isAdmin={isAdmin}
                user={user}
                showDetails
                tone="dark"
                onNavigate={() => setOpen(false)}
              />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Sidebar desktop — inchangée. */}
      <aside className="hidden bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-sidebar-border">
        <div className="flex items-center px-4 py-4">{brand}</div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-2">
          {items.map((item) => renderItem(item, true))}
          <span aria-hidden className="my-2 h-px shrink-0 bg-sidebar-border" />
          {findAProf}
        </nav>

        <div className="border-t border-sidebar-border p-2">
          <UserNav role={role} isAdmin={isAdmin} user={user} showDetails tone="dark" />
        </div>
      </aside>
    </>
  );
}
