"use client";
import { useEffect, useState } from "react";

export type PublicContactLinks={email:string;whatsapp:string|null;linkedin:string|null;instagram:string|null;facebook:string|null;turnstileSiteKey:string|null;tawkEmbedUrl:string|null};
const fallback:PublicContactLinks={email:"hello@tvsetravel.com",whatsapp:null,linkedin:null,instagram:null,facebook:null,turnstileSiteKey:null,tawkEmbedUrl:null};
let cached=fallback;
let pending:Promise<void>|null=null;
const listeners=new Set<(links:PublicContactLinks)=>void>();
function loadOnce(){pending??=fetch("/api/public-config",{cache:"force-cache"}).then(async(response)=>response.ok?await response.json() as {data?:PublicContactLinks}:null).then((payload)=>{if(payload?.data){cached=payload.data;for(const listener of listeners)listener(cached);}}).catch(()=>undefined);return pending;}
export function usePublicContactLinks(){const[links,setLinks]=useState(cached);useEffect(()=>{listeners.add(setLinks);void loadOnce();return()=>{listeners.delete(setLinks);};},[]);return links;}
