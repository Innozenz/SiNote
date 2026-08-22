"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { markReportsSeen } from "@/lib/reports/mark-seen";

/**
 * Marque les comptes rendus comme lus à l'ouverture de leur surface (atelier du
 * prof, dossier de l'élève).
 *
 * Rien de visible. Même mécanique que `MarkCoursSeen`/`MarkThreadRead` : le
 * marquage tourne côté client (hors préchargement), puis `router.refresh()`
 * recalcule le layout partagé pour faire tomber la pastille de la barre
 * latérale.
 */
export function MarkReportsSeen() {
  const router = useRouter();

  useEffect(() => {
    markReportsSeen().then(() => router.refresh());
  }, [router]);

  return null;
}
