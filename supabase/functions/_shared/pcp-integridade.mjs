// Regras puras usadas pelas portas de dados e pelos testes de regressão.
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const objeto = v => v && typeof v === 'object' && !Array.isArray(v);
const proprio = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
export const CAMPOS_ERP = ['cliente','servico','vendedor','dataEntrada','cnpjCpf','valorTotal'];
/* SITUAÇÃO DO ERP (statusERP). A carteira é buscada por situação (PRODUCAO,
   PENDENTE, PAUSADO, CONCLUIDO) e a situação era jogada fora -- justamente o
   dado que diz se a produção terminou (auditoria de 23/09/2026). Grava a
   situação e DESDE QUANDO ela vale; não acende o selo "conferir" (a situação
   anda toda semana e, sozinha, não pede ação). */
export const SITUACOES_ERP = ['PRODUCAO', 'PENDENTE', 'PAUSADO', 'CONCLUIDO'];
export function atualizarSituacaoERP(atual, situacao, em) {
  const s = String(situacao || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  if (!atual || atual.finalizadaEm || !SITUACOES_ERP.includes(s) || atual.statusERP === s) return null;
  return { ...atual, statusERP: s, statusERPDesde: em };
}
/* TRABALHO DE GENTE NA O.S. A conciliação horária arquivava toda O.S. que
   saiu da carteira aberta do ERP -- inclusive liberada, com equipe, agenda e
   confirmação (54 em 3 dias, 12 liberadas; a 23364 sumiu no dia da
   instalação). Só marcas que uma PESSOA põe contam: a importação preenche
   data e período com a previsão do ERP, então data não prova programação. */
export function temTrabalhoHumano(o) {
  if (!o) return false;
  return !!(o.liberadoPCP || o.aptoEm || (o.equipe || []).some(n => String(n || '').trim())
    || o.confirmacao === 'Confirmado' || o.paradoClienteEm
    || ((o.horaSaida || o.saidaEm) && !(o.horaRetorno || o.retornoEm))
    || (o.reabertaEm && String(o.reabertaEm) > String(o.baixaAutoERP?.em || '')));
}
export const pedeConferencia = a => a && a.campo !== 'valorTotal' && a.antes != null && String(a.antes).trim() !== '';
export function atualizarOrigemERP(atual, remoto, em) {
  if (!atual?.origemMubisys || atual.finalizadaEm) return {registro: atual, alteracoes: []};
  const registro = {...atual}, alteracoes = [];
  for (const campo of CAMPOS_ERP) {
    if (!proprio(remoto, campo) || remoto[campo] == null) continue;
    const valor = remoto[campo];
    if (campo === 'valorTotal' && (!Number.isFinite(Number(valor)) || Number(valor) < 0)) continue;
    // Resposta incompleta não apaga a identificação; valor zero é válido.
    if (campo !== 'valorTotal' && String(valor).trim() === '') continue;
    if (igual(atual[campo], valor)) continue;
    alteracoes.push({campo, antes: atual[campo] ?? null, depois: valor});
    registro[campo] = valor;
  }
  if (alteracoes.length) {
    registro.erpAlteracoes = [...(atual.erpAlteracoes || []), {em, campos: alteracoes}].slice(-20);
    /* O SELO "conferir" só acende quando o ERP MUDOU um dado que já existia.
       Valor que chega pela primeira vez (antes vazio) e o valor em R$ (o card do
       PCP nem mostra) ficam registrados em erpAlteracoes, sem pedir conferência:
       depois da carga de 14/09 o selo estava aceso em metade dos cards e, selo
       em todo card, ninguém lê (auditoria de 23/09/2026). */
    if (alteracoes.some(pedeConferencia)) registro.erpConferirEm = em;
    registro.atualizadoEm = em;
    registro.atualizadoPor = 'Mubisys · atualização de origem';
    registro.rev = (Number(atual.rev) || 0) + 1;
  }
  return {registro, alteracoes};
}
// Mescla de três vias. Coleções com id são comparadas item a item; excluir ou
// alterar o mesmo item simultaneamente gera conflito, nunca vence por relógio.
export function mesclarConfiguracao(base, local, remoto) {
  const conflitos = [];
  function merge(b, l, r, caminho) {
    if (igual(l, b)) return r;
    if (igual(r, b) || igual(l, r)) return l;
    if (objeto(l) && objeto(r) && (objeto(b) || b === undefined)) {
      const result = {};
      for (const k of new Set([...Object.keys(b || {}), ...Object.keys(l), ...Object.keys(r)])) {
        const v = merge(b?.[k], l[k], r[k], caminho ? caminho + '.' + k : k);
        if (v !== undefined) result[k] = v;
      }
      return result;
    }
    const porId = a => Array.isArray(a) && a.every(x => objeto(x) && typeof x.id === 'string' && x.id) && new Set(a.map(x => x.id)).size === a.length;
    if (porId(l) && porId(r) && (porId(b) || b === undefined)) {
      const bm = new Map((b || []).map(x => [x.id,x])), lm = new Map(l.map(x => [x.id,x])), rm = new Map(r.map(x => [x.id,x]));
      return [...new Set([...rm.keys(), ...lm.keys(), ...bm.keys()])].map(id => merge(bm.get(id), lm.get(id), rm.get(id), caminho + '[' + id + ']')).filter(x => x !== undefined);
    }
    conflitos.push(caminho); return r;
  }
  const cfg = merge(base, local, remoto, '');
  return {cfg, conflitos};
}
export function validarMomentos(os) {
  for (const k of ['saidaEm','retornoEm']) if (os[k] && (!/^\d{4}-\d{2}-\d{2}T/.test(os[k]) || !Number.isFinite(Date.parse(os[k])))) return 'Data de saída ou retorno inválida.';
  if (os.saidaEm && os.retornoEm && Date.parse(os.retornoEm) < Date.parse(os.saidaEm)) return 'O retorno não pode ser anterior à saída.';
  return '';
}
export function carimbarExecucao(os, anterior, autor, em) {
  const r = {...os, atualizadoPor: autor};
  for (const tipo of ['saida','retorno']) {
    const campo = tipo + 'Em';
    if (os[campo] && os[campo] !== anterior?.[campo]) { r[tipo + 'Por'] = autor; r[tipo + 'RecebidoEm'] = em; }
    else { r[tipo + 'Por'] = anterior?.[tipo + 'Por'] || ''; r[tipo + 'RecebidoEm'] = anterior?.[tipo + 'RecebidoEm'] || ''; }
  }
  return r;
}
export function pertenceEquipe(os, nome) {
  const normal = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  return !!nome && (os?.equipe || []).some(n => normal(n) === normal(nome));
}
export function validarConclusao(os, anterior, papel) {
  if (!os.finalizadaEm || anterior?.finalizadaEm || os.tipo === 'interno') return '';
  const faltas = [];
  if (!(os.fotosRetornoIds || []).length) faltas.push('foto do serviço concluído');
  if (!os.retornoEm) faltas.push('data e hora do retorno');
  if (faltas.length && !(['admin','pcp'].includes(papel) && String(os.justificativaConclusao || '').trim().length >= 15)) return 'Para concluir: ' + faltas.join(', ') + '. A gestão pode registrar uma justificativa de exceção.';
  return '';
}
/* NO MÁXIMO UMA EQUIPE ATIVA POR COMPOSIÇÃO. Dois aparelhos criando, cada um, a
   mesma dupla passariam na trava do cliente e o ranking não saberia de quem é
   cada entrega. Desativada não disputa: é histórico. Devolve as composições
   repetidas; o setCfg recusa só a que NÃO existia antes -- duplicata que já
   está no banco (a v124 não conferia) não pode travar confirmação nenhuma.
   A chave de apelido é trocada pela da ficha quando o vínculo salvo diz
   (vinculosRH); o resto do casamento apelido-ficha acontece no aparelho. */
export function composicoesAtivasRepetidas(perf, vinculos) {
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const porApelido = new Map((Array.isArray(vinculos) ? vinculos : []).filter(v => v && v.apelido && v.chave).map(v => [norm(v.apelido), String(v.chave)]));
  const chave = m => porApelido.get(norm(m && m.chave)) || String(m && m.chave);
  const vistas = new Set(), repetidas = new Set();
  for (const e of (perf && Array.isArray(perf.equipes) ? perf.equipes : [])) {
    if (!e || e.ativo === false || !Array.isArray(e.membros)) continue;
    const k = [...new Set(e.membros.map(chave))].sort().join('|');
    if (vistas.has(k)) repetidas.add(k); else vistas.add(k);
  }
  return repetidas;
}
// Validação da apuração operacional; nenhum lançamento de folha é criado.
export function validarPerformance(cfg) {
  if (cfg == null) return '';
  if (typeof cfg !== 'object' || !Array.isArray(cfg.equipes) || !Array.isArray(cfg.participacoes)) return 'Estrutura de performance inválida.';
  const texto = (s,n) => typeof s === 'string' && s.trim().length > 0 && s.length <= n;
  const distintos = xs => new Set(xs.map(x=>x?.id)).size === xs.length;
  if (cfg.equipes.length > 300 || cfg.participacoes.length > 20000 || !distintos(cfg.equipes) || !distintos(cfg.participacoes)) return 'Registros de performance repetidos ou acima do limite.';
  const membrosOK = ms => Array.isArray(ms) && ms.length > 0 && ms.length <= 50 && ms.every(p=>p && texto(p.chave,150) && texto(p.nome,150)) && new Set(ms.map(p=>p.chave)).size === ms.length;
  /* O LOGO DA EQUIPE é opcional e vem como imagem já reduzida no aparelho
     (160x160). Só PNG, JPEG ou WebP em base64 — SVG fica de fora de propósito,
     porque carrega script. Teto por logo e teto do conjunto: a configuração
     global desce para todo tablet, e vinte logos de 200 KB transformariam cada
     abertura do app num download de 4 MB. O emblema continua obrigatório: é o
     que aparece quando a imagem não existe ou não carrega. */
  const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
  const LOGO_MAX = 40000, LOGOS_MAX = 400000;
  let somaLogos = 0;
  for (const e of cfg.equipes) {
    if (!e || !texto(e.id,150) || !texto(e.nome,60) || !['🦅','🚀','🎯','🛡️','⚡','🦁','🏔️','🤝'].includes(e.emblema) || !membrosOK(e.membros)) return 'Equipe inválida. Confira nome, emblema e integrantes.';
    if (e.logo != null && e.logo !== '') {
      if (typeof e.logo !== 'string' || e.logo.length > LOGO_MAX || !LOGO.test(e.logo)) return 'Logo da equipe inválido: use PNG, JPEG ou WebP de até 40 KB.';
      somaLogos += e.logo.length;
    }
    if (e.ativo != null && typeof e.ativo !== 'boolean') return 'Equipe inválida. Confira nome, emblema e integrantes.';
  }
  if (somaLogos > LOGOS_MAX) return 'Logos das equipes somam mais que o limite de 400 KB. Remova ou troque algum.';
  /* (A regra "uma equipe ativa por composição" mora em
     composicoesAtivasRepetidas: o setCfg recusa só a repetição NOVA.) */
  /* OS PESOS DA AVALIAÇÃO (produção, limpeza do carro, equipamentos): inteiros
     de 0 a 100 que somam 100. Opcional — sem eles vale o padrão da tela. */
  if (cfg.criterios != null) {
    const c = cfg.criterios, ks = ['producao','limpeza','equipamentos'];
    if (typeof c !== 'object' || ks.some(k => !Number.isInteger(c[k]) || c[k] < 0 || c[k] > 100) || ks.reduce((s,k)=>s+c[k],0) !== 100 || Object.keys(c).some(k => !ks.includes(k))) {
      return 'Pesos da avaliação inválidos: produção, limpeza e equipamentos, inteiros que somam 100.';
    }
  }
  for (const p of cfg.participacoes) {
    if (!p || !texto(p.id,150) || !membrosOK(p.membros)) return 'Participação inválida.';
    if (p.equipeId && !cfg.equipes.some(e=>e.id===p.equipeId)) return 'Equipe da participação não encontrada.';
    if (p.membros.some(m=>typeof m.percentual !== 'number' || !Number.isFinite(m.percentual) || m.percentual<=0 || m.percentual>100)) return 'Percentual inválido.';
    if (Math.abs(p.membros.reduce((s,m)=>s+m.percentual,0)-100) > 0.001) return 'As participações precisam somar 100%.';
    if (p.obs && (typeof p.obs !== 'string' || p.obs.length>300)) return 'Observação acima do limite.';
  }
  return '';
}
/* O QUE O CRACHÁ DE TOQUE ESCREVE: só a execução (ver pcp-sync). Ele nasce de
   um primeiro nome, sem senha; reescrever cliente, endereço ou vendedor não é
   trabalho dele. Campo fora da lista é descartado, não recusado: recusar tudo
   faria o aparelho na rua perder o check-in inteiro por um campo a mais.
   conferidoPor, retrabalho e causa entraram com a decisão (B) do Léo
   (23/09/2026): "O instalador finaliza, e o espelho passa a pedir a foto do
   serviço pronto". Sem eles, a finalização do espelho chegava pela metade.
   voltaEquipe (25/09/2026) é a limpeza do carro que a equipe registra no
   espelho. Sem ela aqui, o celular mostrava "registrada", recebia 200 e nada
   chegava ao banco. O que entra dela é saneado no pcp-sync (sanearVoltaEquipe). */
export const CAMPOS_MONTAGEM = new Set([
  'id', 'rev', 'atualizadoEm', 'atualizadoPor',
  'checkin', 'checkinGPS', 'checkout', 'conclusao',
  'fotosCheckinIds', 'fotosRetornoIds',
  'carroLiberado', 'carroLiberadoEm', 'carroLiberadoPor',
  'obsTecnicas', 'instalacaoOK', 'problema', 'conferidoPor', 'retrabalho', 'causa',
  'ferramentasConferidas', 'ferramentasConferidasPor',
  'kmSaida', 'kmRetorno', 'horaSaida', 'horaRetorno', 'saidaEm', 'retornoEm',
  'voltaEquipe', 'fotosTiradas',
]);
// Do item, só a marca da montagem: descrição, medida e valor são do PCP e do ERP.
const CAMPOS_ITEM_MONTAGEM = ['statusInst', 'pronto', 'motivo', 'obsProb', 'fotoProbId'];
const LISTAS_FOTO = ['fotosCheckinIds', 'fotosRetornoIds'];
// Só fileId simples (o que o STORE.pushPhoto gera); nada de caminho.
const idFoto = f => typeof f === 'string' && /^[\w.-]{1,100}$/.test(f) && !f.includes('..');
const vazio = v => v == null || v === '' || v === false || (Array.isArray(v) && !v.length) || (objeto(v) && !Object.keys(v).length);
/* Teto de texto do crachá de toque: o registro desce para todo tablet, e os 7
   sistemas dividem 5 MB de localStorage. Uma obs de 2 MB estouraria todos. */
const TEXTO_MAX = 2000;
const cortar = v => typeof v === 'string' && v.length > TEXTO_MAX ? v.slice(0, TEXTO_MAX) : v;
/* MESCLA, NÃO FILTRA. O upsert SUBSTITUI a O.S. inteira; partir do que já está
   gravado e deixar o crachá de toque mudar só os campos dele é o que protege
   o resto. Devolve { os, erro, avisos }: erro preenchido vira 422 e os vem nulo;
   aviso é o que foi deixado de fora, e o resto grava.

   SEM CONFLITO DE VERSÃO (25/09/2026). O rev gravado passa a valer sempre: a
   janela "alterada em outro aparelho" só oferecia duas perdas (Recarregar
   apagava o check-in do aparelho; Sobrescrever apagava as fotos do colega), e
   ela abria toda vez que o PCP, o ERP ou o colega da dupla gravavam antes.
   Cópia VELHA (o aparelho leu um rev anterior) é mesclada com cuidado: lista
   de foto SOMA as duas, e valor vazio não apaga o que já está gravado (a
   cópia velha só não sabia dele). Cópia em dia troca a lista, porque o × do
   espelho tira foto da lista.

   ITENS: o item não tem id. Casa pelo número e descrição em qualquer posição;
   se o PCP mudou a descrição, pelo número (quando só um tem aquele número);
   depois pela descrição. A marca nunca pula para o vizinho, e item que só o
   aparelho tem não é criado; marca que não achou item vira aviso.

   FINALIZAR: só O.S. que o PCP liberou e o cliente confirmou, as mesmas travas
   do espelho. Faltando uma, a finalização não entra e o resto do trabalho
   grava, com aviso: recusar tudo (422) prendia check-in, fotos e itens na fila
   do celular. O autor é o crachá, nunca o nome que o aparelho escreveu. A hora
   é a do aparelho (quem finalizou offline às 15h finalizou às 15h), a não ser
   que venha do futuro. Reabrir não é do instalador: finalizada segue
   finalizada, com o autor que tinha; e finalização mais velha que a reabertura
   da gestão não fecha a O.S. de novo. */
export function mesclarToqueNoNome(atual, veio, autor, agora) {
  const m = { ...atual }, avisos = [];
  const revAtual = typeof atual?.rev === 'number' ? atual.rev : 0;
  const velha = typeof veio?.rev === 'number' && veio.rev !== revAtual;
  /* FOTO TIRADA É DITA, NÃO DEDUZIDA. Na cópia velha a lista SOMA, então o ×
     não valia: a foto apagada voltava à O.S. (e o arquivo já tinha saído do
     bucket), virando miniatura quebrada e "prova" de conclusão que não existe.
     O × do espelho e o da gestão anotam o id em `fotosTiradas`; a mescla tira
     esses ids das listas mesmo em cópia velha, e a lista fica gravada para o
     próximo envio velho de outro aparelho também não trazer a foto de volta. */
  const tiradas = new Set([...(Array.isArray(atual?.fotosTiradas) ? atual.fotosTiradas : []),
    ...(Array.isArray(veio?.fotosTiradas) ? veio.fotosTiradas : [])].filter(idFoto));
  if (tiradas.size) m.fotosTiradas = [...tiradas].slice(-100);
  for (const k of Object.keys(veio || {})) {
    if (!CAMPOS_MONTAGEM.has(k) || k === 'id' || k === 'rev' || k === 'fotosTiradas') continue;
    if (LISTAS_FOTO.includes(k)) {
      if (!Array.isArray(veio[k])) continue; // tipo errado é descartado, como campo fora da lista
      // Id que já está gravado passa como está (foto antiga não some por formato).
      const gravadas = Array.isArray(atual?.[k]) ? atual[k] : [];
      const novas = veio[k].filter(f => idFoto(f) || gravadas.includes(f));
      const lista = [...new Set(velha ? [...gravadas, ...novas] : novas)].filter(f => !tiradas.has(f));
      // O teto segura o registro que desce para todo tablet; o corte é dito,
      // senão a foto subia, sumia da O.S. e ninguém sabia.
      if (lista.length > 60) avisos.push(`${lista.length - 60 === 1 ? '1 foto ficou' : lista.length - 60 + ' fotos ficaram'} de fora da O.S.: o limite é 60 ${k === 'fotosCheckinIds' ? 'de check-in' : 'do serviço pronto'}. Fale com o PCP.`);
      m[k] = lista.slice(0, 60);
      continue;
    }
    if (velha && vazio(veio[k]) && !vazio(atual?.[k])) {
      // Desmarcar numa cópia velha não vale (não dá para saber se foi o
      // toque ou se o aparelho não sabia), mas não fica calado.
      if (k === 'instalacaoOK' && veio[k] === false && atual[k] === true) avisos.push('"Instalação OK" continua marcada: o escritório gravou a O.S. antes. Se era para desmarcar, desmarque de novo.');
      continue;
    }
    // Local do check-in: só os quatro campos que o espelho grava, com número de verdade.
    if (k === 'checkinGPS' && veio[k] != null) {
      const g = veio[k];
      if (!objeto(g) || !Number.isFinite(Number(g.lat)) || !Number.isFinite(Number(g.lng))) continue;
      m[k] = { lat: Number(g.lat), lng: Number(g.lng), precisao: Number.isFinite(Number(g.precisao)) ? Number(g.precisao) : 0, ts: String(g.ts ?? '').slice(0, 40) };
      continue;
    }
    m[k] = cortar(veio[k]);
  }
  m.rev = revAtual;
  if (Array.isArray(veio?.itens) && Array.isArray(atual?.itens)) {
    const usados = new Set();
    const livres = () => veio.itens.map((v, j) => ({ v, j })).filter(x => !usados.has(x.j) && objeto(x.v));
    const txt = v => String(v ?? '');
    const unico = (xs, f) => xs.filter(f).length === 1 ? xs.find(f) : null;
    const achar = it => {
      const xs = livres();
      const a = xs.find(x => txt(x.v.item) === txt(it.item) && txt(x.v.descricao) === txt(it.descricao))
        || (txt(it.item) && atual.itens.filter(o => objeto(o) && txt(o.item) === txt(it.item)).length === 1 ? unico(xs, x => txt(x.v.item) === txt(it.item)) : null)
        || (txt(it.descricao) && atual.itens.filter(o => objeto(o) && txt(o.descricao) === txt(it.descricao)).length === 1 ? unico(xs, x => txt(x.v.descricao) === txt(it.descricao)) : null);
      if (a) usados.add(a.j);
      return a ? a.v : null;
    };
    m.itens = atual.itens.map(it => {
      if (!objeto(it)) return it;
      const v = achar(it);
      if (!v) return it;
      const r = { ...it };
      for (const c of CAMPOS_ITEM_MONTAGEM) {
        if (!proprio(v, c) || (velha && vazio(v[c]) && !vazio(it[c]))) continue;
        r[c] = c === 'fotoProbId' && v[c] && !idFoto(v[c]) ? it[c] : cortar(v[c]);
      }
      if (r.fotoProbId && tiradas.has(r.fotoProbId)) r.fotoProbId = '';
      return r;
    });
    const perdidas = veio.itens.filter((v, j) => !usados.has(j) && objeto(v) && CAMPOS_ITEM_MONTAGEM.some(c => !vazio(v[c])));
    if (perdidas.length) avisos.push(`${perdidas.length === 1 ? 'A marca do item ' + txt(perdidas[0].item || perdidas[0].descricao) + ' não foi gravada' : perdidas.length + ' marcas de item não foram gravadas'}: o PCP mudou a lista de itens. Confira os itens com o PCP.`);
  }
  if (!atual?.finalizadaEm && veio?.finalizadaEm) {
    const t = Date.parse(String(veio.finalizadaEm)), reaberta = Date.parse(String(atual?.reabertaEm || ''));
    if (!atual.liberadoPCP) avisos.push('A O.S. não foi finalizada: o PCP ainda não liberou. Fale com o PCP.');
    else if (atual.tipo !== 'interno' && atual.confirmacao !== 'Confirmado') avisos.push('A O.S. não foi finalizada: o cliente ainda não confirmou. Fale com o PCP.');
    else if (Number.isFinite(reaberta) && !(Number.isFinite(t) && t > reaberta)) avisos.push('A O.S. não foi finalizada: a gestão reabriu depois. Finalize de novo se o serviço terminou.');
    else {
      m.finalizadaEm = Number.isFinite(t) && t <= Date.parse(agora) + 10 * 60 * 1000 ? String(veio.finalizadaEm) : agora;
      m.finalizadoPor = autor;
    }
  }
  return { os: m, erro: '', avisos };
}
/* HORÁRIOS DO ESPELHO QUE FEREM A REGRA NÃO DERRUBAM O ENVIO (crachá de toque).
   O espelho carimba saída e retorno com o dia AGENDADO: serviço que vira a
   noite (saída 13h, retorno 9h do dia seguinte) chegava com o retorno antes da
   saída, e o 400 prendia a O.S. inteira na fila do celular. Retorno até 24 h
   "antes" da saída é o dia seguinte; o resto que não fecha fica de fora, com
   aviso, e o que já estava gravado vale. Muda `os` e devolve os avisos. */
export function acertarMomentosToque(os, anterior) {
  const avisos = [];
  const valido = v => /^\d{4}-\d{2}-\d{2}T/.test(String(v || '')) && Number.isFinite(Date.parse(String(v)));
  for (const k of ['saidaEm', 'retornoEm']) {
    if (os[k] && !valido(os[k])) {
      os[k] = valido(anterior?.[k]) ? anterior[k] : '';
      avisos.push('Data de ' + (k === 'saidaEm' ? 'saída' : 'retorno') + ' inválida: não foi gravada.');
    }
  }
  if (os.saidaEm && os.retornoEm && Date.parse(os.retornoEm) < Date.parse(os.saidaEm)) {
    const d = new Date(String(os.retornoEm).slice(0, 10) + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    const seguinte = d.toISOString().slice(0, 10) + String(os.retornoEm).slice(10);
    const dif = Date.parse(seguinte) - Date.parse(os.saidaEm);
    if (Number.isFinite(dif) && dif >= 0 && dif < 864e5) os.retornoEm = seguinte;
    else {
      const velho = anterior?.retornoEm;
      os.retornoEm = valido(velho) && Date.parse(velho) >= Date.parse(os.saidaEm) ? velho : '';
      avisos.push('O retorno ficou antes da saída e não foi gravado. Confira a hora do retorno.');
    }
  }
  return avisos;
}
/* O QUE DESCE PARA QUEM ENTROU PELO NOME. O crachá de toque sai de um primeiro
   nome, sem senha: precisa de cliente, endereço e contato, não do documento
   nem do dinheiro de ninguém. Vale para TODA saída de O.S. (lista, resposta do
   upsert, janela de conflito); a mescla parte do que está gravado, então o que
   não desce não se perde na volta. erpAlteracoes sai inteiro: guarda o antes e
   o depois do CPF/CNPJ e do valor. */
export function podarToque(r) {
  if (!objeto(r)) return r;
  const { cnpjCpf: _c, valorTotal: _v, erpAlteracoes: _h, ...resto } = r;
  if (Array.isArray(resto.itens)) resto.itens = resto.itens.map(it => {
    if (!objeto(it)) return it;
    const { valorUnit: _u, subtotal: _s, ...x } = it;
    return x;
  });
  return resto;
}
/* COMPARAR POR CONTEÚDO, NÃO POR TEXTO. O jsonb do banco reordena as chaves
   (por tamanho): {data, periodo, hora} volta como {data, hora, periodo}. A
   comparação por JSON.stringify via "remarcou" em toda gravação da O.S. criada
   à mão e apagava a confirmação do cliente e a liberação do carro. */
export const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : objeto(v) ? '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
  : JSON.stringify(v ?? null);
/* A LIMPEZA DO CARRO QUE A EQUIPE REGISTRA (voltaEquipe, 25/09/2026). As
   mesmas quatro perguntas da conferência da gestão (operacao.js), com a mesma
   polaridade: o PCP compara chave a chave, sem tradução. É uma DECLARAÇÃO: não
   conta na nota (perfFonte lê só retornoConf) e não responde pelo PCP.
   A lista é repetida aqui porque o servidor não carrega operacao.js; um teste
   confere que as duas são iguais. */
export const PERGUNTAS_VOLTA = ['carroLimpo', 'carroArrumado', 'equipamentosOk', 'semAvaria'];
const snVolta = x => x === 'sim' || x === true ? 'sim' : (x === 'nao' || x === false ? 'nao' : '');
// O PCP já conferiu esta O.S.: a partir daí a declaração da equipe não muda mais.
export const voltaConferida = rc => !!objeto(rc) && PERGUNTAS_VOLTA.some(k => snVolta(rc[k]));
/* Devolve o que gravar (ou null para não ter o campo). Ausência e envio vazio
   não apagam: aparelho com app antigo não conhece o campo, e um {} não é
   declaração. Autor e hora de chegada vêm do crachá e do servidor, nunca do
   aparelho. A hora do registro é a do aparelho (quem registrou offline às 18h
   registrou às 18h), a não ser que venha do futuro: a mesma regra do
   finalizadaEm. Resposta igual à gravada mantém o carimbo de quem registrou. */
export function sanearVoltaEquipe(veio, antes, autor, agora) {
  const velho = objeto(antes) ? antes : null;
  if (!objeto(veio)) return velho;
  const n = Object.fromEntries(PERGUNTAS_VOLTA.map(k => [k, veio[k] === 'sim' || veio[k] === 'nao' ? veio[k] : '']));
  if (!PERGUNTAS_VOLTA.some(k => n[k])) return velho;
  n.obs = String(veio.obs ?? '').slice(0, 300);
  // Só fileId simples (o que o STORE.pushPhoto gera); nada de caminho.
  n.fotos = (Array.isArray(veio.fotos) ? veio.fotos : []).filter(f => typeof f === 'string' && /^[\w.-]{1,100}$/.test(f) && !f.includes('..')).slice(0, 4);
  n.dia = /^\d{4}-\d{2}-\d{2}$/.test(String(veio.dia ?? '')) ? String(veio.dia) : '';
  n.veiculo = String(veio.veiculo ?? '').slice(0, 60);
  const igual = velho && PERGUNTAS_VOLTA.every(k => n[k] === velho[k]) && n.obs === (velho.obs || '') &&
    n.fotos.join() === (Array.isArray(velho.fotos) ? velho.fotos : []).join();
  if (igual) return { ...n, por: velho.por || '', porId: velho.porId || '', em: velho.em || '', recebidoEm: velho.recebidoEm || '' };
  const t = Date.parse(String(veio.em ?? ''));
  const em = Number.isFinite(t) && t <= Date.parse(agora) + 10 * 60 * 1000 ? new Date(t).toISOString() : agora;
  /* Declaração MAIS VELHA que a do COLEGA não passa por cima: ele corrigiu às
     18:10 e o envio das 18:00, parado sem sinal, chegava depois e desfazia a
     correção calado. A mesma pessoa corrigindo a própria declaração vale
     sempre (a fila do aparelho só guarda a última). Quem chama avisa. */
  const outro = velho && String(velho.porId || velho.por || '') !== String(autor?.sub || autor?.nome || '');
  if (outro && Date.parse(String(velho.em || '')) > Date.parse(em)) return velho;
  return { ...n, por: String(autor?.nome || ''), porId: String(autor?.sub || ''), em, recebidoEm: agora };
}
