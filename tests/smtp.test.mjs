import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const baseEnv = { SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587', SMTP_USER: 'sender@example.com', SMTP_PASSWORD: 'secret-test-password', EMAIL_FROM: 'Sloot pakbonnen <sender@example.com>' };
function loadSource(file, mocks, env = baseEnv) {
  const compiled = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, { module: compiled, exports: compiled.exports, process: { env }, Error, console: { log() {}, warn() {}, error() {} }, require(name) { if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`); return mocks[name]; } });
  return compiled.exports;
}
function smtpFixture(env = baseEnv, result = { accepted: ['receiver@example.com'], rejected: [] }) {
  const options = [];
  const messages = [];
  let closed = 0;
  const api = loadSource('lib/email/smtp.ts', {
    'node:crypto': { createHash },
    nodemailer: { createTransport(settings) {
      options.push(settings);
      return { async sendMail(message) { messages.push(message); if (result instanceof Error) throw result; return result; }, close() { closed++; } };
    } },
  }, env);
  return { api, options, messages, get closed() { return closed; } };
}
const input = { to: 'receiver@example.com', subject: 'Dagoverzicht', text: 'Tekst', html: '<p>Tekst</p>', deliveryKey: 'daily/org/user/2026-10-21/08:00' };

test('SMTP 587 requires STARTTLS and sends HTML and plaintext with a stable Message-ID', async () => {
  const fixture = smtpFixture();
  const first = await fixture.api.sendSmtpEmail(input);
  const second = await fixture.api.sendSmtpEmail(input);
  const transport = fixture.options[0];
  assert.equal(transport.secure, false);
  assert.equal(transport.requireTLS, true);
  assert.equal(transport.tls.minVersion, 'TLSv1.2');
  assert.equal(transport.tls.rejectUnauthorized, undefined);
  assert.equal(transport.disableFileAccess, true);
  assert.equal(transport.disableUrlAccess, true);
  assert.equal(fixture.messages[0].html, input.html);
  assert.equal(fixture.messages[0].text, input.text);
  assert.equal(fixture.messages[0].from, baseEnv.EMAIL_FROM);
  assert.equal(first.emailMessageId, second.emailMessageId);
  assert.match(first.emailMessageId, /^<[a-f0-9]{64}@example.com>$/);
  assert.equal(fixture.closed, 2);
});
test('SMTP 465 defaults to direct TLS', async () => {
  const fixture = smtpFixture({ ...baseEnv, SMTP_PORT: '465' });
  await fixture.api.sendSmtpEmail(input);
  assert.equal(fixture.options[0].secure, true);
  assert.equal(fixture.options[0].requireTLS, false);
});
for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM']) {
  test(`incomplete configuration does not open a connection: ${key}`, async () => {
    const fixture = smtpFixture({ ...baseEnv, [key]: '' });
    assert.equal(fixture.api.isSmtpConfigured(), false);
    await assert.rejects(fixture.api.sendSmtpEmail(input), /SMTP is nog niet ingesteld/);
    assert.equal(fixture.options.length, 0);
  });
}
for (const override of [{ SMTP_PORT: '0' }, { SMTP_PORT: 'bad' }, { SMTP_SECURE: 'bad' }, { SMTP_PORT: '465', SMTP_SECURE: 'false' }, { EMAIL_FROM: 'sender@example.com\r\nBcc: attacker@example.com' }]) {
  test(`rejects invalid SMTP configuration: ${JSON.stringify(override)}`, () => {
    const fixture = smtpFixture({ ...baseEnv, ...override });
    assert.equal(fixture.api.isSmtpConfigured(), false);
    assert.throws(() => fixture.api.getSmtpConfig());
  });
}
test('a rejected recipient is never reported as sent', async () => {
  const fixture = smtpFixture(baseEnv, { accepted: [], rejected: ['receiver@example.com'] });
  await assert.rejects(fixture.api.sendSmtpEmail(input), /niet geaccepteerd/);
  assert.equal(fixture.closed, 1);
});
test('authentication errors are actionable without exposing server responses or passwords', async () => {
  const error = Object.assign(new Error('provider response contains secret-test-password'), { code: 'EAUTH' });
  const fixture = smtpFixture(baseEnv, error);
  await assert.rejects(fixture.api.sendSmtpEmail(input), (failure) => /SMTP_USER en SMTP_PASSWORD/.test(failure.message) && !failure.message.includes('secret-test-password'));
  assert.equal(fixture.closed, 1);
});

function digestFixture({ receipt = null, sendError = false, updateError = false, auditError = false } = {}) {
  const sends = [];
  const writes = [];
  const queries = [];
  const admin = { from(table) {
    const query = {
      operation: 'select', values: null,
      select() { return query; }, eq() { return query; }, gte() { return query; }, lt() { return query; }, in() { return query; }, contains(_column, value) { queries.push(value); return query; }, limit() { return query; },
      single: async () => ({ data: { name: 'Sloot' }, error: null }),
      maybeSingle: async () => ({ data: receipt, error: null }),
      update(values) { query.operation = 'update'; query.values = values; return query; },
      insert(values) { query.operation = 'insert'; query.values = values; return query; },
      then(resolve, reject) {
        if (query.operation !== 'select') writes.push({ table, operation: query.operation, values: query.values });
        const error = (updateError && query.operation === 'update') || (auditError && query.operation === 'insert') ? { message: 'bookkeeping failed' } : null;
        return Promise.resolve({ count: 3, error }).then(resolve, reject);
      },
    };
    return query;
  } };
  const api = loadSource('lib/email/deliver-daily-digest.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/email/digest-schedule': { digestWindow: () => ({ start: 'start', end: 'end', dateKey: '2026-10-20', dateLabel: '20 oktober 2026' }) },
    '@/lib/email/daily-digest': { dailyDigestEmail: () => ({ subject: 'Dagoverzicht', html: '<p>Bonnen</p>', text: 'Bonnen' }) },
    '@/lib/email/smtp': { getSmtpConfig() {}, async sendSmtpEmail(message) { sends.push(message); if (sendError) throw new Error('SMTP failed'); return { emailMessageId: '<test@example.com>' }; } },
  });
  const delivery = { organizationId: 'org', userId: 'user', recipient: 'Receiver@example.com', scheduledDate: '2026-10-21', sendTime: '08:00', idempotencyKey: 'delivery-key', messageId: 'queue-id', mode: 'scheduled' };
  return { sends, writes, queries, run: (mode = 'scheduled') => api.deliverDailyDigest({ ...delivery, mode }) };
}
test('scheduled digest uses SMTP and records receipt only after acceptance', async () => {
  const fixture = digestFixture();
  const result = await fixture.run();
  assert.equal(result.emailMessageId, '<test@example.com>');
  assert.equal(fixture.sends[0].to, 'receiver@example.com');
  assert.equal(fixture.sends[0].deliveryKey, 'delivery-key');
  const audit = fixture.writes.find(write => write.table === 'audit_logs');
  assert.equal(audit.values.after_data.provider, 'smtp');
  assert.equal(audit.values.after_data.delivery_key, 'delivery-key');
  assert.equal(audit.values.after_data.smtp_message_id, '<test@example.com>');
});
test('manual test email uses the same SMTP path and retains its test prefix', async () => {
  const fixture = digestFixture();
  await fixture.run('manual');
  assert.equal(fixture.sends[0].subject, '[TEST] Dagoverzicht');
});
test('a recorded queue redelivery is skipped without another SMTP send', async () => {
  const fixture = digestFixture({ receipt: { after_data: { smtp_message_id: '<old@example.com>' } } });
  const result = await fixture.run();
  assert.equal(result.alreadySent, true);
  assert.equal(fixture.sends.length, 0);
  assert.equal(fixture.writes.length, 0);
});
test('SMTP failure does not mark a digest as sent', async () => {
  const fixture = digestFixture({ sendError: true });
  await assert.rejects(fixture.run(), /SMTP failed/);
  assert.equal(fixture.writes.length, 0);
});
test('bookkeeping failure after SMTP acceptance does not request a duplicate send', async () => {
  const fixture = digestFixture({ updateError: true, auditError: true });
  assert.equal((await fixture.run()).emailMessageId, '<test@example.com>');
  assert.equal(fixture.sends.length, 1);
});
