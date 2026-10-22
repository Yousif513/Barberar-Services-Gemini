export type HqLocale = "en" | "ar";
export type HqView = "overview" | "tasks" | "task" | "decisions" | "decision" | "sources" | "source" | "agents" | "agent";
export interface HqSession { workspaceId: string; actorId: string; actorLabel: string; csrfToken: string; mode: "local-development"; employeesActive: false; }
export type HqCommandType = "task.create" | "task.revise" | "recommendation.prepare" | "recommendation.publish" | "decision.record" | "followup.record" | "source.add" | "source.correct" | "proposal.create";
export interface HqCommand { commandId: string; type: HqCommandType; expectedRevision?: number; payload: Record<string, unknown>; }
export interface HqReceipt { commandId: string; type: HqCommandType; entityType: string; entityId: string; revision: number; recordIds: {taskId?: string; recommendationId?: string; decisionId?: string; sourceId?: string; followupId?: string}; effect: "record-only"; recordedAt: string; }
export interface HqList<T> { items: T[]; total: number; page: number; pageSize: number; }
export interface HqTask { id: string; revision: number; title: string; request: string; outcome: string; acceptance: string; ownerId: string; reviewerId: string; limits: string; status: string; sourceIds: string[]; currentRecommendationId: string | null; createdAt: string; updatedAt: string; }
export interface HqCitation { sourceId: string; version: number; sha256: string; start: number; end: number; quote: string; }
export interface HqRecommendation { id: string; taskId: string; taskRevision: number; hash: string; title: string; summary: string; nextStep: string; author: {id: string; label: string}; mode: "evidence-preparation" | "authored-development"; citations: HqCitation[]; createdAt: string; decisionId: string; }
export interface HqDecision { id: string; taskId: string; taskRevision: number; recommendationId: string; recommendationHash: string; status: string; reason: string | null; scope: {environment: "local"; effects: string[]; employeeActivation: false; businessPermissions: false; financialExecution: false}; createdAt: string; decidedAt: string | null; actorId: string | null; }
export interface HqSource { id: string; version: number; title: string; body: string; sha256: string; provenance: {uri: string; locator: string; authorKind: string; status: string; recoveredAt?: string}; createdAt: string; }
export interface HqFollowup { id: string; taskId: string; decisionId: string; note: string; nextAction: string; status: "recorded"; actorId: string; createdAt: string; }
export interface HqEvent { id: string; seq: number; action: string; targetType: string; targetId: string; actorId: string; commandId: string; at: string; details: Record<string, unknown>; }
export interface HqSkill { id: string; name: string; version: string | null; sha256: string | null; path: string; installed: boolean; bindingStatus: string; evidenceStatus: string; permissions: string[]; description?: string; }
export interface HqAgent { id: string; name: string; role: string; roleAr?: string; sourcePrompt: string; activationStatus: "inactive"; skills: HqSkill[]; persona: Record<string, unknown>; portrait: {src: string | null; status: string; provenance: unknown}; voice: {sampleUrl?: string | null; language?: string; status?: string; rate?: number; pitch?: number; [key: string]: unknown}; functions: unknown[]; }
export interface HqOverview { counts: {tasks: number; pendingDecisions: number; sources: number; followups: number}; tasks: HqTask[]; decisions: HqDecision[]; agents: HqAgent[]; mode: "local-development"; }
export interface HqTaskDetail { task: HqTask; recommendations: HqRecommendation[]; decisions: HqDecision[]; sources: HqSource[]; followups: HqFollowup[]; events: HqEvent[]; }
export interface HqDecisionDetail { decision: HqDecision; recommendation: HqRecommendation; task: HqTask; sources: HqSource[]; events: HqEvent[]; }
export interface HqSourceDetail { source: HqSource; versions: HqSource[]; affectedTasks: HqTask[]; events: HqEvent[]; }
export interface HqAgentDetail { agent: HqAgent; skills: HqSkill[]; relatedTasks: HqTask[]; events: HqEvent[]; }
