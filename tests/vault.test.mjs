import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {transform} from 'esbuild';
const {code}=await transform(await readFile('api/_lib/vault.ts','utf8'),{loader:'ts',format:'esm'});
const {encrypt,decrypt,digest,randomToken}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('OAuth secrets are authenticated, randomized and bound to their owner',()=>{
  const original=process.env.CRM_VAULT_KEY;
  process.env.CRM_VAULT_KEY=randomBytes(32).toString('base64');
  try{
    const payload={refresh_token:'synthetic-test-token'};
    const first=encrypt(payload,'owner1:google');
    assert.notEqual(first,encrypt(payload,'owner1:google'));
    assert.deepEqual(decrypt(first,'owner1:google'),payload);
    assert.throws(()=>decrypt(first,'owner2:google'));
    const corrupted=Buffer.from(first,'base64');corrupted[corrupted.length-1]^=1;
    assert.throws(()=>decrypt(corrupted.toString('base64'),'owner1:google'));
    assert.match(randomToken(),/^[A-Za-z0-9_-]{43}$/);
    assert.equal(digest('abc'),'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
    delete process.env.CRM_VAULT_KEY;
    assert.throws(()=>encrypt(payload,'owner1:google'),/32 random bytes/);
  }finally{if(original===undefined)delete process.env.CRM_VAULT_KEY;else process.env.CRM_VAULT_KEY=original}
});
