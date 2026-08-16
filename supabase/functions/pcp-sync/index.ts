// ============================================================================
// pcp-sync — Edge Function do PCP / Instalacao (substitui netlify/functions/os.js)
//
// O CONTRATO DE ACOES E O MESMO: o app manda { action, ... } com o header
// x-token e recebe a mesma resposta. So o backend mudou:
//   store "os"          -> pcp_registros (colecao='os')
//   store "cfg"         -> pcp_config_global
//   store "integracoes" -> pcp_meta (status da importacao horaria)
//   store "fotos"       -> bucket pcp-arquivos
//
// PROJETO COMPARTILHADO com o RH (nomes crus) e o Brief (brief_*): o nome desta
// function PRECISA do prefixo. Publicar uma "sync" sobrescreve a do RH.
//
// verify_jwt = false: o preflight CORS chega sem token e o gateway barraria
// antes de a funcao rodar. A autorizacao e feita aqui dentro, com o x-token.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN = Deno.env.get("PCP_TOKEN") ?? "";
// Credencial de MONITORAMENTO (vigia diário): só libera as ações de saúde
// (ping/diag/saude) — nunca lê nem escreve O.S. Girável sem afetar ninguém.
const SAUDE_TOKEN = Deno.env.get("PCP_SAUDE_TOKEN") ?? "";
const JWT_SECRET = Deno.env.get("EQUIPE_JWT_SECRET") ?? "";

// AUTORIZACAO (mudou em 05/08/2026): ate aqui a unica porta era o x-token, e
// esse token estava escrito em texto puro no config.js, servido ao navegador.
// Quem abrisse o codigo-fonte da pagina lia as O.S. da casa sem login. Mesmo
// buraco que o DRE tinha; consertado do mesmo jeito.
//
//   GENTE   -> Authorization: Bearer <cracha da equipe-auth>, com sis = "pcp"
//   MAQUINA -> x-token, so para o backup do Hub, que nao faz login
async function lerCracha(token: string): Promise<any | null> {
  if (!JWT_SECRET || !token) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const enc = new TextEncoder();
    const chave = await crypto.subtle.importKey(
      "raw", enc.encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const b64url = (x: string) => {
      x = x.replace(/-/g, "+").replace(/_/g, "/");
      while (x.length % 4) x += "=";
      const bin = atob(x);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    };
    const ok = await crypto.subtle.verify(
      "HMAC", chave, b64url(partes[2]), enc.encode(`${partes[0]}.${partes[1]}`));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(b64url(partes[1])));
    // exp OBRIGATORIO e numerico: cracha sem exp (ou string) nao pode valer p/ sempre.
    if (typeof p.exp !== "number" || p.exp < Math.floor(Date.now() / 1000)) return null;
    if (p.sis !== "pcp") return null;
    return p;
  } catch {
    return null;
  }
}

// Assina um cracha de MONTAGEM (mesma chave da equipe-auth). Usado so pela
// entrada sem senha do espelho: o instalador toca no nome (validado contra a
// lista de instaladores) e recebe um cracha papel 'montagem' de 30 dias.
const b64urlSign = (bytes: Uint8Array) => {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
async function assinarCrachaMontagem(nome: string): Promise<string> {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw", enc.encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const agora = Math.floor(Date.now() / 1000);
  const corpo = { sis: "pcp", sub: nome, nome, papel: "montagem", iat: agora, exp: agora + 30 * 86400 };
  const cab = b64urlSign(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const meio = `${cab}.${b64urlSign(enc.encode(JSON.stringify(corpo)))}`;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", chave, enc.encode(meio)));
  return `${meio}.${b64urlSign(sig)}`;
}
const BUCKET = "pcp-arquivos";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const resp = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------------------------------------------------------------- registros

async function getReg(colecao: string, id: string): Promise<any | null> {
  const { data } = await sb
    .from("pcp_registros").select("registro")
    .eq("colecao", colecao).eq("id", id).maybeSingle();
  return data?.registro ?? null;
}

async function setReg(colecao: string, id: string, registro: any) {
  const { error } = await sb.from("pcp_registros").upsert(
    { colecao, id, registro, atualizado_em: new Date().toISOString() },
    { onConflict: "colecao,id" },
  );
  if (error) throw new Error(error.message);
}

async function delReg(colecao: string, id: string) {
  // Confere o erro (o supabase-js NAO lanca — devolve {error}). Sem isso, um
  // delete que falhou respondia ok:true e o cliente tirava o item da fila.
  const { error } = await sb.from("pcp_registros").delete().eq("colecao", colecao).eq("id", id);
  if (error) throw new Error(error.message);
}

async function contarRegs(colecao: string): Promise<number> {
  const { count } = await sb
    .from("pcp_registros").select("id", { count: "exact", head: true }).eq("colecao", colecao);
  return count ?? 0;
}

// ---------------------------------------------------------------- meta / cfg

async function getMeta(chave: string): Promise<any | null> {
  const { data } = await sb.from("pcp_meta").select("valor").eq("chave", chave).maybeSingle();
  return data?.valor ?? null;
}

async function getCfg(): Promise<any> {
  const { data } = await sb.from("pcp_config_global").select("config").eq("id", true).maybeSingle();
  return data?.config ?? null;
}

// ---------------------------------------------------------------- fotos
// O app manda (e espera de volta) uma DATA URL, que vai direto para img.src.
// Guardamos os bytes puros + o mime e remontamos a data url na leitura. No
// Brief, devolver so o miolo fazia TODAS as fotos sumirem da tela -- e a
// contagem continuava batendo, entao so a comparacao byte a byte pegou.

const b64ParaBytes = (b64: string) =>
  Uint8Array.from(atob(b64.includes(",") ? b64.split(",")[1] : b64), (c) => c.charCodeAt(0));

function bytesParaB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  const BLOCO = 0x8000; // de uma vez so, o apply() estoura a pilha
  for (let i = 0; i < bytes.length; i += BLOCO) s += String.fromCharCode(...bytes.subarray(i, i + BLOCO));
  return btoa(s);
}

const mimeDaDataUrl = (b64: string, padrao: string) =>
  /^data:([^;,]+)[;,]/.exec(b64 || "")?.[1] ?? padrao;

// ---------------------------------------------------------------- handler

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp({ error: "Method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return resp({ error: "JSON inválido" }, 400);
  }

  const acao = String(body.action);

  // ENTRADA DA MONTAGEM (sem senha, por decisao do dono): o instalador toca no
  // nome; validamos contra a lista de instaladores e emitimos um cracha de 30
  // dias. Nao exige credencial previa — e o unico caminho assim, e so cria
  // cracha papel 'montagem' (que nao pode setCfg). Substitui o #i=NOME antigo,
  // que aceitava QUALQUER nome. Rodada ANTES do portao.
  if (acao === "entrarMontagem") {
    const nome = String(body.nome ?? "").trim();
    if (!nome) return resp({ error: "nome ausente" }, 400);
    const cfg = (await getCfg()) ?? {};
    const lista: string[] = Array.isArray(cfg.instaladores) ? cfg.instaladores : [];
    const bate = lista.find((n) => String(n).trim().toLowerCase() === nome.toLowerCase());
    if (!bate) return resp({ error: "Nome não está na lista de instaladores." }, 403);
    return resp({ token: await assinarCrachaMontagem(bate), nome: bate, papel: "montagem" });
  }

  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const cracha = m ? await lerCracha(m[1]) : null;
  const token = req.headers.get("x-token") ?? body.token;
  const ehMaquina = !!TOKEN && token === TOKEN;
  const ehVigia = !!SAUDE_TOKEN && token === SAUDE_TOKEN &&
    ["ping", "diag", "saude"].includes(acao);
  if (!cracha && !ehMaquina && !ehVigia) return resp({ error: "Entre no sistema.", semSessao: true }, 401);

  // AUTORIZACAO POR PAPEL no SERVIDOR (05/08 fechou o token publico, mas o
  // switch executava tudo sem olhar papel: um cracha 'comercial' se promovia a
  // admin via setCfg ou apagava O.S). A porta de MAQUINA (backup do Hub) segue
  // com poder total. Papeis com editar=true: admin/pcp/montagem/operacao.
  if (cracha && !ehMaquina) {
    const papel = String(cracha.papel ?? "");
    const podeEditar = ["admin", "pcp", "montagem", "operacao"].includes(papel);
    const ESCRITA = ["upsert", "delete", "putPhoto", "deletePhoto"];
    if (acao === "setCfg" && papel !== "admin") {
      return resp({ error: "Só o administrador altera as configurações." }, 403);
    }
    if (ESCRITA.includes(acao) && !podeEditar) {
      return resp({ error: "Seu acesso é somente leitura." }, 403);
    }
  }

  try {
    switch (acao) {
      case "ping":
        return resp({ ok: true });

      // Antes testava os dois caminhos de auth do Blobs. Agora diz se o banco e
      // o bucket estao de pe -- mesma finalidade.
      case "diag": {
        const out: Record<string, unknown> = { backend: "supabase" };
        try {
          out.banco = "ok (" + (await contarRegs("os")) + " O.S)";
        } catch (e) {
          out.banco = "ERR: " + (e as Error).message;
        }
        const { data, error } = await sb.storage.from(BUCKET).list("", { limit: 1 });
        out.bucket = error ? "ERR: " + error.message : "ok (" + BUCKET + ")";
        return resp(out);
      }

      // Pagina NO BANCO (antes carregava todas as chaves e fatiava na memoria --
      // com 496 O.S isso ja era uma varredura completa a cada consulta).
      case "list": {
        const PAGE = 150;
        let q = sb.from("pcp_registros").select("id, registro")
          .eq("colecao", "os").order("id").limit(PAGE);
        if (body.after != null) q = q.gt("id", String(body.after));
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const linhas = data ?? [];
        return resp({
          os: linhas.map((r: any) => r.registro),
          total: await contarRegs("os"),
          nextAfter: linhas.length === PAGE ? linhas[linhas.length - 1].id : null,
          nextOffset: null, // paginacao por chave; offset era so compatibilidade
        });
      }

      case "upsert": {
        const os = body.os;
        if (!os?.id) return resp({ error: "O.S sem id" }, 400);

        // Blindagem anti-duplicata: app desatualizado importando do Mubisys com
        // id aleatorio, quando o pedido ja existe na chave canonica (mub-<n>).
        // Se o que chegou e um esqueleto intocado, devolve a ficha canonica em
        // vez de criar copia (o aparelho converge no proximo pull).
        if (os.origemMubisys && os.numero) {
          const canonicalId = "mub-" + String(os.numero).trim();
          const semTrabalho = (os.atualizadoPor || "Mubisys (auto)") === "Mubisys (auto)" &&
            !os.liberadoPCP && !os.finalizadaEm &&
            !(os.fotosCheckinIds ?? []).length && !(os.fotosRetornoIds ?? []).length;
          if (os.id !== canonicalId && semTrabalho) {
            const canonico = await getReg("os", canonicalId);
            if (canonico) return resp({ ok: true, os: canonico, duplicataEvitada: true });
          }
        }

        const existing = await getReg("os", os.id);

        // Cache velho: aparelho re-importa um ESQUELETO por cima de ficha ja
        // trabalhada no servidor (mesmo id canonico, atualizadoEm mais novo).
        // Esqueleto nunca vence ficha com trabalho — devolve a do servidor e o
        // pull realinha o aparelho.
        if (os.origemMubisys && existing) {
          const semTrabalho = !os.liberadoPCP && !os.finalizadaEm &&
            !(os.fotosCheckinIds ?? []).length && !(os.fotosRetornoIds ?? []).length &&
            !(os.equipe ?? []).length && !os.confirmacao && !os.horaSaida;
          const comTrabalho = !!(existing.liberadoPCP || existing.finalizadaEm ||
            (existing.fotosCheckinIds ?? []).length || (existing.fotosRetornoIds ?? []).length ||
            (existing.equipe ?? []).length || existing.confirmacao || existing.horaSaida);
          if (semTrabalho && comTrabalho) return resp({ ok: true, os: existing, duplicataEvitada: true });
        }

        if (existing?.atualizadoEm && os.atualizadoEm) {
          if (new Date(existing.atualizadoEm).getTime() > new Date(os.atualizadoEm).getTime()) {
            return resp({ conflito: true, servidor: existing });
          }
        }

        // Preserva o atualizadoEm do autor: reescrever com o relogio do servidor
        // misturava duas fontes de tempo e o proprio autor levava "conflito".
        try {
          await setReg("os", os.id, { ...os });
        } catch (e) {
          // O indice unico de numero e a ultima linha de defesa contra duas O.S
          // com o mesmo numero. Se bateu nele, devolve a que ja existe em vez de
          // estourar erro na cara do instalador.
          const msg = (e as Error).message || "";
          // Colisao no indice de numero: devolve a ficha que ja existe. Antes so
          // procurava a canonica mub-<n>; se a sobrevivente tem id aleatorio
          // (O.S antiga/manual), procura pelo NUMERO — senao o erro estourava
          // 500 e travava a fila do aparelho para sempre.
          if ((/duplicate key|pcp_os_numero_idx|23505/i).test(msg) && os.numero) {
            const num = String(os.numero).trim();
            let sobrevivente = await getReg("os", "mub-" + num);
            if (!sobrevivente) {
              const { data } = await sb.from("pcp_registros").select("registro")
                .eq("colecao", "os").eq("registro->>numero", num).limit(1).maybeSingle();
              sobrevivente = data?.registro ?? null;
            }
            if (sobrevivente) return resp({ ok: true, os: sobrevivente, duplicataEvitada: true });
          }
          throw e;
        }
        return resp({ ok: true, os: { ...os } });
      }

      case "delete": {
        const id = body.id;
        if (!id) return resp({ error: "id ausente" }, 400);
        const existing = await getReg("os", id);
        // Apaga a LINHA primeiro (e confere o erro). Só depois remove as fotos
        // do bucket — se a foto some mas a linha fica, o app finge que apagou.
        await delReg("os", id);
        if (existing) {
          const ids = [
            ...(existing.fotosCheckinIds ?? []),
            ...(existing.fotosRetornoIds ?? []),
            existing.layoutFotoId,
          ].filter(Boolean);
          if (ids.length) {
            const { error } = await sb.storage.from(BUCKET).remove(ids);
            if (error) console.error("[pcp-sync] fotos órfãs no delete de", id, error.message);
          }
        }
        return resp({ ok: true });
      }

      case "getCfg": {
        const cfg = (await getCfg()) ?? {};
        // Papel nao-admin nao recebe dados sensiveis: a lista de usuarios (com
        // senha em texto no CFG_DEFAULT) e a agenda de funcionarios (telefones).
        // Maquina/Hub recebe tudo (backup).
        if (cracha && !ehMaquina && String(cracha.papel ?? "") !== "admin") {
          const { usuarios: _u, funcionarios: _f, ...publico } = cfg;
          return resp({ cfg: publico });
        }
        return resp({ cfg });
      }

      case "setCfg": {
        if (!body.cfg) return resp({ error: "cfg ausente" }, 400);
        const { error } = await sb.from("pcp_config_global").upsert(
          { id: true, config: body.cfg, atualizado_em: new Date().toISOString() },
          { onConflict: "id" },
        );
        if (error) throw new Error(error.message);
        return resp({ ok: true });
      }

      case "putPhoto": {
        const { base64, mime, fileId } = body;
        if (!base64) return resp({ error: "base64 ausente" }, 400);
        const id = fileId || "foto_" + Date.now() + "_" + Math.random().toString(36).slice(2);
        const { error } = await sb.storage.from(BUCKET).upload(id, b64ParaBytes(base64), {
          contentType: mimeDaDataUrl(base64, mime || "image/jpeg"),
          upsert: true,
        });
        if (error) throw new Error("upload: " + error.message);
        return resp({ fileId: id });
      }

      case "deletePhoto": {
        if (!body.fileId) return resp({ error: "fileId ausente" }, 400);
        await sb.storage.from(BUCKET).remove([body.fileId]).catch(() => {});
        return resp({ ok: true });
      }

      case "getPhoto": {
        if (!body.fileId) return resp({ error: "fileId ausente" }, 400);
        const { data, error } = await sb.storage.from(BUCKET).download(body.fileId);
        if (error || !data) return resp({ error: "Foto não encontrada" }, 404);
        const tipo = data.type || "image/jpeg";
        // Data url completa, como o os.js devolvia -- o app joga isto em img.src.
        return resp({ base64: `data:${tipo};base64,${bytesParaB64(await data.arrayBuffer())}`, mime: tipo });
      }

      case "saude":
        return resp({
          ok: true,
          totalOS: await contarRegs("os"),
          ultimaImportacao: await getMeta("sync_status"),
        });

      default:
        return resp({ error: `Ação desconhecida: ${body.action}` }, 400);
    }
  } catch (e) {
    console.error("[pcp-sync] erro:", e);
    return resp({ error: (e as Error)?.message ?? "Erro interno" }, 500);
  }
});
