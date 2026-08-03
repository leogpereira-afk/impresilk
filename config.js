// TOKEN — mesma string deve estar aqui E como variável de ambiente TOKEN no Netlify
// Site settings → Environment variables → TOKEN = <sua-senha-secreta>
const TOKEN = 'impresilk-bhinxmdp5b7dwgaxpv9u2xqh';

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
