import type { DateKey, Minutes, Weekday } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // meio-dia evita surpresas com horário de verão
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((parseDateKey(a).getTime() - parseDateKey(b).getTime()) / 86_400_000);
}

export function weekdayOf(key: DateKey): Weekday {
  return parseDateKey(key).getDay() as Weekday;
}

export function formatTime(min: Minutes): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function parseTime(value: string): Minutes {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${pad(m)}` : `${h}h`;
}

export const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "6 de outubro" */
export function formatDayMonth(key: DateKey): string {
  const d = parseDateKey(key);
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

/** "Segunda-feira, 6 de outubro" */
export function formatLongDate(key: DateKey): string {
  return `${WEEKDAYS[weekdayOf(key)]}, ${formatDayMonth(key)}`;
}

/** "28/09/2026" */
export function formatShortDate(key: DateKey): string {
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

/** "Hoje", "Amanhã", "Sábado, 10 de outubro" */
export function formatRelativeDay(key: DateKey, today: DateKey): string {
  const diff = diffDays(key, today);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  return `${WEEKDAYS[weekdayOf(key)]}, ${formatDayMonth(key)}`;
}

export function greeting(min: Minutes): string {
  if (min < 12 * 60) return 'Bom dia';
  if (min < 18 * 60) return 'Boa tarde';
  return 'Boa noite';
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
