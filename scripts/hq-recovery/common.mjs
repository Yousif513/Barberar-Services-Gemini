import {createHash} from 'node:crypto';
export const LIMITS=Object.freeze({package:32*1024*1024,payload:24*1024*1024,snapshot:64*1024*1024,rowsPerTable:20000,rowsTotal:80000,cell:256*1024,depth:32,nodes:400000,dependencyFiles:512,dependencyFile:8*1024*1024,dependencyTotal:64*1024*1024,stageMs:30000});
export const INERT_APPLICATION_ID=0x56485152;
export class RecoveryError extends Error{constructor(code){super(code);this.name='RecoveryError';this.code=code;}}
export const refuse=code=>{throw new RecoveryError(code);};
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const isUuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const isHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function exactKeys(value,keys,code='invalid_payload'){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))refuse(code);
}
export function checkShape(value){
 const pending=[[value,0]];let count=0;
 while(pending.length){const [x,depth]=pending.pop();if(++count>LIMITS.nodes||depth>LIMITS.depth)refuse('resource_limit');
  if(typeof x==='string'&&Buffer.byteLength(x)>LIMITS.cell)refuse('cell_limit');
  if(x&&typeof x==='object')for(const [k,v]of Object.entries(x)){if(['__proto__','prototype','constructor'].includes(k))refuse('invalid_payload');pending.push([v,depth+1]);}
 }
}
export function canonical(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export function parseJson(bytes,code='invalid_payload'){
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{refuse(code);}checkShape(value);return value;
}
export function deadline(){const end=Date.now()+LIMITS.stageMs;return()=>{if(Date.now()>end)refuse('stage_timeout');};}
export function runtimeCheck(){if(!/^24\.15\./.test(process.versions.node))refuse('incompatible_runtime');}
