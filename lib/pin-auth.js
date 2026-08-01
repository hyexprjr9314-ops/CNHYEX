import crypto from 'node:crypto';

export function normalizeLoginId(value) {
  return String(value || '').normalize('NFKC').trim().toUpperCase();
}

export function normalizeLoginName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isValidLoginName(value) {
  const name = normalizeLoginName(value);
  return /^[\p{L}\p{N} .·-]{1,40}$/u.test(name);
}

export function isAllowedPin(pin, comparison = '') {
  if (!/^\d{6}$/.test(pin)) return false;
  if (/^(\d)\1{5}$/.test(pin)) return false;
  if (['012345', '123456', '234567', '345678', '456789', '987654', '876543', '765432', '654321'].includes(pin)) return false;
  return !String(comparison).replace(/\D/g, '').endsWith(pin);
}

export function pinAuthPassword(pin, loginId, secret) {
  return `${crypto.createHmac('sha256', secret).update(`${normalizeLoginId(loginId)}:${pin}`).digest('base64url')}Aa1!`;
}

export function activationCodeHash(code, secret) {
  return crypto.createHmac('sha256', secret).update(`pin-activation:${code}`).digest('hex');
}
