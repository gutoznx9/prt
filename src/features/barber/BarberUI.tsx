import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { DateKey, ID, Minutes } from '../../domain/types';
import { AppointmentSheet } from './AppointmentSheet';
import { OfferSheet } from './OfferSheet';
import { CustomerSheet } from './CustomerSheet';

export interface OfferTarget {
  barberId: ID;
  date: DateKey;
  startMin: Minutes;
  sourceAppointmentId: ID | null;
  /** Clientes pré-selecionados além da lista de espera */
  preselect?: ID[];
}

interface BarberUI {
  openAppointment: (id: ID) => void;
  openOffer: (target: OfferTarget) => void;
  openCustomer: (id: ID) => void;
}

const Ctx = createContext<BarberUI>({ openAppointment: () => {}, openOffer: () => {}, openCustomer: () => {} });

/** Folhas (bottom sheets) compartilhadas por todas as telas do painel. */
export function BarberUIProvider({ children }: { children: ReactNode }) {
  const [appointmentId, setAppointmentId] = useState<ID | null>(null);
  const [offer, setOffer] = useState<OfferTarget | null>(null);
  const [customerId, setCustomerId] = useState<ID | null>(null);

  const openAppointment = useCallback((id: ID) => {
    setCustomerId(null);
    setAppointmentId(id);
  }, []);
  const openOffer = useCallback((target: OfferTarget) => {
    setAppointmentId(null);
    setOffer(target);
  }, []);
  const openCustomer = useCallback((id: ID) => {
    setAppointmentId(null);
    setCustomerId(id);
  }, []);
  const api = useMemo(() => ({ openAppointment, openOffer, openCustomer }), [openAppointment, openOffer, openCustomer]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {appointmentId && <AppointmentSheet id={appointmentId} onClose={() => setAppointmentId(null)} />}
      {offer && <OfferSheet key={`${offer.barberId}-${offer.date}-${offer.startMin}`} target={offer} onClose={() => setOffer(null)} />}
      {customerId && <CustomerSheet id={customerId} onClose={() => setCustomerId(null)} />}
    </Ctx.Provider>
  );
}

export function useBarberUI() {
  return useContext(Ctx);
}
