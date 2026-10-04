import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './ui/toast';
import { WhatsAppProvider } from './features/demo/WhatsAppContext';
import { DemoBar } from './features/demo/DemoBar';
import { PublicPage } from './features/client/PublicPage';
import { BookingFlow } from './features/client/BookingFlow';
import { BookingSuccess } from './features/client/BookingSuccess';
import { BarberLayout } from './features/barber/BarberLayout';
import { AgendaPage } from './features/barber/AgendaPage';
import { ClientsPage } from './features/barber/ClientsPage';
import { ResultsPage } from './features/barber/ResultsPage';
import { SettingsPage } from './features/barber/SettingsPage';

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <WhatsAppProvider>
          <DemoBar />
          <div className="pt-10">
            <Routes>
              {/* Experiência do cliente (página pública da barbearia) */}
              <Route path="/" element={<PublicPage />} />
              <Route path="/agendar" element={<BookingFlow />} />
              <Route path="/agendado/:id" element={<BookingSuccess />} />
              {/* Painel do barbeiro */}
              <Route path="/painel" element={<BarberLayout />}>
                <Route index element={<AgendaPage />} />
                <Route path="clientes" element={<ClientsPage />} />
                <Route path="resultados" element={<ResultsPage />} />
                <Route path="ajustes" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </WhatsAppProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
