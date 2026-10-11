'use strict';
/* ENSAIO DE RECUPERAÇÃO DO BACKUP DO PCP (auditoria do PCP v164, 11/10/2026:
   A2, M20, M21, M29 e a linha Baixa "O.S. excluída pode voltar numa
   restauração feita só pelo Hub").

   O ensaio anterior (scripts/ensaio-recuperacao.cjs) restaurava um pacote
   inventado, com chaves que o arquivo do Hub não tem, e não cobria comissão
   nem lápides. Este passa pelo caminho de verdade, inteiro em memória, com
   dados fictícios e sem rede nem credencial:

     1. um PCP de mentira com o servidor REAL (pcp-sync, pelos helpers dos
        testes): O.S. viva, O.S. excluída pela ação delete (lápide), diário,
        fotos subidas pelo putPhoto (horário em foto_evento), demanda com
        anexo, versão de regra, o mês fechado pela performanceFechar (selo) e
        a comissão prévia, aprovada e exportada (CSV);
     2. a exportação pela porta nova exportarBackup (só da máquina), página a
        página, e a cópia dos buckets por sha256 no mesmo desenho do Hub
        (arquivos/<bucket>/<sha256>); o pacote sai no formato pcp-backup-5,
        o mesmo que o painel-backup grava em pcp/AAAA-MM-DD.json;
     3. a volta num PCP vazio (restaurarPacote) e as provas: a lápide
        continua lápide; o selo e a comissão voltam e o servidor, ao
        exportar de novo, recalcula e confere o hash do selo (CSV idêntico);
        o mês continua fechado para regra nova; cada foto volta com o mesmo
        sha256 e o getPhoto devolve os mesmos bytes;
     4. os casos ruins: arquivo corrompido no destino, lápide faltando no
        pacote, volta por cima de uma base que não está vazia, e a volta do
        jeito antigo (só o `list`), que reabria o mês e perdia a lápide.

   Uso:
     node scripts/ensaio-backup-pcp.cjs
       (o ensaio fictício; grava pacote.json e resultado.json numa pasta
       temporária própria e imprime o resultado)
     node scripts/ensaio-backup-pcp.cjs --arquivo <pcp/AAAA-MM-DD.json> [--copia <clone de backups-impresilk>]
       (confere um arquivo real do Hub e o restaura numa caixa de areia EM
       MEMÓRIA; com --copia, confere o sha256 de cada foto no clone. Não grava
       nada e imprime só contagens: nada de dado real na tela.) */
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const {edge} = require('../tests/helpers/edge.cjs');

const BUCKETS = ['pcp-arquivos', 'pcp-demandas'];
const OBRIGATORIAS = ['os', 'auditoria', 'foto_evento', 'performance_fechamentos', 'performance_regras', 'performance_comissao', 'performance_comissao_os_versoes'];
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const SHA = /^[a-f0-9]{64}$/;

// ---------------------------------------------------------------- Storage em memória
function bucketMemoria() {
  const mapa = new Map();
  return {
    _mapa: mapa,
    async upload(caminho, bytes, opcoes = {}) {
      if (mapa.has(caminho) && !opcoes.upsert) return {data: null, error: {statusCode: '409', message: 'The resource already exists'}};
      const b = Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
      mapa.set(caminho, {bytes: b, tipo: opcoes.contentType || 'application/octet-stream', em: new Date().toISOString()});
      return {data: {path: caminho}, error: null};
    },
    async download(caminho) {
      const a = mapa.get(caminho);
      return a ? {data: new Blob([a.bytes], {type: a.tipo}), error: null} : {data: null, error: {statusCode: '404', message: 'Object not found'}};
    },
    async remove(caminhos) { for (const c of caminhos) mapa.delete(c); return {data: [], error: null}; },
    async createSignedUrl(caminho) { return mapa.has(caminho) ? {data: {signedUrl: 'memoria://' + caminho}, error: null} : {data: null, error: {message: 'Object not found'}}; },
    async list(prefixo = '', {limit = 100, offset = 0} = {}) {
      const pre = prefixo ? prefixo + '/' : '', nomes = new Map();
      for (const [c, a] of mapa) {
        if (!c.startsWith(pre)) continue;
        const resto = c.slice(pre.length), barra = resto.indexOf('/');
        if (barra >= 0) nomes.set(resto.slice(0, barra), {name: resto.slice(0, barra), id: null});
        else nomes.set(resto, {name: resto, id: 'id:' + c, updated_at: a.em, metadata: {size: a.bytes.length, mimetype: a.tipo, eTag: '"' + sha256(a.bytes).slice(0, 32) + '"'}});
      }
      return {data: [...nomes.values()].sort((x, y) => (x.name < y.name ? -1 : 1)).slice(offset, offset + limit), error: null};
    },
  };
}
function storageMemoria() {
  const buckets = {};
  return {buckets, from: nome => (buckets[nome] ||= bucketMemoria())};
}

// ---------------------------------------------------------------- ida: porta nova + cópia por sha256
async function exportarPeloServidor(e, {limite} = {}) {
  const registros = [], demandas = [], vistos = new Set(), cursores = new Set();
  let cursor = null, primeira = null, ultima = null, paginas = 0;
  for (; paginas < 1000; paginas++) {
    const r = await e.call({action: 'exportarBackup', ...(cursor ? {cursor} : {}), ...(limite ? {limite} : {})});
    if (r.status !== 200) throw new Error('A exportação recusou: ' + (r.error || r.status));
    if (!primeira) primeira = r;
    for (const l of r.registros) { const k = l.colecao + '\u0000' + l.id; if (vistos.has(k)) throw new Error('Linha repetida na exportação.'); vistos.add(k); registros.push(l); }
    for (const d of r.demandas) { const k = 'd\u0000' + d.id; if (vistos.has(k)) throw new Error('Demanda repetida na exportação.'); vistos.add(k); demandas.push(d); }
    ultima = r;
    if (r.nextCursor == null) break;
    if (cursores.has(r.nextCursor)) throw new Error('Cursor repetido.');
    cursores.add(r.nextCursor); cursor = r.nextCursor;
  }
  return {pcp_registros: registros, pcp_demandas: demandas, cfg: primeira.cfg, cfgVersao: primeira.cfgVersao,
    contagemInicio: primeira.contagemInicio, contagemFim: ultima.contagemFim, formato: primeira.formato, paginas: paginas + 1};
}

async function listarTudo(bucket, prefixo = '', out = []) {
  for (let offset = 0; ; offset += 100) {
    const {data, error} = await bucket.list(prefixo, {limit: 100, offset});
    if (error) throw new Error(error.message);
    for (const item of data || []) {
      const caminho = [prefixo, item.name].filter(Boolean).join('/');
      if (!item.id) await listarTudo(bucket, caminho, out); else out.push(caminho);
    }
    if (!data || data.length < 100) return out;
  }
}
// O destino do Hub é endereçado pelo conteúdo: arquivos/<bucket>/<sha256>.
async function copiarArquivos(storage, destino) {
  const manifesto = {};
  for (const nome of BUCKETS) {
    manifesto[nome] = [];
    for (const caminho of (await listarTudo(storage.from(nome))).sort()) {
      const {data, error} = await storage.from(nome).download(caminho);
      if (error || !data) throw new Error('Arquivo não copiado: ' + caminho);
      const bytes = Buffer.from(await data.arrayBuffer()), h = sha256(bytes);
      destino.set(`arquivos/${nome}/${h}`, bytes);
      manifesto[nome].push({caminho, tipo: data.type || 'application/octet-stream', bytes: bytes.length, sha256: h});
    }
  }
  return manifesto;
}

function contarLinhas(linhas) {
  const out = {};
  for (const l of linhas) { const c = (out[l.colecao] ||= {total: 0, apagados: 0}); c.total++; if (l.apagado === true) c.apagados++; }
  return out;
}
function montarPacote(exp, manifesto, exportadoEm = new Date().toISOString()) {
  return {versao: 5, formato: 'pcp-backup-5', sistema: 'pcp', nome: 'PCP fictício', exportadoEm,
    origem: {acao: 'exportarBackup', formato: exp.formato, paginas: exp.paginas},
    cfg: exp.cfg, cfgVersao: exp.cfgVersao, pcp_registros: exp.pcp_registros, pcp_demandas: exp.pcp_demandas,
    contagem: {inicio: exp.contagemInicio, fim: exp.contagemFim, exportado: {pcp_registros: contarLinhas(exp.pcp_registros), pcp_demandas: exp.pcp_demandas.length}},
    divergencias: [], destinoArquivos: 'arquivos/<bucket>/<sha256>', arquivos: manifesto,
    arquivosCompletos: true, arquivosPendentes: 0};
}

// ---------------------------------------------------------------- volta
function validarPacote(p) {
  if (!p || p.versao !== 5 || p.formato !== 'pcp-backup-5') throw new Error('Pacote fora do formato pcp-backup-5.');
  if (!Array.isArray(p.pcp_registros) || !Array.isArray(p.pcp_demandas)) throw new Error('Pacote sem registros.');
  if (!p.cfg || typeof p.cfg !== 'object') throw new Error('Pacote sem a configuração.');
  const vistos = new Set();
  for (const l of p.pcp_registros) {
    if (!l || typeof l.colecao !== 'string' || typeof l.id !== 'string' || !l.registro || typeof l.registro !== 'object' || typeof l.apagado !== 'boolean') throw new Error('Linha inválida no pacote.');
    const k = l.colecao + '\u0000' + l.id; if (vistos.has(k)) throw new Error('Linha repetida no pacote.'); vistos.add(k);
  }
  for (const d of p.pcp_demandas) { if (!d || typeof d.id !== 'string' || vistos.has('d\u0000' + d.id)) throw new Error('Demanda inválida ou repetida.'); vistos.add('d\u0000' + d.id); }
  // A contagem do pacote é a do que está nele; e o que está nele fica entre o antes e o depois do PCP.
  const real = contarLinhas(p.pcp_registros), ini = p.contagem?.inicio?.pcp_registros || {}, fim = p.contagem?.fim?.pcp_registros || {};
  assert.deepEqual(p.contagem?.exportado?.pcp_registros, real, 'A contagem do pacote não confere com as linhas dele.');
  for (const c of OBRIGATORIAS) if (!fim[c]) throw new Error(`A contagem do PCP não traz a coleção ${c}.`);
  for (const c of new Set([...Object.keys(real), ...Object.keys(fim)])) {
    const n = real[c]?.total || 0, a = ini[c]?.total || 0, b = fim[c]?.total;
    if (typeof b !== 'number' || n < a || n > b) throw new Error(`A contagem não confere em ${c}: ${n} no pacote, esperadas de ${a} a ${b}.`);
    const la = ini[c]?.apagados, lb = fim[c]?.apagados;
    if (la === lb && typeof la === 'number' && (real[c]?.apagados || 0) !== la) throw new Error(`A contagem de lápides não confere em ${c}.`);
  }
  if (p.pcp_demandas.length < (p.contagem.inicio.pcp_demandas || 0) || p.pcp_demandas.length > p.contagem.fim.pcp_demandas) throw new Error('A contagem de demandas não confere.');
  let arquivos = 0;
  for (const [bucket, lista] of Object.entries(p.arquivos || {})) {
    if (!BUCKETS.includes(bucket) || !Array.isArray(lista)) throw new Error('Bucket desconhecido no pacote.');
    const caminhos = new Set();
    for (const a of lista) {
      if (!a || typeof a.caminho !== 'string' || a.caminho.startsWith('/') || a.caminho.split('/').some(s => !s || s === '.' || s === '..') || caminhos.has(a.caminho)) throw new Error('Caminho de arquivo inválido ou repetido.');
      if (!SHA.test(a.sha256) || !Number.isInteger(a.bytes) || a.bytes < 0) throw new Error('Arquivo sem sha256 ou tamanho.');
      caminhos.add(a.caminho); arquivos++;
    }
  }
  return {colecoes: real, lapides: Object.values(real).reduce((n, c) => n + c.apagados, 0), demandas: p.pcp_demandas.length, arquivos};
}

/* A VOLTA, num PCP VAZIO (projeto novo): primeiro confere TODOS os arquivos
   pelo sha256, depois sobe os arquivos, depois grava as linhas como vieram
   (o `apagado` de cada uma, inclusive; lápide volta lápide), as demandas com a
   revisão e a configuração. Nada é recalculado: o selo e a comissão voltam
   byte a byte, e é o servidor que confere o hash quando alguém exporta. */
async function restaurarPacote(p, alvo) {
  const resumo = validarPacote(p);
  if (!(await alvo.vazio())) throw new Error('A volta é para um PCP vazio (projeto novo). Este já tem dados.');
  const preparados = [];
  for (const bucket of BUCKETS) for (const a of p.arquivos?.[bucket] || []) {
    const bytes = await alvo.lerCopia(bucket, a.sha256);
    if (!bytes || bytes.length !== a.bytes || sha256(bytes) !== a.sha256) throw new Error('A conferência do arquivo falhou: ' + bucket + '/' + a.caminho);
    preparados.push({bucket, ...a, conteudo: bytes});
  }
  for (const a of preparados) await alvo.subirArquivo(a.bucket, a.caminho, a.conteudo, a.tipo);
  await alvo.gravarRegistros(p.pcp_registros.map(l => ({colecao: l.colecao, id: l.id, registro: l.registro, apagado: l.apagado, atualizado_em: l.atualizado_em})));
  await alvo.gravarDemandas(p.pcp_demandas.map(d => ({id: d.id, registro: d.registro, revision: d.revision, mutation_id: d.mutation_id, atualizado_em: d.atualizado_em})));
  await alvo.gravarConfig(p.cfg, p.cfgVersao);
  return {...resumo, arquivosRestaurados: preparados.length};
}

// O alvo da volta numa caixa de areia: o banco falso e o Storage em memória do servidor real.
function alvoSandbox(e, storage, destino) {
  return {
    vazio: async () => !e.db.pcp_registros.length && !(e.db.pcp_demandas || []).length,
    lerCopia: async (bucket, h) => destino.get(`arquivos/${bucket}/${h}`) || null,
    async subirArquivo(bucket, caminho, bytes, tipo) {
      const {data} = await storage.from(bucket).download(caminho);
      if (data) { if (sha256(Buffer.from(await data.arrayBuffer())) !== sha256(bytes)) throw new Error('Já existe um arquivo diferente em ' + caminho); return; }
      const {error} = await storage.from(bucket).upload(caminho, bytes, {contentType: tipo, upsert: false});
      if (error) throw new Error('Não foi possível subir ' + caminho);
    },
    gravarRegistros: async linhas => { e.db.pcp_registros.push(...structuredClone(linhas)); },
    gravarDemandas: async linhas => { (e.db.pcp_demandas ||= []).push(...structuredClone(linhas)); },
    gravarConfig: async (cfg, versao) => { e.db.pcp_config_global = [{id: true, config: structuredClone(cfg), atualizado_em: versao}]; },
  };
}

// ---------------------------------------------------------------- o PCP fictício
const HOJE = '2026-12-02T12:00:00Z', NOVEMBRO = {de: '2026-11-01', ate: '2026-11-30'};
// O crachá vale até depois do relógio do servidor (que corre no futuro, abaixo).
const exp = Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000);
const GESTOR = {papel: 'pcp', nome: 'Gestor fictício', sub: 'gestor', exp};
const TOQUE = {papel: 'montagem', montagemIndividual: true, nome: 'Ana', sub: 'Ana', exp};
const doc = {origem: 'Vistoria PCP', evidencia: 'Foto e aceite fictícios 001', justificativa: 'Conferido pela gestão fictícia'};
const membros = [{chave: '100001', nome: 'Pessoa 1', percentual: 60}, {chave: '100002', nome: 'Pessoa 2', percentual: 40}];
const relogio = (e, iso) => e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date);
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [${JSON.stringify(iso)}])); } static now() { return +new R(${JSON.stringify(iso)}); } }; }`);
const osFicticia = (id, extra) => ({colecao: 'os', id, apagado: false, atualizado_em: '2026-11-01T10:00:00Z',
  registro: {id, rev: 1, numero: 'QA-' + id, tipo: 'externo', cliente: 'Cliente fictício', equipe: ['100001', '100002'], ...extra}});
// Um PNG de 1x1 e um "PDF" mínimo, fictícios.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64');
const PDF = Buffer.from('%PDF-1.4\n% anexo fictício do ensaio\n%%EOF\n');

async function servidorVazio(storage) {
  const e = await edge('pcp-sync', {pcp_registros: [], pcp_config_global: [], pcp_demandas: [],
    registros: [1, 2, 3].map(i => ({colecao: 'colaboradores', id: 'p' + i, apagado: false, registro: {id: 'p' + i, nome: 'Pessoa ' + i, cpf: '10000' + i + '12345'}})),
    painel_ordens: []});
  e.cliente.storage = storage; relogio(e, HOJE);
  return e;
}

async function montarOriginal() {
  const storage = storageMemoria(), e = await servidorVazio(storage);
  e.db.pcp_config_global = [{id: true, atualizado_em: '2026-11-01T00:00:00Z', config: {instaladores: ['Ana'],
    performancePCP: {equipes: [], participacoes: [{id: 'os1', membros, por: 'Gestor', em: '2026-11-10'}]}}}];
  e.db.pcp_registros.push(osFicticia('os1', {finalizadaEm: '2026-11-10T15:00:00Z', valorTotal: 120000}));
  e.db.pcp_registros.push(osFicticia('os-aberta', {}));
  e.db.pcp_registros.push(osFicticia('os-excluir', {}));
  const ok = (r, o) => { assert.equal(r.status, 200, o + ': ' + JSON.stringify(r)); return r; };
  // O trabalho do mês acontece em novembro; o fechamento, em dezembro (o relógio
  // parado do servidor faria toda gravação parecer feita durante a apuração).
  relogio(e, '2026-11-20T12:00:00Z');
  // Fotos pelo putPhoto de verdade (grava o horário em foto_evento) e a prova na O.S. finalizada.
  const fotos = ['foto_os1_1764000000000_a1', 'foto_os1_1764000000001_b2'];
  for (const id of fotos) ok(await e.call({action: 'putPhoto', fileId: id, base64: 'data:image/png;base64,' + PNG.toString('base64'), mime: 'image/png'}, GESTOR), 'putPhoto');
  e.db.pcp_registros.find(r => r.id === 'os1').registro.fotosRetornoIds = fotos;
  // Uma O.S. excluída pela ação de verdade: vira lápide e entra no diário.
  ok(await e.call({action: 'delete', id: 'os-excluir', rev: 1, motivo: 'Registro duplicado fictício'}, GESTOR), 'delete');
  // Uma demanda com anexo no bucket pcp-demandas (<demanda>/<sha256>, como o servidor grava).
  e.db.pcp_demandas.push({id: 'dem-1', registro: {id: 'dem-1', titulo: 'Demanda fictícia', anexos: [{id: 'm1', path: 'dem-1/' + sha256(PDF), nome: 'anexo.pdf'}]}, revision: 3, mutation_id: 'mut-3', atualizado_em: '2026-11-20T10:00:00Z'});
  await storage.from('pcp-demandas').upload('dem-1/' + sha256(PDF), PDF, {contentType: 'application/pdf'});
  // Uma versão de regra vigente desde 01/11, igual à embutida.
  const R = require('../regras.js');
  ok(await e.call({action: 'performanceRegraNova', regra: JSON.parse(JSON.stringify({...R.REGRA_EMBUTIDA, validaDesde: '2026-11-01'})), motivo: 'Primeira versão fictícia', anterior: '', requestId: 'ensaio-regra-0001'}, GESTOR), 'regra');
  relogio(e, HOJE);
  // O mês fechado como a tela fecha (nota por valor), a prévia, a aprovação e o CSV.
  const fonte = ok(await e.call({action: 'performancePeriodo', ...NOVEMBRO, notaPorValor: true}, GESTOR), 'período');
  const fech = ok(await e.call({action: 'performanceFechar', ...fonte.periodo, hash: fonte.hash, anterior: '', requestId: 'ensaio-fechar-0001', motivo: 'Fechamento fictício do mês', leGrupos: true, leEntregasItens: true, notaPorValor: true}, GESTOR), 'fechar').fechamento;
  const entrada = {config: {modo: 'efetivo', inicioEfetivo: '2026-11-01', decisaoGestao: 'Autorização fictícia para teste', criteriosExtras: 'somente_falha_comprovada'},
    decisoes: Object.fromEntries(fech.registros.map(r => [r.osId || r.id, {...doc, decisao: 'sem_falha', tipo: 'nenhuma'}])),
    entregas: Object.fromEntries(fech.registros.map(r => [r.id, {...doc, entregue: true, grupos: [{montadorId: '100001'}], interna: {...doc, situacao: 'nao_aplicavel'}}]))};
  const previa = ok(await e.call({action: 'performanceComissaoNova', ...NOVEMBRO, fechamentoId: fech.id, anterior: '', entrada, motivo: 'Prévia fictícia', requestId: 'ensaio-previa-0001'}, GESTOR), 'prévia').revisao;
  const aprovada = ok(await e.call({action: 'performanceComissaoAprovar', ...NOVEMBRO, anterior: previa.id, hash: previa.hash, motivo: 'Aprovação fictícia', confirmacao: true, requestId: 'ensaio-aprovar-0001'}, GESTOR), 'aprovar').revisao;
  const csv = ok(await e.call({action: 'performanceComissaoExportar', ...NOVEMBRO, id: aprovada.id}, GESTOR), 'exportar').csv;
  return {e, storage, fotos, fech, aprovada, csv};
}

const ordenar = linhas => [...linhas].sort((a, b) => (a.colecao + '\u0000' + a.id < b.colecao + '\u0000' + b.id ? -1 : 1));

async function executar({gravar = true} = {}) {
  const checks = [], provar = (nome, fn) => Promise.resolve(fn()).then(() => checks.push(nome));
  const orig = await montarOriginal();
  const linhasOriginais = ordenar(structuredClone(orig.e.db.pcp_registros));

  // IDA: a porta nova, em páginas pequenas para cruzar a fronteira das coleções.
  const exp = await exportarPeloServidor(orig.e, {limite: 3});
  const destino = new Map();
  const manifesto = await copiarArquivos(orig.storage, destino);
  const pacote = montarPacote(exp, manifesto, HOJE);
  await provar('exportação pela porta nova: todas as linhas, sem repetir, com a contagem conferida', () => {
    assert.deepEqual(ordenar(pacote.pcp_registros), linhasOriginais);
    validarPacote(pacote);
  });
  // O pacote passa por JSON, como o arquivo do Hub.
  const lido = JSON.parse(JSON.stringify(pacote));

  // VOLTA num PCP vazio.
  const storage2 = storageMemoria(), e2 = await servidorVazio(storage2);
  const volta = await restaurarPacote(lido, alvoSandbox(e2, storage2, destino));
  await provar('volta: as mesmas linhas, com o apagado e o atualizado_em de cada uma', () => {
    assert.deepEqual(ordenar(e2.db.pcp_registros), linhasOriginais);
    assert.deepEqual(e2.db.pcp_demandas, orig.e.db.pcp_demandas);
    assert.deepEqual(e2.db.pcp_config_global[0].config, orig.e.db.pcp_config_global[0].config);
  });
  await provar('lápide continua lápide: fora da lista, na lista de excluídas, e o celular recebe "excluída"', async () => {
    const lista = await e2.call({action: 'list'}, GESTOR);
    assert.ok(!lista.os.some(o => o.id === 'os-excluir'));
    const excl = await e2.call({action: 'excluidasOS'}, GESTOR);
    assert.deepEqual(excl.os.map(o => o.id), ['os-excluir']);
    const toque = await e2.call({action: 'upsert', os: {id: 'os-excluir', rev: 2, obsTecnicas: 'x'}}, TOQUE);
    assert.equal(toque.status, 422); assert.equal(toque.definitivo, true); assert.match(toque.error, /excluída/);
    assert.equal(e2.db.pcp_registros.find(r => r.id === 'os-excluir').registro.numero, 'QA-os-excluir', 'o número continua ocupado pela lápide');
  });
  await provar('selo e comissão voltam: o servidor recalcula, o hash do selo confere e o CSV é idêntico', async () => {
    const f = await e2.call({action: 'performanceFechamentos', ...NOVEMBRO}, GESTOR);
    assert.equal(f.fechamentos[0].id, orig.fech.id); assert.equal(f.fechamentos[0].hash, orig.fech.hash);
    const l = await e2.call({action: 'performanceComissaoListar', ...NOVEMBRO}, GESTOR);
    const ap = l.revisoes.find(r => r.id === orig.aprovada.id);
    assert.equal(ap.hash, orig.aprovada.hash); assert.equal(ap.tipo, 'aprovacao');
    const x = await e2.call({action: 'performanceComissaoExportar', ...NOVEMBRO, id: orig.aprovada.id}, GESTOR);
    assert.equal(x.status, 200, JSON.stringify(x));
    assert.equal(sha256(x.csv), sha256(orig.csv));
  });
  await provar('mês fechado continua fechado: regra nova com data dentro dele é recusada (409)', async () => {
    const R = require('../regras.js');
    const regras = await e2.call({action: 'performanceRegras'}, GESTOR);
    const r = await e2.call({action: 'performanceRegraNova', regra: {...R.REGRA_EMBUTIDA, validaDesde: '2026-11-15'}, motivo: 'Tentativa fictícia', anterior: regras.versoes[0].id, requestId: 'ensaio-regra-0002'}, GESTOR);
    assert.equal(r.status, 409); assert.match(r.error, /período já fechado/);
  });
  await provar('fotos voltam pelo sha256 e o getPhoto devolve os mesmos bytes', async () => {
    for (const bucket of BUCKETS) for (const a of lido.arquivos[bucket]) {
      const {data} = await storage2.from(bucket).download(a.caminho);
      assert.equal(sha256(Buffer.from(await data.arrayBuffer())), a.sha256);
    }
    for (const id of orig.fotos) {
      const antes = await orig.e.call({action: 'getPhoto', fileId: id}, GESTOR), depois = await e2.call({action: 'getPhoto', fileId: id}, GESTOR);
      assert.equal(depois.status, 200); assert.equal(depois.base64, antes.base64);
    }
    assert.equal(volta.arquivosRestaurados, 3);
  });

  // CASOS RUINS.
  await provar('arquivo corrompido no destino: a volta recusa antes de gravar qualquer coisa', async () => {
    const ruim = new Map(destino), chave = `arquivos/pcp-arquivos/${lido.arquivos['pcp-arquivos'][0].sha256}`;
    const b = Buffer.from(ruim.get(chave)); b[b.length - 1] ^= 1; ruim.set(chave, b);
    const s3 = storageMemoria(), e3 = await servidorVazio(s3);
    await assert.rejects(restaurarPacote(lido, alvoSandbox(e3, s3, ruim)), /conferência do arquivo/);
    assert.equal(e3.db.pcp_registros.length, 0); assert.equal(s3.from('pcp-arquivos')._mapa.size, 0);
  });
  await provar('pacote sem a lápide: a contagem recusa', () => {
    const sem = structuredClone(lido); sem.pcp_registros = sem.pcp_registros.filter(l => !l.apagado);
    sem.contagem.exportado.pcp_registros = contarLinhas(sem.pcp_registros);
    assert.throws(() => validarPacote(sem), /contagem/i);
  });
  await provar('volta por cima de um PCP com dados: recusada', async () => {
    await assert.rejects(restaurarPacote(lido, alvoSandbox(e2, storage2, destino)), /PCP vazio/);
  });
  await provar('a volta do jeito antigo (só o list do Hub) perdia a lápide e reabria o mês', async () => {
    const velho = await orig.e.call({action: 'list'});
    const s4 = storageMemoria(), e4 = await servidorVazio(s4);
    e4.db.pcp_config_global = [{id: true, atualizado_em: '2026-11-01T00:00:00Z', config: structuredClone(orig.e.db.pcp_config_global[0].config)}];
    for (const o of velho.os) e4.db.pcp_registros.push({colecao: 'os', id: o.id, apagado: false, atualizado_em: '2026-12-01T00:00:00Z', registro: o});
    assert.equal(e4.db.pcp_registros.some(r => r.id === 'os-excluir'), false, 'a lápide não estava no arquivo antigo');
    const R = require('../regras.js');
    const r = await e4.call({action: 'performanceRegraNova', regra: {...R.REGRA_EMBUTIDA, validaDesde: '2026-11-15'}, motivo: 'Tentativa fictícia', anterior: '', requestId: 'ensaio-regra-0003'}, GESTOR);
    assert.equal(r.status, 200, 'sem o selo, o mês fechado reabria');
  });

  const resultado = {ambiente: 'fictício, servidor real (pcp-sync) com banco e Storage em memória; sem rede nem credencial',
    paginas: exp.paginas, contagem: Object.fromEntries(Object.entries(volta.colecoes).map(([c, v]) => [c, v.total])),
    lapides: volta.lapides, demandas: volta.demandas, arquivos: volta.arquivosRestaurados, checks};
  if (gravar) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-ensaio-backup-'));
    fs.writeFileSync(path.join(dir, 'pacote.json'), JSON.stringify(lido, null, 2));
    // O destino dos arquivos como no repositório do Hub (arquivos/<bucket>/<sha256>),
    // para o modo --arquivo/--copia poder ser exercitado com o pacote fictício.
    for (const [chave, bytes] of destino) { fs.mkdirSync(path.join(dir, 'copia', path.dirname(chave)), {recursive: true}); fs.writeFileSync(path.join(dir, 'copia', chave), bytes); }
    fs.writeFileSync(path.join(dir, 'resultado.json'), JSON.stringify(resultado, null, 2));
    resultado.diretorio = dir;
  }
  return resultado;
}

// Arquivo real do Hub: confere e restaura EM MEMÓRIA, imprime só contagens.
async function conferirArquivoReal(arquivo, copia) {
  const p = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const resumo = validarPacote(p);
  let arquivosConferidos = null;
  const destino = new Map();
  if (copia) {
    arquivosConferidos = 0;
    for (const bucket of BUCKETS) for (const a of p.arquivos?.[bucket] || []) {
      const local = path.join(copia, 'arquivos', bucket, a.sha256);
      if (!fs.existsSync(local)) throw new Error(`Arquivo ausente na cópia: ${bucket} (${a.sha256.slice(0, 12)}…)`);
      const b = fs.readFileSync(local);
      if (sha256(b) !== a.sha256 || b.length !== a.bytes) throw new Error(`Arquivo diferente na cópia: ${bucket} (${a.sha256.slice(0, 12)}…)`);
      destino.set(`arquivos/${bucket}/${a.sha256}`, b); arquivosConferidos++;
    }
  }
  const storage = storageMemoria(), e = await servidorVazio(storage);
  relogio(e, new Date().toISOString());
  const semArquivos = copia ? p : {...p, arquivos: {}};
  await restaurarPacote(semArquivos, alvoSandbox(e, storage, destino));
  const lapides = e.db.pcp_registros.filter(r => r.colecao === 'os' && r.apagado).length;
  const lista = await e.call({action: 'list', escopo: 'tudo'}, GESTOR);
  if ((lista.os || []).some(o => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === o.id)?.apagado)) throw new Error('Lápide apareceu na lista depois da volta.');
  return {formato: p.formato, arquivosCompletos: p.arquivosCompletos, contagem: Object.fromEntries(Object.entries(resumo.colecoes).map(([c, v]) => [c, v.total])),
    lapides, demandas: resumo.demandas, arquivosNoManifesto: resumo.arquivos, arquivosConferidos,
    fechamentos: resumo.colecoes.performance_fechamentos?.total || 0, comissoes: resumo.colecoes.performance_comissao?.total || 0};
}

if (require.main === module) {
  const args = process.argv.slice(2), arg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const tarefa = arg('--arquivo') ? conferirArquivoReal(arg('--arquivo'), arg('--copia')) : executar();
  tarefa.then(r => console.log(JSON.stringify(r, null, 2)), e => { console.error('Ensaio reprovado: ' + e.message); process.exit(1); });
}
module.exports = {executar, conferirArquivoReal, validarPacote, restaurarPacote, exportarPeloServidor, copiarArquivos, montarPacote, storageMemoria};
