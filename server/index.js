const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 4000;
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "queueless.db");

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
  payments: [],
  sessions: [],
};

let db;

function initDb() {
  fs.mkdirSync(dataDir, { recursive: true });
  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS menu (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price INTEGER NOT NULL,
      prepTime INTEGER NOT NULL,
      stock INTEGER NOT NULL,
      available INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      orderNumber TEXT NOT NULL,
      userId TEXT NOT NULL,
      customerName TEXT NOT NULL,
      total INTEGER NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      etaMinutes INTEGER NOT NULL,
      paymentMethod TEXT NOT NULL,
      paymentMethodLabel TEXT NOT NULL,
      paymentId TEXT
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      orderId TEXT NOT NULL,
      itemId TEXT NOT NULL,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      qty INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      paidAt TEXT
    );
  `);
  const orderColumns = db.prepare("PRAGMA table_info(orders)").all().map((col) => col.name);
  if (!orderColumns.includes("pickupToken")) {
    db.exec("ALTER TABLE orders ADD COLUMN pickupToken TEXT");
  }
  if (!orderColumns.includes("pickupTokenIssuedAt")) {
    db.exec("ALTER TABLE orders ADD COLUMN pickupTokenIssuedAt TEXT");
  }
  if (!orderColumns.includes("pickupTokenRedeemedAt")) {
    db.exec("ALTER TABLE orders ADD COLUMN pickupTokenRedeemedAt TEXT");
  }
  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
  if (userCount === 0) {
    const insertUser = db.prepare(
      "INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)"
    );
    const insertMenu = db.prepare(
      "INSERT INTO menu (id, name, category, price, prepTime, stock, available) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    const seed = db.transaction(() => {
      defaultData.users.forEach((user) => {
        insertUser.run(user.id, user.name, user.email, user.password, user.role);
      });
      defaultData.menu.forEach((item) => {
        insertMenu.run(
          item.id,
          item.name,
          item.category,
          item.price,
          item.prepTime,
          item.stock,
          item.available ? 1 : 0
        );
      });
    });
    seed();
  }
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
  const session = db.prepare("SELECT token, userId FROM sessions WHERE token = ?").get(token);
  if (!session) return res.status(401).json({ message: "Unauthorized" });
  const user = db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(session.userId);
  if (!user) return res.status(401).json({ message: "Unauthorized" });
  req.user = user;
  req.token = token;
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

function mapMenuRow(row) {
  return { ...row, available: Boolean(row.available) };
}

function fetchOrdersForUser(user) {
  const orders =
    user.role === "admin" || user.role === "vendor"
      ? db.prepare("SELECT * FROM orders ORDER BY createdAt DESC").all()
      : db.prepare("SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC").all(user.id);
  const itemsStmt = db.prepare("SELECT itemId, name, price, qty FROM order_items WHERE orderId = ?");
  const includePickupToken = user.role === "student";
  return orders.map((order) => {
    const payload = {
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      customerName: order.customerName,
      items: itemsStmt.all(order.id),
      total: order.total,
      status: order.status,
      createdAt: order.createdAt,
      etaMinutes: order.etaMinutes,
      paymentMethod: order.paymentMethod,
      paymentMethodLabel: order.paymentMethodLabel,
      paymentId: order.paymentId,
    };
    if (includePickupToken) {
      payload.pickupToken = order.pickupToken;
      payload.pickupTokenIssuedAt = order.pickupTokenIssuedAt;
    }
    return payload;
  });
}

function deductStockForOrder(orderId) {
  const items = db.prepare("SELECT itemId, qty FROM order_items WHERE orderId = ?").all(orderId);
  const menuStmt = db.prepare("SELECT stock FROM menu WHERE id = ?");
  const updateStockStmt = db.prepare("UPDATE menu SET stock = ? WHERE id = ?");
  items.forEach((item) => {
    const menuItem = menuStmt.get(item.itemId);
    const qty = Number(item.qty);
    if (!menuItem || !Number.isFinite(qty) || qty <= 0) {
      throw new Error("Invalid item in order");
    }
    if (menuItem.stock < qty) {
      throw new Error("Insufficient stock to complete pickup");
    }
  });
  items.forEach((item) => {
    const menuItem = menuStmt.get(item.itemId);
    updateStockStmt.run(menuItem.stock - Number(item.qty), item.itemId);
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Missing fields" });
  }
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return res.status(409).json({ message: "Email already registered" });
  }
  const token = createToken();
  const userId = createToken();
  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)").run(
    userId,
    name,
    email,
    password,
    "student"
  );
  db.prepare("INSERT INTO sessions (token, userId, createdAt) VALUES (?, ?, ?)").run(
    token,
    userId,
    new Date().toISOString()
  );
  res.json({ token, user: { id: userId, name, email, role: "student" } });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "Missing fields" });
  }
  const user = db
    .prepare("SELECT id, name, email, role FROM users WHERE email = ? AND password = ?")
    .get(email, password);
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  const token = createToken();
  db.prepare("INSERT INTO sessions (token, userId, createdAt) VALUES (?, ?, ?)").run(
    token,
    user.id,
    new Date().toISOString()
  );
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(req.token);
  res.json({ status: "ok" });
});

app.get("/api/me", requireAuth, (req, res) => {
  const { id, name, email, role } = req.user;
  res.json({ id, name, email, role });
});

app.get("/api/menu", async (_req, res) => {
  const menu = db.prepare("SELECT * FROM menu ORDER BY category, name").all().map(mapMenuRow);
  res.json(menu);
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
  db.prepare(
    "INSERT INTO menu (id, name, category, price, prepTime, stock, available) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(item.id, item.name, item.category, item.price, item.prepTime, item.stock, item.available ? 1 : 0);
  res.json(item);
});

app.put("/api/menu/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { name, category, price, prepTime, stock, available } = req.body || {};
  const menuItem = db.prepare("SELECT * FROM menu WHERE id = ?").get(id);
  if (!menuItem) return res.status(404).json({ message: "Not found" });
  const updated = {
    ...menuItem,
    name: name ?? menuItem.name,
    category: category ?? menuItem.category,
    price: Number.isFinite(Number(price)) ? Number(price) : menuItem.price,
    prepTime: Number.isFinite(Number(prepTime)) ? Number(prepTime) : menuItem.prepTime,
    stock: Number.isFinite(Number(stock)) ? Number(stock) : menuItem.stock,
    available: typeof available === "boolean" ? available : Boolean(menuItem.available),
  };
  db.prepare(
    "UPDATE menu SET name = ?, category = ?, price = ?, prepTime = ?, stock = ?, available = ? WHERE id = ?"
  ).run(
    updated.name,
    updated.category,
    updated.price,
    updated.prepTime,
    updated.stock,
    updated.available ? 1 : 0,
    id
  );
  res.json(mapMenuRow(updated));
});

app.patch("/api/menu/:id/stock", requireAuth, requireRole("admin", "vendor"), async (req, res) => {
  const { id } = req.params;
  const { stock, available } = req.body || {};
  const menuItem = db.prepare("SELECT * FROM menu WHERE id = ?").get(id);
  if (!menuItem) return res.status(404).json({ message: "Not found" });
  const updatedStock = Number.isFinite(Number(stock)) ? Number(stock) : menuItem.stock;
  const updatedAvailable = typeof available === "boolean" ? available : Boolean(menuItem.available);
  db.prepare("UPDATE menu SET stock = ?, available = ? WHERE id = ?").run(
    updatedStock,
    updatedAvailable ? 1 : 0,
    id
  );
  res.json(mapMenuRow({ ...menuItem, stock: updatedStock, available: updatedAvailable }));
});

app.delete("/api/menu/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT id FROM menu WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ message: "Not found" });
  db.prepare("DELETE FROM menu WHERE id = ?").run(id);
  res.json({ status: "deleted" });
});

app.post("/api/payments/create-order", requireAuth, requireRole("student"), async (req, res) => {
  const { amount } = req.body || {};
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ message: "Invalid amount" });
  }
  const payment = {
    id: createToken(),
    userId: req.user.id,
    amount: numericAmount,
    currency: "INR",
    provider: "razorpay_simulated",
    status: "created",
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO payments (id, userId, amount, currency, provider, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    payment.id,
    payment.userId,
    payment.amount,
    payment.currency,
    payment.provider,
    payment.status,
    payment.createdAt
  );
  res.json({
    paymentId: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
  });
});

app.post("/api/payments/confirm", requireAuth, requireRole("student"), async (req, res) => {
  const { paymentId } = req.body || {};
  if (!paymentId) {
    return res.status(400).json({ message: "Missing paymentId" });
  }
  const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId);
  if (!payment || payment.userId !== req.user.id) {
    return res.status(404).json({ message: "Payment not found" });
  }
  const paidAt = new Date().toISOString();
  db.prepare("UPDATE payments SET status = ?, paidAt = ? WHERE id = ?").run("paid", paidAt, paymentId);
  res.json({
    paymentId,
    status: "paid",
  });
});

app.get("/api/orders", requireAuth, async (req, res) => {
  const orders = fetchOrdersForUser(req.user);
  return res.json(orders);
});

app.post("/api/orders", requireAuth, requireRole("student"), async (req, res) => {
  const { items, paymentMethod, paymentId } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Cart is empty" });
  }
  const selectedPayment = paymentMethod || "pay_on_pickup";
  const paymentLabels = {
    pay_on_pickup: "Pay on pickup",
    razorpay_simulated: "Razorpay (simulated)",
  };
  if (!paymentLabels[selectedPayment]) {
    return res.status(400).json({ message: "Invalid payment method" });
  }
  const placeOrder = db.transaction(() => {
    const menuStmt = db.prepare("SELECT * FROM menu WHERE id = ?");
    const orderCount = db.prepare("SELECT COUNT(*) as count FROM orders").get().count;
    const orderItems = [];
    let total = 0;
    let etaMinutes = 0;
    for (const entry of items) {
      const menuItem = menuStmt.get(entry.itemId);
      const qty = Number(entry.qty);
      if (!menuItem || !Number.isFinite(qty) || qty <= 0) {
        throw new Error("Invalid item in cart");
      }
      if (!menuItem.available || menuItem.stock < qty) {
        throw new Error(`Insufficient stock for ${menuItem.name}`);
      }
      orderItems.push({
        itemId: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        qty,
      });
      total += menuItem.price * qty;
      etaMinutes += menuItem.prepTime * qty;
    }
    if (selectedPayment === "razorpay_simulated") {
      if (!paymentId) {
        throw new Error("Payment required");
      }
      const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId);
      if (!payment || payment.userId !== req.user.id) {
        throw new Error("Payment not found");
      }
      if (payment.status !== "paid") {
        throw new Error("Payment not confirmed");
      }
      if (payment.amount !== total) {
        throw new Error("Payment amount mismatch");
      }
    }
    const orderId = createToken();
    const orderNumber = String(orderCount + 1).padStart(4, "0");
    const createdAt = new Date().toISOString();
    const pickupToken = createToken();
    const pickupTokenIssuedAt = createdAt;
    const etaMinutesRounded = Math.max(5, Math.round(etaMinutes));
    const insertOrder = db.prepare(
      "INSERT INTO orders (id, orderNumber, userId, customerName, total, status, createdAt, etaMinutes, paymentMethod, paymentMethodLabel, paymentId, pickupToken, pickupTokenIssuedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    insertOrder.run(
      orderId,
      orderNumber,
      req.user.id,
      req.user.name,
      total,
      "Pending",
      createdAt,
      etaMinutesRounded,
      selectedPayment,
      paymentLabels[selectedPayment],
      paymentId || null,
      pickupToken,
      pickupTokenIssuedAt
    );
    const insertItem = db.prepare(
      "INSERT INTO order_items (id, orderId, itemId, name, price, qty) VALUES (?, ?, ?, ?, ?, ?)"
    );
    orderItems.forEach((item) => {
      insertItem.run(createToken(), orderId, item.itemId, item.name, item.price, item.qty);
    });
    return {
      id: orderId,
      orderNumber,
      userId: req.user.id,
      customerName: req.user.name,
      items: orderItems,
      total,
      status: "Pending",
      createdAt,
      etaMinutes: etaMinutesRounded,
      paymentMethod: selectedPayment,
      paymentMethodLabel: paymentLabels[selectedPayment],
      paymentId: paymentId || null,
      pickupToken,
      pickupTokenIssuedAt,
    };
  });
  try {
    const order = placeOrder();
    res.json(order);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.patch("/api/orders/:id/status", requireAuth, requireRole("admin", "vendor"), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const allowed = ["Pending", "Preparing", "Ready", "Completed"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }
  if (req.user.role === "vendor" && status === "Completed") {
    return res.status(403).json({ message: "Use pickup verification to complete orders" });
  }
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  if (!order) return res.status(404).json({ message: "Not found" });
  if (status === "Completed" && order.status !== "Completed") {
    const completeOrder = db.transaction(() => {
      deductStockForOrder(order.id);
      const redeemedAt = new Date().toISOString();
      db.prepare("UPDATE orders SET status = ?, pickupTokenRedeemedAt = ? WHERE id = ?").run(
        "Completed",
        redeemedAt,
        order.id
      );
    });
    try {
      completeOrder();
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  } else {
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
  }
  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  const items = db.prepare("SELECT itemId, name, price, qty FROM order_items WHERE orderId = ?").all(id);
  res.json({
    ...updated,
    items,
  });
});

app.post("/api/orders/:id/redeem", requireAuth, requireRole("vendor"), async (req, res) => {
  const { id } = req.params;
  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ message: "Missing token" });
  }
  const completeOrder = db.transaction(() => {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
    if (!order) throw new Error("Not found");
    if (order.status === "Completed") {
      throw new Error("Order already picked up");
    }
    if (order.status !== "Ready") {
      throw new Error("Order not ready for pickup");
    }
    if (!order.pickupToken || order.pickupToken !== token) {
      throw new Error("Invalid pickup token");
    }
    deductStockForOrder(order.id);
    const redeemedAt = new Date().toISOString();
    db.prepare("UPDATE orders SET status = ?, pickupTokenRedeemedAt = ? WHERE id = ?").run(
      "Completed",
      redeemedAt,
      order.id
    );
    const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id);
    const items = db.prepare("SELECT itemId, name, price, qty FROM order_items WHERE orderId = ?").all(
      order.id
    );
    return { ...updated, items };
  });
  try {
    const updated = completeOrder();
    res.json(updated);
  } catch (error) {
    const message = error.message === "Not found" ? "Not found" : error.message;
    res.status(message === "Not found" ? 404 : 400).json({ message });
  }
});

app.post("/api/orders/redeem-by-token", requireAuth, requireRole("vendor"), async (req, res) => {
  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ message: "Missing token" });
  }
  const completeOrder = db.transaction(() => {
    const order = db.prepare("SELECT * FROM orders WHERE pickupToken = ?").get(token);
    if (!order) throw new Error("Invalid pickup token");
    if (order.status === "Completed") {
      throw new Error("Order already picked up");
    }
    if (order.status !== "Ready") {
      throw new Error("Order not ready for pickup");
    }
    deductStockForOrder(order.id);
    const redeemedAt = new Date().toISOString();
    db.prepare("UPDATE orders SET status = ?, pickupTokenRedeemedAt = ? WHERE id = ?").run(
      "Completed",
      redeemedAt,
      order.id
    );
    const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id);
    const items = db.prepare("SELECT itemId, name, price, qty FROM order_items WHERE orderId = ?").all(
      order.id
    );
    return { ...updated, items };
  });
  try {
    const updated = completeOrder();
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

initDb();
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
