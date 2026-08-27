'use strict';

// Config files edited on Windows routinely carry a UTF-8 BOM, which bare
// JSON.parse rejects. A hook that throws here stops enforcing silently.
function parseJson(text) {
  return JSON.parse(String(text).replace(/^\uFEFF/, ''));
}

module.exports = { parseJson };
