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
  return STORE.getAllOS().filter(o => OPERACAO.concluida(o) && OPERACAO.dia(o.finalizadaEm).slice(0, 7) === mes);
}

function erpMesCasa(mes) {
  return STORE.getAllOS().filter(o => OPERACAO.encerradaERP(o) && OPERACAO.dia(o.finalizadaEm).slice(0, 7) === mes);
}

// Data que a produção já tem na O.S.: agenda completa, senão o dia marcado (inclusive retirada).
function diasCasa(os) {
  const ag = OPERACAO.diasAgenda(os);
  if (ag.length) return ag;
  const d = OPERACAO.prazo(os) || OPERACAO.dia(os && os.instalacao && os.instalacao.data) || OPERACAO.dia(os && os.previsaoEntrega);
  return d ? [d] : [];
}

function osNoMesCasa(mes) {
  return STORE.getAllOS().filter(o => !OPERACAO.encerradaERP(o) && diasCasa(o).some(d => d.startsWith(mes)));
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
  const fins = osFinalizadasMes(mes);
  const erp = erpMesCasa(mes);
  const r = OPERACAO.mensal(STORE.getAllOS(), mes);
  const retiradas = fins.filter(o => OPERACAO.interno(o)).length;
  const porDia = new Map();
  for (const os of fins) {
    const iso = OPERACAO.dia(os.finalizadaEm) || '—';
    if (!porDia.has(iso)) porDia.set(iso, []);
    porDia.get(iso).push(os);
  }
  const dias = [...porDia.keys()].sort().reverse();
  const cardFn = typeof osCardHTML === 'function' ? osCardHTML : null;
  const grupos = dias.map(iso => {
    const data = iso === '—' ? '—' : iso.slice(8, 10) + '/' + iso.slice(5, 7);
    const lista = porDia.get(iso);
    const corpo = cardFn
      ? `<div class="cards-grid">${lista.map(cardFn).join('')}</div>`
      : `<ul>${lista.map(os => {
          const eq = (os.equipe || []).join(', ') || 'Sem instalador';
          return `<li class="casa-linha" data-os-id="${esc(os.id)}">
            <span class="casa-linha-os">O.S ${esc(os.numero || '—')}</span>
            <span class="casa-linha-cli">${esc(os.cliente || 'Sem cliente')}</span>
            <span class="casa-linha-eq">${esc(eq)}</span>
            <span class="badge st-finalizada">${OPERACAO.interno(os) ? 'Retirada' : 'Finalizada'}</span>${os.retrabalho ? ' <span class="badge st-retrabalho">Retrabalho</span>' : ''}
          </li>`;
        }).join('')}</ul>`;
    return `<section class="casa-dia-grupo"><h3>${esc(data)} · ${lista.length}</h3>${corpo}</section>`;
  }).join('');
  el.innerHTML = `
    <div class="casa-pagina">
      <div class="casa-pagina-head">
        <div><h2>Entregas</h2><p>O que a empresa finalizou no PCP neste mês. Baixa do ERP não entra. Extra e plantão não entram na Performance.</p></div>
        <label class="casa-mes">Mês <input type="month" id="ent-mes" value="${esc(mes)}"></label>
      </div>
      <div class="casa-kpis">
        <span><b>${fins.length}</b> finalizadas no PCP</span>
        <span><b>${r.total}</b> externas</span>
        <span><b>${retiradas}</b> retirada</span>
        <span><b>${r.pessoas.length}</b> quem entregou</span>
        <span><b>${fins.filter(o => o.retrabalho).length}</b> retrabalho</span>
      </div>
      ${erp.length ? `<p class="metricas-nota">${erp.length} baixa${erp.length === 1 ? '' : 's'} do ERP neste mês não entram aqui — a entrega desta tela é a finalização no PCP.</p>` : ''}
      <div class="casa-grupos">${grupos || emptyState('', 'Nenhuma finalizada no PCP neste mês', erp.length ? 'As baixas do ERP estão na aba Finalizados. Esta tela só conta O.S. que a equipe finalizou no PCP.' : 'Finalizar a O.S. no PCP (não a baixa do ERP) faz ela aparecer aqui.')}</div>
    </div>`;
  const input = document.getElementById('ent-mes');
  if (input) input.onchange = () => { if (input.value) { STATE._entMes = input.value; renderEntregas(); } };
  bindCardClicks(el);
}

function chipFichaHTML(osId, f, on) {
  const nome = (f.nome || f.apelido || rotuloPessoaCasa(f.id) || 'ID').split(' ')[0];
  return `<label class="casa-chip${on ? ' on' : ''}">
    <input type="checkbox" data-ponto="${esc(osId)}" value="${esc(f.id)}" ${on ? 'checked' : ''}>
    <span>${esc(nome)}</span>
    <small>ID ${esc(f.id)}</small>
  </label>`;
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
  if (!fichas.length) STATE._casaFichasOpen = true;
  const aprovados = b.itens.filter(i => i.status === 'aprovado' || i.status === 'pago');
  const pago = b.itens.filter(i => i.status === 'pago').reduce((s, i) => s + (Number(i.valor) || 0), 0);
  const aprovado = aprovados.reduce((s, i) => s + (Number(i.valor) || 0), 0);
  const filtroId = STATE._perfFiltro || '';
  const rankRows = rank.map((p, i) => {
    const item = itemDaPessoa(b.itens, p.id);
    const valor = item && item.status !== 'aberto' ? item.valor : propostaCasa(p.osCount, totalOs, b.orcamento, b.teto);
    const st = item ? item.status : 'aberto';
    const rotulo = st === 'pago' ? `Pago ${dinheiroCasa(valor)}` : st === 'aprovado' ? `Aprovado ${dinheiroCasa(valor)}` : (b.orcamento > 0 && valor > 0 ? dinheiroCasa(valor) : '—');
    const acao = st === 'aberto'
      ? `<button class="btn-primary btn-sm" data-aprovar="${esc(p.id)}" ${valor <= 0 ? 'disabled' : ''}>Aprovar</button>`
      : st === 'aprovado'
        ? `<button class="btn-primary btn-sm" data-pagar="${esc(p.id)}">Pagar</button><button class="btn-ghost btn-sm" data-reabrir="${esc(p.id)}">Reabrir</button>`
        : `<button class="btn-ghost btn-sm" data-reabrir="${esc(p.id)}">Reabrir</button>`;
    return `<tr class="casa-rank-row${filtroId === p.id ? ' on' : ''}" data-filtro-id="${esc(p.id)}">
      <td class="casa-pos">${i + 1}</td>
      <td><strong>${esc(p.nome)}</strong></td>
      <td class="num">${p.osCount}${p.retrab ? ` <small>${p.retrab} retrab</small>` : ''}</td>
      <td class="num">${esc(rotulo)}</td>
      <td class="casa-rank-acao">${acao}</td>
    </tr>`;
  }).join('');
  const semPonto = fins.filter(os => !instaladoresDaOs(os, b.pontos).length);
  const finsFiltro = filtroId ? fins.filter(os => instaladoresDaOs(os, b.pontos).includes(filtroId)) : fins;
  const apontar = finsFiltro.map(os => {
    const marcados = instaladoresDaOs(os, b.pontos);
    const eqIds = OPERACAO.equipe(os).map(n => fichaPorApelido(n)).filter(Boolean).map(f => f.id);
    const primarios = new Set([...marcados, ...eqIds]);
    const principais = [];
    for (const id of primarios) {
      const f = fichas.find(x => x.id === id) || { id, nome: '', apelido: '' };
      principais.push(f);
    }
    const outras = fichas.length <= 8 ? fichas.filter(f => !primarios.has(f.id)) : fichas.filter(f => !primarios.has(f.id));
    const mostrarOutras = fichas.length > 8;
    const chipsMain = (mostrarOutras ? principais : fichas.slice()).map(f =>
      chipFichaHTML(os.id, f, marcados.includes(f.id))
    ).join('');
    const chipsMais = mostrarOutras ? outras.map(f => chipFichaHTML(os.id, f, marcados.includes(f.id))).join('') : '';
    const semFicha = OPERACAO.equipe(os).filter(n => !fichaPorApelido(n));
    const d = OPERACAO.dia(os.finalizadaEm);
    const data = d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
    return `<li class="casa-apontar-os">
      <div class="casa-apontar-meta">
        <strong>O.S ${esc(os.numero || '—')}</strong>
        <span>${esc(os.cliente || '')}</span>
        <span>${esc(data)}</span>
        ${os.retrabalho ? '<span class="badge st-retrabalho">Retrabalho</span>' : ''}
      </div>
      <div class="casa-pontos">${chipsMain}${semFicha.map(n =>
        `<span class="sem-ficha">${esc(n)} · sem ficha</span>`
      ).join('')}${chipsMais ? `<details class="casa-mais-fichas"><summary>+ outra ficha</summary>${chipsMais}</details>` : ''}</div>
    </li>`;
  }).join('');
  el.innerHTML = `
    <div class="casa-pagina casa-perf">
      <div class="casa-pagina-head">
        <div><h2>Performance</h2><p>Entrega = finalizada no PCP. O ponto grava o ID da ficha. Várias fichas na mesma O.S. podem levar ponto. Extra não entra.</p></div>
        <label class="casa-mes">Mês <input type="month" id="perf-mes" value="${esc(mes)}"></label>
      </div>
      <div class="casa-perf-bar">
        <label>Orçamento <input type="number" min="0" step="0.01" id="perf-orc" value="${b.orcamento || ''}" placeholder="0"></label>
        <label>Teto por pessoa <input type="number" min="0" step="0.01" id="perf-teto" value="${b.teto || ''}" placeholder="Sem teto"></label>
        <span class="casa-kpis">
          <span><b>${rank.length}</b> pessoas</span>
          <span><b>${fins.length}</b> O.S.</span>
          <span><b>${totalOs}</b> pontos</span>
          <span><b>${dinheiroCasa(Math.max(0, b.orcamento - aprovado))}</b> disponível</span>
        </span>
      </div>
      ${pago ? `<p class="metricas-nota">Já marcado como pago nesta apuração: ${dinheiroCasa(pago)}. Não lança na folha.</p>` : ''}
      ${semPonto.length ? `<p class="metricas-nota">${semPonto.length} O.S. sem ficha apontada — não entram no ranking até você apontar.</p>` : ''}
      ${filtroId ? `<p class="metricas-nota">Filtrando ${esc(rotuloPessoaCasa(filtroId))}. <button type="button" class="pcp-ver-carteira" data-limpar-filtro>Ver todas</button></p>` : ''}
      <div class="casa-perf-grid">
        <section class="casa-apontar">
          <h3>Apontar quem leva o ponto</h3>
          <p>Marque uma ou mais fichas. O ponto grava o ID. Não divide sozinho.</p>
          <ul class="casa-apontar-lista">${apontar || `<li class="text-muted">${fins.length ? 'Nenhuma O.S. neste filtro.' : 'Nenhuma O.S. finalizada no PCP neste mês. A baixa do ERP não entra.'}</li>`}</ul>
        </section>
        <aside class="casa-rank-box">
          <h3>Ranking</h3>
          ${rank.length ? `<table class="casa-rank-tabela"><thead><tr><th>#</th><th>Pessoa</th><th>Pts</th><th>Valor</th><th></th></tr></thead><tbody>${rankRows}</tbody></table>` : emptyState('', 'Nenhum ponto apontado neste mês', 'A apuração lê O.S. finalizada no PCP. Pessoa sem ficha do RH não entra.')}
        </aside>
      </div>
      <details class="casa-fichas" ${STATE._casaFichasOpen ? 'open' : ''}>
        <summary>Fichas do RH · ${fichas.length} ligada${fichas.length === 1 ? '' : 's'}</summary>
        <p>Apelido da O.S. liga no ID que você digita. Não casa por nome. PCP não lê a base do RH.</p>
        <form id="perf-ficha-form" class="casa-criterios">
          <label>Apelido no PCP <input name="apelido" required placeholder="Como está na O.S."></label>
          <label>ID do RH <input name="id" inputmode="numeric" maxlength="14" required placeholder="6 dígitos"></label>
          <label>Nome na ficha <input name="nome" required placeholder="Nome de exibição"></label>
          <button class="btn-primary btn-sm" type="submit">Vincular ficha</button>
        </form>
        <ul class="casa-os">${fichas.map(f =>
          `<li>${esc(f.nome || f.apelido)} · ID ${esc(f.id)}${f.apelido ? ' · PCP: ' + esc(f.apelido) : ''} <button class="btn-ghost btn-xs" data-del-ficha="${esc(f.id)}" type="button">Apagar</button></li>`
        ).join('') || '<li class="text-muted">Nenhuma ficha. Sem ID, ninguém leva ponto.</li>'}</ul>
      </details>
    </div>`;
  const mesEl = document.getElementById('perf-mes');
  if (mesEl) mesEl.onchange = () => { if (mesEl.value) { gravarBonusCasa({ ...b, mes: mesEl.value }); renderPerformanceCasa(); } };
  const orcEl = document.getElementById('perf-orc');
  if (orcEl) orcEl.onchange = () => { gravarBonusCasa({ ...b, orcamento: Math.max(0, Number(orcEl.value) || 0) }); renderPerformanceCasa(); };
  const tetoEl = document.getElementById('perf-teto');
  if (tetoEl) tetoEl.onchange = () => { gravarBonusCasa({ ...b, teto: Math.max(0, Number(tetoEl.value) || 0) }); renderPerformanceCasa(); };
  const boxFichas = el.querySelector('.casa-fichas');
  if (boxFichas) boxFichas.ontoggle = () => { STATE._casaFichasOpen = boxFichas.open; };
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
    STATE._casaFichasOpen = true;
    renderPerformanceCasa();
    toast(`Ficha ligada: ${nome} · ID ${id}`, 'success');
  };
  el.querySelectorAll('[data-del-ficha]').forEach(btn => {
    btn.onclick = () => {
      gravarVinculosCasa(lerVinculosCasa().filter(v => v.id !== btn.dataset.delFicha));
      STATE._casaFichasOpen = true;
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
    btn.onclick = ev => {
      ev.stopPropagation();
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
    btn.onclick = ev => {
      ev.stopPropagation();
      const id = btn.dataset.pagar;
      const itens = b.itens.map(x => mesmaPessoa(x, id) && x.status === 'aprovado' ? { ...x, id, status: 'pago' } : x);
      gravarBonusCasa({ ...b, itens });
      renderPerformanceCasa();
      toast('Bônus marcado como pago nesta apuração.', 'success');
    };
  });
  el.querySelectorAll('[data-reabrir]').forEach(btn => {
    btn.onclick = ev => {
      ev.stopPropagation();
      const id = btn.dataset.reabrir;
      gravarBonusCasa({ ...b, itens: b.itens.filter(x => !mesmaPessoa(x, id)) });
      renderPerformanceCasa();
    };
  });
  el.querySelectorAll('[data-filtro-id]').forEach(row => {
    row.onclick = ev => {
      if (ev.target.closest('button')) return;
      const id = row.dataset.filtroId;
      STATE._perfFiltro = STATE._perfFiltro === id ? '' : id;
      renderPerformanceCasa();
    };
  });
  const limpar = el.querySelector('[data-limpar-filtro]');
  if (limpar) limpar.onclick = () => { STATE._perfFiltro = ''; renderPerformanceCasa(); };
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
  const osMes = osNoMesCasa(mes);
  if (!STATE._agDia || !String(STATE._agDia).startsWith(mes)) {
    STATE._agDia = OPERACAO.dia(new Date());
    if (!String(STATE._agDia).startsWith(mes)) STATE._agDia = mes + '-01';
  }
  const sel = STATE._agDia;
  const offset = new Date(y, m - 1, 1).getDay();
  const celulas = Array.from({ length: 42 }, (_, i) => new Date(y, m - 1, 1 - offset + i));
  const dow = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const grade = celulas.map(dt => {
    const iso = OPERACAO.dia(dt);
    const noMes = dt.getMonth() === m - 1;
    const nOs = osMes.filter(o => diasCasa(o).includes(iso)).length;
    const nEv = agenda.eventos.filter(e => e.data === iso).length;
    const nPl = agenda.plantoes.filter(p => p.data === iso && !p.cancelado).length;
    const pills = [nOs && `<span class="casa-pill">${nOs} OS</span>`, nPl && `<span class="casa-pill navy">plantão</span>`, nEv && `<span class="casa-pill mute">${nEv}</span>`].filter(Boolean).join('');
    return `<button type="button" class="casa-dia ${noMes ? '' : 'fora'} ${iso === sel ? 'sel' : ''}" data-dia="${iso}">
      <span>${dt.getDate()}</span>
      <span class="casa-dia-pills">${pills}</span>
    </button>`;
  }).join('');
  const osDia = osMes.filter(o => diasCasa(o).includes(sel));
  const plDia = agenda.plantoes.filter(p => p.data === sel && !p.cancelado);
  const evDia = agenda.eventos.filter(e => e.data === sel);
  const dataBR = sel ? sel.slice(8, 10) + '/' + sel.slice(5, 7) : '';
  el.innerHTML = `
    <div class="casa-pagina">
      <div class="casa-pagina-head">
        <div><h2>Calendário da produção</h2><p>Só PCP. Não conversa com o calendário de gente do RH.</p></div>
        <label class="casa-mes">Mês <input type="month" id="ag-mes" value="${esc(mes)}"></label>
      </div>
      <div class="casa-agenda">
        <div>
          <div class="casa-cal-dow">${dow.map(d => `<span>${d}</span>`).join('')}</div>
          <div class="casa-cal">${grade}</div>
        </div>
        <aside class="casa-dia-painel">
          <h3>Dia ${esc(dataBR)}</h3>
          <p>${osDia.length} O.S. · ${plDia.length} plantão · ${evDia.length} evento</p>
          <ul class="casa-os">${osDia.map(os =>
            `<li data-os-id="${esc(os.id)}">O.S ${esc(os.numero || '—')} · ${esc(os.cliente || '')} · ${esc((os.equipe || []).join(', ') || 'sem equipe')}${os.finalizadaEm ? ' · finalizada' : ''}</li>`
          ).join('') || '<li class="text-muted">Nenhuma O.S. neste dia.</li>'}</ul>
          <ul class="casa-os">${plDia.map(p =>
            `<li>${esc(p.titulo)} · ${esc(p.quem)} · ${esc(p.inicio)}–${esc(p.fim)}</li>`
          ).join('')}</ul>
          <ul class="casa-os">${evDia.map(e =>
            `<li>${esc(e.titulo)} <button class="btn-ghost btn-xs" data-del-ev="${esc(e.id)}">Apagar</button></li>`
          ).join('')}</ul>
          <form id="ag-form" class="casa-criterios">
            <label>Evento neste dia <input name="titulo" required placeholder="Título"></label>
            <input type="hidden" name="data" value="${esc(sel)}">
            <button class="btn-primary btn-sm" type="submit">Registrar</button>
          </form>
        </aside>
      </div>
    </div>`;
  const mesEl = document.getElementById('ag-mes');
  if (mesEl) mesEl.onchange = () => { if (mesEl.value) { STATE._agMes = mesEl.value; STATE._agDia = ''; renderAgendaCasa(); } };
  el.querySelectorAll('[data-dia]').forEach(btn => {
    btn.onclick = () => { STATE._agDia = btn.dataset.dia; renderAgendaCasa(); };
  });
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
  bindCardClicks(el);
}
function renderPlantoesCasa() {
  const el = document.getElementById('panel-plantoes');
  if (!el) return;
  const a = lerAgendaCasa();
  const instaladores = STORE.getCFG().instaladores || [];
  const lista = a.plantoes.filter(p => !p.cancelado).slice().sort((x, y) => String(x.data).localeCompare(String(y.data)) || String(x.inicio).localeCompare(String(y.inicio)));
  const hoje = OPERACAO.dia(new Date());
  el.innerHTML = `
    <div class="casa-pagina">
      <div class="casa-pagina-head">
        <div><h2>Plantões</h2><p>Agenda da produção. Não entra na Performance e não aparece no RH.</p></div>
      </div>
      <form id="pl-form" class="casa-criterios casa-toolbar">
        <label>Título <input name="titulo" required placeholder="Plantão de sábado"></label>
        <label>Data <input name="data" type="date" required></label>
        <label>Quem <input name="quem" list="pl-nomes" required></label>
        <datalist id="pl-nomes">${instaladores.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <label>Início <input name="inicio" type="time" value="08:00" required></label>
        <label>Fim <input name="fim" type="time" value="12:00" required></label>
        <button class="btn-primary btn-sm" type="submit">Registrar plantão</button>
      </form>
      <table class="casa-tabela">
        <thead><tr><th>Data</th><th>Quem</th><th>Horário</th><th>Título</th><th></th></tr></thead>
        <tbody>${lista.map(p =>
          `<tr class="${p.data < hoje ? 'passado' : ''}">
            <td>${esc(p.data)}</td>
            <td>${esc(p.quem)}</td>
            <td class="num">${esc(p.inicio)}–${esc(p.fim)}</td>
            <td>${esc(p.titulo)}</td>
            <td><button class="btn-ghost btn-xs" data-del-pl="${esc(p.id)}">Apagar</button></td>
          </tr>`
        ).join('') || '<tr><td colspan="5" class="text-muted">Nenhum plantão registrado na produção. O RH não manda plantão para cá — cadastre acima.</td></tr>'}</tbody>
      </table>
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
  const lista = (OPERACAO.resumo(STORE.getAllOS(), hoje).hoje || []).slice().sort((a, b) =>
    String((a.instalacao && a.instalacao.hora) || (a.instalacao && a.instalacao.periodo) || '').localeCompare(
      String((b.instalacao && b.instalacao.hora) || (b.instalacao && b.instalacao.periodo) || '')
    )
  );
  const cards = typeof osCardHTML === 'function' ? lista.map(osCardHTML).join('') : '';
  const dataBR = hoje.slice(8, 10) + '/' + hoje.slice(5, 7);
  el.innerHTML = `
    <div class="casa-pagina">
      <div class="casa-pagina-head">
        <div><h2>Programação de serviços</h2><p>O mesmo recorte de Para hoje do PCP. A programação mora na O.S. — não no RH.</p></div>
      </div>
      <p class="metricas-nota">Hoje ${esc(dataBR)}. ${lista.length} O.S. Para mudar equipe, veículo ou hora, abra a O.S.</p>
      ${lista.length
        ? (cards ? `<div class="cards-grid">${cards}</div>` : `<table class="casa-tabela"><thead><tr><th>Hora</th><th>O.S</th><th>Cliente</th><th>Equipe</th><th>Veículo</th></tr></thead><tbody>${lista.map(os => {
            const inst = os.instalacao || {};
            const hora = inst.hora || inst.periodo || '—';
            return `<tr data-os-id="${esc(os.id)}">
              <td class="num">${esc(hora)}</td>
              <td>O.S ${esc(os.numero || '—')}</td>
              <td>${esc(os.cliente || '')}</td>
              <td>${esc((os.equipe || []).join(', ') || 'sem equipe')}</td>
              <td>${esc(os.veiculo || '—')}</td>
            </tr>`;
          }).join('')}</tbody></table>`)
        : emptyState('', 'Nada para hoje', 'O.S. com entrega ou instalação hoje (o mesmo número de Para hoje no PCP) aparecem aqui.')}
    </div>`;
  bindCardClicks(el);
}
