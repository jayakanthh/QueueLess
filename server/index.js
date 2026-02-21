const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 4000;
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "db.json");

app.use(cors());
app.use(express.json());

const defaultData = {
  users: [
    {
      id: "u-admin",
      name: "Canteen Admin",
      email: "admin@canteen.com",
      password: "admin123",
      role: "admin",
    },
    {
      id: "u-vendor",
      name: "Stock Vendor",
      email: "vendor@canteen.com",
      password: "vendor123",
      role: "vendor",
    },
    {
      id: "u-student",
      name: "Demo Student",
      email: "student@canteen.com",
      password: "student123",
      role: "student",
    },
  ],
  menu: [
    { id: "m1", name: "Veg Sandwich", category: "Snacks", price: 40, prepTime: 8, stock: 25, available: true },
    { id: "m2", name: "Paneer Wrap", category: "Wraps", price: 75, prepTime: 12, stock: 18, available: true },
    { id: "m3", name: "Masala Dosa", category: "Meals", price: 60, prepTime: 10, stock: 20, available: true },
    { id: "m4", name: "Lemon Soda", category: "Beverages", price: 25, prepTime: 3, stock: 40, available: true },
    { id: "m5", name: "Fruit Bowl", category: "Healthy", price: 50, prepTime: 5, stock: 12, available: true },
  ],
  orders: [],
  sessions: [],
};

async function ensureDb() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    await fs.writeFile(dbPath, JSON.stringify(defaultData, null, 2));
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(dbPath, "utf-8");
  return JSON.parse(raw);
}

async function writeDb(data) {
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2));
}

function createToken() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
}

function getAuthToken(req) {
  const header = req.headers.authorization;
  if (!header) return null;
  const parts = header.split(" ");
  if (parts.length !== 2) return null;
  return parts[1];
}

async function requireAuth(req, res, next) {
  const token = getAuthToken(req);
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  const db = await readDb();
  const session = db.sessions.find((entry) => entry.token === token);
  if (!session) return res.status(401).json({ message: "Unauthorized" });
  const user = db.users.find((entry) => entry.id === session.userId);
  if (!user) return res.status(401).json({ message: "Unauthorized" });
  req.user = user;
  req.token = token;
  req.db = db;
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Missing fields" });
  }
  const db = await readDb();
  if (db.users.some((user) => user.email === email)) {
    return res.status(409).json({ message: "Email already registered" });
  }
  const user = {
    id: createToken(),
    name,
    email,
    password,
    role: "student",
  };
  const token = createToken();
  db.users.push(user);
  db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
  await writeDb(db);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "Missing fields" });
  }
  const db = await readDb();
  const user = db.users.find((entry) => entry.email === email && entry.password === password);
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  const token = createToken();
  db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
  await writeDb(db);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  req.db.sessions = req.db.sessions.filter((session) => session.token !== req.token);
  await writeDb(req.db);
  res.json({ status: "ok" });
});

app.get("/api/me", requireAuth, (req, res) => {
  const { id, name, email, role } = req.user;
  res.json({ id, name, email, role });
});

app.get("/api/menu", async (_req, res) => {
  const db = await readDb();
  res.json(db.menu);
});

app.post("/api/menu", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, category, price, prepTime, stock, available } = req.body || {};
  if (!name || !category || !price || !prepTime) {
    return res.status(400).json({ message: "Missing fields" });
  }
  const item = {
    id: createToken(),
    name,
    category,
    price: Number(price),
    prepTime: Number(prepTime),
    stock: Number.isFinite(Number(stock)) ? Number(stock) : 0,
    available: available !== false,
  };
  req.db.menu.push(item);
  await writeDb(req.db);
  res.json(item);
});

app.put("/api/menu/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { name, category, price, prepTime, stock, available } = req.body || {};
  const menuItem = req.db.menu.find((item) => item.id === id);
  if (!menuItem) return res.status(404).json({ message: "Not found" });
  menuItem.name = name ?? menuItem.name;
  menuItem.category = category ?? menuItem.category;
  menuItem.price = Number.isFinite(Number(price)) ? Number(price) : menuItem.price;
  menuItem.prepTime = Number.isFinite(Number(prepTime)) ? Number(prepTime) : menuItem.prepTime;
  if (Number.isFinite(Number(stock))) menuItem.stock = Number(stock);
  if (typeof available === "boolean") menuItem.available = available;
  await writeDb(req.db);
  res.json(menuItem);
});

app.patch("/api/menu/:id/stock", requireAuth, requireRole("admin", "vendor"), async (req, res) => {
  const { id } = req.params;
  const { stock, available } = req.body || {};
  const menuItem = req.db.menu.find((item) => item.id === id);
  if (!menuItem) return res.status(404).json({ message: "Not found" });
  if (Number.isFinite(Number(stock))) menuItem.stock = Number(stock);
  if (typeof available === "boolean") menuItem.available = available;
  await writeDb(req.db);
  res.json(menuItem);
});

app.delete("/api/menu/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const existing = req.db.menu.find((item) => item.id === id);
  if (!existing) return res.status(404).json({ message: "Not found" });
  req.db.menu = req.db.menu.filter((item) => item.id !== id);
  await writeDb(req.db);
  res.json({ status: "deleted" });
});

app.get("/api/orders", requireAuth, async (req, res) => {
  if (req.user.role === "admin" || req.user.role === "vendor") {
    return res.json(req.db.orders);
  }
  const orders = req.db.orders.filter((order) => order.userId === req.user.id);
  return res.json(orders);
});

app.post("/api/orders", requireAuth, requireRole("student"), async (req, res) => {
  const { items, paymentMethod } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Cart is empty" });
  }
  const menuMap = new Map(req.db.menu.map((item) => [item.id, item]));
  const orderItems = [];
  let total = 0;
  let etaMinutes = 0;
  for (const entry of items) {
    const menuItem = menuMap.get(entry.itemId);
    const qty = Number(entry.qty);
    if (!menuItem || !Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ message: "Invalid item in cart" });
    }
    if (!menuItem.available || menuItem.stock < qty) {
      return res.status(400).json({ message: `Insufficient stock for ${menuItem.name}` });
    }
    menuItem.stock -= qty;
    orderItems.push({
      itemId: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      qty,
    });
    total += menuItem.price * qty;
    etaMinutes += menuItem.prepTime * qty;
  }
  const orderNumber = String(req.db.orders.length + 1).padStart(4, "0");
  const paymentMethodLabel = paymentMethod === "simulated" ? "Simulated payment" : "Pay on pickup";
  const order = {
    id: createToken(),
    orderNumber,
    userId: req.user.id,
    customerName: req.user.name,
    items: orderItems,
    total,
    status: "Pending",
    createdAt: new Date().toISOString(),
    etaMinutes: Math.max(5, Math.round(etaMinutes)),
    paymentMethod: paymentMethod || "pay_on_pickup",
    paymentMethodLabel,
  };
  req.db.orders.unshift(order);
  await writeDb(req.db);
  res.json(order);
});

app.patch("/api/orders/:id/status", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const allowed = ["Pending", "Preparing", "Ready", "Completed"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }
  const order = req.db.orders.find((entry) => entry.id === id);
  if (!order) return res.status(404).json({ message: "Not found" });
  order.status = status;
  await writeDb(req.db);
  res.json(order);
});

ensureDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
  });
});
