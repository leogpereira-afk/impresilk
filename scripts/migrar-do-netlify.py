#!/usr/bin/env python3
"""
Migracao dos dados do PCP: Netlify Blobs -> Supabase.

Le AO VIVO do site antigo (que continua no ar e intocado) e grava no Supabase.
Mesmo desenho do script do Brief:

  - SQL pela Management API com o token sbp_, e NAO com a service_role key:
    a chave mestra do projeto (que ignora todas as protecoes) nunca precisa ser
    materializada em disco.
  - Requisicoes de SQL por CURL: a Management API fica atras do Cloudflare, que
    barra o urllib do Python com 403.
  - Os registros vao DIRETO na tabela, sem passar pela acao "upsert" da Edge
    Function -- upsert tem regra anti-duplicata e conflito, que numa carga em
    massa so atrapalha. As FOTOS vao pela acao putPhoto (sem efeito colateral).

Uso:
  python3 scripts/migrar-do-netlify.py --conferir   # so compara
  python3 scripts/migrar-do-netlify.py              # migra
"""

import json
import os
import subprocess
import sys
import tempfile
import urllib.request

NETLIFY = "https://pcpimpresilk.netlify.app/.netlify/functions/os"
TOKEN_PCP = "impresilk-bhinxmdp5b7dwgaxpv9u2xqh"
REF = "heveemylixartyijxewh"
FN = f"https://{REF}.supabase.co/functions/v1/pcp-sync"
ENV_TOKEN = os.path.expanduser("~/.config/impresilk/supabase.env")


def token_admin() -> str:
    with open(ENV_TOKEN) as f:
        for linha in f:
            if linha.startswith("SUPABASE_ACCESS_TOKEN="):
                return linha.split("=", 1)[1].strip()
    raise SystemExit("token do Supabase nao encontrado")


def post(url: str, corpo: dict, cab: dict, timeout: int = 180) -> dict:
    req = urllib.request.Request(
        url, data=json.dumps(corpo).encode(),
        headers={"Content-Type": "application/json", **cab}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


do_netlify = lambda c: post(NETLIFY, c, {"x-token": TOKEN_PCP})
do_supabase = lambda c: post(FN, c, {"x-token": TOKEN_PCP})


def sql(query: str) -> list:
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump({"query": query}, f)
        caminho = f.name
    try:
        r = subprocess.run(
            ["curl", "-s", "--fail-with-body", "-m", "180", "-X", "POST",
             f"https://api.supabase.com/v1/projects/{REF}/database/query",
             "-H", "Authorization: Bearer " + token_admin(),
             "-H", "Content-Type: application/json",
             "--data-binary", "@" + caminho],
            capture_output=True, text=True)
        if r.returncode != 0:
            raise SystemExit(f"SQL falhou: {r.stdout[:400]}{r.stderr[:200]}")
        return json.loads(r.stdout or "[]")
    finally:
        os.unlink(caminho)


# Postgres escapa aspa simples dobrando. O JSON tem texto digitado por pessoa
# (nome de cliente, observacao) -- um apostrofo quebraria a instrucao inteira.
lit = lambda s: "'" + s.replace("'", "''") + "'"


def puxar_os() -> list:
    todas, after = [], None
    for _ in range(200):
        c = {"action": "list"}
        if after is not None:
            c["after"] = after
        d = do_netlify(c)
        todas.extend(d.get("os") or [])
        after = d.get("nextAfter")
        if after is None:
            break
    return todas


def ids_de_fotos(lista: list) -> list:
    ids = []
    for o in lista:
        ids += list(o.get("fotosCheckinIds") or [])
        ids += list(o.get("fotosRetornoIds") or [])
        if o.get("layoutFotoId"):
            ids.append(o["layoutFotoId"])
    return sorted({i for i in ids if i})


def gravar(colecao: str, pares: list) -> int:
    total, LOTE = 0, 50
    for i in range(0, len(pares), LOTE):
        fatia = pares[i:i + LOTE]
        valores = ",".join(
            f"({lit(colecao)}, {lit(str(rid))}, {lit(json.dumps(reg, ensure_ascii=False))}::jsonb)"
            for rid, reg in fatia)
        sql("insert into public.pcp_registros (colecao, id, registro) values " + valores +
            " on conflict (colecao, id) do update set registro = excluded.registro,"
            " atualizado_em = now()")
        total += len(fatia)
    return total


def main() -> None:
    so_conferir = "--conferir" in sys.argv

    print("== lendo do Netlify (site antigo, intocado) ==")
    todas = puxar_os()
    cfg = (do_netlify({"action": "getCfg"}) or {}).get("cfg") or {}
    fotos = ids_de_fotos(todas)
    print(f"   O.S    : {len(todas)}")
    print(f"   fotos  : {len(fotos)}")
    print(f"   cfg    : {len(cfg)} chaves")

    # O indice unico pcp_os_numero_idx recusa duas O.S com o mesmo numero. Se a
    # origem tiver repetido, a carga quebraria no meio -- melhor descobrir aqui.
    from collections import Counter
    nums = [str(o.get("numero") or "").strip() for o in todas]
    dup = {n: q for n, q in Counter(n for n in nums if n).items() if q > 1}
    if dup:
        print(f"   !! {len(dup)} numero(s) repetido(s) na origem: {list(dup)[:5]}")
        print("      resolva antes de migrar (o banco novo nao aceita repetido)")
        return
    print(f"   sem numero: {sum(1 for n in nums if not n)} | repetidos: 0")

    if not so_conferir:
        print("\n== gravando no Supabase ==")
        print(f"   O.S gravadas: {gravar('os', [(o['id'], o) for o in todas if o.get('id')])}")
        sql("insert into public.pcp_config_global (id, config) values (true, " +
            lit(json.dumps(cfg, ensure_ascii=False)) + "::jsonb)"
            " on conflict (id) do update set config = excluded.config, atualizado_em = now()")
        print("   cfg gravado")

        print("\n== fotos ==")
        ok = falhou = 0
        for fid in fotos:
            try:
                r = do_netlify({"action": "getPhoto", "fileId": fid})
                if not r.get("base64"):
                    falhou += 1
                    continue
                do_supabase({"action": "putPhoto", "fileId": fid,
                             "base64": r["base64"], "mime": r.get("mime") or "image/jpeg"})
                ok += 1
            except Exception as e:
                falhou += 1
                print(f"   [erro] {fid}: {e}")
        print(f"   migradas: {ok} | falhas: {falhou}")

    print("\n== PORTAO: contagem antiga == nova? ==")
    d = do_supabase({"action": "diag"})
    n = do_supabase({"action": "saude"}).get("totalOS")
    print(f"   O.S   Netlify {len(todas):4d}  ->  Supabase {n}")
    print(f"   bucket: {d.get('bucket')}")
    print("   " + ("CONFERE" if n == len(todas) else "DIVERGE -- nao seguir"))


if __name__ == "__main__":
    main()
