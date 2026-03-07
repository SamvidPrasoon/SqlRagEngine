import "dotenv/config";
import { getDB } from "../../src/db/adapter.js";

const db = getDB();

console.log("🌱 Seeding database...");

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    city TEXT,
    tier TEXT DEFAULT 'standard' CHECK(tier IN ('standard','premium','vip')),
    total_orders INTEGER DEFAULT 0,
    lifetime_value REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    price REAL NOT NULL,
    cost REAL NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    reorder_level INTEGER DEFAULT 10,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','shipped','delivered','cancelled')),
    total_amount REAL NOT NULL,
    discount_amount REAL DEFAULT 0,
    shipping_cost REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('discount','flash_sale','loyalty')),
    discount_pct REAL,
    budget REAL,
    spent REAL DEFAULT 0,
    starts_at TEXT,
    ends_at TEXT
  );
`);

const insert = {
  customer: db.prepare(
    `INSERT OR IGNORE INTO customers (name, email, city, tier, total_orders, lifetime_value) VALUES (?, ?, ?, ?, ?, ?)`,
  ),
  category: db.prepare(`INSERT OR IGNORE INTO categories (name) VALUES (?)`),
  product: db.prepare(
    `INSERT OR IGNORE INTO products (name, sku, category_id, price, cost, stock_quantity, reorder_level) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ),
  order: db.prepare(
    `INSERT OR IGNORE INTO orders (customer_id, status, total_amount, discount_amount, shipping_cost, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ),
  item: db.prepare(
    `INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)`,
  ),
  campaign: db.prepare(
    `INSERT OR IGNORE INTO campaigns (name, type, discount_pct, budget, spent, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ),
};

db.transaction(() => {
  // Customers
  [
    ["Alice Johnson", "alice@example.com", "New York", "vip", 24, 4820.5],
    ["Bob Smith", "bob@example.com", "Los Angeles", "premium", 12, 1540.0],
    ["Carol White", "carol@example.com", "Chicago", "standard", 3, 320.0],
    ["David Brown", "david@example.com", "Houston", "premium", 8, 980.0],
    ["Eva Martinez", "eva@example.com", "Phoenix", "vip", 31, 6750.0],
    ["Frank Lee", "frank@example.com", "Philadelphia", "standard", 2, 185.0],
    ["Grace Kim", "grace@example.com", "San Antonio", "standard", 5, 430.0],
    ["Henry Wilson", "henry@example.com", "San Diego", "premium", 15, 2100.0],
    ["Isabella Davis", "isabella@example.com", "Dallas", "vip", 42, 9300.0],
    ["James Garcia", "james@example.com", "San Jose", "standard", 1, 89.0],
    ["Kate Thompson", "kate@example.com", "Austin", "premium", 9, 1200.0],
    ["Liam Anderson", "liam@example.com", "Jacksonville", "standard", 4, 310.0],
  ].forEach((r) =>
    insert.customer.run(...(r as Parameters<typeof insert.customer.run>)),
  );

  // Categories
  ["Electronics", "Clothing", "Home & Kitchen", "Sports", "Books"].forEach(
    (c) => insert.category.run(c),
  );

  // Products
  [
    ["Wireless Earbuds Pro", "SKU-E001", 1, 129.99, 45.0, 234, 20],
    ['4K Smart TV 55"', "SKU-E002", 1, 699.99, 320.0, 18, 5],
    ["Laptop Stand", "SKU-E003", 1, 49.99, 12.0, 145, 30],
    ["USB-C Hub 7-in-1", "SKU-E004", 1, 59.99, 18.0, 89, 25],
    ["Men's Running Shoes", "SKU-C001", 2, 89.99, 28.0, 312, 50],
    ["Women's Yoga Pants", "SKU-C002", 2, 54.99, 14.0, 425, 75],
    ["Winter Jacket", "SKU-C003", 2, 149.99, 55.0, 73, 20],
    ["Coffee Maker Deluxe", "SKU-H001", 3, 79.99, 28.0, 156, 30],
    ["Air Fryer XL", "SKU-H002", 3, 119.99, 42.0, 204, 40],
    ["Yoga Mat Premium", "SKU-S001", 4, 39.99, 11.0, 389, 60],
    ["Dumbbell Set 20kg", "SKU-S002", 4, 189.99, 75.0, 42, 15],
    ["Python Programming", "SKU-B001", 5, 34.99, 8.0, 580, 100],
  ].forEach((r) =>
    insert.product.run(...(r as Parameters<typeof insert.product.run>)),
  );

  // Orders + items
  const statuses = [
    "delivered",
    "delivered",
    "delivered",
    "shipped",
    "processing",
    "cancelled",
  ];
  const dates = [
    "2024-01-15",
    "2024-02-03",
    "2024-03-22",
    "2024-04-10",
    "2024-05-05",
    "2024-06-18",
    "2024-07-29",
    "2024-08-14",
    "2024-09-02",
    "2024-10-11",
    "2024-11-05",
    "2024-12-01",
    "2025-01-08",
    "2025-02-14",
    "2025-03-03",
  ];
  const prices = [
    129.99, 699.99, 49.99, 59.99, 89.99, 54.99, 149.99, 79.99, 119.99, 39.99,
    189.99, 34.99,
  ];

  for (let i = 0; i < 60; i++) {
    insert.order.run(
      (i % 12) + 1,
      statuses[i % statuses.length],
      parseFloat((Math.random() * 400 + 30).toFixed(2)),
      10,
      9.99,
      dates[i % dates.length],
    );
    const orderId = i + 1;
    for (let j = 0; j < (i % 3) + 1; j++) {
      const pid = ((i + j) % 12) + 1;
      insert.item.run(orderId, pid, (j % 3) + 1, prices[pid - 1]);
    }
  }

  // Campaigns
  [
    [
      "Summer Sale 2024",
      "discount",
      15,
      5000,
      3200,
      "2024-06-01",
      "2024-08-31",
    ],
    ["Black Friday", "flash_sale", 30, 10000, 9800, "2024-11-29", "2024-11-30"],
    [
      "VIP Loyalty Program",
      "loyalty",
      20,
      8000,
      4500,
      "2024-01-01",
      "2024-12-31",
    ],
    [
      "New Year Flash",
      "flash_sale",
      25,
      3000,
      2800,
      "2025-01-01",
      "2025-01-03",
    ],
  ].forEach((r) =>
    insert.campaign.run(...(r as Parameters<typeof insert.campaign.run>)),
  );
})();

console.log(
  "✅ Done! Tables: customers, categories, products, orders, order_items, campaigns",
);
