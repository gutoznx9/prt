import type { Customer, DateKey, Database, ID, Minutes, Service, WaitlistEntry } from './types';
import { diffDays } from './time';
import { getCustomerStats } from './customers';

export interface FreedSlot {
  barberId: ID;
  date: DateKey;
  startMin: Minutes;
  /** Minutos livres disponíveis a partir de `startMin` */
  windowMin: number;
}

export interface OfferCandidate {
  customer: Customer;
  service: Service;
  waitlistEntry: WaitlistEntry | null;
  reason: string;
}

/** Entradas da lista de espera que se encaixam no horário liberado. */
export function findWaitlistMatches(db: Database, slot: FreedSlot): OfferCandidate[] {
  const result: OfferCandidate[] = [];
  for (const entry of db.waitlist) {
    if (entry.status !== 'active' && entry.status !== 'offered') continue;
    if (entry.date !== slot.date) continue;
    if (entry.barberId && entry.barberId !== slot.barberId) continue;
    if (slot.startMin < entry.fromMin || slot.startMin > entry.toMin) continue;
    const service = db.services.find((s) => s.id === entry.serviceId);
    const customer = db.customers.find((c) => c.id === entry.customerId);
    if (!service || !customer || service.durationMin > slot.windowMin) continue;
    // Quem já tem horário neste dia não precisa do aviso.
    const alreadyBooked = db.appointments.some(
      (a) => a.customerId === customer.id && a.date === slot.date && a.status !== 'cancelled',
    );
    if (alreadyBooked) continue;
    result.push({ customer, service, waitlistEntry: entry, reason: 'Na lista de espera' });
  }
  return result.sort((a, b) => a.waitlistEntry!.createdAt.localeCompare(b.waitlistEntry!.createdAt));
}

/**
 * Clientes recorrentes "no ponto" de voltar (último corte há 3+ semanas e sem horário marcado).
 * Complementam a lista de espera quando ela é pequena.
 */
export function findReturningCustomers(db: Database, slot: FreedSlot, today: DateKey, limit = 3): OfferCandidate[] {
  const exclude = new Set(findWaitlistMatches(db, slot).map((c) => c.customer.id));
  const result: OfferCandidate[] = [];
  for (const customer of db.customers) {
    if (exclude.has(customer.id)) continue;
    const stats = getCustomerStats(db, customer.id, today);
    if (!stats.lastVisit || stats.visits < 3 || stats.nextAppointment) continue;
    const since = diffDays(today, stats.lastVisit);
    if (since < 21) continue;
    const service = db.services.find((s) => s.id === stats.topServiceId);
    if (!service || service.durationMin > slot.windowMin) continue;
    if (stats.topBarberId && stats.topBarberId !== slot.barberId) continue;
    result.push({ customer, service, waitlistEntry: null, reason: `Último corte há ${since} dias` });
  }
  return result.slice(0, limit);
}

export function activeWaitlist(db: Database, today: DateKey): WaitlistEntry[] {
  return db.waitlist.filter((w) => (w.status === 'active' || w.status === 'offered') && w.date >= today);
}
