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

// ── Valor da O.S (uma base só) ───────────────────────────────────────────────
// Ordem: painel_ordens (STORE.valores, verdade do Painel com rateio conferido)
// > valorTotal que a importação gravou > soma dos itens. null = sem valor,
// que a tela mostra em laranja em vez de fingir zero.
function numBR(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const t = String(v).trim();
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
}
function valorDaOS(os) {
  const num = String(os && os.numero || '').trim();
  const doPainel = num && STORE.valores ? STORE.valores()[num] : undefined;
  if (Number.isFinite(doPainel)) return doPainel;
  const vt = numBR(os && os.valorTotal);
  if (Number.isFinite(vt) && vt > 0) return vt;
  let soma = 0, tem = false;
  for (const it of (Array.isArray(os && os.itens) ? os.itens : [])) {
    const n = numBR(it && it.subtotal);
    if (Number.isFinite(n) && n > 0) { soma += n; tem = true; }
  }
  return tem ? soma : null;
}
function somaValores(lista) {
  let total = 0, semValor = 0;
  for (const os of lista) { const v = valorDaOS(os); if (v == null) semValor++; else total += v; }
  return { total, semValor };
}
function iniciaisCasa(nome) {
  const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
// Semana corrente: segunda a domingo, no calendário local.
function semanaAtualCasa() {
  const hoje = OPERACAO.dia(new Date());
  const d = new Date(hoje + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7; // 0 = segunda
  return { de: OPERACAO.somarDias(hoje, -dow), ate: OPERACAO.somarDias(hoje, 6 - dow) };
}
function periodoOuMes(chave) {
  if (!STATE[chave]) {
    const hoje = OPERACAO.dia(new Date());
    STATE[chave] = { de: hoje.slice(0, 7) + '-01', ate: hoje };
  }
  return STATE[chave];
}
// ── REGRAS DE REGISTRO DE ENTREGAS (dono, 14/09/2026) ────────────────────────
//  • Cliente retira → o VALOR entra no mês; a retirada NÃO conta como entrega
//    realizada (não é instalação).
//  • Baixada normalmente no sistema (finalizada no PCP) → valor + entrega.
//  • Baixada fora do sistema, pelo ERP → NÃO entra sozinha: vai para a lista
//    de LANÇAMENTO MANUAL, e só conta depois que alguém registra (entregaLancada).
//    Retirada baixada pelo ERP segue a regra da retirada (valor entra).
function classificarEntregas(lista) {
  const r = { retiradas: [], instalacoes: [], aLancar: [] };
  for (const o of lista || STORE.getAllOS()) {
    if (!OPERACAO.dia(o.finalizadaEm)) continue;
    if (OPERACAO.interno(o)) { r.retiradas.push(o); continue; }
    if (OPERACAO.encerradaERP(o) && !o.entregaLancada) { r.aLancar.push(o); continue; }
    r.instalacoes.push(o);
  }
  return r;
}
// Data que vale para o mês: a do lançamento manual, se houver; senão a finalização.
function diaEntrega(o) {
  return (o.entregaLancada && OPERACAO.dia(o.entregaLancada.data)) || OPERACAO.dia(o.finalizadaEm);
}
function nomeExibicaoCasa(apelido) {
  const f = fichaPorApelido(apelido);
  return f ? { chave: f.id, nome: f.nome || apelido, id: f.id } : { chave: apelido, nome: apelido, id: '' };
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

// Baixa do ERP vira entrega só aqui: alguém confirma data e equipe e responde
// a pergunta obrigatória do retrabalho. Fica carimbado quem lançou.
function lancarEntregaManual(osId) {
  const os = STORE.getOS(osId);
  if (!os) return;
  const cfg = STORE.getCFG();
  const old = document.getElementById('lancar-box'); if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'lancar-box';
  box.className = 'wpp-picker-overlay';
  const eq = new Set(OPERACAO.equipe(os));
  box.innerHTML = `
    <div class="wpp-picker retrab-box" role="dialog" aria-modal="true">
      <div class="wpp-picker-head"><strong>📦 Lançar entrega · O.S ${esc(os.numero || '—')}</strong><button class="modal-close" id="lancar-x">×</button></div>
      <div class="wpp-picker-body">
        <p class="text-muted" style="font-size:.8rem;margin-bottom:8px">${esc(os.cliente || '')} · ${esc(os.servico || '')}. O ERP baixou em ${esc(OPERACAO.dia(os.finalizadaEm) ? OPERACAO.dia(os.finalizadaEm).slice(8, 10) + '/' + OPERACAO.dia(os.finalizadaEm).slice(5, 7) : '—')}.</p>
        <form id="lancar-form" class="retrab-form">
          <div class="field"><label>Data da entrega <span class="req">*</span></label><input name="data" type="date" required value="${esc(OPERACAO.dia(os.finalizadaEm) || hojeISO())}"></div>
          <div class="field"><label>Equipe que instalou</label><div class="casa-chips">${(cfg.instaladores || []).map(n => `<label class="casa-chip ${eq.has(n) ? 'on' : ''}"><input type="checkbox" name="equipe" value="${esc(n)}" ${eq.has(n) ? 'checked' : ''}><span>${esc(n)}</span></label>`).join('')}</div></div>
          <button class="btn-primary w-100" type="submit">Continuar → pergunta do retrabalho</button>
        </form>
      </div>
    </div>`;
  document.body.appendChild(box);
  const fechar = () => box.remove();
  document.getElementById('lancar-x').onclick = fechar;
  box.querySelectorAll('.casa-chip input').forEach(cb => { cb.onchange = () => cb.closest('.casa-chip').classList.toggle('on', cb.checked); });
  document.getElementById('lancar-form').onsubmit = ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const data = String(fd.get('data') || '');
    if (!OPERACAO.dia(data)) { toast('Informe a data da entrega.', 'error'); return; }
    const equipe = fd.getAll('equipe').map(String).filter(Boolean);
    fechar();
    perguntarRetrabalho(os, () => {
      if (equipe.length) os.equipe = equipe;
      os.entregaLancada = { em: nowISO(), por: (STATE.user && STATE.user.nome) || '', data };
      os.atualizadoEm = nowISO(); os.atualizadoPor = (STATE.user && STATE.user.nome) || '';
      STORE.saveOS(os);
      toast(`Entrega da O.S ${os.numero || ''} lançada.`, 'success');
      renderEntregas();
    });
  };
}

function renderEntregas() {
  const el = document.getElementById('panel-entregas');
  if (!el) return;
  const todas = STORE.getAllOS();
  const cls = classificarEntregas(todas);
  const contam = cls.instalacoes.concat(cls.retiradas);   // valor: instalações + retiradas
  const hoje = OPERACAO.dia(new Date());
  const f = periodoOuMes('_fEnt');
  const tecnico = STATE._entTecnico || '';
  const tipo = STATE._entTipo || '';
  if (!STATE._entVista) STATE._entVista = 'tabela';

  // KPIs fixos: hoje, mês, ano — independem dos filtros da lista.
  const kpi = (de, ate) => {
    const l = contam.filter(o => OPERACAO.emIntervalo(diaEntrega(o), de, ate));
    const inst = l.filter(o => !OPERACAO.interno(o)).length;
    return { n: inst, retiradas: l.length - inst, ...somaValores(l) };
  };
  const kHoje = kpi(hoje, hoje), kMes = kpi(hoje.slice(0, 7) + '-01', hoje), kAno = kpi(hoje.slice(0, 4) + '-01-01', hoje);

  // Lista filtrada
  const lista = contam
    .filter(o => OPERACAO.emIntervalo(diaEntrega(o), f.de, f.ate))
    .filter(o => !tecnico || OPERACAO.equipe(o).includes(tecnico))
    .filter(o => !tipo || String(o.servico || '').trim() === tipo)
    .sort((a, b) => String(b.finalizadaEm).localeCompare(String(a.finalizadaEm)));
  const tot = somaValores(lista);
  const aLancar = cls.aLancar.filter(o => OPERACAO.emIntervalo(o.finalizadaEm, f.de, f.ate))
    .sort((a, b) => String(b.finalizadaEm).localeCompare(String(a.finalizadaEm)));
  const tecnicosDaOS = o => OPERACAO.equipe(o).join(', ');

  const tecnicos = [...new Set(contam.flatMap(o => OPERACAO.equipe(o)))].sort((a, b) => a.localeCompare(b));
  const tipos = typeof tiposServicoHist === 'function' ? tiposServicoHist() : [];
  const opt = (v, sel) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(v)}</option>`;
  const kpiHTML = (k, rotulo) => `<div class="casa-kpi ${k.semValor ? 'alerta' : ''}">
      <b>${dinheiroCasa(k.total)}</b>
      <small>${esc(rotulo)} · <strong>${k.n}</strong> entrega${k.n === 1 ? '' : 's'} realizada${k.n === 1 ? '' : 's'}${k.retiradas ? ` · ${k.retiradas} retirada${k.retiradas === 1 ? '' : 's'} (só valor)` : ''}${k.semValor ? ` · <span class="badge sem-valor">${k.semValor} sem valor</span>` : ''}</small>
    </div>`;

  const linhaValor = os => {
    const v = valorDaOS(os);
    return v == null ? '<span class="badge sem-valor">sem valor</span>' : dinheiroCasa(v);
  };
  const dataBR = iso => { const d = OPERACAO.dia(iso); return d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(2, 4) : '—'; };
  const tabela = `<div class="casa-tabela-wrap"><table class="casa-tabela">
    <thead><tr><th>O.S</th><th>Cliente</th><th>Serviço</th><th>Técnicos</th><th>Conclusão</th><th class="num">Valor</th></tr></thead>
    <tbody>${lista.map(os => `<tr data-os-id="${esc(os.id)}">
        <td><strong>${esc(os.numero || '—')}</strong>${OPERACAO.interno(os) ? ' <span class="badge st-finalizada" title="Só o valor conta; retirada não é entrega realizada">Retirada</span>' : ''}${os.entregaLancada ? ` <span class="badge st-confirmada" title="Baixada pelo ERP e lançada à mão por ${esc(os.entregaLancada.por || '')}">lançada</span>` : ''}${os.retrabalho ? ' <span class="badge st-retrabalho">Retrabalho</span>' : ''}</td>
        <td>${esc(os.cliente || '')}</td>
        <td>${esc(os.servico || '—')}</td>
        <td>${esc(OPERACAO.equipe(os).join(', ') || (OPERACAO.interno(os) ? 'balcão' : 'sem equipe'))}</td>
        <td>${dataBR(diaEntrega(os))}</td>
        <td class="num">${linhaValor(os)}</td>
      </tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="5">${lista.length} O.S no período${tot.semValor ? ` · ${tot.semValor} sem valor` : ''}</td><td class="num">${dinheiroCasa(tot.total)}</td></tr></tfoot>
  </table></div>`;
  const cardFn = typeof osCardHTML === 'function' ? osCardHTML : null;
  const cards = cardFn ? `<div class="cards-grid">${lista.map(cardFn).join('')}</div>` : tabela;

  el.innerHTML = `
    <div class="casa-pagina">
      <div class="casa-pagina-head">
        <div><h2>Entregas</h2><p>Finalizada no PCP = entrega (valor + realizada). Cliente retira = só o valor. Baixada pelo ERP = só depois de lançada à mão, abaixo. Valor vem do cache do Painel${STORE.valoresEm && STORE.valoresEm() ? ` (${new Date(STORE.valoresEm()).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})` : ' — ainda sem valores neste aparelho'}.</p></div>
      </div>
      <div class="casa-kpi-cards">${kpiHTML(kHoje, 'entregue hoje')}${kpiHTML(kMes, 'entregue no mês')}${kpiHTML(kAno, 'entregue no ano')}</div>
      <div class="filter-bar">${filtroPeriodoHTML('_fEnt')}</div>
      <div class="casa-filtros">
        <label>Técnico <select id="ent-tecnico"><option value="">Todos</option>${tecnicos.map(t => opt(t, tecnico)).join('')}</select></label>
        <label>Tipo de serviço <select id="ent-tipo"><option value="">Todos</option>${tipos.map(t => opt(t, tipo)).join('')}</select></label>
        <span class="casa-vista"><button class="btn-ghost btn-sm ${STATE._entVista === 'tabela' ? 'active' : ''}" data-ent-vista="tabela">Tabela</button><button class="btn-ghost btn-sm ${STATE._entVista === 'cards' ? 'active' : ''}" data-ent-vista="cards">Cards</button></span>
      </div>
      ${lista.length ? (STATE._entVista === 'cards' ? cards : tabela) : emptyState('', 'Nenhuma entrega registrada no período', 'Finalizar a O.S no PCP registra a entrega. Baixas do ERP ficam na lista abaixo até serem lançadas.')}
      <section class="casa-prod-box casa-lancar">
        <h3>Lançamento manual — baixadas pelo ERP fora do sistema · ${aLancar.length}</h3>
        <p>O ERP marcou entregue, mas ninguém finalizou no PCP. Não conta como entrega até alguém lançar: confirme data e equipe e responda se gerou retrabalho.</p>
        ${aLancar.length ? `<div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>O.S</th><th>Cliente</th><th>Serviço</th><th>Técnicos</th><th>Baixa ERP</th><th class="num">Valor</th><th></th></tr></thead><tbody>${aLancar.map(os => `<tr>
            <td><strong>${esc(os.numero || '—')}</strong></td><td>${esc(os.cliente || '')}</td><td>${esc(os.servico || '—')}</td><td>${esc(tecnicosDaOS(os) || 'sem equipe')}</td><td>${dataBR(os.finalizadaEm)}</td><td class="num">${linhaValor(os)}</td>
            <td><button class="btn-primary btn-xs edit-only" data-lancar-os="${esc(os.id)}">Lançar entrega</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="text-muted">Nada pendente de lançamento neste período.</p>'}
      </section>
    </div>`;
  wireFiltroPeriodo(el, '_fEnt', renderEntregas);
  const selT = document.getElementById('ent-tecnico'); if (selT) selT.onchange = () => { STATE._entTecnico = selT.value; renderEntregas(); };
  const selS = document.getElementById('ent-tipo'); if (selS) selS.onchange = () => { STATE._entTipo = selS.value; renderEntregas(); };
  el.querySelectorAll('[data-lancar-os]').forEach(b => b.onclick = () => lancarEntregaManual(b.dataset.lancarOs));
  el.querySelectorAll('[data-ent-vista]').forEach(b => b.onclick = () => { STATE._entVista = b.dataset.entVista; renderEntregas(); });
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

// Produtividade por pessoa: O.S concluídas, valor entregue (participação: quem
// estava na equipe leva o valor inteiro — não é rateio nem bônus), tempo médio
// saída→retorno e o destaque da semana. Chave é a ficha do RH quando o apelido
// está ligado; senão o próprio apelido, marcado "sem ficha".
function produtividadeHTML() {
  const f = periodoOuMes('_fPerf');
  const concl = classificarEntregas(STORE.getAllOS()).instalacoes;   // retirada não é entrega; baixa do ERP só se lançada
  const noPeriodo = concl.filter(o => OPERACAO.emIntervalo(diaEntrega(o), f.de, f.ate));
  const agrupar = lista => {
    const m = new Map();
    for (const os of lista) {
      const v = valorDaOS(os), h = OPERACAO.horas(os);
      for (const ap of OPERACAO.equipe(os)) {
        const p = nomeExibicaoCasa(ap);
        const d = m.get(p.chave) || { ...p, os: 0, valor: 0, semValor: 0, horas: [], retrab: 0, erp: 0 };
        d.os++; if (v == null) d.semValor++; else d.valor += v; if (h != null) d.horas.push(h); if (os.retrabalho) d.retrab++; if (os.entregaLancada) d.erp++;
        m.set(p.chave, d);
      }
    }
    return [...m.values()].sort((a, b) => b.valor - a.valor || b.os - a.os || a.nome.localeCompare(b.nome));
  };
  const pessoas = agrupar(noPeriodo);
  const sem = semanaAtualCasa();
  const daSemana = agrupar(concl.filter(o => OPERACAO.emIntervalo(diaEntrega(o), sem.de, sem.ate)));
  const destaque = daSemana.length && daSemana[0].valor > 0 ? daSemana[0] : null;
  const semEquipe = noPeriodo.filter(o => !OPERACAO.equipe(o).length).length;
  const media = hs => hs.length ? (hs.reduce((a, b) => a + b, 0) / hs.length) : null;
  const fmtH = h => h == null ? '—' : (h < 1 ? Math.round(h * 60) + ' min' : (Math.round(h * 10) / 10).toString().replace('.', ',') + ' h');
  const cards = pessoas.map(p => `<div class="casa-prod ${destaque && destaque.chave === p.chave ? 'destaque' : ''}">
      ${destaque && destaque.chave === p.chave ? '<span class="casa-destaque">★ Destaque da semana</span>' : ''}
      <div class="casa-avatar" aria-hidden="true">${esc(iniciaisCasa(p.nome))}</div>
      <div>
        <div class="casa-prod-nome">${esc(p.nome)}<small>${p.id ? 'ID ' + esc(p.id) : 'sem ficha do RH'}</small></div>
        <dl>
          <dt>Entregas realizadas</dt><dd>${p.os}${p.erp ? ` <small>(${p.erp} lançada${p.erp === 1 ? '' : 's'})</small>` : ''}${p.retrab ? ` <small>(${p.retrab} retrab.)</small>` : ''}</dd>
          <dt>Valor entregue</dt><dd>${dinheiroCasa(p.valor)}${p.semValor ? ` <span class="badge sem-valor">${p.semValor} s/ valor</span>` : ''}</dd>
          <dt>Tempo médio</dt><dd>${fmtH(media(p.horas))}${p.horas.length && p.horas.length < p.os ? ` <small>(${p.horas.length} c/ hora)</small>` : ''}</dd>
        </dl>
      </div>
    </div>`).join('');
  return `<section class="casa-prod-box">
      <h3>Produtividade</h3>
      <p>Quem estava na equipe da instalação entregue (finalizada no PCP, ou baixa do ERP lançada à mão). Retirada não é entrega. Valor é participação (não divide, não é bônus). Tempo = saída → retorno registrados na O.S.</p>
      <div class="filter-bar">${filtroPeriodoHTML('_fPerf')}</div>
      ${destaque ? `<p class="metricas-nota">★ Destaque da semana (${sem.de.slice(8, 10)}/${sem.de.slice(5, 7)} a ${sem.ate.slice(8, 10)}/${sem.ate.slice(5, 7)}): <strong>${esc(destaque.nome)}</strong>, ${dinheiroCasa(destaque.valor)} em ${destaque.os} O.S.</p>` : ''}
      ${semEquipe ? `<p class="metricas-nota">${semEquipe} O.S no período sem equipe registrada — não contam para ninguém.</p>` : ''}
      ${pessoas.length ? `<div class="casa-prod-grid">${cards}</div>` : emptyState('', 'Nenhuma entrega com equipe no período', 'A O.S precisa ter equipe e ser finalizada no PCP.')}
    </section>`;
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
      ${produtividadeHTML()}
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
  wireFiltroPeriodo(el, '_fPerf', renderPerformanceCasa);
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

const TIPOS_PLANTAO = { diarista: 'Diarista', sobreaviso: 'Sobreaviso', folga: 'Folga' };
function pillPlantao(p) {
  const t = TIPOS_PLANTAO[p.tipo] ? p.tipo : '';
  return `<span class="casa-pill ${t || 'navy'}" title="${esc(p.quem || '')}${p.obs ? ' — ' + esc(p.obs) : ''}">${t ? esc(TIPOS_PLANTAO[t]) : 'plantão'}</span>`;
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
  const todas = STORE.getAllOS();
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
    const doDia = osMes.filter(o => diasCasa(o).includes(iso)).sort((a, b) => String(a.numero).localeCompare(String(b.numero)));
    const nums = doDia.slice(0, 3).map(o => esc(o.numero || '—'));
    const resto = doDia.length - nums.length;
    const pls = agenda.plantoes.filter(p => p.data === iso && !p.cancelado);
    const nEv = agenda.eventos.filter(e => e.data === iso).length;
    const pills = [
      nums.length && `<span class="casa-pill os">${nums.join(' · ')}${resto > 0 ? ` +${resto}` : ''}</span>`,
      ...pls.slice(0, 2).map(pillPlantao),
      pls.length > 2 && `<span class="casa-pill navy">+${pls.length - 2}</span>`,
      nEv && `<span class="casa-pill mute">${nEv} ev.</span>`,
    ].filter(Boolean).join('');
    return `<button type="button" class="casa-dia ${noMes ? '' : 'fora'} ${iso === sel ? 'sel' : ''}" data-dia="${iso}" title="${doDia.length} O.S">
      <span>${dt.getDate()}</span>
      <span class="casa-dia-pills">${pills}</span>
    </button>`;
  }).join('');

  const osDia = osMes.filter(o => diasCasa(o).includes(sel)).sort((a, b) => (typeof ordemHora === 'function' ? ordemHora(a).localeCompare(ordemHora(b)) : 0));
  const plDia = agenda.plantoes.filter(p => p.data === sel && !p.cancelado);
  const evDia = agenda.eventos.filter(e => e.data === sel);
  const dSel = new Date(sel + 'T12:00:00');
  const dataBR = `${(typeof DIAS_SEMANA !== 'undefined' ? DIAS_SEMANA[dSel.getDay()] : '')} ${sel.slice(8, 10)}/${sel.slice(5, 7)}`;
  const cfg = STORE.getCFG();
  const hoje = OPERACAO.dia(new Date());
  // O.S que dá para colocar neste dia: aberta, não interna, ainda não neste dia.
  const candidatas = todas.filter(o => !o.finalizadaEm && !OPERACAO.interno(o) && !diasCasa(o).includes(sel))
    .sort((a, b) => (OPERACAO.prazo(a) || '9999').localeCompare(OPERACAO.prazo(b) || '9999') || String(b.numero).localeCompare(String(a.numero)));
  const conflitosDia = OPERACAO.conflitos(todas, sel);
  const statusHTML = os => { const st = OPERACAO.status(os); return `<span class="badge st-${st}">${esc(typeof statusLabelDe === 'function' ? statusLabelDe(os, st) : st)}</span>`; };

  el.innerHTML = `
    <div class="casa-pagina">
      <div class="casa-pagina-head">
        <div><h2>Calendário da produção</h2><p>Cada dia mostra as O.S programadas e os plantões. Clique no dia para ver, programar e mandar a mensagem.</p></div>
        <label class="casa-mes">Mês <input type="month" id="ag-mes" value="${esc(mes)}"></label>
      </div>
      <div class="casa-agenda">
        <div>
          <div class="casa-cal-dow">${dow.map(d => `<span>${d}</span>`).join('')}</div>
          <div class="casa-cal">${grade}</div>
          <p class="metricas-nota"><span class="casa-pill diarista">Diarista</span> <span class="casa-pill sobreaviso">Sobreaviso</span> <span class="casa-pill folga">Folga</span> — plantões vêm da aba Plantões.</p>
        </div>
        <aside class="casa-dia-painel">
          <h3>${esc(dataBR)}${sel === hoje ? ' · hoje' : ''}</h3>
          <p>${osDia.length} O.S · ${plDia.length} plantão · ${evDia.length} evento${conflitosDia.length ? ` · <strong>${conflitosDia.length} possível conflito</strong>` : ''}</p>
          <div>${osDia.map(os => `<div class="casa-dia-item" data-os-id="${esc(os.id)}">
              <div class="l1"><span>⏰ ${esc(typeof rotuloHora === 'function' ? rotuloHora(os) : '')}</span><span>O.S ${esc(os.numero || '—')}</span><span>${esc(os.cliente || '')}</span>${statusHTML(os)}</div>
              <div class="l2"><span>👥 ${esc(OPERACAO.equipe(os).join(', ') || 'sem equipe')}</span><span>🚗 ${esc(os.veiculo || 'sem veículo')}</span>${os.servico ? `<span>${esc(os.servico)}</span>` : ''}</div>
            </div>`).join('') || '<p class="text-muted">Nenhuma O.S neste dia.</p>'}</div>
          ${plDia.length ? `<ul class="casa-os">${plDia.map(p => `<li>${pillPlantao(p)} ${esc(p.quem)} · ${esc(p.inicio)}–${esc(p.fim)}${p.titulo ? ' · ' + esc(p.titulo) : ''}</li>`).join('')}</ul>` : ''}
          ${evDia.length ? `<ul class="casa-os">${evDia.map(e => `<li>${esc(e.titulo)} <button class="btn-ghost btn-xs edit-only" data-del-ev="${esc(e.id)}">Apagar</button></li>`).join('')}</ul>` : ''}
          <div class="casa-dia-acoes">
            <button class="btn-ghost btn-sm" id="ag-wpp" ${osDia.length ? '' : 'disabled'} title="Mensagem da programação do dia">💬 Mensagem do dia</button>
            <button class="btn-ghost btn-sm" id="ag-pdf" ${osDia.length ? '' : 'disabled'} title="Relatório do dia em PDF">🖨 PDF do dia</button>
          </div>
          <details class="casa-add-os edit-only" ${STATE._agAddAberto ? 'open' : ''}>
            <summary>+ Adicionar O.S ao dia</summary>
            <form id="ag-add">
              <label>O.S <select name="osId" required><option value="">— escolher —</option>${candidatas.slice(0, 200).map(o => `<option value="${esc(o.id)}">${esc(o.numero || '—')} — ${esc((o.cliente || '').slice(0, 34))}${OPERACAO.prazo(o) ? ' · prazo ' + OPERACAO.prazo(o).slice(8, 10) + '/' + OPERACAO.prazo(o).slice(5, 7) : ''}</option>`).join('')}</select></label>
              <div class="linha2">
                <label>Período <select name="periodo">${(typeof PERIODO_OPTS !== 'undefined' ? PERIODO_OPTS : ['Manhã', 'Tarde', 'Dia inteiro', 'Horário']).map(o => `<option>${esc(o)}</option>`).join('')}</select></label>
                <label>Hora de saída <input name="hora" type="time"></label>
              </div>
              <div class="linha2">
                <label>Duração (dias) <input name="dias" type="number" min="1" value="1"></label>
                <label>Veículo <select name="veiculo"><option value="">— sem veículo —</option>${(cfg.veiculos || []).map(v => `<option>${esc(v)}</option>`).join('')}</select></label>
              </div>
              <label>Equipe <div class="casa-chips">${(cfg.instaladores || []).map(n => `<label class="casa-chip"><input type="checkbox" name="equipe" value="${esc(n)}"><span>${esc(n)}</span></label>`).join('') || '<span class="text-muted">Cadastre instaladores em Configurações.</span>'}</div></label>
              <button class="btn-primary btn-sm" type="submit">Programar neste dia</button>
            </form>
          </details>
          <form id="ag-form" class="casa-criterios edit-only">
            <label>Evento neste dia <input name="titulo" required placeholder="Título"></label>
            <input type="hidden" name="data" value="${esc(sel)}">
            <button class="btn-ghost btn-sm" type="submit">Registrar evento</button>
          </form>
        </aside>
      </div>
    </div>`;
  const mesEl = document.getElementById('ag-mes');
  if (mesEl) mesEl.onchange = () => { if (mesEl.value) { STATE._agMes = mesEl.value; STATE._agDia = ''; renderAgendaCasa(); } };
  el.querySelectorAll('[data-dia]').forEach(btn => { btn.onclick = () => { STATE._agDia = btn.dataset.dia; renderAgendaCasa(); }; });
  const wpp = document.getElementById('ag-wpp'); if (wpp) wpp.onclick = () => { if (typeof whatsappServicosDia === 'function') whatsappServicosDia(sel); };
  const pdf = document.getElementById('ag-pdf'); if (pdf) pdf.onclick = () => { if (typeof relatorioServicosDia === 'function') relatorioServicosDia(sel); };
  const add = el.querySelector('.casa-add-os'); if (add) add.ontoggle = () => { STATE._agAddAberto = add.open; };
  el.querySelectorAll('.casa-chip input[name="equipe"]').forEach(cb => { cb.onchange = () => cb.closest('.casa-chip').classList.toggle('on', cb.checked); });
  const fAdd = document.getElementById('ag-add');
  if (fAdd) fAdd.onsubmit = ev => {
    ev.preventDefault();
    const fd = new FormData(fAdd);
    const os = STORE.getOS(String(fd.get('osId') || ''));
    if (!os) { toast('Escolha a O.S.', 'error'); return; }
    const periodo = String(fd.get('periodo') || 'Manhã');
    const hora = String(fd.get('hora') || '');
    if (periodo === 'Horário' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) { toast('Período "Horário" pede a hora.', 'error'); return; }
    const equipe = fd.getAll('equipe').map(String).filter(Boolean);
    os.instalacao = Object.assign({}, os.instalacao || {}, { data: sel, periodo, hora, duracaoDias: Math.max(1, Number(fd.get('dias')) || 1) });
    if (equipe.length) os.equipe = equipe;
    const veiculo = String(fd.get('veiculo') || ''); if (veiculo) os.veiculo = veiculo;
    os.atualizadoEm = new Date().toISOString();
    os.atualizadoPor = (STATE.user && STATE.user.nome) || '';
    STORE.saveOS(os);
    const conf = OPERACAO.conflitos(STORE.getAllOS(), sel).filter(c => c.a.id === os.id || c.b.id === os.id);
    if (conf.length) toast(`Programada, mas com possível conflito: ${conf.map(c => [...c.equipe, c.veiculo].filter(Boolean).join(', ')).join(' · ')} já está em outra O.S neste turno.`, 'error');
    else toast(`O.S ${os.numero || ''} programada para ${sel.slice(8, 10)}/${sel.slice(5, 7)}.`, 'success');
    STATE._agAddAberto = false;
    renderAgendaCasa();
  };
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
        <label>Tipo <select name="tipo">${Object.entries(TIPOS_PLANTAO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label>Quem <input name="quem" list="pl-nomes" required></label>
        <datalist id="pl-nomes">${instaladores.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <label>Início <input name="inicio" type="time" value="08:00" required></label>
        <label>Fim <input name="fim" type="time" value="12:00" required></label>
        <label>Observação <input name="obs" placeholder="opcional"></label>
        <button class="btn-primary btn-sm" type="submit">Registrar plantão</button>
      </form>
      <table class="casa-tabela">
        <thead><tr><th>Data</th><th>Tipo</th><th>Quem</th><th>Horário</th><th>Título / obs.</th><th></th></tr></thead>
        <tbody>${lista.map(p =>
          `<tr class="${p.data < hoje ? 'passado' : ''}">
            <td>${esc(p.data.slice(8, 10) + '/' + p.data.slice(5, 7) + '/' + p.data.slice(0, 4))}</td>
            <td>${pillPlantao(p)}</td>
            <td>${esc(p.quem)}</td>
            <td class="num">${esc(p.inicio)}–${esc(p.fim)}</td>
            <td>${esc(p.titulo)}${p.obs ? ` <small class="text-muted">— ${esc(p.obs)}</small>` : ''}</td>
            <td><button class="btn-ghost btn-xs" data-del-pl="${esc(p.id)}">Apagar</button></td>
          </tr>`
        ).join('') || '<tr><td colspan="6" class="text-muted">Nenhum plantão registrado na produção. O RH não manda plantão para cá — cadastre acima.</td></tr>'}</tbody>
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
      tipo: TIPOS_PLANTAO[String(fd.get('tipo') || '')] ? String(fd.get('tipo')) : 'diarista',
      obs: String(fd.get('obs') || '').trim(),
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
