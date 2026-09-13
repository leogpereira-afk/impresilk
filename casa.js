// casa.js — Entregas, Performance e Agenda da Produção.
// Performance aponta pelo ID da ficha do RH. Calendário não conversa com o RH.
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

function idPessoaCasa(valor) {
  const d = String(valor ?? '').replace(/\D/g, '');
  if (d.length === 6) return d;
  if (d.length === 11) return d.slice(0, 6);
  return '';
}

function lerVinculosCasa() {
  const raw = STORE.getCFG().vinculosRH;
  const lista = Array.isArray(raw) ? raw : [];
  const saida = [];
  const vistos = new Set();
  for (const v of lista) {
    if (!v || typeof v !== 'object') continue;
    const id = idPessoaCasa(v.id || v.idPessoa);
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    saida.push({
      id,
      nome: String(v.nome || '').trim(),
      apelido: String(v.apelido || v.nomePCP || '').trim(),
    });
  }
  return saida;
}

function gravarVinculosCasa(lista) {
  const cfg = STORE.getCFG();
  cfg.vinculosRH = lista;
  STORE.saveCFG(cfg);
}

function fichaPorId(id) {
  const chave = idPessoaCasa(id);
  if (!chave) return null;
  return lerVinculosCasa().find(v => v.id === chave) || null;
}

function fichaPorApelido(apelido) {
  const a = String(apelido || '').trim();
  if (!a) return null;
  const hits = lerVinculosCasa().filter(v => v.apelido === a);
  return hits.length === 1 ? hits[0] : null;
}

function rotuloPessoaCasa(id) {
  const f = fichaPorId(id);
  if (f) return `${f.nome || f.apelido || 'Sem nome'} · ID ${f.id}`;
  const chave = idPessoaCasa(id);
  return chave ? `ID ${chave}` : '';
}

function chavePessoaCasa(valor) {
  const id = idPessoaCasa(valor);
  if (id) return id;
  const f = fichaPorApelido(valor);
  return f ? f.id : '';
}

function idsDoPonto(valor) {
  const arr = Array.isArray(valor) ? valor : (typeof valor === 'string' && valor.trim() ? [valor] : []);
  return [...new Set(arr.map(chavePessoaCasa).filter(Boolean))];
}

function instaladoresDaOs(os, pontos) {
  if (Object.prototype.hasOwnProperty.call(pontos, os.id)) return idsDoPonto(pontos[os.id]);
  const eq = OPERACAO.equipe(os);
  if (eq.length !== 1) return [];
  const f = fichaPorApelido(eq[0]);
  return f ? [f.id] : [];
}

function rankingFinalizadas(mes, pontos) {
  const map = new Map();
  for (const os of osFinalizadasMes(mes)) {
    const ids = instaladoresDaOs(os, pontos);
    for (const id of ids) {
      const d = map.get(id) || { id, nome: rotuloPessoaCasa(id), osCount: 0, retrab: 0, itens: [] };
      d.osCount += 1;
      if (os.retrabalho) d.retrab += 1;
      d.itens.push(os);
      map.set(id, d);
    }
  }
  return [...map.values()].sort((a, b) => b.osCount - a.osCount || a.nome.localeCompare(b.nome, 'pt-BR'));
}

function itemDaPessoa(itens, id) {
  return itens.find(x => x.id === id || (!x.id && chavePessoaCasa(x.nome) === id));
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
  const fichas = lerVinculosCasa();
  const aprovados = b.itens.filter(i => i.status === 'aprovado' || i.status === 'pago');
  const pago = b.itens.filter(i => i.status === 'pago').reduce((s, i) => s + (Number(i.valor) || 0), 0);
  const aprovado = aprovados.reduce((s, i) => s + (Number(i.valor) || 0), 0);
  const cards = rank.map((p, i) => {
    const item = itemDaPessoa(b.itens, p.id);
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
        ${st === 'aberto' ? `<button class="btn-primary btn-sm" data-aprovar="${esc(p.id)}" ${valor <= 0 ? 'disabled' : ''}>Aprovar proposta</button>` : ''}
        ${st === 'aprovado' ? `<button class="btn-primary btn-sm" data-pagar="${esc(p.id)}">Pagar bônus</button>` : ''}
        ${st !== 'aberto' ? `<button class="btn-ghost btn-sm" data-reabrir="${esc(p.id)}">Reabrir</button>` : ''}
      </div>
      <ul class="casa-os">${p.itens.map(os => `<li>O.S ${esc(os.numero || '—')} · ${esc(os.cliente || '')}</li>`).join('')}</ul>
    </article>`;
  }).join('');
  const semPonto = fins.filter(os => !instaladoresDaOs(os, b.pontos).length);
  const apontar = fins.map(os => {
    const marcados = instaladoresDaOs(os, b.pontos);
    const pessoas = fichas.slice();
    for (const id of marcados) {
      if (!pessoas.some(f => f.id === id)) pessoas.push({ id, nome: '', apelido: '' });
    }
    const semFicha = OPERACAO.equipe(os).filter(n => !fichaPorApelido(n));
    return `<li>
      <div>O.S ${esc(os.numero || '—')} · ${esc(os.cliente || '')}${os.retrabalho ? ' · retrabalho' : ''}</div>
      <div class="casa-pontos">${pessoas.map(f =>
        `<label><input type="checkbox" data-ponto="${esc(os.id)}" value="${esc(f.id)}" ${marcados.includes(f.id) ? 'checked' : ''}> ${esc(rotuloPessoaCasa(f.id))}</label>`
      ).join('')}${semFicha.map(n =>
        `<label class="sem-ficha">${esc(n)} · sem ficha</label>`
      ).join('')}</div>
    </li>`;
  }).join('');
  el.innerHTML = `
    <div class="gestao-box">
      <div class="gestao-head"><div><h2>Performance</h2><p>Entrega = finalizada no PCP. A pessoa é a ficha do RH: o ponto grava o ID (6 dígitos do CPF), nome só na tela. Na mesma O.S. várias fichas podem levar ponto — quem leva, você aponta. Extra não entra. Folha da casa não é alterada aqui.</p></div>
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
      ${semPonto.length ? `<p class="metricas-nota">${semPonto.length} O.S. sem ficha apontada — não entram no ranking até você apontar.</p>` : ''}
    </div>
    <div class="gestao-box">
      <div class="gestao-head"><div><h2>Fichas do RH</h2><p>Apelido da O.S. liga no ID que você digita. Não casa por nome. PCP não lê a base do RH.</p></div></div>
      <form id="perf-ficha-form" class="casa-criterios">
        <label>Apelido no PCP <input name="apelido" required placeholder="Como está na O.S."></label>
        <label>ID do RH <input name="id" inputmode="numeric" maxlength="14" required placeholder="6 dígitos"></label>
        <label>Nome na ficha <input name="nome" required placeholder="Nome de exibição"></label>
        <button class="btn-primary btn-sm" type="submit">Vincular ficha</button>
      </form>
      <ul class="casa-os">${fichas.map(f =>
        `<li>${esc(f.nome || f.apelido)} · ID ${esc(f.id)}${f.apelido ? ' · PCP: ' + esc(f.apelido) : ''} <button class="btn-ghost btn-xs" data-del-ficha="${esc(f.id)}" type="button">Apagar</button></li>`
      ).join('') || '<li class="text-muted">Nenhuma ficha. Sem ID, ninguém leva ponto.</li>'}</ul>
    </div>
    <div class="gestao-box">
      <div class="gestao-head"><div><h2>Apontar quem leva o ponto</h2><p>Marque uma ou mais fichas em cada O.S. O ponto grava o ID. Não divide sozinho.</p></div></div>
      <ul class="casa-os">${apontar || '<li class="text-muted">Nenhuma finalizada neste mês.</li>'}</ul>
    </div>
    <div class="casa-rank">${cards || emptyState('🏅', 'Nenhum ponto apontado neste mês', 'A apuração lê O.S. finalizada no PCP. Pessoa sem ficha do RH não entra.')}</div>`;
  const mesEl = document.getElementById('perf-mes');
  if (mesEl) mesEl.onchange = () => { if (mesEl.value) { gravarBonusCasa({ ...b, mes: mesEl.value }); renderPerformanceCasa(); } };
  const orcEl = document.getElementById('perf-orc');
  if (orcEl) orcEl.onchange = () => { gravarBonusCasa({ ...b, orcamento: Math.max(0, Number(orcEl.value) || 0) }); renderPerformanceCasa(); };
  const tetoEl = document.getElementById('perf-teto');
  if (tetoEl) tetoEl.onchange = () => { gravarBonusCasa({ ...b, teto: Math.max(0, Number(tetoEl.value) || 0) }); renderPerformanceCasa(); };
  const formFicha = document.getElementById('perf-ficha-form');
  if (formFicha) formFicha.onsubmit = ev => {
    ev.preventDefault();
    const fd = new FormData(formFicha);
    const id = idPessoaCasa(fd.get('id'));
    const apelido = String(fd.get('apelido') || '').trim();
    const nome = String(fd.get('nome') || '').trim();
    if (!id) { toast('O ID do RH são os 6 primeiros dígitos do CPF.', 'error'); return; }
    if (!apelido || !nome) return;
    const lista = lerVinculosCasa().filter(v => v.id !== id);
    lista.push({ id, apelido, nome });
    gravarVinculosCasa(lista);
    renderPerformanceCasa();
    toast(`Ficha ligada: ${nome} · ID ${id}`, 'success');
  };
  el.querySelectorAll('[data-del-ficha]').forEach(btn => {
    btn.onclick = () => {
      gravarVinculosCasa(lerVinculosCasa().filter(v => v.id !== btn.dataset.delFicha));
      renderPerformanceCasa();
    };
  });
  const gravarPontosDaOs = osId => {
    const ids = [...el.querySelectorAll(`[data-ponto="${osId}"]`)].filter(cb => cb.checked).map(cb => cb.value);
    const pontos = { ...b.pontos, [osId]: ids };
    gravarBonusCasa({ ...b, pontos });
    renderPerformanceCasa();
  };
  el.querySelectorAll('[data-ponto]').forEach(cb => {
    cb.onchange = () => gravarPontosDaOs(cb.dataset.ponto);
  });
  const mesmaPessoa = (x, id) => x.id === id || (!x.id && chavePessoaCasa(x.nome) === id);
  el.querySelectorAll('[data-aprovar]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.aprovar;
      const p = rank.find(x => x.id === id);
      const valor = propostaCasa(p ? p.osCount : 0, totalOs, b.orcamento, b.teto);
      if (valor <= 0) return;
      const itens = b.itens.filter(x => !mesmaPessoa(x, id)).concat([{ id, nome: rotuloPessoaCasa(id), valor, status: 'aprovado' }]);
      gravarBonusCasa({ ...b, itens });
      renderPerformanceCasa();
      toast('Proposta aprovada. Ainda não é pagamento na folha.', 'success');
    };
  });
  el.querySelectorAll('[data-pagar]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.pagar;
      const itens = b.itens.map(x => mesmaPessoa(x, id) && x.status === 'aprovado' ? { ...x, id, status: 'pago' } : x);
      gravarBonusCasa({ ...b, itens });
      renderPerformanceCasa();
      toast('Bônus marcado como pago nesta apuração.', 'success');
    };
  });
  el.querySelectorAll('[data-reabrir]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.reabrir;
      gravarBonusCasa({ ...b, itens: b.itens.filter(x => !mesmaPessoa(x, id)) });
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
