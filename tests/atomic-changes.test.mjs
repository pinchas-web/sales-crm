import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('atomic changes preserve concurrent data and enforce persisted ownership', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);`);
    await db.exec(await readFile('supabase/001_init.sql','utf8'));
    const courses = await readFile('supabase-courses-migration.sql','utf8');
    await db.exec(courses.slice(0,courses.indexOf('CREATE POLICY')));
    await db.exec(await readFile('supabase-marketing-migration.sql','utf8'));
    await db.exec(`insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
      insert into crm_users(auth_user_id,crm_user_id,email,role) values
      ('00000000-0000-0000-0000-000000000001','admin','admin@example.test','admin'),
      ('00000000-0000-0000-0000-000000000002','sales','sales@example.test','salesperson');
      insert into leads(id,name,assigned_to) values ('a','Original','sales'),('b','External lead','admin');`);
    await db.exec(await readFile('supabase/002_atomic_changes.sql','utf8'));
    const apply = (actor,changes) => db.query('select crm_apply_changes($1,$2::jsonb)',[actor,JSON.stringify(changes)]);
    const edit = {table:'leads',before:{id:'a',name:'Original',assigned_to:'sales'},after:{id:'a',name:'Edited',assigned_to:'sales'}};
    await apply('sales',[edit]);
    assert.equal((await db.query("select name from leads where id='b'")).rows[0].name,'External lead');
    await assert.rejects(apply('sales',[edit]), /Record changed/);
    await assert.rejects(apply('sales',[{table:'leads',before:{id:'b',name:'External lead',assigned_to:'admin'},after:{id:'b',name:'Stolen',assigned_to:'sales'}}]), /Forbidden/);
    await assert.rejects(apply('sales',[
      {table:'tasks',before:null,after:{id:'rollback',assigned_to:'sales',due_date:'2026-09-08'}},
      {table:'crm_config',before:null,after:{id:'00000000-0000-0000-0000-000000000009'}}
    ]), /Forbidden/);
    assert.equal((await db.query("select * from tasks where id='rollback'")).rows.length,0);
    await assert.rejects(apply('admin',[{table:'crm_users',before:null,after:{id:'hack'}}]), /Invalid table/);
    const rls = await db.query("select relrowsecurity from pg_class where oid='public.leads'::regclass");
    assert.equal(rls.rows[0].relrowsecurity,true);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from leads'), /permission denied/);
    await assert.rejects(apply('admin',[]), /permission denied/);
  } finally { await db.close(); }
});
