import {catalogRoute} from "@/server/catalog-http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export function GET(request:Request){return catalogRoute(request,undefined,"catalog");}
