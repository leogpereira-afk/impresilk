'use strict';

// Participação é uma medida operacional. Não calcula salário ou bônus.
const PERF = (() => {
  const unicos = membros => [...new Map((membros || []).filter(p => p && p.chave).map(p => [String(p.chave), {...p}])).values()];
  const iguais = membros => {
    const ps = unicos(membros), n = ps.length;
    return ps.map((p,i) => ({...p, percentual: (Math.floor(10000/n) + (i < 10000 % n ? 1 : 0))/100}));
  };
  const validar = membros => {
    if (!Array.isArray(membros) || !membros.length) return 'Escolha pelo menos uma pessoa.';
    if (unicos(membros).length !== membros.length) return 'A mesma pessoa está repetida.';
    if (membros.some(p => !p.nome || typeof p.percentual !== 'number' || !Number.isFinite(p.percentual) || p.percentual <= 0 || p.percentual > 100)) return 'Cada participação precisa ser maior que zero e até 100%.';
    if (Math.abs(membros.reduce((s,p) => s + p.percentual,0)-100) > 0.001) return 'As participações precisam somar 100%.';
    return '';
  };
  const composicao = membros => unicos(membros).map(p => String(p.chave)).sort().join('|');
  // Rateio em centavos: distribui o resíduo pelas maiores frações, com desempate estável.
  const ratearCentavos = (valor, membros) => {
    if (valor == null) return membros.map(() => null);
    const total = Math.round(Math.abs(valor) * 100), sinal = valor < 0 ? -1 : 1;
    const partes = membros.map((p,i) => {
      const exato = total * p.percentual / 100;
      return {i, chave:String(p.chave), centavos:Math.floor(exato), resto:exato-Math.floor(exato)};
    });
    let falta = total - partes.reduce((s,p)=>s+p.centavos,0);
    const ordem = [...partes].sort((a,b)=>b.resto-a.resto || a.chave.localeCompare(b.chave));
    for(let i=0;i<falta;i++) ordem[i % ordem.length].centavos++;
    return partes.map(p=>sinal*p.centavos);
  };
  /* A PARTE DE CADA EQUIPE NUMA O.S. COM DUAS OU MAIS (F11), em centavos, pela
     cota de cada uma. A sobra do arredondamento fica com a equipe com mais
     gente NA DIVISÃO (`tamanho`, que conta quem ficou em 0%; no empate, a
     primeira), como no motor (DIVISAO.ratearCentavosLider): a mesma equipe
     leva o mesmo centavo, e a soma é sempre o valor da O.S. Sem `tamanho`,
     quem tem parte. */
  const ratearGrupos = (valor, grupos) => {
    const soma = grupos.reduce((s, g) => s + g.cota, 0);
    if (valor == null || !soma) return grupos.map(() => null);
    const total = Math.round(Math.abs(valor) * 100), sinal = valor < 0 ? -1 : 1;
    const partes = grupos.map(g => Math.floor(total * g.cota / soma));
    const gente = g => Number.isInteger(g.tamanho) && g.tamanho > 0 ? g.tamanho : g.membros.length;
    let alvo = 0;
    grupos.forEach((g, i) => { if (gente(g) > gente(grupos[alvo])) alvo = i; });
    partes[alvo] += total - partes.reduce((a, b) => a + b, 0);
    return partes.map(c => sinal * c);
  };
  /* AS EQUIPES DE UM REGISTRO (F11). Com `grupos` (divisão com duas equipes
     ou mais, confirmada ou sugerida), cada equipe com quem tem parte nela e a
     SUA parte do valor. Sem `grupos`, uma equipe só: a do registro (a da
     divisão, a da participação antiga, a sugerida ou a composição avulsa), com
     a O.S. inteira, como sempre foi. `chave` é a linha da equipe no ranking. */
  const gruposDoRegistro = r => {
    const ms = Array.isArray(r && r.membros) ? r.membros : [];
    if (Array.isArray(r && r.grupos) && r.grupos.length) {
      const gs = r.grupos.map(g => { const ids = new Set((g && Array.isArray(g.membros) ? g.membros : []).map(String)); return {...g, membros:ms.filter(m => ids.has(String(m.chave)))}; })
        .filter(g => g.membros.length && Number.isInteger(g.cota) && g.cota > 0);
      if (gs.length) {
        const partes = ratearGrupos(r.valor, gs);
        return gs.map((g, i) => ({...g, chave:g.equipeId || 'avulsa:' + composicao(g.membros), valor:partes[i] == null ? null : partes[i] / 100, centavos:partes[i]}));
      }
    }
    return [{equipeId:r.equipeId || '', equipeNome:r.equipeNome || '', emblema:r.emblema, logo:r.logo, animal:r.animal, cor:r.cor, cota:10000, membros:ms, chave:r.equipeId || 'avulsa:' + composicao(ms), valor:r.valor == null ? null : r.valor, inteira:true}];
  };
  // As linhas de equipe do ranking em que o registro entra (uma, ou uma por equipe da divisão).
  const chavesDeEquipe = r => gruposDoRegistro(r).map(g => g.chave);
  // Parcial sem base monetária não equivale a uma O.S. completa.
  const fracaoRegistro = r => Number.isFinite(r.fracaoOS) ? Math.max(0, Math.min(1, r.fracaoOS)) : r.entregaId ? 0 : 1;
  const resumir = registros => {
    const pessoas = new Map(), equipes = new Map();
    for (const r of registros) {
      if (validar(r.membros)) continue;
      const centavos = ratearCentavos(r.valor, r.membros);
      for (const [indice,p] of r.membros.entries()) {
        const x = pessoas.get(p.chave) || {chave:p.chave,nome:p.nome,os:0,equivalentes:0,valor:0,semValor:0,confirmadas:0};
        x.os++; if(r.confirmado) x.confirmadas++; x.equivalentes += p.percentual/100 * fracaoRegistro(r);
        if (r.valor == null) x.semValor++; else x.valor = (Math.round(x.valor*100) + centavos[indice])/100;
        pessoas.set(p.chave,x);
      }
      /* A equipe leva cada O.S. uma vez, mesmo com participação individual. Com
         duas equipes na divisão (F11), cada uma leva a O.S. uma vez e SÓ a parte
         dela no valor (a soma das cotas): a O.S. não conta inteira nas duas. */
      for (const g of gruposDoRegistro(r)) {
        const k = g.chave;
        const x = equipes.get(k) || {chave:k,nome:g.equipeNome || g.membros.map(p=>p.nome).join(' + '),emblema:g.emblema || '🤝',logo:g.logo || '',animal:g.animal || '',cor:g.cor || '',salva:!!g.equipeId,membros:g.membros.map(p=>({chave:p.chave,nome:p.nome})),os:0,valor:0,semValor:0,confirmadas:0};
        x.os++; if(r.confirmado) x.confirmadas++;
        x.equivalentes = (x.equivalentes || 0) + fracaoRegistro(r) * g.cota / 10000;
        if (g.valor == null) x.semValor++; else x.valor = (Math.round(x.valor*100) + (g.inteira ? Math.round(g.valor*100) : g.centavos))/100;
        equipes.set(k,x);
      }
    }
    return {pessoas:[...pessoas.values()].sort((a,b)=>b.equivalentes-a.equivalentes || a.nome.localeCompare(b.nome)),equipes:[...equipes.values()].sort((a,b)=>b.os-a.os || a.nome.localeCompare(b.nome))};
  };
  // Diagnóstico sem escrita: cada pendência mantém a chave da entrega para abrir a conferência certa.
  function auditar(registros) {
    const rs=Array.isArray(registros)?registros:[], ids=new Set(), os=new Set(), fracoes=new Map(), voltas=new Map(), pendencias=[];
    let confirmadas=0,semValor=0,valor=0,valorConf=0,parciais=0,aConferir=0;
    const add=(r,tipo,motivo)=>pendencias.push({id:r.id,numero:r.os?.numero || r.numero || '',tipo,motivo});
    for(const r of rs){
      if(ids.has(r.id)) {add(r,'duplicado','Registro repetido na apuração. Atualize a base.');continue;} ids.add(r.id);
      const chave=r.osId || r.id;os.add(chave);
      if(r.entregaId){parciais++;fracoes.set(chave,(fracoes.get(chave)||0)+(Number.isFinite(r.fracaoOS)?r.fracaoOS:0));}
      const erro=validar(r.membros);
      if(erro)add(r,'invalida',erro);
      if(r.erroConferencia)add(r,'itens',r.erroConferencia);
      if(r.avisoValor)add(r,'valor-erp',r.avisoValor);
      if(r.confirmado&&!erro)confirmadas++;else{aConferir++;add(r,'pendente','Confira os participantes e a divisão desta entrega.');}
      if(r.valor==null||!Number.isFinite(r.valor)||r.valor<0){semValor++;add(r,'sem-valor','Valor líquido não disponível. Confira a O.S. e a origem no ERP.');}
      else{valor+=Math.round(r.valor*100);if(r.confirmado&&!erro)valorConf+=Math.round(r.valor*100);}
      if(r.voltou){const chaveVolta=r.volta || r.id, rc=r.retornoConf;
        const campos=['carroLimpo','carroArrumado','equipamentosOk','semAvaria'];
        const respostas=campos.map(k=>rc?.[k]===true||rc?.[k]==='sim'?'sim':rc?.[k]===false||rc?.[k]==='nao'?'nao':null);
        const anterior=voltas.get(chaveVolta);
        if(!anterior)voltas.set(chaveVolta,{r,respostas});
        else anterior.respostas=anterior.respostas.map((v,i)=>v===respostas[i]?v:null);
      }
    }
    for(const [id,n] of fracoes)if(n>1.000001)add(rs.find(r=>(r.osId||r.id)===id)||{id},'excesso','As parciais ultrapassam uma O.S. equivalente. Confira itens e quantidades.');
    let voltasConferidas=0,voltasSemOcorrencia=0;
    for(const {r,respostas} of voltas.values()){
      if(respostas.every(Boolean)){voltasConferidas++;if(respostas.every(v=>v==='sim'))voltasSemOcorrencia++;}
      else add(r,'volta','A conferência da volta está incompleta.');
    }
    return {total:rs.length,os:os.size,parciais,confirmadas,aConferir,semValor,valor:valor/100,valorConfirmado:valorConf/100,voltas:voltas.size,voltasConferidas,voltasSemOcorrencia,pendencias,pronta:rs.length>0&&!pendencias.length};
  }
  const incluiPessoa = (membros,chave) => !chave || membros.some(p=>String(p.chave)===String(chave));
  /* manterPesos saiu na F09 (30/09/2026): quem entra na divisão entra pela
     regra do programa (DIVISAO, alocacao-ui.js), não com 0% esperando acerto. */
  const dossie = registros => {
    const grupos=new Map();
    for(const r of registros){
      if(validar(r.membros))continue;
      // Com duas equipes na divisão (F11), a O.S. entra no dossiê de cada uma, com a parte dela.
      for(const eq of gruposDoRegistro(r)){
        const chave=eq.chave;
        const g=grupos.get(chave)||{chave,nome:eq.equipeNome || 'Composição avulsa',emblema:eq.emblema||'🤝',logo:eq.logo||'',animal:eq.animal||'',cor:eq.cor||'',registros:[],membros:new Map(),confirmadas:0,valor:0,semValor:0,retrabalhos:0};
        g.registros.push(r);if(r.os?.retrabalho || r.retrabalho)g.retrabalhos++;
        if(r.confirmado){g.confirmadas++;if(eq.valor==null)g.semValor++;else g.valor=(Math.round(g.valor*100)+(eq.inteira?Math.round(eq.valor*100):eq.centavos))/100;}
        for(const m of eq.membros){const pessoa=g.membros.get(m.chave)||{chave:m.chave,nome:m.nome,entregas:0,confirmadas:0,equivalentes:0};pessoa.entregas++;if(r.confirmado){pessoa.confirmadas++;pessoa.equivalentes+=m.percentual/100 * fracaoRegistro(r);}g.membros.set(m.chave,pessoa);}
        grupos.set(chave,g);
      }
    }
    return [...grupos.values()].map(g=>({...g,membros:[...g.membros.values()]})).sort((a,b)=>b.registros.length-a.registros.length || a.nome.localeCompare(b.nome));
  };
  /* AS DEZ EQUIPES FIXAS (F06, 29/09/2026). Pedido do dono: "10 equipes
     fixas (Águia, Leão, Pantera, Lobo, Tigre, Falcão, Carcará, Onça,
     Lobo-Guará, Touro) com cor fixa, ícone do animal, líder e integrantes
     fixos". Listas FECHADAS, com cópia em _shared/pcp-integridade.mjs
     (ANIMAIS_EQUIPE, CORES_EQUIPE), que confere o que chega;
     tests/equipes-listas.test.cjs cobra as duas iguais.
     A cor é CHAVE da paleta, nunca hex: vira a classe perf-cor-<chave>, e o hex
     mora só no styles.css. Chave fora da lista não vira classe nem style=.
     Águia e Falcão, Pantera e Onça dividem o ícone: a cor e o rótulo separam.
     A equipe Pantera não tem relação com a pessoa de apelido Pantera: equipe é
     pelo id da equipe, pessoa pelo ID do RH. */
  const ANIMAIS = [
    {id:'aguia', rotulo:'Águia', icone:'🦅'},
    {id:'leao', rotulo:'Leão', icone:'🦁'},
    {id:'pantera', rotulo:'Pantera', icone:'🐆'},
    {id:'lobo', rotulo:'Lobo', icone:'🐺'},
    {id:'tigre', rotulo:'Tigre', icone:'🐯'},
    {id:'falcao', rotulo:'Falcão', icone:'🦅'},
    {id:'carcara', rotulo:'Carcará', icone:'🐦'},
    {id:'onca', rotulo:'Onça', icone:'🐆'},
    {id:'lobo-guara', rotulo:'Lobo-Guará', icone:'🦊'},
    {id:'touro', rotulo:'Touro', icone:'🐂'},
  ];
  const CORES = [
    {id:'azul', rotulo:'Azul'}, {id:'vermelho', rotulo:'Vermelho'}, {id:'laranja', rotulo:'Laranja'},
    {id:'amarelo', rotulo:'Amarelo'}, {id:'verde', rotulo:'Verde'}, {id:'turquesa', rotulo:'Turquesa'},
    {id:'roxo', rotulo:'Roxo'}, {id:'rosa', rotulo:'Rosa'}, {id:'marrom', rotulo:'Marrom'}, {id:'grafite', rotulo:'Grafite'},
    {id:'marinho', rotulo:'Azul-marinho'}, {id:'ocre', rotulo:'Ocre'}, {id:'terracota', rotulo:'Terracota'}, {id:'vinho', rotulo:'Vinho'},
  ];
  /* A LOGO E A COR DE CADA ANIMAL (logos mandadas pelo Léo em 29/09/2026).
     A logo é arquivo do site (equipe-<animal>.webp, na casca do sw.js), não
     da configuração: não pesa na sincronização e abre offline. Logo enviada
     na própria equipe continua valendo mais. A cor é só a SUGESTÃO que a tela
     marca ao escolher o animal; a equipe grava a chave que ficar marcada. */
  const LOGO_ANIMAL = Object.freeze({aguia:'equipe-aguia.webp', leao:'equipe-leao.webp', pantera:'equipe-pantera.webp', lobo:'equipe-lobo.webp', tigre:'equipe-tigre.webp', falcao:'equipe-falcao.webp', carcara:'equipe-carcara.webp', onca:'equipe-onca.webp', 'lobo-guara':'equipe-lobo-guara.webp', touro:'equipe-touro.webp'});
  const COR_ANIMAL = Object.freeze({aguia:'marinho', leao:'laranja', pantera:'turquesa', lobo:'verde', tigre:'amarelo', falcao:'vermelho', carcara:'marrom', onca:'ocre', 'lobo-guara':'terracota', touro:'vinho'});
  // Os emblemas de antes das equipes fixas continuam aceitos (equipe antiga).
  const EMBLEMAS = ['🦅','🚀','🎯','🛡️','⚡','🦁','🏔️','🤝'];
  const animalDe = k => ANIMAIS.find(a => a.id === k) || null;
  const corValida = k => CORES.some(c => c.id === k);
  // O ícone que a equipe mostra quando não há logo: o do animal, senão o emblema antigo.
  const iconeEquipe = e => (animalDe(e && e.animal) || {}).icone || (e && e.emblema) || '🤝';
  // A mesma normalização do servidor (nomeEquipeNorm): acento, caixa, hífen e espaço não mudam o nome.
  const nomeEquipeNorm = s => String(s == null ? '' : s).replace(/[-_]+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  /* A REGRA ENTRE AS ATIVAS, a mesma de conferirEquipesAtivas no servidor:
     `nomes` são os nomes repetidos (o servidor recusa o novo) e `pessoasEmDuas`
     quem é fixo em duas ou mais (o servidor avisa). `resolver(m)` dá o ID de
     hoje do membro (slug antigo e ID da mesma ficha são a mesma pessoa). */
  const conferirEquipes = (equipes, resolver) => {
    const porNome = new Map(), porPessoa = new Map();
    for (const e of Array.isArray(equipes) ? equipes : []) {
      if (!e || e.ativo === false) continue;
      const k = nomeEquipeNorm(e.nome);
      if (k) porNome.set(k, [...(porNome.get(k) || []), e.id]);
      const ids = new Set((e.membros || []).map(m => String((resolver ? resolver(m) : '') || (m && m.chave) || '')).filter(Boolean));
      for (const id of ids) porPessoa.set(id, [...(porPessoa.get(id) || []), e.id]);
    }
    return {nomes:new Map([...porNome].filter(([, ids]) => ids.length > 1)), pessoasEmDuas:new Map([...porPessoa].filter(([, ids]) => ids.length > 1))};
  };
  /* A EQUIPE DE UM REGISTRO. Pelo id quando a participação confirmada já diz
     qual foi (vale mesmo que a equipe tenha sido desativada depois: é
     histórico); senão, pela COMPOSIÇÃO EXATA, quando os mesmos integrantes estão
     cadastrados como equipe ativa. Sem esta segunda regra, nomear "Adriano +
     Douglas" como equipe não mudaria nada na tela até alguém reconferir cada
     entrega à mão — e ninguém reconfere 154 entregas para ver um nome. */
  /* A CHAVE DA PESSOA MUDA (apelido -> ficha do RH quando alguém é ligado, ou
     num aparelho em que o elenco ainda não desceu). A equipe guarda as chaves do
     dia em que foi salva; comparar cru faria a equipe sumir do ranking em
     silêncio depois de um "Ligar". `resolver` normaliza as duas pontas. */
/* ==== RÉGUA DA EQUIPE NA APURAÇÃO (F11): daqui até FIM DA RÉGUA DA EQUIPE, cópia byte a byte de _shared/pcp-integridade.mjs ==== */
/* A MESMA CONTA NO APARELHO (performance.js, dentro do PERF) E NO SERVIDOR
   (_shared/pcp-integridade.mjs, usada pela apuração do pcp-sync). Mudou numa,
   muda na outra no mesmo commit: tests/performance-alocacao-f11.test.cjs
   compara o texto, e tests/performance-alocacao-f11-revisao.test.cjs passa
   casos gerados pela apuração do servidor e pela do aparelho, cada uma com a
   régua de pessoas dela. Funções puras: não leem tela nem banco.
   A COMPOSIÇÃO de uma lista de membros ({chave}): a chave de hoje de cada um
   (`idDe(m)`, a régua de pessoas de cada lado; sem resposta, a chave como
   está), sem repetir e em ordem. A mesma gente em qualquer ordem é a mesma
   composição. */
function composicaoApurada(membros, idDe) {
  const ks = new Set();
  for (const m of Array.isArray(membros) ? membros : []) {
    if (!m || typeof m !== 'object') continue;
    const k = String((idDe ? idDe(m) : '') || (m.chave == null ? '' : m.chave)).trim();
    if (k) ks.add(k);
  }
  return [...ks].sort().join('|');
}
/* A EQUIPE PELA COMPOSIÇÃO (F06, F11): só quando EXATAMENTE UMA equipe ativa
   tem a mesma gente. Com duas ou mais, nenhuma: a ordem do cadastro não é
   mérito. É SUGESTÃO, para a entrega sem divisão e sem confirmação: aparece
   marcada "sugerida", conta nas Entregas e nunca no valor confirmado. */
function equipeDaComposicao(membros, equipes, idDe) {
  const k = composicaoApurada(membros, idDe);
  if (!k) return null;
  const iguais = (Array.isArray(equipes) ? equipes : []).filter(e => e && typeof e === 'object' && e.id && e.ativo !== false && composicaoApurada(e.membros, idDe) === k);
  return iguais.length === 1 ? iguais[0] : null;
}
/* A SUGESTÃO PELA COMPOSIÇÃO: o id, o nome e o emblema da equipe deduzida,
   ou null. */
function equipeSugeridaDe(membros, equipes, idDe) {
  const e = equipeDaComposicao(membros, equipes, idDe);
  return e ? {equipeId:String(e.id), equipeNome:String(e.nome || ''), emblema:e.emblema || '🤝'} : null;
}
/* AS EQUIPES DE UMA DIVISÃO (F11), para a apuração. `finais` é o
   DIVISAO.finais da divisão. Cada equipe leva a cota dela na O.S. (em 0,01%)
   e os IDs de quem tem parte nela; equipe com cota 0, ou sem ninguém com
   parte, fica de fora (não entrou no valor). A equipe que não está no
   cadastro fica sem id e vira composição avulsa, como a equipe única sempre
   foi. O valor da equipe no ranking é a SOMA DAS COTAS: a O.S. com duas
   equipes não conta inteira nas duas. `tamanho` é quanta gente a equipe tem
   na divisão, contando quem ficou em 0%: é por ele que o motor dá o centavo
   que sobra entre as equipes (DIVISAO.ratearCentavosLider), e o ranking dá
   o mesmo centavo à mesma equipe. */
function gruposApurados(aloc, finais, equipes) {
  const gs = aloc && typeof aloc === 'object' && Array.isArray(aloc.grupos) ? aloc.grupos : [];
  const fs = Array.isArray(finais) ? finais : [];
  const cadastro = Array.isArray(equipes) ? equipes : [];
  const out = [];
  gs.forEach((g, gi) => {
    if (!g || typeof g !== 'object') return;
    const cota = Number.isInteger(g.cota) && g.cota > 0 ? g.cota : 0;
    const membros = fs.filter(f => f && f.grupo === gi && Number.isInteger(f.cota) && f.cota > 0).map(f => String(f.pessoaId));
    if (!cota || !membros.length) return;
    const eq = g.equipeId ? cadastro.find(e => e && typeof e === 'object' && e.id === g.equipeId) || null : null;
    const tamanho = (Array.isArray(g.membros) ? g.membros : []).filter(Boolean).length;
    out.push({equipeId:eq ? String(eq.id) : '', equipeNome:eq ? String(eq.nome || '') : '', emblema:(eq && eq.emblema) || '🤝', cota, membros, tamanho});
  });
  return out;
}
/* O QUE A DIVISÃO DÁ AO REGISTRO (F11). Divisão com UMA equipe: ela é a
   equipe do registro (`unica`), e o registro confirmado fica igual ao de
   antes da F11, com o hash da performance-3. Divisão com DUAS OU MAIS, mesmo
   que uma tenha ficado em 0%: as equipes com parte vão em `grupos` e o
   registro fica sem equipe única. A de 0% não leva nada; a outra leva a O.S.
   pela cota dela, e o registro diz que a divisão era de mais de uma equipe
   (é o `grupos` que muda o hash, e só nesse período). */
function equipesDaDivisao(aloc, finais, equipes) {
  const n = aloc && typeof aloc === 'object' && Array.isArray(aloc.grupos) ? aloc.grupos.length : 0;
  const gs = gruposApurados(aloc, finais, equipes);
  return n > 1 ? {unica:null, grupos:gs} : {unica:gs.length === 1 ? gs[0] : null, grupos:null};
}
/* A SUGESTÃO DA ENTREGA NÃO CONFIRMADA (F11): os campos que vão no registro.
   Com divisão na O.S. (desatualizada, esperando o RH ou inválida), vale a
   equipe que a própria divisão escolheu (`equipeId`), nunca a composição:
   quem dividiu disse qual equipe foi. Duas ou mais equipes na divisão vão em
   `grupos`, como na confirmada. Sem divisão, a equipe pela composição
   (equipeSugeridaDe). Entrega sem gente não tem sugestão: está sem equipe.
   Sugestão nunca confirma nem entra no valor confirmado. */
function sugestaoApurada(membros, aloc, finais, equipes, idDe) {
  if (!Array.isArray(membros) || !membros.length) return {equipeSugerida:null};
  if (!aloc || typeof aloc !== 'object') return {equipeSugerida:equipeSugeridaDe(membros, equipes, idDe)};
  const d = equipesDaDivisao(aloc, finais, equipes);
  if (d.grupos) return d.grupos.length ? {equipeSugerida:null, grupos:d.grupos} : {equipeSugerida:null};
  const u = d.unica;
  return {equipeSugerida:u && u.equipeId ? {equipeId:u.equipeId, equipeNome:u.equipeNome, emblema:u.emblema} : null};
}
/* ==== FIM DA RÉGUA DA EQUIPE ==== */
  const composicaoCom = (membros, resolver) => composicaoApurada(membros, resolver);
  /* EXATAMENTE UMA (F06, 29/09/2026). Com as dez equipes fixas, duas ativas
     podem ter a mesma gente (a regra "uma equipe ativa por composição" saiu).
     Com duas, `find` devolvia a primeira da lista: a entrega ia para quem
     estivesse antes no cadastro, e a ordem do cadastro não é mérito. Duas ou
     mais: nenhuma, e a entrega fica avulsa até alguém confirmar a equipe. A
     régua é equipeDaComposicao, a mesma da apuração do servidor (F11). */
  const equipeDoRegistro = (r, salvas, resolver) => {
    const lista = Array.isArray(salvas) ? salvas : [];
    if (r && r.equipeId) return lista.find(e => e.id === r.equipeId) || null;
    /* Registro CONFIRMADO é histórico: vale só o id gravado na confirmação.
       Deduzir pela composição de hoje mudaria o passado a cada equipe nova. */
    if (r && r.confirmado) return null;
    /* A SUGESTÃO QUE VEIO NO REGISTRO (F11) manda: a apuração do servidor, ou
       o perfRegistro do aparelho, já aplicou a régua (a equipe da divisão, ou
       a da composição na O.S. sem divisão). Sem ela (registro de um servidor
       de antes da F11), a composição só vale na O.S. SEM divisão: a que tem
       divisão desatualizada ou esperando o RH não sabe aqui qual equipe a
       divisão escolheu, e deduzir pela gente poria a entrega em outra. */
    if (r && Object.prototype.hasOwnProperty.call(r, 'equipeSugerida')) {
      const s = r.equipeSugerida;
      return s && s.equipeId ? lista.find(e => e && e.id === s.equipeId) || null : null;
    }
    if (r && (r.fonte === 'alocacao-desatualizada' || r.fonte === 'alocacao-conferir-rh')) return null;
    return equipeDaComposicao(r && r.membros, lista, resolver);
  };
  /* Cópias só para exibir: o registro original (que alimenta a apuração e o
     hash do fechamento) não é tocado. O nome que aparece é o ATUAL da equipe —
     o id é quem identifica, o nome só exibe. Numa revisão FECHADA
     (`historico`), o nome e o emblema gravados no fechamento ficam; só o logo
     é buscado pelo id, porque o fechamento não o guardava. */
  const comEquipes = (registros, salvas, opcoes) => {
    const o = opcoes || {};
    const lista = Array.isArray(salvas) ? salvas : [];
    const vestir = (x, e) => ({...x, equipeId:e.id, equipeNome:e.nome, emblema:e.emblema || '🤝', logo:e.logo || '', animal:animalDe(e.animal) ? e.animal : '', cor:corValida(e.cor) ? e.cor : ''});
    return (registros || []).map(r => {
      /* DUAS EQUIPES OU MAIS NA DIVISÃO (F11): cada equipe com o nome, a logo e
         a cor de hoje; numa revisão fechada, o nome da época e só a logo. Não
         há equipe única nem dedução pela composição. Na entrega ainda não
         confirmada, cada equipe da divisão aparece marcada "sugerida". */
      if (Array.isArray(r.grupos) && r.grupos.length) {
        const marca = r.confirmado ? {} : {sugerida:true};
        return {...r, grupos:r.grupos.map(g => {
          const e = g && g.equipeId ? lista.find(q => q.id === g.equipeId) : null;
          if (!e) return {...g, ...marca};
          return o.historico ? {...g, logo:e.logo || g.logo || ''} : {...vestir(g, e), ...marca};
        })};
      }
      const e = equipeDoRegistro(r, lista, o.resolver);
      if (!e) return r;
      /* Cor e animal são de HOJE e o fechamento não os guarda: numa revisão
         fechada ficam de fora, para trocar a cor da equipe não repintar o
         mês fechado nem o PDF dele. */
      if (o.historico) return {...r, logo: e.logo || r.logo || ''};
      // A equipe que não veio de uma confirmação (a da divisão que ainda não vale, ou a da composição) é sugestão (F11): a tela diz.
      return r.equipeId ? vestir(r, e) : {...vestir(r, e), sugerida:true};
    });
  };
  /* POSIÇÃO COM EMPATE. Duas equipes com 6 entregas dividem o 1º lugar e a
     próxima é 3ª (a regra das competições). Numerar 1, 2 por ordem alfabética
     inventaria uma diferença que os números não mostram. */
  const ranquear = (linhas, medida) => {
    const ord = [...(linhas || [])].sort((a,b) => (medida(b) - medida(a)) || String(a.nome).localeCompare(String(b.nome)));
    let posicao = 0, anterior = null;
    return ord.map((l,i) => {
      const v = medida(l);
      if (v !== anterior) { posicao = i + 1; anterior = v; }
      return {...l, posicao};
    });
  };
  /* ------------------------------------------------------ AVALIAÇÃO INDIVIDUAL
   * Pedido do dono (23/09/2026): "o peso é individual, porque pode ter pessoa
   * que participa de mais entregas compartilhadas; tem que entender isso na
   * inteligência" e "a limpeza do carro e a gestão dos equipamentos têm que ter
   * peso nesse critério de avaliação".
   *
   * REGRA ATUAL (03/10/2026, porValor): valor líquido confirmado, rateado pela
   * participação de cada pessoa, comparado com o maior valor do período.
   * REGRA LEGADA (revisões antigas): PRODUÇÃO é o PESO, não a contagem. Quem está em seis entregas divididas ao
   * meio produziu três, igual a quem fez três sozinho. Contar aparições premiaria
   * quem entra em muita equipe, não quem produz. É a soma dos percentuais de
   * cada pessoa (as "O.S. equivalentes"), comparada com a de quem mais produziu
   * no período: o primeiro vale 100.
   *
   * CARRO e EQUIPAMENTOS vêm da conferência da volta, feita pela gestão na ficha
   * da O.S. (quem avalia não é quem é avaliado). Cada conferência pesa para cada
   * pessoa na mesma fração que a entrega pesou para ela: quem fez 70% da entrega
   * responde por 70% daquele carro.
   *
   * O QUE NÃO FOI CONFERIDO NÃO VIRA NOTA, NEM PASSE LIVRE. Volta sem resposta
   * conta pela média do período, volta a volta (ver COBERTURA abaixo). Zero ali
   * afirmaria carro sujo que ninguém viu; cem premiaria fugir da conferência. */
  const CRITERIOS_PADRAO = {producao:60, limpeza:20, equipamentos:20};
  const REGRA_NOTA_VALOR = 'nota-valor-1';
  const CRITERIOS = ['producao','limpeza','equipamentos'];
  /* COBERTURA MÍNIMA. Revisão de 23/09/2026: marcar só as exceções (os carros
     sujos) é o jeito natural de usar um campo que nasce em branco — e aí a
     média do período sai 0 e todo mundo tira 0, o sujo igual ao que ninguém
     olhou. Marcar só os elogios dá o contrário. Por isso o critério só entra na
     nota quando a gestão respondeu sim ou não em pelo menos 80% das voltas do
     período; abaixo disso ele fica fora da nota de TODOS e a tela diz quanto
     falta. */
  const COBERTURA_MINIMA = 0.8;
  const criteriosValidos = c => {
    const x = c && typeof c === 'object' ? c : {};
    const n = CRITERIOS.map(k => Number(x[k]));
    if (n.some(v => !Number.isInteger(v) || v < 0 || v > 100) || n.reduce((a,b)=>a+b,0) !== 100) return {...CRITERIOS_PADRAO};
    return Object.fromEntries(CRITERIOS.map((k,i)=>[k,n[i]]));
  };
  // "sim"/"nao" da ficha (ou booleano) -> true/false; qualquer outra coisa é "não conferido".
  const sn = v => v === true || v === 'sim' ? true : (v === false || v === 'nao' ? false : null);
  /* O CARRO É LIMPO E ARRUMADO. "Arrumado" entrou em 24/09/2026 com a fila da
     volta do carro ("se está arrumado etc", o Léo). Não virou critério novo: os
     pesos gravados e as revisões fechadas continuam valendo. Um "não" em
     qualquer dos dois derruba o carro daquela volta; volta antiga, só com
     "limpo", vale pelo que foi respondido. */
  const carroDaVolta = rc => {
    const l = sn(rc && rc.carroLimpo), a = sn(rc && rc.carroArrumado);
    return l === false || a === false ? false : (l || a ? true : null);
  };
  // Valor líquido já proporcional aos itens entregues: não multiplicar de novo
  // pela fração da O.S. O rateio em centavos é o mesmo do ranking de valor.
  const valoresConfirmados = registros => resumir((registros || []).filter(r => r.confirmado === true).map(r => ({...r,
    valor: !r.avisoValor && Number.isFinite(r.valor) && r.valor >= 0 ? r.valor : null,
  }))).pessoas;
  const avaliar = (registros, criterios, {porValor=false}={}) => {
    const pesos = criteriosValidos(criterios);
    const valores = porValor ? new Map(valoresConfirmados(registros).map(p => [String(p.chave), p])) : null;
    const pessoas = new Map();
    const cobertura = {limpeza:{conferidas:0,voltas:0}, equipamentos:{conferidas:0,voltas:0}};
    /* UMA VOLTA É UMA VIAGEM (performance-3, 25/09/2026). A fila Volta do
       carro confere dia + carro + equipe uma vez só, e a nota contava cada
       O.S. da viagem: três serviços pequenos com o carro sujo pesavam triplo,
       e "cobriu 12 de 40 voltas" contava O.S. Agora as O.S. da mesma volta
       (r.volta, a chave da fila) viram uma volta, e a fração de cada pessoa
       nela é a média das frações dela nas O.S. da viagem. Registro sem a
       chave (revisão fechada antes) é uma volta por O.S., a conta de antes.
       Baixa do ERP sem viagem (r.voltou === false) não entra no carro: a
       fila nunca a mostra para conferir, e ela só baixava a cobertura. */
    const voltas = new Map();
    (registros || []).forEach((r, i) => {
      if (validar(r.membros)) return;
      for (const p of r.membros) {
        const k = String(p.chave);
        const x = pessoas.get(k) || {chave:k,nome:p.nome,entregas:0,peso:0,pesoConferido:0,voltas:0,base:0,limpeza:{sim:0,total:0,n:0},equipamentos:{sim:0,total:0,n:0}};
        const f = p.percentual / 100 * (r.fracaoOS == null ? 1 : r.fracaoOS);
        x.entregas++; x.peso += f; if (r.confirmado) x.pesoConferido += f;
        pessoas.set(k, x);
      }
      if (r.voltou === false) return;
      const chave = r.volta ? 'v:' + r.volta : 'r:' + i;
      voltas.set(chave, [...(voltas.get(chave) || []), r]);
    });
    // Respostas diferentes na mesma volta: um "não" vale para a viagem.
    const daViagem = xs => xs.includes(false) ? false : (xs.includes(true) ? true : null);
    for (const g of voltas.values()) {
      const limpo = daViagem(g.map(r => carroDaVolta(r.retornoConf)));
      const equip = daViagem(g.map(r => sn(r.retornoConf && r.retornoConf.equipamentosOk)));
      cobertura.limpeza.voltas++; cobertura.equipamentos.voltas++;
      if (limpo !== null) cobertura.limpeza.conferidas++;
      if (equip !== null) cobertura.equipamentos.conferidas++;
      const frac = new Map();
      for (const r of g) for (const p of r.membros) frac.set(String(p.chave), (frac.get(String(p.chave)) || 0) + p.percentual / 100);
      for (const [k, soma] of frac) {
        const x = pessoas.get(k), f = soma / g.length;
        x.voltas++; x.base += f;
        if (limpo !== null) { x.limpeza.total += f; x.limpeza.n++; if (limpo) x.limpeza.sim += f; }
        if (equip !== null) { x.equipamentos.total += f; x.equipamentos.n++; if (equip) x.equipamentos.sim += f; }
      }
    }
    const lista = [...pessoas.values()];
    if (porValor) for (const x of lista) {
      const v = valores.get(x.chave);
      x.valorConfirmado = v && v.os > v.semValor ? v.valor : null;
      x.entregasSemValor = v?.semValor || 0;
    }
    const lider = lista.reduce((m, x) => Math.max(m, porValor ? (x.valorConfirmado ?? 0) : x.peso), 0);
    const arred = v => Math.round(v * 10) / 10;
    const duas = v => Math.round(v * 100) / 100;
    /* A MÉDIA ENTRA VOLTA A VOLTA. Antes ela só valia para quem não tinha
       NENHUMA volta conferida: quem teve 30 entregas e uma única conferência
       "não" (a 25%) ficava com 0 no período inteiro, e o colega nunca
       conferido ficava com a média. Agora cada volta sem resposta da pessoa
       conta pela média do período, na fração que ela teve naquela entrega —
       a evidência pesa o que ela vale. Quem teve tudo conferido e certo segue
       com 100. */
    const media = {}, mediaFrac = {};
    for (const k of ['limpeza', 'equipamentos']) {
      const c = cobertura[k];
      c.ok = c.voltas > 0 && c.conferidas / c.voltas >= COBERTURA_MINIMA;
      const sim = lista.reduce((t, x) => t + x[k].sim, 0), total = lista.reduce((t, x) => t + x[k].total, 0);
      mediaFrac[k] = c.ok && total > 0 ? sim / total : null;
      media[k] = mediaFrac[k] == null ? null : arred(mediaFrac[k] * 100);
    }
    for (const x of lista) {
      const comp = {producao: porValor
        ? (x.valorConfirmado == null ? null : lider > 0 ? arred(x.valorConfirmado / lider * 100) : 0)
        : lider > 0 ? arred(x.peso / lider * 100) : null};
      const imputados = [];
      for (const k of ['limpeza', 'equipamentos']) {
        if (mediaFrac[k] == null || !(x.peso > 0)) { comp[k] = null; continue; }
        // Base = o peso da pessoa nas VOLTAS (não nas O.S.); sem volta nenhuma, vale a média.
        comp[k] = x.base > 0 ? arred((x[k].sim + (x.base - x[k].total) * mediaFrac[k]) / x.base * 100) : arred(mediaFrac[k] * 100);
        if (x[k].total === 0) imputados.push(k);
      }
      let soma = 0, usado = 0; const faltam = [];
      for (const k of CRITERIOS) {
        if (!pesos[k]) continue;
        if (comp[k] == null) { faltam.push(k); continue; }
        soma += comp[k] * pesos[k]; usado += pesos[k];
      }
      x.componentes = comp;
      x.imputados = imputados;   // critérios em que a pessoa não teve nenhuma volta conferida
      x.faltam = faltam;         // critérios fora da conta (cobertura abaixo do mínimo)
      // Sem valor confirmado não se ganha nota só por carro/equipamentos.
      x.nota = porValor && pesos.producao > 0 && x.valorConfirmado == null ? null : usado > 0 ? arred(soma / usado) : null;
      // Só depois de toda a conta: arredondar antes distorceria a comparação com o líder.
      x.peso = duas(x.peso); x.pesoConferido = duas(x.pesoConferido);
    }
    return {pessoas: lista, pesos, lider: duas(lider), media, cobertura, coberturaMinima: COBERTURA_MINIMA};
  };
  /* Comparativo Geral: conserva a Nota e sua regra histórica. Produção e
     valor confirmados são normalizados antes da média, nunca se somam reais
     com O.S. Ausência de qualquer componente não vira zero nem redistribui
     o peso entre os restantes. Não altera a apuração ou os fechamentos. */
  const avaliarGeral = (registros, criterios, opcoes) => {
    const av = avaliar(registros, criterios, opcoes);
    const confirmadas = valoresConfirmados(registros);
    const porPessoa = new Map(confirmadas.map(p => [String(p.chave), p]));
    const liderProducao = confirmadas.reduce((m,p) => Math.max(m,p.equivalentes),0);
    const liderValor = confirmadas.reduce((m,p) => Math.max(m,p.os > p.semValor ? p.valor : 0),0);
    const arred = v => Math.round(v * 10) / 10;
    return {...av, pessoas:av.pessoas.map(p => {
      const v = porPessoa.get(String(p.chave));
      const componentesGeral = {
        nota:p.nota,
        producao:v && liderProducao > 0 ? arred(v.equivalentes / liderProducao * 100) : null,
        valor:v && v.os > v.semValor ? (liderValor > 0 ? arred(v.valor / liderValor * 100) : 0) : null,
      };
      const valores = Object.values(componentesGeral);
      return {...p, componentesGeral, geral:valores.every(Number.isFinite) ? arred(valores.reduce((s,n)=>s+n,0)/3) : null};
    })};
  };
  /* A MESMA PESSOA NUMA LINHA SÓ. A participação confirmada guarda a chave da
     época: quem era só apelido e depois foi ligado à ficha do RH ficava com
     duas chaves, e o ranking mostrava duas linhas com a produção dividida.
     `trocar(m)` devolve a identidade de hoje ({chave,nome}) ou nada. Dois
     apelidos da mesma pessoa na mesma entrega viram um só, com os percentuais
     somados (sem isso o validar recusaria a entrega calado). Só exibição: o
     registro guardado e o hash do fechamento não mudam. */
  const unirMembros = (membros, trocar) => {
    const por = new Map();
    for (const m of membros || []) {
      const t = trocar && trocar(m);
      const n = t ? {...m, chave:String(t.chave), nome:t.nome || m.nome} : {...m};
      const k = String(n.chave);
      const ja = por.get(k);
      if (ja) ja.percentual = Math.round((Number(ja.percentual) + Number(n.percentual)) * 100) / 100;
      else por.set(k, n);
    }
    return [...por.values()];
  };
  return {auditar,fracaoRegistro,unirMembros,unicos,iguais,ratearCentavos,validar,composicao,resumir,incluiPessoa,dossie,equipeDoRegistro,comEquipes,composicaoCom,ranquear,avaliar,avaliarGeral,valoresConfirmados,REGRA_NOTA_VALOR,criteriosValidos,carroDaVolta,CRITERIOS_PADRAO,COBERTURA_MINIMA,
    ratearGrupos,gruposDoRegistro,chavesDeEquipe,composicaoApurada,equipeDaComposicao,equipeSugeridaDe,gruposApurados,equipesDaDivisao,sugestaoApurada,
    ANIMAIS,CORES,EMBLEMAS,LOGO_ANIMAL,COR_ANIMAL,animalDe,corValida,iconeEquipe,nomeEquipeNorm,conferirEquipes};
})();
if (typeof module !== 'undefined') module.exports = PERF;

// Fonte de apuração isolada do cache operacional e dos lançamentos offline.
let perfRemoto = {chave:'',dados:null,fechamentos:[],carregando:false,erro:'',selecionado:'',tentado:false};
function perfChave(){const f=periodoOuMes('_fPerf');return f.de+'|'+f.ate;}
function perfFonteAtual(){
  if(perfRemoto.chave!==perfChave())return null;
  return perfRemoto.selecionado?perfRemoto.fechamentos.find(x=>x.id===perfRemoto.selecionado):perfRemoto.dados;
}
function perfLista(){
  const fonte=perfFonteAtual();
  if(!fonte)return perfConsultaServidor()?[]:classificarEntregas(STORE.getAllOS()).instalacoes;
  return fonte.registros.map(r=>({id:r.id,numero:r.numero,cliente:r.cliente,finalizadaEm:r.dia,equipe:r.membros.map(p=>OPERACAO.ehIdPessoa(p.chave)?p.chave:p.nome),retrabalho:r.retrabalho,_perf:r}));
}
function perfOS(id){return perfLista().find(o=>o.id===id) || STORE.getOS(id);}
/* A apuração do servidor é só da gestão do PCP (o pcp-sync recusa os outros
   papéis). Para montagem e operação a tela era um alerta vermelho permanente
   e um botão que sempre falhava; agora é uma prévia dita como prévia. */
function perfConsultaServidor(){return typeof STATE==='undefined' || ['admin','pcp'].includes(String(STATE.user?.papel || ''));}
// Erro de rede do navegador e tempo esgotado em português; mensagem termina com ponto.
function perfErroTxt(e){const m=String(e && e.message || '');if(!m || e?.name==='TypeError' || e?.name==='AbortError' || /failed to fetch|load failed|networkerror|network request|abort|timeout|timed out/i.test(m))return 'Sem conexão com o servidor. Tente de novo.';return /[.!?]$/.test(m)?m:m+'.';}
function perfFonteTexto(){const f=perfFonteAtual();if(!f && !perfConsultaServidor())return 'Prévia do aparelho. A apuração oficial é feita pela gestão do PCP.';return f?(f.fechadoEm?'Fechamento preservado · revisão '+f.revisao+' · '+f.fechadoPor+' · '+new Date(f.fechadoEm).toLocaleString('pt-BR'):'Base compartilhada do PCP · consultada em '+new Date(f.consultadoEm).toLocaleString('pt-BR'))+'. '+f.fonte:'Prévia local incompleta. Aguarde a consulta ao servidor antes de apurar.';}
/* ------------------------------------------------------ BASE E FECHAMENTO
 * Revisão de experiência (29/09/2026, pedido do dono: "olhar como um
 * especialista ... e o ranking ficar top"). A página abria pelo encanamento
 * (versão, Atualizar, Fechar período) e o ranking vinha depois. Agora a base
 * mora NO FIM, num quadro recolhível que lembra se ficou aberto, e o que ela
 * tem de urgente (mudança depois da consulta, alteração presa no aparelho,
 * erro) sobe para a faixa de qualidade dos dados, no topo (perfCoberturaHTML).
 * Os ids de antes (perf-atualizar-fonte, perf-versao, perf-fechar) continuam:
 * a fiação e os testes dependem deles.
 *
 * FECHAR NÃO É MAIS O BOTÃO AZUL DO TOPO. Com entrega sem confirmação o
 * fechamento é recusado; o botão principal convidava a um clique que só dava
 * erro. Agora é secundário e, quando não pode, fica desligado com o motivo
 * escrito ao lado: as mesmas travas que o clique confere (o clique continua
 * conferindo, porque a tela pode estar velha).
 */
/* Conferir voltas (ou mexer numa O.S.) depois da consulta não muda a nota
   até nova consulta; sem este aviso parecia que a conferência não contou.
   Só conta O.S. finalizada no período apurado e mexida por gente: a
   importação do ERP e um card aberto de outro mês acendiam o aviso a cada
   hora, e aviso sempre ligado ninguém lê. */
function perfMudouDepois(f){
 const per=periodoOuMes('_fPerf'),consulta=Date.parse(f?.consultadoEm || '');
 return !!f && !f.fechadoEm && Number.isFinite(consulta) && (STORE.getAllOS?.() || []).some(o=>o.finalizadaEm && OPERACAO.emIntervalo(o.finalizadaEm,per.de,per.ate) && !/^Mubisys/i.test(String(o.atualizadoPor || '')) && Date.parse(o.atualizadoEm || '')>consulta);
}
/* OS AVISOS DA BASE, num lugar só: a faixa do topo (comAcao: com o botão de
   atualizar e o role="alert", para o leitor de tela ouvir uma vez) e o quadro
   Base e fechamento (sem os dois). */
function perfAvisosHTML(comAcao){
 if(!perfConsultaServidor())return `<p class="perf-aviso neutro">${esc(perfFonteTexto())}</p>`;
 const f=perfFonteAtual(),pendentes=STORE.getQueue?.().length || 0,out=[];
 const atualizar=comAcao && !perfRemoto.carregando?' <button type="button" class="btn-ghost btn-sm" data-perf-atualizar>Atualizar apuração</button>':'';
 // Sem a base do servidor, a faixa diz que o que se vê é prévia (o quadro já diz na primeira linha).
 if(comAcao && !f && perfRemoto.carregando)out.push('<p class="perf-aviso neutro">Consultando a apuração no servidor…</p>');
 else if(comAcao && !f && !perfRemoto.erro)out.push(`<p class="perf-aviso neutro">${esc(perfFonteTexto())}</p>`);
 if(perfMudouDepois(f))out.push(`<p class="perf-aviso">Houve mudanças nas O.S. depois desta consulta (voltas conferidas, por exemplo). Toque em Atualizar apuração para a nota contar com elas.${atualizar}</p>`);
 if(pendentes)out.push(`<p class="perf-aviso">${pendentes} alterações locais aguardam sincronização. O servidor ainda pode não conter essas alterações.</p>`);
 if(perfRemoto.erro)out.push(`<p class="perf-aviso erro"${comAcao?' role="alert"':''}>${esc(perfRemoto.erro)}${atualizar}</p>`);
 return out.join('');
}
// Por que o Fechar está desligado, em uma frase. Vazio = pode fechar.
function perfFechamentoBloqueio(f,pendentes){
 if(perfRemoto.carregando)return 'Consultando o servidor.';
 if(!f)return 'A apuração do servidor ainda não chegou. Toque em Atualizar apuração.';
 if(f.fechadoEm)return 'Você está vendo uma revisão fechada. Para criar outra, escolha Dados atuais em Versão da apuração.';
 if(pendentes)return `${pendentes} ${pendentes===1?'alteração deste aparelho aguarda':'alterações deste aparelho aguardam'} sincronização.`;
 const regs=Array.isArray(f.registros)?f.registros:[];
 if(!regs.length)return 'Nenhuma entrega no período para fechar.';
 const hoje=perfHojeISO();
 if(String(f.periodo?.ate || '')>hoje)return `O fechamento vai no máximo até hoje (${hoje.split('-').reverse().join('/')}). Escolha um período que termine hoje ou antes.`;
 const conflitos=regs.filter(r=>r.avisoValor);
 if(conflitos.length)return `Confira os valores conflitantes no ERP antes de fechar (O.S. ${[...new Set(conflitos.map(r=>r.numero||'s/n'))].slice(0,6).join(', ')}). Veja as pendências da auditoria.`;
 const pend=regs.filter(r=>!r.confirmado).length,semValor=regs.filter(r=>r.valor==null);
 if(!pend && !semValor.length)return '';
 return 'Para fechar, falta: '+[pend?`${pend} ${pend===1?'entrega sem participação confirmada':'entregas sem participação confirmada'}`:'',semValor.length?`${semValor.length} sem valor (O.S. ${semValor.slice(0,6).map(r=>r.numero || 's/n').join(', ')}${semValor.length>6?' e outras':''})`:''].filter(Boolean).join('; ')+'. Use o filtro Situação da lista para achar cada uma.';
}
function perfFonteHTML(){
 const f=perfFonteAtual(),pendentes=STORE.getQueue?.().length || 0;
 // Aberto ou fechado como a pessoa deixou (a mesma memória dos outros quadros da casa).
 const aberto=typeof quadroAberto==='function' && quadroAberto('perf-base',false);
 const quadro=(titulo,corpo)=>`<details class="casa-quadro perf-base" data-quadro="perf-base"${aberto?' open':''}><summary>${titulo}</summary><div class="casa-quadro-corpo">${corpo}</div></details>`;
 if(!perfConsultaServidor())return quadro('🗂 Base da apuração',`<p class="perf-base-fonte">${esc(perfFonteTexto())}</p>`);
 const pode=perfPodeEditar(),bloqueio=pode?perfFechamentoBloqueio(f,pendentes):'';
 return quadro('🗂 Base e fechamento <small>atualizar, versão e fechar período</small>',`<p class="perf-base-fonte">${esc(perfFonteTexto())}</p>${perfAvisosHTML(false)}
   <div class="perf-base-acoes"><button type="button" class="btn-ghost" id="perf-atualizar-fonte" ${perfRemoto.carregando?'disabled':''}>${perfRemoto.carregando?'Consultando servidor…':'Atualizar apuração'}</button><label>Versão da apuração <select id="perf-versao"><option value="">Dados atuais</option>${perfRemoto.fechamentos.map(r=>`<option value="${esc(r.id)}" ${r.id===perfRemoto.selecionado?'selected':''}>Revisão ${r.revisao} · ${esc(r.fechadoEm.slice(0,10))} · ${esc(r.fechadoPor)}</option>`).join('')}</select></label>${pode?`<button type="button" class="btn-ghost" id="perf-fechar" ${bloqueio?'disabled aria-describedby="perf-fechar-motivo"':''}>${perfRemoto.fechamentos.length?'Criar nova revisão':'Fechar período'}</button>`:''}</div>
   ${bloqueio?`<p class="perf-fechar-motivo" id="perf-fechar-motivo">${esc(bloqueio)}</p>`:''}${f?.motivo?`<p class="perf-base-fonte">Motivo: ${esc(f.motivo)}</p>`:''}${pode&&typeof perfComissaoBotaoHTML==='function'?perfComissaoBotaoHTML():''}<p class="metricas-nota">Cada revisão preserva datas, participantes, percentuais e valores. Uma nova revisão não apaga a anterior. Fechar não calcula nem paga bonificação.</p>`);
}
async function perfCarregarFonte(){
 const chave=perfChave(),f=periodoOuMes('_fPerf');
 if(perfRemoto.chave===chave && perfRemoto.carregando)return;
 const pedido={chave,dados:null,fechamentos:[],carregando:true,erro:'',selecionado:'',tentado:true};perfRemoto=pedido;
 renderPerformanceCasa();
 try{
   if(!f.de||!f.ate)throw new Error('Selecione as datas inicial e final para consultar a base completa.');
   // A configuração vem junto: os pesos da nota na tela têm de ser os que o fechamento vai selar.
   const [dados,historico]=await Promise.all([STORE.api({action:'performancePeriodo',...f,notaPorValor:true}),STORE.api({action:'performanceFechamentos',...f}),typeof STORE.pullCFG==='function'?STORE.pullCFG().catch(()=>false):null]);
   if(!dados?.completo || !Array.isArray(dados.registros) || !Array.isArray(historico?.fechamentos))throw new Error(dados?.error||historico?.error||'Consulta incompleta. O fechamento permanece indisponível.');
   pedido.dados=dados;pedido.fechamentos=historico.fechamentos;
 }catch(e){pedido.erro=perfErroTxt(e);}
 finally{pedido.carregando=false;if(perfRemoto===pedido && perfChave()===chave)renderPerformanceCasa();}
}
function perfWireFonte(el){
 if(typeof perfComissaoWire==='function')perfComissaoWire(el);
 const atualizar=el.querySelector('#perf-atualizar-fonte');if(atualizar)atualizar.onclick=perfCarregarFonte;
 const versao=el.querySelector('#perf-versao');if(versao)versao.onchange=()=>{perfRemoto.selecionado=versao.value;renderPerformanceCasa();};
 const fechar=el.querySelector('#perf-fechar');if(fechar)fechar.onclick=()=>{
   const fonte=perfFonteAtual();if(!fonte || fonte.fechadoEm || STORE.getQueue().length)return;
   // Diz QUAIS travam: com tudo confirmado, uma O.S. sem valor travava o fechamento sem nome.
   const pend=fonte.registros.filter(r=>!r.confirmado),semValor=fonte.registros.filter(r=>r.valor==null);
   if(!fonte.registros.length)return toast('Nenhuma entrega no período para fechar.','error');
   // O servidor recusa fechar um período que ainda não terminou: avisa antes de abrir a confirmação.
   if(String(fonte.periodo?.ate || '')>perfHojeISO())return toast(`O fechamento vai no máximo até hoje (${perfHojeISO().split('-').reverse().join('/')}). Escolha um período que termine hoje ou antes.`,'error');
   if(pend.length || semValor.length)return toast([pend.length?`${pend.length} ${pend.length===1?'entrega sem participação confirmada':'entregas sem participação confirmada'}`:'',semValor.length?`${semValor.length} sem valor: O.S. ${semValor.slice(0,6).map(r=>r.numero || 's/n').join(', ')}${semValor.length>6?' e outras':''}`:''].filter(Boolean).join('. ')+'. Use o filtro Situação da lista para achar cada uma.','error');
   // Quem fecha sela os pesos do SERVIDOR. Se o aparelho mostra outros (alguém
   // mudou em outro tablet), o ranking visto não é o que seria selado.
   if(fonte.criterios && JSON.stringify(PERF.criteriosValidos(fonte.criterios))!==JSON.stringify(perfCriterios())){perfRemoto.dados=null;perfRemoto.tentado=false;renderPerformanceCasa();return toast('Os pesos da nota mudaram. Atualize e confira o ranking antes de fechar.','error');}
   if(fonte.regraNota!==PERF.REGRA_NOTA_VALOR)return toast('Atualize a apuração antes de fechar: a nota agora usa o valor entregue confirmado. Se o aviso continuar, a atualização do servidor ainda não chegou.','error');
   const d=perfDialog('Conferir fechamento',`<p>${esc(fonte.periodo.de)} a ${esc(fonte.periodo.ate)} · ${fonte.registros.length} entregas. A cópia será preservada no servidor.</p><form><label>Motivo do fechamento ou revisão <textarea name="motivo" minlength="5" maxlength="500" required></textarea></label><p>As revisões anteriores continuarão disponíveis. Não há lançamento de pagamento.</p><button class="btn-primary" type="submit">Confirmar fechamento</button><p role="alert" id="perf-fechar-erro"></p></form>`);
   const requestId=STORE.uuid(),anterior=perfRemoto.fechamentos[0]?.id || '';
   d.querySelector('form').onsubmit=async ev=>{
     ev.preventDefault();const btn=d.querySelector('[type="submit"]');btn.disabled=true;
     try{if(STORE.getQueue().length)throw new Error('Há alterações aguardando envio. Sincronize e atualize a apuração.');
       // leGrupos: esta tela lê a O.S. dividida entre duas equipes (F11); sem a marca, o servidor recusa fechar período que tem `grupos`.
       const r=await STORE.api({action:'performanceFechar',...fonte.periodo,hash:fonte.hash,anterior,requestId,motivo:new FormData(ev.target).get('motivo'),leGrupos:true,leEntregasItens:true,notaPorValor:true});
       /* O 409 (a base mudou desde a consulta, ou outra revisão foi criada) é a
          única recusa que STORE.api devolve em vez de lançar. Fechar de novo
          com o mesmo hash daria o mesmo 409, e o "Atualizar apuração" mora no
          quadro recolhido: a tela recarrega a apuração sozinha e pede para
          conferir e fechar de novo, como quando os pesos mudam. */
       if(r && !r.ok && !r.fechamento){
         d.close();await perfCarregarFonte();
         toast(perfRemoto.erro?'Os dados mudaram desde a consulta e a apuração não foi recarregada: '+perfRemoto.erro:'Os dados mudaram desde a consulta. A apuração foi atualizada: confira e feche de novo.','error');
         return;
       }
       if(!r?.ok||!r.fechamento)throw new Error(r?.error || 'Não foi possível confirmar o fechamento.');
       d.close();await perfCarregarFonte();if(perfRemoto.chave===fonte.periodo.de+'|'+fonte.periodo.ate){perfRemoto.selecionado=r.fechamento.id;renderPerformanceCasa();}toast('Fechamento preservado no servidor.','success');
     }catch(e){d.querySelector('#perf-fechar-erro').textContent=e.message;}finally{btn.disabled=false;}
   };
 };
 if(typeof STORE.api==='function' && perfConsultaServidor() && (perfRemoto.chave!==perfChave() || !perfRemoto.tentado))void perfCarregarFonte();
}

// Emblemas de antes das equipes fixas: continuam aceitos e exibidos na equipe antiga.
const PERF_EMBLEMAS = PERF.EMBLEMAS;
function perfConfig() {
  const c = STORE.getCFG().performancePCP || {};
  const base = {equipes:Array.isArray(c.equipes)?c.equipes:[],participacoes:Array.isArray(c.participacoes)?c.participacoes:[]};
  // Os pesos da nota viajam juntos: sem isto, salvar uma equipe apagaria os pesos.
  if (c.criterios) base.criterios = c.criterios;
  return base;
}
/* A CHAVE DA PESSOA É O ID DO RH (F06, 29/09/2026). Até a v133 a chave era o
   slug da ficha ('carla-lima'), e o servidor compara pelo ID de 6 dígitos:
   a mesma pessoa em dois formatos virava duas. Sem ID (terceiro sem ficha),
   fica a chave de antes, o próprio nome. */
function perfPessoa(n) { const p = nomeExibicaoCasa(n); const id = /^\d{6}$/.test(String(p.id || '')) ? String(p.id) : ''; return {chave:id || String(p.chave),nome:p.nome,apelido:n}; }
/* O ID DE HOJE DE UM MEMBRO GRAVADO (equipe ou participação). A equipe salva
   até a v133 guarda o slug da ficha ou o apelido; a leitura aceita os dois.
   Slug vai pela própria ficha (a mesma pessoa, sem adivinhar). Apelido só é
   resolvido quando a chave É o apelido (ou o nome): chave de ficha de quem
   saiu do elenco nunca é resolvida pelo nome, senão iria parar num xará.
   O SLUG DE QUEM SAIU (F11): a equipe salva pela aba v133 guarda o slug, e a
   pessoa pode ter saído depois. O servidor procura o slug em todas as fichas
   (idDoMembro, com quem saiu); o aparelho procura também nos `antigos` do
   elenco (quem saiu, só para admin e pcp), senão a mesma equipe era sugerida
   num lado e não no outro. */
function perfIdMembro(m) {
  const k = String(m && m.chave != null ? m.chave : '').trim();
  if (!k || /^\d{6}$/.test(k)) return k;
  const rh = typeof pessoasRH === 'function' ? pessoasRH() : [];
  const doSlug = p => p && String(p.chave) === k && /^\d{6}$/.test(String(p.id || ''));
  let ficha = rh.find(doSlug);
  if (!ficha) {
    let antigos = [];
    try { const el = typeof STORE !== 'undefined' && STORE && typeof STORE.elenco === 'function' ? STORE.elenco() : null; antigos = el && Array.isArray(el.antigos) ? el.antigos : []; } catch (e) { antigos = []; }
    ficha = antigos.find(doSlug);
  }
  if (ficha) return String(ficha.id);
  if (k !== String((m && (m.apelido || m.nome)) || '')) return k;
  const p = perfPessoa(m.apelido || m.nome || k);
  return /^\d{6}$/.test(p.chave) ? p.chave : k;
}
// Classe da cor da equipe, só para chave da paleta (nunca style=, nunca texto livre).
function perfCorClasse(e) { return e && PERF.corValida(e.cor) ? ` perf-cor-${e.cor} perf-com-cor` : ''; }
// Chave de ficha do RH fica como está (resolver pelo nome completo pode não
// achar a ficha); chave de apelido é trocada pela identidade de hoje.
function perfChaveDeHoje(m) {
  const k = String(m && m.chave || '');
  // Só a chave de APELIDO é trocada (ela é igual ao próprio apelido, ou ao nome
  // em registro antigo). Chave de ficha nunca é: a de quem saiu do elenco iria
  // parar em outra pessoa que hoje responde pelo mesmo apelido.
  const rh = typeof pessoasRH === 'function' ? pessoasRH() : [];
  // Slug da ficha (participação gravada até a v133) vira o ID da mesma ficha.
  const ficha = rh.find(p => String(p.chave) === k && /^\d{6}$/.test(String(p.id || '')) && String(p.id) !== k);
  if (ficha) { const p = perfPessoa(String(ficha.id)); return {...p, chave:String(ficha.id)}; }
  if (k !== String((m && (m.apelido || m.nome)) || '')) return null;
  if (rh.some(p => String(p.chave) === k || String(p.id) === k)) return null;
  const p = perfPessoa(m.apelido || m.nome || k);
  return p.chave === k ? null : p;
}
/* "Carro limpo 0" precisa dizer DE QUAL volta veio: a conferência aparece em
   cada entrega da lista e no detalhe da O.S. Texto curto e sem ambiguidade,
   porque a busca da lista filtra por ele ("carro não" acha os carros sujos). */
function perfVoltaTxt(rc) {
  const v = x => x === 'sim' || x === true ? 'sim' : (x === 'nao' || x === false ? 'não' : 'sem resposta');
  const c = rc || {};
  const avaria = c.semAvaria === 'nao' || c.semAvaria === false ? ' · ⚠️ avaria' : '';
  return `🚗 limpo ${v(c.carroLimpo)} · 📦 arrumado ${v(c.carroArrumado)} · 🧰 equip. ${v(c.equipamentosOk)}${avaria}`;
}
/* Os integrantes de uma equipe salva, pelo ID de hoje. O servidor guarda a
   chave como veio (a aba v133 grava o slug da ficha): quem desenha as caixas
   converte, senão a mesma pessoa aparecia duas vezes (slug marcado e ID). */
function perfMembrosDeHoje(ms) { return PERF.unicos((ms || []).map(m => { const k = perfIdMembro(m); return k === String(m.chave) ? {...m} : {...m, chave:k}; })); }
function perfUnirPessoas(regs) { return (regs || []).map(r => ({...r, membros: PERF.unirMembros(r.membros, perfChaveDeHoje)})); }
function perfEquipeOS(os) { return PERF.unicos(OPERACAO.equipe(os).map(perfPessoa)); }
function perfParticipacaoVale(os, p) {
  if (!p) return null;
  if (os.alocacao && typeof os.alocacao === 'object' && !Array.isArray(os.alocacao)) return null;
  const log = Array.isArray(os.alocacaoLog) ? os.alocacaoLog.filter(e => e && typeof e === 'object') : [];
  const ultima = log.length ? String(log[log.length - 1].em || '') || '9999' : (Object.prototype.hasOwnProperty.call(os, 'alocacao') ? '9999' : '');
  return !ultima || String(p.em || '') > ultima ? p : null;
}
function perfRegistro(os,c) {
  if(os._perf)return {...os._perf,os,membros:os._perf.confirmado?os._perf.membros:os._perf.membros.map(p=>({...perfPessoa(OPERACAO.ehIdPessoa(p.chave)?p.chave:p.nome),percentual:p.percentual}))};
  if (os.conferenciasEntrega?.length) return {id:os.id,os,membros:[],valor:null,confirmado:false,fonte:'conferencia-servidor',retornoConf:null};
  const extra = {retornoConf:os.retornoConf || null,voltou:typeof OPERACAO.voltou==='function'?OPERACAO.voltou(os):undefined,volta:typeof OPERACAO.chaveDaVolta==='function'?OPERACAO.chaveDaVolta(os):''};
  /* A DIVISÃO DENTRO DA O.S. (F08) vem primeiro, com a mesma régua do
     servidor (perfFonte): confirmada só quando é válida, não está
     desatualizada e tem a mesma gente de os.equipe. O percentual é o final do
     motor. Desatualizada ou inválida: sugestão pela equipe da O.S., nunca
     confirmada. Sem divisão, a participação antiga continua valendo (leitura).
     divisao.js só existe no index.html: sem ele, fica a regra antiga. */
  const aloc = os.alocacao && typeof os.alocacao === 'object' && !Array.isArray(os.alocacao) ? os.alocacao : null;
  /* A SUGESTÃO DE EQUIPE (F11) vai no registro que não está confirmado, pela
     régua da apuração (PERF.sugestaoApurada, a mesma do servidor): com
     divisão na O.S., a equipe que a divisão escolheu (duas ou mais em
     `grupos`); sem divisão, a única equipe ativa daquela composição. */
  const comSugestao = (r, divisao) => r.confirmado ? r : {...r, ...PERF.sugestaoApurada(r.membros, divisao, divisao ? DIVISAO.finais(divisao) : [], c.equipes, perfIdMembro)};
  if (aloc && typeof DIVISAO !== 'undefined' && DIVISAO && typeof DIVISAO.alocacaoConfirmada === 'function') {
    if (DIVISAO.alocacaoConfirmada(os)) {
      const finais = DIVISAO.finais(aloc);
      const membros = finais.filter(f => f.cota > 0).map(f => ({...perfPessoa(f.pessoaId), percentual:f.cota / 100}));
      /* AS EQUIPES DA DIVISÃO (F11), pela régua do servidor (equipesDaDivisao).
         Divisão de uma equipe: ela é a equipe do registro. Duas ou mais (mesmo
         com uma em 0%): vão em `grupos`, cada uma com a sua cota, e o registro
         fica sem equipe única. */
      const d = PERF.equipesDaDivisao(aloc, finais, c.equipes);
      const um = d.unica;
      return comSugestao({id:os.id,os,membros,valor:valorDaOS(os),confirmado:!PERF.validar(membros),fonte:'alocacao',equipeId:um ? um.equipeId : '',equipeNome:um ? um.equipeNome : '',emblema:um ? um.emblema : '🤝',por:aloc.por || '',em:aloc.em || '',...extra,...(d.grupos ? {grupos:d.grupos} : {})}, aloc);
    }
    return comSugestao({id:os.id,os,membros:PERF.iguais(perfEquipeOS(os)),valor:valorDaOS(os),confirmado:false,fonte:aloc.conferirRH === true ? 'alocacao-conferir-rh' : 'alocacao-desatualizada',...extra}, aloc);
  }
  /* A participação do blob só vale na O.S. que nunca teve divisão, ou quando
     foi confirmada DEPOIS da última mudança da divisão: a divisão limpa de
     propósito (alocacao null, com histórico) não ressuscita a conferência
     velha, fica como sugestão. A mesma conta do servidor (perfFonte). */
  const salvo = perfParticipacaoVale(os, c.participacoes.find(p=>p.id===os.id));
  // Um registro confirmado mantém a composição e o nome da época.
  const membros = salvo ? salvo.membros : PERF.iguais(perfEquipeOS(os));
  // voltou e volta: os mesmos da base do servidor (perfFonte) e da fila Volta do carro.
  // Conferido com typeof: aba com operacao.js antigo em cache não pode derrubar a tela.
  return comSugestao({...(salvo || {}),id:os.id,os,membros,valor:valorDaOS(os),confirmado:!!salvo && !PERF.validar(membros),fonte:salvo ? 'participacao' : 'sugestao',...extra}, null);
}
async function perfSalvar(c) {
  const cfg = STORE.getCFG(); cfg.performancePCP = c; STORE.saveCFG(cfg);
  perfRemoto.dados=null;perfRemoto.erro='Alteração local: aguardando sincronização e nova consulta.';
  toast('Alteração salva no aparelho; sincronizando com o servidor.','success');
  try{await STORE.trySync();if(!STORE.getQueue().length)await perfCarregarFonte();}catch(e){perfRemoto.erro='Alteração guardada no aparelho. Sincronize e atualize a apuração.';}

}
function perfPodeEditar() { return ['admin','pcp'].includes(STATE.user?.papel) && (typeof podeEditar !== 'function' || podeEditar()); }
function perfFormato(n) { return Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2}); }
function perfDialog(titulo,corpo) {
  let d = document.getElementById('perf-dialog');
  if (!d) {d=document.createElement('dialog');d.id='perf-dialog';document.body.appendChild(d);}
  d.classList?.remove('comissao-dialog');
  d.innerHTML=`<div class="perf-dialog-head"><h2 id="perf-dialog-titulo">${esc(titulo)}</h2><button type="button" class="btn-ghost" aria-label="Fechar edição">✕</button></div>${corpo}`;
  d.querySelector('[aria-label="Fechar edição"]').onclick=()=>d.close(); d.setAttribute?.('aria-labelledby','perf-dialog-titulo'); const foco=document.activeElement; d.addEventListener?.('close',()=>{if(foco?.isConnected)foco.focus();},{once:true}); d.showModal(); return d;
}
/* A equipe fixa usa o mesmo catálogo da escala da O.S.: RH completo,
   contratos ativos e bloqueios de identidade. A lista antiga de instaladores
   sozinha omitia quem acabou de entrar. Não altera vínculos nem histórico. */
function perfOpcoesMembros(membros) {
  const selecionados = new Map((membros || []).map(m => [String(m.chave), m]));
  const opcoes = opcoesEquipe([...selecionados.keys()]);
  const vistos = new Set(), out = [];
  for (const p of opcoes) {
    const chave = String(p.valor || p.chave || p.rh || '');
    const ficha = OPERACAO.pessoaDe(p.valor);
    if (ficha && ficha.ativo === false && !selecionados.has(chave)) continue;
    const identidade = p.bloqueio && !selecionados.has(chave) ? String(p.rh || chave) : chave;
    if (!chave || vistos.has(identidade)) continue;
    vistos.add(identidade);
    out.push({chave, nome:p.completo || p.nome, apelido:p.apelido || p.nome,
      freelancer:!!p.freelancer, bloqueio:p.bloqueio || '', selecionado:selecionados.has(chave)});
  }
  // Guarda também os membros legados/inativos, sem decidir por um homônimo.
  for (const m of membros || []) if (!out.some(p => p.chave === String(m.chave))) {
    out.push({...m, chave:String(m.chave), selecionado:true, bloqueio:''});
  }
  return out.sort((a,b) => Number(b.selecionado)-Number(a.selecionado) || String(a.nome).localeCompare(String(b.nome),'pt-BR'));
}
function perfMembrosListaHTML(membros) {
  return perfOpcoesMembros(membros).map(p => `<label class="perf-member" data-busca="${esc([p.nome,p.apelido,p.chave].join(' '))}"><input type="checkbox" name="membro" value="${esc(p.chave)}" data-nome="${esc(p.nome)}" data-apelido="${esc(p.apelido || p.nome)}" ${p.selecionado?'checked':''} ${p.bloqueio&&!p.selecionado?'disabled':''}><span>${esc(p.nome)}${p.freelancer?' <small class="perf-membro-freelancer">Freelancer</small>':''}${p.bloqueio?`<small class="perf-membro-pendencia">${esc(p.bloqueio)}</small>`:''}</span></label>`).join('');
}
function perfEscolherMembrosHTML(membros) {
  return `<section class="perf-membros-rh"><div class="perf-membros-topo"><strong>Integrantes · RH e freelancers</strong><button type="button" class="btn-ghost btn-sm" data-perf-atualizar-rh>Atualizar pessoas</button></div><label>Buscar pessoa <input type="search" data-perf-busca placeholder="Nome, apelido ou ID"></label><small data-perf-rh-status role="status">Inclui novos funcionários e contratos de freelancer ativos do RH.</small><div class="perf-members">${perfMembrosListaHTML(membros)}</div><p data-perf-sem-pessoas hidden>Nenhuma pessoa encontrada. Atualize a lista ou confira o cadastro no RH.</p></section>`;
}
function perfWireBusca(box) {
  const busca=box.querySelector('[data-perf-busca]');
  if(busca) busca.oninput=()=>{
    let encontrados=0;
    box.querySelectorAll('.perf-member').forEach(n=>{
      const bate=normCasa(n.dataset.busca || n.textContent).includes(normCasa(busca.value));
      n.hidden=!n.querySelector('input').checked && !bate;
      if(bate) encontrados++;
    });
    const vazio=box.querySelector('[data-perf-sem-pessoas]');
    if(vazio) vazio.hidden=encontrados>0;
  };
}
async function perfAtualizarMembrosRH(box, depois) {
  const btn=box.querySelector('[data-perf-atualizar-rh]'), nota=box.querySelector('[data-perf-rh-status]');
  if(!btn || btn.disabled) return;
  if(typeof navigator!=='undefined' && navigator.onLine===false) {nota.textContent='Sem internet: mostrando a lista já carregada. Tente atualizar quando a conexão voltar.';return;}
  btn.disabled=true;nota.textContent='Conferindo funcionários e freelancers no RH…';
  const lista=box.querySelector('.perf-members');
  try {
    const ok=await STORE.pullElenco(true,{semCache:true});
    // Outro formulário pode ter substituído este enquanto a leitura rodava.
    if(!box.open || box.querySelector('.perf-members')!==lista) return;
    if(!ok) throw new Error('Não foi possível atualizar. A lista e as escolhas foram mantidas; tente novamente.');
    if(OPERACAO.esquecerPessoas) OPERACAO.esquecerPessoas();
    // Lê depois da resposta para manter também mudanças feitas durante a carga.
    const marcados=perfMarcados(box);
    lista.innerHTML=perfMembrosListaHTML(marcados);
    perfWireBusca(box);box.querySelector('[data-perf-busca]').oninput();
    depois();nota.textContent='Lista atualizada do RH. Suas escolhas foram mantidas.';
  } catch(e) {
    if(box.open && box.querySelector('.perf-members')===lista) nota.textContent=e.message || 'Não foi possível atualizar a lista do RH.';
  } finally {btn.disabled=false;}
}
function perfMarcados(box) { return [...box.querySelectorAll('input[name="membro"]:checked')].map(e=>({chave:e.value,nome:e.dataset.nome,apelido:e.dataset.apelido})); }
/* A PESSOA EM DUAS EQUIPES ATIVAS (F06). Não trava: as equipes fixas podem
   dividir gente enquanto o cadastro é arrumado. Mas é dito, na tela e pelo
   servidor, para ninguém descobrir só no ranking. */
function perfAvisoEmDuas(equipes, id) {
  const eq = (equipes || []).find(x => x.id === id);
  if (!eq || eq.ativo === false) return '';
  const {pessoasEmDuas} = PERF.conferirEquipes(equipes, perfIdMembro);
  const partes = [];
  for (const [pid, ids] of pessoasEmDuas) {
    if (!ids.includes(id)) continue;
    const m = (eq.membros || []).find(x => perfIdMembro(x) === pid);
    const outras = ids.filter(x => x !== id).map(x => ((equipes || []).find(q => q.id === x) || {}).nome).filter(Boolean);
    partes.push(`${m ? m.nome : pid} também está em ${outras.join(', ')}`);
  }
  return partes.length ? `Atenção: ${partes.join('; ')}. A mesma pessoa em duas equipes ativas: confira o cadastro.` : '';
}
/* ------------------------------------------------ EQUIPE FIXA (F06)
 * Nome, animal, cor, líder e integrantes. O animal e a cor vêm de listas
 * fechadas (PERF.ANIMAIS, PERF.CORES) que o servidor confere de novo; a cor é
 * uma chave da paleta, pintada por classe. Líder é o ID do RH de um dos
 * integrantes. A tela grava SEMPRE os três campos (vazio quando não há): o
 * servidor lê campo ausente como aba antiga (v133) e preserva o que havia.
 */
function perfEditarEquipe(id,membrosIniciais=[]) {
  if(!perfPodeEditar()) return;
  const c=perfConfig(), e=c.equipes.find(e=>e.id===id) || {nome:'',emblema:'🤝',membros:membrosIniciais};
  /* A LEITURA ACEITA A CHAVE ANTIGA: equipe salva até a v133 guarda o slug do
     RH ou o apelido. Aqui cada membro já abre pelo ID de hoje, para marcar a
     caixa certa e para o líder ser escolhido entre IDs. */
  const membrosDeHoje=perfMembrosDeHoje(e.membros);
  let logo = perfLogoValido(e.logo) ? e.logo : '';
  const animalAtual=PERF.animalDe(e.animal)?e.animal:'', corAtual=PERF.corValida(e.cor)?e.cor:'';
  const ehId=v=>/^\d{6}$/.test(String(v||''));
  const d=perfDialog(id?'Editar equipe':'Criar equipe',`<form id="perf-equipe-form">
    <label>Nome da equipe <input name="nome" maxlength="60" required value="${esc(e.nome)}" placeholder="Ex.: Águia, Leão, Pantera"></label>
    <fieldset class="perf-animais"><legend>Animal da equipe</legend>${PERF.ANIMAIS.map(a=>`<label><input type="radio" name="animal" value="${esc(a.id)}" required ${a.id===animalAtual?'checked':''}><span>${PERF.LOGO_ANIMAL[a.id]?`<img class="perf-animal-logo" src="${esc(PERF.LOGO_ANIMAL[a.id])}" alt="" loading="lazy">`:`<b aria-hidden="true">${esc(a.icone)}</b>`}${esc(a.rotulo)}</span></label>`).join('')}</fieldset>
    <fieldset class="perf-cores"><legend>Cor da equipe</legend>${PERF.CORES.map(k=>`<label class="perf-cor-${esc(k.id)}"><input type="radio" name="cor" value="${esc(k.id)}" required ${k.id===corAtual?'checked':''}><span><i class="perf-cor-amostra" aria-hidden="true"></i>${esc(k.rotulo)}</span></label>`).join('')}</fieldset>
    <fieldset class="perf-logo-campo"><legend>Logo da equipe</legend>
      <div class="perf-logo-linha">
        <span id="perf-logo-previa">${perfLogoHTML({logo, animal:animalAtual, emblema:e.emblema}, 'perf-logo-grande')}</span>
        <div class="perf-logo-botoes">
          <label class="btn-ghost perf-logo-enviar">📷 Enviar imagem<input type="file" accept="image/png,image/jpeg,image/webp,image/*" id="perf-logo-arquivo" hidden></label>
          <button type="button" class="btn-ghost" id="perf-logo-remover" ${logo?'':'hidden'}>Remover imagem</button>
          <small>Vira um quadrado de 160 px, reduzido no próprio aparelho. Sem imagem, vale a logo do animal.</small>
          <small id="perf-logo-uso"></small>
        </div>
      </div>
      <p role="alert" id="perf-logo-erro" class="perf-logo-erro"></p>
    </fieldset>
    ${perfEscolherMembrosHTML(membrosDeHoje)}
    <label>Líder da equipe <select name="lider" id="perf-equipe-lider"></select><small id="perf-lider-nota"></small></label>
    <p class="metricas-nota">Equipe fixa: nome, animal, cor, líder e integrantes. Mudar aqui não altera entregas já confirmadas nem revisões fechadas, que guardam o nome da época. Em participações ainda não confirmadas, os mesmos IDs podem gerar uma sugestão quando há uma única equipe ativa com essa composição. Entregas já confirmadas exigem Conferir vínculos; criar ou editar o cadastro não as associa.</p>
    <div class="perf-equipe-acoes">
      <button class="btn-primary" type="submit">Salvar equipe</button>
      ${id ? `<button type="button" class="btn-ghost ${e.ativo===false?'':'perf-perigo'}" id="perf-equipe-ativo">${e.ativo===false?'Reativar equipe':'Desativar equipe'}</button>` : ''}
    </div>
  </form>`);
  perfWireBusca(d);
  const form=d.querySelector('form');
  const previa=d.querySelector('#perf-logo-previa'), remover=d.querySelector('#perf-logo-remover'), erro=d.querySelector('#perf-logo-erro');
  const animalEscolhido=()=>String(new FormData(form).get('animal')||'');
  const uso=d.querySelector('#perf-logo-uso');
  // Soma dos logos de TODAS as equipes (as desativadas também contam: ficam na configuração).
  const somaCom=()=>perfSomaLogos(perfConfig().equipes.filter(x=>x.id!==id))+(logo?logo.length:0);
  const repintar=()=>{previa.innerHTML=perfLogoHTML({logo,animal:animalEscolhido(),emblema:e.emblema},'perf-logo-grande');remover.hidden=!logo;
    const t=somaCom();uso.textContent=`Logos de todas as equipes: ${Math.ceil(t/1024)} de ${PERF_LOGOS_MAX/1000} KB`;uso.classList.toggle('perf-logo-erro',t>PERF_LOGOS_MAX);};
  repintar();
  /* ESCOLHER O ANIMAL SUGERE O RESTO: a cor da logo e, com o nome em branco
     (ou ainda igual ao animal anterior), o nome. O que a pessoa já trocou à
     mão não é sobrescrito. */
  let animalAntes=animalAtual;
  d.querySelectorAll('input[name="animal"]').forEach(r=>r.onchange=()=>{
    const novo=animalEscolhido(), fd=new FormData(form), corMarcada=String(fd.get('cor')||'');
    const sugAntes=PERF.COR_ANIMAL[animalAntes]||'', sugNova=PERF.COR_ANIMAL[novo]||'';
    if(sugNova && (!corMarcada || corMarcada===sugAntes)){const cr=form.querySelector(`input[name="cor"][value="${sugNova}"]`);if(cr)cr.checked=true;}
    const nomeEl=form.querySelector('input[name="nome"]'), rotAntes=(PERF.animalDe(animalAntes)||{}).rotulo||'';
    if(nomeEl && (!nomeEl.value.trim() || nomeEl.value.trim()===rotAntes)) nomeEl.value=(PERF.animalDe(novo)||{}).rotulo||nomeEl.value;
    animalAntes=novo; repintar();
  });
  /* O LÍDER SAI DOS INTEGRANTES MARCADOS, e só quem tem ficha do RH (o líder
     é gravado pelo ID). Desmarcar o líder limpa a escolha; com um único
     integrante com ficha, ele já vem escolhido. */
  const liderSel=d.querySelector('#perf-equipe-lider'), liderNota=d.querySelector('#perf-lider-nota');
  let liderEscolhido=ehId(e.liderPadraoId)?String(e.liderPadraoId):'';
  const desenharLider=()=>{
    const ms=perfMarcados(d), comId=ms.filter(m=>ehId(m.chave));
    if(!comId.some(m=>m.chave===liderEscolhido)) liderEscolhido=comId.length===1?comId[0].chave:'';
    liderSel.innerHTML=`<option value="">${comId.length?'Escolha o líder':'Nenhum integrante com ficha do RH'}</option>`+ms.map(m=>{const ok=ehId(m.chave);return `<option value="${ok?esc(m.chave):''}" ${ok?'':'disabled'} ${ok&&m.chave===liderEscolhido?'selected':''}>${esc(m.nome)}${ok?'':' (sem ficha do RH)'}</option>`;}).join('');
    liderSel.required=comId.length>0;
    liderNota.textContent=comId.length?'':'O líder é escolhido entre os integrantes com ficha do RH.';
  };
  liderSel.onchange=()=>{liderEscolhido=liderSel.value;};
  d.querySelector('.perf-members').addEventListener('change',desenharLider);
  d.querySelector('[data-perf-atualizar-rh]').onclick=()=>perfAtualizarMembrosRH(d,desenharLider);
  desenharLider();
  d.querySelector('#perf-logo-arquivo').onchange=async ev=>{
    const arq=ev.target.files && ev.target.files[0]; if(!arq) return;
    erro.textContent='Reduzindo a imagem…';
    try{logo=await perfReduzirLogo(arq);erro.textContent='';repintar();}
    catch(x){erro.textContent=x.message||'Não foi possível usar esta imagem.';}
    finally{ev.target.value='';}
  };
  remover.onclick=()=>{logo='';repintar();};
  // NOME REPETIDO entre as ativas: a mesma regra do servidor (que responde 409 ao novo).
  const mesmoNome=(equipes,nome,outroId)=>equipes.find(x=>x.id!==outroId && x.ativo!==false && PERF.nomeEquipeNorm(x.nome)===PERF.nomeEquipeNorm(nome));
  /* DESATIVAR, NÃO APAGAR: a equipe some das escolhas mas continua dona do
     histórico — entrega confirmada com ela não pode ficar sem nome. */
  const alternar=d.querySelector('#perf-equipe-ativo');
  if(alternar) alternar.onclick=()=>{
    const atual=perfConfig(), agora=atual.equipes.find(x=>x.id===id);
    if(!agora) return;
    if(JSON.stringify(agora)!==JSON.stringify(e)) return toast('Esta equipe mudou enquanto você editava. Reabra a edição para conferir.','error');
    // Desativar grava só o estado: o que foi mudado no formulário se perderia calado.
    const fdAgora=new FormData(form);
    const editado=String(fdAgora.get('nome')||'').trim()!==e.nome || String(fdAgora.get('animal')||'')!==animalAtual || String(fdAgora.get('cor')||'')!==corAtual || String(fdAgora.get('lider')||'')!==(ehId(e.liderPadraoId)?String(e.liderPadraoId):'') || (logo||'')!==(e.logo||'') || PERF.composicao(perfMarcados(d))!==PERF.composicao(membrosDeHoje);
    if(editado && !confirm('Há mudanças não salvas neste formulário. Elas serão descartadas. Continuar?')) return;
    if(agora.ativo!==false && !confirm(`Desativar "${agora.nome}"? Ela some das escolhas e as entregas destes integrantes deixam de aparecer com este nome. O histórico já confirmado com ela continua.`)) return;
    if(agora.ativo===false){
      const dup=mesmoNome(atual.equipes,agora.nome,id);
      if(dup) return toast(`Já existe uma equipe ativa chamada "${dup.nome}". Renomeie ou desative a outra antes de reativar esta.`,'error');
    }
    if(perfSomaLogos(atual.equipes)>PERF_LOGOS_MAX) return toast('Os logos das equipes passam de 400 KB. Remova o logo de alguma equipe antes.','error');
    atual.equipes=atual.equipes.map(x=>x.id===id?{...x,ativo:x.ativo===false}:x);
    const aviso=perfAvisoEmDuas(atual.equipes,id);
    perfSalvar(atual);d.close();renderPerformanceCasa();
    if(aviso) toast(aviso,'error');
  };
  form.onsubmit=ev=>{
    ev.preventDefault();const fd=new FormData(ev.target), membros=perfMarcados(d);
    if(!membros.length) return toast('Escolha os integrantes.','error');
    const nome=String(fd.get('nome')||'').trim(); if(!nome) return;
    const animal=String(fd.get('animal')||''), cor=String(fd.get('cor')||''), lider=String(fd.get('lider')||'');
    if(!PERF.animalDe(animal)) return toast('Escolha o animal da equipe.','error');
    if(!PERF.corValida(cor)) return toast('Escolha a cor da equipe.','error');
    const comId=membros.filter(m=>ehId(m.chave));
    if(comId.length && !comId.some(m=>m.chave===lider)) return toast('Escolha o líder entre os integrantes.','error');
    const atual=perfConfig();
    if(id && JSON.stringify(atual.equipes.find(x=>x.id===id))!==JSON.stringify(e)) return toast('Esta equipe mudou enquanto você editava. Reabra a edição para conferir.','error');
    // O emblema acompanha o animal: a aba antiga (v133) só sabe mostrar o emblema.
    const novo={...e,id:id || STORE.uuid(),nome,animal,cor,liderPadraoId:comId.some(m=>m.chave===lider)?lider:'',emblema:PERF.animalDe(animal).icone,membros,ativo:e.ativo===false?false:true};
    if(logo) novo.logo=logo; else delete novo.logo;
    /* Duas equipes ATIVAS com o mesmo nome seriam a mesma equipe parecendo
       duas no ranking. Com a mesma gente pode (as fixas dividem gente enquanto
       o cadastro é arrumado): aí a entrega só é deduzida quando uma equipe
       ativa, e só uma, tem aquela composição. Desativada não disputa nome. */
    if(novo.ativo!==false){
      const dup=mesmoNome(atual.equipes,nome,novo.id);
      if(dup) return toast(`Já existe uma equipe ativa chamada "${dup.nome}". Use outro nome ou desative a outra.`,'error');
    }
    /* O teto da soma dos logos é conferido AQUI, antes de gravar: se só o
       servidor recusasse, a tela diria "salva" e o aparelho carregaria uma
       configuração que nunca chega lá. */
    const soma=perfSomaLogos(atual.equipes.filter(x=>x.id!==novo.id).concat(novo));
    if(soma>PERF_LOGOS_MAX) return toast(`Os logos das equipes somariam ${Math.ceil(soma/1024)} KB, acima do limite de 400 KB. Remova o logo de uma equipe (as desativadas também contam) ou use uma imagem mais simples.`,'error');
    atual.equipes=atual.equipes.filter(x=>x.id!==novo.id).concat(novo);
    const aviso=perfAvisoEmDuas(atual.equipes,novo.id);
    perfSalvar(atual);d.close();renderPerformanceCasa();
    if(aviso) toast(aviso,'error');
  };
}
/* ------------------------------------------------ CONFERIR (F09, 30/09/2026)
 * O Conferir da Conferência por entrega monta a DIVISÃO DA O.S. (os.alocacao)
 * com o componente único (alocacao-ui.js) e grava pela porta da F08: só admin
 * e pcp, conferida de novo no servidor. Até a v138 ele gravava a participação
 * no blob (cfg.performancePCP.participacoes); agora nada novo vai para lá, com
 * UMA exceção (decisão do dono, 30/09/2026): a O.S. com alguém só pelo nome,
 * sem ID no RH, não pode ter divisão e confirma pelo jeito antigo, como a
 * v138, senão o Fechar período de julho a setembro trava. Uma confirmação =
 * um envio (o histórico da divisão tem teto de 40 linhas no servidor).
 */
// Data de um carimbo para a tela: dia puro não passa pelo fuso (o "2026-09-29" do UTC virava 28).
function perfDataCurta(v) { const s = String(v || ''); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : (Number.isFinite(Date.parse(s)) ? new Date(s).toLocaleDateString('pt-BR') : ''); }
// A mesma pessoa gravada pelo slug e pelo ID vira uma só (a regra do ranking).
function perfMembrosAntigos(p) {
  const chaveDeHoje = m => { const t = perfChaveDeHoje(m); return t ? {chave:t.chave, nome:m.nome} : null; };
  return PERF.unirMembros(p && Array.isArray(p.membros) ? p.membros : [], chaveDeHoje);
}
/* A PARTICIPAÇÃO ANTIGA, SÓ LEITURA. A mesma pessoa gravada pelo slug e pelo
   ID vira uma linha só, com os percentuais somados (a regra do ranking).
   `jeitoAntigo`: a O.S. que ainda confirma por ela (nome sem ficha no RH). */
function perfParticipacaoAntigaHTML(p, os, jeitoAntigo) {
  if (!p || !Array.isArray(p.membros) || !p.membros.length) return '';
  const ms = perfMembrosAntigos(p);
  const vale = !!perfParticipacaoVale(os || {}, p);
  const quem = [p.por ? 'por ' + p.por : '', perfDataCurta(p.em) ? 'em ' + perfDataCurta(p.em) : ''].filter(Boolean).join(' ');
  const situacao = jeitoAntigo
    ? (vale ? 'Ela conta na performance e abre abaixo como foi confirmada.' : 'Ela não conta mais: a divisão desta O.S. mudou depois dela.')
    : (vale ? 'Ela ainda conta na performance; ao confirmar a divisão abaixo, passa a valer a divisão da O.S. e ela fica só para consulta.' : 'Ela não conta mais: vale a divisão gravada na O.S.') + ' Não é mais editada aqui.';
  return `<section class="aloc-antiga" aria-label="Participação conferida antes">
    <h4>Participação conferida antes <small>só leitura</small></h4>
    <p class="aloc-aviso">Conferida${quem ? ' ' + esc(quem) : ''} no formato antigo. ${situacao}</p>
    <ul>${ms.map(m => `<li>${esc(m.nome)} · ${perfFormato(m.percentual)}%</li>`).join('')}</ul>
    ${p.equipeNome ? `<p class="aloc-antiga-extra">Equipe: ${esc(p.emblema || '')} ${esc(p.equipeNome)}</p>` : ''}${p.obs ? `<p class="aloc-antiga-extra">Observação: ${esc(p.obs)}</p>` : ''}
  </section>`;
}
// Depois de gravar: a base do servidor ficou velha; a tela volta à prévia até a nova consulta.
function perfDepoisDeGravar(r) {
  perfRemoto.dados = null; perfRemoto.tentado = false;
  if (r && r.estado === 'pendente') perfRemoto.erro = 'Divisão guardada neste aparelho: aguardando sincronização e nova consulta.';
  renderPerformanceCasa();
  if (r && r.estado === 'gravada') void perfCarregarFonte();
}
async function perfEditarParticipacao(id) {
  if (!perfPodeEditar() || perfFonteAtual()?.fechadoEm) return;
  const ref = perfOS(id) || {};
  if (ref._perf?.entregaId && typeof conferirItensEntrega === 'function') return conferirItensEntrega(ref._perf.osId, ref._perf.entregaId);
  let os = STORE.getOS(id);
  /* A O.S. fora da janela do aparelho (apuração de um mês antigo) vem do
     servidor antes de abrir: a divisão grava na O.S. inteira, nunca num resumo.
     A busca é SÓ PELO NÚMERO, sem período (de e até vazios): o servidor filtra
     a finalização em UTC, e o dia da apuração é o de São Paulo ou o da entrega
     lançada. A O.S. finalizada depois das 21h, ou lançada noutro dia, não
     voltava. Das achadas, vale a do id. */
  let busca = null;
  if (!os && typeof STORE.buscarHistorico === 'function' && ref.numero) {
    try { busca = await STORE.buscarHistorico({de:'', ate:'', q:String(ref.numero)}); } catch (e) { busca = {erro:e}; }
    os = STORE.getOS(id);
  }
  const titulo = 'Conferir divisão · O.S. ' + (ref.numero || (os && os.numero) || '');
  // Sem rede é "conecte-se"; com rede e sem a O.S. na resposta, é dito como é.
  if (!os) { perfDialog(titulo, `<p class="aloc-aviso">${busca && !busca.offline && !busca.erro ? `Esta O.S. não está neste aparelho, e a busca pelo número ${esc(ref.numero)} no servidor não a trouxe. Atualize a apuração e toque em Conferir de novo.` : 'Esta O.S. não está neste aparelho e não deu para buscá-la agora. Conecte-se e toque em Conferir de novo.'}</p>`); return; }
  if (typeof ALOCUI === 'undefined') { perfDialog(titulo, '<p class="aloc-aviso">Esta tela está desatualizada. Recarregue a página para conferir a divisão.</p>'); return; }
  if (os.conferenciasEntrega?.length) return conferirItensEntrega(id, os.conferenciasEntrega[0].id);
  // Conferir começa pelo que foi entregue, antes de atribuir a O.S. inteira
  // a uma pessoa. O caminho antigo permanece para fichas ainda sem itens.
  if (os.itens?.length && typeof conferirItensEntrega === 'function') return conferirItensEntrega(id);
  const c = perfConfig(), chave = 'perf:' + id;
  const pAntiga = c.participacoes.find(p => p.id === id);
  const pVale = perfParticipacaoVale(os, pAntiga);
  const abrirComponente = reiniciar => ALOCUI.iniciar(chave, {os:STORE.getOS(id) || os, equipes:c.equipes, papel:STATE.user?.papel, valor:perfPodeEditar() ? valorDaOS(os) : null,
    dia:diaEntrega(os), versoes:perfRegrasFonte().versoes, participacao:pVale ? perfMembrosAntigos(pVale) : null, reiniciar});
  const jeitoAntigo = !!abrirComponente(true).antigo;
  const antiga = perfParticipacaoAntigaHTML(pAntiga, os, jeitoAntigo);
  const d = perfDialog(titulo, `<p class="aloc-os">${esc(os.cliente || '')}${os.servico ? ' · ' + esc(os.servico) : ''}${diaEntrega(os) ? ' · entrega em ' + esc(perfDataCurta(diaEntrega(os))) : ''}</p>
    <p class="metricas-nota">${jeitoAntigo ? 'Quem fez esta entrega e com qual parte. Esta O.S. confirma pelo jeito antigo (a participação da apuração); a equipe da O.S. não muda.' : 'Quem fez esta entrega e com qual parte. Confirmar grava a divisão na própria O.S., e a equipe da O.S. passa a ser a desta divisão.'}</p>
    ${antiga}<button type="button" class="btn-ghost conf-itens-abrir" id="perf-escolher-itens">Selecionar itens · entrega parcial ou outra equipe</button><div id="perf-aloc"></div>
    <div class="aloc-acoes"><button type="button" class="btn-primary" id="perf-aloc-ok">${jeitoAntigo ? 'Confirmar pelo jeito antigo' : 'Confirmar divisão'}</button><button type="button" class="btn-ghost" id="perf-aloc-recomecar" hidden>Recomeçar pela divisão gravada</button></div>
    <p class="aloc-status" id="perf-aloc-status" role="status" aria-live="polite"></p>`);
  d.querySelector('#perf-escolher-itens').onclick = () => { d.close(); void conferirItensEntrega(id).catch(e => toast(perfErroTxt(e), 'error')); };
  const box = d.querySelector('#perf-aloc'), ok = d.querySelector('#perf-aloc-ok'), status = d.querySelector('#perf-aloc-status'), recomecar = d.querySelector('#perf-aloc-recomecar');
  /* O <dialog> É UM SÓ (perfDialog troca o conteúdo). O resultado que chega
     depois que esta tela saiu (fechada no X, ou o diálogo já é o Conferir de
     outra O.S.) não fecha nem escreve no diálogo de ninguém: vira aviso. */
  const meu = () => !!d.open && d.querySelector('#perf-aloc') === box;
  let enviando = false;
  // O botão diz por que não grava, em vez de falhar no clique.
  const conferirBotao = () => {
    if (enviando) return;
    const motivo = ALOCUI.bloqueio(chave);
    ok.disabled = !!motivo;
    status.textContent = motivo ? 'Para gravar: ' + motivo : '';
    status.classList.toggle('erro', false);
  };
  const aoIr = destino => {
    d.close();
    if (destino === 'ficha') { const o = STORE.getOS(id); if (o && typeof openModal === 'function') openModal(o, 'agenda'); return; }
    const q = document.querySelector('[data-quadro="perf-rh"]');
    if (q) { q.open = true; q.scrollIntoView({behavior:'smooth', block:'start'}); }
  };
  ALOCUI.montar(box, chave, {aoMudar:conferirBotao, aoIr});
  d.addEventListener('close', () => { if (!enviando) ALOCUI.esquecer(chave); }, {once:true});
  recomecar.onclick = () => { abrirComponente(true); recomecar.hidden = true; ALOCUI.repintar(chave); };
  /* O JEITO ANTIGO GRAVA COMO A v138: a participação do blob, com a trava de
     "mudou enquanto você editava". O servidor confirma a O.S. que nunca teve
     divisão por ela (participacaoVale), e o Fechar período não trava. */
  const confirmarAntigo = () => {
    const r = ALOCUI.paraParticipacao(chave);
    if (r.erro) { status.textContent = r.erro; status.classList.add('erro'); return; }
    const atual = perfConfig(), agora = atual.participacoes.find(p => p.id === id);
    if (JSON.stringify(agora) !== JSON.stringify(pAntiga)) { status.textContent = 'A participação desta O.S. mudou em outro aparelho enquanto você editava. Nada foi gravado. Feche e toque em Conferir de novo.'; status.classList.add('erro'); return; }
    const novo = {id, numero:String(os.numero || ref.numero || ''), membros:r.membros, equipeId:'', equipeNome:'', emblema:'🤝', obs:String((pAntiga && pAntiga.obs) || ''), em:new Date().toISOString(), por:STATE.user?.nome || ''};
    atual.participacoes = atual.participacoes.filter(p => p.id !== id).concat(novo);
    ALOCUI.esquecer(chave); d.close();
    void perfSalvar(atual);
    renderPerformanceCasa();
  };
  ok.onclick = async () => {
    if (enviando || ALOCUI.bloqueio(chave)) return conferirBotao();
    if (ALOCUI.estado(chave)?.antigo) return confirmarAntigo();
    const st0 = ALOCUI.estado(chave);
    enviando = true; ok.disabled = true; status.classList.remove('erro'); status.textContent = 'Gravando a divisão…';
    let r;
    try { r = await ALOCUI.gravarNaOS(chave, {usuario:STATE.user?.nome || ''}); }
    catch (e) { r = {ok:false, estado:'erro', mensagem:'Não foi possível gravar: ' + perfErroTxt(e)}; }
    finally { enviando = false; }
    const numero = ref.numero || os.numero || '';
    const dono = meu();
    // Só esquece o estado desta abertura: o Conferir da mesma O.S. reaberto tem o seu.
    const soltar = () => { if (ALOCUI.estado(chave) === st0) ALOCUI.esquecer(chave); };
    if (r.estado === 'gravada' || r.estado === 'pendente' || r.estado === 'sem-mudanca') {
      soltar();
      if (dono) d.close();
      toast(r.estado === 'gravada' ? `Divisão gravada na O.S. ${numero}.` : r.mensagem, r.estado === 'pendente' ? '' : 'success');
      if (r.estado !== 'sem-mudanca') perfDepoisDeGravar(r);
      return;
    }
    // A divisão foi ao servidor, mas ainda não conta (a conferir no RH): a base mudou.
    if (r.estado === 'conferir-rh') perfDepoisDeGravar(r);
    /* CONFLITO DE VERSÃO NO SERVIDOR (o 409 da O.S.): o aviso de conflito do
       app abriu e fica atrás deste diálogo modal. Fecha, e o motivo vai junto. */
    if (r.estado === 'conflito' && r.servidor) { soltar(); if (dono) d.close(); toast(`O.S. ${numero}: ${r.mensagem}`, 'error'); return; }
    if (!dono) { soltar(); toast(`O.S. ${numero}: ${r.mensagem}`, 'error'); return; }
    // Descarte, mudança em outro aparelho, recusa, fila ou RH: a tela fica aberta com o motivo inteiro.
    status.textContent = r.mensagem; status.classList.add('erro');
    recomecar.hidden = !(r.estado === 'descartada' || r.estado === 'conflito');
    ok.disabled = r.estado === 'descartada' || r.estado === 'conflito';
  };
}
/* ---------------------------------------------------------------- LOGO
 * A imagem da equipe é reduzida NO APARELHO antes de ir para a configuração
 * global, que todo tablet baixa. Recorte quadrado ao centro, 160 px. Tenta WebP
 * (menor, com transparência); o Safari não gera WebP pelo canvas e devolve PNG,
 * então PNG é a segunda tentativa; JPEG por último, sobre fundo branco, porque
 * JPEG não tem transparência e o fundo sairia preto. Mesmo teto do servidor. */
/* As opções da regra de equipe na tela: a chave de cada pessoa resolvida
   agora (ficha do RH ou apelido) e, numa revisão fechada, o histórico intacto. */
function perfOpcoesEquipe() {
  return { resolver: m => perfIdMembro(m), historico: !!(perfFonteAtual() && perfFonteAtual().fechadoEm) };
}
const PERF_LOGOS_MAX = 400000;
function perfSomaLogos(equipes) { return (equipes || []).reduce((t, e) => t + (perfLogoValido(e.logo) ? e.logo.length : 0), 0); }
const PERF_LOGO_MAX = 40000;
const PERF_LOGO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
function perfLogoValido(logo) { return typeof logo === 'string' && logo.length <= PERF_LOGO_MAX && PERF_LOGO_RE.test(logo); }
function perfLogoHTML(e, classe) {
  const cls = classe || 'perf-emblema';
  // Só renderiza imagem que passou na mesma régua do servidor: nada de SVG
  // (carrega script) nem de endereço externo.
  if (e && perfLogoValido(e.logo)) return `<img class="${cls} perf-logo" src="${esc(e.logo)}" alt="" loading="lazy">`;
  // Sem imagem própria: a logo do animal (arquivo do site, lista fechada).
  const doAnimal = e && Object.prototype.hasOwnProperty.call(PERF.LOGO_ANIMAL, e.animal) ? PERF.LOGO_ANIMAL[e.animal] : '';
  if (doAnimal) return `<img class="${cls} perf-logo" src="${esc(doAnimal)}" alt="" loading="lazy">`;
  // Sem logo nenhuma: o ícone do animal ou o emblema antigo.
  return `<span class="${cls}" aria-hidden="true">${esc(PERF.iconeEquipe(e))}</span>`;
}
async function perfReduzirLogo(arquivo) {
  if (!arquivo || !/^image\//.test(arquivo.type || '')) throw new Error('Escolha um arquivo de imagem.');
  // Foto de celular passa de 5 MB; acima de 20 MB é engano de arquivo.
  if (arquivo.size > 20 * 1024 * 1024) throw new Error('Arquivo grande demais para um logo (mais de 20 MB).');
  /* LIDO COMO DADO, não como endereço blob:. Uma política de segurança que
     proíba blob: (a prévia local tem uma) fazia a imagem "não carregar" sem
     dizer por quê; data: passa em qualquer política razoável. */
  const url = await new Promise((ok, erro) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(String(leitor.result || ''));
    leitor.onerror = () => erro(new Error('Não deu para ler este arquivo.'));
    leitor.readAsDataURL(arquivo);
  });
  {
    const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('Não deu para ler esta imagem. Use PNG, JPEG ou WebP.')); i.src = url; });
    const lado = 160, lado0 = Math.min(img.naturalWidth, img.naturalHeight);
    if (!lado0) throw new Error('Imagem vazia.');
    const sx = (img.naturalWidth - lado0) / 2, sy = (img.naturalHeight - lado0) / 2;
    const tela = document.createElement('canvas'); tela.width = tela.height = lado;
    const g = tela.getContext('2d');
    const desenhar = fundo => { g.clearRect(0, 0, lado, lado); if (fundo) { g.fillStyle = fundo; g.fillRect(0, 0, lado, lado); } g.drawImage(img, sx, sy, lado0, lado0, 0, 0, lado, lado); };
    /* PNG só se sair PEQUENO. No iPad o canvas não gera WebP e cai no PNG, que
       num logo em degradê dá 33 mil caracteres contra 4,5 mil do JPEG: doze
       logos assim estouravam o teto da soma. Logo chapado (poucas cores) sai
       PNG pequeno e mantém a transparência; o resto vai de JPEG. */
    const tentativas = [['image/webp', .86, '', PERF_LOGO_MAX], ['image/webp', .7, '', PERF_LOGO_MAX], ['image/png', 1, '', 12000], ['image/jpeg', .82, '#fff', PERF_LOGO_MAX], ['image/jpeg', .6, '#fff', PERF_LOGO_MAX]];
    for (const [tipo, q, fundo, teto] of tentativas) {
      desenhar(fundo);
      const d = tela.toDataURL(tipo, q);
      if (d.startsWith('data:' + tipo) && d.length <= teto && PERF_LOGO_RE.test(d)) return d;
    }
    throw new Error('Mesmo reduzida, a imagem passou de 40 KB. Tente uma mais simples.');
  }
}

/* ------------------------------------------------------ PEÇAS DA VITRINE
 * Revisão de experiência (29/09/2026). As peças abaixo desenham a faixa de
 * cobertura, o selo de situação, a barra e o pódio, e servem às duas vistas
 * (Pessoas e Equipes) e ao Modo TV, para as três falarem a mesma língua.
 * NENHUMA FAZ CONTA: só desenham o que PERF já apurou.
 */
/* A PORCENTAGEM QUE NÃO MENTE NO ARREDONDAMENTO: 162 de 163 não pode virar
   "100%", nem 1 de 300 virar "0%". */
function perfPctTxt(n, total) {
  if (!total) return '0%';
  let p = Math.round(n / total * 100);
  if (n < total) p = Math.min(p, 99);
  if (n > 0) p = Math.max(p, 1);
  return p + '%';
}
/* A BARRA SEM style=. A largura é atributo de um <rect> de SVG (número
   calculado aqui, nunca texto vindo de dado) e a cor vem por classe: o
   ranking não leva style= (tests/equipes.test.cjs confere). Desenho só: o
   número ao lado é quem informa, por isso aria-hidden. */
function perfBarraHTML(fracao, classe) {
  const f = Number.isFinite(fracao) ? Math.max(0, Math.min(1, fracao)) : 0;
  const w = Math.round(f * 1000);
  return `<svg class="perf-barra${classe || ''}" viewBox="0 0 1000 10" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect class="perf-barra-trilho" width="1000" height="10"/>${w ? `<rect class="perf-barra-valor" width="${w}" height="10"/>` : ''}</svg>`;
}
/* A SITUAÇÃO DO RANKING, ao lado do título: quem olha o pódio precisa saber
   se ele já vale ou se ainda vai mudar. Parcial = há entrega sem equipe (quem
   trabalhou nela ainda não aparece); em conferência = há divisão só
   sugerida; fechado = revisão selada no servidor. */
function perfSituacao(regs) {
  const f = perfFonteAtual();
  if (f && f.fechadoEm) return {tipo:'ok', texto:`Fechado · revisão ${f.revisao}`};
  const total = (regs || []).length;
  if (!total) return null;
  const sem = regs.filter(r => !r.membros.length).length, conf = regs.filter(r => r.confirmado).length;
  if (sem) return {tipo:'parcial', texto:`Parcial: ${perfPctTxt(total - sem, total)} das entregas com equipe`};
  if (conf < total) return {tipo:'conferir', texto:`Em conferência: ${conf} de ${total} confirmadas`};
  return {tipo:'ok', texto:'Participações confirmadas'};
}
function perfSituacaoHTML(s) { return s ? `<span class="perf-situacao ${s.tipo}">${esc(s.texto)}</span>` : ''; }
/* O CONTROLE SEGMENTADO (Nota | Produção | Valor): botões de alternância com
   aria-pressed, para o leitor de tela dizer qual está ligado. */
function perfSegHTML(atual, opcoes, attr, rotulo) {
  return `<div class="perf-seg" role="group" aria-label="${esc(rotulo)}">${opcoes.map(([v, t]) => `<button type="button" class="${v === atual ? 'on' : ''}" aria-pressed="${v === atual}" data-${attr}="${esc(v)}">${esc(t)}</button>`).join('')}</div>`;
}
/* O PÓDIO. Ordem clássica na tela: 2º à esquerda, 1º no centro e mais alto,
   3º à direita. No HTML a ordem é a do ranking (o leitor de tela ouve 1º, 2º,
   3º, e no celular o pódio empilha nessa ordem); só o lugar na tela muda, por
   classe. A ALTURA do degrau vem da POSIÇÃO (empate divide o degrau e a
   medalha) e o LUGAR vem da ordem: com 1º, 2º e 2º o campeão fica no centro.
   Quem corta o pódio continua sendo perfCortarPodio (empate que não cabe em
   três vira lista). `animar` sobe os degraus uma vez; repintar a mesma tela
   (a cada sincronização) não repete o espetáculo. */
function perfPodioHTML(itens, opcoes) {
  const o = opcoes || {};
  if (!itens || !itens.length) return '';
  const lugar = i => i === 0 ? 'centro' : i === 1 ? 'esq' : 'dir';
  return `<ol class="perf-podio n${itens.length}${o.animar ? ' perf-animar' : ''}${o.classe ? ' ' + o.classe : ''}" aria-label="${esc(o.rotulo || 'Pódio')}">${itens.map((x, i) => `<li class="perf-podio-item pos-${Math.min(3, x.posicao)} lugar-${lugar(i)}${x.classe || ''}">
      <div class="perf-podio-topo">
        <span class="perf-podio-visual">${x.visual}<span class="perf-medalha" aria-hidden="true">${PERF_MEDALHAS[x.posicao] || ''}</span></span>
        <h4 class="perf-podio-nome"><span class="perf-sr">${x.posicao}º lugar: </span>${esc(x.nome)}</h4>
        <div class="perf-podio-selo">${x.selo || ''}</div>
        <p class="perf-podio-num"><strong>${esc(x.numero)}</strong><span>${esc(x.unidade)}</span></p>
        <p class="perf-podio-linha">${x.linha || ''}</p>
        <div class="perf-podio-aviso">${x.aviso || ''}</div>
        ${x.extra ? `<div class="perf-podio-extra">${x.extra}</div>` : ''}
        ${x.acoes ? `<div class="perf-podio-acoes">${x.acoes}</div>` : ''}
      </div>
      <div class="perf-degrau" aria-hidden="true"><span>${x.posicao}º</span></div>
    </li>`).join('')}</ol>`;
}
let perfPodiosVistos = new Set();
function perfAnimarPodio(chave) { if (perfPodiosVistos.has(chave)) return false; perfPodiosVistos.add(chave); return true; }
/* A FAIXA DE COBERTURA. Três cartões (instalações, confirmadas, sem equipe),
   uma faixa amarela e um texto solto diziam a mesma coisa em três lugares.
   Agora é UMA faixa: quantas entregas têm equipe (a barra), quantas estão
   confirmadas e a ação. Com tudo coberto ela encolhe para uma linha verde:
   dado bom não precisa gritar.
   "COMPLETAR EQUIPES" LEVA À CONFERÊNCIA DESTA TELA, filtrada em "Sem
   equipe": é lá (botão Conferir) que se diz quem fez cada entrega. A fila de
   lançamento de Entregas só recebe as baixas do ERP ainda não lançadas, e
   essas nem entram na apuração até alguém lançar; quando existem no período,
   a faixa diz quantas e leva até lá.
   A COBERTURA DA ALOCAÇÃO (F11, 30/09/2026): a mesma faixa diz quantas estão
   CONFIRMADAS (a divisão da O.S. válida e atual, ou a participação antiga
   que ainda vale), quantas SUGERIDAS (com gente, mas sem confirmação: a
   divisão desatualizada e a que espera o RH aparecem com a marca) e quantas
   SEM EQUIPE, e quanto do valor do período cada grupo representa. O valor só
   aparece para quem vê R$ na tela (admin e pcp). As contas saem de
   perfCoberturaConta, a mesma que os testes conferem contra a lista. */
/* A SITUAÇÃO DE UMA ENTREGA NA CONFERÊNCIA (F11): [classe do selo, texto,
   marca]. A mesma no selo da lista, no filtro Situação e na faixa do topo, e
   cada entrega cai num lugar só: verde confirmada, vermelho sem equipe ou
   inconsistente, e âmbar a sugerida, com a MARCA quando é a divisão que uma
   aba antiga deixou para trás (desatualizada) ou a que espera o RH. Nenhuma
   das duas confirma. A desatualizada que ficou SEM gente (a aba antiga
   esvaziou a equipe) é "Sem equipe", como o selo diz; a faixa não a conta
   também entre as sugeridas. */
function perfSituacaoEntrega(r) {
  if (r.confirmado) return ['ok', 'Confirmada', ''];
  if (!r.membros || !r.membros.length) return ['sem', 'Sem equipe', ''];
  if (PERF.validar(r.membros)) return ['erro', 'Participação inconsistente', ''];
  if (r.fonte === 'alocacao-desatualizada') return ['desat', 'Divisão desatualizada', 'desatualizada'];
  if (r.fonte === 'alocacao-conferir-rh') return ['desat', 'Divisão a conferir no RH', 'conferir-rh'];
  return ['sug', 'Divisão sugerida', ''];
}
function perfCoberturaConta(regs) {
  const xs = Array.isArray(regs) ? regs : [];
  const st = xs.map(perfSituacaoEntrega);
  const grupo = i => st[i][0] === 'ok' ? 'conf' : (st[i][0] === 'sem' ? 'sem' : 'sug');
  const n = {conf:0, sug:0, sem:0}, centavos = {conf:0, sug:0, sem:0};
  let semValor = 0;
  xs.forEach((r, i) => {
    const g = grupo(i); n[g]++;
    if (r.valor == null || !Number.isFinite(Number(r.valor))) semValor++; else centavos[g] += Math.round(Number(r.valor) * 100);
  });
  const valor = {conf:centavos.conf / 100, sug:centavos.sug / 100, sem:centavos.sem / 100, total:(centavos.conf + centavos.sug + centavos.sem) / 100};
  const marca = m => st.filter(x => x[2] === m).length;
  return {total:xs.length, confirmadas:n.conf, sugeridas:n.sug, sem:n.sem, valor, semValor,
    antigas:xs.filter(r => r.confirmado && r.fonte === 'participacao').length,
    desatualizadas:marca('desatualizada'), conferirRH:marca('conferir-rh'),
    inconsistentes:st.filter(x => x[0] === 'erro').length};
}
function perfCoberturaHTML(regs, f) {
  const k = perfCoberturaConta(regs);
  const total = k.total, sem = k.sem, com = total - sem, conf = k.confirmadas, sug = k.sugeridas, incons = k.inconsistentes;
  const fechada = !!(perfFonteAtual() && perfFonteAtual().fechadoEm);
  const pode = perfPodeEditar() && !fechada;
  // R$ só para quem vê valor na tela (a mesma regra da coluna de valor da conferência).
  const verValor = perfPodeEditar();
  const pendLancar = (((typeof classificarEntregas === 'function' ? classificarEntregas(STORE.getAllOS()) : null) || {}).aLancar || [])
    .filter(o => OPERACAO.emIntervalo(diaEntrega(o), f.de, f.ate)).length;
  /* A O.S. QUE O PCP SEGUROU (revisão da E7). O ERP disse entregue, o PCP
     tem entrega parcial marcada, e a baixa a deixou aberta para a gestão
     decidir em Entregas: ela não é instalação nem "a lançar", e sem esta
     linha sumia das contas do período sem aviso nenhum. Conta pela data do
     aviso do ERP (a da entrega; sem ela, o dia em que a baixa viu). */
  const segurasERP = (typeof listaErpComSaldo === 'function' ? listaErpComSaldo(STORE.getAllOS()) : [])
    .filter(x => OPERACAO.emIntervalo(x.aviso.data || OPERACAO.dia(x.aviso.desde), f.de, f.ate)).length;
  const lancar = (pendLancar ? `<p class="perf-cob-extra">${pendLancar} ${pendLancar === 1 ? 'baixa do ERP deste período espera lançamento em Entregas e ainda não conta' : 'baixas do ERP deste período esperam lançamento em Entregas e ainda não contam'} aqui. <button type="button" class="inline-link" data-perf-lancar>Abrir o lançamento</button></p>` : '')
    + (segurasERP ? `<p class="perf-cob-extra perf-cob-erp-saldo">${segurasERP} ${segurasERP === 1 ? 'entrega o ERP diz entregue e o PCP ainda tem saldo' : 'entregas o ERP diz entregues e o PCP ainda tem saldo'}; decida em Entregas. <button type="button" class="inline-link" data-perf-erp-saldo>Abrir a lista</button></p>` : '');
  const avisos = perfAvisosHTML(true);
  if (!total) return `<section class="perf-cobertura perf-cob-linha" aria-label="Cobertura das equipes"><p>Nenhuma entrega finalizada neste período.</p>${lancar}${avisos}</section>`;
  // As marcas das sugeridas: a divisão que uma aba antiga deixou para trás, a que espera o RH e a quebrada.
  const marcas = [k.desatualizadas ? `${k.desatualizadas} com a divisão desatualizada` : '', k.conferirRH ? `${k.conferirRH} com pessoa a conferir no RH` : '', incons ? `${incons} com percentuais inconsistentes` : ''].filter(Boolean);
  const marcasTxt = marcas.length ? ` (${marcas.join(', ')})` : '';
  const parte = v => verValor ? ` <span class="perf-cob-valor">${esc(dinheiroCasa(v))} · ${perfPctTxt(v, k.valor.total)} do valor</span>` : '';
  const semValorTxt = k.semValor ? ` ${k.semValor} ${k.semValor === 1 ? 'entrega está sem valor e fica fora da conta' : 'entregas estão sem valor e ficam fora da conta'}.` : '';
  const valorLinha = verValor && (k.valor.total || k.semValor) ? `<p class="perf-cob-extra perf-cob-valor-linha">Valor do período: ${esc(dinheiroCasa(k.valor.total))}, com ${esc(dinheiroCasa(k.valor.conf))} em entregas confirmadas (${perfPctTxt(k.valor.conf, k.valor.total)}).${semValorTxt}</p>` : '';
  const antigasTxt = k.antigas ? ` (${k.antigas} pela participação antiga)` : '';
  if (!sem) {
    const falta = total - conf;
    return `<section class="perf-cobertura perf-cob-linha perf-cob-ok" aria-label="Cobertura das equipes"><p><span class="perf-cob-icone" aria-hidden="true">✓</span> Todas as ${total} entregas do período têm equipe · ${falta ? `${conf} de ${total} confirmadas${antigasTxt} · ${falta} ${falta === 1 ? 'sugerida' : 'sugeridas'}${marcasTxt}` : `todas confirmadas${antigasTxt}`}${falta && !fechada ? ` <button type="button" class="inline-link" data-perf-filtrar="pendente">${pode ? 'Conferir' : 'Ver'} as ${falta} a conferir</button>` : ''}</p>${valorLinha}${lancar}${avisos}</section>`;
  }
  // Barra empilhada: confirmadas por cima das que têm equipe; o trilho é o que falta.
  const barra = `<svg class="perf-cob-barra" viewBox="0 0 1000 14" preserveAspectRatio="none" role="img" aria-label="${com} de ${total} entregas com equipe, ${conf} confirmadas" focusable="false"><rect class="trilho" width="1000" height="14"/>${com ? `<rect class="sug" width="${Math.round(com / total * 1000)}" height="14"/>` : ''}${conf ? `<rect class="conf" width="${Math.round(conf / total * 1000)}" height="14"/>` : ''}</svg>`;
  return `<section class="perf-cobertura perf-cob-parcial" aria-labelledby="perf-cob-titulo">
    <div class="perf-cob-cabeca">
      <div class="perf-cob-texto"><h3 id="perf-cob-titulo">Equipe nas entregas</h3>
        <p class="perf-cob-num"><strong>${com} de ${total}</strong> entregas com equipe <b>(${perfPctTxt(com, total)})</b></p></div>
      <button type="button" class="${pode ? 'btn-primary' : 'btn-ghost'} btn-sm perf-cob-acao" data-perf-filtrar="sem-equipe">${pode ? 'Completar equipes' : 'Ver as sem equipe'}</button>
    </div>
    ${barra}
    <ul class="perf-cob-legenda">
      <li class="conf"><span><b>${conf}</b> ${conf === 1 ? 'confirmada' : 'confirmadas'}${antigasTxt}${parte(k.valor.conf)}</span></li>
      <li class="sug"><span><b>${sug}</b> ${sug === 1 ? 'sugerida' : 'sugeridas'}, a conferir${marcasTxt}${parte(k.valor.sug)}</span></li>
      <li class="sem"><span><b>${sem}</b> sem equipe${parte(k.valor.sem)}</span></li>
    </ul>
    ${valorLinha}
    <p class="perf-cob-dica">Enquanto houver entrega sem equipe o ranking é parcial: quem trabalhou nela ainda não aparece.</p>
    ${lancar}${avisos}
  </section>`;
}
/* O LANÇAMENTO FICA EM ENTREGAS. Abre a aba pelo mesmo botão da lateral (que
   repinta e consulta), na lista e não nos relatórios, e desce até a fila
   "Lançamento manual". A fila em Entregas agora é uma faixa fechada; quem
   chega por aqui veio lançar, então ela já abre. */
function perfAbrirLancamento() {
  const aba = document.querySelector('.tab[data-tab="entregas"]:not([data-vista])');
  if (!aba) return;
  STATE._entAba = '';
  STATE._entFilaAberta = true;
  aba.click();
  setTimeout(() => { const alvo = document.querySelector('#panel-entregas .casa-lancar'); if (alvo) alvo.scrollIntoView({behavior:'smooth', block:'start'}); }, 80);
}

/* ------------------------------------------------- RANKING INDIVIDUAL
 * "O peso é individual" (o dono, 23/09/2026). O ranking que vale é o da
 * pessoa, pela NOTA. Desde 03/10/2026, a parcela principal usa o valor líquido
 * confirmado e rateado; revisões antigas mantêm o peso de cada entrega,
 * mais limpeza do carro e equipamentos conferidos na volta, com os pesos que a
 * gestão define aqui mesmo. As outras duas medidas ficam à mão para quem quer
 * olhar um critério só.
 */
const PERF_CRIT_ROTULO = {producao:'Valor entregue', limpeza:'Carro (limpo e arrumado)', equipamentos:'Equipamentos'};
/* Na etiqueta de cada pessoa o rótulo curto: "Carro (limpo e arrumado)" em
   cada linha dobrava a altura da tabela. O nome inteiro fica na dica da
   etiqueta e na linha dos pesos, logo abaixo do título. */
const PERF_CRIT_CURTO = {producao:'Valor entregue', limpeza:'Carro', equipamentos:'Equipamentos'};
function perfCriterios() { return PERF.criteriosValidos(perfConfig().criterios); }
function perfEquipeDaPessoa(chave, salvas) {
  // Pelo ID de hoje dos dois lados: a equipe salva pelo slug antigo também acha a pessoa.
  const alvo = perfIdMembro({chave});
  const suas = (salvas || []).filter(e => e.ativo !== false && (e.membros || []).some(m => perfIdMembro(m) === alvo));
  return suas;
}
function perfRankingPessoasHTML(regs, c) {
  const medida = ['nota', 'peso', 'valor', 'geral'].includes(STATE._perfPessoaMedida) ? STATE._perfPessoaMedida : 'nota';
  const geral = medida === 'geral', comNota = medida === 'nota' || geral;
  /* Revisão FECHADA usa os pesos selados no fechamento, nunca os de hoje:
     mexer nos pesos depois não pode reordenar um mês já fechado. */
  const fonte = perfFonteAtual(), fechada = !!(fonte && fonte.fechadoEm);
  const porValor = !fechada || fonte.regraNota === PERF.REGRA_NOTA_VALOR;
  const rotulos = {...PERF_CRIT_ROTULO, producao:porValor ? 'Valor entregue' : 'Produção'};
  const curtos = {...PERF_CRIT_CURTO, producao:rotulos.producao};
  const av = (geral ? PERF.avaliarGeral : PERF.avaliar)(regs, fechada ? (fonte.criterios || {producao:100, limpeza:0, equipamentos:0}) : perfCriterios(), {porValor});
  const apurado = porValor ? PERF.valoresConfirmados(regs) : PERF.resumir(regs.filter(r => r.confirmado)).pessoas;
  const valorDe = new Map(apurado.map(x => [String(x.chave), x]));
  // Entregas e confirmações de cada um (sugeridas incluídas): de onde sai o selo "a conferir".
  const contagem = new Map(PERF.resumir(regs).pessoas.map(x => [String(x.chave), x]));
  let linhas, fora = [];
  if (medida === 'valor') {
    const com = av.pessoas.filter(p => { const v = valorDe.get(String(p.chave)); return v && v.os > v.semValor; });
    fora = av.pessoas.filter(p => !com.includes(p));
    linhas = PERF.ranquear(com.map(p => ({...p, valorConf: valorDe.get(String(p.chave)).valor})), p => p.valorConf);
  } else if (medida === 'peso') {
    linhas = PERF.ranquear(av.pessoas, p => p.peso);
  } else {
    const campo = geral ? 'geral' : 'nota';
    const com = av.pessoas.filter(p => p[campo] != null);
    fora = av.pessoas.filter(p => p[campo] == null);
    linhas = PERF.ranquear(com, p => p[campo]);
  }
  const fmt = n => perfFormato(n);
  const medidaDe = p => medida === 'valor' ? p.valorConf : (medida === 'peso' ? p.peso : geral ? p.geral : p.nota);
  const numero = p => medida === 'valor' ? dinheiroCasa(p.valorConf) : fmt(medidaDe(p));
  const semValorP = p => { const v = valorDe.get(String(p.chave)); return v ? v.semValor : 0; };
  const rotulo = p => medida === 'valor' ? ('rateado e confirmado' + (semValorP(p) ? ` · parcial (${semValorP(p)} sem valor)` : '')) : (medida === 'peso' ? 'O.S. equivalentes' : 'pontos de 100');
  // Só o valor CONFIRMADO, rateado; sem confirmação não vira zero, vira "sem valor confirmado".
  const valorTxt = p => { const v = valorDe.get(String(p.chave)); return v && v.os > v.semValor ? dinheiroCasa(v.valor) + (v.semValor ? ' (parcial)' : '') : ''; };
  const aConferir = p => { const n = contagem.get(String(p.chave)); return n ? n.os - n.confirmadas : 0; };
  const selinho = p => { const n = aConferir(p); return n ? `<span class="perf-a-conferir">${n} a conferir</span>` : ''; };
  const entregasTxt = p => `${p.entregas} ${p.entregas === 1 ? 'entrega' : 'entregas'}`;
  const foto = (p, cls) => `<span class="${cls} perf-foto">${avatarRH(pessoasRH().find(x => [x.chave, x.id].includes(p.chave)) || {nome: p.nome})}</span>`;
  const selo = p => {
    const eqs = perfEquipeDaPessoa(p.chave, c.equipes);
    if (!eqs.length) return '';
    return `<span class="perf-selo-equipe${perfCorClasse(eqs[0])}" title="${esc(eqs.map(e => e.nome).join(', '))}">${perfLogoHTML(eqs[0], 'perf-selo-logo')}${esc(eqs[0].nome)}${eqs.length > 1 ? ` +${eqs.length - 1}` : ''}</span>`;
  };
  // A composição da nota, dita, para ninguém ter de adivinhar de onde veio.
  const partes = p => geral ? ['nota', 'producao', 'valor'].map(k => `<span class="perf-crit" title="${{nota:'Nota atual, com seus pesos',producao:'Produção confirmada proporcional ao líder',valor:'Valor confirmado proporcional ao líder'}[k]} · um terço do Geral">${{nota:'Nota',producao:'Produção',valor:'Valor'}[k]} <b>${fmt(p.componentesGeral[k])}</b></span>`).join('') : ['producao', 'limpeza', 'equipamentos'].filter(k => av.pesos[k] > 0).map(k => {
    const v = p.componentes[k];
    const media = (p.imputados || []).includes(k);
    const n = k === 'producao' ? null : p[k].n;
    // Voltas da pessoa, não O.S.: três serviços na mesma viagem são uma volta.
    const nv = p.voltas ?? p.entregas;
    const dica = k === 'producao' ? '' : ` · ${n} de ${nv} ${nv === 1 ? 'volta conferida' : 'voltas conferidas'}${n < nv && v != null ? '; as outras contam pela média do período' : ''}`;
    return `<span class="perf-crit ${v == null ? 'sem' : ''} ${media ? 'media' : ''}" title="${esc(rotulos[k])} · peso ${av.pesos[k]}%${dica}">${esc(curtos[k])} <b>${v == null ? 'fora' : fmt(v)}</b>${media ? '<i>média</i>' : (n != null && v != null && n < nv ? `<i>${n}/${nv}</i>` : '')}</span>`;
  }).join('');
  const detalhe = p => comNota
    ? `<div class="perf-crits">${partes(p)}</div>${(p.imputados || []).length ? `<small class="perf-parcial">sem volta conferida em ${p.imputados.map(k => PERF_CRIT_ROTULO[k].toLowerCase()).join(' e ')}: usa a média do período</small>` : ''}`
    : `<small class="perf-sub">${p.entregas} ${p.entregas === 1 ? 'entrega' : 'entregas'} · ${fmt(p.peso)} ${p.peso === 1 ? 'equivalente' : 'equivalentes'}${p.pesoConferido < p.peso ? ` · ${fmt(p.pesoConferido)} ${p.pesoConferido === 1 ? 'confirmada' : 'confirmadas'}` : ''}</small>`;
  const {podio, resto} = perfCortarPodio(linhas);
  const acoes = p => `<button type="button" class="inline-link" data-perf-pessoa="${esc(p.chave)}">Ver entregas</button>`;
  const situacao = perfSituacao(regs);
  const podioHTML = perfPodioHTML(podio.map(p => ({
    posicao: p.posicao, nome: p.nome, visual: foto(p, 'perf-podio-foto'), selo: selo(p),
    numero: numero(p), unidade: rotulo(p),
    linha: esc(entregasTxt(p)) + (medida !== 'valor' && valorTxt(p) ? ' · ' + esc(valorTxt(p)) : ''),
    aviso: selinho(p),
    // No pódio, só os três critérios (a nota de "usa a média" está na etiqueta "média" de cada um).
    extra: comNota ? `<div class="perf-crits">${partes(p)}</div>` : '',
    acoes: acoes(p),
  })), {
    rotulo: 'Pódio do ranking individual',
    classe: situacao && situacao.tipo === 'parcial' ? 'perf-podio-parcial' : '',
    animar: perfAnimarPodio(['pessoas', medida, perfChave(), ...podio.map(p => p.chave + ':' + p.posicao)].join('|')),
  });
  /* A TABELA DO 4º EM DIANTE (ou de todos, quando o empate não cabe no pódio):
     a barra mostra a distância para o 1º, na cor da equipe da pessoa. */
  const topo = linhas.reduce((m, p) => Math.max(m, Number(medidaDe(p)) || 0), 0);
  const colMedida = medida === 'valor' ? 'Valor confirmado' : (medida === 'peso' ? 'Produção' : geral ? 'Geral' : 'Nota');
  const comValor = medida !== 'valor';
  const posTxt = p => PERF_MEDALHAS[p.posicao] ? `<span aria-hidden="true">${PERF_MEDALHAS[p.posicao]}</span><span class="perf-sr">${p.posicao}º</span>` : `${p.posicao}º`;
  const linhaHTML = p => {
    const eqs = perfEquipeDaPessoa(p.chave, c.equipes);
    return `<tr>
      <td class="perf-td-pos">${posTxt(p)}</td>
      <td class="perf-td-quem"><div class="perf-quem">${foto(p, 'perf-tab-foto')}<div class="perf-quem-txt"><strong>${esc(p.nome)}</strong>${selo(p)}${detalhe(p)}</div></div></td>
      <td class="perf-td-medida" data-rot="${colMedida}"><div class="perf-medida">${perfBarraHTML(topo > 0 ? medidaDe(p) / topo : 0, perfCorClasse(eqs[0]))}<strong>${esc(numero(p))}</strong></div>${medida === 'valor' && semValorP(p) ? `<small class="perf-parcial">parcial (${semValorP(p)} sem valor)</small>` : ''}</td>
      <td class="perf-td-num" data-rot="Entregas"><b>${p.entregas}</b>${selinho(p)}</td>
      ${comValor ? `<td class="perf-td-num" data-rot="Valor confirmado">${valorTxt(p) ? esc(valorTxt(p)) : '<span class="perf-nada">sem valor confirmado</span>'}</td>` : ''}
      <td class="perf-td-acao">${acoes(p)}</td>
    </tr>`;
  };
  const tabela = resto.length ? `<div class="perf-tabela-wrap"><table class="perf-tabela">
      <caption class="perf-sr">Ranking individual por ${colMedida.toLowerCase()}${podio.length ? `, do ${podio.length + 1}º lugar em diante` : ''}</caption>
      <thead><tr><th scope="col" class="perf-th-pos">Pos.</th><th scope="col">Pessoa</th><th scope="col" class="perf-th-medida">${colMedida}${comNota ? ' <small>(0 a 100)</small>' : medida === 'peso' ? ' <small>(O.S. equivalentes)</small>' : ' <small>(rateado)</small>'}</th><th scope="col" class="perf-th-num">Entregas</th>${comValor ? '<th scope="col" class="perf-th-num">Valor confirmado</th>' : ''}<th scope="col"><span class="perf-sr">Ações</span></th></tr></thead>
      <tbody>${resto.map(linhaHTML).join('')}</tbody></table></div>` : '';
  const pode = perfPodeEditar();
  /* Quanto da conferência existe, dito por critério. Abaixo de 80% o critério
     fica fora da nota de todos, e isso muda a nota: fica À VISTA, não dentro
     do "Como a nota é calculada". A cobertura que está boa vai lá dentro. */
  const voltas = n => `${n} ${n === 1 ? 'volta' : 'voltas'}`;
  const crits = ['limpeza', 'equipamentos'].filter(k => av.pesos[k] > 0 && av.cobertura[k].voltas);
  const mesmaConta = crits.length === 2 && av.cobertura.limpeza.conferidas === av.cobertura.equipamentos.conferidas;
  const grupos = mesmaConta ? [crits] : crits.map(k => [k]);
  const coberturaOk = [], coberturaFora = [];
  for (const ks of grupos) {
    const cb = av.cobertura[ks[0]];
    const rot = ks.map((k, i) => i ? PERF_CRIT_ROTULO[k].toLowerCase() : PERF_CRIT_ROTULO[k]).join(' e ');
    const plural = ks.length > 1;
    if (cb.ok) { coberturaOk.push(`${rot}: ${cb.conferidas} de ${voltas(cb.voltas)} com resposta.`); continue; }
    const precisa = Math.ceil(cb.voltas * av.coberturaMinima);
    coberturaFora.push(fechada
      ? `${rot} ${plural ? 'ficaram' : 'ficou'} fora da nota nesta revisão: só ${cb.conferidas} de ${voltas(cb.voltas)} tinham resposta quando o período foi fechado.`
      : `${rot} ${plural ? 'estão' : 'está'} FORA da nota de todos: a conferência cobriu ${cb.conferidas} de ${voltas(cb.voltas)} (precisa de ${precisa}).`);
  }
  const pesosTxt = ['producao', 'limpeza', 'equipamentos'].map(k => `${rotulos[k]} ${av.pesos[k]}%`).join(' · ');
  const vazio = !av.pessoas.length
    ? '<p class="perf-rank-vazio">Nenhuma entrega com participantes neste período.</p>'
    : (!linhas.length ? `<p class="perf-rank-vazio">${medida === 'valor' ? 'Ninguém tem valor CONFIRMADO neste período ainda. Confirme as participações na lista abaixo.' : 'Sem dado suficiente para a nota neste período.'}</p>` : '');
  const lead = geral ? 'Geral de 0 a 100 · (Nota + Produção + Valor) ÷ 3 · mesma importância para os três'
    : medida === 'nota'
    ? `Nota de 0 a 100 · ${fechada ? 'pesos desta revisão: ' : ''}${esc(pesosTxt)}`
    : medida === 'peso' ? 'Soma do peso de cada um nas entregas. Aparecer em mais entregas divididas não soma mais que fazer o mesmo sozinho.'
    : 'Valor das entregas rateado pelo peso de cada um. Só participações confirmadas. Não é bônus.';
  const como = geral ? `<details class="perf-como"><summary>Como o Geral é calculado</summary><div>
      <p>A Nota é mantida exatamente como está, com ${fechada ? 'os pesos desta revisão' : 'os pesos atuais'}: ${esc(pesosTxt)}. Produção usa as O.S. equivalentes confirmadas, respeitando o percentual de participação e as entregas parciais. Valor usa o valor líquido confirmado e rateado.</p>
      <p>Produção e Valor são convertidos para a escala de 0 a 100: o maior resultado de cada critério vale 100, e os demais são proporcionais. Geral = (Nota + Produção + Valor) ÷ 3. Cada componente vale um terço. Exemplo: Nota 90, Produção 60 e Valor 75 resultam em Geral 75.</p>
      <p>${porValor ? 'Como a Nota atual já considera Valor entregue, o valor participa tanto dentro da Nota quanto como componente próprio do Geral.' : 'A Nota histórica continua usando a regra preservada no fechamento; a produção também participa como componente próprio do Geral.'} Os três resultados aparecem em cada pessoa para conferir a composição.</p>
      <p>Sem Nota ou sem valor confirmado, a pessoa fica fora do Geral, sem receber zero. Valores parcialmente conhecidos continuam sujeitos à conferência. Carro e equipamentos mantêm a regra de cobertura da Nota. Este comparativo não modifica a Nota, fechamentos, comissões ou prêmios.</p>
    </div></details>` : medida === 'nota' ? `<details class="perf-como"><summary>Como a nota é calculada</summary><div>
      <p>${porValor ? 'Valor entregue é o valor líquido dos itens realmente entregues, rateado pela participação confirmada de cada pessoa. Quem tem o maior valor confirmado no período recebe 100 nesse critério; os demais recebem proporcionalmente. Com os pesos 60/20/20, entregar metade do valor do líder soma 30 pontos; carro e equipamentos podem somar mais 20 cada. Entregas não confirmadas ou com valor ausente ou conflitante não somam valor; quem não tem nenhum valor confirmado fica fora da nota.' : 'Esta revisão preserva a regra antiga: Produção conta o PESO de cada um em cada entrega. Seis entregas divididas ao meio valem três; quem mais produziu no período vale 100.'} Carro e equipamentos vêm da conferência da volta; volta sem resposta conta pela média do período.</p>
      <p>Carro e equipamentos só entram na nota quando pelo menos 80% das voltas do período têm resposta. Abaixo disso, o critério fica fora e os pesos disponíveis são redistribuídos.${coberturaOk.length ? ' ' + esc(coberturaOk.join(' ')) : ''}</p>
      <p>Nos detalhes de cada pessoa, "7/8" são as voltas dela que foram conferidas e "média" quer dizer que nenhuma foi; "fora" é critério que não entrou na nota.</p>
    </div></details>` : '';
  return `<section class="perf-ranking${STATE._perfLayout==='lista'?' perf-ranking-lista':''}" aria-labelledby="perf-rank-titulo">
    <header class="perf-ranking-head">
      <div class="perf-ranking-titulo"><h3 id="perf-rank-titulo">Ranking individual</h3>${perfSituacaoHTML(situacao)}</div>
      <div class="perf-ranking-ctrl">
        ${perfSegHTML(medida, [['geral', 'Geral'], ['valor', 'Valor'], ['peso', 'Produção'], ['nota', 'Nota']], 'perf-pessoa-medida', 'Ordenar o ranking por')}
        ${pode && !fechada ? '<button type="button" class="btn-ghost btn-sm" id="perf-criterios">⚖️ Pesos da nota</button>' : ''}
      </div>
    </header>
    <p class="perf-ranking-lead">${lead}</p>
    ${comNota && coberturaFora.length ? `<p class="perf-aviso">${esc(coberturaFora.join(' '))}</p>` : ''}
    ${porValor && comNota && av.pessoas.some(p => p.entregasSemValor > 0) ? '<p class="perf-aviso">Há entregas confirmadas sem valor válido. A nota usa somente os valores já conferidos e pode mudar quando as pendências forem resolvidas.</p>' : ''}
    ${como}
    ${vazio}
    ${podioHTML}
    ${tabela}
    ${fora.length ? `<p class="perf-rank-nota">${fora.length} ${fora.length === 1 ? 'pessoa fica' : 'pessoas ficam'} fora deste ranking por falta de dado, e não com zero: ${fora.map(p => esc(p.nome)).join(', ')}.</p>` : ''}
  </section>`;
}
function perfEditarCriterios() {
  if (!perfPodeEditar()) return;
  const atual = perfCriterios();
  const d = perfDialog('Pesos da nota', `<form id="perf-crit-form">
    <p>Quanto cada critério vale na nota de 0 a 100. Os três somam 100.</p>
    ${['producao', 'limpeza', 'equipamentos'].map(k => `<label class="perf-peso"><span>${esc(PERF_CRIT_ROTULO[k])}</span><input type="number" name="${k}" min="0" max="100" step="1" required value="${atual[k]}"><span>%</span></label>`).join('')}
    <p id="perf-crit-soma" aria-live="polite"></p>
    <p class="metricas-nota">Valor entregue é o valor líquido dos itens entregues, rateado pela participação confirmada de cada pessoa e comparado com o maior valor confirmado do período. Quantidade de O.S. não entra nesse critério. Sem nenhum valor confirmado, a pessoa fica fora da nota. Carro (limpo e arrumado) e equipamentos são a parte das voltas conferidas pela gestão que saiu certa; a conferência se faz em PCP › Volta do carro. Volta sem resposta conta pela média do período: ninguém perde nem ganha por a conferência não ter sido feita. O critério só entra na nota quando pelo menos 80% das voltas do período têm resposta; abaixo disso fica fora da nota de todos.</p>
    <button class="btn-primary" type="submit">Salvar pesos</button>
  </form>`);
  const f = d.querySelector('form'), soma = d.querySelector('#perf-crit-soma');
  const ler = () => Object.fromEntries(['producao', 'limpeza', 'equipamentos'].map(k => [k, Number(f.elements[k].value)]));
  const conferir = () => { const v = ler(), t = v.producao + v.limpeza + v.equipamentos; soma.textContent = `Soma: ${t}%${t === 100 ? '' : ': precisa dar 100'}`; return t === 100; };
  f.oninput = conferir; conferir();
  f.onsubmit = ev => {
    ev.preventDefault();
    if (!conferir()) return;
    const v = ler();
    if (Object.values(v).some(n => !Number.isInteger(n) || n < 0 || n > 100)) return toast('Use números inteiros de 0 a 100.', 'error');
    const cfg = perfConfig(); cfg.criterios = v; perfSalvar(cfg); d.close(); renderPerformanceCasa();
  };
}

/* ------------------------------------------------------------ RANKING
 * Pedido do dono (23/09/2026): "deixar mais enxuto essa parte das equipes ...
 * poder editar as equipes e colocar nomes e logos ... e criar o ranking
 * deixando bem bacana". Os cards antigos repetiam cinco linhas de conferência
 * em cada equipe; o ranking mostra a posição, a cara da equipe e o número, e
 * deixa a conferência para a lista de entregas, que já existe logo abaixo.
 *
 * Duas medidas: ENTREGAS (cada O.S. conta uma vez na equipe, confirmada ou
 * sugerida) e VALOR (só o que já foi confirmado). Equipe sem valor confirmado
 * NÃO entra no ranking de valor como zero: fica listada à parte, dizendo que
 * falta confirmar. */
const PERF_MEDALHAS = {1: '🥇', 2: '🥈', 3: '🥉'};
/* O PÓDIO É CORTADO PELA POSIÇÃO, não pela ordem da lista. Com cinco empatados
   em 1º, os três primeiros em ordem alfabética ganhavam medalha e card grande e
   os outros dois iam para a lista miúda — a diferença que os números não
   mostram. Se os que cabem no pódio (posição 1 a 3) forem mais de três, não há
   pódio: todos vão para a lista, com a mesma posição e a mesma medalha. */
function perfCortarPodio(linhas) {
  const cabem = linhas.filter(l => l.posicao <= 3);
  if (cabem.length > 3) return {podio: [], resto: linhas};
  return {podio: cabem, resto: linhas.slice(cabem.length)};
}
let perfUltimoRanking = new Map();
function perfRankingEquipesHTML(regs, c) {
  const medida = ['valor','entregas','producao'].includes(STATE._perfRankMedida) ? STATE._perfRankMedida : 'valor';
  const vis = PERF.comEquipes(regs, c.equipes, perfOpcoesEquipe());
  const todas = PERF.resumir(vis).equipes;
  const confirmadas = PERF.resumir(vis.filter(r => r.confirmado).map(r => ({...r, valor: !r.avisoValor && Number.isFinite(r.valor) && r.valor >= 0 ? r.valor : null}))).equipes;
  const valorDe = new Map(confirmadas.map(x => [x.chave, x]));
  const pode = perfPodeEditar();
  let linhas, semValor = [];
  if (medida === 'valor') {
    const comValor = todas.filter(x => { const v = valorDe.get(x.chave); return v && v.os > v.semValor; });
    semValor = todas.filter(x => !comValor.includes(x));
    linhas = PERF.ranquear(comValor.map(x => ({...x, valorConf: valorDe.get(x.chave).valor})), x => Math.round(x.valorConf * 100));
  } else if (medida === 'producao') {
    linhas = PERF.ranquear(confirmadas.filter(x=>x.equivalentes>0), x => Math.round(x.equivalentes*1e8)/1e8);
  } else {
    linhas = PERF.ranquear(todas, x => x.os);
  }
  const numero = x => medida === 'valor' ? dinheiroCasa(x.valorConf) : medida === 'producao' ? perfFormato(x.equivalentes) : String(x.os);
  const semValorDe = x => { const v = valorDe.get(x.chave); return v ? v.semValor : 0; };
  const rotulo = x => medida === 'producao' ? 'O.S. equivalentes confirmadas' : medida === 'valor' ? ('confirmado' + (semValorDe(x) ? ` · parcial (${semValorDe(x)} sem valor)` : '')) : (x.os === 1 ? 'entrega' : 'entregas');
  // A outra medida, pequena, embaixo do número: no modo Entregas, o valor (só o confirmado).
  const linha = x => {
    if (medida === 'valor') return `${x.confirmadas} ${x.confirmadas === 1 ? 'entrega confirmada' : 'entregas confirmadas'}`;
    const v = valorDe.get(x.chave);
    if (!v) return 'valor a conferir';
    return v.os > v.semValor ? esc(dinheiroCasa(v.valor)) + ' confirmado' + (v.semValor ? ' (parcial)' : '') : 'sem valor nas confirmadas';
  };
  const aConferir = x => x.os > x.confirmadas ? `<span class="perf-a-conferir">${x.os - x.confirmadas} a conferir</span>` : '';
  /* Equipe salva mostra os integrantes do CADASTRO; a primeira entrega do
     período pode ter tido um ajudante avulso que não é da equipe. Os rostos
     vêm da ficha do RH (foto quando há), pelo ID de hoje de cada um. */
  const membrosDe = x => { const e = c.equipes.find(q => q.id === x.chave); return (e && e.membros) || x.membros || []; };
  const membrosTxt = x => membrosDe(x).map(m => esc(m.nome)).join(' · ');
  const rh = typeof pessoasRH === 'function' ? pessoasRH() : [];
  const fichaDe = m => { const id = String(perfIdMembro(m)); return rh.find(p => String(p.id) === id || String(p.chave) === id || String(p.chave) === String(m.chave)); };
  const rostos = x => { const ms = membrosDe(x); return ms.length ? `<span class="perf-rostos" aria-hidden="true">${ms.slice(0, 5).map(m => avatarRH(fichaDe(m) || {nome: m.nome}, 'mini')).join('')}${ms.length > 5 ? `<span class="perf-rostos-mais">+${ms.length - 5}</span>` : ''}</span>` : ''; };
  const acoes = x => {
    const ver = `<button type="button" class="inline-link" data-perf-fonte-medida="${medida}" data-perf-grupo="${esc(x.chave)}">Ver entregas</button>`;
    if (!pode) return ver;
    const salva = c.equipes.find(e => e.id === x.chave);
    return ver + (salva
      ? ` <button type="button" class="inline-link" data-perf-equipe="${esc(salva.id)}">Editar</button>`
      : ` <button type="button" class="inline-link perf-nomear" data-perf-nomear="${esc(x.chave)}">Dar nome e logo</button>`);
  };
  const apelido = x => x.salva ? '' : `<small class="perf-sem-nome">${(x.membros || []).length > 1 ? 'composição sem nome' : 'individual'}</small>`;
  perfUltimoRanking = new Map(todas.map(x => [x.chave, x.membros || []]));
  const {podio, resto} = perfCortarPodio(linhas);
  const lider=linhas[0];
  const medidaDe=x=>medida==='valor'?x.valorConf:medida==='producao'?x.equivalentes:x.os;
  const conquista=x=>{
    const original=todas.find(t=>t.chave===x.chave), completa=original&&original.os>0&&original.confirmadas===original.os;
    const distancia=lider?Math.max(0,medidaDe(lider)-medidaDe(x)):0;
    const txt=distancia<1e-8?'Liderança neste recorte':`${medida==='valor'?dinheiroCasa(distancia):perfFormato(distancia)} ${medida==='producao'?'O.S. equivalente(s)':medida==='entregas'?'entrega(s)':''} até a liderança`;
    return `<div class="perf-conquistas"><span>${esc(txt)}</span>${completa?'<span class="ok">✓ Participações conferidas</span>':''}</div>`;
  };
  const situacao = perfSituacao(regs);
  // A cor e o animal da equipe fixa: a cor só como classe da paleta, uma vez por equipe.
  const podioHTML = perfPodioHTML(podio.map(x => ({
    posicao: x.posicao, nome: x.nome, visual: perfLogoHTML(x, 'perf-podio-logo'), classe: perfCorClasse(x), selo: apelido(x),
    numero: numero(x), unidade: rotulo(x), linha: linha(x),
    aviso: aConferir(x) + conquista(x),
    extra: rostos(x) + `<p class="perf-podio-membros">${x.salva ? membrosTxt(x) : ''}</p>`,
    acoes: acoes(x),
  })), {
    rotulo: 'Pódio das equipes',
    classe: 'perf-podio-equipes' + (situacao && situacao.tipo === 'parcial' ? ' perf-podio-parcial' : ''),
    animar: perfAnimarPodio(['equipes', medida, perfChave(), ...podio.map(x => x.chave + ':' + x.posicao)].join('|')),
  });
  /* DO 4º EM DIANTE, UM CARTÃO POR EQUIPE: a faixa na cor da equipe, a logo
     grande, os rostos de quem é da equipe, o número e a distância para o 1º. */
  const topo = linhas.reduce((m, x) => Math.max(m, Number(medida === 'valor' ? x.valorConf : medida === 'producao' ? x.equivalentes : x.os) || 0), 0);
  const cartoes = resto.length ? `<ol class="perf-equipes-cartoes" aria-label="Equipes${podio.length ? `, do ${podio.length + 1}º lugar em diante` : ''}">${resto.map(x => `<li class="perf-equipe-cartao${perfCorClasse(x)}">
      <div class="perf-cartao-topo"><span class="perf-cartao-pos">${PERF_MEDALHAS[x.posicao] ? `<span aria-hidden="true">${PERF_MEDALHAS[x.posicao]}</span><span class="perf-sr">${x.posicao}º lugar</span>` : `${x.posicao}º`}</span>${perfLogoHTML(x, 'perf-cartao-logo')}<div class="perf-cartao-nome ${x.salva ? '' : 'sem-nome'}"><h4>${esc(x.nome)}</h4>${apelido(x)}</div></div>
      <p class="perf-cartao-num"><strong>${esc(numero(x))}</strong> <span>${esc(rotulo(x))}</span></p>
      ${perfBarraHTML(topo > 0 ? (medida === 'valor' ? x.valorConf : medida === 'producao' ? x.equivalentes : x.os) / topo : 0)}
      <p class="perf-cartao-linha">${linha(x)} ${aConferir(x)}</p>${conquista(x)}
      <div class="perf-cartao-rodape"><div class="perf-cartao-gente">${rostos(x)}${x.salva ? `<small>${membrosTxt(x)}</small>` : ''}</div>
      <div class="perf-cartao-acoes">${acoes(x)}</div></div>
    </li>`).join('')}</ol>` : '';
  // Equipes cadastradas que não aparecem no ranking deste período: ainda
  // precisam de um lugar para serem vistas e editadas.
  const noRanking = new Set(todas.map(x => x.chave));
  const paradas = c.equipes.filter(e => !noRanking.has(e.id) && e.ativo !== false);
  const desativadas = c.equipes.filter(e => !noRanking.has(e.id) && e.ativo === false);
  const vazio = !todas.length
    ? '<p class="perf-rank-vazio">Nenhuma entrega com equipe registrada neste período. Quando a O.S. tiver equipe e for finalizada, ela aparece aqui.</p>'
    : (medida === 'valor' && !linhas.length
      ? '<p class="perf-rank-vazio">Nenhuma equipe tem valor CONFIRMADO neste período ainda. O ranking por valor só usa participações conferidas. Confirme na lista de entregas abaixo.</p>'
      : '');
  return `<section class="perf-ranking${STATE._perfLayout==='lista'?' perf-ranking-lista':''}" aria-labelledby="perf-rank-titulo">
    <header class="perf-ranking-head">
      <div class="perf-ranking-titulo"><h3 id="perf-rank-titulo">Ranking das equipes</h3>${perfSituacaoHTML(situacao)}</div>
      <details class="perf-ranking-opcoes"><summary>${medida==='producao'?'Produção confirmada':medida==='valor'?'Valor confirmado':'Entregas'} · opções</summary><div class="perf-ranking-ctrl">
        ${perfSegHTML(medida, [['valor', 'Valor confirmado'], ['producao', 'Produção confirmada'], ['entregas', 'Entregas']], 'perf-rank-medida', 'Ordenar o ranking por')}
        ${perfSegHTML(STATE._perfLayout==='lista'?'lista':'cards', [['cards','Cards'],['lista','Lista compacta']], 'perf-layout', 'Formato do ranking')}
        ${pode ? '<button type="button" class="btn-ghost btn-sm" id="perf-nova-equipe">+ Nova equipe</button>' : ''}
      </div></details>
    </header>
    ${medida==='producao'&&!linhas.length?'<p class="perf-rank-vazio">A corrida começa com a primeira entrega conferida. Confira os itens e a equipe para aparecer aqui.</p>':''}

    ${vazio}
    ${podioHTML}
    ${cartoes}
    <p class="perf-ranking-lead">${medida==='producao'?'O que a equipe realmente entregou, proporcional aos itens e à sua participação. Só entram divisões confirmadas.':medida==='valor'?'Maior valor entregue confirmado primeiro. Valor líquido, dividido entre as equipes; só há empate com o mesmo valor em centavos.':'Quantidade de registros de entrega, incluindo sugestões. Uma mesma O.S. pode ter várias parciais.'}</p>
    <details class="perf-method"><summary>Como funciona esta classificação</summary><p>A classificação padrão vai do maior para o menor valor líquido entregue confirmado, respeitando o rateio entre equipes. Valores iguais até os centavos compartilham a posição. Na opção Produção, a medida usa O.S. equivalentes: duas parciais de 25% e 75% somam uma O.S., não duas. Se duas equipes dividem o serviço, cada uma leva sua parte, somada às suas outras entregas. Na conferência da entrega, selecione as equipes e seus percentuais (total de 100%). Pessoas avulsas não são transferidas automaticamente para uma equipe; confira a divisão para definir o destino. Valores ausentes não viram zero; sugestões aguardam confirmação. Este ranking operacional não define sozinho a comissão ou os prêmios. Empates recebem a mesma posição.</p></details>
    ${semValor.length ? `<p class="perf-rank-nota">${semValor.length} equipe${semValor.length === 1 ? '' : 's'} com entrega mas sem valor confirmado ficam fora deste ranking, e não como zero.</p>` : ''}
    ${paradas.length ? `<div class="perf-equipes-paradas"><span>Sem entregas vinculadas no período:</span>${paradas.map(e => `<button type="button" class="perf-equipe-chip${perfCorClasse(e)}" ${pode ? `data-perf-vinculos="${esc(e.id)}"` : 'disabled'}>${perfLogoHTML(e, 'perf-chip-logo')} ${esc(e.nome)}</button>`).join('')}</div>` : ''}
    ${desativadas.length ? `<div class="perf-equipes-paradas perf-desativadas"><span>Desativadas:</span>${desativadas.map(e => `<button type="button" class="perf-equipe-chip${perfCorClasse(e)}" ${pode ? `data-perf-equipe="${esc(e.id)}"` : 'disabled'}>${perfLogoHTML(e, 'perf-chip-logo')} ${esc(e.nome)}</button>`).join('')}</div>` : ''}
  </section>`;
}

/* ------------------------------------------------------- A ABA EQUIPE
 * A ORDEM DA PÁGINA (revisão de experiência, 29/09/2026): o período, UMA
 * faixa de qualidade dos dados, o ranking (pódio e tabela), a conferência de
 * cada entrega e, no fim (casa.js), Base e fechamento. Os cartões antigos de
 * pessoa e as sugestões de equipe eram montados aqui e nunca exibidos: saíram.
 */
function perfJornadaHTML(regs,c) {
  const a=PERF.auditar(regs), ativas=c.equipes.filter(e=>e.ativo!==false), per=periodoOuMes('_fPerf');
  const etapa=(titulo,feito,total,dica)=>`<div class="perf-jornada-etapa"><span>${titulo}</span><strong>${feito}<small> / ${total}</small></strong><progress value="${feito}" max="${Math.max(1,total)}" aria-label="${titulo}"></progress><small>${dica}</small></div>`;
  return `<section class="perf-jornada" aria-label="Jornada das equipes"><header><div><span class="perf-jornada-kicker">IMPRESILK · CADA ENTREGA CONTA</span><h3>Capricho na entrega. Orgulho da equipe.</h3><p>${esc(per.de.split('-').reverse().join('/'))} a ${esc(per.ate.split('-').reverse().join('/'))} · ${a.total} entregas em ${a.os} O.S.${a.parciais?` · ${a.parciais} por seleção de itens`:''}</p></div><span class="perf-jornada-selo">${perfFonteAtual()?.fechadoEm?'Revisão preservada':'Apuração em andamento'}</span></header>
    ${!ativas.length?`<div class="perf-proximo"><p><strong>Primeiro passo: dar identidade às equipes.</strong> Ainda não há equipes fixas cadastradas. As composições avulsas continuam visíveis no ranking.</p>${perfPodeEditar()?'<button type="button" class="btn-primary btn-sm" data-perf-criar-equipe>Cadastrar equipe</button>':''}</div>`:''}
    <details class="perf-programa"><summary>Progresso da conferência e programa de reconhecimento</summary><div class="perf-jornada-etapas">${etapa('Participação confirmada',a.confirmadas,a.total,'Quem entregou e quanto fez')}${etapa('Valores identificados',a.total-a.semValor,a.total,'Base líquida para a conferência')}${etapa('Voltas conferidas',a.voltasConferidas,a.voltas,a.voltas?'Carro, organização, equipamentos e avarias':'Nenhuma volta aplicável no período')}</div><p>Outubro de 2026 é teste. Início efetivo em novembro, prêmios, rateio interno, trios e desempates dependem de configuração explícita e validação da gestão. Participações confirmadas não significam todos os itens entregues nem qualidade comprovada.</p><p>Comissão prevista: 1% do serviço efetivamente entregue. Retrabalho, retorno por serviço incompleto e má condução comprovada zeram os pontos e a comissão da O.S. afetada. O regulamento e as ocorrências precisam estar conferidos antes da apuração final.</p><p>O repasse de 20% para a montagem interna sem retrabalho e a divisão de 60%/40% do restante precisam constar da apuração financeira. Esta classificação operacional não libera pagamentos nem determina os premiados.</p></details>
  </section>`;
}
function perfAuditoriaHTML(regs) {
  const a=PERF.auditar(regs), pode=perfPodeEditar()&&!perfFonteAtual()?.fechadoEm;
  return `<details class="perf-auditoria" ${a.pendencias.length?'open':''}><summary>Conferência dos lançamentos · ${a.pendencias.length?`${a.pendencias.length} pontos de atenção`:'sem pendência nas verificações automáticas'}</summary><p>Confere participantes, valores, repetição de registros, parciais e volta do carro. Não substitui a verificação do serviço entregue.</p>${a.pendencias.length?`<ul>${a.pendencias.map(p=>`<li><span><strong>O.S. ${esc(p.numero||'a conferir')}</strong> · ${esc(p.motivo)}</span>${pode&&regs.some(r=>r.id===p.id)?`<button type="button" class="inline-link" ${p.tipo==='volta'?'data-perf-audit-volta':['sem-valor','valor-erp'].includes(p.tipo)?'data-perf-os':'data-perf-audit-id'}="${esc(p.id)}">${p.tipo==='volta'?'Conferir volta':['sem-valor','valor-erp'].includes(p.tipo)?'Ver origem':'Conferir entrega'}</button>`:''}</li>`).join('')}</ul>`:'<p>As informações disponíveis estão consistentes nesses critérios. O fechamento continua sujeito à revisão da gestão.</p>'}</details>`;
}
// Gestão atual e associação histórica são atos distintos.
function perfGestaoEquipesHTML(){
 const c=perfConfig(),f=periodoOuMes('_fPerf'),fonte=perfFonteAtual(),regs=fonte?.registros || [];
 return `<section class="perf-gestao"><h3>Gestão de equipes</h3><p>Cadastros atuais. Entregas confirmadas só mudam de equipe por conferência explícita; integrantes e revisões históricas são preservados.</p><div class="perf-filtros"><label>Pesquisar equipe <input type="search" id="perf-gestao-busca" placeholder="Nome ou integrante"></label><label>Situação <select id="perf-gestao-status"><option value="">Ativas e inativas</option><option value="ativa">Ativas</option><option value="inativa">Inativas</option></select></label><button class="btn-primary" data-perf-criar-equipe>+ Nova equipe</button></div><details><summary>Período dos vínculos · ${esc(f.de)} a ${esc(f.ate)}</summary>${filtroPeriodoHTML('_fPerf')}</details><p role="status">${fonte?esc(perfFonteTexto()):perfRemoto.erro?'Consulta de vínculos indisponível. O cadastro continua disponível.':'Consultando vínculos. O cadastro abaixo já está disponível.'}</p>${perfAvisosHTML(true)}<div class="perf-gestao-lista">${c.equipes.map(e=>{const n=regs.filter(r=>r.confirmado&&PERF.gruposDoRegistro(r).some(g=>g.equipeId===e.id)).length;return `<article class="perf-gestao-equipe" data-gestao-status="${e.ativo===false?'inativa':'ativa'}"><header>${perfLogoHTML(e,'perf-logo-grande')}<div><h4>${esc(e.nome)}</h4><span>${e.ativo===false?'Inativa':'Ativa'} · ID ${esc(e.id)}</span></div></header><p>${e.membros.map(m=>`${esc(m.nome)} · ID ${esc(m.chave)}`).join('<br>')}</p><p>Líder: ${esc(e.liderPadraoId?OPERACAO.nomePessoa(e.liderPadraoId):'a definir')}. ${esc(perfAvisoEmDuas(c.equipes,e.id)||'')}</p>${e.membros.some(m=>!/^\d{6}$/.test(m.chave))?'<p class="aloc-aviso">Há integrante sem identidade confirmada. Confira PCP × RH.</p>':''}<p>${!fonte?(perfRemoto.erro?'Consulta de vínculos indisponível':'Vínculos em consulta'):n?`${n} entrega(s) confirmada(s) vinculada(s)`:'Sem entregas vinculadas no período. Criar o cadastro não associa as entregas anteriores; isso não significa que a equipe não trabalhou.'}</p><button class="btn-ghost" data-perf-equipe="${esc(e.id)}">Editar cadastro</button><button class="btn-primary" data-perf-vinculos="${esc(e.id)}" ${!fonte?'disabled':''}>Conferir vínculos</button></article>`;}).join('') || '<p>Nenhuma equipe cadastrada.</p>'}</div></section>`;
}
function perfConferirVinculos(equipeId){
 const e=perfConfig().equipes.find(x=>x.id===equipeId),f=perfFonteAtual();if(!e||!f)return;
 const ids=e.membros.map(m=>String(m.chave)).sort().join('|');
 const regs=f.registros, candidatos=regs.flatMap(r=>PERF.gruposDoRegistro(r).map((g,i)=>({r,g,i,exato:g.membros.map(m=>String(m.chave)).sort().join('|')===ids}))).sort((a,b)=>Number(b.exato)-Number(a.exato)||Number(!!a.g.equipeId)-Number(!!b.g.equipeId)||String(b.r.dia).localeCompare(String(a.r.dia)));
 const exatos=candidatos.filter(x=>x.exato).length,ambiguas=perfConfig().equipes.filter(x=>x.ativo!==false&&x.membros.map(m=>String(m.chave)).sort().join('|')===ids).length;
 const d=perfDialog('Conferir vínculos · '+e.nome,`<p>Confira uma entrega por vez. A associação preserva pessoas, percentuais, itens e datas. Não transfere todas as entregas da composição.</p>${f.fechadoEm?'<p class="aloc-aviso">Revisão fechada: somente leitura. Selecione Dados atuais em Base e fechamento para criar nova associação.</p>':''}${e.ativo===false?'<p class="aloc-aviso">Equipe inativa. Reative o cadastro antes de associar uma entrega.</p>':''}<p>${exatos} grupo(s) com os mesmos IDs. ${ambiguas>1?'Composição ambígua: mais de uma equipe ativa tem estes IDs; confira a execução antes de associar.':'Nenhum vínculo será atribuído pela semelhança.'}</p><label><input type="checkbox" id="perf-vinculo-outras"> Ver outras composições e substituições</label><label>Buscar O.S. ou pessoa <input type="search" id="perf-vinculo-busca"></label><label>Vínculo <select id="perf-vinculo-filtro"><option value="">Todos</option><option value="sem">Sem vínculo</option><option value="outra">Outra equipe</option><option value="esta">Esta equipe</option></select></label><div id="perf-vinculo-lista">${candidatos.map(({r,g,i},n)=>{const exato=g.membros.map(m=>String(m.chave)).sort().join('|')===ids;return `<article class="perf-vinculo-candidato" data-vinculo-exato="${exato||g.equipeId===e.id?'sim':'nao'}" ${!exato&&g.equipeId!==e.id?'hidden':''} data-vinculo-tipo="${!g.equipeId?'sem':g.equipeId===e.id?'esta':'outra'}"><h4>O.S. ${esc(r.numero)} · ${esc(r.dia)}</h4><p>${esc(r.cliente)} · ${r.entregaId?'Entrega parcial '+esc(r.entregaId):'Entrega integral'}</p><p>${esc((r.itensEntrega||[]).map(i=>i.descricao+' × '+i.qtde).join('; ') || 'Itens na ficha da O.S.')}</p><p>${g.membros.map(m=>`${esc(m.nome)} · ID ${esc(m.chave)} · ${perfFormato(m.percentual)}%`).join('<br>')}</p><p>Grupo: ${perfFormato(g.cota/100)}% · Atual: ${esc(g.equipeNome||g.equipeId||'Composição avulsa')} → ${esc(e.nome)}<br>${exato?'Mesmos IDs da composição atual; conferir a execução.':'Composição diferente: pode ter ocorrido substituição. Revise os IDs históricos.'}</p><button class="btn-ghost" data-perf-comparar="${n}" ${f.fechadoEm||e.ativo===false||!r.confirmado||g.equipeId===e.id?'disabled':''}>Comparar e confirmar</button>${!r.confirmado?'<p>Confirme primeiro a participação desta entrega.</p>':''}</article>`;}).join('') || '<p>Nenhuma entrega na fonte deste período.</p>'}</div>`);
 const filtrar=()=>{const q=d.querySelector('#perf-vinculo-busca').value.toLocaleLowerCase(),v=d.querySelector('#perf-vinculo-filtro').value;d.querySelectorAll('[data-vinculo-tipo]').forEach(a=>a.hidden=!!((!d.querySelector('#perf-vinculo-outras').checked&&a.dataset.vinculoExato!=='sim')||(v&&a.dataset.vinculoTipo!==v)||!a.textContent.toLocaleLowerCase().includes(q)));};
 d.querySelector('#perf-vinculo-busca').oninput=filtrar;d.querySelector('#perf-vinculo-filtro').onchange=filtrar;d.querySelector('#perf-vinculo-outras').onchange=filtrar;
 d.querySelectorAll('[data-perf-comparar]').forEach(b=>b.onclick=()=>{const x=candidatos[Number(b.dataset.perfComparar)];perfCompararVinculo(e,x.r,x.i).catch(er=>toast(perfErroTxt(er),'error'));});
}
async function perfCompararVinculo(e,r,indice){
 if(!perfPodeEditar()||perfFonteAtual()?.fechadoEm)return;
 if(STORE.getQueue().length)throw new Error('Sincronize as alterações pendentes antes de vincular.');
 const osId=r.osId||r.id,res=await STORE.api({action:'conferenciaEntrega',osId});if(!res.os)throw new Error(res.error||'O.S. indisponível.');
 const os=res.os,ent=r.entregaId?(os.conferenciasEntrega||[]).find(x=>x.id===r.entregaId):null,aloc=ent?ent.alocacao:os.alocacao,g=aloc?.grupos?.[indice];
 if(!g){const d=perfDialog('Conferir a divisão primeiro',`<p>Esta participação usa um registro anterior à divisão por IDs. Confira a identidade e a divisão antes de associar. Nenhum nome foi convertido automaticamente.</p><button class="btn-primary" id="perf-vinculo-legado">Conferir entrega</button>`);d.querySelector('button#perf-vinculo-legado').onclick=()=>{d.close();void perfEditarParticipacao(r.id);};return;}
 const antes=perfConfig().equipes.find(x=>x.id===g.equipeId),baseEquipe=JSON.stringify(e);
 const ap=ent?CONFERENCIA_ENTREGA.apurar(os,res.valor):null,parcial=ap?.entregas?.find(x=>x.id===ent.id),valorEntrega=ent?(parcial?.valor==null?null:parcial.valor/100):res.valor,centavos=valorEntrega==null?null:PERF.ratearGrupos(valorEntrega,aloc.grupos)[indice];
 const itensAtuais=parcial?.itens||os.itens||[];
 const d=perfDialog('Confirmar associação · O.S. '+r.numero,`<p><strong>Antes:</strong> ${esc(antes?.nome||g.equipeId||'Composição avulsa')}<br><strong>Depois:</strong> ${esc(e.nome)}</p><p>Entrega ${esc(ent?.dia||r.dia)} · ${ent?'parcial '+esc(ent.id):'integral'} · grupo ${perfFormato(g.cota/100)}%.</p><p>${g.membros.map(m=>`${esc(OPERACAO.nomePessoa(m.pessoaId))} · ID ${esc(m.pessoaId)} · ${perfFormato(m.cota/100)}% do grupo`).join('<br>')}</p><p>${esc(itensAtuais.map(i=>i.descricao+' × '+(i.qtde??i.qtd??'')).join('; ')||'Itens da entrega integral preservados.')}</p><p>Base desta entrega: ${valorEntrega==null?'valor a conferir':dinheiroCasa(valorEntrega)}. Parcela deste grupo: ${centavos==null?'valor a conferir':dinheiroCasa(centavos/100)}.</p><p>Impacto: apenas este grupo muda de equipe no ranking da base aberta. Quantidades, cotas, pessoas, datas, valor total e revisões fechadas permanecem iguais. A associação será assinada pela gestão.</p><label><input type="checkbox" id="perf-vinculo-aceite"> Conferi os IDs e reconheço esta equipe nesta entrega.</label><p id="perf-vinculo-status" role="status"></p><button class="btn-primary" id="perf-vinculo-confirmar" disabled>Confirmar somente este vínculo</button>`);
 const b=d.querySelector('#perf-vinculo-confirmar'),st=d.querySelector('#perf-vinculo-status');d.querySelector('#perf-vinculo-aceite').onchange=x=>b.disabled=!x.target.checked;
 b.onclick=async()=>{b.disabled=true;st.textContent='Salvando associação…';try{const out=await STORE.api({action:'performanceVincularEquipe',osId,entregaId:ent?.id||'',rev:os.rev,grupo:indice,equipeId:e.id,baseEquipe});if(!out.ok)throw new Error(out.error||'Associação não confirmada.');await STORE.pull?.();conferenciaRefletirNaFicha(out.os);if(d.querySelector('#perf-vinculo-status')===st)d.close();await perfCarregarFonte();renderPerformanceCasa();toast('Vínculo confirmado. As demais entregas foram preservadas.','success');}catch(er){if(d.querySelector('#perf-vinculo-status')===st){st.textContent=perfErroTxt(er);b.disabled=false;}else toast(perfErroTxt(er),'error');}};
}

function perfPeriodoCompactoHTML(f) {
  const dia=v=>String(v||'').split('-').reverse().join('/');
  return `<details class="perf-filtro-avancado"><summary aria-label="Alterar período">📅 ${esc(dia(f.de))} a ${esc(dia(f.ate))}</summary><div class="filter-bar">${filtroPeriodoHTML('_fPerf')}</div></details>`;
}
function perfCompartilharRanking() {
  const url=new URL('ranking.html',location.href).href;
  const d=perfDialog('Ranking para os funcionários',`<p>Envie este link para a equipe acompanhar as entregas confirmadas pelo celular. Cada pessoa entra com seu acesso existente.</p><p>Somente leitura: classificação e produção das equipes. Clientes, detalhes das O.S. e comissões individuais ficam na gestão.</p><label>Link de acompanhamento <input id="perf-ranking-link" type="url" readonly value="${esc(url)}"></label><div class="perf-share-actions"><button type="button" class="btn-primary" id="perf-copiar-ranking">Copiar link</button><a class="btn-ghost" href="${esc(url)}" target="_blank" rel="noopener">Abrir acompanhamento</a></div><p id="perf-share-status" role="status"></p>`);
  d.querySelector('#perf-copiar-ranking').onclick=async()=>{
    try{await navigator.clipboard.writeText(url);d.querySelector('#perf-share-status').textContent='Link copiado. Pronto para enviar à equipe.';}
    catch{d.querySelector('#perf-ranking-link').select();d.querySelector('#perf-share-status').textContent='Selecione e copie o link acima.';}
  };
}
function performanceEquipesHTML() {
  const c=perfConfig(), f=periodoOuMes('_fPerf');
  if(perfConsultaServidor()&&!perfFonteAtual())return `<section class="perf-workspace">${perfPeriodoCompactoHTML(f)}<p role="status">${perfRemoto.erro?'Não foi possível consultar a apuração. Nenhuma falta de cadastro foi inferida.':'Consultando entregas e equipes…'}</p>${perfAvisosHTML(true)}</section>`;
  const lista=perfLista().filter(o=>OPERACAO.emIntervalo(diaEntrega(o),f.de,f.ate));
  const regs=perfUnirPessoas(lista.map(o=>perfRegistro(o,c)));
  const modo=STATE._perfModo==='pessoas'?'pessoas':'equipes', pesquisa=STATE._perfBusca || '';
  const podeConferir=perfPodeEditar()&&!perfFonteAtual()?.fechadoEm, verValor=perfPodeEditar();
  /* Ordem fixa (entrega mais recente primeiro, depois o número): a lista vinha
     na ordem do banco (id sorteado) ou do cache, e cada confirmação a
     reembaralhava; a próxima linha fugia do dedo. */
  const linhas=[...regs].sort((a,b)=>String(diaEntrega(b.os)||'').localeCompare(String(diaEntrega(a.os)||'')) || String(a.os.numero||'').localeCompare(String(b.os.numero||''),'pt-BR',{numeric:true}));
  // A situação com cor própria, pela mesma função da faixa do topo (perfSituacaoEntrega).
  const situacao=perfSituacaoEntrega;
  // As linhas já com o nome de hoje das equipes (a mesma regra do ranking): a sugerida vem marcada.
  const vistos=new Map(PERF.comEquipes(regs,c.equipes,perfOpcoesEquipe()).map(r=>[r.id,r]));
  const equipeTxt=r=>{
    const v=vistos.get(r.id)||r;
    if(Array.isArray(v.grupos)&&v.grupos.length)return v.grupos.map(g=>`<strong>${esc(g.equipeNome?`${g.emblema||'🤝'} ${g.equipeNome}`:'Pessoas avulsas')}</strong> <small>${perfFormato(g.cota/100)}% ${r.entregaId?'desta entrega':'da O.S.'}</small>${g.sugerida?' <span class="perf-sugerida">sugerida</span>':''}`).join('<br>')+'<br>';
    if(!v.equipeNome)return '';
    return `<strong>${esc(v.emblema||'🤝')} ${esc(v.equipeNome)}</strong>${v.sugerida?' <span class="perf-sugerida">sugerida</span>':''}<br>`;
  };
  const vista=v=>`<button type="button" class="btn-ghost ${modo===v?'active':''}" aria-pressed="${modo===v}" data-perf-modo="${v}">${v==='pessoas'?'👤 Pessoas':'🤝 Equipes'}</button>`;
  return `<section class="perf-workspace"><div class="perf-controls">${perfPeriodoCompactoHTML(f)}
    <div class="perf-toolbar"><span class="perf-toolbar-rot" id="perf-vista-rot">Ranking de</span><div class="casa-vista" role="group" aria-labelledby="perf-vista-rot">${vista('equipes')}${vista('pessoas')}</div><details class="perf-pdf-principal"><summary>Exportar</summary><button type="button" class="btn-ghost btn-sm" id="perf-pdf-ranking">📄 PDF do ranking</button><button type="button" class="btn-ghost btn-sm" id="perf-pdf">PDF completo</button></details></div></div>
    ${modo==='equipes' ? perfRankingEquipesHTML(regs, c) : perfRankingPessoasHTML(regs, c)}
    <details class="perf-method"><summary>Jornada e cobertura</summary>${perfJornadaHTML(regs,c)}</details>
    ${typeof operacaoPrioridadesHTML==='function'?operacaoPrioridadesHTML():''}
    <details class="perf-method"><summary>Como interpretar os indicadores</summary><p>Entregas conta as O.S. em que a pessoa participou; não some essa coluna entre pessoas. O.S. equivalentes considera os percentuais e a parcela do valor líquido entregue. As parciais somam no máximo uma O.S.; sem valor dos itens, a parcela fica a conferir. Divisões sugeridas ainda não foram confirmadas. Valores rateados não são faturamento pessoal nem bônus. Qualidade, complexidade e retrabalho precisam de revisão. ${esc(perfFonteTexto())}</p></details>
    ${perfCoberturaHTML(regs, f)}
    ${perfAuditoriaHTML(regs)}
    <section class="perf-entregas" aria-labelledby="perf-entregas-titulo"><div class="perf-entregas-cabeca"><h3 id="perf-entregas-titulo">Conferência por entrega</h3><p>Quem fez cada entrega e com qual percentual. É daqui que o ranking tira os nomes.</p></div>
      <div class="perf-filtros"><label>Situação <select id="perf-situacao"><option value="">Todas</option><option value="pendente">A conferir</option><option value="confirmada">Confirmadas</option><option value="sem-equipe">Sem equipe</option><option value="desatualizada">Divisão desatualizada ou a conferir no RH</option><option value="invalida">Participação inconsistente</option>${verValor?'<option value="sem-valor">Sem valor</option>':''}</select></label><label class="perf-busca">Buscar O.S., cliente ou pessoa <input id="perf-busca-os" type="search" value="${esc(pesquisa)}" placeholder="Digite para localizar"></label><button type="button" class="btn-ghost" id="perf-limpar">Limpar filtros</button><span id="perf-recorte" role="status"></span></div>
      <div class="casa-tabela-wrap"><table class="casa-tabela perf-conf-tabela"><thead><tr><th scope="col">O.S. / Cliente</th><th scope="col">Data</th><th scope="col">Equipe e percentuais</th><th scope="col">Situação e volta</th><th scope="col"><span class="perf-sr">Ações</span></th></tr></thead><tbody>${linhas.map(r=>{const st=situacao(r);return `<tr data-perf-id="${esc(r.id)}"><td><button type="button" class="inline-link" data-perf-os="${esc(r.id)}">${esc(r.os.numero)}</button><small class="bloco">${esc(r.os.cliente)}</small>${r.entregaId?`<small class="bloco conf-item-resumo">${esc(r.itensEntrega.map(i=>i.descricao+' × '+i.qtde).join('; '))}${r.saldoItens?` · ${r.saldoItens} item(ns) ainda a conferir`:""}</small>`:""}</td><td>${esc(diaEntrega(r.os).split('-').reverse().join('/'))}</td><td>${equipeTxt(r)}${r.membros.map(p=>`${esc(p.nome)} · ${perfFormato(p.percentual)}%`).join('<br>') || '<span class="perf-nada">Sem equipe</span>'}</td><td><span class="badge perf-st-${st[0]}">${st[1]}</span>${r.estadoEntrega?`<small class="bloco">${esc(r.estadoEntrega.resumo)}</small>`:""}${r.erroConferencia?`<small class="bloco">${esc(r.erroConferencia)}</small>`:''}${r.os.retrabalho?'<small class="bloco">Serviço de retrabalho</small>':''}<small class="bloco perf-volta">${perfVoltaTxt(r.retornoConf)}</small>${verValor?`<small class="bloco">${r.valor==null?'Sem valor':esc(dinheiroCasa(r.valor))}</small>`:''}</td><td>${podeConferir?`<button type="button" class="btn-ghost btn-sm" data-perf-part="${esc(r.id)}">Conferir</button>`:''}</td></tr>`;}).join('') || '<tr><td colspan="5">Nenhuma entrega neste filtro.</td></tr>'}</tbody></table></div></section></section>`;
}
function wirePerformanceEquipes(el) {
  el.querySelectorAll('[data-perf-dash-vista]').forEach(b=>b.onclick=()=>{STATE._perfDashVista=b.dataset.perfDashVista;renderPerformanceCasa();});
  el.querySelectorAll('[data-perf-dash-granularidade]').forEach(b=>b.onclick=()=>{STATE._perfDashGranularidade=b.dataset.perfDashGranularidade;renderPerformanceCasa();});
  perfWireFonte(el);
  if(typeof wireOperacaoRevisao==='function')wireOperacaoRevisao(el);
  if(typeof bindCardClicks==='function')bindCardClicks(el);
  el.querySelectorAll("[data-perf-vinculos]").forEach(b=>b.onclick=()=>perfConferirVinculos(b.dataset.perfVinculos));
  const gb=el.querySelector("#perf-gestao-busca"),gs=el.querySelector("#perf-gestao-status");if(gb&&gs){const f=()=>el.querySelectorAll("[data-gestao-status]").forEach(a=>a.hidden=!!((gs.value&&gs.value!==a.dataset.gestaoStatus)||!a.textContent.toLocaleLowerCase().includes(gb.value.toLocaleLowerCase())));gb.oninput=f;gs.onchange=f;}
  el.querySelectorAll('[data-perf-layout]').forEach(b=>b.onclick=()=>{STATE._perfLayout=b.dataset.perfLayout;renderPerformanceCasa();});
  el.querySelectorAll('[data-perf-modo]').forEach(b=>b.onclick=()=>{STATE._perfModo=b.dataset.perfModo;renderPerformanceCasa();});
  el.querySelectorAll('[data-perf-equipe]').forEach(b=>b.onclick=()=>perfEditarEquipe(b.dataset.perfEquipe));
  // O Conferir é assíncrono (pode buscar a O.S. no servidor): falha diz a causa, nunca some calada.
  el.querySelectorAll('[data-perf-part]').forEach(b=>b.onclick=()=>perfEditarParticipacao(b.dataset.perfPart).catch(e=>{console.error('[perf] conferir',e);toast('Não deu para abrir o Conferir: '+perfErroTxt(e),'error');}));
  el.querySelectorAll('#perf-nova-equipe,[data-perf-criar-equipe]').forEach(b=>b.onclick=()=>perfEditarEquipe(''));
  el.querySelectorAll('[data-perf-audit-id]').forEach(b=>b.onclick=()=>perfEditarParticipacao(b.dataset.perfAuditId).catch(e=>toast(perfErroTxt(e),'error')));
  el.querySelectorAll('[data-perf-audit-volta]').forEach(b=>b.onclick=async()=>{try{const r=perfRegistro(perfOS(b.dataset.perfAuditVolta),perfConfig());await LOTE.abrir({modo:'dia',dia:diaEntrega(r.os)});STATE._loteModo='dia';STATE._entAba='lote';document.querySelector('.tab[data-tab="entregas"]:not([data-vista])')?.click();}catch(e){toast('Não foi possível abrir a volta: '+perfErroTxt(e),'error');}});
  el.querySelectorAll('[data-perf-rank-medida]').forEach(b=>b.onclick=()=>{STATE._perfRankMedida=b.dataset.perfRankMedida;renderPerformanceCasa();});
  el.querySelectorAll('[data-perf-pessoa-medida]').forEach(b=>b.onclick=()=>{STATE._perfPessoaMedida=b.dataset.perfPessoaMedida;renderPerformanceCasa();});
  const crit=el.querySelector('#perf-criterios');if(crit)crit.onclick=perfEditarCriterios;
  // Nomear uma composição abre a criação já com os integrantes marcados.
  el.querySelectorAll('[data-perf-nomear]').forEach(b=>b.onclick=()=>perfEditarEquipe('',(perfUltimoRanking.get(b.dataset.perfNomear)||[]).map(m=>({...m,apelido:m.apelido||m.nome}))));
  const c=perfConfig(), grupos=new Map();
  for(const os of STORE.getAllOS()){const membros=perfEquipeOS(os),k=PERF.composicao(membros);if(membros.length<2 || c.equipes.some(e=>PERF.composicaoCom(e.membros,perfIdMembro)===k))continue;const g=grupos.get(k)||{membros,n:0};g.n++;grupos.set(k,g);}
  const sugeridas=[...grupos.values()].sort((a,b)=>b.n-a.n).slice(0,4);
  el.querySelectorAll('[data-perf-sugestao]').forEach(b=>b.onclick=()=>perfEditarEquipe('',sugeridas[Number(b.dataset.perfSugestao)].membros));
  const busca=el.querySelector('#perf-busca-os'), situacao=el.querySelector('#perf-situacao');
  const filtrar=()=>{
    if(!busca)return;
    STATE._perfBusca=busca.value;STATE._perfSituacao=situacao.value;
    let n=0;
    el.querySelectorAll('.perf-entregas tr[data-perf-id]').forEach(tr=>{
      const cfgAtual=perfConfig(),os=perfOS(tr.dataset.perfId),r=perfUnirPessoas([perfRegistro(os,cfgAtual)])[0];
      // A MESMA regra do ranking: sem ela, "Ver entregas" de uma equipe nomeada
      // pela composição filtraria por uma chave que nenhuma linha tem.
      const rv=PERF.comEquipes([r],cfgAtual.equipes,perfOpcoesEquipe())[0];
      // Com duas equipes na divisão (F11), a entrega aparece no "Ver entregas" de cada uma.
      const grupos=PERF.chavesDeEquipe(rv);
      const status=!r.membros.length?'sem-equipe':PERF.validar(r.membros)?'invalida':r.confirmado?'confirmada':'pendente';
      // A marca pela mesma função do selo e da faixa: a desatualizada sem gente está em "Sem equipe", não aqui.
      const marcada=!!perfSituacaoEntrega(r)[2];
      const ok=(!STATE._perfApenasComValor || r.valor!=null)&&(!situacao.value || (situacao.value==='pendente'?!r.confirmado:situacao.value==='sem-valor'?r.valor==null:situacao.value==='desatualizada'?marcada:status===situacao.value)) && PERF.incluiPessoa(r.membros,STATE._perfPessoa) && (!STATE._perfGrupo || grupos.includes(STATE._perfGrupo)) && normCasa(tr.textContent).includes(normCasa(busca.value));
      tr.hidden=!ok;if(ok)n++;
    });
    el.querySelector('#perf-recorte').textContent=n+(n===1?' entrega na lista':' entregas na lista')+(STATE._perfPessoa || STATE._perfGrupo?' · participante/equipe selecionado':'')+'. Os números do ranking valem para o período inteiro.';
  };
  el.querySelectorAll('[data-perf-pessoa],[data-perf-grupo]').forEach(b=>b.onclick=()=>{STATE._perfPessoa=b.dataset.perfPessoa||'';STATE._perfGrupo=b.dataset.perfGrupo||'';STATE._perfApenasComValor=b.dataset.perfFonteMedida==='valor';busca.value='';situacao.value=b.dataset.perfFonteMedida&&b.dataset.perfFonteMedida!=='entregas'?'confirmada':'';filtrar();el.querySelector('.perf-entregas').scrollIntoView({behavior:'smooth',block:'start'});});
  if(busca){situacao.value=STATE._perfSituacao||'';busca.oninput=filtrar;situacao.onchange=()=>{STATE._perfApenasComValor=false;filtrar();};el.querySelector('#perf-limpar').onclick=()=>{STATE._perfPessoa='';STATE._perfGrupo='';STATE._perfApenasComValor=false;busca.value='';situacao.value='';filtrar();};filtrar();}
  /* A FAIXA DE COBERTURA manda para a lista já filtrada ("Completar equipes"
     mostra as sem equipe, com o Conferir de cada uma) e o foco vai para o
     filtro, para quem usa teclado continuar dali. */
  el.querySelectorAll('[data-perf-filtrar]').forEach(b=>b.onclick=()=>{
    if(!busca)return;
    STATE._perfPessoa='';STATE._perfGrupo='';busca.value='';situacao.value=b.dataset.perfFiltrar;filtrar();
    el.querySelector('.perf-entregas').scrollIntoView({behavior:'smooth',block:'start'});
    try{situacao.focus({preventScroll:true});}catch(e){situacao.focus();}
  });
  el.querySelectorAll('[data-perf-atualizar]').forEach(b=>b.onclick=perfCarregarFonte);
  el.querySelectorAll('[data-perf-lancar]').forEach(b=>b.onclick=perfAbrirLancamento);
  el.querySelectorAll('[data-perf-erp-saldo]').forEach(b=>b.onclick=()=>{ if (typeof abrirListaErpSaldo === 'function') abrirListaErpSaldo(); });
  const rankPdf=el.querySelector('#perf-pdf-ranking');if(rankPdf)rankPdf.onclick=()=>{const r=el.querySelector('.perf-ranking');const medida=[...r.querySelectorAll('[aria-pressed="true"]')].map(n=>n.textContent).join(' · ');imprimirAnalisePCP((r.querySelector('h3')?.textContent||'Ranking')+(medida?' · '+medida:''),r,periodoOuMes('_fPerf'),perfFonteTexto());};
  const relPdf=el.querySelector('#perf-rel-pdf');if(relPdf)relPdf.onclick=()=>{
    const copy=document.createElement('section'),dash=el.querySelector('.perf-dash');
    copy.append((dash||el.querySelector('.perf-report')).cloneNode(true));copy.dataset.pdfModo='resumo';
    const vista=dash?.querySelector('[data-perf-dash-vista][aria-pressed="true"]')?.textContent||'Resumo';
    imprimirAnalisePCP('Performance · '+vista,copy,periodoOuMes('_fPerf'),perfFonteTexto());
  };
  const detalhado=el.querySelector('#perf-rel-detalhado');if(detalhado)detalhado.onclick=()=>{
    const copy=el.querySelector('.perf-report').cloneNode(true);
    imprimirAnalisePCP('Performance · resumo e O.S.',copy,periodoOuMes('_fPerf'),perfFonteTexto());
  };
  const pdf=el.querySelector('#perf-pdf');if(pdf)pdf.onclick=()=>{
    const copy=el.querySelector('.perf-workspace').cloneNode(true);copy.querySelector('.perf-config')?.remove();copy.querySelectorAll('[hidden]').forEach(x=>x.remove());
    const note=document.createElement('p');note.textContent='Detalhamento filtrado por: '+(el.querySelector('#perf-recorte')?.textContent || 'todas as entregas')+' Busca: '+(STATE._perfBusca||'sem busca')+'. Os totais acima abrangem o período completo.';copy.prepend(note);
    imprimirAnalisePCP('Performance e participação',copy,periodoOuMes('_fPerf'),perfFonteTexto());
  };
  el.querySelectorAll('[data-perf-os]').forEach(b=>b.onclick=()=>{
    const r=perfUnirPessoas([perfRegistro(perfOS(b.dataset.perfOs),perfConfig())])[0];
    perfDialog('O.S. '+(r.os.numero||''),`<p>${esc(r.os.cliente||'')}</p><p>Entrega: ${esc(diaEntrega(r.os))}</p>${r.entregaId?`<p>Itens: ${esc(r.itensEntrega.map(i=>i.descricao+' × '+i.qtde).join('; '))}</p>`:''}<p>Valor: ${r.valor==null?'Não disponível':dinheiroCasa(r.valor)} · ${esc(r.origemValor||'Base local')}</p>${r.avisoValor?`<p role="alert">${esc(r.avisoValor)}</p>`:''}<p>${r.confirmado?'Participação confirmada':r.fonte==='alocacao-desatualizada'?'Divisão desatualizada: a equipe da O.S. mudou depois da divisão (numa aba antiga). Não conta como confirmada; confira de novo.':r.fonte==='alocacao-conferir-rh'?'Divisão gravada com o RH fora do ar: não conta como confirmada até a pessoa ser conferida no RH.':'Participação aguardando confirmação'}</p><p>Volta: ${perfVoltaTxt(r.retornoConf)}${r.retornoConf&&r.retornoConf.por?` · conferida por ${esc(r.retornoConf.por)}${r.retornoConf.em?' em '+esc(new Date(r.retornoConf.em).toLocaleString('pt-BR')):''}`:''}</p><ul>${r.membros.map(p=>`<li>${esc(p.nome)} · ${perfFormato(p.percentual)}%</li>`).join('')}</ul>${r.por?`<p>Participação confirmada por ${esc(r.por)} · ${esc(r.em||'')}</p>`:''}${r.obs?`<p>${esc(r.obs)}</p>`:''}<p>${esc(perfFonteTexto())}</p>`);
  });
  bindCardClicks(el);
}
function perfModeloEquipeHTML() {
  return `<label>Equipe salva <select data-perf-modelo><option value="">Escolher pessoas individualmente</option>${perfConfig().equipes.filter(e=>e.ativo!==false).map(e=>`<option value="${esc(e.id)}">${esc(PERF.iconeEquipe(e))} ${esc(e.nome)}</option>`).join('')}</select><small>Você pode acrescentar ou retirar pessoas abaixo.</small></label>`;
}
function perfWireModelo(form) {
  const sel=form.querySelector('[data-perf-modelo]');if(!sel)return;
  sel.onchange=()=>{
    const e=perfConfig().equipes.find(e=>e.id===sel.value);if(!e)return;
    // Pelo ID de hoje dos dois lados (a equipe salva até a v133 guarda o slug do RH).
    const ids=e.membros.map(perfIdMembro), doCb=cb=>perfIdMembro({chave:perfPessoa(cb.value).chave});
    const faltando=ids.filter(id=>![...form.querySelectorAll('[name="equipe"]')].some(cb=>doCb(cb)===id));
    if(faltando.length){toast('Equipe possui integrante indisponível no cadastro atual. Confira a seleção individual.','error');return;}
    form.querySelectorAll('[name="equipe"]').forEach(cb=>{cb.checked=ids.includes(doCb(cb));cb.closest('.casa-chip').classList.toggle('on',cb.checked);});
  };
}

function performanceRelatorioHTML() {
  if(perfConsultaServidor()&&!perfFonteAtual())return `<p role="status">${perfRemoto.erro?'Consulta indisponível; tente atualizar a apuração.':'Consultando a apuração…'}</p>`;
  const f=periodoOuMes('_fPerf'),c=perfConfig();
  // Nome e logo das equipes pela mesma regra do ranking, em todos os quadros do
  // relatório: um quadro com o nome e outro com a composição crua seria a
  // mesma equipe parecendo duas.
  // (a mesma pessoa numa linha só, como no ranking)
  const regs=PERF.comEquipes(perfUnirPessoas(perfLista().filter(o=>OPERACAO.emIntervalo(diaEntrega(o),f.de,f.ate)).map(o=>perfRegistro(o,c))),c.equipes,perfOpcoesEquipe());
  const validos=regs.filter(r=>!PERF.validar(r.membros)), confirmados=validos.filter(r=>r.confirmado);
  const resumo=PERF.resumir(validos), confirmado=PERF.resumir(confirmados), grupos=PERF.dossie(regs);
  const semEquipe=regs.filter(r=>!r.membros.length).length, inconsistentes=regs.length-validos.length-semEquipe;
  const cobertura=regs.length?Math.round(confirmados.length/regs.length*100):0;
  const semValor=confirmados.filter(r=>r.valor==null).length,valor=confirmados.reduce((n,r)=>n+(r.valor??0),0);
  const fmtDia=v=>String(v||'').slice(0,10).split('-').reverse().join('/');
  const valorTexto=(n,conhecidas,total)=>!total?'A conferir':!conhecidas?'Sem valor':dinheiroCasa(n)+(conhecidas<total?' · parcial':'');
  const tabela=(titulo,linhas,equipe=false)=>`<section class="perf-report-section"><h3>${titulo}</h3><p class="metricas-nota">${equipe?'Cada entrega conta uma vez na equipe.':'O.S. equivalentes somam os percentuais confirmados: duas participações de 50% equivalem a uma O.S.'}</p><div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>${equipe?'Equipe':'Pessoa'}</th><th>Entregas</th><th>Confirmadas</th><th>A conferir</th>${equipe?'':'<th>O.S. equivalentes confirmadas</th>'}<th>Valor confirmado${equipe?'':' rateado'}</th></tr></thead><tbody>${linhas.map(p=>{const cf=(equipe?confirmado.equipes:confirmado.pessoas).find(x=>x.chave===p.chave);return `<tr><td><strong>${esc(p.nome)}</strong></td><td>${p.os}</td><td>${p.confirmadas}</td><td>${p.os-p.confirmadas}</td>${equipe?'':`<td>${perfFormato(cf?.equivalentes || 0)}</td>`}<td>${!cf?'—':cf.semValor===cf.os?'Sem valor':dinheiroCasa(cf.valor)+(cf.semValor?' (parcial)':'')}</td></tr>`;}).join('') || `<tr><td colspan="${equipe?5:6}">Sem participantes registrados neste período.</td></tr>`}</tbody></table></div></section>`;
  const equipes=grupos.map(g=>`<article class="perf-team-report${perfCorClasse(g)}"><header>${perfLogoHTML(g,'perf-emblema')}<div><h4>${esc(g.nome)}</h4><p>${g.membros.length} participantes no período · ${g.registros.length} entrega${g.registros.length===1?'':'s'}</p></div><strong>${valorTexto(g.valor,g.confirmadas-g.semValor,g.confirmadas)}<small>valor confirmado da equipe</small></strong></header><div class="perf-team-numbers"><span><b>${g.confirmadas}</b> ${g.confirmadas===1?'confirmada':'confirmadas'}</span><span><b>${g.registros.length-g.confirmadas}</b> a conferir</span><span><b>${g.retrabalhos}</b> com marca de retrabalho</span></div><div class="perf-member-list">${g.membros.map(m=>`<span><strong>${esc(m.nome)}</strong><small>${m.entregas} entrega${m.entregas===1?'':'s'} · ${m.confirmadas} ${m.confirmadas===1?'confirmada':'confirmadas'} · ${perfFormato(m.equivalentes)} O.S. equivalentes</small></span>`).join('')}</div><details><summary>Ver O.S., percentuais e dados de conferência</summary><div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>O.S. / cliente</th><th>Entrega</th><th>Participação na entrega</th><th>Valor da entrega</th><th>Conferência</th></tr></thead><tbody>${g.registros.map(r=>`<tr><td><button class="inline-link" data-perf-os="${esc(r.id)}">${esc(r.os?.numero || r.id)}</button><small class="bloco">${esc(r.os?.cliente || '')}</small>${r.entregaId?`<small class="bloco">${esc(r.itensEntrega.map(i=>i.descricao+' × '+i.qtde).join('; '))}</small>`:''}${r.os?.retrabalho?'<small class="bloco">Retrabalho marcado</small>':''}</td><td>${fmtDia(diaEntrega(r.os))}</td><td>${r.membros.map(m=>`${esc(m.nome)} · <strong>${perfFormato(m.percentual)}%</strong>`).join('<br>')}</td><td>${r.valor==null?'Sem valor':dinheiroCasa(r.valor)}<small class="bloco">${esc(r.origemValor || 'Base da apuração')}</small></td><td>${r.confirmado?'Confirmada':r.fonte==='alocacao-desatualizada'?'Divisão desatualizada':r.fonte==='alocacao-conferir-rh'?'Divisão a conferir no RH':'Divisão sugerida'}${r.por?`<small class="bloco">${esc(r.por)} · ${fmtDia(r.em)}</small>`:''}${r.estadoEntrega?`<small class="bloco">${esc(r.estadoEntrega.resumo)}</small>`:''}${r.obs?`<small class="bloco">${esc(r.obs)}</small>`:''}</td></tr>`).join('')}</tbody></table></div></details></article>`).join('');
  const painel=typeof PERF_DASH==='undefined'?'':PERF_DASH.html(PERF_DASH.montar(regs,{perf:PERF,periodo:f,diaDe:r=>r.dia||diaEntrega(r.os),verValores:podeVerValores()}),{vista:STATE._perfDashVista,granularidade:STATE._perfDashGranularidade,podeConferir:perfPodeEditar()&&!perfFonteAtual()?.fechadoEm,fonte:perfFonteTexto()});
  return `${painel}<details class="perf-report-detail"><summary>Detalhamento por equipe, pessoa e entrega</summary><section class="perf-report"><header class="perf-report-heading"><div><span class="perf-report-eyebrow">PRODUÇÃO · PESSOAS · EQUIPES</span><h3>Relatório de performance</h3><p>${fmtDia(f.de)} a ${fmtDia(f.ate)} · ${resumo.pessoas.length} participantes · ${grupos.length} ${grupos.length===1?'equipe / composição utilizada':'equipes / composições utilizadas'}</p></div><span class="perf-report-state">${perfFonteAtual()?.fechadoEm?'Fechamento preservado':'Apuração em acompanhamento'}</span></header><div class="perf-summary"><div><b>${regs.length}</b><span>entregas no período</span></div><div><b>${cobertura}%</b><span>com participação confirmada (${confirmados.length})</span></div><div><b>${semEquipe}</b><span>sem equipe informada</span></div></div><div class="perf-report-value"><span>Valor das entregas com participação confirmada</span><strong>${valorTexto(valor,confirmados.length-semValor,confirmados.length)}</strong><small>${semValor} entrega(s) confirmada(s) sem valor. Valores por pessoa são rateados; não representam pagamento ou bônus.</small></div><p class="perf-coverage">${!regs.length?'Nenhuma instalação registrada neste período.':confirmados.length<regs.length?`Apuração parcial: ${regs.length-confirmados.length} ${regs.length-confirmados.length===1?'participação':'participações'} a conferir, incluindo ${semEquipe} sem equipe e ${inconsistentes} inconsistentes.`:'Participações conferidas. Quantidade de entregas não mede sozinha qualidade, esforço ou complexidade.'}</p><section class="perf-report-section"><h3>Equipes e composição real do período</h3><p class="metricas-nota">Participantes das entregas, incluindo avulsos. Os percentuais variam por O.S.; o cadastro atual da equipe não reescreve o histórico.</p>${equipes || '<p>Nenhuma equipe com participação válida registrada no período.</p>'}</section>${tabela('Participação por pessoa',resumo.pessoas)}${tabela('Resumo das equipes',resumo.equipes,true)}<details class="perf-report-section perf-report-pendencias"><summary>Entregas que ainda não permitem apuração por pessoa</summary><p>${semEquipe} sem equipe · ${inconsistentes} com percentuais inconsistentes.</p><ul>${regs.filter(r=>PERF.validar(r.membros)).map(r=>`<li>O.S. <button class="inline-link" data-perf-os="${esc(r.id)}">${esc(r.os.numero)}</button> · ${esc(r.os.cliente)} · ${r.membros.length?'rever percentuais':'informar participantes'}</li>`).join('') || '<li>Nenhuma pendência de composição.</li>'}</ul></details><p class="metricas-nota">Entregas inclui participações sugeridas e confirmadas. A mesma O.S. pode aparecer para mais de uma pessoa; não some a coluna entre colaboradores. Valores incluem somente participações confirmadas, sem duplicar o valor entre pessoas. Não representam lucro, recebimento ou bônus. Retrabalho indica a marca registrada, não uma avaliação automática do colaborador. ${esc(perfFonteTexto())}</p></section></details>`;
}

/* ================= REGRAS DO PROGRAMA (F05, 29/09/2026) =================
   Aba Performance > Regras, só para admin e pcp (as mesmas que o servidor
   atende). Cada versão vale a partir de uma DATA e nunca é editada: mudar é
   criar a próxima. O formulário usa o MESMO validador do servidor
   (REGRAS.validarRegra, cópia de _shared/pcp-regras.mjs) e mostra o exemplo
   ao vivo enquanto se digita. Sem rede, a tela usa a cópia guardada no
   aparelho; sem cópia, a regra embutida, dita como provisória. */
let perfRegrasEstado = {carregando:false, erro:'', tentado:false, disco:false};
function perfRegrasPode() { return typeof STATE !== 'undefined' && ['admin','pcp'].includes(String(STATE.user?.papel || '')); }
function perfRegrasFonte() {
  const loc = typeof STORE.regrasLocais === 'function' ? STORE.regrasLocais() : null;
  return {versoes:loc && Array.isArray(loc.versoes) ? loc.versoes : [], fechadoAte:String(loc?.fechadoAte || ''), em:String(loc?.em || ''), temCopia:!!loc};
}
function perfHojeISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function perfPct(bp) { return String(Number(bp) / 100).replace('.', ',') + '%'; }
// "60", "60,5" ou "60.5" em 0,01%. Vazio ou texto vira NaN, que o validador recusa com a frase certa.
function perfPctBp(v) { const t = String(v ?? '').trim().replace(',', '.'); if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return NaN; return Math.round(Number(t) * 100); }
function perfCentavos(c) { return dinheiroCasa((Number(c) || 0) / 100); }
/* O EXEMPLO AO VIVO: dupla, O.S. de R$ 10.000 no prazo. Sai do motor de
   divisão e da comissão da regra; a O.S. que não pontua não paga ninguém. */
function perfRegraExemploHTML(regra) {
  if (!regra || REGRAS.validarRegra(regra)) return '<p class="perf-coverage">Corrija a regra para ver o exemplo.</p>';
  const valor = 1000000;
  const linha = (n, rotulo) => {
    const ex = REGRAS.exemplo(regra, n, valor), lider = ex.partes[0], aj = ex.partes.slice(1);
    const ajTxt = !aj.length ? '' : new Set(aj.map(p => p.centavos)).size === 1
      ? `, ${aj.length === 1 ? 'ajudante' : 'cada ajudante'} ${perfCentavos(aj[0].centavos)}`
      : ', ' + aj.map((p, i) => `ajudante ${i+1} ${perfCentavos(p.centavos)}`).join(', ');
    return `<li><strong>${rotulo}</strong>, O.S. de ${perfCentavos(valor)} no prazo: comissão total ${perfCentavos(ex.comissaoCentavos)}, ${n === 1 ? 'quem foi sozinho' : 'líder'} ${perfCentavos(lider.centavos)}${ajTxt}.</li>`;
  };
  const v = regra.volta, base = valor;
  return `<div class="perf-regra-exemplo" aria-live="polite"><h4>Exemplo legado — não configura a nova comissão</h4><ul>${linha(2,'Dupla')}${linha(3,'Trio')}${linha(4,'Equipe de 4')}${linha(1,'Sozinho')}</ul>
    <p>O.S. com ${regra.perdas.map(p => REGRAS.ROTULOS[p]).join(', ') || 'nenhuma perda marcada'}: não pontua e não paga comissão.</p>
    <p>Volta do carro, sobre o valor válido da volta: carro limpo e arrumado ${v.carroLimpoBp ? '+' + perfPct(v.carroLimpoBp) : 'sem bônus'} (${perfCentavos(base)} vira ${perfCentavos(base + Math.round(base * REGRAS.ajusteDaVolta(regra, {carroCerto:true}) / 10000))}); equipamento faltante ou danificado ${v.equipamentoFaltaBp ? '-' + perfPct(v.equipamentoFaltaBp) : 'sem redutor'} (vira ${perfCentavos(base + Math.round(base * REGRAS.ajusteDaVolta(regra, {equipamentoOk:false}) / 10000))}); volta não conferida fica como está.</p></div>`;
}
function perfRegraResumoHTML(r) {
  const t = r.divisao.tabela, trio = t[3] || t['3'], dupla = t[2] || t['2'];
  return `<dl class="perf-regra-lista">
    <dt>Vale a partir de</dt><dd>${esc(REGRAS.dataBR(r.validaDesde))}</dd>
    <dt>Divisão dentro da equipe</dt><dd>1 pessoa: 100%. Dupla: líder ${perfPct(dupla[0])}, ajudante ${perfPct(dupla[1])}. Trio: líder ${perfPct(trio[0])}, ajudantes ${perfPct(trio[1])} e ${perfPct(trio[2])}. 4 ou mais: líder ${perfPct(r.divisao.maisLider)} e o resto igual entre os ajudantes.</dd>
    <dt>Entre equipes</dt><dd>Proporcional ao número de pessoas de cada equipe.</dd>
    <dt>Comissão legada</dt><dd>Referência histórica; não configura a nova apuração financeira. ${perfPct(r.comissaoBp)} do valor da O.S., só na O.S. que pontua (no prazo, sem retrabalho, sem retorno antecipado).</dd>
    <dt>Tolerância do retorno</dt><dd>${r.toleranciaRetornoMin} minuto${r.toleranciaRetornoMin === 1 ? '' : 's'} antes do horário previsto não contam como retorno antecipado.</dd>
    <dt>Volta do carro</dt><dd>Carro limpo e arrumado: +${perfPct(r.volta.carroLimpoBp)}. Equipamento faltante ou danificado: -${perfPct(r.volta.equipamentoFaltaBp)}. Volta não conferida: neutra.</dd>
    <dt>Desempate</dt><dd>${(t => t.charAt(0).toUpperCase() + t.slice(1))(r.desempate.map(d => REGRAS.ROTULOS[d]).join(', depois '))}.</dd>
  </dl>`;
}
function perfRegrasHTML() {
  if (!perfRegrasPode()) return '<section class="perf-regras"><p>As regras do programa são da gestão do PCP.</p></section>';
  const f = perfRegrasFonte(), hoje = perfHojeISO();
  const vigente = REGRAS.regraVigente(f.versoes, hoje);
  const proxima = [REGRAS.REGRA_EMBUTIDA, ...f.versoes].filter(v => !REGRAS.validarRegra(v) && v.validaDesde > hoje).sort((a, b) => a.validaDesde < b.validaDesde ? -1 : a.validaDesde > b.validaDesde ? 1 : b.versao - a.versao)[0];
  const mostrada = vigente || proxima || REGRAS.REGRA_EMBUTIDA;
  // A embutida é o piso: continua valendo nos dias antes da primeira versão gravada.
  const provisoria = mostrada.id === REGRAS.REGRA_EMBUTIDA.id;
  const origem = perfRegrasEstado.carregando ? 'Consultando o servidor…'
    : f.temCopia ? `Cópia do servidor de ${esc(new Date(f.em).toLocaleString('pt-BR'))}.`
    : 'Sem cópia das regras neste aparelho: mostrando a regra embutida, provisória, até consultar o servidor.';
  const titulo = vigente ? 'Regra operacional legada em vigor hoje' : 'Próxima regra operacional legada';
  const historico = f.versoes.map(v => `<details class="perf-regra-versao"><summary>Versão ${esc(v.versao)} · vale a partir de ${esc(REGRAS.dataBR(v.validaDesde))} · ${esc(v.autor?.nome || 'sem autor')}${v.id === mostrada.id ? ' · <span class="badge">mostrada acima</span>' : ''}</summary><p>Criada em ${esc(new Date(v.criadaEm).toLocaleString('pt-BR'))}${v.autor?.login ? ' por ' + esc(v.autor.login) : ''}. Motivo: ${esc(v.motivo || '')}</p>${REGRAS.validarRegra(v) ? '<p role="alert">Versão com dado inválido no banco: não vale.</p>' : perfRegraResumoHTML(v)}</details>`).join('');
  return `<section class="perf-regras"><p class="metricas-nota">Histórico das regras operacionais. A apuração financeira com entrega comprovada, montagem interna e aprovação fica em Base e fechamento → Comissão. Cada revisão financeira guarda sua configuração própria; regras e fechamentos antigos permanecem preservados.</p>
    <p class="metricas-nota">Cada versão vale a partir de uma data e nunca é editada: para mudar, crie a próxima. Mês já fechado não muda. ${origem}${f.fechadoAte ? ` Fechado até ${esc(REGRAS.dataBR(f.fechadoAte))}.` : ''}</p>
    ${perfRegrasEstado.erro ? `<p role="alert">${esc(perfRegrasEstado.erro)}</p>` : ''}
    <article class="perf-regra-atual"><header><h3>${titulo}</h3>${provisoria ? `<span class="badge sem-valor">${f.versoes.length ? 'Provisória: regra embutida, vale até o início da primeira versão gravada' : 'Provisória: regra embutida, nenhuma versão gravada'}</span>` : `<span class="badge">Versão ${esc(mostrada.versao)}</span>`}</header>
      ${perfRegraResumoHTML(mostrada)}${perfRegraExemploHTML(mostrada)}</article>
    <div class="perf-filtros"><button class="btn-ghost" id="perf-regras-atualizar" ${perfRegrasEstado.carregando ? 'disabled' : ''}>Atualizar regras</button><button class="btn-primary" id="perf-regra-nova" ${perfRegrasEstado.carregando || !f.temCopia ? 'disabled' : ''}>Criar nova versão</button>${!f.temCopia ? '<small>Para criar versão, consulte o servidor antes (precisa de conexão).</small>' : ''}</div>
    <section class="perf-regras-historico"><h3>Versões gravadas</h3>${historico || '<p>Nenhuma versão gravada ainda. Vale a regra embutida, provisória.</p>'}${f.versoes.length ? `<p class="metricas-nota">Antes da primeira versão gravada, de ${esc(REGRAS.dataBR(REGRAS.REGRA_EMBUTIDA.validaDesde))} em diante, vale a regra embutida.</p>` : ''}</section>
  </section>`;
}
async function perfCarregarRegras() {
  if (perfRegrasEstado.carregando || !perfRegrasPode()) return;
  perfRegrasEstado = {...perfRegrasEstado, carregando:true, erro:'', tentado:true};
  try { await STORE.pullRegras(); }
  catch (e) { perfRegrasEstado.erro = 'Não foi possível consultar as regras. ' + perfErroTxt(e) + (perfRegrasFonte().temCopia ? ' Mostrando a cópia deste aparelho.' : ''); }
  finally { perfRegrasEstado.carregando = false; if (STATE._perfAba === 'regras') renderPerformanceCasa(); }
}
/* O FORMULÁRIO vira a regra que vai ao servidor. Percentuais digitados em %,
   gravados em 0,01%. O que a tela não edita (perdas, desempate, entre
   equipes) segue da versão base. */
function perfRegraDoForm(form, base) {
  const g = n => form.querySelector(`[name="${n}"]`)?.value;
  const lider2 = perfPctBp(g('lider2')), lider3 = perfPctBp(g('lider3')), aj3 = perfPctBp(g('ajudante3'));
  return REGRAS.completarRegra({
    validaDesde:String(g('validaDesde') || ''),
    divisao:{tabela:{1:[10000], 2:[lider2, 10000 - lider2], 3:[lider3, aj3, 10000 - lider3 - aj3]}, maisLider:perfPctBp(g('lider4'))},
    comissaoBp:perfPctBp(g('comissao')),
    toleranciaRetornoMin:/^\d+$/.test(String(g('tolerancia') || '').trim()) ? Number(String(g('tolerancia')).trim()) : NaN,
    volta:{carroLimpoBp:perfPctBp(g('carroLimpo')), equipamentoFaltaBp:perfPctBp(g('equipamento')), naoConferida:'neutra'},
  }, base);
}
function perfRegraErroForm(regra, fechadoAte) {
  const e = REGRAS.validarRegra(regra);
  if (e) return e;
  if (REGRAS.fechamentoBloqueia(regra.validaDesde, fechadoAte)) return `A data ${REGRAS.dataBR(regra.validaDesde)} cai em período já fechado (até ${REGRAS.dataBR(fechadoAte)}). Escolha uma data depois de ${REGRAS.dataBR(fechadoAte)}.`;
  return '';
}
/* O PRIMEIRO DIA DO PROGRAMA: o início da embutida ou da versão gravada mais
   antiga, o que vier antes. Data de versão antes dele põe no programa dias que
   hoje estão fora (setembro, por exemplo). */
function perfRegraInicioPrograma(versoes) {
  return (versoes || []).filter(v => v && !REGRAS.validarRegra(v)).map(v => v.validaDesde).concat(REGRAS.REGRA_EMBUTIDA.validaDesde).sort()[0];
}
function perfRegraAvisoData(validaDesde, versoes) {
  const inicio = perfRegraInicioPrograma(versoes);
  return REGRAS.dataValida(validaDesde) && validaDesde < inicio
    ? `Atenção: o programa começa em ${REGRAS.dataBR(inicio)}. Esta data põe no programa dias antes disso, que hoje estão fora dele.` : '';
}
function perfDiaSeguinte(dia) { const [a, m, d] = String(dia).split('-').map(Number); const x = new Date(a, m - 1, d + 1); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; }
/* A DATA SUGERIDA: o maior entre amanhã, o dia seguinte ao último fechado e o
   início da embutida. Nunca sugere dia fora do programa nem mês fechado. */
function perfRegraDataSugerida(fechadoAte, hoje) {
  return [perfDiaSeguinte(hoje), REGRAS.dataValida(fechadoAte) ? perfDiaSeguinte(fechadoAte) : '', REGRAS.REGRA_EMBUTIDA.validaDesde].filter(Boolean).sort().pop();
}
/* A CONFIRMAÇÃO diz o que o servidor GRAVOU (a versão devolvida), não o que foi digitado. */
function perfRegraConfirmacao(r, repetida) {
  const t = r.divisao.tabela, dupla = t[2] || t['2'], trio = t[3] || t['3'];
  return `Versão ${r.versao} ${repetida ? 'já estava gravada' : 'gravada'}: comissão ${perfPct(r.comissaoBp)}, dupla ${perfPct(dupla[0])} e ${perfPct(dupla[1])}, trio ${perfPct(trio[0])}, ${perfPct(trio[1])} e ${perfPct(trio[2])}, 4 ou mais com líder ${perfPct(r.divisao.maisLider)}. Vale a partir de ${REGRAS.dataBR(r.validaDesde)}.`;
}
function perfNovaRegra() {
  const f = perfRegrasFonte();
  if (!perfRegrasPode() || !f.temCopia) return;
  const base = f.versoes[0] || REGRAS.REGRA_EMBUTIDA, anterior = f.versoes[0]?.id || '';
  /* Um pedido por conteúdo: depois de uma tentativa que falhou, mexer em
     qualquer campo gera outro requestId (o servidor recusa o mesmo pedido com
     outros valores; sem mexer, o reenvio devolve a mesma versão). */
  let requestId = STORE.uuid(), tentou = false;
  const t = base.divisao.tabela, dupla = t[2] || t['2'], trio = t[3] || t['3'];
  const pct = bp => String(bp / 100).replace('.', ',');
  const minimo = f.fechadoAte ? perfDiaSeguinte(f.fechadoAte) : '';
  const sugerida = perfRegraDataSugerida(f.fechadoAte, perfHojeISO());
  const campo = (nome, rotulo, valor, sufixo, dica) => `<label>${rotulo} <span class="perf-regra-campo"><input name="${nome}" inputmode="decimal" value="${esc(valor)}" required> ${sufixo}</span>${dica ? `<small>${dica}</small>` : ''}</label>`;
  const d = perfDialog('Nova versão da regra operacional legada', `<form id="perf-regra-form" novalidate>
    <p class="metricas-nota">A versão ${esc((Number(base.versao) || 0) + 1)} vale a partir da data escolhida, até a próxima. As versões anteriores ficam como estão.</p>
    <label>Vale a partir de <input type="date" name="validaDesde" value="${esc(sugerida)}" ${minimo ? `min="${esc(minimo)}"` : ''} required></label>
    <p class="perf-regra-aviso" id="perf-regra-aviso" aria-live="polite"></p>
    <fieldset><legend>Divisão dentro da equipe</legend>
      ${campo('lider2', 'Dupla: líder', pct(dupla[0]), '%', 'O ajudante fica com o resto.')}
      ${campo('lider3', 'Trio: líder', pct(trio[0]), '%')}
      ${campo('ajudante3', 'Trio: primeiro ajudante', pct(trio[1]), '%', 'O segundo ajudante fica com o resto.')}
      ${campo('lider4', '4 ou mais: líder', pct(base.divisao.maisLider), '%', 'O resto é dividido igual entre os ajudantes.')}
    </fieldset>
    <fieldset><legend>Comissão e perdas legadas</legend><p>Estes campos preservam o programa operacional anterior. Não alteram a nova comissão de 1%, a montagem interna nem a exigência de responsabilidade comprovada; configure a nova apuração em Base e fechamento → Comissão.</p>
      ${campo('comissao', 'Comissão legada sobre a O.S. que pontua', pct(base.comissaoBp), '%', 'De 0% a 10%.')}
      ${campo('tolerancia', 'Tolerância do retorno antecipado', String(base.toleranciaRetornoMin), 'min')}
    </fieldset>
    <fieldset><legend>Volta do carro (sobre o valor válido da volta)</legend>
      ${campo('carroLimpo', 'Bônus: carro limpo e arrumado', pct(base.volta.carroLimpoBp), '%')}
      ${campo('equipamento', 'Redutor: equipamento faltante ou danificado', pct(base.volta.equipamentoFaltaBp), '%', 'Volta não conferida fica neutra.')}
    </fieldset>
    <label>Motivo da nova versão <textarea name="motivo" minlength="5" maxlength="300" required></textarea></label>
    <p role="alert" id="perf-regra-erro"></p>
    <div id="perf-regra-previa"></div>
    <button class="btn-primary" type="submit">Gravar nova versão</button>
  </form>`);
  const form = d.querySelector('#perf-regra-form'), erroEl = d.querySelector('#perf-regra-erro'), previa = d.querySelector('#perf-regra-previa'), btn = form.querySelector('[type="submit"]'), avisoEl = d.querySelector('#perf-regra-aviso');
  const conferir = () => {
    const regra = perfRegraDoForm(form, base), erro = perfRegraErroForm(regra, f.fechadoAte);
    if (avisoEl) avisoEl.textContent = perfRegraAvisoData(regra.validaDesde, f.versoes);
    const motivo = String(form.querySelector('[name="motivo"]').value || '').trim();
    erroEl.textContent = erro || (motivo.length < 5 ? 'Escreva o motivo da nova versão (pelo menos 5 letras).' : '');
    previa.innerHTML = perfRegraExemploHTML(erro ? null : regra);
    btn.disabled = !!erroEl.textContent;
    return {regra, erro:erroEl.textContent, motivo};
  };
  form.addEventListener('input', () => { if (tentou) { requestId = STORE.uuid(); tentou = false; } conferir(); });
  conferir();
  form.onsubmit = async ev => {
    ev.preventDefault();
    const {regra, erro, motivo} = conferir();
    if (erro) return;
    btn.disabled = true;
    tentou = true;
    try {
      const r = await STORE.api({action:'performanceRegraNova', regra, motivo, anterior, requestId});
      if (!r?.ok || !r.regra) throw new Error(r?.error || 'Não foi possível gravar a nova versão.');
      tentou = false;
      d.close();
      toast(perfRegraConfirmacao(r.regra, r.repetida), 'success');
      await perfCarregarRegras();
    } catch (e) { erroEl.textContent = perfErroTxt(e); btn.disabled = false; }
  };
}
function wirePerfRegras(el) {
  if (!perfRegrasPode()) return;
  const at = el.querySelector('#perf-regras-atualizar'); if (at) at.onclick = perfCarregarRegras;
  const nova = el.querySelector('#perf-regra-nova'); if (nova) nova.onclick = perfNovaRegra;
  // Primeiro a cópia do disco (abre sem rede); depois o servidor, uma vez por visita.
  if (!perfRegrasEstado.disco && typeof STORE.lerRegrasDisco === 'function') {
    perfRegrasEstado.disco = true;
    STORE.lerRegrasDisco().then(r => { if (r && STATE._perfAba === 'regras') renderPerformanceCasa(); }).catch(() => {});
  }
  if (!perfRegrasEstado.tentado && typeof STORE.pullRegras === 'function' && (typeof navigator === 'undefined' || navigator.onLine !== false)) void perfCarregarRegras();
}
