// Netlify Scheduled Function — /.netlify/functions/mubisys-sync
// Roda de hora em hora (agendamento definido no netlify.toml) e importa
// automaticamente as Ordens de Serviço NOVAS do Mubisys para o store "os".
//
// Reaproveita toda a lógica de busca/mapeamento da função mubisys.js: faz um
// POST interno em /.netlify/functions/mubisys (action: listarOS). Só precisa,
// aqui, montar a O.S completa (esqueleto igual ao novaOS() do app) e gravar
// as que ainda não existem (comparando pelo número).

// Functions 2.0 (ESM): o runtime injeta o contexto do Netlify Blobs sozinho —
// sem depender do BLOBS_TOKEN manual, que expira (derrubou o sync em 30/06/2026).
import { getStore } from '@netlify/blobs';

export default async () => {
  try {
    if (!process.env.TOKEN) return resp({ error: 'TOKEN não configurado' }, 500);

    // 1) Busca as O.S já mapeadas reusando a função mubisys.js
    const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
    if (!base) return resp({ error: 'URL do site indisponível' }, 500);

    const r = await fetch(`${base}/.netlify/functions/mubisys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-token': process.env.TOKEN },
      body: JSON.stringify({ action: 'listarOS' })
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data || data.error) {
      return resp({ error: (data && data.error) || `mubisys retornou HTTP ${r.status}` }, 502);
    }
    const remotas = Array.isArray(data.os) ? data.os : [];

    // 2) Coleta os números já existentes no store "os"
    const store = getStore('os');
    const keys = await allKeys(store);
    const atuais = await Promise.all(
      keys.map(k => store.get(k, { type: 'json' }).catch(() => null))
    );
    const existentes = new Set(atuais.filter(Boolean).map(o => String(o.numero)));

    // 3) Grava as novas
    let novas = 0;
    let semNumero = 0;
    for (const remoto of remotas) {
      const num = remoto && remoto.numero ? String(remoto.numero).trim() : '';
      if (!num) { semNumero++; continue; } // sem número não dá pra deduplicar com segurança
      if (existentes.has(num)) continue;
      const os = montarOSImportada(remoto);
      // Id DETERMINÍSTICO pelo número: o Netlify às vezes dispara execuções
      // agendadas em paralelo/repetidas — com uuid aleatório cada execução
      // criava uma cópia da mesma O.S. Com a mesma chave, escrever 2x é inócuo.
      os.id = 'mub-' + num;
      await store.setJSON(os.id, os);
      existentes.add(num);
      novas++;
    }
    if (semNumero) console.warn(`[mubisys-sync] ${semNumero} O.S sem número foram ignoradas.`);

    // 4) Faxina anti-duplicata: se alguma cópia repetida do mesmo número entrou
    // por QUALQUER caminho (execução paralela, app desatualizado, fila offline),
    // remove os esqueletos intocados — NUNCA apaga ficha com trabalho humano.
    const intocada = o => (o.atualizadoPor || 'Mubisys (auto)') === 'Mubisys (auto)'
      && (o.criadoPor || '') === 'Mubisys (auto)'
      && !o.liberadoPCP && !o.finalizadaEm && !o.carroLiberado
      && !(o.fotosCheckinIds || []).length && !(o.fotosRetornoIds || []).length && !o.layoutFotoId
      && !(o.equipe || []).length && !o.confirmacao && !o.horaSaida
      && !(o.itens || []).some(i => i && (i.pronto || i.reprovado));
    const porNumero = new Map();
    for (const o of atuais.filter(Boolean)) {
      const n = String(o.numero || '').trim();
      if (!n) continue;
      if (!porNumero.has(n)) porNumero.set(n, []);
      porNumero.get(n).push(o);
    }
    let duplicatasRemovidas = 0;
    for (const [n, copias] of porNumero) {
      if (copias.length < 2) continue;
      const temTocada = copias.some(o => !intocada(o));
      // Se há cópia trabalhada, todos os esqueletos saem; se são todos
      // esqueletos, mantém o de id canônico (mub-<numero>) ou o mais antigo.
      const manter = temTocada ? null
        : (copias.find(o => o.id === 'mub-' + n)
           || copias.slice().sort((a, b) => String(a.criadoEm || '').localeCompare(String(b.criadoEm || '')))[0]);
      for (const o of copias) {
        if (!intocada(o)) continue;
        if (manter && o.id === manter.id) continue;
        await store.delete(o.id).catch(() => {});
        duplicatasRemovidas++;
      }
    }
    if (duplicatasRemovidas) console.log(`[mubisys-sync] faxina: ${duplicatasRemovidas} duplicata(s) removida(s).`);

    // 5) Batimento cardíaco: registra a execução para o painel de saúde do app.
    await getStore('integracoes').setJSON('sync_status', {
      em: new Date().toISOString(), ok: true, novas, total: remotas.length, duplicatasRemovidas
    }).catch(() => {});

    console.log(`[mubisys-sync] ${novas} O.S nova(s) de ${remotas.length} encontradas.`);
    return resp({ ok: true, novas, total: remotas.length, duplicatasRemovidas });
  } catch (e) {
    console.error('[mubisys-sync] erro:', e);
    // Registra a falha para o painel de saúde (se o Blobs estiver de pé).
    try {
      await getStore('integracoes').setJSON('sync_status', {
        em: new Date().toISOString(), ok: false, erro: String((e && e.message) || e)
      });
    } catch {}
    return resp({ error: e.message || 'Erro interno' }, 500);
  }
};

// Esqueleto idêntico ao novaOS() do app, preenchido com os campos do Mubisys.
function montarOSImportada(remoto) {
  const agora = new Date().toISOString();
  const os = {
    id: uuid(),
    numero: '',
    tipo: 'externo', // sobrescrito abaixo pela logística do pedido, quando houver
    criadoEm: agora,
    criadoPor: 'Mubisys (auto)',
    atualizadoEm: agora,
    atualizadoPor: 'Mubisys (auto)',
    cliente: '', contato: '', whatsapp: '', cnpjCpf: '', endereco: '',
    servico: '', vendedor: '', dataEntrada: '', previsaoEntrega: '',
    responsavelPCP: '', obsPCP: '', layoutFotoId: '', liberadoPCP: false, aptoPor: '', aptoEm: '',
    acesso: '', fixacao: '', ferramentas: [], suprimentos: [], itens: [],
    instalacao: { data: '', periodo: '', hora: '', duracaoDias: 1 },
    equipe: [], veiculo: '', responsavelAgenda: [], obsAgenda: '',
    confirmacao: '', confCanal: '', confHora: '', confPor: '', confObs: '',
    confAcompanha: '', confAcompanhaContato: '',
    embarqueConferidoPor: '', produtosConferidosPor: '',
    ferramentasConferidas: false, ferramentasConferidasPor: '',
    carroLiberado: false, carroLiberadoPor: '', carroLiberadoEm: '',
    horaSaida: '', horaRetorno: '', kmSaida: '', kmRetorno: '', instalacaoOK: false, conferidoPor: '',
    retrabalho: false, problema: '', causa: '', resolvidoPor: '', dataResolvido: '',
    obsTecnicas: '', fotosCheckinIds: [], fotosRetornoIds: [], checkinGPS: null,
    checkout: { situacao: '', hora: '', por: '', obs: '', confirmado: false },
    finalizadaEm: '', finalizadoPor: ''
  };

  ['numero', 'servico', 'vendedor', 'dataEntrada', 'previsaoEntrega', 'cliente', 'contato', 'whatsapp', 'cnpjCpf', 'endereco']
    .forEach(k => { if (remoto[k]) os[k] = remoto[k]; });
  if (remoto.tipo === 'interno' || remoto.tipo === 'externo') os.tipo = remoto.tipo;
  if (remoto.observacao) os.obsPCP = remoto.observacao;
  if (remoto.instalacao) os.instalacao = Object.assign(os.instalacao, remoto.instalacao);
  if (Array.isArray(remoto.itens) && remoto.itens.length) os.itens = remoto.itens;
  // Sem hora de entrega o período fica em branco até o PCP agendar de verdade
  // (o default "Manhã" criava agendamento matinal fictício).
  os.origemMubisys = true;
  return os;
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function allKeys(store) {
  const keys = [];
  let cursor;
  let guard = 0;
  do {
    const page = await store.list(cursor ? { cursor } : undefined);
    if (page && Array.isArray(page.blobs)) {
      for (const b of page.blobs) keys.push(b.key);
    }
    cursor = page && page.cursor;
    if (++guard > 5000) { console.warn('[mubisys-sync] allKeys: guard atingido'); break; }
  } while (cursor);
  return keys;
}

function resp(data, status = 200) {
  return Response.json(data, { status });
}
