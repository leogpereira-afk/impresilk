const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('path');
const root = path.join(__dirname, '..');

function casa(lista, cfg = {}, elenco = null) {
  const guardado = {};
  const ctx = vm.createContext({
    console,
    Date,
    STORE: {
      getAllOS: () => lista,
      getCFG: () => ({ instaladores: ['Natan', 'Paulo', 'Lucas', 'Rafael'], ...cfg }),
      saveCFG(c) { Object.assign(cfg, c); },
      uuid: () => 'id-1',
      elenco: () => elenco || { pessoas: [], veiculos: [], ferias: [], ausencias: [] },
      entreguesMes: () => null,
      pullEntreguesMes() {},
      anosEntregues: () => (cfg._anosERP || [2026, 2025, 2024, 2023, 2022, 2021, 2020]),
      valores: () => ({}),
    },
    STATE: {},
    document: { getElementById: () => null, querySelectorAll: () => [], body: { classList: { add() {}, remove() {}, contains: () => false } } },
    localStorage: {
      getItem: k => (k in guardado ? guardado[k] : null),
      setItem: (k, v) => { guardado[k] = String(v); },
      removeItem: k => { delete guardado[k]; },
    },
    esc: s => String(s ?? ''),
    emptyState: () => '',
    bindCardClicks() {},
    toast() {},
    fmtInstalacao: () => '',
    filtroPeriodoHTML: () => '',
    parseLocalDate: str => { const m = String(str || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; },
    // pessoaDoElenco mora no app.js; aqui entra a mesma regra, reduzida.
    pessoaDoElenco: apelido => {
      const n = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const ps = (elenco && elenco.pessoas) || [];
      return ps.find(p => n(p.apelido) === n(apelido)) || ps.find(p => n(p.nome) === n(apelido)) || null;
    },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'casa.js'), 'utf8'), ctx);
  return { run: code => vm.runInContext(code, ctx) };
}

const mes = '2026-09';
const fin = (id, patch) => ({
  id, numero: id, tipo: 'externo', finalizadaEm: '2026-09-10T12:00:00', equipe: ['Natan'], ...patch,
});
const NATAN = { id: '111111', nome: 'Natan da Silva', apelido: 'Natan' };
const PAULO = { id: '222222', nome: 'Paulo Souza', apelido: 'Paulo' };
const LUCAS = { id: '333333', nome: 'Lucas Lima', apelido: 'Lucas' };
const FICHAS = { vinculosRH: [NATAN, PAULO, LUCAS] };

test('entrega da casa é O.S. finalizada no PCP, não baixa Mubisys', () => {
  const t = casa([
    fin('1'),
    fin('2', { finalizadaEm: '2026-09-10T12:00:00', finalizadoPor: 'Mubisys · baixa' }),
    fin('3', { tipo: 'interno' }),
    fin('4', { finalizadaEm: '2026-08-30T12:00:00' }),
  ]);
  assert.deepEqual(t.run(`osFinalizadasMes('${mes}').map(o=>o.id)`), ['1', '3']);
});

test('id da ficha são 6 dígitos; nome não casa sozinho', () => {
  const t = casa([], FICHAS);
  assert.equal(t.run("idPessoaCasa('111111')"), '111111');
  assert.equal(t.run("idPessoaCasa('111.111.000-99')"), '111111');
  assert.equal(t.run("idPessoaCasa('1111')"), '');
  assert.equal(t.run("idPessoaCasa('Natan')"), '');
  assert.equal(t.run("chavePessoaCasa('111111')"), '111111');
  assert.equal(t.run("chavePessoaCasa('Natan')"), '111111');
  // DUAS RÉGUAS VIRARAM UMA (14/09/2026): `fichaDoApelido` já casava
  // normalizado (sem acento, sem caixa) e `fichaPorApelido` casava byte a byte
  // — a mesma pergunta com duas respostas. Caixa não distingue pessoa: o
  // apelido é digitado à mão na O.S, e "natan" é o Natan. O que continua NÃO
  // casando sozinho é o nome completo, que é o ponto deste teste.
  assert.equal(t.run("chavePessoaCasa('natan')"), '111111');
  assert.equal(t.run("chavePessoaCasa('Natan da Silva')"), '');
  assert.equal(t.run("rotuloPessoaCasa('111111')"), 'Natan da Silva · ID 111111');
});

test('ponto vai para o ID apontado; várias fichas na mesma O.S. levam ponto', () => {
  const t = casa([
    fin('a', { equipe: ['Natan'] }),
    fin('b', { equipe: ['Paulo', 'Lucas'] }),
    fin('c', { equipe: [] }),
  ], FICHAS);
  const rank = t.run(`rankingFinalizadas('${mes}', {})`);
  assert.equal(rank.length, 1);
  assert.equal(rank[0].id, '111111');
  assert.equal(rank[0].osCount, 1);
  const um = t.run(`rankingFinalizadas('${mes}', {b:['333333']})`);
  assert.equal(um.length, 2);
  assert.equal(um.find(p => p.id === '333333').osCount, 1);
  const legado = t.run(`rankingFinalizadas('${mes}', {b:'Lucas'})`);
  assert.equal(legado.find(p => p.id === '333333').osCount, 1);
  const dois = t.run(`rankingFinalizadas('${mes}', {b:['222222','333333']})`);
  assert.equal(dois.length, 3);
  assert.equal(dois.find(p => p.id === '222222').osCount, 1);
  assert.equal(dois.find(p => p.id === '333333').osCount, 1);
  assert.equal(dois.reduce((s, p) => s + p.osCount, 0), 3);
  const vazio = t.run(`rankingFinalizadas('${mes}', {a:[], b:['222222']})`);
  assert.equal(vazio.length, 1);
  assert.equal(vazio[0].id, '222222');
});

test('apelido sem ficha não entra; desmarcar todos tira a O.S. da apuração', () => {
  const t = casa([fin('a', { equipe: ['Natan'] })]);
  assert.equal(t.run(`rankingFinalizadas('${mes}', {})`).length, 0);
  const t2 = casa([fin('a', { equipe: ['Natan'] })], FICHAS);
  assert.equal(t2.run(`rankingFinalizadas('${mes}', {a:[]})`).length, 0);
});

test('participantes da O.S. não substituem a ficha; sem ID não há ponto', () => {
  const os = fin('a', {
    equipe: ['Natan'],
    programacaoRH: { participantes: [{ colaboradorId: 'natan-silva', nome: 'Natan da Silva', nomePCP: 'Natan' }] },
  });
  const t = casa([os]);
  assert.equal(t.run(`rankingFinalizadas('${mes}', {})`).length, 0);
  const t2 = casa([os], FICHAS);
  assert.equal(t2.run(`rankingFinalizadas('${mes}', {})`)[0].id, '111111');
});

test('retrabalho marca a pessoa e não inventa valor; extra não entra', () => {
  const t = casa([
    fin('1', { equipe: ['Natan'], retrabalho: true }),
    fin('2', { equipe: ['Natan'] }),
  ], FICHAS);
  const rank = t.run(`rankingFinalizadas('${mes}', {})`);
  assert.equal(rank[0].id, '111111');
  assert.equal(rank[0].osCount, 2);
  assert.equal(rank[0].retrab, 1);
  assert.equal(t.run('propostaCasa(2, 2, 0, 0)'), 0);
  assert.equal(t.run('propostaCasa(1, 2, 1000, 0)'), 500);
  assert.equal(t.run('propostaCasa(1, 2, 1000, 200)'), 200);
});

test('menu e permissões conhecem Entregas, Performance, Agenda, Plantões e Programação', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  for (const aba of ['entregas', 'performance', 'agenda', 'plantoes', 'grade']) {
    assert.match(html, new RegExp(`data-tab="${aba}"`));
    assert.match(html, new RegExp(`data-panel="${aba}"`));
    assert.match(js, new RegExp(`'${aba}'`));
  }
  assert.match(html, /data-tab="programacao"/);
  assert.match(js, /ABAS_DISPONIVEIS = \[[^\]]*'entregas'[^\]]*'grade'/);
  assert.match(html, /nav-marca/);
  // Padrão da casa (RH/Painel), pedido do dono em 14/09/2026: emoji por item.
  assert.match(html, /data-tab="pcp"><span class="nav-emoji"[^>]*>📋/);
  assert.doesNotMatch(html, /RH \+ PCP/);
});

test('calendário da casa lê o prazo da O.S., inclusive retirada', () => {
  const t = casa([
    { id: 'e', tipo: 'externo', previsaoEntrega: '2026-09-13', instalacao: {} },
    { id: 'i', tipo: 'interno', instalacao: { data: '2026-09-13' } },
    { id: 'a', tipo: 'externo', instalacao: { data: '2026-09-13', periodo: 'Manhã' }, equipe: ['Natan'] },
  ]);
  assert.equal(t.run('diasCasa(STORE.getAllOS()[0]).join(",")'), '2026-09-13');
  assert.equal(t.run('diasCasa(STORE.getAllOS()[1]).join(",")'), '2026-09-13');
  assert.equal(t.run("osNoMesCasa('2026-09').map(o=>o.id).sort().join(',')"), 'a,e,i');
});

/* ── Onda 4 (14/09/2026): ficha do RH, presença, relatórios e escala ────── */
const ELENCO = {
  em: '2026-09-14T10:00:00Z',
  pessoas: [
    { chave: 'natan-silva', id: '111111', nome: 'Natan da Silva', apelido: 'Natan', cargo: 'Instalador de CV', area: 'Instalação Externa', statusId: 'ativo', status: 'Ativo', ativo: true, foto: 'data:image/jpeg;base64,AAA' },
    { chave: 'paulo-souza', id: '222222', nome: 'Paulo Souza', apelido: 'Paulo', cargo: 'Soldador', area: 'Serralheria', statusId: 'inativo', status: 'Inativo', ativo: false, foto: '' },
    { chave: 'lucas-lima', id: '333333', nome: 'Lucas Lima', apelido: 'Lucas', cargo: 'Operador', area: 'Montagem Interna', statusId: 'ativo', status: 'Ativo', ativo: true, foto: '' },
    { chave: 'ana-dias', id: '444444', nome: 'Ana Dias', apelido: 'ana', cargo: 'Consultora', area: 'Comercial', statusId: 'ativo', status: 'Ativo', ativo: true, foto: '' },
  ],
  veiculos: [{ id: 'v1', nome: 'Strada', categoria: 'Utilitário', placa: 'ABC1D23', modelo: 'Fire Flex', lugares: 2, grade: true, motorista: 'Natan da Silva' }],
  ferias: [{ chave: 'lucas-lima', de: '2026-09-10', ate: '2026-09-20', status: 'Agendada' }],
  ausencias: [{ chave: 'ana-dias', data: '2026-09-14', tipo: 'Falta', horas: 8 }],
};

test('ficha do apelido: vínculo salvo manda, senão casa sozinho pelo RH', () => {
  const t = casa([], {}, ELENCO);
  assert.equal(t.run("fichaDoApelido('Natan').nome"), 'Natan da Silva');
  assert.equal(t.run("fichaDoApelido('Ninguém')"), null);
  // vínculo salvo à mão vence o casamento automático
  const t2 = casa([], { vinculosRH: [{ id: '333333', chave: 'lucas-lima', nome: 'Lucas Lima', apelido: 'Natan' }] }, ELENCO);
  assert.equal(t2.run("fichaDoApelido('Natan').chave"), 'lucas-lima');
});

test('presença de hoje: férias e falta saem; inativo não entra em nenhuma lista', () => {
  const t = casa([], {}, ELENCO);
  assert.equal(t.run("presencaRH('2026-09-14').presentes.map(x => x.nome).join('|')"), 'Natan da Silva');
  assert.equal(t.run("presencaRH('2026-09-14').ausentes.map(x => x.p.nome + ': ' + x.motivo).join('|')"), 'Ana Dias: Falta|Lucas Lima: Férias');
  assert.equal(t.run("presencaRH('2026-09-14').fora.map(x => x.nome).join('|')"), 'Paulo Souza');
  // fora do intervalo das férias, Lucas volta
  assert.match(t.run("presencaRH('2026-09-25').presentes.map(x => x.nome).join('|')"), /Lucas Lima/);
});

// O CASO RUIM: quem entra pelo nome, sem senha, NÃO recebe férias nem ausências
// do servidor (elas são ficha do RH). O pacote chega com as listas vazias e
// `fichaRH:false`. Antes deste teste a tela lia esse vazio como "ninguém está
// fora" e escrevia "0 fora hoje" com gente de atestado na fábrica.
test('sem acesso à ficha do RH, a presença não afirma que ninguém está fora', () => {
  const semFicha = { ...ELENCO, ferias: [], ausencias: [], fichaRH: false,
    pessoas: ELENCO.pessoas.map(p => ({ ...p, statusId: '', status: '' })) };
  const t = casa([], {}, semFicha);
  assert.equal(t.run('temFichaRH()'), false, 'o pacote diz que a ficha não veio');
  assert.equal(t.run("presencaRH('2026-09-14').sabeSituacao"), false, 'a tela precisa saber que não sabe');
  assert.equal(t.run("presencaRH('2026-09-14').ausentes.length"), 0, 'sem dado, ninguém é classificado como ausente');
  // e o aviso da escala diz que não conferiu, em vez de ficar mudo
  assert.match(t.run("avisoAusenciaCasa(['Lucas'], '2026-09-14')"), /não foram conferidos|crachá da gestão/);
  // com a ficha (gestão), nada muda: continua apontando quem está fora
  const comFicha = casa([], {}, ELENCO);
  assert.equal(comFicha.run('temFichaRH()'), true);
  assert.equal(comFicha.run("presencaRH('2026-09-14').sabeSituacao"), true);
  assert.equal(comFicha.run("presencaRH('2026-09-14').ausentes.length"), 2);
  assert.equal(comFicha.run("avisoAusenciaCasa(['Natan'], '2026-09-14')"), '', 'quem está disponível não gera aviso');
});

test('quem está inativo no RH sai da lista de escala; o RH entra para o plantão', () => {
  const t = casa([], {}, ELENCO);
  const pcp = t.run("equipeEscalavel().doPCP.join('|')");
  const rh = t.run("equipeEscalavel().doRH.map(p => p.nome).join('|')");
  assert.ok(!pcp.includes('Paulo'), 'Paulo está inativo e não pode ser escalado');
  assert.match(pcp, /Natan/); assert.match(pcp, /Lucas/);
  assert.match(pcp, /Rafael/, 'apelido sem ficha continua na lista do PCP');
  assert.match(rh, /Ana Dias/, 'a empresa toda entra pelo RH');
  assert.ok(!rh.includes('Paulo Souza'), 'inativo não entra nem pelo RH');
});

test('apelido sem ficha aparece para ligar, e ligar resolve', () => {
  const cfg = {};
  const t = casa([fin('a', { equipe: ['Natan', 'Zeca'] })], cfg, ELENCO);
  assert.equal(t.run("apelidosSemFicha().map(x => x.apelido).join('|')"), 'Zeca');
  assert.equal(t.run("ligarApelidoRH('Zeca', 'lucas-lima')"), true);
  assert.equal(t.run("fichaDoApelido('Zeca').nome"), 'Lucas Lima');
  assert.equal(t.run('apelidosSemFicha().length'), 0);
});

test('produtividade agrupa pela ficha: dois apelidos da mesma pessoa viram um', () => {
  const t = casa([
    fin('1', { equipe: ['Natan'] }),
    fin('2', { equipe: ['Natan da Silva'] }),
  ], {}, ELENCO);
  assert.equal(t.run('agruparPorPessoaCasa(STORE.getAllOS()).length'), 1);
  assert.equal(t.run('agruparPorPessoaCasa(STORE.getAllOS())[0].chave'), 'natan-silva');
  assert.equal(t.run('agruparPorPessoaCasa(STORE.getAllOS())[0].os'), 2);
});

test('meses do intervalo e a fila de três por vez', () => {
  const t = casa([]);
  assert.equal(t.run("mesesEntre('2026-07-05','2026-09-14').join('|')"), '2026-07|2026-08|2026-09');
  assert.equal(t.run("mesesEntre('2026-09-01','2026-09-30').join('|')"), '2026-09');
  assert.equal(t.run('ERP_EM_VOO'), 3);
  // nenhum pacote em cache: a tela não quebra, pede os meses e segue vazia
  assert.equal(t.run("entreguesERP('2026-01-01','2026-09-14').os.length"), 0);
  assert.equal(t.run("entreguesERP('2026-01-01','2026-09-14').faltando.length"), 9);
});

test('Entregas abre nos últimos 30 dias, não no ano inteiro', () => {
  const t = casa([]);
  const dias = t.run("(() => { STATE._fEnt = null; const f = periodoEntregas(); return (new Date(f.ate) - new Date(f.de)) / 86400000; })()");
  assert.equal(dias, 29);
});

test('barras só mostram o que tem valor e nunca estouram 100%', () => {
  const t = casa([]);
  const html = t.run("barrasCasa([{rotulo:'A',valor:10},{rotulo:'B',valor:5},{rotulo:'C',valor:0}], v => v + '')");
  assert.match(html, /width:100%/);
  assert.match(html, /width:50%/);
  assert.ok(!html.includes('>C<'), 'item zerado não vira barra');
  assert.equal(t.run('barrasCasa([], v => v)'), '');
});

test('quadro de análise guarda aberto/fechado no aparelho', () => {
  const t = casa([]);
  assert.match(t.run("quadroCasa('x','T','corpo',true)"), /<details class="casa-quadro" data-quadro="x" open>/);
  t.run("localStorage.setItem('impresilk_inst_quadros', JSON.stringify({x:false}))");
  assert.ok(!t.run("quadroAberto('x', true)"), 'a escolha guardada vence o padrão');
});

/* ══════════════════════════════════════════════════════════════════════════
   OS CASOS RUINS DA REVISÃO ADVERSARIAL (14/09/2026)
   Onze defeitos foram confirmados na onda 4 e a suíte de então passava 51/51
   sem pegar nenhum. Cada teste abaixo falha contra o código de antes.
   ══════════════════════════════════════════════════════════════════════════ */

test('ligar um SEGUNDO apelido à mesma pessoa não descarta o primeiro', () => {
  const t = casa([], {}, ELENCO);
  assert.equal(t.run("ligarApelidoRH('Natanzinho', 'natan-silva')"), true);
  assert.equal(t.run("ligarApelidoRH('Natan N.', 'natan-silva')"), true, 'o segundo apelido também tem de pegar');
  const ligados = t.run("lerVinculosCasa().map(v => v.apelido).sort().join('|')");
  assert.equal(ligados, 'Natan N.|Natanzinho', 'os dois apelidos da mesma pessoa convivem');
  // os dois acham a mesma ficha
  assert.equal(t.run("fichaDoApelido('Natanzinho').nome"), 'Natan da Silva');
  assert.equal(t.run("fichaDoApelido('Natan N.').nome"), 'Natan da Silva');
  // a chave do RH sobrevive à leitura (era descartada, e o vínculo com ela)
  assert.equal(t.run("lerVinculosCasa().every(v => v.chave === 'natan-silva')"), true);
  // desligar um não derruba o outro
  t.run("gravarVinculosCasa(lerVinculosCasa().filter(v => normCasa(v.apelido) !== normCasa('Natanzinho')))");
  assert.equal(t.run("lerVinculosCasa().map(v => v.apelido).join('|')"), 'Natan N.');
});

test('ficha do RH sem CPF de 11 dígitos ainda pode ser ligada pela chave', () => {
  const semCPF = { ...ELENCO, pessoas: [...ELENCO.pessoas, { chave: 'zeca-mota', id: '', nome: 'Zeca Mota', apelido: 'Zeca', cargo: 'Ajudante', area: 'Instalação Externa', statusId: 'ativo', ativo: true, foto: '' }] };
  const t = casa([], {}, semCPF);
  assert.equal(t.run("ligarApelidoRH('Zequinha', 'zeca-mota')"), true, 'sem id de 6 dígitos o vínculo sumia inteiro');
  assert.equal(t.run("fichaDoApelido('Zequinha').nome"), 'Zeca Mota');
});

test('retrabalho cobra a viagem da O.S de CORREÇÃO, não a da entrega original', () => {
  // 900 = a entrega que voltou (viagem cara). 901 = a correção (viagem curta).
  const mae = fin('900', { numero: '900', retrabalho: true, equipe: ['Natan'], horaSaida: '08:00', horaRetorno: '18:00', kmSaida: '1000', kmRetorno: '1200' });
  const filha = fin('901', { numero: '901', osOriginal: '900', equipe: ['Lucas'], horaSaida: '08:00', horaRetorno: '09:00', kmSaida: '2000', kmRetorno: '2010' });
  const t = casa([mae, filha], { custoRetrabalho: { hora: 100, km: 1 }, ...FICHAS }, ELENCO);
  const html = t.run("retrabalhoHTML({de:'2026-09-01', ate:'2026-09-30'})");
  // filha: 1 h × R$100 + 10 km × R$1 = R$110. A mãe daria 10 h + 200 km = R$1.200.
  assert.match(html, /R\$\s?110,00/, 'o custo tem de vir da filha');
  assert.doesNotMatch(html, /R\$\s?1\.200,00/, 'a viagem da entrega original não é custo de retrabalho');
  // e quem foi refazer é a equipe da FILHA (Lucas), não quem entregou (Natan)
  const quem = html.split('Quem foi refazer')[1].split('Responsável da etapa')[0];
  assert.match(quem, /Lucas/);
  assert.doesNotMatch(quem, /Natan/, 'quem entregou não pode ser listado como quem refez');
});

test('há um chip para cada ano que o banco tem, e nenhum inventado', () => {
  // Pedido do dono (14/09/2026): chip de todos os anos existentes. A lista vem
  // do servidor; o app não pode chutar — chutar três anos com o cache guardando
  // dois foi o que criou o chip que pedia ao ERP em laço infinito.
  const t = casa([], {}, ELENCO);
  // (join: array criado dentro da sandbox tem outro protótipo, e deepEqual
  //  estrito compara protótipo — comparar o conteúdo é o que interessa aqui.)
  assert.equal(t.run("anosEntregas().join(',')"), '2026,2025,2024,2023,2022,2021,2020');
  // Servidor ainda não respondeu: só o ano corrente, nunca um ano inventado.
  const mudo = casa([], { _anosERP: [] }, ELENCO);
  assert.equal(mudo.run("anosEntregas().join(',')"), String(new Date().getFullYear()));
  // E o intervalo de meses cobre o período mais longo que os chips oferecem.
  const meses = t.run("mesesEntre('2020-01-01', '2026-12-31')");
  assert.equal(meses.length, 84, 'sete anos = 84 meses');
  assert.equal(meses.truncou, false, 'o teto não pode cortar o que os chips oferecem');
  assert.equal(t.run("mesesEntre('2020-01-01','2026-12-31').indexOf('2020-01')"), 0);
});

test('editar plantão não apaga o vínculo com O.S já finalizada', () => {
  const aberta = { id: 'A', numero: '10', cliente: 'Cliente A' };
  const fechada = { id: 'B', numero: '11', cliente: 'Cliente B', finalizadaEm: '2026-09-12T12:00:00' };
  const t = casa([aberta, fechada], {}, ELENCO);
  const porId = "new Map([['A'," + JSON.stringify(aberta) + "],['B'," + JSON.stringify(fechada) + "]])";
  const html = t.run(`opcoesOSPlantao({osIds:['B']}, [${JSON.stringify(aberta)}], ${porId})`);
  assert.match(html, /value="B"[^>]*selected/, 'a O.S finalizada continua na lista, marcada');
  assert.match(html, /já finalizada/);
  assert.match(html, /value="A"/, 'as abertas continuam aparecendo');
  // vínculo para O.S que este aparelho não conhece também não se perde
  const html2 = t.run(`opcoesOSPlantao({osIds:['Z']}, [], new Map())`);
  assert.match(html2, /value="Z"[^>]*selected/);
});

test('plantão de quem saiu do RH ainda abre para edição', () => {
  const t = casa([], {}, ELENCO);
  // Paulo está inativo no RH: sai da escala, mas o plantão antigo é dele
  assert.doesNotMatch(t.run("optionsEquipeCasa('')"), /Paulo Souza/, 'inativo não entra na escala nova');
  const comPaulo = t.run("optionsEquipeCasa('Paulo Souza')");
  assert.match(comPaulo, /value="Paulo Souza"[^>]*selected/, 'sem isto o select fica vazio e o Salvar trava');
  assert.match(comPaulo, /fora da lista atual do RH/);
});

test('sem ficha do RH, plantões não marcam ninguém como disponível por omissão', () => {
  const semFicha = { ...ELENCO, ferias: [], ausencias: [], fichaRH: false,
    pessoas: ELENCO.pessoas.map(p => ({ ...p, statusId: '', status: '' })) };
  const t = casa([], {}, semFicha);
  assert.equal(t.run("temFichaRH()"), false);
  assert.equal(t.run("ausenciaRH(fichaDoApelido('Lucas'), '2026-09-14')"), null, 'sem dado não há como afirmar ausência');
  assert.match(t.run("avisoAusenciaCasa(['Lucas'], '2026-09-14')"), /não foram conferidos/);
});

/* A versão dessincronizada é o defeito que mais custou tempo neste app: a v79
   subiu e o dono continuou vendo a v76, porque um `?v=` ficou para trás. Aqui
   a regra de deploy da casa vira teste: CACHE (sw.js), APP_VERSAO (config.js)
   e TODOS os `?v=` de index.html, equipe.html e do SHELL são a MESMA string. */
test('CACHE, APP_VERSAO e todos os ?v= sobem juntos', () => {
  const ler = f => fs.readFileSync(path.join(root, f), 'utf8');
  const sw = ler('sw.js'), cfg = ler('config.js');
  const cache = /const CACHE = 'impresilk-shell-(v\d+)'/.exec(sw);
  const versao = /const APP_VERSAO = '(v\d+)'/.exec(cfg);
  assert.ok(cache, 'sw.js precisa declarar CACHE = impresilk-shell-vNN');
  assert.ok(versao, 'config.js precisa declarar APP_VERSAO');
  assert.equal(cache[1], versao[1], 'CACHE do sw.js e APP_VERSAO do config.js divergiram');
  const esperado = versao[1];
  for (const arquivo of ['index.html', 'equipe.html', 'sw.js']) {
    const achados = [...ler(arquivo).matchAll(/\?v=(v\d+)/g)].map(m => m[1]);
    assert.ok(achados.length, `${arquivo} não tem nenhum ?v= — o cache da CDN vai segurar arquivo velho`);
    const fora = [...new Set(achados.filter(v => v !== esperado))];
    assert.deepEqual(fora, [], `${arquivo} ainda pede ${fora.join(', ')} enquanto a versão é ${esperado}`);
  }
  // Todo .js/.css que o index pede tem de estar no SHELL do service worker.
  const pedidos = [...ler('index.html').matchAll(/(?:src|href)="([\w.-]+\.(?:js|css))\?v=/g)].map(m => m[1]);
  const shell = /const SHELL = \[([\s\S]*?)\];/.exec(ler('sw.js'))[1];
  for (const arq of pedidos) {
    assert.ok(shell.includes(arq), `${arq} está no index.html mas ficou fora do SHELL do sw.js — o app não abre offline`);
  }
});

/* A régua única só funciona se ela estiver EXPORTADA. Publiquei a v83 com
   `anosEntreguesEmCache` definida e fora do objeto que o store devolve: o
   `casa.js` caía no padrão por sorte e a régua ficava desligada, calada. */
test('store exporta o que as telas perguntam', () => {
  const store = fs.readFileSync(path.join(root, 'store.js'), 'utf8');
  // Ancorado no bloco de exports (2 espaços, `return {` sozinho na linha):
  // um `return { ... };` de uma linha dentro de qualquer função vinha antes e
  // o regex antigo capturava o trecho errado — o guarda acusava falta de
  // exports que existiam.
  const retorno = /\n  return \{\n([\s\S]*?)\n  \};/.exec(store);
  assert.ok(retorno, 'não achei o objeto exportado do store');
  const casaJs = fs.readFileSync(path.join(root, 'casa.js'), 'utf8');
  const usadas = [...casaJs.matchAll(/STORE\.(\w+)/g)].map(m => m[1]);
  const ausentes = [...new Set(usadas)].filter(n => !new RegExp(`\\b${n}\\b`).test(retorno[1]));
  assert.deepEqual(ausentes, [], `casa.js chama STORE.${ausentes.join(', STORE.')} que o store não exporta`);
});

test('mês que o ERP recusou aparece como falha, não como "carregando" eterno', () => {
  // `entreguesMes` devolve null tanto para "ainda não chegou" quanto para
  // "falhou", e a tela contava os dois como carregando — o mês recusado ficava
  // girando para sempre sem nada girar.
  const t = casa([], {}, ELENCO);
  t.run(`STORE.entreguesMes = m => null;
         STORE.entreguesFalhou = m => m === '2025-03';
         STORE.pullEntreguesMes = m => { (globalThis.__pedidos = globalThis.__pedidos || []).push(m); };`);
  const r = t.run("entreguesERP('2025-02-01','2025-03-31')");
  assert.deepEqual([...r.comErro], ['2025-03'], 'o mês que falhou é contado como falha');
  assert.deepEqual([...r.faltando], ['2025-02'], 'o que não chegou continua faltando');
  // e o que falhou ainda é pedido de novo, depois dos que nunca chegaram
  const pedidos = t.run('globalThis.__pedidos.join(",")');
  assert.ok(pedidos.includes('2025-02'), 'o que falta é pedido');
  assert.ok(pedidos.includes('2025-03'), 'o que falhou tenta de novo');
  assert.ok(pedidos.indexOf('2025-02') < pedidos.indexOf('2025-03'), 'quem nunca chegou vai na frente');
});

test('sem resposta do ERP o valor sai "…", nunca R$ 0,00', () => {
  // R$ 0,00 ao lado de "sem resposta do ERP" é uma afirmação sobre dinheiro que
  // a tela não tem como fazer. Zero não é resultado.
  const t = casa([], {}, ELENCO);
  assert.equal(t.run("valorKpiCasa({ total: 0, n: 0, comErro: 3, faltando: 0 })"), '…',
    'ERP fora do ar não é R$ 0,00');
  assert.equal(t.run("valorKpiCasa({ total: 0, n: 0, comErro: 0, faltando: 2 })"), '…',
    'mês ainda carregando também não é R$ 0,00');
  // Zero de verdade (tudo chegou, nada foi entregue) continua sendo zero.
  assert.match(t.run("valorKpiCasa({ total: 0, n: 0, comErro: 0, faltando: 0 })"), /0,00/);
  // E com dado na mão o valor sai, mesmo que um mês ainda esteja vindo.
  assert.match(t.run("valorKpiCasa({ total: 1500, n: 4, comErro: 1, faltando: 1 })"), /1\.500,00/);
});

test('lista vazia só afirma "não houve entrega" quando o ERP respondeu', () => {
  const t = casa([], {}, ELENCO);
  assert.match(t.run("vazioEntregas({ faltando: [1,2], comErro: [] }).titulo"), /Carregando/);
  assert.match(t.run("vazioEntregas({ faltando: [], comErro: ['2025-03'] }).titulo"), /não respondeu/);
  assert.match(t.run("vazioEntregas({ faltando: [], comErro: ['2025-03'] }).dica"), /não quer dizer que não houve entrega|Não quer dizer/);
  assert.match(t.run("vazioEntregas({ faltando: [], comErro: [] }).titulo"), /Nenhuma entrega no período/);
});
