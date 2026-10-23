import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {postgresPortalRpc, withPortalActor, type PortalConnection} from '../examples/postgres/portal-rpc.ts';

const modulePath = process.env.OLR_PGLITE_MODULE;
test('trusted PostgreSQL pool preserves actor isolation and resets transaction context', {skip: !modulePath}, async () => {
  const {PGlite} = await import(pathToFileURL(modulePath!).href), db = new PGlite();
  const admin = '10000000-0000-0000-0000-000000000001', learner = '10000000-0000-0000-0000-000000000002';
  let released = 0;
  const connection: PortalConnection = {query: (sql, values) => db.query(sql, values), release: () => { released++; }};
  const pool = {connect: async () => connection};
  try {
    await db.exec('create role anon nologin noinherit; create role authenticated nologin noinherit;');
    await db.exec(await readFile(new URL('../examples/postgres/course-portal-schema.sql', import.meta.url), 'utf8'));
    await db.query('insert into portal_private.accounts(id,email,verified) values ($1,$2,true),($3,$4,true)', [admin, 'admin@example.invalid', learner, 'learner@example.invalid']);
    await db.query('insert into portal_private.administrators(user_id) values ($1)', [admin]);
    assert.deepEqual(await postgresPortalRpc(pool, admin).rpc('portal_role'), {data: 'admin', error: null});
    assert.deepEqual(await postgresPortalRpc(pool, learner).rpc('portal_role'), {data: 'learner', error: null});
    assert.equal((await db.query("select nullif(current_setting('library.actor_id',true),'') as actor")).rows[0].actor, null);
    await assert.rejects(withPortalActor(pool, admin, async client => { await client.query('select 1/0'); }), /division by zero/u);
    assert.deepEqual(await postgresPortalRpc(pool, learner).rpc('portal_role'), {data: 'learner', error: null});
    assert.equal(released, 4);
    const before = released;
    assert.ok((await postgresPortalRpc(pool, learner).rpc('portal_role);drop table anything', {})).error);
    assert.ok((await postgresPortalRpc(pool, learner).rpc('portal_role', {actor: admin})).error);
    assert.equal(released, before);
  } finally { await db.close(); }
});
test('a connection whose rollback fails is discarded rather than returned as reusable', async () => {
  let discarded: Error | undefined;
  const pool = {async connect(): Promise<PortalConnection> { return {async query(sql) { if (sql === 'rollback') throw new Error('Broken connection.'); return {rows: []}; }, release(error) { discarded = error; }}; }};
  await assert.rejects(withPortalActor(pool, '10000000-0000-0000-0000-000000000001', async () => { throw new Error('Operation failed.'); }), /Operation failed/u);
  assert.ok(discarded instanceof Error);
});
