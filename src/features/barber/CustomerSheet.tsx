import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import type { ID } from '../../domain/types';
import { useDB } from '../../store/store';
import { useLookups, useNow } from '../../store/hooks';
import { CUSTOMER_STATUS_LABEL, getCustomerStats } from '../../domain/customers';
import { formatRelativeDay, formatShortDate, formatTime } from '../../domain/time';
import { formatMoney, formatPhone } from '../../domain/format';
import { updateCustomerNotes } from '../../store/actions';
import { Button, Sheet, cx } from '../../ui/primitives';
import { useToast } from '../../ui/toast';
import { useWhatsApp } from '../demo/WhatsAppContext';
import { STATUS_META } from './status';

export function CustomerSheet({ id, onClose }: { id: ID; onClose: () => void }) {
  const db = useDB();
  const now = useNow(db);
  const lookups = useLookups(db);
  const whatsapp = useWhatsApp();
  const toast = useToast();
  const customer = lookups.customer(id);
  const [notes, setNotes] = useState(customer?.notes ?? '');
  if (!customer) return null;
  const stats = getCustomerStats(db, id, now.date);
  const topService = lookups.service(stats.topServiceId);
  const next = stats.nextAppointment;

  return (
    <Sheet open onClose={onClose} eyebrow={CUSTOMER_STATUS_LABEL[stats.status]} title={customer.name}>
      <p className="-mt-2 text-muted tabular">{formatPhone(customer.phone)}</p>

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line">
        {[
          ['Último corte', stats.lastVisit ? formatShortDate(stats.lastVisit) : '—'],
          ['Total de visitas', String(stats.visits)],
          ['Serviço mais utilizado', topService?.name ?? '—'],
          ['Total gasto', formatMoney(stats.spentCents)],
        ].map(([k, v]) => (
          <div key={k} className="bg-surface px-4 py-3.5">
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="mt-0.5 text-lg font-semibold tracking-[-0.01em]">{v}</dd>
          </div>
        ))}
      </dl>

      {next && (
        <div className="mt-4 rounded-2xl bg-ink px-4 py-3.5 text-white">
          <p className="text-sm text-white/60">Próximo horário</p>
          <p className="font-semibold">
            {formatRelativeDay(next.date, now.date)} às {formatTime(next.startMin)} · {lookups.service(next.serviceId)?.name} com{' '}
            {lookups.barber(next.barberId)?.name}
          </p>
        </div>
      )}

      <label className="mt-5 block">
        <span className="mb-1.5 block text-sm font-medium">Observações</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== customer.notes) {
              updateCustomerNotes(customer.id, notes);
              toast('Observação salva');
            }
          }}
          rows={2}
          placeholder="Preferências, tipo de corte, máquina…"
          className="w-full rounded-xl border border-line-strong px-4 py-3 outline-none focus:border-ink"
        />
      </label>

      <p className="mt-5 mb-2 text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">Histórico</p>
      <ul className="divide-y divide-line">
        {stats.history.slice(0, 6).map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-[15px]">
            <span className="tabular">
              {formatShortDate(a.date)} <span className="text-muted">· {lookups.service(a.serviceId)?.name}</span>
            </span>
            <span className={cx('text-sm font-medium', STATUS_META[a.status].chip.split(' ')[1])}>{STATUS_META[a.status].label}</span>
          </li>
        ))}
        {stats.history.length === 0 && <li className="py-3 text-sm text-muted">Sem histórico.</li>}
      </ul>

      <Button className="mt-5" block variant="secondary" onClick={() => whatsapp.open(customer.id)}>
        <MessageCircle size={17} /> Conversar no WhatsApp
      </Button>
    </Sheet>
  );
}
