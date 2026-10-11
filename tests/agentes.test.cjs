// O Codex lê AGENTS.md e o Claude lê CLAUDE.md: as regras só valem para os
// dois se o texto for o mesmo. E o VEZ.md tem de estar legível e completo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const raiz = path.join(__dirname, '..');
const vez = require('../scripts/vez.cjs');

test('AGENTS.md e CLAUDE.md têm o mesmo texto', () => {
  const a = fs.readFileSync(path.join(raiz, 'AGENTS.md'), 'utf8');
  const c = fs.readFileSync(path.join(raiz, 'CLAUDE.md'), 'utf8');
  assert.equal(c, a, 'mudou um, copie no outro');
});

// Com a vez livre (ninguem), a Passagem tem de estar inteira: é o que o próximo
// lê. Com a vez de alguém, os campos existem mas podem estar em "-" enquanto ele
// trabalha (o `pegar` zera a Passagem do anterior). Exigir a Passagem cheia o
// tempo todo barraria o primeiro push de código de quem acabou de pegar a vez.
test('VEZ.md diz de quem é a vez e a Passagem existe (inteira com a vez livre)', () => {
  const c = vez.ler(fs.readFileSync(path.join(raiz, 'VEZ.md'), 'utf8'));
  assert.ok(['ninguem', 'claude', 'codex', 'leo'].includes(c.agente), `agente inválido: ${c.agente}`);
  for (const k of ['desde', 'ramo', 'tarefa', 'sessao', 'versao_reservada', 'arquivos_em_uso', 'passou_por', 'passou_em', ...vez.CAMPOS_PASSAGEM]) assert.ok(k in c, `VEZ.md sem a linha "${k}:"`);
  if (c.agente === 'ninguem') assert.deepEqual(vez.passagemCompleta(c).faltam, [], 'vez livre exige a Passagem inteira');
});

test('pegar: livre ou minha passa; de outro agente não passa', () => {
  assert.equal(vez.podePegar({ agente: 'ninguem' }, 'codex').ok, true);
  assert.equal(vez.podePegar({ agente: 'codex' }, 'codex').ok, true);
  const r = vez.podePegar({ agente: 'claude', desde: '2026-10-01', tarefa: 'F21' }, 'codex');
  assert.equal(r.ok, false);
  assert.match(r.motivo, /a vez é de claude/);
  assert.match(r.motivo, /liberar/, 'diz como o dono libera');
  assert.equal(vez.podePegar({ agente: 'claude' }, 'leo').ok, true, 'o dono sempre pode');
});

// T2 da revisão de 11/10: duas sessões do mesmo agente trabalhavam em paralelo,
// porque "pegar" com a vez já sua só trocava ramo e tarefa.
test('pegar: a vez do mesmo agente em OUTRA sessão não passa; a mesma sessão e a sessão "-" passam', () => {
  const outra = vez.podePegar({ agente: 'claude', sessao: 'a1b2c3d4 (impresilk-protocolo)', ramo: 'protocolo' }, 'claude', 'ffff0000');
  assert.equal(outra.ok, false);
  assert.match(outra.motivo, /OUTRA sessão/);
  assert.equal(vez.podePegar({ agente: 'claude', sessao: 'a1b2c3d4 (x)' }, 'claude', 'a1b2c3d4').mesma, true);
  assert.equal(vez.podePegar({ agente: 'claude', sessao: '-' }, 'claude', 'ffff0000').ok, true, 'ninguém registrou a sessão: a primeira adota');
  assert.equal(vez.idSessao('a1b2c3d4 (impresilk-protocolo)'), 'a1b2c3d4');
  assert.equal(vez.idSessao('-'), '');
});

test('passar: Passagem incompleta é recusada e diz o que falta', () => {
  const r = vez.passagemCompleta({ no_ar: 'main abc v165', ramos: '-', feito: 'x' });
  assert.equal(r.ok, false);
  assert.ok(r.faltam.includes('ramos') && r.faltam.includes('testes'));
});

test('conferir: commit sem "Agente:" ou fora da vez é recusado', () => {
  assert.equal(vez.conferirCommit('feat: x', { agente: 'codex' }).ok, false);
  assert.equal(vez.conferirCommit('feat: x\n\nAgente: codex', { agente: 'codex' }).ok, true);
  assert.match(vez.conferirCommit('feat: x\n\nAgente: claude', { agente: 'codex' }).motivo, /vez é de codex/);
  assert.equal(vez.conferirCommit('vez: codex passa\n\nAgente: codex', { agente: 'ninguem' }, { agente: 'codex' }).ok, true, 'devolução assinada por quem tinha a vez');
  assert.equal(vez.conferirCommit('fix\n\nAgente: claude', { agente: 'ninguem' }, { agente: 'ninguem' }).ok, false, 'com a vez livre ninguém comita código');
  assert.equal(vez.conferirCommit('fix\n\nAgente: fulano', { agente: 'codex' }).ok, false, 'agente fora da lista');
});

test('conferir: a vez só troca de agente pela devolução ou pelo dono', () => {
  const tomada = vez.conferirCommit('vez: codex pega\n\nAgente: codex', { agente: 'codex' }, { agente: 'claude' });
  assert.equal(tomada.ok, false, 'codex trocou claude por codex sem devolução');
  assert.match(tomada.motivo, /passou de claude para codex/);
  // O commit da vez só mexe no VEZ.md (soVez); "Agente: leo" fora do site do GitHub só vale assim.
  assert.equal(vez.conferirCommit('vez: leo pega\n\nAgente: leo', { agente: 'leo' }, { agente: 'claude' }, { soVez: true }).ok, true, 'o dono pode tomar');
  assert.equal(vez.conferirCommit('vez: codex pega\n\nAgente: codex', { agente: 'codex' }, { agente: 'ninguem' }).ok, true, 'vez livre pode ser pega');
});

test('conferir: num merge vale contra cada pai (o conflito do VEZ.md não toma a vez)', () => {
  // Dois pegaram a vez livre ao mesmo tempo; o push do codex foi recusado e ele
  // juntou a main ficando com a própria versão do VEZ.md.
  const merge = vez.conferirCommit('Merge origin/main\n\nAgente: codex', { agente: 'codex' }, [{ agente: 'codex' }, { agente: 'claude' }]);
  assert.equal(merge.ok, false);
  assert.match(merge.motivo, /passou de claude para codex/);
  assert.equal(vez.conferirCommit('Merge main\n\nAgente: codex', { agente: 'codex' }, [{ agente: 'codex' }, { agente: 'codex' }]).ok, true, 'merge de quem tem a vez');
  assert.equal(vez.conferirCommit('Merge a1\n\nAgente: claude', { agente: 'claude' }, [{ agente: 'claude' }, null]).ok, true, 'juntar ramo de antes do protocolo');
  assert.equal(vez.conferirCommit('vez: codex passa\n\nAgente: codex', { agente: 'ninguem' }, [{ agente: 'codex' }, { agente: 'ninguem' }]).ok, true, 'devolução num merge');
});

test('conferir: antes do VEZ.md vale só a linha Agente; apagar o VEZ.md é recusado', () => {
  // Commit de antes do protocolo (sem VEZ.md nele nem no pai), como o conserto A1.
  assert.equal(vez.conferirCommit('fix(comissao): A1\n\nAgente: claude\nCo-Authored-By: x', null, null).ok, true);
  assert.equal(vez.conferirCommit('feat: v164', null, null).ok, false, 'sem a linha Agente continua recusado');
  // O commit que cria o VEZ.md é conferido contra o próprio VEZ.md.
  assert.equal(vez.conferirCommit('protocolo\n\nAgente: claude', { agente: 'claude' }, null).ok, true);
  assert.equal(vez.conferirCommit('protocolo\n\nAgente: codex', { agente: 'claude' }, null).ok, false);
  const apaga = vez.conferirCommit('limpeza\n\nAgente: codex', null, { agente: 'claude' });
  assert.equal(apaga.ok, false);
  assert.match(apaga.motivo, /apaga o VEZ\.md/);
});

// CI-07 e CI-08 da revisão de 11/10: "Agente: leo" passava sempre, e o commit
// do dono feito no site do GitHub (sem a linha) ficava vermelho para sempre.
test('conferir: o dono pelo site do GitHub passa sem a linha; "Agente: leo" de agente só vale na vez', () => {
  const vezCodex = { agente: 'codex' };
  assert.equal(vez.conferirCommit('Update casa.js', vezCodex, vezCodex, { assinadoGitHub: true }).ok, true, 'editor do site, assinado pelo GitHub');
  assert.equal(vez.conferirCommit('Merge pull request #9 from x/y', vezCodex, [vezCodex, vezCodex], { assinadoGitHub: true }).ok, true, 'botão de merge');
  const semAssinatura = vez.conferirCommit('Update casa.js', vezCodex, vezCodex, { assinadoGitHub: false });
  assert.equal(semAssinatura.ok, false, 'committer GitHub sem a assinatura não vale');
  assert.match(semAssinatura.motivo, /site do GitHub/);
  const leoCodigo = vez.conferirCommit('feat: x\n\nAgente: leo', { agente: 'ninguem' }, { agente: 'ninguem' }, { soVez: false });
  assert.equal(leoCodigo.ok, false, 'código assinado "leo" por um agente');
  assert.match(leoCodigo.motivo, /só vale em commit que mexe só no VEZ\.md/);
  const liberar = vez.conferirCommit('vez: o dono libera\n\nAgente: leo', { agente: 'ninguem' }, { agente: 'claude' }, { soVez: true });
  assert.equal(liberar.ok, true, 'liberar a vez por ordem do dono');
  assert.equal(liberar.semAssinatura, true, 'e a CI avisa');
  assert.equal(vez.conferirCommit('feat: x\n\nAgente: claude', vezCodex, vezCodex, { aceito: true }).ok, true, 'commit aceito pelo dono');
});

test('conferir: depois do protocolo no ar, mexer nas regras da vez exige o dono', () => {
  const v = { agente: 'codex' };
  const extra = { protegidos: ['scripts/vez.cjs'], protocoloNoAr: true };
  const r = vez.conferirCommit('fix: conferir\n\nAgente: codex', v, v, extra);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /scripts\/vez\.cjs \(as regras da vez\) sem o dono/);
  assert.equal(vez.conferirCommit('fix\n\nAgente: codex', v, v, { ...extra, trazidoPeloDono: true }).ok, true, 'entrou por merge do dono no site');
  assert.equal(vez.conferirCommit('fix\n\nAgente: codex', v, v, { ...extra, protocoloNoAr: false }).ok, true, 'a primeira publicação do protocolo traz tudo junto');
  for (const a of ['scripts/vez.cjs', 'AGENTS.md', 'CLAUDE.md', '.github/workflows/deploy.yml']) assert.ok(vez.PROTEGIDOS.test(a), a);
  assert.ok(!vez.PROTEGIDOS.test('scripts/subir-versao.cjs'));
});
