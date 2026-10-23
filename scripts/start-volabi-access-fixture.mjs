import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help'){
 process.stdout.write('Synthetic fixture server only. Usage: npm run hq:access:fixture -- --root EXISTING_MARKED_ROOT --port 3136\nNo initialization, adoption or credentials are accepted by this launcher.\n');
}else{
 try{
  if(args.length!==4||args[0]!=='--root'||args[2]!=='--port'||!/^31[3-9][0-9]$/.test(args[3])||process.env.VERCEL)throw Object.assign(new Error(),{code:'invalid_fixture_arguments'});
  const {inspectAccessRoot}=await import('../web_platform/src/lib/hq/server/access-storage.mjs');
  const inspected=inspectAccessRoot(args[1]);
  const next=createRequire(import.meta.url).resolve('next/dist/bin/next');
  const child=spawn(process.execPath,[next,'dev','--webpack','--hostname','127.0.0.1','--port',args[3]],{cwd:path.join(projectRoot,'web_platform'),stdio:'inherit',windowsHide:true,env:{...process.env,VOLABI_PROJECT_ROOT:projectRoot,VOLABI_LOCAL_MODE:'enabled',VOLABI_ACCESS_MODE:'synthetic-guarded',VOLABI_ACCESS_ROOT:inspected.root}});
  let stopping=false;
  const stop=signal=>{
   if(stopping||!child.pid)return;stopping=true;
   if(process.platform==='win32'){
    try{execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:10000});}catch{process.stderr.write('Owned fixture process cleanup needs verification.\n');}
   }else child.kill(signal);
  };
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop(signal));
  child.on('error',()=>{process.stderr.write('Synthetic fixture server failed to start.\n');process.exitCode=1;});
  child.on('exit',code=>{process.exitCode=code??1;});
 }catch(error){
  const code=typeof error?.code==='string'&&/^(storage_|inert_restore|access_mode_|invalid_fixture_)/.test(error.code)?error.code:'fixture_start_refused';
  process.stderr.write(code+'\n');process.exitCode=1;
 }
}
