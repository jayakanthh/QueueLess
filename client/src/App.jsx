import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function App() {
  const [authTab, setAuthTab] = useState('login')
  const [token, setToken] = useState(localStorage.getItem('ql_token') || '')
  const [user, setUser] = useState(null)
  const [menu, setMenu] = useState([])
  const [orders, setOrders] = useState([])
  const [cart, setCart] = useState([])
  const [message, setMessage] = useState('')
  const [menuForm, setMenuForm] = useState({
    id: '',
    name: '',
    category: '',
    price: '',
    prepTime: '',
    stock: '',
    available: true,
  })
  const [paymentMethod, setPaymentMethod] = useState('pay_on_pickup')
  const [vendorDrafts, setVendorDrafts] = useState({})
  const [showWelcome, setShowWelcome] = useState(!token)

  const currency = useMemo(
    () =>
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }),
    [],
  )

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.qty, 0),
    [cart],
  )

  const apiFetch = useCallback(
    async (path, options = {}) => {
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.message || 'Request failed')
      }
      return data
    },
    [token],
  )

  const loadMenu = useCallback(async () => {
    const data = await apiFetch('/api/menu', { method: 'GET' })
    setMenu(data)
  }, [apiFetch])

  const loadOrders = useCallback(async () => {
    if (!token) return
    const data = await apiFetch('/api/orders', { method: 'GET' })
    setOrders(data)
  }, [apiFetch, token])

  const loadMe = useCallback(async () => {
    if (!token) return
    try {
      const data = await apiFetch('/api/me', { method: 'GET' })
      setUser(data)
    } catch {
      setToken('')
      localStorage.removeItem('ql_token')
      setUser(null)
    }
  }, [apiFetch, token])

  useEffect(() => {
    if (!token) return
    loadMe()
  }, [token, loadMe])

  useEffect(() => {
    if (!user) return
    loadMenu().catch(() => {})
    loadOrders().catch(() => {})
  }, [user, loadMenu, loadOrders])

  useEffect(() => {
    const drafts = {}
    menu.forEach((item) => {
      drafts[item.id] = {
        stock: item.stock ?? 0,
        available: item.available !== false,
      }
    })
    setVendorDrafts(drafts)
  }, [menu])

  function resetMessage() {
    setMessage('')
  }

  async function handleLogin(event) {
    event.preventDefault()
    resetMessage()
    const formData = new FormData(event.target)
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: formData.get('email'),
          password: formData.get('password'),
        }),
      })
      setToken(data.token)
      localStorage.setItem('ql_token', data.token)
      setUser(data.user)
      setShowWelcome(false)
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function handleRegister(event) {
    event.preventDefault()
    resetMessage()
    const formData = new FormData(event.target)
    try {
      const data = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          password: formData.get('password'),
        }),
      })
      setToken(data.token)
      localStorage.setItem('ql_token', data.token)
      setUser(data.user)
      setShowWelcome(false)
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function handleLogout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      setMessage(error.message)
    }
    setToken('')
    localStorage.removeItem('ql_token')
    setUser(null)
    setCart([])
    setShowWelcome(true)
  }

  function handleAddToCart(item) {
    if (!item.available || item.stock <= 0) return
    setCart((prev) => {
      const existing = prev.find((entry) => entry.itemId === item.id)
      if (existing) {
        return prev.map((entry) =>
          entry.itemId === item.id ? { ...entry, qty: entry.qty + 1 } : entry,
        )
      }
      return [
        ...prev,
        {
          itemId: item.id,
          name: item.name,
          price: item.price,
          qty: 1,
        },
      ]
    })
  }

  function updateCart(itemId, delta) {
    setCart((prev) =>
      prev
        .map((entry) =>
          entry.itemId === itemId ? { ...entry, qty: entry.qty + delta } : entry,
        )
        .filter((entry) => entry.qty > 0),
    )
  }

  function removeCartItem(itemId) {
    setCart((prev) => prev.filter((entry) => entry.itemId !== itemId))
  }

  async function placeOrder() {
    resetMessage()
    try {
      const order = await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map((item) => ({ itemId: item.itemId, qty: item.qty })),
          paymentMethod,
        }),
      })
      setCart([])
      setOrders((prev) => [order, ...prev])
      loadMenu().catch(() => {})
    } catch (error) {
      setMessage(error.message)
    }
  }

  function handleMenuFormChange(event) {
    const { name, value, type, checked } = event.target
    setMenuForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  function handleEditMenu(item) {
    setMenuForm({
      id: item.id,
      name: item.name,
      category: item.category,
      price: item.price,
      prepTime: item.prepTime,
      stock: item.stock ?? 0,
      available: item.available !== false,
    })
  }

  function resetMenuForm() {
    setMenuForm({
      id: '',
      name: '',
      category: '',
      price: '',
      prepTime: '',
      stock: '',
      available: true,
    })
  }

  async function submitMenuForm(event) {
    event.preventDefault()
    resetMessage()
    const payload = {
      name: menuForm.name,
      category: menuForm.category,
      price: Number(menuForm.price),
      prepTime: Number(menuForm.prepTime),
      stock: Number(menuForm.stock),
      available: menuForm.available,
    }
    try {
      if (menuForm.id) {
        await apiFetch(`/api/menu/${menuForm.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      } else {
        await apiFetch('/api/menu', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }
      resetMenuForm()
      loadMenu().catch(() => {})
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function deleteMenuItem(itemId) {
    resetMessage()
    try {
      await apiFetch(`/api/menu/${itemId}`, { method: 'DELETE' })
      loadMenu().catch(() => {})
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function updateOrderStatus(orderId, status) {
    resetMessage()
    try {
      await apiFetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      loadOrders().catch(() => {})
    } catch (error) {
      setMessage(error.message)
    }
  }

  function updateVendorDraft(itemId, field, value) {
    setVendorDrafts((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }))
  }

  async function saveVendorStock(itemId) {
    resetMessage()
    const draft = vendorDrafts[itemId]
    if (!draft) return
    try {
      await apiFetch(`/api/menu/${itemId}/stock`, {
        method: 'PATCH',
        body: JSON.stringify({
          stock: Number(draft.stock),
          available: draft.available,
        }),
      })
      loadMenu().catch(() => {})
    } catch (error) {
      setMessage(error.message)
    }
  }

  if (!user) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="brand-name">QueueLess</span>
            <span className="brand-subtitle">Digital Canteen Ordering</span>
          </div>
        </header>

        <main className="content">
          {showWelcome ? (
            <section className="card welcome">
              <div className="section-header">
                <h2>Welcome to QueueLess</h2>
                <p>Order ahead, skip the line, and keep the canteen moving.</p>
              </div>
              <div className="hero">
                <div>
                  <h3>How it works</h3>
                  <ul className="hero-list">
                    <li>Browse the live canteen menu with stock visibility.</li>
                    <li>Place your order and track status in real time.</li>
                    <li>Vendors update stock while admins manage menu + orders.</li>
                  </ul>
                </div>
                <div className="hero-actions">
                  <button
                    className="primary"
                    onClick={() => {
                      setAuthTab('login')
                      setShowWelcome(false)
                    }}
                  >
                    Continue to Login
                  </button>
                  <button
                    className="ghost"
                    onClick={() => {
                      setAuthTab('register')
                      setShowWelcome(false)
                    }}
                  >
                    Create Account
                  </button>
                </div>
              </div>
              <div className="hint">
                <div className="hint-title">Demo logins</div>
                <div className="hint-body">
                  <div>Admin: admin@canteen.com / admin123</div>
                  <div>Vendor: vendor@canteen.com / vendor123</div>
                  <div>Student: student@canteen.com / student123</div>
                </div>
              </div>
            </section>
          ) : (
            <section className="card">
              <div className="tabs">
                <button
                  className={`tab ${authTab === 'login' ? 'active' : ''}`}
                  onClick={() => setAuthTab('login')}
                >
                  Login
                </button>
                <button
                  className={`tab ${authTab === 'register' ? 'active' : ''}`}
                  onClick={() => setAuthTab('register')}
                >
                  Register
                </button>
              </div>

              {authTab === 'login' ? (
                <form className="form" onSubmit={handleLogin}>
                  <div className="form-row">
                    <label>Email</label>
                    <input type="email" name="email" required />
                  </div>
                  <div className="form-row">
                    <label>Password</label>
                    <input type="password" name="password" required />
                  </div>
                  <button type="submit" className="primary">
                    Login
                  </button>
                </form>
              ) : (
                <form className="form" onSubmit={handleRegister}>
                  <div className="form-row">
                    <label>Full Name</label>
                    <input type="text" name="name" required />
                  </div>
                  <div className="form-row">
                    <label>Email</label>
                    <input type="email" name="email" required />
                  </div>
                  <div className="form-row">
                    <label>Password</label>
                    <input type="password" name="password" required />
                  </div>
                  <button type="submit" className="primary">
                    Create Account
                  </button>
                </form>
              )}

              {message && <div className="message">{message}</div>}
              <div className="hint">
                <div className="hint-title">Demo logins</div>
                <div className="hint-body">
                  <div>Admin: admin@canteen.com / admin123</div>
                  <div>Vendor: vendor@canteen.com / vendor123</div>
                  <div>Student: student@canteen.com / student123</div>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">QueueLess</span>
          <span className="brand-subtitle">Digital Canteen Ordering</span>
        </div>
        <div className="user-area">
          <span>
            {user.name} ({user.role})
          </span>
          <button className="ghost" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="content">
        {message && <div className="banner">{message}</div>}

        {user.role === 'student' && (
          <>
            <section className="card portal-header">
              <div className="section-header">
                <h2>Customer Portal</h2>
                <p>Manage your canteen orders and track progress.</p>
              </div>
            </section>
            <section className="grid">
              <div className="card">
                <div className="section-header">
                  <h2>Menu</h2>
                  <p>Pick your items and add them to cart.</p>
                </div>
                <div className="list">
                  {menu.length === 0 && (
                    <div className="empty-state">No menu items available.</div>
                  )}
                  {menu.map((item) => (
                    <div className="list-item" key={item.id}>
                      <div className="item-details">
                        <div className="item-title">{item.name}</div>
                        <div className="item-meta">
                          {item.category} · {item.prepTime} min
                        </div>
                        <div className="item-meta">
                          {currency.format(item.price)}
                        </div>
                        <div className="item-meta">
                          Stock: {item.stock ?? 0} ·{' '}
                          {item.available ? 'Available' : 'Unavailable'}
                        </div>
                      </div>
                      <div className="actions">
                        <button
                          className="primary"
                          disabled={!item.available || item.stock <= 0}
                          onClick={() => handleAddToCart(item)}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="section-header">
                  <h2>Your Cart</h2>
                  <p>Review items before placing the order.</p>
                </div>
                <div className="list">
                  {cart.length === 0 && (
                    <div className="empty-state">Cart is empty.</div>
                  )}
                  {cart.map((item) => (
                    <div className="list-item" key={item.itemId}>
                      <div className="item-details">
                        <div className="item-title">{item.name}</div>
                        <div className="item-meta">
                          {currency.format(item.price)} · Qty {item.qty}
                        </div>
                      </div>
                      <div className="actions">
                        <button
                          className="ghost"
                          onClick={() => updateCart(item.itemId, -1)}
                        >
                          -
                        </button>
                        <button
                          className="ghost"
                          onClick={() => updateCart(item.itemId, 1)}
                        >
                          +
                        </button>
                        <button
                          className="ghost"
                          onClick={() => removeCartItem(item.itemId)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-summary">
                  <div className="summary-row">
                    <span>Total</span>
                    <span>{currency.format(cartTotal)}</span>
                  </div>
                  <div className="form-row">
                    <label>Payment Method</label>
                    <select
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value)}
                    >
                      <option value="pay_on_pickup">Pay on pickup</option>
                      <option value="simulated">Simulated payment</option>
                    </select>
                  </div>
                  <button
                    className="primary"
                    disabled={cart.length === 0}
                    onClick={placeOrder}
                  >
                    Place Order
                  </button>
                </div>
              </div>
            </section>

            <section className="card">
              <div className="section-header">
                <h2>Order Status</h2>
                <p>Track your current and past orders.</p>
              </div>
              <div className="list">
                {orders.length === 0 && (
                  <div className="empty-state">No orders yet.</div>
                )}
                {orders.map((order) => (
                  <div className="list-item" key={order.id}>
                    <div className="item-details">
                      <div className="item-title">
                        Order {order.orderNumber}
                      </div>
                      <div className="item-meta">
                        {order.items
                          .map((item) => `${item.name} × ${item.qty}`)
                          .join(', ')}
                      </div>
                      <div className="item-meta">
                        ETA {order.etaMinutes} min ·{' '}
                        {new Date(order.createdAt).toLocaleString()}
                      </div>
                      <div className="item-meta">
                        Payment: {order.paymentMethodLabel}
                      </div>
                    </div>
                    <div className="actions">
                      <span className={`chip ${order.status.toLowerCase()}`}>
                        {order.status}
                      </span>
                      <span className="chip">
                        {currency.format(order.total)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {user.role === 'admin' && (
          <>
            <section className="card portal-header">
              <div className="section-header">
                <h2>Admin Portal</h2>
                <p>Oversee menu, orders, and service flow.</p>
              </div>
            </section>
            <section className="grid">
              <div className="card">
                <div className="section-header">
                  <h2>Manage Menu</h2>
                  <p>Add, update, or remove menu items.</p>
                </div>
                <form className="form compact" onSubmit={submitMenuForm}>
                  <div className="form-row">
                    <label>Item Name</label>
                    <input
                      name="name"
                      value={menuForm.name}
                      onChange={handleMenuFormChange}
                      required
                    />
                  </div>
                  <div className="form-row">
                    <label>Category</label>
                    <input
                      name="category"
                      value={menuForm.category}
                      onChange={handleMenuFormChange}
                      required
                    />
                  </div>
                  <div className="form-row">
                    <label>Price (₹)</label>
                    <input
                      name="price"
                      type="number"
                      min="1"
                      value={menuForm.price}
                      onChange={handleMenuFormChange}
                      required
                    />
                  </div>
                  <div className="form-row">
                    <label>Prep Time (min)</label>
                    <input
                      name="prepTime"
                      type="number"
                      min="1"
                      value={menuForm.prepTime}
                      onChange={handleMenuFormChange}
                      required
                    />
                  </div>
                  <div className="form-row">
                    <label>Stock</label>
                    <input
                      name="stock"
                      type="number"
                      min="0"
                      value={menuForm.stock}
                      onChange={handleMenuFormChange}
                      required
                    />
                  </div>
                  <div className="form-row checkbox">
                    <input
                      id="available"
                      type="checkbox"
                      name="available"
                      checked={menuForm.available}
                      onChange={handleMenuFormChange}
                    />
                    <label htmlFor="available">Available</label>
                  </div>
                  <div className="button-row">
                    <button type="submit" className="primary">
                      {menuForm.id ? 'Update Item' : 'Add Item'}
                    </button>
                    <button type="button" className="ghost" onClick={resetMenuForm}>
                      Cancel
                    </button>
                  </div>
                </form>
                <div className="list">
                  {menu.length === 0 && (
                    <div className="empty-state">No menu items configured.</div>
                  )}
                  {menu.map((item) => (
                    <div className="list-item" key={item.id}>
                      <div className="item-details">
                        <div className="item-title">{item.name}</div>
                        <div className="item-meta">
                          {item.category} · {item.prepTime} min
                        </div>
                        <div className="item-meta">
                          {currency.format(item.price)} · Stock {item.stock ?? 0}
                        </div>
                        <div className="item-meta">
                          {item.available ? 'Available' : 'Unavailable'}
                        </div>
                      </div>
                      <div className="actions">
                        <button
                          className="ghost"
                          onClick={() => handleEditMenu(item)}
                        >
                          Edit
                        </button>
                        <button
                          className="ghost"
                          onClick={() => deleteMenuItem(item.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="section-header">
                  <h2>Incoming Orders</h2>
                  <p>Update status as orders are prepared.</p>
                </div>
                <div className="list">
                  {orders.length === 0 && (
                    <div className="empty-state">No orders yet.</div>
                  )}
                  {orders.map((order) => (
                    <div className="list-item" key={order.id}>
                      <div className="item-details">
                        <div className="item-title">
                          Order {order.orderNumber} · {order.customerName}
                        </div>
                        <div className="item-meta">
                          {order.items
                            .map((item) => `${item.name} × ${item.qty}`)
                            .join(', ')}
                        </div>
                        <div className="item-meta">
                          ETA {order.etaMinutes} min ·{' '}
                          {currency.format(order.total)}
                        </div>
                        <div className="item-meta">
                          Payment: {order.paymentMethodLabel}
                        </div>
                      </div>
                      <div className="actions">
                        <select
                          value={order.status}
                          onChange={(event) =>
                            updateOrderStatus(order.id, event.target.value)
                          }
                        >
                          {['Pending', 'Preparing', 'Ready', 'Completed'].map(
                            (status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        {user.role === 'vendor' && (
          <>
            <section className="card portal-header">
              <div className="section-header">
                <h2>Vendor Portal</h2>
                <p>Track stock levels and keep items available.</p>
              </div>
            </section>
            <section className="grid">
              <div className="card">
                <div className="section-header">
                  <h2>Stock Dashboard</h2>
                  <p>Update stock levels and availability.</p>
                </div>
                <div className="list">
                  {menu.length === 0 && (
                    <div className="empty-state">No menu items available.</div>
                  )}
                  {menu.map((item) => {
                    const draft = vendorDrafts[item.id] || {
                      stock: item.stock ?? 0,
                      available: item.available !== false,
                    }
                    return (
                      <div className="list-item" key={item.id}>
                        <div className="item-details">
                          <div className="item-title">{item.name}</div>
                          <div className="item-meta">
                            {item.category} · Current stock {item.stock ?? 0}
                          </div>
                          {item.stock <= 5 && (
                            <div className="item-meta warning">Low stock</div>
                          )}
                        </div>
                        <div className="actions wrap">
                          <div className="inline-field">
                            <label>Stock</label>
                            <input
                              type="number"
                              min="0"
                              value={draft.stock}
                              onChange={(event) =>
                                updateVendorDraft(
                                  item.id,
                                  'stock',
                                  event.target.value,
                                )
                              }
                            />
                          </div>
                          <div className="inline-field checkbox">
                            <input
                              type="checkbox"
                              id={`available-${item.id}`}
                              checked={draft.available}
                              onChange={(event) =>
                                updateVendorDraft(
                                  item.id,
                                  'available',
                                  event.target.checked,
                                )
                              }
                            />
                            <label htmlFor={`available-${item.id}`}>
                              Available
                            </label>
                          </div>
                          <button
                            className="primary"
                            onClick={() => saveVendorStock(item.id)}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

export default App
