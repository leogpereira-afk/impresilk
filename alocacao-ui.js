'use strict';

/* COMPONENTE ÚNICO DE ALOCAÇÃO (F09 do programa das equipes, 30/09/2026).
   Monta a divisão da O.S. entre equipes e pessoas no formato do motor
   (DIVISAO, divisao.js) e grava em os.alocacao pelo caminho da F08 (upsert da
   O.S., que o servidor aceita só de admin e pcp e confere de novo com a cópia
   _shared do motor). Primeiro uso: o Conferir da Performance. A F10 leva o
   mesmo componente à ficha, à Agenda e ao Lançar entrega.

   O QUE ELE FAZ
   - chips com foto ou iniciais, cor e logo da equipe (PERF.LOGO_ANIMAL e
     PERF.COR_ANIMAL, de performance.js), selos Líder, Ajudante e Freelancer;
   - botão de equipe: traz os integrantes e o líder padrão num toque; pessoa
     avulsa entra pela lista do seletor de sempre (opcoesEquipe, app.js), com
     as travas da F07 (contrato sem CPF, ID repetido);
   - toque para trocar o líder; tirar o líder promove o próximo;
   - percentual editável com a redistribuição do motor na hora, cadeado,
     "Restaurar padrão" e o selo "editado à mão";
   - barra de 100% pintada pela cor de cada equipe;
   - prévia por pessoa (papel e %). Só admin e pcp veem R$: o valor bruto da
     O.S. e a comissão prevista pela regra vigente (regras.js). Até a apuração
     do programa (F19) o valor NÃO é "o que vai pontuar" (crítica 5.4).

   O ESTADO MORA AQUI (variável do módulo, por chave), não na tela: repintar
   o diálogo, a lista atrás dele ou o componente inteiro não perde o que a
   pessoa montou. Cada ajuste mexe só no estado; NADA vai ao servidor até a
   confirmação. Uma confirmação = um envio = uma linha no alocacaoLog (teto
   40 no servidor): trinta ajustes seguidos não gastam o histórico (crítica 3).

   A DIVISÃO NUNCA FICA INVÁLIDA NA TELA: toda mudança passa pelo motor, que
   recusa sem mexer o que deixaria a soma diferente de 100%. E a gravação
   confere de novo (DIVISAO.validar): o envio nunca sai com soma diferente de
   10000 em nenhum dos dois níveis.

   QUEM GRAVA DEVOLVE O `em` DA DIVISÃO GRAVADA. O servidor descarta a divisão
   que traz o carimbo de uma versão que não é a gravada (cópia velha de aba
   antiga). Divisão nova vai sem `em`. Se a divisão gravada mudou de conteúdo
   depois que a tela abriu (outro tablet), nada é enviado e a tela diz isso.
   O mesmo vale para a EQUIPE da O.S. (os.equipe) e a marca `desatualizada`:
   a divisão confirmada vira a equipe da O.S., e quem outro aparelho pôs na
   O.S. enquanto esta tela estava aberta sairia calado (revisão da F09).

   O JEITO ANTIGO (decisão do dono, 30/09/2026): a O.S. com alguém só pelo
   nome, sem ID no RH, não pode ter divisão (motor e servidor só aceitam ID).
   Ela mostra a divisão de quem está na O.S. (IDs e nomes) e confirma pela
   participação do blob, como a v138; quem grava é o Conferir (performance.js),
   com o que paraParticipacao entrega. Sem isso o Fechar período de julho a
   setembro trava. Nada disso vai para os.alocacao.

   Textos para quem usa: português, sem travessão. Este arquivo nunca grava em
   cfg.performancePCP.participacoes. */
const ALOCUI = (() => {
  const TOTAL = 10000;
  const estados = new Map();   // chave -> estado
  const hosts = new Map();     // chave -> {root, aoMudar, aoIr}
  const esperas = new Map();   // osId -> {nucleo, fim}
  // osId -> {nucleo, mensagem}: a última divisão que o servidor recusou (vale até uma gravação aceita).
  const recusas = new Map();
  const lojasOuvidas = new WeakSet();

  const lista = v => Array.isArray(v) ? v : [];
  const objeto = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const copia = v => v == null ? v : JSON.parse(JSON.stringify(v));
  const ehId = v => /^\d{6}$/.test(String(v == null ? '' : v).trim());
  const escA = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const pctTexto = bp => String((Number(bp) || 0) / 100).replace('.', ',');
  const emDe = a => objeto(a) && typeof a.em === 'string' ? a.em : '';
  const G = nome => { try { return typeof globalThis[nome] !== 'undefined' ? globalThis[nome] : undefined; } catch (e) { return undefined; } };
  // Os globais das outras peças, lidos na hora (a ordem dos <script> não importa).
  const motor = () => typeof DIVISAO !== 'undefined' ? DIVISAO : G('DIVISAO');
  const regras = () => typeof REGRAS !== 'undefined' ? REGRAS : G('REGRAS');
  const perf = () => typeof PERF !== 'undefined' ? PERF : G('PERF');
  const oper = () => typeof OPERACAO !== 'undefined' ? OPERACAO : G('OPERACAO');
  const loja = () => typeof STORE !== 'undefined' ? STORE : G('STORE');
  const fn = nome => { const f = G(nome); return typeof f === 'function' ? f : null; };
  const reais = centavos => { const f = fn('dinheiroCasa'); const v = (Number(centavos) || 0) / 100; return f ? f(v) : v.toLocaleString('pt-BR', {style:'currency', currency:'BRL'}); };
  /* Dia para a tela. Dia puro vai como está. Carimbo com hora vira o dia de
     São Paulo: cortar o texto dava o dia UTC (01:30 de 01/10 em UTC é 22:30
     de 30/09 aqui). A mesma conta do diaSP de entrega-item.js. */
  function dataBR(d) {
    const s = String(d || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.split('-').reverse().join('/');
    const t = /^\d{4}-\d{2}-\d{2}T/.test(s) ? Date.parse(s) : NaN;
    if (!Number.isFinite(t)) return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split('-').reverse().join('/') : '';
    try {
      const p = {};
      for (const x of new Intl.DateTimeFormat('en-US', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(t))) p[x.type] = x.value;
      return `${p.day}/${p.month}/${p.year}`;
    } catch (e) {
      // Sem a tabela de fusos: São Paulo não tem horário de verão desde 2019.
      return new Date(t - 3 * 3600000).toISOString().slice(0, 10).split('-').reverse().join('/');
    }
  }
  /* A gente da O.S. sem olhar ordem nem repetição: a base da trava da equipe.
     Pela pessoa (o ID quando o nome tem ficha), para o mesmo "Lucas" que o
     servidor devolve como ID não parecer mudança feita em outro aparelho. */
  function genteDe(eq) {
    const O = oper();
    const chave = x => { const t = String(x == null ? '' : x).trim(); if (!t) return ''; const id = ehId(t) ? t : O && typeof O.idPessoa === 'function' ? String(O.idPessoa(t) || '') : ''; return ehId(id) ? id : 'nome:' + norm(t); };
    return [...new Set(lista(eq).map(chave).filter(Boolean))].sort().join('|');
  }
  const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  /* O NÚCLEO da divisão: o que a gestão edita (os dois níveis de cotas,
     papéis, cadeados e o selo). O mesmo recorte do servidor (nucleoAlocacao,
     _shared/pcp-integridade.mjs): carimbo, final e marcas não contam. */
  const nucleo = a => !objeto(a) ? 'null' : JSON.stringify({
    grupos: lista(a.grupos).map(g => ({equipeId: g && g.equipeId != null ? g.equipeId : null, cota: g && g.cota, liderId: g && g.liderId != null ? g.liderId : null, fixo: !!(g && g.fixo === true),
      membros: lista(g && g.membros).map(m => ({pessoaId: m && m.pessoaId, papel: (m && m.papel) || '', cota: m && m.cota, fixo: !!(m && m.fixo === true)}))})),
    manual: a.manual === true,
  });

  /* ------------------------------------------------------------ PESSOAS */
  function pessoa(id) {
    const O = oper();
    const p = O && typeof O.pessoaDe === 'function' ? O.pessoaDe(id) : null;
    const ficha = p && p.semFicha !== true ? p : null;
    const rotulo = O && typeof O.nomePessoa === 'function' ? O.nomePessoa(id) : '';
    return {id, nome: rotulo || (ficha && ficha.nome) || 'ID ' + id, completo: ficha ? String(ficha.nome || '') : '',
      foto: ficha && ficha.foto ? String(ficha.foto) : '', freelancer: !!(ficha && ficha.freelancer === true), semFicha: !ficha,
      repetido: !!(O && typeof O.idRepetido === 'function' && O.idRepetido(id))};
  }
  function avatar(p) {
    const f = fn('avatarRH');
    if (f) return f({nome: p.completo || p.nome, foto: p.foto}, 'mini aloc-avatar');
    const partes = String(p.completo || p.nome || '?').trim().split(/\s+/).filter(Boolean);
    const ini = ((partes[0] || '?')[0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
    return `<span class="casa-avatar mini aloc-avatar" aria-hidden="true">${escA(ini)}</span>`;
  }
  // A régua de pessoas do aparelho no formato que DIVISAO.alocacaoSugerida pede.
  function regua() {
    const O = oper(), S = loja();
    if (!O || typeof O.idPessoa !== 'function') return null;
    const el = S && typeof S.elenco === 'function' ? (S.elenco() || {}) : {};
    return {idDe: v => O.idPessoa(v), chave: v => O.chavePessoa(v), pessoa: v => O.pessoaDe(v),
      fichas: [...lista(el.pessoas), ...lista(el.antigos)].filter(p => p && ehId(p.id))};
  }
  /* QUEM ESTÁ NA O.S. SÓ PELO NOME, sem ID no RH (terceiro sem ficha): a
     F08 recusa dividir, porque a lista derivada tiraria a pessoa da O.S.
     calada. A mesma conta do servidor (semIdNaEquipe). */
  function semIdDe(os) {
    const O = oper(), vistos = new Set(), out = [];
    for (const x of lista(os && os.equipe)) {
      const t = String(x == null ? '' : x).trim();
      if (!t || ehId(t)) continue;
      if (O && typeof O.idPessoa === 'function' && ehId(O.idPessoa(t))) continue;
      const k = norm(t);
      if (!vistos.has(k)) { vistos.add(k); out.push(t); }
    }
    return out;
  }
  /* O JEITO ANTIGO: todo mundo da O.S., pelo ID quando há ficha e pelo nome
     quando não há (a chave da participação da v138: o ID, ou o próprio nome). */
  function pessoasDaOS(os) {
    const O = oper(), vistos = new Set(), out = [];
    for (const x of lista(os && os.equipe)) {
      const t = String(x == null ? '' : x).trim();
      if (!t) continue;
      const r = !ehId(t) && O && typeof O.idPessoa === 'function' ? String(O.idPessoa(t) || '') : '';
      const id = ehId(t) ? t : ehId(r) ? r : '';
      const k = id || 'nome:' + norm(t);
      if (vistos.has(k)) continue;
      vistos.add(k);
      const p = id ? pessoa(id) : null;
      out.push({chave: id || t, id, nome: p ? p.nome : t, completo: p ? p.completo : '', foto: p ? p.foto : '', apelido: t, semFicha: !id, freelancer: !!(p && p.freelancer)});
    }
    return out;
  }
  /* A divisão do jeito antigo num grupo só, sem líder: partes iguais, ou a
     participação que já vale nesta O.S. quando tem as mesmas pessoas (quem
     reabre uma O.S. confirmada vê o que foi confirmado, não um 50/50 novo).
     O motor edita (redistribui e trava) sem olhar o formato do ID; quem
     grava é paraParticipacao, que nunca manda isto para os.alocacao. */
  function antigoDe(os, participacao, regra) {
    const D = motor(), pessoas = pessoasDaOS(os);
    const grupos = pessoas.length ? [{equipeId: null, cota: TOTAL, liderId: null, membros: pessoas.map(p => ({pessoaId: p.chave, papel: '', cota: 0}))}] : [];
    const a = D.restaurarPadrao({grupos}, regra);
    const ms = lista(participacao).filter(objeto);
    if (pessoas.length && ms.length === pessoas.length) {
      const cotas = pessoas.map(p => { const m = ms.find(x => norm(x.chave) === norm(p.chave)); return m ? Math.round(Number(m.percentual) * 100) : NaN; });
      if (cotas.every(c => Number.isInteger(c) && c > 0) && cotas.reduce((s, c) => s + c, 0) === TOTAL) { a.grupos[0].membros.forEach((m, i) => { m.cota = cotas[i]; }); a.final = D.finais(a); }
    }
    // Divisão gravada na O.S. (de antes de o nome entrar): a participação do blob não vale por cima dela.
    return {pessoas, aloc: a, sobreDivisao: objeto(os && os.alocacao)};
  }

  /* ------------------------------------------------------------ EQUIPES */
  const equipeDe = (st, id) => st.equipes.find(e => e && e.id === id) || null;
  const ativas = st => st.equipes.filter(e => e && e.id && e.ativo !== false);
  function corDe(e) {
    const P = perf();
    if (!e || !P) return '';
    if (typeof P.corValida === 'function' && P.corValida(e.cor)) return e.cor;
    const k = P.COR_ANIMAL && Object.prototype.hasOwnProperty.call(P.COR_ANIMAL, e.animal) ? P.COR_ANIMAL[e.animal] : '';
    return k && typeof P.corValida === 'function' && P.corValida(k) ? k : '';
  }
  const corClasse = e => { const c = corDe(e); return c ? ` perf-cor-${c} perf-com-cor` : ''; };
  function logoDe(e) {
    const f = fn('perfLogoHTML');
    if (e && f) return f(e, 'aloc-logo');
    const P = perf();
    const arq = e && P && P.LOGO_ANIMAL && Object.prototype.hasOwnProperty.call(P.LOGO_ANIMAL, e.animal) ? P.LOGO_ANIMAL[e.animal] : '';
    if (arq) return `<img class="aloc-logo perf-logo" src="${escA(arq)}" alt="" loading="lazy">`;
    return `<span class="aloc-logo" aria-hidden="true">${escA(e && P && typeof P.iconeEquipe === 'function' ? P.iconeEquipe(e) : '🤝')}</span>`;
  }
  // Os integrantes fixos pelo ID de hoje (a equipe gravada até a v133 guarda o slug).
  function integrantes(e) {
    const idDe = fn('perfIdMembro');
    const ids = [], fora = [];
    for (const m of lista(e && e.membros)) {
      const id = idDe ? idDe(m) : String(m && (m.pessoaId || m.chave) || '').trim();
      if (ehId(id)) { if (!ids.includes(id)) ids.push(id); } else fora.push(String(m && (m.nome || m.chave) || ''));
    }
    return {ids, fora};
  }
  const nomeGrupo = (st, g) => { const e = g && g.equipeId != null ? equipeDe(st, g.equipeId) : null; return e ? String(e.nome || e.id) : (g && g.equipeId != null ? String(g.equipeId) : 'Pessoas avulsas'); };

  /* ------------------------------------------------------------ REGRA */
  function regraDoDia(dia, versoes) {
    const D = motor(), R = regras();
    const programa = R && typeof R.regraVigente === 'function' ? R.regraVigente(lista(versoes), dia) : null;
    const divisao = programa && D.regraValida(programa.divisao) ? programa.divisao : D.REGRA_PADRAO;
    return {programa, divisao};
  }
  function diaDe(os) {
    const f = fn('diaEntrega'), O = oper();
    const d = (f && os ? f(os) : '') || (O && typeof O.dia === 'function' ? O.dia((os && os.instalacao && os.instalacao.data) || '') : '');
    return /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? d : hojeISO();
  }

  /* ------------------------------------------------------------ ESTADO */
  // O que vai para a tela: sem carimbo nem marcas do servidor.
  function limpar(a) {
    const D = motor();
    const grupos = lista(a && a.grupos).filter(objeto).map(g => {
      const x = {equipeId: g.equipeId != null ? g.equipeId : null, cota: g.cota, liderId: g.liderId != null ? g.liderId : null,
        membros: lista(g.membros).filter(objeto).map(m => ({pessoaId: String(m.pessoaId), papel: m.papel || '', freelancer: m.freelancer === true || pessoa(String(m.pessoaId)).freelancer, cota: m.cota, ...(m.fixo === true ? {fixo: true} : {})}))};
      if (g.fixo === true) x.fixo = true;
      if (g.semLider === true) x.semLider = true;
      return x;
    });
    const out = {grupos, manual: !!(a && a.manual === true)};
    out.final = D.finais(out);
    return out;
  }
  function difere(a, regra) {
    const p = motor().restaurarPadrao(a, regra);
    return lista(a.grupos).some((g, i) => {
      const pg = p.grupos[i] || {};
      return g.cota !== pg.cota || lista(g.membros).some((m, j) => m.cota !== (lista(pg.membros)[j] || {}).cota);
    });
  }
  /* Opções: {os, equipes, papel, valor, dia, versoes, participacao,
     reiniciar}. `participacao` = membros da participação antiga que ainda vale
     nesta O.S. (só o jeito antigo usa). Mantém o estado da mesma O.S.
     (repintura), a menos que peça reiniciar ou que a divisão gravada tenha
     mudado de conteúdo. */
  function iniciar(chave, o = {}) {
    const D = motor();
    const os = objeto(o.os) ? o.os : {};
    const gravada = objeto(os.alocacao) ? os.alocacao : null;
    const ja = estados.get(chave);
    if (ja && !o.reiniciar && ja.osId === os.id && nucleo(ja.gravada) === nucleo(gravada)) return ja;
    const equipes = lista(o.equipes).filter(objeto);
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(o.dia || '')) ? o.dia : diaDe(os);
    const {programa, divisao} = regraDoDia(dia, o.versoes);
    const papel = String(o.papel || '');
    const verValor = ['admin', 'pcp'].includes(papel);
    const r = regua();
    const sug = D.alocacaoSugerida(os, {pessoas: r, equipes, regra: divisao});
    const semId = semIdDe(os);
    const st = {
      chave, osId: os.id, numero: String(os.numero || ''),
      gravada: gravada ? copia(gravada) : null, conferirRH: !!(gravada && gravada.conferirRH === true),
      // A equipe e a marca de quando a tela abriu: a trava contra a mudança feita em outro aparelho.
      base: {equipe: genteDe(os.equipe), desatualizada: !!(gravada && gravada.desatualizada === true)},
      origem: sug.origem || (gravada ? 'invalida' : ''), anterior: sug.anterior ? copia(sug.anterior) : null,
      aviso: String(sug.aviso || ''), semId,
      antigo: semId.length ? antigoDe(os, o.participacao, divisao) : null,
      aloc: sug.alocacao ? limpar(sug.alocacao) : {grupos: [], final: [], manual: false},
      regra: divisao, programa, dia, equipes, papel, verValor,
      valor: verValor && Number.isFinite(Number(o.valor)) && o.valor !== null && o.valor !== '' ? Math.round(Number(o.valor) * 100) : null,
      painel: null, erro: '', notas: [],
    };
    estados.set(chave, st);
    return st;
  }
  const estado = chave => estados.get(chave) || null;
  function esquecer(chave) { estados.delete(chave); hosts.delete(chave); }

  /* ------------------------------------------------------------ AÇÕES */
  /* Mudança de estrutura (entra, sai, equipe nova): as equipes tocadas voltam
     ao padrão da regra com o líder de agora, e a cota entre equipes volta a
     ser proporcional ao número de pessoas. As não tocadas mantêm o ajuste. */
  function reconstruir(st, tocados) {
    const D = motor(), a = st.aloc;
    a.grupos = a.grupos.filter(g => lista(g.membros).length);
    a.grupos = a.grupos.map(g => tocados.has(g) ? D.padrao(g, st.regra) : g);
    const cotas = D.entreEquipes(a.grupos);
    a.grupos.forEach((g, i) => { g.cota = cotas[i]; delete g.fixo; });
    a.final = D.finais(a);
    a.manual = a.grupos.length ? difere(a, st.regra) : false;
  }
  const ondeEsta = (st, id) => st.aloc.grupos.findIndex(g => lista(g.membros).some(m => m.pessoaId === id));
  // O líder primeiro na lista: é assim que a tela mostra, e "o próximo" é o seguinte.
  function liderNaFrente(g) {
    const i = lista(g.membros).findIndex(m => m.pessoaId === g.liderId);
    if (i > 0) g.membros.unshift(...g.membros.splice(i, 1));
  }
  function tirarDoGrupo(g, id) {
    const i = g.membros.findIndex(m => m.pessoaId === id);
    if (i < 0) return false;
    g.membros.splice(i, 1);
    // TIRAR O LÍDER PROMOVE O PRÓXIMO da lista (quem estava logo depois dele).
    if (g.liderId === id) g.liderId = g.membros.length ? g.membros[i < g.membros.length ? i : 0].pessoaId : null;
    return true;
  }
  function adicionarEquipe(st, equipeId) {
    const e = equipeDe(st, equipeId);
    if (!e || e.ativo === false) return 'Equipe não encontrada ou desativada.';
    if (st.aloc.grupos.some(g => g.equipeId === e.id)) return `A equipe ${e.nome || e.id} já está na divisão.`;
    const {ids, fora} = integrantes(e);
    const notas = fora.filter(Boolean).map(n => `${n} está na equipe ${e.nome} sem ID do RH e não entrou.`);
    const tocados = new Set(), novos = [];
    for (const id of ids) {
      const p = pessoa(id);
      if (p.repetido) { notas.push(`${p.nome}: ID repetido no RH (ficha e contrato). Confira o CPF no RH.`); continue; }
      const gi = ondeEsta(st, id);
      if (gi >= 0) {
        const g = st.aloc.grupos[gi];
        if (g.equipeId != null) { notas.push(`${p.nome} já está na equipe ${nomeGrupo(st, g)} e ficou lá.`); continue; }
        tirarDoGrupo(g, id); tocados.add(g);   // avulso passa para a equipe
      }
      novos.push({pessoaId: id, papel: '', freelancer: p.freelancer, cota: 0});
    }
    st.notas = notas;
    if (!novos.length) return `Ninguém da equipe ${e.nome || e.id} pôde entrar: ${ids.length ? 'os integrantes já estão em outras equipes da divisão.' : 'ela não tem integrantes com ID do RH.'}`;
    const lider = ehId(e.liderPadraoId) && novos.some(m => m.pessoaId === e.liderPadraoId) ? e.liderPadraoId : (novos.length === 1 ? novos[0].pessoaId : null);
    const g = {equipeId: String(e.id), cota: 0, liderId: lider, membros: novos};
    liderNaFrente(g);
    if (!lider) st.notas.push(`A equipe ${e.nome} não tem líder padrão: toque em Tornar líder em quem liderou.`);
    st.aloc.grupos.push(g); tocados.add(g);
    reconstruir(st, tocados);
    return '';
  }
  function adicionarPessoa(st, grupo, id) {
    if (!ehId(id)) return 'Só entra na divisão quem tem ID do RH (6 dígitos).';
    const p = pessoa(id);
    if (p.repetido) return `${p.nome}: ID repetido no RH (ficha e contrato). O RH precisa conferir o CPF.`;
    const ja = ondeEsta(st, id);
    if (ja >= 0) return `${p.nome} já está na divisão (${nomeGrupo(st, st.aloc.grupos[ja])}).`;
    let g = Number.isInteger(grupo) ? st.aloc.grupos[grupo] : null;
    if (!g) {
      g = st.aloc.grupos.find(x => x.equipeId == null);
      if (!g) { g = {equipeId: null, cota: 0, liderId: null, membros: []}; st.aloc.grupos.push(g); }
    }
    g.membros.push({pessoaId: id, papel: '', freelancer: p.freelancer, cota: 0});
    if (g.membros.length === 1) g.liderId = id;
    st.notas = [];
    reconstruir(st, new Set([g]));
    return '';
  }
  function remover(st, grupo, id) {
    const g = st.aloc.grupos[grupo];
    if (!g || !tirarDoGrupo(g, id)) return 'Essa pessoa não está nesta equipe.';
    st.notas = [];
    reconstruir(st, new Set([g]));
    return '';
  }
  function removerEquipe(st, grupo) {
    if (!st.aloc.grupos[grupo]) return 'Equipe não encontrada nesta divisão.';
    st.aloc.grupos.splice(grupo, 1);
    st.notas = [];
    reconstruir(st, new Set());
    return '';
  }
  function tornarLider(st, grupo, id) {
    const r = motor().trocarLider(st.aloc, grupo, id, st.regra);
    if (r.erro) return r.erro;
    st.aloc = r.alocacao;
    liderNaFrente(st.aloc.grupos[grupo]);
    st.aloc.final = motor().finais(st.aloc);
    return '';
  }
  // "60", "33,34", "33.34" ou "40%" em 0,01%. Mais de duas casas: arredonda.
  function lerPct(texto) {
    const t = String(texto == null ? '' : texto).trim().replace('%', '').replace(',', '.').trim();
    if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
    return Math.round(Number(t) * 100);
  }
  function editarPct(st, alvo, texto) {
    const bp = lerPct(texto);
    if (!Number.isInteger(bp)) return 'Digite o percentual com números, por exemplo 40 ou 33,34.';
    const r = motor().editar(st.aloc, alvo, bp, st.regra);
    if (r.erro) return r.erro;
    st.aloc = r.alocacao;
    return '';
  }
  function alternarTrava(st, alvo) {
    const g = st.aloc.grupos[alvo.grupo];
    const item = !g ? null : alvo.nivel === 'equipes' ? g : lista(g.membros).find(m => m.pessoaId === alvo.pessoaId);
    if (!item) return 'Não encontrei esse percentual na divisão.';
    const r = motor().travar(st.aloc, alvo, !(item.fixo === true));
    if (r.erro) return r.erro;
    st.aloc = r.alocacao;
    return '';
  }
  function restaurar(st) {
    st.aloc = motor().restaurarPadrao(st.aloc, st.regra);
    st.notas = [];
    return '';
  }
  // O jeito antigo: um grupo só (o 0), percentual por pessoa, cadeado e partes iguais.
  function antigoAcao(st, acao, p, valor) {
    if (!st.antigo) return 'Esta O.S. confirma pela divisão.';
    const D = motor(), a = st.antigo.aloc, alvo = {nivel: 'membros', grupo: 0, pessoaId: p};
    let r;
    if (acao === 'pct') {
      const bp = lerPct(valor);
      if (!Number.isInteger(bp)) return 'Digite o percentual com números, por exemplo 40 ou 33,34.';
      r = D.editar(a, alvo, bp, st.regra);
    } else if (acao === 'trava') {
      const m = lista(a.grupos[0] && a.grupos[0].membros).find(x => x.pessoaId === p);
      if (!m) return 'Não encontrei esse percentual na divisão.';
      r = D.travar(a, alvo, !(m.fixo === true));
    } else r = {alocacao: D.restaurarPadrao(a, st.regra), erro: ''};
    if (r.erro) return r.erro;
    st.antigo.aloc = r.alocacao;
    return '';
  }
  /* UMA AÇÃO SOBRE O ESTADO, com o nome que a tela usa em data-aloc-acao.
     Só o estado muda; nada é enviado. Devolve '' ou o motivo da recusa (a
     divisão fica como estava). */
  function executar(chave, ds = {}) {
    const st = estados.get(chave);
    if (!st) return 'A divisão não está aberta.';
    const g = ds.g === undefined || ds.g === null || ds.g === '' ? null : Number(ds.g);
    const p = ds.p == null ? '' : String(ds.p);
    let erro = '';
    switch (ds.alocAcao) {
      case 'equipe': erro = adicionarEquipe(st, ds.e); break;
      case 'painel': st.painel = {grupo: Number.isInteger(g) ? g : null, busca: ''}; break;
      case 'fechar-painel': st.painel = null; break;
      case 'pessoa': erro = adicionarPessoa(st, st.painel ? st.painel.grupo : g, p); if (!erro) st.painel = null; break;
      case 'remover': erro = remover(st, g, p); break;
      case 'remover-equipe': erro = removerEquipe(st, g); break;
      case 'lider': erro = tornarLider(st, g, p); break;
      case 'trava': erro = alternarTrava(st, {nivel: 'membros', grupo: g, pessoaId: p}); break;
      case 'trava-equipe': erro = alternarTrava(st, {nivel: 'equipes', grupo: g}); break;
      case 'pct': erro = editarPct(st, {nivel: 'membros', grupo: g, pessoaId: p}, ds.valor); break;
      case 'pct-equipe': erro = editarPct(st, {nivel: 'equipes', grupo: g}, ds.valor); break;
      case 'restaurar': erro = restaurar(st); break;
      case 'pct-antigo': erro = antigoAcao(st, 'pct', p, ds.valor); break;
      case 'trava-antigo': erro = antigoAcao(st, 'trava', p); break;
      case 'antigo-iguais': erro = antigoAcao(st, 'iguais', p); break;
      default: erro = '';
    }
    st.erro = erro;
    return erro;
  }

  /* ------------------------------------------------------------ GRAVAR */
  const SEM_ID_NA_DIVISAO = st => `${st.semId.join(', ')} ${st.semId.length === 1 ? 'está' : 'estão'} nesta O.S. só pelo nome, sem ID no RH: a divisão não vai para a O.S. enquanto isso. Ligue o nome em Conferir nomes ou tire o nome na ficha da O.S.`;
  // O jeito antigo: por que ainda não dá para confirmar (vazio = pode).
  function bloqueioAntigo(st) {
    const a = st.antigo, ms = lista(a.aloc.grupos[0] && a.aloc.grupos[0].membros);
    if (a.sobreDivisao) return 'Esta O.S. já tem uma divisão gravada, de antes de o nome entrar na equipe, e a confirmação pelo jeito antigo não vale por cima dela. Ligue o nome em Conferir nomes ou tire o nome na ficha da O.S. para refazer a divisão.';
    if (!ms.length) return 'Ninguém na equipe desta O.S. Ponha quem trabalhou na ficha da O.S.';
    if (ms.some(m => !(Number(m.cota) > 0))) return 'Toda pessoa da O.S. precisa de uma parte maior que 0%. Quem não trabalhou nesta O.S. sai pela ficha da O.S.';
    if (ms.reduce((s, m) => s + (Number(m.cota) || 0), 0) !== TOTAL) return 'As partes precisam somar 100%.';
    return '';
  }
  // Por que ainda não dá para gravar (vazio = pode).
  function bloqueio(chave) {
    const st = estados.get(chave);
    if (!st) return 'A divisão não está aberta.';
    if (st.antigo) return bloqueioAntigo(st);
    if (st.semId.length) return SEM_ID_NA_DIVISAO(st);
    /* ID REPETIDO (a trava da F07): o seletor e o botão de equipe já recusam;
       a sugestão que parte da O.S. antiga também precisa travar, senão a
       divisão ia e o servidor a descartava (ID em dois cadastros do RH). */
    const rep = [...new Set(motor().derivarEquipe(st.aloc))].filter(id => pessoa(id).repetido);
    if (rep.length) return `${rep.map(id => pessoa(id).nome).join(', ')}: ID repetido no RH (ficha e contrato). O RH precisa conferir o CPF. Até lá, tire ${rep.length === 1 ? 'essa pessoa' : 'essas pessoas'} da divisão para gravar.`;
    return motor().validar(st.aloc) || '';
  }
  /* A divisão pronta para enviar, só com o que a gestão edita. Nunca sai com
     soma diferente de 10000 (o validar confere os dois níveis). A O.S. do
     jeito antigo nunca manda divisão. */
  function paraGravar(chave) {
    const st = estados.get(chave);
    if (st && st.semId.length) return {erro: SEM_ID_NA_DIVISAO(st)};
    const erro = bloqueio(chave);
    if (erro) return {erro};
    const D = motor();
    const grupos = st.aloc.grupos.map(g => ({equipeId: g.equipeId != null ? g.equipeId : null, cota: g.cota, liderId: g.liderId, ...(g.fixo === true ? {fixo: true} : {}),
      membros: g.membros.map(m => ({pessoaId: m.pessoaId, papel: m.papel, freelancer: m.freelancer === true, cota: m.cota, ...(m.fixo === true ? {fixo: true} : {})}))}));
    const a = {grupos, manual: st.aloc.manual === true};
    a.final = D.finais(a);
    const invalida = D.validar(a);
    if (invalida) return {erro: invalida};
    return {erro: '', alocacao: a, equipe: D.derivarEquipe(a)};
  }
  /* O JEITO ANTIGO PRONTO PARA A PARTICIPAÇÃO DO BLOB (o formato da v138:
     chave = ID ou o próprio nome, percentual somando 100). Quem grava é o
     Conferir; aqui só se monta e se confere. */
  function paraParticipacao(chave) {
    const st = estados.get(chave);
    if (!st || !st.antigo) return {erro: 'Esta O.S. confirma pela divisão, não pelo jeito antigo.'};
    const erro = bloqueio(chave);
    if (erro) return {erro};
    const ms = st.antigo.aloc.grupos[0].membros;
    const membros = ms.map(m => {
      const p = st.antigo.pessoas.find(x => x.chave === m.pessoaId) || {};
      return {chave: String(m.pessoaId), nome: String(p.nome || m.pessoaId).slice(0, 150), apelido: String(p.apelido || p.nome || m.pessoaId).slice(0, 150), percentual: m.cota / 100};
    });
    return {erro: '', membros};
  }
  const mudou = chave => { const st = estados.get(chave); return !!st && (st.origem !== 'gravada' || st.conferirRH || nucleo(st.aloc) !== nucleo(st.gravada)); };

  /* O RESULTADO DO ENVIO. O store avisa por eventos (os-gravada, conflito,
     recusa); um ouvinte por loja, e cada espera é pela O.S. */
  function ouvir(S) {
    if (!S || lojasOuvidas.has(S)) return;
    lojasOuvidas.add(S);
    const acabar = (id, r) => { const w = esperas.get(id); if (w) w.fim(r); };
    if (typeof S.on === 'function') {
      S.on('os-gravada', d => {
        // O servidor aceitou uma gravação desta O.S. com a divisão que ela levava: a recusa antiga não vale mais.
        if (d && d.id && !lista(d.descartado).includes('alocacao')) recusas.delete(d.id);
        const w = d && esperas.get(d.id);
        if (!w || nucleo(d.enviado && d.enviado.alocacao) !== w.nucleo) return;
        if (lista(d.descartado).includes('alocacao')) {
          const motivo = String((d.motivo && d.motivo.alocacao) || 'O servidor não aceitou a divisão.');
          w.fim({ok: false, estado: 'descartada', mensagem: `O servidor não gravou a divisão: ${motivo.replace(/[.\s]*$/, '.')} Este aparelho voltou à divisão que está no servidor.`});
        } else if (d.os && objeto(d.os.alocacao) && d.os.alocacao.conferirRH === true) {
          /* ESTÁ NO SERVIDOR, MAS AINDA A CONFERIR NO RH: o RH não respondeu
             (o servidor não conferiu nada) ou uma pessoa não passou (o
             servidor avisa o motivo). Não é "gravada": a O.S. não conta na
             performance até a conferência passar. */
          const aviso = lista(d.avisos).map(String).find(x => /divis/i.test(x));
          w.fim({ok: false, estado: 'conferir-rh', os: d.os, mensagem: aviso
            ? `O servidor recebeu a divisão, mas ela ainda não conta na performance. ${aviso.replace(/[.\s]*$/, '.')}`
            : 'O servidor recebeu a divisão, mas o RH não respondeu: as pessoas continuam a conferir e a O.S. ainda não conta na performance. Toque em Confirmar de novo quando o RH voltar.'});
        } else w.fim({ok: true, estado: 'gravada', mensagem: 'Divisão gravada na O.S.', os: d.os});
      });
      const recusa = (d, fila) => {
        const id = d && d.item && d.item.os && d.item.os.id;
        if (!id || !esperas.has(id)) return;
        const motivo = String((d && d.motivo) || 'sem motivo informado').replace(/[.\s]*$/, '.');
        // `definitiva`: saiu da fila (403, O.S. excluída). A que fica na fila é achada nela.
        acabar(id, {ok: false, estado: 'recusada', definitiva: !fila, mensagem: fila ? `O servidor ainda não aceitou esta O.S.: ${motivo} A gravação fica na fila deste aparelho.` : `O servidor recusou a gravação: ${motivo}`});
      };
      S.on('item-recusado', d => recusa(d, false));
      S.on('item-pendente', d => recusa(d, true));
    }
    if (typeof S.onConflict === 'function') S.onConflict((local, remoto) => {
      const id = (remoto && remoto.id) || (local && local.id);
      const quem = remoto && remoto.atualizadoPor ? ` (${remoto.atualizadoPor})` : '';
      // `servidor`: o aviso de conflito do app abriu (e fica atrás de um diálogo modal).
      acabar(id, {ok: false, estado: 'conflito', servidor: true, mensagem: `Outra gravação desta O.S. chegou ao servidor antes${quem}. A sua divisão não foi gravada. Resolva o aviso de conflito e depois toque em Conferir de novo para refazer a divisão sobre a versão atual.`});
    });
  }
  const filaDe = (S, id) => (typeof S.getQueue === 'function' ? lista(S.getQueue()) : []).filter(it => it && it.action === 'upsert' && it.os && it.os.id === id);
  const naFila = (S, id) => filaDe(S, id).length > 0;
  const PENDENTE = 'A divisão ficou guardada neste aparelho e vai ao servidor na próxima sincronização. Se o servidor recusar, o aviso aparece no topo da tela.';
  /* GRAVAR NA O.S. Uma chamada = um envio. Relê a O.S. do aparelho, confere
     que a divisão gravada não mudou de conteúdo desde que a tela abriu (senão
     é o 409 da divisão: nada vai), nem a equipe da O.S. e a marca
     `desatualizada` (quem outro aparelho pôs na O.S. sairia calado), devolve
     o `em` dela, deriva os.equipe e manda pela fila de sempre. Opções:
     {store, usuario, prazoMs}. */
  async function gravarNaOS(chave, o = {}) {
    const st = estados.get(chave);
    if (!st) return {ok: false, estado: 'erro', mensagem: 'A divisão não está aberta. Abra o Conferir de novo.'};
    const pronto = paraGravar(chave);
    if (pronto.erro) return {ok: false, estado: 'invalida', mensagem: pronto.erro};
    const S = o.store || loja();
    const os = S && typeof S.getOS === 'function' ? S.getOS(st.osId) : null;
    if (!os) return {ok: false, estado: 'erro', mensagem: 'Esta O.S. não está mais neste aparelho. Atualize a lista e abra o Conferir de novo.'};
    const atual = objeto(os.alocacao) ? os.alocacao : null;
    if (nucleo(atual) !== nucleo(st.gravada))
      return {ok: false, estado: 'conflito', mensagem: `A divisão desta O.S. foi mudada em outro aparelho${atual && atual.por ? ` (${atual.por})` : ''} enquanto você editava. Nada foi gravado. Toque em Recomeçar para partir da divisão que está gravada agora.`};
    if (genteDe(os.equipe) !== st.base.equipe || !!(atual && atual.desatualizada === true) !== st.base.desatualizada)
      return {ok: false, estado: 'conflito', mensagem: `A equipe desta O.S. foi mudada em outro aparelho${os.atualizadoPor ? ` (${os.atualizadoPor})` : ''} enquanto você editava. Nada foi gravado. Toque em Recomeçar para partir de quem está na O.S. agora.`};
    if (!mudou(chave)) {
      /* "Nada mudou" só quando a divisão está mesmo no servidor. A que ainda
         está na fila (recusada pela validação, em conflito ou sem rede) ou que
         o servidor recusou não é "gravada": diz o que houve e não envia de novo. */
      const presa = filaDe(S, st.osId).find(it => nucleo(objeto(it.os.alocacao) ? it.os.alocacao : null) === nucleo(st.aloc));
      if (presa) {
        const motivo = presa.recusa && presa.recusa.motivo ? String(presa.recusa.motivo).replace(/[.\s]*$/, '.') : '';
        return {ok: false, estado: 'na-fila', mensagem: `A gravação desta O.S. ainda não foi aceita pelo servidor: ela está na fila deste aparelho, com esta divisão.${motivo ? ' Motivo da recusa: ' + motivo : ''} Nada novo foi enviado.`};
      }
      const rec = recusas.get(st.osId);
      if (rec && rec.nucleo === nucleo(st.aloc)) return {ok: false, estado: 'recusada', mensagem: rec.mensagem};
      return {ok: true, estado: 'sem-mudanca', mensagem: 'Nada mudou: a divisão gravada continua valendo.'};
    }
    const alocacao = pronto.alocacao;
    // Editou a partir da divisão gravada: devolve o carimbo dela. Divisão nova vai sem.
    if (atual && emDe(atual)) alocacao.em = emDe(atual);
    ouvir(S);
    const antes = esperas.get(st.osId);
    if (antes) antes.fim({ok: true, estado: 'pendente', mensagem: PENDENTE});
    let fim;
    const resultado = new Promise(res => { fim = res; });
    let feito = false, timer = null;
    const w = {nucleo: nucleo(alocacao), fim: r => { if (feito) return; feito = true; if (timer) clearTimeout(timer); if (esperas.get(st.osId) === w) esperas.delete(st.osId); fim(r); }};
    esperas.set(st.osId, w);
    timer = setTimeout(() => w.fim({ok: true, estado: 'pendente', mensagem: 'O servidor ainda não respondeu. ' + PENDENTE}), Number.isFinite(o.prazoMs) ? o.prazoMs : 20000);
    const agora = new Date().toISOString();
    os.alocacao = alocacao;
    os.equipe = pronto.equipe;
    os.atualizadoEm = agora;
    os.atualizadoPor = String(o.usuario || '');
    S.saveOS(os);
    if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) w.fim({ok: true, estado: 'pendente', mensagem: 'Sem internet agora. ' + PENDENTE});
    else if (typeof S.trySync === 'function') {
      try { await S.trySync(); } catch (e) { /* a fila guarda; o resultado vem pelos eventos ou pelo prazo */ }
      // Loja sem eventos (a prévia local) e fila vazia depois do envio: foi.
      if (!naFila(S, st.osId)) w.fim({ok: true, estado: 'gravada', mensagem: 'Divisão gravada na O.S.'});
    }
    const r = await resultado;
    /* A BASE DESTA TELA DEPOIS DO ENVIO. A cópia do aparelho passou a ter o
       que foi enviado, aceito ou não; só o descarte a devolve à versão do
       servidor (o store repõe). Sem isto, o segundo Confirmar depois de uma
       recusa acusava "mudada em outro aparelho" contra a própria gravação. */
    if (r.estado !== 'descartada') {
      st.gravada = copia(alocacao); st.origem = 'gravada'; st.conferirRH = r.estado === 'conferir-rh';
      st.base = {equipe: genteDe(pronto.equipe), desatualizada: false};
    }
    if (r.estado === 'recusada' && r.definitiva) recusas.set(st.osId, {nucleo: nucleo(alocacao), mensagem: r.mensagem});
    return r;
  }

  /* ------------------------------------------------------------ TELA */
  const papelBadge = (m, g) => m.papel === 'lider' ? '<span class="aloc-badge lider">★ Líder</span>'
    : m.papel === 'ajudante' ? '<span class="aloc-badge">Ajudante</span>'
    : lista(g.membros).length > 1 ? '<span class="aloc-badge alerta">sem líder</span>' : '';
  function chipHTML(st, g, gi, m) {
    const p = pessoa(m.pessoaId), n = lista(g.membros).length, lider = m.papel === 'lider';
    const k = `${gi}:${m.pessoaId}`;
    const fixo = m.fixo === true;
    const pct = n === 1
      ? '<span class="aloc-pct-fixa">100%</span>'
      : `<label class="aloc-pct"><span class="perf-sr">Percentual de ${escA(p.nome)} na equipe</span><input type="text" inputmode="decimal" autocomplete="off" data-aloc-pct data-g="${gi}" data-p="${escA(m.pessoaId)}" data-aloc-k="pct:${escA(k)}" value="${escA(pctTexto(m.cota))}" ${fixo ? 'readonly aria-readonly="true"' : ''}><span aria-hidden="true">%</span></label>
         <button type="button" class="aloc-trava" data-aloc-acao="trava" data-g="${gi}" data-p="${escA(m.pessoaId)}" data-aloc-k="trava:${escA(k)}" aria-pressed="${fixo}" aria-label="${fixo ? 'Destravar' : 'Travar'} o percentual de ${escA(p.nome)}" title="${fixo ? 'Travado: a redistribuição não mexe aqui' : 'Travar este percentual'}">${fixo ? '🔒' : '🔓'}</button>`;
    return `<li class="aloc-chip${lider ? ' lider' : ''}">
      <span class="aloc-quem">${avatar(p)}<span class="aloc-nome"><b title="${escA(p.completo ? p.completo + ' · ID ' + m.pessoaId : 'ID ' + m.pessoaId)}">${escA(p.nome)}</b><span class="aloc-badges">${papelBadge(m, g)}${p.freelancer || m.freelancer ? '<span class="tag-freelancer">Freelancer</span>' : ''}${p.semFicha ? '<span class="aloc-badge alerta">sem ficha neste aparelho</span>' : ''}${p.repetido ? '<span class="aloc-badge alerta">ID repetido no RH</span>' : ''}</span></span></span>
      <span class="aloc-ctrl">${!lider && n > 1 ? `<button type="button" class="aloc-lider" data-aloc-acao="lider" data-g="${gi}" data-p="${escA(m.pessoaId)}" data-aloc-k="lider:${escA(k)}" aria-label="Tornar ${escA(p.nome)} líder">★ Tornar líder</button>` : ''}${pct}</span>
      <button type="button" class="aloc-x" data-aloc-acao="remover" data-g="${gi}" data-p="${escA(m.pessoaId)}" data-aloc-k="rm:${escA(k)}" aria-label="Tirar ${escA(p.nome)} da divisão">×</button>
    </li>`;
  }
  function grupoHTML(st, g, gi) {
    const e = g.equipeId != null ? equipeDe(st, g.equipeId) : null;
    const nome = nomeGrupo(st, g), varios = st.aloc.grupos.length > 1, fixo = g.fixo === true;
    const cota = varios ? `<span class="aloc-cota-eq"><label class="aloc-pct"><span class="aloc-rot-cota">Parte da equipe</span><input type="text" inputmode="decimal" autocomplete="off" data-aloc-pct-equipe data-g="${gi}" data-aloc-k="pcteq:${gi}" value="${escA(pctTexto(g.cota))}" aria-label="Parte da equipe ${escA(nome)} na O.S." ${fixo ? 'readonly aria-readonly="true"' : ''}><span aria-hidden="true">%</span></label>
        <button type="button" class="aloc-trava" data-aloc-acao="trava-equipe" data-g="${gi}" data-aloc-k="travaeq:${gi}" aria-pressed="${fixo}" aria-label="${fixo ? 'Destravar' : 'Travar'} a parte da equipe ${escA(nome)}">${fixo ? '🔒' : '🔓'}</button></span>` : '';
    return `<section class="aloc-grupo${corClasse(e)}" aria-label="${escA(nome)}">
      <header class="aloc-grupo-cab">${e ? logoDe(e) : '<span class="aloc-logo" aria-hidden="true">🤝</span>'}<h4>${escA(nome)}${e && e.ativo === false ? ' <small>(desativada)</small>' : ''}</h4>${cota}
        <button type="button" class="aloc-x" data-aloc-acao="remover-equipe" data-g="${gi}" data-aloc-k="rmeq:${gi}" aria-label="Tirar ${escA(nome)} da divisão">×</button></header>
      ${g.semLider ? '<p class="aloc-dica">Sem líder: toque em Tornar líder em quem liderou. Até lá fica em partes iguais e não grava.</p>' : ''}
      <ul class="aloc-chips">${lista(g.membros).map(m => chipHTML(st, g, gi, m)).join('')}</ul>
      <button type="button" class="aloc-mais" data-aloc-acao="painel" data-g="${gi}" data-aloc-k="painel:${gi}">＋ Pessoa ${e ? 'na ' + escA(nome) : 'avulsa'}</button>
    </section>`;
  }
  function rapidasHTML(st) {
    const xs = ativas(st);
    if (!xs.length) return '<p class="aloc-dica">Nenhuma equipe ativa cadastrada. Cadastre em Performance, na vista Equipes.</p>';
    return `<div class="aloc-rapidas" role="group" aria-label="Trazer uma equipe inteira"><span class="aloc-rotulo">Trazer equipe</span><div class="aloc-rapidas-lista">${xs.map(e => {
      const na = st.aloc.grupos.some(g => g.equipeId === e.id);
      const n = integrantes(e).ids.length;
      return `<button type="button" class="aloc-eq${corClasse(e)}" data-aloc-acao="equipe" data-e="${escA(e.id)}" data-aloc-k="eq:${escA(e.id)}" aria-pressed="${na}" ${na ? 'disabled' : ''} title="${escA(integrantes(e).ids.map(id => pessoa(id).nome).join(', ') || 'Sem integrantes com ID')}">${logoDe(e)}<span class="aloc-eq-txt"><b>${escA(e.nome || e.id)}</b><small>${na ? 'na divisão' : `${n} ${n === 1 ? 'pessoa' : 'pessoas'}`}</small></span></button>`;
    }).join('')}</div></div>`;
  }
  function barraHTML(st) {
    const fs = motor().finais(st.aloc);
    if (!fs.length) return '';
    const total = fs.reduce((s, f) => s + f.cota, 0);
    let x = 0;
    const segs = fs.map(f => {
      const e = f.equipeId != null ? equipeDe(st, f.equipeId) : null, c = corDe(e);
      const w = f.cota, ini = x; x += w;
      if (!w) return '';
      const vao = x < TOTAL && w > 60 ? 40 : 0;
      return `<rect class="aloc-seg ${c ? 'perf-cor-' + c : 'sem-cor'}${f.papel === 'lider' ? ' lider' : ''}" x="${ini}" width="${w - vao}" height="18"/>`;
    }).join('');
    const rotulo = fs.map(f => `${pessoa(f.pessoaId).nome} ${pctTexto(f.cota)}%`).join(', ');
    const legenda = st.aloc.grupos.map(g => { const e = g.equipeId != null ? equipeDe(st, g.equipeId) : null; return `<li class="${corClasse(e).trim()}"><i class="aloc-amostra" aria-hidden="true"></i>${escA(nomeGrupo(st, g))} ${escA(pctTexto(g.cota))}%</li>`; }).join('');
    return `<div class="aloc-barra-bloco"><svg class="aloc-barra" viewBox="0 0 ${TOTAL} 18" preserveAspectRatio="none" role="img" aria-label="${escA('Divisão: ' + rotulo)}" focusable="false"><rect class="aloc-trilho" width="${TOTAL}" height="18"/>${segs}</svg>
      <div class="aloc-barra-pe"><ul class="aloc-legenda">${legenda}</ul><span class="aloc-soma${total === TOTAL ? ' ok' : ''}">Total ${escA(pctTexto(total))}%</span></div></div>`;
  }
  function opcoesPessoas(st) {
    const f = fn('opcoesEquipe'), S = loja();
    const naDivisao = new Set(motor().derivarEquipe(st.aloc));
    let ops = [];
    if (f) { try { ops = lista(f([...naDivisao])); } catch (e) { ops = []; } }
    if (!ops.length && S && typeof S.elenco === 'function') {
      ops = lista((S.elenco() || {}).pessoas).filter(p => p && p.ativo !== false && ehId(p.id)).map(p => ({valor: p.id, id: p.id, nome: pessoa(p.id).nome, completo: String(p.nome || ''), apelido: String(p.apelido || ''), grupo: p.freelancer ? 'Freelancers' : (p.area || 'Sem área'), freelancer: p.freelancer === true, bloqueio: pessoa(p.id).repetido ? 'ID repetido entre ficha e contrato de freelancer: o RH precisa conferir o CPF.' : ''}));
    }
    return ops.map(o => {
      const id = ehId(o.valor) ? String(o.valor) : '';
      const bloqueio = o.bloqueio ? String(o.bloqueio) : !id ? 'Sem ID no RH: não entra na divisão.' : naDivisao.has(id) ? 'Já está na divisão.' : '';
      return {id, nome: String(o.nome || ''), completo: String(o.completo || ''), apelido: String(o.apelido || ''), grupo: String(o.grupo || ''), freelancer: !!o.freelancer, bloqueio};
    });
  }
  function painelHTML(st) {
    if (!st.painel) return '';
    const g = Number.isInteger(st.painel.grupo) ? st.aloc.grupos[st.painel.grupo] : null;
    const busca = norm(st.painel.busca);
    let grupo = '';
    const linhas = opcoesPessoas(st).map(o => {
      const cab = o.grupo !== grupo ? `<div class="aloc-opcoes-grupo">${escA(o.grupo)}</div>` : '';
      grupo = o.grupo;
      const chave = norm([o.nome, o.completo, o.apelido, o.id].join(' '));
      const sub = o.bloqueio ? '⚠️ ' + (o.id ? `ID ${o.id} · ` : '') + o.bloqueio : (o.completo ? `${o.completo} · ID ${o.id}` : `ID ${o.id}`);
      return `${cab}<button type="button" class="aloc-opcao${o.bloqueio ? ' bloqueado' : ''}" data-aloc-acao="pessoa" data-p="${escA(o.id)}" data-aloc-opcao data-busca="${escA(chave)}" data-aloc-k="op:${escA(o.id || o.nome)}" ${o.bloqueio ? 'disabled' : ''} ${busca && !chave.includes(busca) ? 'hidden' : ''}>${avatar({nome: o.nome, completo: o.completo, foto: o.id ? pessoa(o.id).foto : ''})}<span class="aloc-opcao-txt">${escA(o.nome)}${o.freelancer ? ' <span class="tag-freelancer">Freelancer</span>' : ''}<small>${escA(sub)}</small></span></button>`;
    }).join('');
    // Constante do app.js (const no escopo global, fora do window): lida pelo nome.
    const rh = typeof RH_CONTRATOS_FREELANCER !== 'undefined' ? RH_CONTRATOS_FREELANCER : '';
    return `<div class="aloc-painel" role="group" aria-label="Adicionar pessoa">
      <div class="aloc-painel-cab"><strong>Adicionar pessoa ${g ? 'na ' + escA(nomeGrupo(st, g)) : 'avulsa'}</strong><button type="button" class="aloc-x" data-aloc-acao="fechar-painel" data-aloc-k="fechar-painel" aria-label="Fechar a lista de pessoas">×</button></div>
      <input type="search" class="aloc-busca" data-aloc-busca data-aloc-k="busca" value="${escA(st.painel.busca)}" placeholder="Buscar por nome, apelido ou ID" autocomplete="off" aria-label="Buscar pessoa">
      <div class="aloc-opcoes">${linhas || '<p class="aloc-dica">Sem pessoas do RH neste aparelho ainda.</p>'}</div>
      <p class="aloc-dica">Freelancer entra pelo contrato no RH, com CPF.${typeof rh === 'string' && rh ? ` <a href="${escA(rh)}" target="_blank" rel="noopener">Cadastrar novo no RH ↗</a>` : ''}</p>
    </div>`;
  }
  const botoesIr = '<div class="aloc-aviso-acoes"><button type="button" class="btn-ghost btn-sm" data-aloc-acao="ir-rh" data-aloc-k="ir-rh">Conferir nomes</button><button type="button" class="btn-ghost btn-sm" data-aloc-acao="ir-ficha" data-aloc-k="ir-ficha">Abrir a ficha da O.S.</button></div>';
  function avisosHTML(st) {
    const out = [];
    if (st.antigo) {
      out.push(`<div class="aloc-aviso aloc-trava-aviso" role="note"><p><strong>Esta O.S. tem nome sem ficha no RH.</strong> A confirmação vale pelo jeito antigo; ligue o nome em Conferir nomes para gravar a divisão na O.S.</p>
        <p>Sem ficha no RH: ${st.semId.map(escA).join(', ')}. Se ${st.semId.length === 1 ? 'essa pessoa não trabalhou' : 'alguma não trabalhou'} nesta O.S., tire o nome na ficha da O.S.</p>
        ${botoesIr}</div>`);
      return out.join('');
    }
    if (st.origem === 'desatualizada' || st.origem === 'divergente') {
      const a = st.anterior || st.gravada || {};
      const quem = a.por ? ` por ${escA(a.por)}` : '', quando = dataBR(a.em) ? ` em ${dataBR(a.em)}` : '';
      out.push(`<p class="aloc-aviso">A divisão gravada${quem}${quando} não bate mais com a equipe da O.S.: a equipe mudou depois. A sugestão abaixo parte de quem está na O.S. agora; confirme para gravar.</p>`);
    } else if (st.conferirRH) {
      out.push('<p class="aloc-aviso">A divisão gravada entrou com o RH fora do ar e ainda não conta na performance. Confirmar confere as pessoas no RH.</p>');
    } else if (st.origem === 'equipe' || st.origem === 'legado') {
      out.push(`<p class="aloc-aviso neutro">Nada está gravado ainda. A sugestão abaixo parte de quem está na O.S. agora${st.origem === 'equipe' ? ', que é a mesma gente de uma equipe cadastrada' : ''}: confira e confirme.</p>`);
    }
    if (st.aviso) out.push(`<p class="aloc-aviso">${escA(st.aviso)}</p>`);
    return out.join('');
  }
  function previaHTML(st) {
    const D = motor(), fs = D.finais(st.aloc);
    if (!fs.length) return '';
    const R = regras(), prog = st.programa;
    const comissao = st.verValor && prog && st.valor != null && R && typeof R.comissaoCentavos === 'function' ? R.comissaoCentavos(st.valor, prog) : null;
    const partes = comissao != null ? D.ratearCentavosLider(comissao, st.aloc) : [];
    const papel = f => f.papel === 'lider' ? 'Líder' : f.papel === 'ajudante' ? 'Ajudante' : 'Sem líder';
    const linhas = fs.map((f, i) => `<tr><td>${escA(pessoa(f.pessoaId).nome)}${f.freelancer ? ' <span class="tag-freelancer">Freelancer</span>' : ''}</td><td>${papel(f)}</td><td class="num">${escA(pctTexto(f.cota))}%</td>${st.verValor ? `<td class="num">${comissao != null && partes[i] && partes[i].centavos != null ? escA(reais(partes[i].centavos)) : '·'}</td>` : ''}</tr>`).join('');
    let valor = '';
    if (st.verValor) {
      const bruto = st.valor == null ? 'sem valor informado' : escA(reais(st.valor));
      const sobre = !prog ? `Esta O.S. é de ${dataBR(st.dia) || 'antes de 01/10/2026'}: fica na regra atual, sem comissão do programa.`
        : st.valor == null ? 'Sem o valor não há comissão prevista.'
        : `Comissão prevista de ${escA(pctTexto(prog.comissaoBp))}%${prog.provisoria ? ' (regra embutida, provisória)' : ''}: ${escA(reais(comissao || 0))}, dividida como na tabela.`;
      valor = `<p class="aloc-valor"><span>Valor bruto da O.S.: <b>${bruto}</b>.</span> ${sobre}</p>
        <p class="aloc-nota">Pontuação pela regra do programa a partir de 01/10. A comissão só vale se a O.S. pontuar (no prazo, sem retrabalho e sem retorno antecipado), o que é conferido na apuração.</p>`;
    }
    return `<section class="aloc-previa" aria-label="Prévia por pessoa"><h4>Prévia por pessoa</h4>
      <div class="aloc-tab-wrap"><table class="aloc-tab"><thead><tr><th scope="col">Pessoa</th><th scope="col">Papel</th><th scope="col" class="num">Parte na O.S.</th>${st.verValor ? '<th scope="col" class="num">Comissão prevista</th>' : ''}</tr></thead><tbody>${linhas}</tbody></table></div>${valor}</section>`;
  }
  /* O JEITO ANTIGO NA TELA: quem está na O.S. (com ficha ou só pelo nome), a
     parte de cada um, cadeado e "Dividir igualmente". Sem líder e sem R$: é
     a participação da v138, que a apuração lê como sempre leu. */
  function antigoHTML(st) {
    const a = st.antigo, g = a.aloc.grupos[0];
    if (!g) return '<p class="aloc-vazio">Ninguém na equipe desta O.S. Ponha quem trabalhou na ficha da O.S.</p>';
    const n = g.membros.length;
    const linhas = g.membros.map(m => {
      const p = a.pessoas.find(x => x.chave === m.pessoaId) || {nome: m.pessoaId, semFicha: true};
      const k = 'antigo:' + m.pessoaId, fixo = m.fixo === true;
      const pct = n === 1 ? '<span class="aloc-pct-fixa">100%</span>'
        : `<label class="aloc-pct"><span class="perf-sr">Parte de ${escA(p.nome)} na O.S.</span><input type="text" inputmode="decimal" autocomplete="off" data-aloc-pct-antigo data-p="${escA(m.pessoaId)}" data-aloc-k="pct:${escA(k)}" value="${escA(pctTexto(m.cota))}" ${fixo ? 'readonly aria-readonly="true"' : ''}><span aria-hidden="true">%</span></label>
         <button type="button" class="aloc-trava" data-aloc-acao="trava-antigo" data-p="${escA(m.pessoaId)}" data-aloc-k="trava:${escA(k)}" aria-pressed="${fixo}" aria-label="${fixo ? 'Destravar' : 'Travar'} a parte de ${escA(p.nome)}" title="${fixo ? 'Travado: a redistribuição não mexe aqui' : 'Travar este percentual'}">${fixo ? '🔒' : '🔓'}</button>`;
      const selos = `${p.semFicha ? '<span class="aloc-badge alerta">sem ficha no RH</span>' : ''}${p.freelancer ? '<span class="tag-freelancer">Freelancer</span>' : ''}`;
      return `<li class="aloc-chip"><span class="aloc-quem">${avatar(p)}<span class="aloc-nome"><b title="${escA(p.id ? (p.completo || p.nome) + ' · ID ' + p.id : 'Sem ficha no RH')}">${escA(p.nome)}</b><span class="aloc-badges">${selos}</span></span></span><span class="aloc-ctrl">${pct}</span></li>`;
    }).join('');
    const total = g.membros.reduce((s, m) => s + (Number(m.cota) || 0), 0);
    return `<section class="aloc-grupo" aria-label="Quem fez esta entrega"><header class="aloc-grupo-cab"><span class="aloc-logo" aria-hidden="true">🤝</span><h4>Quem fez esta entrega</h4></header>
      <ul class="aloc-chips">${linhas}</ul></section>
      <div class="aloc-rodape"><span class="aloc-soma${total === TOTAL ? ' ok' : ''}">Total ${escA(pctTexto(total))}%</span>${n > 1 ? '<button type="button" class="btn-ghost btn-sm" data-aloc-acao="antigo-iguais" data-aloc-k="antigo-iguais">Dividir igualmente</button>' : ''}</div>`;
  }
  function html(chave) {
    const st = estados.get(chave);
    if (!st) return '';
    if (st.antigo) return `<div class="aloc aloc-modo-antigo" data-aloc="${escA(chave)}">${avisosHTML(st)}${antigoHTML(st)}<p class="aloc-erro" role="alert">${escA(st.erro)}</p></div>`;
    const vazio = !st.aloc.grupos.length;
    return `<div class="aloc" data-aloc="${escA(chave)}">
      ${avisosHTML(st)}
      ${rapidasHTML(st)}
      ${barraHTML(st)}
      <div class="aloc-grupos">${st.aloc.grupos.map((g, gi) => grupoHTML(st, g, gi)).join('')}</div>
      ${vazio ? '<p class="aloc-vazio">Ninguém na divisão ainda. Traga uma equipe ou adicione pessoas.</p>' : ''}
      ${vazio || st.aloc.grupos.every(g => g.equipeId != null) ? `<button type="button" class="aloc-mais" data-aloc-acao="painel" data-aloc-k="painel:avulsa">＋ Pessoa avulsa</button>` : ''}
      ${painelHTML(st)}
      ${vazio ? '' : `<div class="aloc-rodape">${st.aloc.manual ? '<span class="aloc-selo" title="A divisão difere do padrão da regra">✍️ Editado à mão</span>' : '<span class="aloc-selo padrao">Padrão da regra</span>'}<button type="button" class="btn-ghost btn-sm" data-aloc-acao="restaurar" data-aloc-k="restaurar" ${st.aloc.manual ? '' : 'disabled'}>Restaurar padrão</button></div>`}
      ${st.notas.length ? `<ul class="aloc-notas">${st.notas.map(n => `<li>${escA(n)}</li>`).join('')}</ul>` : ''}
      <p class="aloc-erro" role="alert">${escA(st.erro)}</p>
      ${previaHTML(st)}
    </div>`;
  }

  /* A FIAÇÃO: delegação no contêiner (um ouvinte para clique, um para troca
     de valor e um para a busca), para repintar sem religar peça por peça. */
  function repintar(chave) {
    const h = hosts.get(chave);
    if (!h || !h.root) return;
    const doc = typeof document !== 'undefined' ? document : null;
    const ativo = doc && doc.activeElement && h.root.contains && h.root.contains(doc.activeElement) ? doc.activeElement.getAttribute('data-aloc-k') : null;
    h.root.innerHTML = html(chave);
    if (ativo && h.root.querySelectorAll) {
      const alvo = [...h.root.querySelectorAll('[data-aloc-k]')].find(x => x.getAttribute('data-aloc-k') === ativo && !x.disabled);
      if (alvo && typeof alvo.focus === 'function') { try { alvo.focus({preventScroll: true}); } catch (e) { alvo.focus(); } }
    }
    if (typeof h.aoMudar === 'function') h.aoMudar(estados.get(chave));
  }
  function montar(root, chave, o = {}) {
    if (!root) return;
    hosts.set(chave, {root, aoMudar: o.aoMudar, aoIr: o.aoIr});
    root.onclick = ev => {
      const b = ev && ev.target && typeof ev.target.closest === 'function' ? ev.target.closest('[data-aloc-acao]') : null;
      if (!b || b.disabled) return;
      const ds = b.dataset || {};
      if (ds.alocAcao === 'ir-rh' || ds.alocAcao === 'ir-ficha') { const h = hosts.get(chave); if (h && typeof h.aoIr === 'function') h.aoIr(ds.alocAcao === 'ir-rh' ? 'rh' : 'ficha'); return; }
      executar(chave, ds);
      repintar(chave);
    };
    root.onchange = ev => {
      const t = ev && ev.target, ds = t && t.dataset;
      if (!ds) return;
      if (ds.alocPct !== undefined) executar(chave, {alocAcao: 'pct', g: ds.g, p: ds.p, valor: t.value});
      else if (ds.alocPctEquipe !== undefined) executar(chave, {alocAcao: 'pct-equipe', g: ds.g, valor: t.value});
      else if (ds.alocPctAntigo !== undefined) executar(chave, {alocAcao: 'pct-antigo', p: ds.p, valor: t.value});
      else return;
      repintar(chave);
    };
    // A busca filtra sem repintar (o cursor fica no campo).
    root.oninput = ev => {
      const t = ev && ev.target;
      if (!t || !t.dataset || t.dataset.alocBusca === undefined) return;
      const st = estados.get(chave);
      if (st && st.painel) st.painel.busca = String(t.value || '');
      const q = norm(t.value);
      if (root.querySelectorAll) root.querySelectorAll('[data-aloc-opcao]').forEach(b => { b.hidden = !!q && !String(b.getAttribute('data-busca') || '').includes(q); });
    };
    // Enter no percentual confirma o número (não envia nada).
    root.onkeydown = ev => {
      const t = ev && ev.target;
      if (ev && ev.key === 'Enter' && t && t.dataset && (t.dataset.alocPct !== undefined || t.dataset.alocPctEquipe !== undefined || t.dataset.alocPctAntigo !== undefined)) { ev.preventDefault(); if (typeof t.blur === 'function') t.blur(); }
    };
    repintar(chave);
  }

  return {TOTAL, iniciar, estado, esquecer, executar, html, montar, repintar, bloqueio, paraGravar, paraParticipacao, gravarNaOS, mudou, nucleo, lerPct, pctTexto, dataBR};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ALOCUI;
