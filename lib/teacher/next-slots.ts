import { computeAvailableSlots, type Slot } from "@/lib/availability";
import prisma from "@/lib/prisma";

/**
 * Prochains créneaux libres d'un lot de profs.
 *
 * Le « prochain créneau » se lit désormais dès la liste de résultats, sur
 * l'accueil et dans le dossier d'un prof côté élève : un élève choisit un prof
 * *disponible*, pas un prof en général, et lui faire ouvrir chaque fiche pour
 * le découvrir est ce que la refonte supprime.
 *
 * Même moteur, mêmes entrées que la route publique d'availability — règles,
 * exceptions, réservations bloquantes, pas de grille du prof — pour que ce qui
 * est annoncé ici soit exactement ce que la fiche proposera ensuite. Les trois
 * requêtes sont faites pour tout le lot à la fois (une page de vingt profs ne
 * doit pas coûter soixante requêtes), puis le moteur tourne par prof.
 *
 * La fenêtre est courte (`days`, 14 par défaut) : un créneau dans deux mois
 * n'aide pas à choisir, et le calcul reste borné.
 */

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** Statuts qui immobilisent un créneau, alignés sur booking_teacher_no_overlap. */
const BLOCKING_STATUSES = ["PENDING", "CONFIRMED"] as const;

export type NextSlots = {
  timezone: string;
  slotDurationMin: number;
  slots: Slot[];
};

export async function getNextSlotsForTeachers(
  teacherIds: string[],
  {
    count = 3,
    days = 14,
    now = new Date(),
  }: { count?: number; days?: number; now?: Date } = {}
): Promise<Map<string, NextSlots>> {
  const result = new Map<string, NextSlots>();
  if (teacherIds.length === 0) return result;

  const from = now;
  const to = new Date(now.getTime() + days * DAY_MS);

  const teachers = await prisma.teacherProfile.findMany({
    where: { id: { in: teacherIds } },
    select: {
      id: true,
      defaultDurationMin: true,
      slotGranularityMin: true,
      bufferMin: true,
      minNoticeHours: true,
      bookingHorizonDays: true,
      user: { select: { timezone: true } },
      rules: {
        select: {
          weekday: true,
          startMinute: true,
          endMinute: true,
          validFrom: true,
          validUntil: true,
        },
      },
      exceptions: {
        where: {
          date: {
            gte: new Date(from.getTime() - DAY_MS),
            lte: new Date(to.getTime() + DAY_MS),
          },
        },
        select: { date: true, type: true, startMinute: true, endMinute: true },
      },
    },
  });

  // Le battement le plus large du lot suffit à ratisser assez loin pour tous.
  const maxBuffer = teachers.reduce((max, t) => Math.max(max, t.bufferMin), 0);
  const busyMargin = maxBuffer * MINUTE_MS + DAY_MS;

  const busyRows = await prisma.booking.findMany({
    where: {
      teacherId: { in: teacherIds },
      status: { in: [...BLOCKING_STATUSES] },
      startsAt: { lt: new Date(to.getTime() + busyMargin) },
      endsAt: { gt: new Date(from.getTime() - busyMargin) },
    },
    select: { teacherId: true, startsAt: true, endsAt: true },
  });

  const busyByTeacher = new Map<string, { startsAt: Date; endsAt: Date }[]>();
  for (const row of busyRows) {
    const list = busyByTeacher.get(row.teacherId) ?? [];
    list.push({ startsAt: row.startsAt, endsAt: row.endsAt });
    busyByTeacher.set(row.teacherId, list);
  }

  for (const teacher of teachers) {
    const slots = computeAvailableSlots({
      timezone: teacher.user.timezone,
      rules: teacher.rules,
      exceptions: teacher.exceptions,
      busy: busyByTeacher.get(teacher.id) ?? [],
      range: { from, to },
      slotDurationMin: teacher.defaultDurationMin,
      granularityMin: teacher.slotGranularityMin,
      bufferMin: teacher.bufferMin,
      minNoticeHours: teacher.minNoticeHours,
      bookingHorizonDays: teacher.bookingHorizonDays,
      now,
    });

    result.set(teacher.id, {
      timezone: teacher.user.timezone,
      slotDurationMin: teacher.defaultDurationMin,
      slots: slots.slice(0, count),
    });
  }

  return result;
}

/**
 * Libellé court d'un créneau pour une liste : « ven. 18 · 09:00 », dans le
 * fuseau du prof — c'est l'heure à laquelle le cours aura lieu.
 *
 * L'implémentation a déménagé dans `lib/teacher/slot-label.ts`, qui n'importe
 * pas Prisma : le widget de réservation est un composant client et écrit les
 * mêmes phrases. Réexporté ici pour que les appelants serveur n'aient rien à
 * changer, et pour qu'il n'existe jamais deux formulations de la même heure.
 */
export { formatSlotLong, formatSlotShort } from "@/lib/teacher/slot-label";
