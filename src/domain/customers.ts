import type { Appointment, DateKey, Database, ID } from './types';
import { diffDays } from './time';

export type CustomerStatus = 'new' | 'regular' | 'away' | 'waitlist';

export interface CustomerStats {
  visits: number;
  totalAppointments: number;
  cancellations: number;
  lastVisit: DateKey | null;
  topServiceId: ID | null;
  topBarberId: ID | null;
  nextAppointment: Appointment | null;
  spentCents: number;
  status: CustomerStatus;
  history: Appointment[];
}

export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  new: 'Novo',
  regular: 'Frequente',
  away: 'Sumido',
  waitlist: 'Lista de espera',
};

function mostFrequent(values: ID[]): ID | null {
  const counts = new Map<ID, number>();
  let best: ID | null = null;
  let bestCount = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

export function getCustomerStats(db: Database, customerId: ID, today: DateKey): CustomerStats {
  const all = db.appointments
    .filter((a) => a.customerId === customerId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.startMin - a.startMin);
  const visits = all.filter((a) => a.status === 'completed' || (a.date < today && (a.status === 'confirmed' || a.status === 'pending')));
  const upcoming = all
    .filter((a) => a.date >= today && (a.status === 'pending' || a.status === 'confirmed'))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  const lastVisit = visits[0]?.date ?? null;
  const onWaitlist = db.waitlist.some((w) => w.customerId === customerId && w.status === 'active' && w.date >= today);

  let status: CustomerStatus;
  if (onWaitlist) status = 'waitlist';
  else if (visits.length <= 1) status = 'new';
  else if (lastVisit && diffDays(today, lastVisit) > 45) status = 'away';
  else status = 'regular';

  return {
    visits: visits.length,
    totalAppointments: all.filter((a) => a.status !== 'cancelled').length,
    cancellations: all.filter((a) => a.status === 'cancelled').length,
    lastVisit,
    topServiceId: mostFrequent(visits.map((a) => a.serviceId)) ?? upcoming[0]?.serviceId ?? null,
    topBarberId: mostFrequent(visits.map((a) => a.barberId)),
    nextAppointment: upcoming[0] ?? null,
    spentCents: visits.reduce((sum, a) => sum + a.priceCents, 0),
    status,
    history: all,
  };
}
