import { NavLink, Outlet } from 'react-router-dom';
import { CalendarDays, Settings2, TrendingUp, Users } from 'lucide-react';
import { useCurrentUser } from '../../store/hooks';
import { Avatar, cx } from '../../ui/primitives';
import { CadeiraLogo } from '../../ui/brand';
import { BarberUIProvider } from './BarberUI';
import { NewBookingAlert } from './NewBookingAlert';

const NAV = [
  { to: '/painel', label: 'Agenda', icon: CalendarDays, end: true },
  { to: '/painel/clientes', label: 'Clientes', icon: Users },
  { to: '/painel/resultados', label: 'Resultados', icon: TrendingUp },
  { to: '/painel/ajustes', label: 'Ajustes', icon: Settings2 },
];

export function BarberLayout() {
  const { db, user, barber } = useCurrentUser();
  return (
    <BarberUIProvider>
      <div className="min-h-[calc(100dvh-40px)]">
        {/* Navegação lateral (desktop) */}
        <aside className="fixed top-10 bottom-0 left-0 hidden w-64 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
          <div className="px-3">
            <CadeiraLogo />
            <p className="mt-1 text-xs text-muted">{db.barbershop.name}</p>
          </div>
          <nav className="mt-8 space-y-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cx(
                    'flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors',
                    isActive ? 'bg-ink text-white' : 'text-muted hover:bg-ink/5 hover:text-ink',
                  )
                }
              >
                <item.icon size={19} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto flex items-center gap-3 rounded-2xl bg-paper px-3 py-3">
            <Avatar label={barber.initials} size={36} tone="dark" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.role === 'owner' ? 'Dono · barbeiro' : 'Barbeiro'}</p>
            </div>
          </div>
        </aside>

        <main className="pb-28 lg:pb-10 lg:pl-64">
          <Outlet />
        </main>

        {/* Navegação inferior (celular) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur pb-safe lg:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-4">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cx('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold', isActive ? 'text-ink' : 'text-faint')
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cx('grid h-8 w-14 place-items-center rounded-full transition-colors', isActive && 'bg-ink text-white')}>
                      <item.icon size={20} />
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        <NewBookingAlert />
      </div>
    </BarberUIProvider>
  );
}
