import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync,statSync,mkdirSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createCipheriv,createDecipheriv,scryptSync} from 'node:crypto';
import {fixture,projectRoot} from './hq-recovery-fixture.mjs';
import {createBackup,inspectBackup,restoreBackup} from '../../scripts/hq-recovery/index.mjs';
import {decryptEnvelope,encryptEnvelope} from '../../scripts/hq-recovery/envelope.mjs';
const secret=()=>Buffer.from('synthetic-test-passphrase-only');
function output(t){const root=mkdtempSync(path.join(tmpdir(),'volabi-recovery-target-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return name=>path.join(root,name);}
test('REC-01/02/04/07/08 complete coherent fixture backup excludes sessions and restores inert exact history',async t=>{
 const f=fixture(t),out=output(t),passphrase=secret();
 const before=f.store.db.prepare('SELECT * FROM records ORDER BY rowid').all();
 const receipt=await createBackup({fixtureRoot:f.root,outputRoot:out('backup'),passphrase,projectRoot});
 assert.deepEqual(readdirSync(out('backup')).sort(),['backup.vhq','journal.json','receipt.json'],'Successful encrypted package must retain no raw snapshot WAL/SHM');
 assert.equal(receipt.dataIntegrity,'passed');assert.ok(receipt.packageDigest);assert.equal(receipt.sessionCount,0);
 const payload=decryptEnvelope(readFileSync(receipt.packagePath),passphrase);assert.equal(payload.tables.sessions.length,0);assert.equal(JSON.stringify(payload).includes(f.a.token),false);
 const capturedHash=f.store.db.prepare('SELECT token_hash FROM sessions LIMIT 1').get().token_hash;assert.equal(JSON.stringify(payload).includes(capturedHash),false);
 f.run(f.a,'task.revise',{taskId:f.taskId,title:'Synthetic post-capture sentinel'},1);
 const sourceState=f.store.db.prepare('SELECT * FROM records ORDER BY rowid').all(),sourceIdentity=statSync(f.filePath).ino;
 const report=await restoreBackup({packagePath:receipt.packagePath,outputRoot:out('restored'),passphrase,projectRoot});
 assert.equal(report.dataIntegrity,'passed');assert.equal(report.inert,true);assert.equal(report.authority,'historical-only');
 const db=new DatabaseSync(report.databasePath,{readOnly:true});try{
  assert.deepEqual(db.prepare('SELECT * FROM records ORDER BY rowid').all(),before);
  assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
 }finally{db.close();}
 assert.deepEqual(f.store.db.prepare('SELECT * FROM records ORDER BY rowid').all(),sourceState);assert.equal(statSync(f.filePath).ino,sourceIdentity);
 assert.ok(existsSync(path.join(out('restored'),'INERT-RESTORE.json')));
 assert.throws(()=>new f.store.constructor({filePath:report.databasePath}),/inert_restore/);
 const inspected=await inspectBackup({packagePath:receipt.packagePath,outputRoot:out('inspection'),passphrase,projectRoot});assert.equal(inspected.dataIntegrity,'passed');assert.equal(existsSync(path.join(out('inspection'),'hq.sqlite')),false);
 passphrase.fill(0);
});
test('REC-03 envelope rejects wrong secrets, altered metadata/tag and truncation before payload interpretation',()=>{
 const passphrase=secret(),encrypted=encryptEnvelope({test:'synthetic'},passphrase);
 assert.deepEqual(decryptEnvelope(encrypted,passphrase),{test:'synthetic'});
 assert.throws(()=>decryptEnvelope(encrypted,Buffer.from('wrong-synthetic-secret')),/authentication_failed/);
 for(const offset of [1,13,encrypted.length-1]){const changed=Buffer.from(encrypted);changed[offset]^=1;assert.throws(()=>decryptEnvelope(changed,passphrase));}
 assert.throws(()=>decryptEnvelope(encrypted.subarray(0,-1),passphrase));
});
test('REC-03/05 no-clobber and authentication failure never publish a plaintext restore',async t=>{
 const f=fixture(t),out=output(t),passphrase=secret(),backup=await createBackup({fixtureRoot:f.root,outputRoot:out('backup'),passphrase,projectRoot});
 mkdirSync(out('exists'));writeFileSync(path.join(out('exists'),'sentinel'),'unchanged');
 await assert.rejects(restoreBackup({packagePath:backup.packagePath,outputRoot:out('exists'),passphrase,projectRoot}),/target_exists/);
 assert.equal(readFileSync(path.join(out('exists'),'sentinel'),'utf8'),'unchanged');
 await assert.rejects(restoreBackup({packagePath:backup.packagePath,outputRoot:out('wrong'),passphrase:Buffer.from('wrong-synthetic-secret'),projectRoot}),/authentication_failed/);
 assert.equal(existsSync(path.join(out('wrong'),'hq.sqlite')),false);
});
test('REC-03/05 fixture guard, unknown schema, broken history and source mutation are rejected',async t=>{
 const f=fixture(t),out=output(t),passphrase=secret();
 writeFileSync(path.join(f.root,'fixture.json'),JSON.stringify({...f.marker,fixtureId:'not-valid'}));
 await assert.rejects(createBackup({fixtureRoot:f.root,outputRoot:out('bad-marker'),passphrase,projectRoot}),/fixture/);
 writeFileSync(path.join(f.root,'fixture.json'),JSON.stringify(f.marker));
 f.store.db.exec('CREATE TABLE unapproved_extra(x TEXT)');await assert.rejects(createBackup({fixtureRoot:f.root,outputRoot:out('bad-schema'),passphrase,projectRoot}),/schema/);
 f.store.db.exec('DROP TABLE unapproved_extra');
 f.store.db.exec('DROP TRIGGER record_versions_no_delete');f.store.db.prepare('DELETE FROM record_versions WHERE rowid=(SELECT min(rowid) FROM record_versions)').run();
 f.store.db.exec("CREATE TRIGGER record_versions_no_delete BEFORE DELETE ON record_versions BEGIN SELECT RAISE(ABORT,'immutable history'); END");
 await assert.rejects(createBackup({fixtureRoot:f.root,outputRoot:out('bad-history'),passphrase,projectRoot}),/history/);
 assert.deepEqual(readdirSync(out('bad-history')).sort(),['INCOMPLETE.json','failure-journal.json'],'Failed capture must retain no raw snapshot WAL/SHM');
});
test('REC-09 interrupted package publication cannot be consumed without its completed creation journal',async t=>{
 const f=fixture(t),out=output(t),passphrase=secret();const backup=await createBackup({fixtureRoot:f.root,outputRoot:out('backup'),passphrase,projectRoot});
 rmSync(path.join(out('backup'),'journal.json'));writeFileSync(path.join(out('backup'),'INCOMPLETE.json'),JSON.stringify({outcome:'in-progress'}));
 await assert.rejects(inspectBackup({packagePath:backup.packagePath,outputRoot:out('inspect'),passphrase,projectRoot}),/package_not_complete/);
});
test('REC-03 platform primitives match independent RFC7914 scrypt and NIST AES256-GCM known answers',()=>{
 // RFC7914 section12, https://www.rfc-editor.org/rfc/rfc7914.html#section-12
 const derived=scryptSync(Buffer.alloc(0),Buffer.alloc(0),64,{N:16,r:1,p:1});
 assert.equal(derived.toString('hex'),'77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906');derived.fill(0);
 // NIST GCM-AES256 example2, pp21–23, https://csrc.nist.gov/CSRC/media/Projects/Cryptographic-Standards-and-Guidelines/documents/examples/AES_GCM.pdf
 const hex=value=>Buffer.from(value.replace(/\s/g,''),'hex');
 const key=hex('FEFFE9928665731C6D6A8F9467308308FEFFE9928665731C6D6A8F9467308308'),iv=hex('CAFEBABEFACEDBADDECAF888');
 const plaintext=hex('D9313225F88406E5A55909C5AFF5269A86A7A9531534F7DA2E4C303D8A318A721C3C0C95956809532FCF0E2449A6B525B16AEDF5AA0DE657BA637B391AAFD255');
 const cipher=createCipheriv('aes-256-gcm',key,iv),ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
 assert.equal(ciphertext.toString('hex'),'522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662898015ad');
 assert.equal(cipher.getAuthTag().toString('hex'),'b094dac5d93471bdec1a502270e3cc6c');
 const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(cipher.getAuthTag());assert.deepEqual(Buffer.concat([decipher.update(ciphertext),decipher.final()]),plaintext);key.fill(0);
});
