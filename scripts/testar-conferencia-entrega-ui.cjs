// Pré-requisito: scripts/preview-auditoria.cjs. Só dados fictícios, sem API real.
// NODE_PATH precisa incluir Playwright. PCP_PREVIEW_URL e CHROME_BIN são opcionais.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
 const destino=process.env.QA_OUTPUT || '/tmp/pcp-entregas-parciais-qa';fs.mkdirSync(destino,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
 try {
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.PCP_PREVIEW_URL || 'http://127.0.0.1:4201/')+'#aba=performance');
  const rows=page.getByRole('row').filter({has:page.getByRole('button',{name:'TESTE-PARCIAL',exact:true})});
  await rows.getByRole('button',{name:'Conferir',exact:true}).click();
  const d=page.getByRole('dialog');await d.waitFor();
  await d.getByRole('heading',{name:'Itens e equipe · O.S. TESTE-PARCIAL'}).waitFor();
  assert.match(await d.locator('#conf-aloc').innerText(),/Ana/,'preserva a pessoa indicada na primeira conferência');
  assert.equal(await d.locator('[data-conf-item]:checked').count(),0,'não presume entrega completa');
  assert.equal(await d.locator('#conf-salvar').isDisabled(),true);
  await d.getByRole('checkbox',{name:'Painel de fachada 4 de 4 disponível(is) · unidades'}).check();
  await d.locator('[data-conf-qtde="0"]').fill('2');
  assert.match(await d.locator('.aloc-previa').innerText(),/2\.125,00/);assert.equal(await d.getByRole('button',{name:'Confirmar esta entrega'}).isEnabled(),true);
  assert.match(await d.locator('.conf-parte').innerText(),/Entrega parcial/);
  assert.match(await d.locator('.conf-parte').innerText(),/Falta entregar: R\$\s*6\.375,00/);
  assert.match(await d.locator('.conf-parte').innerText(),/100% aqui significa a participação nos itens selecionados/);
  await d.getByRole('button',{name:'Editar itens e quantidades'}).click();
  assert.equal(await d.locator('[data-conf-item="0"]').evaluate(e=>e===document.activeElement),true);
  await page.screenshot({path:path.join(destino,'entrega-parcial-desktop.png')});
  await d.locator('.aloc-previa').count().then(async n=>{if(n)await d.locator('.aloc-previa').scrollIntoViewIfNeeded();});
  await d.getByRole('button',{name:'Confirmar esta entrega'}).click();await d.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('[data-perf-id*="PARCIAL::entrega:"]'));
  assert.equal(await rows.count(),1);assert.match(await rows.innerText(),/2\.125,00/);assert.match(await rows.innerText(),/Painel de fachada × 2/);
  // Corrigir a quantidade altera a mesma entrega, sem duplicar pontos ou valor.
  for(const [quantidade,valor] of [['1','1.062,50'],['2','2.125,00']]){
   await rows.getByRole('button',{name:'Conferir',exact:true}).click();
   await d.locator('[data-conf-qtde="0"]').fill(quantidade);
   assert.ok((await d.locator('.aloc-previa').innerText()).includes(valor));
   await d.getByRole('button',{name:'Salvar alterações da entrega',exact:true}).click();await d.waitFor({state:'hidden'});
   await page.waitForFunction(v=>document.querySelector('[data-perf-id*="PARCIAL::entrega:"]')?.innerText.includes(v),valor);
   assert.equal(await rows.count(),1);assert.ok((await rows.innerText()).includes(valor));
  }
  await rows.getByRole('button',{name:'Conferir',exact:true}).click();
  await d.locator('.conf-parte').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(destino,'editar-parcial-pessoa.png')});
  await d.getByRole('button',{name:'+ Nova entrega',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-conf-abrir=""]')?.disabled===true);
  assert.equal(await d.locator('.aloc-previa tbody tr').count(),0,'nova entrega não herda equipe anterior');
  assert.match(await d.innerText(),/2 de 4 disponível/);
  await d.getByRole('button',{name:'Selecionar saldo disponível'}).click();
  await d.getByRole('button',{name:'Leão 2 pessoas'}).click();
  assert.match(await d.innerText(),/6\.375,00/);
  await page.setViewportSize({width:390,height:844});
  assert.ok(await d.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'dialog horizontal overflow');
  await page.screenshot({path:path.join(destino,'entrega-parcial-mobile.png')});
  await d.getByRole('button',{name:'Confirmar esta entrega'}).click();await d.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelectorAll('[data-perf-id*="PARCIAL::entrega:"]').length===2);
  assert.equal(await rows.count(),2);
  const textos=await rows.allInnerTexts();assert.ok(textos.some(t=>/Ana/.test(t)&&/2\.125,00/.test(t)));assert.ok(textos.some(t=>/Leão/.test(t)&&/6\.375,00/.test(t)));
  await page.setViewportSize({width:1366,height:900});
  await page.locator('#perf-busca-os').fill('TESTE-PARCIAL');
  await page.locator('.perf-entregas').scrollIntoViewIfNeeded();
  await page.locator('.perf-entregas').screenshot({path:path.join(destino,'duas-equipes-conferidas.png')});
  // Uma terceira entrega não pode contabilizar os itens novamente.
  await rows.first().getByRole('button',{name:'Conferir',exact:true}).click();
  await d.getByRole('button',{name:'+ Nova entrega',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-conf-abrir=""]')?.disabled===true);
  assert.equal(await d.getByRole('checkbox').count(),2);
  for(const cb of await d.getByRole('checkbox').all())assert.equal(await cb.isDisabled(),true);
  assert.equal(await d.getByRole('button',{name:'Confirmar esta entrega'}).isDisabled(),true);
  await d.getByRole('button',{name:'Cancelar',exact:true}).click();
  // As duas portas na aba Entregas também precisam abrir a seleção.
  // A prévia lê a aba no carregamento: mudar só o fragmento não reinicia o DOM.
  for(const vista of ['tabela', 'poros']){
   await page.goto((process.env.PCP_PREVIEW_URL || 'http://127.0.0.1:4201/')+'?qa='+vista+'#aba=entregas&vista='+vista);
   await page.locator(vista==='poros'?'[data-poros-itens="F01"]':'[data-ent-itens="F01"]').click();
   await d.getByRole('heading',{name:'Itens e equipe · O.S. T-F01'}).waitFor();
   await d.getByRole('button',{name:'Cancelar',exact:true}).click();
  }
  assert.deepEqual(errors,[]);console.log('UI OK: Conferir abre itens; mantém pessoa da O.S.; seleção explícita de 2/4; edição para 1/4 e volta a 2/4 sem duplicar; resumo parcial e saldo 6375; nova entrega sem herdar equipe; duas equipes; terceira entrega bloqueada; celular sem overflow; atalhos em Entregas (Tabela e Por O.S.).');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
