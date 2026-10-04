// Teste ponta a ponta do roteiro de demonstração.
// Uso: npm run dev (em outro terminal) e depois `npm run e2e` (BASE_URL opcional, SHOTS=dir para screenshots).
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const SHOTS = process.env.SHOTS;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());

let n = 0;
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${String(++n).padStart(2, '0')}-${name}.png` });
const step = (msg) => console.log(`✓ ${msg}`);
const expectText = async (p, text) => {
  await p.getByText(text, { exact: false }).first().waitFor({ timeout: 5000 });
};
const money = (s) => Number(s.replace(/[^\d]/g, ''));

await page.goto(BASE);
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await page.goto(`${BASE}/painel/resultados`);
const recoveredBefore = money(await page.locator('section').filter({ hasText: 'Você recuperou' }).locator('span.font-condensed').innerText());
const recoveredCountBefore = Number(await page.locator('dd', { hasText: /^\d+$/ }).nth(1).innerText());
step(`resultados iniciais: R$ ${recoveredBefore}, ${recoveredCountBefore} recuperados`);

// 1–8: cliente agenda
await page.goto(BASE);
await shot('pagina-publica');
await page.getByRole('button', { name: /Agendar horário/ }).click();
await page.getByRole('button', { name: /Corte \+ barba/ }).click();
await page.getByRole('button', { name: /Carlos/ }).click();
await page.getByRole('button', { name: '14:30', exact: true }).click();
await shot('horarios');
await page.getByRole('button', { name: 'Continuar' }).click();
await page.getByRole('textbox', { name: 'Nome' }).fill('Lucas Oliveira');
await page.getByRole('textbox', { name: /^WhatsApp/ }).fill('11987650000');
await page.getByRole('button', { name: 'Revisar' }).click();
await shot('revisao');
await page.getByRole('button', { name: /Confirmar/ }).click();
await expectText(page, 'Agendamento confirmado');
await expectText(page, 'Você receberá um lembrete antes do horário.');
await shot('confirmado');
step('cliente agendou Corte + barba às 14:30 com Carlos');

const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Adicionar ao calendário/ }).click()]);
if (!download.suggestedFilename().endsWith('.ics')) throw new Error('ics não baixado');
step('arquivo .ics gerado');

// Disponibilidade: 14:30 ocupado para o próximo cliente; 14:00 (60 min) também
await page.goto(`${BASE}/agendar?servico=svc_corte_barba&barbeiro=barber_carlos`);
await page.getByRole('button', { name: '14:30 — ocupado' }).waitFor();
if (await page.getByRole('button', { name: '14:00', exact: true }).count()) throw new Error('14:00 deveria estar indisponível (conflito)');
step('14:30 aparece como ocupado e 14:00 não é oferecido (conflito de duração)');

// 9–11: barbeiro vê a reserva e confirma
await page.getByRole('tab', { name: /Barbeiro/ }).click();
await expectText(page, 'Nova reserva');
await expectText(page, 'Lucas Oliveira marcou:');
await shot('nova-reserva');
await page.getByRole('alert').getByRole('button', { name: 'Confirmar' }).click();
await page.getByRole('link', { name: 'Agenda' }).first().click();
await page.locator('#apt-' + (await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('cadeira:barber-lab:db'));
  const lucas = db.customers.find((c) => c.name === 'Lucas Oliveira');
  return db.appointments.find((a) => a.customerId === lucas.id).id;
}))).getByText('Confirmado').waitFor();
step('barbeiro confirmou; status mudou para confirmado');

// 12–13: cancelar outro horário
await page.getByText('Rafael Costa').first().click();
await page.getByRole('button', { name: /Cancelar horário/ }).click();
await page.getByRole('button', { name: 'Cliente desmarcou' }).click();
await expectText(page, 'Você acabou de liberar um horário.');
await shot('horario-liberado');
step('cancelamento liberou 16:00');

// 14: oferecer para lista de espera
await page.getByRole('button', { name: /Oferecer horário aos clientes/ }).click();
await expectText(page, '3 clientes podem receber o aviso.');
await shot('oferta');
await page.getByRole('button', { name: /Enviar aviso para 3 clientes/ }).click();
await expectText(page, 'Oferta enviada para 3 clientes.');
await shot('oferta-enviada');
await page.keyboard.press('Escape');
step('oferta enviada para 3 clientes da lista de espera');

// Cliente aceita pelo WhatsApp simulado
await page.getByRole('button', { name: 'WhatsApp simulado' }).click();
await page.getByRole('button', { name: /Felipe Rocha/ }).click();
await shot('whatsapp-oferta');
await page.getByRole('button', { name: 'Quero esse horário' }).click();
await expectText(page, 'Fechado!');
await page.getByRole('dialog', { name: 'WhatsApp simulado' }).getByRole('button', { name: 'Fechar' }).last().click();
await expectText(page, 'Horário recuperado');
await shot('recuperado');
step('Felipe aceitou; horário recuperado');

// 15: métricas
await page.getByRole('link', { name: 'Resultados' }).first().click();
const recoveredAfter = money(await page.locator('section').filter({ hasText: 'Você recuperou' }).locator('span.font-condensed').innerText());
await shot('resultados');
if (recoveredAfter !== recoveredBefore + 70) throw new Error(`valor recuperado ${recoveredBefore} → ${recoveredAfter}`);
step(`valor recuperado: R$ ${recoveredBefore} → R$ ${recoveredAfter}`);

// Lista de espera: sábado à tarde lotado
await page.getByRole('tab', { name: /Cliente/ }).click();
await page.goto(`${BASE}/agendar?servico=svc_corte`);
await page.getByRole('button', { name: /Sem preferência/ }).click();
await page.getByRole('option').filter({ hasText: /Sáb/ }).first().click();
await page.getByRole('button', { name: '15:00 — ocupado' }).click();
await expectText(page, 'Esse horário está ocupado.');
await shot('lista-espera');
await page.getByRole('button', { name: /Entrar na lista de espera/ }).click();
await expectText(page, 'Você está na lista');
step('cliente entrou na lista de espera de sábado 15:00');

// Sincronização entre abas
const other = await ctx.newPage();
await other.goto(`${BASE}/painel`);
await page.goto(`${BASE}/agendar?servico=svc_barba&barbeiro=barber_mateus`);
const firstFree = page.getByRole('button', { name: /^\d\d:\d\d$/ }).first();
const time = await firstFree.innerText();
await firstFree.click();
await page.getByRole('button', { name: 'Continuar' }).click();
await page.getByRole('textbox', { name: 'Nome' }).fill('Teste Sincronia');
await page.getByRole('textbox', { name: /^WhatsApp/ }).fill('11911112222');
await page.getByRole('button', { name: 'Revisar' }).click();
await page.getByRole('button', { name: /Confirmar/ }).click();
await expectText(page, 'Agendamento confirmado');
await expectText(other, 'Teste Sincronia marcou:');
step(`outra aba recebeu a reserva das ${time} sem recarregar`);

if (errors.length) throw new Error('Erros no console:\n' + errors.join('\n'));
console.log('\nRoteiro completo OK');
await browser.close();
