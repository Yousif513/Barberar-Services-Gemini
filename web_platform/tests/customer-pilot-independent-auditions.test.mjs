import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { APPROVAL_ID, runJob, validateAccount, conservativeUnits, endpointFor, readJournal } from '../../scripts/volabi-auditions/runner.mjs';

globalThis.fetch = () => { throw new Error('LIVE_NETWORK_FORBIDDEN_IN_INDEPENDENT_TESTS'); };
const hash = x => createHash('sha256').update(x).digest('hex');
const syntheticKey = 'OFFLINE_SYNTHETIC_KEY_NOT_A_CREDENTIAL_0123456789';
function wavResponse() {
  const b = Buffer.alloc(48); b.write('RIFF'); b.writeUInt32LE(40, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(24000, 24); b.writeUInt32LE(48000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(4, 40);
  return new Response(b, { status: 200, headers: { 'content-type': 'audio/wav' } });
}
async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'volabi-independent-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(base)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(base).startsWith('volabi-independent-'));
    await fs.rm(base, { recursive: true, force: true });
  });
  const projectRoot = path.join(base, 'project'), stateRoot = path.join(base, 'private-state');
  await fs.mkdir(projectRoot);
  const approvalPath = path.join(projectRoot, 'approval.md');
  const approval = `approval_id: ${APPROVAL_ID}\nexecution_authorized: true\naggregate_character_cap: 100000\naggregate_all_in_SAR_cap: 10\nmaximum_rounds: 3\n`;
  await fs.writeFile(approvalPath, approval);
  const evidencePath = path.join(base, 'offline-evidence.txt'), evidenceText = 'SYNTHETIC OFFLINE FIXTURE, NOT A REAL ACCOUNT OR PRICE QUOTE';
  await fs.writeFile(evidencePath, evidenceText);
  const ssml = '<speak version="1.0" xml:lang="ar-SA"><voice name="ar-SA-HamedNeural"><p>APPROVED FIXTURE</p></voice></speak>';
  const job = { id: 'adam-role', kind: 'role', agentId: 'adam', voice: 'ar-SA-HamedNeural', locale: 'ar-SA', ssml, units: conservativeUnits(ssml), payloadSha256: hash(ssml), sourcePath: 'independent-synthetic-fixture' };
  const body = { schemaVersion: 1, approvalId: APPROVAL_ID, sourceSha256: hash('fixture'), jobs: [job] };
  const plan = { ...body, planSha256: hash(JSON.stringify(body)), totalUnits: job.units };
  const account = { approvalId: APPROVAL_ID, environment: 'development-only', approvalDocumentSha256: hash(approval), planSha256: plan.planSha256, resourceId: '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/fixture/providers/Microsoft.CognitiveServices/accounts/offline-fixture', region: 'uaenorth', endpoint: endpointFor('uaenorth'), reviewedBy: 'Independent offline fixture', verifiedAt: '2026-10-22T00:00:00Z', validUntil: '2026-10-23T00:00:00Z', termsAccepted: true, pricingConfirmed: true, feesAndTaxesIncluded: true, exclusiveAuditionUseConfirmed: true, voicesConfirmed: true, allInSarPerMillionUnits: '56.25', fixedFeeSarPerAttempt: '0', maxNonRequestFeesSar: '0', evidence: ['account-price-and-fees','account-terms','regional-voices'].map(kind => ({ kind, path: evidencePath, sha256: hash(evidenceText) })) };
  return { base, projectRoot, stateRoot, approvalPath, plan, account, jobId: job.id, now: new Date('2026-10-22T12:00:00Z'), getCredential: async () => syntheticKey, fetchImpl: async () => wavResponse() };
}

test('A-PATH1 offline evidence rejects remote/device paths before any read', async t => {
  const f = await fixture(t);
  await validateAccount(f.account, f.plan, f.approvalPath, f.now);
  for (const bad of ['\\\\untrusted.invalid\\share\\quote.txt', '\\\\?\\UNC\\untrusted.invalid\\share\\quote.txt', 'file://untrusted.invalid/share/quote.txt', 'relative-quote.txt']) {
    const account = { ...f.account, evidence: f.account.evidence.map((e, i) => i ? e : { ...e, path: bad }) };
    let unsafeReads = 0;
    const originalReadFile = fs.readFile;
    fs.readFile = async function (candidate, ...args) {
      if (String(candidate) === bad) { unsafeReads++; throw new Error('INTERCEPTED_UNSAFE_READ_WITHOUT_NETWORK'); }
      return originalReadFile.call(fs, candidate, ...args);
    };
    try { await assert.rejects(validateAccount(account, f.plan, f.approvalPath, f.now)); }
    finally { fs.readFile = originalReadFile; }
    assert.equal(unsafeReads, 0, `unsafe path reached filesystem read: ${bad}`);
  }
});

test('A-PATH2 offline evidence rejects local junction ancestors', async t => {
  const f = await fixture(t), target = path.join(f.base, 'evidence-target'), junction = path.join(f.base, 'evidence-junction');
  await fs.mkdir(target); await fs.writeFile(path.join(target, 'quote.txt'), 'LOCAL JUNCTION FIXTURE');
  await fs.symlink(target, junction, 'junction');
  const account = { ...f.account, evidence: f.account.evidence.map((e, i) => i ? e : { ...e, path: path.join(junction, 'quote.txt'), sha256: hash('LOCAL JUNCTION FIXTURE') }) };
  await assert.rejects(validateAccount(account, f.plan, f.approvalPath, f.now));
});

test('A-SNAPSHOT1 credential await cannot change frozen dispatched SSML or reserved hash', async t => {
  const f = await fixture(t), original = f.plan.jobs[0].ssml, originalHash = f.plan.jobs[0].payloadSha256;
  let sent, expectedCredentialResource;
  const result = await runJob({ ...f, getCredential: async expectedResource => { expectedCredentialResource = expectedResource; f.plan.jobs[0].ssml = original.replace('APPROVED FIXTURE', 'UNAPPROVED MUTATION'); return syntheticKey; }, fetchImpl: async (url, init) => { assert.equal(url, endpointFor('uaenorth')); sent = init.body; return wavResponse(); } });
  assert.equal(result.status, 'audio_saved');
  assert.equal(sent, original, 'dispatched bytes changed after source/hash/budget validation');
  assert.equal(expectedCredentialResource, hash(f.account.resourceId));
  const reservation = (await readJournal(f.stateRoot)).find(row => row.type === 'reservation');
  assert.equal(hash(sent), originalHash);
  assert.equal(reservation.payloadSha256, originalHash);
  assert.equal(reservation.units, conservativeUnits(sent));
});


test('A-BIND1 actual pure PowerShell envelope rejects another resource before decoding ciphertext', { skip: process.platform !== 'win32' ? 'Windows-only DPAPI/local-drive integration; exercised on the target Windows host.' : false }, async () => {
  const helper = fileURLToPath(new URL('../../scripts/volabi-auditions/credential-binding.ps1', import.meta.url));
  const quote = s => "'" + s.replace(/'/g, "''") + "'";
  const ps = `
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
. ${quote(helper)}
$expected='${'a'.repeat(64)}'
$wrong=[pscustomobject]@{schemaVersion=1;resourceSha256=('b'*64);protectedKey='INVALID-BASE64-WOULD-FAIL-DECODING'}
try { Get-VolabiBoundCiphertext -Envelope $wrong -ExpectedResourceSha256 $expected | Out-Null; throw 'MISMATCH_ACCEPTED' } catch { if ($_.Exception.Message -cne 'CREDENTIAL_RESOURCE_MISMATCH') { throw } }
$matching=[pscustomobject]@{schemaVersion=1;resourceSha256=$expected;protectedKey=[Convert]::ToBase64String([byte[]](1,2,3,4))}
$bytes=Get-VolabiBoundCiphertext -Envelope $matching -ExpectedResourceSha256 $expected
if (($bytes -join ',') -cne '1,2,3,4') { throw 'CIPHERTEXT_CHANGED' }
$extra=[pscustomobject]@{schemaVersion=1;resourceSha256=$expected;protectedKey=$matching.protectedKey;unexpected='not-permitted'}
try { Get-VolabiBoundCiphertext -Envelope $extra -ExpectedResourceSha256 $expected | Out-Null; throw 'UNKNOWN_FIELD_ACCEPTED' } catch { if ($_.Exception.Message -cne 'CREDENTIAL_ENVELOPE_INVALID') { throw } }
[Console]::Out.Write('PURE_RESOURCE_BINDING_OK_NO_DPAPI_OR_KEY_READ')
`;
  const { stdout, stderr } = await promisify(execFile)('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')], { windowsHide:true, timeout:15000, maxBuffer:4096 });
  assert.equal(stderr, ''); assert.equal(stdout, 'PURE_RESOURCE_BINDING_OK_NO_DPAPI_OR_KEY_READ');
});

test('A-PATH3 actual credential-directory metadata guard rejects an existing junction before missing-tail creation', { skip: process.platform !== 'win32' ? 'Windows-only DPAPI/local-drive integration; exercised on the target Windows host.' : false }, async t => {
  const f=await fixture(t), target=path.join(f.base,'directory-target'), junction=path.join(f.base,'parent-junction');
  await fs.mkdir(target); await fs.symlink(target,junction,'junction');
  const proposed=path.join(junction,'uncreated','credential-directory');
  const helper=fileURLToPath(new URL('../../scripts/volabi-auditions/local-path.ps1',import.meta.url));
  const encoded=Buffer.from(JSON.stringify([proposed]),'utf8').toString('base64');
  await assert.rejects(promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-File',helper,'-PathsBase64',encoded,'-TargetKind','Directory','-AllowMissingTail','-Quiet'],{windowsHide:true,timeout:15000,maxBuffer:4096}), error => error.code===1 && error.stderr.includes('LOCAL_FILE_PATH_REJECTED'));
  assert.equal(await fs.stat(path.join(target,'uncreated')).catch(()=>null),null);
});


test('A-STATE1 private-state UNC syntax is rejected before mkdir or journal read', { skip: process.platform !== 'win32' ? 'Windows-only DPAPI/local-drive integration; exercised on the target Windows host.' : false }, async t => {
  const f=await fixture(t), remote='\\\\untrusted.invalid\\share\\private-state';
  const originalMkdir=fs.mkdir, originalReadFile=fs.readFile;
  let unsafeMkdir=0, unsafeRead=0;
  fs.mkdir=async function(candidate,...args) { if(String(candidate).startsWith(remote)) { unsafeMkdir++; throw Error('INTERCEPTED_UNSAFE_MKDIR_NO_NETWORK'); } return originalMkdir.call(fs,candidate,...args); };
  fs.readFile=async function(candidate,...args) { if(String(candidate).startsWith(remote)) { unsafeRead++; throw Error('INTERCEPTED_UNSAFE_READ_NO_NETWORK'); } return originalReadFile.call(fs,candidate,...args); };
  try {
    await assert.rejects(runJob({...f,stateRoot:remote}));
    await assert.rejects(readJournal(remote));
  } finally { fs.mkdir=originalMkdir; fs.readFile=originalReadFile; }
  assert.equal(unsafeMkdir,0,'remote state reached mkdir before local validation');
  assert.equal(unsafeRead,0,'remote status journal reached readFile before local validation');
});

test('A-STATE2 state ancestor junction is rejected before creating the missing child', async t => {
  const f=await fixture(t), target=path.join(f.base,'state-target'), junction=path.join(f.base,'state-junction');
  await fs.mkdir(target); await fs.symlink(target,junction,'junction');
  await assert.rejects(runJob({...f,stateRoot:path.join(junction,'uncreated-state')}));
  assert.equal(await fs.stat(path.join(target,'uncreated-state')).catch(()=>null),null);
});
