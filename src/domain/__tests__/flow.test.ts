import { beforeEach, describe, expect, it } from 'vitest';
import { getState, resetDatabase } from '../../store/store';
import {
  bookAppointment,
  cancelAppointment,
  confirmAppointment,
  joinWaitlist,
  respondToOffer,
  sendSlotOffer,
} from '../../store/actions';
import { checkBooking, freeWindowAt, getNow, getSlots, buildTimeline } from '../availability';
import { findWaitlistMatches } from '../waitlist';
import { computeMetrics } from '../metrics';
import { addDays, parseTime, weekdayOf } from '../time';

const CARLOS = 'barber_carlos';
const t = parseTime;

function today() {
  return getNow(getState()).date;
}
function availableStarts(barberId: string | null, durationMin: number, date = today()) {
  return getSlots(getState(), { barberId, date, durationMin })
    .filter((s) => s.status === 'available')
    .map((s) => s.startMin);
}
function book(startMin: number, serviceId = 'svc_corte_barba', name = 'Lucas Oliveira', phone = '11988887777') {
  return bookAppointment({ serviceId, barberId: CARLOS, date: today(), startMin, customerName: name, phone, source: 'online' });
}

beforeEach(() => resetDatabase());

describe('disponibilidade', () => {
  it('mostra 14:30 livre para Corte + barba com o Carlos', () => {
    expect(availableStarts(CARLOS, 60)).toContain(t('14:30'));
  });

  it('remove o horário depois da reserva e impede conflito', () => {
    const res = book(t('14:30'));
    expect(res.ok).toBe(true);
    const starts = availableStarts(CARLOS, 60);
    expect(starts).not.toContain(t('14:30'));
    // 14:00 + 60 min invadiria 14:30
    expect(starts).not.toContain(t('14:00'));
    expect(book(t('14:30'), 'svc_corte', 'Outro', '11977776666').ok).toBe(false);
    expect(book(t('15:00'), 'svc_barba', 'Outro', '11977776666').ok).toBe(false);
    // encaixe logo após o fim (15:30) fica disponível
    expect(availableStarts(CARLOS, 30)).toContain(t('15:30'));
  });

  it('reservas consecutivas com durações diferentes', () => {
    expect(book(t('13:50'), 'svc_barba', 'A', '11900000001').ok).toBe(true); // 13:50–14:20
    expect(book(t('14:20'), 'svc_corte', 'B', '11900000002').ok).toBe(true); // 14:20–15:05
    expect(book(t('15:05'), 'svc_corte', 'C', '11900000003').ok).toBe(true); // 15:05–15:50, antes do Rafael (16:00)
    expect(book(t('15:50'), 'svc_barba', 'D', '11900000004').ok).toBe(false); // invadiria 16:00
  });

  it('cancelar devolve o horário', () => {
    const res = book(t('14:30'));
    if (!res.ok) throw new Error(res.error);
    confirmAppointment(res.value.id);
    expect(getState().appointments.find((a) => a.id === res.value.id)?.status).toBe('confirmed');
    cancelAppointment(res.value.id, 'barber');
    expect(availableStarts(CARLOS, 60)).toContain(t('14:30'));
  });

  it('sábado à tarde está lotado (lista de espera)', () => {
    let sat = addDays(today(), 1);
    while (weekdayOf(sat) !== 6) sat = addDays(sat, 1);
    const slot = getSlots(getState(), { barberId: null, date: sat, durationMin: 45 }).find((s) => s.startMin === t('15:00'));
    expect(slot?.status).toBe('busy');
  });

  it('timeline cobre o dia sem sobreposição', () => {
    const rows = buildTimeline(getState(), CARLOS, today()).filter((r) => r.type !== 'cancelled');
    for (let i = 1; i < rows.length; i++) expect(rows[i].start).toBeGreaterThanOrEqual(rows[i - 1].end);
  });
});

describe('recuperação de horário', () => {
  it('cancelamento → oferta para lista de espera → reocupação → métricas', () => {
    const db0 = getState();
    const rafael = db0.appointments.find((a) => a.barberId === CARLOS && a.date === today() && a.startMin === t('16:00'))!;
    expect(rafael).toBeTruthy();
    const before = computeMetrics(db0, { today: today(), days: 30, barberId: CARLOS });

    cancelAppointment(rafael.id, 'customer');
    const window = freeWindowAt(getState(), CARLOS, today(), t('16:00'));
    expect(window).toBe(60);
    const matches = findWaitlistMatches(getState(), { barberId: CARLOS, date: today(), startMin: t('16:00'), windowMin: window });
    expect(matches.map((m) => m.customer.name).sort()).toEqual(['Bruno Almeida', 'Felipe Rocha', 'Gustavo Lima']);

    const offer = sendSlotOffer({
      barberId: CARLOS,
      date: today(),
      startMin: t('16:00'),
      sourceAppointmentId: rafael.id,
      recipients: matches.map((m) => ({ customerId: m.customer.id, waitlistEntryId: m.waitlistEntry!.id, serviceId: m.service.id })),
    });
    if (!offer.ok) throw new Error(offer.error);
    const felipe = matches.find((m) => m.customer.name === 'Felipe Rocha')!;
    const accepted = respondToOffer(offer.value.id, felipe.customer.id, true);
    expect(accepted.ok).toBe(true);
    const late = respondToOffer(offer.value.id, matches[0].customer.id === felipe.customer.id ? matches[1].customer.id : matches[0].customer.id, true);
    expect(late.ok).toBe(false);

    const after = computeMetrics(getState(), { today: today(), days: 30, barberId: CARLOS });
    expect(after.recovered).toBe(before.recovered + 1);
    expect(after.recoveredCents).toBe(before.recoveredCents + 7000);
    expect(after.cancellations).toBe(before.cancellations + 1);
    expect(checkBooking(getState(), { barberId: CARLOS, date: today(), startMin: t('16:00'), durationMin: 30 }).ok).toBe(false);
  });

  it('cliente entra na lista de espera', () => {
    const res = joinWaitlist({ customerName: 'Novo', phone: '11955554444', serviceId: 'svc_corte', barberId: CARLOS, date: today(), fromMin: t('15:00'), toMin: t('17:00') });
    expect(res.ok).toBe(true);
  });
});

describe('métricas', () => {
  it('são plausíveis', () => {
    const m = computeMetrics(getState(), { today: today(), days: 30, barberId: CARLOS });
    console.log(m.bookings, m.cancellations, m.recovered, m.recoveredCents, m.revenueCents, m.occupancy.toFixed(2));
    expect(m.occupancy).toBeGreaterThan(0.6);
    expect(m.recovered).toBeGreaterThan(0);
  });
});
