import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { URL, fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/components/PairingScanner.tsx',import.meta.url))],bundle:true,format:'cjs',platform:'node',write:false,external:['react','expo-camera','./UI','../i18n']});
function fixture(){
 const values:unknown[]=[];let cursor=0;const received:string[]=[];
 const react={Fragment:'fragment',createElement:(type:unknown,props:unknown,...children:unknown[])=>({type,props,children:children.flat(Infinity)}),
  useState:(initial:unknown)=>{const slot=cursor++;if(values[slot]===undefined)values[slot]=initial;return[values[slot],(value:unknown)=>{values[slot]=value;}];},useRef:(initial:unknown)=>{const slot=cursor++;if(!values[slot])values[slot]={current:initial};return values[slot];}};
 const module={exports:{} as {PairingScanner:(props:unknown)=>any}};
 runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,require:(name:string)=>name==='react'?react:name==='expo-camera'?{CameraView:'Camera',useCameraPermissions:()=>[{granted:true},async()=>({granted:true})]}:name==='./UI'?{Button:'Button',Notice:'Notice',Sheet:'Sheet',Label:'Label'}:{tr:(value:string)=>value}});
 const render=()=>{cursor=0;return module.exports.PairingScanner({disabled:false,onScan:(value:string)=>received.push(value)});};
 const nodes=(tree:any,type:string):any[]=>!tree||typeof tree!=='object'?[]:[...(tree.type===type?[tree]:[]),...(tree.children??[]).flatMap((child:any)=>nodes(child,type))];
 return{render,nodes,received};
}
test('repeated camera callbacks initiate one request and reopening enables another scan',async()=>{
 const f=fixture();let tree=f.render();await f.nodes(tree,'Button')[0].props.onPress();tree=f.render();
 const scan=f.nodes(tree,'Camera')[0].props.onBarcodeScanned;scan({data:'fixture-qr'});scan({data:'fixture-qr'});assert.deepEqual(f.received,['fixture-qr']);
 tree=f.render();await f.nodes(tree,'Button')[0].props.onPress();tree=f.render();f.nodes(tree,'Camera')[0].props.onBarcodeScanned({data:'second-fixture'});assert.deepEqual(f.received,['fixture-qr','second-fixture']);
});
test('closing the camera discards callbacks already queued before dismissal',async()=>{
 const f=fixture();let tree=f.render();await f.nodes(tree,'Button')[0].props.onPress();tree=f.render();const scan=f.nodes(tree,'Camera')[0].props.onBarcodeScanned;
 f.nodes(tree,'Sheet')[0].props.onClose();scan({data:'late-fixture'});assert.deepEqual(f.received,[]);
});
