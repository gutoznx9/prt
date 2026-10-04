import { useEffect, useMemo, useState } from 'react';
import type { Barber, Customer, Database, ID, Service, User } from '../domain/types';
import { getNow, type Clock } from '../domain/availability';
import { useDB } from './store';

/** "Agora" do protótipo; com relógio real, re-renderiza a cada 30s. */
export function useNow(db: Database): Clock {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (db.demo.clock !== 'real') return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [db.demo.clock]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getNow(db), [db, tick]);
}

export interface Lookups {
  barber: (id: ID | null | undefined) => Barber | undefined;
  service: (id: ID | null | undefined) => Service | undefined;
  customer: (id: ID | null | undefined) => Customer | undefined;
}

export function useLookups(db: Database): Lookups {
  return useMemo(() => {
    const barbers = new Map(db.barbers.map((b) => [b.id, b]));
    const services = new Map(db.services.map((s) => [s.id, s]));
    const customers = new Map(db.customers.map((c) => [c.id, c]));
    return {
      barber: (id) => (id ? barbers.get(id) : undefined),
      service: (id) => (id ? services.get(id) : undefined),
      customer: (id) => (id ? customers.get(id) : undefined),
    };
  }, [db.barbers, db.services, db.customers]);
}

export function useCurrentUser(): { db: Database; user: User; barber: Barber } {
  const db = useDB();
  const user = db.users.find((u) => u.id === db.demo.currentUserId) ?? db.users[0];
  const barber = db.barbers.find((b) => b.id === user.barberId) ?? db.barbers[0];
  return { db, user, barber };
}
