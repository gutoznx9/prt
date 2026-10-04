/**
 * Entidades do domínio.
 *
 * Cada interface corresponde a uma futura tabela no Supabase/PostgreSQL.
 * Convenções pensadas para a migração:
 *  - `id` é string (uuid no banco);
 *  - datas de calendário em `YYYY-MM-DD` (coluna `date`);
 *  - horários em minutos desde 00:00 (coluna `smallint`), sempre no fuso da barbearia;
 *  - instantes (`createdAt`, `cancelledAt`...) em ISO 8601 (coluna `timestamptz`);
 *  - valores monetários em centavos (coluna `integer`).
 */

export type ID = string;
/** `YYYY-MM-DD` */
export type DateKey = string;
/** Minutos desde 00:00 (ex.: 14:30 → 870) */
export type Minutes = number;
/** ISO 8601 */
export type Timestamp = string;

/** 0 = domingo … 6 = sábado (igual a `Date#getDay`) */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DayHours {
  open: Minutes;
  close: Minutes;
  closed: boolean;
}

export interface Barbershop {
  id: ID;
  slug: string;
  name: string;
  tagline: string;
  address: string;
  neighborhood: string;
  city: string;
  phone: string;
  /** Indexado por `Weekday` */
  hours: Record<Weekday, DayHours>;
  /** Antecedência mínima para reservas online */
  minLeadMinutes: number;
  timezone: string;
}

export type UserRole = 'owner' | 'barber';

/** Conta de acesso ao painel (futuro Supabase Auth). */
export interface User {
  id: ID;
  barbershopId: ID;
  name: string;
  email: string;
  role: UserRole;
  barberId: ID | null;
}

export interface Barber {
  id: ID;
  barbershopId: ID;
  name: string;
  /** Texto curto exibido na página pública */
  specialty: string;
  initials: string;
  active: boolean;
  /** Dias em que atende */
  workdays: Weekday[];
  /** Intervalo de almoço (opcional) */
  breakStart: Minutes | null;
  breakEnd: Minutes | null;
}

export interface Service {
  id: ID;
  barbershopId: ID;
  name: string;
  description: string;
  priceCents: number;
  durationMin: number;
  active: boolean;
}

export interface Customer {
  id: ID;
  barbershopId: ID;
  name: string;
  /** Somente dígitos, com DDD (ex.: 11987654321) */
  phone: string;
  createdAt: Timestamp;
  notes: string;
}

export type AppointmentStatus =
  | 'pending' // aguardando confirmação do barbeiro
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type AppointmentSource =
  | 'online' // página pública
  | 'barber' // encaixe feito pelo barbeiro
  | 'recovered'; // horário recuperado via oferta para lista de espera

export type CancelledBy = 'customer' | 'barber';

export interface Appointment {
  id: ID;
  barbershopId: ID;
  barberId: ID;
  serviceId: ID;
  customerId: ID;
  date: DateKey;
  startMin: Minutes;
  durationMin: number;
  /** Preço congelado no momento da reserva */
  priceCents: number;
  status: AppointmentStatus;
  source: AppointmentSource;
  createdAt: Timestamp;
  confirmedAt: Timestamp | null;
  cancelledAt: Timestamp | null;
  cancelledBy: CancelledBy | null;
  /** Quando este agendamento ocupou um horário liberado por cancelamento */
  recoveredFromId: ID | null;
}

/** Bloqueio manual da agenda (folga, compromisso, almoço estendido…). */
export interface TimeBlock {
  id: ID;
  barbershopId: ID;
  barberId: ID;
  date: DateKey;
  startMin: Minutes;
  endMin: Minutes;
  reason: string;
}

export type WaitlistStatus = 'active' | 'offered' | 'fulfilled' | 'expired';

export interface WaitlistEntry {
  id: ID;
  barbershopId: ID;
  customerId: ID;
  serviceId: ID;
  /** null = qualquer barbeiro */
  barberId: ID | null;
  date: DateKey;
  /** Janela de início aceitável */
  fromMin: Minutes;
  toMin: Minutes;
  status: WaitlistStatus;
  createdAt: Timestamp;
}

export type OfferRecipientStatus = 'sent' | 'accepted' | 'declined' | 'too_late';

export interface SlotOfferRecipient {
  customerId: ID;
  waitlistEntryId: ID | null;
  serviceId: ID;
  status: OfferRecipientStatus;
}

/** Oferta de um horário liberado para clientes interessados. */
export interface SlotOffer {
  id: ID;
  barbershopId: ID;
  barberId: ID;
  date: DateKey;
  startMin: Minutes;
  /** Minutos livres a partir de `startMin` no momento do envio */
  windowMin: number;
  sourceAppointmentId: ID | null;
  recipients: SlotOfferRecipient[];
  status: 'open' | 'filled' | 'closed';
  filledAppointmentId: ID | null;
  createdAt: Timestamp;
}

export type NotificationChannel =
  | 'app' // aviso dentro do painel do barbeiro (futuro: push)
  | 'whatsapp'; // mensagem ao cliente (futuro: WhatsApp Business API)

export type NotificationKind =
  | 'new_booking'
  | 'booking_cancelled'
  | 'waitlist_joined'
  | 'slot_recovered'
  | 'booking_received' // whatsapp → cliente
  | 'booking_confirmed'
  | 'booking_cancelled_customer'
  | 'reminder_24h'
  | 'reminder_2h'
  | 'slot_offer'
  | 'offer_result'
  | 'chat';

export interface Notification {
  id: ID;
  barbershopId: ID;
  channel: NotificationChannel;
  kind: NotificationKind;
  /** `out` = barbearia → cliente; `in` = cliente → barbearia (só WhatsApp) */
  direction: 'out' | 'in';
  barberId: ID | null;
  customerId: ID | null;
  appointmentId: ID | null;
  offerId: ID | null;
  title: string;
  body: string;
  createdAt: Timestamp;
  readAt: Timestamp | null;
}

export interface ReminderSettings {
  enabled24h: boolean;
  enabled2h: boolean;
  template24h: string;
  template2h: string;
  /** Mensagem automática quando o cliente reserva */
  sendBookingReceipt: boolean;
}

export interface DemoSettings {
  /** `fixed` usa `fixedMin` como hora atual de hoje — deixa a demonstração previsível */
  clock: 'real' | 'fixed';
  fixedMin: Minutes;
  /** Barbeiro "logado" no painel */
  currentUserId: ID;
}

export interface Database {
  schemaVersion: number;
  /** Data em que os dados de demonstração foram gerados */
  seededFor: DateKey;
  /** Incrementado a cada escrita — usado na sincronização entre abas */
  rev: number;
  barbershop: Barbershop;
  users: User[];
  barbers: Barber[];
  services: Service[];
  customers: Customer[];
  appointments: Appointment[];
  timeBlocks: TimeBlock[];
  waitlist: WaitlistEntry[];
  offers: SlotOffer[];
  notifications: Notification[];
  reminders: ReminderSettings;
  demo: DemoSettings;
}

/** Status que ocupam a agenda */
export const BLOCKING_STATUSES: AppointmentStatus[] = ['pending', 'confirmed', 'completed', 'no_show'];
