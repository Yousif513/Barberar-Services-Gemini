// Offline test subprocess: never accepts or reads an actual credential.
import { promises as fs } from 'node:fs';
import { runJob } from './runner.mjs';
globalThis.fetch = () => { throw Error('LIVE_NETWORK_FORBIDDEN_IN_TESTS'); };
const input = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
try {
  const result = await runJob({ ...input, now: new Date(input.now), getCredential: async () => 'OFFLINE_TEST_CREDENTIAL_ONLY_0123456789', fetchImpl: async () => {
    await fs.writeFile(input.startedFile, 'reserved-before-fake-provider');
    await new Promise(resolve => setTimeout(resolve, input.holdMs || 500));
    return new Response(Buffer.from(input.audioBase64, 'base64'), { status: 200, headers: { 'content-type': 'audio/wav' } });
  } });
  console.log(result.status);
} catch (error) { console.log(/^[A-Z0-9_]+$/.test(error.message) ? error.message : 'OFFLINE_TEST_ERROR'); process.exitCode = 3; }
