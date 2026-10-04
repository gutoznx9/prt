import type { Appointment, Barbershop } from '../domain/types';

const pad = (n: number) => String(n).padStart(2, '0');

function stamp(date: string, min: number): string {
  return `${date.replaceAll('-', '')}T${pad(Math.floor(min / 60))}${pad(min % 60)}00`;
}

/** Gera e baixa um arquivo .ics (funciona com Google Agenda, Apple Calendário e Outlook). */
export function downloadIcs(a: Appointment, shop: Barbershop, serviceName: string, barberName: string) {
  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cadeira//Agendamento//PT-BR',
    'BEGIN:VEVENT',
    `UID:${a.id}@cadeira.app`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=${shop.timezone}:${stamp(a.date, a.startMin)}`,
    `DTEND;TZID=${shop.timezone}:${stamp(a.date, a.startMin + a.durationMin)}`,
    `SUMMARY:${serviceName} — ${shop.name}`,
    `DESCRIPTION:${serviceName} com ${barberName}.`,
    `LOCATION:${shop.address}\\, ${shop.neighborhood}\\, ${shop.city}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${shop.name} em 2 horas`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `barber-lab-${a.date}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
