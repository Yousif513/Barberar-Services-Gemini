import { test, after } from "node:test";
import assert from "node:assert/strict";
let unexpectedNetwork = 0;
globalThis.fetch = async () => { unexpectedNetwork++; throw new Error("HQ voice must not use a remote transport"); };
after(() => assert.equal(unexpectedNetwork, 0));
const voice = () => import("../src/lib/hq/voice.ts");
test("voice choices expose only installed local voices for the selected language", async () => {
  const { localVoiceChoices } = await voice();
  const voices=[{name:"Local Arabic",voiceURI:"local-ar",lang:"ar-SA",localService:true},{name:"Remote Arabic",voiceURI:"remote-ar",lang:"ar-SA",localService:false},{name:"Local English",voiceURI:"local-en",lang:"en-GB",localService:true}];
  assert.deepEqual(localVoiceChoices(voices,"ar").map(v=>v.voiceURI),["local-ar"]);
  assert.deepEqual(localVoiceChoices(voices,"en").map(v=>v.voiceURI),["local-en"]);
});
test("speech refuses a remote or stale voice before starting any utterance", async () => {
  const { speakLocally } = await voice();
  let speaks=0;const synthesis={getVoices:()=>[],speak:()=>speaks++,cancel:()=>{}};
  class Utterance {constructor(text){this.text=text;}}
  assert.throws(()=>speakLocally(synthesis,Utterance,{localService:false,voiceURI:"remote"},"private notes"));
  assert.throws(()=>speakLocally(synthesis,Utterance,{localService:true,voiceURI:"missing"},"private notes"));
  assert.equal(speaks,0);
});
test("explicit local audition uses the selected installed voice and exact authored text", async () => {
  const { speakLocally } = await voice();
  const chosen={localService:true,voiceURI:"local",lang:"en-US"};const spoken=[];
  class Utterance {constructor(text){this.text=text;}}
  speakLocally({getVoices:()=>[chosen],speak:u=>spoken.push(u),cancel:()=>{}},Utterance,chosen,"Authored audition");
  assert.equal(spoken.length,1);assert.equal(spoken[0].voice,chosen);assert.equal(spoken[0].text,"Authored audition");
});
for(const availability of ["unavailable","downloadable","downloading"])test(`${availability} dictation never installs a pack or constructs a recorder`,async()=>{
  const { createLocalRecognizer } = await voice();let constructed=0,installed=0;
  class Recognition {constructor(){constructed++;this.processLocally=false;}static async available(options){assert.equal(options.processLocally,true);return availability;}static install(){installed++;}}
  await assert.rejects(createLocalRecognizer(Recognition,"ar"));assert.equal(constructed,0);assert.equal(installed,0);
});
test("dictation requires explicit on-device support and an already available language",async()=>{
  const { createLocalRecognizer } = await voice();
  class Unsupported {static async available(){return "available";}}
  await assert.rejects(createLocalRecognizer(Unsupported,"en"));
  class Local {constructor(){this.processLocally=false;}static async available(options){assert.deepEqual(options,{langs:["ar-SA"],processLocally:true});return "available";}}
  const recognition=await createLocalRecognizer(Local,"ar");assert.equal(recognition.processLocally,true);assert.equal(recognition.lang,"ar-SA");assert.equal(recognition.continuous,false);
});
