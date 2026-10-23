"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePageLocale } from "@/lib/use-page-locale";
import { accessCopy, type AccessCopyKey } from "@/lib/hq/access-copy";
import { HqAccessError, cancelAccess, checkAccessReceipt, confirmAccess, getAccessStatus, newRevocationOperation, prepareAccess, revokeAccess, safeHqReturn, type AccessOperation, type AccessPurpose, type AccessReceipt, type AccessStatus } from "@/lib/hq/access-client";
import { HqAccessDialog, type AccessDialogKind } from "./hq-access-dialog";
import { HqAccessSecret } from "./hq-access-fields";

type Phase = "entry" | "prepared" | "confirm" | "unknown" | "success";
function failureCopy(failure: unknown): AccessCopyKey {
  if (!(failure instanceof HqAccessError)) return "unavailable";
  if (failure.code === "operation_expired") return "expired";
  if (failure.code === "operation_time_elapsed") return "localExpiry";
  if (failure.code === "rate_limited") return "rateLimited";
  if (failure.code === "operation_conflict") return "conflict";
  if (["access_required","session_required"].includes(failure.code)) return "sessionRequired";
  if (["proof_invalid","csrf_failed","origin_forbidden","invalid_input","request_too_large"].includes(failure.code)) return "invalid";
  if (failure.code === "return_forbidden") return "returnRefused";
  if (failure.code === "storage_not_initialized") return "uninitialized";
  if (failure.code === "inert_restore") return "inert";
  if (failure.code === "unsupported_schema") return "legacy";
  if (failure.code.startsWith("storage_")) return "storageHelp";
  return "unavailable";
}
function isStorageFailure(failure: unknown) { return failure instanceof HqAccessError && (failure.code.startsWith("storage_") || ["unsupported_schema","inert_restore","access_mode_required"].includes(failure.code)); }

export function HqAccess() {
  const [locale, setLocale] = usePageLocale();
  const t = (key: AccessCopyKey) => accessCopy(locale,key);
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [phase, setPhase] = useState<Phase>("entry");
  const [dialog, setDialog] = useState<AccessDialogKind | null>(null);
  const [credential, setCredential] = useState("");
  const [replacement, setReplacement] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [ack, setAck] = useState(false);
  const [saved, setSaved] = useState(false);
  const [operation, setOperation] = useState<AccessOperation | null>(null);
  const [receipt, setReceipt] = useState<AccessReceipt | null>(null);
  const [canContinue, setCanContinue] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [returnTo, setReturnTo] = useState("/hq");
  const [returnRefused, setReturnRefused] = useState(false);
  const [unscopedUnknown, setUnscopedUnknown] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(0);
  const mounted = useRef(true);
  const pending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const loadStatus = useCallback(async () => {
    setChecking(true); setFailure(null);
    try { const value = await getAccessStatus(); if(mounted.current){setStatus(value);setCanContinue(value.state === "authenticated");} }
    catch(error){if(mounted.current){setStatus(null);setCanContinue(false);setFailure(error);}}
    finally{if(mounted.current)setChecking(false);}
  },[]);
  useEffect(() => {mounted.current=true;const timer=setTimeout(()=>{const requested=new URLSearchParams(window.location.search).get("returnTo");const checked=safeHqReturn(requested);setReturnTo(checked??"/hq");setReturnRefused(checked===null);void loadStatus();},0);return()=>{mounted.current=false;clearTimeout(timer);};},[loadStatus]);
  useEffect(()=>{if(!waitUntil)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[waitUntil]);
  useEffect(()=>{if(!checking)heading.current?.focus();},[phase,checking]);
  useEffect(()=>{if(!operation?.expiresAt||!["prepared","confirm"].includes(phase))return;const timer=setTimeout(()=>{setCredential("");setReplacement("");setRevealed(false);setAck(false);setFailure(new HqAccessError("operation_time_elapsed"));setPhase("unknown");},Math.max(0,Date.parse(operation.expiresAt)-Date.now()));return()=>clearTimeout(timer);},[operation,phase]);
  const run = async (work: () => Promise<void>) => {if(pending.current)return;pending.current=true;setBusy(true);setFailure(null);setCancelled(false);try{await work();}finally{pending.current=false;if(mounted.current)setBusy(false);}};
  const stage = (purpose: AccessPurpose, proof: string) => run(async()=>{
    if(!status)return;
    setCredential("");setReplacement("");setAck(false);setSaved(false);setReceipt(null);setRevealed(false);
    try{const value=await prepareAccess(purpose,proof,status);if(!mounted.current)return;const {credential:secret,...scoped}=value;setOperation(scoped);setReplacement(secret);setDialog(null);setPhase("prepared");setUnscopedUnknown(false);}
    catch(error){if(!mounted.current)return;setFailure(error);if(!(error instanceof HqAccessError)||!error.definitive){setDialog(null);setUnscopedUnknown(true);setWaitUntil(Date.now()+300000);setNow(Date.now());setPhase("unknown");}}
  });
  const acceptReceipt = (value: AccessReceipt) => {setReceipt(value);setReplacement("");setCredential("");setRevealed(false);setAck(false);if(value.state==="committed"){setPhase("success");setCanContinue(false);}else if(value.state==="cancelled"||value.state==="expired"){setOperation(null);setPhase("entry");setCancelled(value.state==="cancelled");if(value.state==="expired")setFailure(new HqAccessError("operation_expired",410));}else setPhase(saved?"confirm":"unknown");};
  const confirm = (proof: string) => run(async()=>{
    if(!operation)return;setCredential("");setReplacement("");setRevealed(false);setAck(false);
    try{const value=await confirmAccess(operation,proof,returnTo);if(!mounted.current)return;setReceipt(value.receipt);setPhase("success");setStatus(value.session?{state:"authenticated",enrolled:true,session:value.session}:null);setCanContinue(Boolean(value.session));if(value.returnTo)setReturnTo(value.returnTo);}
    catch(error){if(!mounted.current)return;setFailure(error);setPhase(error instanceof HqAccessError&&error.definitive&&error.code==="proof_invalid"?"confirm":"unknown");setUnscopedUnknown(false);}
  });
  const inspect = () => run(async()=>{if(!operation)return;try{const value=await checkAccessReceipt(operation);if(mounted.current)acceptReceipt(value);}catch(error){if(mounted.current)setFailure(error);}});
  const cancel = () => run(async()=>{if(!operation)return;setCredential("");setReplacement("");setRevealed(false);setAck(false);try{const value=await cancelAccess(operation);if(mounted.current)acceptReceipt(value);}catch(error){if(mounted.current){setFailure(error);setPhase("unknown");}}});
  const submitDialog = async(proof: string, all: boolean) => {
    if(dialog!=="revoke"){await stage(dialog==="rotate"?"rotate":"enroll",proof);return;}
    await run(async()=>{if(!status?.session)return;const scoped=newRevocationOperation(all);setOperation(scoped);setSaved(false);try{const value=await revokeAccess(status.session,scoped,all?proof:undefined);if(!mounted.current)return;setReceipt(value);setDialog(null);setStatus({state:"access_required"});setCanContinue(false);setPhase("success");}catch(error){if(mounted.current){setFailure(error);if(!(error instanceof HqAccessError)||!error.definitive){setDialog(null);setPhase("unknown");setUnscopedUnknown(false);}else setOperation(null);}}});
  };
  const reset = () => {setOperation(null);setCredential("");setReplacement("");setRevealed(false);setReceipt(null);setAck(false);setUnscopedUnknown(false);setPhase("entry");setFailure(null);void loadStatus();};
  const storageFailure=isStorageFailure(failure);
  const waitActive=waitUntil>now;
  const displayDate=(date:string)=>new Intl.DateTimeFormat(locale==="ar"?"ar-SA-u-ca-gregory":"en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Riyadh"}).format(new Date(date));

  return <div className="hq hq-access" dir={locale==="ar"?"rtl":"ltr"}>
    <header className="hq-access-topbar"><span className="hq-wordmark">VOLABI</span><button type="button" className="hq-button hq-button-small" onClick={()=>setLocale(locale==="ar"?"en":"ar")}>{locale==="ar"?"English":"العربية"}</button></header>
    <main className="hq-access-main" id="hq-main" aria-busy={busy||checking}>
      <div className="hq-page-head"><div><p className="hq-eyebrow">{t("eyebrow")}</p><h1 ref={heading} tabIndex={-1} className="hq-heading">{t("title")}</h1><p className="hq-lead">{t("intro")}</p></div></div>
      {returnRefused&&<p className="hq-message" role="status">{t("returnRefused")}</p>}
      {checking?<div className="hq-loading" role="status"><span className="hq-spinner"/>{t("checking")}</div>:<div className="hq-access-grid">
        <section className="hq-panel hq-stack" aria-label={t("status")}>
          {Boolean(failure)&&<div className="hq-message hq-message-error" role="alert"><strong>{t(storageFailure?"storageUnavailable":failureCopy(failure))}</strong>{storageFailure&&<p>{t(failureCopy(failure))}</p>}{failure instanceof HqAccessError&&failure.diagnosticId&&<p className="hq-small">{t("diagnostic")}: <bdi>{failure.diagnosticId}</bdi></p>}</div>}
          {cancelled&&<p className="hq-message" role="status">{t("cancelled")}</p>}
          {phase==="entry"&&!storageFailure&&status&&<>
            <h2 className="hq-title">{t(status.state==="authenticated"?status.enrolled?"enrolled":"unenrolled":"signedOut")}</h2>
            {status.state==="authenticated"?<><p className="hq-muted">{t("callerOnly")}</p><div className="hq-actions">{!status.enrolled&&<button type="button" className="hq-button hq-button-primary" onClick={()=>setDialog("enroll")}>{t("enroll")}</button>}{status.enrolled&&<button type="button" className="hq-button hq-button-primary" onClick={()=>setDialog("rotate")}>{t("rotate")}</button>}<button type="button" className="hq-button" onClick={()=>setDialog("revoke")}>{t("revoke")}</button></div><Link href={returnTo} prefetch={false} className="hq-link">{t("continue")}</Link></>:status.state==="bootstrap_required"?<><p className="hq-muted">{t("bootstrapHint")}</p><button type="button" className="hq-button hq-button-primary" onClick={()=>setDialog("enroll")} disabled={waitActive}>{t("enroll")}</button></>:<form className="hq-form" onSubmit={event=>{event.preventDefault();if(credential.trim()&&!busy&&!waitActive){const proof=credential.trim();setCredential("");void stage("recover",proof);}}}><HqAccessSecret locale={locale} label={t("credential")} hint={t("credentialHint")} value={credential} onChange={setCredential} disabled={busy||waitActive}/><div className="hq-actions"><button type="submit" className="hq-button hq-button-primary" disabled={busy||waitActive||!credential.trim()}>{t(busy?"working":"recover")}</button><button type="button" className="hq-button" disabled={busy} onClick={()=>{setCredential("");setFailure(null);}}>{t("cancel")}</button></div></form>}
          </>}
          {phase==="prepared"&&operation&&<><h2 className="hq-title">{t("savedTitle")}</h2><p className="hq-message">{t("prepared")}</p><p className="hq-muted">{t("savedIntro")}</p>{!revealed?<><p className="hq-muted">{t("revealHidden")}</p><button type="button" className="hq-button hq-button-primary" disabled={busy} onClick={()=>setRevealed(true)}>{t("reveal")}</button></>:<><div className="hq-field"><span>{t("replacement")}</span><output className="hq-access-replacement" dir="ltr">{replacement}</output></div><button type="button" className="hq-button hq-button-primary" disabled={busy} onClick={()=>{setReplacement("");setRevealed(false);setSaved(true);setPhase("confirm");}}>{t("savedContinue")}</button></>}<p className="hq-small">{t("expires")}: <time dateTime={operation.expiresAt}>{operation.expiresAt?displayDate(operation.expiresAt):""}</time></p><p className="hq-field-hint">{t("noReload")}</p><button type="button" className="hq-button" disabled={busy} onClick={()=>void cancel()}>{t("cancelStage")}</button></>}
          {phase==="confirm"&&operation&&<form className="hq-form" onSubmit={event=>{event.preventDefault();if(!credential.trim()||!ack||busy)return;const proof=credential.trim();setCredential("");void confirm(proof);}}><h2 className="hq-title">{t("confirmTitle")}</h2><p className="hq-muted">{t("confirmIntro")}</p><HqAccessSecret locale={locale} label={t("savedCredential")} value={credential} onChange={setCredential} disabled={busy}/><label className="hq-check"><input type="checkbox" checked={ack} onChange={event=>setAck(event.target.checked)} disabled={busy}/>{t("savedAck")}</label><div className="hq-actions"><button className="hq-button hq-button-primary" type="submit" disabled={busy||!ack||!credential.trim()}>{t(busy?"working":"confirm")}</button><button type="button" className="hq-button" disabled={busy} onClick={()=>void cancel()}>{t("cancelStage")}</button></div><p className="hq-small">{t("expires")}: <time dateTime={operation.expiresAt}>{operation.expiresAt?displayDate(operation.expiresAt):""}</time></p></form>}
          {phase==="unknown"&&<><h2 className="hq-title">{t("unknown")}</h2><p className="hq-muted">{t(unscopedUnknown?"unknownStage":"unknownIntro")}</p>{operation&&<><p className="hq-mono">{t("operation")}: <bdi>{operation.operationId}</bdi></p><button type="button" className="hq-button hq-button-primary" disabled={busy} onClick={()=>void inspect()}>{t("receipt")}</button>{!saved&&operation.purpose!=="signout"&&operation.purpose!=="revoke"&&<button type="button" className="hq-button" disabled={busy} onClick={()=>void cancel()}>{t("cancelStage")}</button>}<p className="hq-muted">{t("unknownFinal")}</p></>}<button type="button" className="hq-button" disabled={busy||waitActive} onClick={reset}>{t("resumeRecovery")}</button></>}
          {phase==="success"&&receipt&&<><h2 className="hq-title">{t("confirmed")}</h2><p className="hq-message hq-message-success" role="status">{t(receipt.purpose==="signout"||receipt.purpose==="revoke"?"signedOutSuccess":"successIntro")}</p><p className="hq-mono">{t("operation")}: <bdi>{receipt.operationId}</bdi></p><time className="hq-small" dateTime={receipt.at}>{displayDate(receipt.at)}</time>{canContinue?<Link href={returnTo} prefetch={false} className="hq-button hq-button-primary">{t("continue")}</Link>:<button type="button" className="hq-button hq-button-primary" onClick={reset}>{t("resumeRecovery")}</button>}</>}
          <div className="hq-actions"><button type="button" className="hq-button" disabled={busy||checking||phase==="prepared"||phase==="confirm"} onClick={()=>{setCredential("");void loadStatus();}}>{t("retry")}</button></div>
        </section>
        <aside className="hq-access-note"><p className="hq-eyebrow">{t("access")}</p><p>{t("noOverride")}</p><p>{t("safeReturn")}</p><p className="hq-side-foot">{t("boundary")}</p></aside>
      </div>}
    </main>
    {dialog&&<HqAccessDialog kind={dialog} locale={locale} bootstrap={status?.state==="bootstrap_required"} busy={busy} error={failure?t(failureCopy(failure)):undefined} onClose={()=>{setDialog(null);setFailure(null);}} onSubmit={submitDialog}/>}
  </div>;
}
