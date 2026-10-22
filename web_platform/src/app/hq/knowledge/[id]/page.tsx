import {HqWorkspace} from "@/components/hq/hq-workspace";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <HqWorkspace view="source" id={id}/>;}
