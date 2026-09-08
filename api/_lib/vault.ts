import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';

function key() {
  const value=Buffer.from(process.env.CRM_VAULT_KEY ?? '', 'base64');
  if(value.length!==32)throw new Error('CRM_VAULT_KEY must contain 32 random bytes encoded as base64');
  return value;
}
export function encrypt(value:unknown,context:string) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64');
}
export function decrypt<T>(value:string,context:string):T {
  const bytes=Buffer.from(value,'base64');
  if(bytes.length<29)throw new Error('Invalid encrypted value');
  const cipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));
  cipher.setAAD(Buffer.from(context));cipher.setAuthTag(bytes.subarray(12,28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8'));
}
export const randomToken=()=>randomBytes(32).toString('base64url');
export const digest=(value:string)=>createHash('sha256').update(value).digest('base64url');
