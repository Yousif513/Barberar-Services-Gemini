import test from 'node:test';
import assert from 'node:assert/strict';
import { conservativeUnits, endpointFor, maximumCostMicros } from './runner.mjs';
globalThis.fetch = () => { throw new Error('LIVE_NETWORK_FORBIDDEN_IN_TESTS'); };
test('full SSML bytes reserve markup, whitespace and Arabic, not just spoken text', () => {
  const xml = '<speak><voice>مرحبا</voice></speak>  ';
  assert.equal(conservativeUnits(xml), Buffer.byteLength(xml, 'utf8'));
  assert.ok(conservativeUnits(xml) > [...'مرحبا'].length);
});
test('unplanned weighted Han characters fail closed', () => {
  assert.throws(() => conservativeUnits('<speak>漢</speak>'), /UNPLANNED_HAN/);
});
test('only reviewed official region hosts are accepted', () => {
  assert.equal(endpointFor('uaenorth'), 'https://uaenorth.tts.speech.microsoft.com/cognitiveservices/v1');
  for (const region of ['uaenorth.evil.test', 'eastus@evil.test', 'https://eastus', 'eastus/..', '']) {
    assert.throws(() => endpointFor(region), /REGION_NOT_ALLOWED/);
  }
});
test('money reservation rounds upward using integer micro-SAR', () => {
  assert.equal(maximumCostMicros(1, '56.250001', '0'), 57n);
  assert.equal(maximumCostMicros(100000, '56.25', '0.01'), 5635000n);
  assert.throws(() => maximumCostMicros(1, 'NaN', '0'), /INVALID_MONEY/);
});

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { APPROVAL_ID, runJob, readJournal, loadPlan, localFileSyntax, validateLocalFilePaths, readAccountFile, credentialReaderArgs } from './runner.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const fakeSecret = 'TEST_SECRET_NEVER_A_REAL_CREDENTIAL_0123456789';
function wave() {
  const b = Buffer.alloc(48); b.write('RIFF'); b.writeUInt32LE(40, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(24000, 24); b.writeUInt32LE(48000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(4, 40); return b;
}
const audioResponse = () => new Response(wave(), { status: 200, headers: { 'content-type': 'audio/wav' } });
async function fixture(t, { padding = 0, rate = '56.25', fixed = '0', nonRequest = '0' } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'volabi-offline-test-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const projectRoot = path.join(base, 'project'), stateRoot = path.join(base, 'private-state');
  await fs.mkdir(projectRoot);
  const approvalPath = path.join(projectRoot, 'approval.md');
  const approval = `approval_id: ${APPROVAL_ID}\nexecution_authorized: true\naggregate_character_cap: 100000\naggregate_all_in_SAR_cap: 10\nmaximum_rounds: 3\n`;
  await fs.writeFile(approvalPath, approval);
  const evidence = path.join(base, 'public-account-evidence.txt'); await fs.writeFile(evidence, 'SYNTHETIC OFFLINE TEST EVIDENCE NOT AN ACCOUNT QUOTE');
  const ssml = `<speak version="1.0" xml:lang="ar-SA"><voice name="ar-SA-HamedNeural"><p>Hello</p></voice></speak>${' '.repeat(padding)}`;
  const job = { id: 'adam-role', kind: 'role', agentId: 'adam', voice: 'ar-SA-HamedNeural', locale: 'ar-SA', ssml, units: conservativeUnits(ssml), payloadSha256: hash(ssml), sourcePath: 'synthetic-test-only' };
  const body = { schemaVersion: 1, approvalId: APPROVAL_ID, sourceSha256: hash('fixture'), jobs: [job] };
  const plan = { ...body, planSha256: hash(JSON.stringify(body)), totalUnits: job.units };
  const account = { approvalId: APPROVAL_ID, environment: 'development-only', approvalDocumentSha256: hash(approval), planSha256: plan.planSha256, resourceId: '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/fixture/providers/Microsoft.CognitiveServices/accounts/offline-fixture', region: 'uaenorth', endpoint: endpointFor('uaenorth'), reviewedBy: 'Offline test identity', verifiedAt: '2026-10-22T00:00:00Z', validUntil: '2026-10-23T00:00:00Z', termsAccepted: true, pricingConfirmed: true, feesAndTaxesIncluded: true, exclusiveAuditionUseConfirmed: true, voicesConfirmed: true, allInSarPerMillionUnits: rate, fixedFeeSarPerAttempt: fixed, maxNonRequestFeesSar: nonRequest, evidence: ['account-price-and-fees','account-terms','regional-voices'].map(kind => ({ kind, path: evidence, sha256: hash('SYNTHETIC OFFLINE TEST EVIDENCE NOT AN ACCOUNT QUOTE') })) };
  return { projectRoot, stateRoot, approvalPath, plan, account, jobId: job.id, now: new Date('2026-10-22T12:00:00Z'), getCredential: async () => fakeSecret, fetchImpl: async () => audioResponse(), base };
}
test('current reviewed source compiles 92 exact candidate jobs without any network or credential', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const plan = await loadPlan(root);
  assert.equal(plan.jobs.length, 92); assert.equal(new Set(plan.jobs.filter(j => j.kind === 'role').map(j => j.agentId)).size, 15);
  assert.equal(plan.jobs.filter(j => j.kind === 'blind').length, 75); assert.equal(plan.jobs.filter(j => j.kind === 'anchor').length, 2);
  assert.ok(plan.totalUnits < 100000); assert.ok(plan.jobs.every(job => ['ar-SA-HamedNeural', 'ar-LB-LaylaNeural'].includes(job.voice)));
});
test('success reserves before dispatch, validates WAV and resumes without credential or network', async t => {
  const f = await fixture(t); let calls = 0;
  const result = await runJob({ ...f, fetchImpl: async (url, init) => { calls++; assert.equal(url, endpointFor('uaenorth')); assert.equal(init.redirect, 'manual'); const events = await readJournal(f.stateRoot); assert.equal(events.at(-1).type, 'reservation'); return audioResponse(); } });
  assert.equal(result.status, 'audio_saved'); assert.equal(result.attemptedNetwork, true);
  const resumed = await runJob({ ...f, getCredential: () => { throw Error('MUST_NOT_READ'); }, fetchImpl: () => { throw Error('MUST_NOT_CALL'); } });
  assert.equal(resumed.resumed, true); assert.equal(resumed.attemptedNetwork, false); assert.equal(calls, 1);
  assert.ok(!(await fs.readFile(path.join(f.stateRoot, 'attempts.jsonl'), 'utf8')).includes(fakeSecret));
});
test('timeout with secret-bearing error retains reservation and never automatically retries', async t => {
  const f = await fixture(t); let calls = 0;
  const first = await runJob({ ...f, fetchImpl: async () => { calls++; throw Error('timeout ' + fakeSecret); } });
  assert.equal(first.status, 'unknown');
  const resumed = await runJob({ ...f, fetchImpl: async () => { calls++; return audioResponse(); } });
  assert.equal(resumed.attemptedNetwork, false); assert.equal(calls, 1);
  const events = await readJournal(f.stateRoot); assert.equal(events.filter(e => e.type === 'reservation').length, 1);
  assert.ok(!(await fs.readFile(path.join(f.stateRoot, 'attempts.jsonl'), 'utf8')).includes(fakeSecret));
  assert.ok(BigInt(first.reservedCostMicros) > 0n);
});
test('explicit retry is a separately charged attempt; round 4 is forbidden', async t => {
  const f = await fixture(t); await runJob({ ...f, fetchImpl: async () => { throw Error('unknown'); } });
  const retry = await runJob({ ...f, attempt: 2 }); assert.equal(retry.status, 'audio_saved');
  assert.equal((await readJournal(f.stateRoot)).filter(e => e.type === 'reservation').length, 2);
  await assert.rejects(runJob({ ...f, round: 4 }), /ROUND_OR_ATTEMPT_INVALID/);
});
test('aggregate character ceiling includes earlier unknown outcomes and all rounds', async t => {
  const f = await fixture(t, { padding: 60000 }); await runJob({ ...f, fetchImpl: async () => { throw Error('unknown'); } });
  let secretReads = 0;
  await assert.rejects(runJob({ ...f, round: 2, getCredential: async () => { secretReads++; return fakeSecret; } }), /AGGREGATE_CHARACTER_CAP/);
  assert.equal(secretReads, 0);
});
test('all-in cost reserves fixed fees, no-audio processing and non-request bound', async t => {
  const f = await fixture(t, { fixed: '4', nonRequest: '2' });
  const first = await runJob({ ...f, fetchImpl: async () => new Response('', { status: 200, headers: { 'content-type': 'audio/wav' } }) });
  assert.equal(first.status, 'unknown');
  await assert.rejects(runJob({ ...f, attempt: 2 }), /AGGREGATE_BUDGET_CAP/);
});
test('account price, terms, freshness, hash and endpoint failures precede credential access', async t => {
  const f = await fixture(t); let reads = 0;
  for (const patch of [{ pricingConfirmed: false }, { feesAndTaxesIncluded: false }, { termsAccepted: false }, { allInSarPerMillionUnits: undefined }, { validUntil: '2026-10-22T11:00:00Z' }, { endpoint: 'https://uaenorth.tts.speech.microsoft.com@evil.test/cognitiveservices/v1' }, { key: fakeSecret }, { approvalDocumentSha256: '0'.repeat(64) }]) {
    await assert.rejects(runJob({ ...f, account: { ...f.account, ...patch }, getCredential: async () => { reads++; return fakeSecret; } }));
  }
  assert.equal(reads, 0);
});
test('redirect never follows or exposes body, and HTTP failures consume their full reservations', async t => {
  const f = await fixture(t); let calls = 0;
  const redirect = await runJob({ ...f, fetchImpl: async (url, init) => { calls++; assert.equal(init.redirect, 'manual'); return new Response(fakeSecret, { status: 307, headers: { Location: 'https://evil.test/' } }); } });
  assert.equal(redirect.code, 'REDIRECT_REFUSED'); assert.equal(calls, 1);
  const failed = await runJob({ ...f, attempt: 2, fetchImpl: async () => new Response(fakeSecret, { status: 401 }) });
  assert.equal(failed.status, 'http_failure'); assert.ok(BigInt(failed.reservedCostMicros) > 0n);
  assert.ok(!(await fs.readFile(path.join(f.stateRoot, 'attempts.jsonl'), 'utf8')).includes(fakeSecret));
});

function childRun(configPath) {
  const worker = path.join(path.dirname(fileURLToPath(import.meta.url)), 'concurrent-worker.mjs');
  const child = spawn(process.execPath, [worker, configPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve({ code, output })); });
  return { child, done };
}
async function childConfig(f, extra = {}) {
  const configPath = path.join(f.base, 'child-config-' + (extra.attempt || 1) + '.json');
  await fs.writeFile(configPath, JSON.stringify({ ...f, now: f.now.toISOString(), audioBase64: wave().toString('base64'), startedFile: path.join(f.base, 'fake-provider-started'), ...extra })); return configPath;
}
test('two separate Node processes share an exclusive durable lock and cannot double-dispatch', async t => {
  const f = await fixture(t);
  const one = childRun(await childConfig(f, { attempt: 1 })), two = childRun(await childConfig(f, { attempt: 2 }));
  t.after(() => { one.child.kill(); two.child.kill(); });
  const results = await Promise.all([one.done, two.done]);
  assert.equal(results.filter(result => result.code === 0).length, 1, JSON.stringify(results));
  assert.equal(results.filter(result => result.output.includes('EXECUTION_LOCKED_MANUAL_REVIEW_IF_STALE')).length, 1);
  assert.equal((await readJournal(f.stateRoot)).filter(event => event.type === 'reservation').length, 1);
});
test('process death after reservation keeps its lock and budget; explicit local recovery never retries', async t => {
  const f = await fixture(t), startedFile = path.join(f.base, 'fake-provider-started');
  const processRun = childRun(await childConfig(f, { holdMs: 10000 }));
  t.after(() => processRun.child.kill());
  for (let n = 0; n < 250; n++) { if (await fs.stat(startedFile).catch(() => null)) break; await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.ok(await fs.stat(startedFile)); processRun.child.kill(); await processRun.done;
  await assert.rejects(runJob(f), /EXECUTION_LOCKED_MANUAL_REVIEW_IF_STALE/);
  const before = await readJournal(f.stateRoot); assert.equal(before.at(-1).type, 'reservation');
  // Isolated fixture only: an operator has audited and confirmed the child is dead.
  await fs.unlink(path.join(f.stateRoot, 'execution.lock'));
  const resumed = await runJob({ ...f, getCredential: () => { throw Error('NO_SECRET'); }, fetchImpl: () => { throw Error('NO_REQUEST'); } });
  assert.equal(resumed.status, 'unknown'); assert.equal(resumed.attemptedNetwork, false);
  assert.deepEqual(await readJournal(f.stateRoot), before);
});
test('corrupt/truncated journal and mismatched account bindings fail closed', async t => {
  const f = await fixture(t); await runJob(f);
  const file = path.join(f.stateRoot, 'attempts.jsonl'), original = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, original.slice(0, -4));
  await assert.rejects(runJob({ ...f, attempt: 2 }), /JOURNAL_CORRUPT/);
  await fs.writeFile(file, original);
  await assert.rejects(runJob({ ...f, attempt: 2, account: { ...f.account, allInSarPerMillionUnits: '60' } }), /LEDGER_BINDING_MISMATCH/);
});
test('account evidence can be freshly reattested without resetting prior aggregate usage', async t => {
  const f = await fixture(t); await runJob(f);
  const account = { ...f.account, verifiedAt: '2026-10-22T01:00:00Z', validUntil: '2026-10-23T01:00:00Z' };
  await runJob({ ...f, account, attempt: 2 });
  const events = await readJournal(f.stateRoot); assert.equal(events.filter(event => event.type === 'binding').length, 1); assert.equal(events.filter(event => event.type === 'reservation').length, 2);
});
test('saved audio tampering cannot silently start a replacement purchase/call', async t => {
  const f = await fixture(t), saved = await runJob(f);
  await fs.writeFile(path.join(f.stateRoot, saved.audioFile), 'changed');
  await assert.rejects(runJob({ ...f, getCredential: () => { throw Error('MUST_NOT_READ'); } }), /SAVED_AUDIO_CHANGED/);
});
test('release-path storage and modified SSML are rejected before secret access', async t => {
  const f = await fixture(t); await assert.rejects(runJob({ ...f, stateRoot: path.join(f.projectRoot, 'web_platform/public/audio') }), /STATE_MUST_BE_OUTSIDE_PROJECT/);
  const plan = structuredClone(f.plan); plan.jobs[0].ssml += 'changed';
  await assert.rejects(runJob({ ...f, plan }), /PLAN_INTEGRITY_FAILED/);
});
test('credential helper source offers masked DPAPI input, no credential arguments or environment handoff', async () => {
  const helper = await fs.readFile(new URL('./credential.ps1', import.meta.url), 'utf8');
  assert.match(helper, /Read-Host[^\n]+-AsSecureString/); assert.match(helper, /ProtectedData\]::Protect/); assert.match(helper, /Get-VolabiBoundCiphertext/); assert.match(helper, /INTERNAL_CAPTURED_PIPE_ONLY/); assert.match(helper, /ZeroFreeBSTR/);
  assert.doesNotMatch(helper, /Write-(?:Host|Output).*taskSecure|ConvertFrom-SecureString[^\n]+-Key/);
});

test('missing ledger or orphaned artifacts never silently reset aggregate accounting', async t => {
  const f = await fixture(t); await runJob(f);
  const journal = path.join(f.stateRoot, 'attempts.jsonl'), original = await fs.readFile(journal);
  await fs.unlink(journal);
  await assert.rejects(runJob({ ...f, attempt: 2 }), /STATE_WITHOUT_LEDGER_REQUIRES_REVIEW/);
  await fs.writeFile(journal, original);
  await fs.writeFile(path.join(f.stateRoot, '2-adam-role-99.wav'), wave());
  await assert.rejects(runJob({ ...f, attempt: 2 }), /UNACCOUNTED_STATE_ARTIFACT_REQUIRES_REVIEW/);
});

test('actual CLI with no arguments remains offline planning by default', async () => {
  const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'runner.mjs');
  const child = spawn(process.execPath, [cli], { windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  let output = '', errors = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { errors += chunk; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert.equal(code, 0, errors); const result = JSON.parse(output);
  assert.equal(result.network, 'none'); assert.equal(result.jobs.length, 92); assert.equal(result.firstPassUnits, 66818);
});

test('dispatch payload and reservation use the original snapshot after credential callback mutates caller input', async t => {
  const f = await fixture(t), approved = f.plan.jobs[0].ssml;
  let sent, boundResource;
  await runJob({ ...f, getCredential: async expected => { boundResource = expected; f.plan.jobs[0].ssml = approved.replace('Hello', 'changed text beyond approval'); f.plan.jobs[0].units = 1; f.account.allInSarPerMillionUnits = '0.000001'; f.account.endpoint = 'https://evil.invalid/'; return fakeSecret; }, fetchImpl: async (url, init) => { sent = { url, body: init.body }; return audioResponse(); } });
  assert.equal(sent.body, approved); assert.equal(sent.url, endpointFor('uaenorth'));
  assert.equal(boundResource, hash(f.account.resourceId));
  const reservation = (await readJournal(f.stateRoot)).find(e => e.type === 'reservation');
  assert.equal(reservation.payloadSha256, hash(approved)); assert.equal(reservation.units, conservativeUnits(approved));
});

test('UNC evidence is refused before readFile can touch a share', async t => {
  const f = await fixture(t), remote = '\\\\never-contact.invalid\\share\\evidence.txt';
  const original = fs.readFile; let remoteReads = 0;
  fs.readFile = async (file, ...args) => { if (file === remote) { remoteReads++; throw Error('SENTINEL_NETWORK_READ_BLOCKED'); } return original(file, ...args); };
  try {
    f.account.evidence[0].path = remote;
    await assert.rejects(runJob(f), /LOCAL_.*PATH|LOCAL_.*FILE/);
    assert.equal(remoteReads, 0);
  } finally { fs.readFile = original; }
});

test('unsafe Windows account/evidence spellings are rejected before any filesystem inspector', async () => {
  let inspections = 0;
  const invalid = ['\\\\never-contact.invalid\\share\\quote.json', '\\\\?\\UNC\\never-contact.invalid\\share\\quote.json', '\\\\.\\C:\\quote.json', 'https://never-contact.invalid/quote.json', 'file:///C:/quote.json', 'relative.json', 'C:relative.json', 'C:\\quote.json:secret', 'C:\\parent\\..\\quote.json'];
  for (const filename of invalid) {
    assert.throws(() => localFileSyntax(filename, 'win32'), /LOCAL_FILE_PATH_REQUIRED/);
    await assert.rejects(readAccountFile(filename, { platform: 'win32', windowsInspector: async () => { inspections++; } }), /LOCAL_FILE_PATH_REQUIRED/);
  }
  assert.equal(inspections, 0);
});
test('mapped drive refusal happens in metadata gate, before account bytes; no real mapped drive is probed', async () => {
  let inspections = 0;
  await assert.rejects(readAccountFile('Z:\\never-probed\\account.json', { platform: 'win32', windowsInspector: async files => { inspections++; assert.deepEqual(files, ['Z:\\never-probed\\account.json']); throw Error('LOCAL_FIXED_DRIVE_REQUIRED'); } }), /LOCAL_FIXED_DRIVE_REQUIRED/);
  assert.equal(inspections, 1);
});
test('real local junction account/evidence ancestors are refused without reading their bytes', async t => {
  const f = await fixture(t), target = path.join(f.base, 'target'), link = path.join(f.base, 'junction');
  await fs.mkdir(target); await fs.writeFile(path.join(target, 'account.json'), '{}'); await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(readAccountFile(path.join(link, 'account.json')), /LOCAL_.*PATH|LOCAL_REPARSE/);
});
test('account and evidence snapshots cannot change during an awaited evidence check', async t => {
  const f = await fixture(t), originalRate = f.account.allInSarPerMillionUnits, resource = f.account.resourceId;
  const read = fs.readFile; let patched = false, requested;
  fs.readFile = async (file, ...args) => {
    if (!patched && file === f.approvalPath) { patched = true; f.account.allInSarPerMillionUnits = '0.000001'; f.account.resourceId += '-changed'; f.account.evidence[0].path = '\\\\never-contact.invalid\\share\\never.txt'; }
    return read(file, ...args);
  };
  try {
    await runJob({ ...f, getCredential: async expected => { requested = expected; return fakeSecret; } });
    const reservation = (await readJournal(f.stateRoot)).find(e => e.type === 'reservation');
    assert.equal(requested, hash(resource)); assert.equal(reservation.costMicros, maximumCostMicros(f.plan.jobs[0].units, originalRate, '0').toString());
  } finally { fs.readFile = read; }
});
test('private credential reader receives only the exact expected resource hash', () => {
  const expected = 'a'.repeat(64), args = credentialReaderArgs(expected);
  assert.equal(args.at(-2), '-ResourceSha256'); assert.equal(args.at(-1), expected);
  assert.throws(() => credentialReaderArgs('different-resource'), /CREDENTIAL_RESOURCE_BINDING_REQUIRED/);
});
test('actual shared PowerShell binding validator rejects another resource before protected bytes or DPAPI', { skip: process.platform !== 'win32' }, async () => {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'credential-binding.test.ps1');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script], { windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert.equal(code, 0, output); assert.equal(output.trim(), 'RESOURCE_BINDING_OFFLINE_CASES_PASS');
});

test('private-state UNC syntax is rejected before mkdir or journal read', async t => {
  const f = await fixture(t), remote = '\\\\never-contact.invalid\\share\\private-state';
  const mkdir = fs.mkdir, read = fs.readFile; let unsafeCalls = 0;
  fs.mkdir = async (file, ...args) => { if (String(file).startsWith('\\\\')) { unsafeCalls++; throw Error('SENTINEL_UNSAFE_MKDIR'); } return mkdir(file, ...args); };
  fs.readFile = async (file, ...args) => { if (String(file).startsWith('\\\\')) { unsafeCalls++; throw Error('SENTINEL_UNSAFE_READ'); } return read(file, ...args); };
  try {
    await assert.rejects(runJob({ ...f, stateRoot: remote }), /LOCAL_FILE_PATH_REQUIRED/);
    await assert.rejects(readJournal(remote), /LOCAL_FILE_PATH_REQUIRED/);
    assert.equal(unsafeCalls, 0);
  } finally { fs.mkdir = mkdir; fs.readFile = read; }
});
test('private-state junction is refused before creating missing child directories', async t => {
  const f = await fixture(t), target = path.join(f.base, 'state-target'), link = path.join(f.base, 'state-junction');
  await fs.mkdir(target); await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(runJob({ ...f, stateRoot: path.join(link, 'not-created') }), /LOCAL_.*PATH|LOCAL_REPARSE/);
  assert.equal(await fs.stat(path.join(target, 'not-created')).catch(() => null), null);
});
