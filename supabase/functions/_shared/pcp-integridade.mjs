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
   serviço pronto". Sem eles, a finalização do espelho chegava pela metade. */
export const CAMPOS_MONTAGEM = new Set([
  'id', 'rev', 'atualizadoEm', 'atualizadoPor',
  'checkin', 'checkinGPS', 'checkout', 'conclusao',
  'fotosCheckinIds', 'fotosRetornoIds',
  'carroLiberado', 'carroLiberadoEm', 'carroLiberadoPor',
  'obsTecnicas', 'instalacaoOK', 'problema', 'conferidoPor', 'retrabalho', 'causa',
  'ferramentasConferidas', 'ferramentasConferidasPor',
  'kmSaida', 'kmRetorno', 'horaSaida', 'horaRetorno', 'saidaEm', 'retornoEm',
]);
// Do item, só a marca da montagem: descrição, medida e valor são do PCP e do ERP.
const CAMPOS_ITEM_MONTAGEM = ['statusInst', 'pronto', 'motivo', 'obsProb', 'fotoProbId'];
/* MESCLA, NÃO FILTRA. O upsert SUBSTITUI a O.S. inteira; partir do que já está
   gravado e deixar o crachá de toque mudar só os campos dele é o que protege
   o resto. Devolve { os, erro }: erro preenchido vira 422 e os vem nulo.

   ITENS: o item não tem id. Casa pela posição E pelo número e descrição; item
   que mudou de lugar fica como está (a marca não pula para o vizinho), e item
   que só o aparelho tem não é criado.

   FINALIZAR: só O.S. que o PCP liberou e o cliente confirmou, as mesmas travas
   do espelho. O autor é o crachá, nunca o nome que o aparelho escreveu. A hora
   é a do aparelho (quem finalizou offline às 15h finalizou às 15h), a não ser
   que venha do futuro. Reabrir não é do instalador: finalizada segue
   finalizada, com o autor que tinha. */
export function mesclarToqueNoNome(atual, veio, autor, agora) {
  const m = { ...atual };
  for (const k of Object.keys(veio || {})) if (CAMPOS_MONTAGEM.has(k)) m[k] = veio[k];
  if (!proprio(veio, 'rev')) delete m.rev;
  if (Array.isArray(veio?.itens) && Array.isArray(atual?.itens)) {
    m.itens = atual.itens.map((it, i) => {
      const v = veio.itens[i];
      if (!objeto(it) || !objeto(v) || String(v.item ?? '') !== String(it.item ?? '') ||
          String(v.descricao ?? '') !== String(it.descricao ?? '')) return it;
      const r = { ...it };
      for (const c of CAMPOS_ITEM_MONTAGEM) if (proprio(v, c)) r[c] = v[c];
      return r;
    });
  }
  if (!atual?.finalizadaEm && veio?.finalizadaEm) {
    if (!atual.liberadoPCP) return { os: null, erro: 'O PCP ainda não liberou esta O.S. Fale com o PCP antes de finalizar.' };
    if (atual.tipo !== 'interno' && atual.confirmacao !== 'Confirmado') return { os: null, erro: 'O cliente ainda não confirmou esta instalação. Fale com o PCP antes de finalizar.' };
    const t = Date.parse(String(veio.finalizadaEm));
    m.finalizadaEm = Number.isFinite(t) && t <= Date.parse(agora) + 10 * 60 * 1000 ? String(veio.finalizadaEm) : agora;
    m.finalizadoPor = autor;
  }
  return { os: m, erro: '' };
}
