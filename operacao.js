// Regras de leitura compartilhadas pela gestão, pelo espelho e pelos relatórios.
// Não grava dados. As datas sem horário pertencem ao calendário local da empresa.
const OPERACAO = (() => {
  const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  function dia(valor) {
    if (!valor) return '';
    if (valor instanceof Date) return Number.isFinite(+valor) ? localISO(valor) : '';
    const s = String(valor);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = new Date(s + 'T12:00:00');
      return Number.isFinite(+d) && localISO(d) === s ? s : '';
    }
    const d = new Date(s);
    return Number.isFinite(+d) ? localISO(d) : '';
  }
  function somarDias(iso, n) {
    if (!dia(iso)) return '';
    const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n);
    return localISO(d);
  }
  const interno = o => o?.tipo === 'interno';
  /* PESSOA = FICHA DO RH. O ID MANDA; O NOME SÓ SE EXIBE.
     Ordem do dono (29/09/2026): "vamos usar o ID em todo o sistema e padrão
     pra não ter erro". O ID é o da casa: os 6 primeiros dígitos do CPF, único
     entre as fichas do RH. A O.S. nova grava o ID na equipe; a antiga guarda o
     nome que o PCP digitava ("Lucas", "Adlando", "Lucas Natalino"), e é AQUI,
     num lugar só, que esse nome vira pessoa: vínculo salvo primeiro, casamento
     único com o RH depois. O que não resolve vira "nome:<texto>", separado de
     todo mundo: melhor uma linha sem ficha do que duas pessoas somadas numa.
     Tudo que compara, conta ou agrupa gente passa por `chavePessoa`; tudo que
     mostra passa por `nomePessoa`. O servidor tem a mesma régua em
     _shared/pcp-integridade.mjs, e um teste confere as duas. */
  const normPessoa = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const ehIdPessoa = v => /^\d{6}$/.test(String(v ?? '').trim());
  const id6 = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 6 ? d : d.length === 11 ? d.slice(0, 6) : ''; };
  function resolverPessoas(dados = {}) {
    const todas = Array.isArray(dados.pessoas) ? dados.pessoas : [];
    const fichas = todas.filter(p => p && ehIdPessoa(p.id));
    /* Contrato de freelancer ainda sem ID (sem CPF, ou CPF que não confere, F07)
       conta na ambiguidade e nunca é o resultado: "Lucas" com a ficha do Lucas e
       o contrato do Lucas Prado sem CPF já não é de ninguém, e não muda de dono
       no dia em que o RH preenche o CPF do contrato. */
    const semId = todas.filter(p => p && p.freelancer === true && !ehIdPessoa(p.id) && String(p.nome || '').trim());
    const candidatas = semId.length ? [...fichas, ...semId] : fichas;
    const porId = new Map();
    for (const p of fichas) if (!porId.has(p.id)) porId.set(p.id, p);
    const porChaveRH = new Map(fichas.filter(p => p.chave).map(p => [String(p.chave), p]));
    /* ID REPETIDO ENTRE FICHA E CONTRATO DE FREELANCER (F07, caminho B). O
       ID sai dos 6 primeiros dígitos do CPF, e a ficha de Colaboradores e o
       contrato de freelancer do RH são cadastros diferentes: dois CPFs podem
       começar igual. O servidor junta a MESMA pessoa (CPF inteiro igual) antes
       de mandar e marca `idRepetido` no resto; a régua também percebe o par
       sozinha. ID repetido nunca é o resultado de um nome: melhor "sem ficha"
       do que o ponto indo para a pessoa errada. Contrato com contrato do mesmo
       ID é a mesma pessoa renovada, não repetição. */
    const repetidos = new Set(fichas.filter(p => p.idRepetido === true).map(p => p.id));
    const tipoDoId = new Map();
    for (const p of fichas) {
      const t = p.freelancer === true ? 'contrato' : 'ficha';
      if (tipoDoId.has(p.id) && tipoDoId.get(p.id) !== t) repetidos.add(p.id);
      else if (!tipoDoId.has(p.id)) tipoDoId.set(p.id, t);
    }
    // Casamento automático com a régua de sempre do PCP -- apelido do RH, nome
    // completo, ou começo de nome que só uma ficha tem --, contado entre TODAS
    // as fichas, inclusive quem já saiu. Quem saiu nunca é o resultado: "Elias"
    // com um Elias desligado e outro na casa é ambíguo, e não do que ficou --
    // senão o crachá antigo do que saiu passava a abrir as O.S. do xará
    // (revisão de 29/09/2026). "Adriano" sozinho, com dois Adrianos, fica sem
    // ficha de propósito.
    const auto = texto => {
      const ap = normPessoa(texto), tokens = ap.split(' ');
      const um = achadas => achadas.length === 1 && ehIdPessoa(achadas[0].id) && !achadas[0].desligado && !repetidos.has(achadas[0].id) ? achadas[0] : null;
      const porPrefixo = lista => lista.filter(p => { const n = normPessoa(p.nome).split(' '); return tokens.every((t, i) => n[i] === t); });
      const porApelido = candidatas.filter(p => normPessoa(p.apelido) === ap);
      if (porApelido.length) {
        /* O apelido do CONTRATO não passa por cima do nome de outra pessoa
           (F07): o RH só barra apelido igual ao de outro cadastro, não ao
           primeiro nome de alguém. "Lucas" com a ficha do Lucas Ferreira e o
           contrato do Lucas Prado de apelido "lucas" é ambíguo; senão o
           histórico e o crachá do empregado passavam para o freelancer. */
        const alvo = porApelido.length === 1 && porApelido[0].freelancer === true ? porApelido[0] : null;
        if (alvo && porPrefixo(candidatas).some(p => p !== alvo && (!ehIdPessoa(p.id) || p.id !== alvo.id))) return null;
        return um(porApelido);
      }
      const porNome = candidatas.filter(p => normPessoa(p.nome) === ap);
      if (porNome.length) return um(porNome);
      return um(porPrefixo(candidatas));
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
      // Vínculo salvo que aponta para ID repetido (ficha e contrato, F07) não
      // resolve: o ID não separa as duas pessoas, e o ponto iria para a errada.
      if (!memo.has(ap)) { const id = salvos.has(ap) ? salvos.get(ap) : (auto(s)?.id || ''); memo.set(ap, id && repetidos.has(id) ? '' : id); }
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
    const repetido = id => repetidos.has(String(id ?? '').trim());
    return { idDe, chave, nome, pessoa, fixado, fichas, repetido };
  }
  // A tela diz de onde vêm as fichas (elenco do RH + CFG); o resolvedor vale
  // até o fim da volta síncrona, como o cache de vínculos do casa.js. Sem
  // fonte (teste, página que não liga), nome continua valendo como nome.
  let _fontePessoas = null, _resolvedor = null;
  const esquecerPessoas = () => { _resolvedor = null; };
  const usarPessoas = fonte => { _fontePessoas = typeof fonte === 'function' ? fonte : null; esquecerPessoas(); };
  function pessoas() {
    if (!_resolvedor) {
      let dados = {};
      try { dados = _fontePessoas ? (_fontePessoas() || {}) : {}; } catch (e) { dados = {}; }
      _resolvedor = resolverPessoas(dados);
      Promise.resolve().then(esquecerPessoas);
    }
    return _resolvedor;
  }
  const idPessoa = v => pessoas().idDe(v);
  const chavePessoa = v => pessoas().chave(v);
  const nomePessoa = v => pessoas().nome(v);
  const pessoaDe = v => pessoas().pessoa(v);
  const pessoaFixada = v => pessoas().fixado(v);
  // ID que ficha e contrato de freelancer dividem (F07): não é escolha.
  const idRepetido = v => { const r = pessoas(); const id = r.idDe(v); return !!id && r.repetido(id); };
  // A equipe da O.S.: as ENTRADAS gravadas (ID ou nome antigo), uma por pessoa
  // -- "Lucas" e "Lucas Natalino" na mesma O.S. são uma pessoa só.
  const equipe = o => {
    const vistos = new Set(), out = [];
    for (const x of Array.isArray(o?.equipe) ? o.equipe : []) {
      const s = String(x ?? '').trim();
      if (!s) continue;
      const k = chavePessoa(s);
      if (vistos.has(k)) continue;
      vistos.add(k); out.push(s);
    }
    return out;
  };
  const equipeNomes = o => equipe(o).map(nomePessoa);
  // Texto da equipe para tela e mensagem: nomes de exibição, nunca o ID cru.
  const equipeTexto = (o, sep = ', ') => equipeNomes(o).join(sep);
  const duracao = o => Math.min(366,Math.max(1,Math.floor(Number(o?.instalacao?.duracaoDias)||1)));
  // Em instalação de vários dias, a conclusão prevista é o último dia.
  const prazo = o => dia(o?.instalacao?.data) ? somarDias(dia(o.instalacao.data),interno(o)?0:duracao(o)-1) : dia(o?.previsaoEntrega);
  const atrasada = (o, hoje = dia(new Date())) => !!(o && !o.finalizadaEm && prazo(o) && prazo(o) < hoje);
  function agendaCompleta(o) {
    const i = o?.instalacao || {};
    return !!(dia(i.data) && i.periodo && equipe(o).length && (i.periodo !== 'Horário' || /^([01]\d|2[0-3]):[0-5]\d$/.test(i.hora || '')));
  }
  /* PARADO NO CLIENTE -- REGRA, NAO ETAPA.
     Servico pronto cujo cliente ainda nao liberou a instalacao. Isto NAO e uma
     etapa do funil: e um estado que atravessa a etapa `apto`. A diferenca
     importa -- como etapa, ela obrigava a inventar ordem ("vem antes ou depois
     de agendar?") e colidia com o `confirmacao`, que ja e um portao do cliente
     logo adiante. Como regra, ela so responde uma pergunta: esta parado ali?

     Quem usa: a VISTA "Parado Cliente" do PCP, o selo do card e o "proximo
     passo". Nenhum dos tres precisa que exista uma etapa.

     ORIGINAL (o comentario da etapa, mantido pelo que ele explica):
     ESPERANDO O CLIENTE LIBERAR A INSTALACAO.
     Servico pronto, mas o cliente ainda nao autorizou entrar na obra. Antes
     desta etapa isso ficava indistinguivel de "pronto e ninguem agendou": as
     duas caiam em 'apto', e a tela nao separava o que esta parado por nossa
     conta do que esta parado esperando o cliente.

     E MARCADO, NAO DEDUZIDO. Nao da para inferir de "esta apto ha X dias":
     isso confundiria de novo as duas coisas, que e o defeito que a etapa vem
     resolver. Alguem clica, e a data fica registrada -- e e ela que permite
     responder depois quanto tempo, em media, o cliente segura.

     SO NO EXTERNO: quem retira na loja nao tem instalacao para liberar.
     SO ENQUANTO NAO HA AGENDA: marcar a data ja e a prova de que o cliente
     liberou, entao a agenda completa vence a marcacao sozinha -- ninguem
     precisa lembrar de desmarcar para a O.S seguir o fluxo.

     NAO CONFUNDIR com `confirmacao` ("Falta confirmar cliente"), que vem
     DEPOIS de agendar e trata da DATA. Esta aqui e antes: trata da AUTORIZACAO
     de instalar. Os rotulos foram escolhidos para nao se parecerem. */
  const paradoNoCliente = o =>
    !!(o?.liberadoPCP && !interno(o) && o?.paradoClienteEm && !agendaCompleta(o) && !o?.finalizadaEm);

  const confirmadaHoje = (o, hoje = dia(new Date())) => o?.confirmacao === 'Confirmado' && dia(o.confEm) === hoje;
  function pendencias(o) {
    if (!o || o.finalizadaEm) return [];
    const p = [];
    if (!prazo(o)) p.push('Definir prazo');
    if (!o.responsavelPCP) p.push('Definir responsável PCP');
    if (!interno(o) && o.liberadoPCP) {
      if (!dia(o.instalacao?.data)) p.push('Programar data');
      if (!equipe(o).length) p.push('Escalar equipe');
      if (!o.veiculo) p.push('Definir veículo');
      if (agendaCompleta(o) && !confirmadaHoje(o)) p.push('Confirmar cliente no dia');
    }
    if (retrabalhoPendente(o)) p.push('Resolver retrabalho');
    return p;
  }
  function taxaRetrabalho(lista, de = '', ate = '') {
    const base = conclusoes(lista,de,ate).filter(o => !interno(o) && !o.osOriginal);
    const originaisComFilhas = new Set(lista.filter(o => o.osOriginal && !encerradaERP(o)).map(o => String(o.osOriginal).trim()));
    const afetadas = base.filter(o => o.retrabalho || originaisComFilhas.has(String(o.numero || '').trim()));
    return {entregues:base.length, afetadas:afetadas.length, taxa:base.length ? Math.round(1000*afetadas.length/base.length)/10 : null};
  }
  function status(o) {
    if (o?.finalizadaEm) return 'finalizada';
    if (!o?.liberadoPCP) return 'aguardando_producao';
    if (interno(o) || !agendaCompleta(o)) return 'apto';
    if (o.confirmacao !== 'Confirmado') return 'agendada';
    return o.horaSaida ? 'em_andamento' : 'confirmada';
  }
  function diasAgenda(o) {
    if (interno(o) || !dia(o?.instalacao?.data)) return [];
    // Limite defensivo para que uma duração corrompida não trave a agenda.
    const dur = duracao(o);
    return Array.from({length:dur}, (_, i) => somarDias(dia(o.instalacao.data), i));
  }
  const emIntervalo = (d, de = '', ate = '') => !!(dia(d) && (!de || dia(d) >= de) && (!ate || dia(d) <= ate));
  const programadas = (lista, de = '', ate = '') => lista.filter(o => !o.finalizadaEm && diasAgenda(o).some(d => emIntervalo(d, de, ate)));
  // Liberação do veículo é autorização. Saída registrada é evidência de deslocamento.
  // Um horário antigo sem retorno pede conferência; não prova presença na rua hoje.
  function situacaoSaida(o, hoje = dia(new Date())) {
    if (!o || interno(o) || o.finalizadaEm || o.horaRetorno || o.retornoEm || !(o.horaSaida || o.saidaEm)) return '';
    const saida = dia(o.saidaEm) || dia(o.instalacao?.data);
    if (!saida || saida > hoje) return 'conferir';
    const dias = diasAgenda(o);
    if (saida === hoje || (saida < hoje && dias.includes(saida) && dias.includes(hoje))) return 'na-rua';
    return 'sem-retorno';
  }
  const naRua = (o, hoje = dia(new Date())) => situacaoSaida(o, hoje) === 'na-rua';
  function encerradaERP(o) {
    if (!o?.finalizadaEm) return false;
    // O marcador fica como histórico após reabertura. Uma nova finalização humana
    // não pode continuar classificada como baixa automática antiga.
    return !!(o.baixaAutoERP?.em === o.finalizadaEm || /^Mubisys\b/i.test(o.finalizadoPor || ''));
  }
  const concluida = o => !!(dia(o?.finalizadaEm) && !encerradaERP(o));
  const conclusoes = (lista, de = '', ate = '') => lista.filter(o => concluida(o) && emIntervalo(o.finalizadaEm, de, ate));
  function horas(o) {
    if (o?.saidaEm && o?.retornoEm) {
      const h = (new Date(o.retornoEm) - new Date(o.saidaEm)) / 3600000;
      return Number.isFinite(h) && h >= 0 ? h : null;
    }
    if (!(o?.horaSaida && o?.horaRetorno)) return null;
    const minutos = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? +s.slice(0,2)*60 + +s.slice(3) : null;
    const a = minutos(o.horaSaida), b = minutos(o.horaRetorno);
    if (a == null || b == null || Number(o.instalacao?.duracaoDias) > 1) return null;
    return (b - a + (b < a ? 1440 : 0)) / 60;
  }
  function mensal(lista, mes) {
    const fins = conclusoes(lista).filter(o => !interno(o) && dia(o.finalizadaEm).slice(0,7) === mes);
    const mapa = new Map();
    // Por pessoa (ID), não por texto: "Lucas" antigo e o ID dele somam juntos.
    for (const o of fins) for (const x of equipe(o)) {
      const k = chavePessoa(x);
      const d = mapa.get(k) || {id:idPessoa(x), nome:nomePessoa(x), entregas:0, retrab:0};
      d.entregas++; if (o.retrabalho) d.retrab++; mapa.set(k, d);
    }
    return {total:fins.length, retrabalho:fins.filter(o => o.retrabalho).length,
      semEquipe:fins.filter(o => !equipe(o).length).length,
      participacoes:[...mapa.values()].reduce((s,d) => s+d.entregas,0),
      pessoas:[...mapa.values()].sort((a,b) => b.entregas-a.entregas || a.nome.localeCompare(b.nome))};
  }
  /* PRAZO COMBINADO E RETORNO PREVISTO (F15, 29/09/2026). Cópia da régua de
     _shared/pcp-integridade.mjs (prazoCombinadoDe, retornosPrevistos); um teste
     confere as duas. O prazo é a PRIMEIRA data agendada no PCP, congelada; o
     ERP não define prazo (a importação põe a previsão do ERP em
     instalacao.data, e isso não é agenda de ninguém). O retorno previsto é a
     hora digitada pela gestão, por dia da agenda; sem hora, não há perda. */
  const HORA_F15 = /^([01]\d|2[0-3]):[0-5]\d$/;
  const objF15 = v => !!v && typeof v === 'object' && !Array.isArray(v);
  function diaPlausivel(v) {
    const s = String(v ?? '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || s < '2000-01-01' || s > '2100-12-31') return '';
    const t = Date.parse(s + 'T12:00:00Z');
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? s : '';
  }
  // A data atual é agenda de gente: O.S. feita no PCP, equipe escalada, ou data diferente da previsão do ERP.
  function agendaDeGente(o) {
    const atual = diaPlausivel(o?.instalacao?.data);
    if (!atual) return '';
    const doERP = !!(o?.origemMubisys || o?.origemPDF);
    const comEquipe = (Array.isArray(o?.equipe) ? o.equipe : []).some(x => String(x ?? '').trim());
    return !doERP || comEquipe || atual !== diaPlausivel(o?.previsaoEntrega) ? atual : '';
  }
  // A marca "sem prazo": a O.S. já estava entregue quando ganhou data ou equipe no PCP.
  const PRAZO_SEM_AGENDA = 'semAgenda';
  function prazoCombinadoDe(o) {
    const pc = o?.prazoCombinado;
    const gravado = diaPlausivel(objF15(pc) ? pc.data : pc);
    if (gravado) return { data: gravado, fonte: objF15(pc) && pc.fonte ? String(pc.fonte) : 'agenda', derivado: false };
    if (objF15(pc) && pc.fonte === PRAZO_SEM_AGENDA) return null;
    const doERP = !!(o?.origemMubisys || o?.origemPDF);
    const previsaoERP = diaPlausivel(o?.previsaoEntrega);
    const log = (Array.isArray(o?.agendaLog) ? o.agendaLog : []).filter(objF15);
    if (log.length) {
      const de = diaPlausivel(log[0].de);
      if (de && !(doERP && de === previsaoERP)) return { data: de, fonte: 'agendaLog', derivado: true };
      for (const x of log) { const d = diaPlausivel(x.data); if (d) return { data: d, fonte: 'agendaLog', derivado: true }; }
    }
    const atual = agendaDeGente(o);
    return atual ? { data: atual, fonte: 'agenda', derivado: true } : null;
  }
  function retornosPrevistos(o) {
    const v = o?.retornoPrevisto;
    const lista = Array.isArray(v) ? v : objF15(v) ? [v] : [];
    const porDia = new Map();
    for (const e of lista) {
      if (!objF15(e)) continue;
      const d = diaPlausivel(e.dia), hora = HORA_F15.test(String(e.hora ?? '')) ? String(e.hora) : '';
      if (!d || !hora) continue;
      const saida = HORA_F15.test(String(e.saida ?? '')) && String(e.saida) < hora ? String(e.saida) : '';
      porDia.set(d, { ...e, dia: d, hora, saida });
    }
    return [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia));
  }
  const retornoPrevistoDoDia = (o, d) => retornosPrevistos(o).find(e => e.dia === dia(d)) || null;
  /* A SAÍDA PREVISTA do dia: a digitada junto do retorno; no primeiro dia, na
     falta dela, a hora marcada em "Horário". A hora de Manhã/Tarde não conta:
     é padrão, não dado (106 O.S. com '00:00'). */
  function saidaPrevista(o, d) {
    const e = retornoPrevistoDoDia(o, d);
    if (e && e.saida) return e.saida;
    const i = o?.instalacao || {};
    if (i.periodo === 'Horário' && HORA_F15.test(String(i.hora || '')) && dia(i.data) === dia(d)) return String(i.hora);
    return '';
  }
  // Da saída prevista ao retorno previsto, só quando os dois existem e a saída vem antes.
  function janelaPrevista(o, d) {
    const e = retornoPrevistoDoDia(o, d), saida = saidaPrevista(o, d);
    return e && saida && saida < e.hora ? { saida, retorno: e.hora } : null;
  }
  /* O retorno previsto que o espelho mostra (só leitura): o de hoje, quando
     hoje é dia da agenda; senão o do dia da saída (a saidaEm não é zerada no
     "Mais um dia de trabalho", então ela não escolhe o dia numa O.S. de vários
     dias); senão o do primeiro dia da agenda. */
  function retornoPrevistoParaMostrar(o, hoje = dia(new Date())) {
    const dias = diasAgenda(o);
    const d = dias.includes(hoje) ? hoje : dia(o?.saidaEm) || dias[0] || '';
    return d ? retornoPrevistoDoDia(o, d) : null;
  }
  // Sem duração em horas/roteiro não é possível afirmar sobrecarga ou capacidade.
  // Manhã e tarde distintas não colidem. Os demais cruzamentos pedem conferência.
  /* F15: quando as DUAS O.S. têm saída prevista e retorno previsto naquele dia,
     o conflito é pelo intervalo (8h-10h e 10h-12h não colidem; 8h-11h e
     10h-12h colidem), e "Horário" deixa de colidir com tudo. Faltando um dos
     dois lados, vale o turno, como antes. */
  function mesmoTurno(a, b, d = '') {
    const ja = d ? janelaPrevista(a, d) : null, jb = d ? janelaPrevista(b, d) : null;
    if (ja && jb) return ja.saida < jb.retorno && jb.saida < ja.retorno;
    const turno = o => {
      const i = o.instalacao || {};
      if (i.periodo === 'Horário' && /^([01]\d|2[0-3]):[0-5]\d$/.test(i.hora || '')) return +i.hora.slice(0,2) < 12 ? 'Manhã' : 'Tarde';
      return i.periodo;
    };
    const x = turno(a), y = turno(b);
    // Horário indica só início, sem fim: pode atravessar o turno seguinte.
    if (a.instalacao?.periodo === 'Horário' || b.instalacao?.periodo === 'Horário') return true;
    return !(['Manhã','Tarde'].includes(x) && ['Manhã','Tarde'].includes(y) && x !== y);
  }
  function conflitos(lista, data) {
    const os = programadas(lista, data, data), out = [];
    for (let i=0; i<os.length; i++) for (let j=i+1; j<os.length; j++) {
      const a=os[i], b=os[j]; if (a.id === b.id || !mesmoTurno(a,b,data)) continue;
      const deB = new Set(equipe(b).map(chavePessoa));
      const nomes = equipe(a).filter(n => deB.has(chavePessoa(n))).map(nomePessoa);
      // "Instalação interna" não é carro: duas no mesmo turno não disputam nada.
      const carro = semCarro(a) ? '' : String(a.veiculo || '').trim();
      if (nomes.length || (carro && carro === String(b.veiculo || '').trim())) {
        out.push({a,b,equipe:nomes,veiculo:carro && carro === String(b.veiculo || '').trim() ? carro : ''});
      }
    }
    return out;
  }
  function resumo(lista, hoje = dia(new Date())) {
    const abertas = lista.filter(o => !o.finalizadaEm);
    return {
      hoje:abertas.filter(o => prazo(o) === hoje || diasAgenda(o).includes(hoje)),
      atrasadas:abertas.filter(o => atrasada(o,hoje)),
      semPrazo:abertas.filter(o => !prazo(o)),
      retirada:abertas.filter(o => interno(o) && o.liberadoPCP),
      semRetorno:abertas.filter(o => ['sem-retorno','conferir'].includes(situacaoSaida(o,hoje))),
      retrabalho:(m => lista.filter(o => retrabalhoPendente(o, m.get(String(o.numero || '').trim()))))(filhasDeRetrabalho(lista))
    };
  }
  /* O CARTÃO GRANDE DO ESPELHO ("Sua próxima instalação"). Era a primeira O.S.
     não finalizada por data -- e a primeira por data costuma ser uma vencida há
     meses que ninguém fechou, enquanto a de hoje ficava lá embaixo (auditoria
     de 23/09/2026). Ordem: quem está na rua; o que é de hoje; a próxima data
     futura. Vencida NUNCA vai para o cartão grande: ela aparece na lista, com
     o aviso de confirmar com o PCP. */
  const horaDoTurno = o => {
    const i = o?.instalacao || {};
    return i.periodo === 'Horário' ? (/^\d{2}:\d{2}/.test(i.hora || '') ? i.hora : '12:00')
      // "Dia inteiro" começa de manhã; 23:59 é só para período em branco.
      : i.periodo === 'Manhã' || i.periodo === 'Dia inteiro' ? '08:00' : i.periodo === 'Tarde' ? '13:00' : '23:59';
  };
  function destaqueDoDia(lista, hoje = dia(new Date())) {
    const abertas = (lista || []).filter(o => o && !o.finalizadaEm);
    const rua = abertas.find(o => naRua(o, hoje));
    if (rua) return rua;
    /* Só o DIA DA INSTALAÇÃO conta (a agenda; na retirada, a data marcada),
       nunca a previsão de entrega: "Sua próxima instalação" com botão de Rota
       apontava O.S. sem data. Serviço que já voltou no último dia dele saiu da
       frente: o da tarde não fica atrás do que terminou de manhã. */
    const dias = o => interno(o) ? (dia(o?.instalacao?.data) ? [dia(o.instalacao.data)] : []) : diasAgenda(o);
    /* No mesmo dia, a da manhã antes da da tarde: sem o desempate valia a
       ordem da lista, e o cartão com Rota apontava o cliente da tarde às 7h. */
    const candidatas = abertas.map(o => {
      const ds = dias(o), ultimo = ds[ds.length - 1];
      if ((o.horaRetorno || o.retornoEm) && ultimo && ultimo <= hoje) return null;
      const d = ds.find(x => x >= hoje);
      return d ? { o, d } : null;
    }).filter(Boolean).sort((a, b) => a.d.localeCompare(b.d) || horaDoTurno(a.o).localeCompare(horaDoTurno(b.o)));
    return candidatas.length ? candidatas[0].o : null;
  }
  function periodoRapido(id, hoje = dia(new Date()), futuro = false) {
    if (id === 'todos') return {de:'',ate:''};
    if (id === 'hoje') return {de:hoje,ate:hoje};
    if (id === 'mes') {
      const fim = new Date(hoje + 'T12:00:00'); fim.setMonth(fim.getMonth()+1,0);
      return {de:futuro ? hoje : hoje.slice(0,7)+'-01',ate:futuro ? dia(fim) : hoje};
    }
    const n = Math.max(1,Number(id)||1)-1;
    return futuro ? {de:hoje,ate:somarDias(hoje,n)} : {de:somarDias(hoje,-n),ate:hoje};
  }
  function missaoFoco(resumo) {
    if ((resumo.hoje || []).length) return 'hoje';
    const ordem = ['atrasadas', 'retrabalho', 'retirada', 'semPrazo', 'semRetorno'];
    let best = '', n = 0;
    for (const k of ordem) {
      const c = (resumo[k] || []).length;
      if (c > n) { n = c; best = k; }
    }
    return best;
  }
  /* FECHA O PERÍODO "PARADO NO CLIENTE" GUARDANDO DE QUANDO A QUANDO.
     Até 23/09/2026 o "Cliente liberou" APAGAVA a data -- e era ela que ia
     responder quanto tempo o cliente costuma segurar a instalação, o motivo de
     a etapa existir. Agora cada período vai para paradoClienteLog; a marca
     viva continua sendo paradoClienteEm (o que paradoNoCliente lê). */
  /* PROGRAMOU A DATA: o período parado termina. Só fecha com "agora" quando a
     agenda ficou completa NESTA gravação. Marca antiga (agenda que já estava
     completa, de antes de o log existir) fecha no dia em que o histórico diz
     que a O.S. foi agendada; sem isso, "até" fica em branco. Fechar tudo com
     hoje inventava períodos de semanas (revisão de 23/09/2026). */
  function fecharParadoPorAgenda(os, agendaCompletaAntes, agora, por) {
    if (!os || !os.paradoClienteEm || !agendaCompleta(os)) return false;
    if (!agendaCompletaAntes && !os.finalizadaEm) return fecharParado(os, agora, por, 'programada');
    const h = (os.historico || []).find(x => x && ['agendada', 'confirmada', 'em_andamento', 'finalizada'].includes(x.etapa) && String(x.em || '') >= String(os.paradoClienteEm));
    return fecharParado(os, h ? h.em : '', por, 'legado');
  }
  /* RETRABALHO PENDENTE: marcado e sem data de resolvido -- vale também para
     O.S. finalizada (o retrabalho costuma aparecer depois da entrega). Uma
     régua só para a vista, o selo, as pendências e o menu Etapa. */
  // Com O.S. filha (a correção que o ERP emite, com osOriginal apontado), vale
  // a filha: pendente enquanto alguma filha estiver aberta. Sem filha, vale a
  // data de resolvido. É a MESMA régua da aba Retrabalho (por par).
  const retrabalhoPendente = (o, filhas) => {
    if (!o || !o.retrabalho) return false;
    const fs = Array.isArray(filhas) ? filhas : [];
    return fs.length ? fs.some(f => !f.finalizadaEm) : !o.dataResolvido;
  };
  // numero da original -> filhas (O.S. com osOriginal apontando para ela).
  function filhasDeRetrabalho(lista) {
    const m = new Map();
    for (const f of lista || []) {
      const k = String((f && f.osOriginal) || '').trim();
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(f);
    }
    return m;
  }
  function fecharParado(os, ate, por, motivo) {
    if (!os || !os.paradoClienteEm) return false;
    const log = Array.isArray(os.paradoClienteLog) ? os.paradoClienteLog.slice() : [];
    log.push({ de: os.paradoClienteEm, ate: ate || '', marcouPor: os.paradoClientePor || '', fechouPor: por || '', motivo: motivo || '' });
    os.paradoClienteLog = log.slice(-20);
    os.paradoClienteEm = ''; os.paradoClientePor = '';
    return true;
  }
  /* A VOLTA DO CARRO. Pedido do Léo (24/09/2026): "preciso de algo que avalie
     a volta do carro pelo PCP, se está arrumado etc". A conferência já existia
     dentro da ficha de cada O.S., escondida e com duas perguntas; o carro volta
     UMA vez com a equipe, mesmo quando ela fez três O.S. no dia. Então a volta é
     o dia + o carro + a equipe, e a gestão confere uma vez para todas.

     Entra quem de fato voltou: retorno registrado, ou O.S. entregue que conta
     na nota (concluída por gente, ou baixa do ERP já lançada como entrega).
     Carro ainda na rua não entra; retirada no balcão não usa carro; baixa do
     ERP sem retorno nem lançamento não prova viagem nenhuma. */
  const PERGUNTAS_VOLTA = ['carroLimpo', 'carroArrumado', 'equipamentosOk', 'semAvaria'];
  const respostaVolta = v => v === 'sim' || v === true ? 'sim' : (v === 'nao' || v === false ? 'nao' : '');
  const voltaRespondida = rc => !!rc && PERGUNTAS_VOLTA.some(k => respostaVolta(rc[k]));
  /* CONFERIDA É O QUE A NOTA CONTA: carro (limpo ou arrumado) E equipamentos.
     A fila dizia "todas conferidas" com só "sem avaria" respondido, e a
     Performance dizia "FORA, falta conferir" sem caminho para entrar. Com só
     parte respondida, a volta fica "em parte" e continua na fila. */
  const voltaConferidaParaNota = rc => !!rc && !!(respostaVolta(rc.carroLimpo) || respostaVolta(rc.carroArrumado)) && !!respostaVolta(rc.equipamentosOk);
  /* A data de entrega que a gestão lançou vale antes da data da baixa do ERP:
     duas O.S. que o carro entregou no dia 20 e o ERP baixou nos dias 21 e 23
     viravam duas voltas em dias em que o carro nem saiu. */
  function diaDaVolta(o) {
    return dia(o?.retornoEm) || (o?.horaRetorno ? (dia(o.saidaEm) || dia(o.instalacao?.data)) : '') || dia(o?.entregaLancada?.data) || dia(o?.finalizadaEm);
  }
  const voltou = o => !!(o && !interno(o) && !semCarro(o) && equipe(o).length &&
    (o.retornoEm || o.horaRetorno || (dia(o.finalizadaEm) && (concluida(o) || o.entregaLancada))));
  /* SEM CARRO (pedido do Léo, 29/09/2026: "preciso que tenha a opção
     instalação interna, porque tem vezes que não precisa de carro"). É um
     valor do campo VEÍCULO, não um tipo de O.S.: a instalação continua sendo
     de instalação (equipe, agenda, confirmação, saída e retorno), só não usa
     carro. NÃO CONFUNDIR com o tipo 'interno' (cliente retira). Sem carro:
     não disputa carro com outra O.S., não pede veículo, não entra na fila da
     volta do carro nem na nota do carro. O servidor (base da nota) usa o
     mesmo nome. */
  const SEM_CARRO = 'Instalação interna';
  const semCarro = o => !!o && normal(o.veiculo) === normal(SEM_CARRO);
  const normal = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  /* A CHAVE DA VOLTA: dia + carro + equipe. A base da nota no servidor
     (pcp-sync, perfFonte) monta a mesma chave; um teste confere as duas. */
  const chaveDaVolta = o => [diaDaVolta(o), normal(o?.veiculo), equipe(o).map(chavePessoa).sort().join('+')].join('|');
  function voltasDoCarro(lista, de = '', ate = '') {
    const grupos = new Map();
    for (const o of lista || []) {
      if (!voltou(o)) continue;
      const d = diaDaVolta(o);
      if (!d || !emIntervalo(d, de, ate)) continue;
      const time = equipe(o);
      const chave = chaveDaVolta(o);
      // `equipe` é para mostrar (nomes de exibição); a chave já é pela pessoa.
      const g = grupos.get(chave) || { chave, dia: d, veiculo: String(o.veiculo || '').trim(), equipe: time.map(nomePessoa), os: [] };
      g.os.push(o);
      grupos.set(chave, g);
    }
    const lista2 = [...grupos.values()].map(g => {
      const feitas = g.os.filter(o => voltaConferidaParaNota(o.retornoConf));
      const tocadas = g.os.filter(o => voltaRespondida(o.retornoConf));
      const situacao = feitas.length === g.os.length ? 'conferida' : tocadas.length ? 'parcial' : 'conferir';
      // As respostas da volta só são UMA quando todas as O.S. dizem o mesmo.
      const assinatura = o => PERGUNTAS_VOLTA.map(k => respostaVolta(o.retornoConf?.[k])).join(',');
      const iguais = feitas.length === g.os.length && new Set(g.os.map(assinatura)).size === 1;
      /* O QUE A EQUIPE REGISTROU (voltaEquipe, 25/09/2026): a limpeza do carro
         declarada no espelho. Vem ao lado, nunca no lugar: a situação continua
         saindo só de retornoConf, porque a conferência é do PCP e é ela que
         conta na nota. "parte" = O.S. que voltou depois do registro. */
      const declaradas = g.os.filter(o => voltaRespondida(o.voltaEquipe));
      const equipeDisse = declaradas.length === g.os.length ? 'toda' : declaradas.length ? 'parte' : 'nenhuma';
      const quando = v => { const t = Date.parse(v && v.em || ''); return Number.isFinite(t) ? t : 0; };
      const declaracao = declaradas.map(o => o.voltaEquipe).sort((a, b) => quando(b) - quando(a))[0] || null;
      const semDeclaracao = g.os.filter(o => !voltaRespondida(o.voltaEquipe)).map(o => String(o.numero || 's/n'));
      return { ...g, situacao, respostas: iguais ? g.os[0].retornoConf : null, equipeDisse, declaracao, semDeclaracao };
    });
    const ordem = { conferir: 0, parcial: 1, conferida: 2 };
    return lista2.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || b.dia.localeCompare(a.dia) || a.chave.localeCompare(b.chave));
  }
  /* CÓDIGO FIXO DO ITEM (E1, 29/09/2026). Cópia do casamento do servidor
     (_shared/pcp-integridade.mjs: casarItens e uidItemValido); um teste
     confere as duas (tests/itens-uid.test.cjs). O item novo feito aqui
     (manual ou do PDF) nasce com 'm-' + aleatório: funciona sem rede, e dois
     aparelhos não geram o mesmo. Item antigo sem código não ganha código no
     aparelho: quem carimba é o servidor, na próxima gravação da O.S. */
  const UID_ITEM = /^[\w:.-]{1,80}$/;
  const uidItemValido = v => typeof v === 'string' && UID_ITEM.test(v);
  function novoUidItem() {
    const c = typeof crypto !== 'undefined' ? crypto : null, b = new Uint8Array(12);
    if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
    else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
    return 'm-' + Array.from(b, x => (x % 36).toString(36)).join('');
  }
  /* Para cada item de `novos`, a posição do mesmo item em `antes`, ou -1.
     Item com código só casa pelo código; sem código, e só com item do mesmo
     lado (ERP com ERP, manual com manual): número, descrição, medida e
     quantidade quando únicos; depois número e descrição, na ordem (nunca
     pela posição); depois só o número, depois só a descrição, quando únicos. */
  function casarItens(antes, novos) {
    const objeto = v => !!v && typeof v === 'object' && !Array.isArray(v);
    const A = Array.isArray(antes) ? antes : [], N = Array.isArray(novos) ? novos : [];
    const par = N.map(() => -1), usadoA = new Set(), comUid = new Set();
    const txt = v => String(v ?? '');
    const porUid = new Map();
    A.forEach((a, i) => { if (objeto(a) && uidItemValido(a.uid) && !porUid.has(a.uid)) porUid.set(a.uid, i); });
    N.forEach((n, j) => {
      if (!objeto(n) || !uidItemValido(n.uid)) return;
      comUid.add(j);
      const i = porUid.get(n.uid);
      if (i !== undefined && !usadoA.has(i)) { par[j] = i; usadoA.add(i); }
    });
    const livresN = () => N.map((_, j) => j).filter(j => par[j] < 0 && !comUid.has(j) && objeto(N[j]));
    const livresA = () => A.map((_, i) => i).filter(i => !usadoA.has(i) && objeto(A[i]));
    const casar = (i, j) => { par[j] = i; usadoA.add(i); };
    // Item do ERP só casa com item do ERP, e manual com manual: o item do PDF
    // ou o manual novo de uma aba antiga nunca herda o código de quem saiu.
    const mesmoLado = (i, j) => !!A[i].manual === !!N[j].manual;
    const igual = (i, j, campos) => mesmoLado(i, j) && campos.every(c => txt(N[j][c]) === txt(A[i][c]));
    const INTEIRO = ['item', 'descricao', 'medidas', 'qtde'], NOME = ['item', 'descricao'];
    // 1a. Número, descrição, medida e quantidade iguais, quando só um de cada
    // lado tem essa combinação: separa o par repetido de medidas diferentes
    // mesmo que um item antes dele (ou um do par) tenha saído da lista.
    for (const i of livresA()) {
      const js = livresN().filter(j => igual(i, j, INTEIRO));
      if (js.length === 1 && livresA().filter(k => igual(k, js[0], INTEIRO)).length === 1) casar(i, js[0]);
    }
    // 1b. Número e descrição iguais, na ordem (nunca pela posição na lista: a
    // posição muda quando um item antes dele sai).
    for (const i of livresA()) {
      const js = livresN().filter(j => igual(i, j, NOME));
      if (js.length) casar(i, js[0]);
    }
    for (const campo of ['item', 'descricao']) {
      for (const i of livresA()) {
        const v = txt(A[i][campo]);
        if (!v || A.filter(o => objeto(o) && txt(o[campo]) === v).length !== 1) continue;
        const js = livresN().filter(j => txt(N[j][campo]) === v && mesmoLado(i, j));
        if (js.length === 1) casar(i, js[0]);
      }
    }
    return par;
  }
  /* O RASCUNHO ABERTO ADOTA O CÓDIGO DA RESPOSTA (pré-requisito da E3). A
     ficha aberta antes de o servidor carimbar os códigos (item antigo, sem
     código) seguia mandando a lista sem código; com a marca de entrega
     presa ao código, o item novo de uma gravação podia herdar o código (e
     as entregas) de um item removido. Aqui o item SEM código de `alvo` (o
     rascunho, a cópia da lista ou o envio na fila) recebe o código do mesmo
     item em `fonte` (a O.S. que o servidor devolveu), pelo casamento de
     sempre, e SÓ quando é o mesmo item sem mudança nenhuma (lado, número,
     descrição, medida e quantidade), a mesma régua do servidor para a lista
     que já conhece os códigos. Sem essa régua, a placa 2 removida e o totem
     2 criado durante o envio davam ao totem o código da placa. Item mexido
     durante o envio fica sem código e o servidor o trata como item novo.
     Nada mais muda: nunca um código trocado, nunca um código que outro item
     do rascunho já tem. Devolve quantos códigos entraram. */
  function adotarUidsItens(alvo, fonte) {
    const objeto = v => !!v && typeof v === 'object' && !Array.isArray(v);
    if (!objeto(alvo) || !objeto(fonte) || alvo === fonte || !Array.isArray(alvo.itens) || !Array.isArray(fonte.itens)) return 0;
    if (!alvo.itens.some(it => objeto(it) && !uidItemValido(it.uid))) return 0;
    const usados = new Set(alvo.itens.filter(it => objeto(it) && uidItemValido(it.uid)).map(it => it.uid));
    const par = casarItens(fonte.itens, alvo.itens);
    const txt = v => String(v ?? '');
    const mesmoItem = (a, b) => !!a.manual === !!b.manual && ['item', 'descricao', 'medidas', 'qtde'].every(c => txt(a[c]) === txt(b[c]));
    let n = 0;
    alvo.itens.forEach((it, j) => {
      if (!objeto(it) || uidItemValido(it.uid) || par[j] < 0 || !objeto(fonte.itens[par[j]]) || !mesmoItem(it, fonte.itens[par[j]])) return;
      const uid = fonte.itens[par[j]].uid;
      if (!uidItemValido(uid) || usados.has(uid)) return;
      it.uid = uid; usados.add(uid); n++;
    });
    return n;
  }
  return {uidItemValido,novoUidItem,casarItens,adotarUidsItens,ehIdPessoa,resolverPessoas,usarPessoas,esquecerPessoas,idPessoa,chavePessoa,nomePessoa,pessoaDe,pessoaFixada,idRepetido,equipeNomes,equipeTexto,SEM_CARRO,semCarro,PERGUNTAS_VOLTA,respostaVolta,voltaRespondida,voltaConferidaParaNota,diaDaVolta,chaveDaVolta,voltou,voltasDoCarro,confirmadaHoje,pendencias,fecharParado,fecharParadoPorAgenda,retrabalhoPendente,filhasDeRetrabalho,destaqueDoDia,taxaRetrabalho,dia,somarDias,interno,equipe,prazo,atrasada,agendaCompleta,status,paradoNoCliente,diasAgenda,emIntervalo,programadas,situacaoSaida,naRua,encerradaERP,concluida,conclusoes,horas,mensal,conflitos,resumo,diaPlausivel,agendaDeGente,PRAZO_SEM_AGENDA,prazoCombinadoDe,retornosPrevistos,retornoPrevistoDoDia,saidaPrevista,janelaPrevista,retornoPrevistoParaMostrar,periodoRapido,missaoFoco};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OPERACAO;
// Nas páginas, as pessoas vêm do elenco do RH e do CFG (store.js carrega
// antes). No teste não há STORE: nome continua valendo como nome.
if (typeof STORE !== 'undefined' && STORE && typeof STORE.elenco === 'function') {
  OPERACAO.usarPessoas(() => {
    const el = STORE.elenco() || {}, cfg = STORE.getCFG() || {};
    return { pessoas: [...(el.pessoas || []), ...(el.antigos || [])], vinculos: cfg.vinculosRH, lista: cfg.instaladores };
  });
}
