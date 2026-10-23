import {fork} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import {RecoveryError,runtimeCheck} from './common.mjs';
import {recoverInterrupted} from './index.mjs';
const labels={usage:'HQ synthetic recovery: create --fixture PATH --output NEW | inspect/restore --package PATH --output NEW / استعادة تجريبية فقط',tty:'A local interactive terminal is required. / يلزم طرفية محلية تفاعلية.',password:'Passphrase (12–256 UTF-8 bytes, masked): / عبارة المرور: ',confirm:'Type SYNTHETIC ONLY to confirm fixture-only operation: / أكّد العملية التجريبية: ',refused:'Recovery refused / رُفضت الاستعادة',complete:'Synthetic verification complete / اكتمل التحقق التجريبي'};
function argumentsFor(argv){const [operation,...args]=argv;if(!['create','inspect','restore'].includes(operation)||args.length!==4)throw new RecoveryError('invalid_arguments');const expected=operation==='create'?'--fixture':'--package',map={};for(let i=0;i<args.length;i+=2){if(![expected,'--output'].includes(args[i])||Object.hasOwn(map,args[i])||!args[i+1]||args[i+1].startsWith('--'))throw new RecoveryError('invalid_arguments');map[args[i]]=args[i+1];}if(!map[expected]||!map['--output'])throw new RecoveryError('invalid_arguments');return{operation,options:{outputRoot:map['--output'],[operation==='create'?'fixtureRoot':'packagePath']:map[expected],operationId:randomUUID()}};}
async function maskedPassword(){
 if(!process.stdin.isTTY||!process.stdout.isTTY||!process.stdin.setRawMode)throw new RecoveryError('interactive_terminal_required');
 process.stdout.write(labels.password);process.stdin.setRawMode(true);process.stdin.resume();
 return new Promise((resolve,reject)=>{let chunks=[];const finish=error=>{process.stdin.off('data',data);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');if(error){chunks.forEach(b=>b.fill(0));reject(error);}else{const result=Buffer.concat(chunks);chunks.forEach(b=>b.fill(0));resolve(result);}};
  const data=bytes=>{for(const byte of bytes){if(byte===3){finish(new RecoveryError('cancelled'));return;}if(byte===13||byte===10){finish();return;}if(byte===127||byte===8){if(chunks.length){chunks.pop().fill(0);process.stdout.write('\b \b');}continue;}if(byte<32||byte===27){finish(new RecoveryError('invalid_secret_input'));return;}if(chunks.length>=256){finish(new RecoveryError('passphrase_length'));return;}chunks.push(Buffer.from([byte]));process.stdout.write('*');}};process.stdin.on('data',data);
 });
}
async function execute(){
 runtimeCheck();if(process.argv.length===3&&process.argv[2]==='--help'){process.stdout.write(labels.usage+'\n');return;}const request=argumentsFor(process.argv.slice(2));if(!process.stdin.isTTY||!process.stdout.isTTY)throw new RecoveryError('interactive_terminal_required');
 const passphrase=await maskedPassword();let confirmed=false;
 try{const input=createInterface({input:process.stdin,output:process.stdout});try{confirmed=(await input.question(labels.confirm))==='SYNTHETIC ONLY';}finally{input.close();}if(!confirmed)throw new RecoveryError('confirmation_required');
  await new Promise((resolve,reject)=>{
   const child=fork(fileURLToPath(new URL('./worker.mjs',import.meta.url)),[],{stdio:['ignore','ignore','ignore','ipc'],execArgv:['--disable-warning=ExperimentalWarning'],windowsHide:true});let settled=false;
   const stop=()=>{child.kill();};const watchdog=setTimeout(stop,120000);const interrupt=()=>stop();process.once('SIGINT',interrupt);
   child.once('message',message=>{if(settled)return;settled=true;clearTimeout(watchdog);process.off('SIGINT',interrupt);if(message.ok){process.stdout.write(`${labels.complete}\n${JSON.stringify(message.result)}\n`);resolve();}else reject(Object.assign(new RecoveryError(message.error.code),{cleanup:message.error.cleanup}));});
   child.once('exit',()=>{if(settled)return;settled=true;clearTimeout(watchdog);process.off('SIGINT',interrupt);let cleanup='cleanup-needed';try{cleanup=recoverInterrupted(request.options.outputRoot,request.options.operationId).cleanup;}catch{}reject(Object.assign(new RecoveryError('operation_interrupted'),{cleanup}));});
   child.once('error',()=>{if(!settled){settled=true;clearTimeout(watchdog);process.off('SIGINT',interrupt);reject(new RecoveryError('worker_failed'));}});
   child.send({...request,passphrase:[...passphrase]},error=>{if(error)child.kill();});
  });
 }finally{passphrase.fill(0);}
}
execute().catch(error=>{process.stderr.write(`${labels.refused}: ${typeof error.code==='string'?error.code:'operation_failed'}${error.cleanup?`; ${error.cleanup}`:''}\n${labels.usage}\n`);process.exitCode=1;});
