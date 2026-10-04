import type { Database, ID, Notification, NotificationKind } from '../domain/types';
import { uid } from '../domain/format';

/**
 * Gateway de mensagens.
 *
 * No protótipo, "enviar" significa registrar a mensagem na tabela `notifications`,
 * que alimenta o WhatsApp simulado e os avisos do painel.
 * Em produção, esta camada vira uma fila (ex.: Edge Function + WhatsApp Business API / Web Push),
 * mantendo a mesma assinatura para quem chama.
 */

interface MessageInput {
  kind: NotificationKind;
  customerId: ID;
  body: string;
  title?: string;
  barberId?: ID | null;
  appointmentId?: ID | null;
  offerId?: ID | null;
}

export function sendWhatsApp(db: Database, input: MessageInput): Notification {
  const n: Notification = {
    id: uid('ntf'),
    barbershopId: db.barbershop.id,
    channel: 'whatsapp',
    direction: 'out',
    kind: input.kind,
    barberId: input.barberId ?? null,
    customerId: input.customerId,
    appointmentId: input.appointmentId ?? null,
    offerId: input.offerId ?? null,
    title: input.title ?? db.barbershop.name,
    body: input.body,
    createdAt: new Date().toISOString(),
    readAt: null,
  };
  db.notifications.push(n);
  return n;
}

/** Mensagem recebida do cliente (simulada). */
export function receiveWhatsApp(db: Database, input: Omit<MessageInput, 'kind'> & { kind?: NotificationKind }): Notification {
  const n = sendWhatsApp(db, { kind: 'chat', ...input });
  n.direction = 'in';
  return n;
}

interface AppNoticeInput {
  kind: NotificationKind;
  title: string;
  body: string;
  barberId: ID | null;
  customerId?: ID | null;
  appointmentId?: ID | null;
  offerId?: ID | null;
}

/** Aviso no painel do barbeiro (futuro: push notification do PWA). */
export function notifyBarber(db: Database, input: AppNoticeInput): Notification {
  const n: Notification = {
    id: uid('ntf'),
    barbershopId: db.barbershop.id,
    channel: 'app',
    direction: 'out',
    kind: input.kind,
    barberId: input.barberId,
    customerId: input.customerId ?? null,
    appointmentId: input.appointmentId ?? null,
    offerId: input.offerId ?? null,
    title: input.title,
    body: input.body,
    createdAt: new Date().toISOString(),
    readAt: null,
  };
  db.notifications.push(n);
  return n;
}
