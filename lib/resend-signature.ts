export async function verifyResendSignature(body:string,headers:Headers,secret:string|undefined):Promise<boolean>{
  try {
    if(!secret)return false;const id=headers.get("svix-id");const timestamp=headers.get("svix-timestamp");const signatures=headers.get("svix-signature");const timestampNumber=Number(timestamp);
    if(!id||!timestamp||!Number.isFinite(timestampNumber)||!signatures||Math.abs(Date.now()/1000-timestampNumber)>300)return false;
    const keyBytes=Uint8Array.from(atob(secret.replace(/^whsec_/,"")),(char)=>char.charCodeAt(0));const key=await crypto.subtle.importKey("raw",keyBytes,{name:"HMAC",hash:"SHA-256"},false,["sign"]);const signature=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${id}.${timestamp}.${body}`)));let encoded="";signature.forEach((byte)=>{encoded+=String.fromCharCode(byte);});const expected=btoa(encoded);
    return signatures.split(" ").some((item)=>item.startsWith("v1,")&&timingSafeEqual(item.slice(3),expected));
  }catch{return false;}
}
function timingSafeEqual(a:string,b:string){if(a.length!==b.length)return false;let result=0;for(let index=0;index<a.length;index+=1)result|=a.charCodeAt(index)^b.charCodeAt(index);return result===0;}
