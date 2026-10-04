export function formatMoney(cents: number, opts: { compact?: boolean } = {}): string {
  const value = cents / 100;
  if (opts.compact || Number.isInteger(value)) {
    return `R$ ${Math.round(value).toLocaleString('pt-BR')}`;
  }
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** (11) 98765-4321 */
export function formatPhone(digits: string): string {
  const d = onlyDigits(digits).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidPhone(value: string): boolean {
  const d = onlyDigits(value);
  return d.length === 10 || d.length === 11;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

let counter = 0;
export function uid(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${counter.toString(36)}`;
}
