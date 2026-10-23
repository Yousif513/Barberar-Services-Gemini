import {HqProjectWorkspace} from "@/components/hq/hq-projects";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <HqProjectWorkspace id={id}/>;}
