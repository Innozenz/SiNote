import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";

import { AdminUsers, type AdminUserRow } from "@/components/admin-users";
import { PageHeader } from "@/components/editorial";
import { ListFilters } from "@/components/list-filters";
import prisma from "@/lib/prisma";
import { isMinor } from "@/lib/student/profile";
import { ageOn } from "@/lib/user/age";
import { fullName } from "@/lib/user/name";
import { isSubscriptionActive } from "@/lib/teacher/visibility";

/**
 * Utilisateurs (administration).
 *
 * Liste tout le monde avec rôle et fiche, du plus récent au plus ancien. La
 * page reste serveur ; recherche et filtre de rôle vivent dans l'URL via
 * `ListFilters`, comme les autres listes. Le seul geste d'écriture — l'accès
 * d'un prof — passe par l'îlot client et sa route admin dédiée.
 *
 * Le layout `/admin` porte déjà la porte (`requireAdmin`, `notFound`), donc pas
 * de re-contrôle ici, comme la page de modération des avis.
 *
 * Le rôle est **affiché, jamais modifiable** : aucune interface ne distribue de
 * rôle (surtout ADMIN), décision documentée dans `lib/admin/session.ts`.
 */
export const metadata: Metadata = { title: "Utilisateurs" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  const sp = await searchParams;
  const needle = (sp.q ?? "").trim();
  const role = sp.role ?? "";

  const where: Prisma.UserWhereInput = {};
  if (needle) {
    where.OR = [
      { name: { contains: needle, mode: "insensitive" } },
      { email: { contains: needle, mode: "insensitive" } },
      { firstName: { contains: needle, mode: "insensitive" } },
      { lastName: { contains: needle, mode: "insensitive" } },
    ];
  }
  // « Admin » filtre sur la capacité (`isAdmin`), pas sur le rôle : un admin
  // garde son rôle marketplace (prof/élève) ou n'en a aucun.
  if (role === "ADMIN") {
    where.isAdmin = true;
  } else if (role === "none") {
    where.role = null;
  } else if (role === "TEACHER" || role === "STUDENT") {
    where.role = role;
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      email: true,
      emailVerified: true,
      image: true,
      role: true,
      isAdmin: true,
      createdAt: true,
      timezone: true,
      teacherProfile: {
        select: {
          status: true,
          slug: true,
          city: true,
          headline: true,
          stripePriceId: true,
          stripeSubscriptionId: true,
          stripeCurrentPeriodEnd: true,
          _count: {
            select: { bookings: true, reviews: true, instruments: true },
          },
        },
      },
      studentProfile: {
        select: {
          birthDate: true,
          city: true,
          goals: true,
          musicalBackground: true,
          prefersOnline: true,
          guardianName: true,
          guardianEmail: true,
          guardianPhone: true,
          _count: { select: { bookings: true } },
        },
      },
    },
  });

  const now = new Date();

  const rows: AdminUserRow[] = users.map((user) => {
    const t = user.teacherProfile;
    const s = user.studentProfile;

    return {
      id: user.id,
      name: fullName(user) ?? "Sans nom",
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
      // La valeur ADMIN de l'enum est dépréciée et n'est plus écrite ; on la
      // ramène à null par prudence, l'admin vivant dans `isAdmin`.
      role: user.role === "ADMIN" ? null : user.role,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt.toISOString(),
      timezone: user.timezone,
      teacher: t
        ? {
            status: t.status as "DRAFT" | "PUBLISHED",
            slug: t.slug,
            city: t.city,
            headline: t.headline,
            priceId: t.stripePriceId,
            currentPeriodEnd: t.stripeCurrentPeriodEnd?.toISOString() ?? null,
            active: isSubscriptionActive(t.stripeCurrentPeriodEnd, now),
            // Un vrai abonnement porte un `stripeSubscriptionId` ; une date sans
            // abonnement est un accès accordé à la main.
            kind: t.stripeSubscriptionId
              ? "stripe"
              : t.stripeCurrentPeriodEnd
                ? "manual"
                : "none",
            counts: t._count,
          }
        : null,
      student: s
        ? {
            city: s.city,
            age: s.birthDate ? ageOn(s.birthDate, now) : null,
            isMinor: isMinor(s.birthDate, now),
            guardianName: s.guardianName,
            guardianEmail: s.guardianEmail,
            guardianPhone: s.guardianPhone,
            goals: s.goals,
            musicalBackground: s.musicalBackground,
            prefersOnline: s.prefersOnline,
            counts: s._count,
          }
        : null,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        size="page"
        eyebrow="Administration"
        title="Utilisateurs"
        lead="Tous les comptes, leur rôle et leur fiche. L'accès d'un professeur se gère ici, sans passer par Stripe."
        meta={
          <p className="text-sm text-muted">
            {users.length} compte{users.length > 1 ? "s" : ""}
          </p>
        }
      />

      <ListFilters
        searchKey="q"
        searchPlaceholder="Rechercher par nom ou e-mail…"
        chips={[
          {
            key: "role",
            label: "Rôle",
            options: [
              { value: "ADMIN", label: "Admin" },
              { value: "TEACHER", label: "Professeur" },
              { value: "STUDENT", label: "Élève" },
              { value: "none", label: "Onboarding incomplet" },
            ],
          },
        ]}
      />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          Aucun utilisateur ne correspond.
        </p>
      ) : (
        <AdminUsers rows={rows} />
      )}
    </div>
  );
}