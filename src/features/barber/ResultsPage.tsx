import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { ID } from '../../domain/types';
import { useCurrentUser, useLookups, useNow } from '../../store/hooks';
import { computeMetrics } from '../../domain/metrics';
import { formatShortDate, formatTime } from '../../domain/time';
import { formatMoney, plural } from '../../domain/format';
import { Segmented, cx } from '../../ui/primitives';

type Period = '7' | '30';

export function ResultsPage() {
  const { db, user, barber } = useCurrentUser();
  const now = useNow(db);
  const lookups = useLookups(db);
  const [period, setPeriod] = useState<Period>('30');
  const [scope, setScope] = useState<'me' | 'shop'>('me');
  const barberId: ID | null = scope === 'me' ? barber.id : null;

  const m = useMemo(() => computeMetrics(db, { today: now.date, days: Number(period), barberId }), [db, now.date, period, barberId]);
  const today = useMemo(() => computeMetrics(db, { today: now.date, days: 1, barberId }), [db, now.date, barberId]);

  const kpis: Array<{ label: string; value: string; note?: string; accent?: boolean }> = [
    { label: 'Agendamentos', value: String(m.bookings), note: `${Math.round(m.onlineShare * 100)}% feitos pelo próprio cliente` },
    { label: 'Horários recuperados', value: String(m.recovered), note: today.recovered ? `+${today.recovered} hoje` : undefined, accent: true },
    { label: 'Cancelamentos', value: String(m.cancellations), note: today.cancellations ? `${today.cancellations} hoje` : undefined },
    { label: 'Taxa de ocupação', value: `${Math.round(m.occupancy * 100)}%`, note: 'da agenda disponível' },
    { label: 'Receita estimada', value: formatMoney(m.revenueCents, { compact: true }), note: today.revenueCents ? `${formatMoney(today.revenueCents)} hoje` : undefined },
    { label: 'Faltas', value: String(m.noShows), note: 'clientes que não vieram' },
  ];

  return (
    <div className="mx-auto max-w-2xl px-5 pt-6 pb-8 sm:px-8 lg:pt-10">
      <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Resultados</h1>
      <p className="text-muted">
        {formatShortDate(m.from)} – {formatShortDate(m.to)}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Segmented size="sm" value={period} onChange={setPeriod} options={[{ value: '7', label: '7 dias' }, { value: '30', label: '30 dias' }]} />
        {user.role === 'owner' && (
          <Segmented
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'me', label: barber.name },
              { value: 'shop', label: 'Barbearia toda' },
            ]}
          />
        )}
      </div>

      {/* Valor recuperado — a mensagem principal do produto */}
      <section className="mt-6 rounded-3xl bg-ink p-6 text-white sm:p-8">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-brass-300 uppercase">
          <Sparkles size={14} /> Dinheiro que voltou para o caixa
        </p>
        <p className="mt-4 text-[22px] leading-snug font-semibold tracking-[-0.02em] sm:text-[26px]">
          Você recuperou aproximadamente{' '}
          <span className="font-condensed text-[44px] leading-none font-bold text-brass-300 tabular sm:text-[52px]">
            {formatMoney(m.recoveredCents)}
          </span>{' '}
          em horários que poderiam ter ficado vazios.
        </p>
        <p className="mt-4 text-white/60">
          {plural(m.recovered, 'horário reocupado', 'horários reocupados')} de {plural(m.cancellations, 'cancelamento', 'cancelamentos')}
          {today.recoveredCents > 0 && (
            <span className="text-brass-300"> · +{formatMoney(today.recoveredCents)} hoje</span>
          )}
        </p>
      </section>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-surface px-4 py-4 sm:px-5">
            <dt className="text-sm text-muted">{k.label}</dt>
            <dd className={cx('mt-1 font-condensed text-[34px] leading-none font-bold tabular', k.accent && 'text-brass-600')}>{k.value}</dd>
            {k.note && <dd className="mt-1.5 text-xs text-muted">{k.note}</dd>}
          </div>
        ))}
      </dl>

      {m.lostCents > 0 && (
        <section className="mt-4 rounded-2xl border border-line bg-surface px-5 py-4">
          <p className="font-semibold">Ainda ficaram {formatMoney(m.lostCents)} na mesa</p>
          <p className="mt-0.5 text-[15px] text-muted">
            São cancelamentos que não foram reocupados. Ofereça cada horário liberado para a lista de espera assim que ele abrir.
          </p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">Recuperações recentes</h2>
        {m.recoveries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong px-5 py-6 text-center text-muted">Nenhuma no período.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {m.recoveries.slice(0, 8).map(({ appointment: a, original }) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-[64px] shrink-0">
                  <p className="text-sm text-muted tabular">{formatShortDate(a.date).slice(0, 5)}</p>
                  <p className="font-condensed text-lg font-bold tabular">{formatTime(a.startMin)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{lookups.customer(a.customerId)?.name}</p>
                  <p className="truncate text-sm text-muted">
                    {lookups.service(a.serviceId)?.name}
                    {original && ` · no lugar de ${lookups.customer(original.customerId)?.name.split(' ')[0]}`}
                    {!barberId && ` · ${lookups.barber(a.barberId)?.name}`}
                  </p>
                </div>
                <span className="font-semibold text-brass-700 tabular">+{formatMoney(a.priceCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="mt-8 text-sm text-muted">
        <summary className="cursor-pointer font-medium text-ink">Como calculamos</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Agendamentos: horários marcados no período (exceto cancelados).</li>
          <li>Horários recuperados: reservas feitas no lugar de um cancelamento, via oferta para clientes.</li>
          <li>Valor recuperado: soma do preço desses atendimentos.</li>
          <li>Ocupação: minutos atendidos ÷ minutos de trabalho (descontando almoço e bloqueios).</li>
          <li>Receita estimada: atendimentos marcados ou realizados, sem faltas e cancelamentos.</li>
        </ul>
      </details>
    </div>
  );
}
