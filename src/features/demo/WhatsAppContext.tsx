import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ID } from '../../domain/types';
import { getState } from '../../store/store';
import { onlyDigits } from '../../domain/format';
import { loadProfile } from '../client/profile';
import { WhatsAppSimulator } from './WhatsAppSimulator';

interface WhatsAppApi {
  /** Abre o celular simulado de um cliente (ou a lista de conversas). */
  open: (customerId?: ID | null) => void;
  /** Abre a conversa do cliente que está usando este aparelho, se conhecido. */
  openAsCustomer: (customerId?: ID | null) => void;
  close: () => void;
}

const Ctx = createContext<WhatsAppApi>({ open: () => {}, openAsCustomer: () => {}, close: () => {} });

export function WhatsAppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; customerId: ID | null }>({ open: false, customerId: null });

  const open = useCallback((customerId?: ID | null) => setState({ open: true, customerId: customerId ?? null }), []);
  const openAsCustomer = useCallback((customerId?: ID | null) => {
    if (customerId) return setState({ open: true, customerId });
    const phone = onlyDigits(loadProfile().phone);
    const known = phone ? getState().customers.find((c) => c.phone === phone) : undefined;
    setState({ open: true, customerId: known?.id ?? null });
  }, []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const api = useMemo(() => ({ open, openAsCustomer, close }), [open, openAsCustomer, close]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <WhatsAppSimulator
        open={state.open}
        customerId={state.customerId}
        onSelect={(id) => setState({ open: true, customerId: id })}
        onClose={close}
      />
    </Ctx.Provider>
  );
}

export function useWhatsApp() {
  return useContext(Ctx);
}
