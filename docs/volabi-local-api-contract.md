# Volabi local API contract - approved development slice

Root owns API/server storage. UI worker owns client contracts and interfaces. All company identities remain inactive. Existing financial/admin approvals and Supabase roles are never reused. Runtime uses Node24.15 built-in SQLite, a loopback-only enabled preview process, persistent local sessions/workspaces and record-only commands. No model/provider/financial executor exists in this mode.

## HTTP

POST /api/hq/session with JSON{} and same-origin Origin; returns {ok:true,session:{workspaceId,actorId,actorLabel,csrfToken,mode:"local-development",employeesActive:false}} and HttpOnly SameSite=Strict local session cookie. Reuse existing valid cookie on reload/restart. No actor input accepted.

GET /api/hq/state?view=overview|tasks|task|decisions|decision|sources|source|agents|agent with optional id,q,status,page. Returns {ok:true,data:...}. Same-origin credentials; private no-store. Lists pageSize25, page0based, {items,total,page,pageSize}. Overview returns {counts:{tasks,pendingDecisions,sources,followups},tasks:[latest5],decisions:[pending5],agents:[15],mode:"local-development"}. Tasks/decisions/sources are list responses. Task detail returns {task,recommendations,decisions,sources,followups,events}; decision detail {decision,recommendation,task,sources,events}; source detail {source,versions,affectedTasks,events}; agents list {items:[all15],total:15,page:0,pageSize:25}; agent detail {agent,skills,relatedTasks,events}. Query uses same workspace only; inaccessible ID returns not_found, never foreign data.

POST /api/hq/commands body {commandId:UUID,type,expectedRevision?:number,payload:object}, credentials and x-hq-csrf session token. Returns {ok:true,receipt:{commandId,type,entityType,entityId,revision,recordIds:{taskId?,recommendationId?,decisionId?,sourceId?,followupId?},effect:"record-only",recordedAt}}. GET /api/hq/commands/[commandId] recovers the SAME receipt,404 if not observed. Same command+same payload replay has one effect; changed payload409command_conflict. Client keeps the command identity and draft through timeout/unknown receipt; it must not silently generate a new command on retry. Recover before resubmitting the identical command. All mutation receipt fields are server checked.

Errors {ok:false,error:{code,message}} with HTTP400invalid_input,401session_required,403local_disabled|origin_forbidden|csrf_failed,404not_found,409stale_revision|stale_recommendation|stale_source|command_conflict|invalid_transition,413request_too_large,503storage_unavailable. UI translates codes; never presents raw server stack/paths. Missing credential/disabled local mode is a named closed state, not fake dashboard data.

## Records

Task: {id,revision,title,request,outcome,acceptance,ownerId,reviewerId,limits,status,sourceIds,currentRecommendationId,createdAt,updatedAt}. Status requested,awaiting_decision,changes_requested,approved_for_followup,declined,followup_recorded. Owners are proposed inactive agent slugs or development-preparer; ownership does not dispatch an employee.

Recommendation: {id,taskId,taskRevision,hash,title,summary,nextStep,author:{id,label},mode:"evidence-preparation"|"authored-development",citations:[{sourceId,version,sha256,start,end,quote}],createdAt,decisionId}. Automatically prepared output is labelled local source brief by development preparer, never generative employee reasoning. Authored development recommendations can be submitted with validated exact source quotes.

Decision: {id,taskId,taskRevision,recommendationId,recommendationHash,status:"pending"|"approved"|"declined"|"changes_requested"|"superseded",reason,scope:{environment:"local",effects:["record-only"],employeeActivation:false,businessPermissions:false,financialExecution:false},createdAt,decidedAt,actorId}. A pending decision is created with each persisted recommendation. Decision binds exact recommendation hash/task revision/source versions. No business command follows approval automatically.

Source: {id,version,title,body,sha256,provenance:{uri,locator,authorKind,status,recoveredAt},createdAt}. Versions preserve exact bytes/hash. Source identity includes URI+locator; title is not identity. New user intake is current-session/proposed, never automatically authoritative. Correction appends a proposed version and preserves prior bytes; changed source version invalidates approval of older recommendation. UI must show proposed status, not imply the correction was adopted as company policy.

Followup: {id,taskId,decisionId,note,nextAction,status:"recorded",actorId,createdAt}. Records factual local follow-up only, never business completion.

Event: {id,seq,action,targetType,targetId,actorId,commandId,at,details}. Immutable app audit; details contain IDs/revisions/hashes, never copied requests/source/financial contact text. Audit history has no delete or edit operation.

Agent: {id,name,role,roleAr?,sourcePrompt,activationStatus:"inactive",skills:[skill records],persona:{...},portrait:{src,status,provenance},voice:{sampleUrl,language,status,rate,pitch,...},functions:[...]}. Exact persona fields supplied by source registry; optional presentation proposals explicitly labelled. Skill record {id,name,version,sha256,path,installed,bindingStatus:"proposed",evidenceStatus,permissions:[],description?}. Missing package/evidence/dependency/access dimensions stay distinct. No score fabricated. Catalog derives from verified actual skill files and role maps.

## Commands

- task.create: {title,request,outcome,acceptance,ownerId,reviewerId,limits,sourceIds}. Returns taskId.
- task.revise: {taskId,title?,request?,outcome?,acceptance?,ownerId?,reviewerId?,limits?,sourceIds?}; expectedRevision=task.revision. Retains old revisions, supersedes old pending recommendation decision, requires new recommendation.
- recommendation.prepare: {taskId}; expectedRevision=task.revision. Uses attached local source snapshots and creates source-linked development brief + pending decision. No external model/employee call.
- recommendation.publish: {taskId,title,summary,nextStep,citations}; expectedRevision=task.revision. Exact source ranges/hashes validated; creates pending decision with immutable hash.
- decision.record: {decisionId,recommendationHash,choice:"approve"|"decline"|"request_changes",reason}; expectedRevision=decision.taskRevision. Returns decisionId/taskId. Blocks stale task, recommendation or source; reason retained after refusal.
- followup.record: {taskId,decisionId,note,nextAction}; expectedRevision=task.revision. Requires current decided proposal; returns followupId/taskId.
- source.add: {title,body,provenance:{uri,locator,authorKind,status}}. URI is metadata only, never fetched; plain text intake. Returns sourceId.
- source.correct: {sourceId,body,reason}; expectedRevision=source.version. Appends proposed correction version; preserves old citations and reports affected tasks. Returns sourceId/version.
- proposal.create: {kind:"skill-change"|"evaluation"|"meeting",agentId,skillId?,change?,versionOrHash?,reason,plan,limits,sourceIds}. Creates persistent task + local source-linked recommendation + pending decision for exact request. Approval records decision only; no package install, binding/tool grant, evaluation runner, invitation, recording or stakeholder participation.

Source attachment reuses task.revise and opens new task revision, never edits immutable recommendation citations in place. Filtering/readiness/evaluation history are real reads of source/profile/evidence state. No submit surface promises an unsupported executor.

## Local speech/presence

Individual new original PNG portraits at /volabi/agents/{id}.png; English local voice samples at /volabi/voices/{id}-en.wav, with source/runtime metadata. Root is producing them; do not substitute unknown source portrait references. Voice preview must say synthetic/local sample. Dynamic readout uses only localService speech voices; unsupported is explicit. Optional dictation uses on-device recognition only when both installed availability and processLocally are proven; no remote fallback/pack download/audio upload. Root adjusts /hq-only microphone policy if supported, camera remains off. Meeting preparation creates a task/agenda/attendee proposal; live employees, external invitations/meeting services and recording remain held.
