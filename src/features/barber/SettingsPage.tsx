import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Plus, Send } from 'lucide-react';
import type { Barber, Barbershop, Service, Weekday } from '../../domain/types';
import { useCurrentUser, useLookups, useNow } from '../../store/hooks';
import { renderTemplate, TEMPLATE_VARIABLES, upcomingReminders } from '../../domain/reminders';
import { formatRelativeDay, formatTime, parseTime, WEEKDAYS, WEEKDAYS_SHORT } from '../../domain/time';
import { formatMoney, formatPhone, onlyDigits, uid } from '../../domain/format';
import { sendReminder, updateBarbershop, updateReminders, upsertBarber, upsertService } from '../../store/actions';
import { Button, Input, Segmented, Toggle, cx } from '../../ui/primitives';
import { useToast } from '../../ui/toast';
import { useWhatsApp } from '../demo/WhatsAppContext';

type Tab = 'lembretes' | 'barbearia' | 'servicos' | 'equipe';

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('aba') as Tab) ?? 'lembretes';
  return (
    <div className="mx-auto max-w-2xl px-5 pt-6 pb-8 sm:px-8 lg:pt-10">
      <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Ajustes</h1>
      <div className="-mx-5 mt-4 overflow-x-auto px-5 no-scrollbar sm:mx-0 sm:px-0">
        <Segmented
          size="sm"
          value={tab}
          onChange={(v) => setParams(v === 'lembretes' ? {} : { aba: v }, { replace: true })}
          options={[
            { value: 'lembretes', label: 'Lembretes' },
            { value: 'barbearia', label: 'Barbearia' },
            { value: 'servicos', label: 'Serviços' },
            { value: 'equipe', label: 'Equipe' },
          ]}
        />
      </div>
      <div className="mt-6">
        {tab === 'lembretes' && <RemindersTab />}
        {tab === 'barbearia' && <ShopTab />}
        {tab === 'servicos' && <ServicesTab />}
        {tab === 'equipe' && <TeamTab />}
      </div>
    </div>
  );
}

/* ─────────────────────────── Lembretes ─────────────────────────── */

function RemindersTab() {
  const { db } = useCurrentUser();
  const now = useNow(db);
  const lookups = useLookups(db);
  const toast = useToast();
  const whatsapp = useWhatsApp();
  const r = db.reminders;
  const [t24, setT24] = useState(r.template24h);
  const [t2, setT2] = useState(r.template2h);
  const scheduled = useMemo(() => upcomingReminders(db, now), [db, now]);
  // Exemplo: próximo atendimento de amanhã (ou qualquer próximo).
  const sample =
    scheduled.find((s) => s.kind === 'reminder_24h')?.appointment ?? scheduled[0]?.appointment ?? db.appointments.find((a) => a.date >= now.date);
  const dirty = t24 !== r.template24h || t2 !== r.template2h;

  return (
    <div className="space-y-6">
      <section className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {(
          [
            ['enabled24h', 'Lembrete 24h antes', 'Pede confirmação de presença na véspera.'],
            ['enabled2h', 'Lembrete 2h antes', 'Reduz atrasos e faltas no dia.'],
            ['sendBookingReceipt', 'Recibo da reserva', 'Mensagem automática assim que o cliente agenda.'],
          ] as const
        ).map(([key, label, hint]) => (
          <div key={key} className="flex items-center gap-4 px-5 py-4">
            <div className="flex-1">
              <p className="font-semibold">{label}</p>
              <p className="text-sm text-muted">{hint}</p>
            </div>
            <span className={cx('text-xs font-bold tracking-[0.08em]', r[key] ? 'text-ok' : 'text-faint')}>{r[key] ? 'ATIVADO' : 'DESATIVADO'}</span>
            <Toggle label={label} checked={r[key]} onChange={(v) => updateReminders({ [key]: v })} />
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">Mensagens</h2>
        {(
          [
            ['Lembrete 24h', t24, setT24],
            ['Lembrete 2h', t2, setT2],
          ] as const
        ).map(([label, value, set]) => (
          <div key={label} className="mb-4">
            <label className="mb-1.5 block text-sm font-medium">{label}</label>
            <textarea
              value={value}
              onChange={(e) => set(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-line-strong bg-surface px-4 py-3 outline-none focus:border-ink"
            />
            {sample && (
              <div className="mt-2 rounded-2xl bg-[#ece8e1] p-3">
                <p className="w-fit max-w-[90%] rounded-xl rounded-tl-sm bg-white px-3 py-2 text-[15px] leading-snug shadow-sm">
                  {renderTemplate(db, value, sample, now.date)}
                </p>
              </div>
            )}
          </div>
        ))}
        <p className="text-sm text-muted">
          Variáveis: {TEMPLATE_VARIABLES.map((v) => <code key={v} className="mr-1.5 rounded bg-ink/[0.06] px-1.5 py-0.5 text-[13px]">{v}</code>)}
        </p>
        <Button
          className="mt-4"
          disabled={!dirty}
          onClick={() => {
            updateReminders({ template24h: t24, template2h: t2 });
            toast('Mensagens salvas');
          }}
        >
          <Check size={17} /> Salvar mensagens
        </Button>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">Próximos envios</h2>
          <span className="text-xs text-muted">simulado</span>
        </div>
        {scheduled.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong px-5 py-6 text-center text-muted">Nenhum lembrete programado.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {scheduled.slice(0, 12).map((s) => {
              const a = s.appointment;
              const customer = lookups.customer(a.customerId);
              return (
                <li key={`${a.id}-${s.kind}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{customer?.name}</p>
                    <p className="truncate text-sm text-muted">
                      {s.kind === 'reminder_24h' ? '24h' : '2h'} · atendimento {formatRelativeDay(a.date, now.date).toLowerCase()} às {formatTime(a.startMin)}
                    </p>
                  </div>
                  {s.sent ? (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-ok">
                      <Check size={14} strokeWidth={3} /> Enviado
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        sendReminder(a.id, s.kind);
                        toast(`Lembrete enviado para ${customer?.name.split(' ')[0]}`);
                      }}
                    >
                      <Send size={14} /> {s.dueInMin <= 0 ? 'Enviar' : 'Enviar agora'}
                    </Button>
                  )}
                  {s.sent && (
                    <button onClick={() => whatsapp.open(a.customerId)} className="text-sm font-medium text-muted underline-offset-2 hover:underline">
                      ver
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ─────────────────────────── Barbearia ─────────────────────────── */

function ShopTab() {
  const { db } = useCurrentUser();
  const toast = useToast();
  const [form, setForm] = useState<Barbershop>(db.barbershop);
  const set = <K extends keyof Barbershop>(k: K, v: Barbershop[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setHours = (d: Weekday, patch: Partial<Barbershop['hours'][Weekday]>) =>
    setForm((f) => ({ ...f, hours: { ...f.hours, [d]: { ...f.hours[d], ...patch } } }));

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        updateBarbershop({ ...form, phone: onlyDigits(form.phone) });
        toast('Dados da barbearia atualizados — já aparecem na página pública');
      }}
    >
      <section className="space-y-4">
        <Input label="Nome da barbearia" value={form.name} onChange={(e) => set('name', e.target.value)} />
        <Input label="Endereço" value={form.address} onChange={(e) => set('address', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Bairro" value={form.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} />
          <Input label="Cidade" value={form.city} onChange={(e) => set('city', e.target.value)} />
        </div>
        <Input label="Telefone / WhatsApp" inputMode="tel" value={formatPhone(form.phone)} onChange={(e) => set('phone', e.target.value)} />
        <Input
          label="Antecedência mínima para reservas (min)"
          type="number"
          min={0}
          step={5}
          value={form.minLeadMinutes}
          onChange={(e) => set('minLeadMinutes', Math.max(0, Number(e.target.value)))}
        />
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">Horário de funcionamento</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {([1, 2, 3, 4, 5, 6, 0] as Weekday[]).map((d) => {
            const h = form.hours[d];
            return (
              <li key={d} className="flex items-center gap-3 px-4 py-3">
                <span className="w-24 font-medium">{WEEKDAYS[d].replace('-feira', '')}</span>
                {h.closed ? (
                  <span className="flex-1 text-muted">Fechado</span>
                ) : (
                  <span className="flex flex-1 items-center gap-2">
                    <TimeInput value={h.open} onChange={(v) => setHours(d, { open: v })} />
                    <span className="text-muted">–</span>
                    <TimeInput value={h.close} onChange={(v) => setHours(d, { close: v })} />
                  </span>
                )}
                <Toggle label={`Aberto ${WEEKDAYS[d]}`} checked={!h.closed} onChange={(v) => setHours(d, { closed: !v })} />
              </li>
            );
          })}
        </ul>
      </section>
      <Button type="submit" size="lg">
        <Check size={18} /> Salvar alterações
      </Button>
    </form>
  );
}

function TimeInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="time"
      step={900}
      value={formatTime(value)}
      onChange={(e) => e.target.value && onChange(parseTime(e.target.value))}
      className="h-10 w-[96px] rounded-lg border border-line-strong bg-surface px-2 text-center tabular outline-none focus:border-ink"
    />
  );
}

/* ─────────────────────────── Serviços ─────────────────────────── */

function ServicesTab() {
  const { db } = useCurrentUser();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Service[]>(db.services);
  const update = (id: string, patch: Partial<Service>) => setDrafts((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const changed = drafts.filter((d) => JSON.stringify(d) !== JSON.stringify(db.services.find((s) => s.id === d.id)));

  return (
    <div className="space-y-4">
      {drafts.map((s) => (
        <div key={s.id} className={cx('rounded-2xl border border-line bg-surface p-4', !s.active && 'opacity-60')}>
          <div className="flex items-center gap-3">
            <input
              value={s.name}
              onChange={(e) => update(s.id, { name: e.target.value })}
              className="h-11 flex-1 rounded-lg border border-transparent px-2 text-[17px] font-semibold outline-none hover:border-line focus:border-ink"
              aria-label="Nome do serviço"
            />
            <Toggle label={`Ativo: ${s.name}`} checked={s.active} onChange={(v) => update(s.id, { active: v })} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="text-sm text-muted">
              Preço (R$)
              <input
                type="number"
                min={0}
                value={s.priceCents / 100}
                onChange={(e) => update(s.id, { priceCents: Math.round(Number(e.target.value) * 100) })}
                className="mt-1 h-11 w-full rounded-lg border border-line-strong px-3 text-ink tabular outline-none focus:border-ink"
              />
            </label>
            <label className="text-sm text-muted">
              Duração (min)
              <input
                type="number"
                min={10}
                step={5}
                value={s.durationMin}
                onChange={(e) => update(s.id, { durationMin: Math.max(5, Number(e.target.value)) })}
                className="mt-1 h-11 w-full rounded-lg border border-line-strong px-3 text-ink tabular outline-none focus:border-ink"
              />
            </label>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() =>
            setDrafts((list) => [
              ...list,
              { id: uid('svc'), barbershopId: db.barbershop.id, name: 'Novo serviço', description: '', priceCents: 4000, durationMin: 30, active: true },
            ])
          }
        >
          <Plus size={17} /> Adicionar serviço
        </Button>
        <Button
          disabled={changed.length === 0}
          onClick={() => {
            changed.forEach(upsertService);
            toast(`${changed.length} serviço(s) salvo(s). Agendamentos já marcados mantêm o preço original.`);
          }}
        >
          <Check size={17} /> Salvar serviços
        </Button>
      </div>
      <p className="text-sm text-muted">Preview: {drafts.filter((s) => s.active).map((s) => `${s.name} ${formatMoney(s.priceCents)}`).join(' · ')}</p>
    </div>
  );
}

/* ─────────────────────────── Equipe ─────────────────────────── */

function TeamTab() {
  const { db } = useCurrentUser();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Barber[]>(db.barbers);
  const update = (id: string, patch: Partial<Barber>) => setDrafts((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const changed = drafts.filter((d) => JSON.stringify(d) !== JSON.stringify(db.barbers.find((b) => b.id === d.id)));

  return (
    <div className="space-y-4">
      {drafts.map((b) => (
        <div key={b.id} className={cx('rounded-2xl border border-line bg-surface p-4', !b.active && 'opacity-60')}>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <input
                value={b.name}
                onChange={(e) => update(b.id, { name: e.target.value, initials: e.target.value.slice(0, 2).toUpperCase() })}
                className="h-10 w-full rounded-lg border border-transparent px-2 text-[17px] font-semibold outline-none hover:border-line focus:border-ink"
                aria-label="Nome"
              />
              <input
                value={b.specialty}
                onChange={(e) => update(b.id, { specialty: e.target.value })}
                className="h-9 w-full rounded-lg border border-transparent px-2 text-sm text-muted outline-none hover:border-line focus:border-ink"
                aria-label="Especialidade"
              />
            </div>
            <Toggle label={`Ativo: ${b.name}`} checked={b.active} onChange={(v) => update(b.id, { active: v })} />
          </div>
          <p className="mt-3 mb-1.5 text-sm text-muted">Dias de trabalho</p>
          <div className="flex gap-1.5">
            {([1, 2, 3, 4, 5, 6, 0] as Weekday[]).map((d) => {
              const on = b.workdays.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => update(b.id, { workdays: on ? b.workdays.filter((x) => x !== d) : [...b.workdays, d] })}
                  className={cx('h-10 flex-1 rounded-lg text-[13px] font-semibold', on ? 'bg-ink text-white' : 'bg-ink/[0.05] text-muted')}
                  aria-pressed={on}
                >
                  {WEEKDAYS_SHORT[d]}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-muted">Almoço</span>
            <TimeInput value={b.breakStart ?? 720} onChange={(v) => update(b.id, { breakStart: v })} />
            <span className="text-muted">–</span>
            <TimeInput value={b.breakEnd ?? 780} onChange={(v) => update(b.id, { breakEnd: v })} />
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() =>
            setDrafts((list) => [
              ...list,
              {
                id: uid('barber'),
                barbershopId: db.barbershop.id,
                name: 'Novo barbeiro',
                specialty: 'Cortes',
                initials: 'NB',
                active: true,
                workdays: [1, 2, 3, 4, 5, 6],
                breakStart: 720,
                breakEnd: 780,
              },
            ])
          }
        >
          <Plus size={17} /> Adicionar profissional
        </Button>
        <Button
          disabled={changed.length === 0}
          onClick={() => {
            changed.forEach(upsertBarber);
            toast('Equipe atualizada — disponibilidade recalculada');
          }}
        >
          <Check size={17} /> Salvar equipe
        </Button>
      </div>
    </div>
  );
}
