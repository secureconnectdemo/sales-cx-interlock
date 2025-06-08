function isValidWebexId(id) {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}
function sanitizeLog(value) {
  return String(value).replace(/[\n\r]/g, "").slice(0, 100);
}
module.exports = { isValidWebexId, sanitizeLog };
