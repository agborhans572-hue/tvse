import { cache } from "react";
import { cookies } from "next/headers";
import { getD1 } from "../db";
import { signOperationsAccessToken } from "./operations-token";
import { operationsServiceKey, operationsTokenKey, publicBaseUrl, runtimeEnv } from "./runtime";
import { createServiceHeaders } from "./service-auth";
import type { Actor } from "./travel";

const routeMode=cache(async(userId:string,organizationId:string|null)=>{
  const tenantKey=organizationId?`org:${organizationId}`:`user:${userId}`;
  const route=await getD1().prepare("SELECT read_mode FROM tenant_routes WHERE tenant_key=? LIMIT 1").bind(tenantKey).first<{read_mode:"core"|"shadow"|"shard"}>();
  return route?.read_mode??"core";
});

const CONSISTENCY_COOKIE="tvse_consistency";

export async function forwardOperationsMutation(request:Request,actor:Actor|null,path:string,input:unknown,publicIdentity?:string):Promise<Response|null>{
  if(!runtimeEnv.OPERATIONS_API_URL)return null;
  if(actor){if(await routeMode(actor.id,actor.organizationId??null)!=="shard")return null;}else{const percent=Math.max(0,Math.min(100,Number(runtimeEnv.OPERATIONS_PUBLIC_WRITE_PERCENT??0)));if(!publicIdentity||percent===0||await stablePercent(publicIdentity)>=percent)return null;}
  let authorization:string|undefined;if(actor){const key=operationsTokenKey();const signed=await signOperationsAccessToken({sub:actor.id,email:actor.email,role:actor.role,organizationId:actor.organizationId??null,source:actor.source,authVersion:actor.authVersion??1},{secret:key.secret,kid:key.id});authorization=`Bearer ${signed.token}`;}
  const url=`${runtimeEnv.OPERATIONS_API_URL.replace(/\/$/u,"")}${path}`;const body=JSON.stringify(input);const serviceHeaders=actor?{}:await createServiceHeaders("POST",url,body,operationsServiceKey());
  const response=await fetch(url,{method:"POST",headers:{Origin:new URL(request.url).origin,"Content-Type":"application/json","Idempotency-Key":request.headers.get("Idempotency-Key")??crypto.randomUUID(),...(authorization?{Authorization:authorization}:serviceHeaders)},body});
  const payload=await response.json() as{data?:unknown;jobs?:unknown[];consistencyToken?:string;requestId?:string;error?:{code?:string;message?:string;fields?:unknown}};
  if(!response.ok)return Response.json({error:payload.error?.message??"The operation failed",code:payload.error?.code,fields:payload.error?.fields,requestId:payload.requestId},{status:response.status});
  const headers=new Headers();if(payload.consistencyToken){const previous=cookieValue(request.headers.get("Cookie"),CONSISTENCY_COOKIE);const merged=mergeConsistency(previous,payload.consistencyToken);headers.set("Set-Cookie",`${CONSISTENCY_COOKIE}=${merged}; Path=/; Max-Age=300; HttpOnly; SameSite=Lax${new URL(request.url).protocol==="https:"?"; Secure":""}`);}
  return Response.json({data:payload.data,jobs:payload.jobs??[],consistencyToken:payload.consistencyToken,requestId:payload.requestId},{status:response.status,headers});
}

async function stablePercent(value:string):Promise<number>{const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value.trim().toLowerCase())));return ((bytes[0]<<8)|bytes[1])%100;}

type ListFilters={q?:string;status?:string;cursor?:string};
async function fetchOperationsList(actor:Actor,resource:string,filters:ListFilters={}):Promise<Record<string,unknown>[]|null>{
  if(!runtimeEnv.OPERATIONS_API_URL)return null;
  const key=operationsTokenKey();const signed=await signOperationsAccessToken({sub:actor.id,email:actor.email,role:actor.role,organizationId:actor.organizationId??null,source:actor.source,authVersion:actor.authVersion??1},{secret:key.secret,kid:key.id});
  const origin=new URL(publicBaseUrl()).origin;const url=new URL(`${runtimeEnv.OPERATIONS_API_URL.replace(/\/$/u,"")}/v2/${resource}`);url.searchParams.set("limit","50");for(const [key,value] of Object.entries(filters))if(value)url.searchParams.set(key,value);const response=await fetch(url,{headers:{Authorization:`Bearer ${signed.token}`,Origin:origin,...await consistencyHeaders()},cache:"no-store"});
  const payload=await response.json() as{data?:{items?:Record<string,unknown>[]};error?:{code?:string;message?:string};requestId?:string};
  if(response.status===409&&payload.error?.code==="CORE_FALLBACK")return null;
  if(!response.ok)throw new Error(`Operations API ${payload.error?.code??response.status}: ${payload.error?.message??"request failed"} (${payload.requestId??"no request id"})`);
  return payload.data?.items??[];
}

export async function listFromOperations(actor:Actor,resource:string,filters:ListFilters={}):Promise<Record<string,unknown>[]|null>{
  if(await routeMode(actor.id,actor.organizationId??null)!=="shard")return null;return fetchOperationsList(actor,resource,filters);
}

export async function scaledListFromOperations(actor:Actor,resource:string,fallback:()=>Promise<Record<string,unknown>[]>,filters:ListFilters={}):Promise<Record<string,unknown>[]>{
  const mode=await routeMode(actor.id,actor.organizationId??null);if(mode==="core")return fallback();
  if(mode==="shard")return(await fetchOperationsList(actor,resource,filters))??await fallback();
  const [core,operational]=await Promise.all([fallback(),fetchOperationsList(actor,resource,filters)]);if(!operational)return core;
  const coreFingerprint=shadowFingerprint(core);const operationalFingerprint=shadowFingerprint(operational);console.log(JSON.stringify({service:"tvse-sites",event:"shadow_read",resource,tenant:actor.organizationId?`org:${actor.organizationId}`:`user:${actor.id}`,match:coreFingerprint===operationalFingerprint,coreCount:core.length,operationalCount:operational.length}));return core;
}

function shadowFingerprint(rows:Record<string,unknown>[]):string{return JSON.stringify(rows.map((row)=>({id:row.id,status:row.status,total:row.total_minor,paid:row.paid_minor,due:row.due_minor,organization:row.organization_id,user:row.user_id,updated:row.updated_at})).sort((left,right)=>String(left.id).localeCompare(String(right.id))));}

export async function overviewFromOperations(actor:Actor):Promise<{metrics:Record<string,unknown>;recent:Record<string,unknown>[]} | null>{
  if(!runtimeEnv.OPERATIONS_API_URL)return null;const mode=await routeMode(actor.id,actor.organizationId??null);if(mode!=="shard")return null;
  const key=operationsTokenKey();const signed=await signOperationsAccessToken({sub:actor.id,email:actor.email,role:actor.role,organizationId:actor.organizationId??null,source:actor.source,authVersion:actor.authVersion??1},{secret:key.secret,kid:key.id});const origin=new URL(publicBaseUrl()).origin;
  const response=await fetch(`${runtimeEnv.OPERATIONS_API_URL.replace(/\/$/u,"")}/v2/overview`,{headers:{Authorization:`Bearer ${signed.token}`,Origin:origin,...await consistencyHeaders()},cache:"no-store"});const payload=await response.json() as{data?:{metrics:Record<string,unknown>;recent:Record<string,unknown>[]};error?:{code?:string;message?:string};requestId?:string};if(response.status===409&&payload.error?.code==="CORE_FALLBACK")return null;if(!response.ok||!payload.data)throw new Error(`Operations API ${payload.error?.code??response.status}: ${payload.error?.message??"request failed"} (${payload.requestId??"no request id"})`);return payload.data;
}

export async function reportsFromOperations(actor:Actor):Promise<{pipeline:Record<string,unknown>[];finance:Record<string,unknown>[];totals:Record<string,unknown>}|null>{
  if(!runtimeEnv.OPERATIONS_API_URL)return null;const mode=await routeMode(actor.id,actor.organizationId??null);if(mode!=="shard")return null;const key=operationsTokenKey();const signed=await signOperationsAccessToken({sub:actor.id,email:actor.email,role:actor.role,organizationId:actor.organizationId??null,source:actor.source,authVersion:actor.authVersion??1},{secret:key.secret,kid:key.id});const response=await fetch(`${runtimeEnv.OPERATIONS_API_URL.replace(/\/$/u,"")}/v2/reports`,{headers:{Authorization:`Bearer ${signed.token}`,Origin:new URL(publicBaseUrl()).origin,...await consistencyHeaders()},cache:"no-store"});const payload=await response.json() as{data?:{pipeline:Record<string,unknown>[];finance:Record<string,unknown>[];totals:Record<string,unknown>};error?:{code?:string;message?:string}};if(response.status===409&&payload.error?.code==="CORE_FALLBACK")return null;if(!response.ok||!payload.data)throw new Error(payload.error?.message??"Operations reports failed");return payload.data;
}

async function consistencyHeaders():Promise<Record<string,string>>{const value=(await cookies()).get(CONSISTENCY_COOKIE)?.value;return value?{"X-TVSE-Consistency":value}:{};}
function cookieValue(header:string|null,name:string):string|null{for(const part of (header??"").split(";")){const [key,...rest]=part.trim().split("=");if(key===name)return rest.join("=");}return null;}
function mergeConsistency(previous:string|null,current:string):string{try{const next=decodeConsistency(current);if(!previous)return current;const prior=decodeConsistency(previous);const bookmarks={...(prior.bookmarks??{}),...(next.bookmarks??{})};return Object.keys(bookmarks).length?encodeConsistency({version:1,bookmarks}):current;}catch{return current;}}
function decodeConsistency(value:string):{version?:number;bookmark?:string;bookmarks?:Record<string,string>}{const padded=value.replaceAll("-","+").replaceAll("_","/").padEnd(Math.ceil(value.length/4)*4,"=");return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded),(character)=>character.charCodeAt(0)))) as {version?:number;bookmark?:string;bookmarks?:Record<string,string>};}
function encodeConsistency(value:unknown):string{let binary="";for(const byte of new TextEncoder().encode(JSON.stringify(value)))binary+=String.fromCharCode(byte);return btoa(binary).replaceAll("+","-").replaceAll("/","_").replace(/=+$/u,"");}
