// The QR encodes a signed JWT (src/papers/qr.js on the backend) — signature
// verification happens server-side on submit (verifyQrToken in
// tracking.service.js). Decoding the payload here is display-only: JWTs are
// base64url-encoded JSON, not encrypted, so reading `paperId` back out
// needs no secret and proves nothing about authenticity by itself. This is
// purely so the scan screen can show "you're about to log a scan for
// paperId X" before the user commits, working fully offline.
export function decodeQrPayload(token) {
  try {
    const [, payloadSegment] = token.split('.');
    if (!payloadSegment) return null;
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = decodeBase64(padded);
    const payload = JSON.parse(json);
    if (payload.purpose !== 'custody-qr' || !payload.paperId) return null;
    return payload;
  } catch {
    return null;
  }
}

function decodeBase64(base64) {
  // React Native's JS engine (Hermes) has global atob/btoa as of RN 0.74+;
  // this repo's RN version (see package.json) is well past that.
  return atob(base64);
}
