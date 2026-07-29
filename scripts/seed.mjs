import pg from 'pg';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;

const BCRYPT_ROUNDS = 4;
const PGHOST = process.env.PG_HOST || 'localhost';
const PGPORT = parseInt(process.env.PG_PORT || '5433', 10);
const PGUSER = process.env.PG_USER || 'commercesphere';
const PGPASS = process.env.PG_PASSWORD || 'commercesphere_dev';

function pool(dbName) {
  return new Pool({
    host: PGHOST, port: PGPORT, database: dbName,
    user: PGUSER, password: PGPASS,
    max: 5, connectionTimeoutMillis: 5000,
  });
}

function info(msg) { console.log(`  ✓ ${msg}`); }
function warn(msg) { console.log(`  ⚠ ${msg}`); }
function step(title) { console.log(`\n── ${title} ──`); }

async function query(dbName, text, params) {
  const p = pool(dbName);
  try { return await p.query(text, params); }
  finally { await p.end(); }
}

async function ensureTables(dbName, ddl) {
  const p = pool(dbName);
  try {
    await p.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    for (const stmt of ddl) {
      try { await p.query(stmt); }
      catch (e) { if (!e.message.includes('already exists')) throw e; }
    }
  } finally { await p.end(); }
}

async function userExists(db, email) {
  const r = await query(db, 'SELECT id FROM users WHERE email = $1', [email]);
  return r.rows[0] || null;
}

async function seedAuth() {
  step('Seeding Auth Service (users, addresses)');

  const count = await query('auth_service', 'SELECT COUNT(*)::int AS cnt FROM users');

  const users = [
    { email: 'admin@commercesphere.com', password: 'Admin@123456', name: 'Admin User', role: 'admin' },
    { email: 'moderator@commercesphere.com', password: 'Mod@123456', name: 'Moderator User', role: 'moderator' },
    { email: 'seller1@example.com', password: 'Seller@123456', name: 'TechVista Store', role: 'seller' },
    { email: 'seller2@example.com', password: 'Seller@123456', name: 'FashionHub', role: 'seller' },
    { email: 'john.doe@example.com', password: 'User@123456', name: 'John Doe', role: 'customer' },
    { email: 'jane.smith@example.com', password: 'User@123456', name: 'Jane Smith', role: 'customer' },
    { email: 'bob.wilson@example.com', password: 'User@123456', name: 'Bob Wilson', role: 'customer' },
    { email: 'alice.johnson@example.com', password: 'User@123456', name: 'Alice Johnson', role: 'customer' },
    { email: 'charlie.brown@example.com', password: 'User@123456', name: 'Charlie Brown', role: 'customer' },
  ];

  // Fix existing admin user's role (old seed created it as 'customer')
  await query('auth_service',
    `UPDATE users SET role = 'admin' WHERE email = 'admin@commercesphere.com' AND role = 'customer'`);

  const userIds = {};
  for (const u of users) {
    const existingUser = await userExists('auth_service', u.email);
    if (existingUser) {
      userIds[u.email] = existingUser.id;
      warn(`User ${u.email} already exists (id: ${existingUser.id.substring(0, 8)}...)`);
      continue;
    }
    const hash = await bcrypt.hash(u.password, BCRYPT_ROUNDS);
    const r = await query('auth_service',
      `INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [uuidv4(), u.email, hash, u.name, u.role]
    );
    userIds[u.email] = r.rows[0].id;
    info(`Created ${u.role}: ${u.email} / ${u.password}`);
  }

  const addr = [
    { email: 'john.doe@example.com', label: 'Home', street: '123 Main St', city: 'San Francisco', state: 'CA', zip: '94105', phone: '+1-555-0101' },
    { email: 'john.doe@example.com', label: 'Work', street: '456 Market St', city: 'San Francisco', state: 'CA', zip: '94105', phone: '+1-555-0102' },
    { email: 'jane.smith@example.com', label: 'Home', street: '789 Oak Ave', city: 'Los Angeles', state: 'CA', zip: '90001', phone: '+1-555-0201' },
    { email: 'bob.wilson@example.com', label: 'Home', street: '321 Pine Rd', city: 'Seattle', state: 'WA', zip: '98101', phone: '+1-555-0301' },
    { email: 'alice.johnson@example.com', label: 'Home', street: '654 Elm St', city: 'Austin', state: 'TX', zip: '73301', phone: '+1-555-0401' },
    { email: 'charlie.brown@example.com', label: 'Home', street: '987 Maple Dr', city: 'Chicago', state: 'IL', zip: '60601', phone: '+1-555-0501' },
    { email: 'seller1@example.com', label: 'Warehouse', street: '100 Industrial Blvd', city: 'San Jose', state: 'CA', zip: '95101', phone: '+1-555-1001' },
    { email: 'seller2@example.com', label: 'Warehouse', street: '200 Fashion Ave', city: 'New York', state: 'NY', zip: '10001', phone: '+1-555-2001' },
  ];

  for (const a of addr) {
    const uid = userIds[a.email];
    if (!uid) continue;
    const exists = await query('auth_service',
      'SELECT id FROM addresses WHERE user_id = $1 AND label = $2', [uid, a.label]);
    if (exists.rows.length) continue;
    await query('auth_service',
      `INSERT INTO addresses (id, user_id, label, street, city, state, postal_code, country, phone, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'US', $8, $9)`,
      [uuidv4(), uid, a.label, a.street, a.city, a.state, a.zip, a.phone, a.label === 'Home' ? true : false]
    );
    info(`Address "${a.label}" for ${a.email}`);
  }
  return userIds;
}

async function seedProducts(userIds) {
  step('Seeding Product Service (categories, products, variants, images)');

  const catIds = {};
  const categories = [
    { name: 'Electronics', slug: 'electronics' },
    { name: 'Clothing', slug: 'clothing' },
    { name: 'Home & Kitchen', slug: 'home-kitchen' },
    { name: 'Sports & Outdoors', slug: 'sports-outdoors' },
    { name: 'Accessories', slug: 'accessories' },
    { name: 'Books & Media', slug: 'books-media' },
  ];

  for (const c of categories) {
    const r = await query('product_service',
      `INSERT INTO categories (id, name, slug) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [uuidv4(), c.name, c.slug]
    );
    catIds[c.slug] = r.rows[0].id;
    info(`Category: ${c.name}`);
  }

  const seller1Id = userIds['seller1@example.com'];
  const seller2Id = userIds['seller2@example.com'];

  const products = [
    { title: 'Wireless Bluetooth Headphones Pro', desc: 'Premium noise-cancelling over-ear headphones with 40-hour battery life, Hi-Res audio support, and memory foam ear cushions.', price: 149.99, cat: 'electronics', qty: 85, seller: seller1Id, img: 'https://picsum.photos/seed/headphones/800/800' },
    { title: 'Smart Fitness Watch X2', desc: 'Advanced fitness tracker with GPS, heart rate monitor, SpO2 tracking, sleep analysis, and 14-day battery life.', price: 199.99, cat: 'electronics', qty: 60, seller: seller1Id, img: 'https://picsum.photos/seed/fitness-watch/800/800' },
    { title: 'USB-C Charging Hub 7-in-1', desc: 'Compact charging hub with 4K HDMI, 100W PD charging, USB-A 3.0, SD card reader, and Ethernet port.', price: 49.99, cat: 'electronics', qty: 120, seller: seller1Id, img: 'https://picsum.photos/seed/usb-hub/800/800' },
    { title: 'Wireless Mechanical Keyboard', desc: 'RGB backlit mechanical keyboard with hot-swappable switches, PBT keycaps, and 4000mAh battery.', price: 89.99, cat: 'electronics', qty: 45, seller: seller1Id, img: 'https://picsum.photos/seed/keyboard/800/800' },
    { title: 'Portable Bluetooth Speaker', desc: 'Waterproof IPX7 portable speaker with 360° sound, 20-hour battery, and built-in microphone.', price: 39.99, cat: 'electronics', qty: 95, seller: seller1Id, img: 'https://picsum.photos/seed/speaker/800/800' },
    { title: '4K Webcam with Ring Light', desc: 'Ultra HD 4K webcam with adjustable ring light, auto-focus, noise-cancelling mic, and privacy shutter.', price: 79.99, cat: 'electronics', qty: 55, seller: seller1Id, img: 'https://picsum.photos/seed/webcam/800/800' },
    { title: 'Organic Cotton T-Shirt', desc: 'Sustainably sourced 100% organic cotton crew neck tee. Pre-shrunk and enzyme-washed for maximum comfort.', price: 29.99, cat: 'clothing', qty: 200, seller: seller2Id, img: 'https://picsum.photos/seed/tshirt/800/800' },
    { title: 'Slim Fit Chino Pants', desc: 'Stretch cotton chino pants with a modern slim fit. Wrinkle-resistant fabric with moisture-wicking technology.', price: 59.99, cat: 'clothing', qty: 80, seller: seller2Id, img: 'https://picsum.photos/seed/chinos/800/800' },
    { title: 'Lightweight Down Jacket', desc: 'Packable down jacket with 800-fill goose down, water-repellent shell, and stuff sack included.', price: 129.99, cat: 'clothing', qty: 40, seller: seller2Id, img: 'https://picsum.photos/seed/jacket/800/800' },
    { title: 'Merino Wool Crew Socks (3-Pack)', desc: 'Premium merino wool blend socks with reinforced heel and toe. Moisture-wicking and odor-resistant.', price: 24.99, cat: 'clothing', qty: 300, seller: seller2Id, img: 'https://picsum.photos/seed/socks/800/800' },
    { title: 'Women\'s Yoga Leggings', desc: 'High-waist compression leggings with squat-proof fabric, hidden pocket, and 4-way stretch.', price: 44.99, cat: 'clothing', qty: 150, seller: seller2Id, img: 'https://picsum.photos/seed/leggings/800/800' },
    { title: 'Denim Jacket Classic', desc: 'Classic denim jacket in mid-wash indigo. Button-front with chest pockets and adjustable waist tabs.', price: 74.99, cat: 'clothing', qty: 35, seller: seller2Id, img: 'https://picsum.photos/seed/denim/800/800' },
    { title: 'Stainless Steel Water Bottle 32oz', desc: 'Double-wall vacuum insulated bottle. Keeps drinks cold 24hrs or hot 12hrs. BPA-free, leak-proof lid.', price: 34.99, cat: 'home-kitchen', qty: 175, seller: seller1Id, img: 'https://picsum.photos/seed/water-bottle/800/800' },
    { title: 'Programmable Coffee Maker', desc: '12-cup programmable coffee maker with built-in grinder, thermal carafe, auto-shutoff, and brew-strength selector.', price: 89.99, cat: 'home-kitchen', qty: 25, seller: seller1Id, img: 'https://picsum.photos/seed/coffee-maker/800/800' },
    { title: 'Bamboo Cutting Board Set', desc: 'Set of 3 organic bamboo cutting boards in graduated sizes. Knife-friendly, antimicrobial, and dishwasher-safe.', price: 39.99, cat: 'home-kitchen', qty: 65, seller: seller2Id, img: 'https://picsum.photos/seed/cutting-board/800/800' },
    { title: 'Non-Stick Cookware Set 10-Pc', desc: 'Professional-grade granite non-stick coating. Includes pots, pans, lids, and silicone utensils. Oven-safe to 450°F.', price: 179.99, cat: 'home-kitchen', qty: 20, seller: seller2Id, img: 'https://picsum.photos/seed/cookware/800/800' },
    { title: 'Scented Soy Candle Collection', desc: 'Hand-poured soy wax candles. Set of 3 scents: Vanilla Bean, Lavender Fields, and Fresh Linen. 40hr burn time each.', price: 28.99, cat: 'home-kitchen', qty: 90, seller: seller2Id, img: 'https://picsum.photos/seed/candle/800/800' },
    { title: 'Smart LED Light Bulb', desc: 'WiFi-enabled RGBW smart bulb. Works with Alexa/Google. Voice control, scheduling, and music sync. 800 lumens.', price: 14.99, cat: 'home-kitchen', qty: 250, seller: seller1Id, img: 'https://picsum.photos/seed/smart-bulb/800/800' },
    { title: 'Premium Yoga Mat', desc: 'Extra-thick 6mm non-slip eco-friendly TPE yoga mat with alignment lines. Includes carrying strap and yoga block.', price: 49.99, cat: 'sports-outdoors', qty: 70, seller: seller2Id, img: 'https://picsum.photos/seed/yoga-mat/800/800' },
    { title: 'Running Shoes CloudFlex', desc: 'Lightweight performance running shoes with responsive cushioning, breathable mesh upper, and reflective details.', price: 119.99, cat: 'sports-outdoors', qty: 55, seller: seller2Id, img: 'https://picsum.photos/seed/running-shoes/800/800' },
    { title: 'Adjustable Dumbbell Set 50lb', desc: 'Space-saving adjustable dumbbells replacing 15 sets. Quick-change weight system from 5-50 lbs per hand.', price: 299.99, cat: 'sports-outdoors', qty: 15, seller: seller1Id, img: 'https://picsum.photos/seed/dumbbell/800/800' },
    { title: 'Insulated Camping Hammock', desc: 'Double hammock with built-in bug net and rainfly. Supports 500lbs. Packs into built-in stuff sack.', price: 64.99, cat: 'sports-outdoors', qty: 40, seller: seller1Id, img: 'https://picsum.photos/seed/hammock/800/800' },
    { title: 'Resistance Bands Set', desc: 'Set of 5 exercise bands with different resistance levels. Includes door anchor, ankle straps, and carrying bag.', price: 19.99, cat: 'sports-outdoors', qty: 130, seller: seller2Id, img: 'https://picsum.photos/seed/resistance-bands/800/800' },
    { title: 'Cycling Helmet Aero', desc: 'Aerodynamic road cycling helmet with MIPS protection, 16 ventilation channels, and magnetic visor.', price: 89.99, cat: 'sports-outdoors', qty: 30, seller: seller1Id, img: 'https://picsum.photos/seed/cycling-helmet/800/800' },
    { title: 'Laptop Backpack 35L', desc: 'Durable water-resistant backpack with padded laptop compartment (fits 17"), USB charging port, and anti-theft pocket.', price: 79.99, cat: 'accessories', qty: 90, seller: seller1Id, img: 'https://picsum.photos/seed/backpack/800/800' },
    { title: 'Wireless Ergonomic Mouse', desc: 'Vertical ergonomic wireless mouse with 6 buttons, adjustable DPI (800-4000), and USB-C charging.', price: 39.99, cat: 'accessories', qty: 110, seller: seller1Id, img: 'https://picsum.photos/seed/mouse/800/800' },
    { title: 'Leather Wallet RFID', desc: 'Genuine full-grain leather bifold wallet with RFID blocking. 6 card slots, ID window, and currency compartment.', price: 44.99, cat: 'accessories', qty: 75, seller: seller2Id, img: 'https://picsum.photos/seed/wallet/800/800' },
    { title: 'Polarized Sunglasses', desc: 'UV400 polarized sunglasses with lightweight titanium frame and scratch-resistant lenses. Includes hard case.', price: 69.99, cat: 'accessories', qty: 50, seller: seller2Id, img: 'https://picsum.photos/seed/sunglasses/800/800' },
    { title: 'Apple AirPods Pro 2nd Gen', desc: 'Industry-leading active noise cancellation, adaptive transparency, personalized spatial audio, and MagSafe charging.', price: 249.99, cat: 'electronics', qty: 0, seller: seller1Id, img: 'https://picsum.photos/seed/airpods/800/800' },
    { title: 'Canvas Messenger Bag', desc: 'Vintage-style waxed canvas messenger bag with leather trim. Fits 15" laptop. Adjustable crossbody strap.', price: 59.99, cat: 'accessories', qty: 35, seller: seller2Id, img: 'https://picsum.photos/seed/messenger-bag/800/800' },
    { title: 'Clean Code: A Handbook', desc: 'Robert C. Martin\'s essential guide to writing maintainable, readable, and efficient code. Bestselling software engineering book.', price: 39.99, cat: 'books-media', qty: 100, seller: seller1Id, img: 'https://picsum.photos/seed/clean-code/800/800' },
    { title: 'Designing Data-Intensive Applications', desc: 'Martin Kleppmann\'s comprehensive guide to the principles of large-scale data systems. The definitive reference.', price: 49.99, cat: 'books-media', qty: 50, seller: seller1Id, img: 'https://picsum.photos/seed/ddia/800/800' },
    { title: 'Noise-Cancelling Sleep Earplugs', desc: 'Comfortable silicone earplugs with noise reduction rating of 32dB. Reusable and machine-washable.', price: 14.99, cat: 'accessories', qty: 200, seller: seller1Id, img: 'https://picsum.photos/seed/earplugs/800/800' },
  ];

  const productIds = {};
  for (const p of products) {
    const exists = await query('product_service',
      'SELECT id FROM products WHERE title = $1', [p.title]);
    if (exists.rows.length) {
      productIds[p.title] = exists.rows[0].id;
      warn(`Product already exists: ${p.title}`);
      continue;
    }
    const pid = uuidv4();
    await query('product_service',
      `INSERT INTO products (id, title, description, price, category_id, inventory_quantity, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [pid, p.title, p.desc, p.price, catIds[p.cat], p.qty, p.qty === 0 ? 'out_of_stock' : 'active']
    );
    productIds[p.title] = pid;

    const iid = uuidv4();
    await query('product_service',
      `INSERT INTO product_images (id, product_id, url, display_order) VALUES ($1, $2, $3, 0)`,
      [iid, pid, p.img]
    );

    info(`Product: ${p.title} ($${p.price})`);
  }

  const variants = [
    { product: 'Organic Cotton T-Shirt', sku: 'COT-TEE-S', attributes: { size: 'S', color: 'White' }, qty: 50 },
    { product: 'Organic Cotton T-Shirt', sku: 'COT-TEE-M', attributes: { size: 'M', color: 'White' }, qty: 80 },
    { product: 'Organic Cotton T-Shirt', sku: 'COT-TEE-L', attributes: { size: 'L', color: 'White' }, qty: 70 },
    { product: 'Organic Cotton T-Shirt', sku: 'COT-TEE-XL', attributes: { size: 'XL', color: 'Black' }, qty: 40 },
    { product: 'Slim Fit Chino Pants', sku: 'CHINO-30', attributes: { waist: '30', length: '32' }, qty: 25 },
    { product: 'Slim Fit Chino Pants', sku: 'CHINO-32', attributes: { waist: '32', length: '32' }, qty: 30 },
    { product: 'Slim Fit Chino Pants', sku: 'CHINO-34', attributes: { waist: '34', length: '34' }, qty: 25 },
    { product: 'Women\'s Yoga Leggings', sku: 'YOGA-LEG-S', attributes: { size: 'S', color: 'Black' }, qty: 40 },
    { product: 'Women\'s Yoga Leggings', sku: 'YOGA-LEG-M', attributes: { size: 'M', color: 'Black' }, qty: 60 },
    { product: 'Women\'s Yoga Leggings', sku: 'YOGA-LEG-L', attributes: { size: 'L', color: 'Dark Gray' }, qty: 50 },
    { product: 'Running Shoes CloudFlex', sku: 'RUN-SHOE-9', attributes: { size: '9', color: 'Blue/White' }, qty: 15 },
    { product: 'Running Shoes CloudFlex', sku: 'RUN-SHOE-10', attributes: { size: '10', color: 'Blue/White' }, qty: 20 },
    { product: 'Running Shoes CloudFlex', sku: 'RUN-SHOE-11', attributes: { size: '11', color: 'Black/Red' }, qty: 20 },
  ];

  for (const v of variants) {
    const pid = productIds[v.product];
    if (!pid) continue;
    const exists = await query('product_service',
      'SELECT id FROM product_variants WHERE sku = $1', [v.sku]);
    if (exists.rows.length) continue;
    await query('product_service',
      `INSERT INTO product_variants (id, product_id, sku, attributes, inventory_quantity) VALUES ($1, $2, $3, $4, $5)`,
      [uuidv4(), pid, v.sku, JSON.stringify(v.attributes), v.qty]
    );
  }
  info(`Created ${variants.length} product variants`);

  const images = [
    { product: 'Wireless Bluetooth Headphones Pro', url: 'https://picsum.photos/seed/headphones-2/800/800', order: 1 },
    { product: 'Wireless Bluetooth Headphones Pro', url: 'https://picsum.photos/seed/headphones-3/800/800', order: 2 },
    { product: 'Smart Fitness Watch X2', url: 'https://picsum.photos/seed/fitness-watch-2/800/800', order: 1 },
    { product: 'Organic Cotton T-Shirt', url: 'https://picsum.photos/seed/tshirt-2/800/800', order: 1 },
    { product: 'Running Shoes CloudFlex', url: 'https://picsum.photos/seed/running-shoes-2/800/800', order: 1 },
    { product: 'Laptop Backpack 35L', url: 'https://picsum.photos/seed/backpack-2/800/800', order: 1 },
    { product: 'Laptop Backpack 35L', url: 'https://picsum.photos/seed/backpack-3/800/800', order: 2 },
  ];

  for (const img of images) {
    const pid = productIds[img.product];
    if (!pid) continue;
    await query('product_service',
      `INSERT INTO product_images (id, product_id, url, display_order) VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [uuidv4(), pid, img.url, img.order]
    );
  }
  info(`Created additional product images`);

  return productIds;
}

async function seedOrders(userIds, productIds) {
  step('Seeding Order + Payment Service (orders, items, payments)');

  const existing = await query('order_service', 'SELECT COUNT(*)::int AS cnt FROM orders');
  if (existing.rows[0].cnt > 0) {
    warn(`${existing.rows[0].cnt} orders already exist — skipping order seed`);
    return;
  }

  const customerIds = [
    userIds['john.doe@example.com'],
    userIds['jane.smith@example.com'],
    userIds['bob.wilson@example.com'],
    userIds['alice.johnson@example.com'],
    userIds['charlie.brown@example.com'],
  ];

  const allProducts = Object.entries(productIds).map(([title, id]) => {
    const p = productsData.find(x => x.title === title);
    return { id, title, price: p ? p.price : 29.99 };
  });

  const ordersData = [
    { user: customerIds[0], status: 'DELIVERED', paymentStatus: 'COMPLETED', items: [
      { title: 'Wireless Bluetooth Headphones Pro', qty: 1 },
      { title: 'USB-C Charging Hub 7-in-1', qty: 1 },
      { title: 'Noise-Cancelling Sleep Earplugs', qty: 2 },
    ]},
    { user: customerIds[0], status: 'SHIPPED', paymentStatus: 'COMPLETED', items: [
      { title: 'Organic Cotton T-Shirt', qty: 3 },
      { title: 'Merino Wool Crew Socks (3-Pack)', qty: 1 },
    ]},
    { user: customerIds[1], status: 'DELIVERED', paymentStatus: 'COMPLETED', items: [
      { title: 'Premium Yoga Mat', qty: 1 },
      { title: 'Women\'s Yoga Leggings', qty: 2 },
      { title: 'Resistance Bands Set', qty: 1 },
    ]},
    { user: customerIds[1], status: 'PROCESSING', paymentStatus: 'COMPLETED', items: [
      { title: 'Stainless Steel Water Bottle 32oz', qty: 2 },
      { title: 'Scented Soy Candle Collection', qty: 1 },
    ]},
    { user: customerIds[2], status: 'CREATED', paymentStatus: 'PENDING', items: [
      { title: 'Adjustable Dumbbell Set 50lb', qty: 1 },
      { title: 'Cycling Helmet Aero', qty: 1 },
    ]},
    { user: customerIds[2], status: 'CANCELLED', paymentStatus: 'REFUNDED', items: [
      { title: 'Wireless Mechanical Keyboard', qty: 1 },
    ]},
    { user: customerIds[3], status: 'DELIVERED', paymentStatus: 'COMPLETED', items: [
      { title: 'Designing Data-Intensive Applications', qty: 1 },
      { title: 'Clean Code: A Handbook', qty: 1 },
      { title: 'Smart LED Light Bulb', qty: 4 },
    ]},
    { user: customerIds[3], status: 'PAID', paymentStatus: 'COMPLETED', items: [
      { title: 'Canvas Messenger Bag', qty: 1 },
      { title: 'Polarized Sunglasses', qty: 1 },
    ]},
    { user: customerIds[4], status: 'SHIPPED', paymentStatus: 'COMPLETED', items: [
      { title: '4K Webcam with Ring Light', qty: 1 },
      { title: 'Portable Bluetooth Speaker', qty: 1 },
      { title: 'Wireless Ergonomic Mouse', qty: 1 },
    ]},
    { user: customerIds[4], status: 'DELIVERED', paymentStatus: 'COMPLETED', items: [
      { title: 'Denim Jacket Classic', qty: 1 },
      { title: 'Leather Wallet RFID', qty: 1 },
    ]},
  ];

  const orderRecords = [];
  for (const o of ordersData) {
    const oid = uuidv4();
    let total = 0;
    for (const item of o.items) {
      const p = allProducts.find(x => x.title === item.title);
      total += (p ? p.price : 0) * item.qty;
    }

    const address = await query('auth_service',
      'SELECT street, city, state, postal_code, country, phone FROM addresses WHERE user_id = $1 LIMIT 1',
      [o.user]);
    const addr = address.rows[0] || { street: '123 Main St', city: 'San Francisco', state: 'CA', postal_code: '94105', country: 'US' };

    await query('order_service',
      `INSERT INTO orders (id, user_id, status, total_amount, payment_status, shipping_address, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW() - interval '${orderRecords.length} days', NOW())`,
      [oid, o.user, o.status, total, o.paymentStatus, JSON.stringify(addr)]
    );

    for (const item of o.items) {
      const p = allProducts.find(x => x.title === item.title);
      if (!p) continue;
      const subtotal = p.price * item.qty;
      await query('order_service',
        `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), oid, p.id, item.qty, p.price, subtotal]
      );
    }

    const payId = uuidv4();
    const payStatus = o.paymentStatus === 'COMPLETED' ? 'COMPLETED' : o.paymentStatus === 'REFUNDED' ? 'REFUNDED' : 'PENDING';
    await query('payment_service',
      `INSERT INTO payments (id, order_id, user_id, amount, currency, status, payment_method, gateway_transaction_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'USD', $5, 'credit_card', $6, NOW() - interval '${orderRecords.length} days', NOW())`,
      [payId, oid, o.user, total, payStatus, `ch_${uuidv4().replace(/-/g, '').substring(0, 24)}`]
    );

    if (o.paymentStatus === 'REFUNDED') {
      await query('payment_service',
        `INSERT INTO refunds (id, payment_id, amount, reason, status)
         VALUES ($1, $2, $3, 'Customer cancelled order', 'COMPLETED')`,
        [uuidv4(), payId, total]
      );
    }

    orderRecords.push({ id: oid, userId: o.user, status: o.status, total });
    info(`Order ${o.status}: ${oid.substring(0, 8)}... ($${total.toFixed(2)})`);
  }
  return orderRecords;
}

async function seedAnalytics(userIds, orderRecords) {
  step('Seeding Analytics Service');

  const existing = await query('analytics_service', 'SELECT COUNT(*)::int AS cnt FROM user_metrics');
  if (existing.rows[0].cnt > 0) {
    warn(`Analytics data already exists — skipping`);
    return;
  }

  const customerIds = [
    userIds['john.doe@example.com'],
    userIds['jane.smith@example.com'],
    userIds['bob.wilson@example.com'],
    userIds['alice.johnson@example.com'],
    userIds['charlie.brown@example.com'],
  ];

  for (const uid of customerIds) {
    if (!uid) continue;
    const userOrders = orderRecords.filter(o => o.userId === uid);
    const totalOrders = userOrders.length;
    const totalSpent = userOrders.reduce((s, o) => s + o.total, 0);
    const lastOrder = userOrders.length > 0 ? new Date().toISOString() : null;

    await query('analytics_service',
      `INSERT INTO user_metrics (user_id, total_orders, total_spent, lifetime_value, last_order_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         total_orders = EXCLUDED.total_orders,
         total_spent = EXCLUDED.total_spent,
         lifetime_value = EXCLUDED.lifetime_value,
         last_order_at = EXCLUDED.last_order_at`,
      [uid, totalOrders, totalSpent, totalSpent, lastOrder]
    );
  }
  info(`User metrics for ${customerIds.filter(Boolean).length} customers`);

  for (const o of orderRecords) {
    const ts = new Date(Date.now() - orderRecords.indexOf(o) * 86400000);
    await query('analytics_service',
      `INSERT INTO order_metrics (timestamp, total_orders, total_revenue, average_order_value)
       VALUES ($1, 1, $2, $2)
       ON CONFLICT DO NOTHING`,
      [ts.toISOString().replace('T', ' ').substring(0, 19), o.total]
    );
  }
  info(`${orderRecords.length} order metric records`);
}

async function seedNotifications(userIds) {
  step('Seeding Notification Service');

  const existing = await query('notification_service', 'SELECT COUNT(*)::int AS cnt FROM notifications');
  if (existing.rows[0].cnt > 0) {
    warn(`Notifications already exist — skipping`);
    return;
  }

  const notificationTemplates = [
    { type: 'order_confirmation', subject: 'Order Confirmed', content: 'Your order #{{orderId}} has been confirmed and is being processed.' },
    { type: 'order_shipped', subject: 'Order Shipped', content: 'Your order #{{orderId}} has been shipped and is on its way!' },
    { type: 'order_delivered', subject: 'Order Delivered', content: 'Your order #{{orderId}} has been delivered. Enjoy your purchase!' },
    { type: 'welcome', subject: 'Welcome to CommerceSphere', content: 'Welcome to CommerceSphere! Start exploring our curated collection.' },
    { type: 'payment_received', subject: 'Payment Received', content: 'Your payment of ${{amount}} for order #{{orderId}} has been received.' },
  ];

  for (const uid of Object.values(userIds)) {
    if (!uid) continue;
    for (const notif of notificationTemplates.slice(0, 3)) {
      await query('notification_service',
        `INSERT INTO notifications (id, user_id, type, channel, subject, content, status, created_at)
         VALUES ($1, $2, $3, 'email', $4, $5, 'SENT', NOW() - interval '${Math.floor(Math.random() * 7)} days')`,
        [uuidv4(), uid, notif.type, notif.subject, notif.content]
      );
    }
  }
  info(`Notifications created for ${Object.keys(userIds).length} users`);
}

async function seedRecommendations(userIds, productIds) {
  step('Seeding Recommendation Service');

  const existing = await query('recommendation_service', 'SELECT COUNT(*)::int AS cnt FROM user_product_views');
  if (existing.rows[0].cnt > 0) {
    warn(`Recommendation data already exists — skipping`);
    return;
  }

  const customerIds = Object.entries(userIds)
    .filter(([, id]) => id && !['admin@commercesphere.com', 'moderator@commercesphere.com', 'seller1@example.com', 'seller2@example.com'].includes(Object.entries(userIds).find(([k]) => userIds[k] === id)?.[0] || ''))
    .map(([, id]) => id);

  const productIdList = Object.values(productIds);
  for (const uid of customerIds) {
    if (!uid) continue;
    const viewedProducts = productIdList.sort(() => Math.random() - 0.5).slice(0, 10);
    for (const pid of viewedProducts) {
      const daysAgo = Math.floor(Math.random() * 14);
      await query('recommendation_service',
        `INSERT INTO user_product_views (id, user_id, product_id, viewed_at)
         VALUES ($1, $2, $3, NOW() - interval '${daysAgo} days')`,
        [uuidv4(), uid, pid]
      );
    }

    const purchased = productIdList.sort(() => Math.random() - 0.5).slice(0, 3);
    for (const pid of purchased) {
      await query('recommendation_service',
        `INSERT INTO user_purchases (id, user_id, product_id, purchased_at)
         VALUES ($1, $2, $3, NOW() - interval '${Math.floor(Math.random() * 30)} days')`,
        [uuidv4(), uid, pid]
      );
    }
  }
  info(`View/purchase data for ${customerIds.length} customers`);
}

const productsData = [
  { title: 'Wireless Bluetooth Headphones Pro', price: 149.99 },
  { title: 'Smart Fitness Watch X2', price: 199.99 },
  { title: 'USB-C Charging Hub 7-in-1', price: 49.99 },
  { title: 'Wireless Mechanical Keyboard', price: 89.99 },
  { title: 'Portable Bluetooth Speaker', price: 39.99 },
  { title: '4K Webcam with Ring Light', price: 79.99 },
  { title: 'Organic Cotton T-Shirt', price: 29.99 },
  { title: 'Slim Fit Chino Pants', price: 59.99 },
  { title: 'Lightweight Down Jacket', price: 129.99 },
  { title: 'Merino Wool Crew Socks (3-Pack)', price: 24.99 },
  { title: 'Women\'s Yoga Leggings', price: 44.99 },
  { title: 'Denim Jacket Classic', price: 74.99 },
  { title: 'Stainless Steel Water Bottle 32oz', price: 34.99 },
  { title: 'Programmable Coffee Maker', price: 89.99 },
  { title: 'Bamboo Cutting Board Set', price: 39.99 },
  { title: 'Non-Stick Cookware Set 10-Pc', price: 179.99 },
  { title: 'Scented Soy Candle Collection', price: 28.99 },
  { title: 'Smart LED Light Bulb', price: 14.99 },
  { title: 'Premium Yoga Mat', price: 49.99 },
  { title: 'Running Shoes CloudFlex', price: 119.99 },
  { title: 'Adjustable Dumbbell Set 50lb', price: 299.99 },
  { title: 'Insulated Camping Hammock', price: 64.99 },
  { title: 'Resistance Bands Set', price: 19.99 },
  { title: 'Cycling Helmet Aero', price: 89.99 },
  { title: 'Laptop Backpack 35L', price: 79.99 },
  { title: 'Wireless Ergonomic Mouse', price: 39.99 },
  { title: 'Leather Wallet RFID', price: 44.99 },
  { title: 'Polarized Sunglasses', price: 69.99 },
  { title: 'Apple AirPods Pro 2nd Gen', price: 249.99 },
  { title: 'Canvas Messenger Bag', price: 59.99 },
  { title: 'Clean Code: A Handbook', price: 39.99 },
  { title: 'Designing Data-Intensive Applications', price: 49.99 },
  { title: 'Noise-Cancelling Sleep Earplugs', price: 14.99 },
];

async function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   CommerceSphere Database Seeder v2.0    ║');
  console.log('  ╚══════════════════════════════════════════╝');

  try {
    // Ensure all database tables exist before seeding
    await ensureTables('auth_service', [
      `CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'customer',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`,
      `CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(512) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(512) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS addresses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        label VARCHAR(100) NOT NULL DEFAULT 'Home',
        street VARCHAR(255) NOT NULL,
        city VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        postal_code VARCHAR(20) NOT NULL,
        country VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
    ]);
    await ensureTables('product_service', [
      `CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        parent_id UUID REFERENCES categories(id),
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(500) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        category_id UUID REFERENCES categories(id),
        inventory_quantity INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS product_variants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        sku VARCHAR(100) UNIQUE NOT NULL,
        attributes JSONB,
        price DECIMAL(10,2),
        inventory_quantity INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS product_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        url VARCHAR(1000) NOT NULL,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
    ]);
    await ensureTables('order_service', [
      `CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY, user_id UUID NOT NULL,
        status VARCHAR(50) DEFAULT 'CREATED',
        total_amount DECIMAL(10,2) NOT NULL,
        payment_status VARCHAR(50) DEFAULT 'PENDING',
        shipping_address JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS order_items (
        id UUID PRIMARY KEY,
        order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
        product_id UUID NOT NULL, variant_id UUID,
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS order_saga_state (
        id UUID PRIMARY KEY, order_id UUID UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
        current_step VARCHAR(100) NOT NULL,
        completed_steps JSONB DEFAULT '[]',
        compensation_needed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
    ]);
    await ensureTables('payment_service', [
      `CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY, order_id UUID NOT NULL, user_id UUID NOT NULL,
        amount DECIMAL(10,2) NOT NULL, currency VARCHAR(3) DEFAULT 'USD',
        status VARCHAR(50) DEFAULT 'PENDING',
        payment_method VARCHAR(50), gateway_transaction_id VARCHAR(255) UNIQUE,
        gateway_response JSONB, created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS refunds (
        id UUID PRIMARY KEY, payment_id UUID REFERENCES payments(id),
        amount DECIMAL(10,2) NOT NULL, reason TEXT,
        status VARCHAR(50) DEFAULT 'PENDING',
        gateway_refund_id VARCHAR(255), created_at TIMESTAMP DEFAULT NOW()
      )`,
    ]);
    await ensureTables('notification_service', [
      `CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY, user_id UUID NOT NULL,
        type VARCHAR(50) NOT NULL, channel VARCHAR(50) NOT NULL,
        subject VARCHAR(500), content TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'PENDING',
        retry_count INTEGER DEFAULT 0,
        sent_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS notification_preferences (
        id UUID PRIMARY KEY, user_id UUID UNIQUE NOT NULL,
        email_enabled BOOLEAN DEFAULT TRUE,
        sms_enabled BOOLEAN DEFAULT FALSE,
        push_enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
      )`,
    ]);
    await ensureTables('analytics_service', [
      `CREATE TABLE IF NOT EXISTS order_metrics (
        timestamp TIMESTAMP NOT NULL,
        total_orders INTEGER DEFAULT 0,
        total_revenue DECIMAL(12,2) DEFAULT 0,
        average_order_value DECIMAL(10,2) DEFAULT 0,
        PRIMARY KEY (timestamp)
      )`,
      `CREATE TABLE IF NOT EXISTS user_metrics (
        user_id UUID PRIMARY KEY,
        total_orders INTEGER DEFAULT 0,
        total_spent DECIMAL(12,2) DEFAULT 0,
        lifetime_value DECIMAL(12,2) DEFAULT 0,
        last_order_at TIMESTAMP, updated_at TIMESTAMP DEFAULT NOW()
      )`,
    ]);
    await ensureTables('recommendation_service', [
      `CREATE TABLE IF NOT EXISTS user_product_views (
        id UUID PRIMARY KEY, user_id UUID NOT NULL,
        product_id UUID NOT NULL, viewed_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS user_purchases (
        id UUID PRIMARY KEY, user_id UUID NOT NULL,
        product_id UUID NOT NULL, purchased_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS product_similarity (
        product_id_1 UUID NOT NULL, product_id_2 UUID NOT NULL,
        similarity_score FLOAT NOT NULL,
        PRIMARY KEY (product_id_1, product_id_2)
      )`,
    ]);

    const userIds = await seedAuth();
    const productIds = await seedProducts(userIds);
    const orderRecords = await seedOrders(userIds, productIds);
    await seedAnalytics(userIds, orderRecords || []);
    await seedNotifications(userIds);
    await seedRecommendations(userIds, productIds);

    console.log('\n  ──────────────────────────────────────────');
    console.log('  🎉  SEED COMPLETE!');
    console.log('  ──────────────────────────────────────────');
    console.log('');
    console.log('  👤  Admin:     admin@commercesphere.com / Admin@123456');
    console.log('  👤  Moderator: moderator@commercesphere.com / Mod@123456');
    console.log('  👤  Seller 1:  seller1@example.com / Seller@123456 (TechVista Store)');
    console.log('  👤  Seller 2:  seller2@example.com / Seller@123456 (FashionHub)');
    console.log('  👤  Customer:  john.doe@example.com / User@123456');
    console.log('  👤  Customer:  jane.smith@example.com / User@123456');
    console.log('  👤  Customer:  bob.wilson@example.com / User@123456');
    console.log('  👤  Customer:  alice.johnson@example.com / User@123456');
    console.log('  👤  Customer:  charlie.brown@example.com / User@123456');
    console.log('');
    console.log('  📦  33 products across 6 categories');
    console.log('  📋  10 orders in various statuses (DELIVERED, SHIPPED, PROCESSING, CREATED, CANCELLED)');
    console.log('  💳  10 payments + 1 refund');
    console.log('  📊  Analytics metrics for all customers');
    console.log('  🔔  Sample notifications');
    console.log('  👁️   Product views & purchase history for recommendations');
    console.log('');

  } catch (err) {
    console.error('\n  ❌ Seed failed:', err.message);
    console.error(err);
    process.exit(1);
  }
}

main();
