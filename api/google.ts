import type {VercelRequest,VercelResponse} from '@vercel/node';
import {validateRequest} from './_lib/auth';
import {supabaseAdmin} from './_lib/supabaseAdmin';
import {settings,scopes,tokenRequest,googlePages} from './_lib/google';
import {encrypt,decrypt,randomToken,digest} from './_lib/vault';

const cookieName='__Host-crm_google_state';
const cookie=(value:string,maxAge:number)=>`${cookieName}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
const scalar=(value:unknown)=>typeof value==='string'?value:'';

export default async function handler(req:VercelRequest,res:VercelResponse) {
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  if(req.method==='GET'&&(req.query.code||req.query.error)){
    res.setHeader('Set-Cookie',cookie('',0));
    try {
      const state=scalar(req.query.state),code=scalar(req.query.code);
      const bound=(req.headers.cookie??'').split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1);
      if(!state||state.length>200||state!==bound||!code||code.length>4096)throw new Error('Invalid OAuth callback');
      // DELETE ... RETURNING makes the callback state single-use, including exchange failures.
      const {data:pending,error}=await supabaseAdmin.from('google_oauth_states').delete().eq('id',digest(state)).gt('expires_at',new Date().toISOString()).select('*').single();
      if(error||!pending)throw new Error('Expired OAuth state');
      const {data:owner}=await supabaseAdmin.from('crm_users').select('role').eq('crm_user_id',pending.owner).single();
      if(owner?.role!=='admin')throw new Error('Owner no longer authorized');
      const cfg=settings();
      const result=await tokenRequest({grant_type:'authorization_code',code,redirect_uri:cfg.callback,code_verifier:decrypt<string>(pending.verifier,pending.owner+':pkce')});
      const granted=new Set(String(result.scope??'').split(' '));
      if(!scopes.every(s=>granted.has(s))||typeof result.access_token!=='string'||typeof result.refresh_token!=='string')throw new Error('Required access was not granted');
      const token=encrypt({access_token:result.access_token,refresh_token:result.refresh_token,expires_at:Date.now()+Number(result.expires_in??3600)*1000},pending.owner+':google');
      const {error:saveError}=await supabaseAdmin.from('google_connections').upsert({owner:pending.owner,token,updated_at:new Date().toISOString()});
      if(saveError)throw saveError;
      return res.redirect(303,cfg.origin+'/?integration=google&result=authorized');
    }catch{
      return res.redirect(303,'/?integration=google&result=failed');
    }
  }
  const user=await validateRequest(req.headers.authorization);
  if(!user||user.role!=='admin')return res.status(403).json({error:'Admin only'});
  try {
    if(req.method==='GET'){
      let configured=false;try{settings();configured=true}catch{/* configuration is incomplete */}
      const {data,error}=await supabaseAdmin.from('google_connections').select('calendar_id,updated_at').eq('owner',user.crm_user_id).maybeSingle();
      if(error)return res.status(503).json({error:'Google database setup is required'});
      const {data:snapshot,error:snapshotError}=await supabaseAdmin.from('integration_snapshots').select('payload,synced_at').eq('provider','google-calendar:'+user.crm_user_id).maybeSingle();
      if(snapshotError)throw snapshotError;
      return res.json({configured,authorized:Boolean(data),calendarId:data?.calendar_id??null,events:snapshot?.payload?.events??[],lastSync:snapshot?.synced_at??null});
    }
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
    const action=scalar(req.body?.action),owner=user.crm_user_id;
    if(action==='connect'){
      const cfg=settings(),state=randomToken(),verifier=randomToken();
      await supabaseAdmin.from('google_oauth_states').delete().or(`owner.eq.${owner},expires_at.lt.${new Date().toISOString()}`).throwOnError();
      await supabaseAdmin.from('google_oauth_states').insert({id:digest(state),owner,verifier:encrypt(verifier,owner+':pkce'),expires_at:new Date(Date.now()+600000).toISOString()}).throwOnError();
      const query=new URLSearchParams({client_id:cfg.clientId,redirect_uri:cfg.callback,response_type:'code',scope:scopes.join(' '),access_type:'offline',prompt:'consent select_account',state,code_challenge:digest(verifier),code_challenge_method:'S256'});
      res.setHeader('Set-Cookie',cookie(state,600));
      return res.json({url:'https://accounts.google.com/o/oauth2/v2/auth?'+query});
    }
    const calendars=await googlePages(owner,'users/me/calendarList',{maxResults:'250',fields:'items(id,summary,timeZone,accessRole),nextPageToken'},1000);
    if(action==='calendars')return res.json({calendars});
    if(action==='sync'){
      const id=scalar(req.body?.calendarId);
      if(!id||!calendars.some(c=>c.id===id))return res.status(403).json({error:'Calendar is not authorized'});
      const now=Date.now();
      const events=await googlePages(owner,`calendars/${encodeURIComponent(id)}/events`,{
        singleEvents:'true',orderBy:'startTime',maxResults:'250',
        timeMin:new Date(now-30*86400000).toISOString(),timeMax:new Date(now+90*86400000).toISOString(),
        fields:'items(id,summary,start,end,status,htmlLink,updated),nextPageToken',
      });
      await supabaseAdmin.from('integration_snapshots').upsert({provider:'google-calendar:'+owner,payload:{calendarId:id,events},record_count:events.length,synced_at:new Date().toISOString()}).throwOnError();
      await supabaseAdmin.from('google_connections').update({calendar_id:id}).eq('owner',owner).throwOnError();
      return res.json({ok:true,count:events.length});
    }
    return res.status(400).json({error:'Unknown action'});
  }catch{return res.status(502).json({error:'Google action failed. Check configuration and granted permissions.'});}
}
