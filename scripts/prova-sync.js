// Prova das regras de sincronização do PCP. Roda o store.js DE VERDADE com o
// mínimo de navegador simulado, e as funções puras da régua do tempo (app.js)
// extraídas por regex — o app é vanilla, sem módulos, então é assim que dá para
// exercitá-lo fora do navegador.
//
//   node scripts/prova-sync.js
//
// Cobre o que a revisão a olho não pega: carimbo de dia da saída, agenda de
// então, a regra de conflito por `rev` (inclusive a compatibilidade com app em
// cache antigo) e o rev alcançando o item que ficou na fila.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

let falhas = 0, testes = 0;
const eq = (nome, a, b) => {
  testes++;
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { falhas++; console.log(`  ✗ ${nome}\n      esperado: ${JSON.stringify(b)}\n      obtido:   ${JSON.stringify(a)}`); }
  else console.log(`  ✓ ${nome}`);
};

// ── navegador de mentira, só o que store.js toca ao carregar ────────────────
const mem = new Map();
const localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};
const ctx = {
  localStorage,
  indexedDB: { open: () => ({}), deleteDatabase: () => {} },
  navigator: { onLine: true },
  window: { addEventListener: () => {} },
  console,
  fetch: async () => { throw new Error('sem rede no teste'); },
  setTimeout, clearTimeout, AbortController,
  // atob/btoa não são da linguagem, são do navegador — sem eles aqui dentro, o
  // auth.js falharia no teste por falta de ambiente, não por defeito.
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  escape, unescape,
  API_BASE: 'http://teste', API_FN: {},
  crypto: require('crypto').webcrypto,
};
ctx.globalThis = ctx;
vm.createContext(ctx);
// `const STORE` é binding léxico: não aparece no objeto do contexto sozinho.
const STORE = vm.runInContext(fs.readFileSync(`${RAIZ}/store.js`, 'utf8') + '\n;STORE;', ctx);
ctx.STORE = STORE;
console.log('store.js carregou sem ReferenceError\n');

// funções puras do app.js (a régua do tempo)
const app = fs.readFileSync(`${RAIZ}/app.js`, 'utf8');
const trecho = re => { const m = app.match(re); if (!m) throw new Error('não achei: ' + re); return m[0]; };
vm.runInContext([
  trecho(/function ymdLocal\(d\)[\s\S]*?\n}/),
  trecho(/function diaLocalISO\(iso\)[\s\S]*?\n}/),
  trecho(/function agendaEmT\(os, T\)[\s\S]*?\n}/),
  trecho(/function horaDe\(stamp, reserva\)[\s\S]*?\n}/),
].join('\n'), ctx);

// ── 1. carimbo de dia da saída (#26) ────────────────────────────────────────
console.log('#26 carimbarMomento');
{
  const os = { horaSaida: '08:30', instalacao: { data: '2026-08-05' } };
  STORE.carimbarMomento(os, 'horaSaida', 'saidaEm');
  eq('saída herda o dia do agendamento vigente', os.saidaEm, '2026-08-05T08:30:00');

  // choveu: remarcado para o dia 12. O carimbo NÃO pode se mudar de dia.
  os.instalacao.data = '2026-08-12';
  STORE.carimbarMomento(os, 'horaSaida', 'saidaEm');
  eq('reagendar não move a saída já carimbada', os.saidaEm, '2026-08-05T08:30:00');

  os.horaSaida = '09:15';
  STORE.carimbarMomento(os, 'horaSaida', 'saidaEm');
  eq('corrigir a hora mantém o dia', os.saidaEm, '2026-08-05T09:15:00');

  os.horaSaida = '';
  STORE.carimbarMomento(os, 'horaSaida', 'saidaEm');
  eq('apagar a hora apaga o carimbo', os.saidaEm, undefined);

  const sem = { horaRetorno: '17:00' };
  STORE.carimbarMomento(sem, 'horaRetorno', 'retornoEm');
  const hoje = ctx.ymdLocal(new Date());
  eq('sem agendamento cai em hoje', sem.retornoEm.slice(0, 10), hoje);
  eq('dia local bate na volta', ctx.diaLocalISO(sem.retornoEm), hoje);
}

// ── 2. agenda de então, não a de hoje (#26) ─────────────────────────────────
console.log('\n#26 agendaEmT');
{
  const fimDoDia = d => new Date(`${d}T23:59:59`);
  const semLog = { instalacao: { data: '2026-08-12' } };
  eq('sem log usa a agenda atual, marcada como palpite',
    ctx.agendaEmT(semLog, fimDoDia('2026-08-05')), { data: '2026-08-12', exato: false });

  const comLog = {
    instalacao: { data: '2026-08-12' },
    agendaLog: [{ de: '2026-08-05', data: '2026-08-12', em: '2026-08-06T09:00:00' }],
  };
  eq('antes da remarcação vale o "de"',
    ctx.agendaEmT(comLog, fimDoDia('2026-08-05')), { data: '2026-08-05', exato: true });
  eq('depois da remarcação vale o novo dia',
    ctx.agendaEmT(comLog, fimDoDia('2026-08-12')), { data: '2026-08-12', exato: true });
}

// ── 3. o cenário do achado: quem rodou na rua no dia 05? ────────────────────
console.log('\n#26 cenário do achado (saiu dia 05, remarcada p/ 12)');
{
  const os = {
    id: 'x', numero: '1', instalacao: { data: '2026-08-12' },
    horaSaida: '08:30', saidaEm: '2026-08-05T08:30:00',
    agendaLog: [{ de: '2026-08-05', data: '2026-08-12', em: '2026-08-06T09:00:00' }],
  };
  const saiuNoDia = (o, diaISO) => o.saidaEm
    ? ctx.diaLocalISO(o.saidaEm) === diaISO
    : (!!o.horaSaida && (o.instalacao || {}).data === diaISO);
  eq('dia 05 mostra a saída que houve', saiuNoDia(os, '2026-08-05'), true);
  eq('dia 12 não inventa saída', saiuNoDia(os, '2026-08-12'), false);
  eq('hora exibida vem do carimbo', ctx.horaDe(os.saidaEm, os.horaSaida), '08:30');
}

// ── 4. rev: a regra do servidor (#27) ───────────────────────────────────────
console.log('\n#27 regra de conflito do servidor');
{
  // Cópia fiel do trecho do pcp-sync (se mudar lá, este teste tem de mudar).
  const decidir = (existing, os) => {
    const revAtual = typeof existing?.rev === 'number' ? existing.rev : 0;
    if (existing) {
      if (typeof os.rev === 'number') {
        if (revAtual !== os.rev) return 'conflito';
      } else if (existing.atualizadoEm && os.atualizadoEm &&
                 new Date(existing.atualizadoEm).getTime() > new Date(os.atualizadoEm).getTime()) {
        return 'conflito';
      }
    }
    return 'grava rev ' + (revAtual + 1);
  };
  const T = h => `2026-08-16T${h}:00.000Z`;

  eq('relógio adiantado não gera mais conflito falso',
    decidir({ rev: 3, atualizadoEm: T('14:40') }, { rev: 3, atualizadoEm: T('14:10') }), 'grava rev 4');
  eq('escrita concorrente de verdade ainda é conflito',
    decidir({ rev: 4, atualizadoEm: T('14:40') }, { rev: 3, atualizadoEm: T('14:50') }), 'conflito');
  eq('O.S recém-importada (sem rev dos dois lados) grava',
    decidir({ atualizadoEm: T('10:00') }, { atualizadoEm: T('11:00') }), 'grava rev 1');
  eq('app em cache antigo continua na regra do relógio',
    decidir({ rev: 7, atualizadoEm: T('10:00') }, { atualizadoEm: T('11:00') }), 'grava rev 8');
  eq('app antigo com versão velha ainda leva conflito',
    decidir({ rev: 7, atualizadoEm: T('12:00') }, { atualizadoEm: T('11:00') }), 'conflito');
  eq('O.S nova (não existe no servidor) grava',
    decidir(null, { atualizadoEm: T('11:00') }), 'grava rev 1');
}

// ── 5. o rev alcança a fila, com edição DURANTE o envio (#27) ───────────────
// Esta é a aresta que gera conflito falso se escapar: o item continua na fila
// (o usuário salvou de novo enquanto o anterior voava) e, se ficasse com o rev
// velho, o próximo envio bateria em conflito contra a nossa própria escrita.
async function provaRevNaFila() {
  console.log('\n#27 rev chega no registro E no item que ficou na fila');
  mem.clear();
  const base = { id: 'os-1', numero: '9', rev: 2, atualizadoEm: '2026-08-16T10:00:00.000Z' };
  mem.set('impresilk_inst_os', JSON.stringify([{ ...base }]));
  mem.set('impresilk_inst_fila', JSON.stringify([{ action: 'upsert', os: { ...base } }]));

  const enviados = [];
  ctx.fetch = async (_url, opts) => {
    const corpo = JSON.parse(opts.body);
    enviados.push(corpo);
    if (corpo.action === 'upsert') {
      // O usuário salva de novo NO MEIO do envio: a fila ganha versão mais nova.
      mem.set('impresilk_inst_fila', JSON.stringify([
        { action: 'upsert', os: { ...base, atualizadoEm: '2026-08-16T10:00:05.000Z' } },
      ]));
      return { ok: true, status: 200, json: async () => ({ ok: true, os: { ...corpo.os, rev: 3 } }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  await STORE.trySync();
  eq('mandou o rev que tinha lido', enviados[0].os.rev, 2);
  const fila = JSON.parse(mem.get('impresilk_inst_fila'));
  eq('a edição feita durante o envio continua na fila', fila.length, 1);
  eq('...e herdou o rev novo do servidor', fila[0].os.rev, 3);
  eq('o registro local também', JSON.parse(mem.get('impresilk_inst_os'))[0].rev, 3);
  eq('sem edição em voo o timestamp NÃO foi tocado à toa',
    JSON.parse(mem.get('impresilk_inst_os'))[0].atualizadoEm, '2026-08-16T10:00:00.000Z');
}

// ── 6. limparCache respeita trabalho pendente (#24) ─────────────────────────
console.log('\n#24 limparCache');
{
  mem.clear();
  mem.set('impresilk_inst_os', JSON.stringify([{ id: 'a', cliente: 'Fulano' }]));
  mem.set('impresilk_inst_cfg', JSON.stringify({
    instaladores: ['Osmane'], usuarios: [{ nome: 'Leo', senha: 'x' }],
    funcionarios: [{ nome: 'Ana', numero: '3399' }],
  }));
  mem.set('impresilk_inst_fila', JSON.stringify([{ action: 'upsert', os: { id: 'a' } }]));
  eq('com fila pendente NÃO limpa', STORE.limparCache(), false);
  eq('e as O.S continuam no aparelho', JSON.parse(mem.get('impresilk_inst_os')).length, 1);

  mem.set('impresilk_inst_fila', JSON.stringify([]));
  eq('fila vazia limpa', STORE.limparCache(), true);
  eq('O.S saíram', localStorage.getItem('impresilk_inst_os'), null);
  eq('marca de último sync saiu', localStorage.getItem('impresilk_inst_lastsync'), null);
  const cfg = JSON.parse(mem.get('impresilk_inst_cfg'));
  eq('lista de instaladores fica (o espelho precisa dela)', cfg.instaladores, ['Osmane']);
  eq('usuários saem', cfg.usuarios, undefined);
  eq('agenda de telefones sai', cfg.funcionarios, undefined);
}

// ── 7. entrada única: crachá sem usuário salvo (auth.js) ────────────────────
// O Painel planta SÓ o crachá no localStorage (mesmo endereço). Se o app exigir
// também um usuário salvo, a pessoa chega com credencial válida no bolso e vê a
// tela de senha assim mesmo — foi o que trancou o dono da casa fora do PCP.
function provaDonoDoCracha() {
  console.log('\nentrada única · AUTH.dono()');
  vm.runInContext(fs.readFileSync(`${RAIZ}/auth.js`, 'utf8') + '\n;AUTH;', ctx);
  const AUTH = vm.runInContext('AUTH', ctx);
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const cracha = corpo => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(corpo)}.assinatura`;
  const daqui = Math.floor(Date.now() / 1000) + 3600;
  const por = t => { mem.set('impresilk_inst_cracha', t); return AUTH.dono(); };

  eq('crachá bom identifica a pessoa',
    por(cracha({ sis: 'pcp', sub: 'leo', nome: 'Leo', papel: 'admin', exp: daqui })),
    { usuario: 'leo', nome: 'Leo', papel: 'admin' });
  eq('crachá vencido não entra',
    por(cracha({ sis: 'pcp', sub: 'leo', nome: 'Leo', papel: 'admin', exp: Math.floor(Date.now() / 1000) - 1 })), null);
  eq('crachá sem exp não entra',
    por(cracha({ sis: 'pcp', sub: 'leo', nome: 'Leo', papel: 'admin' })), null);
  eq('crachá de OUTRO sistema não entra',
    por(cracha({ sis: 'rh', sub: 'leo', nome: 'Leo', papel: 'admin', exp: daqui })), null);
  eq('texto que não é crachá não entra', por('lixo-sem-pontos'), null);
  mem.delete('impresilk_inst_cracha');
}

provaRevNaFila().then(provaDonoDoCracha).then(() => {
  console.log(`\n${testes - falhas}/${testes} passaram`);
  process.exit(falhas ? 1 : 0);
});
