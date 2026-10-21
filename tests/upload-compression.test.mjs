import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function setup({ failSecondOnce = false } = {}) {
  const slots=[];let index=0;const requests=[],optimized=[];
  const hooks={useRef(value){const i=index++;return slots[i]??=( {current:value} );},useState(value){const i=index++;if(!(i in slots))slots[i]=value;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}];}};
  const jsx=(type,props)=>({type,props});const compiled={exports:{}};
  const source=ts.transpileModule(fs.readFileSync('components/sloot/upload-note.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const requireMock=(name)=>{
    if(name==='react')return hooks;
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(name==='lucide-react')return new Proxy({},{get:(_,name)=>name});
    if(name==='next/navigation')return {useRouter:()=>({refresh(){}})};
    if(name==='@/lib/notes/optimize-upload-image')return {async optimizeUploadImage(file){optimized.push(file);return {file:new File(['smaller'],file.name.replace(/\.jpg$/,'.webp'),{type:'image/webp'})}}};
    throw Error(name);
  };
  vm.runInNewContext(source,{require:requireMock,module:compiled,exports:compiled.exports,File,FormData,Intl,Array,WeakSet,Boolean,String,window:{setTimeout(){}},fetch:async(_url,options)=>{
    const form=options.body;requests.push({page:form.get('page_number'),id:form.get('note_id'),file:form.get('file')});
    const failed=failSecondOnce&&requests.length===2;
    return {ok:!failed,json:async()=>failed?{error:'Network unavailable'}:{id:'note-123'}};
  }});
  function render(){index=0;return compiled.exports.UploadNote({branches:[{id:'branch',name:'Borne'}]})}
  function all(node){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(all)]}
  return {requests,optimized,select(files){const tree=render();const input=all(tree).find(n=>n.type==='input'&&n.props.multiple);input.props.onChange({target:{files,value:''}});},async submit(){await render().props.onSubmit({preventDefault(){}});},render};
}

test('upload sends only prepared file with correct name and MIME type',async()=>{
 const f=setup();f.select([new File(['original'],'bon.jpg',{type:'image/jpeg'})]);await f.submit();
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].file.type,'image/webp');assert.equal(f.requests[0].file.name,'bon.webp');assert.equal(await f.requests[0].file.text(),'smaller');
});
test('resuming a failed multipage upload retains note ID and never recompresses or resends completed pages',async()=>{
 const f=setup({failSecondOnce:true});f.select([new File(['a'],'a.jpg',{type:'image/jpeg'}),new File(['b'],'b.jpg',{type:'image/jpeg'})]);await f.submit();await f.submit();
 assert.equal(f.optimized.length,2);assert.deepEqual(f.requests.map(r=>r.page),['1','2','2']);assert.equal(f.requests[2].id,'note-123');assert.equal(f.requests[1].file,f.requests[2].file);
});
