import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

export const APPROVAL_ID = '20261022-azure-development-15';
export const LIMITS = Object.freeze({ units: 100000, rounds: 3, microSar: 10000000n });
export const VOICES = Object.freeze({ 'ar-SA': 'ar-SA-HamedNeural', 'ar-LB': 'ar-LB-LaylaNeural' });
const NAMES = 'nora adam alexander sarah victoria emma maya ethan daniel sophia layla omar olivia lina rayan'.split(' ');
const APPROVAL_FILE = 'planning/volabi/voice-auditions/EXECUTION_APPROVAL_20261022.md';
const SOURCE_DIR = 'planning/volabi/voice-auditions';
const CHECKED_STATE_DIRECTORY = Symbol('checked-local-state-directory');
const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = bytes => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replace(/\r\n/g, '\n');
const fail = code => { throw new Error(code); };
const assert = (condition, code) => { if (!condition) fail(code); };
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const escapeXml = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function immutableSnapshot(value) {
  let copy; try { copy = structuredClone(value); } catch { fail('INPUT_SNAPSHOT_INVALID'); }
  const freeze = item => { if (item && typeof item === 'object') { for (const child of Object.values(item)) freeze(child); Object.freeze(item); } return item; };
  return freeze(copy);
}
export function localFileSyntax(value, platform = process.platform) {
  assert(typeof value === 'string' && value.length > 0 && !/[\x00-\x1F]/.test(value), 'LOCAL_FILE_PATH_REQUIRED');
  if (platform === 'win32') {
    assert(/^[A-Za-z]:[\\/]/.test(value) && !/[:<>"|?*]/.test(value.slice(2)), 'LOCAL_FILE_PATH_REQUIRED');
    const normalized = value.replace(/\//g, '\\');
    assert(!/(?:^|\\)\.\.?(?:\\|$)/.test(normalized) && !/[. ](?:\\|$)/.test(normalized) && normalized.length > 3 && !normalized.endsWith('\\'), 'LOCAL_FILE_PATH_REQUIRED');
    return normalized;
  }
  assert(value.startsWith('/') && !value.startsWith('//') && !/[\\:]/.test(value) && !/(?:^|\/)\.\.?(?:\/|$)/.test(value), 'LOCAL_FILE_PATH_REQUIRED');
  return value;
}
async function inspectWindowsPaths(files, { targetKind = 'File', allowMissingTail = false } = {}) {
  try {
    const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), 'local-path.ps1');
    const encoded = Buffer.from(JSON.stringify(files), 'utf8').toString('base64');
    const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', helper, '-PathsBase64', encoded, '-TargetKind', targetKind, ...(allowMissingTail ? ['-AllowMissingTail'] : [])], { windowsHide: true, maxBuffer: 4096, timeout: 15000 });
    assert(stdout.trim() === 'LOCAL_FILES_OK', 'LOCAL_FILE_PATH_REJECTED');
  } catch { fail('LOCAL_FILE_PATH_REJECTED'); }
}
export async function validateLocalFilePaths(files, { platform = process.platform, windowsInspector = inspectWindowsPaths, targetKind = 'File', allowMissingTail = false } = {}) {
  assert(Array.isArray(files) && files.length > 0, 'LOCAL_FILE_PATH_REQUIRED');
  // Validate the complete batch syntactically before any path metadata or bytes.
  const checked = files.map(file => localFileSyntax(file, platform));
  if (platform === 'win32') await windowsInspector(checked, { targetKind, allowMissingTail });
  else {
    for (const file of checked) {
      const ancestors = []; let cursor = file;
      while (true) { ancestors.unshift(cursor); const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent; }
      let leaf;
      for (const ancestor of ancestors) {
        const info = await fs.lstat(ancestor).catch(error => { if (error.code === 'ENOENT' && targetKind === 'Directory' && allowMissingTail) return null; throw error; });
        if (!info) { leaf = null; break; }
        assert(!info.isSymbolicLink(), 'LOCAL_REPARSE_PATH_FORBIDDEN'); leaf = info;
      }
      if (leaf) assert(targetKind === 'File' ? leaf.isFile() : leaf.isDirectory(), 'LOCAL_PATH_KIND_INVALID');
    }
  }
  return checked;
}
export async function validateLocalDirectoryPath(directory, guardOptions) {
  return validateLocalFilePaths([directory], { ...guardOptions, targetKind: 'Directory', allowMissingTail: true });
}
export async function readAccountFile(filename, guardOptions) {
  const [checked] = await validateLocalFilePaths([filename], guardOptions);
  return immutableSnapshot(JSON.parse((await fs.readFile(checked, 'utf8')).replace(/^\uFEFF/, '')));
}
export function conservativeUnits(ssml) {
  assert(typeof ssml === 'string' && ssml.length > 0, 'EMPTY_SSML');
  assert(!/\p{Script=Han}/u.test(ssml), 'UNPLANNED_HAN');
  assert(!/[\uD800-\uDFFF]/u.test(ssml), 'UNPAIRED_SURROGATE');
  return Buffer.byteLength(ssml, 'utf8');
}
function money(value) {
  assert(typeof value === 'string' && /^(0|[1-9]\d{0,8})(\.\d{1,6})?$/.test(value), 'INVALID_MONEY');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}
export function maximumCostMicros(units, allInSarPerMillionUnits, fixedFeeSarPerAttempt) {
  assert(positiveInteger(units), 'INVALID_UNITS');
  const variable = BigInt(units) * money(allInSarPerMillionUnits);
  return (variable + 999999n) / 1000000n + money(fixedFeeSarPerAttempt);
}
export function endpointFor(region) {
  assert(['eastus', 'uaenorth'].includes(region), 'REGION_NOT_ALLOWED');
  return `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
}
function inspectSsml(ssml, voice, locale) {
  assert(VOICES[locale] === voice, 'VOICE_OR_LOCALE_NOT_ALLOWED');
  assert(!/<!|<\?(?!xml\s)|<\/?(?:audio|lexicon|lang|phoneme|mstts:)/i.test(ssml), 'SSML_UNSUPPORTED_MARKUP');
  const tags = [...ssml.matchAll(/<\/?([\w:-]+)\b/g)].map(match => match[1]);
  assert(tags.every(tag => ['speak', 'voice', 'prosody', 'p', 'break'].includes(tag)), 'SSML_TAG_NOT_ALLOWED');
  assert((ssml.match(/<voice\b/g) || []).length === 1, 'SSML_VOICE_COUNT');
  assert(ssml.includes(`<voice name="${voice}">`) && ssml.includes(`xml:lang="${locale}"`), 'SSML_VOICE_MISMATCH');
  assert(!/\b(?:src|href|uri|base)\s*=/i.test(ssml), 'SSML_EXTERNAL_REFERENCE');
  return conservativeUnits(ssml);
}
export async function loadPlan(projectRoot) {
  const base = path.resolve(projectRoot, SOURCE_DIR);
  const receipt = JSON.parse(await fs.readFile(path.join(base, 'PACKAGE_HASHES.json'), 'utf8'));
  const verified = new Map();
  for (const entry of receipt.files) {
    assert(typeof entry.path === 'string' && !entry.path.includes('..') && !path.isAbsolute(entry.path), 'SOURCE_PATH_INVALID');
    const text = canonical(await fs.readFile(path.join(base, entry.path)));
    assert(sha(text) === entry.sha256, 'SOURCE_HASH_MISMATCH');
    verified.set(entry.path, text);
  }
  assert(verified.has('AUDITION_INPUT.json'), 'INPUT_NOT_REVIEWED');
  const input = JSON.parse(verified.get('AUDITION_INPUT.json'));
  assert(input.auditions.length === 15 && new Set(input.auditions.map(a => a.agent_id)).size === 15 && NAMES.every(n => input.auditions.some(a => a.agent_id === n)), 'ORIGINAL_ROSTER_REQUIRED');
  const jobs = [];
  const add = (id, kind, agent, ssml, sourcePath) => {
    const units = inspectSsml(ssml, agent.candidate_voice_id, agent.locale);
    jobs.push({ id, kind, agentId: agent.agent_id, voice: agent.candidate_voice_id, locale: agent.locale, ssml, units, payloadSha256: sha(ssml), sourcePath });
  };
  for (const agent of input.auditions) {
    assert(agent.presentation === (agent.locale === 'ar-SA' ? 'male' : 'female'), 'ACCENT_DIRECTION_MISMATCH');
    const role = verified.get(agent.azure_candidate_ssml_path);
    const blind = verified.get(agent.blind_trial_1_azure_path);
    assert(role && blind, 'SSML_NOT_REVIEWED');
    add(`${agent.agent_id}-role`, 'role', agent, role, agent.azure_candidate_ssml_path);
    const trials = input.blind_sets.text_by_locale[agent.locale];
    assert(trials?.length === 5 && (blind.match(/<p>/g) || []).length === 1, 'BLIND_SOURCE_INVALID');
    for (let i = 0; i < trials.length; i++) {
      const payload = i === 0 ? blind : blind.replace(/<p>[\s\S]*?<\/p>/, `<p>${escapeXml(trials[i])}</p>`);
      add(`${agent.agent_id}-blind-${i + 1}`, 'blind', agent, payload, `AUDITION_INPUT.json:blind_sets.${agent.locale}[${i}]`);
    }
  }
  for (const locale of Object.keys(VOICES)) {
    const agent = input.auditions.find(a => a.locale === locale);
    const anchor = verified.get(agent.blind_trial_1_azure_path).replace(/<prosody rate="[^"]+">/, '<prosody rate="0%">');
    add(`anchor-${locale.toLowerCase()}`, 'anchor', agent, anchor, `${agent.blind_trial_1_azure_path}:neutral-rate`);
  }
  const plan = { schemaVersion: 1, approvalId: APPROVAL_ID, sourceSha256: sha(verified.get('AUDITION_INPUT.json')), jobs };
  return { ...plan, planSha256: sha(JSON.stringify(plan)), totalUnits: jobs.reduce((n, job) => n + job.units, 0) };
}

export async function validateAccount(account, plan, approvalPath, now = new Date()) {
  account = immutableSnapshot(account); plan = immutableSnapshot(plan); now = Number(now);
  assert(account && account.approvalId === APPROVAL_ID && account.environment === 'development-only', 'ACCOUNT_SCOPE_REQUIRED');
  assert(Array.isArray(account.evidence), 'ACCOUNT_EVIDENCE_REQUIRED');
  const localFiles = await validateLocalFilePaths([approvalPath, ...account.evidence.map(evidence => evidence?.path)]);
  const approvalText = canonical(await fs.readFile(localFiles[0]));
  for (const marker of [`approval_id: ${APPROVAL_ID}`, 'execution_authorized: true', 'aggregate_character_cap: 100000', 'aggregate_all_in_SAR_cap: 10', 'maximum_rounds: 3']) {
    assert(approvalText.includes(marker), 'RECORDED_APPROVAL_REQUIRED');
  }
  const approvalSha256 = sha(approvalText);
  assert(account.approvalDocumentSha256 === approvalSha256 && account.planSha256 === plan.planSha256, 'ATTESTATION_BINDING_MISMATCH');
  const allowed = ['approvalId','environment','approvalDocumentSha256','planSha256','resourceId','region','endpoint','reviewedBy','verifiedAt','validUntil','termsAccepted','pricingConfirmed','feesAndTaxesIncluded','exclusiveAuditionUseConfirmed','voicesConfirmed','allInSarPerMillionUnits','fixedFeeSarPerAttempt','maxNonRequestFeesSar','evidence'];
  assert(Object.keys(account).every(key => allowed.includes(key)), 'ACCOUNT_UNKNOWN_FIELD');
  assert(typeof account.resourceId === 'string' && /^\/subscriptions\/[a-f0-9-]+\/resourceGroups\/[\w.-]+\/providers\/Microsoft\.CognitiveServices\/accounts\/[\w-]+$/i.test(account.resourceId), 'RESOURCE_ID_REQUIRED');
  const endpoint = endpointFor(account.region);
  assert(account.endpoint === endpoint, 'ENDPOINT_NOT_ALLOWED');
  assert(typeof account.reviewedBy === 'string' && account.reviewedBy.trim().length > 1, 'ACCOUNT_REVIEWER_REQUIRED');
  const verifiedAt = Date.parse(account.verifiedAt), validUntil = Date.parse(account.validUntil);
  assert(Number.isFinite(verifiedAt) && Number.isFinite(validUntil) && verifiedAt <= +now && +now < validUntil && +now - verifiedAt <= 86400000 && validUntil - verifiedAt <= 86400000, 'ACCOUNT_EVIDENCE_EXPIRED');
  for (const key of ['termsAccepted','pricingConfirmed','feesAndTaxesIncluded','exclusiveAuditionUseConfirmed','voicesConfirmed']) assert(account[key] === true, 'ACCOUNT_CONFIRMATIONS_REQUIRED');
  assert(money(account.allInSarPerMillionUnits) > 0n, 'ACCOUNT_MAX_RATE_REQUIRED');
  money(account.fixedFeeSarPerAttempt);
  const nonRequest = money(account.maxNonRequestFeesSar);
  assert(nonRequest <= LIMITS.microSar, 'NON_REQUEST_FEES_EXCEED_CAP');
  assert(Array.isArray(account.evidence) && ['account-price-and-fees','account-terms','regional-voices'].every(kind => account.evidence.some(e => e.kind === kind)), 'ACCOUNT_EVIDENCE_REQUIRED');
  for (const [index, evidence] of account.evidence.entries()) {
    assert(evidence && Object.keys(evidence).every(key => ['kind', 'path', 'sha256'].includes(key)) && typeof evidence.path === 'string' && path.isAbsolute(evidence.path) && /^[a-f0-9]{64}$/.test(evidence.sha256), 'ACCOUNT_EVIDENCE_INVALID');
    assert(sha(await fs.readFile(localFiles[index + 1])) === evidence.sha256, 'ACCOUNT_EVIDENCE_HASH_MISMATCH');
  }
  return Object.freeze({ approvalSha256, accountSha256: sha(JSON.stringify(account)), resourceSha256: sha(account.resourceId), endpoint, nonRequestMicros: nonRequest.toString() });
}
async function safeDirectory(directory) {
  await validateLocalDirectoryPath(directory);
  const absolute = path.resolve(directory);
  await fs.mkdir(absolute, { recursive: true, mode: 0o700 });
  let cursor = absolute;
  while (true) {
    assert(!(await fs.lstat(cursor)).isSymbolicLink(), 'SYMLINK_DIRECTORY_FORBIDDEN');
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return fs.realpath(absolute);
}
async function appendEvent(file, event, previousHash) {
  const body = { ...event, previousHash };
  const row = { ...body, hash: sha(JSON.stringify(body)) };
  const handle = await fs.open(file, 'a', 0o600);
  try { await handle.writeFile(JSON.stringify(row) + '\n', 'utf8'); await handle.sync(); } finally { await handle.close(); }
  return row;
}
export async function readJournal(stateRoot, checkedToken) {
  if (checkedToken !== CHECKED_STATE_DIRECTORY) await validateLocalDirectoryPath(stateRoot);
  let text;
  try { text = await fs.readFile(path.join(stateRoot, 'attempts.jsonl'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return []; fail('JOURNAL_READ_FAILED'); }
  assert(text.endsWith('\n'), 'JOURNAL_CORRUPT');
  const events = [];
  let previousHash = null;
  try {
    for (const line of text.slice(0, -1).split('\n')) {
      const row = JSON.parse(line), { hash, ...body } = row;
      assert(row.previousHash === previousHash && hash === sha(JSON.stringify(body)), 'JOURNAL_CORRUPT');
      events.push(row); previousHash = hash;
    }
  } catch { fail('JOURNAL_CORRUPT'); }
  return events;
}
async function withLock(stateRoot, action) {
  const lockPath = path.join(stateRoot, 'execution.lock');
  let lock;
  try { lock = await fs.open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') fail('EXECUTION_LOCKED_MANUAL_REVIEW_IF_STALE'); fail('LOCK_CREATE_FAILED'); }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString(), approvalId: APPROVAL_ID }));
    await lock.sync();
    return await action();
  } finally { await lock.close(); await fs.unlink(lockPath); }
}
async function readAudio(response, controller) {
  assert(['audio/wav', 'audio/x-wav', 'audio/wave', 'application/octet-stream'].includes((response.headers.get('content-type') || '').split(';')[0].toLowerCase()), 'AUDIO_TYPE_INVALID');
  assert(response.body, 'AUDIO_MISSING');
  const reader = response.body.getReader(), chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      assert(total <= 32000000, 'AUDIO_TOO_LARGE'); chunks.push(Buffer.from(value));
    }
  } catch { controller.abort(); fail('AUDIO_READ_FAILED'); }
  const audio = Buffer.concat(chunks);
  assert(audio.length >= 48 && audio.toString('ascii', 0, 4) === 'RIFF' && audio.toString('ascii', 8, 12) === 'WAVE' && audio.readUInt32LE(4) + 8 === audio.length, 'AUDIO_INVALID_RIFF');
  let offset = 12, format = false, data = false;
  while (offset + 8 <= audio.length) {
    const id = audio.toString('ascii', offset, offset + 4), length = audio.readUInt32LE(offset + 4);
    assert(offset + 8 + length <= audio.length, 'AUDIO_INVALID_CHUNK');
    if (id === 'fmt ') {
      assert(length >= 16 && audio.readUInt16LE(offset + 8) === 1 && audio.readUInt16LE(offset + 10) === 1 && audio.readUInt32LE(offset + 12) === 24000 && audio.readUInt16LE(offset + 22) === 16, 'AUDIO_FORMAT_MISMATCH'); format = true;
    }
    if (id === 'data') data = length > 0;
    offset += 8 + length + (length % 2);
  }
  assert(format && data && offset === audio.length, 'AUDIO_INCOMPLETE');
  return audio;
}

export async function runJob({ projectRoot, stateRoot, plan, jobId, round = 1, attempt = 1, account, approvalPath, getCredential, fetchImpl = globalThis.fetch, timeoutMs = 30000, now = new Date() }) {
  plan = immutableSnapshot(plan); account = immutableSnapshot(account); now = new Date(Number(now));
  assert(positiveInteger(round) && round <= LIMITS.rounds && positiveInteger(attempt), 'ROUND_OR_ATTEMPT_INVALID');
  assert(positiveInteger(timeoutMs) && timeoutMs <= 60000, 'TIMEOUT_INVALID');
  const { planSha256, totalUnits, ...planBody } = plan;
  assert(plan.approvalId === APPROVAL_ID && planSha256 === sha(JSON.stringify(planBody)), 'PLAN_INTEGRITY_FAILED');
  const job = plan.jobs.find(item => item.id === jobId);
  assert(job && /^[a-z0-9-]+$/.test(job.id), 'JOB_NOT_IN_PLAN');
  assert(job.units === inspectSsml(job.ssml, job.voice, job.locale) && job.payloadSha256 === sha(job.ssml), 'PAYLOAD_INTEGRITY_FAILED');
  const proof = await validateAccount(account, plan, approvalPath, now);
  const root = path.resolve(projectRoot), storage = path.resolve(stateRoot);
  const relativeStorage = path.relative(root, storage);
  assert(relativeStorage && (relativeStorage.startsWith('..' + path.sep) || path.isAbsolute(relativeStorage)), 'STATE_MUST_BE_OUTSIDE_PROJECT');
  await safeDirectory(storage);
  return withLock(storage, async () => {
    const journal = path.join(storage, 'attempts.jsonl');
    for (const filename of ['attempts.jsonl', 'execution.lock']) assert(!(await fs.lstat(path.join(storage, filename)).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error)))?.isSymbolicLink(), 'SYMLINK_FILE_FORBIDDEN');
    const events = await readJournal(storage, CHECKED_STATE_DIRECTORY);
    if (events.length === 0) assert((await fs.readdir(storage)).every(name => name === 'execution.lock'), 'STATE_WITHOUT_LEDGER_REQUIRES_REVIEW');
    const policy = sha(JSON.stringify({ resource: proof.resourceSha256, endpoint: proof.endpoint, rate: account.allInSarPerMillionUnits, fixed: account.fixedFeeSarPerAttempt, nonRequest: proof.nonRequestMicros }));
    const binding = { approvalId: APPROVAL_ID, approvalSha256: proof.approvalSha256, planSha256, policySha256: policy, resourceSha256: proof.resourceSha256, endpoint: proof.endpoint, region: account.region, nonRequestMicros: proof.nonRequestMicros };
    let previousHash = events.at(-1)?.hash || null;
    if (events.length === 0) {
      const first = await appendEvent(journal, { type: 'binding', ...binding }, null);
      events.push(first); previousHash = first.hash;
    }
    const { hash: headerHash, previousHash: headerPrevious, type: headerType, ...headerBinding } = events[0];
    assert(headerType === 'binding' && JSON.stringify(headerBinding) === JSON.stringify(binding), 'LEDGER_BINDING_MISMATCH');
    let spentUnits = 0, spentMicros = BigInt(proof.nonRequestMicros);
    const reservations = new Map(), completions = new Map();
    for (const event of events.slice(1)) {
      if (event.type === 'reservation') {
        const source = plan.jobs.find(item => item.id === event.jobId);
        assert(source && event.attemptKey === `${event.round}:${event.jobId}:${event.attempt}` && positiveInteger(event.round) && event.round <= 3 && positiveInteger(event.attempt) && !reservations.has(event.attemptKey) && event.units === source.units && event.payloadSha256 === source.payloadSha256 && event.costMicros === maximumCostMicros(source.units, account.allInSarPerMillionUnits, account.fixedFeeSarPerAttempt).toString(), 'JOURNAL_RESERVATION_INVALID');
        spentUnits += event.units; spentMicros += BigInt(event.costMicros); reservations.set(event.attemptKey, event);
      } else if (event.type === 'result') {
        assert(reservations.has(event.attemptKey) && !completions.has(event.attemptKey) && ['audio_saved', 'http_failure', 'unknown'].includes(event.status), 'JOURNAL_RESULT_INVALID');
        completions.set(event.attemptKey, event);
      } else fail('JOURNAL_EVENT_INVALID');
    }
    assert(spentUnits <= LIMITS.units && spentMicros <= LIMITS.microSar, 'EXISTING_LEDGER_EXCEEDS_CAP');
    const permittedFiles = new Set(['attempts.jsonl', 'execution.lock']);
    for (const event of reservations.values()) { permittedFiles.add(`${event.payloadSha256}.ssml.xml`); permittedFiles.add(`${event.round}-${event.jobId}-${event.attempt}.wav`); }
    assert((await fs.readdir(storage)).every(name => permittedFiles.has(name)), 'UNACCOUNTED_STATE_ARTIFACT_REQUIRES_REVIEW');
    const attemptKey = `${round}:${job.id}:${attempt}`;
    if (reservations.has(attemptKey)) {
      const prior = completions.get(attemptKey);
      if (prior?.status === 'audio_saved') {
        assert(prior.audioFile === `${round}-${job.id}-${attempt}.wav` && sha(await fs.readFile(path.join(storage, prior.audioFile)).catch(() => fail('SAVED_AUDIO_MISSING'))) === prior.audioSha256, 'SAVED_AUDIO_CHANGED');
        return { ...prior, resumed: true, attemptedNetwork: false };
      }
      return { status: prior?.status || 'unknown', code: 'PRIOR_ATTEMPT_REQUIRES_REVIEW_NO_RETRY', attemptKey, resumed: true, attemptedNetwork: false };
    }
    const cost = maximumCostMicros(job.units, account.allInSarPerMillionUnits, account.fixedFeeSarPerAttempt);
    assert(spentUnits + job.units <= LIMITS.units, 'AGGREGATE_CHARACTER_CAP');
    assert(spentMicros + cost <= LIMITS.microSar, 'AGGREGATE_BUDGET_CAP');
    assert(typeof getCredential === 'function', 'SECURE_CREDENTIAL_READER_REQUIRED');
    let secret;
    try { secret = await getCredential(proof.resourceSha256); } catch { fail('SECURE_CREDENTIAL_UNAVAILABLE'); }
    assert(typeof secret === 'string' && /^[A-Za-z0-9+/_=-]{16,512}$/.test(secret), 'CREDENTIAL_FORMAT_INVALID');
    const reservation = await appendEvent(journal, { type: 'reservation', attemptKey, round, attempt, jobId: job.id, units: job.units, costMicros: cost.toString(), payloadSha256: job.payloadSha256, voice: job.voice, accountSha256: proof.accountSha256, reservedAt: new Date().toISOString() }, previousHash);
    previousHash = reservation.hash;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    let attemptedNetwork = false;
    let result = { type: 'result', attemptKey, status: 'unknown', code: 'REQUEST_OUTCOME_UNKNOWN' };
    try {
      const inputFile = path.join(storage, `${job.payloadSha256}.ssml.xml`);
      try { const snapshot = await fs.open(inputFile, 'wx', 0o600); try { await snapshot.writeFile(job.ssml, 'utf8'); await snapshot.sync(); } finally { await snapshot.close(); } }
      catch (error) { if (error.code !== 'EEXIST' || sha(await fs.readFile(inputFile)) !== job.payloadSha256) fail('INPUT_SNAPSHOT_FAILED'); }
      attemptedNetwork = true;
      const response = await fetchImpl(proof.endpoint, { method: 'POST', redirect: 'manual', signal: controller.signal, headers: { 'Ocp-Apim-Subscription-Key': secret, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm', 'User-Agent': 'Primora-Development-Audition/1' }, body: job.ssml });
      if (response.status !== 200) {
        result = { ...result, status: response.status >= 300 && response.status < 400 ? 'unknown' : 'http_failure', code: response.status >= 300 && response.status < 400 ? 'REDIRECT_REFUSED' : 'HTTP_FAILURE', httpStatus: response.status };
      } else {
        assert(!response.redirected && (!response.url || response.url === proof.endpoint), 'RESPONSE_ENDPOINT_CHANGED');
        const audio = await readAudio(response, controller);
        const audioFile = `${round}-${job.id}-${attempt}.wav`, handle = await fs.open(path.join(storage, audioFile), 'wx', 0o600);
        try { await handle.writeFile(audio); await handle.sync(); } finally { await handle.close(); }
        result = { ...result, status: 'audio_saved', code: 'SYNTHESIS_FILE_SAVED_NOT_NATIVE_ACCEPTANCE', httpStatus: 200, audioFile, audioSha256: sha(audio), audioBytes: audio.length };
      }
    } catch { /* The reservation remains charged at its maximum bound; never log provider errors. */ }
    finally { clearTimeout(timer); secret = undefined; }
    const receipt = await appendEvent(journal, { ...result, completedAt: new Date().toISOString(), reservedUnits: job.units, reservedCostMicros: cost.toString(), unitsRemaining: LIMITS.units - spentUnits - job.units, microSarRemaining: (LIMITS.microSar - spentMicros - cost).toString() }, previousHash);
    return { ...receipt, attemptedNetwork };
  });
}
export function defaultStateRoot() {
  assert(process.platform === 'win32' && process.env.LOCALAPPDATA, 'WINDOWS_LOCALAPPDATA_REQUIRED');
  return localFileSyntax(path.join(process.env.LOCALAPPDATA, 'Primora', 'VolabiAuditions', APPROVAL_ID));
}
export function credentialReaderArgs(resourceSha256) {
  assert(typeof resourceSha256 === 'string' && /^[a-f0-9]{64}$/.test(resourceSha256), 'CREDENTIAL_RESOURCE_BINDING_REQUIRED');
  return ['-NoProfile', '-NonInteractive', '-File', path.join(path.dirname(fileURLToPath(import.meta.url)), 'credential.ps1'), '-Mode', 'InternalRead', '-ResourceSha256', resourceSha256];
}
async function readCredential(resourceSha256) {
  assert(process.platform === 'win32', 'WINDOWS_DPAPI_REQUIRED');
  try {
    const { stdout } = await promisify(execFile)('powershell.exe', credentialReaderArgs(resourceSha256), { windowsHide: true, maxBuffer: 2048, timeout: 15000 });
    return stdout.trim();
  } catch { fail('SECURE_CREDENTIAL_UNAVAILABLE'); }
}
async function main() {
  const args = process.argv.slice(2), mode = args.shift() || 'plan';
  assert(['plan', 'preflight', 'status', 'setup-key', 'execute'].includes(mode), 'MODE_INVALID');
  const options = {};
  while (args.length) {
    const key = args.shift(); assert(['--account', '--job', '--round', '--attempt', '--confirm'].includes(key) && args.length && !options[key], 'ARGUMENT_INVALID'); options[key] = args.shift();
  }
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const plan = await loadPlan(projectRoot);
  if (mode === 'plan') {
    console.log(JSON.stringify({ approvalId: APPROVAL_ID, planSha256: plan.planSha256, network: 'none', unitsBasis: 'full immutable UTF-8 SSML bytes; conservative overcount', limits: { units: LIMITS.units, rounds: 3, microSar: LIMITS.microSar.toString() }, firstPassUnits: plan.totalUnits, jobs: plan.jobs.map(({ ssml, ...metadata }) => metadata), executionHolds: ['Account-specific maximum all-in price/fees and terms evidence', 'Fresh regional candidate availability', 'Masked local credential setup', 'Native listening and distinct identity acceptance remain pending'] }, null, 2)); return;
  }
  const stateRoot = defaultStateRoot();
  if (mode === 'preflight') {
    assert(options['--account'], 'ACCOUNT_FILE_REQUIRED');
    const account = await readAccountFile(options['--account']);
    const proof = await validateAccount(account, plan, path.join(projectRoot, APPROVAL_FILE));
    console.log(JSON.stringify({ status: 'account_evidence_validated_offline', planSha256: plan.planSha256, ...proof, network: 'none', credentialRead: false, notice: 'Attested bounds and evidence hashes are checked; account terms and quote authenticity still require operator verification.' }, null, 2)); return;
  }
  if (mode === 'status') { console.log(JSON.stringify({ approvalId: APPROVAL_ID, events: await readJournal(stateRoot), network: 'none' }, null, 2)); return; }
  if (mode === 'setup-key') {
    assert(options['--confirm'] === APPROVAL_ID && options['--account'], 'EXPLICIT_CREDENTIAL_SETUP_CONFIRMATION_REQUIRED');
    const account = await readAccountFile(options['--account']);
    const proof = await validateAccount(account, plan, path.join(projectRoot, APPROVAL_FILE));
    const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), 'credential.ps1');
    const child = spawn('powershell.exe', ['-NoProfile', '-File', helper, '-Mode', 'Store', '-ResourceSha256', proof.resourceSha256, '-ResourceId', account.resourceId], { windowsHide: true, stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => { child.on('error', () => reject(new Error('CREDENTIAL_SETUP_FAILED'))); child.on('close', resolve); });
    assert(code === 0, 'CREDENTIAL_SETUP_FAILED'); return;
  }
  assert(options['--confirm'] === APPROVAL_ID && options['--account'] && options['--job'], 'EXPLICIT_EXECUTION_CONFIRMATION_REQUIRED');
  const account = await readAccountFile(options['--account']);
  const result = await runJob({ projectRoot, stateRoot, plan, jobId: options['--job'], round: Number(options['--round'] || 1), attempt: Number(options['--attempt'] || 1), account, approvalPath: path.join(projectRoot, APPROVAL_FILE), getCredential: readCredential });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'audio_saved') process.exitCode = 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(/^[A-Z0-9_]+$/.test(error.message) ? error.message : 'PREFLIGHT_OR_LOCAL_IO_FAILED'); process.exitCode = 1; });
