export type FieldError={path:string;code:string;message:string};
export type CompileWarning={code:string;message:string;sceneId:string|null;severity:"WARNING"};
type Node={id:string;label:string;iconKey:null};
type Edge={id:string;from:string;to:string;label:null};
export type PreviewConfig=({type:"TITLE";title:string;subtitle:string|null;iconKey:null}|{type:"PROCESS_FLOW";nodes:Node[];edges:Edge[];direction:"VERTICAL"}|{type:"DIAGRAM";nodes:(Node&{role:"PRIMARY"|"SECONDARY"})[];edges:Edge[];layout:"HUB"}|{type:"GENERIC_EDITORIAL";headline:string;bullets:string[];emphasis:null;iconKey:null})&{accent:"TEAL"};
export type CompiledScene={compilerVersion:"editorial-v1";templateVersion:"visual-v1";preview:PreviewConfig;cues:{id:string;anchor:{kind:"SCENE_START"|"PHRASE";text:string|null;occurrence:1};targetId:string;action:"REVEAL";params:Record<string,never>}[];speechSpans:{displayStart:number;displayEnd:number;speechStart:number;speechEnd:number;words:string[]}[];layoutWarnings:CompileWarning[]};
