// auth.js — login da GESTÃO, conferido no SERVIDOR (equipe-auth, sistema "pcp").
//
// POR QUE ISTO EXISTE
// Até aqui, a conta de cada pessoa da gestão morava dentro do pacote de
// configuração que TODO aparelho baixa, com a SENHA EM TEXTO PURO, e a
// conferência acontecia aqui no navegador (app.js comparava string com string).
// Como o token que autoriza esse download vai no bundle público do site,
// qualquer pessoa que abrisse o endereço lia a senha de todo mundo. Pior: os
// papéis pcp/montagem/operacao tinham senha padrão VAZIA — bastava escolher o
// nome na lista para entrar. Agora a senha é PBKDF2 no banco e quem confere é o
// servidor.
//
// A MONTAGEM CONTINUA SEM SENHA, por decisão do dono: o instalador toca no
// próprio nome em equipe.html e o aparelho lembra. Quem sobe em andaime não vai
// digitar senha no celular. O que se fecha ali é outra coisa: o atalho
// equipe.html#i=NOME aceitava QUALQUER nome, até um que não estivesse na lista.
//
// O CRACHÁ VALE 30 DIAS de propósito: entrar precisa de internet uma vez; depois
// o aparelho segue trabalhando sem sinal.

const AUTH = (() => {
  const URL_AUTH = API_BASE + '/equipe-auth';
  const SISTEMA = 'pcp';
  const K_TOKEN = 'impresilk_inst_cracha';

  const pegar = () => localStorage.getItem(K_TOKEN) || '';
  const guardar = t => { if (t) localStorage.setItem(K_TOKEN, t); };
  const esquecer = () => localStorage.removeItem(K_TOKEN);

  async function chamar(acao, corpo, comCracha) {
    const cab = { 'Content-Type': 'application/json' };
    if (comCracha) cab['Authorization'] = 'Bearer ' + pegar();
    const r = await fetch(URL_AUTH, {
      method: 'POST', headers: cab,
      body: JSON.stringify(Object.assign({ acao, sistema: SISTEMA }, corpo || {})),
    });
    let dados = {};
    try { dados = await r.json(); } catch (e) { /* resposta sem corpo */ }
    if (!r.ok) throw Object.assign(new Error(dados.erro || ('HTTP ' + r.status)), { status: r.status, erro: dados.erro });
    return dados;
  }

  // Quem é o dono do crachá que está neste aparelho, lido do próprio crachá.
  //
  // POR QUE ISTO EXISTE: a entrada única do Painel grava o crachá aqui (mesmo
  // endereço, mesmo localStorage) mas NÃO grava o usuário — ela não conhece o
  // formato interno de cada app. Sem isto, quem entrava pelo Painel chegava no
  // PCP com um crachá válido no bolso e mesmo assim via a tela de senha.
  //
  // Não confere assinatura de propósito: quem valida é o servidor, em toda
  // chamada. O que se lê aqui é só nome e papel, para montar a tela — a
  // validade é conferida porque entrar com crachá vencido daria um app que só
  // recusa. Papel roubado no navegador não concede nada: desde 05/08 o pcp-sync
  // confere papel no servidor.
  function dono() {
    const t = pegar();
    if (!t) return null;
    const partes = t.split('.');
    if (partes.length !== 3) return null;
    try {
      let b = partes[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      const p = JSON.parse(decodeURIComponent(escape(atob(b))));
      if (p.sis !== SISTEMA) return null;
      if (typeof p.exp !== 'number' || p.exp < Math.floor(Date.now() / 1000)) return null;
      const usuario = String(p.sub || p.nome || '').trim();
      if (!usuario) return null;
      return { usuario, nome: String(p.nome || usuario), papel: String(p.papel || '') };
    } catch { return null; }
  }

  return {
    temCracha: () => !!pegar(),
    // O crachá agora também autoriza os DADOS (pcp-sync), não só a tela.
    cracha: pegar,
    dono,
    esquecer,
    async login(usuario, senha) {
      const r = await chamar('login', { usuario, senha });
      guardar(r.token);
      return r;
    },
    // Entrada da MONTAGEM (sem senha): o instalador tocou no nome; o pcp-sync
    // valida contra a lista de instaladores e devolve um crachá papel 'montagem'.
    // Guarda no mesmo lugar do crachá de gestão (mesmo origin) para o store.js
    // anexar nas próximas chamadas.
    async entrarMontagem(nome) {
      const r = await STORE.api({ action: 'entrarMontagem', nome });
      if (r && r.token) { guardar(r.token); return r; }
      throw new Error((r && r.error) || 'Não foi possível entrar.');
    },
    // null = sem internet (segue com o que está no aparelho); false = crachá morto
    async eu() { try { return await chamar('eu', {}, true); } catch (e) { return e.status === 401 ? false : null; } },
    trocarMinhaSenha(senhaAtual, novaSenha) { return chamar('trocarMinhaSenha', { senhaAtual, novaSenha }, true); },
    listarContas() { return chamar('listarContas', {}, true); },
    salvarConta(c) { return chamar('salvarConta', c, true); },
    removerConta(usuario) { return chamar('removerConta', { usuario }, true); },
  };
})();
