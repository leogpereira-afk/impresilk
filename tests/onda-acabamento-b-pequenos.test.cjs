'use strict';
/* ONDA ACABAMENTO B, ITEM 4: os pequenos da tabela Baixa da auditoria de
   11/10/2026 (passo 11 da seção 2 da fila de 11/10/2026) que ainda não tinham
   saído. Cada teste começa pelo caso ruim (a v172 falha nele). Dados
   fictícios (repositório público). */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {edge} = require('./helpers/edge.cjs');
const D = require('../divisao.js');
const C = require('../conferencia-entrega.js');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const EXP = Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000);
const gestor = {papel: 'pcp', nome: 'Gestor Fictício', sub: 'gestor', exp: EXP};
const toque = {nome: 'Ana', sub: 'Ana', id: '100001', papel: 'montagem', montagemIndividual: true, exp: EXP};
const diario = e => e.db.pcp_registros.filter(r => r.colecao === 'auditoria').map(r => r.registro);

/* ═══════════ 1. Travessão em texto de tela, e a guarda geral ═══════════ */

/* Os travessões (—) do código, fora dos comentários. Vale o "—" sozinho como
   marca de campo vazio (entre aspas, crases, > e <, depois de ||, ? ou :);
   em frase, não (AGENTS.md, seção 1). */
function semComentarios(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  return src.split('\n').map(l => {
    if (/^\s*\/\//.test(l)) return '';
    const m = l.match(/^(.*?)\s\/\/\s.*$/);
    if (m) { const a = m[1], par = c => (a.split(c).length - 1) % 2 === 0; if (par("'") && par('"') && par('`')) return a; }
    return l;
  });
}
function travessoesEmFrase(src) {
  const out = [];
  semComentarios(src).forEach((l, i) => {
    for (let k = l.indexOf('—'); k >= 0; k = l.indexOf('—', k + 1)) {
      const antes = l.slice(0, k).replace(/\s+$/, ''), depois = l.slice(k + 1).replace(/^\s+/, '');
      const sozinho = /['"`>(]$/.test(antes) || /\|\|$/.test(antes) || /\?$/.test(antes) || /:$/.test(antes);
      const fecha = /^['"`<)]/.test(depois) || depois === '';
      if (!(sozinho && fecha)) out.push(`${i + 1}: ${l.trim().slice(0, 120)}`);
    }
  });
  return out;
}
test('travessão: nenhum texto de tela, PDF, aviso ou resposta do servidor com travessão em frase (guarda geral)', () => {
  const arquivos = fs.readdirSync(RAIZ).filter(f => /\.(js|html)$/.test(f) && f !== 'frases.js')
    .concat(['supabase/functions/pcp-sync/index.ts', 'supabase/functions/pcp-mubisys/index.ts'], fs.readdirSync(path.join(RAIZ, 'supabase/functions/_shared')).filter(f => f.endsWith('.mjs')).map(f => 'supabase/functions/_shared/' + f));
  const achados = arquivos.flatMap(f => travessoesEmFrase(ler(f)).map(x => f + ':' + x));
  // Caso ruim (v172): 84 travessões em frase (títulos de PDF, avisos, toasts, as opções "— selecionar —").
  assert.deepEqual(achados, [], 'troque o travessão por dois-pontos, vírgula, ponto ou parênteses');
  // A guarda sabe ver o caso ruim e deixa a marca de campo vazio.
  assert.equal(travessoesEmFrase("toast('Acesso criado — a pessoa troca a senha');").length, 1);
  assert.equal(travessoesEmFrase("const x = v || '—'; const y = `<td>—</td>`; // comentário — livre").length, 0);
});

/* ═══════════ 2. "Foto anexada" só quando a foto entrou ═══════════ */

test('celular: "Foto anexada" só aparece quando a foto entrou; os comentários dizem o que a foto faz', () => {
  const eq = ler('equipe.js');
  // Caso ruim (v172): o aviso vinha depois do await, sem olhar se alguma foto entrou.
  assert.doesNotMatch(eq, /await anexarFotos\([^\n]*porNaLista\('fotosRetornoIds'\)\);\n\s+toast\('Foto anexada/);
  assert.match(eq, /async function anexarFotos\(files, aplicar, depois, avisoOk\)/);
  assert.match(eq, /if \(!ids\.length\) return 0;[\s\S]{0,700}else if \(avisoOk\) toast\(avisoOk\);/);
  assert.match(eq, /porNaLista\('fotosRetornoIds'\), null, 'Foto anexada\. A hora real do retorno deve ser confirmada no campo de horário\.'\)/);
  assert.doesNotMatch(eq, /a primeira carimba a hora de\n\s+\/\/ retorno/);
  assert.doesNotMatch(eq, /\/\/ Fotos de check-in/);
});

/* ═══════════ 3. A faixa da fila no horário de São Paulo, sem piscar ═══════════ */

function faixa() {
  const app = ler('app.js');
  const i = app.indexOf('let _statusFilaPCP;'), j = app.indexOf('\n}\n', app.indexOf('function vigiarFilaPCP(', i)) + 3;
  const box = {textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, remove() { this.removido = true; }};
  const ls = new Map();
  const ctx = vm.createContext({console, Date, ALERTAS_SYNC: require('../alertas-sync.js'), navigator: {onLine: true}, STATE: {user: {papel: 'pcp'}},
    STORE: {getQueue: () => [{action: 'upsert', enfileiradoEm: '2026-10-01T13:00:00.000Z'}]},
    localStorage: {getItem: k => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, v), removeItem: k => ls.delete(k)},
    document: {getElementById: () => box, querySelector: () => ({prepend() {}}), createElement: () => box}});
  vm.runInContext(app.slice(i, j), ctx);
  return {box, run: c => vm.runInContext(c, ctx)};
}
test('faixa da fila: a pendência mais antiga no horário de São Paulo, e a conferência sem status não troca a recusa pela fila comum', () => {
  const f = faixa();
  f.run(`vigiarFilaPCP('recusa')`);
  // Caso ruim (v172): "Mais antiga: 2026-10-01T13:00:00.000Z" (UTC cru).
  assert.match(f.box.textContent, /Mais antiga: 01\/10,? 10:00/);
  assert.doesNotMatch(f.box.textContent, /T13:00|Z$/);
  assert.match(f.box.textContent, /edição recusada/);
  // A conferência da importação chama sem status: a faixa continua dizendo a recusa (antes trocava e piscava).
  f.run(`vigiarFilaPCP()`);
  assert.match(f.box.textContent, /edição recusada/);
});

/* ═══════════ 4. A hora da foto não é do crachá sem senha ═══════════ */

test('foto: o crachá sem senha não confirma a hora da foto (403, fora da fila); a gestão continua confirmando', async () => {
  const id = 'foto_os1_1780000000000_abc';
  const os = {id: 'os1', numero: '90001', rev: 1, tipo: 'externo', equipe: ['100001'], fotosRetornoIds: [id]};
  const e = await edge('pcp-sync', {pcp_registros: [{id: 'os1', colecao: 'os', registro: os, apagado: false, atualizado_em: '2026-10-01T10:00:00Z'},
    {id, colecao: 'foto_evento', registro: {id, osId: 'os1', recebidoEm: '2026-10-01T18:00:00Z', ocorridoEm: null, rev: 0}, apagado: false, atualizado_em: '2026-10-01T18:00:00Z'}],
  registros: [{id: '100001', colecao: 'colaboradores', apagado: false, registro: {nome: 'Ana', cpf: '10000111111'}}]});
  const pedido = {action: 'fotosEvento', osId: 'os1', fileId: id, rev: 0, ocorridoEm: '2026-10-01T15:00:00Z', motivo: 'Hora fictícia escolhida no celular'};
  const r = await e.call(pedido, toque);
  // Caso ruim (v172): 200, e a hora do crachá sem senha passava por cima da confirmada pela gestão.
  assert.equal(r.status, 403, JSON.stringify(r));
  assert.match(r.error, /confirmado pela gestão ou pela montagem com senha/);
  assert.equal(e.db.pcp_registros.find(x => x.id === id).registro.ocorridoEm, null);
  // Só ler as fotos continua valendo para o crachá sem senha.
  assert.notEqual((await e.call({action: 'fotosEvento', osId: 'os1'}, toque)).status, 403);
  const g = await e.call({...pedido, motivo: 'Hora conferida pela gestão'}, gestor);
  assert.equal(g.status, 200, JSON.stringify(g));
});

/* ═══════════ 5. O vínculo da equipe vai ao diário ═══════════ */

test('vínculo de equipe: o vínculo da entrega a uma equipe cadastrada entra no Histórico da O.S. com antes e depois', async () => {
  const equipe = {id: 'aguia', nome: 'Águia fictícia', animal: 'aguia', cor: 'marinho', liderPadraoId: '100001', membros: [{chave: '100001', nome: 'Ana'}, {chave: '100002', nome: 'Bia'}], ativo: true};
  const os = {id: 'os-teste', numero: 'TESTE-A23', rev: 1, tipo: 'externo', equipe: ['100001', '100002'], itens: [{uid: 'p', descricao: 'Painel', qtde: 4, subtotal: 1000}], valorTotal: 1000};
  const aloc = {...D.montar([{equipeId: null, liderId: '100001', membros: ['100001', '100002']}]), por: 'Autor original', em: '2026-09-01T10:00:00Z'};
  const item = C.catalogo(os)[0];
  os.conferenciasEntrega = [{id: 'e1', dia: '2026-09-01', itens: [{chave: item.chave, identidade: item.identidade, qtde: 1}], alocacao: structuredClone(aloc), por: 'Autor original', em: '2026-09-01T10:00:00Z'}];
  const e = await edge('pcp-sync', {pcp_registros: [{id: os.id, colecao: 'os', registro: os, apagado: false, atualizado_em: '2026-09-01'}],
    registros: ['100001', '100002'].map((id, i) => ({id, colecao: 'colaboradores', apagado: false, registro: {nome: ['Ana', 'Bia'][i], cpf: id + '11111'}})),
    pcp_config_global: [{id: true, atualizado_em: '2026-09-01', config: {performancePCP: {equipes: [equipe], participacoes: []}}}], painel_ordens: [{numero: 'TESTE-A23', valor: 1000}]});
  const r = await e.call({action: 'performanceVincularEquipe', osId: os.id, entregaId: 'e1', grupo: 0, rev: 1, equipeId: 'aguia', baseEquipe: JSON.stringify(equipe)}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  const linhas = diario(e).filter(x => x.acao === 'vincular-equipe');
  // Caso ruim (v172): o diff ia sem "campos" e o diário descartava calado.
  assert.equal(linhas.length, 1);
  assert.deepEqual(linhas[0].campos, ['equipeVinculada']);
  assert.equal(linhas[0].antes.equipeVinculada, null);
  assert.equal(linhas[0].depois.equipeVinculada, 'Águia fictícia');
  assert.equal(linhas[0].depois.entregaId, 'e1');
  // A tela dá nome à ação e ao campo.
  assert.match(ler('app.js'), /'vincular-equipe': 'Vinculou a entrega a uma equipe cadastrada'/);
  assert.match(ler('app.js'), /equipeVinculada: 'Equipe cadastrada da entrega'/);
  assert.match(ler('entregas-os.js'), /'vincular-equipe': 'vinculou a entrega a uma equipe cadastrada'/);
});

/* ═══════════ 6. O % de retrabalho do relatório anual conta por O.S. ═══════════ */

test('relatório anual: o % de retrabalho conta cada O.S. uma vez, não cada entrega parcial', async () => {
  const aloc = id => D.montar([{equipeId: null, liderId: id, membros: [id]}]);
  const sel = (o, n, qtde) => { const i = C.catalogo(o)[n]; return {chave: i.chave, identidade: i.identidade, qtde}; };
  const comRetrab = {id: 'r1', numero: '90101', rev: 1, tipo: 'externo', cliente: 'Cliente fictício', valorTotal: 1000, equipe: ['100001'], retrabalho: true, etapaOrigem: 'Instalação',
    itens: [{uid: 'a', item: '1', descricao: 'Painel fictício', qtde: '2', subtotal: '1000'}]};
  comRetrab.conferenciasEntrega = [{id: 'e1', dia: '2026-10-03', itens: [sel(comRetrab, 0, 1)], alocacao: aloc('100001'), por: 'Gestor Fictício', em: '2026-10-03T20:00:00.000Z'},
    {id: 'e2', dia: '2026-10-04', itens: [sel(comRetrab, 0, 1)], alocacao: aloc('100001'), por: 'Gestor Fictício', em: '2026-10-04T20:00:00.000Z'}];
  const semRetrab = {id: 's1', numero: '90102', rev: 1, tipo: 'externo', cliente: 'Cliente fictício', valorTotal: 1000, equipe: ['100001'],
    itens: [{uid: 'b', item: '1', descricao: 'Placa fictícia', qtde: '1', subtotal: '1000'}]};
  semRetrab.conferenciasEntrega = [{id: 'e3', dia: '2026-10-05', itens: [sel(semRetrab, 0, 1)], alocacao: aloc('100001'), por: 'Gestor Fictício', em: '2026-10-05T20:00:00.000Z'}];
  const e = await edge('pcp-sync', {pcp_registros: [comRetrab, semRetrab].map(o => ({id: o.id, colecao: 'os', registro: o, apagado: false, atualizado_em: '2026-10-06T21:00:00Z'})),
    painel_ordens: [{numero: '90101', valor: 1000}, {numero: '90102', valor: 1000}],
    registros: [{id: '100001', colecao: 'colaboradores', apagado: false, registro: {nome: 'Ana', cpf: '10000111111'}}],
    pcp_config_global: [{id: true, atualizado_em: '2020-01-01', config: {performancePCP: {equipes: [], participacoes: []}}}]});
  const r = await e.call({action: 'relatorioEntregas', ano: 2026}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r).slice(0, 300));
  const out = r.meses.find(m => m.mes === '2026-10');
  // Caso ruim (v172): 3 registros (duas parciais da mesma O.S.), 2 com retrabalho: 66,7%.
  assert.equal(out.baseRetrabalho, 2);
  assert.equal(out.retrabalho, 50);
  assert.equal(out.retrabalhos.length, 1);
});

/* ═══════════ 7. A guarda do arquivo do celular ═══════════ */

test('celular: o equipe.js está na casca do sw.js e no equipe.html com a mesma versão, e só muda de propósito', () => {
  const cfg = ler('config.js'), versao = /APP_VERSAO = '(v\d+)'/.exec(cfg)[1];
  const sw = ler('sw.js'), html = ler('equipe.html');
  const shell = new Set([...sw.matchAll(/'([a-z0-9.-]+\.(?:js|css)\?v=v\d+)'/g)].map(m => m[1]));
  // Caso ruim (v172): a comparação do arquivo do celular tinha sido apagada dos testes; nada pegava uma mudança calada.
  assert.ok(shell.has('equipe.js?v=' + versao), 'o equipe.js na casca offline, com a versão do app');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.ok(scripts.includes('equipe.js?v=' + versao));
  for (const s of scripts) assert.ok(shell.has(s), s + ' do equipe.html está na casca do sw.js');
  // A CI confere cada arquivo da casca no site publicado (o laço do deploy.yml sobre o sw.js).
  assert.match(ler('.github/workflows/deploy.yml'), /for f in \$\(grep -o "'\[a-z0-9\.-\]\*\\\.\\\(js\\\|css/);
  /* O CONTEÚDO DO ARQUIVO DO CELULAR. Se uma onda mudar o equipe.js de
     propósito, este número muda junto, no mesmo commit, com o motivo na
     mensagem. Base v196: renderList consulta as rotas autorizadas da equipe;
     a ficha e as ações de execução permanecem iguais. */
  const hash = crypto.createHash('sha256').update(ler('equipe.js')).digest('hex');
  assert.equal(hash, '96731a05c687782aa3d17aa18943a891f613174e458ddcb3389f3b7060d8f68c', 'o equipe.js mudou: confira se foi de propósito e troque o número');
});

/* ═══════════ 8. F25: o bônus manual antigo é só leitura no PCP ═══════════ */

test('F25: o pcp não grava mais o bônus manual antigo (fica o do servidor, sem 422); a tela não tem Aprovar, Pagar nem Reabrir', async () => {
  const cfg = {instaladores: [], bonusPCP: {mes: '2026-09', orcamento: 1000, teto: 0, pontos: {}, itens: []}, performancePCP: {equipes: [], participacoes: []}};
  const e = await edge('pcp-sync', {pcp_config_global: [{id: true, atualizado_em: '2026-10-01T00:00:00Z', config: structuredClone(cfg)}]});
  const novo = {...structuredClone(cfg), bonusPCP: {...cfg.bonusPCP, itens: [{id: '100001', nome: 'Pessoa Fictícia', valor: 1000, status: 'pago', mes: '2026-09'}]}};
  const r = await e.call({action: 'setCfg', baseCfg: cfg, cfg: novo}, gestor);
  assert.notEqual(r.status, 422, JSON.stringify(r));
  // Caso ruim (v172): o pcp marcava o bônus como pago.
  assert.deepEqual(e.db.pcp_config_global[0].config.bonusPCP.itens, []);
  const casa = ler('casa.js');
  assert.doesNotMatch(casa, /data-aprovar=|data-pagar=|data-reabrir=|id="perf-orc"|id="perf-teto"|function gravarBonusCasa/);
});

/* ═══════════ 9. O formato das migrations ═══════════ */

test('migrations: todas no formato AAAAMMDDHHMMSS_nome.sql, sem versão repetida; as já aplicadas com a versão do banco', () => {
  const xs = fs.readdirSync(path.join(RAIZ, 'supabase/migrations'));
  // Caso ruim (v172): 0001 a 0004 e 20261008_demandas, fora do formato das versões aplicadas.
  for (const f of xs) assert.match(f, /^\d{14}_[a-z0-9_]+\.sql$/, f);
  const versoes = xs.map(f => f.slice(0, 14));
  assert.equal(new Set(versoes).size, versoes.length, 'versão repetida');
  // As duas que o banco registrou (schema_migrations, SELECT de 12/10/2026) com a mesma versão.
  assert.ok(xs.includes('20261003153006_pcp_vinculo_equipe_cas.sql'));
  assert.ok(xs.includes('20261008175142_pcp_demandas_isoladas.sql'));
});

/* ═══════════ 10. As Demandas não respondem com o texto do ranking ═══════════ */

test('Demandas: a falha ao conferir o acesso não fala de ranking', () => {
  const s = ler('supabase/functions/pcp-sync/index.ts');
  assert.match(s, /acao === "demandas" \? "Não foi possível conferir seu acesso agora\. Tente novamente\."/);
});
