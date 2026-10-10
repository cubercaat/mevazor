// node:sqlite DatabaseSync API on top of sql.js (SQLite compiled to WebAssembly); the database is persisted to localStorage.
const KEY = `mevazor_demo_db_${__BUILD__}`;
const b64 = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

await new Promise((res, rej) => {
  const s = document.createElement('script');
  s.src = `${__BASE__}/vendor/sql-wasm.js`;
  s.onload = res;
  s.onerror = () => rej(new Error('sql.js failed to load'));
  document.head.append(s);
});
const SQL = await globalThis.initSqlJs({ locateFile: (f) => `${__BASE__}/vendor/${f}` });

export const state = { restored: false };
export class DatabaseSync {
  constructor() {
    let saved = null;
    try {
      if (new URLSearchParams(location.search).has('reset')) {
        Object.keys(localStorage).filter((k) => k.startsWith('mevazor_demo_db_')).forEach((k) => localStorage.removeItem(k));
      } else saved = localStorage.getItem(KEY);
    } catch { /* storage blocked */ }
    this.sql = new SQL.Database(saved ? unb64(saved) : undefined);
    state.restored = !!saved;
    this.timer = 0;
  }
  exec(sql) {
    this.sql.exec(sql);
    this.dirty();
  }
  dirty() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      try { localStorage.setItem(KEY, b64(this.sql.export())); } catch { /* quota: keep working in memory */ }
    }, 800);
  }
  prepare(sql) {
    const db = this;
    const norm = (p) => p.map((x) => (x === undefined ? null : typeof x === 'boolean' ? +x : x));
    const rows = (p) => {
      const st = db.sql.prepare(sql);
      try {
        st.bind(norm(p));
        const out = [];
        while (st.step()) out.push(st.getAsObject());
        return out;
      } finally {
        st.free();
      }
    };
    return {
      all: (...p) => rows(p),
      get: (...p) => rows(p)[0],
      run: (...p) => {
        db.sql.run(sql, norm(p));
        const changes = db.sql.getRowsModified();
        const lastInsertRowid = db.sql.exec('SELECT last_insert_rowid()')[0].values[0][0];
        db.dirty();
        return { changes, lastInsertRowid };
      },
    };
  }
}
