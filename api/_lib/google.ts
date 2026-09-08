import {supabaseAdmin} from './supabaseAdmin';
import {encrypt,decrypt} from './vault';

export const scopes=['https://www.googleapis.com/auth/calendar.calendarlist.readonly','https://www.googleapis.com/auth/calendar.events.readonly'];
export type Token={access_token:string;refresh_token:string;expires_at:number};
export function settings() {
  const origin=new URL(process.env.CRM_ORIGIN ?? '');
  if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('Invalid CRM_ORIGIN');
  const clientId=process.env.GOOGLE_CLIENT_ID,clientSecret=process.env.GOOGLE_CLIENT_SECRET;
  if(!clientId||!clientSecret||!process.env.CRM_VAULT_KEY)throw new Error('Google is not configured');
  return {origin:origin.origin,clientId,clientSecret,callback:origin.origin+'/api/google'};
}
export async function tokenRequest(params:Record<string,string>) {
  const cfg=settings();
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',body:new URLSearchParams({client_id:cfg.clientId,client_secret:cfg.clientSecret,...params}),
    redirect:'error',signal:AbortSignal.timeout(15000),
  });
  if(!response.ok)throw new Error('Google token exchange failed');
  return response.json();
}
export async function accessToken(owner:string) {
  const {data,error}=await supabaseAdmin.from('google_connections').select('token').eq('owner',owner).single();
  if(error||!data)throw new Error('Google authorization required');
  let token=decrypt<Token>(data.token,owner+':google');
  if(token.expires_at<Date.now()+60000){
    const fresh=await tokenRequest({grant_type:'refresh_token',refresh_token:token.refresh_token});
    if(typeof fresh.access_token!=='string')throw new Error('Invalid token response');
    token={access_token:fresh.access_token,refresh_token:fresh.refresh_token??token.refresh_token,expires_at:Date.now()+Number(fresh.expires_in??3600)*1000};
    const {error:saveError}=await supabaseAdmin.from('google_connections').update({token:encrypt(token,owner+':google'),updated_at:new Date().toISOString()}).eq('owner',owner).eq('token',data.token);
    if(saveError)throw saveError;
  }
  return token.access_token;
}
export async function googlePages(owner:string,path:string,query:Record<string,string>,limit=2000) {
  const token=await accessToken(owner);
  const items:Record<string,unknown>[]=[];
  let pageToken='';
  let pages=0;
  do {
    if(++pages>20)throw new Error('Calendar pagination limit exceeded');
    const url=new URL('https://www.googleapis.com/calendar/v3/'+path);
    for(const [key,value]of Object.entries(query))url.searchParams.set(key,value);
    if(pageToken)url.searchParams.set('pageToken',pageToken);
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Google calendar read failed');
    const body=await response.json();
    if(body.items&&!Array.isArray(body.items))throw new Error('Invalid Google response');
    items.push(...(body.items??[]));
    pageToken=body.nextPageToken??'';
    if(items.length>limit||(items.length===limit&&pageToken))throw new Error('Calendar exceeds import limit');
  }while(pageToken);
  return items;
}
