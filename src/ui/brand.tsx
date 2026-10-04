import { cx } from './primitives';

/** Marca do produto SaaS: "Cadeira" — a agenda que não deixa a cadeira vazia. */
export function CadeiraGlyph({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M10 8.5v9.5h12" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M12 18v5.5M20 18v5.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="22" cy="10" r="2.2" fill="#B08A4E" />
    </svg>
  );
}

export function CadeiraLogo({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  return (
    <span className={cx('inline-flex items-center gap-2', className)}>
      <CadeiraGlyph size={22} className={tone === 'dark' ? 'text-ink' : 'text-white/15'} />
      <span className={cx('font-wide text-[15px] font-bold tracking-[-0.01em]', tone === 'dark' ? 'text-ink' : 'text-white')}>
        cadeira
      </span>
    </span>
  );
}

/** Marca da barbearia cliente (fictícia). */
export function BarberLabMark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'text-base', md: 'text-2xl', lg: 'text-[44px] sm:text-6xl' };
  return (
    <span className={cx('font-wide leading-none font-extrabold tracking-[0.04em] uppercase', sizes[size], className)}>
      Barber <span className="text-brass-500">Lab</span>
    </span>
  );
}
