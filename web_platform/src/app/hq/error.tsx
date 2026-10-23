"use client";
import Link from "next/link";
import {usePageLocale} from "@/lib/use-page-locale";
import {accessCopy} from "@/lib/hq/access-copy";
import {hqCopy} from "@/lib/hq/copy";
export default function ErrorBoundary({reset}:{reset:()=>void}){const [locale]=usePageLocale();return <div className="hq-message hq-message-error" role="alert"><p>{locale==="ar"?"تعذر عرض هذا السجل. لم تُستبدل البيانات بمعلومات تجريبية.":"This record could not be displayed. No substitute records were loaded."}</p><div className="hq-actions"><button className="hq-button" onClick={reset}>{hqCopy(locale,"retry")}</button><Link className="hq-button" prefetch={false} href="/hq/access">{accessCopy(locale,"access")}</Link></div></div>;}
