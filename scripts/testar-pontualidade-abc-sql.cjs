// PostgreSQL local via PGlite, apenas dados fictícios; não conecta à produção.
// PGLITE_MODULE pode apontar para uma instalação temporária de @electric-sql/pglite.
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const raiz=path.resolve(__dirname,'..'),ler=p=>fs.readFileSync(path.join(raiz,p),'utf8');
(async()=>{
 const db=new PGlite(),checks=[];
 const oficial=ler('tests/fixtures/painel-abc-oficial.sql');
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table painel_registros(id text,colecao text,registro jsonb);
   create table painel_ordens(id text,numero text,cliente text,cliente_chave text,data date,valor numeric);`);
  await db.exec(oficial);await db.exec(ler('supabase/migrations/20261014170059_pcp_pontualidade_abc.sql'));
  const obj=async(sql,args=[])=>{const r=await db.query(sql,args);return r.rows[0].d;};
  const comparar=async(ano)=>{
   const o=await obj('select painel_clientes_abc($1) d',[ano]);
   const ns=(await db.query('select distinct numero from painel_ordens')).rows.map(r=>r.numero);
   const p=await obj('select pcp_pontualidade_abc($1,$2::text[]) d',[ano,ns]);
   assert.equal(p.disponivel,true);assert.equal(p.ano,ano);
   // Identidades sintéticas são equivalentes aos números, exceto os grupos conferidos à parte.
   const os=new Map(p.ordens.map(r=>[r.numero,r]));
   for(const c of o.lista){if(c.ehGrupo)continue;assert.equal(os.get(c.chave)?.classe,c.classe);}
   const contagem={};for(const r of p.ordens)if(r.classe)contagem[r.classe]=(contagem[r.classe]||0)+1;
   return {o,p,os,contagem};
  };
  // Mais de 200 A+ e classes no fim da carteira. Empates respeitam a chave.
  await db.exec(`insert into painel_ordens select 'id-'||n,'FICTICIO-'||lpad(n::text,4,'0'),'Cliente fictício '||n,'FICTICIO-'||lpad(n::text,4,'0'),date '2025-02-10',100 from generate_series(1,700) n;`);
  let {o,p,contagem}=await comparar('2025');
  assert.equal(o.lista.length,200);assert.ok(p.clientesAmais.length>200);assert.equal(p.ordens.length,700);
  for(const c of o.classes)assert.equal(contagem[c.classe],c.clientes);
  assert.ok(p.ordens.some(r=>r.classe==='C'));assert.ok(p.clientesAmais.every(c=>!('valor' in c)&&!('os' in c)));checks.push('700 clientes, todas as classes e A+ além do limite de 200');
  // Dois CNPJs fictícios formam um grupo e recebem a mesma classe e chave.
  await db.exec(`insert into painel_registros values ('grupo-ficticio','grupos_clientes','{"nome":"Grupo fictício","membros":["FICTICIO-0699","FICTICIO-0700"]}');`);
  let r=await comparar('2025');const grupo=r.o.lista.find(c=>c.chave==='grupo-ficticio');assert.ok(grupo);assert.equal(r.os.get('FICTICIO-0699').classe,grupo.classe);assert.equal(r.os.get('FICTICIO-0700').classe,grupo.classe);assert.equal(r.os.get('FICTICIO-0700').chave,'grupo-ficticio');assert.ok(r.p.clientesAmais.some(c=>c.nome==='Grupo fictício'&&c.grupo));checks.push('grupos vinculados usam classificação e chave da curva oficial');
  // Duplicidade ambígua não escolhe cliente pelo nome. Cliente sem venda anual permanece sem classe.
  await db.exec(`insert into painel_ordens values ('amb-1','AMBIGUA','Mesmo nome fictício','chave-1',date '2025-02-10',10),('amb-2','AMBIGUA','Mesmo nome fictício','chave-2',date '2025-02-10',10),('antiga','ANTIGA','Cliente fictício antigo','antigo',date '2024-02-10',10);`);
  p=await obj('select pcp_pontualidade_abc($1,$2::text[]) d',['2025',['AMBIGUA','ANTIGA','INEXISTENTE']]);assert.equal(p.ordens.length,1);assert.equal(p.ordens[0].numero,'ANTIGA');assert.equal(p.ordens[0].classe,null);checks.push('ambiguidade, falta de vínculo e ano diferente não viram classe C');
  p=await obj('select pcp_pontualidade_abc($1,$2::text[]) d',['2023',['ANTIGA']]);assert.deepEqual(p.clientesAmais,[]);assert.equal(p.ordens[0].classe,null);checks.push('ano vazio tem fonte válida, sem classificação inventada');
  await assert.rejects(db.query('select pcp_pontualidade_abc($1)', ['todos']),/inválida/);
  const acesso=(await db.query("select has_function_privilege('anon','pcp_pontualidade_abc(text,text[])','execute') a,has_function_privilege('authenticated','pcp_pontualidade_abc(text,text[])','execute') u,has_function_privilege('service_role','pcp_pontualidade_abc(text,text[])','execute') s")).rows[0];assert.deepEqual(acesso,{a:false,u:false,s:true});checks.push('parâmetros validados e execução restrita ao servidor');
  const antes=(await db.query('select count(*) n,sum(valor) v from painel_ordens')).rows;
  await db.query('select pcp_pontualidade_abc($1,$2::text[])',['2025',['FICTICIO-0001']]);assert.deepEqual((await db.query('select count(*) n,sum(valor) v from painel_ordens')).rows,antes);checks.push('consulta não grava nem altera valores');
  // Mudança incompatível da fonte é detectada, em vez de devolver classes incorretas.
  await db.exec(`create or replace function public.painel_clientes_abc(p_ano text default null) returns jsonb language sql stable security definer set search_path=public as $$ select '{"clientesQtd":9999,"total":0,"classes":[],"lista":[]}'::jsonb $$;`);
  await assert.rejects(db.query('select pcp_pontualidade_abc($1)',['2025']),/não conferiu/);checks.push('divergência na fonte interrompe a segmentação');
  await db.exec(oficial);await db.exec('truncate painel_ordens;truncate painel_registros;');
  await db.exec(`insert into painel_ordens values ('zero','ZERO','Cliente fictício zero','ZERO',date '2025-02-10',0);`);
  r=await comparar('2025');assert.equal(r.os.get('ZERO').classe,'C');assert.deepEqual(r.p.clientesAmais,[]);checks.push('total zero segue a regra oficial');
  console.log(JSON.stringify({ok:true,checks},null,2));
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
