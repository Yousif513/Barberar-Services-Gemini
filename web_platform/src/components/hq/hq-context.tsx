"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { accessCopy } from "@/lib/hq/access-copy";
import { safeHqReturn } from "@/lib/hq/access-client";
import { usePageLocale } from "@/lib/use-page-locale";
import { HqApiError, loadHqState, openHqSession, submitHqCommand } from "@/lib/hq/client";
import type { HqCommand, HqCommandType, HqEvent, HqLocale, HqReceipt, HqSession, HqSkill, HqView } from "@/lib/hq/contracts";
import { hqCopy, hqError } from "@/lib/hq/copy";

export type HqOverlayKind = "task-composer" | "source-picker" | "recommendation" | "decision-confirmation" | "request-changes" | "audit-event" | "filters" | "readiness-comparison" | "skill-change" | "evaluation-request" | "skill-evidence" | "evaluation-evidence" | "skill-change-review" | "source-intake" | "source-correction" | "project-editor" | "project-task-links" | "project-milestone" | "project-closure" | "council-brief" | "council-participants" | "council-materials" | "council-preparation" | "council-notes" | "council-handoff";
export interface HqOverlay { kind: HqOverlayKind; meetingId?: string; packetId?: string; phase?: "preparation" | "minutes"; councilMode?: "cancel" | "reopen"; projectId?: string; projectRevision?: number; milestoneId?: string; reopen?: boolean; taskId?: string; sourceId?: string; agentId?: string; decisionId?: string; event?: HqEvent; skill?: HqSkill; mode?: "meeting" | "conversation" | "revise" | "authored"; choice?: "approve" | "decline" | "request_changes"; filterValue?: string; filterOptions?: {value:string;label:string}[]; onFilter?: (value: string) => void; }
interface HqContextValue { locale: HqLocale; setLocale: (locale: HqLocale) => void; session: HqSession | null; starting: boolean; sessionError: unknown; start: () => void; generation: number; refresh: () => void; overlay: HqOverlay | null; open: (overlay: HqOverlay) => void; close: () => void; }
const Context = createContext<HqContextValue | null>(null);
export function HqProvider({children}: {children: React.ReactNode}) {
  const [locale,setLocale] = usePageLocale();
  const [session,setSession] = useState<HqSession|null>(null);
  const [starting,setStarting] = useState(true);
  const [sessionError,setSessionError] = useState<unknown>(null);
  const [generation,setGeneration] = useState(0);
  const [overlay,setOverlay] = useState<HqOverlay|null>(null);
  const active = useRef(true);
  const start = useCallback(() => { setStarting(true); setSessionError(null); void openHqSession().then(value => {if(active.current)setSession(value);}).catch(error=>{if(active.current)setSessionError(error);}).finally(()=>{if(active.current)setStarting(false);}); },[]);
  useEffect(()=>{active.current=true;const timer=setTimeout(start,0);return()=>{active.current=false;clearTimeout(timer);};},[start]);
  const refresh=useCallback(()=>setGeneration(value=>value+1),[]);
  const close=useCallback(()=>setOverlay(null),[]);
  return <Context.Provider value={{locale,setLocale,session,starting,sessionError,start,generation,refresh,overlay,open:setOverlay,close}}>{children}</Context.Provider>;
}
export function useHq(){const context=useContext(Context);if(!context)throw new Error("HQ context unavailable");return context;}
export function useHqState<T>(view: HqView, filters: Record<string,string|number|undefined>={}, enabled=true) {
  const {session,generation}=useHq();const [data,setData]=useState<T|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState<unknown>(null);const [attempt,setAttempt]=useState(0);const serialized=JSON.stringify(filters);const requestKey=JSON.stringify([session?.workspaceId,view,serialized,generation,attempt,enabled]);const [settledKey,setSettledKey]=useState<string|null>(null);
  useEffect(()=>{let active=true;const timer=setTimeout(()=>{setLoading(true);setError(null);if(!session||!enabled){setLoading(false);return;}void loadHqState<T>(view,JSON.parse(serialized)).then(value=>{if(active){setData(value);setSettledKey(requestKey);}}).catch(failure=>{if(active){setError(failure);setData(null);setSettledKey(requestKey);}}).finally(()=>{if(active)setLoading(false);});},0);return()=>{active=false;clearTimeout(timer);};},[session,view,serialized,generation,attempt,enabled,requestKey]);
  return {data:enabled&&settledKey===requestKey?data:null,loading:enabled&&(settledKey!==requestKey||loading),error:settledKey===requestKey?error:null,retry:()=>setAttempt(value=>value+1)};
}
export function useHqCommand(scope: string) {
  const {session,refresh}=useHq();const [pending,setPending]=useState<HqCommand|null>(null);const [saving,setSaving]=useState(false);const [error,setError]=useState<unknown>(null);const [receipt,setReceipt]=useState<HqReceipt|null>(null);const [loaded,setLoaded]=useState(false);const busy=useRef(false);
  const key=session?`hq.command.${session.workspaceId}.${scope}`:null;
  useEffect(()=>{const timer=setTimeout(()=>{setLoaded(false);if(!key)return;try{const raw=sessionStorage.getItem(key);if(raw){const value=JSON.parse(raw);if(!value.commandId||!value.type||!value.payload)throw new HqApiError("unknown_receipt");setPending(value);}else setPending(null);setError(null);setLoaded(true);}catch{setError(new HqApiError("draft_storage_unavailable"));}},0);return()=>clearTimeout(timer);},[key]);
  const run=async(type: HqCommandType,payload: Record<string,unknown>,expectedRevision?: number):Promise<HqReceipt|null>=>{
    if(!session||!key||busy.current||!loaded)return null;
    busy.current=true;setSaving(true);setError(null);setReceipt(null);
    const command=pending??{commandId:crypto.randomUUID(),type,payload,...(expectedRevision!==undefined?{expectedRevision}:{})};
    try{
      try{sessionStorage.setItem(key,JSON.stringify(command));}catch{throw new HqApiError("draft_storage_unavailable");}
      setPending(command);const checked=await submitHqCommand(session,command);sessionStorage.removeItem(key);setPending(null);setReceipt(checked);refresh();return checked;
    }catch(failure){setError(failure);if(failure instanceof HqApiError&&failure.definitive){try{sessionStorage.removeItem(key);setPending(null);}catch{/* Preserve the same command if storage removal fails. */}}return null;
    }finally{busy.current=false;setSaving(false);}
  };
  return {pending,saving,error,receipt,loaded,run};
}
export function HqSessionBoundary({children}:{children:React.ReactNode}){const {locale,session,starting,sessionError,start}=useHq();const path=usePathname();if(starting)return <div className="hq-loading" role="status"><span className="hq-spinner"/>{hqCopy(locale,"loading")}</div>;if(!session||sessionError)return <div className="hq-message hq-message-error" role="alert"><p>{hqError(sessionError,locale)}</p><div className="hq-actions"><button className="hq-button" onClick={start}>{hqCopy(locale,"retry")}</button><Link className="hq-button" prefetch={false} href={`/hq/access?returnTo=${encodeURIComponent(safeHqReturn(path)??"/hq")}`}>{accessCopy(locale,"access")}</Link></div></div>;return children;}
