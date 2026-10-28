import type {Document} from "mongodb";
import {storyboardApiSchema} from "./storyboard-shapes";
const text=(max=200)=>({bsonType:"string",minLength:1,maxLength:max}),nil={bsonType:"null"},integer={bsonType:["int","long","double"],minimum:0,multipleOf:1};
const obj=(properties:Document)=>({bsonType:"object",...(Object.keys(properties).length?{required:Object.keys(properties)}:{}),additionalProperties:false,properties});
const array=(items:Document,maxItems:number,minItems=0)=>({bsonType:"array",items,maxItems,minItems});
const nullable=(s:Document)=>({oneOf:[nil,s]});
const error=obj({path:text(),code:text(),message:text(500)});
const warning=obj({code:text(),message:text(500),sceneId:nullable(text()),severity:{enum:["WARNING"]}});
const node={id:text(),label:text(40),iconKey:nil},edge=obj({id:text(),from:text(),to:text(),label:nil}),accent={enum:["TEAL"]};
const preview={oneOf:[obj({type:{enum:["TITLE"]},title:text(80),subtitle:nullable(text(140)),iconKey:nil,accent}),obj({type:{enum:["PROCESS_FLOW"]},nodes:array(obj(node),6,2),edges:array(edge,8,1),direction:{enum:["VERTICAL"]},accent}),obj({type:{enum:["DIAGRAM"]},nodes:array(obj({...node,role:{enum:["PRIMARY","SECONDARY"]}}),8,2),edges:array(edge,12),layout:{enum:["HUB"]},accent}),obj({type:{enum:["GENERIC_EDITORIAL"]},headline:text(100),bullets:array(text(100),3),emphasis:nil,iconKey:nil,accent})]};
const compiled=obj({compilerVersion:{enum:["editorial-v1"]},templateVersion:{enum:["visual-v1"]},preview,cues:array(obj({id:text(),anchor:obj({kind:{enum:["SCENE_START","PHRASE"]},text:nullable(text(100)),occurrence:{enum:[1]}}),targetId:text(),action:{enum:["REVEAL"]},params:obj({})}),10),speechSpans:array(obj({displayStart:integer,displayEnd:integer,speechStart:integer,speechEnd:integer,words:array(text(1200),1200,1)}),1200,1),layoutWarnings:array(warning,2)});
function expand(value:Document){
 if(value.properties?.compileState){value.properties.compileState={enum:["NEEDS_COMPILATION","VALID","INVALID"]};value.properties.warnings=array(warning,24);}
 if(value.properties?.speechMode){value.properties.speechMode={enum:["AUTO","OVERRIDE"]};if(value.properties.compiled)value.properties.compiled=nullable(compiled);if(value.properties.compiledPreview)value.properties.compiledPreview=nullable(compiled);value.properties.validationErrors=array(error,10);}
 if(value.properties?.compilerVersion&&value.properties?.normalizerVersion){value.properties.compilerVersion={enum:[null,"editorial-v1"]};value.properties.normalizerVersion={enum:["speech-pass-through-v1","speech-v1"]};}
 // Recurse only through structural branches; inserted compiled schema is already complete.
 for(const [key,child] of Object.entries(value))if(child&&typeof child==="object"&&!["compiled","compiledPreview"].includes(key))expand(child as Document);
}
export function compileShape(name:string,original:Document):Document{
 const result=structuredClone(original);expand(result);const p=result.$jsonSchema.properties;
 if(name==="projects"){p.currentSnapshotHash=nullable({bsonType:"string",pattern:"^[a-f0-9]{64}$"});p.approval=nullable(obj({storyboardId:text(),snapshotHash:{bsonType:"string",pattern:"^[a-f0-9]{64}$"},approvedBy:text(),approvedAt:{bsonType:"date"}}));p.statusProjection.properties.creationStatus.enum=[...p.statusProjection.properties.creationStatus.enum,"STORYBOARD_APPROVED"];}
 if(name==="generationJobs"){p.kind.enum=[...p.kind.enum,"STORYBOARD_COMPILE"];const api=structuredClone(storyboardApiSchema);expand(api);p.input.oneOf[1].properties.compileContext=api;}
 if(name==="proposals"){p.kind.enum=[...p.kind.enum,"COMPILE"];result.$jsonSchema.oneOf.push({properties:{kind:{enum:["COMPILE"]},payload:p.payload.oneOf[1],targetSceneId:nil}});}
 if(name==="idempotencyRecords"){p.method.enum=[...new Set([...p.method.enum,"DELETE"])];p.routeKey.pattern="^/api/v1/projects(?:/[0-9a-f-]{36}(?:/(?:ideas/(?:brainstorm|refine)|storyboards/(?:generate|compile)|storyboard|approval|settings|scenes/[0-9a-f-]{36}(?:/regenerate)?|proposals/[0-9a-f-]{36}/(?:apply|dismiss)|jobs/[0-9a-f-]{36}/cancel))?)?$";
 }
 if(name==="auditEvents"){p.jobId=nullable(text());p.action.enum=[...p.action.enum,"STORYBOARD_COMPILED","STORYBOARD_APPROVED","STORYBOARD_UNAPPROVED","VOICE_SELECTED"];p.details.oneOf.push(obj({storyboardId:text(),snapshotHash:nullable(text(64))}));}
 return result;
}
