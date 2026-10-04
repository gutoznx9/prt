import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, CheckCheck, Send, X } from 'lucide-react';
import type { ID, Notification } from '../../domain/types';
import { useDB } from '../../store/store';
import { useNow } from '../../store/hooks';
import { customerReplyToReminder, customerSendsMessage, markNotificationsRead, respondToOffer } from '../../store/actions';
import { firstName, formatPhone, initials } from '../../domain/format';
import { Avatar, cx } from '../../ui/primitives';
import { useToast } from '../../ui/toast';

function timeOf(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Celular simulado do cliente. Mostra exatamente as mensagens que a barbearia "enviou"
 * (tabela `notifications`, canal whatsapp) e permite responder como o cliente faria.
 */
export function WhatsAppSimulator({
  open,
  customerId,
  onSelect,
  onClose,
}: {
  open: boolean;
  customerId: ID | null;
  onSelect: (id: ID | null) => void;
  onClose: () => void;
}) {
  const db = useDB();
  const now = useNow(db);
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => db.notifications.filter((n) => n.channel === 'whatsapp'), [db.notifications]);
  const threads = useMemo(() => {
    const map = new Map<ID, Notification[]>();
    for (const m of messages) {
      if (!m.customerId) continue;
      map.set(m.customerId, [...(map.get(m.customerId) ?? []), m]);
    }
    return [...map.entries()]
      .map(([id, list]) => ({ customer: db.customers.find((c) => c.id === id)!, list, last: list[list.length - 1] }))
      .filter((t) => t.customer)
      .sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt));
  }, [messages, db.customers]);

  const customer = customerId ? db.customers.find((c) => c.id === customerId) : null;
  const thread = customerId ? messages.filter((m) => m.customerId === customerId) : [];

  // Ao abrir a conversa, o "cliente" leu as mensagens.
  useEffect(() => {
    if (!open || !customerId) return;
    const unread = thread.filter((m) => m.direction === 'out' && !m.readAt).map((m) => m.id);
    if (unread.length) markNotificationsRead(unread);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [open, customerId, thread.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const offerActions = (m: Notification) => {
    if (m.kind !== 'slot_offer' || !m.offerId) return null;
    const offer = db.offers.find((o) => o.id === m.offerId);
    const recipient = offer?.recipients.find((r) => r.customerId === m.customerId);
    if (!offer || !recipient || recipient.status !== 'sent') return null;
    return [
      {
        label: 'Quero esse horário',
        run: () => {
          const res = respondToOffer(offer.id, m.customerId!, true);
          toast(res.ok ? 'Horário garantido para o cliente' : 'Outro cliente respondeu antes', res.ok ? 'ok' : 'info');
        },
      },
      { label: 'Não posso', run: () => respondToOffer(offer.id, m.customerId!, false) },
    ];
  };

  const reminderActions = (m: Notification) => {
    if ((m.kind !== 'reminder_24h' && m.kind !== 'reminder_2h') || !m.appointmentId) return null;
    const a = db.appointments.find((x) => x.id === m.appointmentId);
    if (!a || (a.status !== 'pending' && a.status !== 'confirmed')) return null;
    if (a.date < now.date || (a.date === now.date && a.startMin <= now.minutes)) return null;
    const replied = thread.some((x) => x.direction === 'in' && x.appointmentId === a.id);
    if (replied) return null;
    return [
      { label: 'Confirmo', run: () => customerReplyToReminder(a.id, true) },
      {
        label: 'Não vou conseguir ir',
        run: () => {
          customerReplyToReminder(a.id, false);
          toast('Cancelado pelo cliente — horário liberado no painel', 'info');
        },
      },
    ];
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-label="WhatsApp simulado">
      <button aria-label="Fechar" className="absolute inset-0 bg-ink/40 animate-fade-in" onClick={onClose} />
      <div className="relative flex h-full w-full flex-col bg-[#ece8e1] shadow-float animate-sheet-in sm:my-3 sm:mr-3 sm:h-[calc(100%-24px)] sm:w-[400px] sm:overflow-hidden sm:rounded-[28px]">
        {/* Barra superior */}
        <div className="flex items-center gap-3 bg-[#1f2c26] px-3 py-3 text-white">
          {customer ? (
            <button onClick={() => onSelect(null)} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Voltar">
              <ArrowLeft size={20} />
            </button>
          ) : null}
          {customer ? (
            <>
              <Avatar label="BL" size={36} tone="brass" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{db.barbershop.name}</p>
                <p className="truncate text-xs text-white/60">Celular de {customer.name}</p>
              </div>
            </>
          ) : (
            <div className="min-w-0 flex-1 pl-2">
              <p className="text-[15px] font-semibold">WhatsApp dos clientes</p>
              <p className="text-xs text-white/60">Simulação — o que cada cliente recebeu</p>
            </div>
          )}
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        {!customer ? (
          <ul className="flex-1 divide-y divide-black/5 overflow-y-auto bg-white">
            {threads.length === 0 && <li className="p-6 text-center text-sm text-muted">Nenhuma mensagem enviada ainda.</li>}
            {threads.map(({ customer: c, list, last }) => {
              const unread = list.filter((m) => m.direction === 'out' && !m.readAt).length;
              return (
                <li key={c.id}>
                  <button onClick={() => onSelect(c.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper">
                    <Avatar label={initials(c.name)} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate font-semibold">{c.name}</p>
                        <span className={cx('text-xs', unread ? 'font-semibold text-[#1f8a5b]' : 'text-muted')}>{timeOf(last.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="flex-1 truncate text-sm text-muted">
                          {last.direction === 'in' ? 'Você: ' : ''}
                          {last.body}
                        </p>
                        {unread > 0 && (
                          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#1f8a5b] px-1.5 text-[11px] font-bold text-white">{unread}</span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
              <p className="mx-auto mb-3 w-fit rounded-lg bg-[#fdf6e3] px-3 py-1.5 text-center text-[12px] text-ink/70">
                Simulação · {formatPhone(customer.phone)} · nenhuma mensagem real é enviada
              </p>
              {thread.length === 0 && <p className="text-center text-sm text-muted">Sem mensagens ainda.</p>}
              {thread.map((m) => {
                const actions = offerActions(m) ?? reminderActions(m);
                const fromShop = m.direction === 'out';
                return (
                  <div key={m.id} className={cx('flex', fromShop ? 'justify-start' : 'justify-end')}>
                    <div className={cx('max-w-[85%] rounded-2xl px-3 py-2 text-[15px] shadow-sm', fromShop ? 'rounded-tl-sm bg-white' : 'rounded-tr-sm bg-[#d8f5c8]')}>
                      {fromShop && m.kind !== 'chat' && <p className="mb-0.5 text-xs font-semibold text-brass-700">{m.title}</p>}
                      <p className="leading-snug whitespace-pre-line">{m.body}</p>
                      <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-ink/45">
                        {timeOf(m.createdAt)}
                        {!fromShop && <CheckCheck size={14} className="text-sky-500" />}
                      </p>
                      {actions && (
                        <div className="-mx-3 mt-2 -mb-2 divide-y divide-black/5 border-t border-black/5">
                          {actions.map((a) => (
                            <button key={a.label} onClick={a.run} className="block w-full py-2.5 text-center text-[15px] font-semibold text-sky-700 hover:bg-black/[0.03]">
                              {a.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <form
              className="flex items-center gap-2 bg-[#ece8e1] px-3 py-3 pb-safe"
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                customerSendsMessage(customer.id, draft.trim());
                setDraft('');
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Mensagem como ${firstName(customer.name)}`}
                className="h-11 flex-1 rounded-full bg-white px-4 outline-none"
              />
              <button type="submit" className="grid size-11 place-items-center rounded-full bg-[#1f8a5b] text-white" aria-label="Enviar">
                <Send size={18} />
              </button>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
