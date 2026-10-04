import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Send, X } from 'lucide-react';
import { useCurrentUser, useLookups, useNow } from '../../store/hooks';
import { CUSTOMER_STATUS_LABEL, getCustomerStats, type CustomerStatus } from '../../domain/customers';
import { activeWaitlist } from '../../domain/waitlist';
import { getSlots } from '../../domain/availability';
import { formatRelativeDay, formatShortDate, formatTime } from '../../domain/time';
import { formatPhone, initials } from '../../domain/format';
import { leaveWaitlist } from '../../store/actions';
import { Avatar, EmptyState, Segmented, cx } from '../../ui/primitives';
import { useToast } from '../../ui/toast';
import { useBarberUI } from './BarberUI';

type Filter = 'todos' | 'frequentes' | 'sumidos' | 'espera';
const STATUS_TONE: Record<CustomerStatus, string> = {
  new: 'bg-brass-50 text-brass-700',
  regular: 'bg-ok-soft text-ok',
  away: 'bg-ink/[0.06] text-muted',
  waitlist: 'bg-wait-soft text-wait',
};

export function ClientsPage() {
  const { db } = useCurrentUser();
  const now = useNow(db);
  const lookups = useLookups(db);
  const ui = useBarberUI();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const filter = (params.get('filtro') as Filter) ?? 'todos';

  const rows = useMemo(
    () =>
      db.customers
        .map((c) => ({ customer: c, stats: getCustomerStats(db, c.id, now.date) }))
        .sort((a, b) => (b.stats.lastVisit ?? '').localeCompare(a.stats.lastVisit ?? '') || b.stats.visits - a.stats.visits),
    [db, now.date],
  );
  const q = query.trim().toLowerCase();
  const filtered = rows.filter(({ customer, stats }) => {
    if (q && !customer.name.toLowerCase().includes(q) && !customer.phone.includes(q.replace(/\D/g, '') || '¬')) return false;
    if (filter === 'frequentes') return stats.status === 'regular';
    if (filter === 'sumidos') return stats.status === 'away';
    if (filter === 'espera') return stats.status === 'waitlist';
    return true;
  });
  const [limit, setLimit] = useState(40);

  const waitlist = activeWaitlist(db, now.date).sort((a, b) => a.date.localeCompare(b.date) || a.fromMin - b.fromMin);

  return (
    <div className="mx-auto max-w-2xl px-5 pt-6 pb-8 sm:px-8 lg:pt-10">
      <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Clientes</h1>
      <p className="text-muted">{db.customers.length} clientes · {waitlist.length} na lista de espera</p>

      {/* Lista de espera */}
      <section className="mt-6">
        <h2 className="mb-3 text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">Lista de espera</h2>
        {waitlist.length === 0 ? (
          <EmptyState title="Ninguém esperando">Quando um cliente pedir "me avise se aparecer um horário", ele aparece aqui.</EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {waitlist.map((w) => {
              const customer = lookups.customer(w.customerId);
              const service = lookups.service(w.serviceId);
              if (!customer || !service) return null;
              // Elegibilidade: existe agora um horário livre que serve para este cliente?
              const match = getSlots(db, { barberId: w.barberId, date: w.date, durationMin: service.durationMin }, now).find(
                (s) => s.status === 'available' && s.startMin >= w.fromMin && s.startMin <= w.toMin,
              );
              return (
                <li key={w.id} className="flex items-center gap-3 px-4 py-3.5">
                  <button className="min-w-0 flex-1 text-left" onClick={() => ui.openCustomer(customer.id)}>
                    <p className="font-semibold">{customer.name}</p>
                    <p className="text-sm text-muted">
                      {service.name} · {formatRelativeDay(w.date, now.date)} · {formatTime(w.fromMin)}–{formatTime(w.toMin)}
                      {w.barberId ? ` · ${lookups.barber(w.barberId)?.name}` : ''}
                    </p>
                    <p className={cx('mt-0.5 text-xs font-semibold', match ? 'text-ok' : 'text-muted')}>
                      {w.status === 'offered'
                        ? 'Oferta enviada · aguardando resposta'
                        : match
                          ? `Elegível: ${formatTime(match.startMin)} está livre`
                          : 'Aguardando um horário abrir'}
                    </p>
                  </button>
                  {match && w.status === 'active' && (
                    <button
                      onClick={() =>
                        ui.openOffer({
                          barberId: w.barberId ?? match.barberIds[0],
                          date: w.date,
                          startMin: match.startMin,
                          sourceAppointmentId: null,
                          preselect: [customer.id],
                        })
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-semibold text-white"
                    >
                      <Send size={14} /> Oferecer
                    </button>
                  )}
                  <button
                    onClick={() => {
                      leaveWaitlist(w.id);
                      toast('Removido da lista de espera', 'info');
                    }}
                    className="grid size-9 place-items-center rounded-full text-muted hover:bg-ink/5"
                    aria-label={`Remover ${customer.name} da lista`}
                  >
                    <X size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Busca + filtros */}
      <section className="mt-8">
        <div className="relative">
          <Search size={18} className="absolute top-1/2 left-4 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="h-12 w-full rounded-xl border border-line-strong bg-surface pr-4 pl-11 outline-none focus:border-ink"
          />
        </div>
        <Segmented
          className="mt-3 w-full"
          size="sm"
          value={filter}
          onChange={(v) => {
            const next = new URLSearchParams(params);
            if (v === 'todos') next.delete('filtro');
            else next.set('filtro', v);
            setParams(next, { replace: true });
          }}
          options={[
            { value: 'todos', label: 'Todos' },
            { value: 'frequentes', label: 'Frequentes' },
            { value: 'sumidos', label: 'Sumidos' },
            { value: 'espera', label: 'Em espera' },
          ]}
        />

        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {filtered.slice(0, limit).map(({ customer, stats }) => (
            <li key={customer.id}>
              <button onClick={() => ui.openCustomer(customer.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-paper">
                <Avatar label={initials(customer.name)} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{customer.name}</p>
                    <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_TONE[stats.status])}>
                      {CUSTOMER_STATUS_LABEL[stats.status]}
                    </span>
                  </div>
                  <p className="truncate text-sm text-muted tabular">{formatPhone(customer.phone)}</p>
                  <p className="truncate text-sm text-muted">
                    {stats.lastVisit ? `Último: ${formatShortDate(stats.lastVisit)}` : 'Sem visitas'} · {stats.totalAppointments} agend. ·{' '}
                    {lookups.service(stats.topServiceId)?.name ?? '—'}
                  </p>
                </div>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-4 py-8 text-center text-muted">Nenhum cliente encontrado.</li>}
        </ul>
        {filtered.length > limit && (
          <button onClick={() => setLimit((l) => l + 40)} className="mt-3 h-11 w-full rounded-xl text-sm font-semibold text-muted hover:bg-ink/5">
            Mostrar mais ({filtered.length - limit})
          </button>
        )}
      </section>
    </div>
  );
}
