import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build,transform} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';

test('OAuth callback rejects missing binding, reused state, demotion and missing scopes',async()=>{
  const original=process.env.CRM_VAULT_KEY;
  process.env.CRM_VAULT_KEY=randomBytes(32).toString('base64');
  const compiled=await transform(await readFile('api/_lib/vault.ts','utf8'),{loader:'ts',format:'esm'});
  const vault=await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
  let pending=true,role='admin',granted='calendar-scope',exchanges=0,saves=0;
  const owner='admin';
  globalThis.__crmOAuthTest={
    db:{from(table){
      const chain={delete(){return this},eq(){return this},gt(){return this},select(){return this},
        async single(){
          if(table==='google_oauth_states'){
            if(!pending)return {data:null,error:{}};
            pending=false;
            return {data:{owner,verifier:vault.encrypt('verifier',owner+':pkce')},error:null};
          }
          return {data:{role},error:null};
        },async upsert(row){assert.equal(table,'google_connections');saves++;assert.equal(vault.decrypt(row.token,owner+':google').refresh_token,'synthetic-refresh');return {error:null}}};
      return chain;
    }},
    async exchange(){exchanges++;return {scope:granted,access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600}},
  };
  try{
    const bundle=await build({entryPoints:['api/google.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{
      name:'test-boundaries',setup(b){
        b.onResolve({filter:/^\.\/_lib\/(auth|supabaseAdmin|google)$/},args=>({path:args.path,namespace:'fixture'}));
        b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:
          args.path.endsWith('/auth')?'export const validateRequest=async()=>null;':
          args.path.endsWith('/supabaseAdmin')?'export const supabaseAdmin=globalThis.__crmOAuthTest.db;':
          "export const scopes=['calendar-scope']; export const settings=()=>({origin:'https://crm.example.test',callback:'https://crm.example.test/api/google'}); export const tokenRequest=globalThis.__crmOAuthTest.exchange; export const googlePages=async()=>[];",
        }));
      },
    }]});
    const {default:handler}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    async function callback(bound=true){
      const response={headers:{},location:'',setHeader(k,v){this.headers[k]=v;return this},redirect(status,url){this.statusCode=status;this.location=url;return this}};
      await handler({method:'GET',query:{code:'synthetic-code',state:'state'},headers:{cookie:bound?'__Host-crm_google_state=state':''}},response);
      return response;
    }
    assert.match((await callback(false)).location,/failed/);assert.equal(exchanges,0);assert.equal(pending,true);
    assert.match((await callback()).location,/authorized/);assert.equal(saves,1);
    assert.match((await callback()).location,/failed/);assert.equal(exchanges,1);
    pending=true;role='salesperson';assert.match((await callback()).location,/failed/);assert.equal(exchanges,1);
    pending=true;role='admin';granted='';assert.match((await callback()).location,/failed/);assert.equal(saves,1);
  }finally{
    delete globalThis.__crmOAuthTest;
    if(original===undefined)delete process.env.CRM_VAULT_KEY;else process.env.CRM_VAULT_KEY=original;
  }
});
