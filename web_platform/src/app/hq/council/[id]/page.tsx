import {HqMeetingWorkspace} from "@/components/hq/hq-council";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <HqMeetingWorkspace id={id}/>;}
