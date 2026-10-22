import type {Metadata} from "next";
import {HqRoot} from "@/components/hq/hq-shell";
import "./hq.css";
export const metadata: Metadata={title:"Volabi · Local Founder Workspace",description:"PRIMORA local management records and source-linked decisions."};
export default function HqLayout({children}:{children:React.ReactNode}){return <HqRoot>{children}</HqRoot>;}
