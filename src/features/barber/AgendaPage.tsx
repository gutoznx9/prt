import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell, Check, Clock3, MessageCircle, Send, Sparkles } from 'lucide-react';
import type { Appointment, DateKey, ID, Minutes } from '../../domain/types';
import { useCurrentUser, useLookups, useNow } from '../../store/hooks';
import { buildTimeline, type TimelineRow } from '../../domain/availability';
import { addDays, formatDuration, formatLongDate, formatTime, greeting, parseDateKey, WEEKDAYS_SHORT } from '../../domain/time';
import { firstName, formatMoney, plural } from '../../domain/format';
import { confirmAppointment, markNotificationsRead, removeBlock } from '../../store/actions';
import { Button, Segmented, cx } from '../../ui/primitives';
import { useToast } from '../../ui/toast';
import { useWhatsApp } from '../demo/WhatsAppContext';
import { useBarberUI } from './BarberUI';
import { FreedSlotBanner, getFreedState } from './FreedSlotBanner';
import { FreeSlotSheet } from './FreeSlotSheet';
import { NotificationsSheet } from './NotificationsSheet';
import { STATUS_META } from './status';

export function AgendaPage() {
  const { db, user, barber: me } = useCurrentUser();
  const now = useNow(db);
  const lookups = useLookups(db);
  const ui = useBarberUI();
  const toast = useToast();
  const whatsapp = useWhatsApp();
  const [params, setParams] = useSearchParams();
  const [freeSlot, setFreeSlot] = useState<{ startMin: Minutes } | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);

  const date: DateKey = params.get('data') ?? now.date;
  const barberId: ID = params.get('barbeiro') ?? me.id;
  const viewed = lookups.barber(barberId) ?? me;
  const isToday = date === now.date;

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value == null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  // "Ver agendamento" a partir de uma notificação abre direto o detalhe.
  const focusId = params.get('apt');
  useEffect(() => {
    if (!focusId) return;
    ui.openAppointment(focusId);
    const ids = db.notifications.filter((n) => n.appointmentId === focusId && n.channel === 'app' && !n.readAt).map((n) => n.id);
    markNotificationsRead(ids);
    setParam('apt', null);
    setTimeout(() => document.getElementById(`apt-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  }, [focusId]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => buildTimeline(db, barberId, date), [db, barberId, date]);
  const dayAppointments = rows.filter((r): r is Extract<TimelineRow, { type: 'appointment' }> => r.type === 'appointment').map((r) => r.appointment);
  const expected = dayAppointments.filter((a) => a.status !== 'no_show').reduce((s, a) => s + a.priceCents, 0);
  const freeFuture = rows.filter((r) => r.type === 'free' && (!isToday || r.start >= now.minutes)).length;
  const next: Appointment | undefined = isToday
    ? dayAppointments.find((a) => (a.status === 'confirmed' || a.status === 'pending') && a.startMin + a.durationMin > now.minutes)
    : undefined;
  const unread = db.notifications.filter((n) => n.channel === 'app' && !n.readAt && (user.role === 'owner' || n.barberId === me.id || n.barberId == null)).length;
  const days = Array.from({ length: 8 }, (_, i) => addDays(now.date, i - 1));

  return (
    <div className="mx-auto max-w-2xl px-5 pt-6 pb-8 sm:px-8 lg:pt-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-[32px]">
            {greeting(now.minutes)}, {firstName(user.name)}
          </h1>
          <p className="mt-0.5 text-[17px] text-muted">{formatLongDate(now.date)}</p>
        </div>
        <button
          onClick={() => setShowNotifications(true)}
          className="relative grid size-12 shrink-0 place-items-center rounded-full border border-line bg-surface hover:border-ink"
          aria-label={`Notificações${unread ? ` (${unread} novas)` : ''}`}
        >
          <Bell size={20} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brass-500 px-1 text-[11px] font-bold text-white">{unread}</span>
          )}
        </button>
      </header>

      {user.role === 'owner' && (
        <Segmented
          className="mt-5 w-full sm:w-auto"
          size="sm"
          value={barberId}
          onChange={(v) => setParam('barbeiro', v === me.id ? null : v)}
          options={db.barbers.filter((b) => b.active).map((b) => ({ value: b.id, label: b.id === me.id ? `${b.name} (você)` : b.name }))}
        />
      )}

      {/* Dias */}
      <div className="-mx-5 mt-4 flex gap-1.5 overflow-x-auto px-5 pb-1 no-scrollbar sm:mx-0 sm:px-0">
        {days.map((d) => {
          const selected = d === date;
          return (
            <button
              key={d}
              onClick={() => setParam('data', d === now.date ? null : d)}
              className={cx(
                'flex w-[52px] shrink-0 flex-col items-center rounded-2xl py-2 transition-colors',
                selected ? 'bg-ink text-white' : 'text-muted hover:bg-ink/5',
              )}
            >
              <span className="text-[11px] font-semibold uppercase">{d === now.date ? 'Hoje' : WEEKDAYS_SHORT[parseDateKey(d).getDay()]}</span>
              <span className={cx('font-condensed text-xl font-bold tabular', !selected && 'text-ink')}>{parseDateKey(d).getDate()}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <FreedSlotBanner db={db} barberId={barberId} now={now} />
      </div>

      {/* Próximo atendimento */}
      {isToday && next && (
        <section className="mb-6 rounded-3xl border border-line bg-surface p-5">
          <p className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">
            {next.startMin <= now.minutes ? 'Em atendimento' : 'Próximo atendimento'}
          </p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="font-condensed text-[56px] leading-[0.9] font-bold tabular">{formatTime(next.startMin)}</p>
              <p className="mt-2 truncate text-xl font-semibold">{lookups.customer(next.customerId)?.name}</p>
              <p className="text-muted">
                {lookups.service(next.serviceId)?.name} · {formatDuration(next.durationMin)}
              </p>
            </div>
            <span className={cx('mb-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_META[next.status].chip)}>
              <span className={cx('size-1.5 rounded-full', STATUS_META[next.status].dot)} />
              {next.status === 'pending' ? 'Aguardando' : 'Confirmado'}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {next.status === 'pending' ? (
              <Button onClick={() => { confirmAppointment(next.id); toast('Confirmado — cliente avisado'); }}>
                <Check size={17} /> Confirmar
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => whatsapp.open(next.customerId)}>
                <MessageCircle size={17} /> WhatsApp
              </Button>
            )}
            <Button variant="secondary" onClick={() => ui.openAppointment(next.id)}>
              Detalhes
            </Button>
          </div>
        </section>
      )}

      {/* Resumo do dia */}
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">
          {isToday ? 'Agenda de hoje' : formatLongDate(date)}
          {barberId !== me.id && ` · ${viewed.name}`}
        </h2>
        <p className="text-sm text-muted tabular">
          {plural(dayAppointments.length, 'atendimento', 'atendimentos')} · {formatMoney(expected)}
          {freeFuture > 0 && ` · ${plural(freeFuture, 'livre', 'livres')}`}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong px-5 py-10 text-center text-muted">
          {viewed.name} não atende neste dia.
        </div>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((row, i) => {
            const past = isToday && row.end <= now.minutes && row.type !== 'cancelled';
            const showNow = isToday && row.start >= now.minutes && (i === 0 || rows[i - 1].start < now.minutes);
            return (
              <li key={`${row.type}-${row.start}-${i}`}>
                {showNow && <NowMarker minutes={now.minutes} />}
                <TimelineItem
                  row={row}
                  past={past}
                  onFree={() => setFreeSlot({ startMin: row.start })}
                />
              </li>
            );
          })}
          {isToday && rows.length > 0 && rows[rows.length - 1].start < now.minutes && (
            <li>
              <NowMarker minutes={now.minutes} />
            </li>
          )}
        </ol>
      )}

      {freeSlot && <FreeSlotSheet barberId={barberId} date={date} startMin={freeSlot.startMin} onClose={() => setFreeSlot(null)} />}
      {showNotifications && <NotificationsSheet onClose={() => setShowNotifications(false)} />}
    </div>
  );
}

function NowMarker({ minutes }: { minutes: Minutes }) {
  return (
    <div className="flex items-center gap-2 py-1" aria-label="Agora">
      <span className="w-[52px] text-right text-xs font-bold text-brass-600 tabular">{formatTime(minutes)}</span>
      <span className="size-2 rounded-full bg-brass-500" />
      <span className="h-px flex-1 bg-brass-500/60" />
    </div>
  );
}

function TimelineItem({ row, past, onFree }: { row: TimelineRow; past: boolean; onFree: () => void }) {
  const { db } = useCurrentUser();
  const now = useNow(db);
  const lookups = useLookups(db);
  const ui = useBarberUI();
  const toast = useToast();

  const time = (
    <span className={cx('w-[52px] shrink-0 pt-3 text-right font-condensed text-[17px] font-bold tabular', past ? 'text-faint' : 'text-ink')}>
      {formatTime(row.start)}
    </span>
  );

  if (row.type === 'free') {
    return (
      <div className="flex gap-3">
        {time}
        <button
          disabled={past}
          onClick={onFree}
          className={cx(
            'flex min-h-11 flex-1 items-center justify-between rounded-xl border border-dashed px-4 text-left text-[15px] transition-colors',
            past ? 'border-line text-faint' : 'border-line-strong text-muted hover:border-ink hover:text-ink',
          )}
        >
          <span>livre</span>
          {!past && <span className="text-xs font-medium">até {formatTime(row.end)} · toque para encaixar</span>}
        </button>
      </div>
    );
  }

  if (row.type === 'break' || row.type === 'block') {
    const label = row.type === 'break' ? 'Almoço' : row.block.reason;
    return (
      <div className="flex gap-3">
        {time}
        <div className={cx('hatch flex min-h-11 flex-1 items-center justify-between rounded-xl bg-ink/[0.04] px-4 text-[15px] text-muted', past && 'opacity-60')}>
          <span className="font-medium">
            {label} <span className="font-normal">· até {formatTime(row.end)}</span>
          </span>
          {row.type === 'block' && !past && (
            <button
              onClick={() => {
                removeBlock(row.block.id);
                toast('Bloqueio removido');
              }}
              className="text-sm font-semibold text-ink underline-offset-2 hover:underline"
            >
              Desbloquear
            </button>
          )}
        </div>
      </div>
    );
  }

  const a = row.appointment;
  const customer = lookups.customer(a.customerId);
  const service = lookups.service(a.serviceId);

  if (row.type === 'cancelled') {
    const freed = getFreedState(db, a, now);
    return (
      <div className="flex gap-3">
        <span className="w-[52px] shrink-0 pt-2.5 text-right font-condensed text-[15px] font-bold text-faint line-through tabular">{formatTime(a.startMin)}</span>
        <div className="flex min-h-10 flex-1 flex-wrap items-center justify-between gap-2 rounded-xl border border-bad/20 bg-bad-soft/50 px-4 py-2">
          <span className="text-sm text-bad">
            <span className="font-semibold">Cancelado</span> · {customer?.name} · {service?.name}
          </span>
          {freed?.kind === 'freed' && (
            <button
              onClick={() => ui.openOffer({ barberId: a.barberId, date: a.date, startMin: a.startMin, sourceAppointmentId: a.id })}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink"
            >
              <Send size={14} /> Oferecer horário
            </button>
          )}
          {freed?.kind === 'offered' && (
            <button
              onClick={() => ui.openOffer({ barberId: a.barberId, date: a.date, startMin: a.startMin, sourceAppointmentId: a.id })}
              className="text-sm font-semibold text-ink"
            >
              Oferta enviada · ver
            </button>
          )}
          {freed?.kind === 'recovered' && <span className="text-sm font-semibold text-brass-700">Recuperado</span>}
        </div>
      </div>
    );
  }

  const meta = STATUS_META[a.status];
  const pending = a.status === 'pending';
  const done = a.status === 'completed' || a.status === 'no_show';
  return (
    <div className="flex gap-3" id={`apt-${a.id}`}>
      {time}
      <div
        role="button"
        tabIndex={0}
        onClick={() => ui.openAppointment(a.id)}
        onKeyDown={(e) => e.key === 'Enter' && ui.openAppointment(a.id)}
        className={cx(
          'relative flex flex-1 items-center gap-3 overflow-hidden rounded-xl border py-3 pr-3 pl-4 text-left transition-colors hover:border-ink',
          pending ? 'border-wait/30 bg-wait-soft' : 'border-line bg-surface',
          (past || done) && 'opacity-60',
        )}
        style={{ minHeight: Math.max(56, (a.durationMin / 30) * 40) }}
      >
        <span className={cx('absolute inset-y-0 left-0 w-1', meta.dot)} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold">
            {customer?.name}
            {a.source === 'recovered' && <Sparkles size={13} className="ml-1.5 inline text-brass-500" aria-label="Horário recuperado" />}
          </p>
          <p className="truncate text-sm text-muted">
            {service?.name} · {formatTime(a.startMin)}–{formatTime(a.startMin + a.durationMin)}
          </p>
          <p className={cx('mt-0.5 text-xs font-semibold', meta.chip.split(' ')[1])}>
            {pending && <Clock3 size={11} className="mr-1 inline" />}
            {meta.label}
          </p>
        </div>
        {pending && (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              confirmAppointment(a.id);
              toast('Confirmado — cliente avisado');
            }}
          >
            Confirmar
          </Button>
        )}
      </div>
    </div>
  );
}
