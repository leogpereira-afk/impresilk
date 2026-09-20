// Regras puras usadas pelas portas de dados e pelos testes de regressão.
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const objeto = v => v && typeof v === 'object' && !Array.isArray(v);
const proprio = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
export const CAMPOS_ERP = ['cliente','servico','vendedor','dataEntrada','cnpjCpf','valorTotal'];
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
    registro.erpConferirEm = em;
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
export function pertenceEquipe(os, nome) {
  const normal = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  return !!nome && (os?.equipe || []).some(n => normal(n) === normal(nome));
}
export function validarConclusao(os, anterior, papel) {
  if (!os.finalizadaEm || anterior?.finalizadaEm || os.tipo === 'interno') return '';
  const faltas = [];
  if (!(os.fotosRetornoIds || []).length) faltas.push('foto do serviço concluído');
  if (!os.retornoEm) faltas.push('data e hora do retorno');
  if (faltas.length && !(['admin','pcp'].includes(papel) && String(os.justificativaConclusao || '').trim().length >= 15)) return 'Para concluir: ' + faltas.join(', ') + '. A gestão pode registrar uma justificativa de exceção.';
  return '';
}
// Validação da apuração operacional; nenhum lançamento de folha é criado.
export function validarPerformance(cfg) {
  if (cfg == null) return '';
  if (typeof cfg !== 'object' || !Array.isArray(cfg.equipes) || !Array.isArray(cfg.participacoes)) return 'Estrutura de performance inválida.';
  const texto = (s,n) => typeof s === 'string' && s.trim().length > 0 && s.length <= n;
  const distintos = xs => new Set(xs.map(x=>x?.id)).size === xs.length;
  if (cfg.equipes.length > 300 || cfg.participacoes.length > 20000 || !distintos(cfg.equipes) || !distintos(cfg.participacoes)) return 'Registros de performance repetidos ou acima do limite.';
  const membrosOK = ms => Array.isArray(ms) && ms.length > 0 && ms.length <= 50 && ms.every(p=>p && texto(p.chave,150) && texto(p.nome,150)) && new Set(ms.map(p=>p.chave)).size === ms.length;
  for (const e of cfg.equipes) {
    if (!e || !texto(e.id,150) || !texto(e.nome,60) || !['🦅','🚀','🎯','🛡️','⚡','🦁','🏔️','🤝'].includes(e.emblema) || !membrosOK(e.membros)) return 'Equipe inválida. Confira nome, emblema e integrantes.';
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
