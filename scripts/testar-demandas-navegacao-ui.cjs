// Executar contra preview-auditoria.cjs: dados fictícios e rede externa bloqueada.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:980}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('http://127.0.0.1:4201/#aba=agenda');
 const nav=page.locator('.tab[data-vista="demandas"]');await nav.click();await page.locator('.dm-tools').waitFor();
 assert.equal(await page.locator('.dm-tabs').count(),0);
 assert.match(await nav.getAttribute('class'),/active/);
 await page.getByRole('button',{name:'+ Nova demanda',exact:true}).click();
 const dlg=page.getByRole('dialog');await dlg.waitFor();
 await dlg.locator('[name=titulo]').fill('Revisão de instalação · exemplo');
 await dlg.locator('[name=responsavelId]').selectOption('rh-ana');
 await dlg.locator('[name=descricao]').fill('Validar medidas e alinhar a equipe.');
 await dlg.locator('[name=resultadoEsperado]').fill('Medidas conferidas e instalação alinhada com o cliente.');
 await dlg.locator('[name=prioridade]').selectOption('alta');
 await dlg.locator('[name=prazo]').fill('2026-10-01');
 await dlg.getByRole('button',{name:'Salvar demanda',exact:true}).click();await dlg.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'← Todas as demandas',exact:true}).click();
 await page.locator('.dm-tools').waitFor();
 await page.locator('[data-alerta=atrasadas]').click();
 assert.equal(await page.locator('[data-alerta=atrasadas]').getAttribute('aria-pressed'),'true');
 assert.ok(await page.locator('[data-open]').count()>0);
 await page.locator('[data-toggle-filters]').click();assert.equal(await page.locator('#dm-advanced').isVisible(),true);
 await page.locator('[data-filter=responsavel]').selectOption('rh-ana');
 await page.locator('[data-remove=responsavel]').waitFor();
 await page.locator('[data-filter=busca]').fill('inexistente-xyz');await page.locator('[data-filter=busca]').press('Enter');
 await page.getByRole('heading',{name:'Nenhuma demanda com estes filtros'}).waitFor();
 await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();await page.locator('[data-open]').first().waitFor();
 assert.equal(await page.locator('[data-remove]').count(),0);
 await page.locator('[data-toggle-filters]').click();
 await page.screenshot({path:'/tmp/demandas-desktop.png'});
 await page.locator('.tab[data-tab=agenda]:not([data-vista])').click();
 await page.locator('.dm-calendar').waitFor();assert.equal(await page.locator('.dm-tools').count(),0);
 await page.getByRole('button',{name:'Ver todas as demandas',exact:true}).click();await page.locator('.dm-tools').waitFor();assert.match(await nav.getAttribute('class'),/active/);
 await page.locator('[data-open]').first().click();await page.getByRole('heading',{name:'O que está acontecendo',exact:true}).waitFor();
 await page.getByRole('button',{name:'← Todas as demandas',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await page.locator('.dm-tools').waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sem rolagem horizontal no celular');
 await page.locator('[data-toggle-filters]').click();await page.locator('#dm-advanced').waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'filtros cabem no celular');
 await page.locator('[data-toggle-filters]').click();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/tmp/demandas-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('OK: navegação, criação fictícia, chips, filtros, limpeza, detalhes, calendário e celular; sem erros JavaScript.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
