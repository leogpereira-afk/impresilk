// Apenas a prévia isolada com dados fictícios. Nunca executar contra produção.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const url=process.env.PCP_PREVIEW_URL||'http://127.0.0.1:5396/';
 if(new URL(url).hostname!=='127.0.0.1')throw new Error('Use somente a prévia local fictícia.');
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(url+'#aba=performance');
  await page.waitForFunction(()=>typeof conferirItensEntrega==='function' && STATE.user);
  await page.evaluate(()=>conferirItensEntrega('PARCIAL','fixture-primeira'));
  const d=page.locator('#perf-dialog');await d.waitFor({state:'visible'});
  await d.locator('[data-conf-qtde="0"]').fill('2');
  const before=await page.evaluate(()=>JSON.stringify(STORE.getOS('PARCIAL')));
  const cta=d.getByRole('button',{name:'Apontar retrabalho',exact:true});
  await cta.click();const editor=page.locator('.conf-retrabalho-dialog');await editor.waitFor({state:'visible'});
  assert.equal(await editor.locator('#retrab-form').isVisible(),true);
  assert.equal(await editor.locator('#retrab-nao').isVisible(),false);
  assert.equal(await page.evaluate(()=>JSON.stringify(STORE.getOS('PARCIAL'))),before);
  await editor.getByRole('button',{name:'Voltar aos itens e equipe'}).click();
  assert.equal(await d.locator('[data-conf-qtde="0"]').inputValue(),'2');
  assert.ok(await cta.evaluate(e=>e===document.activeElement));
  fs.mkdirSync('/tmp/pcp-retrabalho-qa',{recursive:true});
  await page.screenshot({path:'/tmp/pcp-retrabalho-qa/atalho-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await d.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.screenshot({path:'/tmp/pcp-retrabalho-qa/atalho-mobile.png'});
  await cta.click();
  await editor.locator('[name=problema]').fill('Placa fictícia precisa de alinhamento');
  await editor.locator('[name=etapaOrigem]').selectOption('Produção');
  await editor.locator('[name=causaRaiz]').selectOption({index:1});
  await editor.locator('[name=responsavelEtapa]').fill('Setor fictício');
  assert.ok(await editor.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.screenshot({path:'/tmp/pcp-retrabalho-qa/formulario-mobile.png'});
  await editor.getByRole('button',{name:'Confirmar retrabalho',exact:true}).click();
  await editor.waitFor({state:'detached'});assert.equal(await d.isVisible(),false);
  const after=await page.evaluate(()=>STORE.getOS('PARCIAL'));
  assert.equal(after.retrabalho,true);assert.equal(after.problema,'Placa fictícia precisa de alinhamento');
  assert.deepEqual(after.conferenciasEntrega,JSON.parse(before).conferenciasEntrega);
  assert.deepEqual(after.itens,JSON.parse(before).itens);
  // O mock saveOS é somente em memória. Enviar ao handler local fictício
  // simula a sincronização da fila, que a prévia não executa para O.S.
  const sync=await page.evaluate(async()=>{
   const r=await fetch('/controle-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'upsert',os:STORE.getOS('PARCIAL')})});
   return r.json();
  });
  assert.equal(sync.ok,true,JSON.stringify(sync));assert.equal(sync.os.retrabalho,true);
  // Reabrir recupera a quantidade que ficou em rascunho, sem confirmar a entrega.
  await page.evaluate(()=>conferirItensEntrega('PARCIAL','fixture-primeira'));
  await page.waitForFunction(()=>document.querySelector('[data-conf-qtde="0"]')?.value==='2');
  assert.equal(await d.getByRole('button',{name:'Editar retrabalho'}).count(),1);
  await page.evaluate(()=>{document.querySelector('#perf-dialog').close();STATE.user.papel='montagem';return conferirItensEntrega('PARCIAL');});
  assert.equal(await d.isVisible(),false);
  assert.deepEqual(errors,[]);console.log('OK: abertura direta, cancelamento, foco, confirmação, preservação da entrega e rascunho, mobile e permissão.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
