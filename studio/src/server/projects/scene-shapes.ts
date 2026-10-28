import type {Document} from "mongodb";
import {storyboardApiSchema} from "./storyboard-shapes";
const text={bsonType:"string",minLength:1,maxLength:200};
const obj=(properties:Document)=>({bsonType:"object",required:Object.keys(properties),additionalProperties:false,properties});
export function sceneShape(name:string,original:Document):Document {
 const result=structuredClone(original),p=result.$jsonSchema.properties;
 const override=(value:Document)=>{if(value.properties?.speechMode)value.properties.speechMode={enum:["AUTO","OVERRIDE"]};for(const child of Object.values(value))if(child&&typeof child==="object")override(child as Document);};
 override(result);
 if(name==="storyboards"){p.sourceProposalId={bsonType:["string","null"]};p.sourceJobId={bsonType:["string","null"]};}
 if(name==="generationJobs"){
  p.kind.enum=[...p.kind.enum,"SCENE_REGENERATE"];
  const story=structuredClone(storyboardApiSchema);override(story);
  p.input.oneOf[1].properties.sceneContext=obj({storyboard:story,sceneId:text,scope:{enum:["NARRATION","VISUALS","BOTH"]}});
 }
 if(name==="proposals"){
  p.kind.enum=[...p.kind.enum,"SCENE"];p.targetSceneId={bsonType:["string","null"]};
  result.$jsonSchema.oneOf.push({properties:{kind:{enum:["SCENE"]},targetSceneId:text,payload:p.payload.oneOf[1]}});
 }
 if(name==="idempotencyRecords"){
  p.method={enum:["POST","PATCH","DELETE"]};
  p.routeKey.pattern="^/api/v1/projects(?:/[0-9a-f-]{36}(?:/(?:ideas/(?:brainstorm|refine)|storyboards/generate|storyboard|scenes/[0-9a-f-]{36}(?:/regenerate)?|proposals/[0-9a-f-]{36}/(?:apply|dismiss)|jobs/[0-9a-f-]{36}/cancel))?)?$";
 }
 if(name==="auditEvents"){
  p.action.enum=[...p.action.enum,"STORYBOARD_EDITED"];
  p.details.oneOf.push(obj({storyboardId:text,fromRevision:{bsonType:["int","long","double"],minimum:1},toRevision:{bsonType:["int","long","double"],minimum:2}}));
 }
 return result;
}
