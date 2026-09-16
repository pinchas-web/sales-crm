import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
const {code}=await transform(await readFile('api/_lib/wordpress.ts','utf8'),{loader:'ts',format:'esm'});
const {readWooCommerce}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const {code:diffCode}=await transform(await readFile('api/_lib/state-diff.ts','utf8'),{loader:'ts',format:'esm'});
const {diffRows}=await import(`data:text/javascript;base64,${Buffer.from(diffCode).toString('base64')}`);

test('changes contain only explicit edits and deletes',()=>{
  const before=[{id:'a',name:'Old'},{id:'b',name:'Keep'}];
  assert.deepEqual(diffRows('leads',before,[{id:'b',name:'Keep'},{id:'a',name:'New'}]),[
    {table:'leads',before:{id:'a',name:'Old'},after:{id:'a',name:'New'}},
  ]);
  assert.throws(()=>diffRows('leads',[],[{id:'a'},{id:'a'}]),/Duplicate/);
});
test('WordPress importer paginates and fails closed on upstream error',async()=>{
  const original=globalThis.fetch;
  const username=process.env.WORDPRESS_USERNAME;
  const password=process.env.WORDPRESS_APPLICATION_PASSWORD;
  process.env.WORDPRESS_USERNAME='test';process.env.WORDPRESS_APPLICATION_PASSWORD='test-only';
  try {
    let calls=0;
    globalThis.fetch=async(url,options)=>{
      calls++;
      assert.equal(url.origin,'https://pinchashorvitz.co.il');
      assert.equal(options.redirect,'error');
      assert.equal(url.searchParams.get('page'),String(calls));
      return Response.json(calls===1?Array.from({length:100},(_,id)=>({id})):[]);
    };
    assert.equal((await readWooCommerce('products')).length,100);
    assert.equal(calls,2);
    globalThis.fetch=async()=>new Response('',{status:401});
    await assert.rejects(readWooCommerce('orders'),/401/);
  } finally {
    globalThis.fetch=original;
    if(username===undefined)delete process.env.WORDPRESS_USERNAME;else process.env.WORDPRESS_USERNAME=username;
    if(password===undefined)delete process.env.WORDPRESS_APPLICATION_PASSWORD;else process.env.WORDPRESS_APPLICATION_PASSWORD=password;
  }
});
