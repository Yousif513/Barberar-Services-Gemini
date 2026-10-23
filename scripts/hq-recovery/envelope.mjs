import {randomBytes,createCipheriv,createDecipheriv,scryptSync} from 'node:crypto';
import {LIMITS,canonical,exactKeys,parseJson,refuse} from './common.mjs';
const MAGIC=Buffer.from('VHQREC01'),HEADER_MAX=1024;
const headerKeys=['format','cipher','kdf','N','r','p','salt','nonce','plaintextBytes'];
function password(value){if(!Buffer.isBuffer(value)||value.length<12||value.length>256)refuse('passphrase_length');try{new TextDecoder('utf-8',{fatal:true}).decode(value);}catch{refuse('passphrase_encoding');}}
function keyFor(passphrase,salt){return scryptSync(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});}
function base64(value,length){if(typeof value!=='string')refuse('invalid_envelope');const decoded=Buffer.from(value,'base64');if(decoded.length!==length||decoded.toString('base64')!==value)refuse('invalid_envelope');return decoded;}
export function encryptEnvelope(payload,passphrase){
 password(passphrase);const plaintext=Buffer.from(canonical(payload),'utf8');
 if(plaintext.length>LIMITS.payload)refuse('payload_limit');
 const salt=randomBytes(16),nonce=randomBytes(12),key=keyFor(passphrase,salt);
 try{
  const header=Buffer.from(canonical({format:1,cipher:'aes-256-gcm',kdf:'scrypt',N:32768,r:8,p:1,salt:salt.toString('base64'),nonce:nonce.toString('base64'),plaintextBytes:plaintext.length}));
  const length=Buffer.alloc(4);length.writeUInt32BE(header.length);
  const aad=Buffer.concat([MAGIC,length,header]),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(aad);
  return Buffer.concat([aad,cipher.update(plaintext),cipher.final(),cipher.getAuthTag()]);
 }finally{key.fill(0);plaintext.fill(0);}
}
export function validateEnvelope(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>LIMITS.package||bytes.length<44||!bytes.subarray(0,8).equals(MAGIC))refuse('invalid_envelope');
 const size=bytes.readUInt32BE(8);if(size<2||size>HEADER_MAX||12+size+16>bytes.length)refuse('invalid_envelope');
 const headerBytes=bytes.subarray(12,12+size),header=parseJson(headerBytes,'invalid_envelope');exactKeys(header,headerKeys,'invalid_envelope');
 if(canonical(header)!==headerBytes.toString('utf8')||header.format!==1||header.cipher!=='aes-256-gcm'||header.kdf!=='scrypt'||header.N!==32768||header.r!==8||header.p!==1||!Number.isSafeInteger(header.plaintextBytes)||header.plaintextBytes<2||header.plaintextBytes>LIMITS.payload||bytes.length!==12+size+header.plaintextBytes+16)refuse('invalid_envelope');
 const salt=base64(header.salt,16),nonce=base64(header.nonce,12);return{salt,nonce,size};
}
export function decryptEnvelope(bytes,passphrase){
 password(passphrase);const{salt,nonce,size}=validateEnvelope(bytes),key=keyFor(passphrase,salt);let plaintext;
 try{
  const cipher=createDecipheriv('aes-256-gcm',key,nonce);cipher.setAAD(bytes.subarray(0,12+size));cipher.setAuthTag(bytes.subarray(-16));
  try{plaintext=Buffer.concat([cipher.update(bytes.subarray(12+size,-16)),cipher.final()]);}catch{refuse('authentication_failed');}
  return parseJson(plaintext);
 }finally{key.fill(0);plaintext?.fill(0);}
}
