import { NextResponse } from "next/server";
import { runtimeEnv } from "../../../lib/runtime";

function httpsUrl(value?: string){if(!value)return null;try{const url=new URL(value);return url.protocol==="https:"?url.toString():null;}catch{return null;}}
function tawkSegment(value?:string){const segment=value?.trim();return segment&&/^[a-zA-Z0-9_-]+$/.test(segment)?segment:null;}
export async function GET(){const propertyId=tawkSegment(runtimeEnv.TAWK_PROPERTY_ID);const widgetId=tawkSegment(runtimeEnv.TAWK_WIDGET_ID);return NextResponse.json({data:{email:"hello@tvsetravel.com",whatsapp:(runtimeEnv.TVSE_WHATSAPP_NUMBER||"").replace(/\D/g,"")||null,linkedin:httpsUrl(runtimeEnv.TVSE_LINKEDIN_URL),instagram:httpsUrl(runtimeEnv.TVSE_INSTAGRAM_URL),facebook:httpsUrl(runtimeEnv.TVSE_FACEBOOK_URL),turnstileSiteKey:runtimeEnv.TURNSTILE_SITE_KEY||null,tawkEmbedUrl:propertyId&&widgetId?`https://embed.tawk.to/${propertyId}/${widgetId}`:null}},{headers:{"Cache-Control":"public, max-age=60, stale-while-revalidate=300"}});}
