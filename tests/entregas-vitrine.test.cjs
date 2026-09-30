/* A VITRINE DE ENTREGAS (revisão de experiência, 29/09/2026).
 *
 * Pedido do dono, com um print da tela: "olhar como um especialista, destacar
 * o que precisa pra gente melhorar mais a visualização". A fila de lançamento
 * tinha 57 linhas, cada uma com um botão azul e "sem equipe" repetido, e
 * empurrava a lista do período para longe; os quatro cartões tinham o mesmo
 * peso, com um "R$ 0,00 entregue hoje" do tamanho do ano.
 *
 * A regra não mudou (classificarEntregas, entreguesERP e as contas são as
 * mesmas). Estes testes cobram o que a revisão prometeu e que um ajuste de
 * marcação desfaria calado: a fila fechada é uma faixa sem linhas; aberta,
 * mostra 10 com "Mostrar todas", botão discreto que continua ligando o
 * lançamento, técnicos só quando alguém tem equipe; nenhuma informação do
 * texto longo se perdeu; o cartão grande é o do período; e a lista do período
 * vem antes dos relatórios, logo depois dos filtros.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const AGORA = '2026-09-29T12:00:00-03:00';

// O mesmo arranjo de tests/casa.test.cjs, reduzido ao que Entregas lê.
function casa(lista, { agora = AGORA, erp = null } = {}) {
  const ctx = vm.createContext({
    console,
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [agora])); } static now() { return +new Date(agora); } },
    STORE: {
      getAllOS: () => lista, getOS: id => lista.find(o => o.id === id),
      getCFG: () => ({ instaladores: ['Natan', 'Paulo'] }),
      elenco: () => ({ pessoas: [], veiculos: [], ferias: [], ausencias: [] }),
      // Com `erp`, todo mês do ano responde (o do mês corrente com essas O.S.); sem, nenhum veio ainda.
      entreguesMes: m => erp ? { v: 3, os: m === '2026-09' ? erp : [], em: '2026-09-29T10:00:00' } : null,
      pullEntreguesMes() {}, anosEntregues: () => [2026], valores: () => ({}),
    },
    STATE: { user: { papel: 'pcp', nome: 'Teste' } },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { classList: { add() {}, remove() {}, contains: () => false } } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    esc: s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch])),
    emptyState: (i, t) => `<div class="vazio">${t}</div>`, bindCardClicks() {}, toast() {}, fmtInstalacao: () => '', filtroPeriodoHTML: () => '',
    parseLocalDate: s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; },
    pessoaDoElenco: () => null,
  });
  for (const f of ['operacao.js', 'casa.js', 'relatorios-entregas.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
  return { run: code => vm.runInContext(code, ctx), ctx };
}
// Pinta a tela num elemento de mentira e devolve o HTML; `cliques` recebe os botões por seletor.
function tela(t, prepara = '', cliques = {}) {
  t.ctx.__cliques = cliques;
  return t.run(`
    ${prepara}
    var wireFiltroPeriodo = () => {}; var wireQuadrosCasa = () => {};
    var __el = { innerHTML: '', querySelectorAll: sel => __cliques[sel] || [], querySelector: () => ({ value: '' }) };
    document.getElementById = id => id === 'panel-entregas' ? __el : null;
    renderEntregas();
    __el.innerHTML`);
}
// Baixa do ERP depois do corte: vai para a fila de lançamento.
const baixa = (n, dia, extra = {}) => ({ id: 'b' + n, numero: String(9000 + n), tipo: 'externo', cliente: 'Cliente fictício ' + n, servico: 'Fachada fictícia',
  finalizadaEm: dia + 'T18:00:00', finalizadoPor: 'Mubisys (auto)', equipe: [], valorTotal: 1000 + n, ...extra });
const doze = () => Array.from({length: 12}, (_, i) => baixa(i + 1, `2026-09-${String(16 + (i % 12)).padStart(2, '0')}`));
const secao = html => (html.match(/<section class="ent-fila[\s\S]*?<\/section>/) || [''])[0];

test('fila fechada: uma faixa com quantas, o valor parado, a mais antiga e o botão, sem nenhuma linha', () => {
  const fila = doze().concat(baixa(40, '2026-09-15', { valorTotal: undefined }));
  const html = secao(tela(casa(fila)));
  assert.ok(html, 'a faixa da fila tem de existir');
  assert.match(html, /<strong>13 baixas do ERP esperam<\/strong> lançamento/);
  // 12 com valor (1001 a 1012) somam 12.078; a sem valor fica fora da soma e é contada à parte.
  assert.match(html, /R\$\s?12\.078,00<\/strong> parados <span class="badge sem-valor">1 sem valor<\/span>/);
  assert.match(html, /a mais antiga é de <strong>15\/09\/26<\/strong>, há 14 dias/);
  assert.match(html, /<button type="button" class="btn-ghost ent-fila-botao" data-ent-fila aria-expanded="false">Ver a fila<\/button>/);
  assert.doesNotMatch(html, /<tr>|data-lancar-os/, 'fechada, a fila não desenha linha nenhuma');
  assert.doesNotMatch(html, /btn-primary/);
  // A classe antiga fica: é por ela que a Performance desce até a fila.
  assert.match(html, /class="ent-fila casa-lancar"/);
});

test('fila: a frase curta fica à vista e o resto do texto antigo mora em "Como funciona", sem perda', () => {
  const html = secao(tela(casa(doze())));
  assert.match(html, /<p class="ent-fila-frase">O ERP deu baixa, mas ninguém finalizou no PCP\. Só conta como entrega depois de lançada\.<\/p>/);
  const como = (html.match(/<details class="ent-fila-como"[\s\S]*?<\/details>/) || [''])[0];
  assert.match(como, /<summary>Como funciona<\/summary>/);
  assert.match(como, /de qualquer período/);
  assert.match(como, /confirme a data da entrega e a equipe/);
  assert.match(como, /retrabalho/);
  assert.match(como, /anteriores a 15\/09\/2026 já contam como entregues \(decisão da direção\)/);
  // Sem travessão no texto da faixa (o "—" só aparece como marcador de campo vazio).
  const texto = html.replace(/<span class="ent-fila-traco"[^>]*>—<\/span>/g, '').replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(texto, /—/);
});

test('fila aberta: 10 linhas e "Mostrar todas", botão discreto que continua ligado ao lançamento', () => {
  const t = casa(doze());
  const html = secao(tela(t, 'STATE._entFilaAberta = true;'));
  assert.match(html, /aria-expanded="true" aria-controls="ent-fila-lista">Esconder a fila</);
  assert.equal((html.match(/data-lancar-os="/g) || []).length, 10);
  assert.match(html, /data-ent-fila-todas>Mostrar todas \(12\)<\/button>/);
  const botoes = html.match(/<button[^>]*data-lancar-os[^>]*>[^<]*<\/button>/g);
  for (const b of botoes) {
    assert.doesNotMatch(b, /btn-primary/, 'o Lançar deixou de ser o botão azul repetido');
    assert.match(b, /class="btn-ghost btn-sm edit-only ent-fila-lancar"/, 'quem só lê continua sem o botão (edit-only)');
    assert.match(b, /aria-label="Lançar a entrega da O\.S \d+">Lançar</);
  }
  // O.S e cliente na mesma célula, serviço em letra menor, idade da baixa ao lado da data.
  assert.match(html, /<strong>9001<\/strong> Cliente fictício 1<\/span><small>Fachada fictícia<\/small>/);
  assert.match(html, /16\/09\/26 <small class="ent-fila-idade velha">há 13 dias<\/small>/);
  assert.match(html, /25\/09\/26 <small class="ent-fila-idade">há 4 dias<\/small>/, 'menos de uma semana: sem a cor de atraso');
  assert.doesNotMatch(html, /2[67]\/09\/26/, 'as duas mais novas ficam para o "Mostrar todas"');
  // Mostrar todas: as 12, e o botão oferece voltar às 10.
  const todas = secao(tela(t, 'STATE._entFilaTodas = true;'));
  assert.equal((todas.match(/data-lancar-os="/g) || []).length, 12);
  assert.match(todas, /Mostrar só as 10 primeiras/);
});

test('fila aberta: o clique do Lançar continua chamando lancarEntregaManual com o id da O.S.', () => {
  const t = casa(doze());
  const lancar = { dataset: { lancarOs: 'b3' } };
  tela(t, 'STATE._entFilaAberta = true; var __lancadas = []; lancarEntregaManual = id => __lancadas.push(id);', { '[data-lancar-os]': [lancar] });
  lancar.onclick();
  assert.deepEqual([...t.run('__lancadas')], ['b3']);
});

test('fila: o botão abre e fecha pelo STATE (a tela repinta sozinha a cada mês do ERP)', () => {
  const t = casa(doze());
  const botao = { dataset: {} };
  tela(t, '', { '[data-ent-fila]': [botao] });
  botao.onclick();
  assert.equal(t.run('STATE._entFilaAberta'), true);
  assert.match(t.run('__el.innerHTML'), /Esconder a fila/, 'o clique repinta já aberta');
  const ordem = { dataset: { entFilaOrdem: 'valor' } };
  tela(t, '', { '[data-ent-fila-ordem]': [ordem] });
  ordem.onclick();
  assert.equal(t.run('STATE._entFilaOrdem'), 'valor');
});

test('fila: técnicos só aparecem se alguma baixa tiver equipe, e "sem equipe" nunca se repete', () => {
  const sem = secao(tela(casa(doze()), 'STATE._entFilaAberta = true;'));
  assert.doesNotMatch(sem, /<th>Técnicos<\/th>/, 'ninguém tem equipe: a coluna nem aparece');
  assert.doesNotMatch(sem, /sem equipe/i);
  const fila = doze(); fila[0].equipe = ['Natan'];
  const com = secao(tela(casa(fila), 'STATE._entFilaAberta = true;'));
  assert.match(com, /<th>Técnicos<\/th>/);
  assert.match(com, /<td class="ent-fila-tec">Natan<\/td>/);
  assert.equal((com.match(/<td class="ent-fila-tec vazio"><span class="ent-fila-traco" title="Sem equipe na O\.S\.">—<\/span><\/td>/g) || []).length, 9, 'as outras nove ganham só um traço');
  assert.doesNotMatch(com, />sem equipe</i);
});

test('fila: ordena por mais antigas (padrão) ou maior valor, com a sem valor no fim', () => {
  const fila = [baixa(1, '2026-09-20', { valorTotal: 500 }), baixa(2, '2026-09-16', { valorTotal: 9000 }), baixa(3, '2026-09-18', { valorTotal: undefined }), baixa(4, '2026-09-25', { valorTotal: 20000 })];
  const ordem = html => [...secao(html).matchAll(/data-lancar-os="(b\d)"/g)].map(m => m[1]);
  const t = casa(fila);
  assert.deepEqual(ordem(tela(t, 'STATE._entFilaAberta = true;')), ['b2', 'b3', 'b1', 'b4']);
  assert.deepEqual(ordem(tela(t, "STATE._entFilaOrdem = 'valor';")), ['b4', 'b2', 'b1', 'b3']);
  assert.match(secao(tela(t, '')), /data-ent-fila-ordem="valor" aria-pressed="true"/);
});

test('fila: a baixa fora do período escolhido vem marcada, e continua na fila', () => {
  const html = secao(tela(casa(doze()), "STATE._entFilaAberta = true; STATE._fEnt = { de: '2026-08-01', ate: '2026-08-31' };"));
  assert.equal((html.match(/<small class="text-muted ent-fila-fora">fora do período<\/small>/g) || []).length, 10, 'uma marca por linha visível');
  assert.equal((html.match(/data-lancar-os="/g) || []).length, 10, 'e as pendências continuam na fila, mesmo fora do período');
});

test('fila vazia: uma linha discreta no lugar da faixa', () => {
  const html = tela(casa([]));
  assert.match(html, /<p class="ent-fila-vazia">[^]*Nada pendente de lançamento\.<\/p>/);
  assert.doesNotMatch(html, /<section class="ent-fila/);
});

test('ordem da página: cartões, faixa da fila, filtros, lista do período e só então os relatórios', () => {
  const erp = [{ numero: '7001', cliente: 'Cliente fictício A', servico: 'Letreiro', data: '2026-09-10', valor: 5000, tipo: 'externo' }];
  const html = tela(casa(doze(), { erp }), 'STATE._entFilaAberta = false;');
  const pos = k => html.indexOf(k);
  const ordem = ['class="ent-kpis"', 'class="ent-fila casa-lancar"', 'class="ent-controles"', 'ent-lista-tabela', 'class="casa-relatorios"'];
  for (const k of ordem) assert.ok(pos(k) >= 0, `faltou ${k}`);
  for (let i = 1; i < ordem.length; i++) assert.ok(pos(ordem[i - 1]) < pos(ordem[i]), `${ordem[i - 1]} tem de vir antes de ${ordem[i]}`);
  // O intervalo do filtro sem travessão.
  assert.match(html, /<span class="ent-intervalo">De 01\/09\/2026 a 29\/09\/2026<\/span>/);
});

test('cartões: o do mês é o grande quando o período é o mês, e hoje sem entrega é uma linha leve', () => {
  const erp = [{ numero: '7001', cliente: 'A', servico: 'Letreiro', data: '2026-09-10', valor: 5000, tipo: 'externo' }];
  const html = tela(casa([], { erp }));
  const cartoes = (html.match(/<div class="ent-kpis">[\s\S]*?<\/div><\/div>/) || [''])[0];
  assert.match(cartoes, /casa-kpi ent-kpi-principal[^"]*">\s*<b>R\$\s?5\.000,00<\/b>\s*<small>entregue em set\/2026/);
  assert.doesNotMatch(cartoes, /entregue no mês/, 'o mês não se repete ao lado dele mesmo');
  assert.match(cartoes, /entregue no ano/);
  assert.match(cartoes, /<div class="casa-kpi ent-kpi-sec ent-kpi-nada"><span>Nada entregue hoje<\/span><\/div>/);
  assert.doesNotMatch(cartoes, /R\$\s?0,00/, 'nada de zero grande');
});

test('cartões: período escolhido é o grande (marcado), e hoje carregando mantém o aviso', () => {
  const t = casa([]);   // nenhum mês do ERP chegou ainda
  const html = tela(t, "STATE._fEnt = { de: '2026-05-01', ate: '2026-05-31' };");
  assert.match(html, /casa-kpi escolhido ent-kpi-principal alerta">\s*<b>…<\/b>\s*<small>entregue em mai\/2026/);
  assert.match(html, /casa-kpi ent-kpi-sec alerta">\s*<b>…<\/b>\s*<small>entregue hoje/, 'hoje sem resposta do ERP não vira "Nada entregue hoje"');
  assert.doesNotMatch(html, /Nada entregue hoje/);
  assert.match(html, /entregue no mês/);
  assert.match(html, /entregue no ano/);
  assert.match(html, /carregando 1 de 1 mês/);
});

test('Performance: "Abrir o lançamento" chega em Entregas com a fila já aberta', () => {
  let clicou = false;
  const c = { STATE: {}, document: { querySelector: s => s.includes('entregas') ? { click: () => { clicou = true; } } : null }, setTimeout: () => {} };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(root, 'performance.js'), 'utf8'), c);
  c.perfAbrirLancamento();
  assert.ok(clicou);
  assert.equal(c.STATE._entFilaAberta, true);
  assert.equal(c.STATE._entAba, '');
});

test('estilo: alvos de toque da fila e as linhas virando cartão no celular', () => {
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const bloco = css.slice(css.indexOf('ENTREGAS: CARTÕES COM HIERARQUIA E A FILA EM FAIXA'));
  assert.ok(bloco.length > 100, 'o bloco de estilo da revisão sumiu');
  const alt = sel => { const m = bloco.match(new RegExp(sel.replace(/[.#]/g, '\\$&') + '\\{[^}]*min-height:(\\d+)px')); return m ? Number(m[1]) : 0; };
  assert.ok(alt('#panel-entregas .ent-fila-botao') >= 44, 'Ver a fila / Esconder: 44 px');
  assert.ok(alt('#panel-entregas .ent-fila-lancar') >= 40, 'Lançar: 40 px');
  assert.ok(alt('#panel-entregas .ent-fila-mais') >= 40, 'Mostrar todas: 40 px');
  const celular = bloco.slice(bloco.indexOf('@media (max-width:600px)'));
  assert.match(celular, /\.ent-fila-tabela thead\{display:none\}/);
  assert.match(celular, /\.ent-fila-tabela tr\{display:grid/);
  assert.match(celular, /\.ent-lista-tabela tr\{display:grid/);
});
