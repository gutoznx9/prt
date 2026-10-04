import { useNavigate } from 'react-router-dom';
import { BellRing, CalendarPlus, CalendarX, ListPlus, Sparkles } from 'lucide-react';
import type { NotificationKind } from '../../domain/types';
import { useCurrentUser } from '../../store/hooks';
import { markNotificationsRead } from '../../store/actions';
import { Button, EmptyState, Sheet, cx } from '../../ui/primitives';

const ICONS: Partial<Record<NotificationKind, typeof BellRing>> = {
  new_booking: CalendarPlus,
  booking_cancelled: CalendarX,
  waitlist_joined: ListPlus,
  slot_recovered: Sparkles,
};

function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
}

export function NotificationsSheet({ onClose }: { onClose: () => void }) {
  const { db, user, barber } = useCurrentUser();
  const navigate = useNavigate();
  const items = db.notifications
    .filter((n) => n.channel === 'app' && (user.role === 'owner' || n.barberId === barber.id || n.barberId == null))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);
  const unread = items.filter((n) => !n.readAt).map((n) => n.id);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Notificações"
      footer={
        unread.length > 0 ? (
          <Button block variant="secondary" onClick={() => markNotificationsRead(unread)}>
            Marcar todas como lidas
          </Button>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <EmptyState title="Tudo em dia">Novas reservas, cancelamentos e respostas de clientes aparecem aqui.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((n) => {
            const Icon = ICONS[n.kind] ?? BellRing;
            const appointment = n.appointmentId ? db.appointments.find((a) => a.id === n.appointmentId) : null;
            return (
              <li key={n.id}>
                <button
                  className="flex w-full items-start gap-3 py-3.5 text-left"
                  onClick={() => {
                    markNotificationsRead([n.id]);
                    onClose();
                    if (appointment) {
                      const qs = new URLSearchParams({ data: appointment.date, barbeiro: appointment.barberId, apt: appointment.id });
                      navigate(`/painel?${qs}`);
                    } else if (n.kind === 'waitlist_joined') {
                      navigate('/painel/clientes?filtro=espera');
                    }
                  }}
                >
                  <span className={cx('mt-0.5 grid size-9 shrink-0 place-items-center rounded-full', n.readAt ? 'bg-ink/[0.05] text-muted' : 'bg-ink text-white')}>
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cx('font-semibold', n.readAt && 'text-muted')}>{n.title}</span>
                      <span className="shrink-0 text-xs text-muted">{ago(n.createdAt)}</span>
                    </span>
                    <span className="block text-[15px] text-muted">{n.body}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
