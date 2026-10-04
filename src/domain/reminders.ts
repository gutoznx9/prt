import type { Appointment, Database, NotificationKind } from './types';
import type { Clock } from './availability';
import { addDays, formatDayMonth, formatTime } from './time';
import { firstName } from './format';

export const TEMPLATE_VARIABLES = ['{nome}', '{barbearia}', '{dia}', '{hora}', '{barbeiro}', '{servico}'] as const;

export function renderTemplate(db: Database, template: string, a: Appointment, today: string): string {
  const customer = db.customers.find((c) => c.id === a.customerId);
  const barber = db.barbers.find((b) => b.id === a.barberId);
  const service = db.services.find((s) => s.id === a.serviceId);
  const dia = a.date === today ? 'hoje' : a.date === addDays(today, 1) ? 'amanhã' : `dia ${formatDayMonth(a.date)}`;
  return template
    .replaceAll('{nome}', firstName(customer?.name ?? 'cliente'))
    .replaceAll('{barbearia}', db.barbershop.name)
    .replaceAll('{dia}', dia)
    .replaceAll('{hora}', formatTime(a.startMin))
    .replaceAll('{barbeiro}', barber?.name ?? '')
    .replaceAll('{servico}', service?.name ?? '');
}

export interface ScheduledReminder {
  appointment: Appointment;
  kind: Extract<NotificationKind, 'reminder_24h' | 'reminder_2h'>;
  /** Minutos até o envio, relativo ao "agora" (negativo = já deveria ter saído) */
  dueInMin: number;
  sent: boolean;
}

/** Lembretes previstos para as próximas ~36h, com status de envio. */
export function upcomingReminders(db: Database, now: Clock): ScheduledReminder[] {
  const toAbs = (date: string, min: number) => (date === now.date ? 0 : 1440) + min - now.minutes;
  const horizon = [now.date, addDays(now.date, 1)];
  const result: ScheduledReminder[] = [];
  for (const a of db.appointments) {
    if (!horizon.includes(a.date) || (a.status !== 'pending' && a.status !== 'confirmed')) continue;
    const startsIn = toAbs(a.date, a.startMin);
    if (startsIn <= 0) continue;
    const sentKinds = new Set(
      db.notifications.filter((n) => n.appointmentId === a.id && n.channel === 'whatsapp').map((n) => n.kind),
    );
    if (db.reminders.enabled24h && a.date !== now.date) {
      result.push({ appointment: a, kind: 'reminder_24h', dueInMin: startsIn - 1440, sent: sentKinds.has('reminder_24h') });
    }
    if (db.reminders.enabled2h) {
      result.push({ appointment: a, kind: 'reminder_2h', dueInMin: startsIn - 120, sent: sentKinds.has('reminder_2h') });
    }
  }
  return result.sort((a, b) => a.dueInMin - b.dueInMin);
}
