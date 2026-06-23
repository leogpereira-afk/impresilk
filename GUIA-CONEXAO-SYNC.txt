# Guia de Conexão — Sincronização PCP (computador) ↔ Celular

> Guia prático e direto para garantir que os dados aparecem nos dois aparelhos.
> Não trata de programar o app — só da CONEXÃO/sincronização funcionando.

---

## Como a sincronização funciona (em 30 segundos)

```
COMPUTADOR (PCP)                 NUVEM (Netlify)               CELULAR
  grava local  ──── sobe ────▶   Netlify Blobs   ◀──── baixa ───  mostra
  (localStorage)                  (banco na nuvem)               (puxa ao abrir)
```

- O app é **offline-first**: cada aparelho grava primeiro em si mesmo e depois
  sincroniza com a nuvem quando há internet.
- Os dois aparelhos só "se enxergam" através da **nuvem**. Se a nuvem estiver
  fora, cada um fica no seu mundo (e o que tem cache local parece "ok").
- Site: **https://pcpimpresilk.netlify.app**

---

## Pré-requisitos para sincronizar

1. **Internet** nos dois aparelhos (pelo menos na hora de sincronizar).
2. **A nuvem (Netlify Blobs) tem que estar respondendo** — é o ponto que mais quebra.
3. O app aberto pelo endereço certo: **pcpimpresilk.netlify.app** (não "impresilk").

---

## Passo a passo no DIA A DIA (uso normal)

### No computador (PCP)
1. Abra o app com internet.
2. Crie/edite as O.S normalmente. Ele salva na hora e sobe para a nuvem sozinho.
3. Antes de fechar, confirme que não há nada "pendente" de envio (deixe alguns
   segundos com internet para a fila esvaziar).

### No celular
1. Abra o app com internet.
2. Ele puxa da nuvem automaticamente ao abrir.
3. Se não aparecer na hora: **feche e reabra** o app, ou puxe a tela para atualizar.

> Regra de ouro: o que foi criado num aparelho só aparece no outro DEPOIS que o
> primeiro subiu para a nuvem E o segundo baixou. Os dois precisam ter passado
> pela internet.

---

## Quando "não sincroniza" — diagnóstico rápido

### Sintoma típico
- Computador mostra os dados (porque tem cache local), **mas o celular fica vazio.**
- Isso quase sempre é a NUVEM fora do ar, não o celular.

### Teste de 1 minuto (no computador, terminal)
Cole este comando — ele pergunta à nuvem se está tudo certo:

```
curl -s -X POST "https://pcpimpresilk.netlify.app/.netlify/functions/os" \
  -H "Content-Type: application/json" \
  -H "x-token: impresilk-bhinxmdp5b7dwgaxpv9u2xqh" \
  -d '{"action":"list","offset":0}' | head -c 200
```

Interprete a resposta:

| O que aparece | Significado | O que fazer |
|---|---|---|
| `{"os":[...]}` com dados | ✅ Nuvem OK | Problema é só no aparelho → reabra o app, confira internet |
| `BlobsInternalError ... 401` | ❌ Token do banco vencido | Renovar `BLOBS_TOKEN` (abaixo) |
| `MissingBlobsEnvironmentError` | ❌ Faltam as variáveis do banco | Criar `BLOBS_TOKEN` + `BLOBS_SITE_ID` (abaixo) |
| `{"error":"Não autorizado"}` | ❌ Senha do app errada, ou deploy em andamento | Conferir variável `TOKEN`, ou esperar o deploy |
| `Not Found` / nada | ❌ Site fora / endereço errado | Conferir a URL `pcpimpresilk.netlify.app` |

---

## Correção: token do banco vencido (o erro mais comum)

Se o teste deu **401 do Blobs** ou **MissingBlobsEnvironmentError**, o banco está
sem credencial válida. Conserto no painel da Netlify:

### 1. Gerar um token novo
- app.netlify.com → seu **avatar** (canto sup. direito) → **User settings**
- **Applications → Personal access tokens → New access token**
- Dê um nome (ex.: `blobs pcpimpresilk`) → **Generate token**
- **Copie o valor** (só aparece uma vez) → guarde num bloco de notas

### 2. Pegar o Site ID
- Volte ao site **pcpimpresilk** → **Site configuration → General → Site details**
- Copie o **Site ID**

### 3. Criar/atualizar as variáveis
- **Site configuration → Environment variables → Add a single variable**
  - **Key:** `BLOBS_TOKEN`   · **Value:** o token novo (pode marcar "secret")
  - **Key:** `BLOBS_SITE_ID` · **Value:** o Site ID
- Scopes: deixe pelo menos **Functions** e **Runtime** marcados.
- ⚠️ **NÃO** apague a variável **`TOKEN`** (essa é a senha do app: `impresilk-bhinxmdp5b7dwgaxpv9u2xqh`).

### 4. Redeploy (obrigatório)
- **Deploys → Trigger deploy → Deploy site**
- Espere ficar **Published** (1 a 3 minutos).

### 5. Testar de novo
- Rode o mesmo `curl` do diagnóstico. Se vier `{"os":[...]}` com dados, voltou.

---

## As 3 variáveis que TÊM que existir no Netlify

| Variável | Para quê | Valor |
|---|---|---|
| `TOKEN` | senha do app (auth das chamadas) | `impresilk-bhinxmdp5b7dwgaxpv9u2xqh` |
| `BLOBS_TOKEN` | credencial do banco na nuvem | token gerado (renovar quando vencer) |
| `BLOBS_SITE_ID` | identifica o site para o banco | Site ID do projeto |

Se faltar qualquer uma → a sincronização para.

---

## Cuidados para NÃO perder dados

- **Antes de limpar o cache/dados do navegador** de um aparelho, garanta que ele
  já sincronizou (abra online e espere). Dados criados offline ficam numa fila
  local; se limpar antes de subir, eles se perdem.
- Quando a nuvem estiver fora, **não saia limpando aparelhos** achando que vai
  resolver — primeiro conserte a nuvem, depois deixe cada aparelho subir a fila.

---

## Resumo de bolso

1. Sincronizou? Os dois aparelhos precisam de internet e a nuvem precisa responder.
2. Celular vazio + PC ok = quase sempre a NUVEM caiu (token do Blobs vencido).
3. Teste com o `curl`; se der 401, gere token novo, atualize `BLOBS_TOKEN`, redeploy.
4. Nunca apague a variável `TOKEN`. Sempre redeploy após mexer em variável.
5. Não limpe cache de um aparelho antes de confirmar que ele sincronizou.
