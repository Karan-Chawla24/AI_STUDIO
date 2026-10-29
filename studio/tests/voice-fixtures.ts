import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {voiceKeys} from "../src/shared/catalog";
import {voiceFingerprint} from "../src/server/catalog";
export function prepareVoiceFixtures(audio=Buffer.alloc(256,1)){
 const dir=mkdtempSync(join(tmpdir(),"studio-voice-fixture-"));
 const keys=["VOICE_SAMPLES_DIRECTORY","ELEVENLABS_MODEL",...voiceKeys.map(k=>`ELEVENLABS_${k}_ID`)];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.VOICE_SAMPLES_DIRECTORY=dir;process.env.ELEVENLABS_MODEL="test-model";
 for(const key of voiceKeys){process.env[`ELEVENLABS_${key}_ID`]=`fixture-${key}`;const fingerprint=voiceFingerprint(key),bytes=audio;writeFileSync(join(dir,`${key}-${fingerprint}.mp3`),bytes);writeFileSync(join(dir,`${key}.json`),JSON.stringify({voiceKey:key,fingerprint,sha256:createHash("sha256").update(bytes).digest("hex"),verified:true,accent:key.startsWith("TEST_")?"american":"indian",gender:key.endsWith("_MALE")?"male":"female",license:"account-generated-preview-v1"}));}
 return ()=>{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}rmSync(dir,{recursive:true,force:true});};
}
