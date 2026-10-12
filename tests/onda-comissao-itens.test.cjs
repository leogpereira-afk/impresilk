'use strict';
/* ONDA COMISSÃO (fila única de 11/10/2026), itens 3 em diante: o CSV, quem
   fechou e quem aprovou pelo ID, o registro da exportação, os documentos, a
   fita dos meses, o retrato no fechamento, o líquido mudado depois da
   aprovação e a prévia depois da compensação. Cada teste começa pelo caso
   ruim. Dados fictícios. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../comissao.js');

/* ------------------------------------------------------------------ item 3 */
const aprovacao=(pessoas,extra={})=>({id:'2026-11-01:2026-11-30:000002',de:'2026-11-01',ate:'2026-11-30',tipo:'aprovacao',...extra,
  apuracao:{aprovavel:true,config:{modo:'efetivo'},fechamentoId:'2026-11-01:2026-11-30:000001',anteriorAprovacao:null,
    ajustes:pessoas.map(([pessoaId,nome,centavos])=>({pessoaId,nome,tipo:'externa',centavos,diferencaCentavos:centavos}))}});
test('item 3: o CSV leva o ID de 6 dígitos e o mês como texto para o Excel (="012345"), e o resto continua protegido',async()=>{
  const {COMISSAO:S}=await import('../supabase/functions/_shared/pcp-comissao.mjs');
  const r=aprovacao([['012345','Pessoa fictícia',57600],['100002','=HYPERLINK("x")',38400]]);
  for(const M of [C,S]){
    const csv=M.csv(r),linhas=csv.replace(/^﻿/,'').split('\r\n');
    assert.equal(linhas[0],'"Revisão";"Mês";"Fechamento";"Aprovação anterior";"Pessoa ID";"Nome";"Tipo";"Total atual (R$)";"Diferença a conciliar (R$)"');
    assert.equal(linhas[1],'"2026-11-01:2026-11-30:000002";"=""2026-11""";"2026-11-01:2026-11-30:000001";"";"=""012345""";"Pessoa fictícia";"externa";"576,00";"576,00"');
    // O nome que parece fórmula continua com a proteção (o apóstrofo na frente).
    assert.match(linhas[2],/;"'=HYPERLINK\(""x""\)";/);
  }
  assert.equal(C.csv(r),S.csv(r));
  // ID que não é de 6 dígitos não vira fórmula (nunca deveria chegar aqui: o motor só paga ID).
  assert.match(C.csv(aprovacao([['12345','Pessoa fictícia',100]])),/;"12345";/);
});
