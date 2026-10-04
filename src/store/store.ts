import { useSyncExternalStore } from 'react';
import type { Database } from '../domain/types';
import { toDateKey } from '../domain/time';
import { SCHEMA_VERSION, createSeed } from '../data/seed';

/**
 * Store local do protótipo.
 *
 * Toda leitura/escrita passa por aqui, então trocar por Supabase significa substituir
 * `load`/`persist` por chamadas à API + Realtime — os componentes não mudam.
 * O evento `storage` sincroniza abas abertas (ex.: cliente no celular, barbeiro no notebook).
 */

const STORAGE_KEY = 'cadeira:barber-lab:db';
type Listener = () => void;

const listeners = new Set<Listener>();
let state: Database = load();

function readStorage(): Database | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Database) : null;
  } catch {
    return null;
  }
}

function load(): Database {
  const stored = readStorage();
  const today = toDateKey(new Date());
  // Dados de demonstração são relativos a "hoje": regeneramos quando o dia muda.
  if (stored && stored.schemaVersion === SCHEMA_VERSION && stored.seededFor === today) return stored;
  const fresh = createSeed();
  persist(fresh);
  return fresh;
}

function persist(db: Database) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Sem armazenamento (aba privada etc.) — o protótipo segue funcionando em memória.
  }
}

function emit() {
  for (const l of listeners) l();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const next = JSON.parse(event.newValue) as Database;
      if (next.rev !== state.rev) {
        state = next;
        emit();
      }
    } catch {
      /* ignora */
    }
  });
}

export function getState(): Database {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Aplica uma mutação em uma cópia do estado (transação).
 * Antes de escrever, relê o armazenamento para não sobrescrever a escrita de outra aba.
 */
export function transact<T>(mutate: (draft: Database) => T): T {
  const latest = readStorage();
  const base = latest && latest.rev > state.rev && latest.schemaVersion === SCHEMA_VERSION ? latest : state;
  const draft = structuredClone(base);
  const result = mutate(draft);
  draft.rev = base.rev + 1;
  state = draft;
  persist(draft);
  emit();
  return result;
}

export function resetDatabase() {
  state = createSeed();
  persist(state);
  emit();
}

export function useDB(): Database {
  return useSyncExternalStore(subscribe, getState, getState);
}
