import { forwardRef, useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'brass' | 'danger' | 'inverse';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-soft active:bg-black disabled:bg-line-strong disabled:text-white',
  secondary: 'bg-surface text-ink border border-line-strong hover:border-ink active:bg-paper disabled:text-faint disabled:border-line',
  ghost: 'text-ink hover:bg-ink/5 active:bg-ink/10 disabled:text-faint',
  brass: 'bg-brass-500 text-white hover:bg-brass-600 active:bg-brass-700 disabled:bg-brass-300',
  danger: 'bg-surface text-bad border border-bad/30 hover:bg-bad-soft active:bg-bad-soft disabled:opacity-50',
  inverse: 'bg-white text-ink hover:bg-white/90 active:bg-white/80',
};
const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-4 text-[15px] rounded-xl gap-2',
  lg: 'h-14 px-6 text-base rounded-2xl gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex items-center justify-center font-semibold tracking-[-0.01em] transition-colors duration-150 select-none disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...props}
    />
  );
});

export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <button aria-label="Fechar" className="absolute inset-0 bg-ink/40 animate-fade-in backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cx(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-sheet animate-sheet-in sm:rounded-3xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
        {(title || eyebrow) && (
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 sm:px-6 sm:pt-6">
            <div className="min-w-0">
              {eyebrow && <div className="mb-1 text-xs font-semibold tracking-[0.12em] text-brass-600 uppercase">{eyebrow}</div>}
              {title && <h2 className="text-xl leading-tight font-semibold tracking-[-0.02em]">{title}</h2>}
            </div>
            <button onClick={onClose} aria-label="Fechar" className="-mr-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/5">
              <X size={20} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
        {footer && <div className="border-t border-line bg-surface px-5 py-4 pb-safe sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-8 w-14 shrink-0 rounded-full transition-colors', checked ? 'bg-ink' : 'bg-line-strong')}
    >
      <span className={cx('absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform', checked && 'translate-x-6')} />
    </button>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }>(
  function Input({ label, hint, error, className, id, ...props }, ref) {
    const autoId = useId();
    const inputId = id ?? autoId;
    return (
      <label htmlFor={inputId} className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
        <input
          ref={ref}
          id={inputId}
          className={cx(
            'h-12 w-full rounded-xl border bg-surface px-4 text-base outline-none transition-colors placeholder:text-faint focus:border-ink',
            error ? 'border-bad' : 'border-line-strong',
            className,
          )}
          {...props}
        />
        {(error || hint) && <span className={cx('mt-1.5 block text-sm', error ? 'text-bad' : 'text-muted')}>{error ?? hint}</span>}
      </label>
    );
  },
);

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode }>;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={cx('inline-flex rounded-xl bg-ink/[0.06] p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 rounded-lg font-semibold whitespace-nowrap transition-all',
            size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
            o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ label, size = 40, tone = 'light' }: { label: string; size?: number; tone?: 'light' | 'dark' | 'brass' }) {
  const tones = {
    light: 'bg-ink/[0.06] text-ink',
    dark: 'bg-ink text-white',
    brass: 'bg-brass-100 text-brass-700',
  };
  return (
    <span
      className={cx('grid shrink-0 place-items-center rounded-full font-semibold tracking-tight', tones[tone])}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {label}
    </span>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h3 className="text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">{children}</h3>
      {action}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong px-5 py-8 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}
