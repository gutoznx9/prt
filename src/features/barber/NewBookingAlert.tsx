import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useCurrentUser, useLookups, useNow } from '../../store/hooks';
import { confirmAppointment, markNotificationsRead } from '../../store/actions';
import { formatRelativeDay, formatTime } from '../../domain/time';
import { Button } from '../../ui/primitives';
import { useToast } from '../../ui/toast';

/**
 * Aviso de nova reserva (simula a push notification do app).
 * Aparece sempre que existir uma reserva online não lida — inclusive vinda de outra aba.
 */
export function NewBookingAlert() {
  const { db, user, barber } = useCurrentUser();
  const now = useNow(db);
  const lookups = useLookups(db);
  const navigate = useNavigate();
  const toast = useToast();

  const notification = [...db.notifications]
    .reverse()
    .find((n) => n.channel === 'app' && n.kind === 'new_booking' && !n.readAt && (user.role === 'owner' || n.barberId === barber.id));
  const a = notification?.appointmentId ? db.appointments.find((x) => x.id === notification.appointmentId) : null;
  if (!notification || !a) return null;
  const customer = lookups.customer(a.customerId);
  const service = lookups.service(a.serviceId);
  const apptBarber = lookups.barber(a.barberId);
  const pendingCount = db.notifications.filter((n) => n.channel === 'app' && n.kind === 'new_booking' && !n.readAt).length;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-12 z-40 flex justify-center px-3 lg:top-14 lg:justify-end lg:px-6">
      <div
        key={notification.id}
        role="alert"
        className="pointer-events-auto w-full max-w-sm rounded-3xl bg-ink p-5 text-white shadow-float animate-drop-in"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-brass-300 uppercase">
            <span className="size-2 rounded-full bg-brass-500 animate-pulse-ring" />
            Nova reserva
            {pendingCount > 1 && <span className="font-medium tracking-normal text-white/50 normal-case">+{pendingCount - 1}</span>}
          </p>
          <button onClick={() => markNotificationsRead([notification.id])} className="-mt-1 -mr-1 grid size-8 place-items-center rounded-full text-white/50 hover:bg-white/10" aria-label="Dispensar">
            <X size={16} />
          </button>
        </div>
        <p className="mt-3 text-white/70">{customer?.name} marcou:</p>
        <p className="text-xl font-semibold">{service?.name}</p>
        <p className="mt-0.5 text-white/90">
          {formatRelativeDay(a.date, now.date)} às {formatTime(a.startMin)}
          {apptBarber && apptBarber.id !== barber.id && ` · com ${apptBarber.name}`}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Button
            variant="brass"
            disabled={a.status !== 'pending'}
            onClick={() => {
              confirmAppointment(a.id);
              toast(`${customer?.name.split(' ')[0]} confirmado — aviso enviado no WhatsApp`);
            }}
          >
            Confirmar
          </Button>
          <Button
            variant="inverse"
            onClick={() => {
              const qs = new URLSearchParams({ data: a.date, barbeiro: a.barberId, apt: a.id });
              navigate(`/painel?${qs}`);
            }}
          >
            Ver agendamento
          </Button>
        </div>
      </div>
    </div>
  );
}
