import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const noteId = '50c18253-3a5b-41fd-8cd7-e7970e776896';
function setup({ listError = false, detailError = false, searchError = false } = {}) {
  const queries = [];
  const client = { from(table) {
    const request = { table, fields: '', noteId: null };
    queries.push(request);
    const query = {
      select(fields) { request.fields = fields; return query; },
      order() { return query; },
      range() { return query; },
      eq(_key, value) { request.noteId = value; return query; },
      async maybeSingle() { return { data: { id: noteId, delivery_note_items: [{ description: 'Fiets' }], delivery_note_pages: [{ page_number: 1 }] }, error: detailError ? {} : null }; },
      then(resolve, reject) {
        const error = table === 'delivery_note_items' ? searchError : listError;
        const data = table === 'delivery_note_items' ? [{ delivery_note_id: noteId, article_code: 'ABC', ean: '123', description: 'Fiets' }] : [{ id: noteId, delivery_note_items: [{ count: 3 }] }];
        return Promise.resolve({ data, error: error ? {} : null }).then(resolve, reject);
      },
    };
    return query;
  } };
  const compiled = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync('lib/notes/page-data.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { module: compiled, exports: compiled.exports, Error });
  return { queries, load: (id = '', search = '') => compiled.exports.getNotesPageData(client, id, search) };
}

test('normal list loads counts without item details, photos or additional searches', async () => {
  const fixture = setup();
  const data = await fixture.load();
  assert.equal(fixture.queries.length, 1);
  assert.match(fixture.queries[0].fields, /delivery_note_items\(count\)/);
  assert.doesNotMatch(fixture.queries[0].fields, /delivery_note_pages|photo_path|quantity|rejection_reason/);
  assert.equal(data.notes[0].delivery_note_items[0].count, 3);
  assert.equal(data.selectedNote, null);
  assert.equal(data.searchItems.length, 0);
});
test('opening a note fetches full details for just the selected UUID', async () => {
  const fixture = setup();
  const data = await fixture.load(noteId);
  assert.equal(fixture.queries.length, 2);
  const detail = fixture.queries.find(query => query.noteId);
  assert.equal(detail.noteId, noteId);
  assert.match(detail.fields, /delivery_note_pages/);
  assert.match(detail.fields, /quantity/);
  assert.equal(data.selectedNote.id, noteId);
});
test('article search retains article codes, EAN and descriptions without fetching photo data', async () => {
  const fixture = setup();
  const data = await fixture.load('', 'Fiets');
  assert.equal(fixture.queries.length, 2);
  assert.equal(fixture.queries[1].table, 'delivery_note_items');
  assert.equal(fixture.queries[1].fields, 'delivery_note_id,article_code,ean,description');
  assert.equal(data.searchItems[0].description, 'Fiets');
});
test('invalid note IDs do not trigger a failing UUID query', async () => {
  const fixture = setup();
  assert.equal((await fixture.load('invalid-id')).selectedNote, null);
  assert.equal(fixture.queries.length, 1);
});
test('a database failure is not rendered as an empty list', async () => {
  const fixture = setup({ listError: true });
  await assert.rejects(fixture.load(), /pakbonnen konden niet worden geladen/);
});
test('a search failure is not rendered as no matching articles', async () => {
  const fixture = setup({ searchError: true });
  await assert.rejects(fixture.load('', 'Fiets'), /artikelgegevens konden niet worden doorzocht/);
});
