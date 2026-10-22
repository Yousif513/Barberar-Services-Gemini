"use client";
import {useHq} from "@/components/hq/hq-context";
import {hqCopy} from "@/lib/hq/copy";
export default function ErrorBoundary({reset}:{reset:()=>void}){const {locale}=useHq();return <div className="hq-message hq-message-error" role="alert"><p>{locale==="ar"?"تعذر عرض هذا السجل. لم تُستبدل البيانات بمعلومات تجريبية.":"This record could not be displayed. No substitute records were loaded."}</p><button className="hq-button" onClick={reset}>{hqCopy(locale,"retry")}</button></div>;}
