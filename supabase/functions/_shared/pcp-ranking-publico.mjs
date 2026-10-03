// Projeção do acompanhamento autenticado. Nunca devolve a base gerencial.
const ANIMAIS = new Set(['aguia','leao','pantera','lobo','tigre','falcao','carcara','onca','lobo-guara','touro']);
const texto = (v, max = 160) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
const logoSeguro = v => typeof v === 'string' && v.length <= 40000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v) ? v : '';
const numero = v => Math.round(v * 1e8) / 1e8;

export function podeVerRankingEquipe(cracha) {
  return !!cracha && cracha.sis === 'pcp' && !!String(cracha.sub || '').trim() &&
    ['admin','pcp','montagem','operacao','comercial'].includes(String(cracha.papel));
}

export function rankingEquipeSeguro(fonte, cadastro = [], pessoas = null) {
  const salvas = new Map((Array.isArray(cadastro) ? cadastro : []).filter(e => e?.id).map(e => [String(e.id), e]));
  const historico = !!fonte?.fechadoEm, grupos = new Map(), vistos = new Set();
  let entregasConfirmadas = 0, equivalentes = 0, aConferir = 0, semBase = 0;
  for (const r of Array.isArray(fonte?.registros) ? fonte.registros : []) {
    if (!r?.id || vistos.has(String(r.id))) continue;
    vistos.add(String(r.id));
    const originais = Array.isArray(r.membros) ? r.membros : [];
    const chavesOriginais = originais.map(m => String(m?.chave || ''));
    const chaves = new Map(), unidas = new Map();
    for (const m of originais) {
      const k = String(m?.chave || ''), ficha = (pessoas?.fichas || []).find(p => String(p.chave) === k && /^\d{6}$/.test(String(p.id)));
      // Slug só muda pela própria ficha. Nome/apelido só muda quando ele É
      // a chave; nunca procurar um slug órfão pelo nome de outra pessoa.
      const id = pessoas ? (/^\d{6}$/.test(k) ? k : ficha?.id || (k === String(m?.apelido || m?.nome || '') ? pessoas.idDe(k) : '')) : '';
      const usar = id && !pessoas?.repetido?.(id) ? String(id) : k;
      const nome = usar !== k ? (pessoas?.pessoa?.(usar)?.nome || m.nome) : m?.nome;
      const proximo = {...m,chave:usar,nome};
      chaves.set(k,usar);
      if (unidas.has(usar)) unidas.get(usar).percentual = Math.round((Number(unidas.get(usar).percentual) + Number(m?.percentual))*100)/100;
      else unidas.set(usar,proximo);
    }
    const membros = [...unidas.values()];
    const ids = membros.map(m => String(m?.chave || ''));
    const valida = membros.length && new Set(chavesOriginais).size === chavesOriginais.length && ids.every(Boolean) && new Set(ids).size === ids.length &&
      membros.every(m => typeof m.percentual === 'number' && Number.isFinite(m.percentual) && m.percentual > 0 && m.percentual <= 100 && String(m.nome || '').trim()) &&
      Math.abs(membros.reduce((s, m) => s + m.percentual, 0) - 100) < 0.001;
    if (r.confirmado !== true || !valida || r.erroConferencia) { aConferir++; continue; }
    const fracao = Number.isFinite(r.fracaoOS) ? Math.max(0, Math.min(1, r.fracaoOS)) : r.entregaId ? 0 : 1;
    let partes;
    if (Array.isArray(r.grupos) && r.grupos.length) {
      partes = r.grupos.map(g => ({ ...g, membros: membros.filter(m => (Array.isArray(g?.membros) ? g.membros : []).map(k => chaves.get(String(k)) || String(k)).includes(String(m.chave))) }));
      const idsPartes = partes.flatMap(g => g.membros.map(m => String(m.chave)));
      if (partes.some(g => !g.membros.length || !Number.isInteger(g.cota) || g.cota <= 0) ||
          partes.reduce((s, g) => s + g.cota, 0) !== 10000 || new Set(idsPartes).size !== idsPartes.length || idsPartes.length !== membros.length) { aConferir++; continue; }
    } else partes = [{ equipeId:r.equipeId, equipeNome:r.equipeNome, emblema:r.emblema, logo:r.logo, animal:r.animal, cor:r.cor, cota:10000, membros }];
    entregasConfirmadas++;
    // A divisão pode estar conferida mesmo quando ainda falta a base da
    // parcial. Preserva a confirmação sem transformar a entrega em O.S. inteira.
    if (!fracao) { semBase++; continue; }
    equivalentes += fracao;
    for (const g of partes) {
      // Identidades só existem no cálculo em memória; nenhuma chave do RH sai.
      const chave = g.equipeId ? 'e:' + g.equipeId : 'a:' + g.membros.map(m => String(m.chave)).sort().join('|');
      const salva = salvas.get(String(g.equipeId || ''));
      const visual = historico ? g : (salva || g);
      const animal = ANIMAIS.has(visual.animal) ? visual.animal : '';
      const nome = texto(visual.nome || visual.equipeNome || g.membros.map(m => texto(m.nome, 70)).join(' + '));
      const row = grupos.get(chave) || { nome, logo:logoSeguro(salva?.logo || visual.logo), animal,
        emblema:texto(visual.emblema || '🤝', 12), cor:/^#[0-9a-f]{6}$/i.test(visual.cor) ? visual.cor : '',
        tipo:g.equipeId ? 'equipe' : g.membros.length > 1 ? 'composicao' : 'individual', entregas:0, equivalentes:0 };
      row.entregas++; row.equivalentes += fracao * g.cota / 10000;
      grupos.set(chave, row);
    }
  }
  const linhas = [...grupos.values()].map(r => ({ ...r, equivalentes:numero(r.equivalentes) }))
    .sort((a,b) => b.equivalentes-a.equivalentes || a.nome.localeCompare(b.nome, 'pt-BR'));
  let anterior = null, posicao = 0;
  const lider = linhas[0]?.equivalentes || 0;
  const equipes = linhas.map((r, i) => {
    if (r.equivalentes !== anterior) posicao = i + 1;
    anterior = r.equivalentes;
    // Allowlist explícita: nem spread da fonte, nem membros, IDs ou dinheiro.
    return { posicao, nome:r.nome, tipo:r.tipo, logo:r.logo, animal:r.animal, emblema:r.emblema, cor:r.cor,
      entregas:r.entregas, equivalentes:r.equivalentes, faltaLideranca:numero(lider-r.equivalentes) };
  });
  return { periodo:{de:texto(fonte?.periodo?.de,10),ate:texto(fonte?.periodo?.ate,10)},
    atualizadoEm:texto(fonte?.consultadoEm,40), fechado:historico,
    fechadoEm:historico ? texto(fonte.fechadoEm,40) : null,
    revisao:historico && Number.isInteger(fonte.revisao) ? fonte.revisao : null,
    resumo:{equipes:equipes.length,entregasConfirmadas,equivalentes:numero(equivalentes),aConferir,semBase}, equipes };
}
