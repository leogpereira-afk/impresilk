// Somente a prévia local e dados fictícios. Não acessa o ambiente publicado.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const base=process.env.PCP_PREVIEW_URL||'http://127.0.0.1:49137/';assert.match(base,/^http:\/\/127\.0\.0\.1:\d+\/$/);
 const out=process.env.QA_OUTPUT||'/tmp/pcp-pontualidade-abc-qa';fs.mkdirSync(out,{recursive:true});
 const b=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
 const errors=[],checks=[];
 try{
  const p=await b.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'#aba=entregas&relatorios=1');await p.locator('.rel-ent-abc').waitFor();
  const classe=c=>p.locator('[data-rel-abc-classe="'+c+'"]');
  const bloco=p.locator('.rel-ent-pontualidade');
  const resumo=()=>p.locator('.rel-ent-resumo-grid').innerText();
  const antes=await resumo();
  assert.equal(await p.locator('[data-rel-abc-classe]').count(),6);assert.equal(await p.locator('#rel-ent-abc-cliente').count(),0);
  for(const [c,n] of [['A+',16],['A',16],['B+',15],['B',15],['C',15]]){
   await classe(c).click();assert.equal(await classe(c).getAttribute('aria-pressed'),'true');
   assert.match(await bloco.innerText(),new RegExp('de '+n+' entregues'));assert.equal(await p.locator('#rel-ent-abc-cliente').count(),c==='A+'?1:0);assert.equal(await resumo(),antes);
  }checks.push('cinco classes atualizam a pontualidade sem alterar o resumo financeiro');
  await classe('A+').click();await p.locator('#rel-ent-abc-cliente').selectOption('cliente-ficticio-1');
  assert.match(await bloco.innerText(),/de 1 entregues/);assert.match(await bloco.innerText(),/Classe A\+ · Cliente fictício 1/);
  await p.locator('[data-rel-quadro="pontualidade"] > summary').click();assert.equal(await p.locator('[data-rel-prazo-linha]').count(),1);checks.push('cliente A+ filtra gráfico e conferência por O.S.');
  await p.locator('.rel-ent-abc').screenshot({path:out+'/desktop-abc.png'});
  // O mês clicado continua com o recorte da classe e cliente selecionados.
  await p.locator('[data-rel-prazo-ponto$="-09"]').first().click();assert.equal(await p.locator('#rel-ent-abc-cliente').inputValue(),'cliente-ficticio-1');assert.match(await bloco.innerText(),/set \/ 2026/);checks.push('clique no mês mantém classe e cliente A+');
  await p.locator('#rel-ent-pdf').click();await p.locator('#impressao-pcp').waitFor();assert.match(await p.locator('#impressao-pcp').innerText(),/Classe A\+ · Cliente fictício 1/);checks.push('prévia de PDF identifica o filtro A+ e o cliente');
  // Página nova para conferir navegação por teclado e mudanças de ano, sem o diálogo de impressão.
  await p.goto(base+'?qa=2#aba=entregas&relatorios=1');await p.locator('.rel-ent-abc').waitFor();
  await classe('B+').focus();await p.keyboard.press('Enter');assert.equal(await classe('B+').getAttribute('aria-pressed'),'true');assert.equal(await classe('B+').evaluate(e=>e===document.activeElement),true);
  await classe('A+').click();await p.locator('#rel-ent-abc-cliente').selectOption('cliente-ficticio-1');await p.locator('#rel-ent-ano').selectOption('2025');await p.waitForFunction(()=>document.querySelector('.rel-ent-abc-topo')?.textContent.includes('2025'));
  assert.equal(await p.locator('#rel-ent-abc-cliente').inputValue(),'');assert.equal(await classe('A+').getAttribute('aria-pressed'),'true');checks.push('teclado, foco e troca de ano preservam a classe e limpam cliente');
  // Mobile: chips e seletor dentro da tela, sem cortes ou escolha individual nas outras classes.
  await p.setViewportSize({width:390,height:844});await p.locator('.rel-ent-abc').scrollIntoViewIfNeeded();
  // Aguarda o fim visual da transição do menu ao mudar desktop para celular.
  await p.screenshot({path:out+'/mobile-abc.png',animations:'disabled'});
  const medidas=await p.evaluate(()=>({largura:innerWidth,total:document.documentElement.scrollWidth,campos:[...document.querySelectorAll('.rel-ent-abc button,.rel-ent-abc select')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,direita:r.right,altura:r.height};})}));
  assert.ok(medidas.total<=medidas.largura+1,JSON.stringify(medidas));assert.ok(medidas.campos.every(r=>r.x>=0&&r.direita<=390&&r.altura>=39));
  assert.equal(await classe('A+').evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'chip não coberto pelo menu lateral');await classe('C').click();assert.equal(await p.locator('#rel-ent-abc-cliente').count(),0);await classe('').click();assert.match(await bloco.innerText(),/de 80 entregues/);checks.push('390px sem corte horizontal; controles legíveis e retorno a Todos');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks,errors,out},null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
