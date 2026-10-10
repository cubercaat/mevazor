// The demo has no disk: uploads are returned as data URLs by server/lib/util.js when globalThis.__DEMO__ is set.
export const mkdirSync = () => {};
export const writeFileSync = () => {};
export const existsSync = () => true;
export const readFileSync = () => {
  throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
};
