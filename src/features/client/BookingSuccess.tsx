import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BellRing, CalendarPlus, Check, Clock3, MessageCircle, X } from 'lucide-react';
import { useDB } from '../../store/store';
import { useLookups } from '../../store/hooks';
import { formatDayMonth, formatTime, WEEKDAYS, weekdayOf } from '../../domain/time';
import { formatMoney } from '../../domain/format';
import { cancelAppointment } from '../../store/actions';
import { downloadIcs } from '../../services/calendar';
import { Button, Sheet, cx } from '../../ui/primitives';
import { BarberLabMark } from '../../ui/brand';
import { useToast } from '../../ui/toast';
import { useWhatsApp } from '../demo/WhatsAppContext';

export function BookingSuccess() {
  const { id } = useParams();
  const db = useDB();
  const lookups = useLookups(db);
  const whatsapp = useWhatsApp();
  const toast = useToast();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const a = db.appointments.find((x) => x.id === id);
  if (!a) {
    return (
      <div className="mx-auto max-w-md px-5 py-20 text-center">
        <p className="font-semibold">Agendamento não encontrado.</p>
        <Link to="/" className="mt-4 inline-block underline">
          Voltar para a barbearia
        </Link>
      </div>
    );
  }
  const service = lookups.service(a.serviceId)!;
  const barber = lookups.barber(a.barberId)!;
  const cancelled = a.status === 'cancelled';
  const remindersOn = db.reminders.enabled24h || db.reminders.enabled2h;

  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-md px-5 pt-10 pb-16">
        <div className="text-center">
          <span className={cx('mx-auto grid size-16 place-items-center rounded-full text-white', cancelled ? 'bg-bad' : 'bg-ink')}>
            {cancelled ? <X size={28} strokeWidth={2.5} /> : <Check size={30} strokeWidth={2.5} />}
          </span>
          <h1 className="mt-6 text-[30px] leading-tight font-semibold tracking-[-0.03em]">
            {cancelled ? 'Agendamento cancelado' : 'Agendamento confirmado'}
          </h1>
          {!cancelled && (
            <p
              className={cx(
                'mx-auto mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium',
                a.status === 'pending' ? 'bg-wait-soft text-wait' : 'bg-ok-soft text-ok',
              )}
            >
              {a.status === 'pending' ? <Clock3 size={14} /> : <Check size={14} strokeWidth={3} />}
              {a.status === 'pending' ? `Horário reservado · ${barber.name} vai confirmar` : `Confirmado por ${barber.name}`}
            </p>
          )}
        </div>

        <div className={cx('mt-8 overflow-hidden rounded-3xl border border-line bg-surface', cancelled && 'opacity-60')}>
          <div className="flex items-center justify-between bg-ink px-6 py-4 text-white">
            <BarberLabMark size="sm" />
            <span className="text-sm text-white/60">#{a.id.slice(-5).toUpperCase()}</span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5 px-6 py-6">
            <div>
              <dt className="text-sm text-muted">Barbeiro</dt>
              <dd className="mt-0.5 text-lg font-semibold">{barber.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Serviço</dt>
              <dd className="mt-0.5 text-lg font-semibold">{service.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Data</dt>
              <dd className="mt-0.5 text-lg font-semibold">{formatDayMonth(a.date)}</dd>
              <dd className="text-sm text-muted">{WEEKDAYS[weekdayOf(a.date)]}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Horário</dt>
              <dd className="font-condensed text-[34px] leading-none font-bold tabular">{formatTime(a.startMin)}</dd>
            </div>
          </dl>
          <div className="flex justify-between border-t border-dashed border-line-strong px-6 py-4 text-[15px]">
            <span className="text-muted">{db.barbershop.address}</span>
            <span className="font-semibold tabular">{formatMoney(a.priceCents)}</span>
          </div>
        </div>

        {!cancelled && remindersOn && (
          <p className="mt-5 flex items-center justify-center gap-2 text-[15px] text-muted">
            <BellRing size={16} className="text-brass-600" />
            Você receberá um lembrete antes do horário.
          </p>
        )}

        <div className="mt-8 space-y-3">
          {!cancelled && (
            <Button block size="lg" onClick={() => downloadIcs(a, db.barbershop, service.name, barber.name)}>
              <CalendarPlus size={18} /> Adicionar ao calendário
            </Button>
          )}
          <Button block size="lg" variant="secondary" onClick={() => whatsapp.openAsCustomer(a.customerId)}>
            <MessageCircle size={18} /> Falar com a barbearia
          </Button>
        </div>

        <div className="mt-8 flex items-center justify-between text-sm">
          <Link to="/" className="font-medium text-muted hover:text-ink">
            Voltar para a barbearia
          </Link>
          {!cancelled && a.status !== 'completed' && (
            <button onClick={() => setConfirmCancel(true)} className="font-medium text-bad hover:underline">
              Preciso desmarcar
            </button>
          )}
        </div>
      </div>

      <Sheet
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Desmarcar este horário?"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" block size="lg" onClick={() => setConfirmCancel(false)}>
              Manter
            </Button>
            <Button
              variant="danger"
              block
              size="lg"
              onClick={() => {
                cancelAppointment(a.id, 'customer');
                setConfirmCancel(false);
                toast('Horário desmarcado. Obrigado por avisar!');
              }}
            >
              Desmarcar
            </Button>
          </div>
        }
      >
        <p className="text-muted">
          Avisando com antecedência, a barbearia consegue oferecer o horário para quem está na lista de espera.
        </p>
      </Sheet>
    </div>
  );
}
