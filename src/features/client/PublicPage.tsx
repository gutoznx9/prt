import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Clock3, MapPin, MessageCircle } from 'lucide-react';
import { useDB } from '../../store/store';
import { useNow } from '../../store/hooks';
import { findNextAvailable } from '../../domain/availability';
import { formatDuration, formatRelativeDay, formatTime, WEEKDAYS } from '../../domain/time';
import { formatMoney, formatPhone } from '../../domain/format';
import type { Weekday } from '../../domain/types';
import { Avatar, Button, cx } from '../../ui/primitives';
import { BarberLabMark, CadeiraLogo } from '../../ui/brand';
import { useWhatsApp } from '../demo/WhatsAppContext';

export function PublicPage() {
  const db = useDB();
  const now = useNow(db);
  const navigate = useNavigate();
  const whatsapp = useWhatsApp();
  const shop = db.barbershop;
  const services = db.services.filter((s) => s.active);
  const barbers = db.barbers.filter((b) => b.active);
  const shortest = Math.min(...services.map((s) => s.durationMin));

  const nextFree = useMemo(() => findNextAvailable(db, { barberId: null, durationMin: shortest }, now), [db, now, shortest]);
  const nextByBarber = useMemo(
    () => Object.fromEntries(barbers.map((b) => [b.id, findNextAvailable(db, { barberId: b.id, durationMin: shortest }, now)])),
    [db, now, barbers, shortest],
  );

  const todayHours = shop.hours[new Date().getDay() as Weekday];
  const isOpen = !todayHours.closed && now.minutes >= todayHours.open && now.minutes < todayHours.close;
  const todayIdx = new Date().getDay();

  return (
    <div className="min-h-dvh bg-paper">
      {/* Cabeçalho da barbearia */}
      <header className="bg-ink text-white">
        <div className="mx-auto max-w-5xl px-5 pt-10 pb-8 sm:px-8 sm:pt-16 sm:pb-12">
          <div className="flex items-center gap-2 text-[13px] font-medium text-white/60">
            <span className={cx('size-2 rounded-full', isOpen ? 'bg-emerald-400' : 'bg-white/30')} />
            {todayHours.closed
              ? 'Fechado hoje'
              : isOpen
                ? `Aberto agora · até ${formatTime(todayHours.close)}`
                : now.minutes < todayHours.open
                  ? `Abre hoje às ${formatTime(todayHours.open)}`
                  : 'Fechado agora'}
          </div>
          <h1 className="mt-4">
            <BarberLabMark size="lg" />
          </h1>
          <p className="mt-4 max-w-md text-lg text-white/70">{shop.tagline}</p>

          <div className="mt-6 flex flex-col gap-2 text-[15px] text-white/80 sm:flex-row sm:gap-6">
            <span className="inline-flex items-center gap-2">
              <MapPin size={16} className="text-brass-300" />
              {shop.address} · {shop.neighborhood}
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock3 size={16} className="text-brass-300" />
              {todayHours.closed ? 'Hoje fechado' : `Hoje das ${formatTime(todayHours.open)} às ${formatTime(todayHours.close)}`}
            </span>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button variant="brass" size="lg" onClick={() => navigate('/agendar')} className="sm:w-auto" block>
              Agendar horário <ArrowRight size={18} />
            </Button>
            {nextFree && (
              <p className="text-sm text-white/60 sm:ml-3">
                Próximo horário livre:{' '}
                <span className="font-semibold text-white">
                  {formatRelativeDay(nextFree.date, now.date).toLowerCase()} às {formatTime(nextFree.startMin)}
                </span>
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_320px] lg:gap-14">
        <div className="space-y-10">
          <section aria-labelledby="servicos">
            <h2 id="servicos" className="mb-4 text-[13px] font-semibold tracking-[0.12em] text-muted uppercase">
              Serviços
            </h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {services.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/agendar?servico=${s.id}`}
                    className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-paper"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[17px] font-semibold tracking-[-0.01em]">{s.name}</p>
                      <p className="mt-0.5 text-sm text-muted">{s.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[17px] font-semibold tabular">{formatMoney(s.priceCents)}</p>
                      <p className="text-sm text-muted tabular">{formatDuration(s.durationMin)}</p>
                    </div>
                    <ArrowRight size={18} className="hidden text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink sm:block" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="profissionais">
            <h2 id="profissionais" className="mb-4 text-[13px] font-semibold tracking-[0.12em] text-muted uppercase">
              Profissionais
            </h2>
            <ul className="grid gap-3 sm:grid-cols-3">
              {barbers.map((b) => {
                const next = nextByBarber[b.id];
                return (
                  <li key={b.id}>
                    <Link
                      to={`/agendar?barbeiro=${b.id}`}
                      className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-ink sm:flex-col sm:items-start"
                    >
                      <Avatar label={b.initials} size={48} tone="dark" />
                      <div className="min-w-0">
                        <p className="font-semibold">{b.name}</p>
                        <p className="text-sm text-muted">{b.specialty}</p>
                        <p className="mt-1 text-[13px] font-medium text-brass-700">
                          {next ? `Livre ${formatRelativeDay(next.date, now.date).toLowerCase()} às ${formatTime(next.startMin)}` : 'Agenda cheia esta semana'}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <aside className="space-y-8 lg:sticky lg:top-16 lg:self-start">
          <section aria-labelledby="horarios">
            <h2 id="horarios" className="mb-4 text-[13px] font-semibold tracking-[0.12em] text-muted uppercase">
              Horário de funcionamento
            </h2>
            <dl className="rounded-2xl border border-line bg-surface px-5 py-3">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const h = shop.hours[d as Weekday];
                return (
                  <div key={d} className={cx('flex justify-between py-1.5 text-[15px]', d === todayIdx ? 'font-semibold' : 'text-muted')}>
                    <dt>{WEEKDAYS[d].replace('-feira', '')}</dt>
                    <dd className="tabular">{h.closed ? 'Fechado' : `${formatTime(h.open)} – ${formatTime(h.close)}`}</dd>
                  </div>
                );
              })}
            </dl>
          </section>

          <section className="space-y-3">
            <div className="rounded-2xl border border-line bg-surface px-5 py-4 text-[15px]">
              <p className="font-semibold">{shop.address}</p>
              <p className="text-muted">
                {shop.neighborhood} · {shop.city}
              </p>
              <p className="mt-2 text-muted tabular">{formatPhone(shop.phone)}</p>
            </div>
            <Button variant="secondary" block onClick={() => whatsapp.openAsCustomer()}>
              <MessageCircle size={18} /> Falar com a barbearia
            </Button>
          </section>
        </aside>
      </main>

      <footer className="mx-auto flex max-w-5xl items-center justify-between border-t border-line px-5 py-6 text-sm text-muted sm:px-8">
        <span>© {shop.name}</span>
        <span className="inline-flex items-center gap-2">
          Agendamento por <CadeiraLogo />
        </span>
      </footer>
    </div>
  );
}
