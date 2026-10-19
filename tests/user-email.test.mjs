import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real server actions with isolated Auth and database boundaries.
function setup(options = {}) {
  const calls = [];
  const invalidations = [];
  function from(table) {
    let operation = 'select';
    let values;
    const filters = {};
    const query = {
      select() { return query; },
      update(data) { operation = 'update'; values = data; return query; },
      insert(data) { operation = 'insert'; values = data; return query; },
      delete() { operation = 'delete'; return query; },
      eq(key, value) { filters[key] = value; return query; },
      in(key, value) { filters[key] = value; return query; },
      single: async () => ({ data: { organization_id: 'our-org', role: options.role || 'admin', active: options.active !== false } }),
      maybeSingle: async () => {
        calls.push({ table, operation, filters: { ...filters } });
        return { data: options.foreignUser ? null : { id: 'target' } };
      },
      then(resolve, reject) {
        calls.push({ table, operation, values, filters: { ...filters } });
        const error = table === 'user_notification_settings' && options.notificationError ? new Error('database unavailable') : null;
        return Promise.resolve({ data: null, error }).then(resolve, reject);
      },
    };
    return query;
  }
  const supabase = { from, auth: { getClaims: async () => ({ data: { claims: { sub: 'actor' } } }) } };
  let updates = 0;
  const admin = { auth: { admin: {
    getUserById: async (id) => { calls.push({ getUserById: id }); return { data: { user: { id, email: 'old@example.com' } } }; },
    updateUserById: async (id, values) => {
      calls.push({ updateUserById: id, values });
      updates++;
      return { error: (updates === 1 && options.duplicate) || (updates === 2 && options.rollbackError) ? { code: 'email_exists' } : null };
    },
  } } };
  const source = fs.readFileSync('app/actions/users.ts', 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(js, {
    module: compiledModule, exports: compiledModule.exports, FormData, Error, Date, process,
    require(name) {
      if (name === '@/lib/supabase/server') return { createClient: async () => supabase };
      if (name === '@/lib/supabase/admin') return { createAdminClient: () => admin };
      if (name === 'next/cache') return { revalidatePath: (path) => invalidations.push(path) };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const form = new FormData();
  form.set('user_id', 'target');
  form.set('email', options.email || ' NEW@Example.com ');
  return { run: () => compiledModule.exports.updateUserEmail({ status: 'idle', message: '' }, form), calls, invalidations };
}

test('email update normalizes address, scopes notification sync and audits old/new addresses', async () => {
  const fixture = setup();
  const result = await fixture.run();
  assert.equal(result.status, 'success');
  assert.equal(fixture.calls.find(c => c.updateUserById).values.email, 'new@example.com');
  const sync = fixture.calls.find(c => c.table === 'user_notification_settings');
  assert.equal(sync.values.recipient_email, 'new@example.com');
  assert.equal(sync.filters.organization_id, 'our-org');
  assert.equal(sync.filters.user_id, 'target');
  assert.equal('updated_at' in sync.values, false);
  const audit = fixture.calls.find(c => c.table === 'audit_logs');
  assert.equal(audit.values.before_data.email, 'old@example.com');
  assert.equal(audit.values.after_data.email, 'new@example.com');
  assert.ok(fixture.invalidations.includes('/protected/notificaties'));
});
for (const options of [{ role: 'user' }, { active: false }, { foreignUser: true }, { email: 'not-an-email' }]) {
  test(`rejects unauthorized or invalid updates: ${JSON.stringify(options)}`, async () => {
    const fixture = setup(options);
    assert.equal((await fixture.run()).status, 'error');
    assert.equal(fixture.calls.some(c => c.updateUserById), false);
  });
}
test('duplicate email does not change notifications or write a success audit', async () => {
  const fixture = setup({ duplicate: true });
  assert.equal((await fixture.run()).status, 'error');
  assert.equal(fixture.calls.some(c => c.table === 'user_notification_settings'), false);
  assert.equal(fixture.calls.some(c => c.table === 'audit_logs'), false);
});
test('notification failure rolls back the login email', async () => {
  const fixture = setup({ notificationError: true });
  assert.equal((await fixture.run()).status, 'error');
  const updates = fixture.calls.filter(c => c.updateUserById);
  assert.equal(updates.length, 2);
  assert.equal(updates[1].values.email, 'old@example.com');
  assert.equal(fixture.calls.some(c => c.table === 'audit_logs'), false);
});
test('reports partial failure if the old address cannot be restored', async () => {
  const fixture = setup({ notificationError: true, rollbackError: true });
  const result = await fixture.run();
  assert.equal(result.status, 'error');
  assert.match(result.message, /inlogadres is gewijzigd/);
});
test('unchanged address causes no Auth or database mutations', async () => {
  const fixture = setup({ email: 'old@example.com' });
  assert.equal((await fixture.run()).status, 'success');
  assert.equal(fixture.calls.some(c => c.updateUserById || c.operation === 'update' || c.operation === 'insert'), false);
});
