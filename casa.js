// casa.js — Entregas, Performance e Agenda da Produção. Sem vínculo com o RH.
'use strict';

function mesCasa() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function rotuloMesCasa(mes) {
  const [y, m] = (mes || '').split('-').map(Number);
  if (!y || !m) return mes || '';
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function dinheiroCasa(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function osFinalizadasMes(mes) {
  return STORE.getAllOS().filter(o => OPERACAO.concluida(o) && !OPERACAO.interno(o) && OPERACAO.dia(o.finalizadaEm).slice(0, 7) === mes);
}

function lerBonusCasa() {
  const cfg = STORE.getCFG();
  const b = cfg.bonusPCP || {};
  return {
    mes: b.mes || mesCasa(),
    orcamento: Number(b.orcamento) || 0,
    teto: Number(b.teto) || 0,
    pontos: b.pontos && typeof b.pontos === 'object' ? b.pontos : {},
    itens: Array.isArray(b.itens) ? b.itens : [],
  };
}

function gravarBonusCasa(b) {
  const cfg = STORE.getCFG();
  cfg.bonusPCP = b;
  STORE.saveCFG(cfg);
}

function nomesDoPonto(valor) {
  if (Array.isArray(valor)) return [...new Set(valor.map(n => String(n).trim()).filter(Boolean))];
  if (typeof valor === 'string' && valor.trim()) return [valor.trim()];
  return [];
}

function instaladoresDaOs(os, pontos) {
  if (Object.prototype.hasOwnProperty.call(pontos, os.id)) return nomesDoPonto(pontos[os.id]);
  const eq = OPERACAO.equipe(os);
  return eq.length === 1 ? eq : [];
}

function rankingFinalizadas(mes, pontos) {
  const map = new Map();
  for (const os of osFinalizadasMes(mes)) {
    const nomes = instaladoresDaOs(os, pontos);
    for (const nome of nomes) {
      const d = map.get(nome) || { nome, osCount: 0, retrab: 0, itens: [] };
      d.osCount += 1;
      if (os.retrabalho) d.retrab += 1;
      d.itens.push(os);
      map.set(nome, d);
    }
  }
  return [...map.values()].sort((a, b) => b.osCount - a.osCount || a.nome.localeCompare(b.nome, 'pt-BR'));
}

function propostaCasa(osCount, total, orcamento, teto) {
  if (orcamento <= 0 || total <= 0 || osCount <= 0) return 0;
  const bruto = orcamento * (osCount / total);
  const capped = teto > 0 ? Math.min(bruto, teto) : bruto;
  return Math.round(capped * 100) / 100;
}

function initCasa() {
  const btn = document.getElementById('btn-menu');
  const fundo = document.getElementById('nav-fundo');
  const abrir = () => {
    document.body.classList.add('nav-aberta');
    if (fundo) fundo.hidden = false;
  };
  const fechar = () => {
    document.body.classList.remove('nav-aberta');
    if (fundo) fundo.hidden = true;
  };
  if (btn) btn.onclick = () => (document.body.classList.contains('nav-aberta') ? fechar() : abrir());
  if (fundo) fundo.onclick = fechar;
  document.querySelectorAll('#tabs .tab').forEach(t => {
    t.addEventListener('click', fechar);
  });
}

function renderEntregas() {
  const el = document.getElementById('panel-entregas');
  if (!el) return;
  if (!STATE._entMes) STATE._entMes = mesCasa();
  const mes = STATE._entMes;
  const r = OPERACAO.mensal(STORE.getAllOS(), mes);
  const fins = osFinalizadasMes(mes);
  const lista = fins.map(os => {
    const d = OPERACAO.dia(os.finalizadaEm);
    const data = d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '—';
    const eq = (os.equipe || []).join(', ') || 'Sem instalador';
    return `<div class="os-list-item st-finalizada" data-os-id="${esc(os.id)}">
      <div class="list-info">
        <div class="list-numero">O.S ${esc(os.numero || '—')} <span class="badge st-finalizada">Finalizada</span>${os.retrabalho ? ' <span class="badge st-retrabalho">Retrabalho</span>' : ''}</div>
        <div class="list-cliente">${esc(os.cliente || 'Sem cliente')}${os.servico ? ' — ' + esc(os.servico) : ''}</div>
        <div class="list-date">${esc(data)} · 👷 ${esc(eq)}</div>
      </div>
    </div>`;
  }).join('');
  el.innerHTML = `
    <div class="gestao-box">
      <div class="gestao-head"><div><h2>Entregas</h2><p>O que a empresa finalizou no PCP neste mês. Extra e plantão não entram.</p></div>
        <label class="casa-mes">Mês <input type="month" id="ent-mes" value="${esc(mes)}"></label>
      </div>
      <div class="gestao-indicadores">
        <div class="gestao-indicador"><small>O.S. finalizadas</small><strong>${r.total}</strong></div>
        <div class="gestao-indicador"><small>Quem entregou</small><strong>${r.pessoas.length}</strong></div>
        <div class="gestao-indicador"><small>Retrabalho</small><strong>${r.retrabalho}</strong></div>
        <div class="gestao-indicador"><small>Sem equipe</small><strong>${r.semEquipe}</strong></div>
      </div>
    </div>
    <div class="os-list">${lista || emptyState('🏁', 'Nenhuma finalizada neste mês', 'A entrega desta tela é a O.S. finalizada no PCP.')}</div>`;
  const input = document.getElementById('ent-mes');
  if (input) input.onchange = () => { if (input.value) { STATE._entMes = input.value; renderEntregas(); } };
  bindCardClicks(el);
}

function renderPerformanceCasa() {
  const el = document.getElementById('panel-performance');
  if (!el) return;
  const b = lerBonusCasa();
  const mes = b.mes || mesCasa();
  const fins = osFinalizadasMes(mes);
  const rank = rankingFinalizadas(mes, b.pontos);
  const totalOs = rank.reduce((s, x) => s + x.osCount, 0);
  const instaladores = STORE.getCFG().instaladores || [];
  const aprovados = b.itens.filter(i => i.status === 'aprovado' || i.status === 'pago');
  const pago = b.itens.filter(i => i.status === 'pago').reduce((s, i) => s + (Number(i.valor) || 0), 0);
  const aprovado = aprovados.reduce((s, i) => s + (Number(i.valor) || 0), 0);
  const cards = rank.map((p, i) => {
    const item = b.itens.find(x => x.nome === p.nome);
    const valor = item && item.status !== 'aberto' ? item.valor : propostaCasa(p.osCount, totalOs, b.orcamento, b.teto);
    const st = item ? item.status : 'aberto';
    const rotulo = st === 'pago' ? `Pago ${dinheiroCasa(valor)}` : st === 'aprovado' ? `Aprovado ${dinheiroCasa(valor)}` : (b.orcamento > 0 && valor > 0 ? `${dinheiroCasa(valor)} sugeridos` : 'Abrir apuração');
    return `<article class="casa-card">
      <header class="casa-card-head">
        <span class="casa-pos">${i + 1}</span>
        <div><strong>${esc(p.nome)}</strong><p>${p.osCount} ponto(s)${p.retrab ? ' · ' + p.retrab + ' retrabalho' : ''}</p></div>
        <div class="casa-valor"><b>${rotulo}</b></div>
      </header>
      <div class="casa-acoes">
        ${st === 'aberto' ? `<button class="btn-primary btn-sm" data-aprovar="${esc(p.nome)}" ${valor <= 0 ? 'disabled' : ''}>Aprovar proposta</button>` : ''}
        ${st === 'aprovado' ? `<button class="btn-primary btn-sm" data-pagar="${esc(p.nome)}">Pagar bônus</button>` : ''}
        ${st !== 'aberto' ? `<button class="btn-ghost btn-sm" data-reabrir="${esc(p.nome)}">Reabrir</button>` : ''}
      </div>
      <ul class="casa-os">${p.itens.map(os => `<li>O.S ${esc(os.numero || '—')} · ${esc(os.cliente || '')}</li>`).join('')}</ul>
    </article>`;
  }).join('');
  const semPonto = fins.filter(os => !instaladoresDaOs(os, b.pontos).length);
  const apontar = fins.map(os => {
    const marcados = instaladoresDaOs(os, b.pontos);
    const nomes = [...new Set([...marcados, ...OPERACAO.equipe(os), ...instaladores].filter(Boolean))];
    return `<li>
      <div>O.S ${esc(os.numero || '—')} · ${esc(os.cliente || '')}${os.retrabalho ? ' · retrabalho' : ''}</div>
      <div class="casa-pontos">${nomes.map(n =>
        `<label><input type="checkbox" data-ponto="${esc(os.id)}" value="${esc(n)}" ${marcados.includes(n) ? 'checked' : ''}> ${esc(n)}</label>`
      ).join('')}</div>
    </li>`;
  }).join('');
  el.innerHTML = `
    <div class="gestao-box">
      <div class="gestao-head"><div><h2>Performance</h2><p>Entrega = finalizada no PCP. Na mesma O.S. várias pessoas podem levar ponto — quem leva, você aponta. Extra não entra. Folha da casa não é alterada aqui.</p></div>
        <label class="casa-mes">Mês <input type="month" id="perf-mes" value="${esc(mes)}"></label>
      </div>
      <div class="gestao-indicadores">
        <div class="gestao-indicador"><small>Pessoas em apuração</small><strong>${rank.length}</strong></div>
        <div class="gestao-indicador"><small>O.S. finalizadas</small><strong>${fins.length}</strong></div>
        <div class="gestao-indicador"><small>Pontos apontados</small><strong>${totalOs}</strong></div>
        <div class="gestao-indicador"><small>Orçamento disponível</small><strong>${dinheiroCasa(Math.max(0, b.orcamento - aprovado))}</strong></div>
      </div>
      <div class="casa-criterios">
        <label>Orçamento do mês <input type="number" min="0" step="0.01" id="perf-orc" value="${b.orcamento || ''}" placeholder="0"></label>
        <label>Teto por pessoa <input type="number" min="0" step="0.01" id="perf-teto" value="${b.teto || ''}" placeholder="Sem teto"></label>
      </div>
      ${pago ? `<p class="metricas-nota">Já marcado como pago nesta apuração: ${dinheiroCasa(pago)}. Não lança na folha.</p>` : ''}
      ${semPonto.length ? `<p class="metricas-nota">${semPonto.length} O.S. sem ninguém apontado — não entram no ranking até você apontar.</p>` : ''}
    </div>
    <div class="gestao-box">
      <div class="gestao-head"><div><h2>Apontar quem leva o ponto</h2><p>Marque uma ou mais pessoas em cada O.S. Não divide sozinho.</p></div></div>
      <ul class="casa-os">${apontar || '<li class="text-muted">Nenhuma finalizada neste mês.</li>'}</ul>
    </div>
    <div class="casa-rank">${cards || emptyState('🏅', 'Nenhum ponto apontado neste mês', 'A apuração lê O.S. finalizada no PCP, com o ponto na mão.')}</div>`;
  const mesEl = document.getElementById('perf-mes');
  if (mesEl) mesEl.onchange = () => { if (mesEl.value) { gravarBonusCasa({ ...b, mes: mesEl.value }); renderPerformanceCasa(); } };
  const orcEl = document.getElementById('perf-orc');
  if (orcEl) orcEl.onchange = () => { gravarBonusCasa({ ...b, orcamento: Math.max(0, Number(orcEl.value) || 0) }); renderPerformanceCasa(); };
  const tetoEl = document.getElementById('perf-teto');
  if (tetoEl) tetoEl.onchange = () => { gravarBonusCasa({ ...b, teto: Math.max(0, Number(tetoEl.value) || 0) }); renderPerformanceCasa(); };
  const gravarPontosDaOs = osId => {
    const nomes = [...el.querySelectorAll(`[data-ponto="${osId}"]`)].filter(cb => cb.checked).map(cb => cb.value);
    const pontos = { ...b.pontos, [osId]: nomes };
    gravarBonusCasa({ ...b, pontos });
    renderPerformanceCasa();
  };
  el.querySelectorAll('[data-ponto]').forEach(cb => {
    cb.onchange = () => gravarPontosDaOs(cb.dataset.ponto);
  });
  el.querySelectorAll('[data-aprovar]').forEach(btn => {
    btn.onclick = () => {
      const nome = btn.dataset.aprovar;
      const p = rank.find(x => x.nome === nome);
      const valor = propostaCasa(p ? p.osCount : 0, totalOs, b.orcamento, b.teto);
      if (valor <= 0) return;
      const itens = b.itens.filter(x => x.nome !== nome).concat([{ nome, valor, status: 'aprovado' }]);
      gravarBonusCasa({ ...b, itens });
      renderPerformanceCasa();
      toast('Proposta aprovada. Ainda não é pagamento na folha.', 'success');
    };
  });
  el.querySelectorAll('[data-pagar]').forEach(btn => {
    btn.onclick = () => {
      const itens = b.itens.map(x => x.nome === btn.dataset.pagar && x.status === 'aprovado' ? { ...x, status: 'pago' } : x);
      gravarBonusCasa({ ...b, itens });
      renderPerformanceCasa();
      toast('Bônus marcado como pago nesta apuração.', 'success');
    };
  });
  el.querySelectorAll('[data-reabrir]').forEach(btn => {
    btn.onclick = () => {
      gravarBonusCasa({ ...b, itens: b.itens.filter(x => x.nome !== btn.dataset.reabrir) });
      renderPerformanceCasa();
    };
  });
}

function lerAgendaCasa() {
  const cfg = STORE.getCFG();
  const a = cfg.agendaPCP || {};
  return {
    eventos: Array.isArray(a.eventos) ? a.eventos : [],
    plantoes: Array.isArray(a.plantoes) ? a.plantoes : [],
  };
}

function gravarAgendaCasa(a) {
  const cfg = STORE.getCFG();
  cfg.agendaPCP = a;
  STORE.saveCFG(cfg);
}

function renderAgendaCasa() {
  const el = document.getElementById('panel-agenda');
  if (!el) return;
  if (!STATE._agMes) {
    const d = new Date();
    STATE._agMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const mes = STATE._agMes;
  const [y, m] = mes.split('-').map(Number);
  const agenda = lerAgendaCasa();
  const osMes = STORE.getAllOS().filter(o => !OPERACAO.interno(o) && OPERACAO.diasAgenda(o).some(d => d.startsWith(mes)));
  const offset = new Date(y, m - 1, 1).getDay();
  const celulas = Array.from({ length: 42 }, (_, i) => new Date(y, m - 1, 1 - offset + i));
  const dow = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const grade = celulas.map(dt => {
    const iso = OPERACAO.dia(dt);
    const noMes = dt.getMonth() === m - 1;
    const nOs = osMes.filter(o => OPERACAO.diasAgenda(o).includes(iso)).length;
    const nEv = agenda.eventos.filter(e => e.data === iso).length;
    const nPl = agenda.plantoes.filter(p => p.data === iso && !p.cancelado).length;
    return `<button type="button" class="casa-dia ${noMes ? '' : 'fora'}" data-dia="${iso}">
      <span>${dt.getDate()}</span>
      <small>${[nOs && nOs + ' O.S.', nPl && nPl + ' plantão', nEv && nEv + ' evento'].filter(Boolean).join(' · ')}</small>
    </button>`;
  }).join('');
  el.innerHTML = `
    <div class="gestao-box">
      <div class="gestao-head"><div><h2>Calendário da produção</h2><p>Só PCP. Não conversa com o calendário de gente do RH.</p></div>
        <label class="casa-mes">Mês <input type="month" id="ag-mes" value="${esc(mes)}"></label>
      </div>
      <div class="casa-cal-dow">${dow.map(d => `<span>${d}</span>`).join('')}</div>
      <div class="casa-cal">${grade}</div>
      <form id="ag-form" class="casa-criterios" style="margin-top:16px">
        <label>Novo evento <input name="titulo" required placeholder="Título"></label>
        <label>Data <input name="data" type="date" required></label>
        <button class="btn-primary btn-sm" type="submit">Registrar</button>
      </form>
      <ul class="casa-os">${agenda.eventos.filter(e => (e.data || '').startsWith(mes)).map(e =>
        `<li>${esc(e.data)} · ${esc(e.titulo)} <button class="btn-ghost btn-xs" data-del-ev="${esc(e.id)}">Apagar</button></li>`
      ).join('') || '<li class="text-muted">Nenhum evento neste mês.</li>'}</ul>
    </div>`;
  const mesEl = document.getElementById('ag-mes');
  if (mesEl) mesEl.onchange = () => { if (mesEl.value) { STATE._agMes = mesEl.value; renderAgendaCasa(); } };
  const form = document.getElementById('ag-form');
  if (form) form.onsubmit = ev => {
    ev.preventDefault();
    const fd = new FormData(form);
    const titulo = String(fd.get('titulo') || '').trim();
    const data = String(fd.get('data') || '');
    if (!titulo || !data) return;
    const a = lerAgendaCasa();
    a.eventos = [{ id: STORE.uuid(), titulo, data }, ...a.eventos];
    gravarAgendaCasa(a);
    renderAgendaCasa();
  };
  el.querySelectorAll('[data-del-ev]').forEach(btn => {
    btn.onclick = () => {
      const a = lerAgendaCasa();
      a.eventos = a.eventos.filter(e => e.id !== btn.dataset.delEv);
      gravarAgendaCasa(a);
      renderAgendaCasa();
    };
  });
}

function renderPlantoesCasa() {
  const el = document.getElementById('panel-plantoes');
  if (!el) return;
  const a = lerAgendaCasa();
  const instaladores = STORE.getCFG().instaladores || [];
  el.innerHTML = `
    <div class="gestao-box">
      <div class="gestao-head"><div><h2>Plantões</h2><p>Agenda da produção. Não entra na Performance e não aparece no RH.</p></div></div>
      <form id="pl-form" class="casa-criterios">
        <label>Título <input name="titulo" required placeholder="Plantão de sábado"></label>
        <label>Data <input name="data" type="date" required></label>
        <label>Quem <input name="quem" list="pl-nomes" required></label>
        <datalist id="pl-nomes">${instaladores.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <label>Início <input name="inicio" type="time" value="08:00" required></label>
        <label>Fim <input name="fim" type="time" value="12:00" required></label>
        <button class="btn-primary btn-sm" type="submit">Registrar plantão</button>
      </form>
      <ul class="casa-os">${a.plantoes.filter(p => !p.cancelado).map(p =>
        `<li>${esc(p.data)} · ${esc(p.titulo)} · ${esc(p.quem)} · ${esc(p.inicio)}–${esc(p.fim)}
          <button class="btn-ghost btn-xs" data-del-pl="${esc(p.id)}">Apagar</button></li>`
      ).join('') || '<li class="text-muted">Nenhum plantão.</li>'}</ul>
    </div>`;
  const form = document.getElementById('pl-form');
  if (form) form.onsubmit = ev => {
    ev.preventDefault();
    const fd = new FormData(form);
    const p = {
      id: STORE.uuid(),
      titulo: String(fd.get('titulo') || '').trim(),
      data: String(fd.get('data') || ''),
      quem: String(fd.get('quem') || '').trim(),
      inicio: String(fd.get('inicio') || ''),
      fim: String(fd.get('fim') || ''),
      cancelado: false,
    };
    if (!p.titulo || !p.data || !p.quem) return;
    const ag = lerAgendaCasa();
    ag.plantoes = [p, ...ag.plantoes];
    gravarAgendaCasa(ag);
    renderPlantoesCasa();
    toast('Plantão registrado na produção.', 'success');
  };
  el.querySelectorAll('[data-del-pl]').forEach(btn => {
    btn.onclick = () => {
      const ag = lerAgendaCasa();
      ag.plantoes = ag.plantoes.map(p => p.id === btn.dataset.delPl ? { ...p, cancelado: true } : p);
      gravarAgendaCasa(ag);
      renderPlantoesCasa();
    };
  });
}

function renderGradeCasa() {
  const el = document.getElementById('panel-grade');
  if (!el) return;
  const hoje = OPERACAO.dia(new Date());
  const lista = STORE.getAllOS().filter(o => !o.finalizadaEm && !OPERACAO.interno(o) && OPERACAO.diasAgenda(o).includes(hoje));
  const cards = lista.map(os => `
    <div class="os-list-item" data-os-id="${esc(os.id)}">
      <div class="list-info">
        <div class="list-numero">O.S ${esc(os.numero || '—')}</div>
        <div class="list-cliente">${esc(os.cliente || '')} · ${esc(os.servico || '')}</div>
        <div class="list-date">${esc(fmtInstalacao(os.instalacao))} · 👷 ${esc((os.equipe || []).join(', ') || 'sem equipe')} · 🚗 ${esc(os.veiculo || '—')}</div>
      </div>
    </div>`).join('');
  el.innerHTML = `
    <div class="gestao-box">
      <div class="gestao-head"><div><h2>Programação de serviços</h2><p>Grade do dia na produção. A programação mora na O.S. — não no RH.</p></div></div>
      <p class="metricas-nota">Hoje ${esc(hoje)}. Para mudar equipe, veículo ou hora, abra a O.S. A aba Instalação continua sendo a vista operacional.</p>
    </div>
    <div class="os-list">${cards || emptyState('📅', 'Nada programado para hoje', 'O.S. com data de instalação hoje aparecem aqui.')}</div>`;
  bindCardClicks(el);
}
