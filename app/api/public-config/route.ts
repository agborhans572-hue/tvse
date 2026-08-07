import { NextResponse } from "next/server";
import { runtimeEnv } from "../../../lib/runtime";

function httpsUrl(value?: string){if(!value)return null;try{const url=new URL(value);return url.protocol==="https:"?url.toString():null;}catch{return null;}}
export async function GET(){return NextResponse.json({data:{email:"hello@tvsetravel.com",whatsapp:(runtimeEnv.TVSE_WHATSAPP_NUMBER||"").replace(/\D/g,"")||null,linkedin:httpsUrl(runtimeEnv.TVSE_LINKEDIN_URL),instagram:httpsUrl(runtimeEnv.TVSE_INSTAGRAM_URL),facebook:httpsUrl(runtimeEnv.TVSE_FACEBOOK_URL)}});}
