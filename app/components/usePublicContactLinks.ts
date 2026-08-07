"use client";
import { useEffect, useState } from "react";

export type PublicContactLinks={email:string;whatsapp:string|null;linkedin:string|null;instagram:string|null;facebook:string|null};
const fallback:PublicContactLinks={email:"hello@tvsetravel.com",whatsapp:null,linkedin:null,instagram:null,facebook:null};
export function usePublicContactLinks(){const[links,setLinks]=useState(fallback);useEffect(()=>{fetch("/api/public-config").then(async(response)=>response.ok?await response.json() as {data?:PublicContactLinks}:null).then((payload)=>payload?.data&&setLinks(payload.data)).catch(()=>null);},[]);return links;}
