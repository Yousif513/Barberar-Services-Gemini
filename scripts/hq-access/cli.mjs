import {createInterface} from 'node:readline/promises';
import {initializeAccess,adoptAccess,resumeAccess,issueEnrollmentPermit,inspectEnrollment,inspectInitialization} from './index.mjs';
import {checkedRoot} from '../../web_platform/src/lib/hq/server/access-storage.mjs';
import {HqError} from '../../web_platform/src/lib/hq/server/local-boundary.mjs';
const usage='HQ synthetic access: init|adopt|permit --root OWNED_MARKED_ROOT; resume --root OWNED_MARKED_ROOT --operation UUID. / وصول تجريبي محلي فقط';
function argumentsFor(argv){const [operation,...args]=argv;if(!['init','adopt','permit','resume'].includes(operation)||args.length!==(operation==='resume'?4:2))throw new HqError('invalid_arguments');const options={};for(let i=0;i<args.length;i+=2){const key=args[i];if(!['--root','--operation'].includes(key)||Object.hasOwn(options,key)||!args[i+1]||args[i+1].startsWith('--'))throw new HqError('invalid_arguments');options[key]=args[i+1];}if(!options['--root']||operation==='resume'&&!options['--operation']||operation!=='resume'&&options['--operation'])throw new HqError('invalid_arguments');return {operation,root:options['--root'],operationId:options['--operation']};}
async function masked(label){
  process.stdout.write(label);process.stdin.setRawMode(true);process.stdin.resume();
  return new Promise((resolve,reject)=>{const bytes=[];let finished=false;const finish=error=>{if(finished)return;finished=true;process.stdin.off('data',read);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');if(error){bytes.fill(0);reject(error);}else{const result=Buffer.from(bytes);bytes.fill(0);resolve(result);}};const read=chunk=>{for(const byte of chunk){if(byte===3)return finish(new HqError('cancelled'));if(byte===13||byte===10)return finish();if(byte===8||byte===127){if(bytes.length){bytes.pop();process.stdout.write('\b \b');}continue;}if(byte<32||byte===27||bytes.length>=256)return finish(new HqError('invalid_secret_input'));bytes.push(byte);process.stdout.write('*');}};process.stdin.on('data',read);});
}
async function confirmation(value,label='Type the exact synthetic fingerprint / اكتب البصمة التجريبية'){const input=createInterface({input:process.stdin,output:process.stdout});try{const answer=await input.question(`${label}\n${value}\n> `);if(answer!==value)throw new HqError('confirmation_required');return answer;}finally{input.close();}}
async function main(){
  if(process.argv.length===3&&process.argv[2]==='--help'){process.stdout.write(usage+'\n');return;}
  if(!/^24\.15\./.test(process.versions.node))throw new HqError('incompatible_runtime');
  const request=argumentsFor(process.argv.slice(2));if(!process.stdin.isTTY||!process.stdout.isTTY||!process.stdin.setRawMode)throw new HqError('interactive_terminal_required');
  const {marker}=checkedRoot(request.root);let secretInput=null,result;
  try{
    if(request.operation==='permit'){secretInput=await masked('Current synthetic session (masked) / الجلسة التجريبية: ');const info=inspectEnrollment({root:request.root,token:secretInput.toString('utf8')});await confirmation(info.fingerprint);result=issueEnrollmentPermit({root:request.root,token:secretInput.toString('utf8'),confirmation:info.fingerprint});}
    else {await confirmation(marker.fixtureId);if(request.operation==='adopt'){await confirmation('STOPPED SYNTHETIC ONLY','Confirm fixture server is stopped / أكّد إيقاف الخادم التجريبي');secretInput=await masked('Valid original synthetic session (masked) / الجلسة الأصلية: ');result=adoptAccess({root:request.root,confirmation:marker.fixtureId,legacyToken:secretInput.toString('utf8'),serverStopped:true});}
      else if(request.operation==='resume'){const intent=inspectInitialization({root:request.root});if(intent.purpose==='adopt'){await confirmation('STOPPED SYNTHETIC ONLY','Confirm fixture server is stopped / أكّد إيقاف الخادم التجريبي');secretInput=await masked('Original synthetic session if adoption was interrupted (masked) / الجلسة الأصلية: ');}result=resumeAccess({root:request.root,confirmation:marker.fixtureId,operationId:request.operationId,legacyToken:secretInput?.toString('utf8')});}
      else result=initializeAccess({root:request.root,confirmation:marker.fixtureId});}
    const {bootstrapProof,permit,...metadata}=result;process.stdout.write(JSON.stringify(metadata)+'\n');
    process.stdout.write(permit?'Single-use enrollment permit; password field only / إذن تسجيل لمرة واحدة:\n':'Restricted bootstrap proof; password field only / إثبات تهيئة محدود:\n');
    process.stdout.write((permit||bootstrapProof)+'\n');process.stdout.write('Expires in five minutes. Complete saved-factor confirmation at the isolated Access page. Normal access remains blocked until confirmation. / تنتهي خلال خمس دقائق؛ أكمل تأكيد حفظ المفتاح في صفحة الوصول التجريبية.\n');
  }finally{secretInput?.fill(0);}
}
main().catch(error=>{process.stderr.write(`Access refused / رُفض الوصول: ${typeof error.code==='string'&&/^[a-z_]+$/.test(error.code)?error.code:'operation_failed'}\n${usage}\n`);process.exitCode=1;});
