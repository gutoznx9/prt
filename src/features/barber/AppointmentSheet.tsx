import { useState } from 'react';
import { BellRing, Check, CheckCheck, MessageCircle, Sparkles, UserRound, UserX, X } from 'lucide-react';
import type { CancelledBy, ID } from '../../domain/types';
import { useDB } from '../../store/store';
import { useLookups, useNow } from '../../store/hooks';
import { cancelAppointment, completeAppointment, confirmAppointment, markNoShow, sendReminder } from '../../store/actions';
import { formatDuration, formatRelativeDay, formatTime } from '../../domain/time';
import { formatMoney, formatPhone } from '../../domain/format';
import { getCustomerStats } from '../../domain/customers';
import { Button, Sheet } from '../../ui/primitives';
import { useToast } from '../../ui/toast';
import { useWhatsApp } from '../demo/WhatsAppContext';
import { StatusChip } from './status';
import { useBarberUI } from './BarberUI';

export function AppointmentSheet({ id, onClose }: { id: ID; onClose: () => void }) {
  const db = useDB();
  const now = useNow(db);
  const lookups = useLookups(db);
  const toast = useToast();
  const whatsapp = useWhatsApp();
  const ui = useBarberUI();
  const [cancelling, setCancelling] = useState(false);

  const a = db.appointments.find((x) => x.id === id);
  if (!a) return null;
  const customer = lookups.customer(a.customerId)!;
  const service = lookups.service(a.serviceId)!;
  const barber = lookups.barber(a.barberId)!;
  const stats = getCustomerStats(db, customer.id, now.date);
  const started = a.date < now.date || (a.date === now.date && a.startMin <= now.minutes);
  const open = a.status === 'pending' || a.status === 'confirmed';
  const original = a.recoveredFromId ? db.appointments.find((x) => x.id === a.recoveredFromId) : null;

  const doCancel = (by: CancelledBy) => {
    cancelAppointment(a.id, by);
    toast('Horário liberado na agenda');
    onClose();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (cancelling) {
    return (
      <Sheet open onClose={() => setCancelling(false)} eyebrow="Cancelar" title={`${customer.name} · ${formatTime(a.startMin)}`}>
        <p className="text-muted">
          O horário volta a ficar disponível na página de agendamento e você poderá oferecê-lo para quem está na lista de espera.
        </p>
        <div className="mt-5 space-y-3">
          <Button block size="lg" variant="danger" onClick={() => doCancel('customer')}>
            Cliente desmarcou
          </Button>
          <Button block size="lg" variant="danger" onClick={() => doCancel('barber')}>
            Barbearia precisa cancelar
          </Button>
          <Button block size="lg" variant="ghost" onClick={() => setCancelling(false)}>
            Voltar
          </Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      eyebrow={`${formatRelativeDay(a.date, now.date)} · ${barber.name}`}
      title={
        <span className="flex items-baseline gap-3">
          <span className="font-condensed text-4xl font-bold tabular">{formatTime(a.startMin)}</span>
          <span className="text-base font-medium text-muted tabular">até {formatTime(a.startMin + a.durationMin)}</span>
        </span>
      }
      footer={
        open ? (
          <div className="flex flex-col gap-2.5">
            {a.status === 'pending' && (
              <Button
                block
                size="lg"
                onClick={() => {
                  confirmAppointment(a.id);
                  toast('Confirmado — cliente avisado no WhatsApp');
                }}
              >
                <Check size={18} /> Confirmar agendamento
              </Button>
            )}
            {a.status === 'confirmed' && started && (
              <div className="flex gap-2.5">
                <Button block size="lg" onClick={() => { completeAppointment(a.id); toast('Atendimento concluído'); onClose(); }}>
                  <CheckCheck size={18} /> Concluir
                </Button>
                <Button size="lg" variant="secondary" onClick={() => { markNoShow(a.id); toast('Marcado como falta', 'info'); onClose(); }}>
                  <UserX size={18} /> Faltou
                </Button>
              </div>
            )}
            {a.status === 'confirmed' && !started && (
              <Button
                block
                size="lg"
                variant="secondary"
                onClick={() => {
                  sendReminder(a.id, a.date === now.date ? 'reminder_2h' : 'reminder_24h');
                  toast('Lembrete enviado (simulado)');
                }}
              >
                <BellRing size={18} /> Enviar lembrete agora
              </Button>
            )}
            <Button block size="lg" variant="danger" onClick={() => setCancelling(true)}>
              <X size={18} /> Cancelar horário
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex items-center justify-between gap-3">
        <StatusChip status={a.status} />
        {a.source === 'recovered' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brass-50 px-2.5 py-1 text-xs font-semibold text-brass-700">
            <Sparkles size={12} /> Horário recuperado
          </span>
        )}
        {a.source === 'online' && <span className="text-xs font-medium text-muted">Reservado online</span>}
        {a.source === 'barber' && <span className="text-xs font-medium text-muted">Encaixe manual</span>}
      </div>

      <div className="mt-5 rounded-2xl border border-line p-4">
        <p className="text-xl font-semibold tracking-[-0.01em]">{customer.name}</p>
        <p className="text-muted tabular">{formatPhone(customer.phone)}</p>
        <p className="mt-3 text-[15px]">
          {service.name} · {formatDuration(a.durationMin)} · <span className="font-semibold">{formatMoney(a.priceCents)}</span>
        </p>
        <p className="mt-2 text-sm text-muted">
          {stats.visits > 0
            ? `${stats.visits} visitas · último corte ${stats.lastVisit ? formatRelativeDay(stats.lastVisit, now.date).toLowerCase() : '—'}`
            : 'Primeira visita'}
        </p>
        {customer.notes && <p className="mt-3 rounded-xl bg-paper px-3 py-2 text-sm">{customer.notes}</p>}
        {original && (
          <p className="mt-3 text-sm text-brass-700">
            Ocupou o horário cancelado por {lookups.customer(original.customerId)?.name}. +{formatMoney(a.priceCents)} que teria ficado vazio.
          </p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <Button variant="secondary" onClick={() => whatsapp.open(customer.id)}>
          <MessageCircle size={17} /> WhatsApp
        </Button>
        <Button variant="secondary" onClick={() => ui.openCustomer(customer.id)}>
          <UserRound size={17} /> Ficha do cliente
        </Button>
      </div>
    </Sheet>
  );
}
