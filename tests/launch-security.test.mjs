import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { assertSameOrigin } from "../lib/request-security.ts";
import { signatureMatches } from "../lib/file-signatures.ts";
import { contactSchema, paymentSchema, tripRequestSchema } from "../lib/validation.ts";
import { verifyResendSignature } from "../lib/resend-signature.ts";

const marketing={sourcePath:"/packages/zanzibar",destinationSlug:"zanzibar",packageSlug:"zanzibar-culture-and-coast",utmSource:"newsletter"};
const validTrip={kind:"personal",contactName:"Amina",contactEmail:"amina@example.com",origin:"Nairobi",destination:"Zanzibar",departureDate:"2099-08-12",returnDate:"2099-08-19",travelerCount:2,budgetMinor:30000000,currency:"KES",interests:[],notes:"",consent:true,consentVersion:"2026-08",marketing};

test("public forms require consent and valid future travel dates",()=>{
  assert.equal(tripRequestSchema.safeParse(validTrip).success,true);
  assert.equal(tripRequestSchema.safeParse({...validTrip,departureDate:"2020-01-01",returnDate:"2020-01-08"}).success,false);
  assert.equal(tripRequestSchema.safeParse({...validTrip,returnDate:"2099-08-01"}).success,false);
  assert.equal(tripRequestSchema.safeParse({...validTrip,consent:false}).success,false);
  assert.equal(contactSchema.safeParse({name:"Amina",email:"amina@example.com",type:"personal",message:"Plan a coast trip",consent:false,consentVersion:"2026-08",marketing}).success,false);
});

test("non-cash payments require a reference",()=>{
  assert.equal(paymentSchema.safeParse({amountMinor:10000,currency:"KES",method:"mobile_money",reference:""}).success,false);
  assert.equal(paymentSchema.safeParse({amountMinor:10000,currency:"KES",method:"mobile_money",reference:"MPESA-123"}).success,true);
  assert.equal(paymentSchema.safeParse({amountMinor:10000,currency:"KES",method:"cash",reference:""}).success,true);
});

test("upload validation checks actual file signatures",()=>{
  assert.equal(signatureMatches("image/png",Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),true);
  assert.equal(signatureMatches("image/png",Uint8Array.from([0xff,0xd8,0xff,0x00])),false);
  assert.equal(signatureMatches("application/pdf",new TextEncoder().encode("%PDF-1.7")),true);
});

test("authenticated mutations reject unverifiable or cross-origin requests",()=>{
  assert.doesNotThrow(()=>assertSameOrigin(new Request("https://tvse.test/api/action",{headers:{origin:"https://tvse.test"}})));
  assert.throws(()=>assertSameOrigin(new Request("https://tvse.test/api/action",{headers:{origin:"https://evil.test"}})),/cross-origin/i);
  assert.throws(()=>assertSameOrigin(new Request("https://tvse.test/api/action")),/could not be verified/i);
});

test("Resend webhook signatures are verified and stale replays are rejected",async()=>{
  const rawSecret=Buffer.from("tvse-test-webhook-secret");
  const secret=`whsec_${rawSecret.toString("base64")}`;
  const body=JSON.stringify({type:"email.delivered",data:{email_id:"email_1"}});
  const timestamp=String(Math.floor(Date.now()/1000));const id="evt_test";
  const signature=createHmac("sha256",rawSecret).update(`${id}.${timestamp}.${body}`).digest("base64");
  const headers=new Headers({"svix-id":id,"svix-timestamp":timestamp,"svix-signature":`v1,${signature}`});
  assert.equal(await verifyResendSignature(body,headers,secret),true);
  headers.set("svix-timestamp",String(Number(timestamp)-601));
  assert.equal(await verifyResendSignature(body,headers,secret),false);
});
