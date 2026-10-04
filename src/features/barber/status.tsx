import type { AppointmentStatus } from '../../domain/types';
import { cx } from '../../ui/primitives';

export const STATUS_META: Record<AppointmentStatus, { label: string; dot: string; chip: string }> = {
  pending: { label: 'Aguardando confirmação', dot: 'bg-wait', chip: 'bg-wait-soft text-wait' },
  confirmed: { label: 'Confirmado', dot: 'bg-ok', chip: 'bg-ok-soft text-ok' },
  completed: { label: 'Concluído', dot: 'bg-faint', chip: 'bg-ink/[0.06] text-muted' },
  cancelled: { label: 'Cancelado', dot: 'bg-bad', chip: 'bg-bad-soft text-bad' },
  no_show: { label: 'Não compareceu', dot: 'bg-bad', chip: 'bg-bad-soft text-bad' },
};

export function StatusChip({ status, className }: { status: AppointmentStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', meta.chip, className)}>
      <span className={cx('size-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  );
}
