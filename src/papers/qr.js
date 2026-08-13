const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { env } = require('../config/env');
const { ApiError } = require('../middleware/errorHandler');

/**
 * The QR code encodes a signed token (not a raw Mongo id) so a photographed
 * or copied QR can't be used to guess/enumerate other papers, and so a scan
 * app can verify authenticity offline before it ever calls the server.
 * Signed with a secret dedicated to this purpose — compromising it can't be
 * used to forge access tokens, and vice versa.
 */
function signQrToken(paperId) {
  return jwt.sign({ paperId: String(paperId), purpose: 'custody-qr' }, env.qrSigningSecret, {
    algorithm: 'HS256',
    // QR tokens are long-lived (span the whole custody chain), unlike access tokens.
    expiresIn: '180d',
  });
}

function verifyQrToken(token) {
  try {
    const payload = jwt.verify(token, env.qrSigningSecret, { algorithms: ['HS256'] });
    if (payload.purpose !== 'custody-qr') {
      throw new Error('Wrong token purpose');
    }
    return payload;
  } catch (err) {
    throw new ApiError(400, 'Invalid or unrecognized QR token');
  }
}

async function renderQrDataUrl(token) {
  return QRCode.toDataURL(token, { errorCorrectionLevel: 'M', margin: 2 });
}

module.exports = { signQrToken, verifyQrToken, renderQrDataUrl };
