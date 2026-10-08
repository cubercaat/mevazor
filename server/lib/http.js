export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const badRequest = (m, d) => new HttpError(400, m, d);
export const unauthorized = (m = 'Tizimga kiring') => new HttpError(401, m);
export const forbidden = (m = 'Ruxsat yo\'q') => new HttpError(403, m);
export const notFound = (m = 'Topilmadi') => new HttpError(404, m);
export const conflict = (m) => new HttpError(409, m);

export async function readJson(req, limit = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'So\'rov hajmi juda katta');
    chunks.push(c);
  }
  if (!size) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw badRequest('JSON noto\'g\'ri');
  }
}

/** Minimal router: patterns like /api/orders/:id, async handlers, guard chain. */
export class Router {
  routes = [];
  add(method, pattern, ...handlers) {
    const keys = [];
    const re = new RegExp(
      '^' + pattern.replace(/:([a-z_]+)/gi, (_, k) => (keys.push(k), '([^/]+)')) + '/?$',
    );
    this.routes.push({ method, re, keys, handlers });
  }
  get = (p, ...h) => this.add('GET', p, ...h);
  post = (p, ...h) => this.add('POST', p, ...h);
  put = (p, ...h) => this.add('PUT', p, ...h);
  patch = (p, ...h) => this.add('PATCH', p, ...h);
  delete = (p, ...h) => this.add('DELETE', p, ...h);

  match(method, path) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route: r, params };
    }
    return { pathMatched };
  }
}

export const sendJson = (res, status, data) => {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
};
