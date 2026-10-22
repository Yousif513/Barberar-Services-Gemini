import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLocalRequest, readLocalCookie, csrfForSession, checkCsrf, canonical } from "../src/lib/hq/server/local-boundary.mjs";
const env = { VOLABI_LOCAL_MODE: "enabled" };
const req = (changes = {}) => new Request("http://127.0.0.1:3113/api/hq/session", { method:"POST", headers:{ host:"127.0.0.1:3113", origin:"http://127.0.0.1:3113", ...changes } });
test("local development mode is explicit and never enabled on Vercel", () => {
  for (const config of [{},{VOLABI_LOCAL_MODE:"true"},{...env,VERCEL:"1"}]) assert.throws(() => checkLocalRequest(req(),config), e => e.code === "local_disabled");
});
test("cross-origin, missing Origin and rebinding hosts cannot open a local seat", () => {
  for (const headers of [{origin:"https://outside.invalid"},{origin:""},{host:"outside.invalid"},{host:"localhost:3113"},{"sec-fetch-site":"cross-site"}]) assert.throws(() => checkLocalRequest(req(headers),env), e => e.code === "origin_forbidden");
});
test("matching loopback request passes without consulting marketplace roles", () => {
  assert.equal(checkLocalRequest(req(),env).hostname,"127.0.0.1");
  assert.throws(() => checkLocalRequest(new Request("http://172.22.0.1:3113/api/hq/session",{method:"POST",headers:{host:"172.22.0.1:3113",origin:"http://172.22.0.1:3113"}}),env),e=>e.code==="origin_forbidden");
});
test("session cookie cannot be replaced by a marketplace bearer or duplicate ambiguous cookie", () => {
  const token="a".repeat(64);
  assert.equal(readLocalCookie(req({authorization:"Bearer marketplace-token"})),null);
  assert.equal(readLocalCookie(req({cookie:`volabi_session=${token}; volabi_session=${token}`})),null);
  assert.equal(readLocalCookie(req({cookie:`volabi_session=${token}`})),token);
  assert.equal(readLocalCookie(req({cookie:"volabi_session=malformed"})),null);
});
test("CSRF requires the actual session-bound value and rejects missing, foreign and malformed tokens", () => {
  const token="a".repeat(64), csrf=csrfForSession(token);
  checkCsrf(token,csrf);
  for (const value of [null,"",csrfForSession("b".repeat(64)),"z".repeat(64)]) assert.throws(()=>checkCsrf(token,value),e=>e.code==="csrf_failed");
});
test("material payload hash canonicalization ignores object order, never material values or array order", () => {
  assert.equal(canonical({b:2,a:{d:4,c:3}}),canonical({a:{c:3,d:4},b:2}));
  assert.notEqual(canonical({a:[1,2]}),canonical({a:[2,1]}));
  assert.notEqual(canonical({amount:2}),canonical({amount:3}));
});
