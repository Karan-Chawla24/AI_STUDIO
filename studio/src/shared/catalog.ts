export const voiceKeys=["INDIAN_MALE","INDIAN_FEMALE","TEST_MALE","TEST_FEMALE"] as const;
export type VoiceKey=typeof voiceKeys[number];
export const captionStyles=["CLEAN","BOLD","HIGHLIGHTED"] as const;
export type CaptionStyle=typeof captionStyles[number];
export type Catalog={catalogVersion:string;voices:{key:VoiceKey;label:string;description:string;available:boolean;disabledReason:string|null;previewAvailable:boolean}[];captionStyles:{key:CaptionStyle;label:string;available:boolean}[];music:{id:string;label:string;attribution:string;durationSeconds:number;available:boolean}[];sceneTypes:{key:string;label:string;available:boolean}[];limits:{minDurationSeconds:number;maxDurationSeconds:number;captionsRequired:true}};
