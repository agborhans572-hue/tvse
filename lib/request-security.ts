export class HttpError extends Error {
  status:number;
  headers?: HeadersInit;
  constructor(message:string,status:number,headers?:HeadersInit){super(message);this.status=status;this.headers=headers;}
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin) {
    if (origin !== new URL(request.url).origin) throw new HttpError("Cross-origin request rejected", 403);
    return;
  }
  if (fetchSite !== "same-origin") throw new HttpError("Request origin could not be verified", 403);
}

export function idempotencyKey(request: Request): string | null {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value) return null;
  if (value.length < 8 || value.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new HttpError("Invalid Idempotency-Key header", 400);
  return value;
}

export function requireIdempotencyKey(request: Request): string {
  const key = idempotencyKey(request);
  if (!key) throw new HttpError("A valid Idempotency-Key header is required", 400);
  return key;
}
