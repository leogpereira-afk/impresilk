/* GUARDAS DE ESTILO (auditoria do PCP, 25/09/2026).
 *
 * CSS não quebra teste: um alvo de toque que volta a 20 px, ou uma regra de
 * toque que escorrega para dentro de um media query de celular, passa verde
 * por todo o resto da suíte. Estes testes leem o styles.css e o index.html e
 * cobram só o que a auditoria mediu e o conserto mudou.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Regras do arquivo, com o media query em que moram ('' = fora de media query).
function regras(fonte) {
  const s = fonte.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let i = 0, media = '', fimMedia = -1, prof = 0;
  while (i < s.length) {
    const ab = s.indexOf('{', i);
    if (ab < 0) break;
    const fecha = s.indexOf('}', i);
    if (fecha >= 0 && fecha < ab) { // fecha um bloco @media
      prof--; if (prof === 0) media = ''; i = fecha + 1; continue;
    }
    const cab = s.slice(i, ab).trim();
    if (cab.startsWith('@')) { media = cab; prof++; i = ab + 1; continue; }
    const fim = s.indexOf('}', ab);
    const decl = {};
    for (const d of s.slice(ab + 1, fim).split(';')) {
      const k = d.indexOf(':');
      if (k > 0) decl[d.slice(0, k).trim()] = d.slice(k + 1).trim();
    }
    for (const sel of cab.split(',')) out.push({sel: sel.trim().replace(/\s+/g, ' '), decl, media});
    i = fim + 1;
  }
  return out;
}
const R = regras(css);
// Valor da última declaração da propriedade para o seletor exato, fora de media query.
function valor(sel, prop) {
  const achadas = R.filter(r => r.sel === sel && !r.media && r.decl[prop] !== undefined);
  return achadas.length ? achadas[achadas.length - 1].decl[prop] : undefined;
}
const px = v => parseFloat(String(v));

test('o × de apagar foto tem área de toque de 40 px em qualquer largura', () => {
  // Era 20 px encostado no canto da miniatura: apagava a prova do serviço sem querer.
  const lado = px(valor('.foto-rm', 'width'));
  const folga = -px(valor('.foto-rm::after', 'inset'));
  assert.ok(lado >= 32, `.foto-rm tem ${lado} px`);
  assert.ok(lado + 2 * folga >= 40, `área de toque do × é ${lado + 2 * folga} px`);
  assert.equal(px(valor('.equipe-app .foto-rm', 'width')), 40, 'no espelho (luva) o × é de 40 px visíveis');
  assert.equal(px(valor('.equipe-app .foto-rm', 'height')), 40);
});

test('diálogo modal abre no centro, não colado no canto', () => {
  // O reset `* { margin: 0 }` anulava o margin:auto do navegador.
  assert.equal(valor('dialog', 'margin'), 'auto');
});

test('checkbox dentro de .field não herda a largura dos campos de texto', () => {
  // "Instalação OK" virava um quadrado de 13 px no meio de 298 px de largura.
  assert.equal(valor('.field input[type=checkbox]', 'width'), '20px');
});

test('espelho: régua de toque da ficha fora de media query', () => {
  const alvos = [
    ['.equipe-app #modal-os #m-finalizar', 48],
    ['.equipe-app #modal-os #m-carro', 48],
    ['.equipe-app #modal-os #m-save', 44],
    ['.equipe-app .item-card .seg button', 44],
    ['.equipe-app .card-fs summary', 44],
    ['.equipe-app .inline-link', 44],
    ['.equipe-app .topbar-actions button', 44],
  ];
  for (const [sel, min] of alvos) {
    const v = px(valor(sel, 'min-height'));
    assert.ok(v >= min, `${sel}: min-height ${v} (mínimo ${min}), fora de media query`);
  }
  assert.ok(px(valor('.equipe-app #modal-os .modal-close', 'width')) >= 44, 'o × da ficha');
});

test('espelho: a régua dos itens não encolhe os botões da limpeza do carro', () => {
  // `.volta-eq .seg button` pede 48 px; uma regra `.equipe-app .seg button`
  // (mesma especificidade, mais abaixo no arquivo) os derrubaria para 44.
  assert.equal(px(valor('.volta-eq .seg button', 'min-height')), 48);
  const atropela = R.filter(r => r.sel === '.equipe-app .seg button' && r.decl['min-height']);
  assert.deepEqual(atropela, [], 'use .item-card .seg para não pegar a tela da limpeza');
});

test('conflito de edição: cada botão diz o que se perde, e nenhum é o azul', () => {
  const recarregar = html.match(/<button[^>]*id="conflict-reload"[^>]*>([\s\S]*?)<\/button>/);
  const sobrescrever = html.match(/<button[^>]*id="conflict-overwrite"[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(recarregar && sobrescrever);
  assert.match(recarregar[1], /descarta/);
  assert.match(sobrescrever[1], /substitui/);
  // O app.js diz '"Sobrescrever" vai reabri-la': o botão tem de manter a palavra.
  assert.match(sobrescrever[1], /^Sobrescrever/);
  assert.doesNotMatch(recarregar[0], /btn-primary/);
});

test('pop-up de escolha: o campo novo tem type e o Enter não recarrega a página', () => {
  assert.match(html, /<input type="text" id="picker-novo"/);
  const form = html.match(/<form class="picker-add"[^>]*>/);
  assert.ok(form, 'o campo precisa de um form para o Enter acionar o Adicionar');
  assert.match(form[0], /onsubmit="return false"/, 'sem cancelar, o envio recarregaria a página no meio da ficha');
  assert.match(html, /<button type="submit"[^>]*id="picker-add-btn"/);
});
