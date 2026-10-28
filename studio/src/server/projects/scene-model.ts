import "server-only";
import {ProjectError,uuid7} from "./model";
import {validateStoryboard,storyboardHash,type Scene,type StoryboardDTO} from "./storyboard-model";
import type {IdeaJob} from "./ideas-model";
export const scopes=["NARRATION","VISUALS","BOTH"] as const;
export type RegenerateInput={expectedRevision:number;guidance:string;sceneId:string;scope:typeof scopes[number]};
export function editObject(value:unknown,allowed:string[]):Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new ProjectError("VALIDATION_FAILED","Enter editable fields.",422);
 const d=value as Record<string,unknown>;
 if(d.expectedRevision===undefined)throw new ProjectError("PRECONDITION_REQUIRED","A saved revision is required.",428);
 if(!Number.isSafeInteger(d.expectedRevision)||Number(d.expectedRevision)<1||Object.keys(d).some(k=>!["expectedRevision",...allowed].includes(k))||!allowed.some(k=>k in d))throw new ProjectError("VALIDATION_FAILED","Check the editable fields and revision.",422);
 return d;
}
export function boundedText(value:unknown,max:number){if(typeof value!=="string")throw new ProjectError("VALIDATION_FAILED","Enter text.",422);const text=value.normalize("NFC").trim();if(!text||[...text].length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw new ProjectError("VALIDATION_FAILED",`Use 1–${max} characters.`,422);return text;}
export const editableSceneFields=["narration","speechMode","speechText","visualDescription","motionDescription","sceneType","captionHighlights"];
export function patchScene(scene:Scene,patch:Record<string,unknown>):Scene {
 const narration=patch.narration===undefined?scene.narration:boundedText(patch.narration,1200);
 const mode=patch.speechMode===undefined?scene.speechMode:patch.speechMode;
 if(!["AUTO","OVERRIDE"].includes(String(mode))||(mode==="AUTO"&&patch.speechText!==undefined)||(mode==="OVERRIDE"&&patch.speechText===undefined&&(scene.speechMode!=="OVERRIDE"||narration!==scene.narration)))throw new ProjectError("VALIDATION_FAILED","Automatic speech cannot have an override. Provide speech text when entering override mode or changing overridden narration.",422);
 if(Object.keys(patch).filter(k=>editableSceneFields.includes(k)).every(k=>JSON.stringify(patch[k])===JSON.stringify(scene[k as keyof Scene])))return scene;
 const speechText=mode==="AUTO"?narration.replace(/\s+/g," "):patch.speechText===undefined?scene.speechText:boundedText(patch.speechText,1200);
 const raw={narration,visualDescription:patch.visualDescription===undefined?scene.visualDescription:patch.visualDescription,motionDescription:patch.motionDescription===undefined?scene.motionDescription:patch.motionDescription,sceneType:patch.sceneType===undefined?scene.sceneType:patch.sceneType,captionHighlights:patch.captionHighlights===undefined?scene.captionHighlights:patch.captionHighlights};
 let normalized:Scene;try{normalized=validateStoryboard({title:"Scene",hook:"Scene",scenes:Array.from({length:6},()=>raw)}).scenes[0];}catch{throw new ProjectError("VALIDATION_FAILED","Check scene text, supported visual type and highlights (each must appear in narration).",422);}
 return {...normalized,sceneId:scene.sceneId,order:scene.order,speechMode:mode as Scene["speechMode"],speechText,estimatedDurationSeconds:Math.max(1,Math.round(speechText.split(/\s+/).length/2.5*10)/10)};
}
export function regenerateInput(value:unknown,sceneId:string):RegenerateInput {
 const d=editObject(value,["scope","guidance"]);if(!scopes.includes(d.scope as RegenerateInput["scope"]))throw new ProjectError("VALIDATION_FAILED","Choose narration, visuals or both.",422);
 const guidance=d.guidance===undefined||d.guidance===""?"":boundedText(d.guidance,1000);
 return {expectedRevision:Number(d.expectedRevision),sceneId,scope:d.scope as RegenerateInput["scope"],guidance};
}
export function regeneratedStoryboard(value:unknown,job:IdeaJob):StoryboardDTO {
 const context=job.input!.sceneContext!,base=context.storyboard;
 const fields=context.scope==="NARRATION"?["narration","captionHighlights"]:context.scope==="VISUALS"?["visualDescription","motionDescription","sceneType"]:["narration","captionHighlights","visualDescription","motionDescription","sceneType"];
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join()!==fields.sort().join())throw new ProjectError("INVALID_PROVIDER_OUTPUT","The scene response has unexpected fields.",502);
 const {compiledPreview,...before}=base.scenes.find(s=>s.sceneId===context.sceneId)!;void compiledPreview;
 let updated:Scene;try{updated=patchScene({...before,compiled:null}, {...value,...(context.scope!=="VISUALS"?{speechMode:"AUTO"}:{})});}catch{throw new ProjectError("INVALID_PROVIDER_OUTPUT","The scene response did not meet requirements.",502);}
 const {compiled,...updatedDTO}=updated;void compiled;
 const scenes=base.scenes.map(s=>s.sceneId===context.sceneId?{...updatedDTO,compiledPreview:null}:{...s,compiledPreview:null,validationErrors:[]});
 if(scenes.reduce((n,s)=>n+[...s.narration].length,0)>12000)throw new ProjectError("INVALID_PROVIDER_OUTPUT","The total narration is too long.",502);
 return {...base,id:uuid7(),createdAt:new Date().toISOString(),baseRevision:job.baseRevision,compileState:"NEEDS_COMPILATION",warnings:[],scenes,contentHash:storyboardHash({...base,scenes:scenes.map(({compiledPreview,...s})=>{void compiledPreview;return {...s,compiled:null};})})};
}
