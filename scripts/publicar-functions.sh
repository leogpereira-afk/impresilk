#!/bin/bash
# ============================================================================
# Publica as Edge Functions do PCP no Supabase.
#
# POR QUE ESTE ARQUIVO EXISTE: a integracao GitHub<->Supabase do projeto
# pertence ao repositorio do RH e so publica as functions DELE. As do PCP sobem
# pela Management API, uma a uma -- sem isto, o codigo fica no git e o servidor
# continua rodando a versao velha, calado. (Mesmo script do painel; se um deles
# mudar por causa da API, mude o outro.)
#
# COMO USAR (o token e o "personal access token" do Supabase, comeca com sbp_;
# pegue em https://supabase.com/dashboard/account/tokens):
#
#   export SUPABASE_ACCESS_TOKEN=sbp_...
#   ./scripts/publicar-functions.sh              # publica as duas
#   ./scripts/publicar-functions.sh pcp-sync     # so uma
#
# QUEM RODA ISTO NA CI NAO E ESTE REPOSITORIO. E o painel-impresilk, no job
# `publicar-pcp` do .github/workflows/functions.yml de la: ele faz checkout
# deste repo (publico) e chama este script com o SUPABASE_ACCESS_TOKEN que ja
# existe por la. O projeto Supabase e o MESMO (heveemylixartyijxewh), e um
# token so e uma copia a menos para girar no dia em que ele vazar.
#
# Havia um workflow igual AQUI, e ele falhava em toda mudanca de function por
# falta do secret. Vermelho cronico ensina a ignorar vermelho -- entao ficou um
# publicador so, o que funciona.
#
# O token NAO fica gravado em lugar nenhum: sai do ambiente e some quando o
# terminal fecha. Nunca escreva ele num arquivo do repositorio -- este repo e
# PUBLICO.
# ============================================================================
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-heveemylixartyijxewh}"
TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
RAIZ="$(cd "$(dirname "$0")/../supabase/functions" && pwd)"

if [ -z "$TOKEN" ]; then
  echo "Falta o token. Rode:  export SUPABASE_ACCESS_TOKEN=sbp_..." >&2
  exit 1
fi

FUNCOES=("$@")
if [ ${#FUNCOES[@]} -eq 0 ]; then
  # "TODAS" E A PASTA, NAO UMA LISTA ESCRITA A MAO.
  #
  # Esta linha era `FUNCOES=(pcp-sync pcp-mubisys)`. Funcionava enquanto fossem
  # essas duas -- e o dia em que uma terceira entrasse no git, ela nao subiria, o
  # script diria "publica as duas" e terminaria com exit 0, sem uma linha de
  # aviso. E o MESMO defeito que deixou o casa.js fora do ar por dias em 13/09 e
  # que, no painel, manteve quatro functions sem publicar: deploy por lista
  # nominal esquece exatamente o arquivo novo, que e o unico que ninguem ainda
  # sabe conferir. Varrer o diretorio nao esquece.
  #
  # `_shared` fica de fora porque nao e function: e biblioteca, e vai junto com
  # cada uma no laco abaixo.
  FUNCOES=()
  for dir in "$RAIZ"/*/; do
    nome="$(basename "$dir")"
    [ "$nome" = "_shared" ] && continue
    [ -f "$dir/index.ts" ] || continue
    FUNCOES+=("$nome")
  done
  # Varredura sem resultado NAO pode terminar em sucesso: "publicou 0" com
  # exit 0 e a mesma mentira que a lista nominal contava.
  if [ ${#FUNCOES[@]} -eq 0 ]; then
    echo "Nenhuma function encontrada em $RAIZ -- nada foi publicado." >&2
    exit 1
  fi
  echo "Publicando as ${#FUNCOES[@]} functions de supabase/functions: ${FUNCOES[*]}"
fi

cd "$RAIZ"
falhou=0
for fn in "${FUNCOES[@]}"; do
  [ -f "$fn/index.ts" ] || { echo "$fn: nao existe em supabase/functions"; falhou=1; continue; }

  # A PASTA INTEIRA, NAO SO O index.ts.
  #
  # Mandar um arquivo so quebra no dia em que a function ganhar um ajudante ao
  # lado do index -- e foi exatamente o que aconteceu no painel: o painel-crm
  # importa `./contrato.ts` na linha 3, o arquivo nunca subia, e o Supabase
  # recusava a publicacao inteira com "Module not found". A function ficou presa
  # na versao velha enquanto o script anunciava sucesso para as outras.
  # Varrer a pasta nao esquece.
  args=()
  while IFS= read -r arq; do
    rel="${arq#$fn/}"
    case "$rel" in
      *.mjs|*.js) tipo=application/javascript ;;
      *.json)     tipo=application/json ;;
      *)          tipo=application/typescript ;;
    esac
    args+=(-F "file=@$arq;filename=$rel;type=$tipo")
  done < <(find "$fn" -type f \( -name '*.ts' -o -name '*.mjs' -o -name '*.js' -o -name '*.json' \) | sort)

  # verify_jwt=false de proposito: o preflight CORS chega sem token e o gateway
  # barraria antes de a function rodar. Quem confere o cracha (EQUIPE_JWT_SECRET)
  # e a propria function -- o gateway do Supabase nao conhece esse cracha.
  resp=$(curl -sS -X POST \
    "https://api.supabase.com/v1/projects/$REF/functions/deploy?slug=$fn" \
    -H "Authorization: Bearer $TOKEN" \
    -F "metadata={\"entrypoint_path\":\"index.ts\",\"name\":\"$fn\",\"verify_jwt\":false};type=application/json" \
    "${args[@]}") \
    || { echo "$fn: falhou a chamada"; falhou=1; continue; }

  echo "$resp" | FN="$fn" python3 -c "
import json, os, sys
fn = os.environ['FN']
try:
    d = json.load(sys.stdin)
except Exception:
    print(f'{fn}: resposta inesperada'); sys.exit(1)
if d.get('version'):
    print(f\"{fn}: {d.get('status')} v{d.get('version')}\")
else:
    print(f\"{fn}: ERRO -- {d.get('message') or d}\"); sys.exit(1)
" || falhou=1
done

exit $falhou
