import type {Document} from "mongodb";
const text=(max=200)=>({bsonType:"string",minLength:1,maxLength:max});
const integer=(min=1)=>({bsonType:["int","long","double"],minimum:min,maximum:Number.MAX_SAFE_INTEGER,multipleOf:1});
const nil={bsonType:"null"};const object=(p:Document)=>({bsonType:"object",additionalProperties:false,required:Object.keys(p),properties:p});
const scene=(api=false)=>object({sceneId:text(),order:{...integer(0),maximum:11},narration:text(1200),speechText:text(1200),speechMode:{enum:["AUTO"]},visualDescription:text(2000),motionDescription:text(2000),sceneType:{enum:["TITLE","PROCESS_FLOW","DIAGRAM","GENERIC_EDITORIAL"]},estimatedDurationSeconds:{bsonType:["double","int","long"],minimum:0.1,maximum:1200},captionHighlights:{bsonType:"array",maxItems:12,items:text(60)},[api?"compiledPreview":"compiled"]:nil,validationErrors:{bsonType:"array",maxItems:0}});
const content=(api=false)=>({version:integer(),baseRevision:integer(),title:text(120),hook:text(500),targetDurationSeconds:{...integer(60),maximum:90},visualStyle:{enum:["minimal_editorial"]},compileState:{enum:["NEEDS_COMPILATION"]},contentHash:{bsonType:"string",pattern:"^[a-f0-9]{64}$"},scenes:{bsonType:"array",minItems:6,maxItems:12,items:scene(api)},warnings:{bsonType:"array",maxItems:0}});
export const storyboardValidator={$jsonSchema:object({_id:text(),schemaVersion:{enum:[1]},ownerId:text(),projectId:text(),createdAt:{bsonType:"date"},...content(),compilerVersion:nil,templateCatalogVersion:{enum:["visual-v1"]},normalizerVersion:{enum:["speech-pass-through-v1"]},sourceProposalId:text(),sourceJobId:text()})};
export function storyboardShape(name:string,original:Document):Document {
 const result=structuredClone(original),p=result.$jsonSchema.properties;
 if(name==="projects"){
  p.activeStoryboardId={bsonType:["string","null"]};p.nextStoryboardVersion=integer();
  p.statusProjection.properties.creationStatus={enum:["DRAFT","PLANNING","NEEDS_ATTENTION","STORYBOARD_REVIEW"]};
  p.warnings={bsonType:"array",maxItems:1,items:object({code:{enum:["PLAN_CHANGED"]},message:text(500),sceneId:nil,severity:{enum:["WARNING"]}})};
 }
 if(name==="idempotencyRecords")p.routeKey={bsonType:"string",pattern:"^/api/v1/projects(?:/[0-9a-f-]{36}(?:/(?:ideas/(?:brainstorm|refine)|storyboards/generate|proposals/[0-9a-f-]{36}/(?:apply|dismiss)|jobs/[0-9a-f-]{36}/cancel))?)?$"};
 if(name==="generationJobs")p.kind={enum:["IDEA_BRAINSTORM","IDEA_REFINE","STORYBOARD_GENERATE"]};
 if(name==="proposals"){
  p.kind={enum:["IDEAS","STORYBOARD"]};p.appliedStoryboardId={bsonType:["string","null"]};
  const storyPayload=object({storyboard:object({id:text(),projectId:text(),createdAt:text(40),...content(true)})});
  const ideaPayload=p.payload;p.payload={oneOf:[ideaPayload,storyPayload]};
  result.$jsonSchema.oneOf=[{properties:{kind:{enum:["IDEAS"]},payload:ideaPayload}},{properties:{kind:{enum:["STORYBOARD"]},payload:storyPayload}}];
 }
 if(name==="auditEvents"){
  p.action.enum=[...p.action.enum,"STORYBOARD_APPLIED"];
  p.details.oneOf=[...p.details.oneOf,object({storyboardId:text(),proposalId:text(),fromRevision:integer(),toRevision:integer(2)})];
 }
 return result;
}
