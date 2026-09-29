/* AS LISTAS FECHADAS DAS EQUIPES (F06, 29/09/2026). Animal e cor moram em
 * dois lugares: a tela (performance.js) e o servidor (_shared/pcp-integridade).
 * Lista copiada falha calada: um animal novo só na tela seria "ignorado com
 * aviso" pelo servidor a cada salvar, e uma cor só no servidor não teria
 * token no CSS. Este teste cobra as três pontas iguais.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../performance.js');

test('animais: a mesma lista, na mesma ordem, com rótulo e ícone, na tela e no servidor', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  assert.deepEqual(JSON.parse(JSON.stringify(P.ANIMAIS)), JSON.parse(JSON.stringify(S.ANIMAIS_EQUIPE)));
  assert.deepEqual(P.ANIMAIS.map(a => a.id), ['aguia', 'leao', 'pantera', 'lobo', 'tigre', 'falcao', 'carcara', 'onca', 'lobo-guara', 'touro']);
  for (const a of P.ANIMAIS) {
    assert.ok(a.rotulo && a.icone, a.id);
    assert.doesNotMatch(a.rotulo, /—/, 'sem travessão no texto que o usuário vê');
  }
  // Rótulos diferentes mesmo quando o ícone se repete (Águia e Falcão, Pantera e Onça).
  assert.equal(new Set(P.ANIMAIS.map(a => a.rotulo)).size, 10);
});

test('cores: a mesma paleta na tela e no servidor, e cada uma com token e classe no CSS', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  assert.deepEqual(JSON.parse(JSON.stringify(P.CORES)), JSON.parse(JSON.stringify(S.CORES_EQUIPE)));
  // 10 da F06 + 4 tiradas das logos das equipes (marinho, ocre, terracota, vinho).
  assert.equal(P.CORES.length, 14);
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  for (const c of P.CORES) {
    assert.match(c.id, /^[a-z]+$/, 'chave vira nome de classe: só letras');
    assert.match(css, new RegExp(`--equipe-${c.id}\\s*:\\s*#[0-9a-f]{6}`, 'i'), 'token da cor ' + c.id);
    assert.match(css, new RegExp(`\\.perf-cor-${c.id}\\s*\\{[^}]*--equipe-cor\\s*:\\s*var\\(--equipe-${c.id}\\)`), 'classe da cor ' + c.id);
  }
});

test('emblemas antigos continuam aceitos, e o ícone de cada animal também', async () => {
  const {validarPerformance} = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const eq = emblema => ({equipes:[{id:'e', nome:'Equipe', emblema, membros:[{chave:'100001', nome:'Ana'}]}], participacoes:[]});
  for (const x of P.EMBLEMAS) assert.equal(validarPerformance(eq(x)), '', 'emblema antigo ' + x);
  for (const a of P.ANIMAIS) assert.equal(validarPerformance(eq(a.icone)), '', 'ícone de ' + a.id);
  assert.ok(validarPerformance(eq('<b>')), 'fora das listas continua recusado');
});

/* AS LOGOS DAS 10 EQUIPES (mandadas pelo Léo em 29/09/2026) são arquivos do site:
   cada animal tem a sua, ela existe na raiz, entra na casca do sw.js (offline) e
   a publicação copia *.webp. A cor sugerida de cada animal é uma chave da paleta. */
test('logos: um arquivo por animal, no disco, na casca do offline e na publicação', () => {
  const raiz = path.join(__dirname, '..');
  const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
  const deploy = fs.readFileSync(path.join(raiz, '.github/workflows/deploy.yml'), 'utf8');
  assert.deepEqual(Object.keys(P.LOGO_ANIMAL).sort(), P.ANIMAIS.map(a => a.id).sort());
  for (const [animal, arq] of Object.entries(P.LOGO_ANIMAL)) {
    assert.match(arq, /^equipe-[a-z-]+\.webp$/, animal);
    const st = fs.statSync(path.join(raiz, arq));
    assert.ok(st.size > 1000 && st.size < 40000, `${arq}: ${st.size} bytes`);
    assert.ok(sw.includes(`'${arq}'`), `${arq} fora da casca do sw.js: não abre offline`);
  }
  assert.match(deploy, /cp \*\.webp dist\//, 'a publicação precisa copiar as logos');
});
test('cor sugerida de cada animal é uma chave da paleta, e cada animal tem a sua', () => {
  assert.deepEqual(Object.keys(P.COR_ANIMAL).sort(), P.ANIMAIS.map(a => a.id).sort());
  for (const c of Object.values(P.COR_ANIMAL)) assert.ok(P.corValida(c), c);
  assert.equal(new Set(Object.values(P.COR_ANIMAL)).size, 10, 'duas equipes com a mesma cor sugerida');
});
