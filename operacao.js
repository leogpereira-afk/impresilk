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
      retrabalho:lista.filter(o => o.retrabalho && !o.dataResolvido)
    };
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
  return {dia,somarDias,interno,equipe,prazo,atrasada,agendaCompleta,status,diasAgenda,emIntervalo,programadas,situacaoSaida,naRua,encerradaERP,concluida,conclusoes,horas,mensal,conflitos,resumo,periodoRapido};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OPERACAO;
