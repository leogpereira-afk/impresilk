'use strict';
/* OS PEQUENOS DA AUDITORIA DE 12/10/2026: a busca por documento, a régua de
   pessoas (fichasRH, contratos de freelancer) e o elenco liam o RH de uma vez
   só, e o banco devolve no máximo 1000 linhas (max_rows): acima disso, a
   pessoa que ficou de fora "não existia" (no fbc56b9 a ficha 1200 não era
   achada). Agora leem em páginas. Dados fictícios. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs');
const cpfDe=i=>String(300000000+i).padStart(9,'0')+'00';
const fichas=n=>Array.from({length:n},(_,i)=>{const id='f'+String(i).padStart(5,'0');return {colecao:'colaboradores',id,apagado:false,registro:{id,nome:'Pessoa Fictícia '+i,apelido:'pessoa'+i,cpf:cpfDe(i),statusId:'ativo'}};});
const gestor={papel:'pcp',nome:'Gestor Teste',sub:'gestor'};

test('RH com mais de 1000 fichas: a busca por documento, a régua e o elenco veem todas',async()=>{
  const e=await edge('pcp-sync',{registros:fichas(1205)});
  const r=await e.call({action:'pessoaPorDocumento',documento:cpfDe(1200)},gestor);
  assert.equal(r.status,200,JSON.stringify(r));
  assert.deepEqual(r.pessoas.map(p=>p.nome),['Pessoa Fictícia 1200']);
  const regua=await e.run('pessoasDoPCP()');
  assert.equal(regua.fichas.length,1205);
  const el=await e.call({action:'elenco'},gestor);
  assert.equal(el.pessoas.length,1205);
});
