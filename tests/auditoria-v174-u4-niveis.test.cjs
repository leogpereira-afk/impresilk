'use strict';
/* U4 DA AUDITORIA DE 12/10/2026: Configurações › Níveis de acesso fazia a
   página inteira rolar de lado (a tabela larga sem contêiner) e mostrava os
   papéis pelo nome interno ("operacao", "pcp"). Agora a tabela rola dentro de
   um contêiner próprio e os papéis têm rótulo de gente. Dados fictícios. */
const {test} = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ler = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('U4: a tabela dos níveis rola no próprio contêiner e os papéis têm rótulo de gente', () => {
  const src = ler('app.js');
  const i = src.indexOf("  const PAPEIS = ['pcp', 'montagem', 'operacao', 'comercial'];"), fim = "    </div>` : '';", j = src.indexOf(fim, i) + fim.length;
  assert.ok(i > 0 && j > i);
  const ctx = vm.createContext({isAdmin:true, esc:s => String(s ?? ''), ABAS_DISPONIVEIS:['painel', 'pcp'], ABAS_NOMES:{painel:'Painel', pcp:'PCP'},
    getPermissoes:() => Object.fromEntries(['pcp', 'montagem', 'operacao', 'comercial'].map(p => [p, {abas:'*', editar:true, cadastrar:false}]))});
  vm.runInContext('const PERM = getPermissoes();\n' + src.slice(i, j) + '\nthis.__html = niveisHTML;', ctx);
  const html = ctx.__html;
  assert.match(html, /<div class="niveis-rolagem" role="region"[^>]*tabindex="0"><table class="control-table niveis-table">/);
  assert.match(html, /<\/table><\/div>/);
  for (const r of ['PCP', 'Montagem', 'Operação', 'Comercial']) assert.match(html, new RegExp(`<th scope="row"><strong>${r}</strong></th>`));
  assert.doesNotMatch(html, /<strong>operacao<\/strong>|<strong>pcp<\/strong>/);
  assert.match(html, /aria-label="Operação: editar"/);
  assert.match(ler('styles.css'), /\.niveis-rolagem \{ max-width: 100%; overflow-x: auto;/);
});
