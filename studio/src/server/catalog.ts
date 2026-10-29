import "server-only";
import {createHash} from "node:crypto";
import {readFileSync,statSync} from "node:fs";
import {join} from "node:path";
import {voiceKeys,captionStyles,type VoiceKey,type Catalog} from "@/shared/catalog";
import {ProjectError} from "./projects/model";
export const sampleRoot=()=>process.env.VOICE_SAMPLES_DIRECTORY||join(process.cwd(),".local","voice-samples");
export function voiceBinding(key:VoiceKey){return {voiceId:process.env[`ELEVENLABS_${key}_ID`]?.trim()??"",model:process.env.ELEVENLABS_MODEL?.trim()??"",settings:{stability:0.5,similarity_boost:0.75,speed:1},version:"curated-voices-v1"};}
export function voiceFingerprint(key:VoiceKey|null){return key?createHash("sha256").update(JSON.stringify(voiceBinding(key))).digest("hex"):"no-voice";}
export function voiceSample(key:VoiceKey){
 try{
  const binding=voiceBinding(key),fingerprint=voiceFingerprint(key);
  if(!binding.voiceId||!binding.model)throw Error();
  const file=join(sampleRoot(),`${key}.json`);if(statSync(file).size>8192)throw Error();
  const manifest=JSON.parse(readFileSync(file,"utf8"));
  if(manifest.fingerprint!==fingerprint||manifest.voiceKey!==key||manifest.verified!==true||manifest.license!=="account-generated-preview-v1"||manifest.accent!==(key.startsWith("TEST_")?"american":"indian")||manifest.gender!==(key.endsWith("_MALE")?"male":"female"))throw Error();
  const path=join(sampleRoot(),`${key}-${fingerprint}.mp3`),size=statSync(path).size;if(size<128||size>2*1024*1024)throw Error();
  const bytes=readFileSync(path);if(createHash("sha256").update(bytes).digest("hex")!==manifest.sha256)throw Error();
  return {bytes,fingerprint,sha256:manifest.sha256 as string};
 }catch{throw new ProjectError("VOICE_UNAVAILABLE","This voice is not ready. Please choose an available voice or try again after setup.",409);}
}
export function catalog():Catalog{
 const voices=voiceKeys.map(key=>{let available=true;try{voiceSample(key);}catch{available=false;}return {key,label:key==="TEST_MALE"?"Brian · American male (testing)":key==="TEST_FEMALE"?"Bella · American female (testing)":key==="INDIAN_MALE"?"Indian male":"Indian female",description:key.startsWith("TEST_")?"For noncommercial testing. Uses free-account credits and an American accent.":key==="INDIAN_MALE"?"A conversational Indian English voice.":"A clear Indian English teaching voice.",available,disabledReason:available?null:"Voice setup or sample verification is incomplete.",previewAvailable:available};});
 return {catalogVersion:"settings-v1-"+createHash("sha256").update(voiceKeys.map(voiceFingerprint).join(":" )).digest("hex").slice(0,16),voices,captionStyles:captionStyles.map(key=>({key,label:key[0]+key.slice(1).toLowerCase(),available:true})),music:[],sceneTypes:["TITLE","PROCESS_FLOW","DIAGRAM","GENERIC_EDITORIAL"].map(key=>({key,label:key.toLowerCase().replaceAll("_"," "),available:true})),limits:{minDurationSeconds:60,maxDurationSeconds:90,captionsRequired:true}};
}
export function requireVoice(key:VoiceKey|null){if(!key)throw new ProjectError("VOICE_REQUIRED","Choose a voice before approving.",409);voiceSample(key);}
