const norm = (p) => {
  const out = [];
  for (const s of p.split('/')) {
    if (!s || s === '.') continue;
    if (s === '..') out.pop();
    else out.push(s);
  }
  return '/' + out.join('/');
};
export const sep = '/';
export const resolve = (...parts) => norm(parts.join('/'));
export const join = (...parts) => norm(parts.join('/'));
export const normalize = norm;
export const dirname = (p) => norm(p).split('/').slice(0, -1).join('/') || '/';
export const extname = (p) => {
  const m = /\.[^./]+$/.exec(p);
  return m ? m[0] : '';
};
