import { useState } from 'react';
import { BellRing, Check } from 'lucide-react';
import type { DateKey, ID, Minutes } from '../../domain/types';
import { useDB } from '../../store/store';
import { useLookups, useNow } from '../../store/hooks';
import { getWorkingWindow } from '../../domain/availability';
import { formatRelativeDay, formatTime, weekdayOf } from '../../domain/time';
import { formatPhone, isValidPhone } from '../../domain/format';
import { joinWaitlist } from '../../store/actions';
import { Button, Input, Sheet, cx } from '../../ui/primitives';
import { loadProfile, saveProfile } from './profile';

type WindowChoice = 'around' | 'afternoon' | 'day';

export function WaitlistSheet({
  open,
  onClose,
  date,
  serviceId,
  barberId,
  desiredStart,
}: {
  open: boolean;
  onClose: () => void;
  date: DateKey;
  serviceId: ID;
  barberId: ID | null;
  desiredStart: Minutes | null;
}) {
  const db = useDB();
  const now = useNow(db);
  const lookups = useLookups(db);
  const [profile, setProfile] = useState(loadProfile);
  const [choice, setChoice] = useState<WindowChoice>(desiredStart != null ? 'around' : 'day');
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(false);

  const hours = db.barbershop.hours[weekdayOf(date)];
  const window = barberId ? getWorkingWindow(db, barberId, date) : hours;
  const open_ = window?.open ?? hours.open;
  const close = window?.close ?? hours.close;
  const ranges: Record<WindowChoice, [Minutes, Minutes]> = {
    around: desiredStart != null ? [Math.max(open_, desiredStart - 60), Math.min(close, desiredStart + 60)] : [open_, close],
    afternoon: [Math.max(open_, 12 * 60), close],
    day: [open_, close],
  };
  const service = lookups.service(serviceId);
  const barber = lookups.barber(barberId);
  const valid = profile.name.trim().length >= 2 && isValidPhone(profile.phone);

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    const [fromMin, toMin] = ranges[choice];
    const res = joinWaitlist({ customerName: profile.name, phone: profile.phone, serviceId, barberId, date, fromMin, toMin });
    if (res.ok) {
      saveProfile(profile);
      setDone(true);
    }
  };

  if (done) {
    return (
      <Sheet open={open} onClose={onClose}>
        <div className="py-8 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-ink text-white">
            <Check size={26} strokeWidth={2.5} />
          </span>
          <h2 className="mt-5 text-2xl font-semibold tracking-[-0.02em]">Você está na lista</h2>
          <p className="mx-auto mt-2 max-w-xs text-muted">
            Se um horário abrir {formatRelativeDay(date, now.date).toLowerCase()} entre {formatTime(ranges[choice][0])} e{' '}
            {formatTime(ranges[choice][1])}, você recebe o aviso no WhatsApp. Quem responder primeiro fica com a vaga.
          </p>
          <Button className="mt-6" block size="lg" onClick={onClose}>
            Entendi
          </Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow={desiredStart != null ? 'Horário ocupado' : 'Dia lotado'}
      title={desiredStart != null ? `Esse horário está ocupado.` : 'Me avise se aparecer um horário'}
      footer={
        <Button block size="lg" onClick={submit}>
          <BellRing size={18} /> Entrar na lista de espera
        </Button>
      }
    >
      <p className="text-[15px] text-muted">
        {service?.name} · {barber?.name ?? 'qualquer profissional'} · {formatRelativeDay(date, now.date)}
        {desiredStart != null && ` às ${formatTime(desiredStart)}`}. Cancelamentos acontecem — avisamos você na hora.
      </p>

      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-medium">Que horários servem?</legend>
        <div className="space-y-2">
          {(
            [
              desiredStart != null && ['around', `Por volta das ${formatTime(desiredStart)}`],
              ['afternoon', 'Qualquer horário à tarde'],
              ['day', 'Qualquer horário neste dia'],
            ].filter(Boolean) as Array<[WindowChoice, string]>
          ).map(([value, label]) => (
            <label
              key={value}
              className={cx(
                'flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3.5',
                choice === value ? 'border-ink bg-ink/[0.03]' : 'border-line-strong',
              )}
            >
              <span className="font-medium">{label}</span>
              <span className="text-sm text-muted tabular">
                {formatTime(ranges[value][0])}–{formatTime(ranges[value][1])}
              </span>
              <input type="radio" className="sr-only" name="window" checked={choice === value} onChange={() => setChoice(value)} />
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 space-y-4">
        <Input
          label="Nome"
          value={profile.name}
          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          error={touched && profile.name.trim().length < 2 ? 'Informe seu nome' : undefined}
        />
        <Input
          label="WhatsApp"
          inputMode="tel"
          value={formatPhone(profile.phone)}
          onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
          error={touched && !isValidPhone(profile.phone) ? 'Telefone com DDD' : undefined}
        />
      </div>
    </Sheet>
  );
}
