import type { Appointment, DateKey, Database, ID } from './types';
import { addDays } from './time';
import { workableMinutes } from './availability';

export interface Recovery {
  appointment: Appointment;
  original: Appointment | null;
}

export interface Metrics {
  from: DateKey;
  to: DateKey;
  bookings: number;
  cancellations: number;
  noShows: number;
  recovered: number;
  recoveredCents: number;
  /** Cancelamentos que não foram reocupados — dinheiro que ficou na mesa */
  lostCents: number;
  revenueCents: number;
  /** 0–1 */
  occupancy: number;
  onlineShare: number;
  recoveries: Recovery[];
}

/**
 * Métricas do período [hoje − (days − 1), hoje], calculadas a partir dos agendamentos.
 * `barberId` null = barbearia inteira.
 */
export function computeMetrics(db: Database, params: { today: DateKey; days: number; barberId: ID | null }): Metrics {
  const from = addDays(params.today, -(params.days - 1));
  const to = params.today;
  const inScope = (a: Appointment) =>
    a.date >= from && a.date <= to && (!params.barberId || a.barberId === params.barberId);
  const scoped = db.appointments.filter(inScope);

  const active = scoped.filter((a) => a.status !== 'cancelled');
  const attended = active.filter((a) => a.status !== 'no_show');
  const cancelled = scoped.filter((a) => a.status === 'cancelled');
  const recoveredAppointments = attended.filter((a) => a.source === 'recovered');
  const recoveredFrom = new Set(recoveredAppointments.map((a) => a.recoveredFromId));

  const byId = new Map(db.appointments.map((a) => [a.id, a]));
  const recoveries = recoveredAppointments
    .map((a) => ({ appointment: a, original: a.recoveredFromId ? byId.get(a.recoveredFromId) ?? null : null }))
    .sort((a, b) => b.appointment.date.localeCompare(a.appointment.date) || b.appointment.startMin - a.appointment.startMin);

  let capacity = 0;
  const barberIds = params.barberId ? [params.barberId] : db.barbers.filter((b) => b.active).map((b) => b.id);
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const id of barberIds) capacity += workableMinutes(db, id, d);
  }
  const bookedMinutes = attended.reduce((sum, a) => sum + a.durationMin, 0);

  return {
    from,
    to,
    bookings: active.length,
    cancellations: cancelled.length,
    noShows: active.length - attended.length,
    recovered: recoveredAppointments.length,
    recoveredCents: recoveredAppointments.reduce((s, a) => s + a.priceCents, 0),
    lostCents: cancelled.filter((a) => !recoveredFrom.has(a.id)).reduce((s, a) => s + a.priceCents, 0),
    revenueCents: attended.reduce((s, a) => s + a.priceCents, 0),
    occupancy: capacity ? Math.min(1, bookedMinutes / capacity) : 0,
    onlineShare: active.length ? active.filter((a) => a.source !== 'barber').length / active.length : 0,
    recoveries,
  };
}
