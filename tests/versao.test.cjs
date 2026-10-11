// A versão mora em 83 lugares (v164): APP_VERSAO, CACHE e todo ?v= da raiz.
// O guarda de tests/casa.test.cjs olha só index.html, equipe.html e sw.js;
// este olha a raiz inteira pelo mesmo código que sobe a versão.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const raiz = path.join(__dirname, '..');
const script = path.join(raiz, 'scripts', 'subir-versao.cjs');
const pastas = [];
test.after(() => { for (const d of pastas) fs.rmSync(d, { recursive: true, force: true }); });

function copiaDaRaiz() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-versao-'));
  pastas.push(dir);
  for (const f of fs.readdirSync(raiz)) if (/\.(html|js|css|json)$/.test(f)) fs.copyFileSync(path.join(raiz, f), path.join(dir, f));
  return dir;
}
const rodar = (dir, args, env = { PCP_SEM_MAIN: '1' }) => {
  const base = { ...process.env, PCP_RAIZ: dir };
  delete base.PCP_SEM_MAIN;
  try { return { status: 0, out: execFileSync(process.execPath, [script, ...args], { env: { ...base, ...env }, encoding: 'utf8', stdio: 'pipe' }) }; }
  catch (e) { return { status: e.status, out: String(e.stdout) + String(e.stderr) }; }
};
const atual = dir => /const APP_VERSAO = '(v\d+)'/.exec(fs.readFileSync(path.join(dir, 'config.js'), 'utf8'))[1];
const mais = (v, n) => `v${Number(v.slice(1)) + n}`;

test('todos os lugares da versão estão iguais (a raiz inteira, ranking.html incluído)', () => {
  const r = rodar(raiz, []);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /ranking\.html \d+/);
});

test('um ?v= velho no ranking.html faz a subida falhar sem gravar nada', () => {
  const dir = copiaDaRaiz();
  const p = path.join(dir, 'ranking.html');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/\?v=(v\d+)/, '?v=v1'));
  const antes = fs.readFileSync(path.join(dir, 'config.js'), 'utf8');
  const r = rodar(dir, ['--proxima']);
  assert.equal(r.status, 1);
  assert.match(r.out, /ranking\.html:\d+ \?v= v1/);
  assert.equal(fs.readFileSync(path.join(dir, 'config.js'), 'utf8'), antes, 'nada pode ter sido gravado');
});

test('subir troca todos os lugares de uma vez e não aceita voltar', () => {
  const dir = copiaDaRaiz();
  const r = rodar(dir, ['--proxima']);
  assert.equal(r.status, 0, r.out);
  const trocas = Number(/(\d+) trocas/.exec(r.out)[1]);
  assert.ok(trocas >= 83, `esperava ao menos 83 trocas, vieram ${trocas}`);
  assert.equal(rodar(dir, []).status, 0);
  assert.equal(rodar(dir, ['v1']).status, 1, 'versão menor tem de falhar');
});

// Duas v149 diferentes nasceram em ramos paralelos (03/10/2026). O script lê a
// origin/main: número já usado lá, ou ramo que não contém a main, é recusado.
function repoComMain(versaoNaMain, mainEhAncestral) {
  const dir = copiaDaRaiz();
  const g = (...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { stdio: 'pipe', encoding: 'utf8' }).trim();
  g('init', '-q'); g('add', '-A'); g('commit', '-qm', 'base (dados fictícios)');
  const base = g('rev-parse', 'HEAD');
  if (mainEhAncestral) {
    g('update-ref', 'refs/remotes/origin/main', base);
  } else {
    const cfg = path.join(dir, 'config.js');
    const original = fs.readFileSync(cfg, 'utf8');
    fs.writeFileSync(cfg, original.replace(/const APP_VERSAO = '(v\d+)'/, `const APP_VERSAO = '${versaoNaMain}'`));
    fs.writeFileSync(path.join(dir, 'main-andou.txt'), 'commit que só a main tem\n');
    g('add', '-A'); g('commit', '-qm', 'outro ramo');
    g('update-ref', 'refs/remotes/origin/main', 'HEAD');
    g('reset', '-q', '--hard', base);
  }
  return dir;
}

test('número que a origin/main já usou é recusado sem gravar', () => {
  const v = atual(raiz);
  const dir = repoComMain(mais(v, 3), false);
  const antes = fs.readFileSync(path.join(dir, 'config.js'), 'utf8');
  const r = rodar(dir, [mais(v, 1)], {});
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, new RegExp(`origin/main já está em ${mais(v, 3)}`));
  assert.equal(fs.readFileSync(path.join(dir, 'config.js'), 'utf8'), antes);
});

test('ramo que não contém a origin/main é recusado, e o que contém sobe', () => {
  const v = atual(raiz);
  const fora = repoComMain(v, false); // a main tem um commit que o ramo não tem
  const r = rodar(fora, [mais(v, 1)], {});
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /não contém a origin\/main/);
  const dentro = repoComMain(v, true);
  const ok = rodar(dentro, [mais(v, 1)], {});
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, new RegExp(`origin/main em ${v}`));
});
