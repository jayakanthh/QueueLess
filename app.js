const KEYS = {
  users: "ql_users",
  menu: "ql_menu",
  orders: "ql_orders",
  session: "ql_session",
};

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const storage = {
  get(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
};

const defaultMenu = [
  { id: "m1", name: "Veg Sandwich", category: "Snacks", price: 40, prepTime: 8 },
  { id: "m2", name: "Paneer Wrap", category: "Wraps", price: 75, prepTime: 12 },
  { id: "m3", name: "Masala Dosa", category: "Meals", price: 60, prepTime: 10 },
  { id: "m4", name: "Lemon Soda", category: "Beverages", price: 25, prepTime: 3 },
  { id: "m5", name: "Fruit Bowl", category: "Healthy", price: 50, prepTime: 5 },
];

const defaultUsers = [
  {
    id: "u-admin",
    name: "Canteen Admin",
    email: "admin@canteen.com",
    password: "admin123",
    role: "admin",
  },
];

const state = {
  currentUser: null,
  cart: [],
};

const elements = {
  userArea: document.getElementById("user-area"),
  authSection: document.getElementById("auth-section"),
  studentSection: document.getElementById("student-section"),
  adminSection: document.getElementById("admin-section"),
  menuList: document.getElementById("menu-list"),
  cartList: document.getElementById("cart-list"),
  cartTotal: document.getElementById("cart-total"),
  studentOrders: document.getElementById("student-orders"),
  adminOrders: document.getElementById("admin-orders"),
  adminMenuList: document.getElementById("admin-menu-list"),
  authMessage: document.getElementById("auth-message"),
  paymentMethod: document.getElementById("payment-method"),
  placeOrder: document.getElementById("place-order"),
};

const menuForm = document.getElementById("menu-form");
const menuCancel = document.getElementById("menu-cancel");
const menuSubmit = document.getElementById("menu-submit");

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

const tabs = Array.from(document.querySelectorAll(".tab"));

function initData() {
  const menu = storage.get(KEYS.menu, null);
  if (!menu || !Array.isArray(menu) || menu.length === 0) {
    storage.set(KEYS.menu, defaultMenu);
  }
  const users = storage.get(KEYS.users, null);
  if (!users || !Array.isArray(users) || users.length === 0) {
    storage.set(KEYS.users, defaultUsers);
  }
  const orders = storage.get(KEYS.orders, null);
  if (!orders || !Array.isArray(orders)) {
    storage.set(KEYS.orders, []);
  }
}

function getUsers() {
  return storage.get(KEYS.users, []);
}

function getMenu() {
  return storage.get(KEYS.menu, []);
}

function getOrders() {
  return storage.get(KEYS.orders, []);
}

function saveOrders(orders) {
  storage.set(KEYS.orders, orders);
}

function saveMenu(menu) {
  storage.set(KEYS.menu, menu);
}

function setSessionUser(userId) {
  storage.set(KEYS.session, userId);
}

function loadSessionUser() {
  const userId = storage.get(KEYS.session, null);
  if (!userId) return null;
  const user = getUsers().find((item) => item.id === userId);
  return user || null;
}

function setCurrentUser(user) {
  state.currentUser = user;
  setSessionUser(user ? user.id : null);
}

function toggleAuthTab(tab) {
  tabs.forEach((item) => item.classList.toggle("active", item.dataset.tab === tab));
  loginForm.classList.toggle("hidden", tab !== "login");
  registerForm.classList.toggle("hidden", tab !== "register");
  elements.authMessage.textContent = "";
}

function renderUserArea() {
  if (!state.currentUser) {
    elements.userArea.innerHTML = "";
    return;
  }
  elements.userArea.innerHTML = `
    <span>${state.currentUser.name} (${state.currentUser.role})</span>
    <button class="ghost" data-action="logout">Logout</button>
  `;
}

function showSection(section) {
  elements.authSection.classList.add("hidden");
  elements.studentSection.classList.add("hidden");
  elements.adminSection.classList.add("hidden");
  section.classList.remove("hidden");
}

function renderMenu() {
  const menu = getMenu();
  if (menu.length === 0) {
    elements.menuList.innerHTML = `<div class="empty-state">No menu items available.</div>`;
    return;
  }
  elements.menuList.innerHTML = menu
    .map(
      (item) => `
        <div class="list-item">
          <div class="item-details">
            <div class="item-title">${item.name}</div>
            <div class="item-meta">${item.category} · ${item.prepTime} min</div>
            <div class="item-meta">${currency.format(item.price)}</div>
          </div>
          <div class="actions">
            <button class="primary" data-action="add-to-cart" data-id="${item.id}">Add</button>
          </div>
        </div>
      `
    )
    .join("");
}

function renderCart() {
  if (state.cart.length === 0) {
    elements.cartList.innerHTML = `<div class="empty-state">Cart is empty.</div>`;
    elements.cartTotal.textContent = currency.format(0);
    elements.placeOrder.disabled = true;
    return;
  }
  elements.placeOrder.disabled = false;
  elements.cartList.innerHTML = state.cart
    .map(
      (item) => `
        <div class="list-item">
          <div class="item-details">
            <div class="item-title">${item.name}</div>
            <div class="item-meta">${currency.format(item.price)} · Qty ${item.qty}</div>
          </div>
          <div class="actions">
            <button class="ghost" data-action="cart-dec" data-id="${item.itemId}">-</button>
            <button class="ghost" data-action="cart-inc" data-id="${item.itemId}">+</button>
            <button class="ghost" data-action="cart-remove" data-id="${item.itemId}">Remove</button>
          </div>
        </div>
      `
    )
    .join("");
  elements.cartTotal.textContent = currency.format(calculateCartTotal());
}

function renderStudentOrders() {
  const orders = getOrders().filter((order) => order.userId === state.currentUser.id);
  if (orders.length === 0) {
    elements.studentOrders.innerHTML = `<div class="empty-state">No orders yet.</div>`;
    return;
  }
  elements.studentOrders.innerHTML = orders
    .map((order) => {
      const items = order.items
        .map((item) => `${item.name} × ${item.qty}`)
        .join(", ");
      return `
        <div class="list-item">
          <div class="item-details">
            <div class="item-title">Order ${order.orderNumber}</div>
            <div class="item-meta">${items}</div>
            <div class="item-meta">ETA ${order.etaMinutes} min · ${new Date(
              order.createdAt
            ).toLocaleString()}</div>
            <div class="item-meta">Payment: ${order.paymentMethodLabel}</div>
          </div>
          <div class="actions">
            <span class="chip ${order.status.toLowerCase()}">${order.status}</span>
            <span class="chip">${currency.format(order.total)}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderAdminMenuList() {
  const menu = getMenu();
  if (menu.length === 0) {
    elements.adminMenuList.innerHTML = `<div class="empty-state">No menu items configured.</div>`;
    return;
  }
  elements.adminMenuList.innerHTML = menu
    .map(
      (item) => `
        <div class="list-item">
          <div class="item-details">
            <div class="item-title">${item.name}</div>
            <div class="item-meta">${item.category} · ${item.prepTime} min</div>
            <div class="item-meta">${currency.format(item.price)}</div>
          </div>
          <div class="actions">
            <button class="ghost" data-action="edit-menu" data-id="${item.id}">Edit</button>
            <button class="ghost" data-action="delete-menu" data-id="${item.id}">Delete</button>
          </div>
        </div>
      `
    )
    .join("");
}

function renderAdminOrders() {
  const orders = getOrders();
  if (orders.length === 0) {
    elements.adminOrders.innerHTML = `<div class="empty-state">No orders yet.</div>`;
    return;
  }
  elements.adminOrders.innerHTML = orders
    .map((order) => {
      const items = order.items
        .map((item) => `${item.name} × ${item.qty}`)
        .join(", ");
      return `
        <div class="list-item">
          <div class="item-details">
            <div class="item-title">Order ${order.orderNumber} · ${order.customerName}</div>
            <div class="item-meta">${items}</div>
            <div class="item-meta">ETA ${order.etaMinutes} min · ${currency.format(
              order.total
            )}</div>
            <div class="item-meta">Payment: ${order.paymentMethodLabel}</div>
          </div>
          <div class="actions">
            <select data-action="update-status" data-id="${order.id}">
              ${["Pending", "Preparing", "Ready", "Completed"]
                .map(
                  (status) => `
                    <option value="${status}" ${order.status === status ? "selected" : ""}>
                      ${status}
                    </option>
                  `
                )
                .join("")}
            </select>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderApp() {
  renderUserArea();
  if (!state.currentUser) {
    showSection(elements.authSection);
    return;
  }
  if (state.currentUser.role === "admin") {
    showSection(elements.adminSection);
    renderAdminMenuList();
    renderAdminOrders();
  } else {
    showSection(elements.studentSection);
    renderMenu();
    renderCart();
    renderStudentOrders();
  }
}

function calculateCartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function calculateEtaMinutes(cart) {
  const menu = getMenu();
  const minutes = cart.reduce((sum, item) => {
    const menuItem = menu.find((entry) => entry.id === item.itemId);
    const prep = menuItem ? menuItem.prepTime : 5;
    return sum + prep * item.qty;
  }, 0);
  return Math.max(5, Math.round(minutes));
}

function addToCart(itemId) {
  const menuItem = getMenu().find((item) => item.id === itemId);
  if (!menuItem) return;
  const existing = state.cart.find((item) => item.itemId === itemId);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({
      itemId,
      name: menuItem.name,
      price: menuItem.price,
      qty: 1,
    });
  }
  renderCart();
}

function updateCart(itemId, delta) {
  const existing = state.cart.find((item) => item.itemId === itemId);
  if (!existing) return;
  existing.qty += delta;
  if (existing.qty <= 0) {
    state.cart = state.cart.filter((item) => item.itemId !== itemId);
  }
  renderCart();
}

function removeCartItem(itemId) {
  state.cart = state.cart.filter((item) => item.itemId !== itemId);
  renderCart();
}

function placeOrder() {
  if (state.cart.length === 0) return;
  const orders = getOrders();
  const orderNumber = String(orders.length + 1).padStart(4, "0");
  const paymentMethod = elements.paymentMethod.value;
  const paymentMethodLabel =
    paymentMethod === "simulated" ? "Simulated payment" : "Pay on pickup";
  const order = {
    id: crypto.randomUUID ? crypto.randomUUID() : `o-${Date.now()}`,
    orderNumber,
    userId: state.currentUser.id,
    customerName: state.currentUser.name,
    items: state.cart,
    total: calculateCartTotal(),
    status: "Pending",
    createdAt: new Date().toISOString(),
    etaMinutes: calculateEtaMinutes(state.cart),
    paymentMethod,
    paymentMethodLabel,
  };
  orders.unshift(order);
  saveOrders(orders);
  state.cart = [];
  renderCart();
  renderStudentOrders();
}

function saveMenuItem(formData) {
  const menu = getMenu();
  const id = formData.get("id");
  const item = {
    id: id || (crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}`),
    name: formData.get("name"),
    category: formData.get("category"),
    price: Number(formData.get("price")),
    prepTime: Number(formData.get("prepTime")),
  };
  let updated;
  if (id) {
    updated = menu.map((entry) => (entry.id === id ? item : entry));
  } else {
    updated = [...menu, item];
  }
  saveMenu(updated);
  menuForm.reset();
  menuSubmit.textContent = "Add Item";
  renderAdminMenuList();
  renderMenu();
}

function editMenuItem(itemId) {
  const item = getMenu().find((entry) => entry.id === itemId);
  if (!item) return;
  menuForm.elements.id.value = item.id;
  menuForm.elements.name.value = item.name;
  menuForm.elements.category.value = item.category;
  menuForm.elements.price.value = item.price;
  menuForm.elements.prepTime.value = item.prepTime;
  menuSubmit.textContent = "Update Item";
}

function deleteMenuItem(itemId) {
  const updated = getMenu().filter((entry) => entry.id !== itemId);
  saveMenu(updated);
  renderAdminMenuList();
  renderMenu();
}

function updateOrderStatus(orderId, status) {
  const orders = getOrders().map((order) =>
    order.id === orderId ? { ...order, status } : order
  );
  saveOrders(orders);
  renderAdminOrders();
  if (state.currentUser.role !== "admin") {
    renderStudentOrders();
  }
}

function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const email = formData.get("email");
  const password = formData.get("password");
  const user = getUsers().find(
    (entry) => entry.email === email && entry.password === password
  );
  if (!user) {
    elements.authMessage.textContent = "Invalid credentials.";
    return;
  }
  setCurrentUser(user);
  state.cart = [];
  renderApp();
}

function handleRegister(event) {
  event.preventDefault();
  const formData = new FormData(registerForm);
  const email = formData.get("email");
  const users = getUsers();
  if (users.some((user) => user.email === email)) {
    elements.authMessage.textContent = "Email already registered.";
    return;
  }
  const newUser = {
    id: crypto.randomUUID ? crypto.randomUUID() : `u-${Date.now()}`,
    name: formData.get("name"),
    email,
    password: formData.get("password"),
    role: "student",
  };
  storage.set(KEYS.users, [...users, newUser]);
  setCurrentUser(newUser);
  state.cart = [];
  registerForm.reset();
  renderApp();
}

function logout() {
  setCurrentUser(null);
  state.cart = [];
  renderApp();
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => toggleAuthTab(tab.dataset.tab));
});

loginForm.addEventListener("submit", handleLogin);
registerForm.addEventListener("submit", handleRegister);

menuForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveMenuItem(new FormData(menuForm));
});

menuCancel.addEventListener("click", () => {
  menuForm.reset();
  menuSubmit.textContent = "Add Item";
});

elements.placeOrder.addEventListener("click", placeOrder);

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (action === "add-to-cart") addToCart(id);
  if (action === "cart-inc") updateCart(id, 1);
  if (action === "cart-dec") updateCart(id, -1);
  if (action === "cart-remove") removeCartItem(id);
  if (action === "edit-menu") editMenuItem(id);
  if (action === "delete-menu") deleteMenuItem(id);
  if (action === "logout") logout();
});

document.addEventListener("change", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  if (target.dataset.action === "update-status") {
    updateOrderStatus(target.dataset.id, target.value);
  }
});

initData();
state.currentUser = loadSessionUser();
renderApp();
