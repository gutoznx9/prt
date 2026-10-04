# Cadeira · protótipo (Barber Lab)

Protótipo funcional de um SaaS B2B de agendamento para barbearias.
A proposta comercial: **não é uma agenda, é deixar menos dinheiro na mesa.** Toda a demonstração gira em
torno de *cliente → agenda → barbeiro → cancelamento → recuperação → resultado financeiro*.

- **Cliente** (`/`): página pública da barbearia fictícia **Barber Lab** e agendamento em 5 passos.
- **Barbeiro** (`/painel`): agenda do dia mobile-first, clientes, resultados e ajustes.
- **Barra preta do protótipo**: alterna *Modo Cliente / Modo Barbeiro*, abre o WhatsApp simulado,
  controla o relógio da demonstração e restaura os dados.

## Rodando

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # testes de domínio (disponibilidade, conflitos, recuperação, métricas)
npm run e2e          # roteiro completo no navegador (precisa do `npm run dev` rodando)
npm run build        # build de produção (PWA com manifest + service worker)
```

## Roteiro da demonstração

Também disponível no app em **⋯ → Roteiro da demonstração**.

1. Modo Cliente → **Agendar horário** → Corte + barba → Carlos → Hoje → **14:30**.
2. Nome "Lucas Oliveira" + WhatsApp → **Confirmar** → tela "Agendamento confirmado".
3. Modo Barbeiro → aviso **Nova reserva** → **Confirmar** (status muda e o cliente recebe a confirmação no WhatsApp simulado).
4. Agenda → **16:00 Rafael Costa** → Cancelar horário → "Cliente desmarcou".
5. Banner **Horário liberado** → **Oferecer horário aos clientes** → "3 clientes podem receber o aviso" → **Enviar aviso**.
6. **WhatsApp** (barra preta) → Felipe Rocha → **Quero esse horário** (ou "Simular quero" no painel).
7. **Resultados** → valor recuperado e horários recuperados aumentam (+R$ 70).
8. Extra: como cliente, sábado à tarde (lotado) → toque num horário riscado → **Entrar na lista de espera**.

Dica: abra cliente e barbeiro em duas abas do mesmo navegador — os dados sincronizam ao vivo.
O relógio da demo começa fixo em 08:30 para o roteiro funcionar a qualquer hora (troque para "Real" no menu ⋯).
Os dados de demonstração são gerados em relação ao dia atual e regenerados quando o dia muda.

## Arquitetura

```
src/
  domain/        regras puras, sem React (migram para o backend sem mudanças)
    types.ts         entidades: Barbershop, User, Barber, Service, Customer, Appointment,
                     TimeBlock, WaitlistEntry, SlotOffer, Notification, ReminderSettings
    availability.ts  motor de disponibilidade: horários livres, conflitos, linha do tempo, ocupação
    waitlist.ts      quem é elegível para um horário liberado
    metrics.ts       métricas financeiras (recuperado, ocupação, receita, perdas)
    customers.ts     estatísticas por cliente
    reminders.ts     templates e fila de lembretes
  store/
    store.ts         banco local (localStorage) + transações + sincronização entre abas
    actions.ts       casos de uso: reservar, confirmar, cancelar, lista de espera, ofertas, lembretes…
  services/
    messaging.ts     gateway de mensagens (hoje grava em `notifications`; amanhã WhatsApp API / push)
    calendar.ts      geração de .ics
  data/seed.ts     dados de demonstração determinísticos (60 dias de histórico, 14 dias à frente)
  features/
    client/          página pública, fluxo de agendamento, lista de espera, confirmação
    barber/          agenda, ofertas, clientes, resultados, ajustes
    demo/            barra do protótipo e WhatsApp simulado
```

Convenções pensadas para Supabase/PostgreSQL: ids string (uuid), datas `YYYY-MM-DD`, horários em minutos,
dinheiro em centavos, preço congelado no agendamento. A regra de conflito (`checkBooking`) roda em toda escrita;
em produção ela vira também uma *exclusion constraint* no Postgres.

## O que é simulado

- WhatsApp (envio e respostas dos clientes), push notifications e lembretes automáticos.
- Autenticação (o "login" é a escolha de usuário no menu ⋯).
- Banco de dados (localStorage por navegador; não sincroniza entre aparelhos diferentes).
