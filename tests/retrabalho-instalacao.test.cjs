'use strict';
/* RETRABALHO DE INSTALAÇÃO E A RÉGUA DAS PERDAS (onda a3, 11/10/2026).
   Decisões do dono (docs/DECISOES.md):
   - D-010: "retrabalho marcado já tira os pontos e a comissão" e "mas é
     retrabalho de instalação, isso tem que ficar claro". O retrabalho de
     Instalação tira os pontos e a comissão da O.S., sozinho, de todas as
     pessoas e equipes dela; o de Medição, Arte ou Produção não tira nada da
     instalação; o sem origem fica "a definir" (a comissão da O.S. fica
     pendente). A origem decide dinheiro: só admin e pcp gravam, trocar pede
     motivo, carimbo do servidor e diário.
   - D-011: atraso e retorno antecipado, "como ocorrência, tem que ser
     marcado": ficam registrados e não tiram nada sozinhos; a gestão pode
     julgá-los falha comprovada no demonstrativo (D-004).
   Cada teste começa pelo caso ruim (o comportamento de antes desta onda: a
   ficha dizia "a decidir pela gestão" para qualquer retrabalho e atraso, e o
   ranking, a Nota e a comissão contavam a O.S. inteira) e falha no 3847e0e.
   Os servidores são os de verdade (tests/helpers/edge.cjs) com banco falso.
   Dados fictícios: o repositório é público. */
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const B = require('./helpers/lote-bancada.cjs');
const {assert, O, edge, noServidor, osRow, FICHAS, GESTOR, OPERA, MONTAGEM, TOQUE, js} = B;
const R = require('../regras.js');
const P = require('../performance.js');
const C = require('../comissao.js');
const PERDAS = require('../perdas.js');

const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const plano = v => JSON.parse(JSON.stringify(v));
const NOV = {de:'2026-11-01', ate:'2026-11-30'};
const HOJE = '2026-12-02';
const REGRA = R.REGRA_EMBUTIDA;
const doc = {origem:'Vistoria fictícia', evidencia:'Foto fictícia 001 do serviço', justificativa:'Conferido pela gestão fictícia'};
const MOTIVO = 'Vistoria fictícia mostrou peça com defeito de fábrica';
// Os crachás valem até 2027: o relógio do servidor anda para 02/12/2026 (fechar novembro).
const longe = q => ({...q, exp:Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000)});
const [gestor, opera, montagem, toque] = [GESTOR, OPERA, MONTAGEM, TOQUE].map(longe);
// O relógio anda 1 ms a cada leitura: a gravação fica antes da consulta seguinte (perfFonte confere "a base mudou durante a consulta").
const relogio = (e, iso) => e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R(${JSON.stringify(iso)});
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
const pessoa = (chave, nome, percentual) => ({chave, nome, percentual});
const MEMBROS = [pessoa('100001', 'Ana Fictícia', 60), pessoa('100002', 'Bia Fictícia', 40)];

/* O SERVIDOR DE NOVEMBRO: a osR (a do retrabalho, R$ 1.200) e a osN (sem
   ocorrência, R$ 800), a mesma dupla, participação confirmada (60/40). */
const osDoBanco = (id, extra = {}) => ({colecao:'os', id, apagado:false, atualizado_em:'2020-01-01', registro:{id, numero:'T-' + id, tipo:'externo',
  cliente:'Cliente fictício ' + id, finalizadaEm:'2026-11-10T15:00:00Z', equipe:['100001', '100002'], valorTotal:1200, rev:1, ...extra}});
async function servidor(retrabalho, {extraOS = []} = {}) {
  const os = [osDoBanco('osR', retrabalho), osDoBanco('osN', {valorTotal:800}), ...extraOS];
  const e = await edge('pcp-sync', {pcp_registros:os, registros:structuredClone(FICHAS), equipe_contas:[{sistema:'pcp', usuario:'montagem1'}],
    pcp_config_global:[{id:true, atualizado_em:'2020-01-01', config:{instaladores:['Ana'],
      performancePCP:{equipes:[], participacoes:os.map(o => ({id:o.id, membros:MEMBROS, por:'Gestor', em:'2026-11-10'}))}}}],
    painel_ordens:[]});
  relogio(e, HOJE + 'T12:00:00Z');
  return e;
}
let _pedido = 0;
const pedido = base => `${base}-${String(++_pedido).padStart(6, '0')}`;
async function fechar(e) {
  const fonte = await e.call({action:'performancePeriodo', ...NOV, notaPorValor:true}, gestor);
  assert.equal(fonte.status, 200, JSON.stringify(fonte));
  const fech = await e.call({action:'performanceFechar', ...NOV, hash:fonte.hash, anterior:'', requestId:pedido('fechar-ri'), motivo:'Fechamento fictício',
    leGrupos:true, leEntregasItens:true, notaPorValor:true}, gestor);
  assert.equal(fech.ok, true, JSON.stringify(fech));
  return {fonte, f:fech.fechamento};
}
const entregasDoc = regs => Object.fromEntries(regs.map(r => [r.id, {...doc, entregue:true, grupos:[{montadorId:'100001'}], interna:{...doc, situacao:'nao_aplicavel'}}]));
async function previa(e, f, decisoes, extra = {}) {
  const entrada = {config:{modo:'teste', criteriosExtras:'somente_falha_comprovada'}, decisoes, entregas:entregasDoc(f.registros)};
  const p = await e.call({action:'performanceComissaoNova', ...NOV, fechamentoId:f.id, anterior:extra.anterior || '', entrada, motivo:'Prévia fictícia', requestId:pedido('previa-ri')}, gestor);
  assert.equal(p.ok, true, JSON.stringify(p));
  return p.revisao;
}
const semFalha = {...doc, decisao:'sem_falha', tipo:'nenhuma'};
const linhaDe = (rev, osId) => rev.apuracao.linhas.find(l => l.osId === osId);
const statusDe = c => O.statusEntrega(c, HOJE, REGRA);
const equipeDe = regs => P.resumir(regs).equipes[0];
const pessoaDe = (regs, chave) => P.resumir(regs).pessoas.find(p => p.chave === chave);
const notaDe = (regs, chave) => P.avaliar(regs, {producao:60, limpeza:20, equipamentos:20}, {porValor:true}).pessoas.find(p => p.chave === chave);

/* ═══════════════ a régua: uma só, explícita, igual nas duas cópias ═══════════════ */
test('a régua das perdas é uma só, explícita (D-010 e D-011) e igual em regras.js e em _shared/pcp-regras.mjs', async () => {
  // Caso ruim: não havia régua; cada tela decidia a perda do seu jeito (a ficha pela lista de 29/09, o ranking e a comissão por nada).
  assert.deepEqual(plano(R.REGUA_PERDAS), {id:'perdas-1', validaDesde:'2026-10-01', retrabalhoInstalacao:true, atraso:false, retornoAntecipado:false});
  assert.ok(Object.isFrozen(R.REGUA_PERDAS), 'a régua não muda em tempo de execução');
  // O selo guarda o id da régua com que foi julgado: a perdas-1 não muda nunca; régua nova ganha id novo (perdas-2), e o mês fechado continua com a dele.
  assert.deepEqual(plano(R.REGUAS_PERDAS['perdas-1']), {id:'perdas-1', validaDesde:'2026-10-01', retrabalhoInstalacao:true, atraso:false, retornoAntecipado:false}, 'a perdas-1 não muda: régua nova ganha id novo');
  assert.equal(R.reguaPorId('perdas-1'), R.REGUAS_PERDAS['perdas-1']);assert.equal(R.reguaPorId('perdas-9'), null);assert.equal(R.reguaPorId('toString'), null);
  const {REGRAS:S} = await import('../supabase/functions/_shared/pcp-regras.mjs');
  assert.deepEqual(plano(S.REGUA_PERDAS), plano(R.REGUA_PERDAS));
  assert.deepEqual(plano(S.REGUAS_PERDAS), plano(R.REGUAS_PERDAS));
  const bloco = arq => { const s = ler(arq); return s.slice(s.indexOf('/* ==== REGRAS DO PROGRAMA'), s.indexOf('/* ==== FIM DAS REGRAS ==== */')); };
  assert.equal(bloco('supabase/functions/_shared/pcp-regras.mjs'), bloco('regras.js'), 'o texto da régua é o mesmo nas duas cópias');
  const etapas = ['Instalação', 'Produção', 'Medição', 'Arte', '', 'instalação', 'Outra coisa', null];
  for (const tipo of ['retrabalho', 'atraso', 'retorno_antecipado', 'retornoAntecipado', 'carro']) for (const e of etapas) {
    assert.equal(S.efeitoDaOcorrencia(tipo, e), R.efeitoDaOcorrencia(tipo, e), tipo + '/' + e);
    assert.equal(S.textoDoEfeito(tipo, e), R.textoDoEfeito(tipo, e), tipo + '/' + e);
  }
  for (const e of etapas) for (const dia of ['2026-09-30', '2026-10-01', '2026-11-10', 'x'])
    assert.deepEqual(S.perdaNaApuracao({retrabalho:true, etapaOrigem:e}, dia), R.perdaNaApuracao({retrabalho:true, etapaOrigem:e}, dia), e + '/' + dia);
  // O que a régua diz, com as frases que as telas mostram.
  assert.equal(R.efeitoDaOcorrencia('retrabalho', 'Instalação'), 'tira');
  for (const e of ['Medição', 'Arte', 'Produção']) assert.equal(R.efeitoDaOcorrencia('retrabalho', e), 'acompanha', e);
  for (const e of ['', 'instalação', 'Outra coisa', null]) assert.equal(R.efeitoDaOcorrencia('retrabalho', e), 'definir', String(e));
  assert.equal(R.efeitoDaOcorrencia('atraso'), 'registrada');
  assert.equal(R.efeitoDaOcorrencia('retorno_antecipado'), 'registrada');
  assert.equal(R.textoDoEfeito('retrabalho', 'Instalação'), 'Retrabalho de instalação: tira os pontos e a comissão desta O.S.');
  assert.equal(R.textoDoEfeito('retrabalho', 'Produção'), 'Retrabalho de produção: não tira nada da instalação');
  assert.equal(R.textoDoEfeito('retrabalho', 'Medição'), 'Retrabalho de medição: não tira nada da instalação');
  assert.equal(R.textoDoEfeito('retrabalho', ''), 'Retrabalho com origem a definir: defina a origem; até lá não tira nada e a comissão desta O.S. fica pendente');
  assert.equal(R.textoDoEfeito('atraso'), 'Ocorrência registrada: não tira pontos nem comissão sozinha; a gestão pode julgar como falha comprovada');
  assert.equal(R.textoDoEfeito('retorno_antecipado'), R.textoDoEfeito('atraso'), 'a mesma frase em todo lugar');
  // Antes do programa (01/10/2026), a apuração não leva nada.
  assert.deepEqual(R.perdaNaApuracao({retrabalho:true, etapaOrigem:'Instalação'}, '2026-09-30'), {});
  assert.deepEqual(R.perdaNaApuracao({retrabalho:true, etapaOrigem:'Instalação'}, '2026-10-01'), {etapaOrigem:'Instalação', perda:'retrabalho_instalacao'});
  assert.deepEqual(R.perdaNaApuracao({retrabalho:false, etapaOrigem:'Instalação'}, '2026-10-01'), {});
});

/* Quando a régua ligar o atraso ou o retorno antecipado (um dia, por decisão
   nova do dono), a mudança é de uma linha em regras.js; mas a apuração do
   servidor (perfFonte) hoje só mede o retrabalho. Este teste para quem ligar
   sem levar a medida para a apuração (e sem escolher a régua do prazo). */
test('a régua só liga o que a apuração mede: atraso e retorno antecipado estão desligados (D-011)', () => {
  const medidosNaApuracao = ['retrabalhoInstalacao'];
  for (const [k, v] of Object.entries(R.REGUA_PERDAS)) {
    if (v !== true) continue;
    assert.ok(medidosNaApuracao.includes(k), `a régua liga "${k}", mas a apuração do servidor (perfFonte com REGRAS.perdaNaApuracao) ainda não o mede: leve a medida para o registro da apuração, decida a régua do prazo e troque este teste`);
  }
  assert.equal(R.REGUA_PERDAS.atraso, false);
  assert.equal(R.REGUA_PERDAS.retornoAntecipado, false);
});

/* ═══════════════ paridade do motor da comissão e do status ═══════════════ */
test('paridade: comissao.js e _shared/pcp-comissao.mjs, operacao.js e _shared/pcp-status.mjs dão o mesmo com a régua', async () => {
  const {COMISSAO:S} = await import('../supabase/functions/_shared/pcp-comissao.mjs');
  const corpo = ler('comissao.js').split("'use strict';\n")[1].split('\nif (typeof module')[0];
  assert.equal(corpo, ler('supabase/functions/_shared/pcp-comissao.mjs').split('\nexport {')[0], 'o motor é o mesmo texto');
  const reg = (id, extra = {}) => ({id, numero:id, dia:'2026-11-10', valor:1200, confirmado:true, membros:MEMBROS, retrabalho:false, ...extra});
  const rs = [reg('i', {retrabalho:true, etapaOrigem:'Instalação', perda:'retrabalho_instalacao'}), reg('p', {retrabalho:true, etapaOrigem:'Produção'}), reg('d', {retrabalho:true, etapaOrigem:''}), reg('n')];
  const fonte = {id:'f-ri', fechadoEm:'2026-12-01', periodo:NOV, regraPerdas:'perdas-1', registros:rs};
  const entrada = {config:{modo:'teste', criteriosExtras:'somente_falha_comprovada'}, decisoes:Object.fromEntries(rs.map(r => [r.id, semFalha])), entregas:entregasDoc(rs)};
  assert.deepEqual(C.apurar(fonte, entrada), S.apurar(fonte, entrada));
  assert.equal(C.comissaoDaBase(120000), S.comissaoDaBase(120000));
  // O status: o mesmo texto e o mesmo resultado.
  const St = await import('../supabase/functions/_shared/pcp-status.mjs');
  const bloco = arq => { const s = ler(arq); return s.slice(s.indexOf('/* ==== STATUS DA ENTREGA'), s.indexOf('/* ==== FIM DO STATUS ==== */')); };
  assert.equal(bloco('supabase/functions/_shared/pcp-status.mjs'), bloco('operacao.js'));
  for (const etapaOrigem of ['Instalação', 'Produção', '', undefined]) {
    const c = {...osDoBanco('x', {retrabalho:true, etapaOrigem, prazoCombinado:{data:'2026-11-05', fonte:'agenda'}, instalacao:{data:'2026-11-05'}}).registro};
    assert.deepEqual(plano(O.statusEntrega(c, HOJE, REGRA)), plano(St.statusEntrega(c, HOJE, REGRA)), String(etapaOrigem));
  }
});

/* ═══════════════ retrabalho de instalação: perde em todo lugar, os mesmos números ═══════════════ */
test('retrabalho de instalação zera os pontos e a comissão da O.S. na ficha, no ranking, na Nota, na comissão e na aba Perdas, com os mesmos números', async () => {
  const e = await servidor({retrabalho:true, etapaOrigem:'Instalação', problema:'Placa caiu na fixação', causaRaiz:'Erro humano'});
  const {fonte, f} = await fechar(e);
  // Caso ruim: a apuração do servidor não sabia da origem e o ranking contava a O.S. inteira.
  const rR = fonte.registros.find(r => r.id === 'osR'), rN = fonte.registros.find(r => r.id === 'osN');
  assert.equal(fonte.regraPerdas, 'perdas-1', 'a apuração diz com qual régua julgou');
  assert.deepEqual([rR.etapaOrigem, rR.perda], ['Instalação', 'retrabalho_instalacao']);
  assert.ok(!('perda' in rN) && !('etapaOrigem' in rN), 'a O.S. sem retrabalho fica igual');
  // A FICHA: o status diz a perda, e a ocorrência tira os pontos e a comissão.
  const st = statusDe(noServidor(e, 'osR'));
  assert.deepEqual(st.perdas, ['retrabalho']);
  const oc = st.ocorrencias.find(o => o.tipo === 'retrabalho');
  assert.deepEqual([oc.efeito, oc.vale, oc.conta, oc.abonavel], ['tira', true, true, false], 'retrabalho não se abona');
  assert.match(st.motivo, /^retrabalho de instalação marcado: Placa caiu na fixação/);
  // O RANKING (aparelho e servidor): a O.S. conta como entrega, sem pontos: nem produção nem valor.
  const eq = equipeDe(fonte.registros);
  assert.deepEqual([eq.os, eq.equivalentes, eq.valor, eq.semPontos], [2, 1, 800, 1]);
  assert.deepEqual([pessoaDe(fonte.registros, '100001').equivalentes, pessoaDe(fonte.registros, '100001').valor], [0.6, 480]);
  const pub = await e.call({action:'performanceRankingEquipe', ...NOV}, gestor);
  assert.equal(pub.status, 200, JSON.stringify(pub));
  assert.deepEqual([pub.equipes[0].entregas, pub.equipes[0].equivalentes, pub.equipes[0].semPontos, pub.resumo.semPontos], [2, 1, 1, 1]);
  // A NOTA: o valor entregue da pessoa é só o da osN.
  assert.equal(notaDe(fonte.registros, '100001').valorConfirmado, 480);
  // A COMISSÃO (servidor real): perda automática, sem pedir decisão, conferência da entrega nem rateio da O.S.
  const rev = await previa(e, f, {osN:semFalha});
  const lR = linhaDe(rev, 'osR'), lN = linhaDe(rev, 'osN');
  assert.deepEqual([lR.comissaoCentavos, lR.pontos, lR.internaCentavos, lR.externaCentavos, lR.decisao, lR.pendencias.length], [0, 0, 0, 0, 'retrabalho_instalacao', 0]);
  assert.equal(lN.comissaoCentavos, 800, '1% da osN');
  assert.equal(rev.apuracao.totalCentavos, 800);
  assert.equal(rev.apuracao.aprovavel, true, JSON.stringify(rev.apuracao.pendencias));
  // A ABA PERDAS: o grupo da perda, com os números do motor.
  const cards = id => noServidor(e, id);
  const m = PERDAS.montar({registros:f.registros, card:cards, status:statusDe, revisao:rev});
  const pR = m.linhas.find(l => l.osId === 'osR');
  assert.equal(pR.grupo, 'perda');
  assert.equal(pR.efeito, R.TEXTOS_PERDA.retrabalhoInstalacao);
  // OS MESMOS NÚMEROS: a base que deixa de pontuar e a comissão perdida, em toda parte.
  const base = Math.round(rR.valor * 100);
  assert.equal(base, 120000);
  assert.equal(lR.baseLiquidaCentavos, base, 'comissão: a base da linha');
  assert.equal(pR.perda.valorCentavos, base, 'aba Perdas: a base que deixa de pontuar');
  assert.equal(Math.round((P.resumir(f.registros.filter(r => r.id === 'osR').map(r => ({...r, perda:undefined}))).equipes[0].valor - P.resumir(f.registros.filter(r => r.id === 'osR')).equipes[0].valor) * 100), base, 'ranking: o valor que deixou de contar');
  assert.equal(lR.comissaoPerdidaCentavos, 1200, 'comissão: o motor grava o que a O.S. teria gerado');
  assert.equal(pR.perda.comissaoCentavos, lR.comissaoPerdidaCentavos, 'aba Perdas: a comissão perdida do motor');
  assert.equal(C.comissaoDaBase(base), 1200);
  assert.equal(R.comissaoCentavos(base, REGRA), 1200, 'a mesma conta da prevista da ficha');
  assert.equal(m.resumo.perdaInstalacao, 1);assert.equal(m.resumo.valorCentavos, base);assert.equal(m.resumo.comissaoCentavos, 1200);
  // E a Por O.S. diz a mesma perda (as perdas do status são as da régua).
  const POR_OS = require('../entregas-os.js');
  assert.deepEqual(POR_OS.perdasPelaRegra(st, REGRA), ['retrabalho']);
});

/* ═══════════════ retrabalho de produção: não tira nada da instalação ═══════════════ */
test('retrabalho de produção não zera em nenhum lugar: ficha, ranking, Nota, comissão e aba Perdas', async () => {
  const e = await servidor({retrabalho:true, etapaOrigem:'Produção', problema:'Lona veio manchada', causaRaiz:'Material'});
  const {fonte, f} = await fechar(e);
  const rR = fonte.registros.find(r => r.id === 'osR');
  // Caso ruim: a ficha dizia "a decidir pela gestão" e a aba punha a O.S. ao lado das perdas.
  assert.deepEqual([rR.etapaOrigem, 'perda' in rR], ['Produção', false]);
  const st = statusDe(noServidor(e, 'osR'));
  assert.deepEqual(st.perdas, []);
  assert.equal(st.ocorrencias.find(o => o.tipo === 'retrabalho').efeito, 'acompanha');
  assert.match(st.motivo, /^retrabalho de produção marcado/);
  const eq = equipeDe(fonte.registros);
  assert.deepEqual([eq.os, eq.equivalentes, eq.valor, eq.semPontos], [2, 2, 2000, 0]);
  assert.equal(notaDe(fonte.registros, '100001').valorConfirmado, 1200);
  const pub = await e.call({action:'performanceRankingEquipe', ...NOV}, gestor);
  assert.equal(pub.equipes[0].equivalentes, 2);assert.ok(!('semPontos' in pub.equipes[0]));
  // A comissão segue a regra de sempre: decisão documentada, e paga.
  const rev = await previa(e, f, {osR:semFalha, osN:semFalha});
  assert.equal(linhaDe(rev, 'osR').comissaoCentavos, 1200);
  assert.equal(rev.apuracao.totalCentavos, 2000);
  // A falha comprovada "de produção" o motor recusa (não é falha da instalação).
  const recusada = await previa(e, f, {osR:{...doc, decisao:'falha_comprovada', tipo:'producao'}, osN:semFalha}, {anterior:rev.id});
  assert.equal(linhaDe(recusada, 'osR').comissaoCentavos, null);
  assert.ok(linhaDe(recusada, 'osR').pendencias.some(t => /não comprovam falha da instalação/.test(t)));
  const m = PERDAS.montar({registros:f.registros, card:id => noServidor(e, id), status:statusDe, revisao:rev});
  const pR = m.linhas.find(l => l.osId === 'osR');
  assert.equal(pR.grupo, 'outra');
  assert.equal(pR.efeito, 'Retrabalho de produção: não tira nada da instalação');
  assert.equal(pR.perda, null);
  assert.deepEqual([m.resumo.perdaInstalacao, m.resumo.origemADefinir, m.resumo.valorCentavos], [0, 0, null]);
});

/* ═══════════════ sem origem: pendente, não perde, e pede a origem ═══════════════ */
test('retrabalho sem origem não zera: fica a definir, pendente na comissão, marcado no ranking e no ponto de atenção', async () => {
  const e = await servidor({retrabalho:true, problema:'Letra solta', causa:'Falha de fixação'});
  const {fonte, f} = await fechar(e);
  const rR = fonte.registros.find(r => r.id === 'osR');
  // Caso ruim: sem a origem, a ficha e a aba diziam "a decidir" e a comissão só pedia a decisão geral.
  assert.deepEqual([rR.etapaOrigem, 'perda' in rR], ['', false]);
  const st = statusDe(noServidor(e, 'osR'));
  assert.deepEqual(st.perdas, []);
  assert.equal(st.ocorrencias.find(o => o.tipo === 'retrabalho').efeito, 'definir');
  assert.match(st.motivo, /^retrabalho marcado, com origem a definir: Letra solta/);
  // O ranking conta como hoje, com a marca.
  const eq = equipeDe(fonte.registros);
  assert.deepEqual([eq.equivalentes, eq.valor, eq.semPontos, eq.origemADefinir], [2, 2000, 0, 1]);
  assert.match(require('vm').runInNewContext('perfMarcasReguaHTML(x)', {x:eq, perfMarcasReguaHTML:new Function('x', ler('performance.js').match(/function perfMarcasReguaHTML\(x\) \{([\s\S]*?)\n\}/)[1])}), /1 com retrabalho de origem a definir/);
  /* A comissão: só esta O.S. fica pendente (não paga e não perde).
     TROCADO DE PROPÓSITO (revisão da onda a3, decisão "origem a definir não
     trava o mês"): a apuração era não aprovável até a origem; agora o
     demonstrativo continua aprovável, a linha fica pendente com R$ 0,00 pago e
     nada perdido, e a O.S. entra numa revisão seguinte. */
  const rev = await previa(e, f, {osR:semFalha, osN:semFalha});
  const lR = linhaDe(rev, 'osR');
  assert.deepEqual([lR.decisao, lR.comissaoCentavos, lR.pontos, lR.origemADefinir, 'comissaoPerdidaCentavos' in lR], ['origem_a_definir', 0, null, true, false]);
  assert.ok(lR.pendencias.includes(C.TEXTO_ORIGEM_A_DEFINIR), JSON.stringify(lR.pendencias));
  assert.equal(rev.apuracao.aprovavel, true, JSON.stringify(rev.apuracao.pendencias));
  assert.ok(!rev.apuracao.pendencias.some(t => /origem a definir/.test(t)), 'a pendência é da linha, não do mês');
  assert.equal(linhaDe(rev, 'osN').comissaoCentavos, 800, 'a outra O.S. segue');
  // A aba Perdas e o ponto de atenção.
  const m = PERDAS.montar({registros:f.registros, card:id => noServidor(e, id), status:statusDe, revisao:rev});
  const pR = m.linhas.find(l => l.osId === 'osR');
  assert.equal(pR.grupo, 'definir');assert.equal(pR.perda, null);
  assert.deepEqual([m.resumo.origemADefinir, m.resumo.pessoasPendentes], [1, 2]);
  const t = telaPerdas();
  t.ctx.__d = {...m, carregando:false, decisoes:{consultando:false, consultada:true}};
  const ponto = t.run('perdasPontoHTML(__d)');
  assert.match(ponto, /class="perf-atencao" role="status"/);
  // TROCADO DE PROPÓSITO (revisão da onda a3): o ponto diz que o mês não trava, e a instrução é uma só (Status da entrega, no Fechamento).
  assert.match(ponto, /1 O\.S\. com retrabalho de origem a definir: defina a origem no Status da entrega, no Fechamento da ficha\. Até lá ela não tira nada e a comissão de 2 pessoas fica pendente \(não paga e não perde\); o demonstrativo do mês pode ser aprovado sem ela, e ela entra numa revisão seguinte quando a origem for definida\./);
  assert.match(ponto, /data-perdas-origem="osR"[^>]*>Definir a origem da O\.S\. T-osR<\/button>/, 'o botão abre a escolha da origem (M2)');
  // Definida a origem (Instalação) depois do fechamento: o demonstrativo continua com a O.S. pendente; o ponto pede a revisão nova.
  const r = await e.call({action:'upsert', os:{...noServidor(e, 'osR'), etapaOrigem:'Instalação'}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  const m2 = PERDAS.montar({registros:f.registros, card:id => noServidor(e, id), status:statusDe, revisao:rev});
  const l2 = m2.linhas.find(l => l.osId === 'osR');
  assert.equal(l2.grupo, 'definir', 'o mês fechado manda: no demonstrativo ela está pendente');
  assert.match(l2.avisoFicha, /Na ficha, a origem do retrabalho hoje é Instalação \(tira os pontos e a comissão desta O\.S\.\)\. No demonstrativo esta O\.S\. ficou pendente: ela só entra com nova revisão/);
  assert.deepEqual([m2.resumo.origemADefinir, m2.resumo.origemDefinidaDepois, m2.resumo.pessoasPendentes], [0, 1, 0]);
  t.ctx.__d = {...m2, carregando:false, decisoes:{consultando:false}};
  assert.match(t.run('perdasPontoHTML(__d)'), /1 O\.S\. com a origem definida depois do fechamento: ela só entra no demonstrativo com nova revisão/);
  // A gestão fecha de novo e gera a prévia nova: a perda passa a valer, e o ponto diz a perda (sempre que houver).
  const fonte2 = await e.call({action:'performancePeriodo', ...NOV, notaPorValor:true}, gestor);
  const fech2 = await e.call({action:'performanceFechar', ...NOV, hash:fonte2.hash, anterior:f.id, requestId:pedido('fechar-ri'), motivo:'Nova revisão fictícia', leGrupos:true, leEntregasItens:true, notaPorValor:true}, gestor);
  assert.equal(fech2.ok, true, JSON.stringify(fech2));
  const rev2 = await previa(e, fech2.fechamento, {osN:semFalha}, {anterior:rev.id});
  assert.equal(linhaDe(rev2, 'osR').decisao, 'retrabalho_instalacao');
  const m3 = PERDAS.montar({registros:fech2.fechamento.registros, card:id => noServidor(e, id), status:statusDe, revisao:rev2});
  assert.equal(m3.linhas.find(l => l.osId === 'osR').grupo, 'perda');
  assert.equal(m3.linhas.find(l => l.osId === 'osR').avisoFicha, '');
  t.ctx.__d = {...m3, carregando:false, decisoes:{consultando:false}};
  assert.match(t.run('perdasPontoHTML(__d)'), /1 O\.S\. perdeu pontos e comissão por retrabalho de instalação \(R\$\s?12,00 de comissão\)\./);
});

/* ═══════════════ marcar sem origem é recusado, sem 422 ═══════════════ */
test('marcar retrabalho sem a origem: a gestão é recusada com aviso (nunca 422); o celular marca e fica a definir', async () => {
  const e = await servidor({retrabalho:false});
  const antes = noServidor(e, 'osR');
  // Caso ruim: a marca da gestão entrava sem a origem e, pela régua de 29/09, zerava "venha de onde vier".
  let r = await e.call({action:'upsert', os:{...antes, retrabalho:true, problema:'Placa caiu'}}, gestor);
  assert.equal(r.status, 200, 'nunca 422: a gravação passa pela fila do aparelho');
  assert.equal(noServidor(e, 'osR').retrabalho, false, 'a marca sem origem não entra');
  assert.match(String(r.avisos), /O retrabalho não foi marcado: escolha a etapa de origem \(Medição, Arte, Produção ou Instalação\)/);
  // Origem que não existe: descartada com aviso, e a marca também não entra.
  r = await e.call({action:'upsert', os:{...noServidor(e, 'osR'), retrabalho:true, etapaOrigem:'Expedição'}}, gestor);
  assert.equal(r.status, 200);assert.equal(noServidor(e, 'osR').retrabalho, false);
  assert.match(String(r.avisos), /A etapa de origem "Expedição" não existe e não foi gravada/);
  // A resposta "sim" da pergunta, sem a origem, também não entra.
  r = await e.call({action:'upsert', os:{...noServidor(e, 'osR'), retrabalho:true, retrabalhoPerguntado:{resposta:'sim', em:'2026-11-10T16:00:00Z'}}}, gestor);
  assert.equal(r.status, 200);assert.ok(!noServidor(e, 'osR').retrabalhoPerguntado, 'a pergunta fica como estava');
  // Com a origem: marca, carimbada pelo servidor, e o diário registra.
  r = await e.call({action:'upsert', os:{...noServidor(e, 'osR'), retrabalho:true, etapaOrigem:'Instalação', problema:'Placa caiu', por:'forjado', porId:'999999'}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  const g = noServidor(e, 'osR');
  assert.deepEqual([g.retrabalho, g.etapaOrigem], [true, 'Instalação']);
  const log = g.etapaOrigemLog;
  assert.equal(log.length, 1);
  assert.deepEqual([log[0].de, log[0].para, log[0].marcou, log[0].por, log[0].porId], ['', 'Instalação', true, 'Gestor Teste', '111222'], 'carimbo do crachá, nunca do corpo');
  assert.ok(Date.parse(log[0].em) > 0);
  const diario = e.db.pcp_registros.filter(x => x.colecao === 'auditoria' && x.registro.osId === 'osR').map(x => x.registro);
  assert.ok(diario.some(d => d.campos.includes('etapaOrigem') && d.campos.includes('etapaOrigemLog') && d.campos.includes('retrabalho')), JSON.stringify(diario.map(d => d.campos)));
  // O CELULAR (crachá sem senha) marca pelo item: entra, com a origem A DEFINIR (a origem decide dinheiro e é da gestão).
  const e2 = await servidor({retrabalho:false, etapaOrigem:'Instalação', liberadoPCP:true, confirmacao:'Confirmado', finalizadaEm:''});
  r = await e2.call({action:'upsert', os:{id:'osR', rev:noServidor(e2, 'osR').rev, retrabalho:true, problema:'Item 1: Erro de medida', causa:'Erro de medida'}}, toque);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.deepEqual([noServidor(e2, 'osR').retrabalho, noServidor(e2, 'osR').etapaOrigem], [true, ''], 'a origem de antes de desmarcar não volta a valer sozinha');
  // A montagem com senha e a operação também: a origem que mandam não grava, com aviso.
  for (const quem of [montagem, opera]) {
    const e3 = await servidor({retrabalho:false});
    r = await e3.call({action:'upsert', os:{...noServidor(e3, 'osR'), retrabalho:true, etapaOrigem:'Produção', problema:'Placa caiu'}}, quem);
    assert.equal(r.status, 200, quem.papel);
    assert.deepEqual([noServidor(e3, 'osR').retrabalho, noServidor(e3, 'osR').etapaOrigem], [true, ''], quem.papel);
    assert.match(String(r.avisos), /só a gestão do PCP \(admin ou pcp\) define a origem/, quem.papel);
  }
});

/* ═══════════════ trocar a origem: só admin e pcp, com motivo, no diário ═══════════════ */
test('trocar a origem: quem não é admin nem pcp é recusado; sem motivo fica a gravada; com motivo troca, carimba e vai ao diário', async () => {
  const e = await servidor({retrabalho:true, etapaOrigem:'Instalação', problema:'Placa caiu'});
  const troca = extra => ({...noServidor(e, 'osR'), etapaOrigem:'Produção', ...extra});
  // Caso ruim: qualquer um que gravasse a O.S. trocava a origem (e a perda), sem motivo e sem rastro.
  for (const quem of [opera, montagem]) {
    const r = await e.call({action:'upsert', os:troca({etapaOrigemMotivo:MOTIVO})}, quem);
    assert.equal(r.status, 200, quem.papel);
    assert.equal(noServidor(e, 'osR').etapaOrigem, 'Instalação', quem.papel);
    assert.match(String(r.avisos), /só a gestão do PCP \(admin ou pcp\) define a origem/, quem.papel);
  }
  let r = await e.call({action:'upsert', os:{id:'osR', rev:noServidor(e, 'osR').rev, etapaOrigem:'Produção', horaSaida:'08:00'}}, toque);
  assert.equal(r.status, 200);assert.equal(noServidor(e, 'osR').etapaOrigem, 'Instalação', 'o celular não troca');
  // A gestão sem motivo, ou com motivo curto: fica a gravada, com aviso. A origem não volta a "a definir".
  for (const extra of [{}, {etapaOrigemMotivo:'curto'}]) {
    r = await e.call({action:'upsert', os:troca(extra)}, gestor);
    assert.equal(r.status, 200);assert.equal(noServidor(e, 'osR').etapaOrigem, 'Instalação');
    assert.match(String(r.avisos), /A etapa de origem não foi trocada \(continua Instalação\): escreva o motivo da troca, com 15 letras ou mais/);
  }
  r = await e.call({action:'upsert', os:{...noServidor(e, 'osR'), etapaOrigem:''}}, gestor);
  assert.equal(noServidor(e, 'osR').etapaOrigem, 'Instalação');assert.match(String(r.avisos), /não volta a ficar a definir/);
  // Com o motivo: troca, carimbada pelo servidor; o pedido não fica gravado na O.S.
  r = await e.call({action:'upsert', os:troca({etapaOrigemMotivo:MOTIVO})}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  const g = noServidor(e, 'osR');
  assert.equal(g.etapaOrigem, 'Produção');
  assert.ok(!('etapaOrigemMotivo' in g), 'o motivo vive no histórico, não na O.S.');
  const ult = g.etapaOrigemLog[g.etapaOrigemLog.length - 1];
  assert.deepEqual([ult.de, ult.para, ult.motivo, ult.por, ult.porId], ['Instalação', 'Produção', MOTIVO, 'Gestor Teste', '111222']);
  const diario = e.db.pcp_registros.filter(x => x.colecao === 'auditoria' && x.registro.osId === 'osR').map(x => x.registro);
  const d = diario[diario.length - 1];
  assert.ok(d.campos.includes('etapaOrigem') && d.campos.includes('etapaOrigemLog'), JSON.stringify(d.campos));
  assert.equal(d.antes.etapaOrigem, 'Instalação');assert.equal(d.depois.etapaOrigem, 'Produção');
  assert.match(JSON.stringify(d.depois.etapaOrigemLog), new RegExp(MOTIVO));
  // O histórico só cresce: o aparelho não o reescreve.
  r = await e.call({action:'upsert', os:{...noServidor(e, 'osR'), etapaOrigemLog:[]}}, gestor);
  assert.equal(noServidor(e, 'osR').etapaOrigemLog.length, g.etapaOrigemLog.length);
  /* TROCADO DE PROPÓSITO (revisão da onda a3, privacidade): o crachá sem senha
     recebia o histórico com o nome e o motivo de quem trocou; agora recebe só a
     origem atual e a data. */
  r = await e.call({action:'upsert', os:{id:'osR', rev:noServidor(e, 'osR').rev, horaRetorno:'17:00'}}, toque);
  assert.equal(r.status, 200);
  assert.deepEqual(r.os.etapaOrigemLog, [{para:'Produção', em:ult.em}]);
});

/* ═══════════════ desmarcar devolve ═══════════════ */
test('desmarcar o retrabalho (só a gestão) devolve os pontos e a comissão', async () => {
  const e = await servidor({retrabalho:true, etapaOrigem:'Instalação', problema:'Placa caiu'});
  let {fonte} = await fechar(e);
  assert.deepEqual(equipeDe(fonte.registros).equivalentes, 1, 'premissa: a perda vale');
  // Quem não é da gestão não desmarca (F17).
  let r = await e.call({action:'upsert', os:{...noServidor(e, 'osR'), retrabalho:false}}, opera);
  assert.equal(noServidor(e, 'osR').retrabalho, true);
  // Caso ruim: desmarcar deixava a origem de pé, e a próxima marca (do celular) a herdava.
  r = await e.call({action:'upsert', os:{...noServidor(e, 'osR'), retrabalho:false, problema:''}}, gestor);
  assert.equal(r.status, 200);
  const g = noServidor(e, 'osR');
  assert.deepEqual([g.retrabalho, g.etapaOrigem], [false, '']);
  assert.deepEqual(plano(g.etapaOrigemLog.map(x => [x.de, x.para, !!x.desmarcou])), [['Instalação', '', true]]);
  const nova = await e.call({action:'performancePeriodo', ...NOV, notaPorValor:true}, gestor);
  const rR = nova.registros.find(x => x.id === 'osR');
  assert.ok(!('perda' in rR) && !('etapaOrigem' in rR));
  assert.equal(nova.regraPerdas, undefined, 'sem retrabalho julgado, o conteúdo é o de antes da régua');
  assert.deepEqual([equipeDe(nova.registros).equivalentes, equipeDe(nova.registros).valor], [2, 2000], 'os pontos e o valor voltam');
  assert.deepEqual(statusDe(g).perdas, []);
});

/* ═══════════════ atraso e retorno antecipado: marcados, sem efeito sozinhos ═══════════════ */
test('atraso e retorno antecipado não zeram em lugar nenhum: ficam marcados como ocorrência e a gestão pode julgar falha comprovada', async () => {
  const atrasada = {prazoCombinado:{data:'2026-11-05', fonte:'agenda'}, instalacao:{data:'2026-11-05', periodo:'Manhã', duracaoDias:1}, veiculo:'Carro 1',
    retornoPrevisto:[{dia:'2026-11-10', hora:'17:00'}], retornoConferido:{dia:'2026-11-10', hora:'14:00', fonte:'ficha', por:'Gestor Teste', em:'2026-11-10T21:00:00Z'}};
  const e = await servidor(atrasada);
  const {fonte, f} = await fechar(e);
  // Caso ruim: a ficha dizia "a decidir pela gestão" (e, pela regra de 29/09, o atraso e o retorno zeravam a O.S.).
  const st = statusDe(noServidor(e, 'osR'));
  assert.deepEqual(st.perdas, []);
  const marcadas = st.ocorrencias.filter(o => o.vale).map(o => [o.tipo, o.efeito, o.conta]);
  assert.deepEqual(marcadas, [['atraso', 'registrada', false], ['retorno_antecipado', 'registrada', false]]);
  assert.ok(st.ocorrencias.some(o => o.id === 'osR:atraso') && st.ocorrencias.some(o => o.id === 'osR:retorno_antecipado:2026-11-10'), 'o id de sempre (F17)');
  // O ranking e a Nota contam a O.S. inteira.
  assert.deepEqual([equipeDe(fonte.registros).equivalentes, equipeDe(fonte.registros).valor], [2, 2000]);
  assert.equal(notaDe(fonte.registros, '100001').valorConfirmado, 1200);
  assert.ok(!('perda' in fonte.registros.find(r => r.id === 'osR')));
  // A comissão: sem efeito sozinho (paga com "sem falha"); a gestão pode julgar falha comprovada caso a caso (D-004).
  const rev = await previa(e, f, {osR:semFalha, osN:semFalha});
  assert.equal(linhaDe(rev, 'osR').comissaoCentavos, 1200);
  const falha = await previa(e, f, {osR:{...doc, decisao:'falha_comprovada', tipo:'atraso'}, osN:semFalha}, {anterior:rev.id});
  assert.equal(linhaDe(falha, 'osR').comissaoCentavos, 0, 'julgada falha comprovada, aí sim zera aquela O.S.');
  // A aba Perdas: a seção das outras ocorrências, com a frase da régua enquanto a gestão não julgou; depois, o julgamento.
  const noDia = (c, dia) => O.statusEntrega({...c, finalizadaEm:dia + 'T12:00:00-03:00', entregaLancada:{data:dia}}, HOJE, REGRA);
  const semJulgar = await previa(e, f, {osN:semFalha}, {anterior:falha.id});
  const aba = (revisao, contrafactual = null) => PERDAS.montar({registros:f.registros, card:id => noServidor(e, id), status:statusDe, noDia, revisao, contrafactual});
  const m = aba(semJulgar), pR = m.linhas.find(l => l.osId === 'osR');
  assert.equal(pR.grupo, 'ocorrencia');
  assert.deepEqual([pR.ocorrencias.tipos.includes('atraso'), pR.ocorrencias.tipos.includes('retorno_antecipado')], [true, true], 'as duas ficam marcadas na O.S.');
  assert.equal(pR.efeito, 'Ocorrência registrada: não tira pontos nem comissão sozinha; a gestão pode julgar como falha comprovada');
  assert.equal(pR.perda, null, 'sem julgamento, nada de perda');
  assert.deepEqual([m.resumo.origemADefinir, m.resumo.pessoasPendentes, m.resumo.comPerda], [0, 0, 0], 'o ponto de atenção não acusa atraso nem retorno');
  const t = telaPerdas();
  t.ctx.__d = {...m, carregando:false, decisoes:{consultando:false, consultada:true}};
  assert.doesNotMatch(t.run('perdasPontoHTML(__d)'), /atraso|retorno/i, 'o ponto mostra só o que pede ação');
  const html = t.run('perdasOcorrenciaListaHTML(__d.linhas[0].ocorrencias)').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  // TROCADO DE PROPÓSITO (revisão da onda a3, B6): "As duas datas dão o mesmo atraso" saía em todo cartão; só a divergência é dita.
  assert.match(html, /Atraso de 5 dias: prazo 05\/11, entrega 10\/11\. Ocorrência registrada: não tira pontos nem comissão sozinha; a gestão pode julgar como falha comprovada\./);
  assert.doesNotMatch(html, /As duas datas dão o mesmo atraso/);
  assert.match(html, /Retorno antecipado em 10\/11: 180 minutos antes do retorno previsto Ocorrência registrada: não tira pontos nem comissão sozinha; a gestão pode julgar como falha comprovada\./);
  assert.equal(aba(rev).linhas.find(l => l.osId === 'osR').efeito, 'Sem falha comprovada: a ocorrência não tira pontos nem comissão', 'julgada sem falha');
  const julgada = aba(falha, PERDAS.semFalhas(C, f, falha)).linhas.find(l => l.osId === 'osR');
  // TROCADO DE PROPÓSITO (revisão da onda a3, D-004 nos pontos): a falha comprovada tira os pontos e a comissão da O.S. (o ranking também lê a decisão).
  assert.match(julgada.efeito, /^Falha comprovada da instalação, julgada no demonstrativo da comissão: tira os pontos e a comissão desta O\.S\./, 'julgada falha comprovada (D-004)');
  assert.equal(julgada.perda.comissaoCentavos, 1200);
  // Não medido nunca é zero: sem prazo combinado e sem retorno previsto.
  const semMedida = statusDe({...noServidor(e, 'osN'), prazoCombinado:undefined});
  assert.match(semMedida.motivo, /sem prazo combinado no PCP: atraso não medido/);
  assert.match(semMedida.retornoAntecipado.motivo, /sem retorno previsto digitado: não medido/);
  const oc = PERDAS.ocorrenciasDaOS({card:noServidor(e, 'osN'), st:semMedida, registros:[{dia:'2026-11-10'}]});
  assert.deepEqual(oc.naoMedido, {atraso:'sem prazo combinado', retorno:'sem retorno previsto'});
});

/* ═══════════════ a ficha e o diálogo da comissão dizem a régua ═══════════════ */
function telaPerdas() {
  // A aba Perdas e o diálogo da comissão num vm (como o index.html: regras.js antes de perdas.js).
  const ctx = vm.createContext({console, STATE:{user:{papel:'pcp'}, _fPerf:{...NOV}},
    STORE:{getOS:id => ctx.__cards ? ctx.__cards.get(id) || null : null, getAllOS:() => [], getCFG:() => ({})},
    esc:s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch])),
    dinheiroCasa:v => 'R$ ' + Number(v).toFixed(2).replace('.', ','), toast() {}, crachaEhToque:() => false, perfChave:() => NOV.de + '|' + NOV.ate});
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'comissao.js', 'comissao-ui.js', 'perdas.js']) vm.runInContext(ler(f), ctx, {filename:f});
  return {ctx, run:c => vm.runInContext(c, ctx)};
}
test('o diálogo da comissão: a O.S. com retrabalho de instalação é perda automática (sem pedir decisão); a de origem a definir fica pendente', () => {
  const reg = (id, extra = {}) => ({id, numero:'T-' + id, cliente:'Cliente fictício', dia:'2026-11-10', valor:1200, confirmado:true, membros:MEMBROS, retrabalho:false, ...extra});
  const rs = [reg('osI', {retrabalho:true, etapaOrigem:'Instalação', perda:'retrabalho_instalacao'}), reg('osD', {retrabalho:true, etapaOrigem:''}), reg('osA'), reg('osN')];
  const fonte = {id:'f-ri', fechadoEm:'2026-12-01', periodo:NOV, ...NOV, regraPerdas:'perdas-1', registros:rs};
  const t = telaPerdas();
  t.ctx.__cards = new Map([['osI', {...osDoBanco('osI', {retrabalho:true, etapaOrigem:'Instalação'}).registro}], ['osD', {...osDoBanco('osD', {retrabalho:true}).registro}],
    ['osA', {...osDoBanco('osA', {prazoCombinado:{data:'2026-11-05', fonte:'agenda'}, instalacao:{data:'2026-11-05', periodo:'Manhã', duracaoDias:1}}).registro}]]);
  t.run('var statusEntregaDe = c => OPERACAO.statusEntrega(c, "2026-12-02", REGRAS.REGRA_EMBUTIDA);');
  let corpo = '';
  t.ctx.perfDialog = (titulo, html) => { corpo = html; return {classList:{add() {}}, querySelectorAll:() => [], querySelector:() => ({value:'', textContent:'', disabled:false})}; };
  t.ctx.__fonte = fonte;
  t.run('comissaoEditar(__fonte, null, __fonte.periodo, null, [])');
  const texto = corpo.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  // Caso ruim: a O.S. com retrabalho de instalação pedia "Decisão sobre responsabilidade" como qualquer outra.
  const blocoI = corpo.slice(corpo.indexOf('O.S. T-osI'), corpo.indexOf('</details>', corpo.indexOf('O.S. T-osI')));
  assert.match(blocoI, /Perda automática: retrabalho de instalação/);
  assert.match(blocoI, /Retrabalho de instalação: tira os pontos e a comissão desta O\.S\. Perda automática: não pede decisão aqui\./);
  assert.doesNotMatch(blocoI, /name="os\d+decisao"/, 'sem pedir decisão para esse motivo');
  assert.match(texto, /Entrega · O\.S\. T-osI · [\d/]+ · perda automática/);
  assert.match(texto, /esta entrega não paga comissão a ninguém, nem a parcela da montagem interna/);
  const blocoD = corpo.slice(corpo.indexOf('O.S. T-osD'), corpo.indexOf('</details>', corpo.indexOf('O.S. T-osD')));
  assert.match(blocoD, /origem a definir/);
  // TROCADO DE PROPÓSITO (revisão da onda a3): a origem a definir não trava o demonstrativo; a frase é a do motor.
  assert.match(blocoD, /Retrabalho com origem a definir: esta O\.S\. fica pendente \(não paga e não perde\) e não trava o demonstrativo\. Defina a origem na ficha: ela entra numa revisão seguinte \(feche o período de novo e gere nova prévia\)\./);
  assert.match(blocoD, /name="os\d+decisao"/, 'a decisão geral da O.S. continua');
  // O atraso fica marcado, com a frase da régua, e a gestão pode julgá-lo falha comprovada aqui (D-011 e D-004).
  const blocoA = corpo.slice(corpo.indexOf('O.S. T-osA'), corpo.indexOf('</details>', corpo.indexOf('O.S. T-osA'))).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(blocoA, /^O\.S\. T-osA · Atraso · Pendente Decisão sobre responsabilidade/);
  // TROCADO DE PROPÓSITO (revisão da onda a3, B6): sem a frase repetida das duas datas iguais.
  assert.match(blocoA, /Ocorrência em julgamento Atraso de 5 dias[^.]*\. Ocorrência registrada: não tira pontos nem comissão sozinha; a gestão pode julgar como falha comprovada\./);
  assert.match(corpo.slice(corpo.indexOf('O.S. T-osA')), /value="falha_comprovada"[^>]*>Falha comprovada da instalação/);
  assert.match(texto, /Confirmo a régua: atraso e retorno antecipado são ocorrências registradas e só zeram pontos e comissão da O\.S\. com falha comprovada da instalação, decidida aqui; o retrabalho de instalação zera sozinho\./);
  // O motor confirma: a perda automática não tem pendência; a de origem a definir tem.
  const ap = C.apurar(fonte, {config:{modo:'teste', criteriosExtras:'somente_falha_comprovada'}, decisoes:{osD:semFalha, osN:semFalha}, entregas:entregasDoc(rs)});
  // osD: TROCADO DE PROPÓSITO (revisão da onda a3): a linha da origem a definir fica pendente com R$ 0,00 e não trava o mês.
  assert.deepEqual(ap.linhas.map(l => [l.osId, l.comissaoCentavos, l.pendencias.length]).sort(), [['osA', null, 1], ['osD', 0, 1], ['osI', 0, 0], ['osN', 1200, 0]], 'osA: sem decisão, pendente como sempre');
});

/* A FICHA, com o store e o servidor de verdade (o mesmo harness de tests/f17-revisao.test.cjs). */
function domFalso() {
  const porId = new Map(), nos = new Map();
  const el = tag => ({tag, id:'', className:'', innerHTML:'', textContent:'', value:'', dataset:{}, hidden:false, style:{},
    classList:{add() {}, remove() {}, toggle() {}, contains:() => false},
    setAttribute() {}, getAttribute() {}, focus() {}, addEventListener() {}, remove() {}, querySelector:() => null, querySelectorAll:() => [], closest:() => null,
    insertBefore(n) { if (n && n.id) porId.set(n.id, n); }, appendChild(n) { if (n && n.id) porId.set(n.id, n); }});
  const no = sel => { if (!nos.has(sel)) nos.set(sel, el('div')); return nos.get(sel); };
  return {doc:{activeElement:null, body:el('body'), addEventListener() {}, querySelector:sel => no(sel), querySelectorAll:() => [],
    getElementById:id => porId.get(id) || null, createElement:tag => el(tag)}, porId};
}
async function tela(lista, quem = GESTOR, hoje = '2026-11-12') {
  const e = await edge('pcp-sync', {pcp_registros:lista.map(osRow), registros:plano(FICHAS), equipe_contas:[{sistema:'pcp', usuario:'montagem1'}],
    pcp_config_global:[{id:true, config:{instaladores:['Ana']}, atualizado_em:'2026-09-19T10:00:00Z'}]});
  const inicial = e.db.pcp_registros.filter(r => r.colecao === 'os').map(r => plano(r.registro));
  const d = domFalso(), ls = new Map([['impresilk_inst_os', JSON.stringify(inicial)], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore:() => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target:{result:null}})); return q; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const ctx = vm.createContext({console:{log() {}, warn() {}, error() {}}, navigator:{onLine:true}, window:{addEventListener() {}}, location:{reload() {}},
    localStorage:{getItem:k => ls.has(k) ? ls.get(k) : null, setItem:(k, v) => ls.set(k, String(v)), removeItem:k => ls.delete(k)},
    indexedDB:{open() { const q = {}; queueMicrotask(() => q.onsuccess({target:{result:idb}})); return q; }, deleteDatabase() {}},
    setTimeout:() => 1, clearTimeout() {}, setInterval:() => 1, clearInterval() {}, AbortController, API_BASE:'http://teste',
    fetch:async (_u, req) => { const r = await e.call(JSON.parse(req.body), quem); return {ok:!(r.status >= 400), status:r.status || 200, json:async () => r}; },
    document:d.doc, confirm:() => true});
  for (const f of ['store.js', 'operacao.js', 'entrega-item.js', 'divisao.js', 'regras.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename:f});
  const run = c => vm.runInContext(c, ctx);
  ctx.__toasts = [];
  run(`STATE.user = {nome:${JSON.stringify(quem.nome)}, papel:${JSON.stringify(quem.papel)}};
    renderModal = () => {}; renderActiveTab = () => {}; reRenderModalKeepOpen = () => {}; toast = (m, t) => __toasts.push([m, t]);
    var versoesRegrasCasa = () => [];
    hojeISO = () => ${JSON.stringify(hoje)};`);
  const S = run('STORE');
  await S.pronto();
  const esvaziar = async () => { for (let i = 0; i < 100 && S.getQueue().length; i++) { await S.trySync(); await new Promise(r => setTimeout(r, 2)); } };
  return {e, S, run, ctx, esvaziar, json:c => js(run(c)),
    abrir:id => run(`_modalDraft = JSON.parse(JSON.stringify(STORE.getOS(${JSON.stringify(id)}))); STATE.modalOSId = ${JSON.stringify(id)}; _modalDirty = false;`)};
}
const fichaOS = (id, extra = {}) => ({id, numero:'9' + id, tipo:'externo', cliente:'Cliente Fictício ' + id, veiculo:'Carro 1', equipe:['100001', '100002'],
  liberadoPCP:true, instalacao:{data:'2026-11-05', periodo:'Manhã', duracaoDias:1}, prazoCombinado:{data:'2026-11-05', fonte:'agenda'},
  finalizadaEm:'2026-11-05T20:00:00.000Z', finalizadoPor:'Gestor Teste', retornoConf:{carroLimpo:'sim', carroArrumado:'sim', equipamentosOk:'sim', semAvaria:'sim', por:'Gestor Teste', em:'2026-11-05T21:00:00Z'},
  retrabalhoPerguntado:{resposta:'sim', por:'Gestor Teste', em:'2026-11-06T10:00:00Z'}, ...extra});
const doChecklist = (t, rotulo) => t.json(`checklistFechamento(_modalDraft).find(c => c.rotulo === ${JSON.stringify(rotulo)}) || null`);

test('a ficha diz a régua no checklist e no Status da entrega; a gestão define e troca a origem pelo diálogo, e o servidor carimba', async () => {
  const t = await tela([fichaOS('i', {retrabalho:true, etapaOrigem:'Instalação', problema:'Placa caiu'}), fichaOS('p', {retrabalho:true, etapaOrigem:'Produção', problema:'Lona manchada'}),
    fichaOS('d', {retrabalho:true, problema:'Letra solta'}), fichaOS('a', {retrabalhoPerguntado:{resposta:'nao', por:'Gestor Teste', em:'2026-11-06T10:00:00Z'}, finalizadaEm:'2026-11-08T20:00:00.000Z'})]);
  // Caso ruim: "Retrabalho: ocorrência a decidir pela gestão. Até a decisão, não tira pontos nem comissão." para qualquer origem.
  t.abrir('i');
  let c = doChecklist(t, 'Retrabalho');
  assert.equal(c.efeito, 'Retrabalho de instalação: tira os pontos e a comissão desta O.S. Retrabalho de instalação não se abona: quem discorda da origem troca a origem, com motivo.');
  let st = t.run('statusEntregaFichaHTML(_modalDraft)');
  assert.match(st, /class="oc-selo perda">tira pontos e comissão</);
  assert.match(st, /data-f17-acao="origem"[^>]*>Trocar a origem</);
  assert.doesNotMatch(st, /a decidir pela gestão|data-f17-acao="abonar" data-oc="i:retrabalho"/, 'retrabalho não se abona');
  t.abrir('p');
  assert.equal(doChecklist(t, 'Retrabalho').efeito, 'Retrabalho de produção: não tira nada da instalação.');
  assert.match(t.run('statusEntregaFichaHTML(_modalDraft)'), /class="oc-selo acompanha">não tira nada</);
  t.abrir('d');
  c = doChecklist(t, 'Retrabalho');
  assert.equal(c.estado, 'falta', 'a origem a definir é uma falta do checklist');
  assert.equal(c.efeito, 'Retrabalho com origem a definir: defina a origem; até lá não tira nada e a comissão desta O.S. fica pendente.');
  assert.equal(c.como, 'Defina a origem no Status da entrega, no Fechamento.');
  st = t.run('statusEntregaFichaHTML(_modalDraft)');
  assert.match(st, /class="oc-selo definir">origem a definir</);
  assert.match(st, /data-f17-acao="origem"[^>]*>Definir a origem</);
  t.abrir('a');
  assert.equal(doChecklist(t, 'Prazo').efeito, 'Entregue com atraso. Ocorrência registrada: não tira pontos nem comissão sozinha; a gestão pode julgar como falha comprovada. O abono justifica o atraso.');
  st = t.run('statusEntregaFichaHTML(_modalDraft)');
  assert.match(st, /class="oc-selo registrada">marcada</);
  assert.match(st, /Ocorrência registrada: não tira pontos nem comissão sozinha; a gestão pode julgar como falha comprovada\./);
  // O DIÁLOGO da origem: define a que está a definir (sem motivo) e troca a gravada (com motivo); o servidor carimba.
  const dialogo = (escolha, motivo) => {
    const campos = {etapa:{value:escolha}, motivo:{value:motivo || ''}}, erro = {textContent:'', hidden:true};
    const form = {querySelector:sel => sel.startsWith('input[name="etapa"]') ? campos.etapa : sel === '[name="motivo"]' ? (motivo === undefined ? null : campos.motivo) : null};
    const box = {id:'', innerHTML:'', remove() {}, querySelector:sel => sel === 'form' ? form : sel === '.ent-erro' ? erro : null, querySelectorAll:() => []};
    t.ctx.__box = box;
    t.run(`document.createElement = () => __box; abrirOrigemRetrabalho(_modalDraft, gravarNaFichaF17)`);
    form.onsubmit({preventDefault() {}});
    return {erro:erro.textContent, html:box.innerHTML};
  };
  t.abrir('d');
  let r = dialogo('Instalação');
  assert.equal(r.erro, '');
  assert.match(r.html, /Instalação<\/strong> <small>Retrabalho de instalação: tira os pontos e a comissão desta O\.S\.<\/small>/);
  await t.esvaziar();
  assert.equal(t.S.getQueue().length, 0, 'a fila esvazia: nada de 422');
  assert.equal(noServidor(t.e, 'd').etapaOrigem, 'Instalação');
  assert.deepEqual(plano(noServidor(t.e, 'd').etapaOrigemLog.map(x => [x.de, x.para, x.por])), [['', 'Instalação', 'Gestor Teste']]);
  // Trocar sem o motivo: a tela recusa antes de gravar.
  t.abrir('d');
  r = dialogo('Produção', 'curto');
  assert.equal(r.erro, 'Escreva o motivo da troca, com 15 letras ou mais.');
  r = dialogo('Produção', MOTIVO);
  assert.equal(r.erro, '');
  await t.esvaziar();
  const g = noServidor(t.e, 'd');
  assert.equal(g.etapaOrigem, 'Produção');
  assert.deepEqual(plano(g.etapaOrigemLog.map(x => [x.de, x.para, x.motivo || ''])), [['', 'Instalação', ''], ['Instalação', 'Produção', MOTIVO]]);
  assert.ok(!('etapaOrigemMotivo' in g));
  // A caixa "Retrabalho?" da gestão abre o diálogo (marcar exige a origem): sem escolher, nada é marcado.
  t.abrir('a');
  assert.equal(t.run('typeof abrirOrigemRetrabalho'), 'function');
  assert.match(ler('app.js'), /el\.dataset\.fCheck === 'retrabalho' && el\.checked && !_modalDraft\.retrabalho && podeOrigemRetrabalho\(\)\) \{\s*el\.checked = false;\s*abrirOrigemRetrabalho\(_modalDraft, gravarNaFichaF17, \{ marcar: true \}\);/);
});

/* ═══════════════ o mês fechado não muda ═══════════════ */
test('mês fechado não muda: o selo de antes da régua confere e paga como foi selado; o selado com a régua não muda com a troca de origem', async () => {
  // (a) O SELO DE ANTES DA RÉGUA: sem regraPerdas. A O.S. tem retrabalho com origem Instalação gravada.
  const e = await servidor({retrabalho:true, etapaOrigem:'Instalação', problema:'Placa caiu'});
  const antiga = await e.run(`perfFonte({de:'2026-11-01', ate:'2026-11-30', notaPorValor:true}, {estrito:false, reguaPerdas:''})`);
  assert.equal(antiga.regraPerdas, undefined);
  assert.ok(antiga.registros.every(r => !('perda' in r) && !('etapaOrigem' in r)), 'o conteúdo de antes da régua');
  const selo = {...antiga, ...NOV, id:'2026-11-01:2026-11-30:000001', revisao:1, anterior:null, requestId:'selo-antigo-0001', motivo:'Novembro fictício', fechadoEm:'2026-12-01T10:00:00Z', fechadoPor:'Gestor Teste'};
  e.db.pcp_registros.push({colecao:'performance_fechamentos', id:selo.id, registro:plano(selo), apagado:false, atualizado_em:selo.fechadoEm});
  // Caso ruim: o recálculo do selo (Aprovar, Exportar) aplicava a régua de hoje: o hash não batia e o mês fechado "mudava".
  const p = await previa(e, selo, {osR:semFalha, osN:semFalha});
  assert.equal(linhaDe(p, 'osR').comissaoCentavos, 1200, 'o selo de antes da régua paga como foi selado');
  const ap = await e.call({action:'performanceComissaoAprovar', ...NOV, anterior:p.id, hash:p.hash, confirmacao:true, motivo:'Aprovação fictícia', requestId:pedido('aprova-ri')}, gestor);
  assert.equal(ap.ok, true, 'o recálculo usa a régua do selo (nenhuma) e o hash confere: ' + JSON.stringify(ap));
  // (b) O SELO COM A RÉGUA: a origem trocada depois não muda o que foi selado.
  const e2 = await servidor({retrabalho:true, etapaOrigem:'Instalação', problema:'Placa caiu'});
  const {f} = await fechar(e2);
  const antes = plano(e2.db.pcp_registros.find(x => x.colecao === 'performance_fechamentos').registro);
  assert.equal(antes.registros.find(r => r.id === 'osR').perda, 'retrabalho_instalacao');
  const r = await e2.call({action:'upsert', os:{...noServidor(e2, 'osR'), etapaOrigem:'Produção', etapaOrigemMotivo:MOTIVO}}, gestor);
  assert.equal(r.status, 200);assert.equal(noServidor(e2, 'osR').etapaOrigem, 'Produção');
  assert.deepEqual(plano(e2.db.pcp_registros.find(x => x.colecao === 'performance_fechamentos').registro), antes, 'o selo é o selo');
  const p2 = await previa(e2, f, {osN:semFalha});
  assert.equal(linhaDe(p2, 'osR').comissaoCentavos, 0, 'a revisão selada continua com a perda');
  const ap2 = await e2.call({action:'performanceComissaoAprovar', ...NOV, anterior:p2.id, hash:p2.hash, confirmacao:true, motivo:'Aprovação fictícia', requestId:pedido('aprova-ri')}, gestor);
  assert.equal(ap2.status, 409, 'a fonte mudou depois do fechamento: a gestão fecha de novo (uma revisão nova)');
  assert.match(ap2.error, /A fonte mudou depois do fechamento/);
});

/* ═══════════════ o botão da origem a definir cabe no cartão ═══════════════ */
test('o botão "Definir a origem da O.S." quebra a linha na coluna do efeito, em vez de sair do cartão', () => {
  // Caso ruim (prévia a 1024 e a 1280 px): a regra geral dos botões (styles.css, white-space: nowrap) empurrava o número longo da O.S. para fora do cartão da aba Perdas.
  assert.match(ler('styles.css'), /white-space: nowrap; user-select: none;/, 'premissa: a regra geral dos botões não quebra a linha');
  const css = ler('performance-layout.css');
  assert.match(css, /#panel-performance \.perf-perdas-acao button,#panel-performance \.perf-atencao-acoes button\{white-space:normal;max-width:100%;[^}]*overflow-wrap:anywhere/);
  // E o botão mora mesmo nesses lugares: na coluna do efeito do grupo "Origem a definir" e no ponto de atenção.
  assert.match(ler('perdas.js'), /\$\{efeito\}<span class="bloco perf-perdas-acao">\$\{perdasDefinirOrigemHTML\(l\)\}<\/span>/);
  assert.match(ler('perdas.js'), /<div class="perf-atencao-acoes">[^`]*perdasDefinirOrigemHTML\(primeira\)/);
});

/* ═══════════════ as decisões no repositório ═══════════════ */
test('docs/DECISOES.md registra a D-010 e a D-011 com as palavras do dono, e a P-001 respondida', () => {
  const d = ler('docs/DECISOES.md');
  assert.match(d, /- D-010 · 11\/10\/2026 · [^\n]*"retrabalho marcado já tira os pontos e a comissão"[^\n]*"mas é retrabalho de instalação, isso tem que ficar claro"/);
  assert.match(d, /- D-011 · 11\/10\/2026 · [^\n]*"como ocorrência, tem que ser marcado"/);
  assert.match(d, /- P-001 [^\n]*RESPONDIDA em 2026-10-11 por D-010 e D-011/);
  assert.doesNotMatch(d, /Enquanto a P-001 estiver aberta: NÃO mudar a régua/);
  assert.match(d, /- D-004 [^\n]*\n(?:  - [^\n]*\n)*  - Nota de 11\/10\/2026 \(onda a3\)[^\n]*retrabalho de instalação/);
});
