function sanitizeText(value, maxLength = 255) {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/[<>]/g, '').trim();
  return text.slice(0, maxLength);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isValidUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol);
  } catch (error) {
    return false;
  }
}

function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeText(item, 120)).filter(Boolean);
  }
  return String(value)
    .split(',')
    .map((item) => sanitizeText(item, 120))
    .filter(Boolean);
}

module.exports = {
  sanitizeText,
  isValidEmail,
  isValidUrl,
  normalizeArray,
};
