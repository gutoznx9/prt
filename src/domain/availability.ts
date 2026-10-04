import type { Appointment, Barber, DateKey, Database, ID, Minutes, TimeBlock } from './types';
import { BLOCKING_STATUSES } from './types';
import { addDays, overlaps, toDateKey, weekdayOf } from './time';

/** Granularidade da grade de horários oferecidos ao cliente. */
export const SLOT_STEP = 30;

export interface Clock {
  date: DateKey;
  minutes: Minutes;
}

/** Hora "atual" do protótipo — pode ser fixada nas configurações de demonstração. */
export function getNow(db: Database, real: Date = new Date()): Clock {
  const date = toDateKey(real);
  if (db.demo.clock === 'fixed') return { date, minutes: db.demo.fixedMin };
  return { date, minutes: real.getHours() * 60 + real.getMinutes() };
}

export interface Interval {
  start: Minutes;
  end: Minutes;
  kind: 'appointment' | 'block' | 'break';
  appointment?: Appointment;
  block?: TimeBlock;
}

export interface WorkingWindow {
  open: Minutes;
  close: Minutes;
  breaks: Interval[];
}

export function getWorkingWindow(db: Database, barberId: ID, date: DateKey): WorkingWindow | null {
  const barber = db.barbers.find((b) => b.id === barberId);
  if (!barber || !barber.active) return null;
  const weekday = weekdayOf(date);
  const hours = db.barbershop.hours[weekday];
  if (!hours || hours.closed || !barber.workdays.includes(weekday)) return null;
  const breaks: Interval[] = [];
  if (barber.breakStart != null && barber.breakEnd != null && barber.breakEnd > barber.breakStart) {
    const start = Math.max(barber.breakStart, hours.open);
    const end = Math.min(barber.breakEnd, hours.close);
    if (end > start) breaks.push({ start, end, kind: 'break' });
  }
  return { open: hours.open, close: hours.close, breaks };
}

export function isBlocking(a: Appointment): boolean {
  return BLOCKING_STATUSES.includes(a.status);
}

/** Tudo que ocupa a agenda de um barbeiro em um dia, ordenado. */
export function getBusyIntervals(
  db: Database,
  barberId: ID,
  date: DateKey,
  opts: { ignoreAppointmentId?: ID } = {},
): Interval[] {
  const intervals: Interval[] = [];
  for (const a of db.appointments) {
    if (a.barberId !== barberId || a.date !== date || !isBlocking(a) || a.id === opts.ignoreAppointmentId) continue;
    intervals.push({ start: a.startMin, end: a.startMin + a.durationMin, kind: 'appointment', appointment: a });
  }
  for (const b of db.timeBlocks) {
    if (b.barberId !== barberId || b.date !== date) continue;
    intervals.push({ start: b.startMin, end: b.endMin, kind: 'block', block: b });
  }
  const window = getWorkingWindow(db, barberId, date);
  if (window) intervals.push(...window.breaks);
  return intervals.sort((a, b) => a.start - b.start || a.end - b.end);
}

export type BookingProblem = 'closed' | 'outside_hours' | 'conflict' | 'past' | 'invalid';

export interface BookingCheck {
  ok: boolean;
  problem?: BookingProblem;
  conflict?: Interval;
}

export interface BookingRequest {
  barberId: ID;
  date: DateKey;
  startMin: Minutes;
  durationMin: number;
}

/**
 * Regra única de conflito usada pelo cliente, pelo barbeiro e pela recuperação de horários.
 * `respectLeadTime` aplica a antecedência mínima da reserva online.
 */
export function checkBooking(
  db: Database,
  req: BookingRequest,
  opts: { now?: Clock; respectLeadTime?: boolean; ignoreAppointmentId?: ID } = {},
): BookingCheck {
  if (req.durationMin <= 0 || req.startMin < 0 || req.startMin + req.durationMin > 24 * 60) {
    return { ok: false, problem: 'invalid' };
  }
  const window = getWorkingWindow(db, req.barberId, req.date);
  if (!window) return { ok: false, problem: 'closed' };
  const end = req.startMin + req.durationMin;
  if (req.startMin < window.open || end > window.close) return { ok: false, problem: 'outside_hours' };

  const now = opts.now ?? getNow(db);
  if (req.date < now.date) return { ok: false, problem: 'past' };
  if (req.date === now.date) {
    const lead = opts.respectLeadTime ? db.barbershop.minLeadMinutes : 0;
    if (req.startMin < now.minutes + lead) return { ok: false, problem: 'past' };
  }

  const conflict = getBusyIntervals(db, req.barberId, req.date, { ignoreAppointmentId: opts.ignoreAppointmentId }).find((i) =>
    overlaps(req.startMin, end, i.start, i.end),
  );
  if (conflict) return { ok: false, problem: 'conflict', conflict };
  return { ok: true };
}

export type SlotStatus = 'available' | 'busy';

export interface Slot {
  startMin: Minutes;
  status: SlotStatus;
  /** Barbeiros que podem atender neste horário */
  barberIds: ID[];
}

function candidateStarts(window: WorkingWindow, busy: Interval[], durationMin: number): Minutes[] {
  const set = new Set<Minutes>();
  for (let t = window.open; t + durationMin <= window.close; t += SLOT_STEP) set.add(t);
  // Encaixa logo após o fim de cada atendimento para não criar "buracos" na agenda.
  for (const i of busy) {
    if (i.end >= window.open && i.end + durationMin <= window.close) set.add(i.end);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Horários para um serviço com um barbeiro (ou qualquer um, quando `barberId` é null).
 * Horários ocupados na grade padrão também são retornados (status `busy`)
 * para permitir a entrada na lista de espera.
 */
export function getSlots(
  db: Database,
  params: { barberId: ID | null; date: DateKey; durationMin: number },
  now: Clock = getNow(db),
): Slot[] {
  const barbers: Barber[] = params.barberId
    ? db.barbers.filter((b) => b.id === params.barberId)
    : db.barbers.filter((b) => b.active);
  const byStart = new Map<Minutes, Slot>();

  for (const barber of barbers) {
    const window = getWorkingWindow(db, barber.id, params.date);
    if (!window) continue;
    const busy = getBusyIntervals(db, barber.id, params.date);
    for (const start of candidateStarts(window, busy, params.durationMin)) {
      const check = checkBooking(
        db,
        { barberId: barber.id, date: params.date, startMin: start, durationMin: params.durationMin },
        { now, respectLeadTime: true },
      );
      if (check.problem === 'past' || check.problem === 'outside_hours' || check.problem === 'closed') continue;
      const onGrid = (start - window.open) % SLOT_STEP === 0;
      if (!check.ok && !onGrid) continue;
      // Intervalo de almoço não é "ocupado" para fins de lista de espera.
      if (!check.ok && check.conflict?.kind === 'break') continue;

      const slot = byStart.get(start) ?? { startMin: start, status: 'busy', barberIds: [] };
      if (check.ok) {
        slot.status = 'available';
        slot.barberIds.push(barber.id);
      }
      byStart.set(start, slot);
    }
  }
  return [...byStart.values()].sort((a, b) => a.startMin - b.startMin);
}

/** Minutos livres contínuos a partir de `startMin` (até o próximo compromisso ou o fechamento). */
export function freeWindowAt(db: Database, barberId: ID, date: DateKey, startMin: Minutes): number {
  const window = getWorkingWindow(db, barberId, date);
  if (!window || startMin < window.open || startMin >= window.close) return 0;
  const busy = getBusyIntervals(db, barberId, date);
  if (busy.some((i) => i.start <= startMin && i.end > startMin)) return 0;
  const next = busy.find((i) => i.start >= startMin);
  return Math.min(next ? next.start : window.close, window.close) - startMin;
}

export type TimelineRow =
  | { type: 'appointment'; start: Minutes; end: Minutes; appointment: Appointment }
  | { type: 'cancelled'; start: Minutes; end: Minutes; appointment: Appointment }
  | { type: 'free'; start: Minutes; end: Minutes }
  | { type: 'break'; start: Minutes; end: Minutes }
  | { type: 'block'; start: Minutes; end: Minutes; block: TimeBlock };

/** Agenda do dia em formato de linha do tempo: atendimentos + lacunas livres em blocos de 30 min. */
export function buildTimeline(db: Database, barberId: ID, date: DateKey): TimelineRow[] {
  const window = getWorkingWindow(db, barberId, date);
  const busy = getBusyIntervals(db, barberId, date);
  if (!window && busy.length === 0) return [];

  const open = Math.min(window?.open ?? Infinity, busy[0]?.start ?? Infinity);
  const close = Math.max(window?.close ?? 0, ...busy.map((i) => i.end));
  const rows: TimelineRow[] = [];

  let t = open;
  while (t < close) {
    const current = busy.find((i) => i.start <= t && i.end > t);
    if (current) {
      if (current.kind === 'appointment') {
        rows.push({ type: 'appointment', start: current.start, end: current.end, appointment: current.appointment! });
      } else if (current.kind === 'block') {
        rows.push({ type: 'block', start: current.start, end: current.end, block: current.block! });
      } else {
        rows.push({ type: 'break', start: current.start, end: current.end });
      }
      t = current.end;
      continue;
    }
    const nextBusy = busy.find((i) => i.start > t)?.start ?? Infinity;
    const nextGrid = Math.floor((t - open) / SLOT_STEP) * SLOT_STEP + open + SLOT_STEP;
    const next = Math.min(nextBusy, nextGrid, close);
    // Fora do horário de trabalho não mostramos lacunas livres.
    if (!window || t >= window.close || t < window.open) {
      t = Math.min(nextBusy, close);
      continue;
    }
    rows.push({ type: 'free', start: t, end: next });
    t = next;
  }

  const cancelled = db.appointments
    .filter((a) => a.barberId === barberId && a.date === date && a.status === 'cancelled')
    .sort((a, b) => a.startMin - b.startMin);
  for (const a of cancelled) {
    const row: TimelineRow = { type: 'cancelled', start: a.startMin, end: a.startMin + a.durationMin, appointment: a };
    const idx = rows.findIndex((r) => r.start >= a.startMin);
    if (idx === -1) rows.push(row);
    else rows.splice(idx, 0, row);
  }
  return rows;
}

/** Minutos de trabalho disponíveis (horário − intervalos − bloqueios). Base da taxa de ocupação. */
export function workableMinutes(db: Database, barberId: ID, date: DateKey): number {
  const window = getWorkingWindow(db, barberId, date);
  if (!window) return 0;
  let total = window.close - window.open;
  for (const b of window.breaks) total -= b.end - b.start;
  for (const block of db.timeBlocks) {
    if (block.barberId === barberId && block.date === date) {
      total -= Math.max(0, Math.min(block.endMin, window.close) - Math.max(block.startMin, window.open));
    }
  }
  return Math.max(0, total);
}

/** Primeiro horário livre a partir de hoje (até `horizonDays`). */
export function findNextAvailable(
  db: Database,
  params: { barberId: ID | null; durationMin: number; horizonDays?: number },
  now: Clock = getNow(db),
): { date: DateKey; startMin: Minutes; barberIds: ID[] } | null {
  for (let i = 0; i < (params.horizonDays ?? 7); i++) {
    const date = addDays(now.date, i);
    const slot = getSlots(db, { barberId: params.barberId, date, durationMin: params.durationMin }, now).find(
      (s) => s.status === 'available',
    );
    if (slot) return { date, startMin: slot.startMin, barberIds: slot.barberIds };
  }
  return null;
}
