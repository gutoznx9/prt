import { useState } from 'react';
import { Ban, UserPlus } from 'lucide-react';
import type { DateKey, ID, Minutes } from '../../domain/types';
import { useDB } from '../../store/store';
import { useNow } from '../../store/hooks';
import { freeWindowAt } from '../../domain/availability';
import { formatDuration, formatRelativeDay, formatTime } from '../../domain/time';
import { formatMoney, formatPhone, isValidPhone } from '../../domain/format';
import { blockTime, bookAppointment } from '../../store/actions';
import { Button, Input, Sheet, cx } from '../../ui/primitives';
import { useToast } from '../../ui/toast';

type Mode = 'menu' | 'book' | 'block';

/** Toque em um horário livre: encaixar um cliente ou bloquear a agenda. */
export function FreeSlotSheet({ barberId, date, startMin, onClose }: { barberId: ID; date: DateKey; startMin: Minutes; onClose: () => void }) {
  const db = useDB();
  const now = useNow(db);
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('menu');
  const window = freeWindowAt(db, barberId, date, startMin);
  const services = db.services.filter((s) => s.active);
  const fitting = services.filter((s) => s.durationMin <= window);
  const [serviceId, setServiceId] = useState<ID | null>(fitting[0]?.id ?? null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockLen, setBlockLen] = useState<number>(Math.min(30, window));
  const [reason, setReason] = useState('Pausa');

  const title = `${formatRelativeDay(date, now.date)} · ${formatTime(startMin)}`;

  if (mode === 'book') {
    const valid = name.trim().length >= 2 && isValidPhone(phone) && serviceId;
    return (
      <Sheet
        open
        onClose={onClose}
        eyebrow="Encaixar cliente"
        title={title}
        footer={
          <Button
            block
            size="lg"
            onClick={() => {
              setTouched(true);
              if (!valid) return;
              const res = bookAppointment({ serviceId: serviceId!, barberId, date, startMin, customerName: name, phone, source: 'barber' });
              if (!res.ok) return setError(res.error);
              toast('Cliente encaixado e avisado no WhatsApp');
              onClose();
            }}
          >
            Agendar
          </Button>
        }
      >
        {error && <p className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}
        <p className="mb-2 text-sm font-medium">Serviço</p>
        <div className="grid grid-cols-2 gap-2">
          {services.map((s) => {
            const fits = s.durationMin <= window;
            return (
              <button
                key={s.id}
                disabled={!fits}
                onClick={() => setServiceId(s.id)}
                className={cx(
                  'rounded-xl border px-3 py-2.5 text-left disabled:opacity-40',
                  serviceId === s.id ? 'border-ink bg-ink text-white' : 'border-line-strong',
                )}
              >
                <span className="block text-[15px] font-semibold">{s.name}</span>
                <span className={cx('text-sm', serviceId === s.id ? 'text-white/70' : 'text-muted')}>
                  {formatDuration(s.durationMin)} · {formatMoney(s.priceCents)}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 space-y-4">
          <Input label="Nome do cliente" value={name} onChange={(e) => setName(e.target.value)} error={touched && name.trim().length < 2 ? 'Informe o nome' : undefined} />
          <Input
            label="WhatsApp"
            inputMode="tel"
            value={formatPhone(phone)}
            onChange={(e) => setPhone(e.target.value)}
            error={touched && !isValidPhone(phone) ? 'Telefone com DDD' : undefined}
          />
        </div>
      </Sheet>
    );
  }

  if (mode === 'block') {
    const options = [15, 30, 60, window].filter((v, i, arr) => v > 0 && v <= window && arr.indexOf(v) === i).sort((a, b) => a - b);
    return (
      <Sheet
        open
        onClose={onClose}
        eyebrow="Bloquear horário"
        title={title}
        footer={
          <Button
            block
            size="lg"
            onClick={() => {
              blockTime(barberId, date, startMin, startMin + blockLen, reason);
              toast('Horário bloqueado — some da página de agendamento');
              onClose();
            }}
          >
            Bloquear até {formatTime(startMin + blockLen)}
          </Button>
        }
      >
        <p className="mb-2 text-sm font-medium">Duração</p>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <button key={o} onClick={() => setBlockLen(o)} className={cx('h-11 rounded-xl border px-4 font-semibold', blockLen === o ? 'border-ink bg-ink text-white' : 'border-line-strong')}>
              {o === window ? `Tudo (${formatDuration(o)})` : formatDuration(o)}
            </button>
          ))}
        </div>
        <p className="mt-5 mb-2 text-sm font-medium">Motivo</p>
        <div className="flex flex-wrap gap-2">
          {['Pausa', 'Compromisso', 'Folga', 'Manutenção'].map((r) => (
            <button key={r} onClick={() => setReason(r)} className={cx('h-11 rounded-xl border px-4 font-semibold', reason === r ? 'border-ink bg-ink text-white' : 'border-line-strong')}>
              {r}
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} eyebrow="Horário livre" title={title}>
      <p className="text-muted">{formatDuration(window)} livres a partir daqui. Esse horário aparece para os clientes na página de agendamento.</p>
      <div className="mt-5 space-y-3 pb-2">
        <Button block size="lg" onClick={() => setMode('book')} disabled={fitting.length === 0}>
          <UserPlus size={18} /> Encaixar cliente
        </Button>
        <Button block size="lg" variant="secondary" onClick={() => setMode('block')}>
          <Ban size={18} /> Bloquear horário
        </Button>
      </div>
    </Sheet>
  );
}
