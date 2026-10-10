// Globals the server code expects (Buffer, process). Injected by esbuild into the browser bundle.
import { Buffer as B } from 'buffer';

const fromOrig = B.from.bind(B);
B.from = (v, enc, len) => (enc === 'base64url' ? fromOrig(String(v).replace(/-/g, '+').replace(/_/g, '/'), 'base64') : fromOrig(v, enc, len));
const toStr = B.prototype.toString;
B.prototype.toString = function (enc, ...rest) {
  if (enc === 'base64url') return toStr.call(this, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return toStr.call(this, enc, ...rest);
};

export const Buffer = B;
export const process = { env: { JWT_SECRET: 'mevazor-demo-secret-not-for-production', DEMO_SELLER_BOT: '1' }, argv: [], cwd: () => '/' };
