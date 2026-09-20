const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {webcrypto,createHmac}=require('node:crypto');
const clone=v=>structuredClone(v);
function banco(initial={}) {
 const db={pcp_registros:[],pcp_config_global:[{id:true,config:{instaladores:['Ana']},atualizado_em:'2026-09-19T10:00:00Z'}],equipe_contas:[],pcp_meta:[],...clone(initial)};
 const cliente={beforeWrite:null,rpc:async()=>({data:false,error:null}),from(table){
  let op='read',value,filters=[],one=false,take=Infinity,ignorar=false;
  const field=(r,k)=>k.includes('->>')?r[k.split('->>')[0]]?.[k.split('->>')[1]]:r[k];
  const q={select(){return q},eq(k,v){filters.push(r=>field(r,k)===v);return q},gt(k,v){filters.push(r=>field(r,k)>v);return q},gte(k,v){filters.push(r=>field(r,k)>=v);return q},lte(k,v){filters.push(r=>field(r,k)<=v);return q},neq(k,v){filters.push(r=>field(r,k)!==v);return q},in(k,a){filters.push(r=>a.includes(field(r,k)));return q},contains(k,v){filters.push(r=>Object.entries(v).every(([p,a])=>a.every(x=>r[k]?.[p]?.includes(x))));return q},or(){return q},not(){return q},order(){return q},limit(n){take=n;return q},maybeSingle(){one=true;return q},single(){one=true;return q},update(v){op='update';value=clone(v);return q},insert(v){op='insert';value=clone(v);return q},upsert(v,opt){op='upsert';value=clone(v);ignorar=opt?.ignoreDuplicates;return q},then(resolve,reject){
   try {
    if(op!=='read' && cliente.beforeWrite) { const f=cliente.beforeWrite;cliente.beforeWrite=null;f(db,table); }
    const rows=db[table] ||= [];let result=rows.filter(r=>filters.every(f=>f(r))).slice(0,take);
    if(op==='update') {for(const r of result)Object.assign(r,clone(value));}
    if(op==='insert'||op==='upsert') {result=[];for(const r of Array.isArray(value)?value:[value]) {
     const old=rows.find(x=>x.id===r.id && (!r.colecao || x.colecao===r.colecao));
     if(old && op==='insert') {resolve({data:null,error:{code:'23505',message:'duplicate key'}});return;}
     if(old){if(!ignorar)Object.assign(old,r);result.push(old);}else{const novo={apagado:false,atualizado_em:new Date().toISOString(),...r};rows.push(novo);result.push(novo);}
    }}
    resolve({data:clone(one?result[0]||null:result),count:result.length,error:null});
   } catch(e){reject(e);}
  }};return q;
 }};return {db,cliente};
}
async function edge(tipo,initial={}) {
 const {db,cliente}=banco(initial);let handler;
 const regras=await import('../../supabase/functions/_shared/pcp-integridade.mjs');
 const ctx=vm.createContext({console,URL,URLSearchParams,Request,Response,TextEncoder,TextDecoder,atob,btoa,crypto:webcrypto,setTimeout,clearTimeout,
  Deno:{env:{get:k=>({PCP_TOKEN:'machine-test',EQUIPE_JWT_SECRET:'test-secret',SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'}[k]||'')},serve:fn=>handler=fn},
  createClient:()=>cliente,...regras});
 const file=path.join(__dirname,'../../supabase/functions',tipo,'index.ts');
 const src=fs.readFileSync(file,'utf8').replace(/^import .*?;\s*$/mg,'').replace(/^export (?=(?:async )?function|const|let)/mg,'');
 vm.runInContext(stripTypeScriptTypes(src,{mode:'transform'}),ctx);
 function jwt(p){const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const body=Buffer.from(JSON.stringify({sis:'pcp',sub:p.nome||'Ana',nome:'Ana',papel:'montagem',exp:Math.floor(Date.now()/1000)+3600,...p})).toString('base64url');return head+'.'+body+'.'+createHmac('sha256','test-secret').update(head+'.'+body).digest('base64url');}
 return {db,cliente,run:code=>vm.runInContext(code,ctx),async call(body,who='machine'){
  const headers={'Content-Type':'application/json',...(who==='machine'?{'x-token':'machine-test'}:who?{authorization:'Bearer '+jwt(who)}:{})};
  const r=await handler(new Request('https://example.invalid',{method:'POST',headers,body:JSON.stringify(body)}));return {status:r.status,...await r.json()};
 }};
}
module.exports={edge};
