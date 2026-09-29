/* MOTOR DE DIVISÃO DA O.S. ENTRE AS PESSOAS (programa das equipes, F04):
   cópia do servidor. O aparelho mostra e edita a divisão com divisao.js; esta
   porta recalcula aqui a parte final de cada pessoa e ignora a que veio do
   aparelho. O bloco do motor abaixo é o MESMO texto de divisao.js, byte a
   byte (tests/divisao-paridade.test.cjs compara o texto e 500 casos). Mudou
   lá, muda aqui no mesmo commit, e pcp-sync e pcp-mubisys sobem juntos. */
/* ==== MOTOR DE DIVISÃO: daqui até FIM DO MOTOR, cópia byte a byte de _shared/pcp-divisao.mjs ==== */
/* UNIDADES. Percentual em inteiros de 0,01% (10000 = 100%) e dinheiro em
   centavos: com fração, 33,33% + 33,33% + 33,34% vira 99,99999% no ponto
   flutuante e a trava de 100% recusa uma divisão certa. A sobra do
   arredondamento tem destino fixo (o líder), igual no aparelho e no servidor,
   senão cada lado fecha 100% de um jeito.
   FORMATO (dentro da O.S., campo alocacao):
     {grupos:[{equipeId|null, cota, liderId, fixo?, semLider?,
               membros:[{pessoaId, papel:'lider'|'ajudante'|'', freelancer?, cota, fixo?}]}],
      final:[{pessoaId, grupo, equipeId, papel, freelancer, cota}], manual?}
   Dois níveis que a tela edita em controles separados (revisão 5.2/5.3): a
   cota de cada equipe na O.S. e a cota de cada pessoa dentro da equipe. O
   final da pessoa é só leitura, calculado daqui. `fixo` é o cadeado. */
const TOTAL = 10000;
/* A REGRA DO DONO. 1 pessoa = 100%; 2 = líder 60 e ajudante 40; 3 = 40/30/30;
   4 ou mais = líder 40 e o resto igual entre os ajudantes. Freelancer segue o
   papel (não há linha para ele). A tabela é parâmetro para virar configuração
   depois (regra versionada da F05); a posição 0 de cada linha é o líder. */
const REGRA_PADRAO = Object.freeze({tabela:Object.freeze({1:Object.freeze([10000]), 2:Object.freeze([6000, 4000]), 3:Object.freeze([4000, 3000, 3000])}), maisLider:4000});
const inteiro = v => Number.isInteger(v);
const ehPessoaId = v => typeof v === 'string' && /^\d{6}$/.test(v);
const copia = v => v == null ? v : JSON.parse(JSON.stringify(v));
const lista = v => Array.isArray(v) ? v : [];
const somar = xs => xs.reduce((s, x) => s + x, 0);
const cotaDe = x => x && inteiro(x.cota) && x.cota > 0 ? x.cota : 0;
const pct = c => String(c / 100).replace('.', ',');
function regraValida(regra) {
  if (!regra || typeof regra !== 'object' || !regra.tabela || typeof regra.tabela !== 'object' || Array.isArray(regra.tabela)) return false;
  if (!inteiro(regra.maisLider) || regra.maisLider < 0 || regra.maisLider > TOTAL) return false;
  /* As linhas 1, 2 e 3 são as da especificação: sem elas, dupla e trio caem no
     "4 ou mais" (com maisLider 4000, a dupla saía líder 40 / ajudante 60). E a
     chave só vale na forma que cotasPadrao procura ('2', nunca '02' nem
     '2.0'): senão a linha passa aqui e o motor a ignora sem aviso. */
  if (![1, 2, 3].every(n => Object.prototype.hasOwnProperty.call(regra.tabela, String(n)))) return false;
  return Object.entries(regra.tabela).every(([k, linha]) => {
    const n = Number(k);
    return String(n) === k && inteiro(n) && n >= 1 && n <= 50 && Array.isArray(linha) && linha.length === n
      && linha.every(x => inteiro(x) && x >= 0 && x <= TOTAL) && somar(linha) === TOTAL;
  });
}
// Regra quebrada nunca produz divisão quebrada: vale a do dono.
const regraDe = regra => regraValida(regra) ? regra : REGRA_PADRAO;
// Partes iguais; a sobra fica com a primeira posição (o líder, ou o primeiro da lista).
function iguais(n) {
  if (!(n >= 1)) return [];
  const base = Math.floor(TOTAL / n);
  return [TOTAL - base * (n - 1), ...Array(n - 1).fill(base)];
}
function cotasPadrao(n, regra) {
  n = Math.floor(Number(n));
  if (!(n >= 1)) return [];
  if (n === 1) return [TOTAL];
  const r = regraDe(regra);
  if (r.tabela[n]) return r.tabela[n].slice();
  const ajudante = Math.floor((TOTAL - r.maisLider) / (n - 1));
  return [TOTAL - ajudante * (n - 1), ...Array(n - 1).fill(ajudante)];
}
/* O LÍDER DO GRUPO: o liderId, se estiver entre os membros; uma pessoa sozinha
   é a líder. Mais de uma pessoa sem líder = "sem líder" (legado sem papel):
   partes iguais, e a validação pede o líder antes de gravar. */
function liderDo(g) {
  const ms = lista(g && g.membros).filter(Boolean);
  if (g && g.liderId && ms.some(m => m.pessoaId === g.liderId)) return g.liderId;
  return ms.length === 1 ? ms[0].pessoaId : null;
}
/* DESTINO DA SOBRA entre os que podem recebê-la: o preferido (o líder), se
   tiver parte; senão o primeiro com parte. Quem está em 0% não ganha 0,01%
   de arredondamento: seria parte para quem a gestão tirou da divisão. */
function destino(candidatos, preferido, peso) {
  const comParte = candidatos.filter(i => peso(i) > 0);
  const alvos = comParte.length ? comParte : candidatos;
  return alvos.includes(preferido) ? preferido : alvos[0];
}
// Entre equipes: a equipe com mais gente; no empate, a primeira da lista (decisão 15 do plano).
function maisGente(candidatos, tam, peso) {
  const comParte = candidatos.filter(i => peso(i) > 0);
  const alvos = comParte.length ? comParte : candidatos;
  return alvos.reduce((m, i) => tam(i) > tam(m) ? i : m, alvos[0]);
}
const tamanho = grupos => i => lista(grupos[i] && grupos[i].membros).length;
/* PADRÃO. padrao(n) devolve as cotas de n pessoas (posição 0 = líder).
   padrao(grupo) devolve o grupo com papel e cota de cada membro: o líder leva
   a parte de líder onde estiver na lista; os cadeados do grupo se soltam. */
function padrao(x, regra) {
  if (!x || typeof x !== 'object') return cotasPadrao(x, regra);
  const ms = lista(x.membros).map(m => ({...m}));
  const lider = liderDo({...x, membros:ms});
  const cotas = lider ? cotasPadrao(ms.length, regra) : iguais(ms.length);
  let k = 1;
  ms.forEach((m, i) => {
    delete m.fixo;
    m.papel = lider ? (m.pessoaId === lider ? 'lider' : 'ajudante') : '';
    m.cota = lider ? (m.pessoaId === lider ? cotas[0] : cotas[k++]) : cotas[i];
  });
  const g = {...x, liderId:lider, membros:ms};
  if (lider || !ms.length) delete g.semLider; else g.semLider = true;
  return g;
}
/* COTA ENTRE EQUIPES: proporcional ao número de pessoas de cada uma (2+3 =
   40/60). Aceita os tamanhos ou os grupos. A sobra vai para a equipe com mais
   gente e, no empate, para a primeira. */
function entreEquipes(grupos) {
  const xs = lista(grupos);
  const ns = xs.map(g => typeof g === 'number' ? Math.max(0, Math.floor(g) || 0) : lista(g && g.membros).length);
  if (!ns.length) return [];
  const n = somar(ns);
  if (!n) return iguais(ns.length);
  const cotas = ns.map(k => Math.floor(TOTAL * k / n));
  cotas[maisGente(ns.map((_, i) => i), i => ns[i], i => ns[i])] += TOTAL - somar(cotas);
  return cotas;
}
/* FINAL DA PESSOA = cota da equipe x cota dentro da equipe. 3333 x 4000 não
   dá inteiro: cada um leva o piso e a sobra da equipe vai para o líder dela,
   de modo que o final de cada equipe é exatamente a cota da equipe e o total
   é exatamente 10000. */
function finais(aloc) {
  const out = [];
  lista(aloc && aloc.grupos).forEach((g, gi) => {
    const ms = lista(g && g.membros).filter(Boolean);
    if (!ms.length) return;
    const cg = cotaDe(g);
    const partes = ms.map(m => Math.floor(cg * cotaDe(m) / TOTAL));
    const lider = liderDo(g);
    const idx = ms.map((_, i) => i);
    partes[destino(idx, lider ? ms.findIndex(m => m.pessoaId === lider) : 0, i => cotaDe(ms[i]))] += cg - somar(partes);
    ms.forEach((m, i) => out.push({pessoaId:m.pessoaId, grupo:gi, equipeId:g.equipeId == null ? null : g.equipeId, papel:m.papel || '', freelancer:!!m.freelancer, cota:partes[i]}));
  });
  return out;
}
const comFinal = aloc => ({...aloc, final:finais(aloc)});
function restaurarPadrao(aloc, regra) {
  const a = copia(aloc) || {};
  a.grupos = lista(a.grupos).map(g => padrao(g, regra));
  const cotas = entreEquipes(a.grupos);
  a.grupos.forEach((g, i) => { g.cota = cotas[i]; delete g.fixo; });
  a.manual = false;
  return comFinal(a);
}
/* O SELO "EDITADO À MÃO" é conta, não carimbo: a divisão difere do que
   restaurarPadrao daria com os mesmos líderes (cota de alguma equipe ou de
   alguém dentro dela). Quem editou e voltou ao valor da regra, ou trocou o
   líder de um grupo "sem líder" editado, não fica marcado como editado. O
   cadeado não conta: ele não muda percentual. */
function difereDoPadrao(a, regra) {
  const p = restaurarPadrao(a, regra);
  return lista(a.grupos).some((g, i) => {
    const pg = p.grupos[i] || {}, pm = lista(pg.membros);
    return !g || g.cota !== pg.cota || lista(g.membros).some((m, j) => !m || m.cota !== (pm[j] || {}).cota);
  });
}
/* MONTAR uma divisão nova a partir de quem está em cada equipe: membros como
   ID ou {pessoaId, freelancer}. Sai no padrão da regra. Não recusa nada: quem
   grava passa por validar (pessoa repetida, ID fora do formato). */
function montar(grupos, regra) {
  const gs = lista(grupos).map(g => ({
    equipeId:g && g.equipeId != null ? g.equipeId : null,
    liderId:g && g.liderId ? g.liderId : null,
    membros:lista(g && g.membros).map(m => typeof m === 'string' ? {pessoaId:m} : {...m}),
  }));
  return restaurarPadrao({grupos:gs}, regra);
}
// Alvo da edição: {nivel:'equipes', grupo} ou {nivel:'membros', grupo, pessoaId}.
function localizar(a, alvo) {
  const grupos = lista(a.grupos);
  const g = alvo && inteiro(alvo.grupo) ? grupos[alvo.grupo] : null;
  if (!g) return {erro:'Equipe não encontrada nesta divisão.'};
  if (alvo.nivel === 'equipes') return {itens:grupos, i:alvo.grupo, grupos};
  if (alvo.nivel !== 'membros') return {erro:'Nível de edição inválido.'};
  const itens = lista(g.membros);
  const i = itens.findIndex(m => m && m.pessoaId === alvo.pessoaId);
  if (i < 0) return {erro:'Pessoa não encontrada nesta equipe.'};
  return {itens, i, grupo:g};
}
/* EDITAR. Fixa o valor editado e reparte o resto entre os que não estão com
   cadeado, na proporção do que cada um já tinha (em partes iguais se todos
   estavam em zero). A sobra vai para o líder se ele estiver entre os que
   recebem (entre equipes: a com mais gente). Recusa, sem mudar nada, quando
   ninguém pode receber ou quando o valor passa do que sobra fora dos
   travados: a divisão nunca fica inválida, então o salvamento automático
   nunca manda soma diferente de 100%. `regra` é a mesma passada ao montar:
   com ela se sabe se a divisão ainda é a padrão. Devolve {alocacao, erro}. */
function editar(aloc, alvo, valor, regra) {
  const recusa = erro => ({alocacao:aloc, erro});
  if (!inteiro(valor) || valor < 0 || valor > TOTAL) return recusa('Percentual inválido: use de 0 a 100%, com até duas casas.');
  const a = copia(aloc) || {};
  const l = localizar(a, alvo);
  if (l.erro) return recusa(l.erro);
  const {itens, i} = l;
  if (itens[i].fixo) return recusa('Destrave o cadeado antes de editar este percentual.');
  if (cotaDe(itens[i]) === valor && inteiro(itens[i].cota)) return {alocacao:comFinal(a), erro:''};
  const outros = itens.map((_, j) => j).filter(j => j !== i);
  const livres = outros.filter(j => !itens[j].fixo);
  const travado = somar(outros.filter(j => itens[j].fixo).map(j => cotaDe(itens[j])));
  if (!livres.length) return recusa(outros.length ? 'Todos os outros percentuais estão com cadeado. Destrave um para redistribuir.' : 'Não há outro percentual para redistribuir.');
  const resto = TOTAL - valor - travado;
  if (resto < 0) return recusa(`Passa de 100%: o máximo aqui é ${pct(TOTAL - travado)}%.`);
  itens[i].cota = valor;
  const base = somar(livres.map(j => cotaDe(itens[j])));
  for (const j of livres) itens[j].cota = base > 0 ? Math.floor(resto * cotaDe(itens[j]) / base) : Math.floor(resto / livres.length);
  const sobra = resto - somar(livres.map(j => itens[j].cota));
  const peso = j => base > 0 ? cotaDe(itens[j]) : 1;
  const para = alvo.nivel === 'equipes'
    ? maisGente(livres, tamanho(l.grupos), peso)
    : destino(livres, itens.findIndex(m => m && m.pessoaId === liderDo(l.grupo)), peso);
  itens[para].cota += sobra;
  a.manual = difereDoPadrao(a, regra);
  return {alocacao:comFinal(a), erro:''};
}
// CADEADO por nível: segura a cota da equipe ou a cota da pessoa dentro dela.
function travar(aloc, alvo, fixo = true) {
  const a = copia(aloc) || {};
  const l = localizar(a, alvo);
  if (l.erro) return {alocacao:aloc, erro:l.erro};
  if (fixo) l.itens[l.i].fixo = true; else delete l.itens[l.i].fixo;
  return {alocacao:comFinal(a), erro:''};
}
/* TROCAR O LÍDER muda os papéis e devolve a divisão DENTRO daquela equipe ao
   padrão da regra (a regra é por papel: o novo líder leva a parte de líder).
   A cota da equipe na O.S. não mexe. É também como a sugestão "sem líder" do
   legado vira divisão válida. */
function trocarLider(aloc, grupo, pessoaId, regra) {
  const a = copia(aloc) || {};
  const g = inteiro(grupo) ? lista(a.grupos)[grupo] : null;
  if (!g) return {alocacao:aloc, erro:'Equipe não encontrada nesta divisão.'};
  if (!lista(g.membros).some(m => m && m.pessoaId === pessoaId)) return {alocacao:aloc, erro:'Essa pessoa não está nesta equipe.'};
  a.grupos[grupo] = padrao({...g, liderId:pessoaId}, regra);
  a.manual = difereDoPadrao(a, regra);
  return {alocacao:comFinal(a), erro:''};
}
/* VALIDAR o que vai ser gravado. Devolve '' ou o motivo, em português para a
   tela. O final não é conferido: o servidor recalcula com finais(). */
function validar(aloc) {
  if (!aloc || typeof aloc !== 'object' || Array.isArray(aloc)) return 'Divisão inválida.';
  const grupos = aloc.grupos;
  if (!Array.isArray(grupos) || !grupos.length) return 'Informe pelo menos uma equipe na divisão.';
  if (grupos.length > 10) return 'Divisão com equipes demais (até 10 por O.S.).';
  const pessoas = new Set(), equipes = new Set();
  let somaEquipes = 0;
  for (const g of grupos) {
    if (!g || typeof g !== 'object') return 'Equipe inválida na divisão.';
    if (g.equipeId != null) {
      if (typeof g.equipeId !== 'string' || !g.equipeId.trim() || g.equipeId.length > 150) return 'Equipe inválida na divisão.';
      if (equipes.has(g.equipeId)) return 'A mesma equipe aparece duas vezes na divisão.';
      equipes.add(g.equipeId);
    }
    if (!inteiro(g.cota) || g.cota < 0 || g.cota > TOTAL) return 'Cota da equipe inválida: use inteiros de 0 a 10000 (0 a 100%).';
    if (g.fixo != null && typeof g.fixo !== 'boolean') return 'Cadeado inválido na divisão.';
    somaEquipes += g.cota;
    const ms = g.membros;
    if (!Array.isArray(ms) || !ms.length) return 'Cada equipe da divisão precisa de pelo menos uma pessoa.';
    if (ms.length > 50) return 'Equipe com pessoas demais na divisão.';
    let somaPessoas = 0, lideres = 0, lider = null;
    for (const m of ms) {
      if (!m || typeof m !== 'object' || !ehPessoaId(m.pessoaId)) return 'Pessoa sem o ID do RH na divisão (o ID tem 6 dígitos).';
      if (pessoas.has(m.pessoaId)) return 'A mesma pessoa aparece duas vezes na divisão.';
      pessoas.add(m.pessoaId);
      if (!inteiro(m.cota) || m.cota < 0 || m.cota > TOTAL) return 'Percentual inválido: use inteiros de 0 a 10000 (0 a 100%).';
      if (m.freelancer != null && typeof m.freelancer !== 'boolean') return 'Marca de freelancer inválida na divisão.';
      if (m.fixo != null && typeof m.fixo !== 'boolean') return 'Cadeado inválido na divisão.';
      if (m.papel !== 'lider' && m.papel !== 'ajudante') return 'Escolha o líder de cada equipe.';
      if (m.papel === 'lider') { lideres++; lider = m.pessoaId; }
      somaPessoas += m.cota;
    }
    if (lideres !== 1) return 'Cada equipe precisa de um líder, e só um.';
    if (g.liderId !== lider) return 'O líder da equipe não confere com os papéis.';
    if (somaPessoas !== TOTAL) return 'Os percentuais dentro de cada equipe precisam somar 100%.';
  }
  if (somaEquipes !== TOTAL) return 'As cotas das equipes precisam somar 100%.';
  return '';
}
/* A LISTA PLANA os.equipe continua existindo e passa a ser derivada da
   divisão: o celular do instalador, a volta do carro, o RH e o Painel leem
   ela e não mudam. Ordem das equipes e dos membros, sem repetir. */
function derivarEquipe(aloc) {
  const out = [];
  for (const g of lista(aloc && aloc.grupos)) for (const m of lista(g && g.membros)) if (m && m.pessoaId && !out.includes(m.pessoaId)) out.push(m.pessoaId);
  return out;
}
/* DINHEIRO EM CENTAVOS pelos mesmos dois níveis: primeiro entre as equipes
   (sobra na equipe com mais gente), depois dentro de cada uma (sobra no
   líder). A soma é sempre o total. Sai na mesma ordem de finais(). */
function ratearCentavosLider(centavos, aloc) {
  const fs = finais(aloc);
  const v = centavos == null || centavos === '' ? NaN : Number(centavos);
  if (!Number.isFinite(v)) return fs.map(f => ({pessoaId:f.pessoaId, grupo:f.grupo, centavos:null}));
  const total = Math.round(Math.abs(v)), sinal = v < 0 ? -1 : 1;
  const grupos = lista(aloc && aloc.grupos).map(g => ({...g, membros:lista(g && g.membros).filter(Boolean)}));
  const porGrupo = grupos.map(g => g.membros.length ? Math.floor(total * cotaDe(g) / TOTAL) : 0);
  const comGente = grupos.map((g, i) => i).filter(i => grupos[i].membros.length);
  if (comGente.length) porGrupo[maisGente(comGente, tamanho(grupos), i => cotaDe(grupos[i]))] += total - somar(porGrupo);
  const out = [];
  grupos.forEach((g, gi) => {
    if (!g.membros.length) return;
    const partes = g.membros.map(m => Math.floor(porGrupo[gi] * cotaDe(m) / TOTAL));
    const lider = liderDo(g);
    const idx = g.membros.map((_, i) => i);
    partes[destino(idx, lider ? g.membros.findIndex(m => m.pessoaId === lider) : 0, i => cotaDe(g.membros[i]))] += porGrupo[gi] - somar(partes);
    g.membros.forEach((m, i) => out.push({pessoaId:m.pessoaId, grupo:gi, centavos:sinal * partes[i] || 0}));
  });
  return out;
}
/* SUGESTÃO A PARTIR DO LEGADO. A O.S. antiga guarda a equipe como nomes
   ("Bruno", "Diegão", "Pantera"). `pessoas` é a régua de pessoas
   (OPERACAO.resolverPessoas no aparelho, a cópia de _shared no servidor):
   nome vira ID só por vínculo salvo ou casamento único. O que não resolve fica
   em `pendentes` (um por pessoa, pela chave da mesma régua: "Carla" e "CARLA"
   são um pendente só) e NÃO vira ninguém; faltando alguém, não sai divisão
   (dividir só entre os conhecidos daria 100% a quem estava acompanhado).
   Composição igual à de UMA equipe ativa vira essa equipe com o líder padrão
   dela; igual à de duas ou mais, cai no legado COM aviso (`equipesIguais`).
   O nome da equipe nunca entra na conta: a equipe Pantera e o freelancer de
   apelido Pantera são coisas diferentes, ligadas só por ID. Sem papel
   conhecido: partes iguais e a marca "sem líder". Só leitura: nada é gravado.
   A DIVISÃO GRAVADA só volta como confirmada ('gravada') se não estiver
   marcada `desatualizada` e tiver a mesma gente de os.equipe, sem pendente:
   a aba presa na v133 troca os.equipe sem mandar a divisão, e o servidor fica
   com a lista nova. Fora disso a sugestão sai de os.equipe, com origem
   'desatualizada' ou 'divergente', e a divisão velha vai à parte em `anterior`
   para a tela mostrar as duas. */
function alocacaoSugerida(fonte, opcoes) {
  const o = opcoes || {};
  const regua = o.pessoas && typeof o.pessoas.idDe === 'function' ? o.pessoas : null;
  const idDe = x => { const s = String(x == null ? '' : x).trim(); return ehPessoaId(s) ? s : regua ? regua.idDe(s) || '' : ''; };
  const chaveDe = s => regua && typeof regua.chave === 'function' ? regua.chave(s) : s.toLowerCase();
  const fichaPorChave = new Map(lista(regua && regua.fichas).filter(p => p && p.chave).map(p => [String(p.chave), p.id]));
  const idDoMembro = m => {
    if (m && typeof m === 'object') {
      for (const v of [m.pessoaId, m.id]) if (ehPessoaId(String(v == null ? '' : v).trim())) return String(v).trim();
      return fichaPorChave.get(String(m.chave == null ? '' : m.chave)) || idDe(m.chave);
    }
    return idDe(m);
  };
  const vazio = {alocacao:null, origem:'', equipeId:null, semLider:false, completa:false, pessoas:[], pendentes:[], anterior:null, equipesIguais:[], aviso:''};
  const entradas = Array.isArray(fonte) ? fonte : lista(fonte && fonte.equipe);
  const ids = [], pendentes = [], semFicha = new Set();
  for (const x of entradas) {
    const s = String(x == null ? '' : x).trim();
    if (!s) continue;
    const id = idDe(s);
    if (id) { if (!ids.includes(id)) ids.push(id); continue; }
    const k = chaveDe(s);
    if (!semFicha.has(k)) { semFicha.add(k); pendentes.push(s); }
  }
  let anterior = null, motivo = '';
  if (fonte && !Array.isArray(fonte) && fonte.alocacao && !validar(fonte.alocacao)) {
    const a = comFinal(copia(fonte.alocacao));
    const gente = derivarEquipe(a);
    const velha = a.desatualizada === true || fonte.desatualizada === true;
    const mesma = !Array.isArray(fonte.equipe) || (!pendentes.length && ids.length === gente.length && ids.every(id => gente.includes(id)));
    if (!velha && mesma) return {...vazio, alocacao:a, origem:'gravada', equipeId:a.grupos.length === 1 ? a.grupos[0].equipeId : null, completa:true, pessoas:gente};
    anterior = a; motivo = velha ? 'desatualizada' : 'divergente';
  }
  const base = {...vazio, origem:motivo, completa:!pendentes.length && ids.length > 0, pessoas:ids, pendentes, anterior};
  if (!ids.length || pendentes.length) return base;
  const alvo = ids.slice().sort().join('|');
  const iguaisAoAlvo = lista(o.equipes).filter(e => {
    if (!e || e.ativo === false || !e.id) return false;
    const ms = lista(e.membros).map(idDoMembro);
    return ms.every(Boolean) && new Set(ms).size === ms.length && ms.slice().sort().join('|') === alvo;
  });
  const equipe = iguaisAoAlvo.length === 1 ? iguaisAoAlvo[0] : null;
  const equipesIguais = iguaisAoAlvo.length > 1 ? iguaisAoAlvo.map(e => String(e.id)) : [];
  const aviso = equipesIguais.length ? `Há ${equipesIguais.length} equipes ativas com a mesma composição (${iguaisAoAlvo.map(e => e.nome || e.id).join(', ')}). Desative as que sobram para a O.S. sair pela equipe.` : '';
  const liderEquipe = equipe ? idDe(equipe.liderPadraoId) : '';
  const lider = liderEquipe && ids.includes(liderEquipe) ? liderEquipe : ids.length === 1 ? ids[0] : null;
  const freelancer = id => { const p = regua && typeof regua.pessoa === 'function' ? regua.pessoa(id) : null; return !!(p && p.freelancer === true); };
  const a = montar([{equipeId:equipe ? String(equipe.id) : null, liderId:lider, membros:ids.map(id => ({pessoaId:id, freelancer:freelancer(id)}))}], o.regra);
  return {...base, alocacao:a, origem:motivo || (equipe ? 'equipe' : 'legado'), equipeId:equipe ? String(equipe.id) : null, semLider:!lider, equipesIguais, aviso};
}
/* ==== FIM DO MOTOR ==== */
export { TOTAL, REGRA_PADRAO, regraValida, padrao, entreEquipes, finais, montar, editar, travar, restaurarPadrao, trocarLider, validar, derivarEquipe, ratearCentavosLider, alocacaoSugerida };
export const DIVISAO = { TOTAL, REGRA_PADRAO, regraValida, padrao, entreEquipes, finais, montar, editar, travar, restaurarPadrao, trocarLider, validar, derivarEquipe, ratearCentavosLider, alocacaoSugerida };
