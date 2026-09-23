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
  const equipe = o => [...new Set((Array.isArray(o?.equipe) ? o.equipe : []).map(n => String(n).trim()).filter(Boolean))];
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
    for (const o of fins) for (const nome of equipe(o)) {
      const d = mapa.get(nome) || {nome, entregas:0, retrab:0};
      d.entregas++; if (o.retrabalho) d.retrab++; mapa.set(nome, d);
    }
    return {total:fins.length, retrabalho:fins.filter(o => o.retrabalho).length,
      semEquipe:fins.filter(o => !equipe(o).length).length,
      participacoes:[...mapa.values()].reduce((s,d) => s+d.entregas,0),
      pessoas:[...mapa.values()].sort((a,b) => b.entregas-a.entregas || a.nome.localeCompare(b.nome))};
  }
  // Sem duração em horas/roteiro não é possível afirmar sobrecarga ou capacidade.
  // Manhã e tarde distintas não colidem. Os demais cruzamentos pedem conferência.
  function mesmoTurno(a, b) {
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
      const a=os[i], b=os[j]; if (a.id === b.id || !mesmoTurno(a,b)) continue;
      const nomes = equipe(a).filter(n => equipe(b).includes(n));
      const carro = String(a.veiculo || '').trim();
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
  function destaqueDoDia(lista, hoje = dia(new Date())) {
    const abertas = (lista || []).filter(o => o && !o.finalizadaEm);
    const rua = abertas.find(o => naRua(o, hoje));
    if (rua) return rua;
    /* Só o DIA DA INSTALAÇÃO conta (a agenda; na retirada, a data marcada),
       nunca a previsão de entrega: "Sua próxima instalação" com botão de Rota
       apontava O.S. sem data. Serviço que já voltou no último dia dele saiu da
       frente: o da tarde não fica atrás do que terminou de manhã. */
    const dias = o => interno(o) ? (dia(o?.instalacao?.data) ? [dia(o.instalacao.data)] : []) : diasAgenda(o);
    const candidatas = abertas.map(o => {
      const ds = dias(o), ultimo = ds[ds.length - 1];
      if ((o.horaRetorno || o.retornoEm) && ultimo && ultimo <= hoje) return null;
      const d = ds.find(x => x >= hoje);
      return d ? { o, d } : null;
    }).filter(Boolean).sort((a, b) => a.d.localeCompare(b.d));
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
  return {confirmadaHoje,pendencias,fecharParado,fecharParadoPorAgenda,retrabalhoPendente,filhasDeRetrabalho,destaqueDoDia,taxaRetrabalho,dia,somarDias,interno,equipe,prazo,atrasada,agendaCompleta,status,paradoNoCliente,diasAgenda,emIntervalo,programadas,situacaoSaida,naRua,encerradaERP,concluida,conclusoes,horas,mensal,conflitos,resumo,periodoRapido,missaoFoco};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OPERACAO;
