/** Lembra nome/telefone do cliente neste aparelho (conveniência; não é fonte de verdade). */
const KEY = 'cadeira:client-profile';

export interface ClientProfile {
  name: string;
  phone: string;
}

export function loadProfile(): ClientProfile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ClientProfile;
  } catch {
    /* ignora */
  }
  return { name: '', phone: '' };
}

export function saveProfile(profile: ClientProfile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* ignora */
  }
}
