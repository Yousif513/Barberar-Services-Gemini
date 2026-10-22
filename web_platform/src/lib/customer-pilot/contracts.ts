import type {PilotLocale} from "./copy";
export interface PilotSession {workspaceId:string;csrf:string;expiresAt:string;}
export interface PilotStaff {id:string;name:string;}
export interface PilotService {id:string;name:string;durationMinutes:number;priceCents:number;staff:PilotStaff[];}
export interface PilotCatalog {id:string;versionHash:string;sourceTitle:string;sourceReference:string;observedAt:string;importedAt:string;providerId:string;providerName:string;services:PilotService[];current:boolean;}
export interface PilotRequest {id:string;sourceId:string;catalogHash:string;providerId:string;providerName:string;service:Omit<PilotService,"staff">;staff:PilotStaff;requestedDate:string;requestedTime:string;timeZone:"Asia/Riyadh";notes:string;status:"local_request";paymentStatus:"not_dispatched";createdAt:string;createdLocale:PilotLocale;source:{title:string;reference:string;observedAt:string};}
export type PilotCaseKind="inquiry"|"change"|"cancellation"|"refund"|"complaint";
export interface PilotCaseNote {id:string;kind:"note"|"appeal";text:string;createdAt:string;}
export interface PilotCase {id:string;requestId:string;kind:PilotCaseKind;reason:string;evidence:string;status:"local_case_recorded";createdAt:string;revision:number;followUps:PilotCaseNote[];}
export interface PilotAudit {id:number;entityType:"catalog"|"request"|"case";entityId:string;action:string;createdAt:string;previousHash:string;eventHash:string;}
export interface PilotState {session:PilotSession;catalogs:PilotCatalog[];requests:PilotRequest[];cases:PilotCase[];events:PilotAudit[];limits:{catalogs:number;requests:number;cases:number;events:number};}
export type PilotCommandType="import-source"|"record-request"|"open-case"|"append-case-note";
export interface PilotCommand {commandId:string;type:PilotCommandType;payload:Record<string,unknown>;locale:PilotLocale;}
export interface PilotPending {workspaceId:string;command:PilotCommand;}
export interface PilotReceipt {commandId:string;type:PilotCommandType;entityId:string;recordedAt:string;status:"recorded_local";}
export interface PilotDraft {workspaceId:string;sourceId:string;catalogHash:string;serviceId:string;staffId:string;requestedDate:string;requestedTime:string;notes:string;importText:string;selectedRequestId:string;caseKind:PilotCaseKind;caseReason:string;caseEvidence:string;selectedCaseId:string;appendKind:"note"|"appeal";appendText:string;}
