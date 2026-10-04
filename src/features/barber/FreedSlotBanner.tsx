import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Send, Sparkles, X } from 'lucide-react';
import type { Appointment, Database, ID, SlotOffer } from '../../domain/types';
import { freeWindowAt, type Clock } from '../../domain/availability';
import { formatRelativeDay, formatTime } from '../../domain/time';
import { formatMoney, plural } from '../../domain/format';
import { Button } from '../../ui/primitives';
import { useBarberUI } from './BarberUI';

const RECENT_MS = 12 * 3_600_000;
const DISMISS_KEY = 'cadeira:dismissed-freed';

export type FreedState =
  | { kind: 'freed'; appointment: Appointment }
  | { kind: 'offered'; appointment: Appointment; offer: SlotOffer }
  | { kind: 'recovered'; appointment: Appointment; offer: SlotOffer; filled: Appointment };

/** Estado da recuperação de um horário cancelado (usado no banner e na linha do tempo). */
export function getFreedState(db: Database, a: Appointment, now: Clock): FreedState | null {
  if (a.status !== 'cancelled') return null;
  const future = a.date > now.date || (a.date === now.date && a.startMin > now.minutes);
  const offer = [...db.offers]
    .reverse()
    .find((o) => o.barberId === a.barberId && o.date === a.date && o.startMin === a.startMin && o.status !== 'closed');
  if (offer?.status === 'filled') {
    const filled = db.appointments.find((x) => x.id === offer.filledAppointmentId);
    if (filled && filled.status !== 'cancelled') return { kind: 'recovered', appointment: a, offer, filled };
  }
  if (!future) return null;
  if (offer?.status === 'open' && freeWindowAt(db, a.barberId, a.date, a.startMin) > 0) return { kind: 'offered', appointment: a, offer };
  if (freeWindowAt(db, a.barberId, a.date, a.startMin) > 0) return { kind: 'freed', appointment: a };
  return null;
}

function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(DISMISS_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function FreedSlotBanner({ db, barberId, now }: { db: Database; barberId: ID; now: Clock }) {
  const ui = useBarberUI();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(loadDismissed);

  const state = useMemo(() => {
    const recent = db.appointments
      .filter((a) => a.barberId === barberId && a.status === 'cancelled' && a.cancelledAt && Date.now() - Date.parse(a.cancelledAt) < RECENT_MS)
      .sort((a, b) => b.cancelledAt!.localeCompare(a.cancelledAt!));
    for (const a of recent) {
      const s = getFreedState(db, a, now);
      if (s && !dismissed.has(`${a.id}:${s.kind}`)) return s;
    }
    return null;
  }, [db, barberId, now, dismissed]);

  if (!state) return null;
  const a = state.appointment;
  const service = db.services.find((s) => s.id === a.serviceId);
  const barber = db.barbers.find((b) => b.id === a.barberId);
  const dismiss = () => {
    const next = new Set(dismissed).add(`${a.id}:${state.kind}`);
    setDismissed(next);
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...next]));
    } catch {
      /* ignora */
    }
  };
  const target = { barberId: a.barberId, date: a.date, startMin: a.startMin, sourceAppointmentId: a.id };

  return (
    <section className="relative mb-6 overflow-hidden rounded-3xl bg-ink p-5 text-white animate-drop-in" aria-live="polite">
      <button onClick={dismiss} className="absolute top-3 right-3 grid size-9 place-items-center rounded-full text-white/50 hover:bg-white/10" aria-label="Dispensar">
        <X size={18} />
      </button>
      {state.kind === 'recovered' ? (
        <>
          <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-brass-300 uppercase">
            <Sparkles size={14} /> Horário recuperado
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.02em]">+{formatMoney(state.filled.priceCents)} que ficariam na mesa</p>
          <p className="mt-1 text-white/70">
            {db.customers.find((c) => c.id === state.filled.customerId)?.name} ficou com {formatRelativeDay(a.date, now.date).toLowerCase()} às{' '}
            {formatTime(a.startMin)}.
          </p>
          <Button variant="inverse" className="mt-4" onClick={() => navigate('/painel/resultados')}>
            Ver resultados <ArrowRight size={16} />
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs font-semibold tracking-[0.14em] text-brass-300 uppercase">Horário liberado</p>
          <p className="mt-2 font-condensed text-4xl font-bold tabular">
            {formatRelativeDay(a.date, now.date)} às {formatTime(a.startMin)}
          </p>
          <p className="mt-0.5 text-white/70">
            {service?.name} — {barber?.name}
          </p>
          <p className="mt-3 text-[15px]">
            {state.kind === 'freed'
              ? 'Você acabou de liberar um horário.'
              : `Oferta enviada para ${plural(state.offer.recipients.length, 'cliente', 'clientes')}. Aguardando resposta…`}
          </p>
          <Button variant={state.kind === 'freed' ? 'brass' : 'inverse'} size="lg" block className="mt-4 sm:w-auto" onClick={() => ui.openOffer(target)}>
            {state.kind === 'freed' ? (
              <>
                <Send size={18} /> Oferecer horário aos clientes
              </>
            ) : (
              'Acompanhar respostas'
            )}
          </Button>
        </>
      )}
    </section>
  );
}
