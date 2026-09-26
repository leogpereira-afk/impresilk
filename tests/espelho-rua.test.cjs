/* ESPELHO DO INSTALADOR NA RUA (auditoria de 25/09/2026). O celular é usado no
   sol, de luva, com uma mão e sinal ruim: cada teste aqui é um caminho em que
   o trabalho do instalador se perdia, ia para a O.S. errada ou travava a fila. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const OP = require('../operacao.js');
const hojeReal = OP.dia(new Date());

function espelho({ lista = [], fila = [], pushPhoto, confirmar = true } = {}) {
  const nodes = new Map(), toasts = [], salvas = [], chamadas = [], celebracoes = [], ls = new Map();
  let conflito = null;
  function node(sel) {
    if (!nodes.has(sel)) { const ops = []; nodes.set(sel, {innerHTML:'', textContent:'', value:'', querySelector:node, querySelectorAll:()=>[], setAttribute(){},
      classList:{ops, toggle(c,v){ops.push(['toggle',c,v]);}, add(c){ops.push(['add',c]);}, remove(c){ops.push(['remove',c]);}}}); }
    return nodes.get(sel);
  }
  // O store guarda a REFERÊNCIA do que foi salvo, como o de verdade (saveOS põe o objeto na lista).
  const STORE = {
    getCFG: () => ({}), getAllOS: () => lista, getOS: id => lista.find(o => o.id === id) || null, getQueue: () => fila,
    pushPhoto: pushPhoto || (async () => 'f1'), pullPhoto: async () => null, getLastSync: () => '2026-09-25T10:00:00Z',
    saveOS: o => { salvas.push(JSON.parse(JSON.stringify(o))); const i = lista.findIndex(x => x.id === o.id); if (i >= 0) lista[i] = o; else lista.push(o); },
    carimbarMomento: (o, h, c) => { const m = String(o[h] || '').match(/^(\d{1,2}):(\d{2})/); if (m) o[c] = `${hojeReal}T${m[1].padStart(2,'0')}:${m[2]}:00`; },
    delFoto: id => chamadas.push(['delFoto', id]), delFotoSync: id => chamadas.push(['delFotoSync', id]),
    onConflict: fn => { conflito = fn; },
    // Como o de verdade: a mescla (juntarFotos) vem como callback e roda no objeto enviado.
    sobrescreverServidor: (o, mesclar) => { if (mesclar) mesclar(o); chamadas.push(['sobrescrever', JSON.parse(JSON.stringify(o))]); return o; },
    aceitarServidor: r => chamadas.push(['aceitar', r.id]),
  };
  const ctx = vm.createContext({console, Date,
    document:{querySelector:node, querySelectorAll:()=>[], addEventListener(){}},
    window:{}, localStorage:{getItem:k => ls.has(k) ? ls.get(k) : null, setItem:(k, v) => ls.set(k, String(v))},
    STORE, setTimeout(){}, mostrarCelebracao: o => celebracoes.push(o), confirm: () => confirmar, navigator:{onLine:true}});
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(process.env.PCP_BASELINE || root, 'equipe.js'), 'utf8'), ctx);
  vm.runInContext('toast=(m,t)=>__toasts.push(m); fraseAleatoria=()=>({t:"",a:""}); EQ.instalador="Ana";', Object.assign(ctx, {__toasts: toasts}));
  return {node, toasts, salvas, chamadas, celebracoes, ls, fila, conflito: (...a) => conflito(...a),
    run: c => vm.runInContext(c, ctx), json: c => JSON.parse(vm.runInContext(`JSON.stringify(${c})`, ctx))};
}
const osRua = (id, extra = {}) => ({id, numero:'N' + id, cliente:'Cliente ' + id, tipo:'externo', equipe:['Ana'], liberadoPCP:true,
  confirmacao:'Confirmado', confEm:new Date().toISOString(), instalacao:{data:hojeReal, periodo:'Manhã'}, itens:[{item:'1', descricao:'Fachada'}], ...extra});

test('espelho: foto que termina de subir depois de trocar de ficha vai para a O.S. em que foi tirada', async () => {
  // Sinal fraco: a foto leva segundos para subir e o instalador já abriu a próxima O.S.
  let solta; const lenta = new Promise(r => { solta = r; });
  const t = espelho({lista:[osRua('A', {fotosCheckinIds:[]}), osRua('B', {fotosCheckinIds:[]})], pushPhoto: () => lenta});
  t.run(`openModal(STORE.getOS('A'))`);
  const cam = t.node('[data-checkin]'); cam.files = [{}];
  const envio = cam.onchange();
  t.run(`closeModal(); openModal(STORE.getOS('B'))`);
  solta('foto_A'); await envio;
  assert.deepEqual(t.json(`STORE.getOS('A').fotosCheckinIds`), ['foto_A'], 'a foto ficou na O.S. em que foi tirada');
  assert.equal(t.run('_draft.id'), 'B');
  assert.deepEqual(t.json('_draft.fotosCheckinIds'), [], 'a ficha aberta (outra O.S.) não recebeu a foto');
  assert.deepEqual(t.json(`STORE.getOS('B').fotosCheckinIds`), []);
});

test('espelho: fechar a ficha durante o envio não perde a foto do serviço pronto', async () => {
  let solta; const lenta = new Promise(r => { solta = r; });
  const t = espelho({lista:[osRua('A', {fotosRetornoIds:[]})], pushPhoto: () => lenta});
  t.run(`openModal(STORE.getOS('A'))`);
  // Sem o DOM de verdade, o handler é o mesmo que o input chama.
  const envio = t.run(`anexarFotos([{}], porNaLista('fotosRetornoIds'), o => { if (!o.horaRetorno) carimbarAgora(o, 'horaRetorno', 'retornoEm'); })`);
  t.run('closeModal()');
  solta('foto_R'); await envio;
  const a = t.json(`STORE.getOS('A')`);
  assert.deepEqual(a.fotosRetornoIds, ['foto_R']);
  assert.ok(a.retornoEm && a.retornoEm.startsWith(hojeReal), 'o carimbo é de hoje, não do dia agendado');
});

test('espelho: liberar o carro exige o cliente confirmado HOJE, a régua do servidor', () => {
  const ontem = OP.somarDias(hojeReal, -1);
  const t = espelho({lista:[osRua('1', {confEm: ontem + 'T17:00:00'})]});
  t.run(`openModal(STORE.getOS('1'))`);
  assert.match(t.node('#modal-os').innerHTML, /confirmado em \d\d\/\d\d, não hoje/);
  t.node('#m-carro').onclick();
  assert.equal(t.run('_draft.carroLiberado'), undefined, 'não liberou: o servidor responderia 422 e prenderia a O.S. na fila');
  assert.equal(t.salvas.length, 0);
  assert.match(t.toasts.join(' '), /não hoje/);
  t.run(`STORE.getOS('1').confEm = new Date().toISOString(); openModal(STORE.getOS('1'))`);
  t.node('#m-carro').onclick();
  assert.equal(t.run('_draft.carroLiberado'), true);
  assert.equal(t.salvas.length, 1);
});

test('espelho: gravação recusada pelo escritório vira aviso fixo e a cópia fica no celular', () => {
  const t = espelho();
  t.run(`registrarRecusa({item:{action:'upsert', os:{id:'1', numero:'300', fotosCheckinIds:['f1']}}, motivo:'Esta O.S. não está na sua equipe.'})`);
  const html = t.node('#eq-avisos').innerHTML;
  assert.match(html, /não aceitou a O\.S 300: Esta O\.S\. não está na sua equipe\./);
  assert.match(html, /data-aviso="recusa"/, 'fica até o instalador tocar em Entendi');
  const guardado = JSON.parse(t.ls.get('impresilk_inst_recusados'));
  assert.equal(guardado[0].item.os.id, '1');
  // Apagar foto recusado não perde trabalho nenhum: não alarma.
  t.run(`registrarRecusa({item:{action:'deletePhoto', fileId:'f9'}, motivo:'Esta foto não pode ser apagada por este aparelho.'})`);
  assert.equal(JSON.parse(t.ls.get('impresilk_inst_recusados')).length, 1);
});

test('espelho: a segunda gravação na mesma ficha, depois do envio aceito, não manda o rev velho', () => {
  const t = espelho({lista:[osRua('1', {rev:5, atualizadoEm:'2026-09-25T10:00:00.000Z'})]});
  t.run(`openModal(STORE.getOS('1')); _draft.kmSaida = '100'; save()`);
  assert.equal(t.salvas[0].rev, 5);
  // Envio aceito: o store troca a cópia pela resposta do servidor (rev 6, o mesmo atualizadoEm).
  const trocar = extra => t.run(`(() => { const l = STORE.getAllOS(); const i = l.findIndex(o => o.id === '1'); l[i] = Object.assign(JSON.parse(JSON.stringify(_draft)), ${extra}); })()`);
  trocar('{rev: 6}');
  t.run(`_draft.kmRetorno = '150'; save()`);
  assert.equal(t.salvas[1].rev, 6, 'o rev novo é da própria gravação');
  // Mudança de OUTRA pessoa (outro atualizadoEm) continua sendo conflito.
  trocar(`{rev: 9, atualizadoEm: '2026-09-25T11:00:00.000Z', atualizadoPor: 'PCP'}`);
  t.run(`_draft.obsTecnicas = 'x'; save()`);
  assert.equal(t.salvas[2].rev, 6);
});

test('espelho: a comemoração não mostra nota calculada no aparelho', () => {
  const t = espelho({lista:[osRua('1', {instalacaoOK:true, fotosCheckinIds:['c1'], fotosRetornoIds:['r1'], horaRetorno:'15:10'})]});
  t.run(`openModal(STORE.getOS('1'))`);
  t.node('#m-finalizar').onclick();
  assert.ok(t.salvas.at(-1).finalizadaEm);
  assert.equal(t.celebracoes.length, 1);
  assert.equal(t.celebracoes[0].notas, undefined);
  assert.equal(t.run('typeof notasDaEquipe'), 'undefined');
});

test('espelho: finalizar pergunta antes e avisa os itens ainda como Pendente', () => {
  const t = espelho({lista:[osRua('1', {instalacaoOK:true, fotosCheckinIds:['c1'], fotosRetornoIds:['r1'], horaRetorno:'15:10'})], confirmar:false});
  t.run(`openModal(STORE.getOS('1'))`);
  t.node('#m-finalizar').onclick();
  assert.equal(t.salvas.length, 0, 'disse não: nada finalizado');
});

test('espelho: o que falta para finalizar fica escrito acima do botão, não só num aviso de 3 s', () => {
  const t = espelho({lista:[osRua('1')]});
  t.run(`openModal(STORE.getOS('1'))`);
  t.node('#m-finalizar').onclick();
  const html = t.node('#modal-os').innerHTML;
  assert.match(html, /class="trava-msg eq-falta"[^]*foto de check-in[^]*foto do serviço pronto[^]*hora de retorno/);
  // E a ficha rolou até o primeiro bloco a resolver (a chegada, com a foto de check-in).
  assert.equal(t.node('#modal-os [data-bloco="chegada"]').open, true);
});

test('espelho: retirada (o cliente vem buscar) finaliza com PCP liberado e um item, sem saída nem retorno', () => {
  const t = espelho({lista:[osRua('r', {tipo:'interno', confirmacao:'', confEm:'', itens:[{item:'1', descricao:'Placa', statusInst:'ok'}]})]});
  t.run(`openModal(STORE.getOS('r'))`);
  const html = t.node('#modal-os').innerHTML;
  assert.doesNotMatch(html, /id="m-carro"|data-checkin|Hora retorno/);
  assert.match(html, /Entregue ao cliente/);
  t.node('#m-finalizar').onclick();
  assert.ok(t.salvas.at(-1) && t.salvas.at(-1).finalizadaEm, 'a retirada fecha');
  assert.doesNotMatch(t.toasts.join(' '), /hora de retorno|confirmação/);
});

test('espelho: a ficha segue a ordem do dia e a O.S. finalizada não oferece foto nem ×', () => {
  const t = espelho({lista:[osRua('1', {fotosCheckinIds:['c1'], fotosRetornoIds:['r1']}), osRua('2', {fotosCheckinIds:['c2'], finalizadaEm:hojeReal + 'T15:00:00'})]});
  t.run(`openModal(STORE.getOS('1'))`);
  const html = t.node('#modal-os').innerHTML;
  const pos = b => html.indexOf(`data-bloco="${b}"`);
  assert.ok(pos('saida') < pos('chegada') && pos('chegada') < pos('itens') && pos('itens') < pos('pronto') && pos('pronto') < pos('volta'),
    'saída, chegada (check-in), itens, serviço pronto, retorno');
  assert.ok(html.indexOf('id="m-finalizar"') > pos('volta'));
  assert.doesNotMatch(html, /Check‑out|checkout\.situacao/, 'o bloco Check-out saiu do espelho');
  t.run(`openModal(STORE.getOS('2'))`);
  const fin = t.node('#modal-os').innerHTML;
  assert.doesNotMatch(fin, /data-rm=|data-checkin|data-retorno/);
});

test('espelho: a lista começa por hoje; vencida e próximas depois; finalizadas num bloco fechado', () => {
  const lista = [
    osRua('v', {instalacao:{data:OP.somarDias(hojeReal, -10), periodo:'Manhã'}}),
    osRua('f', {instalacao:{data:OP.somarDias(hojeReal, -3), periodo:'Manhã'}, finalizadaEm:OP.somarDias(hojeReal, -3) + 'T15:00:00'}),
    osRua('h', {instalacao:{data:hojeReal, periodo:'Tarde'}}),
    osRua('p', {instalacao:{data:OP.somarDias(hojeReal, 2), periodo:'Manhã'}}),
  ];
  const t = espelho({lista});
  t.run('renderList()');
  const html = t.node('#eq-list').innerHTML;
  const pos = id => html.indexOf(`data-os-id="${id}"`);
  assert.ok(pos('h') > 0 && pos('h') < pos('v') && pos('v') < pos('p'), 'hoje, depois vencida, depois próximas');
  assert.ok(pos('f') > html.indexOf('eq-finalizadas'), 'finalizada fica no bloco das finalizadas');
  assert.doesNotMatch(html, /eq-finalizadas"[^>]*\sopen/, 'o bloco das finalizadas vem fechado');
  // O que ainda não foi para o escritório aparece na linha da O.S.
  t.fila.push({action:'upsert', os:{id:'p'}});
  t.run('renderList()');
  assert.match(t.node('#eq-list').innerHTML, /data-os-id="p"[^]*?ainda no celular/);
});

test('espelho: lista vazia diz se não conseguiu baixar, em vez de "nada para você"', () => {
  const t = espelho();
  t.run('renderList()');
  assert.match(t.node('#eq-list').innerHTML, /Carregando/);
  t.run('EQ.pronto = true; STORE.getLastSync = () => null; renderList()');
  assert.match(t.node('#eq-list').innerHTML, /Ainda não consegui baixar/);
});

test('espelho: apagar foto tira também o envio pendente (nada de delFoto sozinho)', () => {
  const src = fs.readFileSync(path.join(process.env.PCP_BASELINE || root, 'equipe.js'), 'utf8');
  assert.doesNotMatch(src, /STORE\.delFoto\(/, 'delFoto deixava o putPhoto preso na fila para sempre');
  assert.match(src, /STORE\.delFotoSync\(/);
});

test('espelho: no conflito, o botão principal guarda o trabalho e junta as fotos do escritório', () => {
  const t = espelho({lista:[osRua('1'), osRua('2')]});
  t.run('initConflict()');
  t.conflito({id:'1', numero:'300', fotosCheckinIds:['meu']}, {id:'1', numero:'300', fotosCheckinIds:['colega'], rev:7});
  t.conflito({id:'2', numero:'400', fotosCheckinIds:[]}, {id:'2', numero:'400', rev:3});
  const msg = t.node('#conflict-msg').textContent;
  assert.match(msg, /O PCP alterou a O\.S 300[^]*\(1 de 2\)/);
  assert.doesNotMatch(msg, /servidor/);
  t.node('#conflict-overwrite').onclick();
  const s = t.chamadas.find(c => c[0] === 'sobrescrever')[1];
  assert.deepEqual([...s.fotosCheckinIds].sort(), ['colega', 'meu'], 'a foto do colega não cai');
  assert.match(t.node('#conflict-msg').textContent, /O\.S 400/, 'o segundo conflito aparece em seguida');
  const html = fs.readFileSync(path.join(root, 'equipe.html'), 'utf8');
  assert.match(html, /class="btn-primary" id="conflict-overwrite">Manter o que eu fiz/);
});

test('espelho: "Autorizar de novo" com o acesso ainda valendo tem volta para a lista', () => {
  const t = espelho({lista:[osRua('1')]});
  t.run('lerCracha = () => null; EQ.pedirAutorizacao = true; mostrarAutorizacao();');
  const html = t.node('#select-screen').innerHTML;
  assert.match(html, /id="eq-voltar-lista"/, 'sem o botão o instalador ficava preso no formulário da gestão');
  t.run('EQ.pedirAutorizacao = false; mostrarAutorizacao();');
  assert.doesNotMatch(t.node('#select-screen').innerHTML, /eq-voltar-lista/, 'primeira entrada não tem lista para onde voltar');
});

test('espelho: aviso do servidor corrige a ficha aberta (finalização que ficou de fora)', () => {
  const t = espelho({lista:[osRua('1', {rev: 5})]});
  t.run(`openModal(STORE.getOS('1')); _draft.finalizadaEm = '2026-09-25T15:00:00'; _draft.rev = 6; _dirty = false;`);
  // O store adotou o rev no rascunho e trocou o objeto da lista pela resposta, sem a finalização.
  t.run(`(() => { const i = STORE.getAllOS().findIndex(o => o.id === '1'); STORE.getAllOS()[i] = {...JSON.parse(JSON.stringify(_draft)), finalizadaEm: undefined}; })()`);
  t.run('atualizarModalAberto()');
  assert.ok(t.run('_draft.finalizadaEm'), 'pull comum com o mesmo rev não mexe');
  t.run('atualizarModalAberto(true)');
  assert.equal(t.run('_draft.finalizadaEm'), undefined, 'a ficha deixa de dizer "finalizada"');
});

test('espelho: O.S. que voltou ontem e só falta finalizar fica em Hoje, não em "data vencida"', () => {
  const t = espelho();
  const ontem = OP.somarDias(hojeReal, -1);
  const g = t.json(`gruposDaLista([${JSON.stringify(osRua('v', {instalacao:{data:ontem, periodo:'Manhã'}, horaSaida:'08:00', horaRetorno:'12:00'}))}], '${hojeReal}')`);
  assert.deepEqual(g.hoje.map(o => o.id), ['v']);
  assert.equal(g.vencidas.length, 0);
});
