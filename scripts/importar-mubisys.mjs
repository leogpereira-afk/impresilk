// ============================================================================
// Importação horária das O.S do Mubisys para o PCP.
//
// POR QUE ISTO NÃO MORA NUMA EDGE FUNCTION (14/09/2026): uma página do Mubisys
// já foi medida em 206 s no horário comercial, e a Edge Function do Supabase
// morre aos 150 s (IDLE_TIMEOUT). A importação nunca teve folga — funcionava só
// enquanto o ERP respondia em 15-20 s. No dia em que o ERP ficou lento, ela
// morreu CALADA (morte vinda de fora não executa o catch) e o PCP passou horas
// sem receber O.S nova, com a fábrica trabalhando.
//
// Aqui há 900 s de teto. Este script faz a parte LENTA (falar com o ERP) e
// manda o resultado para a Edge Function, que faz a parte rápida (deduplicar,
// respeitar lápide, preservar trabalho humano). A regra de banco continua num
// lugar só: `gravarImportadas`, no pcp-mubisys.
//
// Segredos necessários no repositório (Settings → Secrets → Actions):
//   MUBI_BASE_URL    https://api.mubisys.com/api
//   MUBI_PUBLIC_KEY  a chave pública (vai no caminho da URL)
//   MUBI_TOKEN       o Access-Token do usuário
//   PCP_CRON_TOKEN   o mesmo token que o robô horário já usa
// ============================================================================

const BASE = (process.env.MUBI_BASE_URL || 'https://api.mubisys.com/api').replace(/\/+$/, '');
const PUB = process.env.MUBI_PUBLIC_KEY || '';
const TOKEN = process.env.MUBI_TOKEN || '';
const PCP_TOKEN = process.env.PCP_CRON_TOKEN || '';
const PCP_FN = process.env.PCP_FN_URL
  || 'https://heveemylixartyijxewh.supabase.co/functions/v1/pcp-mubisys';

// Uma página de 500 já levou 206 s em horário comercial; 280 s cobre o pior
// caso medido sem deixar uma resposta pendurada estourar o teto do workflow.
const TIMEOUT_MS = 280_000;
const ESPERA_MS = Number(process.env.MUBI_ESPERA_MS) || 2500;
const TETO_POR_PAGINA_MS = 300_000;
const STATUS = process.env.MUBI_STATUS || 'PRODUCAO';

// Quantos dias para trás a importação olha. O filtro é por data de CADASTRO,
// que nunca está no futuro — pedir 180 dias à frente, como a versão antiga
// fazia, era peso puro. `datafinal` é AMANHÃ porque o ERP corta na meia-noite:
// pedir "hoje" deixa de fora a O.S cadastrada hoje com hora.
const DIAS_ATRAS = Number(process.env.MUBI_DIAS_ATRAS) || 180;

const ymd = (d) => d.toISOString().slice(0, 10);

function faltando() {
  const f = [];
  if (!PUB) f.push('MUBI_PUBLIC_KEY');
  if (!TOKEN) f.push('MUBI_TOKEN');
  if (!PCP_TOKEN) f.push('PCP_CRON_TOKEN');
  return f;
}

/* AS REGRAS DO MUBISYS. Copiadas do cliente que carrega o Painel há meses sem
   cair (painel/netlify/functions/lib/mubi.js), com a trava de regressão em
   painel/scripts/conferir-404.mjs:

   1. 404 NÃO é erro — é "nenhum registro neste filtro".
   2. O ERP PISCA 404 em recurso válido, então vazio só vale quando DOIS 404
      concordam E o último retorno foi 404. Um 404 sozinho virando lista vazia
      já apagou o vínculo de vendedor do Painel inteiro, gravado como sucesso.
   3. 401 = credencial errada, 403 = plano sem MubiPro. Fatais: não repetir.
   4. 5xx e timeout NUNCA viram vazio. Vazio apaga, erro preserva. */
async function erpGet(caminho, query) {
  const url = new URL(`${BASE}/${PUB}/${caminho}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  let n404 = 0, ultimoFoi404 = false, ultimoFoiRede = false, ultimoErro = null;
  const inicio = Date.now();
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        headers: { Accept: 'application/json', 'Access-Token': TOKEN },
        signal: ctl.signal,
      });
      clearTimeout(timer);
      if (r.status === 401) throw Object.assign(new Error('Mubisys recusou (401): confira MUBI_PUBLIC_KEY e MUBI_TOKEN.'), { fatal: true });
      if (r.status === 403) throw Object.assign(new Error('Mubisys recusou (403): o plano precisa do pacote MubiPro.'), { fatal: true });
      if (r.status === 404) {
        n404 += 1; ultimoFoi404 = true; ultimoFoiRede = false;
        if (Date.now() - inicio > TETO_POR_PAGINA_MS) break;
        if (n404 >= 2) return { data: [] };
        ultimoErro = new Error('Mubisys devolveu 404 uma vez (pode ser piscada)');
        await new Promise((res) => setTimeout(res, ESPERA_MS * tentativa));
        continue;
      }
      if (!r.ok) throw Object.assign(new Error(`Mubisys respondeu ${r.status}`), { httpStatus: r.status });
      return await r.json();
    } catch (e) {
      clearTimeout(timer);
      if (e.fatal) throw e;
      ultimoFoi404 = false;
      const foiTimeout = e.name === 'AbortError';
      ultimoFoiRede = foiTimeout || !e.httpStatus;
      ultimoErro = foiTimeout ? new Error(`Mubisys: sem resposta em ${TIMEOUT_MS / 1000}s`) : e;
      if (Date.now() - inicio > TETO_POR_PAGINA_MS) break;
      if (tentativa < 4) await new Promise((res) => setTimeout(res, ESPERA_MS * tentativa));
    }
  }
  if (n404 >= 2 && (ultimoFoi404 || ultimoFoiRede)) return { data: [] };
  throw ultimoErro || new Error('Mubisys: sem resposta utilizável');
}

const itens = (b) => (Array.isArray(b) ? b : Array.isArray(b?.data) ? b.data : Array.isArray(b?.dados) ? b.dados : []);

async function buscarOS() {
  const hoje = new Date();
  const ini = new Date(hoje); ini.setDate(ini.getDate() - DIAS_ATRAS);
  const fim = new Date(hoje); fim.setDate(fim.getDate() + 1);   // o ERP corta na meia-noite
  const janela = { status: STATUS, filtrodata: 'CADASTRO', datainicial: ymd(ini), datafinal: ymd(fim) };
  console.log(`janela: ${janela.datainicial} → ${janela.datafinal} (status ${STATUS})`);

  const lista = [];
  // Paginado: página incompleta encerra. Trava em 40 páginas — se houver mais,
  // FALHA em vez de truncar calado (melhor erro visível do que O.S faltando).
  for (let page = 1; page <= 40; page++) {
    const bruto = await erpGet('ordem-servico', { ...janela, page, per_page: 500 });
    const pag = itens(bruto);
    lista.push(...pag);
    console.log(`  página ${page}: ${pag.length} O.S (total ${lista.length})`);
    if (pag.length < 500) return lista;
  }
  throw new Error('mais de 40 páginas: a janela precisa ser menor, e truncar em silêncio não é opção');
}

async function mandarParaOPcp(os) {
  const r = await fetch(PCP_FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-token': PCP_TOKEN },
    body: JSON.stringify({ action: 'importarLote', os, vazioEsperado: os.length === 0 }),
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`o PCP recusou o lote (${r.status}): ${corpo?.error ?? ''}`);
  return corpo;
}

const f = faltando();
if (f.length) {
  console.error(`Faltam segredos no repositório: ${f.join(', ')}.`);
  console.error('Settings → Secrets and variables → Actions → New repository secret.');
  process.exit(1);
}

try {
  const os = await buscarOS();
  const r = await mandarParaOPcp(os);
  console.log(`\nPronto: ${r.novas} nova(s) de ${r.total} que o ERP devolveu (${r.jaExistiam} já existiam).`);
  if (r.semNumero) console.log(`${r.semNumero} O.S sem número foram ignoradas (não dá para deduplicar).`);
} catch (e) {
  console.error(`\nFALHOU: ${e.message}`);
  process.exit(1);   // vermelho no Actions: parada de importação não pode passar despercebida
}
