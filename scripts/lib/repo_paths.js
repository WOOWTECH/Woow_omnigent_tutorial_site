/** Resolve a checker input to a repository-contained regular file without following an escaping symlink. */
'use strict';

const fs = require('fs');
const path = require('path');

function contained(root, file) {
  const relative = path.relative(root, file);
  return relative === ''
    || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function resolveRepoRegularFile(root, input, label) {
  const file = path.resolve(root, input);
  if (!contained(root, file)) return { file: null, error: `${label} 路徑不可離開 repository root` };
  if (!fs.existsSync(file)) return { file: null, error: `${label} 不存在或不是檔案` };

  let realFile;
  try {
    realFile = fs.realpathSync(file);
  } catch {
    return { file: null, error: `${label} 不存在或不是檔案` };
  }
  if (!contained(root, realFile)) return { file: null, error: `${label} realpath 不可離開 repository root` };

  let stat;
  try {
    stat = fs.statSync(realFile);
  } catch {
    return { file: null, error: `${label} 不存在或不是檔案` };
  }
  if (!stat.isFile()) return { file: null, error: `${label} 不存在或不是檔案` };
  return { file, realFile, error: null };
}

module.exports = { resolveRepoRegularFile };
