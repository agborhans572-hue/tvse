function hasPrefix(bytes: Uint8Array, expected: number[]) { return expected.every((value, index) => bytes[index] === value); }
function hasAscii(bytes: Uint8Array, offset: number, expected: string) { return expected.split("").every((value, index) => bytes[offset + index] === value.charCodeAt(0)); }

export function signatureMatches(contentType: string, bytes: Uint8Array) {
  if (contentType === "image/jpeg") return hasPrefix(bytes, [0xff, 0xd8, 0xff]);
  if (contentType === "image/png") return hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (contentType === "image/webp") return hasAscii(bytes, 0, "RIFF") && hasAscii(bytes, 8, "WEBP");
  if (contentType === "application/pdf") return hasAscii(bytes, 0, "%PDF-");
  if (contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]);
  return false;
}
