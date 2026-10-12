'use strict';
/* ONDA VOLTA NO FECHAR O DIA (lote): a conferência da volta é da viagem. A
   O.S. que traz a conferência de outra viagem (dia 20/09) mostra a volta de
   29/09 sem conferência; conferir pelo lote com as MESMAS respostas grava a
   conferência desta viagem no servidor (com o dia, o autor e a hora novos);
   e o Desfazer do lote deixa esta viagem sem conferência, em vez de pôr nela
   as respostas da outra viagem. Bancada de verdade (store, tela e pcp-sync).
   Tudo fictício: o repositório é público. */
const {test} = require('node:test');
const B = require('./helpers/lote-bancada.cjs');
const {assert, O, pcpFim, noServidor, montar, salvar, abrirPendencias, naoEConfirma, G_P1} = B;
const SIM = {carroLimpo:'sim', carroArrumado:'sim', equipamentosOk:'sim', semAvaria:'sim'};

test('lote: a conferência de outra viagem não conta para esta; conferir com as mesmas respostas grava a desta, e o Desfazer não põe a outra nela', async () => {
  const outra = {...SIM, obs:'banco sujo', fotos:[], por:'Gestor Teste', porId:'111222', em:'2026-09-20T20:00:00.000Z', dia:'2026-09-20'};
  const b = await montar({os:[pcpFim('p1', {retornoConf:outra})]});
  await abrirPendencias(b);
  // O ponto de partida não é a conferência de 20/09: as quatro perguntas começam em branco.
  assert.deepEqual(await b.json(`LOTE.grupo(${JSON.stringify(G_P1)}).volta`), {carroLimpo:'', carroArrumado:'', equipamentosOk:'', semAvaria:'', obs:''});
  for (const [k, v] of Object.entries(SIM)) assert.equal(await b.acao({acao:'volta', grupo:G_P1, k, v}), '');
  await naoEConfirma(b, 'p1');
  const rel = await salvar(b);
  assert.equal(rel.itens[0].estado, 'gravada', JSON.stringify(rel.itens));
  await b.sincronizar();
  const rc = noServidor(b.e, 'p1').retornoConf;
  assert.equal(rc.dia, '2026-09-29', 'caso ruim: as mesmas respostas não recarimbavam, e a viagem de 29/09 ficava com a conferência de 20/09');
  assert.notEqual(rc.em, outra.em); assert.equal(rc.por, 'Gestor Teste'); assert.equal(rc.obs, '', 'a observação da outra viagem não vem junto');
  // Desfazer: a viagem de 29/09 fica sem conferência (a de 20/09 não volta para ela).
  const des = await b.json(`LOTE.desfazer(${JSON.stringify(rel.id)}, {prazoMs:3000, passoMs:5})`);
  assert.equal(des.itens[0].desfazer && des.itens[0].desfazer.estado, 'gravada', JSON.stringify(des.itens));
  await b.sincronizar();
  const depois = noServidor(b.e, 'p1');
  assert.deepEqual(O.PERGUNTAS_VOLTA.map(k => O.respostaVolta((depois.retornoConf || {})[k])), ['', '', '', '']);
  assert.equal(O.confDaViagem(depois), null);
  b.fechar();
});
