import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function setup({ width = 6000, height = 4500, unsupportedWebp = false, decodeFailure = false, encodeFailure = false, outputSize = 100000, fallbackOnly = false } = {}) {
  const calls = [], bitmap = { width, height, close() { calls.push('close'); } };
  const canvas = { width: 0, height: 0, getContext() { return { fillRect() {}, drawImage() { calls.push(['draw', canvas.width, canvas.height]); } }; }, toBlob(callback, type, quality) { calls.push(['encode', type, quality]); callback(encodeFailure ? null : new Blob([new Uint8Array(outputSize)], { type: unsupportedWebp && type === 'image/webp' ? 'image/png' : type })); } };
  const compiled = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('lib/notes/optimize-upload-image.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  class FakeImage { naturalWidth = width; naturalHeight = height; async decode() { if (decodeFailure) throw Error('Unsupported'); } }
  vm.runInNewContext(source,{module:compiled,exports:compiled.exports,Blob,File,Error,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>calls.push('revoke')},Image:FakeImage,createImageBitmap:fallbackOnly ? undefined : async()=> { if(decodeFailure) throw Error('Unsupported');return bitmap; },document:{createElement:()=>canvas}});
  return { optimize:compiled.exports.optimizeUploadImage,calls,canvas };
}
const photo = (type='image/jpeg',name='bon.jpg',bytes=1000000) => new File([new Uint8Array(bytes)],name,{type,lastModified:123});

test('large photo becomes correctly named WebP, retaining aspect and limiting longest edge',async()=>{
  const f=setup();const result=await f.optimize(photo());
  assert.equal(result.file.type,'image/webp');assert.equal(result.file.name,'bon.webp');assert.equal(result.file.lastModified,123);
  assert.deepEqual(f.calls.find(c=>Array.isArray(c)&&c[0]==='draw'),['draw',4096,3072]);
  assert.equal(result.file.size,100000);assert.ok(f.calls.includes('close'));assert.equal(f.canvas.width,0);
});
test('small photo, PDF and existing WebP are retained byte-for-byte without decoding',async()=>{
  const f=setup();for(const file of [photo('image/jpeg','small.jpg',1000),photo('application/pdf','bon.pdf'),photo('image/webp','bon.webp')]) assert.equal((await f.optimize(file)).file,file);
  assert.equal(f.calls.length,0);
});
test('portrait image is never enlarged',async()=>{
  const f=setup({width:1600,height:2400});await f.optimize(photo());assert.deepEqual(f.calls.find(c=>Array.isArray(c)&&c[0]==='draw'),['draw',1600,2400]);
});
test('unsupported WebP encoder uses real JPEG type and extension',async()=>{
  const f=setup({unsupportedWebp:true});const result=await f.optimize(photo('image/png','scan.png'));
  assert.equal(result.file.type,'image/jpeg');assert.equal(result.file.name,'scan.jpg');assert.equal(f.calls.filter(c=>Array.isArray(c)&&c[0]==='encode').length,2);
});
test('larger or marginally smaller output preserves original quality',async()=>{
  const f=setup({outputSize:950000});const original=photo();assert.equal((await f.optimize(original)).file,original);
});
test('unsupported camera format preserves original with a notice',async()=>{
  const f=setup({decodeFailure:true});const original=photo('image/heic','camera.heic');const result=await f.optimize(original);assert.equal(result.file,original);assert.ok(result.warning);assert.ok(f.calls.includes('revoke'));
});
test('encoding failure preserves original and releases bitmap and canvas',async()=>{
  const f=setup({encodeFailure:true});const original=photo();const result=await f.optimize(original);assert.equal(result.file,original);assert.ok(result.warning);assert.ok(f.calls.includes('close'));assert.equal(f.canvas.width,0);
});
test('browser image decoder fallback releases the object URL',async()=>{
  const f=setup({fallbackOnly:true});assert.equal((await f.optimize(photo())).file.type,'image/webp');assert.ok(f.calls.includes('revoke'));
});
test('long receipts retain their full resolution to protect small text',async()=>{
  const f=setup({width:2400,height:8000});await f.optimize(photo());assert.deepEqual(f.calls.find(c=>Array.isArray(c)&&c[0]==='draw'),['draw',2400,8000]);
});
