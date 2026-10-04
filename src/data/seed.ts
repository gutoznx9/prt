import type {
  Appointment,
  AppointmentSource,
  AppointmentStatus,
  Barber,
  Barbershop,
  Customer,
  Database,
  DateKey,
  ID,
  Minutes,
  Notification,
  Service,
  WaitlistEntry,
  Weekday,
} from '../domain/types';
import { addDays, parseDateKey, parseTime, toDateKey, weekdayOf } from '../domain/time';
import { getBusyIntervals, getWorkingWindow } from '../domain/availability';
import { overlaps } from '../domain/time';

export const SCHEMA_VERSION = 3;
const SHOP_ID = 'shop_barberlab';

/** PRNG determinístico — a demonstração é sempre igual para a mesma data. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const t = parseTime;

function buildBarbershop(): Barbershop {
  const weekday = { open: t('09:00'), close: t('19:00'), closed: false };
  return {
    id: SHOP_ID,
    slug: 'barber-lab',
    name: 'Barber Lab',
    tagline: 'Corte, barba e acabamento sem pressa.',
    address: 'Rua dos Pinheiros, 812',
    neighborhood: 'Pinheiros',
    city: 'São Paulo — SP',
    phone: '11912345678',
    hours: {
      0: { open: t('09:00'), close: t('18:00'), closed: false },
      1: { ...weekday },
      2: { ...weekday },
      3: { ...weekday },
      4: { ...weekday },
      5: { ...weekday },
      6: { open: t('09:00'), close: t('18:00'), closed: false },
    } as Record<Weekday, { open: number; close: number; closed: boolean }>,
    minLeadMinutes: 15,
    timezone: 'America/Sao_Paulo',
  };
}

function buildBarbers(): Barber[] {
  return [
    {
      id: 'barber_carlos',
      barbershopId: SHOP_ID,
      name: 'Carlos',
      specialty: 'Cortes clássicos e barba',
      initials: 'CA',
      active: true,
      workdays: [0, 1, 2, 3, 4, 5, 6],
      breakStart: t('12:00'),
      breakEnd: t('13:00'),
    },
    {
      id: 'barber_diego',
      barbershopId: SHOP_ID,
      name: 'Diego',
      specialty: 'Degradê e navalhado',
      initials: 'DI',
      active: true,
      workdays: [0, 1, 2, 3, 4, 5, 6],
      breakStart: t('12:30'),
      breakEnd: t('13:30'),
    },
    {
      id: 'barber_mateus',
      barbershopId: SHOP_ID,
      name: 'Mateus',
      specialty: 'Barba e acabamento',
      initials: 'MA',
      active: true,
      workdays: [0, 2, 3, 4, 5, 6],
      breakStart: t('13:00'),
      breakEnd: t('14:00'),
    },
  ];
}

function buildServices(): Service[] {
  const s = (id: string, name: string, description: string, price: number, duration: number): Service => ({
    id,
    barbershopId: SHOP_ID,
    name,
    description,
    priceCents: price * 100,
    durationMin: duration,
    active: true,
  });
  return [
    s('svc_corte', 'Corte masculino', 'Tesoura ou máquina, lavagem e finalização.', 45, 45),
    s('svc_corte_barba', 'Corte + barba', 'Corte completo e barba com toalha quente.', 70, 60),
    s('svc_barba', 'Barba', 'Desenho, navalha e hidratação.', 35, 30),
    s('svc_corte_sobrancelha', 'Corte + sobrancelha', 'Corte completo e acabamento na sobrancelha.', 55, 50),
  ];
}

const FIRST = [
  'Gabriel', 'Leonardo', 'Matheus', 'Eduardo', 'Rodrigo', 'Henrique', 'Daniel', 'Fernando', 'Ricardo', 'Paulo',
  'Igor', 'Murilo', 'Otávio', 'Samuel', 'Renan', 'Diogo', 'Arthur', 'Heitor', 'Victor', 'Alexandre',
  'Fábio', 'Guilherme', 'Hugo', 'Júlio', 'Leandro', 'Nicolas', 'Roberto', 'Sérgio', 'Tiago', 'Wesley',
];
const LAST = [
  'Carvalho', 'Gomes', 'Araújo', 'Barbosa', 'Cardoso', 'Teixeira', 'Moreira', 'Nunes', 'Freitas', 'Dias',
  'Castro', 'Pinto', 'Ramos', 'Vieira', 'Monteiro', 'Lopes', 'Correia', 'Batista', 'Farias', 'Campos',
];

/** Clientes com papel no roteiro de demonstração. */
const STORY_CUSTOMERS: Array<[ID, string]> = [
  ['cus_joao', 'João Silva'],
  ['cus_pedro', 'Pedro Santos'],
  ['cus_marcos', 'Marcos Ribeiro'],
  ['cus_andre', 'André Martins'],
  ['cus_rafael', 'Rafael Costa'],
  ['cus_thiago', 'Thiago Pereira'],
  ['cus_vinicius', 'Vinícius Souza'],
  ['cus_bruno', 'Bruno Almeida'],
  ['cus_felipe', 'Felipe Rocha'],
  ['cus_gustavo', 'Gustavo Lima'],
  ['cus_caio', 'Caio Mendes'],
];
const WAITLIST_TODAY = new Set(['cus_bruno', 'cus_felipe', 'cus_gustavo']);

interface CustomerProfile {
  customer: Customer;
  barberId: ID;
  serviceId: ID;
  weight: number;
  /** Clientes "sumidos" param de aparecer depois desta distância (dias atrás) */
  lastSeenDaysAgo: number;
}

function buildCustomers(rand: () => number, today: DateKey, barbers: Barber[], services: Service[]): CustomerProfile[] {
  const names: Array<[ID, string]> = [...STORY_CUSTOMERS];
  const used = new Set(names.map(([, n]) => n));
  let i = 0;
  while (names.length < 170) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]}`;
    i++;
    if (used.has(name)) continue;
    used.add(name);
    names.push([`cus_${names.length.toString().padStart(3, '0')}`, name]);
  }
  const serviceWeights = ['svc_corte', 'svc_corte', 'svc_corte', 'svc_corte_barba', 'svc_corte_barba', 'svc_barba', 'svc_corte_sobrancelha'];
  return names.map(([id, name], idx) => {
    const phone = `119${String(Math.floor(10_000_000 + rand() * 89_999_999)).padStart(8, '0')}`;
    const isStory = idx < STORY_CUSTOMERS.length;
    const barberId = id === 'cus_joao' ? 'barber_carlos' : barbers[Math.floor(rand() * barbers.length)].id;
    const serviceId =
      id === 'cus_joao' ? 'svc_corte_barba' : serviceWeights[Math.floor(rand() * serviceWeights.length)];
    const away = !isStory && rand() < 0.12;
    return {
      customer: {
        id,
        barbershopId: SHOP_ID,
        name,
        phone,
        createdAt: `${addDays(today, -120 - Math.floor(rand() * 200))}T10:00:00.000Z`,
        notes: id === 'cus_joao' ? 'Prefere máquina 2 nas laterais. Gosta de café sem açúcar.' : '',
      },
      barberId,
      serviceId: services.some((s) => s.id === serviceId) ? serviceId : services[0].id,
      weight: id === 'cus_joao' ? 9 : isStory ? 3 : 1 + rand() * 1.5,
      lastSeenDaysAgo: away ? 46 + Math.floor(rand() * 20) : 0,
    };
  });
}

function fits(db: Database, barberId: ID, date: DateKey, start: Minutes, duration: number): boolean {
  const window = getWorkingWindow(db, barberId, date);
  if (!window || start < window.open || start + duration > window.close) return false;
  return !getBusyIntervals(db, barberId, date).some((i) => overlaps(start, start + duration, i.start, i.end));
}

let seq = 0;
function makeAppointment(
  db: Database,
  p: {
    barberId: ID;
    serviceId: ID;
    customerId: ID;
    date: DateKey;
    startMin: Minutes;
    status: AppointmentStatus;
    source: AppointmentSource;
    recoveredFromId?: ID;
  },
): Appointment {
  const service = db.services.find((s) => s.id === p.serviceId)!;
  const createdDate = addDays(p.date, -2);
  const a: Appointment = {
    id: `apt_${(seq++).toString(36).padStart(4, '0')}`,
    barbershopId: SHOP_ID,
    barberId: p.barberId,
    serviceId: p.serviceId,
    customerId: p.customerId,
    date: p.date,
    startMin: p.startMin,
    durationMin: service.durationMin,
    priceCents: service.priceCents,
    status: p.status,
    source: p.source,
    createdAt: `${createdDate}T12:00:00.000Z`,
    confirmedAt: p.status === 'pending' ? null : `${createdDate}T12:05:00.000Z`,
    cancelledAt: p.status === 'cancelled' ? `${addDays(p.date, -1)}T18:00:00.000Z` : null,
    cancelledBy: p.status === 'cancelled' ? 'customer' : null,
    recoveredFromId: p.recoveredFromId ?? null,
  };
  db.appointments.push(a);
  return a;
}

/** Preenche o dia de um barbeiro de forma realista. `density` ≈ probabilidade de cada janela estar ocupada. */
function fillDay(
  db: Database,
  rand: () => number,
  profiles: CustomerProfile[],
  barberId: ID,
  date: DateKey,
  density: number,
  opts: { past: boolean; today: DateKey; excludeCustomers?: Set<ID>; denseAfter?: Minutes },
) {
  const window = getWorkingWindow(db, barberId, date);
  if (!window) return;
  const daysAgo = Math.max(0, Math.round((parseDateKey(opts.today).getTime() - parseDateKey(date).getTime()) / 86_400_000));
  const bookedToday = new Set(db.appointments.filter((a) => a.date === date).map((a) => a.customerId));
  const pool = profiles.filter(
    (p) =>
      !opts.excludeCustomers?.has(p.customer.id) &&
      (p.lastSeenDaysAgo === 0 || daysAgo >= p.lastSeenDaysAgo),
  );
  const pick = () => {
    const preferred = rand() < 0.8;
    let candidates = pool.filter((p) => !bookedToday.has(p.customer.id) && (!preferred || p.barberId === barberId));
    if (!candidates.length) candidates = pool.filter((p) => !bookedToday.has(p.customer.id));
    const total = candidates.reduce((s, p) => s + p.weight, 0);
    let r = rand() * total;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) return c;
    }
    return candidates[candidates.length - 1];
  };

  let start = window.open;
  while (start < window.close) {
    const localDensity = opts.denseAfter != null && start >= opts.denseAfter ? 1 : density;
    const profile = pick();
    if (!profile) break;
    const serviceId = rand() < 0.75 ? profile.serviceId : db.services[Math.floor(rand() * db.services.length)].id;
    const service = db.services.find((s) => s.id === serviceId)!;
    if (rand() > localDensity || !fits(db, barberId, date, start, service.durationMin)) {
      const next = getBusyIntervals(db, barberId, date).find((i) => i.start <= start && i.end > start);
      start = next ? next.end : start + 15;
      continue;
    }
    bookedToday.add(profile.customer.id);
    if (opts.past) {
      const roll = rand();
      if (roll < 0.07) {
        const cancelled = makeAppointment(db, {
          barberId, serviceId: service.id, customerId: profile.customer.id, date, startMin: start, status: 'cancelled', source: 'online',
        });
        // Metade dos cancelamentos foi reocupada pela lista de espera.
        if (rand() < 0.5) {
          const filler = pick();
          const fillerService = filler && db.services.find((s) => s.id === filler.serviceId);
          if (filler && fillerService && fits(db, barberId, date, start, fillerService.durationMin)) {
            bookedToday.add(filler.customer.id);
            makeAppointment(db, {
              barberId, serviceId: fillerService.id, customerId: filler.customer.id, date, startMin: start,
              status: 'completed', source: 'recovered', recoveredFromId: cancelled.id,
            });
            start += fillerService.durationMin;
            continue;
          }
        }
        start += service.durationMin;
        continue;
      }
      makeAppointment(db, {
        barberId, serviceId: service.id, customerId: profile.customer.id, date, startMin: start,
        status: roll < 0.1 ? 'no_show' : 'completed', source: rand() < 0.72 ? 'online' : 'barber',
      });
    } else {
      makeAppointment(db, {
        barberId, serviceId: service.id, customerId: profile.customer.id, date, startMin: start,
        status: rand() < 0.85 ? 'confirmed' : 'pending', source: rand() < 0.75 ? 'online' : 'barber',
      });
    }
    start += service.durationMin;
  }
}

/** Roteiro fixo de hoje para o Carlos — garante a demonstração (14:30 livre, 16:00 para cancelar). */
const CARLOS_TODAY: Array<[string, ID, ID, AppointmentStatus]> = [
  ['09:00', 'cus_joao', 'svc_corte', 'confirmed'],
  ['10:00', 'cus_pedro', 'svc_barba', 'confirmed'],
  ['11:00', 'cus_marcos', 'svc_corte_barba', 'pending'],
  ['13:00', 'cus_andre', 'svc_corte_sobrancelha', 'confirmed'],
  ['16:00', 'cus_rafael', 'svc_corte', 'confirmed'],
  ['17:00', 'cus_thiago', 'svc_corte_barba', 'confirmed'],
  ['18:15', 'cus_vinicius', 'svc_barba', 'confirmed'],
];

export function createSeed(now: Date = new Date()): Database {
  seq = 0;
  const today = toDateKey(now);
  const rand = mulberry32(Number(today.replaceAll('-', '')));
  const barbers = buildBarbers();
  const services = buildServices();
  const profiles = buildCustomers(rand, today, barbers, services);

  const db: Database = {
    schemaVersion: SCHEMA_VERSION,
    seededFor: today,
    rev: 1,
    barbershop: buildBarbershop(),
    users: [
      { id: 'user_carlos', barbershopId: SHOP_ID, name: 'Carlos', email: 'carlos@barberlab.demo', role: 'owner', barberId: 'barber_carlos' },
      { id: 'user_diego', barbershopId: SHOP_ID, name: 'Diego', email: 'diego@barberlab.demo', role: 'barber', barberId: 'barber_diego' },
      { id: 'user_mateus', barbershopId: SHOP_ID, name: 'Mateus', email: 'mateus@barberlab.demo', role: 'barber', barberId: 'barber_mateus' },
    ],
    barbers,
    services,
    customers: profiles.map((p) => p.customer),
    appointments: [],
    timeBlocks: [],
    waitlist: [],
    offers: [],
    notifications: [],
    reminders: {
      enabled24h: true,
      enabled2h: true,
      template24h: 'Olá, {nome}! Seu horário na {barbearia} é {dia} às {hora} com {barbeiro}. Confirme sua presença.',
      template2h: '{nome}, falta pouco: {servico} hoje às {hora} com {barbeiro}. Se não puder vir, avise por aqui para liberarmos o horário.',
      sendBookingReceipt: true,
    },
    demo: { clock: 'fixed', fixedMin: t('08:30'), currentUserId: 'user_carlos' },
  };

  // 1. Hoje: roteiro do Carlos + agenda dos outros barbeiros.
  for (const [time, customerId, serviceId, status] of CARLOS_TODAY) {
    const service = services.find((s) => s.id === serviceId)!;
    if (fits(db, 'barber_carlos', today, t(time), service.durationMin)) {
      makeAppointment(db, { barberId: 'barber_carlos', serviceId, customerId, date: today, startMin: t(time), status, source: 'online' });
    }
  }
  for (const b of barbers.filter((b) => b.id !== 'barber_carlos')) {
    fillDay(db, rand, profiles, b.id, today, 0.6, { past: false, today, excludeCustomers: WAITLIST_TODAY });
  }

  // 2. Histórico (60 dias) — base para clientes e resultados.
  for (let d = 60; d >= 1; d--) {
    const date = addDays(today, -d);
    for (const b of barbers) fillDay(db, rand, profiles, b.id, date, 0.86, { past: true, today });
  }

  // 3. Próximos 14 dias — sábado que vem lotado à tarde (cenário da lista de espera).
  let saturday = addDays(today, 1);
  while (weekdayOf(saturday) !== 6) saturday = addDays(saturday, 1);
  for (let d = 1; d <= 14; d++) {
    const date = addDays(today, d);
    const density = date === saturday ? 0.85 : Math.max(0.2, 0.65 - d * 0.03);
    for (const b of barbers) {
      fillDay(db, rand, profiles, b.id, date, density, { past: false, today, denseAfter: date === saturday ? t('13:00') : undefined });
    }
  }

  // 4. Lista de espera para hoje (elegíveis quando o horário das 16:00 for liberado).
  const wait = (customerId: ID, serviceId: ID, barberId: ID | null, date: DateKey, from: string, to: string, hoursAgo: number): WaitlistEntry => ({
    id: `wl_${customerId}_${date}`,
    barbershopId: SHOP_ID,
    customerId,
    serviceId,
    barberId,
    date,
    fromMin: t(from),
    toMin: t(to),
    status: 'active',
    createdAt: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
  });
  db.waitlist.push(
    // Janelas escolhidas para não haver vaga hoje até alguém cancelar.
    wait('cus_bruno', 'svc_corte', 'barber_carlos', today, '16:00', '17:30', 20),
    wait('cus_felipe', 'svc_corte_barba', 'barber_carlos', today, '15:45', '17:00', 16),
    wait('cus_gustavo', 'svc_barba', 'barber_carlos', today, '16:00', '17:00', 3),
    wait('cus_caio', 'svc_corte', null, saturday, '14:00', '17:00', 26),
  );

  // 5. Lembretes de 24h já enviados ontem para os clientes de hoje (histórico do WhatsApp simulado).
  const sentAt = new Date(now.getTime() - 15 * 3_600_000).toISOString();
  for (const a of db.appointments.filter((a) => a.date === today && a.barberId === 'barber_carlos')) {
    const customer = db.customers.find((c) => c.id === a.customerId)!;
    db.notifications.push(whatsappSeed(a, customer, sentAt));
  }

  return db;
}

function whatsappSeed(a: Appointment, customer: Customer, createdAt: string): Notification {
  const hh = `${String(Math.floor(a.startMin / 60)).padStart(2, '0')}:${String(a.startMin % 60).padStart(2, '0')}`;
  return {
    id: `ntf_seed_${a.id}`,
    barbershopId: SHOP_ID,
    channel: 'whatsapp',
    kind: 'reminder_24h',
    direction: 'out',
    barberId: a.barberId,
    customerId: customer.id,
    appointmentId: a.id,
    offerId: null,
    title: 'Lembrete 24h',
    body: `Olá, ${customer.name.split(' ')[0]}! Seu horário na Barber Lab é amanhã às ${hh} com Carlos. Confirme sua presença.`,
    createdAt,
    readAt: createdAt,
  };
}

export const SEED_TODAY_FOR_TESTS = (date: string) => createSeed(parseDateKey(date));
