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
  FUNCOES=(pcp-sync pcp-mubisys)
fi

cd "$RAIZ"
falhou=0
for fn in "${FUNCOES[@]}"; do
  [ -f "$fn/index.ts" ] || { echo "$fn: nao existe em supabase/functions"; falhou=1; continue; }

  # verify_jwt=false de proposito: o preflight CORS chega sem token e o gateway
  # barraria antes de a function rodar. Quem confere o cracha (EQUIPE_JWT_SECRET)
  # e a propria function -- o gateway do Supabase nao conhece esse cracha.
  resp=$(curl -sS -X POST \
    "https://api.supabase.com/v1/projects/$REF/functions/deploy?slug=$fn" \
    -H "Authorization: Bearer $TOKEN" \
    -F "metadata={\"entrypoint_path\":\"index.ts\",\"name\":\"$fn\",\"verify_jwt\":false};type=application/json" \
    -F "file=@$fn/index.ts;filename=index.ts;type=application/typescript") \
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
