import type {Document} from "mongodb";
export function settingsShape(name:string,original:Document):Document{
 const result=structuredClone(original),p=result.$jsonSchema.properties;
 if(name==="projects"){p.settings.properties.captionStyle={enum:["CLEAN","BOLD","HIGHLIGHTED"]};p.settings.properties.voiceKey={enum:[null,"INDIAN_MALE","INDIAN_FEMALE","TEST_MALE","TEST_FEMALE"]};}
 if(name==="auditEvents")p.action.enum=[...p.action.enum,"PROJECT_SETTINGS_UPDATED"];
 return result;
}
