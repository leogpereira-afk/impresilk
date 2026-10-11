#!/usr/bin/env node
/* De quem é a vez neste repositório. Um agente por repositório de cada vez.

   node scripts/vez.cjs                                  mostra (lendo a origin/main)
   node scripts/vez.cjs pegar <claude|codex|leo> "tarefa"  pega a vez, se estiver livre
   node scripts/vez.cjs passar                           devolve a vez (exige a Passagem preenchida)
   node scripts/vez.cjs conferir [<de>..<ate>]           CI: cada commit leva "Agente: X" e X é quem tem a vez

   A vez vale o que está na origin/main, não no disco: um clone atrasado mente
   (o PCP já esteve 17 commits atrás no clone local). Por isso `pegar` lê a
   origin/main depois de um fetch, e a vez só é sua depois do push do VEZ.md. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RAIZ = path.resolve(process.env.PCP_RAIZ || path.join(__dirname, '..'));
const ARQ = path.join(RAIZ, 'VEZ.md');
const AGENTES = ['claude', 'codex', 'leo'];
const CAMPOS_PASSAGEM = ['no_ar', 'ramos', 'feito', 'pela_metade', 'decisoes', 'perguntas_ao_dono', 'nao_fazer', 'testes', 'dados'];

const git = (...a) => execFileSync('git', ['-C', RAIZ, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

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

function podePegar(atual, eu) {
  if (!AGENTES.includes(eu)) return { ok: false, motivo: `agente desconhecido: ${eu} (use ${AGENTES.join(', ')})` };
  const dono = atual.agente || 'ninguem';
  if (dono === 'ninguem' || dono === eu) return { ok: true, mesma: dono === eu };
  if (eu === 'leo') return { ok: true, aviso: `o dono tomou a vez de ${dono}` };
  return { ok: false, motivo: `a vez é de ${dono} desde ${atual.desde || '?'} (tarefa: ${atual.tarefa || '?'}). Peça ao dono para liberar; não trabalhe em paralelo.` };
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
   - Commit de ANTES do protocolo (sem VEZ.md nele nem no pai): basta a linha
     "Agente:". É o caso do conserto que já estava pronto quando o protocolo
     entrou (a1-comissao): sem isto, publicar os dois juntos seria barrado.
   - Commit que APAGA o VEZ.md: recusado (seria o jeito de pular a vez).
   - A vez só passa de um agente a OUTRO pela devolução (ninguem) ou pelo dono:
     um commit que troca "agente: claude" por "agente: codex" é recusado mesmo
     assinado por codex. Num merge, vale contra CADA pai: resolver o conflito
     do VEZ.md ficando com a própria versão não toma a vez de quem já a tinha. */
function conferirCommit(mensagem, vezDoCommit, vezAnterior) {
  const m = /^Agente:\s*(\w+)\s*$/mi.exec(mensagem || '');
  if (!m) return { ok: false, motivo: 'commit sem a linha "Agente: claude|codex|leo"' };
  const quem = m[1].toLowerCase();
  if (!AGENTES.includes(quem)) return { ok: false, motivo: `agente desconhecido na linha "Agente: ${m[1]}" (use ${AGENTES.join(', ')})` };
  const pais = (vezAnterior === undefined ? [] : [].concat(vezAnterior)).filter(Boolean);
  if (vezDoCommit === null) {
    if (pais.length) return { ok: false, motivo: 'o commit apaga o VEZ.md' };
    return { ok: true, antesDoProtocolo: true };
  }
  if (quem === 'leo') return { ok: true };
  const agora = (vezDoCommit && vezDoCommit.agente) || 'ninguem';
  const antes = pais.map(p => p.agente || 'ninguem');
  const tomada = antes.find(a => a !== 'ninguem' && agora !== 'ninguem' && a !== agora);
  if (tomada) {
    return { ok: false, motivo: `a vez passou de ${tomada} para ${agora} sem devolução (só o dono, com "Agente: leo", toma a vez de outro agente)` };
  }
  if (agora === quem) return { ok: true };
  if (agora === 'ninguem' && antes.includes(quem)) return { ok: true, devolucao: true };
  return { ok: false, motivo: `commit de ${quem}, mas a vez é de ${agora}` };
}

/* O Deploy ignora push que só mexe no VEZ.md e em docs/passagens/ (paths-ignore).
   Esses commits ficam ANTES do "before" do push seguinte e não seriam conferidos
   nunca: uma troca de vez irregular passaria calada. Por isso a faixa recua
   sobre eles (pelo primeiro pai) até achar um commit que mexe em outra coisa. */
function soMexeNaVez(sha) {
  let arqs;
  try { arqs = git('diff-tree', '--no-commit-id', '--name-only', '-r', sha).split('\n').filter(Boolean); }
  catch { return false; }
  return arqs.length > 0 && arqs.every(a => a === 'VEZ.md' || a.startsWith('docs/passagens/'));
}

function lerVezDe(ref) {
  try { return ler(git('show', `${ref}:VEZ.md`)); } catch { return null; }
}

function substituir(texto, chave, valor) {
  const re = new RegExp(`^${chave}:.*$`, 'm');
  return re.test(texto) ? texto.replace(re, () => `${chave}: ${valor}`) : texto;
}

function textoDaMain() {
  try { execFileSync('git', ['-C', RAIZ, 'fetch', '--quiet', 'origin', 'main'], { stdio: 'ignore', timeout: 20000 }); } catch {}
  try { return git('show', 'origin/main:VEZ.md'); } catch { return null; }
}

function cli(argv) {
  const [cmd, a1, a2] = argv;
  if (!cmd) {
    const daMain = textoDaMain();
    const c = ler(daMain ?? fs.readFileSync(ARQ, 'utf8'));
    console.log(`vez: ${c.agente} desde ${c.desde} | ramo ${c.ramo} | tarefa: ${c.tarefa}` + (daMain === null ? '\n(a origin/main ainda não tem VEZ.md: li a cópia do disco)' : ''));
    return 0;
  }
  if (cmd === 'pegar') {
    const daMain = textoDaMain();
    if (daMain === null) { console.error('ERRO: não consegui ler o VEZ.md da origin/main. Sem isso não dá para saber de quem é a vez.'); return 1; }
    const ant = ler(daMain);
    const r = podePegar(ant, a1);
    if (!r.ok) { console.error(`ERRO: ${r.motivo}`); return 1; }
    let ramo = '-'; try { ramo = git('rev-parse', '--abbrev-ref', 'HEAD'); } catch {}
    let t = daMain;
    if (r.mesma) {
      // A vez já é minha: só atualiza ramo e tarefa. A Passagem que eu mesmo
      // venho escrevendo fica onde está.
      t = substituir(t, 'ramo', ramo);
      if (a2) t = substituir(t, 'tarefa', a2);
      fs.writeFileSync(ARQ, t);
      console.log(`A vez já era de ${a1}: ramo e tarefa atualizados no VEZ.md.`);
      return 0;
    }
    // A Passagem do anterior vai para docs/passagens/ e os campos zeram: quem
    // pega a vez escreve a SUA Passagem, não herda a do outro preenchida.
    if (!vazio(ant.no_ar)) {
      const autor = ant.agente && ant.agente !== 'ninguem' ? ant.agente : (ant.passou_por || 'sem-autor');
      const dir = path.join(RAIZ, 'docs', 'passagens');
      fs.mkdirSync(dir, { recursive: true });
      const base = `${new Date().toISOString().slice(0, 10)}-${autor}`;
      let nome = `${base}.md`;
      for (let i = 2; fs.existsSync(path.join(dir, nome)); i++) nome = `${base}-${i}.md`;
      fs.writeFileSync(path.join(dir, nome), `# Passagem de ${autor} (passou_por: ${ant.passou_por || '-'} em ${ant.passou_em || '-'}; guardada quando ${a1} pegou a vez)\n\n` + CAMPOS_PASSAGEM.map(c => `${c}: ${ant[c]}`).join('\n') + '\n');
      console.log(`Passagem anterior guardada em docs/passagens/${nome}`);
    }
    for (const c of CAMPOS_PASSAGEM) t = substituir(t, c, '-');
    t = substituir(t, 'agente', a1);
    t = substituir(t, 'desde', new Date().toISOString());
    t = substituir(t, 'ramo', ramo);
    t = substituir(t, 'tarefa', a2 || '-');
    fs.writeFileSync(ARQ, t);
    if (r.aviso) console.log(`aviso: ${r.aviso}`);
    console.log(`VEZ.md gravado. A vez só é sua depois disto entrar na main:\n  git add VEZ.md docs/passagens && git commit -m "vez: ${a1} pega" -m "Agente: ${a1}" && git push origin HEAD:main`);
    return 0;
  }
  if (cmd === 'passar') {
    const t = fs.readFileSync(ARQ, 'utf8');
    const c = ler(t);
    const p = passagemCompleta(c);
    if (!p.ok) { console.error(`ERRO: a Passagem do VEZ.md está incompleta. Preencha: ${p.faltam.join(', ')}.`); return 1; }
    const quem = c.agente;
    let n = substituir(t, 'agente', 'ninguem');
    n = substituir(n, 'passou_por', quem);
    n = substituir(n, 'passou_em', new Date().toISOString());
    fs.writeFileSync(ARQ, n);
    console.log(`Vez devolvida por ${quem}. Agora:\n  git add VEZ.md && git commit -m "vez: ${quem} passa" -m "Agente: ${quem}" && git push origin HEAD:main`);
    return 0;
  }
  if (cmd === 'conferir') {
    let faixa = a1 && !/^0+\.\./.test(a1) ? a1 : 'HEAD~1..HEAD';
    const partes = /^(.+?)\.\.(.+)$/.exec(faixa);
    let recuou = 0;
    if (partes) {
      let de = partes[1];
      for (let i = 0; i < 500 && soMexeNaVez(de); i++) {
        try { de = git('rev-parse', '--verify', `${de}~1`); recuou++; } catch { break; }
      }
      faixa = `${de}..${partes[2]}`;
    }
    let shas;
    try { shas = git('rev-list', '--reverse', faixa).split('\n').filter(Boolean); }
    catch { shas = [git('rev-parse', 'HEAD')]; }
    let falhas = 0, antigos = 0;
    for (const sha of shas) {
      const msg = git('log', '-1', '--format=%B', sha);
      const pais = git('rev-list', '--parents', '-n', '1', sha).split(' ').slice(1);
      const r = conferirCommit(msg, lerVezDe(sha), pais.map(lerVezDe));
      if (r.antesDoProtocolo) antigos++;
      if (!r.ok) { falhas++; console.error(`::error::${sha.slice(0, 8)} ${r.motivo}`); }
    }
    if (recuou) console.log(`(conferi também ${recuou} commit(s) só de vez antes da faixa: o Deploy não roda neles)`);
    if (falhas) { console.error(`${falhas} de ${shas.length} commit(s) fora da vez. Leia AGENTS.md, seção 5.`); return 1; }
    console.log(`ok: ${shas.length} commit(s) dentro da vez` + (antigos ? ` (${antigos} de antes do VEZ.md, só com a linha Agente)` : '') + '.');
    return 0;
  }
  console.error('uso: node scripts/vez.cjs [pegar <agente> "tarefa" | passar | conferir [de..ate]]');
  return 2;
}

if (require.main === module) process.exit(cli(process.argv.slice(2)));
module.exports = { ler, podePegar, passagemCompleta, conferirCommit, CAMPOS_PASSAGEM };
