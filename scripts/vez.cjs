#!/usr/bin/env node
/* De quem é a vez neste repositório. Um agente, numa sessão, por repositório de cada vez.

   node scripts/vez.cjs                                   mostra a vez (lida da origin/main)
   node scripts/vez.cjs pegar <claude|codex|leo> "tarefa" [--versao vNNN] [--arquivos "a.js b.js"]
   node scripts/vez.cjs passar                            devolve a vez (a Passagem vem do VEZ.md do disco)
   node scripts/vez.cjs liberar "frase do dono"           o dono libera a vez presa de outro agente
   node scripts/vez.cjs aceitar <sha>... "frase do dono"  o dono aceita commit recusado que já está na main
   node scripts/vez.cjs conferir <base>..<ate>            CI: cada commit da faixa leva "Agente: X" e X tem a vez

   pegar, passar, liberar e aceitar NÃO mexem no seu ramo nem no disco: montam o
   commit (VEZ.md e docs/passagens/) em cima da origin/main e imprimem
   `git push origin <sha>:main`. Antes o comando impresso era
   `git push origin HEAD:main`: rodado no ramo de trabalho, publicava junto o
   código que ainda esperava o "pode publicar" do dono.

   A vez vale o que está na origin/main, não no disco: um clone atrasado mente
   (o PCP já esteve 17 commits atrás no clone local). */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const RAIZ = path.resolve(process.env.PCP_RAIZ || path.join(__dirname, '..'));
const ARQ = path.join(RAIZ, 'VEZ.md');
const AGENTES = ['claude', 'codex', 'leo'];
const CAMPOS_PASSAGEM = ['no_ar', 'ramos', 'feito', 'pela_metade', 'decisoes', 'perguntas_ao_dono', 'nao_fazer', 'testes', 'dados'];
/* Mexer nestes arquivos muda as regras da vez. Depois que o protocolo está no ar,
   só entra com o dono (commit ou merge dele no site do GitHub, ou "aceitar"). */
const PROTEGIDOS = /^(scripts\/vez\.cjs|AGENTS\.md|CLAUDE\.md|\.github\/workflows\/)/;
const SO_VEZ = a => a === 'VEZ.md' || a.startsWith('docs/passagens/');

const git = (...a) => execFileSync('git', ['-C', RAIZ, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const gitEntrada = (args, opcoes = {}) => execFileSync('git', ['-C', RAIZ, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], input: '', ...opcoes }).trim();
const existe = ref => { try { git('cat-file', '-e', ref); return true; } catch { return false; } };
const agora = () => new Date().toISOString();

/* VEZ.md: linhas "chave: valor" no topo e na seção Passagem. */
function ler(texto) {
  const campos = {};
  for (const linha of String(texto).split('\n')) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(linha);
    if (m && !(m[1] in campos)) campos[m[1]] = m[2].trim();
  }
  return campos;
}
const vazio = v => !v || v === '-' || /^\(.*\)$/.test(v);
const idSessao = v => (vazio(v) ? '' : String(v).split(/\s+/)[0]);

/* Pegar: vez livre passa; vez de outro agente não passa (o dono, sim). Vez do
   MESMO agente só passa na mesma sessão: o conflito real da auditoria de 11/10
   foi entre duas sessões do Claude. Sessão "-" (ninguém registrou) é adotada. */
function podePegar(atual, eu, sessao = '') {
  if (!AGENTES.includes(eu)) return { ok: false, motivo: `agente desconhecido: ${eu} (use ${AGENTES.join(', ')})` };
  const dono = atual.agente || 'ninguem';
  if (dono === 'ninguem') return { ok: true };
  if (dono === eu) {
    const dela = idSessao(atual.sessao);
    if (!dela || !sessao || dela === sessao) return { ok: true, mesma: true };
    return { ok: false, motivo: `a vez já é de ${eu}, mas de OUTRA sessão (${atual.sessao}, ramo ${atual.ramo || '?'}, desde ${atual.desde || '?'}). Uma sessão por vez, mesmo do mesmo agente. Se aquela sessão acabou, peça ao dono para liberar (node scripts/vez.cjs liberar "frase do dono").` };
  }
  if (eu === 'leo') return { ok: true, aviso: `o dono tomou a vez de ${dono}` };
  return { ok: false, motivo: `a vez é de ${dono} desde ${atual.desde || '?'} (tarefa: ${atual.tarefa || '?'}). Peça ao dono para liberar (node scripts/vez.cjs liberar "frase do dono"); não trabalhe em paralelo.` };
}

function passagemCompleta(campos) {
  const faltam = CAMPOS_PASSAGEM.filter(c => vazio(campos[c]));
  return { ok: !faltam.length, faltam };
}

/* Um commit passa se tem "Agente: X" e X tem a vez no VEZ.md DAQUELE commit,
   ou se é a própria devolução (VEZ.md mudou para ninguem, assinada por quem tinha a vez).

   vezDoCommit / vezAnterior: o VEZ.md lido do commit e do pai dele (uma lista,
   num merge: um por pai); null quando o arquivo não existe ali; vezAnterior
   undefined quando não foi informado.
   extra (o CLI mede no git; os testes passam à mão):
   - assinadoGitHub: commit feito no site do GitHub (editor ou botão de merge),
     assinado pela chave do GitHub e com committer GitHub. Vale como o dono
     mesmo sem a linha "Agente:".
   - soVez: o commit só mexe no VEZ.md e em docs/passagens/.
   - protegidos / protocoloNoAr: arquivos de PROTEGIDOS que o commit muda, e se
     a base da faixa já tinha o scripts/vez.cjs (protocolo publicado).
   - aceito: o dono aceitou este commit ("Aceito: <sha>").
   - trazidoPeloDono: entrou por um merge do dono feito no site do GitHub.

   - Commit de ANTES do protocolo (sem VEZ.md nele nem no pai): basta a linha
     "Agente:". É o caso do conserto A1, pronto antes de o protocolo existir.
   - Commit que APAGA o VEZ.md: recusado (seria o jeito de pular a vez).
   - A vez só passa de um agente a OUTRO pela devolução (ninguem) ou pelo dono:
     vale contra CADA pai num merge, então resolver o conflito do VEZ.md
     ficando com a própria versão não toma a vez de quem já a tinha.
   - "Agente: leo" escrito por um agente (sem a assinatura do GitHub) só vale em
     commit de vez (liberar, aceitar, pegar pelo dono). Código como "leo" fora
     do site do GitHub é recusado: o nome do dono não destrava a conferência. */
function conferirCommit(mensagem, vezDoCommit, vezAnterior, extra = {}) {
  if (extra.aceito) return { ok: true, aceito: true };
  const linha = /^Agente:\s*(\w+)\s*$/mi.exec(mensagem || '');
  const quem = linha ? linha[1].toLowerCase() : (extra.assinadoGitHub ? 'leo' : null);
  if (!quem) return { ok: false, motivo: 'commit sem a linha "Agente: claude|codex|leo". Commit do dono feito no site do GitHub passa sozinho (vem assinado pelo GitHub); para destravar um que já está na main, sem push --force, o dono aceita: AGENTS.md, seção 5' };
  if (!AGENTES.includes(quem)) return { ok: false, motivo: `agente desconhecido na linha "Agente: ${linha[1]}" (use ${AGENTES.join(', ')})` };
  const donoNoSite = quem === 'leo' && extra.assinadoGitHub === true;
  if (quem === 'leo' && !donoNoSite && !extra.soVez) {
    return { ok: false, motivo: '"Agente: leo" fora do site do GitHub só vale em commit que mexe só no VEZ.md e em docs/passagens/ (liberar, aceitar ou pegar a vez por ordem do dono). Código do dono entra pelo site do GitHub, ou com a vez de um agente' };
  }
  if (extra.protocoloNoAr && extra.protegidos && extra.protegidos.length && !donoNoSite && !extra.trazidoPeloDono) {
    return { ok: false, motivo: `mexe em ${extra.protegidos.join(', ')} (as regras da vez) sem o dono: só entra por commit ou merge do dono no site do GitHub, ou aceito por ele` };
  }
  const pais = (vezAnterior === undefined ? [] : [].concat(vezAnterior)).filter(Boolean);
  if (vezDoCommit === null) {
    if (pais.length) return { ok: false, motivo: 'o commit apaga o VEZ.md' };
    return { ok: true, antesDoProtocolo: true };
  }
  if (quem === 'leo') return { ok: true, dono: true, semAssinatura: !donoNoSite };
  const atual = (vezDoCommit && vezDoCommit.agente) || 'ninguem';
  const antes = pais.map(p => p.agente || 'ninguem');
  const tomada = antes.find(a => a !== 'ninguem' && atual !== 'ninguem' && a !== atual);
  if (tomada) {
    return { ok: false, motivo: `a vez passou de ${tomada} para ${atual} sem devolução (só o dono toma a vez de outro agente)` };
  }
  if (atual === quem) return { ok: true };
  if (atual === 'ninguem' && antes.includes(quem)) return { ok: true, devolucao: true };
  return { ok: false, motivo: `commit de ${quem}, mas a vez é de ${atual}` };
}

function lerVezDe(ref) {
  try { return ler(git('show', `${ref}:VEZ.md`)); } catch { return null; }
}

/* Os arquivos que o PRÓPRIO commit muda. Num merge, só os que diferem de todos
   os pais (a resolução de conflito); o que ele traz é conferido nos commits trazidos. */
function arquivosDoCommit(sha, nPais) {
  const args = ['diff-tree', '--no-commit-id', '--name-only', '-r'];
  if (nPais === 0) args.push('--root');
  if (nPais > 1) args.push('-c');
  try { return [...new Set(git(...args, sha).split('\n').filter(Boolean))]; } catch { return []; }
}

/* Assinado pelo GitHub: a CI importa só a chave do GitHub (web-flow.gpg) num
   GNUPGHOME vazio, então assinatura boa ali é a do site. Fora da CI, sem a
   chave, nenhum commit passa por aqui como do dono. */
function assinadoPeloGitHub(sha) {
  let s;
  try { s = git('log', '-1', '--format=%G?%x09%ce', sha); } catch { return false; }
  const [sinal, email] = s.split('\t');
  return (sinal === 'G' || sinal === 'U') && email === 'noreply@github.com';
}

function agenteDe(msg, assinado) {
  const m = /^Agente:\s*(\w+)\s*$/mi.exec(msg || '');
  return m ? m[1].toLowerCase() : (assinado ? 'leo' : null);
}

/* Troca "chave: valor"; se a chave não existe (VEZ.md de formato antigo), põe a
   linha logo depois de "tarefa:". */
function por(texto, chave, valor) {
  const re = new RegExp(`^${chave}:.*$`, 'm');
  if (re.test(texto)) return texto.replace(re, () => `${chave}: ${valor}`);
  return texto.replace(/^tarefa:.*$/m, l => `${l}\n${chave}: ${valor}`);
}

function textoDaMain() {
  try { execFileSync('git', ['-C', RAIZ, 'fetch', '--quiet', 'origin', 'main'], { stdio: 'ignore', timeout: 20000 }); }
  catch { console.error('aviso: não consegui buscar a origin (sem rede?): uso a origin/main que já estava neste clone.'); }
  try { return git('show', 'origin/main:VEZ.md'); } catch { return null; }
}

/* A sessão: VEZ_SESSAO, ou um número guardado no git-dir deste clone/worktree. */
function minhaSessao(criar) {
  if (process.env.VEZ_SESSAO) return process.env.VEZ_SESSAO;
  let arq;
  try { arq = path.join(git('rev-parse', '--absolute-git-dir'), 'vez-sessao'); } catch { return ''; }
  try { const id = fs.readFileSync(arq, 'utf8').trim(); if (id) return id; } catch {}
  if (!criar) return '';
  const id = crypto.randomBytes(4).toString('hex');
  try { fs.writeFileSync(arq, `${id}\n`); } catch { return ''; }
  return id;
}

/* O commit da vez, em cima da origin/main, sem checkout: índice temporário,
   write-tree e commit-tree. O ramo de trabalho e o disco ficam como estão. */
function commitNaMain(arquivos, mensagem) {
  const base = git('rev-parse', '--verify', 'origin/main^{commit}');
  const indice = path.join(os.tmpdir(), `vez-indice-${process.pid}-${Date.now()}`);
  const env = { ...process.env, GIT_INDEX_FILE: indice };
  try {
    gitEntrada(['read-tree', base], { env });
    for (const [rel, texto] of Object.entries(arquivos)) {
      const blob = gitEntrada(['hash-object', '-w', '--stdin'], { input: texto });
      gitEntrada(['update-index', '--add', '--cacheinfo', `100644,${blob},${rel}`], { env });
    }
    const arvore = gitEntrada(['write-tree'], { env });
    const args = ['commit-tree', arvore, '-p', base];
    for (const parte of mensagem) args.push('-m', parte);
    const sha = gitEntrada(args);
    try { gitEntrada(['update-ref', 'refs/vez/ultimo', sha]); } catch {}
    return { sha, base };
  } finally {
    try { fs.unlinkSync(indice); } catch {}
  }
}

function imprimirPush({ sha, base }, depois) {
  console.log(`Commit ${sha.slice(0, 7)} montado em cima da origin/main (${base.slice(0, 7)}), sem mexer no seu ramo nem no disco.`);
  console.log(`Publique só ele (nada do seu ramo vai junto):\n  git push origin ${sha}:main`);
  console.log('Push recusado = a origin/main andou (alguém mexeu na vez): rode `node scripts/vez.cjs` de novo. Nunca junte o VEZ.md à mão.');
  if (depois) console.log(depois);
}

function opcoes(argv) {
  const pos = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--versao' || argv[i] === '--arquivos') flags[argv[i].slice(2)] = argv[++i] || '';
    else pos.push(argv[i]);
  }
  return { pos, flags };
}

function cli(argv) {
  const { pos, flags } = opcoes(argv);
  const [cmd, a1, a2] = pos;
  if (!cmd) {
    const daMain = textoDaMain();
    const c = ler(daMain ?? fs.readFileSync(ARQ, 'utf8'));
    console.log(`vez: ${c.agente} desde ${c.desde} | sessão ${c.sessao || '-'} | ramo ${c.ramo} | tarefa: ${c.tarefa}`
      + ` | versão reservada: ${c.versao_reservada || '-'} | arquivos em uso: ${c.arquivos_em_uso || '-'}`
      + (daMain === null ? '\n(a origin/main ainda não tem VEZ.md: li a cópia do disco)' : ''));
    return 0;
  }
  if (cmd === 'pegar') {
    const eu = a1;
    const daMain = textoDaMain();
    if (daMain === null) { console.error('ERRO: não consegui ler o VEZ.md da origin/main. Sem isso não dá para saber de quem é a vez.'); return 1; }
    const ant = ler(daMain);
    const sessao = minhaSessao(true);
    const r = podePegar(ant, eu, sessao);
    if (!r.ok) { console.error(`ERRO: ${r.motivo}`); return 1; }
    let ramo = '-'; try { ramo = git('rev-parse', '--abbrev-ref', 'HEAD'); } catch {}
    let t = daMain;
    const arquivos = {};
    if (!r.mesma) {
      // A Passagem do anterior vai para docs/passagens/ (no MESMO commit) e os
      // campos zeram: quem pega escreve a SUA Passagem, não herda a do outro.
      if (!vazio(ant.no_ar)) {
        const autor = ant.agente && ant.agente !== 'ninguem' ? ant.agente : (ant.passou_por || 'sem-autor');
        const base = `docs/passagens/${agora().slice(0, 10)}-${autor}`;
        let nome = `${base}.md`;
        for (let i = 2; existe(`origin/main:${nome}`); i++) nome = `${base}-${i}.md`;
        arquivos[nome] = `# Passagem de ${autor} (passou_por: ${ant.passou_por || '-'} em ${ant.passou_em || '-'}; guardada quando ${eu} pegou a vez)\n\n`
          + CAMPOS_PASSAGEM.map(c => `${c}: ${ant[c]}`).join('\n') + '\n';
        console.log(`Passagem anterior guardada em ${nome} (no mesmo commit).`);
      }
      for (const c of CAMPOS_PASSAGEM) t = por(t, c, '-');
      t = por(t, 'agente', eu);
      t = por(t, 'desde', agora());
    }
    t = por(t, 'ramo', ramo);
    if (a2 || !r.mesma) t = por(t, 'tarefa', a2 || '-');
    t = por(t, 'sessao', sessao ? `${sessao} (${path.basename(RAIZ)})` : '-');
    if ('versao' in flags || !r.mesma) t = por(t, 'versao_reservada', flags.versao || '-');
    if ('arquivos' in flags || !r.mesma) t = por(t, 'arquivos_em_uso', flags.arquivos || '-');
    arquivos['VEZ.md'] = t;
    if (r.aviso) console.log(`aviso: ${r.aviso}`);
    if (r.mesma) console.log(`A vez já era de ${eu} nesta sessão: só atualizo ramo, tarefa e reservas.`);
    imprimirPush(commitNaMain(arquivos, [`vez: ${eu} pega${r.mesma ? ' (atualiza)' : ''}`, `Tarefa: ${a2 || '-'}`, `Agente: ${eu}`]),
      'A vez só é sua depois deste push. Depois: git fetch origin && git switch -c <ramo> origin/main (o VEZ.md não muda no ramo de trabalho). Rode passar nesta mesma pasta: a sessão fica guardada no git-dir dela (ou use VEZ_SESSAO).');
    return 0;
  }
  if (cmd === 'passar') {
    const daMain = textoDaMain();
    if (daMain === null) { console.error('ERRO: não consegui ler o VEZ.md da origin/main.'); return 1; }
    const main = ler(daMain);
    const quem = main.agente || 'ninguem';
    if (quem === 'ninguem') { console.error('ERRO: a vez já está livre na origin/main; não há o que passar.'); return 1; }
    const dela = idSessao(main.sessao);
    const sessao = minhaSessao(false);
    if (dela && sessao !== dela) { console.error(`ERRO: a vez é de ${quem} na sessão ${main.sessao}, e esta pasta é ${sessao || 'de nenhuma sessão'}. Rode o passar na pasta em que rodou o pegar (ou com VEZ_SESSAO=${dela} se for a mesma sessão em outra pasta). Se aquela sessão acabou, o dono libera (node scripts/vez.cjs liberar "frase do dono").`); return 1; }
    let disco;
    try { disco = ler(fs.readFileSync(ARQ, 'utf8')); } catch { console.error('ERRO: não achei o VEZ.md no disco para ler a Passagem.'); return 1; }
    const p = passagemCompleta(disco);
    if (!p.ok) { console.error(`ERRO: a Passagem do VEZ.md (disco) está incompleta. Preencha: ${p.faltam.join(', ')}.`); return 1; }
    let t = daMain;
    for (const c of CAMPOS_PASSAGEM) t = por(t, c, disco[c]);
    t = por(t, 'agente', 'ninguem');
    t = por(t, 'passou_por', quem);
    t = por(t, 'passou_em', agora());
    for (const c of ['sessao', 'versao_reservada', 'arquivos_em_uso']) t = por(t, c, '-');
    imprimirPush(commitNaMain({ 'VEZ.md': t }, [`vez: ${quem} passa`, `Agente: ${quem}`]),
      'Depois do push, descarte a cópia do disco (git checkout -- VEZ.md): o VEZ.md só muda pelo vez.cjs.');
    return 0;
  }
  if (cmd === 'liberar') {
    const frase = a1;
    if (vazio(frase)) { console.error('uso: node scripts/vez.cjs liberar "frase do dono, como ele disse no chat"'); return 2; }
    const daMain = textoDaMain();
    if (daMain === null) { console.error('ERRO: não consegui ler o VEZ.md da origin/main.'); return 1; }
    const ant = ler(daMain);
    if (!ant.agente || ant.agente === 'ninguem') { console.error('ERRO: a vez já está livre.'); return 1; }
    const quando = agora();
    let t = daMain;
    // A Passagem do agente que parou fica; o campo que ele não preencheu diz isso.
    for (const c of CAMPOS_PASSAGEM) if (vazio(ant[c])) t = por(t, c, `não preenchido: a vez foi liberada pelo dono em ${quando.slice(0, 10)}; ${ant.agente} parou sem passar`);
    t = por(t, 'agente', 'ninguem');
    t = por(t, 'passou_por', ant.agente);
    t = por(t, 'passou_em', quando);
    for (const c of ['sessao', 'versao_reservada', 'arquivos_em_uso']) t = por(t, c, '-');
    imprimirPush(commitNaMain({ 'VEZ.md': t }, [`vez: o dono libera (era de ${ant.agente})`, `Dono-disse: ${frase}`, 'Agente: leo']),
      'Depois do push, quem vai trabalhar roda `node scripts/vez.cjs pegar <agente> "tarefa"`.');
    return 0;
  }
  if (cmd === 'aceitar') {
    const frase = pos[pos.length - 1];
    const pedidos = pos.slice(1, -1);
    if (!pedidos.length || vazio(frase) || /^[0-9a-f]{7,40}$/i.test(frase)) { console.error('uso: node scripts/vez.cjs aceitar <sha> [<sha>...] "frase do dono, como ele disse no chat"'); return 2; }
    textoDaMain();
    const shas = [];
    for (const s of pedidos) {
      let cheio;
      try { cheio = git('rev-parse', '--verify', `${s}^{commit}`); } catch { console.error(`ERRO: não achei o commit ${s}.`); return 1; }
      try { git('merge-base', '--is-ancestor', cheio, 'origin/main'); } catch { console.error(`ERRO: ${s} não está na origin/main: só se aceita commit que já foi publicado.`); return 1; }
      shas.push(cheio);
    }
    const rel = 'docs/passagens/aceites.md';
    let texto = '# Commits aceitos pelo dono (só se acrescenta)\n\nCada linha: data, commit e a frase do dono. O commit que trouxe a linha leva "Aceito: <sha>".\n\n';
    try { texto = git('show', `origin/main:${rel}`) + '\n'; } catch {}
    for (const s of shas) texto += `- ${agora().slice(0, 10)} · ${s.slice(0, 12)} · "${frase}"\n`;
    imprimirPush(commitNaMain({ [rel]: texto }, [`vez: o dono aceita ${shas.length} commit(s)`, ...shas.map(s => `Aceito: ${s}`), `Dono-disse: ${frase}`, 'Agente: leo']),
      'Esse push não roda o Deploy; o próximo Deploy (ou o "Run workflow" do Deploy) confere de novo, já com o aceite.');
    return 0;
  }
  if (cmd === 'conferir') {
    const faixa = a1 || 'HEAD~1..HEAD';
    const partes = /^(.+?)\.\.(.+)$/.exec(faixa);
    if (!partes) { console.error('uso: node scripts/vez.cjs conferir <base>..<ate>'); return 2; }
    let shas;
    try { shas = git('rev-list', '--reverse', faixa).split('\n').filter(Boolean); }
    catch { console.error(`::error::faixa inválida: ${faixa}`); return 1; }
    const protocoloNoAr = existe(`${partes[1]}:scripts/vez.cjs`);
    const info = shas.map(sha => {
      const msg = git('log', '-1', '--format=%B', sha);
      const pais = git('rev-list', '--parents', '-n', '1', sha).split(' ').slice(1);
      const assinado = assinadoPeloGitHub(sha);
      return { sha, msg, pais, assinado, quem: agenteDe(msg, assinado), arquivos: arquivosDoCommit(sha, pais.length) };
    });
    // O que o dono aceitou ou trouxe por merge no site, dentro da faixa.
    const aceitos = [];
    const trazidos = new Set();
    for (const c of info) {
      if (c.quem !== 'leo') continue;
      const soVez = c.arquivos.length > 0 && c.arquivos.every(SO_VEZ);
      if (!c.assinado && !soVez) continue;
      for (const m of c.msg.matchAll(/^Aceito:\s*([0-9a-f]{7,40})\s*$/gmi)) aceitos.push({ sha: m[1].toLowerCase(), por: c.sha, assinado: c.assinado });
      if (c.assinado && c.pais.length > 1) for (const s of git('rev-list', c.pais[1], '--not', c.pais[0]).split('\n').filter(Boolean)) trazidos.add(s);
    }
    let falhas = 0, antigos = 0;
    for (const c of info) {
      const aceite = aceitos.find(a => c.sha.startsWith(a.sha));
      const r = conferirCommit(c.msg, lerVezDe(c.sha), c.pais.map(lerVezDe), {
        assinadoGitHub: c.assinado,
        soVez: c.arquivos.length > 0 && c.arquivos.every(SO_VEZ),
        protegidos: c.arquivos.filter(a => PROTEGIDOS.test(a)),
        protocoloNoAr,
        aceito: !!aceite,
        trazidoPeloDono: trazidos.has(c.sha),
      });
      if (r.antesDoProtocolo) antigos++;
      if (r.aceito) console.log(`::warning::${c.sha.slice(0, 8)} aceito pelo dono no commit ${aceite.por.slice(0, 8)}${aceite.assinado ? '' : ' (feito fora do site do GitHub: confira a frase com ele)'}`);
      else if (r.ok && r.semAssinatura) console.log(`::warning::${c.sha.slice(0, 8)} "Agente: leo" fora do site do GitHub (só a vez): confira com o dono`);
      if (!r.ok) { falhas++; console.error(`::error::${c.sha.slice(0, 8)} ${r.motivo}`); }
    }
    if (falhas) { console.error(`${falhas} de ${shas.length} commit(s) fora da vez desde ${partes[1].slice(0, 8)}. Ficam vermelhos até serem tratados: AGENTS.md, seção 5.`); return 1; }
    console.log(`ok: ${shas.length} commit(s) dentro da vez desde ${partes[1].slice(0, 8)}` + (antigos ? ` (${antigos} de antes do VEZ.md, só com a linha Agente)` : '') + '.');
    return 0;
  }
  console.error('uso: node scripts/vez.cjs [pegar <agente> "tarefa" [--versao vNNN] [--arquivos "..."] | passar | liberar "frase" | aceitar <sha>... "frase" | conferir <base>..<ate>]');
  return 2;
}

if (require.main === module) process.exit(cli(process.argv.slice(2)));
module.exports = { ler, podePegar, passagemCompleta, conferirCommit, idSessao, PROTEGIDOS, CAMPOS_PASSAGEM };
