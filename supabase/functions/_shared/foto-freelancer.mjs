/** Projeção da foto do RH. A ficha vinculada é a fonte, inclusive de ex-CLT.
 * CPF completo ou vínculo explícito; nunca nome, apelido ou ID de seis dígitos.
 * Não devolve nenhum outro dado pessoal e respeita o pacote leve do elenco. */
export function fotoFreelancerRH(contrato, fichas, { leve = false } = {}) {
  if (leve || !contrato) return '';
  const digitos = v => String(v || '').replace(/\D/g, '');
  const cpf = digitos(contrato.cpf);
  const ligadas = fichas.filter(f => {
    const outro = digitos(f.cpf);
    if (cpf && outro) return cpf.length === 11 && cpf === outro;
    return !!contrato.exColaboradorId && contrato.exColaboradorId === f.id;
  });
  if (ligadas.length > 1) return '';
  const foto = String(ligadas.length ? ligadas[0].fotoDataUrl || '' : contrato.fotoDataUrl || '');
  return /^data:image\/(jpeg|png|webp);base64,/.test(foto) && foto.length < 200000 ? foto : '';
}
