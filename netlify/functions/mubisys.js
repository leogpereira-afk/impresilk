// Netlify Function — endpoint /.netlify/functions/mubisys
// Integra com a API do Mubisys para importar Ordens de Serviço automaticamente.
//
// As credenciais ficam em variáveis de ambiente (NUNCA no código do cliente):
//   MUBISYS_PUBLIC_KEY  — a publicKey da empresa (vai no caminho da URL)
//   MUBISYS_TOKEN       — o Access-Token do usuário (vai no header Access-Token)
//   MUBISYS_BASE        — (opcional) base da API; padrão https://api.mubisys.com/api
//
// A chamada do próprio app é protegida pelo mesmo TOKEN já usado em os.js.

const DEFAULT_BASE = 'https://api.mubisys.com/api';

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

  const publicKey   = process.env.MUBISYS_PUBLIC_KEY;
  const accessToken = process.env.MUBISYS_TOKEN;
  const base        = (process.env.MUBISYS_BASE || DEFAULT_BASE).replace(/\/+$/, '');
  if (!publicKey || !accessToken) {
    return resp({ error: 'Credenciais do Mubisys não configuradas (defina MUBISYS_PUBLIC_KEY e MUBISYS_TOKEN nas variáveis de ambiente do Netlify).' }, 500);
  }

  const headers = { 'Access-Token': accessToken, 'Accept': 'application/json' };
  const status  = body.status || 'PRODUCAO';
  const { action } = body;

  try {
    switch (action) {

      // ── ping: confere se as credenciais batem ───────────────────────────────
      case 'ping': {
        const url = `${base}/${publicKey}/ordem-servico?status=${encodeURIComponent(status)}`;
        const r = await fetch(url, { headers });
        return resp({ ok: r.ok, http: r.status });
      }

      // ── preview: devolve o JSON CRU do Mubisys (para descobrir os campos) ────
      case 'preview': {
        const url = `${base}/${publicKey}/ordem-servico?status=${encodeURIComponent(status)}`;
        const r = await fetch(url, { headers });
        const data = await r.json().catch(() => null);
        if (!r.ok) return resp({ error: `Mubisys retornou HTTP ${r.status}`, detalhe: data }, 502);
        // Recorta para não estourar a resposta: só os 2 primeiros registros crus.
        const lista = extrairLista(data);
        return resp({ total: lista.length, amostra: lista.slice(0, 2) });
      }

      // ── listarOS: busca e já mapeia para o formato Impresilk ─────────────────
      case 'listarOS': {
        const url = `${base}/${publicKey}/ordem-servico?status=${encodeURIComponent(status)}`;
        const r = await fetch(url, { headers });
        const data = await r.json().catch(() => null);
        if (!r.ok) return resp({ error: `Mubisys retornou HTTP ${r.status}`, detalhe: data }, 502);
        const lista = extrairLista(data);
        return resp({ os: lista.map(mapearOS), total: lista.length });
      }

      // ── getOS: busca uma O.S pelo número e mapeia ────────────────────────────
      case 'getOS': {
        if (!body.numero) return resp({ error: 'numero ausente' }, 400);
        const url = `${base}/${publicKey}/ordem-servico/numero/${encodeURIComponent(body.numero)}`;
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
// OBS: os nomes de campo abaixo são a melhor estimativa pelos rótulos do PDF.
// Serão confirmados/ajustados após o primeiro "preview" com dados reais.
function mapearOS(o) {
  o = o || {};
  const cliente = o.cliente || o.client || {};
  const entrega = pick(o, 'dataEntrega', 'entrega', 'previsaoEntrega', 'data_entrega');

  return {
    numero:      String(pick(o, 'numero', 'numeroOS', 'codigo', 'sequencial', 'id') || ''),
    servico:     pick(o, 'referencia', 'ref', 'titulo', 'descricao', 'assunto'),
    vendedor:    pick(o, 'vendedor', 'vendedorNome') || pick(o.vendedor || {}, 'nome'),
    dataEntrada: isoData(pick(o, 'dataAprovacao', 'aprovacao', 'dataCadastro', 'data')),
    cliente:     pick(cliente, 'nome', 'razaoSocial', 'nomeFantasia') || pick(o, 'clienteNome'),
    contato:     pick(cliente, 'contato', 'responsavel') || pick(o, 'contato'),
    whatsapp:    pick(cliente, 'telefone', 'celular', 'whatsapp', 'fone') || pick(o, 'telefone'),
    cnpjCpf:     pick(cliente, 'cpfcnpj', 'cnpj', 'cpf', 'documento') || pick(o, 'cpfcnpj'),
    endereco:    montarEndereco(cliente, o),
    instalacao: {
      data:    isoData(entrega),
      hora:    isoHora(entrega),
      periodo: definirPeriodo(isoHora(entrega))
    },
    itens: (o.itens || o.produtos || o.items || []).map(mapearItem),
    _origemMubisys: true
  };
}

function montarEndereco(cliente, o) {
  const c = cliente || {};
  const direto = pick(c, 'enderecoCompleto', 'endereco') || pick(o, 'endereco');
  if (direto && typeof direto === 'string') return direto;
  const partes = [
    pick(c, 'logradouro', 'rua'),
    pick(c, 'numero'),
    pick(c, 'complemento'),
    pick(c, 'bairro'),
    pick(c, 'cep') ? 'CEP: ' + pick(c, 'cep') : '',
    [pick(c, 'cidade', 'municipio'), pick(c, 'uf', 'estado')].filter(Boolean).join(' - ')
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
  const larg = pick(it, 'largura'), alt = pick(it, 'altura');
  return {
    item:      String(i + 1),
    descricao: pick(it, 'descricao', 'produto', 'nome', 'item') || 'Item',
    medidas:   med || (larg && alt ? `${larg}x${alt}` : ''),
    qtde:      String(pick(it, 'quantidade', 'qtde', 'qtd') || '1'),
    valorUnit: String(pick(it, 'valorUnitario', 'valorUnit', 'preco', 'valor') || ''),
    subtotal:  pick(it, 'subtotal', 'total', 'valorTotal'),
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
