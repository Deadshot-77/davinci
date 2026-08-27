'use strict';

const DOUBLE_SLASH = '\u0000';
const DOUBLE = '\u0001';

function globToRegExp(glob) {
  let re = glob.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  re = re.split('**/').join(DOUBLE_SLASH);
  re = re.split('**').join(DOUBLE);
  re = re.split('*').join('[^/]*');
  re = re.split(DOUBLE_SLASH).join('(?:.*/)?');
  re = re.split(DOUBLE).join('.*');
  return new RegExp('^' + re + '$');
}

function matchAny(relPath, globs) {
  return globs.some((g) => globToRegExp(g).test(relPath));
}

module.exports = { globToRegExp, matchAny };
