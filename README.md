# Mevazor — fruit-only marketplace

Two apps on one Node server, no build step and **no npm dependencies** (Node ≥ 22.5, uses the built-in `node:sqlite`).

| App | URL | Language |
|---|---|---|
| Customer app (mobile + desktop) | `http://localhost:3000/` | UZ / RU / EN (default Uzbek), UZS |
| Admin panel (admins, sellers, couriers) | `http://localhost:3000/admin/` | UZ / RU / EN (default Uzbek) |

```bash
npm start            # first start seeds demo data into data/mevazor.db
npm run seed         # wipe + reseed
node scripts/e2e.mjs # 39 API checks: RBAC, validation, full order → return lifecycle
```

## Demo accounts (change/delete before any real deployment)

| Role | Login | Password |
|---|---|---|
| Customer | `+998901234567` | `Demo#2026` |
| SUPER_ADMIN | `admin@mevazor.uz` | `Admin#2026` |
| ADMIN (limited permissions) | `moderator@mevazor.uz` | `Moder#2026` |
| SELLER | `samarqand@mevazor.uz` (also `fargona@`, `fresh@`, `xorazm@`) | `Seller#2026` |
| COURIER | `courier1@mevazor.uz` … `courier4@` | `Courier#2026` |

## The core flow (as built)

1. Customer picks fruit → cart (per-kg quantities, 0.5 kg steps, presets or custom).
2. **Buyurtma berish** creates one *draft* order per seller. **Nothing reaches the seller yet.**
3. Confirmation screen: *“Buyurtmani tasdiqlashdan oldin sotuvchiga savolingiz bormi?”*
   - **Sotuvchi bilan bog‘lanish** → chat tied to that order (quick-question chips, photo, product reference, read ticks, online status). A banner in the chat lets them come back and confirm.
   - **Savolsiz, buyurtmani tasdiqlash** → confirmed immediately. Chatting is never forced.
4. Confirming reserves stock and sends the order to the seller → seller accepts → prepares → hands to courier (courier auto-assigned) → on the way → delivered.
5. Customer inspects the fruit: **Hammasi yaxshi** (completed, can review) or **Meva yoqmadi** (return request with reason/photos). If approved the fruit price is not charged; only the delivery fee (configurable: delivery fee / fixed / free) is payable. Stock is restored.
6. Payment is always *Yetkazib berilganda to‘lash* (cash on delivery); there is no online card flow.

## Architecture

```
server/
  index.js        http server, static files, security headers, router dispatch
  db.js           node:sqlite + full relational schema (22 tables)
  domain.js       product queries, order state machine (setStatus), fees, ratings
  seed.js         deterministic demo data (30 days of orders, chats, reviews, returns)
  lib/            http (router/errors), auth (scrypt + HS256 JWT, RBAC guards), util (validation, rate limit, uploads, audit)
  routes/         shop.js (public + customer), chat.js, admin.js (staff API)
public/
  shared/         api client, icons, fruit art, toasts, dialogs, base CSS (used by both apps)
  app/            customer SPA (hash router, reusable product card, skeletons, sheets)
  admin/          admin SPA (role-aware sidebar, drawers, SVG charts written from scratch)
```

**Tables:** users, customers, sellers, couriers, admin_users, categories, products, product_images, addresses, favorites, promotions, delivery_settings, orders, order_items, order_status_history, chats, messages, reviews, returns, notifications, audit_logs. Order items snapshot name/price so catalogue edits never change history.

## Security implemented

- **Auth:** scrypt password hashes, signed JWTs (14 d), user re-checked on every request so blocking is immediate.
- **RBAC:** `CUSTOMER / SELLER / COURIER / ADMIN / SUPER_ADMIN`. Admin permissions are per-module (`admin_users.permissions`); sellers are row-scoped to their own products/orders/chats; couriers only see assigned orders. Order status transitions are validated per role.
- **Input validation** on every write (types, ranges, enums, phone format); parametrised SQL only; all UI output HTML-escaped; CSP (`script-src 'self'`).
- **Uploads:** JSON base64 → magic-byte check (PNG/JPG/WEBP), 3 MB limit, random file names, only our own `/uploads/…` URLs are accepted back.
- **Rate limiting:** global per IP, tighter on login/register/orders/uploads/messages.
- **Audit log** for staff actions (products, orders, returns, team, settings…), visible to SUPER_ADMIN.

## Honest notes / what to do before production

- **Imagery:** I can't ship licensed fruit photography, so fruit are rendered as illustrated artwork (emoji + custom SVG for pomegranate, apricot, plum, fig, raspberry). Sellers/admins can upload real photos per product (up to 8) and those replace the illustration everywhere automatically.
- **Chat** uses 3 s polling, not WebSockets. A **demo seller auto-reply** answers when a seller is marked online (set `DEMO_SELLER_BOT=0` to disable; real sellers reply from the admin panel).
- Rate limiting and sessions are in-memory/stateless → fine for one instance; use Redis/Postgres + HTTPS + a reverse proxy when scaling out. Set `JWT_SECRET` in the environment.
- Maps / live courier GPS, SMS/OTP login, push notifications and online payments are intentionally out of scope for v1.

## Photos

Fruit imagery is real photography from Wikimedia Commons (free licences) in `public/photos/`. Author and licence for every file are in `public/photos/CREDITS.json` and shown in the app footer ("Foto manbalari"). Re-download with `node scripts/fetch-photos.mjs`. Fruit you add in the admin panel use the photos you upload; the built-in catalogue gets its photo automatically at startup.

## Languages (uz / ru / en)

Both apps have a language button (globe icon, top bar; customer app also under Profil → Sozlamalar). The choice is remembered per app. Translation is done at runtime by `public/shared/i18n.js` from dictionaries in `public/shared/i18n-common.js` (catalogue data, statuses, server messages), `public/app/i18n-app.js` and `public/admin/i18n-admin*.js`. Add a new string by adding a `[uz, ru, en]` tuple (`{1}` = placeholder). Content typed by admins/sellers (new fruit names, descriptions, etc.) is shown as entered — only the built-in catalogue is translated.

## Deploy

```bash
docker build -t mevazor .
docker run -p 3000:3000 -v mevazor-data:/data -e JWT_SECRET=change-me mevazor
```

`render.yaml` deploys the same image to Render in one click (free plan = database resets on each deploy). GitHub Pages cannot host this app because it needs the Node server. Change the demo passwords before real use.
