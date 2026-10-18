import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { URL, fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const compiled=await build({entryPoints:[fileURLToPath(new URL('../src/components/WorkingFolderPicker.tsx',import.meta.url))],bundle:true,format:'cjs',platform:'node',write:false,external:['react','react-native','../i18n','../types','./UI']});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve!:(value:any)=>void;const promise=new Promise<any>(done=>{resolve=done;});return{promise,resolve};}
function fixture(action:(endpoint:string,payload:any,options:any)=>Promise<any>,choose:(path:string)=>Promise<boolean>){
 const values:any[]=[];let cursor=0;
 const react={Fragment:'Fragment',createElement:(type:any,props:any,...children:any[])=>({type,props:props||{},children:children.flat(Infinity)}),
  useState:(initial:any)=>{const slot=cursor++;if(!(slot in values))values[slot]=initial;return[values[slot],(value:any)=>{values[slot]=value;}];},
  useRef:(initial:any)=>{const slot=cursor++;if(!(slot in values))values[slot]={current:initial};return values[slot];},useEffect:()=>{}};
 const module={exports:{} as {WorkingFolderPicker:(props:any)=>any}};
 runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,AbortController,require:(name:string)=>name==='react'?react:name==='react-native'?{View:'View',ScrollView:'ScrollView'}:name==='../i18n'?{useI18n:()=>({tr:(text:string)=>text})}:name==='../types'?{errorText:(error:Error)=>error.message}:{Button:'Button',Field:'Field',Label:'Label',Notice:'Notice',Section:'Section',SettingRow:'SettingRow',Sheet:'Sheet'}});
 const render=()=>{cursor=0;return module.exports.WorkingFolderPicker({client:{action},disabled:false,choose});};
 const nodes=(tree:any,type:string):any[]=>!tree||typeof tree!=='object'?[]:[...(tree.type===type?[tree]:[]),...(tree.children||[]).flatMap((child:any)=>nodes(child,type))];
 return{render,nodes};
}
test('folder selection keeps host paths and prevents duplicate saves before the next render',async()=>{
 const saved:string[]=[],pending=deferred();
 const f=fixture(async()=>({team:'/srv/team',picker:null,folders:[]}),async path=>{saved.push(path);return pending.promise;});
 f.nodes(f.render(),'SettingRow')[0].props.onPress();await tick();
 f.nodes(f.render(),'Field')[0].props.onChangeText('/srv/project');
 const use=f.nodes(f.render(),'Button').find(button=>button.props.title==='Use this folder').props.onPress;
 use();use();assert.deepEqual(saved,['/srv/project']);pending.resolve(true);await tick();assert.equal(f.nodes(f.render(),'Sheet')[0].props.visible,false);
});
test('closing the folder picker aborts a late directory request and cannot reopen it',async()=>{
 const pending=deferred();let signal!:AbortSignal;
 const f=fixture(async(_endpoint,_payload,options)=>{signal=options.signal;return pending.promise;},async()=>true);
 f.nodes(f.render(),'SettingRow')[0].props.onPress();f.nodes(f.render(),'Sheet')[0].props.onClose();
 assert.equal(signal.aborted,true);pending.resolve({team:'/late',picker:null,folders:[]});await tick();
 assert.equal(f.nodes(f.render(),'Sheet')[0].props.visible,false);
});
test('a host without the folder API cannot silently accept an unsupported folder update',async()=>{
 const saved:string[]=[];
 const f=fixture(async()=>{throw Object.assign(new Error('Unsupported'),{code:'mobile/unsupported-action'});},async path=>{saved.push(path);return true;});
 f.nodes(f.render(),'SettingRow')[0].props.onPress();await tick();
 f.nodes(f.render(),'Field')[0].props.onChangeText('/srv/project');
 const button=f.nodes(f.render(),'Button').find(button=>button.props.title==='Use this folder');assert.equal(button.props.disabled,true);button.props.onPress();await tick();
 assert.deepEqual(saved,[]);assert.equal(f.nodes(f.render(),'Notice')[0].props.text,'Update your host plugin to choose working folders.');
});
test('folder browsing sends exact paths supplied by the host instead of joining them on the phone',async()=>{
 const paths:string[]=[];
 const f=fixture(async(endpoint,payload)=>endpoint==='folders'?{team:'Z:\\team',picker:'browse',folders:[]}:(paths.push(payload.path),{path:'Z:\\projects',crumbs:[],entries:[{name:'Code',path:'Z:\\projects\\code'}]}),async()=>true);
 f.nodes(f.render(),'SettingRow')[0].props.onPress();await tick();
 f.nodes(f.render(),'Button').find(button=>button.props.title==='Browse folders…').props.onPress();await tick();
 f.nodes(f.render(),'SettingRow').find(row=>row.props.title==='Code').props.onPress();await tick();
 assert.deepEqual(paths,['','Z:\\projects\\code']);
});
