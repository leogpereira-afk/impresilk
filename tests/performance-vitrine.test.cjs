/* A VITRINE DA PERFORMANCE (revisão de experiência, 29/09/2026).
 *
 * Pedido do dono: "olhar como um especialista ... e o ranking ficar top". A
 * tela mudou de ordem e de roupa, mas as regras são as mesmas. Estes testes
 * cobram o que a revisão prometeu e que um ajuste de marcação desfaria calado:
 * o Fechar deixou de ser o botão azul e diz por que está desligado; a faixa de
 * cobertura não mente no arredondamento; o ranking continua sem style=; o
 * pódio põe o 1º no centro mesmo com empate atrás dele.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const P = require('../performance.js');
const src = fs.readFileSync(path.join(__dirname, '..', 'performance.js'), 'utf8');
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch]));

function tela({papel = 'pcp', medida = 'nota', regsServidor = null, fila = []} = {}) {
  const c = {STORE:{getCFG:() => ({performancePCP:{equipes:[], participacoes:[]}}), getAllOS:() => [], getQueue:() => fila},
    STATE:{user:{papel}, _perfPessoaMedida:medida, _perfRankMedida:'entregas'},
    periodoOuMes:() => ({de:'2026-09-01', ate:'2026-09-19'}), classificarEntregas:os => ({instalacoes:os, aLancar:[]}),
    OPERACAO:{emIntervalo:() => true, equipe:os => os.equipe || []}, diaEntrega:() => '2026-09-19', valorDaOS:o => o.valorTotal,
    nomeExibicaoCasa:n => ({chave:n, nome:n}), pessoasRH:() => [], avatarRH:() => '', esc, dinheiroCasa:n => 'VALOR-' + n, filtroPeriodoHTML:() => ''};
  vm.createContext(c); vm.runInContext(src, c);
  if (regsServidor) {
    c.__regs = regsServidor;
    vm.runInContext("perfRemoto.chave=perfChave();perfRemoto.dados={consultadoEm:'2026-09-19T10:00:00',fonte:'teste',periodo:{de:'2026-09-01',ate:'2026-09-19'},registros:__regs};", c);
  }
  return c;
}
const pe = n => ({chave:n, nome:n});

test('fechar: botão secundário, desligado com o motivo escrito quando há entrega sem confirmação', () => {
  const c = tela({regsServidor:[{id:'1', numero:'10', confirmado:false, valor:100}, {id:'2', numero:'11', confirmado:true, valor:null}]});
  const html = c.perfFonteHTML();
  const botao = html.match(/<button[^>]*id="perf-fechar"[^>]*>/)[0];
  assert.doesNotMatch(botao, /btn-primary/, 'Fechar não é mais a ação principal da página');
  assert.match(botao, /disabled/);
  assert.match(botao, /aria-describedby="perf-fechar-motivo"/, 'o leitor de tela ouve o motivo junto do botão');
  assert.match(html, /id="perf-fechar-motivo"[^>]*>Para fechar, falta: 1 entrega sem participação confirmada; 1 sem valor \(O\.S\. 11\)/);
  // Os ids de sempre continuam (a fiação e os outros testes dependem deles).
  for (const id of ['perf-atualizar-fonte', 'perf-versao', 'perf-fechar']) assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
});

test('fechar: com tudo confirmado e com valor, o botão fica ligado e sem motivo', () => {
  const c = tela({regsServidor:[{id:'1', numero:'10', confirmado:true, valor:100}]});
  const html = c.perfFonteHTML();
  assert.doesNotMatch(html.match(/<button[^>]*id="perf-fechar"[^>]*>/)[0], /disabled/);
  assert.doesNotMatch(html, /perf-fechar-motivo/);
  // Alteração presa no aparelho trava de novo, e diz.
  const presa = tela({regsServidor:[{id:'1', numero:'10', confirmado:true, valor:100}], fila:[{}, {}]});
  assert.match(presa.perfFonteHTML(), /2 alterações deste aparelho aguardam sincronização/);
});

test('cobertura: a porcentagem não arredonda para 100% com entrega faltando, nem para 0% com alguma feita', () => {
  const c = tela();
  assert.equal(c.perfPctTxt(30, 163), '18%');
  assert.equal(c.perfPctTxt(162, 163), '99%');
  assert.equal(c.perfPctTxt(1, 300), '1%');
  assert.equal(c.perfPctTxt(0, 10), '0%');
  assert.equal(c.perfPctTxt(10, 10), '100%');
});

test('cobertura: UMA faixa com "30 de 163", a ação de completar e o selo de parcial no ranking', () => {
  const c = tela();
  const regs = [];
  for (let i = 0; i < 163; i++) regs.push({id:String(i), membros:i < 30 ? P.iguais([pe('Ana')]) : [], confirmado:false, valor:1, os:{}});
  const faixa = c.perfCoberturaHTML(regs, {de:'2026-09-01', ate:'2026-09-19'});
  assert.match(faixa, /<strong>30 de 163<\/strong> entregas com equipe <b>\(18%\)<\/b>/);
  assert.match(faixa, /data-perf-filtrar="sem-equipe">Completar equipes</);
  assert.match(faixa, /<b>0<\/b> confirmadas/);
  assert.match(faixa, /<b>133<\/b> sem equipe/);
  // Quem não edita vê as entregas, não é convidado a completar.
  assert.match(tela({papel:'montagem'}).perfCoberturaHTML(regs, {de:'', ate:''}), /Ver as sem equipe/);
  const rank = c.perfRankingPessoasHTML(regs, {equipes:[]});
  assert.match(rank, /Parcial: 18% das entregas com equipe/);
  assert.doesNotMatch(rank, /class="perf-podio /, 'sem valor confirmado não há pódio de nota');
  regs[0].confirmado=true;
  assert.match(c.perfRankingPessoasHTML(regs,{equipes:[]}), /perf-podio n1 perf-animar perf-podio-parcial|perf-podio n1 perf-podio-parcial/);
  // Cobertura total: a faixa encolhe para uma linha verde.
  const cheia = c.perfCoberturaHTML(regs.slice(0, 30), {de:'', ate:''});
  assert.match(cheia, /perf-cob-ok/);
  assert.match(cheia, /Todas as 30 entregas do período têm equipe/);
});

test('ranking individual: sem style= (a barra é atributo de SVG) e sem valor não confirmado', () => {
  const c = tela();
  const regs = ['Ana', 'Bia', 'Caio', 'Davi', 'Edu'].flatMap((n, i) => Array.from({length:5 - i}, (_, k) => ({id:n + k, membros:P.iguais([pe(n)]), confirmado:n === 'Davi', valor:1000, os:{}})));
  const html = c.perfRankingPessoasHTML(regs, {equipes:[]});
  assert.doesNotMatch(html, /style=/);
  assert.doesNotMatch(html, /<table/, 'só Davi tem valor confirmado e aparece no pódio');
  const producao=tela({medida:'peso'}).perfRankingPessoasHTML(regs,{equipes:[]});
  assert.doesNotMatch(producao, /style=/);
  assert.match(producao, /<rect class="perf-barra-valor" width="\d+"/, 'a distância para o 1º aparece na tabela de produção');
  assert.match(html, /VALOR-2000/, 'Davi: 2 entregas confirmadas de 1000');
  assert.doesNotMatch(html, /VALOR-5000|VALOR-4000|VALOR-3000/, 'valor de entrega só sugerida não aparece');
});

test('pódio: 1º no centro mesmo com 2º empatado; a ordem do HTML é a do ranking', () => {
  const c = tela({medida:'peso'});
  const regs = [{id:'a1', membros:P.iguais([pe('Ana')])}, {id:'a2', membros:P.iguais([pe('Ana')])}, {id:'b', membros:P.iguais([pe('Bia')])}, {id:'c', membros:P.iguais([pe('Caio')])}]
    .map(r => ({...r, confirmado:false, valor:1, os:{}}));
  const html = c.perfRankingPessoasHTML(regs, {equipes:[]});
  assert.deepEqual(html.match(/perf-podio-item pos-\d lugar-\w+/g), ['perf-podio-item pos-1 lugar-centro', 'perf-podio-item pos-2 lugar-esq', 'perf-podio-item pos-2 lugar-dir']);
  // Repintar a mesma tela não repete a subida dos degraus.
  assert.doesNotMatch(c.perfRankingPessoasHTML(regs, {equipes:[]}), /perf-animar/);
});
test('Gestão distingue consulta rejeitada de carregamento e permite tentar novamente',async()=>{
 const c=tela();c.renderPerformanceCasa=()=>{};let falha=true,consultas=0;
 c.STORE.api=async action=>{consultas++;if(falha)throw new Error('Rede fictícia indisponível');return action.action==='performanceFechamentos'?{fechamentos:[]}:{completo:true,registros:[]};};
 await c.perfCarregarFonte();let html=c.perfGestaoEquipesHTML();
 assert.match(html,/Rede fictícia indisponível/);assert.match(html,/data-perf-atualizar/);assert.doesNotMatch(html,/Consultando vínculos|Vínculos em consulta/);
 falha=false;await c.perfCarregarFonte();html=c.perfGestaoEquipesHTML();assert.doesNotMatch(html,/Rede fictícia indisponível/);assert.ok(consultas>=4);
});
