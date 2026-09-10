import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

test('Woo sync writes real catalog through conflict protection and never requests orders',async()=>{
  let role='admin', conflict=false, calls=0, saved=null;
  globalThis.__wooRouteTest={
    user:()=>({crm_user_id:'owner',role}),
    read:async(resource)=>{assert.equal(resource,'products');calls++;return [{id:5,name:'Product',status:'publish',price:'9'}]},
    db:{from(table){return {select(){return this},eq(){return this},async single(){
      assert.equal(table,'crm_config');return {data:{id:'config',products:[]},error:null};
    },async upsert(){return {error:{message:'History unavailable'}}}}},
    async rpc(name,args){assert.equal(name,'crm_apply_changes');assert.equal(args.actor,'owner');
      if(conflict)return {error:{code:'40001'}};
      saved=args.changes;return {error:null};
    }},
  };
  try {
    const bundle=await build({entryPoints:['api/integrations.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{
      name:'fixtures',setup(b){
        b.onResolve({filter:/^\.\/_lib\/(auth|supabaseAdmin|wordpress)$/},args=>({path:args.path,namespace:'fixture'}));
        b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:
          args.path.endsWith('/auth')?'export const validateRequest=async()=>globalThis.__wooRouteTest.user();':
          args.path.endsWith('/supabaseAdmin')?'export const supabaseAdmin=globalThis.__wooRouteTest.db;':
          'export const wordpressConfigured=()=>true; export const readWooCommerce=globalThis.__wooRouteTest.read;',
        }));
      },
    }]});
    const {default:handler}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    async function run(){const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};
      await handler({method:'POST',headers:{authorization:'Bearer synthetic'},body:{action:'sync-products'}},res);return res;}
    const success=await run();assert.equal(success.statusCode,200);assert.equal(success.body.historySaved,false);
    assert.equal(saved[0].after.products[0].wooCommerceId,5);assert.equal(saved[0].table,'crm_config');
    assert.deepEqual(saved[0].before,{id:'config',products:[]});
    conflict=true;assert.equal((await run()).statusCode,409);
    role='salesperson';const before=calls;assert.equal((await run()).statusCode,403);assert.equal(calls,before);
  } finally {delete globalThis.__wooRouteTest}
});
