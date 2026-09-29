// Regras puras usadas pelas portas de dados e pelos testes de regressão.
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const objeto = v => v && typeof v === 'object' && !Array.isArray(v);
const proprio = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
export const CAMPOS_ERP = ['cliente','servico','vendedor','dataEntrada','cnpjCpf','valorTotal'];
/* SITUAÇÃO DO ERP (statusERP). A carteira é buscada por situação (PRODUCAO,
   PENDENTE, PAUSADO, CONCLUIDO) e a situação era jogada fora -- justamente o
   dado que diz se a produção terminou (auditoria de 23/09/2026). Grava a
   situação e DESDE QUANDO ela vale; não acende o selo "conferir" (a situação
   anda toda semana e, sozinha, não pede ação). */
export const SITUACOES_ERP = ['PRODUCAO', 'PENDENTE', 'PAUSADO', 'CONCLUIDO'];
export function atualizarSituacaoERP(atual, situacao, em) {
  const s = String(situacao || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  if (!atual || atual.finalizadaEm || !SITUACOES_ERP.includes(s) || atual.statusERP === s) return null;
  return { ...atual, statusERP: s, statusERPDesde: em };
}
/* TRABALHO DE GENTE NA O.S. A conciliação horária arquivava toda O.S. que
   saiu da carteira aberta do ERP -- inclusive liberada, com equipe, agenda e
   confirmação (54 em 3 dias, 12 liberadas; a 23364 sumiu no dia da
   instalação). Só marcas que uma PESSOA põe contam: a importação preenche
   data e período com a previsão do ERP, então data não prova programação. */
export function temTrabalhoHumano(o) {
  if (!o) return false;
  return !!(o.liberadoPCP || o.aptoEm || (o.equipe || []).some(n => String(n || '').trim())
    || o.confirmacao === 'Confirmado' || o.paradoClienteEm
    || ((o.horaSaida || o.saidaEm) && !(o.horaRetorno || o.retornoEm))
    || (o.reabertaEm && String(o.reabertaEm) > String(o.baixaAutoERP?.em || '')));
}
export const pedeConferencia = a => a && a.campo !== 'valorTotal' && a.antes != null && String(a.antes).trim() !== '';
export function atualizarOrigemERP(atual, remoto, em) {
  if (!atual?.origemMubisys || atual.finalizadaEm) return {registro: atual, alteracoes: []};
  const registro = {...atual}, alteracoes = [];
  for (const campo of CAMPOS_ERP) {
    if (!proprio(remoto, campo) || remoto[campo] == null) continue;
    const valor = remoto[campo];
    if (campo === 'valorTotal' && (!Number.isFinite(Number(valor)) || Number(valor) < 0)) continue;
    // Resposta incompleta não apaga a identificação; valor zero é válido.
    if (campo !== 'valorTotal' && String(valor).trim() === '') continue;
    if (igual(atual[campo], valor)) continue;
    alteracoes.push({campo, antes: atual[campo] ?? null, depois: valor});
    registro[campo] = valor;
  }
  if (alteracoes.length) {
    registro.erpAlteracoes = [...(atual.erpAlteracoes || []), {em, campos: alteracoes}].slice(-20);
    /* O SELO "conferir" só acende quando o ERP MUDOU um dado que já existia.
       Valor que chega pela primeira vez (antes vazio) e o valor em R$ (o card do
       PCP nem mostra) ficam registrados em erpAlteracoes, sem pedir conferência:
       depois da carga de 14/09 o selo estava aceso em metade dos cards e, selo
       em todo card, ninguém lê (auditoria de 23/09/2026). */
    if (alteracoes.some(pedeConferencia)) registro.erpConferirEm = em;
    registro.atualizadoEm = em;
    registro.atualizadoPor = 'Mubisys · atualização de origem';
    registro.rev = (Number(atual.rev) || 0) + 1;
  }
  return {registro, alteracoes};
}
// Mescla de três vias. Coleções com id são comparadas item a item; excluir ou
// alterar o mesmo item simultaneamente gera conflito, nunca vence por relógio.
export function mesclarConfiguracao(base, local, remoto) {
  const conflitos = [];
  function merge(b, l, r, caminho) {
    if (igual(l, b)) return r;
    if (igual(r, b) || igual(l, r)) return l;
    if (objeto(l) && objeto(r) && (objeto(b) || b === undefined)) {
      const result = {};
      for (const k of new Set([...Object.keys(b || {}), ...Object.keys(l), ...Object.keys(r)])) {
        const v = merge(b?.[k], l[k], r[k], caminho ? caminho + '.' + k : k);
        if (v !== undefined) result[k] = v;
      }
      return result;
    }
    const porId = a => Array.isArray(a) && a.every(x => objeto(x) && typeof x.id === 'string' && x.id) && new Set(a.map(x => x.id)).size === a.length;
    if (porId(l) && porId(r) && (porId(b) || b === undefined)) {
      const bm = new Map((b || []).map(x => [x.id,x])), lm = new Map(l.map(x => [x.id,x])), rm = new Map(r.map(x => [x.id,x]));
      return [...new Set([...rm.keys(), ...lm.keys(), ...bm.keys()])].map(id => merge(bm.get(id), lm.get(id), rm.get(id), caminho + '[' + id + ']')).filter(x => x !== undefined);
    }
    conflitos.push(caminho); return r;
  }
  const cfg = merge(base, local, remoto, '');
  return {cfg, conflitos};
}
export function validarMomentos(os) {
  for (const k of ['saidaEm','retornoEm']) if (os[k] && (!/^\d{4}-\d{2}-\d{2}T/.test(os[k]) || !Number.isFinite(Date.parse(os[k])))) return 'Data de saída ou retorno inválida.';
  if (os.saidaEm && os.retornoEm && Date.parse(os.retornoEm) < Date.parse(os.saidaEm)) return 'O retorno não pode ser anterior à saída.';
  return '';
}
export function carimbarExecucao(os, anterior, autor, em) {
  const r = {...os, atualizadoPor: autor};
  for (const tipo of ['saida','retorno']) {
    const campo = tipo + 'Em';
    if (os[campo] && os[campo] !== anterior?.[campo]) { r[tipo + 'Por'] = autor; r[tipo + 'RecebidoEm'] = em; }
    else { r[tipo + 'Por'] = anterior?.[tipo + 'Por'] || ''; r[tipo + 'RecebidoEm'] = anterior?.[tipo + 'RecebidoEm'] || ''; }
  }
  return r;
}
/* PESSOA = FICHA DO RH; O ID MANDA, O NOME SÓ SE EXIBE (ordem do dono,
   29/09/2026). CÓPIA da régua de operacao.js (resolverPessoas): o aparelho e
   esta porta precisam chegar à MESMA pessoa a partir do mesmo nome antigo, e
   tests/pessoas-id.test.cjs roda as duas sobre os mesmos casos. Mudou lá,
   muda aqui. */
export const normPessoa = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
export const ehIdPessoa = v => /^\d{6}$/.test(String(v ?? '').trim());
const id6 = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 6 ? d : d.length === 11 ? d.slice(0, 6) : ''; };
export function resolverPessoas(dados = {}) {
  const fichas = (Array.isArray(dados.pessoas) ? dados.pessoas : []).filter(p => p && ehIdPessoa(p.id));
  const porId = new Map();
  for (const p of fichas) if (!porId.has(p.id)) porId.set(p.id, p);
  const porChaveRH = new Map(fichas.filter(p => p.chave).map(p => [String(p.chave), p]));
  // Casamento automático com a régua de sempre do PCP -- apelido do RH, nome
  // completo, ou começo de nome que só uma ficha tem --, contado entre TODAS
  // as fichas, inclusive quem já saiu. Quem saiu nunca é o resultado: "Elias"
  // com um Elias desligado e outro na casa é ambíguo, e não do que ficou --
  // senão o crachá antigo do que saiu passava a abrir as O.S. do xará
  // (revisão de 29/09/2026). "Adriano" sozinho, com dois Adrianos, fica sem
  // ficha de propósito.
  const auto = texto => {
    const ap = normPessoa(texto), tokens = ap.split(' ');
    const um = achadas => achadas.length === 1 && !achadas[0].desligado ? achadas[0] : null;
    const porApelido = fichas.filter(p => normPessoa(p.apelido) === ap);
    if (porApelido.length) return um(porApelido);
    const porNome = fichas.filter(p => normPessoa(p.nome) === ap);
    if (porNome.length) return um(porNome);
    return um(fichas.filter(p => { const n = normPessoa(p.nome).split(' '); return tokens.every((t, i) => n[i] === t); }));
  };
  // Vínculo salvo (Performance → "Conferir nomes do PCP × fichas do RH"):
  // decisão de gente, vale mais que o casamento. `semFicha` é a decisão de que
  // o nome NÃO é ninguém do RH (terceiro): ele nunca casa sozinho com um xará.
  // Dois vínculos diferentes para o mesmo nome = ambíguo, e ambíguo não escolhe.
  const vinculos = (Array.isArray(dados.vinculos) ? dados.vinculos : []).filter(v => v && typeof v === 'object');
  const salvos = new Map();
  for (const v of vinculos) {
    const ap = normPessoa(v.apelido || v.nomePCP);
    const p = porId.get(id6(v.id || v.idPessoa)) || porChaveRH.get(String(v.chave || '').trim());
    const id = v.semFicha === true ? '' : (p ? p.id : id6(v.id || v.idPessoa));
    if (!ap || (!id && v.semFicha !== true)) continue;
    salvos.set(ap, salvos.has(ap) && salvos.get(ap) !== id ? '' : id);
  }
  // Nome com decisão salva (vínculo ou "sem ficha") não muda quando o RH muda.
  const fixado = entrada => salvos.has(normPessoa(entrada));
  const memo = new Map();
  const idDe = entrada => {
    const s = String(entrada ?? '').trim();
    if (!s) return '';
    if (ehIdPessoa(s)) return s;
    const ap = normPessoa(s);
    if (!memo.has(ap)) memo.set(ap, salvos.has(ap) ? salvos.get(ap) : (auto(s)?.id || ''));
    return memo.get(ap);
  };
  const chave = entrada => { const s = String(entrada ?? '').trim(); return s ? (idDe(s) || 'nome:' + normPessoa(s)) : ''; };
  // Nome de exibição: a palavra que o PCP já usa (lista de instaladores,
  // depois vínculo salvo); senão o menor começo do nome completo que só
  // aquela ficha tem ("Lucas Gabriel", "Hélio").
  const rotulos = new Map();
  for (const n of Array.isArray(dados.lista) ? dados.lista : []) { const id = idDe(n); if (id && !rotulos.has(id)) rotulos.set(id, String(n).trim()); }
  for (const v of vinculos) { const id = idDe(v.apelido || v.nomePCP); if (id && !rotulos.has(id)) rotulos.set(id, String(v.apelido || v.nomePCP).trim()); }
  const curto = p => {
    const palavras = String(p.nome || '').trim().split(/\s+/).filter(Boolean);
    const alvo = palavras.map(normPessoa);
    for (let k = 1; k <= palavras.length; k++) {
      const pre = alvo.slice(0, k).join(' ');
      if (!fichas.some(q => q.id !== p.id && normPessoa(q.nome).split(' ').slice(0, k).join(' ') === pre)) return palavras.slice(0, k).join(' ');
    }
    return palavras.join(' ') || 'ID ' + p.id;
  };
  const nome = entrada => {
    const s = String(entrada ?? '').trim();
    const id = idDe(s);
    if (!id) return s;
    if (!rotulos.has(id)) { const p = porId.get(id); rotulos.set(id, p ? curto(p) : ehIdPessoa(s) ? 'ID ' + s : s); }
    return rotulos.get(id);
  };
  const pessoa = entrada => { const id = idDe(entrada); return id ? (porId.get(id) || { id, chave: '', nome: '', semFicha: true }) : null; };
  return { idDe, chave, nome, pessoa, fixado, fichas };
}

/* A O.S. É DA EQUIPE DE QUEM? Pelo ID. O nome do crachá (o da lista de
   instaladores) passa pela régua de HOJE -- vínculo corrigido vale na hora --,
   e o `id` que o crachá novo traz só entra quando o nome deixou de levar a
   alguém (entrou um xará e o nome ficou ambíguo). Entrada da O.S. com ID
   compara ID; nome antigo compara pela pessoa a que ele leva e, sem ficha,
   pelo texto -- como sempre foi. Sem resolvedor (chamada antiga), só o texto. */
/* QUEM É O CRACHÁ DE TOQUE, em ID: a régua única da trava de equipe e do
   diário de auditoria. O nome passa pela régua de HOJE (vínculo corrigido
   vale na hora); o `id` assinado no crachá (vale 30 dias) só entra quando o
   nome não leva a ninguém e não tem decisão salva ("sem ficha" é terceiro:
   não herda o ID antigo). Duas réguas deixavam o diário dizer que alguém de
   fora da equipe mexeu na O.S. que a trava tinha aceitado como de outro
   (revisão da F03, 29/09/2026). */
export function idDoCracha(quem, pessoas) {
  const q = typeof quem === 'object' && quem ? quem : { nome: quem };
  const nome = String(q.nome || q.sub || '').trim();
  const r = pessoas && typeof pessoas.chave === 'function' ? pessoas : null;
  // Nome com decisão salva (vínculo ou "sem ficha") não cai no `id` antigo.
  const fixo = !!(r && nome && typeof r.fixado === 'function' && r.fixado(nome));
  return (r && nome ? r.idDe(nome) : '') || (!fixo && ehIdPessoa(q.id) ? String(q.id).trim() : '');
}
/* QUEM É A CONTA DA GESTÃO, em ID. O crachá da gestão não traz ID; a única
   ligação aceita é a da identidade única (apelido do RH = login): UMA ficha,
   da casa, cujo apelido é exatamente o login. Nunca o nome de exibição, nunca
   o começo do nome, nunca os vínculos da lista de instaladores: o diário é só
   de inserção, e um ID adivinhado fica gravado para sempre como se outra
   pessoa tivesse feito (revisão da F03). Sem essa ficha, ID vazio. */
export function idDaGestao(login, pessoas) {
  const ap = normPessoa(login);
  const fichas = pessoas && Array.isArray(pessoas.fichas) ? pessoas.fichas : [];
  if (!ap) return '';
  const achadas = fichas.filter(p => normPessoa(p.apelido) === ap);
  return achadas.length === 1 && !achadas[0].desligado && ehIdPessoa(achadas[0].id) ? String(achadas[0].id) : '';
}
export function pertenceEquipe(os, quem, pessoas) {
  const q = typeof quem === 'object' && quem ? quem : { nome: quem };
  const nome = String(q.nome || q.sub || '').trim();
  const r = pessoas && typeof pessoas.chave === 'function' ? pessoas : null;
  const alvo = idDoCracha(q, r);
  const texto = normPessoa(nome);
  if (!alvo && !texto) return false;
  return (Array.isArray(os?.equipe) ? os.equipe : []).some(n => {
    const s = String(n ?? '').trim();
    if (!s) return false;
    const id = ehIdPessoa(s) ? s : (r ? r.idDe(s) : '');
    if (alvo && id) return id === alvo;
    return !!texto && !ehIdPessoa(s) && normPessoa(s) === texto;
  });
}
export function validarConclusao(os, anterior, papel) {
  if (!os.finalizadaEm || anterior?.finalizadaEm || os.tipo === 'interno') return '';
  const faltas = [];
  if (!(os.fotosRetornoIds || []).length) faltas.push('foto do serviço concluído');
  if (!os.retornoEm) faltas.push('data e hora do retorno');
  if (faltas.length && !(['admin','pcp'].includes(papel) && String(os.justificativaConclusao || '').trim().length >= 15)) return 'Para concluir: ' + faltas.join(', ') + '. A gestão pode registrar uma justificativa de exceção.';
  return '';
}
/* AS DEZ EQUIPES FIXAS (F06, 29/09/2026). Pedido do dono: "10 equipes fixas
   (Águia, Leão, Pantera, Lobo, Tigre, Falcão, Carcará, Onça, Lobo-Guará,
   Touro) com cor fixa, ícone do animal, líder e integrantes fixos". CÓPIA das
   listas de performance.js (PERF.ANIMAIS e PERF.CORES): a tela oferece, esta
   porta confere. tests/equipes-listas.test.cjs cobra as duas iguais. Mudou
   lá, muda aqui.
   A cor é uma CHAVE da paleta, nunca um hex livre: a tela a transforma em
   classe (perf-cor-<chave>), e o hex mora só no styles.css. Texto livre ali
   viraria style= injetado no ranking de todo tablet.
   Águia e Falcão, Pantera e Onça dividem o ícone: quem separa é a cor e o
   rótulo. A equipe Pantera não tem relação nenhuma com a pessoa de apelido
   Pantera: equipe é pelo id da equipe, pessoa é pelo ID do RH. */
export const ANIMAIS_EQUIPE = [
  { id: 'aguia', rotulo: 'Águia', icone: '🦅' },
  { id: 'leao', rotulo: 'Leão', icone: '🦁' },
  { id: 'pantera', rotulo: 'Pantera', icone: '🐆' },
  { id: 'lobo', rotulo: 'Lobo', icone: '🐺' },
  { id: 'tigre', rotulo: 'Tigre', icone: '🐯' },
  { id: 'falcao', rotulo: 'Falcão', icone: '🦅' },
  { id: 'carcara', rotulo: 'Carcará', icone: '🐦' },
  { id: 'onca', rotulo: 'Onça', icone: '🐆' },
  { id: 'lobo-guara', rotulo: 'Lobo-Guará', icone: '🦊' },
  { id: 'touro', rotulo: 'Touro', icone: '🐂' },
];
export const CORES_EQUIPE = [
  { id: 'azul', rotulo: 'Azul' },
  { id: 'vermelho', rotulo: 'Vermelho' },
  { id: 'laranja', rotulo: 'Laranja' },
  { id: 'amarelo', rotulo: 'Amarelo' },
  { id: 'verde', rotulo: 'Verde' },
  { id: 'turquesa', rotulo: 'Turquesa' },
  { id: 'roxo', rotulo: 'Roxo' },
  { id: 'rosa', rotulo: 'Rosa' },
  { id: 'marrom', rotulo: 'Marrom' },
  { id: 'grafite', rotulo: 'Grafite' },
  { id: 'marinho', rotulo: 'Azul-marinho' },
  { id: 'ocre', rotulo: 'Ocre' },
  { id: 'terracota', rotulo: 'Terracota' },
  { id: 'vinho', rotulo: 'Vinho' },
];
// Os emblemas de antes das equipes fixas continuam aceitos (equipe antiga).
export const EMBLEMAS_EQUIPE = ['🦅', '🚀', '🎯', '🛡️', '⚡', '🦁', '🏔️', '🤝'];
const EMBLEMAS_ACEITOS = new Set([...EMBLEMAS_EQUIPE, ...ANIMAIS_EQUIPE.map(a => a.icone)]);
const animalDe = k => ANIMAIS_EQUIPE.find(a => a.id === k) || null;
const corValida = k => CORES_EQUIPE.some(c => c.id === k);
// "Lobo-Guará", "lobo guara" e " LOBO-GUARÁ " são o mesmo nome.
export const nomeEquipeNorm = s => normPessoa(String(s ?? '').replace(/[-_]+/g, ' '));
const CAMPOS_FIXOS = ['animal', 'cor', 'liderPadraoId'];

/* A CHAVE DE UM MEMBRO GRAVADO, em ID. A equipe nova grava o ID do RH; a
   gravada antes pode ter o slug da ficha ('carla-lima') ou o apelido. Slug
   passa pela ficha (é a mesma pessoa, sem adivinhar); apelido passa pela
   régua de pessoas (vínculo salvo ou casamento único). Sem régua (RH fora do
   ar) ou sem ficha, fica a chave crua. */
export function idDoMembro(m, pessoas) {
  const k = String(m && m.chave != null ? m.chave : '').trim();
  if (ehIdPessoa(k)) return k;
  const regua = pessoas && typeof pessoas.idDe === 'function' ? pessoas : null;
  if (!regua || !k) return k;
  const ficha = (Array.isArray(regua.fichas) ? regua.fichas : []).find(p => p && String(p.chave) === k && ehIdPessoa(p.id));
  return ficha ? ficha.id : (regua.idDe(k) || k);
}

/* A ABA NA VERSÃO ANTERIOR (v133) não conhece animal, cor e líder: regrava a
   equipe sem esses campos, e a mescla leria "apagou" (local sem a chave,
   remoto igual à base). A tela nova grava SEMPRE os três (vazio quando não
   há), então campo ausente aqui é versão velha, não decisão: volta o da base.
   Mesma ideia dos pesos da nota no setCfg. */
export function preservarCamposEquipe(basePerf, localPerf) {
  const bs = objeto(basePerf) && Array.isArray(basePerf.equipes) ? basePerf.equipes : [];
  if (!objeto(localPerf) || !Array.isArray(localPerf.equipes)) return localPerf;
  const porId = new Map(bs.filter(e => objeto(e) && e.id).map(e => [e.id, e]));
  localPerf.equipes = localPerf.equipes.map(e => {
    const b = objeto(e) ? porId.get(e.id) : null;
    if (!b) return e;
    const faltam = CAMPOS_FIXOS.filter(k => !(k in e) && k in b);
    return faltam.length ? { ...e, ...Object.fromEntries(faltam.map(k => [k, b[k]])) } : e;
  });
  return localPerf;
}

/* O QUE ENTRA DE CADA EQUIPE, conferido no setCfg ANTES da validação.
   Animal, cor e líder inválidos NÃO viram 422: resposta 422 tira o setCfg
   da fila e desfaz a configuração inteira no aparelho (a aba antiga perderia
   o que estava certo junto). O campo ruim é ignorado: fica o valor que a
   equipe já tinha, se ainda vale, ou nenhum; e quem salvou recebe o aviso.
   - membros: a chave fica COMO VEIO. A aba presa na v133 compara pelo slug
     ('carla-lima') o que ela mesma gravou; reescrever para o ID quebrava o
     modelo "Equipe salva" e o selo da pessoa nela (revisão F06). Quem lê
     converte na hora (idDoMembro aqui, perfIdMembro na tela, idDoMembro na
     divisão). Só slug e ID da MESMA pessoa na mesma equipe viram um membro
     (fica o primeiro, como veio).
   - animal: da lista fechada; o emblema passa a ser o ícone dele (a aba
     antiga só sabe mostrar o emblema).
   - cor: chave da paleta.
   - liderPadraoId: ID de 6 dígitos, e só se for um dos membros.
   Campo vazio ('') é a tela nova dizendo "nenhum": FICA gravado como ''.
   Apagar a chave fazia o banco guardar coisa diferente do que o aparelho
   mandou, e o setCfg seguinte da fila (base = o que foi mandado) levava 409
   de conflito sem ninguém mais ter mexido. Campo recusado também vira ''. */
export function sanearEquipes(perf, antes, pessoas) {
  const avisos = [];
  if (!objeto(perf) || !Array.isArray(perf.equipes)) return { perf, avisos };
  const velhas = new Map((objeto(antes) && Array.isArray(antes.equipes) ? antes.equipes : []).filter(e => objeto(e) && e.id).map(e => [e.id, e]));
  const equipes = perf.equipes.map(e => {
    if (!objeto(e)) return e;
    const n = { ...e }, velha = velhas.get(e.id) || {}, nome = String(e.nome || 'sem nome');
    if (Array.isArray(e.membros)) {
      const vistos = new Set();
      n.membros = e.membros.flatMap(m => {
        if (!objeto(m)) return [m];
        const id = idDoMembro(m, pessoas);
        if (vistos.has(id)) return [];
        vistos.add(id);
        return [m];
      });
    }
    const ids = new Set((n.membros || []).map(m => idDoMembro(m, pessoas)).filter(ehIdPessoa));
    /* Sem a régua (RH fora do ar) e com membro que não é ID (slug ou apelido
       de equipe antiga), não dá para saber se o líder de antes ainda é
       membro: ele fica como estava, em vez de sumir por falta de rede. */
    const semRegua = !(pessoas && typeof pessoas.idDe === 'function') && (n.membros || []).some(m => !ehIdPessoa(idDoMembro(m, pessoas)));
    if (semRegua && ehIdPessoa(velha.liderPadraoId)) ids.add(String(velha.liderPadraoId).trim());
    // rotulo e particípio andam juntos: "A cor ... não foi aceita".
    const conferir = (campo, ok, rotulo, aceito) => {
      if (!(campo in n)) return;
      const v = n[campo];
      if (v === '') return;
      if (v == null) { delete n[campo]; return; }
      if (ok(v)) return;
      const ficou = campo in velha && ok(velha[campo]);
      n[campo] = ficou ? velha[campo] : '';
      avisos.push(`${rotulo} da equipe "${nome}" não foi ${aceito} (${String(v).slice(0, 40)}): ${ficou ? 'ficou o anterior' : 'ficou sem'}.`);
    };
    conferir('animal', v => !!animalDe(v), 'O animal', 'aceito');
    conferir('cor', corValida, 'A cor', 'aceita');
    const eraLider = 'liderPadraoId' in n && ehIdPessoa(n.liderPadraoId) && !ids.has(String(n.liderPadraoId).trim()) && velha.liderPadraoId === n.liderPadraoId;
    if (eraLider) { n.liderPadraoId = ''; avisos.push(`O líder da equipe "${nome}" saiu dos integrantes: a equipe ficou sem líder. Escolha outro.`); }
    else conferir('liderPadraoId', v => ehIdPessoa(v) && ids.has(String(v).trim()), 'O líder', 'aceito');
    const animal = animalDe(n.animal);
    if (animal) n.emblema = animal.icone;
    return n;
  });
  return { perf: { ...perf, equipes }, avisos };
}

/* EQUIPES FIXAS: A REGRA ENTRE AS ATIVAS. A regra antiga era "uma equipe
   ativa por composição" (v124); com as dez fixas duas equipes PODEM ter a
   mesma gente enquanto o cadastro é arrumado, e a entrega é decidida pela
   confirmação (e a sugestão só deduz a equipe quando há EXATAMENTE uma ativa
   com aquela composição). O que não pode repetir é o NOME: duas "Águia"
   ativas no ranking seriam a mesma equipe parecendo duas. Devolve
   `nomes` (nome normalizado -> ids das ativas com ele, só os repetidos) e
   `pessoasEmDuas` (ID -> ids das equipes ativas em que é fixa, só quem está
   em duas ou mais). O setCfg recusa só o nome repetido NOVO (duplicata que já
   estava no banco não trava confirmação nenhuma) e AVISA da pessoa em duas.
   Com a régua de pessoas, slug e ID da mesma ficha são a mesma pessoa. A
   mesma conta mora em PERF.conferirEquipes, na tela. */
export function conferirEquipesAtivas(perf, pessoas) {
  const porNome = new Map(), porPessoa = new Map();
  for (const e of (objeto(perf) && Array.isArray(perf.equipes) ? perf.equipes : [])) {
    if (!objeto(e) || e.ativo === false) continue;
    const k = nomeEquipeNorm(e.nome);
    if (k) porNome.set(k, [...(porNome.get(k) || []), e.id]);
    for (const id of new Set((Array.isArray(e.membros) ? e.membros : []).map(m => idDoMembro(m, pessoas)).filter(Boolean))) {
      porPessoa.set(id, [...(porPessoa.get(id) || []), e.id]);
    }
  }
  return {
    nomes: new Map([...porNome].filter(([, ids]) => ids.length > 1)),
    pessoasEmDuas: new Map([...porPessoa].filter(([, ids]) => ids.length > 1)),
  };
}
// Validação da apuração operacional; nenhum lançamento de folha é criado.
export function validarPerformance(cfg) {
  if (cfg == null) return '';
  if (typeof cfg !== 'object' || !Array.isArray(cfg.equipes) || !Array.isArray(cfg.participacoes)) return 'Estrutura de performance inválida.';
  const texto = (s,n) => typeof s === 'string' && s.trim().length > 0 && s.length <= n;
  const distintos = xs => new Set(xs.map(x=>x?.id)).size === xs.length;
  if (cfg.equipes.length > 300 || cfg.participacoes.length > 20000 || !distintos(cfg.equipes) || !distintos(cfg.participacoes)) return 'Registros de performance repetidos ou acima do limite.';
  const membrosOK = ms => Array.isArray(ms) && ms.length > 0 && ms.length <= 50 && ms.every(p=>p && texto(p.chave,150) && texto(p.nome,150)) && new Set(ms.map(p=>p.chave)).size === ms.length;
  /* O LOGO DA EQUIPE é opcional e vem como imagem já reduzida no aparelho
     (160x160). Só PNG, JPEG ou WebP em base64 — SVG fica de fora de propósito,
     porque carrega script. Teto por logo e teto do conjunto: a configuração
     global desce para todo tablet, e vinte logos de 200 KB transformariam cada
     abertura do app num download de 4 MB. O emblema continua obrigatório: é o
     que aparece quando a imagem não existe ou não carrega. */
  const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
  const LOGO_MAX = 40000, LOGOS_MAX = 400000;
  let somaLogos = 0;
  for (const e of cfg.equipes) {
    if (!e || !texto(e.id,150) || !texto(e.nome,60) || !EMBLEMAS_ACEITOS.has(e.emblema) || !membrosOK(e.membros)) return 'Equipe inválida. Confira nome, emblema e integrantes.';
    if (e.logo != null && e.logo !== '') {
      if (typeof e.logo !== 'string' || e.logo.length > LOGO_MAX || !LOGO.test(e.logo)) return 'Logo da equipe inválido: use PNG, JPEG ou WebP de até 40 KB.';
      somaLogos += e.logo.length;
    }
    if (e.ativo != null && typeof e.ativo !== 'boolean') return 'Equipe inválida. Confira nome, emblema e integrantes.';
  }
  if (somaLogos > LOGOS_MAX) return 'Logos das equipes somam mais que o limite de 400 KB. Remova ou troque algum.';
  /* (Animal, cor e líder são conferidos antes, em sanearEquipes: inválido é
     ignorado com aviso, nunca 422. O nome repetido entre ativas mora em
     conferirEquipesAtivas: o setCfg recusa só a repetição NOVA.) */
  /* OS PESOS DA AVALIAÇÃO (produção, limpeza do carro, equipamentos): inteiros
     de 0 a 100 que somam 100. Opcional — sem eles vale o padrão da tela. */
  if (cfg.criterios != null) {
    const c = cfg.criterios, ks = ['producao','limpeza','equipamentos'];
    if (typeof c !== 'object' || ks.some(k => !Number.isInteger(c[k]) || c[k] < 0 || c[k] > 100) || ks.reduce((s,k)=>s+c[k],0) !== 100 || Object.keys(c).some(k => !ks.includes(k))) {
      return 'Pesos da avaliação inválidos: produção, limpeza e equipamentos, inteiros que somam 100.';
    }
  }
  for (const p of cfg.participacoes) {
    if (!p || !texto(p.id,150) || !membrosOK(p.membros)) return 'Participação inválida.';
    if (p.equipeId && !cfg.equipes.some(e=>e.id===p.equipeId)) return 'Equipe da participação não encontrada.';
    if (p.membros.some(m=>typeof m.percentual !== 'number' || !Number.isFinite(m.percentual) || m.percentual<=0 || m.percentual>100)) return 'Percentual inválido.';
    if (Math.abs(p.membros.reduce((s,m)=>s+m.percentual,0)-100) > 0.001) return 'As participações precisam somar 100%.';
    if (p.obs && (typeof p.obs !== 'string' || p.obs.length>300)) return 'Observação acima do limite.';
  }
  return '';
}
/* O QUE O CRACHÁ DE TOQUE ESCREVE: só a execução (ver pcp-sync). Ele nasce de
   um primeiro nome, sem senha; reescrever cliente, endereço ou vendedor não é
   trabalho dele. Campo fora da lista é descartado, não recusado: recusar tudo
   faria o aparelho na rua perder o check-in inteiro por um campo a mais.
   conferidoPor, retrabalho e causa entraram com a decisão (B) do Léo
   (23/09/2026): "O instalador finaliza, e o espelho passa a pedir a foto do
   serviço pronto". Sem eles, a finalização do espelho chegava pela metade.
   voltaEquipe (25/09/2026) é a limpeza do carro que a equipe registra no
   espelho. Sem ela aqui, o celular mostrava "registrada", recebia 200 e nada
   chegava ao banco. O que entra dela é saneado no pcp-sync (sanearVoltaEquipe). */
export const CAMPOS_MONTAGEM = new Set([
  'id', 'rev', 'atualizadoEm', 'atualizadoPor',
  'checkin', 'checkinGPS', 'checkout', 'conclusao',
  'fotosCheckinIds', 'fotosRetornoIds',
  'carroLiberado', 'carroLiberadoEm', 'carroLiberadoPor',
  'obsTecnicas', 'instalacaoOK', 'problema', 'conferidoPor', 'retrabalho', 'causa',
  'ferramentasConferidas', 'ferramentasConferidasPor',
  'kmSaida', 'kmRetorno', 'horaSaida', 'horaRetorno', 'saidaEm', 'retornoEm',
  'voltaEquipe', 'fotosTiradas',
]);
// Do item, só a marca da montagem: descrição, medida e valor são do PCP e do ERP.
const CAMPOS_ITEM_MONTAGEM = ['statusInst', 'pronto', 'motivo', 'obsProb', 'fotoProbId'];
const LISTAS_FOTO = ['fotosCheckinIds', 'fotosRetornoIds'];
// Só fileId simples (o que o STORE.pushPhoto gera); nada de caminho.
const idFoto = f => typeof f === 'string' && /^[\w.-]{1,100}$/.test(f) && !f.includes('..');
const vazio = v => v == null || v === '' || v === false || (Array.isArray(v) && !v.length) || (objeto(v) && !Object.keys(v).length);
/* Teto de texto do crachá de toque: o registro desce para todo tablet, e os 7
   sistemas dividem 5 MB de localStorage. Uma obs de 2 MB estouraria todos. */
const TEXTO_MAX = 2000;
const cortar = v => typeof v === 'string' && v.length > TEXTO_MAX ? v.slice(0, TEXTO_MAX) : v;
/* MESCLA, NÃO FILTRA. O upsert SUBSTITUI a O.S. inteira; partir do que já está
   gravado e deixar o crachá de toque mudar só os campos dele é o que protege
   o resto. Devolve { os, erro, avisos }: erro preenchido vira 422 e os vem nulo;
   aviso é o que foi deixado de fora, e o resto grava.

   SEM CONFLITO DE VERSÃO (25/09/2026). O rev gravado passa a valer sempre: a
   janela "alterada em outro aparelho" só oferecia duas perdas (Recarregar
   apagava o check-in do aparelho; Sobrescrever apagava as fotos do colega), e
   ela abria toda vez que o PCP, o ERP ou o colega da dupla gravavam antes.
   Cópia VELHA (o aparelho leu um rev anterior) é mesclada com cuidado: lista
   de foto SOMA as duas, e valor vazio não apaga o que já está gravado (a
   cópia velha só não sabia dele). Cópia em dia troca a lista, porque o × do
   espelho tira foto da lista.

   ITENS: o item não tem id. Casa pelo número e descrição em qualquer posição;
   se o PCP mudou a descrição, pelo número (quando só um tem aquele número);
   depois pela descrição. A marca nunca pula para o vizinho, e item que só o
   aparelho tem não é criado; marca que não achou item vira aviso.

   FINALIZAR: só O.S. que o PCP liberou e o cliente confirmou, as mesmas travas
   do espelho. Faltando uma, a finalização não entra e o resto do trabalho
   grava, com aviso: recusar tudo (422) prendia check-in, fotos e itens na fila
   do celular. O autor é o crachá, nunca o nome que o aparelho escreveu. A hora
   é a do aparelho (quem finalizou offline às 15h finalizou às 15h), a não ser
   que venha do futuro. Reabrir não é do instalador: finalizada segue
   finalizada, com o autor que tinha; e finalização mais velha que a reabertura
   da gestão não fecha a O.S. de novo. */
export function mesclarToqueNoNome(atual, veio, autor, agora) {
  const m = { ...atual }, avisos = [];
  const revAtual = typeof atual?.rev === 'number' ? atual.rev : 0;
  const velha = typeof veio?.rev === 'number' && veio.rev !== revAtual;
  /* FOTO TIRADA É DITA, NÃO DEDUZIDA. Na cópia velha a lista SOMA, então o ×
     não valia: a foto apagada voltava à O.S. (e o arquivo já tinha saído do
     bucket), virando miniatura quebrada e "prova" de conclusão que não existe.
     O × do espelho e o da gestão anotam o id em `fotosTiradas`; a mescla tira
     esses ids das listas mesmo em cópia velha, e a lista fica gravada para o
     próximo envio velho de outro aparelho também não trazer a foto de volta. */
  const tiradas = new Set([...(Array.isArray(atual?.fotosTiradas) ? atual.fotosTiradas : []),
    ...(Array.isArray(veio?.fotosTiradas) ? veio.fotosTiradas : [])].filter(idFoto));
  if (tiradas.size) m.fotosTiradas = [...tiradas].slice(-100);
  for (const k of Object.keys(veio || {})) {
    if (!CAMPOS_MONTAGEM.has(k) || k === 'id' || k === 'rev' || k === 'fotosTiradas') continue;
    if (LISTAS_FOTO.includes(k)) {
      if (!Array.isArray(veio[k])) continue; // tipo errado é descartado, como campo fora da lista
      // Id que já está gravado passa como está (foto antiga não some por formato).
      const gravadas = Array.isArray(atual?.[k]) ? atual[k] : [];
      const novas = veio[k].filter(f => idFoto(f) || gravadas.includes(f));
      const lista = [...new Set(velha ? [...gravadas, ...novas] : novas)].filter(f => !tiradas.has(f));
      // O teto segura o registro que desce para todo tablet; o corte é dito,
      // senão a foto subia, sumia da O.S. e ninguém sabia.
      if (lista.length > 60) avisos.push(`${lista.length - 60 === 1 ? '1 foto ficou' : lista.length - 60 + ' fotos ficaram'} de fora da O.S.: o limite é 60 ${k === 'fotosCheckinIds' ? 'de check-in' : 'do serviço pronto'}. Fale com o PCP.`);
      m[k] = lista.slice(0, 60);
      continue;
    }
    if (velha && vazio(veio[k]) && !vazio(atual?.[k])) {
      // Desmarcar numa cópia velha não vale (não dá para saber se foi o
      // toque ou se o aparelho não sabia), mas não fica calado.
      if (k === 'instalacaoOK' && veio[k] === false && atual[k] === true) avisos.push('"Instalação OK" continua marcada: o escritório gravou a O.S. antes. Se era para desmarcar, desmarque de novo.');
      continue;
    }
    // Local do check-in: só os quatro campos que o espelho grava, com número de verdade.
    if (k === 'checkinGPS' && veio[k] != null) {
      const g = veio[k];
      if (!objeto(g) || !Number.isFinite(Number(g.lat)) || !Number.isFinite(Number(g.lng))) continue;
      m[k] = { lat: Number(g.lat), lng: Number(g.lng), precisao: Number.isFinite(Number(g.precisao)) ? Number(g.precisao) : 0, ts: String(g.ts ?? '').slice(0, 40) };
      continue;
    }
    m[k] = cortar(veio[k]);
  }
  m.rev = revAtual;
  if (Array.isArray(veio?.itens) && Array.isArray(atual?.itens)) {
    const usados = new Set();
    const livres = () => veio.itens.map((v, j) => ({ v, j })).filter(x => !usados.has(x.j) && objeto(x.v));
    const txt = v => String(v ?? '');
    const unico = (xs, f) => xs.filter(f).length === 1 ? xs.find(f) : null;
    const achar = it => {
      const xs = livres();
      const a = xs.find(x => txt(x.v.item) === txt(it.item) && txt(x.v.descricao) === txt(it.descricao))
        || (txt(it.item) && atual.itens.filter(o => objeto(o) && txt(o.item) === txt(it.item)).length === 1 ? unico(xs, x => txt(x.v.item) === txt(it.item)) : null)
        || (txt(it.descricao) && atual.itens.filter(o => objeto(o) && txt(o.descricao) === txt(it.descricao)).length === 1 ? unico(xs, x => txt(x.v.descricao) === txt(it.descricao)) : null);
      if (a) usados.add(a.j);
      return a ? a.v : null;
    };
    m.itens = atual.itens.map(it => {
      if (!objeto(it)) return it;
      const v = achar(it);
      if (!v) return it;
      const r = { ...it };
      for (const c of CAMPOS_ITEM_MONTAGEM) {
        if (!proprio(v, c) || (velha && vazio(v[c]) && !vazio(it[c]))) continue;
        // O toque só LIGA o Verificado (pronto): desligar é da gestão.
        if (c === 'pronto' && v[c] !== true) continue;
        r[c] = c === 'fotoProbId' && v[c] && !idFoto(v[c]) ? it[c] : cortar(v[c]);
      }
      if (r.fotoProbId && tiradas.has(r.fotoProbId)) r.fotoProbId = '';
      return r;
    });
    const perdidas = veio.itens.filter((v, j) => !usados.has(j) && objeto(v) && CAMPOS_ITEM_MONTAGEM.some(c => !vazio(v[c])));
    if (perdidas.length) avisos.push(`${perdidas.length === 1 ? 'A marca do item ' + txt(perdidas[0].item || perdidas[0].descricao) + ' não foi gravada' : perdidas.length + ' marcas de item não foram gravadas'}: o PCP mudou a lista de itens. Confira os itens com o PCP.`);
  }
  if (!atual?.finalizadaEm && veio?.finalizadaEm) {
    const t = Date.parse(String(veio.finalizadaEm)), reaberta = Date.parse(String(atual?.reabertaEm || ''));
    if (!atual.liberadoPCP) avisos.push('A O.S. não foi finalizada: o PCP ainda não liberou. Fale com o PCP.');
    else if (atual.tipo !== 'interno' && atual.confirmacao !== 'Confirmado') avisos.push('A O.S. não foi finalizada: o cliente ainda não confirmou. Fale com o PCP.');
    else if (Number.isFinite(reaberta) && !(Number.isFinite(t) && t > reaberta)) avisos.push('A O.S. não foi finalizada: a gestão reabriu depois. Finalize de novo se o serviço terminou.');
    else {
      m.finalizadaEm = Number.isFinite(t) && t <= Date.parse(agora) + 10 * 60 * 1000 ? String(veio.finalizadaEm) : agora;
      m.finalizadoPor = autor;
    }
  }
  return { os: m, erro: '', avisos };
}
/* HORÁRIOS DO ESPELHO QUE FEREM A REGRA NÃO DERRUBAM O ENVIO (crachá de toque).
   O espelho carimba saída e retorno com o dia AGENDADO: serviço que vira a
   noite (saída 13h, retorno 9h do dia seguinte) chegava com o retorno antes da
   saída, e o 400 prendia a O.S. inteira na fila do celular. Retorno até 24 h
   "antes" da saída é o dia seguinte; o resto que não fecha fica de fora, com
   aviso, e o que já estava gravado vale. Muda `os` e devolve os avisos. */
export function acertarMomentosToque(os, anterior) {
  const avisos = [];
  const valido = v => /^\d{4}-\d{2}-\d{2}T/.test(String(v || '')) && Number.isFinite(Date.parse(String(v)));
  for (const k of ['saidaEm', 'retornoEm']) {
    if (os[k] && !valido(os[k])) {
      os[k] = valido(anterior?.[k]) ? anterior[k] : '';
      avisos.push('Data de ' + (k === 'saidaEm' ? 'saída' : 'retorno') + ' inválida: não foi gravada.');
    }
  }
  if (os.saidaEm && os.retornoEm && Date.parse(os.retornoEm) < Date.parse(os.saidaEm)) {
    const d = new Date(String(os.retornoEm).slice(0, 10) + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    const seguinte = d.toISOString().slice(0, 10) + String(os.retornoEm).slice(10);
    const dif = Date.parse(seguinte) - Date.parse(os.saidaEm);
    if (Number.isFinite(dif) && dif >= 0 && dif < 864e5) os.retornoEm = seguinte;
    else {
      const velho = anterior?.retornoEm;
      os.retornoEm = valido(velho) && Date.parse(velho) >= Date.parse(os.saidaEm) ? velho : '';
      avisos.push('O retorno ficou antes da saída e não foi gravado. Confira a hora do retorno.');
    }
  }
  return avisos;
}
/* O QUE DESCE PARA QUEM ENTROU PELO NOME. O crachá de toque sai de um primeiro
   nome, sem senha: precisa de cliente, endereço e contato, não do documento
   nem do dinheiro de ninguém. Vale para TODA saída de O.S. (lista, resposta do
   upsert, janela de conflito); a mescla parte do que está gravado, então o que
   não desce não se perde na volta. erpAlteracoes sai inteiro: guarda o antes e
   o depois do CPF/CNPJ e do valor. */
export function podarToque(r) {
  if (!objeto(r)) return r;
  const { cnpjCpf: _c, valorTotal: _v, erpAlteracoes: _h, ...resto } = r;
  if (Array.isArray(resto.itens)) resto.itens = resto.itens.map(it => {
    if (!objeto(it)) return it;
    const { valorUnit: _u, subtotal: _s, ...x } = it;
    return x;
  });
  return resto;
}
/* COMPARAR POR CONTEÚDO, NÃO POR TEXTO. O jsonb do banco reordena as chaves
   (por tamanho): {data, periodo, hora} volta como {data, hora, periodo}. A
   comparação por JSON.stringify via "remarcou" em toda gravação da O.S. criada
   à mão e apagava a confirmação do cliente e a liberação do carro. */
export const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : objeto(v) ? '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
  : JSON.stringify(v ?? null);
/* A LIMPEZA DO CARRO QUE A EQUIPE REGISTRA (voltaEquipe, 25/09/2026). As
   mesmas quatro perguntas da conferência da gestão (operacao.js), com a mesma
   polaridade: o PCP compara chave a chave, sem tradução. É uma DECLARAÇÃO: não
   conta na nota (perfFonte lê só retornoConf) e não responde pelo PCP.
   A lista é repetida aqui porque o servidor não carrega operacao.js; um teste
   confere que as duas são iguais. */
export const PERGUNTAS_VOLTA = ['carroLimpo', 'carroArrumado', 'equipamentosOk', 'semAvaria'];
const snVolta = x => x === 'sim' || x === true ? 'sim' : (x === 'nao' || x === false ? 'nao' : '');
// O PCP já conferiu esta O.S.: a partir daí a declaração da equipe não muda mais.
export const voltaConferida = rc => !!objeto(rc) && PERGUNTAS_VOLTA.some(k => snVolta(rc[k]));
/* Devolve o que gravar (ou null para não ter o campo). Ausência e envio vazio
   não apagam: aparelho com app antigo não conhece o campo, e um {} não é
   declaração. Autor e hora de chegada vêm do crachá e do servidor, nunca do
   aparelho. A hora do registro é a do aparelho (quem registrou offline às 18h
   registrou às 18h), a não ser que venha do futuro: a mesma regra do
   finalizadaEm. Resposta igual à gravada mantém o carimbo de quem registrou. */
export function sanearVoltaEquipe(veio, antes, autor, agora) {
  const velho = objeto(antes) ? antes : null;
  if (!objeto(veio)) return velho;
  const n = Object.fromEntries(PERGUNTAS_VOLTA.map(k => [k, veio[k] === 'sim' || veio[k] === 'nao' ? veio[k] : '']));
  if (!PERGUNTAS_VOLTA.some(k => n[k])) return velho;
  n.obs = String(veio.obs ?? '').slice(0, 300);
  // Só fileId simples (o que o STORE.pushPhoto gera); nada de caminho.
  n.fotos = (Array.isArray(veio.fotos) ? veio.fotos : []).filter(f => typeof f === 'string' && /^[\w.-]{1,100}$/.test(f) && !f.includes('..')).slice(0, 4);
  n.dia = /^\d{4}-\d{2}-\d{2}$/.test(String(veio.dia ?? '')) ? String(veio.dia) : '';
  n.veiculo = String(veio.veiculo ?? '').slice(0, 60);
  const igual = velho && PERGUNTAS_VOLTA.every(k => n[k] === velho[k]) && n.obs === (velho.obs || '') &&
    n.fotos.join() === (Array.isArray(velho.fotos) ? velho.fotos : []).join();
  if (igual) return { ...n, por: velho.por || '', porId: velho.porId || '', em: velho.em || '', recebidoEm: velho.recebidoEm || '' };
  const t = Date.parse(String(veio.em ?? ''));
  const em = Number.isFinite(t) && t <= Date.parse(agora) + 10 * 60 * 1000 ? new Date(t).toISOString() : agora;
  /* Declaração MAIS VELHA que a do COLEGA não passa por cima: ele corrigiu às
     18:10 e o envio das 18:00, parado sem sinal, chegava depois e desfazia a
     correção calado. A mesma pessoa corrigindo a própria declaração vale
     sempre (a fila do aparelho só guarda a última). Quem chama avisa. */
  const outro = velho && String(velho.porId || velho.por || '') !== String(autor?.sub || autor?.nome || '');
  if (outro && Date.parse(String(velho.em || '')) > Date.parse(em)) return velho;
  return { ...n, por: String(autor?.nome || ''), porId: String(autor?.sub || ''), em, recebidoEm: agora };
}
/* DIÁRIO DE AUDITORIA (F03, 29/09/2026). Pedido do dono: "log de auditoria
   completo (quem, quando, o que alterou, inclusive percentuais)". Quem escreve
   é o SERVIDOR (pcp-sync), na coleção 'auditoria' de pcp_registros, só de
   inserção. O aparelho nunca escreve nem recebe: o autor vem do crachá e o
   diário não desce (7 sistemas dividem 5 MB de localStorage).

   O QUE ENTRA: o que muda dinheiro, nota ou prova. Equipe (a divisão da
   performance sai dela), agenda campo a campo, carro, valor e itens (o
   diário só é lido por admin e pcp, então pode guardar R$), saída e retorno,
   fotos de prova, conferência da volta, exceção de encerramento, finalização
   e reabertura, entrega lançada, retrabalho e causa. CPF/CNPJ NUNCA entra: não
   está na lista, e o saneamento abaixo tira qualquer chave de documento que
   viesse dentro de um objeto.

   Exportado aqui (e não no index.ts) para o pcp-mubisys poder usar depois: a
   baixa automática e a reimportação gravam direto no banco e ainda não
   passam pelo diário. */
export const CAMPOS_AUDITADOS = [
  'equipe', 'veiculo',
  'instalacao.data', 'instalacao.periodo', 'instalacao.hora', 'instalacao.duracaoDias',
  'previsaoEntrega', 'valorTotal', 'itens',
  'liberadoPCP', 'confirmacao', 'carroLiberado',
  'horaSaida', 'horaRetorno', 'saidaEm', 'retornoEm',
  'fotosCheckinIds', 'fotosRetornoIds', 'layoutFotoId',
  'retornoConf', 'voltaEquipe', 'excecaoConclusao',
  'finalizadaEm', 'finalizadoPor', 'reabertaEm', 'reabertaPor',
  'entregaLancada', 'retrabalho', 'causa', 'causaRaiz', 'etapaOrigem',
  // O que a apuração da performance e a trava da conclusão leem (perfFonte,
  // validarConclusao): o tipo tira a O.S. da performance e dispensa a prova;
  // o número busca o valor no Painel; a baixa do ERP e a justificativa decidem
  // se a entrega conta e se a prova faltou (revisão da F03).
  'tipo', 'numero', 'baixaAutoERP', 'justificativaConclusao',
];
// Campo com ponto é caminho: 'instalacao.data' lê os.instalacao.data.
const lerCaminho = (o, caminho) => caminho.split('.').reduce((v, k) => (objeto(v) ? v[k] : undefined), o);
/* Vazio é vazio: ausente, null, '', false, [] e {} são a mesma coisa. Sem
   isso, a O.S. antiga sem `retrabalho` e a mesma O.S. regravada com
   `retrabalho:false` virariam "alteração" em toda gravação, e diário que
   registra tudo ninguém lê. */
const vazioAud = v => v == null || v === '' || v === false || (Array.isArray(v) && !v.length) || (objeto(v) && !Object.keys(v).some(k => !vazioAud(v[k])));
/* Para COMPARAR, o vazio some também por dentro: o item {pronto:false} e o
   mesmo item sem `pronto` são o mesmo item. O que se GUARDA é o valor cru. */
const semVazio = v => {
  if (vazioAud(v)) return null;
  if (Array.isArray(v)) return v.map(semVazio);
  if (!objeto(v)) return v;
  return Object.fromEntries(Object.entries(v).filter(([, x]) => !vazioAud(x)).map(([k, x]) => [k, semVazio(x)]));
};
const DOCUMENTO = /^(cpf|cnpj|cnpjcpf|cpfcnpj|documento)$/i;
function semDocumento(v) {
  if (Array.isArray(v)) return v.map(semDocumento);
  if (!objeto(v)) return v === undefined ? null : v;
  return Object.fromEntries(Object.entries(v).filter(([k, x]) => !DOCUMENTO.test(k) && x !== undefined).map(([k, x]) => [k, semDocumento(x)]));
}
/* Compara `antes` e `depois` nos campos auditados, por CONTEÚDO (canon: o
   jsonb reordena chaves). Devolve null quando nada mudou, ou
   { campos, antes, depois } com o valor cru de cada lado (null quando vazio
   do lado de lá). */
export function diffAuditavel(antes, depois, campos = CAMPOS_AUDITADOS) {
  const a = objeto(antes) ? antes : {}, d = objeto(depois) ? depois : {};
  const out = { campos: [], antes: {}, depois: {} };
  for (const c of campos) {
    const va = lerCaminho(a, c), vd = lerCaminho(d, c);
    if (canon(semVazio(va)) === canon(semVazio(vd))) continue;
    out.campos.push(c);
    out.antes[c] = semDocumento(va ?? null);
    out.depois[c] = semDocumento(vd ?? null);
  }
  return out.campos.length ? out : null;
}
/* A CONFIGURAÇÃO: quem instala (instaladores), quem é quem no RH (vinculosRH),
   as equipes e os pesos da nota, e cada participação com os percentuais.
   Participação muda uma por O.S.: entra só a que mudou, pelo id, para o
   diário não copiar a lista inteira a cada ajuste. O logo da equipe (até
   40 KB de imagem) vira uma marca: o diário diz que trocou, sem a imagem. */
const marcaLogo = l => typeof l === 'string' && l ? `imagem de ${l.length} caracteres, final ${l.slice(-12)}` : l;
const equipesAud = eqs => Array.isArray(eqs) ? eqs.map(e => objeto(e) && 'logo' in e ? { ...e, logo: marcaLogo(e.logo) } : e) : eqs;
export function diffCfgAuditavel(antes, depois) {
  const a = objeto(antes) ? antes : {}, d = objeto(depois) ? depois : {};
  const pa = objeto(a.performancePCP) ? a.performancePCP : {}, pd = objeto(d.performancePCP) ? d.performancePCP : {};
  const lado = (c, p) => ({ instaladores: c.instaladores, vinculosRH: c.vinculosRH, performancePCP: { equipes: equipesAud(p.equipes), criterios: p.criterios } });
  const out = diffAuditavel(lado(a, pa), lado(d, pd), ['instaladores', 'vinculosRH', 'performancePCP.equipes', 'performancePCP.criterios'])
    || { campos: [], antes: {}, depois: {} };
  const porId = xs => new Map((Array.isArray(xs) ? xs : []).filter(p => objeto(p) && p.id != null).map(p => [String(p.id), p]));
  const ma = porId(pa.participacoes), md = porId(pd.participacoes);
  for (const id of [...new Set([...ma.keys(), ...md.keys()])].sort()) {
    const va = ma.get(id) ?? null, vd = md.get(id) ?? null;
    if (canon(va) === canon(vd)) continue;
    const c = 'performancePCP.participacoes:' + id;
    out.campos.push(c); out.antes[c] = semDocumento(va); out.depois[c] = semDocumento(vd);
  }
  return out.campos.length ? out : null;
}
/* A ENTRADA DO DIÁRIO. O autor é montado pelo servidor a partir do crachá
   (nome, login, papel e o ID de pessoa do RH quando se sabe); nada disso vem
   do corpo do pedido. `origem` diz por onde entrou: 'tela' (gestão com
   senha), 'toque' (crachá sem senha do espelho) ou 'maquina' (integração). */
const textoAud = (v, n = 120) => String(v ?? '').slice(0, n);
export function entradaAuditoria({ id, osId, numero, acao, diff, autor, origem, em }) {
  return {
    id: textoAud(id, 80), osId: textoAud(osId, 200), ...(numero ? { numero: textoAud(numero, 40) } : {}),
    acao: textoAud(acao, 40), campos: [...diff.campos], antes: diff.antes, depois: diff.depois,
    autor: { nome: textoAud(autor?.nome), login: textoAud(autor?.login), papel: textoAud(autor?.papel, 40), porId: ehIdPessoa(autor?.porId) ? String(autor.porId).trim() : '' },
    em: textoAud(em, 40), origem: ['tela', 'toque', 'maquina'].includes(origem) ? origem : 'tela',
  };
}
