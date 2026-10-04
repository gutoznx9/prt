import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Clock3, ListChecks, MessageCircle, MoreHorizontal, RotateCcw, Scissors, UserRound } from 'lucide-react';
import { useDB } from '../../store/store';
import { useNow } from '../../store/hooks';
import { resetDemo, setCurrentUser, setDemoClock } from '../../store/actions';
import { formatTime, parseTime } from '../../domain/time';
import { CadeiraGlyph } from '../../ui/brand';
import { Sheet, cx } from '../../ui/primitives';
import { useToast } from '../../ui/toast';
import { useWhatsApp } from './WhatsAppContext';

const LAST_PATH = 'cadeira:last-path:';
const CLOCK_PRESETS = ['08:30', '12:30', '15:30'];

/** Barra exclusiva do protótipo: alterna Cliente/Barbeiro, abre o WhatsApp simulado e controla a demo. */
export function DemoBar() {
  const db = useDB();
  const now = useNow(db);
  const navigate = useNavigate();
  const location = useLocation();
  const whatsapp = useWhatsApp();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [script, setScript] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const mode = location.pathname.startsWith('/painel') ? 'barber' : 'client';
  useEffect(() => {
    try {
      sessionStorage.setItem(LAST_PATH + mode, location.pathname + location.search);
    } catch {
      /* ignora */
    }
  }, [mode, location.pathname, location.search]);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu]);

  const switchTo = (target: 'client' | 'barber') => {
    if (target === mode) return;
    let path: string | null = null;
    try {
      path = sessionStorage.getItem(LAST_PATH + target);
    } catch {
      /* ignora */
    }
    navigate(path ?? (target === 'barber' ? '/painel' : '/'));
  };

  const unread = db.notifications.filter((n) => n.channel === 'whatsapp' && n.direction === 'out' && !n.readAt).length;

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[45] h-10 bg-black text-white">
        <div className="mx-auto flex h-full max-w-[1400px] items-center gap-2 px-2 sm:px-4">
          <span className="flex items-center gap-2 pr-1">
            <CadeiraGlyph size={20} className="text-white/15" />
            <span className="hidden text-xs font-semibold text-white/50 md:inline">Protótipo</span>
          </span>

          <div className="mx-auto flex rounded-lg bg-white/10 p-0.5" role="tablist" aria-label="Modo de demonstração">
            {(
              [
                ['client', 'Cliente', UserRound],
                ['barber', 'Barbeiro', Scissors],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                role="tab"
                aria-selected={mode === value}
                onClick={() => switchTo(value)}
                className={cx(
                  'flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-colors',
                  mode === value ? 'bg-white text-ink' : 'text-white/70 hover:text-white',
                )}
              >
                <Icon size={14} />
                <span>
                  <span className="hidden sm:inline">Modo </span>
                  {label}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={() => whatsapp.open()}
            className="relative flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-white/80 hover:bg-white/10"
            aria-label="WhatsApp simulado"
          >
            <MessageCircle size={16} />
            <span className="hidden md:inline">WhatsApp</span>
            {unread > 0 && (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#25a36a] px-1 text-[10px] font-bold text-white">{unread}</span>
            )}
          </button>

          <button
            onClick={() => setMenu((m) => !m)}
            className="hidden h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-white/80 hover:bg-white/10 sm:flex"
            aria-label="Relógio da demonstração"
          >
            <Clock3 size={15} />
            <span className="tabular">{formatTime(now.minutes)}</span>
          </button>
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenu((m) => !m)} className="grid size-8 place-items-center rounded-md text-white/80 hover:bg-white/10" aria-label="Opções da demonstração" aria-expanded={menu}>
              <MoreHorizontal size={18} />
            </button>
            {menu && (
              <div className="absolute top-10 right-0 w-72 rounded-2xl bg-surface p-2 text-ink shadow-float animate-fade-in">
                <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-[0.1em] text-muted uppercase">Relógio da demonstração</p>
                <div className="grid grid-cols-4 gap-1 px-2 pb-2">
                  {CLOCK_PRESETS.map((p) => {
                    const active = db.demo.clock === 'fixed' && db.demo.fixedMin === parseTime(p);
                    return (
                      <button
                        key={p}
                        onClick={() => setDemoClock('fixed', parseTime(p))}
                        className={cx('h-9 rounded-lg text-sm font-semibold tabular', active ? 'bg-ink text-white' : 'bg-ink/[0.05] hover:bg-ink/10')}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setDemoClock('real')}
                    className={cx('h-9 rounded-lg text-sm font-semibold', db.demo.clock === 'real' ? 'bg-ink text-white' : 'bg-ink/[0.05] hover:bg-ink/10')}
                  >
                    Real
                  </button>
                </div>
                <p className="px-3 pb-2 text-xs text-muted">Horários antes deste relógio contam como passados.</p>

                <p className="border-t border-line px-3 pt-3 pb-1 text-xs font-semibold tracking-[0.1em] text-muted uppercase">Painel como</p>
                <div className="grid grid-cols-3 gap-1 px-2 pb-2">
                  {db.users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => setCurrentUser(u.id)}
                      className={cx('h-9 rounded-lg text-sm font-semibold', db.demo.currentUserId === u.id ? 'bg-ink text-white' : 'bg-ink/[0.05] hover:bg-ink/10')}
                    >
                      {u.name}
                    </button>
                  ))}
                </div>

                <div className="border-t border-line pt-1">
                  <button
                    onClick={() => {
                      setMenu(false);
                      setScript(true);
                    }}
                    className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium hover:bg-ink/5"
                  >
                    <ListChecks size={17} /> Roteiro da demonstração
                  </button>
                  <button
                    onClick={() => {
                      if (!window.confirm('Restaurar os dados de demonstração? Reservas feitas nesta sessão serão apagadas.')) return;
                      resetDemo();
                      setMenu(false);
                      toast('Dados de demonstração restaurados');
                      navigate(mode === 'barber' ? '/painel' : '/');
                    }}
                    className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium text-bad hover:bg-bad-soft"
                  >
                    <RotateCcw size={17} /> Restaurar dados da demo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Sheet open={script} onClose={() => setScript(false)} eyebrow="Protótipo" title="Roteiro da demonstração" wide>
        <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-relaxed marker:font-semibold marker:text-brass-600">
          <li>Modo Cliente → <b>Agendar horário</b> → “Corte + barba” → Carlos → Hoje → <b>14:30</b>.</li>
          <li>Nome “Lucas Oliveira”, WhatsApp qualquer → <b>Confirmar</b>. Veja a tela de confirmação.</li>
          <li>Modo Barbeiro → aparece o aviso <b>Nova reserva</b> → <b>Confirmar</b> (o cliente recebe a confirmação no WhatsApp simulado).</li>
          <li>Na agenda, toque em <b>16:00 · Rafael Costa</b> → Cancelar horário → “Cliente desmarcou”.</li>
          <li>O banner <b>Horário liberado</b> aparece → <b>Oferecer horário aos clientes</b> → 3 clientes da lista de espera → <b>Enviar aviso</b>.</li>
          <li>Abra o <b>WhatsApp</b> (barra preta) → conversa de um cliente → <b>Quero esse horário</b> (ou “Simular quero” no painel).</li>
          <li><b>Resultados</b>: horários recuperados, cancelamentos e o valor recuperado mudam na hora.</li>
          <li>Extra: como cliente, tente sábado à tarde (lotado) → toque num horário riscado → <b>Entrar na lista de espera</b>.</li>
        </ol>
        <p className="mt-4 text-sm text-muted">
          Dica: abra o modo cliente e o modo barbeiro em duas abas ou janelas do mesmo navegador — os dados sincronizam em tempo real.
        </p>
      </Sheet>
    </>
  );
}
