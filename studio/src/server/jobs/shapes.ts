import {isDeepStrictEqual} from "node:util";
import type {Document} from "mongodb";
export function jobsShape(original:Document){
 const result=structuredClone(original),route=result.$jsonSchema?.properties?.routeKey;
 if(route?.pattern)route.pattern=route.pattern.replace("jobs/[0-9a-f-]{36}/cancel","jobs/[0-9a-f-]{36}/(?:cancel|retry)");
 return result;
}
// Historical checksums remain immutable while verifiers recognize the exact additive F14 shape.
export const matchesJobsShape=(actual:unknown,expected:Document)=>isDeepStrictEqual(actual,expected)||isDeepStrictEqual(actual,jobsShape(expected));
