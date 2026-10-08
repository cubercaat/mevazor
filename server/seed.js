import { db, q, tx } from './db.js';
import { hashPassword } from './lib/auth.js';
import { ensureDemoPhotos } from './photos.js';
import { fileURLToPath } from 'node:url';

const TABLES = ['audit_logs', 'notifications', 'returns', 'reviews', 'messages', 'chats', 'order_status_history', 'order_items', 'orders', 'favorites', 'addresses', 'product_images', 'products', 'categories', 'promotions', 'delivery_settings', 'couriers', 'sellers', 'admin_users', 'customers', 'users'];

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (ms) => new Date(ms).toISOString();

const CATEGORIES = [
  ['olma', 'Olma', '🍎'], ['banan', 'Banan', '🍌'], ['uzum', 'Uzum', '🍇'], ['sitrus', 'Sitrus mevalar', '🍊'],
  ['rezavorlar', 'Rezavorlar', '🍓'], ['tropik', 'Tropik mevalar', '🥭'], ['mavsumiy', 'Mavsumiy mevalar', '🍉'], ['mahalliy', 'Mahalliy mevalar', '🍐'],
];

const SELLERS = [
  { store: "Samarqand Bog'lari", owner: 'Aziz Rahimov', phone: '+998901110011', email: 'samarqand@mevazor.uz', addr: 'Samarqand sh., Registon ko\'chasi 14', emoji: '🍎', desc: 'Samarqand vodiysidagi o\'z bog\'larimizdan yangi uzilgan mevalar.', rating: 4.8 },
  { store: "Farg'ona Vodiysi", owner: 'Dilshod Karimov', phone: '+998901110022', email: 'fargona@mevazor.uz', addr: 'Farg\'ona sh., Mustaqillik 22', emoji: '🍑', desc: 'Shaftoli, o\'rik va uzumning eng sara navlari.', rating: 4.7 },
  { store: 'Toshkent Fresh Market', owner: 'Malika Yusupova', phone: '+998901110033', email: 'fresh@mevazor.uz', addr: 'Toshkent, Chilonzor 9-kvartal', emoji: '🥭', desc: 'Import va tropik mevalar, har kuni yangi partiya.', rating: 4.6 },
  { store: 'Xorazm Mevalari', owner: 'Javlon Matyakubov', phone: '+998901110044', email: 'xorazm@mevazor.uz', addr: 'Urganch sh., Al-Xorazmiy 5', emoji: '🍈', desc: 'Xorazm qovun-tarvuzi va quritilgan sifatli mevalar.', rating: 4.9 },
];

// name, cat, price, disc, stock, size, quality, origin, art, tint, seller#, [popular,new,seasonal], delivery[min,max], sold, description, harvest
const FRUITS = [
  ['Qizil olma', 'olma', 28000, 0, 320, "O'rtacha", 'Premium', "O'zbekiston", '🍎', '#FBE3DF', 0, [1, 0, 0], [30, 60], 940, 'Qarsildoq, sershira va yengil nordon-shirin ta\'mga ega Samarqand olmasi. Kunlik vitaminlar uchun ideal.', "Hosil: 2026-yil sentyabr · Samarqand bog'lari"],
  ['Yashil olma', 'olma', 26000, 12, 180, 'Katta', 'Premium', "O'zbekiston", '🍏', '#E6F1DA', 0, [0, 0, 0], [30, 60], 410, 'Nordon-shirin, qattiq va uzoq saqlanadigan yashil olma. Salat va pishiriqlar uchun a\'lo.', 'Hosil: 2026-yil sentyabr · Samarqand'],
  ['Banan', 'banan', 22000, 0, 400, "O'rtacha", 'Birinchi nav', 'Ekvador', '🍌', '#FBF0C6', 2, [1, 0, 0], [30, 60], 1320, 'Yumshoq, shirin va to\'yimli banan. Sarg\'ish-yashil holatda keltiriladi, 1–2 kunda pishadi.', "Ekvador plantatsiyalari · Haftalik partiya"],
  ['Apelsin', 'sitrus', 24000, 8, 260, 'Katta', 'Premium', 'Misr', '🍊', '#FCE4C8', 2, [1, 0, 0], [30, 60], 870, 'Shirali, qalin po\'stli Misr apelsini. C vitaminiga boy, sharbat uchun ajoyib.', 'Hosil: 2026-yil oktyabr · Misr'],
  ['Mandarin', 'sitrus', 26000, 0, 240, 'Kichik', 'Premium', 'Turkiya', '🍊', '#FDDDC0', 2, [1, 0, 1], [30, 60], 780, 'Yengil tozalanadigan, urug\'siz va juda shirin mandarin. Qish mavsumining sevimlisi.', 'Mavsum: noyabr–fevral · Turkiya'],
  ['Limon', 'sitrus', 30000, 0, 150, "O'rtacha", 'Birinchi nav', 'Turkiya', '🍋', '#FBF3BF', 2, [0, 0, 0], [30, 60], 360, 'Hidli, yupqa po\'stli va sershira limon. Choy va taomlarga.', 'Hosil: 2026-yil oktyabr · Turkiya'],
  ['Husayni uzumi', 'uzum', 38000, 0, 210, 'Katta', 'Premium', "O'zbekiston", '🍇', '#E9E0F2', 1, [1, 0, 1], [30, 60], 1050, 'Uzun, nafis va juda shirin Husayni navi. Farg\'ona vodiysining faxri.', "Hosil: 2026-yil sentyabr · Farg'ona"],
  ['Kishmish uzum', 'uzum', 42000, 10, 130, 'Kichik', 'Premium', "O'zbekiston", '🍇', '#EADFF0', 1, [0, 1, 1], [30, 60], 290, 'Urug\'siz, asaldek shirin kishmish. Bolalar ham, kattalar ham yaxshi ko\'radi.', 'Hosil: 2026-yil avgust · Farg\'ona'],
  ['Qulupnay', 'rezavorlar', 85000, 15, 45, "O'rtacha", 'Premium', 'Turkiya', '🍓', '#FBDDE0', 2, [1, 1, 0], [20, 45], 560, 'Qip-qizil, xushbo\'y va juda shirin qulupnay. Bugun uzilgan, ehtiyotkorlik bilan qadoqlangan.', 'Bugun ertalab uzilgan'],
  ['Tarvuz', 'mavsumiy', 7000, 0, 900, 'Katta', 'Premium', "O'zbekiston", '🍉', '#DDEFD6', 3, [1, 0, 1], [40, 70], 2100, 'Qand kabi shirin, qip-qizil Xorazm tarvuzi. Salqin va tetiklantiruvchi.', 'Hosil: 2026-yil avgust · Xorazm'],
  ['Qovun (Torpeda)', 'mavsumiy', 12000, 0, 420, 'Katta', 'Premium', "O'zbekiston", '🍈', '#F6EFC8', 3, [1, 0, 1], [40, 70], 1480, 'Xushbo\'y, asalga o\'xshash ta\'mli Xorazm torpeda qovuni.', 'Hosil: 2026-yil sentyabr · Xorazm'],
  ['Shaftoli', 'mavsumiy', 32000, 0, 160, "O'rtacha", 'Premium', "O'zbekiston", '🍑', '#FCDDCB', 1, [0, 0, 1], [30, 60], 640, 'Yumshoq, sershira va xushbo\'y Farg\'ona shaftolisi.', "Hosil: 2026-yil avgust · Farg'ona"],
  ['Nok', 'mahalliy', 25000, 0, 190, 'Katta', 'Birinchi nav', "O'zbekiston", '🍐', '#EAF0D0', 0, [0, 0, 0], [30, 60], 330, 'Yumshoq va shirin, sharbatdor mahalliy nok.', 'Hosil: 2026-yil sentyabr · Samarqand'],
  ['Anor (Qand-i-Surx)', 'mahalliy', 45000, 0, 140, 'Katta', 'Premium', "O'zbekiston", 'svg:pomegranate', '#F6D9DC', 0, [1, 0, 1], [30, 60], 720, 'To\'q qizil donalari shirin va sersuv bo\'lgan Kolab anori. Vitaminlar xazinasi.', 'Hosil: 2026-yil oktyabr · Surxondaryo'],
  ['Kivi', 'tropik', 55000, 0, 85, "O'rtacha", 'Premium', 'Gretsiya', '🥝', '#E4EDD0', 2, [0, 0, 0], [30, 60], 270, 'Yashil, shirin-nordon va C vitaminiga boy kivi.', 'Hosil: 2026-yil oktyabr · Gretsiya'],
  ['Mango', 'tropik', 90000, 12, 60, 'Katta', 'Premium', 'Peru', '🥭', '#FBE6BC', 2, [1, 1, 0], [40, 80], 410, 'Yumshoq, asalday shirin va xushbo\'y mango. Pishgan holda yetkaziladi.', 'Samolyotda: 2 kun oldin · Peru'],
  ['Ananas', 'tropik', 48000, 0, 70, 'Katta', 'Birinchi nav', 'Kosta-Rika', '🍍', '#FAEFC2', 2, [0, 1, 0], [40, 80], 230, 'Tropik shirinlik va yengil nordonlik uyg\'unligi. Pishgan, sershira ananas.', 'Hosil: 2026-yil oktyabr · Kosta-Rika'],
  ['Gilos', 'mavsumiy', 95000, 0, 35, "O'rtacha", 'Premium', "O'zbekiston", '🍒', '#F7D5D8', 1, [1, 0, 1], [20, 45], 480, 'Qop-qora, yirik va qandday shirin gilos. Mavsum oxirgi partiyasi.', "Hosil: 2026-yil iyun · Farg'ona"],
  ["O'rik", 'mavsumiy', 30000, 20, 110, "O'rtacha", 'Premium', "O'zbekiston", 'svg:apricot', '#FBE2C3', 1, [0, 0, 1], [30, 60], 520, 'Asalga o\'xshash shirin, yumshoq Mirsanjeli o\'rigi.', "Hosil: 2026-yil iyul · Farg'ona"],
  ["Olxo'ri", 'mahalliy', 28000, 0, 95, "O'rtacha", 'Birinchi nav', "O'zbekiston", 'svg:plum', '#E5DAEA', 0, [0, 0, 0], [30, 60], 190, 'Yumshoq, nordon-shirin qora olxo\'ri. Murabbo va yangiligicha.', 'Hosil: 2026-yil avgust · Samarqand'],
  ['Anjir', 'mahalliy', 65000, 0, 40, "O'rtacha", 'Premium', "O'zbekiston", 'svg:fig', '#EBDDE6', 0, [0, 1, 1], [30, 60], 160, 'Bol kabi shirin va nozik anjir. Tez buziladi, shuning uchun har kuni yangisi.', 'Bugun uzilgan · Samarqand'],
  ['Avokado', 'tropik', 110000, 0, 50, "O'rtacha", 'Premium', 'Meksika', '🥑', '#E3EBD3', 2, [0, 1, 0], [40, 80], 140, 'Yog\'li, yumshoq va to\'yimli Hass avokadosi. Pishish darajasini tanlashingiz mumkin.', 'Hosil: 2026-yil oktyabr · Meksika'],
  ['Malina', 'rezavorlar', 140000, 10, 18, 'Kichik', 'Premium', "O'zbekiston", 'svg:raspberry', '#F8D8DE', 3, [0, 1, 1], [20, 45], 90, 'Xushbo\'y, nozik va shirin-nordon malina. Kichik idishlarda qadoqlanadi.', 'Bugun uzilgan · Xorazm'],
  ["Ko'k rezavor", 'rezavorlar', 160000, 0, 22, 'Kichik', 'Premium', 'Chili', '🫐', '#DDE2F2', 2, [0, 1, 0], [40, 80], 75, 'Antioksidantlarga boy, shirin-nordon ko\'k rezavor (blueberry).', 'Hosil: 2026-yil oktyabr · Chili'],
];

const REVIEW_TEXTS = [
  'Juda shirin va yangi meva, tavsiya qilaman!', "Kuryer o'z vaqtida yetkazdi, hammasi a'lo.", "Sifati yaxshi, faqat biroz mayda ekan.", 'Har doim shu yerdan buyurtma beraman.',
  "Qadoqlash ham zo'r, mevalar ezilmagan.", 'Narxiga arziydi. Keyingi safar ko\'proq olaman.', "Sotuvchi savollarimga tez javob berdi, rahmat!", "Ta'mi bozordagidan ancha yaxshi.", 'Bir nechta mevasi pishmagan edi, lekin umumiy yaxshi.',
];
const RETURN_REASONS = ['Meva yetarlicha yangi emas', 'Mevalar ezilgan yoki buzilgan', "Hajmi va'da qilinganidan farq qiladi", "Mevalar pishmagan yoki o'ta pishgan"];

export function seed({ reset = false } = {}) {
  const R = rng(20261007);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const between = (a, b) => a + R() * (b - a);
  const now = Date.now();

  tx(() => {
    if (reset) {
      db.exec('PRAGMA foreign_keys = OFF');
      for (const t of TABLES) db.exec(`DELETE FROM ${t}`);
      db.exec('PRAGMA foreign_keys = ON');
    }
    const user = (role, name, phone, email, pw, extra = {}) =>
      q.insert('INSERT INTO users (role, name, phone, email, password_hash, last_seen, created_at) VALUES (?,?,?,?,?,?,?)', role, name, phone, email, hashPassword(pw), extra.last_seen ?? null, iso(extra.created ?? now - 60 * 86400_000));

    /* staff */
    const superId = user('SUPER_ADMIN', 'Zafar Mamatqulov', '+998900000001', 'admin@mevazor.uz', 'Admin#2026');
    q.run('INSERT INTO admin_users (user_id, title, permissions) VALUES (?,?,?)', superId, 'Bosh administrator', '[]');
    const modId = user('ADMIN', 'Nilufar Tursunova', '+998900000002', 'moderator@mevazor.uz', 'Moder#2026');
    q.run('INSERT INTO admin_users (user_id, title, permissions) VALUES (?,?,?)', modId, 'Moderator', JSON.stringify(['dashboard', 'orders', 'customers', 'chats', 'reviews', 'returns', 'analytics']));

    /* settings, categories, promotions */
    q.run('INSERT INTO delivery_settings (id, base_fee, free_from, eta_min, eta_max, return_policy, return_fixed_fee, support_phone) VALUES (1,?,?,?,?,?,?,?)', 12000, 150000, 30, 60, 'delivery_fee', 0, '+998 71 200 00 00');
    const cat = {};
    CATEGORIES.forEach(([slug, name, emoji], i) => (cat[slug] = q.insert('INSERT INTO categories (slug, name, emoji, sort) VALUES (?,?,?,?)', slug, name, emoji, i)));
    q.run('INSERT INTO promotions (title, subtitle, code, discount_percent, min_total, active, art) VALUES (?,?,?,?,?,1,?)', 'Mavsumiy chegirma −10%', "Barcha buyurtmalarga, kamida 100 000 UZS", 'MEVA10', 10, 100000, '🍉');
    q.run('INSERT INTO promotions (title, subtitle, code, discount_percent, min_total, active, art) VALUES (?,?,?,?,?,1,?)', 'Birinchi buyurtma −15%', "Yangi mijozlar uchun maxsus taklif", 'YANGI15', 15, 80000, '🍓');

    /* sellers */
    const sellerIds = SELLERS.map((s, i) => {
      const uid = user('SELLER', s.owner, s.phone, s.email, 'Seller#2026', { last_seen: iso(now - 40_000), created: now - (50 - i * 5) * 86400_000 });
      return q.insert('INSERT INTO sellers (user_id, store_name, owner_name, phone, address, description, emoji, rating, rating_count, online, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        uid, s.store, s.owner, s.phone, s.addr, s.desc, s.emoji, s.rating, 0, i === 3 ? 0 : 1, 'active', iso(now - (50 - i * 5) * 86400_000));
    });
    // a pending seller waiting for approval
    const pu = user('SELLER', 'Bobur Aliyev', '+998901110055', 'bobur@mevazor.uz', 'Seller#2026');
    q.insert('INSERT INTO sellers (user_id, store_name, owner_name, phone, address, description, emoji, rating, online, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      pu, 'Namangan Bog\'i', 'Bobur Aliyev', '+998901110055', 'Namangan sh., Navoiy 3', 'Yangi sotuvchi, tasdiqlash kutilmoqda.', '🍐', 5, 0, 'pending', iso(now - 86400_000));

    /* couriers */
    const courierDefs = [['Sardor Ergashev', '+998909990001', 'Damas', 'available', 4.9, 412], ['Bekzod Nazarov', '+998909990002', 'Skuter', 'available', 4.8, 358], ['Otabek Xolmatov', '+998909990003', 'Labo', 'online', 4.7, 296], ['Ulug\'bek Rustamov', '+998909990004', 'Skuter', 'offline', 4.6, 140]];
    const courierIds = courierDefs.map(([name, phone, vehicle, status, rating, done], i) => {
      const uid = user('COURIER', name, phone, `courier${i + 1}@mevazor.uz`, 'Courier#2026', { last_seen: iso(now - 30_000) });
      return q.insert('INSERT INTO couriers (user_id, name, phone, vehicle, status, rating, completed, created_at) VALUES (?,?,?,?,?,?,?,?)', uid, name, phone, vehicle, status, rating, done, iso(now - 40 * 86400_000));
    });

    /* products */
    const productRows = FRUITS.map((f, i) => {
      const [name, c, price, disc, stock, size, quality, origin, art, tint, si, [pop, nw, sea], [dmin, dmax], sold, desc, harvest] = f;
      const id = q.insert(`INSERT INTO products (seller_id, category_id, name, description, price_per_kg, discount_percent, stock_kg, min_order, max_order, size, quality, origin, harvest_info, art, tint, status, is_popular, is_new, is_seasonal, delivery_min, delivery_max, sold_kg, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?,?,?)`, sellerIds[si], cat[c], name, desc, price, disc, stock, 0.5, Math.min(20, Math.max(5, Math.floor(stock / 4))), size, quality, origin, harvest, art, tint, pop, nw, sea, dmin, dmax, sold, iso(now - (nw ? between(0.2, 6) : between(10, 55)) * 86400_000));
      return { id, name, art, tint, price: Math.round(price * (100 - disc) / 100), seller: sellerIds[si], disc };
    });

    ensureDemoPhotos();

    /* customers */
    const custDefs = [['Madina Karimova', '+998901234567'], ['Jasur Toshmatov', '+998935551122'], ['Gulnora Saidova', '+998941112233'], ['Sherzod Abdullayev', '+998977778899'], ['Dilfuza Ergasheva', '+998909871234'], ['Rustam Qodirov', '+998913334455'], ['Nargiza Umarova', '+998991230045'], ['Timur Hasanov', '+998885556677']];
    const custIds = custDefs.map(([name, phone], i) => {
      const uid = user('CUSTOMER', name, phone, null, i === 0 ? 'Demo#2026' : 'Mijoz#2026', { last_seen: i === 1 ? iso(now - 20_000) : iso(now - between(1, 40) * 3600_000), created: now - between(5, 50) * 86400_000 });
      q.run('INSERT INTO customers (user_id) VALUES (?)', uid);
      return uid;
    });
    const streets = ["Amir Temur ko'chasi 45", "Mirzo Ulug'bek tumani, Buyuk Ipak Yo'li 12", "Chilonzor 7-mavze, 14-uy", "Yunusobod 11-mavze, 3-uy", "Shayxontohur, Navoiy 21", "Sergeli, Yangi Sergeli 8"];
    custIds.forEach((id, i) => {
      q.run('INSERT INTO addresses (user_id, label, full_address, apartment, instructions, is_default) VALUES (?,?,?,?,?,1)', id, 'Uy', streets[i % streets.length], `${10 + i * 3}-xonadon, ${2 + (i % 5)}-qavat`, 'Kirishda qo\'ng\'iroq qiling');
    });
    q.run('INSERT INTO addresses (user_id, label, full_address, apartment, instructions, is_default) VALUES (?,?,?,?,?,0)', custIds[0], 'Ish', "Mustaqillik maydoni, Biznes markaz, 5-qavat", '502-xona', 'Resepshnga topshiring');
    [1, 2, 8, 14, 16].forEach((p) => q.run('INSERT INTO favorites (user_id, product_id, created_at) VALUES (?,?,?)', custIds[0], productRows[p - 1].id, iso(now - p * 3600_000)));

    /* orders */
    const s = { base: 12000, free: 150000 };
    let orderNo = 0;
    const makeOrder = ({ customer, seller, createdMs, status, forceItems }) => {
      const mine = productRows.filter((p) => p.seller === seller);
      const n = forceItems ?? 1 + Math.floor(R() * 3);
      const chosen = [...mine].sort(() => R() - 0.5).slice(0, Math.min(n, mine.length));
      const items = chosen.map((p) => {
        const qty = pick([0.5, 1, 1, 1.5, 2, 2, 3, 5]);
        return { p, qty, line: Math.round(p.price * qty) };
      });
      const itemsTotal = items.reduce((a, i) => a + i.line, 0);
      const fee = itemsTotal >= s.free ? 0 : s.base;
      const ci = custIds.indexOf(customer);
      const [cname, cphone] = custDefs[ci];
      orderNo += 1;
      const id = q.insert(`INSERT INTO orders (code, group_code, customer_id, seller_id, courier_id, status, items_total, delivery_fee, total, customer_name, phone, address, apartment, instructions, reject_reason, eta_min, eta_max, created_at, updated_at, confirmed_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        `MZ-${10000 + orderNo}`, `G${orderNo}`, customer, seller, null, status, itemsTotal, fee, itemsTotal + fee, cname, cphone, streets[ci % streets.length], `${10 + ci * 3}-xonadon`, '', status === 'rejected' ? "Hozirda bu meva tugagan" : null, 30, 60, iso(createdMs), iso(createdMs), iso(createdMs));
      for (const it of items) q.run('INSERT INTO order_items (order_id, product_id, name, art, tint, price_per_kg, qty_kg, line_total) VALUES (?,?,?,?,?,?,?,?)', id, it.p.id, it.p.name, it.p.art, it.p.tint, it.p.price, it.qty, it.line);

      // history timeline
      const path = ['sent', 'reviewing', 'accepted', 'preparing', 'handed', 'on_way', 'delivered', 'completed'];
      const offsets = [1, 4, 9, 22, 47, 52, 0, 0];
      const dur = between(18, 78) * 60_000; // handed -> delivered
      const handedAt = createdMs + 47 * 60_000;
      const times = { sent: createdMs + 60_000, reviewing: createdMs + 4 * 60_000, accepted: createdMs + 9 * 60_000, preparing: createdMs + 22 * 60_000, handed: handedAt, on_way: handedAt + 5 * 60_000, delivered: handedAt + dur, completed: handedAt + dur + 12 * 60_000 };
      void offsets;
      q.run('INSERT INTO order_status_history (order_id, status, note, actor_id, created_at) VALUES (?,?,?,?,?)', id, 'draft', null, customer, iso(createdMs - 90_000));
      const reachIdx = path.indexOf(status);
      const upTo = ['rejected', 'cancelled'].includes(status) ? 1 : status === 'returned' || status === 'return_requested' ? 6 : reachIdx;
      for (let i = 0; i <= upTo; i++) q.run('INSERT INTO order_status_history (order_id, status, actor_id, created_at) VALUES (?,?,?,?)', id, path[i], customer, iso(times[path[i]]));
      let last = times[path[Math.max(upTo, 0)]];
      if (['rejected', 'cancelled'].includes(status)) {
        last = createdMs + 6 * 60_000;
        q.run('INSERT INTO order_status_history (order_id, status, note, created_at) VALUES (?,?,?,?)', id, status, status === 'rejected' ? 'Hozirda bu meva tugagan' : 'Mijoz bekor qildi', iso(last));
      }
      if (status === 'return_requested' || status === 'returned') {
        last = times.delivered + 4 * 60_000;
        q.run('INSERT INTO order_status_history (order_id, status, note, created_at) VALUES (?,?,?,?)', id, 'return_requested', 'Mevalar ezilgan', iso(last));
        if (status === 'returned') {
          last += 3600_000;
          q.run('INSERT INTO order_status_history (order_id, status, note, created_at) VALUES (?,?,?,?)', id, 'returned', 'Qaytarish tasdiqlandi', iso(last));
        }
      }
      const courier = reachIdx >= 4 || status.includes('return') ? pick(courierIds.slice(0, 3)) : null;
      q.run('UPDATE orders SET updated_at = ?, courier_id = ? WHERE id = ?', iso(last), courier, id);
      return { id, status, items, customer, seller, createdMs, fee, last };
    };

    const created = [];
    const DAY = 86400_000;
    // 30 days of history with growing volume
    for (let d = 30; d >= 1; d--) {
      const count = Math.round(2 + (31 - d) * 0.22 + R() * 3);
      for (let k = 0; k < count; k++) {
        const t = now - d * DAY + between(8, 21) * 3600_000 - (now % DAY) + (now % DAY);
        const roll = R();
        const status = roll < 0.80 ? 'completed' : roll < 0.86 ? 'cancelled' : roll < 0.89 ? 'rejected' : roll < 0.95 ? 'returned' : 'completed';
        created.push(makeOrder({ customer: pick(custIds), seller: pick(sellerIds), createdMs: t, status }));
      }
    }
    // today / live orders
    const live = ['delivered', 'on_way', 'handed', 'preparing', 'accepted', 'reviewing', 'sent', 'completed', 'completed', 'return_requested'];
    live.forEach((st, i) => {
      const age = [95, 80, 70, 45, 30, 18, 6, 140, 170, 120][i] * 60_000 + 60_000;
      created.push(makeOrder({ customer: i < 5 ? custIds[0] : pick(custIds), seller: sellerIds[i % 3], createdMs: now - age, status: st }));
    });

    /* returns, reviews, chats */
    for (const o of created.filter((x) => x.status === 'returned' || x.status === 'return_requested')) {
      const t = iso(o.last);
      q.run('INSERT INTO returns (order_id, customer_id, seller_id, reason, note, photos, delivery_fee, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        o.id, o.customer, o.seller, pick(RETURN_REASONS), 'Kuryer kelganida tekshirib ko\'rdim.', '[]', o.fee, o.status === 'returned' ? 'completed' : 'pending', t, t);
    }
    const doneOrders = created.filter((x) => x.status === 'completed' && R() < 0.55);
    for (const o of doneOrders) {
      const r = () => pick([5, 5, 5, 4, 4, 3]);
      const base = r();
      for (const it of o.items) {
        q.run('INSERT INTO reviews (order_id, product_id, customer_id, seller_id, rating, quality_rating, seller_rating, delivery_rating, body, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          o.id, it.p.id, o.customer, o.seller, base, Math.min(5, Math.max(1, base + pick([-1, 0, 0, 1]))), r(), r(), pick(REVIEW_TEXTS), iso(o.last + 3600_000));
      }
    }
    for (const p of productRows) {
      const a = q.get("SELECT AVG(rating) AS a, COUNT(*) AS n FROM reviews WHERE product_id = ?", p.id);
      if (a.n) q.run('UPDATE products SET rating_avg = ?, rating_count = ? WHERE id = ?', Math.round(a.a * 10) / 10, a.n, p.id);
    }
    for (const sid of sellerIds) {
      const a = q.get('SELECT AVG(seller_rating) AS a, COUNT(*) AS n FROM reviews WHERE seller_id = ?', sid);
      if (a.n) q.run('UPDATE sellers SET rating = ?, rating_count = ? WHERE id = ?', Math.round(a.a * 10) / 10, a.n, sid);
    }

    // chats: the demo customer's live orders + a few historical ones
    const sellerUser = (sid) => q.get('SELECT user_id FROM sellers WHERE id = ?', sid).user_id;
    const mkChat = (o, lines) => {
      const first = o.items[0].p.id;
      const chatId = q.insert('INSERT INTO chats (order_id, customer_id, seller_id, product_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', o.id, o.customer, o.seller, first, 'active', iso(o.createdMs - 120_000), iso(o.createdMs));
      lines.forEach(([who, text], i) => {
        const uid = who === 'c' ? o.customer : sellerUser(o.seller);
        q.run('INSERT INTO messages (chat_id, sender_id, sender_role, body, read_at, created_at) VALUES (?,?,?,?,?,?)', chatId, uid, who === 'c' ? 'CUSTOMER' : 'SELLER', text, iso(o.createdMs - 60_000 + i * 50_000), iso(o.createdMs - 110_000 + i * 45_000));
      });
    };
    const liveOrders = created.slice(-live.length);
    mkChat(liveOrders[3], [['c', 'Assalomu alaykum, olma bugun kelganmi?'], ['s', 'Va alaykum assalom. Ha, bugun ertalab olib kelindi.'], ['c', 'Qaysi hajmda? Shirinligi qanday?'], ['s', "O'rtacha va yirik hajmda, juda shirin. Yoqmasa, qaytarishingiz mumkin."], ['c', 'Rahmat, buyurtmani tasdiqlayman.']]);
    mkChat(liveOrders[1], [['c', 'Salom, mandarin urug\'siz-mi?'], ['s', 'Salom! Ha, urug\'siz va juda shirin.']]);
    mkChat(created[created.length - live.length - 3], [['c', 'Rasm yubora olasizmi?'], ['s', 'Albatta, qadoqlayotganda yuboraman.']]);

    /* notifications */
    const nt = (uid, type, title, body, link, ago, read = 0) => q.run('INSERT INTO notifications (user_id, type, title, body, link, read_at, created_at) VALUES (?,?,?,?,?,?,?)', uid, type, title, body, link, read ? iso(now - ago + 60_000) : null, iso(now - ago));
    nt(custIds[0], 'order_on_way', "Kuryer yo'lda", 'MZ-' + (10000 + orderNo - 8) + " · Kuryer tez orada yetib boradi", '#/orders', 12 * 60_000);
    nt(custIds[0], 'seller_reply', 'Sotuvchi javob berdi', 'Samarqand Bog\'lari: Ha, bugun ertalab olib kelindi.', '#/chats', 45 * 60_000);
    nt(custIds[0], 'promo', 'Mavsumiy chegirma −10%', 'MEVA10 promokodi bilan', '#/', 6 * 3600_000, 1);
    for (const sid of sellerIds) {
      nt(sellerUser(sid), 'new_order', 'Yangi buyurtma', 'Yangi buyurtma tasdiqlandi', '#/orders', 20 * 60_000);
      nt(sellerUser(sid), 'stock', 'Zaxira ogohlantirishi', 'Ba\'zi mevalar zaxirasi kamayib bormoqda', '#/products', 3 * 3600_000, 1);
    }
    nt(superId, 'return_request', "Qaytarish so'rovi", 'Yangi qaytarish so\'rovi ko\'rib chiqilishi kerak', '#/returns', 25 * 60_000);
    nt(superId, 'new_seller', 'Yangi sotuvchi', "Namangan Bog'i tasdiqlash kutmoqda", '#/sellers', 5 * 3600_000);
    nt(superId, 'warning', 'Tizim ogohlantirishi', 'Anor, Qulupnay zaxirasi kam', '#/products', 8 * 3600_000, 1);
    nt(modId, 'new_order', 'Yangi buyurtma', 'Yangi buyurtma tasdiqlandi', '#/orders', 18 * 60_000);

    // reflect sold quantity vs stock lightly: reduce stock for active reservations
    for (const o of created.filter((x) => ['sent', 'reviewing', 'accepted', 'preparing', 'handed', 'on_way', 'delivered'].includes(x.status))) {
      for (const it of o.items) q.run('UPDATE products SET stock_kg = MAX(0, stock_kg - ?) WHERE id = ?', it.qty, it.p.id);
    }
  });
  console.log('Seed complete.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) seed({ reset: process.argv.includes('--reset') });
