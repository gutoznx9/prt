import type {
  Appointment,
  AppointmentSource,
  Barber,
  Barbershop,
  CancelledBy,
  Customer,
  Database,
  DateKey,
  ID,
  Minutes,
  ReminderSettings,
  Service,
  SlotOffer,
  WaitlistEntry,
} from '../domain/types';
import { checkBooking, freeWindowAt, getNow, getSlots, type BookingProblem } from '../domain/availability';
import { firstName, onlyDigits, uid } from '../domain/format';
import { addDays, formatDayMonth, formatTime } from '../domain/time';
import { renderTemplate } from '../domain/reminders';
import { notifyBarber, receiveWhatsApp, sendWhatsApp } from '../services/messaging';
import { resetDatabase, transact } from './store';

/**
 * Casos de uso (camada de aplicação). Cada função é uma transação atômica sobre o banco local.
 * Em produção viram RPCs/Edge Functions com a mesma validação (ex.: `checkBooking` também como
 * constraint de exclusão no Postgres: EXCLUDE USING gist (barber_id WITH =, tsrange WITH &&)).
 */

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; problem?: BookingProblem };

const PROBLEM_MESSAGES: Record<BookingProblem, string> = {
  conflict: 'Esse horário acabou de ser ocupado. Escolha outro.',
  past: 'Esse horário já passou.',
  closed: 'A barbearia não atende neste dia.',
  outside_hours: 'Fora do horário de funcionamento.',
  invalid: 'Horário inválido.',
};

const nowIso = () => new Date().toISOString();

function dayLabel(db: Database, date: DateKey): string {
  const today = getNow(db).date;
  if (date === today) return 'hoje';
  if (date === addDays(today, 1)) return 'amanhã';
  return `dia ${formatDayMonth(date)}`;
}

function describe(db: Database, a: Appointment) {
  const service = db.services.find((s) => s.id === a.serviceId);
  const barber = db.barbers.find((b) => b.id === a.barberId);
  const customer = db.customers.find((c) => c.id === a.customerId);
  return {
    service: service?.name ?? 'Serviço',
    barber: barber?.name ?? '',
    customer: customer?.name ?? 'Cliente',
    when: `${dayLabel(db, a.date)} às ${formatTime(a.startMin)}`,
  };
}

function findOrCreateCustomer(db: Database, name: string, phone: string): Customer {
  const digits = onlyDigits(phone);
  const existing = db.customers.find((c) => c.phone === digits);
  if (existing) return existing;
  const customer: Customer = {
    id: uid('cus'),
    barbershopId: db.barbershop.id,
    name: name.trim(),
    phone: digits,
    createdAt: nowIso(),
    notes: '',
  };
  db.customers.push(customer);
  return customer;
}

function getAppointment(db: Database, id: ID): Appointment {
  const a = db.appointments.find((x) => x.id === id);
  if (!a) throw new Error(`Agendamento ${id} não encontrado`);
  return a;
}

/** Escolhe o barbeiro menos ocupado entre os disponíveis ("sem preferência"). */
function pickBarber(db: Database, date: DateKey, startMin: Minutes, durationMin: number): ID | null {
  const slot = getSlots(db, { barberId: null, date, durationMin }).find((s) => s.startMin === startMin && s.status === 'available');
  if (!slot) return null;
  const load = (id: ID) => db.appointments.filter((a) => a.barberId === id && a.date === date && a.status !== 'cancelled').length;
  return [...slot.barberIds].sort((a, b) => load(a) - load(b))[0] ?? null;
}

export interface BookingInput {
  serviceId: ID;
  barberId: ID | null;
  date: DateKey;
  startMin: Minutes;
  customerName: string;
  phone: string;
  source: AppointmentSource;
}

export function bookAppointment(input: BookingInput): Result<Appointment> {
  return transact((db) => {
    const service = db.services.find((s) => s.id === input.serviceId && s.active);
    if (!service) return { ok: false, error: 'Serviço indisponível.' };
    const barberId = input.barberId ?? pickBarber(db, input.date, input.startMin, service.durationMin);
    if (!barberId) return { ok: false, error: PROBLEM_MESSAGES.conflict, problem: 'conflict' as const };

    const check = checkBooking(
      db,
      { barberId, date: input.date, startMin: input.startMin, durationMin: service.durationMin },
      { respectLeadTime: input.source === 'online' },
    );
    if (!check.ok) return { ok: false, error: PROBLEM_MESSAGES[check.problem!], problem: check.problem };

    const customer = findOrCreateCustomer(db, input.customerName, input.phone);
    const online = input.source === 'online';
    const appointment: Appointment = {
      id: uid('apt'),
      barbershopId: db.barbershop.id,
      barberId,
      serviceId: service.id,
      customerId: customer.id,
      date: input.date,
      startMin: input.startMin,
      durationMin: service.durationMin,
      priceCents: service.priceCents,
      status: online ? 'pending' : 'confirmed',
      source: input.source,
      createdAt: nowIso(),
      confirmedAt: online ? null : nowIso(),
      cancelledAt: null,
      cancelledBy: null,
      recoveredFromId: null,
    };
    db.appointments.push(appointment);

    // Quem estava na lista de espera para esse dia foi atendido.
    for (const w of db.waitlist) {
      if (w.customerId === customer.id && w.date === input.date && (w.status === 'active' || w.status === 'offered')) {
        w.status = 'fulfilled';
      }
    }

    const d = describe(db, appointment);
    if (online) {
      notifyBarber(db, {
        kind: 'new_booking',
        title: 'Nova reserva',
        body: `${d.customer} marcou ${d.service} ${d.when}`,
        barberId,
        customerId: customer.id,
        appointmentId: appointment.id,
      });
    }
    if (db.reminders.sendBookingReceipt) {
      sendWhatsApp(db, {
        kind: 'booking_received',
        customerId: customer.id,
        barberId,
        appointmentId: appointment.id,
        body: `Olá, ${firstName(customer.name)}! Recebemos sua reserva: ${d.service} com ${d.barber}, ${d.when}. ${
          online ? 'Você receberá a confirmação por aqui.' : 'Até lá!'
        }`,
      });
    }
    return { ok: true, value: appointment };
  });
}

export function confirmAppointment(id: ID) {
  transact((db) => {
    const a = getAppointment(db, id);
    if (a.status !== 'pending') return;
    a.status = 'confirmed';
    a.confirmedAt = nowIso();
    for (const n of db.notifications) if (n.appointmentId === id && n.channel === 'app' && !n.readAt) n.readAt = nowIso();
    const d = describe(db, a);
    sendWhatsApp(db, {
      kind: 'booking_confirmed',
      customerId: a.customerId,
      barberId: a.barberId,
      appointmentId: a.id,
      body: `Horário confirmado ✔ ${d.service} com ${d.barber}, ${d.when}. Endereço: ${db.barbershop.address}.`,
    });
  });
}

export function completeAppointment(id: ID) {
  transact((db) => {
    const a = getAppointment(db, id);
    if (a.status === 'pending' || a.status === 'confirmed') a.status = 'completed';
  });
}

export function markNoShow(id: ID) {
  transact((db) => {
    const a = getAppointment(db, id);
    if (a.status === 'pending' || a.status === 'confirmed') a.status = 'no_show';
  });
}

export function cancelAppointment(id: ID, by: CancelledBy) {
  transact((db) => {
    const a = getAppointment(db, id);
    if (a.status === 'cancelled' || a.status === 'completed') return;
    a.status = 'cancelled';
    a.cancelledAt = nowIso();
    a.cancelledBy = by;
    for (const n of db.notifications) if (n.appointmentId === id && n.channel === 'app' && !n.readAt) n.readAt = nowIso();
    const d = describe(db, a);
    notifyBarber(db, {
      kind: 'booking_cancelled',
      title: 'Horário liberado',
      body: `${d.customer} ${by === 'customer' ? 'desmarcou' : 'teve o horário cancelado'}: ${d.service} ${d.when}`,
      barberId: a.barberId,
      customerId: a.customerId,
      appointmentId: a.id,
    });
    sendWhatsApp(db, {
      kind: 'booking_cancelled_customer',
      customerId: a.customerId,
      barberId: a.barberId,
      appointmentId: a.id,
      body:
        by === 'customer'
          ? `Tudo certo, ${firstName(d.customer)}. Cancelamos seu horário de ${d.when}. Quando quiser remarcar, é só chamar.`
          : `${firstName(d.customer)}, precisamos cancelar seu horário de ${d.when}. Desculpe o transtorno — responda aqui para remarcarmos.`,
    });
  });
}

export function blockTime(barberId: ID, date: DateKey, startMin: Minutes, endMin: Minutes, reason: string) {
  transact((db) => {
    db.timeBlocks.push({ id: uid('blk'), barbershopId: db.barbershop.id, barberId, date, startMin, endMin, reason });
  });
}

export function removeBlock(id: ID) {
  transact((db) => {
    db.timeBlocks = db.timeBlocks.filter((b) => b.id !== id);
  });
}

export interface WaitlistInput {
  customerName: string;
  phone: string;
  serviceId: ID;
  barberId: ID | null;
  date: DateKey;
  fromMin: Minutes;
  toMin: Minutes;
}

export function joinWaitlist(input: WaitlistInput): Result<WaitlistEntry> {
  return transact((db) => {
    const customer = findOrCreateCustomer(db, input.customerName, input.phone);
    const duplicate = db.waitlist.find(
      (w) => w.customerId === customer.id && w.date === input.date && (w.status === 'active' || w.status === 'offered'),
    );
    if (duplicate) {
      Object.assign(duplicate, { serviceId: input.serviceId, barberId: input.barberId, fromMin: input.fromMin, toMin: input.toMin, status: 'active' });
      return { ok: true, value: duplicate };
    }
    const entry: WaitlistEntry = {
      id: uid('wl'),
      barbershopId: db.barbershop.id,
      customerId: customer.id,
      serviceId: input.serviceId,
      barberId: input.barberId,
      date: input.date,
      fromMin: input.fromMin,
      toMin: input.toMin,
      status: 'active',
      createdAt: nowIso(),
    };
    db.waitlist.push(entry);
    const service = db.services.find((s) => s.id === input.serviceId);
    const window = `entre ${formatTime(input.fromMin)} e ${formatTime(input.toMin)}`;
    notifyBarber(db, {
      kind: 'waitlist_joined',
      title: 'Lista de espera',
      body: `${customer.name} quer ${service?.name ?? 'um horário'} ${dayLabel(db, input.date)}, ${window}`,
      barberId: input.barberId,
      customerId: customer.id,
    });
    sendWhatsApp(db, {
      kind: 'chat',
      customerId: customer.id,
      body: `Combinado, ${firstName(customer.name)}! Você está na lista de espera para ${dayLabel(db, input.date)}, ${window}. Se um horário abrir, avisamos por aqui na hora.`,
    });
    return { ok: true, value: entry };
  });
}

export function leaveWaitlist(id: ID) {
  transact((db) => {
    const w = db.waitlist.find((x) => x.id === id);
    if (w) w.status = 'expired';
  });
}

export interface OfferInput {
  barberId: ID;
  date: DateKey;
  startMin: Minutes;
  sourceAppointmentId: ID | null;
  recipients: Array<{ customerId: ID; waitlistEntryId: ID | null; serviceId: ID }>;
}

export function sendSlotOffer(input: OfferInput): Result<SlotOffer> {
  return transact((db) => {
    const windowMin = freeWindowAt(db, input.barberId, input.date, input.startMin);
    if (windowMin <= 0) return { ok: false, error: 'Esse horário não está mais livre.' };
    const offer: SlotOffer = {
      id: uid('off'),
      barbershopId: db.barbershop.id,
      barberId: input.barberId,
      date: input.date,
      startMin: input.startMin,
      windowMin,
      sourceAppointmentId: input.sourceAppointmentId,
      recipients: input.recipients.map((r) => ({ ...r, status: 'sent' as const })),
      status: 'open',
      filledAppointmentId: null,
      createdAt: nowIso(),
    };
    db.offers.push(offer);
    const barber = db.barbers.find((b) => b.id === input.barberId);
    for (const r of input.recipients) {
      const customer = db.customers.find((c) => c.id === r.customerId);
      const service = db.services.find((s) => s.id === r.serviceId);
      if (!customer || !service) continue;
      if (r.waitlistEntryId) {
        const w = db.waitlist.find((x) => x.id === r.waitlistEntryId);
        if (w && w.status === 'active') w.status = 'offered';
      }
      sendWhatsApp(db, {
        kind: 'slot_offer',
        customerId: customer.id,
        barberId: input.barberId,
        offerId: offer.id,
        title: 'Horário disponível',
        body: `${firstName(customer.name)}, abriu um horário ${dayLabel(db, input.date)} às ${formatTime(input.startMin)} com ${barber?.name}. ${service.name} — quer ficar com ele? Quem responder primeiro garante.`,
      });
    }
    return { ok: true, value: offer };
  });
}

/** Resposta do cliente à oferta (simulada pelo WhatsApp de demonstração). */
export function respondToOffer(offerId: ID, customerId: ID, accept: boolean): Result<Appointment | null> {
  return transact((db) => {
    const offer = db.offers.find((o) => o.id === offerId);
    const recipient = offer?.recipients.find((r) => r.customerId === customerId);
    if (!offer || !recipient) return { ok: false, error: 'Oferta não encontrada.' };
    if (recipient.status !== 'sent') return { ok: false, error: 'Você já respondeu essa oferta.' };
    const customer = db.customers.find((c) => c.id === customerId)!;

    receiveWhatsApp(db, {
      customerId,
      offerId,
      barberId: offer.barberId,
      body: accept ? 'Quero esse horário!' : 'Dessa vez não, obrigado.',
    });
    if (!accept) {
      recipient.status = 'declined';
      return { ok: true, value: null };
    }

    const service = db.services.find((s) => s.id === recipient.serviceId)!;
    const check = checkBooking(db, { barberId: offer.barberId, date: offer.date, startMin: offer.startMin, durationMin: service.durationMin });
    if (offer.status !== 'open' || !check.ok) {
      recipient.status = 'too_late';
      sendWhatsApp(db, {
        kind: 'offer_result',
        customerId,
        offerId,
        body: `Poxa, ${firstName(customer.name)}, esse horário acabou de ser preenchido. Você continua na lista e avisamos no próximo.`,
      });
      return { ok: false, error: 'Horário já preenchido.' };
    }

    const original = offer.sourceAppointmentId ? db.appointments.find((a) => a.id === offer.sourceAppointmentId) : null;
    const appointment: Appointment = {
      id: uid('apt'),
      barbershopId: db.barbershop.id,
      barberId: offer.barberId,
      serviceId: service.id,
      customerId,
      date: offer.date,
      startMin: offer.startMin,
      durationMin: service.durationMin,
      priceCents: service.priceCents,
      status: 'confirmed',
      source: 'recovered',
      createdAt: nowIso(),
      confirmedAt: nowIso(),
      cancelledAt: null,
      cancelledBy: null,
      recoveredFromId: original?.id ?? null,
    };
    db.appointments.push(appointment);
    recipient.status = 'accepted';
    offer.status = 'filled';
    offer.filledAppointmentId = appointment.id;
    for (const w of db.waitlist) {
      if (w.customerId === customerId && w.date === offer.date && (w.status === 'active' || w.status === 'offered')) w.status = 'fulfilled';
    }
    const d = describe(db, appointment);
    sendWhatsApp(db, {
      kind: 'offer_result',
      customerId,
      offerId,
      appointmentId: appointment.id,
      body: `Fechado! ${d.service} com ${d.barber}, ${d.when}. Te esperamos na ${db.barbershop.address}.`,
    });
    notifyBarber(db, {
      kind: 'slot_recovered',
      title: 'Horário recuperado',
      body: `${customer.name} ficou com ${d.when} — ${d.service}`,
      barberId: offer.barberId,
      customerId,
      appointmentId: appointment.id,
      offerId,
    });
    return { ok: true, value: appointment };
  });
}

export function closeOffer(offerId: ID) {
  transact((db) => {
    const offer = db.offers.find((o) => o.id === offerId);
    if (offer && offer.status === 'open') offer.status = 'closed';
  });
}

export function sendReminder(appointmentId: ID, kind: 'reminder_24h' | 'reminder_2h') {
  transact((db) => {
    const a = getAppointment(db, appointmentId);
    const template = kind === 'reminder_24h' ? db.reminders.template24h : db.reminders.template2h;
    sendWhatsApp(db, {
      kind,
      customerId: a.customerId,
      barberId: a.barberId,
      appointmentId,
      title: kind === 'reminder_24h' ? 'Lembrete 24h' : 'Lembrete 2h',
      body: renderTemplate(db, template, a, getNow(db).date),
    });
  });
}

/** Cliente responde ao lembrete pelo WhatsApp simulado. */
export function customerReplyToReminder(appointmentId: ID, attending: boolean) {
  const a = transact((db) => {
    const a = getAppointment(db, appointmentId);
    receiveWhatsApp(db, {
      customerId: a.customerId,
      appointmentId,
      barberId: a.barberId,
      body: attending ? 'Confirmo, estarei aí!' : 'Não vou conseguir ir.',
    });
    return a;
  });
  if (attending) {
    if (a.status === 'pending') confirmAppointment(appointmentId);
  } else {
    cancelAppointment(appointmentId, 'customer');
  }
}

export function customerSendsMessage(customerId: ID, text: string) {
  transact((db) => {
    receiveWhatsApp(db, { customerId, body: text });
    const customer = db.customers.find((c) => c.id === customerId);
    sendWhatsApp(db, {
      kind: 'chat',
      customerId,
      body: `Oi, ${firstName(customer?.name ?? '')}! Recebemos sua mensagem — já te respondemos. (Resposta automática da ${db.barbershop.name})`,
    });
  });
}

export function markNotificationsRead(ids: ID[]) {
  if (!ids.length) return;
  transact((db) => {
    const set = new Set(ids);
    for (const n of db.notifications) if (set.has(n.id) && !n.readAt) n.readAt = nowIso();
  });
}

export function updateBarbershop(patch: Partial<Barbershop>) {
  transact((db) => {
    db.barbershop = { ...db.barbershop, ...patch };
  });
}

export function upsertService(service: Service) {
  transact((db) => {
    const idx = db.services.findIndex((s) => s.id === service.id);
    if (idx >= 0) db.services[idx] = service;
    else db.services.push(service);
  });
}

export function upsertBarber(barber: Barber) {
  transact((db) => {
    const idx = db.barbers.findIndex((b) => b.id === barber.id);
    if (idx >= 0) db.barbers[idx] = barber;
    else db.barbers.push(barber);
  });
}

export function updateCustomerNotes(customerId: ID, notes: string) {
  transact((db) => {
    const c = db.customers.find((x) => x.id === customerId);
    if (c) c.notes = notes;
  });
}

export function updateReminders(patch: Partial<ReminderSettings>) {
  transact((db) => {
    db.reminders = { ...db.reminders, ...patch };
  });
}

export function setDemoClock(clock: 'real' | 'fixed', fixedMin?: Minutes) {
  transact((db) => {
    db.demo.clock = clock;
    if (fixedMin != null) db.demo.fixedMin = fixedMin;
  });
}

export function setCurrentUser(userId: ID) {
  transact((db) => {
    db.demo.currentUserId = userId;
  });
}

export function resetDemo() {
  resetDatabase();
}
