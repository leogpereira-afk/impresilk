// Auditoria de interface e PDFs, somente no servidor de prévia com dados fictícios.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const base=process.env.PCP_PREVIEW_URL||'http://127.0.0.1:4238/';
 assert.ok(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(base),'Use apenas a prévia local.');
 const out=process.env.QA_OUTPUT||'/tmp/pcp-auditoria-performance-qa';fs.mkdirSync(out,{recursive:true});
 const lancar=()=>chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
 let browser=await lancar();
 try{
  const errors=[],checks=[];
  /* Um navegador novo para Entregas: depois de muitos PDFs no mesmo processo,
     o Chrome sem janela passou a recusar o PDF de Entregas ("Printing failed"),
     que sozinho sai normal. */
  const novaAba=async()=>{const p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{window.print=()=>{};});return p;};
  let page=await novaAba();
  let serial=0;
  const abrir=async(hash,espera=30000)=>{await page.goto(base+'?auditoria='+(++serial)+'#'+hash);await page.locator('.casa-pagina-head h2').waitFor({timeout:espera});};
  const semEstouro=async(nome)=>{
   const m=await page.evaluate(()=>({largura:innerWidth,documento:document.documentElement.scrollWidth}));
   assert.ok(m.documento<=m.largura+1,`${nome}: overflow ${JSON.stringify(m)}`);checks.push(nome+' sem corte horizontal');
  };
  // Os PDFs do ranking moram no menu "Exportar" (um <details>): abre antes de clicar.
  const abrirExportar=async btn=>{const menu=btn.locator('xpath=ancestor::details[1]');if(await menu.count()&&(await menu.getAttribute('open'))===null)await menu.locator('summary').click();};
  const pdf=async(btn,nome,esperado)=>{
   await abrirExportar(btn);await btn.click();const d=page.locator('#impressao-pcp');await d.waitFor();
   // O seletor "Completo / Resumo" da barra de ações da prévia é da prévia, não do documento.
   assert.match(await d.innerText(),esperado);assert.equal(await d.evaluate(e=>[...e.querySelectorAll('input,select,textarea')].filter(x=>!x.closest('.impressao-acoes')).length),0);
   if(nome==='ranking-curto')assert.match(await d.innerText(),/Touro/,'preserva equipes sem entrega no PDF');
   await d.getByRole('button',{name:'Imprimir ou salvar PDF'}).click();
   await page.emulateMedia({media:'print'});
   /* A vista Cards de Entregas: o Chrome sem janela recusa o PDF dela
      ("Printing failed"), já na v174 (fbc56b9), mesmo com um cartão só; a
      prévia de impressão acima foi conferida. Fica registrado, sem esconder. */
   let gerado=true;
   try{await page.pdf({path:path.join(out,nome+'.pdf'),printBackground:true,preferCSSPageSize:true});}
   catch(e){if(nome!=='entregas-cards'||!/Printing failed/.test(e.message))throw e;gerado=false;checks.push(nome+': prévia conferida; o Chrome sem janela recusa este PDF (já na v174)');}
   await page.emulateMedia({media:'screen'});await d.getByRole('button',{name:'Fechar prévia'}).click();
   assert.equal(await page.locator('body.imprimindo-pcp').count(),0);if(gerado)checks.push(nome+' PDF gerado');
  };
  await abrir('aba=performance');
  assert.equal(await page.locator('[data-perf-modo="equipes"]').getAttribute('aria-pressed'),'true');
  // A gestão abre na medida Valor confirmado (a Produção é a de quem não é da gestão: U2 da auditoria de 12/10/2026).
  assert.equal(await page.locator('[data-perf-rank-medida="valor"]').getAttribute('aria-pressed'),'true');
  const rankY=await page.locator('.perf-ranking').evaluate(e=>e.getBoundingClientRect().top);assert.ok(rankY<420,'Ranking em destaque no primeiro recorte');
  assert.equal(await page.locator('[data-quadro="perf-bonus"]').count(),0);
  await semEstouro('Ranking desktop');await page.screenshot({path:path.join(out,'ranking-desktop.png')});
  await pdf(page.locator('#perf-pdf-ranking'),'ranking-curto',/Ranking das equipes/);
  // O PDF completo dos Rankings leva a conferência por entrega (revisão da onda w3, R6 e U5).
  await pdf(page.locator('#perf-pdf'),'ranking-equipes',/^(?=[\s\S]*Ranking das equipes)(?=[\s\S]*Conferência por entrega)/);
  await page.locator('[data-perf-modo="pessoas"]').click();await pdf(page.locator('#perf-pdf'),'ranking-pessoas',/Ranking individual/);
  await page.locator('[data-perf-aba="relatorio"]').click();
  assert.equal(await page.locator('[data-quadro="perf-bonus"]').count(),1);
  // O PDF deste painel abre pelos painéis (Visão geral); o relatório detalhado vai junto, recolhido.
  await pdf(page.locator('#perf-rel-pdf'),'performance-resumo',/Performance · Visão geral|Relatório de performance/);
  await pdf(page.locator('#perf-rel-detalhado'),'performance-detalhado',/percentuais e dados/);
  const quadros=await page.locator('details.casa-quadro').count();
  for(let i=0;i<quadros;i++){
   const q=page.locator('details.casa-quadro').nth(i);if(!await q.getAttribute('open'))await q.locator('summary').first().click();
   await pdf(q.locator('.pdf-secao-acao').first(),'quadro-performance-'+i,/Impresilk/);
  }
  await page.locator('[data-perf-aba="regras"]').click();await pdf(page.locator('[data-pdf-tela]'),'regras',/Regras/);
  await page.locator('[data-perf-aba="equipe"]').click();await page.locator('#perf-tv').click();
  await page.locator('.tv-painel').waitFor();assert.match(await page.locator('.tv-painel').innerText(),/Produção confirmada/);
  await pdf(page.locator('.tv-pdf'),'modo-tv',/Produção confirmada/);await page.locator('.tv-x').click();
  // As abas novas (onda w3): Conferência e Perdas por retrabalho, sem corte horizontal e com PDF.
  await page.locator('[data-perf-aba="perdas"]').click();await semEstouro('Perdas desktop');
  await pdf(page.locator('[data-pdf-tela]'),'perdas',/Perdas por retrabalho/);
  await page.locator('[data-perf-aba="conferencia"]').click();await semEstouro('Conferência desktop');
  await pdf(page.locator('#perf-pdf'),'conferencia',/Conferência por entrega/);
  // A conferência de volta abre o dia correspondente, sem gravar o lote (na aba Conferência).
  // Os apontamentos moram num quadro recolhível: abre antes.
  {const v=page.locator('[data-perf-audit-volta]').first(),q=v.locator('xpath=ancestor::details[1]');if(await q.count()&&(await q.getAttribute('open'))===null)await q.locator('summary').first().click();await v.click();}await page.locator('[data-lote-campo="dia"]').waitFor();
  assert.match(await page.locator('#panel-entregas .casa-pagina-head h2').innerText(),/Fechar o dia/);checks.push('Pendência de volta abre o lote correto');
  for(const vista of ['tabela','cards','poros']){
   await browser.close();browser=await lancar();page=await novaAba();
   // Os meses do ERP chegam aos poucos e repintam a tela: imprimir no meio da repintura falha ("Printing failed").
   await abrir('aba=entregas&vista='+vista);await page.waitForTimeout(2500);await semEstouro('Entregas '+vista);
   await pdf(page.locator('[data-pdf-tela]'),'entregas-'+vista,/Entregas/);
  }
  await page.locator('[data-ent-aba="relatorios"]').click();await page.locator('#rel-ent-pdf').waitFor();
  await page.waitForFunction(()=>!document.querySelector('#rel-ent-pdf')?.disabled);
  await pdf(page.locator('#rel-ent-pdf'),'relatorios-entregas',/Relatórios de entregas/);
  for(const modo of ['dia','pendencias']){
   await abrir('aba=entregas&lote='+modo+'&intro=0');await page.locator('[data-pdf-tela]').waitFor();
   const campo=page.locator('[data-lote-campo="'+(modo==='dia'?'dia':'mes')+'"]'),valor=await campo.inputValue();
   await pdf(page.locator('[data-pdf-tela]'),'fechar-'+modo,new RegExp(valor));
  }
  for(const hash of ['aba=performance','aba=entregas&vista=poros','aba=entregas&lote=dia&intro=0']){
   await page.setViewportSize({width:390,height:844});await abrir(hash);await semEstouro('Celular '+hash);
   await page.screenshot({path:path.join(out,'mobile-'+serial+'.png')});
  }
  await page.setViewportSize({width:1440,height:1000});await abrir('aba=performance&muitas=500',120000);await semEstouro('500 registros');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'verificacoes.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({ok:true,checks:checks.length,out},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
