import "server-only";
import {createHmac,timingSafeEqual,randomUUID} from "node:crypto";
import {getIdentity} from "./auth/service";
import {readAuthConfig} from "./auth/config";
import {catalog,voiceSample} from "./catalog";
import {voiceKeys,type VoiceKey} from "@/shared/catalog";
import {strictJSON,validCsrf,projectFailure} from "./projects/http";
import {ProjectError} from "./projects/model";
type Deps={identity:Awaited<ReturnType<typeof getIdentity>>;config:ReturnType<typeof readAuthConfig>};
export async function catalogRequest(request:Request,key:string|undefined,action:"catalog"|"grant"|"sample",deps:Deps){
 const requestId=randomUUID(),headers=new Headers({"Cache-Control":"private, no-store","X-Request-Id":requestId,Vary:"Cookie","Referrer-Policy":"no-referrer"});
 try{
  const {identity,config}=deps;if(!identity||identity.profile.lifecycle!=="ACTIVE")throw new ProjectError("AUTH_REQUIRED","Please sign in.",401);
  const url=new URL(request.url);
  if(action==="catalog"){if(request.method!=="GET"||url.search)throw new ProjectError("INVALID_QUERY","This catalog accepts no parameters.",400);return Response.json({data:catalog(),requestId},{headers});}
  if(!voiceKeys.includes(key as VoiceKey))throw new ProjectError("RESOURCE_NOT_FOUND","This voice does not exist.",404);
  if(action==="grant"){
   if(request.method!=="POST"||url.search)throw new ProjectError("METHOD_NOT_ALLOWED","Use the preview action.",405);
   if(request.headers.get("origin")!==config.origin||request.headers.get("sec-fetch-site")==="cross-site"||!validCsrf(request.headers.get("x-csrf-token"),identity,config.secret))throw new ProjectError("CSRF_FAILED","Refresh your session and try again.",403);
   const body=await strictJSON(request);if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).length)throw new ProjectError("VALIDATION_FAILED","Voice preview accepts an empty object only.",422);
  }else if(request.method!=="GET"||[...url.searchParams.keys()].some(k=>k!=="token")||url.searchParams.getAll("token").length!==1)throw new ProjectError("INVALID_QUERY","Use a valid preview link.",400);
  const sample=voiceSample(key as VoiceKey),sign=(expires:number)=>createHmac("sha256",config.secret).update(JSON.stringify(["voice-preview-v1",identity.user.id,identity.sessionId,key,sample.fingerprint,sample.sha256,expires])).digest("hex");
  if(action==="grant"){
   const expires=Date.now()+15*60*1000,token=`${expires}.${sign(expires)}`;
   return Response.json({data:{url:`${config.origin}/api/v1/voices/${key}/sample?token=${token}`,expiresAt:new Date(expires).toISOString(),method:"GET",contentType:"audio/mpeg",filename:`${key!.toLowerCase()}-preview.mp3`,stale:false},requestId},{headers});
  }
  const token=url.searchParams.get("token")!;
  if(!/^\d{13}\.[a-f0-9]{64}$/.test(token))throw new ProjectError("PREVIEW_EXPIRED","Play the sample again to get a fresh preview.",403);
  const [stamp,signature]=token.split("."),expires=Number(stamp);
  if(expires<=Date.now()||expires>Date.now()+15*60*1000||!timingSafeEqual(Buffer.from(signature),Buffer.from(sign(expires))))throw new ProjectError("PREVIEW_EXPIRED","Play the sample again to get a fresh preview.",403);
  headers.set("Content-Type","audio/mpeg");headers.set("Accept-Ranges","bytes");headers.set("X-Content-Type-Options","nosniff");headers.set("Content-Disposition",`inline; filename="${key!.toLowerCase()}-preview.mp3"`);
  const range=request.headers.get("range"),size=sample.bytes.length;let start=0,end=size-1;
  if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||(!match[1]&&!match[2])){headers.set("Content-Range",`bytes */${size}`);return new Response(null,{status:416,headers});}
   if(!match[1])start=Math.max(0,size-Number(match[2]));else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size){headers.set("Content-Range",`bytes */${size}`);return new Response(null,{status:416,headers});}
   headers.set("Content-Range",`bytes ${start}-${end}/${size}`);
  }
  headers.set("Content-Length",String(end-start+1));return new Response(new Uint8Array(sample.bytes.subarray(start,end+1)),{status:range?206:200,headers});
 }catch(e){return projectFailure(e,requestId,headers);}
}
export async function catalogRoute(request:Request,key:string|undefined,action:"catalog"|"grant"|"sample"){
 try{return catalogRequest(request,key,action,{identity:await getIdentity(request.headers),config:readAuthConfig()});}catch(e){return projectFailure(e);}
}
