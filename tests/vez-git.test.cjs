// A vez num repositório git DE VERDADE (origem local, clones, push), com o
// próprio scripts/vez.cjs. Os achados da revisão de 11/10 (CI-01, CI-02, CI-06,
// T1, T2 e T3) passavam no teste de objetos e só apareciam com o git rodando:
// o merge que toma a vez, o vermelho que some no push seguinte e o push da vez
// que levava junto o ramo de trabalho. Dados fictícios.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'vez.cjs');
const ID = { GIT_AUTHOR_NAME: 'Teste', GIT_AUTHOR_EMAIL: 'teste@exemplo.invalid', GIT_COMMITTER_NAME: 'Teste', GIT_COMMITTER_EMAIL: 'teste@exemplo.invalid', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
const g = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...ID } }).trim();
const temGit = (() => { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

const VEZ_LIVRE = ['# vez (fictício)', '', 'agente: ninguem', 'desde: 2026-10-11T00:00:00-03:00', 'ramo: -', 'tarefa: -', 'sessao: -',
  'versao_reservada: -', 'arquivos_em_uso: -', 'passou_por: claude', 'passou_em: 2026-10-11T00:00:00-03:00', '', '## Passagem', '',
  ...['no_ar', 'ramos', 'feito', 'pela_metade', 'decisoes', 'perguntas_ao_dono', 'nao_fazer', 'testes', 'dados'].map(c => `${c}: fictício`), ''].join('\n');

function montar() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vez-git-'));
  const origem = path.join(dir, 'origem.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origem]);
  const semente = path.join(dir, 'semente');
  execFileSync('git', ['init', '-q', '-b', 'main', semente]);
  fs.writeFileSync(path.join(semente, 'app.js'), '// app fictício\n');
  g(semente, 'add', '-A'); g(semente, 'commit', '-q', '-m', 'base fictícia');
  fs.mkdirSync(path.join(semente, 'scripts'));
  fs.copyFileSync(SCRIPT, path.join(semente, 'scripts', 'vez.cjs'));
  fs.writeFileSync(path.join(semente, 'VEZ.md'), VEZ_LIVRE);
  g(semente, 'add', '-A'); g(semente, 'commit', '-q', '-m', 'protocolo', '-m', 'Agente: claude');
  g(semente, 'push', '-q', origem, 'main');
  const verde = g(origem, 'rev-parse', 'main');
  const clone = nome => { const c = path.join(dir, nome); execFileSync('git', ['clone', '-q', origem, c]); return c; };
  return { dir, origem, verde, clone, limpar: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
// Roda o vez.cjs deste repositório contra o clone (PCP_RAIZ), numa sessão.
function vez(clone, sessao, ...args) {
  const env = { ...process.env, ...ID, PCP_RAIZ: clone };
  if (sessao) env.VEZ_SESSAO = sessao; else delete env.VEZ_SESSAO;
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env });
  const push = /git push origin ([0-9a-f]{40}):main/.exec(r.stdout);
  return { rc: r.status, saida: r.stdout + r.stderr, sha: push && push[1] };
}
function commit(clone, arquivo, titulo, agente) {
  fs.appendFileSync(path.join(clone, arquivo), `// ${titulo}\n`);
  g(clone, 'add', arquivo);
  g(clone, 'commit', '-q', '-m', titulo, ...(agente ? ['-m', `Agente: ${agente}`] : []));
  return g(clone, 'rev-parse', 'HEAD');
}

test('pegar e passar montam o commit da vez sobre a origin/main: o ramo de trabalho não vai junto (T1, CI-06)', { skip: !temGit }, () => {
  const r = montar();
  try {
    const b = r.clone('codex');
    const pega = vez(b, 'sB', 'pegar', 'codex', 'frente B', '--versao', 'v165', '--arquivos', 'app.js');
    assert.equal(pega.rc, 0, pega.saida);
    assert.equal(g(b, 'status', '--porcelain'), '', 'pegar não mexe no disco');
    assert.equal(g(b, 'rev-parse', `${pega.sha}^`), r.verde, 'em cima da origin/main');
    g(b, 'push', '-q', 'origin', `${pega.sha}:main`);
    const vezMain = g(r.origem, 'show', 'main:VEZ.md');
    assert.match(vezMain, /^agente: codex$/m);
    assert.match(vezMain, /^versao_reservada: v165$/m);
    assert.match(vezMain, /^arquivos_em_uso: app\.js$/m);
    assert.match(g(r.origem, 'ls-tree', '-r', '--name-only', 'main'), /docs\/passagens\/.*-claude\.md/, 'a Passagem anterior vai no mesmo commit');

    g(b, 'fetch', '-q'); g(b, 'switch', '-q', '-c', 'trabalho', 'origin/main');
    const espera = commit(b, 'app.js', 'conserto que espera o pode publicar', 'codex');
    let texto = fs.readFileSync(path.join(b, 'VEZ.md'), 'utf8');
    for (const c of ['no_ar', 'ramos', 'feito', 'pela_metade', 'decisoes', 'perguntas_ao_dono', 'nao_fazer', 'testes', 'dados']) texto = texto.replace(new RegExp(`^${c}:.*$`, 'm'), `${c}: preenchido (fictício)`);
    fs.writeFileSync(path.join(b, 'VEZ.md'), texto);
    const passa = vez(b, 'sB', 'passar');
    assert.equal(passa.rc, 0, passa.saida);
    assert.equal(g(b, 'rev-parse', 'HEAD'), espera, 'passar não cria commit no ramo');
    g(b, 'push', '-q', 'origin', `${passa.sha}:main`);
    assert.equal(g(r.origem, 'log', 'main', '--format=%s').includes('conserto que espera'), false, 'o conserto não foi para a main');
    const depois = g(r.origem, 'show', 'main:VEZ.md');
    assert.match(depois, /^agente: ninguem$/m);
    assert.match(depois, /^no_ar: preenchido \(fictício\)$/m);
    assert.equal(vez(b, 'sB', 'conferir', `${r.verde}..origin/main`).rc, 0);
  } finally { r.limpar(); }
});

test('corrida pela vez resolvida por merge fica vermelha, desde o último verde (CI-01)', { skip: !temGit }, () => {
  const r = montar();
  try {
    const a = r.clone('claude');
    const b = r.clone('codex');
    const pa = vez(a, 'sA', 'pegar', 'claude', 'frente A');
    const pb = vez(b, 'sB', 'pegar', 'codex', 'frente B');
    g(a, 'push', '-q', 'origin', `${pa.sha}:main`);
    assert.throws(() => g(b, 'push', '-q', 'origin', `${pb.sha}:main`), 'o segundo push é recusado');
    g(b, 'checkout', '-q', '-B', 'vez-codex', pb.sha);
    g(b, 'fetch', '-q');
    try { g(b, 'merge', '-q', 'origin/main'); } catch {}
    g(b, 'checkout', '--ours', 'VEZ.md', 'docs/passagens'); g(b, 'add', '-A');
    g(b, 'commit', '-q', '-m', 'Merge origin/main', '-m', 'Agente: codex');
    commit(b, 'app.js', 'código do codex', 'codex');
    g(b, 'push', '-q', 'origin', 'HEAD:main');
    const c = vez(b, 'sB', 'conferir', `${r.verde}..origin/main`);
    assert.equal(c.rc, 1, c.saida);
    assert.match(c.saida, /a vez passou de claude para codex sem devolução/);
  } finally { r.limpar(); }
});

test('o commit recusado continua vermelho até o dono aceitar (CI-02)', { skip: !temGit }, () => {
  const r = montar();
  try {
    const a = r.clone('claude');
    const b = r.clone('codex');
    const dono = r.clone('leo');
    const pb = vez(b, 'sB', 'pegar', 'codex', 'frente B');
    g(b, 'push', '-q', 'origin', `${pb.sha}:main`);
    g(a, 'pull', '-q');
    const ruim = commit(a, 'app.js', 'mudança fora da vez', 'claude');
    g(a, 'push', '-q', 'origin', 'HEAD:main');
    g(b, 'pull', '-q', '--rebase');
    commit(b, 'app.js', 'commit bom', 'codex');
    g(b, 'push', '-q', 'origin', 'HEAD:main');
    const antes = vez(b, 'sB', 'conferir', `${r.verde}..origin/main`);
    assert.equal(antes.rc, 1, 'o push bom não lava o ruim');
    assert.match(antes.saida, new RegExp(`${ruim.slice(0, 8)} commit de claude, mas a vez é de codex`));
    g(dono, 'pull', '-q');
    const aceita = vez(dono, '', 'aceitar', ruim.slice(0, 12), 'aceito, pode seguir');
    assert.equal(aceita.rc, 0, aceita.saida);
    assert.deepEqual(g(dono, 'diff', '--name-only', 'origin/main', aceita.sha).split('\n'), ['docs/passagens/aceites.md']);
    g(dono, 'push', '-q', 'origin', `${aceita.sha}:main`);
    g(b, 'fetch', '-q');
    const depois = vez(b, 'sB', 'conferir', `${r.verde}..origin/main`);
    assert.equal(depois.rc, 0, depois.saida);
    assert.match(depois.saida, /aceito pelo dono/);
  } finally { r.limpar(); }
});

test('sessão: outra sessão do mesmo agente não pega; a sessão guardada no clone sim (T2)', { skip: !temGit }, () => {
  const r = montar();
  try {
    const a = r.clone('claude');
    const pa = vez(a, '', 'pegar', 'claude', 'frente A');   // sem VEZ_SESSAO: guarda no git-dir do clone
    assert.equal(pa.rc, 0, pa.saida);
    g(a, 'push', '-q', 'origin', `${pa.sha}:main`);
    const outra = vez(r.clone('claude-2'), '', 'pegar', 'claude', 'poda de valores');
    assert.equal(outra.rc, 1);
    assert.match(outra.saida, /OUTRA sessão/);
    const mesma = vez(a, '', 'pegar', 'claude', 'frente A, parte 2');
    assert.equal(mesma.rc, 0, mesma.saida);
    assert.match(mesma.saida, /só atualizo/);
  } finally { r.limpar(); }
});

test('liberar: o dono solta a vez presa sem apagar a Passagem, e o outro agente pega (T3)', { skip: !temGit }, () => {
  const r = montar();
  try {
    const a = r.clone('claude');
    const b = r.clone('codex');
    const dono = r.clone('leo');
    const pa = vez(a, 'sA', 'pegar', 'claude', 'frente A');
    g(a, 'push', '-q', 'origin', `${pa.sha}:main`);
    assert.equal(vez(b, 'sB', 'pegar', 'codex', 'frente B').rc, 1);
    g(dono, 'pull', '-q');
    const lib = vez(dono, '', 'liberar', 'pode liberar, o claude parou');
    assert.equal(lib.rc, 0, lib.saida);
    g(dono, 'push', '-q', 'origin', `${lib.sha}:main`);
    const vezMain = g(r.origem, 'show', 'main:VEZ.md');
    assert.match(vezMain, /^agente: ninguem$/m);
    assert.match(vezMain, /^no_ar: não preenchido: a vez foi liberada pelo dono/m);
    assert.match(g(r.origem, 'log', '-1', '--format=%B', 'main'), /Dono-disse: pode liberar/);
    const pb = vez(b, 'sB', 'pegar', 'codex', 'frente B');
    assert.equal(pb.rc, 0, pb.saida);
    g(b, 'push', '-q', 'origin', `${pb.sha}:main`);
    assert.equal(vez(b, 'sB', 'conferir', `${r.verde}..origin/main`).rc, 0, 'liberar (Agente: leo, só VEZ.md) passa na conferência');
  } finally { r.limpar(); }
});

test('conferir: "leo" em código, regras da vez sem o dono e committer GitHub sem assinatura ficam vermelhos (CI-07, CI-08)', { skip: !temGit }, () => {
  const r = montar();
  try {
    const b = r.clone('codex');
    commit(b, 'app.js', 'código assinado como leo', 'leo');
    g(b, 'push', '-q', 'origin', 'HEAD:main');
    assert.match(vez(b, '', 'conferir', `${r.verde}..origin/main`).saida, /"Agente: leo" fora do site do GitHub/);

    const r2 = montar();
    try {
      const c = r2.clone('codex');
      const pc = vez(c, 'sC', 'pegar', 'codex', 'x');
      g(c, 'push', '-q', 'origin', `${pc.sha}:main`); g(c, 'pull', '-q');
      fs.writeFileSync(path.join(c, 'scripts', 'vez.cjs'), fs.readFileSync(path.join(c, 'scripts', 'vez.cjs'), 'utf8').replace('if (falhas) {', 'if (false && falhas) {'));
      g(c, 'commit', '-q', '-am', 'fix: conferir', '-m', 'Agente: codex');
      const web = path.join(c, 'app.js');
      fs.appendFileSync(web, '// pelo "site"\n');
      execFileSync('git', ['-C', c, 'commit', '-q', '-am', 'Update app.js'], { env: { ...process.env, ...ID, GIT_COMMITTER_NAME: 'GitHub', GIT_COMMITTER_EMAIL: 'noreply@github.com' } });
      g(c, 'push', '-q', 'origin', 'HEAD:main');
      // O conferidor é o da BASE (o do último verde), como no deploy.yml.
      const daBase = path.join(r2.dir, 'vez-da-base.cjs');
      fs.writeFileSync(daBase, g(c, 'show', `${r2.verde}:scripts/vez.cjs`));
      const res = spawnSync(process.execPath, [daBase, 'conferir', `${r2.verde}..origin/main`], { encoding: 'utf8', env: { ...process.env, ...ID, PCP_RAIZ: c } });
      assert.equal(res.status, 1);
      assert.match(res.stderr, /scripts\/vez\.cjs \(as regras da vez\) sem o dono/);
      assert.match(res.stderr, /commit sem a linha "Agente/, 'committer GitHub sem a assinatura do GitHub não é o dono');
    } finally { r2.limpar(); }
  } finally { r.limpar(); }
});
