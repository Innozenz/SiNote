"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { markCoursSeen } from "@/lib/student/mark-cours-seen";

/**
 * Déclenche le marquage « vu » de la page « Mes cours » au montage réel.
 *
 * Rien de visible. Il tourne côté client (donc hors préchargement de lien), puis
 * `router.refresh()` : la barre latérale est un layout partagé que Next préserve
 * d'une navigation à l'autre — sans ce rafraîchissement, la pastille resterait
 * affichée alors que les cours sont désormais vus. Le rafraîchissement recalcule
 * le layout, et la pastille tombe à zéro. L'état des composants client (un
 * formulaire d'avis ouvert…) est préservé par `refresh`.
 */
export function MarkCoursSeen() {
  const router = useRouter();

  useEffect(() => {
    markCoursSeen().then(() => router.refresh());
  }, [router]);

  return null;
}
