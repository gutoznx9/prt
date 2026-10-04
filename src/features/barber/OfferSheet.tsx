import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, MessageCircle, Send, Sparkles } from 'lucide-react';
import type { ID, OfferRecipientStatus } from '../../domain/types';
import { useDB } from '../../store/store';
import { useLookups, useNow } from '../../store/hooks';
import { freeWindowAt } from '../../domain/availability';
import { findReturningCustomers, findWaitlistMatches, type OfferCandidate } from '../../domain/waitlist';
import { formatDuration, formatRelativeDay, formatTime } from '../../domain/time';
import { firstName, formatMoney, initials, plural } from '../../domain/format';
import { closeOffer, respondToOffer, sendSlotOffer } from '../../store/actions';
import { Avatar, Button, Sheet, cx } from '../../ui/primitives';
import { useToast } from '../../ui/toast';
import { useWhatsApp } from '../demo/WhatsAppContext';
import type { OfferTarget } from './BarberUI';

const RECIPIENT_LABEL: Record<OfferRecipientStatus, { text: string; cls: string }> = {
  sent: { text: 'Aviso entregue', cls: 'text-muted' },
  accepted: { text: 'Ficou com o horário', cls: 'text-ok font-semibold' },
  declined: { text: 'Recusou', cls: 'text-muted' },
  too_late: { text: 'Respondeu tarde', cls: 'text-muted' },
};

export function OfferSheet({ target, onClose }: { target: OfferTarget; onClose: () => void }) {
  const db = useDB();
  const now = useNow(db);
  const lookups = useLookups(db);
  const toast = useToast();
  const whatsapp = useWhatsApp();
  const navigate = useNavigate();

  const offer = useMemo(
    () =>
      [...db.offers]
        .reverse()
        .find((o) => o.barberId === target.barberId && o.date === target.date && o.startMin === target.startMin && o.status !== 'closed'),
    [db.offers, target],
  );
  const windowMin = freeWindowAt(db, target.barberId, target.date, target.startMin);
  const slot = { barberId: target.barberId, date: target.date, startMin: target.startMin, windowMin };
  const waitlist = useMemo(() => findWaitlistMatches(db, slot), [db, windowMin]); // eslint-disable-line react-hooks/exhaustive-deps
  const returning = useMemo(() => findReturningCustomers(db, slot, now.date), [db, windowMin, now.date]); // eslint-disable-line react-hooks/exhaustive-deps

  const [selected, setSelected] = useState<Set<ID>>(
    () => new Set([...waitlist.map((c) => c.customer.id), ...(target.preselect ?? [])]),
  );
  const barber = lookups.barber(target.barberId);
  const when = `${formatRelativeDay(target.date, now.date)} às ${formatTime(target.startMin)}`;
  const toggle = (id: ID) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = () => {
    const recipients = [...waitlist, ...returning]
      .filter((c) => selected.has(c.customer.id))
      .map((c) => ({ customerId: c.customer.id, waitlistEntryId: c.waitlistEntry?.id ?? null, serviceId: c.service.id }));
    const res = sendSlotOffer({ ...target, recipients });
    if (!res.ok) toast(res.error, 'info');
  };

  // ── Oferta já enviada: acompanhar respostas ──────────────────────────────
  if (offer) {
    const filled = offer.status === 'filled' ? db.appointments.find((a) => a.id === offer.filledAppointmentId) : null;
    return (
      <Sheet open onClose={onClose} eyebrow={filled ? 'Horário recuperado' : 'Oferta enviada'} title={when}>
        {filled ? (
          <div className="rounded-2xl bg-ink p-5 text-white">
            <div className="flex items-center gap-2 text-brass-300">
              <Sparkles size={16} /> <span className="text-sm font-semibold">+{formatMoney(filled.priceCents)} que ficariam na mesa</span>
            </div>
            <p className="mt-2 text-xl font-semibold">
              {lookups.customer(filled.customerId)?.name} ficou com o horário
            </p>
            <p className="mt-1 text-white/70">
              {lookups.service(filled.serviceId)?.name} · {formatTime(filled.startMin)} com {barber?.name}. Já está confirmado na agenda.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-line p-5">
            <p className="text-xl font-semibold">Oferta enviada para {plural(offer.recipients.length, 'cliente', 'clientes')}.</p>
            <p className="mt-1 text-muted">Quem responder primeiro no WhatsApp garante o horário — ele entra confirmado na agenda automaticamente.</p>
          </div>
        )}

        <ul className="mt-5 divide-y divide-line">
          {offer.recipients.map((r) => {
            const c = lookups.customer(r.customerId);
            if (!c) return null;
            const label = RECIPIENT_LABEL[r.status];
            return (
              <li key={r.customerId} className="flex items-center gap-3 py-3">
                <Avatar label={initials(c.name)} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.name}</p>
                  <p className={cx('text-sm', label.cls)}>
                    {r.status === 'sent' && <Check size={13} className="mr-1 inline text-sky-600" strokeWidth={3} />}
                    {label.text} · {lookups.service(r.serviceId)?.name}
                  </p>
                </div>
                {r.status === 'sent' && offer.status === 'open' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const res = respondToOffer(offer.id, c.id, true);
                      if (res.ok) toast(`${firstName(c.name)} aceitou — horário recuperado!`);
                    }}
                  >
                    Simular "quero"
                  </Button>
                )}
                <button onClick={() => whatsapp.open(c.id)} className="grid size-10 place-items-center rounded-full text-muted hover:bg-ink/5" aria-label={`WhatsApp de ${c.name}`}>
                  <MessageCircle size={18} />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex flex-col gap-2.5 pb-1">
          {filled ? (
            <Button block size="lg" onClick={() => { onClose(); navigate('/painel/resultados'); }}>
              Ver impacto nos resultados
            </Button>
          ) : (
            <>
              <Button block size="lg" variant="secondary" onClick={() => whatsapp.open(offer.recipients[0]?.customerId)}>
                <MessageCircle size={18} /> Ver como o cliente recebe
              </Button>
              <Button block variant="ghost" onClick={() => { closeOffer(offer.id); toast('Oferta encerrada', 'info'); }}>
                Encerrar oferta
              </Button>
            </>
          )}
        </div>
      </Sheet>
    );
  }

  // ── Escolher quem recebe o aviso ─────────────────────────────────────────
  const count = selected.size;
  const preview = [...waitlist, ...returning].find((c) => selected.has(c.customer.id));
  return (
    <Sheet
      open
      onClose={onClose}
      eyebrow="Oferecer horário"
      title={`${when} · ${barber?.name}`}
      footer={
        windowMin > 0 ? (
          <Button block size="lg" variant="brass" disabled={count === 0} onClick={send}>
            <Send size={18} /> Enviar aviso{count ? ` para ${plural(count, 'cliente', 'clientes')}` : ''}
          </Button>
        ) : undefined
      }
    >
      {windowMin <= 0 ? (
        <p className="rounded-2xl bg-paper p-4 text-muted">Esse horário não está mais livre.</p>
      ) : (
        <>
          <p className="text-[15px] text-muted">
            {formatDuration(windowMin)} livres a partir das {formatTime(target.startMin)}.{' '}
            <span className="font-semibold text-ink">
              {waitlist.length > 0
                ? `${plural(waitlist.length, 'cliente pode', 'clientes podem')} receber o aviso.`
                : returning.length > 0
                  ? `Ninguém na lista de espera, mas ${plural(returning.length, 'cliente está', 'clientes estão')} no ponto de voltar.`
                  : 'Nenhum cliente elegível agora — o horário já voltou para a página de agendamento.'}
            </span>
          </p>

          <CandidateGroup title="Lista de espera" empty="Ninguém na lista de espera para este horário." items={waitlist} selected={selected} onToggle={toggle} />
          {returning.length > 0 && (
            <CandidateGroup title="Clientes no ponto de voltar" items={returning} selected={selected} onToggle={toggle} />
          )}

          {preview && (
            <div className="mt-5">
              <p className="mb-2 text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">Mensagem</p>
              <div className="rounded-2xl rounded-tl-sm bg-[#ece8e1] p-3">
                <p className="rounded-xl bg-white px-3 py-2 text-[15px] leading-snug shadow-sm">
                  {firstName(preview.customer.name)}, abriu um horário {formatRelativeDay(target.date, now.date).toLowerCase()} às{' '}
                  {formatTime(target.startMin)} com {barber?.name}. {preview.service.name} — quer ficar com ele? Quem responder primeiro garante.
                </p>
              </div>
              <p className="mt-2 text-xs text-muted">Simulado nesta versão. Em produção: WhatsApp Business API.</p>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

function CandidateGroup({
  title,
  empty,
  items,
  selected,
  onToggle,
}: {
  title: string;
  empty?: string;
  items: OfferCandidate[];
  selected: Set<ID>;
  onToggle: (id: ID) => void;
}) {
  return (
    <section className="mt-5">
      <p className="mb-2 text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">{title}</p>
      {items.length === 0 && empty && <p className="rounded-xl bg-paper px-4 py-3 text-sm text-muted">{empty}</p>}
      <ul className="space-y-2">
        {items.map((c) => {
          const on = selected.has(c.customer.id);
          return (
            <li key={c.customer.id}>
              <button
                onClick={() => onToggle(c.customer.id)}
                aria-pressed={on}
                className={cx(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                  on ? 'border-ink bg-ink/[0.03]' : 'border-line-strong',
                )}
              >
                <span className={cx('grid size-6 shrink-0 place-items-center rounded-md border', on ? 'border-ink bg-ink text-white' : 'border-line-strong')}>
                  {on && <Check size={14} strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.customer.name}</p>
                  <p className="text-sm text-muted">
                    {c.service.name} ·{' '}
                    {c.waitlistEntry
                      ? `${c.reason} (${formatTime(c.waitlistEntry.fromMin)}–${formatTime(c.waitlistEntry.toMin)})`
                      : c.reason}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
