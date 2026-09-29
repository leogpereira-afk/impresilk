/* SEM ENDEREÇO NA PROGRAMAÇÃO DO WHATSAPP (pedido do Léo, 29/09/2026). O
   endereço da O.S. vem do cadastro do cliente no ERP (o do CNPJ), não do local
   da instalação: mandado no grupo, levava a equipe para a sede do cliente. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const corpo = nome => { const i = app.indexOf(`function ${nome}(`); assert.ok(i >= 0, nome); const j = app.indexOf('\nfunction ', i + 10); return app.slice(i, j); };
test('mensagens de WhatsApp da programação não levam o endereço do cadastro', () => {
  for (const f of ['montarMensagemDia', 'abrirWhatsAppDia', 'montarTextoWhatsApp']) {
    assert.doesNotMatch(corpo(f).replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, ''), /os\.endereco/, f);
  }
});
