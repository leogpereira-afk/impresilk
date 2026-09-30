'use strict';

/* MOTOR DA ENTREGA POR ITEM DO PEDIDO (E2, 29/09/2026).
   Função pura: não lê tela, não grava nada. Diz a situação de cada item da
   O.S. (a entregar, parcial 6 de 10, entregue, retirado, com problema,
   cancelado), o resumo da O.S. e o R$ de cada entrega. O servidor tem a MESMA
   cópia em supabase/functions/_shared/pcp-entrega-item.mjs e valida com ela a
   marca que chega (E3) e soma o 'entregue por item' (E6). Mudou aqui, muda lá
   no mesmo commit: tests/entrega-item-paridade.test.cjs compara o texto e 500
   casos. Carregado no index.html e no sw.js, ainda sem uso na tela. NÃO entra
   no equipe.html (celular do instalador) até a E5 precisar, então nada em
   operacao.js nem equipe.js pode chamar ENTREGA_ITEM. */
const ENTREGA_ITEM = (() => {
/* ==== MOTOR DA ENTREGA POR ITEM: daqui até FIM DO MOTOR, cópia byte a byte de _shared/pcp-entrega-item.mjs ==== */
/* O QUE FICA GRAVADO (dentro de os.itens, e mais nada):
     item.entregas: lista SÓ DE ACRÉSCIMO, até 20 marcas VALENDO por item e 40
       na história (desfeitos e anulados contam só nos 40). Cada marca é
       {id, tipo, qtde?, dia, alvo?, motivo?, via, retirou?, fotoId?, porId, por, em}
       tipo   'entregue' | 'retirado' (com qtde inteira) | 'problema' |
              'cancelado' (cancela o SALDO; o que já foi entregue fica) |
              'desfeito' (anula a marca `alvo`; ela deixa de valer para tudo)
       dia    'AAAA-MM-DD' no calendário da fábrica
       id     gerado no aparelho: a fila offline manda de novo e o repetido some
       via    NÃO é escolha do aparelho: sai do papel de quem marca (admin e
              pcp 'gestao', ou 'lote' quando a tela do lote pede; operação
              'balcao'; crachá sem senha 'toque'). A porta passa o papel do
              crachá, então o via gravado é sempre o do papel.
       porId, por, em: do crachá e do relógio do SERVIDOR (a porta troca)
   O QUE NUNCA FICA GRAVADO: situação do item, resumo da O.S., valor do item e
   valor de cada entrega. Saem daqui, na leitura, iguais no aparelho e no
   servidor. Dinheiro sempre em CENTAVOS inteiros: com fração, 6/10 + 4/10 de
   R$ 999,99 não fecha no centavo, e a soma dos itens precisa bater com o
   líquido da O.S. */
const TIPOS = Object.freeze(['entregue', 'retirado', 'problema', 'cancelado', 'desfeito']);
const TIPOS_QTDE = Object.freeze(['entregue', 'retirado']);
const TIPOS_MOTIVO = Object.freeze(['problema', 'cancelado', 'desfeito']);
const VIAS = Object.freeze(['gestao', 'balcao', 'toque', 'lote']);
const TETO_EVENTOS = 20;   // marcas valendo (sem os desfeitos e sem o que eles anularam)
const TETO_HISTORIA = 40;  // a lista inteira, contra abuso
const TETO_MOTIVO = 200;
const TETO_RETIROU = 60;
const TETO_QTDE = 1000000;
const DIA_MINIMO = '2020-01-01';
/* QUEM MARCA O QUÊ (decisão do dono, 29/09/2026): admin e pcp tudo; operação
   com senha (balcão) entrega, retira e aponta problema; cancelar e desfazer só
   admin e pcp. O crachá sem senha do celular ('toque'; no servidor é o papel
   'montagem' com ehToqueNoNome) ainda NÃO marca: entra na E5, só com entrega
   e retirada declaradas, nunca desfaz nem cancela. Montagem e máquina não
   marcam. Papel ausente não marca: a trava fecha por omissão. */
const PERMISSOES = Object.freeze({
  admin:Object.freeze(TIPOS.slice()), pcp:Object.freeze(TIPOS.slice()),
  operacao:Object.freeze(['entregue', 'retirado', 'problema']),
});
const VIA_DO_PAPEL = Object.freeze({admin:'gestao', pcp:'gestao', operacao:'balcao', toque:'toque'});
const NOME_PAPEL = Object.freeze({admin:'admin', pcp:'PCP', operacao:'operação', toque:'crachá sem senha', montagem:'montagem', maquina:'integração do ERP'});
const NOME_TIPO = Object.freeze({entregue:'entregue', retirado:'retirado', problema:'problema', cancelado:'cancelar item', desfeito:'desfazer'});
const listaE = v => Array.isArray(v) ? v : [];
const textoE = v => v == null ? '' : String(v).trim();
// Sem acento e minúsculo. \p{M} tira as marcas que o NFD separa da letra.
const semAcento = v => textoE(v).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const cortarE = (v, n) => Array.from(textoE(v)).slice(0, n).join('');
const temChave = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// a * b / c arredondado para baixo, sem perder centavo no ponto flutuante.
const mulDiv = (a, b, c) => Number(BigInt(a) * BigInt(b) / BigInt(c));

/* ── dia ──────────────────────────────────────────────────────────────── */
function diaValido(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  const d = new Date(v + 'T00:00:00Z');
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v ? v : '';
}
/* O DIA NO FUSO DE SÃO PAULO, em qualquer aparelho e no servidor (UTC). O
   finalizadaEm é toISOString: 23h30 de 29/09 na fábrica é 02h30 de 30/09 em
   UTC, e cada lado contaria num dia. Horário sem fuso já é o da fábrica. */
function diaSP(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return diaValido(v);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v)) return diaValido(v.slice(0, 10));
  }
  const d = v instanceof Date ? v : new Date(typeof v === 'number' ? v : String(v));
  if (!Number.isFinite(+d)) return '';
  try {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-US', {timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(d)) p[x.type] = x.value;
    return diaValido(`${p.year}-${p.month}-${p.day}`);
  } catch (e) {
    // Sem a tabela de fusos: São Paulo não tem horário de verão desde 2019.
    return new Date(+d - 3 * 3600000).toISOString().slice(0, 10);
  }
}

/* ── o item ───────────────────────────────────────────────────────────── */
/* QUANTIDADE QUE ACEITA PARTE. Só número inteiro de coisa contável: '10',
   '10.00' (a API do ERP manda assim), '6 un', '4 peças'. Quebrada ('10,5'),
   área ('2,5 m²', '10 m²'), metro, vazia, zero ou texto: vale 1 lote e só
   aceita a entrega do todo (decisão do dono: m² só o todo). */
const CONTAVEIS = /^(un|und|unid|unids|unidade|unidades|pc|pcs|pca|pcas|peca|pecas|cj|cjs|conj|conjunto|conjuntos|kit|kits|jg|jogo|jogos|placa|placas)?\.?$/;
function qtdeNum(item) {
  if (!item || typeof item !== 'object') return 1;
  const bruto = item.qtde != null && item.qtde !== '' ? item.qtde : item.qtd;
  let n, unidade = '';
  if (typeof bruto === 'number') n = bruto;
  else {
    const m = /^(\d+(?:[.,]\d+)*)\s*(.*)$/.exec(semAcento(bruto));
    if (!m) return 1;
    n = Number(m[1].includes(',') ? m[1].replace(/\./g, '').replace(',', '.') : m[1]);
    unidade = m[2].trim();
  }
  return Number.isInteger(n) && n > 1 && n <= TETO_QTDE && CONTAVEIS.test(unidade) ? n : 1;
}
/* SERVIÇO NÃO É COISA A ENTREGAR ('Servicos', 'Instalação...', 'Instalações
   fora do horário comercial'): não recebe marca e acompanha a última entrega
   física da O.S., ou a finalização. */
function ehServico(item) {
  return /^(servicos?|instalacao|instalacoes)\b/.test(semAcento(item && item.descricao));
}
const aceitaParte = item => !ehServico(item) && qtdeNum(item) > 1;
function podeMarcar(papel, tipo) {
  return typeof papel === 'string' && temChave(PERMISSOES, papel) && PERMISSOES[papel].includes(tipo);
}

/* LEITURA TOLERANTE do que já está gravado: marca que não se lê (tipo
   desconhecido, sem id, id repetido, dia torto, quantidade que não é inteiro
   positivo) não vale para nada. A porta nunca grava isso; se aparecer, não
   pode derrubar a tela nem virar dinheiro. */
function legivel(e) {
  if (!e || typeof e !== 'object' || !TIPOS.includes(e.tipo) || !textoE(e.id) || !diaValido(e.dia)) return false;
  return !TIPOS_QTDE.includes(e.tipo) || (Number.isInteger(e.qtde) && e.qtde >= 1);
}
function eventosLidos(item) {
  const vistos = new Set(), saida = [];
  for (const e of listaE(item && item.entregas)) {
    if (!legivel(e) || vistos.has(textoE(e.id))) continue;
    vistos.add(textoE(e.id)); saida.push(e);
  }
  return saida;
}
// As marcas que valem: sem os 'desfeito' e sem o que eles anularam.
function eventosAtivos(item) {
  const lidos = eventosLidos(item);
  const porId = new Map(lidos.map(e => [textoE(e.id), e]));
  const anulados = new Set();
  for (const e of lidos) {
    const alvo = e.tipo === 'desfeito' ? porId.get(textoE(e.alvo)) : null;
    if (alvo && alvo.tipo !== 'desfeito') anulados.add(textoE(alvo.id));
  }
  return lidos.filter(e => e.tipo !== 'desfeito' && !anulados.has(textoE(e.id)));
}
/* A CONTA DO ITEM, na ordem em que as marcas entraram. Entrega acima da
   quantidade (a quantidade caiu depois) não conta: cada unidade vale uma vez
   só. Problema fica aberto até uma entrega DEPOIS dele NO CALENDÁRIO (no
   mesmo dia, a que entrou depois): o tablet que ficou sem rede sobe hoje a
   entrega de anteontem, e ela não fecha o problema de ontem. */
function contar(item) {
  const Q = qtdeNum(item), ativos = eventosAtivos(item), partes = [], problemas = [];
  let acum = 0, cancelado = null, soRetirada = true;
  ativos.forEach((e, ordem) => {
    if (TIPOS_QTDE.includes(e.tipo)) {
      const q = Math.min(e.qtde, Q - acum);
      partes.push({evento:e, antes:acum, qtde:q, ordem});
      if (q > 0) { acum += q; if (e.tipo !== 'retirado') soRetirada = false; }
    } else if (e.tipo === 'problema') problemas.push({evento:e, ordem});
    else if (e.tipo === 'cancelado') cancelado = e;
  });
  const fecha = (p, x) => x.qtde > 0 && (x.evento.dia > p.evento.dia || (x.evento.dia === p.evento.dia && x.ordem > p.ordem));
  const abertos = problemas.filter(p => !partes.some(x => fecha(p, x)));
  const problema = abertos.length ? abertos[abertos.length - 1].evento : null;
  const ultimoDia = partes.filter(p => p.qtde > 0).reduce((m, p) => p.evento.dia > m ? p.evento.dia : m, '');
  return {Q, ativos, partes, acum, problema, cancelado, soRetirada:acum > 0 && soRetirada, ultimoDia};
}

/* ── validar uma marca nova ───────────────────────────────────────────── */
/* O MESMO validador na tela e na porta do servidor: a parte maior que o saldo
   é recusada no aparelho com a mesma frase que o servidor daria. Devolve a
   marca LIMPA (só os campos do formato; o resto sai). O ctx é obrigatório e
   fecha por omissão:
     ctx.papel  quem marca (a tela passa o da sessão, a porta o do crachá, a
                máquina passa 'maquina'). Sem papel, nada passa.
     ctx.os     a O.S. do item. Sem ela, nada passa: O.S. finalizada (no PCP,
                pelo ERP ou pela conciliação da carteira) já tem a entrega
                implícita, e marca nova tiraria o valor do mês em que ela
                entrou. Para marcar, reabre.
     ctx.hoje   o dia de hoje no fuso da fábrica.
   id já gravado volta com `repetido: true`: a fila offline mandou de novo, e
   a porta ignora sem avisar. */
function validarEvento(evento, item, ctx) {
  const o = ctx && typeof ctx === 'object' ? ctx : {};
  const nao = (erro, extra) => ({ok:false, erro, evento:null, repetido:false, ...(extra || {})});
  if (!item || typeof item !== 'object') return nao('Item não encontrado na O.S.');
  if (!evento || typeof evento !== 'object' || Array.isArray(evento)) return nao('Marca de entrega vazia.');
  const id = textoE(evento.id);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(id)) return nao('Marca de entrega sem código válido.');
  if (listaE(item.entregas).some(e => e && textoE(e.id) === id)) return nao('Esta marca já foi gravada.', {repetido:true});
  const tipo = evento.tipo;
  if (!TIPOS.includes(tipo)) return nao('Tipo de marca desconhecido.');
  if (!podeMarcar(o.papel, tipo)) return nao(`Seu acesso (${typeof o.papel === 'string' && temChave(NOME_PAPEL, o.papel) ? NOME_PAPEL[o.papel] : cortarE(o.papel, 30) || 'sem papel'}) não pode marcar "${NOME_TIPO[tipo]}".`);
  const gestao = o.papel === 'admin' || o.papel === 'pcp';
  const os = o.os;
  if (!os || typeof os !== 'object' || Array.isArray(os)) return nao('O.S. não informada: sem ela não dá para conferir o saldo.');
  if (textoE(os.finalizadaEm)) return nao('O.S. finalizada: reabra para marcar.');
  if (canceladaAMao(os)) return nao('O.S. cancelada: desfaça o cancelamento da O.S. para marcar.');
  if (ehServico(item)) return nao('Item de serviço não recebe marca: ele acompanha a entrega dos outros itens.');
  /* Teto: 20 marcas VALENDO por item, e 40 na lista inteira. Desfazer uma
     marca errada libera a vaga dela, então o item no teto tem conserto. */
  const gravadas = listaE(item.entregas).length, ativas = eventosAtivos(item).length;
  if (gravadas >= TETO_HISTORIA) return nao(`Este item já tem ${gravadas} marcas gravadas, contando as desfeitas: é o limite, e nenhuma marca nova cabe nele.`);
  if (tipo !== 'desfeito' && ativas >= TETO_EVENTOS) return nao(`Este item já tem ${ativas} marcas valendo, o máximo. ${gestao ? 'Desfaça uma marca errada antes de marcar de novo.' : 'Fale com o PCP.'}`);
  const dia = diaValido(textoE(evento.dia));
  if (!dia) return nao('Dia da marca inválido.');
  const hoje = diaValido(o.hoje) || diaSP(Date.now());
  if (dia > hoje) return nao('O dia da marca não pode ser depois de hoje.');
  if (dia < DIA_MINIMO) return nao('Dia da marca antigo demais.');
  if (evento.via != null && evento.via !== '' && !VIAS.includes(evento.via)) return nao('Origem da marca desconhecida.');
  // O via sai do papel; o aparelho só escolhe 'lote' quando quem marca é a gestão.
  const via = gestao && evento.via === 'lote' ? 'lote' : VIA_DO_PAPEL[o.papel];
  const c = contar(item);
  const saida = {id, tipo, dia, via};
  if (tipo === 'desfeito') {
    const alvo = textoE(evento.alvo);
    if (!alvo || !c.ativos.some(e => textoE(e.id) === alvo)) return nao('A marca a desfazer não existe ou já foi desfeita.');
    saida.alvo = alvo;
  } else if (c.cancelado) return nao('Item cancelado: desfaça o cancelamento antes de marcar.');
  if (TIPOS_QTDE.includes(tipo)) {
    const saldo = c.Q - c.acum;
    if (saldo <= 0) return nao('Este item já foi todo entregue.');
    const bruto = evento.qtde;
    const q = bruto == null || bruto === '' ? saldo : typeof bruto === 'number' ? bruto : /^\d+$/.test(textoE(bruto)) ? Number(textoE(bruto)) : NaN;
    if (!Number.isInteger(q) || q < 1) return nao('Quantidade inválida: use um número inteiro.');
    if (q > saldo) return nao(`Quantidade maior que o saldo: faltam ${saldo} de ${c.Q}.`);
    saida.qtde = q;
  }
  if (tipo === 'cancelado' && c.acum >= c.Q) return nao('Item já entregue por inteiro: não há saldo para cancelar.');
  /* Problema é do que AINDA vai: segura o saldo. Defeito no que já foi
     entregue é retrabalho, e item todo entregue não recebe problema (sem isso
     ele ficaria preso: nenhuma entrega fecharia o problema). Um aberto por vez. */
  if (tipo === 'problema' && c.acum >= c.Q) return nao('Item já entregue por inteiro: defeito no que foi entregue é retrabalho, não problema de entrega.');
  if (tipo === 'problema' && c.problema) return nao('Este item já tem um problema aberto: entregue o saldo ou desfaça o problema antes.');
  if (TIPOS_MOTIVO.includes(tipo)) {
    const motivo = cortarE(evento.motivo, TETO_MOTIVO);
    if (!motivo) return nao('Diga o motivo.');
    saida.motivo = motivo;
  }
  if (tipo === 'retirado' && textoE(evento.retirou)) saida.retirou = cortarE(evento.retirou, TETO_RETIROU);
  if (/^[A-Za-z0-9._:-]{1,100}$/.test(textoE(evento.fotoId))) saida.fotoId = textoE(evento.fotoId);
  // Autor e hora ficam para o aparelho mostrar offline; a porta troca pelos do crachá e do servidor.
  if (textoE(evento.porId)) saida.porId = cortarE(evento.porId, 40);
  if (textoE(evento.por)) saida.por = cortarE(evento.por, 80);
  if (textoE(evento.em)) saida.em = cortarE(evento.em, 40);
  return {ok:true, erro:'', evento:saida, repetido:false};
}

/* ── a O.S. ───────────────────────────────────────────────────────────── */
// Baixa da máquina do ERP (a mesma regra de OPERACAO.encerradaERP).
function encerradaNoERP(os) {
  if (!os || !os.finalizadaEm) return false;
  return !!((os.baixaAutoERP && os.baixaAutoERP.em === os.finalizadaEm) || /^Mubisys\b/i.test(textoE(os.finalizadoPor)));
}
function canceladaNoERP(os) {
  return encerradaNoERP(os) && /cancel/i.test(`${textoE(os.baixaAutoERP && os.baixaAutoERP.status)} ${textoE(os.finalizadoPor)}`);
}
/* CANCELADA À MÃO (F16): a marca os.cancelamento da gestão ("Cancelar O.S."
   da ficha, com motivo). Vale a que o servidor gravou ({ativo:true, motivo,
   por, porId, em}) e o pedido que o aparelho ainda vai mandar ({cancelar:true,
   motivo}). O desfeito ({ativo:false, desfeitoEm...}), o pedido de desfazer e
   a marca sem motivo não valem. A mesma leitura está em _shared/pcp-status.mjs
   (OPERACAO.cancelamentoDe), e um teste confere as duas. */
function canceladaAMao(os) {
  const c = os && os.cancelamento;
  if (!c || typeof c !== 'object' || Array.isArray(c) || !textoE(c.motivo)) return false;
  return c.ativo === true || c.cancelar === true;
}
/* A O.S. CANCELADA, no ERP ou à mão: cancela o SALDO de todos os itens, e o
   que já foi entregue fica. Item cancelado sozinho não cancela a O.S. */
function canceladaOS(os) {
  return canceladaNoERP(os) || canceladaAMao(os);
}
/* O ERP DISSE ENTREGUE? A baixa automática grava o status em baixaAutoERP
   (ou, na baixa antiga, no fim do finalizadoPor: 'Mubisys (baixa automática ·
   ENTREGUE)'). A conciliação da carteira ('Mubisys · saiu da carteira
   aberta', baixaAutoERP.carteira) e a baixa por CONCLUIDO ou FINALIZADO NÃO
   são o ERP dizendo entregue: esperam a data de entrega do ERP. */
function erpDisseEntregue(os) {
  if (!encerradaNoERP(os)) return false;
  const b = os.baixaAutoERP && typeof os.baixaAutoERP === 'object' && os.baixaAutoERP.em === os.finalizadaEm ? os.baixaAutoERP : null;
  if (b && b.carteira) return false;
  const m = /\(baixa autom[aá]tica\s*\S\s*([^)]*)\)\s*$/i.exec(textoE(os.finalizadoPor));
  const status = b && textoE(b.status) ? textoE(b.status) : m ? m[1] : '';
  return semAcento(status).toUpperCase() === 'ENTREGUE';
}
/* ENTREGA IMPLÍCITA: o que não tem marca em O.S. encerrada conta entregue
   nesse dia. É por isso que O.S. antiga e aba antiga funcionam sem migração.
     lançada à mão      entregaLancada.data      'implicito'
     finalizada no PCP  finalizadaEm             'implicito'
     baixa do ERP       ctx.dataEntregueERP (data_entregue do ERP)  'sem prova'
                        sem ela, o dia da baixa, SÓ se o ERP disse
                        ENTREGUE (erpDisseEntregue)              'sem prova'
     fora da carteira,  nada até vir ctx.dataEntregueERP: o saldo fica
     CONCLUIDO etc.     como 'sem confirmação do ERP' (semConfirmacaoERP)
     cancelada          nada (o saldo é cancelado; o entregue fica): no ERP
                        ou à mão (canceladaOS, F16)
   Aberta: nada implícito. */
function entregaImplicita(os, ctx) {
  const fim = diaSP(os && os.finalizadaEm);
  if (!fim) return null;
  if (canceladaOS(os)) return null;
  const l = os.entregaLancada;
  const lancada = diaSP(l && typeof l === 'object' ? l.data : l);
  if (lancada) return {dia:lancada, fonte:'lancada', marca:'implicito'};
  if (encerradaNoERP(os)) {
    const dia = diaValido(textoE(ctx && ctx.dataEntregueERP)) || (erpDisseEntregue(os) ? fim : '');
    return dia ? {dia, fonte:'erp', marca:'sem prova'} : null;
  }
  return {dia:fim, fonte:'finalizada', marca:'implicito'};
}
const ROTULO = Object.freeze({'a entregar':'a entregar', entregue:'entregue', retirado:'retirado', problema:'com problema', cancelado:'cancelado'});
// Situação de item físico. `imp` e `osCancelada` vêm prontos de quem chama.
function situacaoFisica(item, os, imp, osCancelada) {
  const c = contar(item);
  const ultimo = c.ativos.length ? c.ativos[c.ativos.length - 1] : null;
  const s = {
    situacao:'a entregar', rotulo:'', qtde:c.Q, entregue:c.acum, implicito:0, saldo:c.Q - c.acum,
    parte:c.Q > 1, servico:false, dia:c.ultimoDia, marca:c.acum > 0 ? 'marcado' : '',
    ultimaMarca:ultimo ? textoE(ultimo.id) : '',
    ultimo:ultimo ? {id:textoE(ultimo.id), tipo:ultimo.tipo, dia:ultimo.dia, porId:textoE(ultimo.porId), por:textoE(ultimo.por)} : null,
    problema:c.problema ? {id:textoE(c.problema.id), dia:c.problema.dia, motivo:textoE(c.problema.motivo)} : null,
    cancelado:c.cancelado ? {id:textoE(c.cancelado.id), dia:c.cancelado.dia, motivo:textoE(c.cancelado.motivo)} : null,
  };
  /* O.S. cancelada (F16): cancela o SALDO. O item que já tinha ido por
     inteiro fica entregue (ou retirado): o entregue fica. */
  if (c.cancelado || (osCancelada && c.acum < c.Q)) { s.situacao = 'cancelado'; s.saldo = 0; }
  else if (c.problema) s.situacao = 'problema';
  else if (c.acum >= c.Q) s.situacao = c.soRetirada ? 'retirado' : 'entregue';
  else if (imp) {
    s.implicito = c.Q - c.acum; s.saldo = 0; s.marca = imp.marca;
    if (imp.dia > s.dia) s.dia = imp.dia;
    const interna = !!(os && os.tipo === 'interno');
    s.situacao = interna && (c.acum === 0 || c.soRetirada) ? 'retirado' : 'entregue';
  } else if (c.acum > 0) s.situacao = 'parcial';
  s.rotulo = s.situacao === 'parcial' ? `parcial ${c.acum} de ${c.Q}` : ROTULO[s.situacao];
  return s;
}
/* O DIA DO SERVIÇO: o da última entrega física, quando nenhum item físico
   ficou pendente (a entregar, parcial ou com problema); senão, o da entrega
   implícita da O.S. encerrada. Cancelada (no ERP ou à mão): o serviço é
   cancelado junto. */
function diaDoServico(os, imp, osCancelada) {
  if (osCancelada) return {dia:'', cancelado:true, marca:''};
  let maior = '', pendente = false;
  for (const it of listaE(os && os.itens)) {
    if (!it || typeof it !== 'object' || ehServico(it)) continue;
    const s = situacaoFisica(it, os, imp, false);
    if (s.situacao === 'a entregar' || s.situacao === 'parcial' || s.situacao === 'problema') pendente = true;
    if ((s.entregue > 0 || s.implicito > 0) && s.dia > maior) maior = s.dia;
  }
  if (!pendente && maior) return {dia:maior, cancelado:false, marca:'servico'};
  if (imp) return {dia:imp.dia, cancelado:false, marca:'servico'};
  return {dia:'', cancelado:false, marca:''};
}
/* SITUAÇÃO DO ITEM: cancelado > problema aberto > entregue ou retirado (a
   soma chegou na quantidade) > entregue implícito (O.S. encerrada) > parcial
   ('parcial 6 de 10') > a entregar. Item de serviço segue diaDoServico. */
function situacaoItem(item, os, ctx) {
  const imp = entregaImplicita(os, ctx), osCancelada = canceladaOS(os);
  if (!ehServico(item)) return situacaoFisica(item, os, imp, osCancelada);
  const d = diaDoServico(os, imp, osCancelada), Q = qtdeNum(item);
  const situacao = d.cancelado ? 'cancelado' : d.dia ? 'entregue' : 'a entregar';
  return {situacao, rotulo:ROTULO[situacao], qtde:Q, entregue:d.dia ? Q : 0, implicito:0, saldo:situacao === 'a entregar' ? Q : 0,
    parte:false, servico:true, dia:d.dia, marca:d.marca, ultimaMarca:'', ultimo:null, problema:null, cancelado:null};
}
/* RESUMO DA O.S. (itens físicos; serviço conta à parte). situacao:
     'sem marca'  nenhuma marca valendo (a O.S. segue como hoje)
     'parcial'    alguma unidade JÁ FOI por marca (entregue ou retirada) e
                  ainda sobra item a entregar, parcial ou com problema
     'com marca'  tem marca (cancelado, problema) mas nada foi entregue por
                  marca, e ainda sobra item: não é entrega parcial
     'completa'   tem marca e todo item físico está entregue, retirado ou cancelado
   Entrega parcial é O.S. ABERTA com situacao 'parcial'. unidadesEntregues é a
   soma das unidades que foram por marca (o implícito fica fora). */
function resumoOS(os, ctx) {
  const r = {itensTotal:0, servicos:0, entregues:0, parciais:0, aEntregar:0, problema:0, cancelados:0, saldoItens:0, marcas:0, unidadesEntregues:0, situacao:'sem marca'};
  const imp = entregaImplicita(os, ctx), osCancelada = canceladaOS(os);
  for (const it of listaE(os && os.itens)) {
    if (!it || typeof it !== 'object') continue;
    if (ehServico(it)) { r.servicos++; continue; }
    const s = situacaoFisica(it, os, imp, osCancelada);
    r.itensTotal++;
    r.marcas += eventosAtivos(it).length;
    r.saldoItens += s.saldo;
    r.unidadesEntregues += s.entregue;
    if (s.situacao === 'entregue' || s.situacao === 'retirado') r.entregues++;
    else if (s.situacao === 'parcial') r.parciais++;
    else if (s.situacao === 'a entregar') r.aEntregar++;
    else if (s.situacao === 'problema') r.problema++;
    else if (s.situacao === 'cancelado') r.cancelados++;
  }
  if (r.marcas) r.situacao = r.aEntregar + r.parciais + r.problema === 0 ? 'completa' : r.unidadesEntregues > 0 ? 'parcial' : 'com marca';
  return r;
}

/* ── valor ────────────────────────────────────────────────────────────── */
// Número do ERP ('1234.56'), do PDF ('1.234,56') ou já número; a mesma leitura do valorDaOS.
function centavosDe(v) {
  if (v == null || v === '') return NaN;
  let n;
  if (typeof v === 'number') n = v;
  else {
    const t = String(v).replace(/R\$/g, '').replace(/\s+/g, '');
    if (!t) return NaN;
    n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  }
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
/* VALOR DE CADA ITEM = LÍQUIDO DA O.S. x subtotal do item / soma dos subtotais
   de TODOS os itens (cancelados e serviços incluídos, para o valor dos outros
   não subir). O subtotal é o bruto: em 806 O.S. a soma crua dá 109,8% do
   líquido, por isso o desconto é repartido. Os centavos que sobram vão pelo
   maior resto e, no empate, para o maior subtotal. A soma fecha no líquido.
   Base: ctx.liquido (painel_ordens.valor, que quem chama escolhe) > valorTotal
   da O.S. > soma dos subtotais. Subtotal zero em todos: divide igual. */
function valorItemRateado(os, ctx) {
  const itens = listaE(os && os.itens);
  const pesos = itens.map(it => { const c = centavosDe(it && it.subtotal); return c > 0 ? c : 0; });
  let total = centavosDe(ctx && ctx.liquido), fonte = 'informado';
  if (!(total >= 0)) { total = centavosDe(os && os.valorTotal); fonte = 'valorTotal'; }
  if (!(total >= 0)) { total = pesos.reduce((s, p) => s + p, 0); fonte = total > 0 ? 'itens' : ''; }
  if (!itens.length) return {total, fonte, itens:[]};
  const usados = pesos.some(p => p > 0) ? pesos : pesos.map(() => 1);
  // BigInt(0) e não o literal: navegador sem BigInt falha só aqui, não na leitura do arquivo.
  const W = usados.reduce((s, p) => s + BigInt(p), BigInt(0)), T = BigInt(total);
  const partes = usados.map((p, i) => ({i, p, q:T * BigInt(p) / W, r:T * BigInt(p) % W}));
  let sobra = total - partes.reduce((s, x) => s + Number(x.q), 0);
  const ordem = partes.slice().sort((a, b) => (a.r === b.r ? 0 : a.r > b.r ? -1 : 1) || (b.p - a.p) || (a.i - b.i));
  for (let k = 0; sobra > 0; k++, sobra--) ordem[k].q += BigInt(1);
  return {total, fonte, itens:partes.map(x => Number(x.q))};
}
/* VALOR DE UMA ENTREGA = valor do item x fração da quantidade, pela soma
   acumulada: a parte k vale piso(V x até_k / Q) - piso(V x antes_k / Q). A
   última parte leva o resto e o item inteiro fecha no centavo, qualquer que
   seja a ordem. Marca que não vale (desfeita, problema, de outro item) = 0.
   Não olha problema aberto nem cancelamento: isso é do lancamentosDaOS. */
function valorDoEvento(item, evento, valorItem) {
  const V = Number.isInteger(valorItem) && valorItem > 0 ? valorItem : 0;
  const id = textoE(evento && evento.id), c = contar(item);
  const p = id ? c.partes.find(x => textoE(x.evento.id) === id) : null;
  if (!V || !p || p.qtde <= 0) return 0;
  return mulDiv(V, p.antes + p.qtde, c.Q) - mulDiv(V, p.antes, c.Q);
}
/* OS LANÇAMENTOS DE R$ DA O.S.: uma linha por entrega que vale, com o dia que
   decide o dia e o mês. Cada unidade conta UMA vez em toda a história: o que
   foi entregue em agosto fica em agosto, e a baixa do ERP em setembro só leva
   o SALDO. A conta fecha sempre: entregue + saldo + cancelado + retido +
   semItem = total (o líquido).
     entregue   as linhas de `lancamentos`
     saldo      o que ainda falta entregar (O.S. aberta)
     cancelado  saldo de item cancelado, ou de O.S. cancelada (no ERP ou à
                mão, F16)
     retido     SALDO de item com problema aberto: não conta nem pela
                finalização até a entrega depois do problema. O que já tinha
                ido fica no seu dia (mês que passou não muda)
     semItem    O.S. sem nenhum item: quem chama decide (conta inteira)
   semConfirmacaoERP: O.S. encerrada pela máquina sem o ERP dizer ENTREGUE
   (saiu da carteira, CONCLUIDO): o saldo fica em `saldo` até vir a data.
   Linha: {indice, tipo:'entregue'|'retirado'|'implicito'|'servico', dia,
   valor, qtde, marca:'marcado'|'implicito'|'sem prova'|'servico', eventoId,
   via}. `via` 'toque' é a entrega DECLARADA pelo celular: quem pontua decide
   se ela já foi conferida. */
function lancamentosDaOS(os, ctx) {
  const rateio = valorItemRateado(os, ctx);
  const imp = entregaImplicita(os, ctx), osCancelada = canceladaOS(os);
  const r = {total:rateio.total, fonte:rateio.fonte, entregue:0, saldo:0, cancelado:0, retido:0, semItem:0,
    semConfirmacaoERP:!imp && !osCancelada && encerradaNoERP(os), itens:[], lancamentos:[]};
  const itens = listaE(os && os.itens);
  if (!itens.length) { r.semItem = rateio.total; return r; }
  const servico = diaDoServico(os, imp, osCancelada);
  itens.forEach((it, indice) => {
    const V = rateio.itens[indice];
    const item = it && typeof it === 'object' ? it : {};
    const linha = l => { r.lancamentos.push({indice, ...l}); r.entregue += l.valor; return l.valor; };
    if (ehServico(item)) {
      r.itens.push({indice, valor:V, situacao:servico.cancelado ? 'cancelado' : servico.dia ? 'entregue' : 'a entregar', servico:true});
      if (servico.dia) linha({tipo:'servico', dia:servico.dia, valor:V, qtde:qtdeNum(item), marca:'servico', eventoId:'', via:''});
      else if (servico.cancelado) r.cancelado += V;
      else r.saldo += V;
      return;
    }
    const s = situacaoFisica(item, os, imp, osCancelada);
    r.itens.push({indice, valor:V, situacao:s.situacao, servico:false});
    const c = contar(item);
    let foi = 0;
    for (const p of c.partes) {
      if (p.qtde <= 0) continue;
      const valor = mulDiv(V, p.antes + p.qtde, c.Q) - mulDiv(V, p.antes, c.Q);
      foi += linha({tipo:p.evento.tipo, dia:p.evento.dia, valor, qtde:p.qtde, marca:'marcado', eventoId:textoE(p.evento.id), via:textoE(p.evento.via)});
    }
    if (s.implicito > 0) foi += linha({tipo:'implicito', dia:imp.dia, valor:V - foi, qtde:s.implicito, marca:imp.marca, eventoId:'', via:''});
    if (s.situacao === 'cancelado') r.cancelado += V - foi;
    else if (s.situacao === 'problema') r.retido += V - foi;
    else r.saldo += V - foi;
  });
  return r;
}
/* ==== FIM DO MOTOR ==== */
return {TIPOS, VIAS, TETO_EVENTOS, PERMISSOES, diaSP, qtdeNum, aceitaParte, ehServico, podeMarcar, eventosAtivos, validarEvento, situacaoItem, resumoOS, entregaImplicita, canceladaNoERP, canceladaAMao, canceladaOS, valorItemRateado, valorDoEvento, lancamentosDaOS};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ENTREGA_ITEM;
/* O STATUS DA ENTREGA (F16, OPERACAO.statusEntrega) lê as marcas por item com
   este motor. O motor se apresenta ao OPERACAO, e não o contrário: o
   operacao.js roda também no celular do instalador, que não carrega este
   arquivo, e nada ali pode chamar o motor pelo nome. */
if (typeof OPERACAO !== 'undefined' && OPERACAO && typeof OPERACAO.usarMotorItem === 'function') OPERACAO.usarMotorItem(ENTREGA_ITEM);
