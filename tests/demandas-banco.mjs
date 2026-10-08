// Execução adicional: PGLITE_MODULE aponta para a instalação local de @electric-sql/pglite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table pcp_registros(id text primary key,registro jsonb);insert into pcp_registros values ('os-original','{\"prazo\":\"2026-10-09\",\"prioridade\":\"alta\"}');");
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261008_demandas.sql',import.meta.url),'utf8'));
 const put=(rev,mutation,registro={id:'d1',titulo:'Teste'})=>db.query('select pcp_demanda_gravar($1,$2,$3,$4) r',['d1',registro,rev,mutation]);
 assert.equal((await put(0,'m1')).rows[0].r.revision,1);
 assert.equal((await put(0,'m1')).rows[0].r.revision,1);
 await assert.rejects(put(0,'m2'),{code:'40001'});
 assert.equal((await put(1,'m2',{id:'d1',situacao:'concluida'})).rows[0].r.revision,2);
 const perms=await db.query("select has_function_privilege('anon','pcp_demanda_gravar(text,jsonb,bigint,text)','EXECUTE') a,has_function_privilege('authenticated','pcp_demanda_gravar(text,jsonb,bigint,text)','EXECUTE') u");assert.equal(perms.rows[0].a,false);assert.equal(perms.rows[0].u,false);
 assert.deepEqual((await db.query('select registro from pcp_registros')).rows[0].registro,{prazo:'2026-10-09',prioridade:'alta'});
 assert.equal((await db.query("select public from storage.buckets where id='pcp-demandas'")).rows[0].public,false);
 assert.equal((await db.query("select relrowsecurity from pg_class where relname='pcp_demandas'")).rows[0].relrowsecurity,true);
 console.log('SQL: criação, reenvio, conflito, conclusão, RLS, RPC privado, bucket privado e O.S. intacta — 8 verificações passaram.');
}finally{await db.close();}
