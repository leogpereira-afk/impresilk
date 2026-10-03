// Auditoria de interface e PDFs, somente no servidor de prévia com dados fictícios.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const base=process.env.PCP_PREVIEW_URL||'http://127.0.0.1:4238/';
 assert.ok(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(base),'Use apenas a prévia local.');
 const out=process.env.QA_OUTPUT||'/tmp/pcp-auditoria-performance-qa';fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.print=()=>{};});
  let serial=0;
  const abrir=async hash=>{await page.goto(base+'?auditoria='+(++serial)+'#'+hash);await page.locator('.casa-pagina-head h2').waitFor();};
  const semEstouro=async(nome)=>{
   const m=await page.evaluate(()=>({largura:innerWidth,documento:document.documentElement.scrollWidth}));
   assert.ok(m.documento<=m.largura+1,`${nome}: overflow ${JSON.stringify(m)}`);checks.push(nome+' sem corte horizontal');
  };
  const pdf=async(btn,nome,esperado)=>{
   await btn.click();const d=page.locator('#impressao-pcp');await d.waitFor();
   assert.match(await d.innerText(),esperado);assert.equal(await d.locator('input,select,textarea').count(),0);
   if(nome==='ranking-curto')assert.match(await d.innerText(),/Touro/,'preserva equipes sem entrega no PDF');
   await d.getByRole('button',{name:'Imprimir ou salvar PDF'}).click();
   await page.emulateMedia({media:'print'});await page.pdf({path:path.join(out,nome+'.pdf'),printBackground:true,preferCSSPageSize:true});
   await page.emulateMedia({media:'screen'});await d.getByRole('button',{name:'Fechar prévia'}).click();
   assert.equal(await page.locator('body.imprimindo-pcp').count(),0);checks.push(nome+' PDF gerado');
  };
  await abrir('aba=performance');
  assert.equal(await page.locator('[data-perf-modo="equipes"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-perf-rank-medida="producao"]').getAttribute('aria-pressed'),'true');
  const rankY=await page.locator('.perf-ranking').evaluate(e=>e.getBoundingClientRect().top);assert.ok(rankY<420,'Ranking em destaque no primeiro recorte');
  assert.equal(await page.locator('[data-quadro="perf-bonus"]').count(),0);
  await semEstouro('Ranking desktop');await page.screenshot({path:path.join(out,'ranking-desktop.png')});
  await pdf(page.locator('#perf-pdf-ranking'),'ranking-curto',/Ranking das equipes/);
  await pdf(page.locator('#perf-pdf'),'ranking-equipes',/Ranking das equipes/);
  await page.locator('[data-perf-modo="pessoas"]').click();await pdf(page.locator('#perf-pdf'),'ranking-pessoas',/Ranking individual/);
  await page.locator('[data-perf-aba="relatorio"]').click();
  assert.equal(await page.locator('[data-quadro="perf-bonus"]').count(),1);
  await pdf(page.locator('#perf-rel-pdf'),'performance-resumo',/Relatório de performance/);
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
  // A conferência de volta abre o dia correspondente, sem gravar o lote.
  await page.locator('[data-perf-audit-volta]').first().click();await page.locator('[data-lote-campo="dia"]').waitFor();
  assert.match(await page.locator('#panel-entregas .casa-pagina-head h2').innerText(),/Fechar o dia/);checks.push('Pendência de volta abre o lote correto');
  for(const vista of ['tabela','cards','poros']){
   await abrir('aba=entregas&vista='+vista);await semEstouro('Entregas '+vista);
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
  await page.setViewportSize({width:1440,height:1000});await abrir('aba=performance&muitas=500');await semEstouro('500 registros');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'verificacoes.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({ok:true,checks:checks.length,out},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
