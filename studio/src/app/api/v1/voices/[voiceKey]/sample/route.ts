import {catalogRoute} from "@/server/catalog-http";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{voiceKey:string}>}){return catalogRoute(request,(await params).voiceKey,"sample");}
