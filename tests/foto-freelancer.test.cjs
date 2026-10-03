const { test } = require('node:test');
const assert = require('node:assert/strict');
const foto = 'data:image/jpeg;base64,Zm90bw==';
const propria = 'data:image/png;base64,cHJvcHJpYQ==';
const contrato = { id: 'contrato', cpf: '90000100129', fotoDataUrl: propria };
const ficha = { id: 'ficha', cpf: '900.001.001-29', fotoDataUrl: foto, statusId: 'inativo', dataDesligamento: '2026-01-01' };

test('elenco usa foto da ficha anterior, e alterações/remoções refletem sem cópia no contrato', async () => {
  const { fotoFreelancerRH: resolver } = await import('../supabase/functions/_shared/foto-freelancer.mjs');
  assert.equal(resolver(contrato, [ficha]), foto);
  assert.equal(resolver(contrato, [{ ...ficha, fotoDataUrl: null }]), '');
  assert.equal(resolver(contrato, []), propria);
});
test('identidade nunca é deduzida pelo nome, ID curto ou CPF repetido', async () => {
  const { fotoFreelancerRH: resolver } = await import('../supabase/functions/_shared/foto-freelancer.mjs');
  assert.equal(resolver(contrato, [ficha, { ...ficha, id: 'duplicada' }]), '');
  assert.equal(resolver({ ...contrato, exColaboradorId: 'ficha', cpf: '90000200263' }, [ficha]), propria);
  assert.equal(resolver({ ...contrato, cpf: '', exColaboradorId: 'ficha' }, [ficha]), foto);
  assert.equal(resolver({ ...contrato, cpf: '900001' }, [{ ...ficha, cpf: '900001' }]), propria);
});
test('pacote leve, URL externa, SVG e imagem acima do limite não passam', async () => {
  const { fotoFreelancerRH: resolver } = await import('../supabase/functions/_shared/foto-freelancer.mjs');
  assert.equal(resolver(contrato, [ficha], { leve: true }), '');
  assert.equal(resolver(null, [ficha]), '');
  for (const invalida of ['https://example.test/foto.jpg', 'data:image/svg+xml;base64,AA==', 'data:image/jpeg;base64,' + 'a'.repeat(200000)]) {
    assert.equal(resolver({ ...contrato, fotoDataUrl: invalida }, []), '');
  }
});

const { edge } = require('./helpers/edge.cjs');
test('elenco real entrega foto ao PCP e montagem, sem CPF nem foto no pacote leve', async () => {
  const registros = [
    { id: 'ficha', colecao: 'colaboradores', apagado: false, registro: { ...ficha, nome: 'Pessoa fictícia' } },
    { id: 'contrato', colecao: 'freelancers', apagado: false, registro: { ...contrato, nome: 'Pessoa fictícia', situacao: 'ativo', contratoFim: '2099-12-31' } },
  ];
  const e = await edge('pcp-sync', { registros });
  for (const papel of ['pcp', 'montagem']) {
    const r = await e.call({ action: 'elenco', freelancers: true }, { papel, nome: 'Gestor' });
    assert.equal(r.status, 200, r.error);
    const pessoa = r.pessoas.find(p => p.chave === 'freelancer:contrato');
    assert.equal(pessoa.foto, foto);
    assert.ok(!JSON.stringify(r).includes(contrato.cpf));
    const leve = await e.call({ action: 'elenco', freelancers: true, leve: true }, { papel, nome: 'Gestor' });
    assert.equal(leve.pessoas.find(p => p.chave === 'freelancer:contrato').foto, '');
  }
});
