/* Contrato comum dos PDFs. Os dados já chegam autorizados pelo servidor. */
const RELATORIOS_PCP = (() => {
  const escapar=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const CSS=`@page{size:A4 landscape;margin:14mm 10mm 16mm;@bottom-right{content:"Página " counter(page) " de " counter(pages)}}
    @media print{table{width:100%;border-collapse:collapse;table-layout:auto}thead{display:table-header-group}tfoot{display:table-footer-group}
    th,td{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere;max-width:none!important}
    tr,figure{break-inside:avoid}h1,h2,h3{break-after:avoid}}.pdf-metadados{font-size:10pt;color:#444;border-bottom:1px solid #bbb;padding:8px 0;line-height:1.4}
    @media print{details,details>*{content-visibility:visible!important}details::details-content{display:contents!important}.casa-quadro-corpo,.table-wrap,.perf-table-wrap,.casa-tabela-wrap{max-height:none!important;overflow:visible!important}.pdf-metadados{break-inside:avoid}button{display:none!important}.cards-grid{display:block!important}.os-card{break-inside:avoid;max-width:none!important}}`;
  function metadados({titulo='',periodo={},fonte='Registros do PCP carregados neste aparelho',filtros='Conforme recorte indicado',consulta,versao,cobertura='Somente registros carregados; não representa a base integral',modo='Completo'}={}) {
    return `<div class="pdf-metadados"><strong>${escapar(titulo)}</strong><br>Período: ${escapar(periodo.de||'não delimitado')} a ${escapar(periodo.ate||'não delimitado')} · Filtros: ${escapar(filtros)}<br>Fonte: ${escapar(fonte)} · Consulta: ${escapar(consulta||new Date().toISOString())}<br>Revisão: ${escapar(versao||'não informada')} · Escopo: ${escapar(cobertura)} · Conteúdo: ${escapar(modo)}<br>Paginação: habilite cabeçalhos e rodapés do navegador se a numeração de páginas não aparecer.</div>`;
  }
  function prepararJanela(w,meta) {
    if(!w?.document?.body)return;
    const st=w.document.createElement('style');st.textContent=CSS;w.document.head.appendChild(st);
    w.document.body.insertAdjacentHTML('afterbegin',metadados(meta));
  }
  function sanearCopia(copia,{completo=true,valores=false}={}) {
    // Controles são rascunhos/segredos, não dados de relatório. Campos exportáveis são explícitos.
    copia.querySelectorAll('input,select,textarea').forEach(n=>n.remove());
    copia.querySelectorAll('script,[data-pdf-excluir],.pdf-secao-acao,[hidden]:not(.painel-bloco-corpo)').forEach(n=>n.remove());
    if(!valores)copia.querySelectorAll('[data-valor],.valor-monetario,[data-pdf-valores]').forEach(n=>n.remove());
    copia.querySelectorAll('details').forEach(n=>{if(completo)n.open=true;else n.remove();});
    copia.querySelectorAll('.painel-bloco-corpo').forEach(n=>{if(completo)n.hidden=false;else if(n.hidden)n.remove();});
    return copia;
  }
  return {CSS,metadados,prepararJanela,sanearCopia};
})();
if(typeof module!=='undefined')module.exports=RELATORIOS_PCP;
