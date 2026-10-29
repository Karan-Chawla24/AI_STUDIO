import type {CompileWarning} from "@/shared/compiled-scene";

export function CompilationWarnings({warnings,scenes}:{warnings:CompileWarning[];scenes:{sceneId:string;order:number}[]}) {
 const sceneNumbers=new Map(scenes.map(scene=>[scene.sceneId,scene.order+1]));
 const groups=new Map<string,{message:string;scenes:Set<number>;general:boolean;unlinked:boolean}>();
 for(const warning of warnings){
  const key=JSON.stringify([warning.code,warning.message,warning.severity]);
  const group=groups.get(key)??{message:warning.message,scenes:new Set<number>(),general:false,unlinked:false};
  const number=warning.sceneId===null?undefined:sceneNumbers.get(warning.sceneId);
  if(warning.sceneId===null)group.general=true;
  else if(number===undefined)group.unlinked=true;
  else group.scenes.add(number);
  groups.set(key,group);
 }
 return <>{Array.from(groups,([key,group])=>{
  const numbers=[...group.scenes].sort((a,b)=>a-b);
  const scope=[...(numbers.length?[`${numbers.length===1?"Scene":"Scenes"} ${numbers.join(", ")}`]:[]),...(group.general?["Storyboard-wide"]:[]),...(group.unlinked?["Unlinked scene"]:[])].join(" · ");
  return <p className="field-hint" key={key}><strong>{scope}:</strong> {group.message}</p>;
 })}</>;
}
