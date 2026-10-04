import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight, Users } from 'lucide-react';
import type { DateKey, ID, Minutes } from '../../domain/types';
import { useDB } from '../../store/store';
import { useLookups, useNow } from '../../store/hooks';
import { getSlots, type Slot } from '../../domain/availability';
import { addDays, formatDuration, formatLongDate, formatRelativeDay, formatTime, parseDateKey, WEEKDAYS_SHORT } from '../../domain/time';
import { formatMoney, formatPhone, isValidPhone } from '../../domain/format';
import { bookAppointment } from '../../store/actions';
import { Avatar, Button, Input, cx } from '../../ui/primitives';
import { BarberLabMark } from '../../ui/brand';
import { loadProfile, saveProfile } from './profile';
import { WaitlistSheet } from './WaitlistSheet';

type Step = 'service' | 'barber' | 'time' | 'details' | 'review';
const STEPS: Step[] = ['service', 'barber', 'time', 'details', 'review'];
const STEP_TITLE: Record<Step, string> = {
  service: 'Escolha o serviço',
  barber: 'Com quem?',
  time: 'Escolha o dia e o horário',
  details: 'Seus dados',
  review: 'Confira e confirme',
};
const ANY = 'any';
const DAYS_AHEAD = 14;

export function BookingFlow() {
  const db = useDB();
  const now = useNow(db);
  const lookups = useLookups(db);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const initialService = params.get('servico');
  const initialBarber = params.get('barbeiro');
  const [serviceId, setServiceId] = useState<ID | null>(initialService);
  const [barberChoice, setBarberChoice] = useState<ID | null>(initialBarber); // ID ou ANY
  const [step, setStep] = useState<Step>(initialService ? (initialBarber ? 'time' : 'barber') : 'service');
  const [date, setDate] = useState<DateKey>(now.date);
  const [startMin, setStartMin] = useState<Minutes | null>(null);
  const [profile, setProfile] = useState(loadProfile);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [waitlist, setWaitlist] = useState<{ startMin: Minutes | null } | null>(null);

  const service = lookups.service(serviceId);
  const barberId = barberChoice && barberChoice !== ANY ? barberChoice : null;
  const barber = lookups.barber(barberId);
  const services = db.services.filter((s) => s.active);
  const barbers = db.barbers.filter((b) => b.active);

  const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(now.date, i)), [now.date]);
  const dayAvailability = useMemo(() => {
    if (!service) return {};
    return Object.fromEntries(
      days.map((d) => {
        const slots = getSlots(db, { barberId, date: d, durationMin: service.durationMin }, now);
        return [d, { total: slots.length, free: slots.filter((s) => s.status === 'available').length }];
      }),
    ) as Record<DateKey, { total: number; free: number }>;
  }, [db, days, barberId, service, now]);

  const slots: Slot[] = useMemo(
    () => (service ? getSlots(db, { barberId, date, durationMin: service.durationMin }, now) : []),
    [db, barberId, date, service, now],
  );
  const selectedSlot = slots.find((s) => s.startMin === startMin && s.status === 'available');
  // Se outra pessoa reservou o horário enquanto este cliente decidia, a seleção cai.
  const effectiveStart = selectedSlot ? startMin : null;

  const stepIndex = STEPS.indexOf(step);
  const go = (s: Step) => {
    setError(null);
    setStep(s);
    window.scrollTo({ top: 0 });
  };
  const back = () => {
    if (stepIndex === 0) return navigate('/');
    if (step === 'time' && initialBarber && initialService) return navigate('/');
    go(STEPS[stepIndex - 1]);
  };

  const nameError = touched && profile.name.trim().length < 2 ? 'Informe seu nome' : undefined;
  const phoneError = touched && !isValidPhone(profile.phone) ? 'Telefone com DDD, ex.: (11) 98765-4321' : undefined;

  const confirm = () => {
    if (!service || effectiveStart == null) return;
    setSubmitting(true);
    const result = bookAppointment({
      serviceId: service.id,
      barberId,
      date,
      startMin: effectiveStart,
      customerName: profile.name,
      phone: profile.phone,
      source: 'online',
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      setStartMin(null);
      go('time');
      setError(result.error);
      return;
    }
    saveProfile(profile);
    navigate(`/agendado/${result.value.id}`, { replace: true });
  };

  const periods = useMemo(() => {
    const groups: Array<{ label: string; slots: Slot[] }> = [
      { label: 'Manhã', slots: [] },
      { label: 'Tarde', slots: [] },
      { label: 'Noite', slots: [] },
    ];
    for (const s of slots) groups[s.startMin < 720 ? 0 : s.startMin < 1080 ? 1 : 2].slots.push(s);
    return groups.filter((g) => g.slots.length);
  }, [slots]);
  const freeCount = slots.filter((s) => s.status === 'available').length;

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-10 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-3 sm:px-6">
          <button onClick={back} className="grid size-10 place-items-center rounded-full hover:bg-ink/5" aria-label="Voltar">
            <ArrowLeft size={20} />
          </button>
          <BarberLabMark size="sm" />
          <span className="ml-auto text-sm text-muted tabular">
            {stepIndex + 1} de {STEPS.length}
          </span>
        </div>
        <div className="h-0.5 bg-line">
          <div className="h-full bg-ink transition-all duration-300" style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 pt-6 pb-40 sm:px-6">
        <h1 className="mb-6 text-[28px] leading-tight font-semibold tracking-[-0.03em]">{STEP_TITLE[step]}</h1>

        {step === 'service' && (
          <ul className="space-y-3">
            {services.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => {
                    setServiceId(s.id);
                    setStartMin(null);
                    go(barberChoice ? 'time' : 'barber');
                  }}
                  className={cx(
                    'flex w-full items-center gap-4 rounded-2xl border bg-surface px-5 py-4 text-left transition-colors hover:border-ink',
                    s.id === serviceId ? 'border-ink ring-1 ring-ink' : 'border-line',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[17px] font-semibold">{s.name}</p>
                    <p className="text-sm text-muted">{formatDuration(s.durationMin)}</p>
                  </div>
                  <p className="text-[17px] font-semibold tabular">{formatMoney(s.priceCents)}</p>
                  <ChevronRight size={18} className="text-faint" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {step === 'barber' && (
          <ul className="space-y-3">
            <li>
              <button
                onClick={() => {
                  setBarberChoice(ANY);
                  setStartMin(null);
                  go('time');
                }}
                className={cx(
                  'flex w-full items-center gap-4 rounded-2xl border bg-surface px-5 py-4 text-left hover:border-ink',
                  barberChoice === ANY ? 'border-ink ring-1 ring-ink' : 'border-line',
                )}
              >
                <span className="grid size-12 place-items-center rounded-full border border-dashed border-line-strong text-muted">
                  <Users size={20} />
                </span>
                <div className="flex-1">
                  <p className="text-[17px] font-semibold">Sem preferência</p>
                  <p className="text-sm text-muted">Mais horários disponíveis</p>
                </div>
                <ChevronRight size={18} className="text-faint" />
              </button>
            </li>
            {barbers.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => {
                    setBarberChoice(b.id);
                    setStartMin(null);
                    go('time');
                  }}
                  className={cx(
                    'flex w-full items-center gap-4 rounded-2xl border bg-surface px-5 py-4 text-left hover:border-ink',
                    barberChoice === b.id ? 'border-ink ring-1 ring-ink' : 'border-line',
                  )}
                >
                  <Avatar label={b.initials} size={48} tone="dark" />
                  <div className="flex-1">
                    <p className="text-[17px] font-semibold">{b.name}</p>
                    <p className="text-sm text-muted">{b.specialty}</p>
                  </div>
                  <ChevronRight size={18} className="text-faint" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {step === 'time' && service && (
          <div>
            {error && <p className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-sm font-medium text-bad">{error}</p>}
            <div className="-mx-5 mb-6 flex gap-2 overflow-x-auto px-5 pb-1 no-scrollbar sm:-mx-6 sm:px-6" role="listbox" aria-label="Datas">
              {days.map((d) => {
                const info = dayAvailability[d];
                const closed = !info || info.total === 0;
                const full = !closed && info.free === 0;
                const selected = d === date;
                return (
                  <button
                    key={d}
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setDate(d);
                      setStartMin(null);
                      setError(null);
                    }}
                    className={cx(
                      'flex w-[68px] shrink-0 flex-col items-center rounded-2xl border py-2.5 transition-colors',
                      selected ? 'border-ink bg-ink text-white' : 'border-line bg-surface hover:border-ink',
                      closed && !selected && 'opacity-50',
                    )}
                  >
                    <span className={cx('text-xs font-medium', selected ? 'text-white/70' : 'text-muted')}>
                      {d === now.date ? 'Hoje' : WEEKDAYS_SHORT[parseDateKey(d).getDay()]}
                    </span>
                    <span className="font-condensed text-2xl font-bold tabular">{parseDateKey(d).getDate()}</span>
                    <span className={cx('text-[11px] font-medium', selected ? 'text-brass-300' : full ? 'text-bad' : 'text-muted')}>
                      {closed ? 'Fechado' : full ? 'Lotado' : `${info.free} livres`}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="mb-4 text-[15px] text-muted">
              {formatLongDate(date)} · {service.name} · {barber ? barber.name : 'qualquer profissional'}
            </p>

            {slots.length === 0 && (
              <div className="rounded-2xl border border-dashed border-line-strong px-5 py-8 text-center">
                <p className="font-semibold">Sem atendimento neste dia</p>
                <p className="mt-1 text-sm text-muted">Escolha outra data.</p>
              </div>
            )}
            {slots.length > 0 && freeCount === 0 && (
              <div className="mb-6 rounded-2xl border border-line bg-surface px-5 py-5">
                <p className="font-semibold">Dia lotado</p>
                <p className="mt-1 text-sm text-muted">Entre na lista de espera e avisamos pelo WhatsApp se alguém desmarcar.</p>
                <Button className="mt-4" variant="primary" onClick={() => setWaitlist({ startMin: null })}>
                  Me avise se aparecer um horário
                </Button>
              </div>
            )}

            <div className="space-y-6">
              {periods.map((p) => (
                <section key={p.label}>
                  <h3 className="mb-2.5 text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">{p.label}</h3>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {p.slots.map((s) => {
                      const busy = s.status === 'busy';
                      const selected = s.startMin === effectiveStart;
                      return (
                        <button
                          key={s.startMin}
                          onClick={() => (busy ? setWaitlist({ startMin: s.startMin }) : setStartMin(s.startMin))}
                          aria-pressed={selected}
                          aria-label={`${formatTime(s.startMin)}${busy ? ' — ocupado' : ''}`}
                          className={cx(
                            'h-12 rounded-xl border text-[15px] font-semibold tabular transition-colors',
                            busy && 'border-transparent bg-ink/[0.04] text-faint line-through decoration-faint/60',
                            !busy && !selected && 'border-line-strong bg-surface hover:border-ink',
                            selected && 'border-ink bg-ink text-white',
                          )}
                        >
                          {formatTime(s.startMin)}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            {freeCount > 0 && slots.some((s) => s.status === 'busy') && (
              <p className="mt-5 text-sm text-muted">
                Horários riscados estão ocupados — toque em um deles para entrar na lista de espera.
              </p>
            )}
          </div>
        )}

        {step === 'details' && (
          <form
            id="details-form"
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (profile.name.trim().length >= 2 && isValidPhone(profile.phone)) go('review');
            }}
          >
            <Input
              label="Nome"
              autoComplete="name"
              placeholder="Como devemos te chamar?"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              error={nameError}
            />
            <Input
              label="WhatsApp"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(11) 98765-4321"
              value={formatPhone(profile.phone)}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              error={phoneError}
              hint="Confirmação e lembrete chegam por aqui. Sem spam."
            />
          </form>
        )}

        {step === 'review' && service && effectiveStart != null && (
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="bg-ink px-5 py-5 text-white">
              <p className="text-sm text-white/60">{formatRelativeDay(date, now.date)}</p>
              <p className="font-condensed text-5xl font-bold tabular">{formatTime(effectiveStart)}</p>
              <p className="mt-1 text-white/80">
                até {formatTime(effectiveStart + service.durationMin)} · {formatLongDate(date)}
              </p>
            </div>
            <dl className="divide-y divide-line">
              {[
                ['Serviço', service.name],
                ['Profissional', barber?.name ?? `${lookups.barber(selectedSlot?.barberIds[0])?.name ?? ''} (sem preferência)`],
                ['Valor', `${formatMoney(service.priceCents)} · pago na barbearia`],
                ['Nome', profile.name],
                ['WhatsApp', formatPhone(profile.phone)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-5 py-3.5 text-[15px]">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {step === 'review' && effectiveStart == null && (
          <div className="rounded-2xl bg-bad-soft px-5 py-4 text-bad">
            Esse horário acabou de ser ocupado.{' '}
            <button className="font-semibold underline" onClick={() => go('time')}>
              Escolher outro
            </button>
          </div>
        )}
      </main>

      {/* Barra de ação fixa */}
      {(step === 'time' || step === 'details' || step === 'review') && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur pb-safe">
          <div className="mx-auto flex max-w-2xl items-center gap-4 px-5 py-3 sm:px-6">
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-semibold">{service?.name}</p>
              <p className="truncate text-muted">
                {effectiveStart != null
                  ? `${formatRelativeDay(date, now.date)} · ${formatTime(effectiveStart)} · ${barber?.name ?? 'Sem preferência'}`
                  : 'Escolha um horário'}
              </p>
            </div>
            {step === 'time' && (
              <Button size="lg" disabled={effectiveStart == null} onClick={() => go('details')}>
                Continuar
              </Button>
            )}
            {step === 'details' && (
              <Button size="lg" type="submit" form="details-form">
                Revisar
              </Button>
            )}
            {step === 'review' && (
              <Button size="lg" variant="brass" disabled={effectiveStart == null || submitting} onClick={confirm}>
                <Check size={18} /> Confirmar
              </Button>
            )}
          </div>
        </div>
      )}

      {waitlist && service && (
        <WaitlistSheet
          open
          onClose={() => setWaitlist(null)}
          date={date}
          serviceId={service.id}
          barberId={barberId}
          desiredStart={waitlist.startMin}
        />
      )}
    </div>
  );
}
