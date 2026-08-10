// ⚠️ NÃO coloque token nenhum neste arquivo: ele é servido ao navegador e
// qualquer pessoa lê no código-fonte da página.
//
// Até 05/08/2026 havia aqui um `const TOKEN = '...'`, e era ele que autorizava
// os dados no servidor — ou seja, as O.S. da casa saíam sem login para quem
// abrisse o código-fonte. Quem autoriza agora é o CRACHÁ da pessoa (store.js),
// assinado por um segredo que só o servidor conhece. O token antigo foi girado.

// Backend: Supabase (Edge Functions). Antes eram Netlify Functions em
// /.netlify/functions/. O contrato das ações é o MESMO — só mudou o endereço.
//
// Os nomes levam prefixo "pcp-" porque o projeto do Supabase é compartilhado
// com o RH e o Brief: uma function chamada "sync" seria a do RH. O app continua
// pedindo 'os' e 'mubisys'; a tradução é aqui.
const API_BASE = 'https://heveemylixartyijxewh.supabase.co/functions/v1';
const API_FN = { os: 'pcp-sync', mubisys: 'pcp-mubisys' };

// Versão do shell instalado neste aparelho (manter IGUAL ao CACHE do sw.js a
// cada deploy). Aparece na Saúde da conexão — 1ª pergunta do suporte.
const APP_VERSAO = 'v48';
