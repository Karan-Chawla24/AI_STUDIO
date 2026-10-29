import {loadEnvConfig} from "@next/env";
import {mkdir,writeFile,rename} from "node:fs/promises";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {voiceKeys} from "../src/shared/catalog";
import {voiceBinding,voiceFingerprint,voiceSample,sampleRoot} from "../src/server/catalog";
loadEnvConfig(process.cwd(),true,{info:()=>{},error:()=>{}});
async function main(){
 const apiKey=process.env.ELEVENLABS_API_KEY;if(!apiKey)throw Error();await mkdir(sampleRoot(),{recursive:true});
 const requested=process.argv.slice(2);if(requested.some(k=>!voiceKeys.includes(k as never)))throw Error();
 for(const voiceKey of voiceKeys.filter(k=>!requested.length||requested.includes(k))){
  try{voiceSample(voiceKey);console.log(`${voiceKey}: verified cached sample retained`);continue;}catch{}
  const binding=voiceBinding(voiceKey),fingerprint=voiceFingerprint(voiceKey);if(!binding.voiceId||!binding.model)throw Error();
  const headers={"xi-api-key":apiKey,"Content-Type":"application/json"};
  const info=await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(binding.voiceId)}`,{headers,signal:AbortSignal.timeout(30000)});const metadata=await info.json();
  const gender=voiceKey.endsWith("_MALE")?"male":"female";
  if(!info.ok||metadata.labels?.accent?.toLowerCase()!==(voiceKey.startsWith("TEST_")?"american":"indian")||metadata.labels?.gender?.toLowerCase()!==gender){console.error(`${voiceKey}: voice metadata did not pass validation`);process.exitCode=1;continue;}
  // Operator-only preparation. Runtime preview endpoints never generate speech or accept text.
  const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(binding.voiceId)}/with-timestamps?output_format=mp3_44100_128`,{method:"POST",headers,signal:AbortSignal.timeout(120000),body:JSON.stringify({text:"Here is how your educational video will sound. Clear ideas, one simple explanation at a time.",model_id:binding.model,voice_settings:binding.settings,seed:42})});
  if(!response.ok){console.error(`${voiceKey}: sample generation rejected (HTTP ${response.status}); no automatic retry`);process.exitCode=1;continue;}
  const result=await response.json();if(typeof result.audio_base64!=="string")throw Error();const bytes=Buffer.from(result.audio_base64,"base64");if(bytes.length<128||bytes.length>2*1024*1024)throw Error();
  await writeFile(join(sampleRoot(),`${voiceKey}-${fingerprint}.mp3`),bytes);
  const manifest={voiceKey,fingerprint,sha256:createHash("sha256").update(bytes).digest("hex"),verified:true,accent:metadata.labels.accent.toLowerCase(),gender,license:"account-generated-preview-v1",createdAt:new Date().toISOString()};
  const temporary=join(sampleRoot(),`${voiceKey}.json.tmp`);await writeFile(temporary,JSON.stringify(manifest,null,2));await rename(temporary,join(sampleRoot(),`${voiceKey}.json`));voiceSample(voiceKey);console.log(`${voiceKey}: generated and verified a fixed preview sample`);
 }
}
main().catch(()=>{console.error("VOICE_SAMPLE_SETUP_FAILED: inspect configuration; do not blindly retry an uncertain paid request.");process.exitCode=1;});
