import {createBackup,inspectBackup,restoreBackup} from './index.mjs';
process.once('message',async message=>{
 const passphrase=Buffer.from(message.passphrase);message.passphrase.fill(0);
 try{const action={create:createBackup,inspect:inspectBackup,restore:restoreBackup}[message.operation];const result=await action({...message.options,passphrase});process.send({ok:true,result});}
 catch(error){process.send({ok:false,error:{code:typeof error.code==='string'?error.code:'operation_failed',cleanup:error.cleanup||'not-started'}});}
 finally{passphrase.fill(0);process.disconnect();}
});
