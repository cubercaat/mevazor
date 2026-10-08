/* Dependency-free interactive SVG charts (line/area, bars, donut). Each draws into a container and re-renders on resize. */
import { esc, num } from '/shared/core.js';

export const PALETTE = ['#4F46E5', '#0EA5A4', '#F59E0B', '#E11D48', '#8B5CF6', '#64748B'];
const nice = (max) => {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const n = max / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};
const compact = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${n}`);

function host(el, draw) {
  let raf;
  const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (el.isConnected && el.clientWidth) draw(el.clientWidth); }); };
  new ResizeObserver(run).observe(el);
  run();
}
function tooltip(el) {
  const t = document.createElement('div');
  t.className = 'tip';
  el.append(t);
  return {
    show(x, y, html) { t.innerHTML = html; t.style.left = `${Math.max(70, Math.min(el.clientWidth - 70, x))}px`; t.style.top = `${y}px`; t.style.opacity = 1; },
    hide() { t.style.opacity = 0; },
  };
}

/**
 * Line/area chart. series: [{name, color, values:[n], fmt?}], labels: [string]
 */
export function lineChart(el, { labels, series, height = 240, fmt = (v) => num(v), area = true, tickEvery }) {
  el.classList.add('chart');
  host(el, (W) => {
    const H = height;
    const m = { l: 44, r: 10, t: 10, b: 26 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const max = nice(Math.max(1, ...series.flatMap((s) => s.values)));
    const x = (i) => m.l + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
    const y = (v) => m.t + ih - (v / max) * ih;
    const ticks = 4;
    let svg = `<svg width="${W}" height="${H}" role="img"><defs>${series.map((s, k) => `<linearGradient id="g${k}${el.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".22"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`).join('')}</defs><g class="grid">`;
    for (let i = 0; i <= ticks; i++) { const v = (max / ticks) * i; svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${compact(v)}</text>`; }
    svg += '</g>';
    const every = tickEvery || Math.ceil(labels.length / Math.max(2, Math.floor(iw / 62)));
    labels.forEach((l, i) => { if (i % every === 0 || i === labels.length - 1) svg += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>`; });
    series.forEach((s, k) => {
      const pts = s.values.map((v, i) => [x(i), y(v)]);
      const d = pts.map((p, i) => (i ? `L${p[0]},${p[1]}` : `M${p[0]},${p[1]}`)).join('');
      // smooth with simple cubic
      const smooth = pts.map((p, i) => { if (!i) return `M${p[0]},${p[1]}`; const q = pts[i - 1]; const cx = (p[0] + q[0]) / 2; return `C${cx},${q[1]} ${cx},${p[1]} ${p[0]},${p[1]}`; }).join('');
      if (area) svg += `<path d="${smooth}L${pts.at(-1)[0]},${m.t + ih}L${pts[0][0]},${m.t + ih}Z" fill="url(#g${k}${el.id})"/>`;
      svg += `<path d="${pts.length > 1 ? smooth : d}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="ln" style="stroke-dasharray:3000;stroke-dashoffset:3000;animation:draw 1.2s ease forwards"/>`;
    });
    svg += `<line id="cx" y1="${m.t}" y2="${m.t + ih}" stroke="#94A3B8" stroke-dasharray="3 3" opacity="0"/><g id="dots"></g><rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" id="hit"/></svg>`;
    el.querySelector('svg')?.remove();
    el.insertAdjacentHTML('afterbegin', svg);
    if (!document.getElementById('chart-kf')) { const st = document.createElement('style'); st.id = 'chart-kf'; st.textContent = '@keyframes draw{to{stroke-dashoffset:0}}'; document.head.append(st); }
    const tip = el._tip || (el._tip = tooltip(el));
    const hit = el.querySelector('#hit');
    const cx = el.querySelector('#cx');
    const dots = el.querySelector('#dots');
    hit.addEventListener('mousemove', (e) => {
      const r = hit.getBoundingClientRect();
      const i = Math.max(0, Math.min(labels.length - 1, Math.round(((e.clientX - r.left) / r.width) * (labels.length - 1))));
      cx.setAttribute('x1', x(i)); cx.setAttribute('x2', x(i)); cx.setAttribute('opacity', 1);
      dots.innerHTML = series.map((s) => `<circle cx="${x(i)}" cy="${y(s.values[i])}" r="4.5" fill="#fff" stroke="${s.color}" stroke-width="2.4"/>`).join('');
      tip.show(x(i), Math.min(...series.map((s) => y(s.values[i]))), `<b>${esc(labels[i])}</b>${series.map((s) => `<div class="r"><span><i style="background:${s.color}"></i>${esc(s.name)}</span><span>${(s.fmt || fmt)(s.values[i])}</span></div>`).join('')}`);
    });
    hit.addEventListener('mouseleave', () => { cx.setAttribute('opacity', 0); dots.innerHTML = ''; tip.hide(); });
  });
}

/** Vertical bar chart. data: [{label, value, color?}] */
export function barChart(el, { data, height = 220, color = '#4F46E5', fmt = (v) => num(v), name = 'Value' }) {
  el.classList.add('chart');
  host(el, (W) => {
    const H = height;
    const m = { l: 40, r: 6, t: 10, b: 26 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const max = nice(Math.max(1, ...data.map((d) => d.value)));
    const bw = Math.min(46, (iw / data.length) * 0.6);
    const step = iw / data.length;
    let svg = `<svg width="${W}" height="${H}"><g class="grid">`;
    for (let i = 0; i <= 4; i++) { const v = (max / 4) * i; const yy = m.t + ih - (v / max) * ih; svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}"/><text x="${m.l - 8}" y="${yy + 4}" text-anchor="end">${compact(v)}</text>`; }
    svg += '</g>';
    data.forEach((d, i) => {
      const h = (d.value / max) * ih;
      svg += `<rect class="bar-r" data-i="${i}" x="${m.l + step * i + (step - bw) / 2}" y="${m.t + ih - h}" width="${bw}" height="${Math.max(h, 0)}" rx="6" fill="${d.color || color}"></rect><text x="${m.l + step * i + step / 2}" y="${H - 6}" text-anchor="middle">${esc(d.label)}</text>`;
    });
    svg += '</svg>';
    el.querySelector('svg')?.remove();
    el.insertAdjacentHTML('afterbegin', svg);
    const tip = el._tip || (el._tip = tooltip(el));
    el.querySelectorAll('.bar-r').forEach((r) => {
      r.addEventListener('mouseenter', () => { el.classList.add('hv'); r.classList.add('hot'); const d = data[+r.dataset.i]; tip.show(+r.getAttribute('x') + bw / 2, +r.getAttribute('y'), `<b>${esc(d.label)}</b><div class="r"><span>${esc(name)}</span><span>${fmt(d.value)}</span></div>`); });
      r.addEventListener('mouseleave', () => { el.classList.remove('hv'); r.classList.remove('hot'); tip.hide(); });
    });
  });
}

/** Donut with an interactive legend. data: [{label, value, color?}] */
export function donut(el, { data, center = '', centerSub = '', fmt = (v) => num(v) }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const R = 62;
  const C = 2 * Math.PI * R;
  let off = 0;
  const arcs = data.map((d, i) => {
    const len = (d.value / total) * C;
    const a = { ...d, color: d.color || PALETTE[i % PALETTE.length], len, off, i };
    off += len;
    return a;
  });
  el.classList.add('donut-wrap');
  el.innerHTML = `<div class="chart" style="width:150px;height:150px"><svg width="150" height="150" viewBox="0 0 150 150"><g transform="rotate(-90 75 75)">
    <circle cx="75" cy="75" r="${R}" fill="none" stroke="#EDF0F6" stroke-width="18"/>
    ${arcs.map((a) => `<circle class="arc" data-i="${a.i}" cx="75" cy="75" r="${R}" fill="none" stroke="${a.color}" stroke-width="18" stroke-dasharray="${Math.max(a.len - 2, 0)} ${C}" stroke-dashoffset="${-a.off}" style="transition:stroke-width .15s,opacity .15s;cursor:pointer"/>`).join('')}</g>
    <text x="75" y="72" text-anchor="middle" style="font-size:22px;font-weight:700;fill:#0F172A" id="dc">${esc(center)}</text><text x="75" y="90" text-anchor="middle" id="ds">${esc(centerSub)}</text></svg></div>
    <div class="donut-list">${arcs.map((a) => `<div data-i="${a.i}"><i style="background:${a.color}"></i><span>${esc(a.label)}</span><b>${fmt(a.value)}</b></div>`).join('')}</div>`;
  const dc = el.querySelector('#dc');
  const ds = el.querySelector('#ds');
  const set = (i) => {
    el.querySelectorAll('.arc').forEach((c) => { const on = i == null || +c.dataset.i === i; c.style.opacity = on ? 1 : 0.3; c.setAttribute('stroke-width', i != null && +c.dataset.i === i ? 22 : 18); });
    el.querySelectorAll('.donut-list div').forEach((d) => d.classList.toggle('hot', i != null && +d.dataset.i === i));
    if (i == null) { dc.textContent = center; ds.textContent = centerSub; } else { dc.textContent = `${Math.round((arcs[i].value / total) * 100)}%`; ds.textContent = arcs[i].label.slice(0, 16); }
  };
  el.querySelectorAll('.arc, .donut-list div').forEach((n) => { n.addEventListener('mouseenter', () => set(+n.dataset.i)); n.addEventListener('mouseleave', () => set(null)); });
}

/** Horizontal ranking bars. rows: [{label, sub?, value, art?, tint?}] */
export function rankBars(rows, fmt = (v) => num(v), artFn = () => '') {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<div class="hbar">${rows.map((r) => `<div class="hbar-row"><span class="em" style="background:${r.tint || '#EEF0FF'}">${artFn(r)}</span><div><div class="nm"><b>${esc(r.label)}</b><span class="muted" style="color:var(--muted)">${esc(r.sub || '')}</span></div><div class="tr"><i style="width:${Math.round((r.value / max) * 100)}%"></i></div></div><b>${fmt(r.value)}</b></div>`).join('')}</div>`;
}
