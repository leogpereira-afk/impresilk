// Netlify Function — endpoint /.netlify/functions/mubisys
// Integra com a API do Mubisys para importar Ordens de Serviço automaticamente.
//
// As credenciais são cadastradas DENTRO do app (Painel de Controle → Integração
// Mubisys) e ficam guardadas num store separado do Netlify Blobs ("integracoes"),
// que NUNCA é enviado para os clientes — assim o Access-Token não vaza para os
// celulares dos funcionários. Também aceita variáveis de ambiente como fallback:
//   MUBISYS_PUBLIC_KEY, MUBISYS_TOKEN, MUBISYS_BASE
//
// A chamada do próprio app é protegida pelo mesmo TOKEN já usado em os.js.

const { getStore } = require('@netlify/blobs');

const DEFAULT_BASE = 'https://api.mubisys.com/api';

function blobStore(name) {
  const siteID = process.env.BLOBS_SITE_ID;
  const token  = process.env.BLOBS_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token });
  return getStore(name);
}

// Resolve as credenciais: primeiro o cadastro feito no app, depois env vars.
async function getCreds() {
  let cfg = null;
  try { cfg = await blobStore('integracoes').get('mubisys', { type: 'json' }); } catch {}
  cfg = cfg || {};
  return {
    publicKey:   cfg.publicKey   || process.env.MUBISYS_PUBLIC_KEY || '',
    accessToken: cfg.accessToken || process.env.MUBISYS_TOKEN || '',
    base:        ((cfg.base || process.env.MUBISYS_BASE || DEFAULT_BASE)).replace(/\/+$/, ''),
    status:      cfg.status || 'PRODUCAO'
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return resp({ error: 'Method not allowed' }, 405);

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return resp({ error: 'JSON inválido' }, 400); }

  // Autenticação do app (mesma de os.js)
  const token = (event.headers && event.headers['x-token']) || body.token;
  if (!process.env.TOKEN || token !== process.env.TOKEN) {
    return resp({ error: 'Não autorizado' }, 401);
  }

  const { action } = body;

  try {
    // ── salvarConfig: cadastra/atualiza as credenciais (vindas do app) ────────
    if (action === 'salvarConfig') {
      const store = blobStore('integracoes');
      const atual = (await store.get('mubisys', { type: 'json' }).catch(() => null)) || {};
      const novo = {
        publicKey: (body.publicKey != null ? String(body.publicKey).trim() : atual.publicKey) || '',
        // Se o token vier vazio, mantém o que já estava (permite editar só a publicKey)
        accessToken: (body.accessToken ? String(body.accessToken).trim() : atual.accessToken) || '',
        base: (body.base ? String(body.base).trim() : atual.base) || '',
        status: body.status || atual.status || 'PRODUCAO'
      };
      await store.setJSON('mubisys', novo);
      return resp({ ok: true });
    }

    // ── statusConfig: diz se está configurado (sem expor o token) ─────────────
    if (action === 'statusConfig') {
      const c = await getCreds();
      const t = c.accessToken || '';
      return resp({
        configurado: !!(c.publicKey && c.accessToken),
        publicKey: c.publicKey,
        base: c.base,
        status: c.status,
        tokenMascarado: t ? ('•'.repeat(Math.max(0, t.length - 4)) + t.slice(-4)) : ''
      });
    }

    // As demais ações exigem credenciais válidas
    const creds = await getCreds();
    if (!creds.publicKey || !creds.accessToken) {
      return resp({ error: 'Credenciais do Mubisys não cadastradas. Vá em Painel de Controle → Integração Mubisys.' }, 400);
    }
    const headers = { 'Access-Token': creds.accessToken, 'Accept': 'application/json' };
    const status  = body.status || creds.status;
    // A API exige um período. filtrodata: CADASTRO, PREV_ENTREGA, APROVACAO, ENTREGA, FATURAMENTO, CANCELAMENTO.
    const filtrodata = body.filtrodata || creds.filtrodata || 'CADASTRO';
    const { datainicial, datafinal } = janelaDatas(body);
    const urlOS = urlListaOS(creds, { status, filtrodata, datainicial, datafinal });

    switch (action) {

      // ── ping: confere se as credenciais batem ───────────────────────────────
      case 'ping': {
        const r = await fetch(urlOS, { headers });
        return resp({ ok: r.ok, http: r.status });
      }

      // ── preview: devolve uma amostra CRUA do Mubisys (para mapear os campos) ─
      case 'preview': {
        const r = await fetch(urlOS, { headers });
        const data = await r.json().catch(() => null);
        if (!r.ok) return resp({ error: `Mubisys retornou HTTP ${r.status}`, detalhe: data }, 502);
        const lista = extrairLista(data);
        return resp({ total: lista.length, periodo: { datainicial, datafinal, filtrodata }, amostra: lista.slice(0, 2) });
      }

      // ── listarOS: busca e já mapeia para o formato Impresilk ─────────────────
      case 'listarOS': {
        const r = await fetch(urlOS, { headers });
        const data = await r.json().catch(() => null);
        if (!r.ok) return resp({ error: `Mubisys retornou HTTP ${r.status}`, detalhe: data }, 502);
        const lista = extrairLista(data);
        return resp({ os: lista.map(mapearOS), total: lista.length });
      }

      // ── getOS: busca uma O.S pelo número e mapeia ────────────────────────────
      case 'getOS': {
        if (!body.numero) return resp({ error: 'numero ausente' }, 400);
        const url = `${creds.base}/${creds.publicKey}/ordem-servico/numero/${encodeURIComponent(body.numero)}`;
        const r = await fetch(url, { headers });
        const data = await r.json().catch(() => null);
        if (!r.ok) return resp({ error: `Mubisys retornou HTTP ${r.status}`, detalhe: data }, 502);
        return resp({ os: mapearOS(extrairUm(data)) });
      }

      default:
        return resp({ error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    return resp({ error: e.message || 'Erro interno' }, 500);
  }
};

// ── Período / URL da lista de O.S ────────────────────────────────────────────
// A API exige datainicial/datafinal (AAAA-MM-DD). Sem janela explícita do app,
// usamos ±180 dias em torno de hoje para pegar O.S recentes e próximas.
function ymd(d) { return d.toISOString().slice(0, 10); }
function janelaDatas(body) {
  if (body.datainicial && body.datafinal) {
    return { datainicial: body.datainicial, datafinal: body.datafinal };
  }
  const hoje = new Date();
  const ini = new Date(hoje); ini.setDate(ini.getDate() - 180);
  const fim = new Date(hoje); fim.setDate(fim.getDate() + 180);
  return { datainicial: ymd(ini), datafinal: ymd(fim) };
}
function urlListaOS(creds, { status, filtrodata, datainicial, datafinal }) {
  const q = new URLSearchParams({ status, filtrodata, datainicial, datafinal });
  return `${creds.base}/${creds.publicKey}/ordem-servico?${q.toString()}`;
}

// ── Helpers de extração ──────────────────────────────────────────────────────
// A API pode devolver { data: [...] }, { items: [...] } ou um array direto.
function extrairLista(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.items)) return data.items;
  if (data && Array.isArray(data.results)) return data.results;
  if (data && data.data) return [data.data];
  return [];
}
function extrairUm(data) {
  if (data && data.data && !Array.isArray(data.data)) return data.data;
  const l = extrairLista(data);
  return l[0] || data || {};
}

// Procura o primeiro campo existente entre vários nomes possíveis.
function pick(obj, ...keys) {
  if (!obj) return '';
  for (const k of keys) {
    const v = obj[k];
    if (v != null && v !== '') return v;
  }
  return '';
}

// dd/mm/yyyy (ou ISO) → yyyy-mm-dd. Também aceita "2026-06-29T14:00:00".
function isoData(str) {
  if (!str) return '';
  const s = String(str);
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}
function isoHora(str) {
  if (!str) return '';
  const m = String(str).match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '';
}

// ── Mapeamento Mubisys → O.S do Impresilk ────────────────────────────────────
// Nomes de campo confirmados via "preview" com dados reais da API.
function mapearOS(o) {
  o = o || {};
  const contato  = (Array.isArray(o.cliente_contato)  && o.cliente_contato[0])  || {};
  const endereco = (Array.isArray(o.cliente_endereco) && o.cliente_endereco[0]) || {};
  const entregaData = pick(o, 'data_entrega', 'dataEntrega');
  const entregaHora = pick(o, 'hora_entrega', 'horaEntrega');

  // Data de pedido/entrada = cadastro da O.S. Previsão de entrega: a API costuma
  // vir sem data_entrega, então calculamos a partir da aprovação + prazo (dias).
  const dataPedido = isoData(pick(o, 'data_cadastro', 'data_aprovacao'));
  const dataAprov  = isoData(pick(o, 'data_aprovacao', 'data_cadastro'));
  const prazoDias  = parsePrazoDias(pick(o, 'prazo'));
  const previsao   = isoData(entregaData) || addDias(dataAprov, prazoDias);

  return {
    numero:      String(pick(o, 'sequencial_ordem', 'numero', 'numeroOS', 'codigo') || ''),
    servico:     pick(o, 'nome_trabalho', 'referencia', 'titulo', 'descricao'),
    vendedor:    pick(o, 'vendedor', 'atendente', 'vendedorNome'),
    dataEntrada: dataPedido,
    previsaoEntrega: previsao,
    cliente:     typeof o.cliente === 'string' ? o.cliente : pick(o.cliente || {}, 'nome', 'razaoSocial'),
    contato:     pick(contato, 'nome_contato', 'nome', 'contato', 'responsavel'),
    whatsapp:    pick(contato, 'celular', 'telefone', 'whatsapp', 'fone'),
    cnpjCpf:     pick(o, 'cpf_cnpj', 'cpfcnpj', 'cnpj', 'cpf') || pick(contato, 'cpf_cnpj', 'cpfcnpj'),
    endereco:    montarEndereco(endereco),
    observacao:  pick(o, 'observacao_geral', 'observacao_producao'),
    instalacao: {
      data:    isoData(entregaData),
      hora:    isoHora(entregaHora),
      periodo: definirPeriodo(isoHora(entregaHora))
    },
    itens: (o.itens || o.produtos || o.items || []).map(mapearItem),
    _origemMubisys: true
  };
}

// "5", "7 dias", "10 dias úteis" → 5, 7, 10. Sem número → null.
function parsePrazoDias(p) {
  if (!p) return null;
  const m = String(p).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}
// Soma n dias a uma data ISO (yyyy-mm-dd). Retorna '' se faltar algo.
function addDias(iso, n) {
  if (!iso || n == null) return '';
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function montarEndereco(c) {
  c = c || {};
  const direto = pick(c, 'enderecoCompleto', 'endereco');
  if (direto && typeof direto === 'string') return direto;
  const partes = [
    pick(c, 'logradouro', 'rua'),
    pick(c, 'numero'),
    pick(c, 'complemento'),
    pick(c, 'bairro'),
    pick(c, 'cep') ? 'CEP: ' + pick(c, 'cep') : '',
    [pick(c, 'cidade', 'municipio'), pick(c, 'estado', 'uf')].filter(Boolean).join(' - ')
  ].filter(Boolean);
  return partes.join(' - ');
}

function definirPeriodo(hora) {
  if (!hora) return 'Manhã';
  const h = parseInt(hora.split(':')[0], 10);
  return h >= 12 ? 'Tarde' : 'Manhã';
}

function mapearItem(it, i) {
  it = it || {};
  const med = pick(it, 'medidas', 'medida', 'dimensoes');
  const larg = pick(it, 'largura', 'pcp_largura'), alt = pick(it, 'altura', 'pcp_altura');
  return {
    item:      String(pick(it, 'posicao') || (i + 1)),
    descricao: pick(it, 'descricao', 'item', 'produto', 'nome') || 'Item',
    medidas:   med || (larg && alt ? `${larg}x${alt}` : ''),
    qtde:      String(pick(it, 'quantidade', 'qtde', 'qtd') || '1'),
    valorUnit: String(pick(it, 'valor_unitario', 'valorUnitario', 'preco', 'valor') || ''),
    subtotal:  String(pick(it, 'sub_total', 'subtotal', 'valor_final', 'total') || ''),
    pronto:    false
  };
}

function resp(data, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  };
}
