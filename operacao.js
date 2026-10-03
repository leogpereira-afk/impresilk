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
  let _fontePessoas = null, _resolvedor = null, _dadosPessoas = null;
  const esquecerPessoas = () => { _resolvedor = null; _dadosPessoas = null; };
  const usarPessoas = fonte => { _fontePessoas = typeof fonte === 'function' ? fonte : null; esquecerPessoas(); };
  function pessoas() {
    if (!_resolvedor) {
      let dados = {};
      try { dados = _fontePessoas ? (_fontePessoas() || {}) : {}; } catch (e) { dados = {}; }
      _dadosPessoas = dados;
      _resolvedor = resolverPessoas(dados);
      Promise.resolve().then(esquecerPessoas);
    }
    return _resolvedor;
  }
  // Os dados de onde a régua de agora saiu (fichas, vínculos e lista): quem
  // precisa decidir junto com ela (converterEquipe) lê o MESMO retrato.
  const dadosPessoas = () => { pessoas(); return _dadosPessoas || {}; };
  const idPessoa = v => pessoas().idDe(v);
  const chavePessoa = v => pessoas().chave(v);
  const nomePessoa = v => pessoas().nome(v);
  const pessoaDe = v => pessoas().pessoa(v);
  const pessoaFixada = v => pessoas().fixado(v);
  // ID que ficha e contrato de freelancer dividem (F07): não é escolha.
  const idRepetido = v => { const r = pessoas(); const id = r.idDe(v); return !!id && r.repetido(id); };
  /* NOME ANTIGO VIRA ID, SÓ COM VÍNCULO CONFIRMADO (F12, 30/09/2026).
     A O.S. antiga guarda o nome que o PCP digitava; a tela "Conferir nomes"
     troca esse nome pelo ID, uma O.S. por vez. Esta é a decisão de cada nome,
     pura (não lê tela nem banco), com a MESMA régua de resolverPessoas:
     - vínculo salvo (Ligar, Fixar, Confirmar) é decisão de gente: vale;
     - sem vínculo, só o casamento EXATO e único de hoje: apelido do RH ou nome
       completo. Começo de nome ("Bruno Martins" de Bruno Martins Dias) é
       sugestão e espera alguém confirmar; o xará que entrar amanhã no RH
       mudaria o dono;
     - "Terceiro" é marcador, não gente, e o nome decidido "sem ficha" fica
       nome; ID repetido entre ficha e contrato (F07), contrato sem CPF e
       ambíguo ("Lucas" com três Lucas) nunca viram ID.
     `dados` é o que resolverPessoas recebe ({pessoas, vinculos, lista}); sem
     ele, o retrato de agora (dadosPessoas). */
  const MARCADOR_SEM_PESSOA = /^terceir/;   // Terceiro, Terceiros, Terceirizado
  const _reguas = new WeakMap();
  function reguaDe(dados) {
    const d = dados === undefined ? dadosPessoas() : (dados && typeof dados === 'object' ? dados : {});
    if (d === _dadosPessoas && _resolvedor) return {r: _resolvedor, d};
    let r = _reguas.get(d);
    if (!r) { r = resolverPessoas(d); _reguas.set(d, r); }
    return {r, d};
  }
  function motivoSemId(ap, r, d) {
    const todas = (Array.isArray(d.pessoas) ? d.pessoas : []).filter(p => p && String(p.nome || p.apelido || '').trim());
    const tokens = ap.split(' ');
    let cands = todas.filter(p => normPessoa(p.apelido) === ap);
    if (!cands.length) cands = todas.filter(p => normPessoa(p.nome) === ap);
    if (!cands.length) cands = todas.filter(p => { const n = normPessoa(p.nome).split(' '); return tokens.every((t, i) => n[i] === t); });
    const ids = [...new Set(cands.map(p => String(p.id ?? '').trim()))];
    if (!cands.length) return 'nenhuma';
    if (ids.length === 1 && ehIdPessoa(ids[0]) && r.repetido(ids[0])) return 'id-repetido';
    if (cands.length > 1) return 'ambiguo';
    const p = cands[0];
    if (!ehIdPessoa(p.id)) return 'sem-cpf';
    if (p.desligado) return 'desligado';
    return 'ambiguo';
  }
  function confirmarNome(nome, dados) {
    const s = String(nome ?? '').trim();
    if (!s) return {id:'', motivo:'vazio'};
    if (ehIdPessoa(s)) return {id:s, como:'id'};
    const ap = normPessoa(s);
    if (MARCADOR_SEM_PESSOA.test(ap)) return {id:'', motivo:'terceiro'};
    const {r, d} = reguaDe(dados);
    const id = r.idDe(s);
    if (r.fixado(s)) {
      if (id) return {id, como:'vinculo'};
      const semFicha = (Array.isArray(d.vinculos) ? d.vinculos : []).some(v => v && v.semFicha === true && normPessoa(v.apelido || v.nomePCP) === ap);
      return {id:'', motivo:semFicha ? 'sem-ficha' : 'vinculo-invalido'};
    }
    /* Vínculo salvo que a régua não usa (ficha sem CPF: só a chave do RH, sem
       ID) continua sendo decisão de gente: o nome é daquela ficha, e o
       casamento automático com um xará nunca passa por cima (revisão da F12). */
    const ligadoSemId = (Array.isArray(d.vinculos) ? d.vinculos : []).some(v => v && typeof v === 'object' && v.semFicha !== true && normPessoa(v.apelido || v.nomePCP) === ap);
    if (ligadoSemId) return {id:'', motivo:'vinculo-sem-id'};
    if (!id) return {id:'', motivo:motivoSemId(ap, r, d)};
    const p = r.fichas.find(f => f.id === id);
    if (p && normPessoa(p.apelido) === ap) return {id, como:'apelido'};
    if (p && normPessoa(p.nome) === ap) return {id, como:'nome'};
    return {id:'', motivo:'comeco', sugerido:id};
  }
  /* A EQUIPE DA O.S. COM OS NOMES CONFIRMADOS TROCADOS PELO ID. Quem já é ID
     fica como está (nem o espaço muda), o nome sem confirmação fica, e o ID
     não se repete: "Lucas Natalino" numa O.S. que já tem o ID dele sai da
     lista em vez de virar o segundo. Rodar de novo não muda nada.
     opcoes.nomes: converte só estes nomes (a tela pode ir por partes).
     Devolve {equipe, mudou, trocas:[{de, para, como}], ficam:[{nome, motivo, sugerido}]}. */
  function converterEquipe(lista, dados, opcoes = {}) {
    const entrada = Array.isArray(lista) ? lista : [];
    const so = Array.isArray(opcoes && opcoes.nomes) ? new Set(opcoes.nomes.map(normPessoa)) : null;
    const regua = reguaDe(dados);
    const ids = new Set(entrada.map(x => String(x ?? '').trim()).filter(ehIdPessoa));
    const out = [], trocas = [], ficam = [];
    for (const x of entrada) {
      const s = String(x ?? '').trim();
      if (!s || ehIdPessoa(s)) { out.push(x); continue; }
      const c = confirmarNome(s, regua.d);
      if (!c.id || (so && !so.has(normPessoa(s)))) {
        out.push(x);
        ficam.push({nome:s, motivo:c.id ? 'fora-da-escolha' : c.motivo, sugerido:c.sugerido || ''});
        continue;
      }
      trocas.push({de:s, para:c.id, como:c.como});
      if (ids.has(c.id)) continue;
      ids.add(c.id);
      out.push(c.id);
    }
    return {equipe:trocas.length ? out : entrada.slice(), mudou:trocas.length > 0, trocas, ficam};
  }
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
  // A O.S. cancelada (F16) não está atrasada: ela não vai mais ser entregue.
  const atrasada = (o, hoje = dia(new Date())) => !!(o && !o.finalizadaEm && prazo(o) && prazo(o) < hoje && !STATUS_ENTREGA.cancelada(o));
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
    // Cancelada (F16): nada mais a fazer nela, a não ser desfazer o cancelamento na ficha.
    if (!o || o.finalizadaEm || STATUS_ENTREGA.cancelada(o)) return [];
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
  // A cancelada (F16) sai da agenda: não ocupa gente nem carro.
  const programadas = (lista, de = '', ate = '') => lista.filter(o => !o.finalizadaEm && !STATUS_ENTREGA.cancelada(o) && diasAgenda(o).some(d => emIntervalo(d, de, ate)));
  // Liberação do veículo é autorização. Saída registrada é evidência de deslocamento.
  // Um horário antigo sem retorno pede conferência; não prova presença na rua hoje.
  function situacaoSaida(o, hoje = dia(new Date())) {
    if (o?.regularizacaoSaida?.situacao === 'regularizada' && o.regularizacaoSaida.saidaOriginal === (o.saidaEm || '')) return '';
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
  // A cancelada (F16) não é conclusão: não conta entrega nem produtividade.
  const concluida = o => !!(dia(o?.finalizadaEm) && !encerradaERP(o) && !STATUS_ENTREGA.cancelada(o));
  /* O LANÇAMENTO QUE VALE (revisão da F14). O Desfazer do lote pede ao
     servidor para tirar o lançamento com {desfazer: true}; sem internet, esse
     pedido fica na cópia deste aparelho até subir, e NÃO é lançamento: a O.S.
     volta para "a lançar" na hora. O pedido continua na cópia (e não vira
     null) porque a fila guarda uma gravação por O.S.: a próxima gravação da
     mesma O.S. parte da cópia e levaria null, que o servidor lê como "manter
     o lançado", e o Desfazer se perderia calado. Quem pergunta se a O.S. foi
     lançada pergunta aqui. */
  const entregaLancadaValida = o => {
    const l = o && o.entregaLancada;
    return l && typeof l === 'object' && !Array.isArray(l) && l.desfazer !== true ? l : null;
  };
  const conclusoes = (lista, de = '', ate = '') => lista.filter(o => concluida(o) && emIntervalo(o.finalizadaEm, de, ate));
  function horas(o) {
    if (o?.regularizacaoSaida?.situacao === 'regularizada' && o.regularizacaoSaida.saidaOriginal === (o.saidaEm || '') && !o.retornoEm) return null;
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
  // A resposta de cada texto fica guardada (revisão da F17: o status de centenas de cards lê os mesmos dias o tempo todo).
  const DIAS_PLAUSIVEIS = new Map();
  function diaPlausivel(v) {
    const s = String(v ?? '').trim().slice(0, 10);
    let r = DIAS_PLAUSIVEIS.get(s);
    if (r !== undefined) return r;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || s < '2000-01-01' || s > '2100-12-31') r = '';
    else { const t = Date.parse(s + 'T12:00:00Z'); r = Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? s : ''; }
    if (DIAS_PLAUSIVEIS.size > 5000) DIAS_PLAUSIVEIS.clear();
    DIAS_PLAUSIVEIS.set(s, r);
    return r;
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
  /* QUEM ESTÁ OCUPADO ANTES DE GRAVAR (F10, 30/09/2026). A mesma conta do
     `conflitos`, só que para a O.S. que está sendo programada agora, com o
     dia e o período que a tela mostra (ainda não gravados): as outras O.S.
     programadas nesses dias que batem de horário. Bate pelo intervalo da
     saída prevista ao retorno previsto quando as duas O.S. têm os dois (F15);
     senão pelo turno, e "Horário" (só início, sem fim) bate com tudo. O.S.
     de cliente retira (tipo interno) não tem agenda e fica fora; o veículo
     "Instalação interna" não é carro e nunca fica ocupado. Só leitura: a tela
     marca o chip e deixa gravar (é aviso, não trava). `periodo` é o texto do
     período ou {periodo, hora, duracaoDias}.
     Devolve {pessoas: Map(chavePessoa -> [{id, numero, cliente, dia, outroDia, periodo, hora}]),
              veiculos: Map(veículo -> [...])}. */
  function ocupados(lista, d, periodo, osId = '', extra = {}) {
    const pessoasOc = new Map(), veiculosOc = new Map();
    const vazio = {pessoas:pessoasOc, veiculos:veiculosOc};
    const dia0 = dia(d);
    if (!dia0) return vazio;
    const todas = (Array.isArray(lista) ? lista : []).filter(o => o && typeof o === 'object');
    const base = todas.find(o => osId && o.id === osId) || (extra && extra.os) || {};
    const p = periodo && typeof periodo === 'object' ? periodo : {periodo};
    const inst = {...(base.instalacao || {}), data:dia0, periodo:String(p.periodo ?? ''),
      hora:String(p.hora ?? (extra && extra.hora) ?? ''), duracaoDias:p.duracaoDias ?? (extra && extra.duracaoDias) ?? base.instalacao?.duracaoDias ?? 1};
    const eu = {...base, id:osId || base.id || '', instalacao:inst, finalizadaEm:''};
    const meusDias = diasAgenda(eu);
    if (!meusDias.length) return vazio;
    const outras = programadas(todas, meusDias[0], meusDias[meusDias.length - 1]).filter(o => !(eu.id && o.id === eu.id));
    const anotar = (mapa, k, info) => { if (!k) return; const xs = mapa.get(k) || []; if (!xs.some(x => x.id === info.id)) xs.push(info); mapa.set(k, xs); };
    for (const dd of meusDias) for (const o of outras) {
      if (!diasAgenda(o).includes(dd) || !mesmoTurno(eu, o, dd)) continue;
      const info = {id:String(o.id), numero:String(o.numero || ''), cliente:String(o.cliente || ''), dia:dd, outroDia:dd !== dia0, periodo:String(o.instalacao?.periodo || ''), hora:String(o.instalacao?.hora || '')};
      for (const x of equipe(o)) anotar(pessoasOc, chavePessoa(x), info);
      const carro = semCarro(o) ? '' : String(o.veiculo || '').trim();
      if (carro) anotar(veiculosOc, carro, info);
    }
    return vazio;
  }
  /* BUSCA TOLERANTE (F10). Classifica uma opção (pessoa ou equipe) para o que
     foi digitado, sobre o nome normalizado (sem acento, sem caixa):
     - 'id': o ID do RH digitado inteiro (6 dígitos). Número só acha o ID
       exato: pedaço de CPF, ou o começo do ID, não acha ninguém;
     - 'direto': o texto da opção contém o que foi digitado ("adri", "silva");
     - 'sugestao': erro de digitação ("Adrinao" -> Adriano), pela distância de
       edição de cada palavra (troca de duas letras vizinhas conta 1). A tela
       mostra só como sugestão, nunca como achado;
     - '': não acha.
     `opcao` = {id, textos: [nome, completo, apelido...]}. Devolve {tipo, dist}. */
  function distanciaEdicao(a, b) {
    const s = String(a), t = String(b), m = s.length, n = t.length;
    if (!m) return n;
    if (!n) return m;
    const d = Array.from({length:m + 1}, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      const c = s[i - 1] === t[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }
  const NENHUM = Object.freeze({tipo:'', dist:Infinity});
  function buscaTolerante(consulta, opcao = {}) {
    const q = normPessoa(consulta);
    if (!q) return {tipo:'direto', dist:0};
    const id = String(opcao && opcao.id != null ? opcao.id : '').trim();
    const idExato = t => { const dig = t.replace(/\D/g, ''); return ehIdPessoa(dig) && dig === id; };
    if (/^[\d.\-\/\s]+$/.test(q)) return idExato(q) ? {tipo:'id', dist:0} : NENHUM;
    const tokens = q.split(' ').filter(Boolean);
    const numeros = tokens.filter(t => /\d/.test(t)), letras = tokens.filter(t => !/\d/.test(t));
    if (numeros.some(t => !idExato(t))) return NENHUM;
    const textos = (Array.isArray(opcao && opcao.textos) ? opcao.textos : [opcao && opcao.textos]).map(normPessoa).filter(Boolean);
    const monte = textos.join(' ');
    if (monte.includes(letras.join(' '))) return {tipo:numeros.length ? 'id' : 'direto', dist:0};
    const palavras = [...new Set(monte.split(' ').filter(Boolean))];
    let total = 0;
    for (const t of letras) {
      const lim = t.length <= 3 ? 0 : t.length <= 5 ? 1 : 2;
      let melhor = Infinity;
      for (const w of palavras) {
        if (w.startsWith(t)) { melhor = 0; break; }
        if (!lim) continue;
        melhor = Math.min(melhor, distanciaEdicao(t, w), w.length > t.length ? distanciaEdicao(t, w.slice(0, t.length)) : Infinity);
      }
      if (melhor > lim) return NENHUM;
      total += melhor;
    }
    // Toda palavra digitada é o começo de uma palavra da opção ("ana souza" em Ana Paula Souza): achado.
    return total === 0 ? {tipo:numeros.length ? 'id' : 'direto', dist:0} : {tipo:'sugestao', dist:total};
  }
  function resumo(lista, hoje = dia(new Date())) {
    const abertas = lista.filter(o => !o.finalizadaEm && !STATUS_ENTREGA.cancelada(o));
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
    const abertas = (lista || []).filter(o => o && !o.finalizadaEm && !STATUS_ENTREGA.cancelada(o));
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
    return dia(o?.retornoEm) || (o?.horaRetorno ? (dia(o.saidaEm) || dia(o.instalacao?.data)) : '') || dia(entregaLancadaValida(o)?.data) || dia(o?.finalizadaEm);
  }
  const voltou = o => !!(o && !interno(o) && !semCarro(o) && equipe(o).length &&
    (o.retornoEm || o.horaRetorno || (dia(o.finalizadaEm) && (concluida(o) || entregaLancadaValida(o)))));
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
  /* O AGRUPAMENTO DO FECHAR O DIA (F14): a mesma chave da volta (dia + carro
     + equipe, pela pessoa), SEM exigir equipe nem retorno. O lote junta a
     baixa do ERP sem equipe e a O.S. ainda aberta do dia, que a fila da
     volta do carro deixa de fora; é no lote que a equipe entra. `diaDe(o)`
     escolhe o dia de cada O.S. (padrão: diaDaVolta); O.S. sem dia fica de
     fora. Só leitura.
     SEM CARRO E SEM EQUIPE (revisão da F14): nada liga uma O.S. à outra (o
     caso comum da baixa do ERP "a lançar"). Juntar pelo dia fazia uma volta
     falsa, com uma equipe e uma chegada para O.S. sem relação; cada uma vira
     a própria volta, e a chave leva o id. */
  function agruparPorVolta(lista, diaDe = diaDaVolta) {
    const grupos = new Map();
    for (const o of lista || []) {
      if (!o) continue;
      const d = dia(diaDe(o));
      if (!d) continue;
      const time = equipe(o);
      const pessoasDaVolta = time.map(chavePessoa).sort();
      const soltaDasOutras = !pessoasDaVolta.length && (!normal(o.veiculo) || semCarro(o));
      const chave = [d, normal(o.veiculo), soltaDasOutras ? 'os:' + String(o.id) : pessoasDaVolta.join('+')].join('|');
      const g = grupos.get(chave) || { chave, dia: d, veiculo: String(o.veiculo || '').trim(), semCarro: semCarro(o), equipe: time.map(nomePessoa), pessoas: pessoasDaVolta, os: [] };
      g.os.push(o);
      grupos.set(chave, g);
    }
    return [...grupos.values()].sort((a, b) => a.dia.localeCompare(b.dia) || a.veiculo.localeCompare(b.veiculo) || a.chave.localeCompare(b.chave));
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
  /* STATUS DA ENTREGA EM 7 ESTADOS E CANCELAMENTO (F16, 30/09/2026). O bloco
     entre as marcas é cópia byte a byte de _shared/pcp-status.mjs (o servidor
     tira a O.S. cancelada da apuração com a mesma leitura);
     tests/status-paridade.test.cjs compara o texto e os resultados. Ele usa o
     prazo combinado desta régua (F15) e o motor da entrega por item, que o
     entrega-item.js APRESENTA ao carregar (usarMotorItem): o index.html o
     carrega depois deste arquivo, e o equipe.html não o carrega (o celular
     não chama o status, e nada aqui pode depender dele). Lido na hora da
     chamada; no Node (testes), o require. Sem o motor, o status não lê as
     marcas por item (`semMotor`). */
  let motorDaEntrega = null;
  const usarMotorItem = m => { motorDaEntrega = m && typeof m.resumoOS === 'function' && typeof m.lancamentosDaOS === 'function' ? m : null; };
  const STATUS_ENTREGA = ((prazoCombinadoDe, motorItem, retornosPrevistos) => {
/* ==== STATUS DA ENTREGA: daqui até FIM DO STATUS, cópia byte a byte de _shared/pcp-status.mjs ==== */
/* O STATUS DA ENTREGA EM 7 ESTADOS (F16). Função pura: não lê tela e não
   grava nada. Precedência, do que mais pesa para o que menos pesa:
     Cancelado > Retrabalho > Retorno antecipado > Com atraso > No prazo >
     Em execução > Agendado
   O estado vem SEMPRE com o motivo, e `aplicaveis` traz todos os que valem,
   na mesma ordem: retrabalho entregue com atraso mostra Retrabalho e diz que
   também atrasou.
   - Cancelado: a baixa do ERP com status CANCELADO, ou a marca
     os.cancelamento da gestão. Cancela o saldo dos itens; o que já foi
     entregue por item fica. Item cancelado sozinho não cancela a O.S.
   - Retrabalho: a marca de retrabalho da O.S., venha de onde vier (F17: zera
     na hora; só desmarcar é da gestão). Retrabalho não se abona.
   - Retorno antecipado (F17): a chegada conferida pela gestão antes do
     retorno previsto da volta, além da tolerância da regra (retornoAntecipado,
     abaixo). O abonado aparece como "Retorno antecipado (abonado)", com o
     motivo, e não é perda.
   - Com atraso e No prazo: o prazo é o COMBINADO, congelado (F15: a primeira
     data agendada no PCP), até o último dia da duração. A data da entrega é
     a ÚLTIMA entrega por item, quando a O.S. tem marca, e senão a entrega
     lançada, a finalização ou a baixa do ERP (sem prova). A O.S. aberta com
     o prazo vencido também fica Com atraso, ainda sem entrega.
   - Em execução: a O.S. aberta com entrega parcial ("entrega parcial N de
     M"), item com problema de entrega, equipe na rua, equipe que voltou sem
     finalizar, ou no dia da agenda com equipe escalada.
   - Agendado: as outras abertas ("A agendar" quando nem data tem).
   - Entregue, SEM MEDIDA DE PRAZO (revisão da F16): a entregue que não tem
     como ser julgada fica neutra, nunca "No prazo" e nunca perda. Sem prazo
     combinado: "Entregue, sem prazo combinado". A baixa do ERP ainda sem
     lançamento, depois do corte: "Entregue (baixa do ERP a lançar)", porque a
     data da baixa é a da sincronização e a data real vem no lançamento. A
     baixa que não diz o dia da entrega (fora da carteira, antes do corte ou
     na retirada): "Entregue (baixa do ERP, sem data)".
   - ABONADO (F17): o atraso abonado (a remarcação pedida pelo cliente) vira
     "Com atraso (abonado)" e o retorno antecipado abonado, "Retorno
     antecipado (abonado)". Os dois trazem o motivo do abono, vêm depois das
     perdas que valem e antes do "No prazo", e nunca são perda.
   `hoje` é 'AAAA-MM-DD' no calendário da fábrica; sem ele, o dia de hoje em
   São Paulo. `regra` é a versão da regra do programa (F05): diz quais estados
   são perda (`perdas`) e a tolerância do retorno (toleranciaRetornoMin).
   `volta` (F17) é a lista das O.S. da mesma volta (voltaDoRetorno): o
   retorno antecipado é medido pela volta; sem ela, pela O.S. sozinha.
   NÃO muda o status de agenda (OPERACAO.status), que o Painel copia. */
const ESTADOS_ENTREGA = Object.freeze(['cancelado', 'retrabalho', 'retorno_antecipado', 'atraso', 'no_prazo', 'entregue', 'execucao', 'agendado']);
const ROTULOS_ENTREGA = Object.freeze({cancelado:'Cancelado', retrabalho:'Retrabalho', retorno_antecipado:'Retorno antecipado',
  atraso:'Com atraso', no_prazo:'No prazo', entregue:'Entregue', execucao:'Em execução', agendado:'Agendado'});
// Os rótulos do "Entregue" neutro, um por motivo de não haver medida.
const ROTULO_SEM_PRAZO_ST = 'Entregue, sem prazo combinado';
const ROTULO_A_LANCAR_ST = 'Entregue (baixa do ERP a lançar)';
const ROTULO_ERP_SEM_DATA_ST = 'Entregue (baixa do ERP, sem data)';
/* O CORTE DO LANÇAMENTO MANUAL (decisão do dono, 14/09/2026): a baixa do ERP
   anterior a este dia conta como entregue sem lançamento; a partir dele, a
   data real da entrega vem do lançamento à mão. O mesmo dia do casa.js e do
   pcp-sync (tests/cancelamento-f16.test.cjs confere). */
const CORTE_LANCAMENTO_ST = '2026-09-15';
// A perda da regra do programa (a lista PERDAS de regras.js) que cada estado mostra.
const PERDA_DO_ESTADO = Object.freeze({atraso:'atraso', retrabalho:'retrabalho', retorno_antecipado:'retornoAntecipado'});
const MOTIVO_CANCELAMENTO_MIN = 15;
const MOTIVO_CANCELAMENTO_MAX = 300;
const txtSt = v => v == null ? '' : String(v).trim();
const objSt = v => !!v && typeof v === 'object' && !Array.isArray(v);
/* O MOTIVO É TEXTO, e só contam as LETRAS E OS NÚMEROS que se veem, depois
   de normalizar em NFC (revisão da F17): quinze espaços de largura zero, o
   braille em branco, o seletor de variação e a marca combinante não dizem
   motivo nenhum, e um objeto não é motivo (revisão da F16). O preenchimento
   do Hangul é letra para o Unicode e não aparece: também não conta. A régua
   vale para o abono e para o cancelamento (F16). INVISIVEIS_ST continua
   limpando o texto que se grava. */
const INVISIVEIS_ST = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;
const LETRA_VISIVEL_ST = /[\p{L}\p{N}]/gu;
const LETRA_QUE_NAO_APARECE_ST = /[\u115f\u1160\u3164\uffa0]/g;
const letrasMotivoSt = v => typeof v === 'string' ? (v.normalize('NFC').replace(LETRA_QUE_NAO_APARECE_ST, '').match(LETRA_VISIVEL_ST) || []).length : 0;
/* O dia que existe no calendário. A resposta de cada texto é guardada
   (revisão da F17: o status de centenas de cards confere os mesmos dias
   milhares de vezes, e montar uma data a cada vez pesava). */
const DIAS_VALIDOS_ST = new Map();
function diaValidoSt(v) {
  if (typeof v !== 'string') return '';
  let r = DIAS_VALIDOS_ST.get(v);
  if (r !== undefined) return r;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) r = '';
  else { const d = new Date(v + 'T12:00:00Z'); r = Number.isFinite(+d) && d.toISOString().slice(0, 10) === v ? v : ''; }
  if (DIAS_VALIDOS_ST.size > 5000) DIAS_VALIDOS_ST.clear();
  DIAS_VALIDOS_ST.set(v, r);
  return r;
}
/* O DIA NO FUSO DE SÃO PAULO, igual no aparelho e no servidor (UTC): a
   finalização às 23h30 de 29/09 na fábrica é 02h30 de 30/09 em UTC. Horário
   sem fuso já é o da fábrica. A mesma conta do diaSP do motor da entrega por
   item. O formatador é feito uma vez só (revisão da F17: fazer um por
   chamada pesava no status de centenas de cards). */
let formatoDiaSt = null;
function diaSt(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return diaValidoSt(v);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v)) return diaValidoSt(v.slice(0, 10));
  }
  const d = v instanceof Date ? v : new Date(typeof v === 'number' ? v : String(v));
  if (!Number.isFinite(+d)) return '';
  try {
    const p = {};
    if (!formatoDiaSt) formatoDiaSt = new Intl.DateTimeFormat('en-US', {timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit'});
    for (const x of formatoDiaSt.formatToParts(d)) p[x.type] = x.value;
    return diaValidoSt(`${p.year}-${p.month}-${p.day}`);
  } catch (e) {
    // Sem a tabela de fusos: São Paulo não tem horário de verão desde 2019.
    return new Date(+d - 3 * 3600000).toISOString().slice(0, 10);
  }
}
const somarDiasSt = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const diasEntreSt = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const ddmmSt = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '';
const diasTxtSt = n => n === 1 ? '1 dia' : `${n} dias`;
const duracaoSt = o => o.tipo === 'interno' ? 1 : Math.min(366, Math.max(1, Math.floor(Number(o.instalacao && o.instalacao.duracaoDias) || 1)));
// Baixa da máquina do ERP: a mesma régua de OPERACAO.encerradaERP e do motor da entrega por item.
function encerradaNoERPSt(o) {
  if (!o || !o.finalizadaEm) return false;
  return !!((o.baixaAutoERP && o.baixaAutoERP.em === o.finalizadaEm) || /^Mubisys\b/i.test(txtSt(o.finalizadoPor)));
}
/* O CANCELAMENTO DA O.S., ou null. No ERP: a baixa automática com status
   CANCELADO (a mesma régua do canceladaNoERP do motor da entrega por item).
   À mão: a marca
   os.cancelamento que o servidor gravou ({ativo:true, motivo, por, porId,
   em}) ou o pedido que o aparelho ainda vai mandar ({cancelar:true, motivo},
   `pendente`). O desfeito ({ativo:false, desfeitoEm}), o pedido de desfazer
   e a marca sem motivo não valem (o canceladaAMao do motor, a mesma). */
function cancelamentoDe(o) {
  if (!objSt(o)) return null;
  if (encerradaNoERPSt(o) && /cancel/i.test(`${txtSt(o.baixaAutoERP && o.baixaAutoERP.status)} ${txtSt(o.finalizadoPor)}`))
    return {origem:'erp', motivo:'cancelada no ERP', por:'ERP', porId:'', em:txtSt(o.finalizadaEm), pendente:false};
  const c = o.cancelamento;
  if (!objSt(c) || !txtSt(c.motivo) || !(c.ativo === true || c.cancelar === true)) return null;
  return {origem:'manual', motivo:txtSt(c.motivo), por:txtSt(c.por), porId:txtSt(c.porId), em:txtSt(c.em), pendente:c.ativo !== true};
}
const cancelada = o => !!cancelamentoDe(o);
// O motivo do "Cancelar O.S.": '' quando serve; senão a frase, igual na tela e na porta.
function motivoCancelamentoInvalido(motivo) {
  const n = letrasMotivoSt(motivo);
  if (n < MOTIVO_CANCELAMENTO_MIN) return `Escreva o motivo do cancelamento com ${MOTIVO_CANCELAMENTO_MIN} letras ou mais.`;
  if (n > MOTIVO_CANCELAMENTO_MAX) return `O motivo do cancelamento vai até ${MOTIVO_CANCELAMENTO_MAX} letras.`;
  return '';
}
/* O PRAZO DA ENTREGA: o combinado (F15, congelado) é o primeiro dia, e a O.S.
   de vários dias tem até o último dia da duração. A duração é a CONGELADA
   junto com a data (prazoCombinado.dias, revisão da F16): mudar a duração
   depois não move o prazo. O carimbo antigo, sem os dias, e o prazo lido do
   histórico usam a duração de agora. Cliente retira: o próprio dia. Sem
   prazo combinado: null, e não há atraso a medir. */
function diasCongeladosSt(o, pc) {
  const d = pc && !pc.derivado && objSt(o.prazoCombinado) ? o.prazoCombinado.dias : undefined;
  return typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 366 ? d : 0;
}
function prazoDaEntrega(o) {
  if (!objSt(o)) return null;
  const pc = prazoCombinadoDe(o);
  const inicio = pc ? diaValidoSt(txtSt(pc.data)) : '';
  if (!inicio) return null;
  const dias = o.tipo === 'interno' ? 1 : diasCongeladosSt(o, pc) || duracaoSt(o);
  return {inicio, fim:somarDiasSt(inicio, dias - 1), dias, fonte:txtSt(pc.fonte)};
}
const prazoTxtSt = p => p.dias > 1 ? `${ddmmSt(p.inicio)} a ${ddmmSt(p.fim)}` : ddmmSt(p.fim);
// Os dias da agenda de agora (a data da instalação e a duração); cliente retira não tem.
function diasAgendaSt(o) {
  const d = o.tipo === 'interno' ? '' : diaValidoSt(txtSt(o.instalacao && o.instalacao.data).slice(0, 10));
  return d ? Array.from({length:duracaoSt(o)}, (_, i) => somarDiasSt(d, i)) : [];
}
/* O ERP DISSE ENTREGUE? A mesma régua do erpDisseEntregue do motor da
   entrega por item: a baixa da conciliação da carteira ("fora da carteira")
   e a de CONCLUIDO ou FINALIZADO não dizem o dia da entrega. */
function erpDisseEntregueSt(o) {
  if (!encerradaNoERPSt(o)) return false;
  const b = objSt(o.baixaAutoERP) && o.baixaAutoERP.em === o.finalizadaEm ? o.baixaAutoERP : null;
  if (b && b.carteira) return false;
  const m = /\(baixa autom[aá]tica\s*\S\s*([^)]*)\)\s*$/i.exec(txtSt(o.finalizadoPor));
  const status = b && txtSt(b.status) ? txtSt(b.status) : m ? m[1] : '';
  return txtSt(status).normalize('NFD').replace(/\p{M}/gu, '').toUpperCase() === 'ENTREGUE';
}
/* A ENTREGA DA O.S.: {dia, fonte, semProva} ou null (não entregue).
   Com marca por item: a ÚLTIMA entrega por item, marcada ou implícita,
   quando nenhum item físico ficou a entregar, ou quando a O.S. foi encerrada
   no PCP. Sem marca: a entrega lançada à mão, a finalização no PCP ou a
   baixa do ERP (sem prova). Cancelada: só o que já foi entregue por item.
   A BAIXA DO ERP SEM LANÇAMENTO (revisão da F16) tem a data da
   sincronização, não a da entrega. Depois do corte, a O.S. externa espera o
   lançamento à mão: fica "a lançar", entregue e sem dia ({dia:''}), e o
   prazo não é julgado. Nos outros casos a baixa só dá o dia quando o ERP
   disse ENTREGUE, a régua da entrega implícita do motor ("fora da carteira"
   não conta como entrega no dia da baixa). Com marca por item, vale a última
   marca quando todo item físico foi por marca; o implícito dessa baixa não. */
function entregaDaOS(o, M, r, canc) {
  const fim = o.finalizadaEm ? diaSt(o.finalizadaEm) : '';
  const erp = encerradaNoERPSt(o);
  const l = o.entregaLancada;
  const lancada = diaSt(l && typeof l === 'object' ? l.data : l);
  const aLancar = erp && !lancada && !!fim && o.tipo !== 'interno' && fim >= CORTE_LANCAMENTO_ST;
  const semDia = aLancar ? {dia:'', fonte:'aLancar', semProva:true}
    : erp && !lancada && !erpDisseEntregueSt(o) ? {dia:'', fonte:'erpSemData', semProva:true} : null;
  if (r && r.marcas > 0) {
    const L = M.lancamentosDaOS(o);
    const linhas = L.lancamentos.filter(x => x.tipo !== 'servico' && diaValidoSt(x.dia));
    const ultimo = linhas.reduce((m, x) => x.dia > m ? x.dia : m, '');
    const semProva = linhas.some(x => x.marca === 'sem prova');
    if (canc) return ultimo ? {dia:ultimo, fonte:'itens', semProva} : null;
    const pendente = r.aEntregar + r.parciais + r.problema > 0;
    if (fim && semDia) return !pendente && !semProva && ultimo ? {dia:ultimo, fonte:'itens', semProva:false} : semDia;
    if (fim) return pendente ? {dia:fim > ultimo ? fim : ultimo, fonte:'itens', semProva:semProva || erp} : {dia:ultimo || fim, fonte:'itens', semProva};
    return !pendente && ultimo ? {dia:ultimo, fonte:'itens', semProva} : null;
  }
  if (canc || !fim) return null;
  if (lancada) return {dia:lancada, fonte:'lancada', semProva:false};
  if (semDia) return semDia;
  return erp ? {dia:fim, fonte:'erp', semProva:true} : {dia:fim, fonte:'finalizada', semProva:false};
}
const FONTE_TXT_ST = Object.freeze({itens:'última entrega por item', lancada:'lançada à mão', finalizada:'finalizada no PCP', erp:'baixa do ERP, sem prova'});
/* A ENTREGA PARCIAL da O.S. aberta, a mesma conta do selo do card (E4): itens
   entregues de itens que valem (o cancelado não conta), ou unidades quando é
   um item só ("6 de 10"). Parte entregue só de item cancelado depois não é
   entrega parcial. Item com problema entra no motivo. */
function parcialDe(o, M, r) {
  if (!r || !r.marcas || o.finalizadaEm) return null;
  const itens = (Array.isArray(o.itens) ? o.itens : []).filter(it => objSt(it) && !M.ehServico(it));
  const vivos = itens.map(it => ({it, s:M.situacaoItem(it, o)})).filter(x => x.s.situacao !== 'cancelado');
  const unidades = vivos.reduce((t, x) => t + (x.s.entregue || 0), 0);
  const total = r.itensTotal - r.cancelados;
  const partes = [];
  if (r.situacao === 'parcial' && unidades > 0) {
    if (total === 1 && vivos.length === 1) partes.push(`entrega parcial ${vivos[0].s.entregue} de ${vivos[0].s.qtde}`);
    else partes.push(`entrega parcial ${r.entregues} de ${total}${r.parciais ? ` (${r.parciais} ${r.parciais === 1 ? 'item' : 'itens'} em parte)` : ''}`);
  }
  if (r.problema) partes.push(`${r.problema} ${r.problema === 1 ? 'item' : 'itens'} com problema de entrega`);
  return partes.length ? {entregues:r.entregues, total, parciais:r.parciais, problema:r.problema, unidades, texto:partes.join('; ')} : null;
}
function motivoExecucaoSt(o, hoje, parcial, prazo) {
  const partes = [];
  if (parcial) partes.push(parcial.texto);
  if ((o.horaSaida || o.saidaEm) && !(o.horaRetorno || o.retornoEm)) partes.push('saída registrada, sem retorno');
  else if (o.horaRetorno || o.retornoEm) partes.push('a equipe voltou; falta finalizar');
  // O dia da agenda só é execução com gente escalada: a data sozinha não põe ninguém na rua.
  else if (prazo && diasAgendaSt(o).includes(hoje) && (Array.isArray(o.equipe) ? o.equipe : []).some(x => txtSt(x))) partes.push('no dia da agenda');
  return partes.join('; ');
}
function motivoAgendadoSt(o, prazo) {
  const interno = o.tipo === 'interno';
  if (!prazo) {
    const prev = diaSt(o.previsaoEntrega);
    return (interno ? 'sem data de retirada' : 'sem data na agenda do PCP') + (prev ? ` (previsão do ERP ${ddmmSt(prev)})` : '');
  }
  const atual = interno ? diaValidoSt(txtSt(o.instalacao && o.instalacao.data).slice(0, 10)) : diasAgendaSt(o)[0] || '';
  if (!atual) return `sem data na agenda agora (prazo combinado ${prazoTxtSt(prazo)})`;
  const quando = atual !== prazo.inicio ? `${ddmmSt(atual)} (prazo combinado ${prazoTxtSt(prazo)})` : prazoTxtSt(prazo);
  return (interno ? 'retirada marcada para ' : 'agendada para ') + quando;
}
/* OCORRÊNCIAS, RETORNO ANTECIPADO E ABONOS (F17). Toda perda aponta para uma
   ocorrência com id. As DERIVADAS são lidas da O.S., sem gravar nada, e têm
   o id 'osId:tipo' (o mesmo em toda apuração); o retorno antecipado é um por
   dia da jornada, 'osId:retorno_antecipado:AAAA-MM-DD' (revisão da F17: a
   O.S. de vários dias tem uma volta por dia, e a chegada do segundo dia não
   apaga a perda do primeiro):
     atraso              o prazo combinado vencido (a entregue e a aberta)
     retrabalho          a marca de retrabalho, venha de onde vier
     retorno_antecipado  a chegada conferida pela gestão antes do retorno
                         previsto da volta, além da tolerância da regra
     carro, avaria, equipamentos
                         a conferência da volta da gestão (retornoConf):
                         carro sujo ou desarrumado, avaria nova, equipamentos
                         que não voltaram completos. São o bônus e o redutor
                         da volta (F19), não perda da O.S. (`volta: true`).
   As MANUAIS (equipamento faltante ou danificado, outra) moram em
   os.ocorrencias, com id próprio ('oc-...'): detalham o item e não descontam
   de novo (o redutor de equipamento é um só, o da conferência). Só
   acréscimo; anular é novo carimbo.
   O ABONO ({id, ocorrenciaId, motivo, autor, medida}) vale para o atraso (a
   remarcação pedida pelo cliente, decisão do dono) e para o retorno
   antecipado. Retrabalho não se abona. Revogar é novo carimbo (revogadoEm,
   revogadoPor), nunca apagar. O pedido que o aparelho ainda vai mandar
   ({pedido: true}, {revogar: true}, {anular: true}) já vale na tela, marcado
   "a enviar"; quem carimba autor e hora é o servidor.
   O ABONO FICA PRESO À MEDIDA QUE ABONOU (revisão da F17): no retorno, o dia,
   a chegada e o previsto; no atraso, o prazo e a data da entrega (o abono
   dado antes da entrega, com a data vazia, vale para a entrega que vier,
   desde que o prazo seja o mesmo: é a remarcação pedida pelo cliente). Se a
   medida mudou (a chegada foi corrigida, o prazo foi corrigido, a entrega
   mudou de dia), o abono não vale: aparece como "abono de outra medida" e
   um abono novo é aceito. Nada é revogado sozinho.
   O RETORNO ANTECIPADO é medido PELA VOLTA (recomendação do plano): o
   retorno previsto mais tarde das O.S. da volta naquele dia (o da última O.S.
   do carro) contra a chegada conferida pela gestão (chegadasConferidas: dia
   da jornada, hora e o dia em que o carro chegou, no calendário da fábrica,
   sem fuso; o recebidoEm em UTC não entra na conta). A conta é entre
   INSTANTES (dia e hora): a chegada às 00:40 do dia seguinte é 70 minutos
   DEPOIS do previsto das 23:30, nunca 22 h 50 antes. A hora que a equipe
   anotou (horaRetorno) é só declaração e nunca decide. Chegar até
   `toleranciaRetornoMin` minutos antes não conta. A perda cai só na O.S. do
   último retorno previsto (regra.retornoNaVolta 'ultima', o padrão: a volta
   é uma só, e zerar as três O.S. puniria quem faz três serviços na mesma
   saída) ou em todas ('todas'). A O.S. cancelada e a retirada no balcão não
   são da volta: a cancelada era a "última" e levava a perda embora (revisão
   da F17). Sem retorno previsto digitado não há perda (decisão do dono); sem
   chegada conferida, "sem dado". */
const TIPOS_OCORRENCIA = Object.freeze(['atraso', 'retrabalho', 'retorno_antecipado', 'carro', 'avaria', 'equipamentos', 'equipamento_faltante', 'equipamento_danificado', 'outra']);
const TIPOS_OCORRENCIA_MANUAL = Object.freeze(['equipamento_faltante', 'equipamento_danificado', 'outra']);
const ROTULOS_OCORRENCIA = Object.freeze({atraso:'Entrega com atraso', retrabalho:'Retrabalho', retorno_antecipado:'Retorno antecipado',
  carro:'Carro sujo ou desarrumado', avaria:'Avaria nova no carro', equipamentos:'Equipamentos com falta na volta',
  equipamento_faltante:'Equipamento faltante', equipamento_danificado:'Equipamento danificado', outra:'Outra ocorrência'});
// Só estas se abonam: retrabalho não se abona, e o que a conferência da volta diz se corrige na conferência.
const OCORRENCIAS_ABONAVEIS = Object.freeze(['atraso', 'retorno_antecipado']);
// A perda da regra do programa (a lista PERDAS de regras.js) que cada ocorrência derivada aplica.
const PERDA_DA_OCORRENCIA = Object.freeze({atraso:'atraso', retrabalho:'retrabalho', retorno_antecipado:'retornoAntecipado'});
const MOTIVO_ABONO_MIN = 15;
const MOTIVO_ABONO_MAX = 300;
// A tolerância da regra embutida (F05); a regra vigente manda quando vem.
const TOLERANCIA_RETORNO_PADRAO = 15;
const RETORNO_NA_VOLTA_PADRAO = 'ultima';
const HORA_ST = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutosSt = h => HORA_ST.test(h) ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) : NaN;
// O instante (dia e hora da fábrica, sem fuso) em minutos: a conta da chegada contra o previsto.
const instanteSt = (dia, hora) => Date.parse(dia + 'T00:00:00Z') / 60000 + minutosSt(hora);
const minTxtSt = n => n === 1 ? '1 minuto' : n < 60 ? `${n} minutos` : `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ''}`;
const cortarSt = (v, n) => Array.from(txtSt(v)).slice(0, n).join('');
// O motivo do abono: '' quando serve; senão a frase, igual na tela e na porta (contado só pelas letras que se veem, como o do cancelamento).
function motivoAbonoInvalido(motivo) {
  const n = letrasMotivoSt(motivo);
  if (n < MOTIVO_ABONO_MIN) return `Escreva o motivo do abono com ${MOTIVO_ABONO_MIN} letras ou mais.`;
  if (n > MOTIVO_ABONO_MAX) return `O motivo do abono vai até ${MOTIVO_ABONO_MAX} letras.`;
  return '';
}
const toleranciaRetorno = regra => { const t = objSt(regra) ? regra.toleranciaRetornoMin : undefined; return Number.isInteger(t) && t >= 0 && t <= 240 ? t : TOLERANCIA_RETORNO_PADRAO; };
const retornoNaVolta = regra => objSt(regra) && (regra.retornoNaVolta === 'todas' || regra.retornoNaVolta === 'ultima') ? regra.retornoNaVolta : RETORNO_NA_VOLTA_PADRAO;
/* AS CHEGADAS CONFERIDAS PELA GESTÃO, uma por dia da jornada (revisão da
   F17): a lista chegadasConferidas ({dia, hora, diaChegada, por, porId, em})
   e, no dia que ela ainda não tem, o retornoConferido (a aba v142 e o que foi
   gravado antes da lista só têm ele). `dia` é o dia da jornada, o da volta,
   onde está o retorno previsto; `diaChegada` é o dia em que o carro chegou:
   o mesmo, ou o seguinte quando a volta passou da meia-noite. Em ordem de
   dia; o mesmo dia repetido na lista fica com o último. O pedido de tirar a
   chegada de um dia ({dia, limpar: true}, o Desfazer do lote) já vale na
   tela, antes de o servidor responder. */
function chegadaSt(c) {
  if (!objSt(c)) return null;
  const dia = diaValidoSt(txtSt(c.dia)), hora = HORA_ST.test(txtSt(c.hora)) ? txtSt(c.hora) : '';
  if (!dia || !hora) return null;
  const dc = diaValidoSt(txtSt(c.diaChegada));
  return {dia, hora, diaChegada:dc && dc === somarDiasSt(dia, 1) ? dc : dia, por:txtSt(c.por)};
}
function chegadasConferidas(o) {
  if (!objSt(o)) return [];
  const porDia = new Map(), tiradas = new Set();
  for (const c of Array.isArray(o.chegadasConferidas) ? o.chegadasConferidas : []) {
    if (objSt(c) && c.limpar === true) { const d = diaValidoSt(txtSt(c.dia)); if (d) { porDia.delete(d); tiradas.add(d); } continue; }
    const x = chegadaSt(c);
    if (x) { porDia.set(x.dia, x); tiradas.delete(x.dia); }
  }
  const rc = chegadaSt(o.retornoConferido);
  if (rc && !porDia.has(rc.dia) && !tiradas.has(rc.dia)) porDia.set(rc.dia, rc);
  return [...porDia.values()].sort((a, b) => a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0);
}
// A chegada conferida de um dia da jornada, ou null.
const chegadaDoDia = (o, dia) => chegadasConferidas(o).find(c => c.dia === dia) || null;
// A última chegada conferida (a do último dia da jornada), ou null.
function chegadaConferida(o) {
  const cs = chegadasConferidas(o);
  return cs.length ? cs[cs.length - 1] : null;
}
/* A CHEGADA QUE PARECE DO DIA SEGUINTE (revisão da F17): a hora digitada
   antes da saída prevista, ou mais de 12 h antes do retorno previsto, é a
   volta que passou da meia-noite. A tela pergunta "chegou no dia seguinte?";
   quem decide é a gestão. */
function pareceDiaSeguinte(hora, previsto, saida) {
  const h = minutosSt(txtSt(hora));
  if (!Number.isFinite(h)) return false;
  const s = minutosSt(txtSt(saida)), p = minutosSt(txtSt(previsto));
  return (Number.isFinite(s) && h < s) || (Number.isFinite(p) && p - h > 12 * 60);
}
/* OS ABONOS da O.S., na ordem gravada: o carimbado pelo servidor (com `em`)
   e o pedido que ainda vai (pedido: true, com motivo que serve). */
const CAMPOS_MEDIDA_ST = ['dia', 'chegada', 'previsto', 'prazo', 'entrega'];
function medidaSt(m) {
  if (!objSt(m)) return null;
  const out = {};
  for (const k of CAMPOS_MEDIDA_ST) if (Object.prototype.hasOwnProperty.call(m, k)) out[k] = txtSt(m[k]);
  return Object.keys(out).length ? out : null;
}
function abonosDe(o) {
  const out = [];
  for (const a of objSt(o) && Array.isArray(o.abonos) ? o.abonos : []) {
    if (!objSt(a)) continue;
    const id = txtSt(a.id), ocorrenciaId = txtSt(a.ocorrenciaId), pendente = a.pedido === true && !txtSt(a.em);
    if (!id || !ocorrenciaId || (pendente ? !!motivoAbonoInvalido(a.motivo) : !txtSt(a.em))) continue;
    const revogadoEm = txtSt(a.revogadoEm);
    out.push({id, ocorrenciaId, motivo:cortarSt(a.motivo, MOTIVO_ABONO_MAX), por:txtSt(a.por), em:txtSt(a.em), pendente, medida:medidaSt(a.medida),
      revogado:!!revogadoEm || a.revogar === true, revogadoEm, revogadoPor:txtSt(a.revogadoPor), revogacaoPendente:a.revogar === true && !revogadoEm});
  }
  return out;
}
// A medida do abono é a de agora? No atraso, o abono dado antes da entrega (entrega vazia) vale para a entrega que vier.
function mesmaMedidaSt(a, atual) {
  if (!a || !atual) return false;
  if (Object.prototype.hasOwnProperty.call(atual, 'chegada')) return a.dia === atual.dia && a.chegada === atual.chegada && a.previsto === atual.previsto;
  return a.prazo === atual.prazo && (a.entrega === atual.entrega || a.entrega === '');
}
/* O ABONO DA OCORRÊNCIA: o último não revogado da MESMA medida (`vigente`)
   e, quando nenhum vale, o último não revogado de outra medida (`outra`, que
   só se mostra). O pedido que ainda vai sem medida é sobre a medida de agora
   (o servidor carimba a dele). */
function abonoDaOcorrencia(o, ocorrenciaId, medida) {
  let vigente = null, outra = null;
  for (const a of abonosDe(o)) {
    if (a.ocorrenciaId !== ocorrenciaId || a.revogado) continue;
    if (a.medida ? mesmaMedidaSt(a.medida, medida) : a.pendente) vigente = a;
    else outra = a;
  }
  return {vigente, outra:vigente ? null : outra};
}
const abonoVigente = (o, ocorrenciaId, medida) => abonoDaOcorrencia(o, ocorrenciaId, medida).vigente;
// "abono de outra medida (05/10 14:00)": o que ele abonou, para quem lê saber que não vale mais.
function medidaTxtSt(m) {
  if (!m) return '';
  if (m.chegada) return `${ddmmSt(m.chegada.slice(0, 10))} ${m.chegada.slice(11, 16)}`;
  return [m.prazo ? 'prazo ' + ddmmSt(m.prazo) : '', m.entrega ? 'entrega ' + ddmmSt(m.entrega) : 'antes da entrega'].filter(Boolean).join(', ');
}
const comOutraSt = (motivo, outra) => outra ? `${motivo}; o abono de outra medida (${medidaTxtSt(outra.medida)}) não vale para esta` : motivo;
/* AS OCORRÊNCIAS MANUAIS (os.ocorrencias): as gravadas e os pedidos que
   ainda vão. A anulada fica na lista, marcada. */
function ocorrenciasManuais(o) {
  const out = [];
  for (const x of objSt(o) && Array.isArray(o.ocorrencias) ? o.ocorrencias : []) {
    if (!objSt(x) || !TIPOS_OCORRENCIA_MANUAL.includes(x.tipo)) continue;
    const id = txtSt(x.id), pendente = x.pedido === true && !txtSt(x.em);
    if (!id || (!pendente && !txtSt(x.em))) continue;
    const an = objSt(x.anulada) && txtSt(x.anulada.em) ? x.anulada : null;
    const item = cortarSt(x.item, 120), obs = cortarSt(x.obs, 300);
    out.push({id, tipo:x.tipo, rotulo:ROTULOS_OCORRENCIA[x.tipo], origem:'manual', perda:'', volta:false, abonavel:false, abonado:false, abono:null, conta:false,
      motivo:[item, obs].filter(Boolean).join(': ') || ROTULOS_OCORRENCIA[x.tipo].toLowerCase(), item, obs, fonte:txtSt(x.fonte), grupo:txtSt(x.grupo),
      dia:diaValidoSt(txtSt(x.dia)), por:txtSt(x.por), em:txtSt(x.em), pendente,
      anulada:!!an || x.anular === true, anulacaoPendente:x.anular === true && !an, anuladaPor:an ? txtSt(an.por) : '', anuladaEm:an ? txtSt(an.em) : ''});
  }
  return out;
}
/* AS O.S. DA MESMA VOLTA do retorno: uma chegada conferida no mesmo dia da
   jornada, o mesmo carro e a mesma equipe, como o lote as juntou. `chave` lê
   a pessoa (no aparelho, OPERACAO.chavePessoa; sem ela, o texto da equipe).
   Sem carro e sem equipe nada liga uma O.S. à outra: a volta é ela sozinha.
   A retirada no balcão não tem volta, e a O.S. cancelada sai da volta. */
const carroSt = x => txtSt(x.veiculo).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const chaveVoltaSt = (x, pessoa) => carroSt(x) + '|' + (Array.isArray(x.equipe) ? x.equipe : []).map(p => txtSt(pessoa(p))).filter(Boolean).sort().join('+');
const foraDaVoltaSt = x => !objSt(x) || x.tipo === 'interno' || !!cancelamentoDe(x);
function voltaDoRetorno(o, lista, chave) {
  if (!objSt(o)) return [];
  const dias = new Set(chegadasConferidas(o).map(c => c.dia));
  if (!dias.size || o.tipo === 'interno') return [o];
  const pessoa = typeof chave === 'function' ? chave : txtSt;
  const k = chaveVoltaSt(o, pessoa);
  if (k === '|') return [o];
  const out = [o], vistos = new Set([txtSt(o.id)]);
  for (const x of Array.isArray(lista) ? lista : []) {
    if (foraDaVoltaSt(x) || vistos.has(txtSt(x.id))) continue;
    if (!chegadasConferidas(x).some(c => dias.has(c.dia)) || chaveVoltaSt(x, pessoa) !== k) continue;
    vistos.add(txtSt(x.id));
    out.push(x);
  }
  return out;
}
/* O ÍNDICE DAS VOLTAS (revisão da F17): a mesma conta do voltaDoRetorno,
   feita uma vez para a lista inteira. A tela pergunta pela volta de centenas
   de cards de uma vez, e procurar em toda a lista a cada card era O(N²).
   voltaNoIndice(o, indiceDasVoltas(lista, chave)) dá as mesmas O.S. que
   voltaDoRetorno(o, lista, chave). */
function indiceDasVoltas(lista, chave) {
  const pessoa = typeof chave === 'function' ? chave : txtSt, ind = new Map();
  for (const x of Array.isArray(lista) ? lista : []) {
    if (foraDaVoltaSt(x)) continue;
    const cs = chegadasConferidas(x);
    if (!cs.length) continue;
    const k = chaveVoltaSt(x, pessoa);
    if (k === '|') continue;
    for (const c of cs) { const l = ind.get(c.dia + '|' + k); if (l) l.push(x); else ind.set(c.dia + '|' + k, [x]); }
  }
  return {pessoa, ind};
}
function voltaNoIndice(o, indice) {
  if (!objSt(o)) return [];
  const cs = chegadasConferidas(o);
  if (!cs.length || o.tipo === 'interno' || !objSt(indice) || !(indice.ind instanceof Map)) return [o];
  const k = chaveVoltaSt(o, typeof indice.pessoa === 'function' ? indice.pessoa : txtSt);
  if (k === '|') return [o];
  const out = [o], vistos = new Set([txtSt(o.id)]);
  for (const c of cs) for (const x of indice.ind.get(c.dia + '|' + k) || []) {
    if (vistos.has(txtSt(x.id))) continue;
    vistos.add(txtSt(x.id));
    out.push(x);
  }
  return out;
}
/* O RETORNO ANTECIPADO da O.S.: {situacao, conta, abonado, motivo, ...,
   dias}. `dias` traz a medida de cada dia da jornada com chegada conferida;
   o resto é o resumo: o dia que conta como perda, senão o abonado, senão o
   da volta, senão o no horário. situacao: 'antecipado' (conta como perda),
   'abonado', 'no horário', 'na volta' (a volta chegou antes, e a perda fica
   na O.S. do último retorno previsto), 'sem retorno previsto' (sem perda),
   'sem dado' (a gestão ainda não conferiu a chegada) ou 'não se aplica'
   (retirada no balcão). */
const PRIORIDADE_RETORNO_ST = ['antecipado', 'abonado', 'na volta', 'no horário', 'sem retorno previsto'];
function retornoDoDiaSt(os, c, outras, r, varios, decl) {
  const id = txtSt(os.id), membros = [os];
  for (const x of outras) if (chegadaDoDia(x, c.dia)) membros.push(x);
  let ultima = null, previsto = '';
  for (const x of membros) {
    const e = retornosPrevistos(x).find(p => p.dia === c.dia);
    if (e && (!ultima || e.hora > previsto || (e.hora === previsto && txtSt(x.id) > txtSt(ultima.id)))) { ultima = x; previsto = e.hora; }
  }
  const n = membros.length, pre = varios ? `${ddmmSt(c.dia)}: ` : '';
  const quando = c.diaChegada !== c.dia ? `${c.hora} de ${ddmmSt(c.diaChegada)}` : c.hora;
  const base = {...r, dia:c.dia, diaChegada:c.diaChegada, chegada:c.hora, osDaVolta:n, medida:n > 1 ? 'volta' : 'os'};
  if (!ultima) return {...base, situacao:'sem retorno previsto', motivo:`${pre}chegada conferida às ${c.hora} de ${ddmmSt(c.diaChegada)}, sem retorno previsto digitado para o dia: não há perda`};
  const prevTxt = n > 1 ? `retorno previsto da volta (${previsto}, ${n} O.S.)` : `retorno previsto (${previsto})`;
  const antes = instanteSt(c.dia, previsto) - instanteSt(c.diaChegada, c.hora);
  const ocorrenciaId = id + ':retorno_antecipado:' + c.dia;
  const medidaAbono = {dia:c.dia, chegada:c.diaChegada + 'T' + c.hora, previsto:c.dia + 'T' + previsto};
  const comPrev = {...base, previsto, ultimaId:txtSt(ultima.id), minutos:Math.max(0, antes), ocorrenciaId:'', medidaAbono};
  if (antes <= 0) return {...comPrev, situacao:'no horário', motivo:`${pre}chegou às ${quando}, ${antes < 0 ? `${minTxtSt(-antes)} depois do` : 'no'} ${prevTxt}`};
  if (antes <= r.tolerancia) return {...comPrev, situacao:'no horário', motivo:`${pre}chegou às ${quando}, ${minTxtSt(antes)} antes do ${prevTxt}, dentro da tolerância de ${minTxtSt(r.tolerancia)}`};
  const como = `${pre}chegou às ${quando}, ${minTxtSt(antes)} antes do ${prevTxt}, além da tolerância de ${minTxtSt(r.tolerancia)}`;
  if (r.modo === 'ultima' && txtSt(ultima.id) !== id) return {...comPrev, situacao:'na volta', motivo:`${pre}a volta ${como.slice(pre.length)}: a perda fica na O.S. ${txtSt(ultima.numero) || txtSt(ultima.id)}, a do último retorno previsto`};
  const ab = abonoDaOcorrencia(os, ocorrenciaId, medidaAbono);
  if (ab.vigente) return {...comPrev, situacao:'abonado', abonado:true, abono:ab.vigente, ocorrenciaId, medicao:como, motivo:comAbonoSt(como, ab.vigente)};
  return {...comPrev, situacao:'antecipado', conta:true, ocorrenciaId, abonoOutraMedida:ab.outra, medicao:como, motivo:comOutraSt(como + decl, ab.outra)};
}
function retornoAntecipado(o, regra, volta) {
  const os = objSt(o) ? o : {};
  const tolerancia = toleranciaRetorno(regra), modo = retornoNaVolta(regra);
  const declarada = HORA_ST.test(txtSt(os.horaRetorno)) ? txtSt(os.horaRetorno) : '';
  const r = {situacao:'sem dado', conta:false, abonado:false, abono:null, abonoOutraMedida:null, ocorrenciaId:'', dia:'', diaChegada:'', previsto:'', chegada:'', minutos:0,
    tolerancia, medida:'volta', modo, osDaVolta:1, ultimaId:'', declarada, medicao:'', medidaAbono:null, motivo:'', dias:[]};
  const decl = declarada ? `; a equipe anotou ${declarada}, que é só declaração` : '';
  if (os.tipo === 'interno') return {...r, situacao:'não se aplica', motivo:'retirada no balcão: não há volta do carro'};
  const cs = chegadasConferidas(os);
  if (!cs.length) {
    const semPrev = !retornosPrevistos(os).length;
    return {...r, situacao:semPrev ? 'sem retorno previsto' : 'sem dado',
      motivo:(semPrev ? 'sem retorno previsto digitado: não há perda por retorno antecipado' : 'a chegada do carro ainda não foi conferida pela gestão') + decl};
  }
  // As outras O.S. da volta, uma vez cada, sem a cancelada e sem a retirada; a própria entra como está (o rascunho da ficha).
  const outras = [], vistos = new Set([txtSt(os.id)]);
  for (const x of Array.isArray(volta) ? volta : []) {
    if (foraDaVoltaSt(x) || vistos.has(txtSt(x.id))) continue;
    vistos.add(txtSt(x.id));
    outras.push(x);
  }
  const dias = cs.map(c => retornoDoDiaSt(os, c, outras, r, cs.length > 1, decl));
  let resumo = dias[0];
  for (const d of dias) if (PRIORIDADE_RETORNO_ST.indexOf(d.situacao) < PRIORIDADE_RETORNO_ST.indexOf(resumo.situacao)) resumo = d;
  return {...resumo, dias};
}
/* A CONTA DA ENTREGA, uma vez só para o status e para as ocorrências: o
   cancelamento, o prazo, a entrega e o atraso (a entregue depois do prazo, ou
   a aberta com o prazo vencido). A medida do atraso (o prazo e a data da
   entrega) é a que o abono guarda. */
function apurarSt(os, hoje) {
  const dHoje = diaValidoSt(txtSt(hoje)) || diaSt(Date.now());
  const M = motorItem();
  const temMarca = (Array.isArray(os.itens) ? os.itens : []).some(it => objSt(it) && Array.isArray(it.entregas) && it.entregas.length > 0);
  const r = M && temMarca ? M.resumoOS(os) : null;
  const canc = cancelamentoDe(os);
  const prazo = prazoDaEntrega(os);
  const entrega = entregaDaOS(os, M, r, canc);
  let atraso = null;
  if (!canc && entrega && entrega.dia && prazo && entrega.dia > prazo.fim) {
    const dias = diasEntreSt(prazo.fim, entrega.dia);
    const como = `${os.tipo === 'interno' ? 'retirada' : 'entregue'} em ${ddmmSt(entrega.dia)} (${FONTE_TXT_ST[entrega.fonte]})`;
    atraso = {dias, entregue:true, medida:{prazo:prazo.fim, entrega:entrega.dia}, motivo:`${como}, ${diasTxtSt(dias)} depois do prazo (${prazoTxtSt(prazo)})`};
  } else if (!canc && !entrega && prazo && dHoje > prazo.fim) {
    const dias = diasEntreSt(prazo.fim, dHoje);
    atraso = {dias, entregue:false, medida:{prazo:prazo.fim, entrega:''}, motivo:`prazo (${prazoTxtSt(prazo)}) vencido há ${diasTxtSt(dias)}, sem entrega registrada`};
  }
  return {dHoje, M, temMarca, r, canc, prazo, entrega, atraso};
}
const motivoRetrabalhoSt = os => {
  const prob = Array.from(txtSt(os.problema)).slice(0, 120).join('');
  return `retrabalho marcado${prob ? ': ' + prob : ''}${diaSt(os.dataResolvido) ? ` (resolvido em ${ddmmSt(diaSt(os.dataResolvido))})` : ''}`;
};
const comAbonoSt = (motivo, ab) => ab ? `${motivo}; abonado${ab.por ? ' por ' + ab.por : ''}: ${ab.motivo}${ab.pendente ? ' (a enviar)' : ''}` : motivo;
/* As derivadas, com a apuração e o retorno já feitos. `conta` diz se a
   ocorrência é uma perda que vale agora pela regra (a mesma conta das
   `perdas` do status): o abonado não conta, o atraso da aberta ainda não, e
   sem regra (antes do programa) nada conta. */
function derivadasDe(os, ap, ret, regra) {
  const id = txtSt(os.id), out = [];
  const perdasRegra = objSt(regra) && Array.isArray(regra.perdas) ? regra.perdas : [];
  const poe = (tipo, motivo, extra, medida, idDela) => {
    const ocorrenciaId = idDela || id + ':' + tipo, abonavel = OCORRENCIAS_ABONAVEIS.includes(tipo), perda = PERDA_DA_OCORRENCIA[tipo] || '';
    const ab = abonavel ? abonoDaOcorrencia(os, ocorrenciaId, medida) : {vigente:null, outra:null};
    const x = {id:ocorrenciaId, tipo, rotulo:ROTULOS_OCORRENCIA[tipo], origem:'derivada', perda, volta:false,
      abonavel, abonado:!!ab.vigente, abono:ab.vigente, abonoOutraMedida:ab.outra, medida:medida || null, motivo:comOutraSt(comAbonoSt(motivo, ab.vigente), ab.outra), ...extra};
    x.conta = !!perda && !x.volta && !x.abonado && perdasRegra.includes(perda) && (tipo !== 'atraso' || x.entregue === true);
    out.push(x);
  };
  if (ap.atraso) poe('atraso', ap.atraso.motivo, {entregue:ap.atraso.entregue, dias:ap.atraso.dias}, ap.atraso.medida);
  if (os.retrabalho) poe('retrabalho', motivoRetrabalhoSt(os), {});
  if (!ap.canc) for (const d of ret.dias) if (d.situacao === 'antecipado' || d.situacao === 'abonado') poe('retorno_antecipado', d.medicao, {minutos:d.minutos, dia:d.dia}, d.medidaAbono, d.ocorrenciaId);
  const rc = os.tipo !== 'interno' && objSt(os.retornoConf) ? os.retornoConf : null;
  const nao = k => !!rc && (rc[k] === 'nao' || rc[k] === false);
  const quem = rc && txtSt(rc.por) ? ` (conferida por ${txtSt(rc.por)})` : '';
  const obs = rc && txtSt(rc.obs) ? `: ${cortarSt(rc.obs, 120)}` : '';
  if (nao('carroLimpo') || nao('carroArrumado'))
    poe('carro', `a conferência da volta diz carro ${[nao('carroLimpo') ? 'sujo' : '', nao('carroArrumado') ? 'desarrumado' : ''].filter(Boolean).join(' e ')}${quem}`, {volta:true});
  if (nao('equipamentosOk')) poe('equipamentos', `a conferência da volta diz que os equipamentos não voltaram completos${quem}${obs}`, {volta:true});
  if (nao('semAvaria')) poe('avaria', `a conferência da volta aponta avaria nova no carro${quem}`, {volta:true});
  return out;
}
// As ocorrências derivadas da O.S. (id 'osId:tipo' e, no retorno, 'osId:retorno_antecipado:dia'), sem as manuais.
function ocorrenciasDerivadas(o, regra, volta, hoje) {
  const os = objSt(o) ? o : {};
  return derivadasDe(os, apurarSt(os, hoje), retornoAntecipado(os, regra, volta), regra);
}
// Todas: as derivadas e as manuais (a anulada vem marcada).
function ocorrenciasDaOS(o, regra, volta, hoje) {
  return [...ocorrenciasDerivadas(o, regra, volta, hoje), ...ocorrenciasManuais(o)];
}
function statusEntrega(o, hoje, regra, volta) {
  const os = objSt(o) ? o : {};
  const ap = apurarSt(os, hoje);
  const {dHoje, M, temMarca, r, canc, prazo, entrega} = ap;
  const parcial = !canc && !entrega ? parcialDe(os, M, r) : null;
  const ret = retornoAntecipado(os, regra, volta);
  const ocorrencias = [...derivadasDe(os, ap, ret, regra), ...ocorrenciasManuais(os)];
  const abAtraso = ap.atraso ? abonoDaOcorrencia(os, txtSt(os.id) + ':atraso', ap.atraso.medida) : {vigente:null, outra:null};
  const abonoAtraso = abAtraso.vigente;
  const aplicaveis = [];
  const poe = (estado, motivo, rotulo, abonado) => { aplicaveis.push({estado, rotulo:rotulo || ROTULOS_ENTREGA[estado], motivo, ...(abonado ? {abonado:true} : {})}); };
  let diasAtraso = 0;
  if (canc) {
    const foi = entrega ? '; o que já foi entregue fica' : '';
    poe('cancelado', canc.origem === 'erp' ? `cancelada no ERP (baixa de ${ddmmSt(diaSt(canc.em))})${foi}`
      : `cancelada${canc.por ? ' por ' + canc.por : ''}${diaSt(canc.em) ? ' em ' + ddmmSt(diaSt(canc.em)) : ''}: ${canc.motivo}${canc.pendente ? ' (a enviar)' : ''}${foi}`);
  }
  if (os.retrabalho) poe('retrabalho', motivoRetrabalhoSt(os));
  if (!canc) {
    // Um selo para os dias que contam e outro para os abonados (a O.S. de vários dias pode ter os dois).
    const contam = ret.dias.filter(d => d.situacao === 'antecipado'), abonados = ret.dias.filter(d => d.situacao === 'abonado');
    if (contam.length) poe('retorno_antecipado', contam.map(d => d.motivo).join('; '));
    if (abonados.length) poe('retorno_antecipado', abonados.map(d => d.motivo).join('; '), 'Retorno antecipado (abonado)', true);
  }
  const motivoAtraso = () => comOutraSt(comAbonoSt(ap.atraso.motivo, abonoAtraso), abAtraso.outra);
  if (!canc && entrega && !entrega.dia) {
    const baixa = ddmmSt(diaSt(os.finalizadaEm));
    if (entrega.fonte === 'aLancar') poe('entregue', `baixa do ERP em ${baixa}, ainda a lançar: a data real da entrega vem no lançamento, e só com ela o prazo é julgado`, ROTULO_A_LANCAR_ST);
    else poe('entregue', `baixa do ERP em ${baixa} sem o dia da entrega (o ERP não disse entregue): o prazo não é julgado`, ROTULO_ERP_SEM_DATA_ST);
  } else if (!canc && entrega) {
    const como = `${os.tipo === 'interno' ? 'retirada' : 'entregue'} em ${ddmmSt(entrega.dia)} (${FONTE_TXT_ST[entrega.fonte]})`;
    if (ap.atraso) {
      diasAtraso = ap.atraso.dias;
      poe('atraso', motivoAtraso(), abonoAtraso ? 'Com atraso (abonado)' : '', !!abonoAtraso);
    } else if (prazo) poe('no_prazo', `${como}, dentro do prazo (${prazoTxtSt(prazo)})`);
    // Sem prazo combinado não há o que medir: neutro, nunca o verde do "No prazo".
    else poe('entregue', `${como}; sem prazo combinado no PCP, não há atraso a medir`, ROTULO_SEM_PRAZO_ST);
  } else if (!canc) {
    const exec = motivoExecucaoSt(os, dHoje, parcial, prazo);
    if (ap.atraso) {
      diasAtraso = ap.atraso.dias;
      // A aberta abonada (a remarcação pedida pelo cliente) diz também a data nova (revisão da F17).
      poe('atraso', motivoAtraso() + (abonoAtraso && !exec ? '; ' + motivoAgendadoSt(os, prazo) : ''), abonoAtraso ? 'Com atraso (abonado)' : '', !!abonoAtraso);
    }
    if (exec) poe('execucao', exec);
    else if (!diasAtraso) poe('agendado', motivoAgendadoSt(os, prazo));
  }
  /* A ordem da precedência; o ABONADO vem depois das perdas que valem e
     antes do "No prazo" (ele não zera, mas diz o que aconteceu). */
  const ordem = a => a.abonado ? ESTADOS_ENTREGA.indexOf('atraso') + 0.5 + ESTADOS_ENTREGA.indexOf(a.estado) / 100 : ESTADOS_ENTREGA.indexOf(a.estado);
  aplicaveis.sort((a, b) => ordem(a) - ordem(b));
  // Sem data nenhuma, o "Agendado" diz "A agendar" (no selo e na lista).
  if (!prazo) for (const a of aplicaveis) if (a.estado === 'agendado') a.rotulo = 'A agendar';
  const p = aplicaveis[0];
  const perdasRegra = objSt(regra) && Array.isArray(regra.perdas) ? regra.perdas : [];
  // Atraso só é perda da O.S. entregue: a aberta ainda pode ser abonada ou cancelada. O abonado nunca é perda.
  const perdas = aplicaveis.filter(a => !a.abonado && PERDA_DO_ESTADO[a.estado] && perdasRegra.includes(PERDA_DO_ESTADO[a.estado]) && (a.estado !== 'atraso' || !!entrega))
    .map(a => PERDA_DO_ESTADO[a.estado]);
  return {
    estado:p.estado, rotulo:p.rotulo, motivo:p.motivo, aplicaveis,
    entregue:!!entrega, dataEntrega:entrega ? entrega.dia : '', fonteEntrega:entrega ? entrega.fonte : '', semProva:!!(entrega && entrega.semProva),
    prazo:prazo ? prazo.fim : '', prazoInicio:prazo ? prazo.inicio : '', prazoFonte:prazo ? prazo.fonte : '', diasAtraso,
    parcial, cancelamento:canc, retornoAntecipado:ret, ocorrencias, perdas,
    // O.S. com marca por item e sem o motor carregado (versões misturadas): a data e a parcial não leem os itens.
    semMotor:temMarca && !M,
  };
}
/* ==== FIM DO STATUS ==== */
    return {ESTADOS_ENTREGA, ROTULOS_ENTREGA, MOTIVO_CANCELAMENTO_MIN, MOTIVO_CANCELAMENTO_MAX, motivoCancelamentoInvalido, cancelamentoDe, cancelada, prazoDaEntrega, statusEntrega, TIPOS_OCORRENCIA, TIPOS_OCORRENCIA_MANUAL, ROTULOS_OCORRENCIA, OCORRENCIAS_ABONAVEIS, MOTIVO_ABONO_MIN, MOTIVO_ABONO_MAX, TOLERANCIA_RETORNO_PADRAO, motivoAbonoInvalido, toleranciaRetorno, chegadaConferida, chegadasConferidas, chegadaDoDia, pareceDiaSeguinte, abonosDe, abonoVigente, abonoDaOcorrencia, ocorrenciasManuais, voltaDoRetorno, indiceDasVoltas, voltaNoIndice, retornoAntecipado, ocorrenciasDerivadas, ocorrenciasDaOS, letrasMotivoSt};
  })(prazoCombinadoDe, () => motorDaEntrega
    || (typeof module !== 'undefined' && module.exports && typeof require === 'function' ? require('./entrega-item.js') : null), retornosPrevistos);
  /* OS PEDIDOS DA F17 NO RASCUNHO DA O.S. (ocorrência manual, anular,
     abonar, revogar). Só o PEDIDO vai: autor e hora são carimbados pelo
     servidor, que confere tudo de novo (_shared/pcp-status.mjs,
     guardarOcorrencias e guardarAbonos). Nada é tirado da lista: o pedido
     desfeito antes de ir leva a marca (anular, revogar) e o servidor não o
     registra. Cada um devolve '' ou a frase do que falta. `ctx` traz a regra
     do dia, a volta e o hoje, para conferir a ocorrência como a tela a vê. */
  function novoIdF17(prefixo) {
    const c = typeof crypto !== 'undefined' ? crypto : null, b = new Uint8Array(16);
    if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
    else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
    return prefixo + '-' + Array.from(b, x => (x % 36).toString(36)).join('');
  }
  const objF17 = v => !!v && typeof v === 'object' && !Array.isArray(v);
  /* A VOLTA DO RETORNO com a régua de pessoa do aparelho (o nome antigo e o
     ID da mesma pessoa são a mesma volta). O índice das voltas é feito uma
     vez por lista e por repintura (revisão da F17: a tela pergunta pela volta
     de centenas de cards, e varrer a lista inteira a cada card era O(N²)).
     Ele vale até o fim da volta do laço de eventos e cai antes se o STORE
     gravar (versaoOS conta as gravações): a O.S. salva no meio do mesmo
     clique entra na volta certa. */
  let indiceVoltasCache = null;
  function versaoDaLista(lista) {
    const S = typeof STORE !== 'undefined' && STORE ? STORE : null;
    try { return S && typeof S.versaoOS === 'function' && typeof S.getAllOS === 'function' && S.getAllOS() === lista ? S.versaoOS() : null; } catch (e) { return null; }
  }
  function indiceDaLista(lista) {
    const versao = versaoDaLista(lista), c = indiceVoltasCache;
    if (c && c.vivo && c.lista === lista && c.versao === versao) return c.indice;
    const novo = {lista, versao, indice:STATUS_ENTREGA.indiceDasVoltas(lista, chavePessoa), vivo:true};
    indiceVoltasCache = novo;
    Promise.resolve().then(() => { novo.vivo = false; });
    return novo.indice;
  }
  const voltaNaLista = (o, lista) => Array.isArray(lista) ? STATUS_ENTREGA.voltaNoIndice(o, indiceDaLista(lista)) : STATUS_ENTREGA.voltaDoRetorno(o, lista, chavePessoa);
  /* O DIA DA JORNADA de uma volta que o lote fecha no dia `d` (revisão da
     F17): o próprio dia, quando ele está na agenda da O.S.; o dia anterior,
     quando só ele está (a volta que passou da meia-noite: o carro chegou no
     dia `d`, e o retorno previsto é o do dia anterior). O previsto é achado
     pelo dia da volta, nunca pelo dia da chegada. */
  function diaDaJornada(o, d) {
    const x = dia(d);
    if (!x || !o) return x;
    const ag = diasAgenda(o);
    if (!ag.length || ag.includes(x)) return x;
    const antes = somarDias(x, -1);
    return ag.includes(antes) ? antes : x;
  }
  /* A CHEGADA CONFERIDA NO RASCUNHO (revisão da F17): o pedido do dia da
     jornada vai em chegadasConferidas, sem mexer nos outros dias; o servidor
     carimba (carimbarChegadas, _shared/pcp-integridade.mjs) e põe no
     retornoConferido a do último dia. `diaChegada` só quando o carro chegou
     no dia seguinte. Sem hora, o pedido tira a chegada do dia ({limpar}). */
  function pedirChegada(o, {dia: d, hora, diaChegada, fonte = 'lote', em} = {}) {
    if (!objF17(o)) return 'O.S. não encontrada.';
    const jd = dia(d);
    if (!jd) return 'Dia da chegada inválido.';
    const h = String(hora || '').trim();
    const lista = (Array.isArray(o.chegadasConferidas) ? o.chegadasConferidas : []).filter(c => !(objF17(c) && dia(c.dia) === jd));
    if (!h) { o.chegadasConferidas = [...lista, {dia:jd, limpar:true}]; return ''; }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(h)) return 'Hora da chegada inválida.';
    const dc = dia(diaChegada);
    const x = {dia:jd, hora:h, fonte:['lote', 'ficha'].includes(fonte) ? fonte : 'lote', em:em || new Date().toISOString()};
    if (dc && dc === somarDias(jd, 1)) x.diaChegada = dc;
    o.chegadasConferidas = [...lista, x].sort((a, b) => String(a.dia).localeCompare(String(b.dia)));
    return '';
  }
  // As O.S. da lista com a mesma ocorrência manual da volta (o mesmo grupo), ainda não anulada: [{os, ocorrenciaId}].
  function ocorrenciasDoGrupo(lista, grupo) {
    const g = String(grupo || '');
    if (!/^vl-[a-z0-9]{6,40}$/.test(g)) return [];
    const out = [];
    for (const o of Array.isArray(lista) ? lista : []) {
      if (!objF17(o) || !Array.isArray(o.ocorrencias)) continue;
      const x = o.ocorrencias.find(y => objF17(y) && y.grupo === g && y.anular !== true && !(objF17(y.anulada) && y.anulada.em));
      if (x) out.push({os:o, ocorrenciaId:String(x.id)});
    }
    return out;
  }
  function pedirOcorrencia(o, dados = {}) {
    if (!objF17(o)) return 'O.S. não encontrada.';
    const tipo = String(dados.tipo || '');
    if (!STATUS_ENTREGA.TIPOS_OCORRENCIA_MANUAL.includes(tipo)) return 'Escolha o tipo da ocorrência.';
    const item = String(dados.item ?? '').trim().slice(0, 120), obs = String(dados.obs ?? '').trim().slice(0, 300);
    // A mesma régua do servidor: só as letras e os números que se veem.
    if (STATUS_ENTREGA.letrasMotivoSt(item) + STATUS_ENTREGA.letrasMotivoSt(obs) < 3) return 'Diga qual é o item ou o que aconteceu.';
    const d = dia(dados.dia);
    const x = {id:novoIdF17('oc'), tipo, item, obs, fonte:['volta', 'ficha', 'lote'].includes(dados.fonte) ? dados.fonte : 'ficha', pedido:true};
    if (d) x.dia = d;
    // A mesma ocorrência em todas as O.S. da volta leva o mesmo grupo (conta uma vez só).
    if (/^vl-[a-z0-9]{6,40}$/.test(String(dados.grupo || ''))) x.grupo = dados.grupo;
    o.ocorrencias = [...(Array.isArray(o.ocorrencias) ? o.ocorrencias : []), x];
    return '';
  }
  function pedirAnularOcorrencia(o, id, motivo = '') {
    if (!objF17(o) || !Array.isArray(o.ocorrencias)) return 'Ocorrência não encontrada.';
    const i = o.ocorrencias.findIndex(x => objF17(x) && String(x.id) === String(id));
    if (i < 0) return 'Ocorrência não encontrada.';
    const x = o.ocorrencias[i];
    if (x.anular === true || (objF17(x.anulada) && x.anulada.em)) return 'A ocorrência já está anulada.';
    o.ocorrencias = o.ocorrencias.map((y, j) => j === i ? {...y, anular:true, motivoAnular:String(motivo || '').trim().slice(0, 300)} : y);
    return '';
  }
  function pedirAbono(o, ocorrenciaId, motivo, ctx = {}) {
    if (!objF17(o)) return 'O.S. não encontrada.';
    const erro = STATUS_ENTREGA.motivoAbonoInvalido(motivo);
    if (erro) return erro;
    const alvo = STATUS_ENTREGA.ocorrenciasDerivadas(o, ctx.regra, ctx.volta, ctx.hoje).find(x => x.id === ocorrenciaId);
    if (!alvo) return 'Esta ocorrência não existe mais nesta O.S. Feche e abra de novo.';
    if (!alvo.abonavel) return alvo.tipo === 'retrabalho' ? 'Retrabalho não se abona.' : `${alvo.rotulo} não se abona.`;
    if (alvo.abonado) return 'A ocorrência já está abonada. Revogue o abono antes de abonar de novo.';
    // A medida que a tela vê vai junto, para o pedido valer só para ela; o servidor carimba a dele.
    const pedido = {id:novoIdF17('ab'), ocorrenciaId, motivo:String(motivo).trim().slice(0, 300), pedido:true};
    if (alvo.medida) pedido.medida = {...alvo.medida};
    o.abonos = [...(Array.isArray(o.abonos) ? o.abonos : []), pedido];
    return '';
  }
  function pedirRevogarAbono(o, abonoId) {
    if (!objF17(o) || !Array.isArray(o.abonos)) return 'Abono não encontrado.';
    const i = o.abonos.findIndex(x => objF17(x) && String(x.id) === String(abonoId));
    if (i < 0) return 'Abono não encontrado.';
    const x = o.abonos[i];
    if (x.revogar === true || x.revogadoEm) return 'O abono já está revogado.';
    o.abonos = o.abonos.map((y, j) => j === i ? {...y, revogar:true} : y);
    return '';
  }
  return {uidItemValido,novoUidItem,casarItens,adotarUidsItens,ehIdPessoa,resolverPessoas,usarPessoas,esquecerPessoas,dadosPessoas,confirmarNome,converterEquipe,idPessoa,chavePessoa,nomePessoa,pessoaDe,pessoaFixada,idRepetido,equipeNomes,equipeTexto,SEM_CARRO,semCarro,PERGUNTAS_VOLTA,respostaVolta,voltaRespondida,voltaConferidaParaNota,diaDaVolta,chaveDaVolta,voltou,voltasDoCarro,agruparPorVolta,confirmadaHoje,pendencias,fecharParado,fecharParadoPorAgenda,retrabalhoPendente,filhasDeRetrabalho,destaqueDoDia,taxaRetrabalho,dia,somarDias,interno,equipe,prazo,atrasada,agendaCompleta,status,paradoNoCliente,diasAgenda,emIntervalo,programadas,situacaoSaida,naRua,encerradaERP,concluida,entregaLancadaValida,conclusoes,horas,mensal,conflitos,ocupados,distanciaEdicao,buscaTolerante,resumo,diaPlausivel,agendaDeGente,PRAZO_SEM_AGENDA,prazoCombinadoDe,retornosPrevistos,retornoPrevistoDoDia,saidaPrevista,janelaPrevista,retornoPrevistoParaMostrar,periodoRapido,missaoFoco,usarMotorItem,...STATUS_ENTREGA,novoIdF17,voltaNaLista,diaDaJornada,pedirChegada,ocorrenciasDoGrupo,pedirOcorrencia,pedirAnularOcorrencia,pedirAbono,pedirRevogarAbono};
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
