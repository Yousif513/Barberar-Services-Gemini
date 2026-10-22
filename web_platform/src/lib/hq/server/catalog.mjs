import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { hash } from "./local-boundary.mjs";
const json = p => JSON.parse(readFileSync(p,"utf8"));
export function loadCatalog(root) {
  const dir=path.join(root,"planning/volabi");
  const people=json(path.join(dir,"persona-and-skills/PERSONA_REGISTRY.json")).profiles;
  const functions=json(path.join(dir,"persona-and-skills/ROLE_AND_FUNCTION_SKILL_MAP.json")).functions;
  const originals=json(path.join(dir,"AGENT_PROFILE_CONTRACTS.json")).profiles;
  const rolesAr={nora:"رئيسة مكتب الرئيس التنفيذي",adam:"مستشار الاستراتيجية المستقل",alexander:"المدير العام",sarah:"مديرة العمليات",victoria:"مديرة تطوير الأعمال",emma:"مديرة تجربة العملاء",maya:"مديرة المنتج وتجربة المستخدم",ethan:"مدير التقنية",daniel:"مدير المالية",sophia:"مديرة التسويق",layla:"مديرة الامتثال",omar:"مسؤول الضمان المستقل",olivia:"مديرة القوى العاملة",lina:"مساعدة العملاء",rayan:"مدرب الصالون"};
  const allSkills=new Map();
  const packageRecord=s=>{
    const id=s.skill||s.name;let file=s.path;
    // New packages may be installed after staging. Verify actual bytes instead of trusting a staged claim.
    const globalPath=path.join(process.env.USERPROFILE||"", ".codex/skills", id, "SKILL.md");
    if(existsSync(globalPath))file=globalPath;
    const installed=!!file&&existsSync(file)&&!file.includes(`${path.sep}staged-skills${path.sep}`);
    const body=file&&existsSync(file)?readFileSync(file,"utf8"):null;
    const version=body?.match(/^  version:\s*["']?([^"'\r\n]+)/m)?.[1]?.trim()||s.declared_version||s.source_version||null;
    const description=body?.match(/^description:\s*(.+)/m)?.[1]||"";
    const value={id,name:id,version,sha256:body?hash(body):null,path:file||"",installed,bindingStatus:"proposed_not_assigned",evidenceStatus:"not_established_for_agent_task_version",permissions:[],description};
    allSkills.set(id,value);return value;
  };
  const agents=people.map(p=>{
    const old=originals.find(a=>a.name.toLowerCase()===p.agent_id);
    const byId=new Map([...(old?.skills||[]),...p.proposed_skills].map(s=>[s.name||s.skill,s]));
    const skills=[...byId.values()].map(packageRecord);
    const portraitFile=path.join(root,"web_platform/public/volabi/agents",`${p.agent_id}.png`);
    const sampleFile=path.join(root,"web_platform/public/volabi/voices",`${p.agent_id}-en.wav`);
    return {id:p.agent_id,name:p.display_name,role:p.role,roleAr:rolesAr[p.agent_id],sourcePrompt:old?.source_prompt||"P164",activationStatus:"inactive",skills,
      persona:{...p.character,readiness:p.readiness,meetingParticipation:p.meeting_participation,appearancePreferences:p.appearance_preferences||null},
      portrait:{src:existsSync(portraitFile)?`/volabi/agents/${p.agent_id}.png`:null,status:existsSync(portraitFile)?"original_synthetic_proposed_portrait":"production_asset_pending",provenance:{sourceReference:p.portrait?.source_reference||null,production:existsSync(portraitFile)?{sha256:hash(readFileSync(portraitFile)),kind:"original-generated-persona",businessActivation:false}:null}},
      voice:{...p.voice,auditionScript:p.audition_script,sampleUrl:existsSync(sampleFile)?`/volabi/voices/${p.agent_id}-en.wav`:null,language:"en",status:existsSync(sampleFile)?"offline_english_prosody_preview_two_base_engines":"not_configured",arabicStatus:"no_local_arabic_voice_installed",liveConversation:"not_configured",rate:1,pitch:1},
      functions:functions.filter(f=>f.proposed_area?.toLowerCase()===p.agent_id||p.original_function_links.includes(f.id))};
  });
  const initialSources=[];
  const add=(file,title,status,authorKind="repository-record")=>{const body=readFileSync(path.join(root,file),"utf8");initialSources.push({title,body,provenance:{uri:`repo:${file}`,locator:"complete UTF-8 file",authorKind,status,recoveredAt:"2026-10-22"}});};
  add("planning/volabi/APPROVAL_20261022.md","CEO development approval and authority holds","approved-development-scope","human-approval-record");
  add("planning/volabi/DESIGN.md","Approved Volabi visual direction","approved-development-design");
  add("docs/legal/2026-10-10-adopted-decisions.md","Conditional adopted legal and financial decisions","conditional-adopted-decisions");
  add("docs/volabi-finance-refund-gaps.md","Finance and refund verified gaps","development-analysis");
  const excerpts=json(path.join(dir,"persona-and-skills/FINANCE_CONTROL_SOURCE_EXCERPTS.json"));
  for(const s of excerpts.records){
    if(hash(s.excerpt_utf8)!==s.excerpt_sha256)throw new Error("Source excerpt integrity mismatch");
    initialSources.push({title:`${s.id}: ${s.note}`.slice(0,180),body:s.excerpt_utf8,provenance:{uri:s.source_uri,locator:JSON.stringify(s.locator).slice(0,200),authorKind:s.author_kind,status:s.status,recoveredAt:s.observed_on}});
  }
  return {agents,skills:[...allSkills.values()],initialSources};
}
