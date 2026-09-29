/* MOTOR DE DIVISÃO (F04). Regra do dono: 1 pessoa = 100%; 2 = líder 60 e
   ajudante 40; 3 = 40/30/30; 4 ou mais = líder 40 e o resto igual entre os
   ajudantes. Freelancer segue o papel. Duas equipes na mesma O.S.: primeiro a
   cota de cada equipe (proporcional ao número de pessoas), depois líder e
   ajudante dentro dela. Tudo em inteiros de 0,01% (10000 = 100%), a sobra do
   arredondamento vai para o líder, e cada nível soma exatamente 10000.
   Os testes partem dos casos ruins: sobra que some, cota que não fecha,
   cadeado em todos, pessoa em dois grupos, nome ambíguo virando gente.
   Dados fictícios: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const D = require('../divisao.js');
const O = require('../operacao.js');

const soma = xs => xs.reduce((s, x) => s + x, 0);
const cotas = g => g.membros.map(m => m.cota);
const final = a => D.finais(a).map(f => f.cota);
const ids = n => Array.from({length:n}, (_, i) => String(100001 + i));
const grupo = (pessoas, extra = {}) => ({equipeId:null, liderId:pessoas[0], membros:pessoas.map(p => ({pessoaId:p})), ...extra});

test('padrão de 1 a 8 pessoas: tabela do dono, sobra no líder e soma 10000', () => {
  assert.deepEqual(D.padrao(1), [10000]);
  assert.deepEqual(D.padrao(2), [6000, 4000]);
  assert.deepEqual(D.padrao(3), [4000, 3000, 3000]);
  assert.deepEqual(D.padrao(4), [4000, 2000, 2000, 2000]);
  assert.deepEqual(D.padrao(5), [4000, 1500, 1500, 1500, 1500]);
  assert.deepEqual(D.padrao(6), [4000, 1200, 1200, 1200, 1200, 1200]);
  // Com 7, os 60% dos ajudantes dividem exatos por 6 (10% cada): não há sobra.
  assert.deepEqual(D.padrao(7), [4000, 1000, 1000, 1000, 1000, 1000, 1000]);
  // A primeira sobra de verdade é com 8: 6000/7 = 857,14. O 0,01% que sobra é do líder.
  assert.deepEqual(D.padrao(8), [4001, 857, 857, 857, 857, 857, 857, 857]);
  for (let n = 1; n <= 30; n++) assert.equal(soma(D.padrao(n)), 10000, `${n} pessoas somam 100%`);
  assert.deepEqual(D.padrao(0), []);
});

test('a tabela é parâmetro: outra regra vale; regra quebrada cai na do dono', () => {
  const regra = {tabela:{1:[10000], 2:[5000, 5000], 3:[3400, 3300, 3300]}, maisLider:3000};
  assert.deepEqual(D.padrao(2, regra), [5000, 5000]);
  assert.deepEqual(D.padrao(4, regra), [3001, 2333, 2333, 2333], '70% / 3 = 2333,33: a sobra vai para o líder');
  assert.equal(D.regraValida(regra), true);
  assert.equal(D.regraValida({tabela:{2:[6000, 3000]}, maisLider:4000}), false, 'linha que não soma 100%');
  assert.equal(D.regraValida({tabela:{2:[6000.5, 3999.5]}, maisLider:4000}), false, 'fração de 0,01% não existe');
  assert.deepEqual(D.padrao(2, {tabela:{2:[7000, 2000]}, maisLider:4000}), [6000, 4000]);
  assert.deepEqual(D.REGRA_PADRAO.tabela[3], [4000, 3000, 3000]);
});

/* REGRA QUE O MOTOR IGNORARIA (revisão da F04). A regra vira configuração na
   F05 e regraValida é a trava de "regra quebrada cai na do dono". Tabela sem
   as linhas 1, 2 e 3 da especificação, ou com chave que o motor não procura
   ('02', '2.0'), passava na trava e a dupla saía líder 40 / ajudante 60. */
test('regraValida: exige as linhas 1, 2 e 3 com chave canônica; senão vale a regra do dono', () => {
  const linhas = {1:[10000], 2:[5000, 5000], 3:[3400, 3300, 3300]};
  for (const r of [
    {tabela:{}, maisLider:4000},
    {tabela:{}, maisLider:0},
    {tabela:{1:[10000]}, maisLider:2000},
    {tabela:{1:[10000], 2:[6000, 4000]}, maisLider:4000},
    {tabela:{1:[10000], '02':[5000, 5000], 3:[3400, 3300, 3300]}, maisLider:4000},
    {tabela:{1:[10000], '2.0':[5000, 5000], 3:[3400, 3300, 3300]}, maisLider:4000},
    {tabela:{...linhas, '2.0':[9000, 1000]}, maisLider:4000},
    {tabela:{...linhas, ' 4':[4000, 2000, 2000, 2000]}, maisLider:4000},
  ]) {
    assert.equal(D.regraValida(r), false, JSON.stringify(r));
    assert.deepEqual(D.padrao(2, r), [6000, 4000], 'cai na regra do dono: ' + JSON.stringify(r));
    assert.deepEqual(D.padrao(3, r), [4000, 3000, 3000]);
  }
  assert.equal(D.regraValida({tabela:linhas, maisLider:4000}), true);
  assert.equal(D.regraValida({tabela:{...linhas, 4:[4000, 2000, 2000, 2000]}, maisLider:4000}), true, 'linha a mais, canônica, vale');
});

test('montar: o líder leva a parte de líder onde estiver na lista; freelancer segue o papel', () => {
  const [a, b, c] = ids(3);
  // Freelancer como ajudante.
  let x = D.montar([{equipeId:'eq-aguia', liderId:a, membros:[{pessoaId:a}, {pessoaId:b, freelancer:true}]}]);
  assert.deepEqual(x.grupos[0].membros.map(m => [m.pessoaId, m.papel, m.cota, !!m.freelancer]), [[a, 'lider', 6000, false], [b, 'ajudante', 4000, true]]);
  // Freelancer como líder, e o líder no fim da lista.
  x = D.montar([{liderId:c, membros:[{pessoaId:a}, {pessoaId:b}, {pessoaId:c, freelancer:true}]}]);
  assert.deepEqual(x.grupos[0].membros.map(m => [m.papel, m.cota]), [['ajudante', 3000], ['ajudante', 3000], ['lider', 4000]]);
  assert.equal(x.grupos[0].liderId, c);
  assert.equal(x.grupos[0].cota, 10000);
  assert.deepEqual(x.final.map(f => [f.pessoaId, f.cota]), [[a, 3000], [b, 3000], [c, 4000]]);
  assert.equal(D.validar(x), '');
  // Uma pessoa só é a líder, mesmo sem liderId.
  x = D.montar([{membros:[a]}]);
  assert.deepEqual(x.grupos[0].membros.map(m => [m.papel, m.cota]), [['lider', 10000]]);
  assert.equal(D.validar(x), '');
});

test('sem papel: partes iguais, sobra no primeiro, marca "sem líder" e não passa na validação', () => {
  const x = D.montar([{membros:ids(3)}]);
  assert.equal(x.grupos[0].semLider, true);
  assert.deepEqual(cotas(x.grupos[0]), [3334, 3333, 3333]);
  assert.deepEqual(x.grupos[0].membros.map(m => m.papel), ['', '', '']);
  assert.match(D.validar(x), /líder/, 'a sugestão sem líder precisa de uma pessoa antes de gravar');
  // Escolher o líder aplica a tabela e tira a marca.
  const {alocacao, erro} = D.trocarLider(x, 0, '100003');
  assert.equal(erro, '');
  assert.deepEqual(cotas(alocacao.grupos[0]), [3000, 3000, 4000]);
  assert.equal(alocacao.grupos[0].semLider, undefined);
  assert.equal(D.validar(alocacao), '');
});

test('entre equipes: proporcional ao número de pessoas; sobra na maior e, no empate, na primeira', () => {
  assert.deepEqual(D.entreEquipes([2, 3]), [4000, 6000]);
  assert.deepEqual(D.entreEquipes([1, 1]), [5000, 5000]);
  assert.deepEqual(D.entreEquipes([1, 2]), [3333, 6667], 'sobra na equipe com mais gente');
  assert.deepEqual(D.entreEquipes([2, 1]), [6667, 3333]);
  assert.deepEqual(D.entreEquipes([1, 1, 1]), [3334, 3333, 3333], 'empate: a primeira da lista');
  assert.deepEqual(D.entreEquipes([3]), [10000]);
  assert.deepEqual(D.entreEquipes([{membros:[1, 2]}, {membros:[1, 2, 3]}]), [4000, 6000], 'aceita os grupos');
});

test('duas equipes 2+3 e 1+1: dois níveis, cada um soma 10000, e o final também', () => {
  const [a, b, c, d, e] = ids(5);
  let x = D.montar([grupo([a, b], {equipeId:'eq-leao'}), grupo([c, d, e], {equipeId:'eq-lobo'})]);
  assert.deepEqual(x.grupos.map(g => g.cota), [4000, 6000]);
  assert.deepEqual(cotas(x.grupos[0]), [6000, 4000]);
  assert.deepEqual(cotas(x.grupos[1]), [4000, 3000, 3000]);
  assert.deepEqual(final(x), [2400, 1600, 2400, 1800, 1800]);
  assert.equal(soma(final(x)), 10000);
  assert.equal(D.validar(x), '');
  x = D.montar([grupo([a], {equipeId:'eq-leao'}), grupo([b], {equipeId:'eq-lobo'})]);
  assert.deepEqual(final(x), [5000, 5000]);
  assert.deepEqual(D.finais(x).map(f => [f.pessoaId, f.equipeId, f.papel]), [[a, 'eq-leao', 'lider'], [b, 'eq-lobo', 'lider']]);
});

test('cota 33,33% x 40%: o final não dá inteiro, fecha 10000 com a sobra no líder de cada equipe', () => {
  const p = ids(9);
  const x = D.montar([grupo(p.slice(0, 3), {equipeId:'eq-onca'}), grupo(p.slice(3), {equipeId:'eq-touro'})]);
  assert.deepEqual(x.grupos.map(g => g.cota), [3333, 6667]);
  // Onça: 3333 x 40% = 1333,2 e 3333 x 30% = 999,9. Pisos 1333+999+999 = 3331; o líder leva os 2.
  // Touro: 6667 x 40% = 2666,8 e 6667 x 12% = 800,04. Pisos 2666+800x5 = 6666; o líder leva 1.
  assert.deepEqual(final(x), [1335, 999, 999, 2667, 800, 800, 800, 800, 800]);
  assert.equal(soma(final(x)), 10000);
  assert.equal(soma(final(x).slice(0, 3)), 3333, 'o final da equipe é exatamente a cota da equipe');
  // Editar a cota entre equipes para 33,33% x 66,67% à mão dá o mesmo fechamento.
  const y = D.montar([grupo(p.slice(0, 3)), grupo(p.slice(3, 6))]);
  const {alocacao} = D.editar(y, {nivel:'equipes', grupo:0}, 3333);
  assert.deepEqual(alocacao.grupos.map(g => g.cota), [3333, 6667]);
  assert.equal(soma(final(alocacao)), 10000);
  assert.equal(alocacao.manual, true, 'selo "editado à mão"');
});

test('editar dentro da equipe: fixa o valor e reparte o resto na proporção dos outros', () => {
  const x = D.montar([grupo(ids(3))]);
  let r = D.editar(x, {nivel:'membros', grupo:0, pessoaId:'100002'}, 2000);
  assert.equal(r.erro, '');
  // Sobram 8000 para 4000:3000 -> 4571,4 e 3428,6. Pisos 4571+3428 = 7999; o líder leva 1.
  assert.deepEqual(cotas(r.alocacao.grupos[0]), [4572, 2000, 3428]);
  assert.equal(D.validar(r.alocacao), '');
  assert.equal(x.grupos[0].membros[1].cota, 3000, 'a entrada não é alterada');
  // Editar para 0.
  r = D.editar(x, {nivel:'membros', grupo:0, pessoaId:'100003'}, 0);
  assert.deepEqual(cotas(r.alocacao.grupos[0]), [5715, 4285, 0]);
  assert.equal(D.validar(r.alocacao), '');
  // Editar para 10000: os outros vão a zero.
  r = D.editar(x, {nivel:'membros', grupo:0, pessoaId:'100002'}, 10000);
  assert.deepEqual(cotas(r.alocacao.grupos[0]), [0, 10000, 0]);
  // Todos os outros em zero: o resto vai em partes iguais.
  r = D.editar(r.alocacao, {nivel:'membros', grupo:0, pessoaId:'100002'}, 4000);
  assert.deepEqual(cotas(r.alocacao.grupos[0]), [3000, 4000, 3000]);
  assert.equal(soma(final(r.alocacao)), 10000);
});

test('editar: a sobra não cai em quem está em 0% e o líder travado não recebe', () => {
  const x = D.montar([grupo(ids(4))]);
  let r = D.editar(x, {nivel:'membros', grupo:0, pessoaId:'100001'}, 0);
  assert.deepEqual(cotas(r.alocacao.grupos[0]), [0, 3334, 3333, 3333], 'líder em 0: a sobra vai para o primeiro com parte');
  r = D.travar(x, {nivel:'membros', grupo:0, pessoaId:'100001'}, true);
  r = D.editar(r.alocacao, {nivel:'membros', grupo:0, pessoaId:'100002'}, 1000);
  assert.deepEqual(cotas(r.alocacao.grupos[0]), [4000, 1000, 2500, 2500]);
});

test('cadeado: segura um valor; com todos os outros travados a edição é recusada', () => {
  const x = D.montar([grupo(ids(4))]);
  let r = D.travar(x, {nivel:'membros', grupo:0, pessoaId:'100002'}, true);
  assert.equal(r.erro, '');
  r = D.editar(r.alocacao, {nivel:'membros', grupo:0, pessoaId:'100001'}, 5000);
  assert.equal(r.erro, '');
  assert.deepEqual(cotas(r.alocacao.grupos[0]), [5000, 2000, 1500, 1500], 'o travado fica em 20%');
  // Todos menos um travados: só esse um absorve.
  let y = D.travar(x, {nivel:'membros', grupo:0, pessoaId:'100002'}, true).alocacao;
  y = D.travar(y, {nivel:'membros', grupo:0, pessoaId:'100003'}, true).alocacao;
  r = D.editar(y, {nivel:'membros', grupo:0, pessoaId:'100001'}, 3000);
  assert.deepEqual(cotas(r.alocacao.grupos[0]), [3000, 2000, 2000, 3000]);
  // Todos os outros travados: ninguém para receber, recusa sem mudar nada.
  y = D.travar(y, {nivel:'membros', grupo:0, pessoaId:'100004'}, true).alocacao;
  r = D.editar(y, {nivel:'membros', grupo:0, pessoaId:'100001'}, 3000);
  assert.match(r.erro, /cadeado/);
  assert.deepEqual(cotas(r.alocacao.grupos[0]), [4000, 2000, 2000, 2000]);
  // O próprio travado não se edita; passar do que sobra fora dos travados é recusado.
  r = D.editar(y, {nivel:'membros', grupo:0, pessoaId:'100002'}, 1000);
  assert.match(r.erro, /Destrave/);
  const z = D.travar(x, {nivel:'membros', grupo:0, pessoaId:'100002'}, true).alocacao;
  r = D.editar(z, {nivel:'membros', grupo:0, pessoaId:'100001'}, 9000);
  assert.match(r.erro, /máximo aqui é 80%/);
});

test('cadeado por nível: a cota da equipe travada fica; editar a outra ajusta a terceira', () => {
  const p = ids(6);
  let x = D.montar([grupo(p.slice(0, 2)), grupo(p.slice(2, 4)), grupo(p.slice(4))]);
  assert.deepEqual(x.grupos.map(g => g.cota), [3334, 3333, 3333]);
  x = D.travar(x, {nivel:'equipes', grupo:0}, true).alocacao;
  const r = D.editar(x, {nivel:'equipes', grupo:1}, 5000);
  assert.deepEqual(r.alocacao.grupos.map(g => g.cota), [3334, 5000, 1666]);
  assert.equal(soma(final(r.alocacao)), 10000);
  // Uma equipe só: a cota dela não tem com quem trocar.
  const um = D.montar([grupo(ids(2))]);
  assert.match(D.editar(um, {nivel:'equipes', grupo:0}, 5000).erro, /cadeado|redistribuir/);
  assert.equal(D.editar(um, {nivel:'equipes', grupo:0}, 10000).erro, '', 'mesmo valor não é erro');
});

test('editar recusa valor fora de 0 a 10000, fração e alvo inexistente', () => {
  const x = D.montar([grupo(ids(2))]);
  for (const v of [-1, 10001, 33.33, NaN, '5000', null]) assert.match(D.editar(x, {nivel:'membros', grupo:0, pessoaId:'100001'}, v).erro, /Percentual inválido/, String(v));
  assert.match(D.editar(x, {nivel:'membros', grupo:0, pessoaId:'999999'}, 5000).erro, /não encontrada/);
  assert.match(D.editar(x, {nivel:'membros', grupo:3, pessoaId:'100001'}, 5000).erro, /não encontrada/);
  assert.match(D.editar(x, {nivel:'pessoa', grupo:0, pessoaId:'100001'}, 5000).erro, /Nível/);
});

test('restaurar padrão desfaz a edição e os cadeados; trocar líder refaz só aquela equipe', () => {
  const p = ids(5);
  let x = D.montar([grupo(p.slice(0, 2)), grupo(p.slice(2))]);
  x = D.travar(x, {nivel:'membros', grupo:1, pessoaId:p[3]}, true).alocacao;
  x = D.editar(x, {nivel:'membros', grupo:1, pessoaId:p[2]}, 7000).alocacao;
  x = D.editar(x, {nivel:'equipes', grupo:0}, 5000).alocacao;
  assert.equal(x.manual, true);
  const r = D.restaurarPadrao(x);
  assert.equal(r.manual, false);
  assert.deepEqual(r.grupos.map(g => g.cota), [4000, 6000]);
  assert.deepEqual(cotas(r.grupos[1]), [4000, 3000, 3000]);
  assert.ok(r.grupos[1].membros.every(m => !m.fixo), 'cadeados soltos');
  const t = D.trocarLider(x, 1, p[4]);
  assert.equal(t.erro, '');
  assert.deepEqual(t.alocacao.grupos[1].membros.map(m => [m.papel, m.cota]), [['ajudante', 3000], ['ajudante', 3000], ['lider', 4000]]);
  assert.equal(t.alocacao.grupos[0].cota, 5000, 'a cota entre equipes não mexe');
  assert.equal(t.alocacao.grupos[1].liderId, p[4]);
  assert.match(D.trocarLider(x, 1, p[0]).erro, /não está nesta equipe/);
});

/* O SELO "EDITADO À MÃO" é conta, não carimbo (revisão da F04): divisão que
   voltou a ser a da regra não sai marcada como editada, senão a edição manual
   entra no registro sem ter havido. */
test('manual: trocar o líder ou editar de volta ao padrão desliga o selo', () => {
  const [a, b, c] = ids(3);
  let x = D.montar([{membros:[a, b, c]}]);
  assert.equal(x.manual, false);
  x = D.editar(x, {nivel:'membros', grupo:0, pessoaId:b}, 2000).alocacao;
  assert.equal(x.manual, true);
  const t = D.trocarLider(x, 0, a).alocacao;
  assert.deepEqual(cotas(t.grupos[0]), [4000, 3000, 3000]);
  assert.equal(t.manual, false, 'é exatamente a regra do dono com esse líder');
  assert.equal(D.validar(t), '');
  // Editar e voltar ao valor da regra também desliga.
  let y = D.montar([grupo([a, b])]);
  y = D.editar(y, {nivel:'membros', grupo:0, pessoaId:a}, 5000).alocacao;
  assert.equal(y.manual, true);
  y = D.editar(y, {nivel:'membros', grupo:0, pessoaId:a}, 6000).alocacao;
  assert.equal(y.manual, false);
  // Trocar o líder numa O.S. com cota entre equipes editada continua manual.
  let z = D.montar([grupo([a, b]), grupo(ids(5).slice(2))]);
  z = D.editar(z, {nivel:'equipes', grupo:0}, 5000).alocacao;
  z = D.trocarLider(z, 1, '100005').alocacao;
  assert.equal(z.manual, true, 'a cota entre equipes segue editada à mão');
  // Com regra própria, o padrão é o dela.
  const regra = {tabela:{1:[10000], 2:[5000, 5000], 3:[3400, 3300, 3300]}, maisLider:3000};
  let w = D.montar([grupo([a, b])], regra);
  w = D.editar(w, {nivel:'membros', grupo:0, pessoaId:a}, 6000, regra).alocacao;
  assert.equal(w.manual, true, '60/40 é editado quando a regra é 50/50');
  w = D.trocarLider(w, 0, b, regra).alocacao;
  assert.equal(w.manual, false);
});

test('validar: inteiros, 10000 por nível, um líder por grupo, pessoa em um grupo só, ID de 6 dígitos', () => {
  const [a, b, c, d] = ids(4);
  const ok = D.montar([grupo([a, b], {equipeId:'eq-aguia'}), grupo([c, d], {equipeId:'eq-leao'})]);
  assert.equal(D.validar(ok), '');
  const com = f => { const x = JSON.parse(JSON.stringify(ok)); f(x); return D.validar(x); };
  assert.match(com(x => { x.grupos[1].membros[0].pessoaId = a; x.grupos[1].liderId = a; }), /mesma pessoa/, 'pessoa em dois grupos');
  assert.match(com(x => { x.grupos[0].membros[1].pessoaId = a; }), /mesma pessoa/, 'pessoa repetida no grupo');
  assert.match(com(x => { x.grupos[0].cota = 4000.5; x.grupos[1].cota = 5999.5; }), /inteiros/);
  assert.match(com(x => { x.grupos[0].cota = 6000; }), /cotas das equipes/);
  assert.match(com(x => { x.grupos[0].membros[0].cota = 5000; }), /dentro de cada equipe/);
  assert.match(com(x => { x.grupos[0].membros[1].papel = 'lider'; }), /um líder/);
  assert.match(com(x => { x.grupos[0].membros[0].papel = 'ajudante'; }), /líder/);
  assert.match(com(x => { x.grupos[0].liderId = b; }), /líder/);
  assert.match(com(x => { x.grupos[0].membros[0].pessoaId = 'Pantera'; x.grupos[0].liderId = 'Pantera'; }), /6 dígitos/, 'nome não é ID');
  assert.match(com(x => { x.grupos[0].membros[0].pessoaId = '12345'; }), /6 dígitos/);
  assert.match(com(x => { x.grupos[1].equipeId = 'eq-aguia'; }), /mesma equipe/);
  assert.match(com(x => { x.grupos[1].membros = []; }), /pelo menos uma pessoa/);
  assert.match(com(x => { x.grupos = []; }), /pelo menos uma equipe/);
  assert.match(D.validar(null), /inválida/);
  // A mesma pessoa em dois grupos também é recusada quando a divisão nasce pelo montar.
  assert.match(D.validar(D.montar([grupo([a, b]), grupo([b, c])])), /mesma pessoa/);
});

test('derivarEquipe: a lista plana de IDs que o celular, a volta e o RH continuam lendo', () => {
  const [a, b, c] = ids(3);
  const x = D.montar([grupo([a, b]), {liderId:c, membros:[{pessoaId:c}]}]);
  assert.deepEqual(D.derivarEquipe(x), [a, b, c]);
  assert.deepEqual(D.derivarEquipe(null), []);
});

test('centavos: R$ 0,01 e R$ 1.000,01 com a sobra no líder; soma sempre o total', () => {
  const [a, b, c, d, e] = ids(5);
  const dupla = D.montar([grupo([a, b])]);
  assert.deepEqual(D.ratearCentavosLider(1, dupla).map(x => x.centavos), [1, 0]);
  assert.deepEqual(D.ratearCentavosLider(100001, dupla).map(x => x.centavos), [60001, 40000]);
  // Líder no fim da lista: a sobra vai para ele, não para o primeiro.
  const tres = D.montar([{liderId:c, membros:[{pessoaId:a}, {pessoaId:b}, {pessoaId:c}]}]);
  assert.deepEqual(D.ratearCentavosLider(100001, tres).map(x => x.centavos), [30000, 30000, 40001]);
  assert.deepEqual(D.ratearCentavosLider(1, tres).map(x => x.centavos), [0, 0, 1]);
  // Duas equipes: sobra entre equipes na maior, dentro dela no líder.
  const duas = D.montar([grupo([a, b]), grupo([c, d, e])]);
  const r = D.ratearCentavosLider(100001, duas);
  assert.deepEqual(r.map(x => [x.pessoaId, x.centavos]), [[a, 24000], [b, 16000], [c, 24001], [d, 18000], [e, 18000]]);
  assert.equal(soma(r.map(x => x.centavos)), 100001);
  assert.deepEqual(D.ratearCentavosLider(1, duas).map(x => x.centavos), [0, 0, 1, 0, 0]);
  assert.deepEqual(D.ratearCentavosLider(-100001, dupla).map(x => x.centavos), [-60001, -40000], 'estorno com o mesmo sinal');
  assert.deepEqual(D.ratearCentavosLider(null, dupla).map(x => x.centavos), [null, null]);
});

/* LEGADO. A O.S. antiga guarda nomes ("Bruno", "Diegão", "Pantera"). A
   sugestão resolve pela régua de pessoas do OPERACAO e nunca inventa gente:
   nome ambíguo fica pendente e, sem a composição inteira, não sai divisão. A
   EQUIPE Pantera e a PESSOA Pantera (freelancer) são coisas diferentes: o nome
   da pessoa nunca casa com o nome da equipe, só a composição por ID. */
const FICHAS = [
  {chave:'bruno-alves', id:'100001', nome:'Bruno Alves Costa', apelido:'bruno', ativo:true},
  {chave:'carla-lima', id:'100003', nome:'Carla Souza Lima', apelido:'', ativo:true},
  {chave:'carla-neves', id:'100004', nome:'Carla Souza Neves', apelido:'', ativo:true},
  {chave:'diego-ramos', id:'100005', nome:'Diego Ramos', apelido:'diego', ativo:true},
  {chave:'paulo-teixeira', id:'200009', nome:'Paulo Teixeira', apelido:'', ativo:true, freelancer:true},
];
const DADOS = {pessoas:FICHAS, vinculos:[{apelido:'Diegão', id:'100005'}, {apelido:'Pantera', id:'200009'}], lista:['Bruno', 'Diegão', 'Pantera']};
const EQUIPES = [
  {id:'eq-pantera', nome:'Pantera', ativo:true, liderPadraoId:'100005', membros:[{chave:'100001', nome:'Bruno'}, {chave:'100005', nome:'Diegão'}]},
  {id:'eq-velha', nome:'Antiga', ativo:false, membros:[{chave:'100001'}, {chave:'200009'}]},
  {id:'eq-slug', nome:'Carcará', ativo:true, liderPadraoId:'100003', membros:[{chave:'carla-lima'}, {chave:'200009'}]},
];

test('alocacaoSugerida: composição igual a uma equipe ativa vira a equipe com o líder padrão', () => {
  const pessoas = O.resolverPessoas(DADOS);
  const s = D.alocacaoSugerida({equipe:['Diegão', 'Bruno']}, {pessoas, equipes:EQUIPES});
  assert.equal(s.origem, 'equipe');
  assert.equal(s.equipeId, 'eq-pantera');
  assert.equal(s.completa, true);
  assert.deepEqual(s.alocacao.grupos[0].membros.map(m => [m.pessoaId, m.papel, m.cota]), [['100005', 'lider', 6000], ['100001', 'ajudante', 4000]]);
  assert.equal(D.validar(s.alocacao), '');
  // O membro gravado pela chave antiga do RH (slug) também casa.
  const t = D.alocacaoSugerida(['Carla Souza Lima', 'Pantera'], {pessoas, equipes:EQUIPES});
  assert.equal(t.equipeId, 'eq-slug');
  assert.deepEqual(t.alocacao.grupos[0].membros.map(m => [m.pessoaId, m.papel, !!m.freelancer]), [['100003', 'lider', false], ['200009', 'ajudante', true]]);
});

test('alocacaoSugerida: a pessoa Pantera não é a equipe Pantera; equipe inativa não sugere', () => {
  const pessoas = O.resolverPessoas(DADOS);
  const s = D.alocacaoSugerida({equipe:['Pantera']}, {pessoas, equipes:EQUIPES});
  assert.equal(s.equipeId, null, 'nome de pessoa não casa com nome de equipe');
  assert.deepEqual(D.derivarEquipe(s.alocacao), ['200009']);
  assert.equal(s.alocacao.grupos[0].membros[0].cota, 10000);
  const v = D.alocacaoSugerida(['Bruno', 'Pantera'], {pessoas, equipes:EQUIPES});
  assert.equal(v.equipeId, null, 'a equipe com essa composição está inativa');
  assert.equal(v.semLider, true);
  assert.deepEqual(v.alocacao.grupos[0].membros.map(m => [m.papel, m.cota]), [['', 5000], ['', 5000]]);
  assert.match(D.validar(v.alocacao), /líder/);
});

test('alocacaoSugerida: nome ambíguo fica pendente e não inventa pessoa nem divisão', () => {
  const pessoas = O.resolverPessoas(DADOS);
  const s = D.alocacaoSugerida({equipe:['Carla', 'Bruno', 'Fulano Desconhecido', 'bruno']}, {pessoas, equipes:EQUIPES});
  assert.deepEqual(s.pendentes, ['Carla', 'Fulano Desconhecido']);
  assert.deepEqual(s.pessoas, ['100001'], '"Bruno" e "bruno" são uma pessoa só; nenhuma Carla foi escolhida');
  assert.equal(s.completa, false);
  assert.equal(s.alocacao, null, 'sem a composição inteira, dividir daria 100% ao Bruno');
  assert.equal(D.alocacaoSugerida({equipe:[]}, {pessoas}).alocacao, null);
  // Sem régua, só ID vale.
  const semRegua = D.alocacaoSugerida(['100001', 'Bruno']);
  assert.deepEqual(semRegua.pessoas, ['100001']);
  assert.deepEqual(semRegua.pendentes, ['Bruno']);
});

test('alocacaoSugerida: a O.S. que já tem divisão válida, com a mesma gente de os.equipe, devolve a gravada', () => {
  const gravada = D.montar([grupo(['100001', '100005'])]);
  // os.equipe com nome antigo e ID, em outra ordem: é a mesma gente.
  const s = D.alocacaoSugerida({equipe:['Diegão', '100001'], alocacao:gravada}, {pessoas:O.resolverPessoas(DADOS)});
  assert.equal(s.origem, 'gravada');
  assert.equal(s.completa, true);
  assert.deepEqual(D.derivarEquipe(s.alocacao), ['100001', '100005']);
  assert.equal(s.anterior, null);
});

/* ABA PRESA NA v133 (revisão da F04). Ela troca os.equipe sem mandar a
   divisão; o servidor fica com a lista NOVA e marca a divisão velha como
   desatualizada. A sugestão não pode afirmar a gente velha como confirmada:
   quem saiu ficaria com a parte e quem entrou ficaria sem nada. */
test('alocacaoSugerida: divisão marcada desatualizada não volta como gravada', () => {
  const pessoas = O.resolverPessoas(DADOS);
  const gravada = {...D.montar([grupo(['100001', '100005'])]), desatualizada:true};
  const s = D.alocacaoSugerida({equipe:['100001', '200009'], alocacao:gravada}, {pessoas, equipes:EQUIPES});
  assert.equal(s.origem, 'desatualizada');
  assert.deepEqual(s.pessoas, ['100001', '200009'], 'vale a lista que o servidor manteve');
  assert.deepEqual(D.derivarEquipe(s.alocacao), ['100001', '200009']);
  assert.deepEqual(D.derivarEquipe(s.anterior), ['100001', '100005'], 'a divisão velha fica à parte para a tela mostrar');
  // Mesma gente, mas com a marca: também não é confirmada.
  const t = D.alocacaoSugerida({equipe:['100001', '100005'], alocacao:gravada}, {pessoas});
  assert.equal(t.origem, 'desatualizada');
});

test('alocacaoSugerida: divisão gravada com gente diferente de os.equipe é divergente, não gravada', () => {
  const pessoas = O.resolverPessoas(DADOS);
  const gravada = D.montar([grupo(['100001', '100005'])]);
  // Entrou a 200009 e saiu a 100005.
  const s = D.alocacaoSugerida({equipe:['100001', '200009'], alocacao:gravada}, {pessoas});
  assert.equal(s.origem, 'divergente');
  assert.equal(s.completa, true);
  assert.deepEqual(D.derivarEquipe(s.alocacao), ['100001', '200009']);
  assert.ok(!D.finais(s.alocacao).some(f => f.pessoaId === '100005'), 'quem saiu não leva parte');
  assert.deepEqual(D.derivarEquipe(s.anterior), ['100001', '100005']);
  // Nome sem ficha em os.equipe: pendente, sem divisão, e a gravada não o engole.
  const u = D.alocacaoSugerida({equipe:['Bruno', 'Diegão', 'Fulano Desconhecido'], alocacao:gravada}, {pessoas});
  assert.equal(u.origem, 'divergente');
  assert.equal(u.completa, false);
  assert.deepEqual(u.pendentes, ['Fulano Desconhecido']);
  assert.equal(u.alocacao, null);
  assert.ok(u.anterior);
});

test('alocacaoSugerida: grafias do mesmo nome ambíguo viram um pendente só (régua do OPERACAO)', () => {
  const pessoas = O.resolverPessoas(DADOS);
  const s = D.alocacaoSugerida({equipe:['Carla', 'carla ', 'CARLA', 'Cárla', 'Bruno']}, {pessoas});
  assert.deepEqual(s.pendentes, ['Carla']);
  O.usarPessoas(() => DADOS);
  try {
    assert.equal(s.pendentes.length + s.pessoas.length, O.equipe({equipe:['Carla', 'carla ', 'CARLA', 'Cárla', 'Bruno']}).length, 'a contagem de gente bate com a do resto do app');
  } finally { O.usarPessoas(null); }
});

test('alocacaoSugerida: duas equipes ativas com a mesma composição avisam em vez de sumir caladas', () => {
  const pessoas = O.resolverPessoas(DADOS);
  // Uma gravada pelo slug antigo do RH, a outra pelo ID: é a mesma gente.
  const equipes = [...EQUIPES, {id:'eq-id', nome:'Onça', ativo:true, liderPadraoId:'100003', membros:[{chave:'100003'}, {chave:'200009'}]}];
  const s = D.alocacaoSugerida(['Carla Souza Lima', 'Pantera'], {pessoas, equipes});
  assert.equal(s.origem, 'legado');
  assert.equal(s.equipeId, null);
  assert.deepEqual(s.equipesIguais, ['eq-slug', 'eq-id']);
  assert.match(s.aviso, /mesma composição/);
  const t = D.alocacaoSugerida(['Carla Souza Lima', 'Pantera'], {pessoas, equipes:EQUIPES});
  assert.deepEqual(t.equipesIguais, []);
  assert.equal(t.aviso, '');
});

test('divisao.js entra no index.html e no SHELL do sw.js, e não no celular do instalador', () => {
  const fs = require('node:fs'), path = require('node:path');
  const ler = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.match(ler('index.html'), /<script src="divisao\.js\?v=v\d+"><\/script>/);
  assert.match(/const SHELL = \[([\s\S]*?)\];/.exec(ler('sw.js'))[1], /'divisao\.js\?v=v\d+'/);
  // operacao.js roda no equipe.html, que não carrega o motor: nada ali pode chamar DIVISAO.
  assert.doesNotMatch(ler('operacao.js'), /DIVISAO/);
});
