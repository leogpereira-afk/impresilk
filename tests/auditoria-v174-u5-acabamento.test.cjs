'use strict';
/* U5 DA AUDITORIA DE 12/10/2026: a mesma ação com dois nomes ("Itens, equipes
   e saldo →" e "Conferir itens e equipe"), o botão repetido na ficha (dois
   "Conferir itens e equipe" para a gestão, dois "Solicitar revisão à gestão"
   para a montagem), travessões em frase ("Atualizado por —", "Cliente —
   Serviço", "Valor unitário R$ —") e alvos de toque abaixo de 40 px. Dados
   fictícios. */
const {test} = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ler = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
function controle(papel, comAvisoAcima) {
  const ctx = vm.createContext({STATE:{user:{papel}}, esc:s => String(s ?? ''), resumoEntregaFichaTexto:() => '', CONTROLE_CLASSIFICACOES:{},
    conferirEntregaFichaHTML:() => comAvisoAcima ? '<div class="ent-conferir">…</div>' : '', confRevisoesHTML:() => ''});
  vm.runInContext(ler('controle-entrega-ui.js'), ctx);
  return ctx;
}

test('U5: um botão "Conferir itens e equipe" por ficha, e um "Solicitar revisão à gestão" só', () => {
  const os = {id:'1', numero:'T1', cliente:'Cliente fictício', itens:[]};
  // Com o aviso da entrega acima dos itens, o Conferência e acompanhamento não repete o botão.
  const com = controle('pcp', true).controleEntregaHTML(os);
  assert.doesNotMatch(com, /data-controle="itens"/);
  assert.match(com, /O botão "Conferir itens e equipe" fica acima, junto dos itens\./);
  const sem = controle('pcp', false).controleEntregaHTML(os);
  assert.equal((sem.match(/>Conferir itens e equipe</g) || []).length, 1);
  // A montagem: "Solicitar revisão à gestão" só no Conferência e acompanhamento (o rodapé da ficha não repete).
  assert.equal((controle('montagem', false).controleEntregaHTML(os).match(/Solicitar revisão à gestão/g) || []).length, 1);
  const app = ler('app.js');
  const rodape = app.slice(app.indexOf('<button class="btn-ghost btn-sm" id="modal-pdf">'), app.indexOf('<button class="btn-ghost btn-sm" id="modal-pdf">') + 1200);
  assert.doesNotMatch(rodape, /Solicitar revisão à gestão/);
  // Um nome só para a ação: o atalho das entregas conferidas também diz "Conferir itens e equipe".
  assert.doesNotMatch(ler('controle-entrega-ui.js'), /Itens, equipes e saldo/);
});

test('U5: sem travessão em frase nas fichas e nos cartões', () => {
  const app = ler('app.js'), casa = ler('casa.js');
  for (const ruim of ["Atualizado por ${esc(os.atualizadoPor || '—')}", "O.S finalizada por <strong>${esc(os.finalizadoPor || '—')}", "Liberado para instalação por ${esc(os.aptoPor || '—')}",
    "por ${esc(os.carroLiberadoPor||'—')}", "Finalizada por ${esc(os.finalizadoPor||'—')}", "' — '+esc(os.servico)", "' — ' + esc(os.servico)", "fmtValorBR(unit) : '—'", "os.criadoPor || '—'"])
    assert.ok(!app.includes(ruim), ruim);
  assert.ok(!casa.includes("+' — '+(o.servico||'')"), 'o PDF da Programação');
  assert.match(app, /Atualizado por \$\{esc\(os\.atualizadoPor \|\| 'não informado'\)\}/);
  assert.match(app, /Valor unitário \$\{Number\.isFinite\(unit\) \? 'R\$ ' \+ esc\(fmtValorBR\(unit\)\) : 'não informado'\}/);
});

test('U5: alvos de toque de 40 px (arquivar, meses dos Relatórios, O.S. das prioridades, setas do Painel, Liberar)', () => {
  const css = ler('styles.css');
  for (const r of [/\[data-arquivar-os\] \{ min-width: 40px; min-height: 40px; \}/, /#panel-entregas \.rel-ent-meses button, \.rel-ent-meses button \{ min-height: 40px; min-width: 40px; \}/,
    /\.op-prioridades \.inline-link\[data-os-id\] \{[^}]*min-height: 40px; \}/, /#lt-menos, #lt-mais \{ min-width: 40px; min-height: 40px; \}/, /\.btn-liberar \{ min-height: 40px; \}/])
    assert.match(css, r);
  // A regra mais específica de antes (34 px) vem antes da nova, que vence.
  assert.ok(css.lastIndexOf('#panel-entregas .rel-ent-meses button{min-height:34px') < css.lastIndexOf('#panel-entregas .rel-ent-meses button, .rel-ent-meses button { min-height: 40px'));
});
