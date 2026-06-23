// Netlify Scheduled Function — /.netlify/functions/mubisys-sync
// Roda de hora em hora (agendamento definido no netlify.toml) e importa
// automaticamente as Ordens de Serviço NOVAS do Mubisys para o store "os".
//
// Reaproveita toda a lógica de busca/mapeamento da função mubisys.js: faz um
// POST interno em /.netlify/functions/mubisys (action: listarOS). Só precisa,
// aqui, montar a O.S completa (esqueleto igual ao novaOS() do app) e gravar
// as que ainda não existem (comparando pelo número).

const { getStore } = require('@netlify/blobs');

function blobStore(name) {
  const siteID = process.env.BLOBS_SITE_ID;
  const token  = process.env.BLOBS_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token });
  return getStore(name);
}

exports.handler = async () => {
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
    const store = blobStore('os');
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
      await store.setJSON(os.id, os);
      existentes.add(num);
      novas++;
    }
    if (semNumero) console.warn(`[mubisys-sync] ${semNumero} O.S sem número foram ignoradas.`);

    console.log(`[mubisys-sync] ${novas} O.S nova(s) de ${remotas.length} encontradas.`);
    return resp({ ok: true, novas, total: remotas.length });
  } catch (e) {
    console.error('[mubisys-sync] erro:', e);
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
  if (!os.instalacao.periodo) os.instalacao.periodo = 'Manhã';
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
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  };
}
