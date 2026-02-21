import {
  Html5QrcodeScanner,
  Html5QrcodeSupportedFormats,
  Html5QrcodeScanType,
} from 'html5-qrcode'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || ''

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
  const [paymentMethod] = useState('razorpay_simulated')
  const [paymentIntent, setPaymentIntent] = useState(null)
  const [paymentStatus, setPaymentStatus] = useState('')
  const [vendorDrafts, setVendorDrafts] = useState({})
  const [scanToken, setScanToken] = useState('')
  const [studentPage, setStudentPage] = useState('menu')
  const [vendorPage, setVendorPage] = useState('orders')
  const [showWelcome, setShowWelcome] = useState(!token)
  const scannerRef = useRef(null)
  const scanDelayRef = useRef(null)
  const scanCooldownRef = useRef(false)
  const lastNoQrRef = useRef(0)
  const lastOrderStatusRef = useRef(new Map())
  const hasLoadedOrdersRef = useRef(false)

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
  const requiresOnlinePayment = paymentMethod === 'razorpay_simulated'
  const activeOrders = useMemo(
    () => orders.filter((order) => order.status !== 'Completed'),
    [orders],
  )
  const pastOrders = useMemo(
    () => orders.filter((order) => order.status === 'Completed'),
    [orders],
  )
  const readyOrders = useMemo(
    () => orders.filter((order) => order.status === 'Ready'),
    [orders],
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
    if (!user) return
    const interval = setInterval(() => {
      loadOrders().catch(() => {})
    }, 10000)
    return () => clearInterval(interval)
  }, [user, loadOrders])

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

  useEffect(() => {
    if (!user) return
    if (user.role === 'student') setStudentPage('menu')
    if (user.role === 'vendor') setVendorPage('orders')
  }, [user])

  useEffect(() => {
    if (!requiresOnlinePayment || cart.length === 0) {
      setPaymentIntent(null)
      setPaymentStatus('')
      return
    }
    if (paymentIntent && paymentIntent.amount === cartTotal) return
    setPaymentIntent(null)
    setPaymentStatus('')
  }, [requiresOnlinePayment, cart, cartTotal, paymentIntent])

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
    if (scannerRef.current) {
      scannerRef.current.clear().catch(() => {})
      scannerRef.current = null
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
          paymentId: paymentIntent?.paymentId || null,
        }),
      })
      setCart([])
      setPaymentIntent(null)
      setPaymentStatus('')
      setOrders((prev) => [order, ...prev])
      loadMenu().catch(() => {})
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function createPaymentOrder() {
    resetMessage()
    try {
      const intent = await apiFetch('/api/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ amount: cartTotal }),
      })
      setPaymentIntent(intent)
      setPaymentStatus(intent.status)
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function confirmPayment() {
    if (!paymentIntent?.paymentId) return
    resetMessage()
    try {
      const result = await apiFetch('/api/payments/confirm', {
        method: 'POST',
        body: JSON.stringify({ paymentId: paymentIntent.paymentId }),
      })
      setPaymentStatus(result.status)
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

  function adjustMenuFormStock(delta) {
    setMenuForm((prev) => {
      const current = Number(prev.stock || 0)
      return {
        ...prev,
        stock: Math.max(0, current + delta),
      }
    })
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

  const redeemOrderByToken = useCallback(
    async (token) => {
      resetMessage()
      if (!token) return
      try {
        await apiFetch('/api/orders/redeem-by-token', {
          method: 'POST',
          body: JSON.stringify({ token }),
        })
        setScanToken('')
        loadOrders().catch(() => {})
      } catch (error) {
        setMessage(error.message)
      }
    },
    [apiFetch, loadOrders],
  )

  const clearScanDelay = useCallback(() => {
    if (scanDelayRef.current) {
      clearTimeout(scanDelayRef.current)
      scanDelayRef.current = null
    }
  }, [])

  useEffect(() => {
    if (vendorPage !== 'scan' || !user || user.role !== 'vendor') {
      clearScanDelay()
      scanCooldownRef.current = false
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {})
        scannerRef.current = null
      }
      return
    }

    const config = {
      fps: 10,
      qrbox: { width: 240, height: 240 },
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      rememberLastUsedCamera: true,
      supportedScanTypes: [
        Html5QrcodeScanType.SCAN_TYPE_CAMERA,
        Html5QrcodeScanType.SCAN_TYPE_FILE,
      ],
    }

    const scanner = new Html5QrcodeScanner('qr-reader', config, false)
    scanner.render(
      (decodedText) => {
        if (!decodedText) return
        if (scanCooldownRef.current) return
        scanCooldownRef.current = true
        clearScanDelay()
        setScanToken(decodedText)
        toast.success('QR valid. Completing pickup...', {
          autoClose: 5000,
        })
        scanDelayRef.current = setTimeout(() => {
          redeemOrderByToken(decodedText).finally(() => {
            scanCooldownRef.current = false
          })
        }, 5000)
      },
      (error) => {
        if (scanCooldownRef.current) return
        const message = error?.toString?.() || ''
        if (!message.toLowerCase().includes('notfound')) return
        const now = Date.now()
        if (now - lastNoQrRef.current < 2000) return
        lastNoQrRef.current = now
        toast.info('No QR detected', { autoClose: 1500 })
      },
    )
    scannerRef.current = scanner

    return () => {
      clearScanDelay()
      scanCooldownRef.current = false
      scanner.clear().catch(() => {})
      scannerRef.current = null
    }
  }, [vendorPage, user, redeemOrderByToken, clearScanDelay])

  useEffect(() => {
    if (!user || user.role !== 'student') return
    if (!hasLoadedOrdersRef.current) {
      hasLoadedOrdersRef.current = true
      const initialMap = new Map()
      orders.forEach((order) => {
        initialMap.set(order.id, order.status)
      })
      lastOrderStatusRef.current = initialMap
      return
    }

    orders.forEach((order) => {
      const previous = lastOrderStatusRef.current.get(order.id)
      if (previous !== 'Ready' && order.status === 'Ready') {
        toast.success(`Order ${order.orderNumber} is ready for pickup`, {
          autoClose: 4000,
        })
      }
      lastOrderStatusRef.current.set(order.id, order.status)
    })
  }, [orders, user])

  function updateVendorDraft(itemId, field, value) {
    setVendorDrafts((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }))
  }

  function adjustVendorDraftStock(itemId, delta) {
    setVendorDrafts((prev) => {
      const current = Number(prev[itemId]?.stock ?? 0)
      return {
        ...prev,
        [itemId]: {
          ...prev[itemId],
          stock: Math.max(0, current + delta),
        },
      }
    })
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
          <div className="topbar-nav">
            <button
              className={`tab-button ${authTab === 'login' ? 'active' : ''}`}
              onClick={() => {
                setAuthTab('login')
                setShowWelcome(false)
              }}
            >
              Login
            </button>
            <button
              className={`tab-button ${authTab === 'register' ? 'active' : ''}`}
              onClick={() => {
                setAuthTab('register')
                setShowWelcome(false)
              }}
            >
              Register
            </button>
          </div>
        </header>

        <main className="content">
          {showWelcome ? (
            <section className="card welcome">
              <div className="welcome-hero">
                <div className="welcome-copy">
                  <span className="welcome-pill">Smart Canteen</span>
                  <h2>Skip the line with QueueLess</h2>
                  <p>
                    Order in seconds, track preparation, and collect your meal
                    right on time with a smoother campus experience.
                  </p>
                </div>
                <div className="welcome-panel">
                  <div className="welcome-stat">
                    <span>Live Menu</span>
                    <strong>Stock-aware</strong>
                  </div>
                  <div className="welcome-stat">
                    <span>Order Tracking</span>
                    <strong>Real-time ETA</strong>
                  </div>
                  <div className="welcome-stat">
                    <span>Pickup Ready</span>
                    <strong>QR Verified</strong>
                  </div>
                </div>
              </div>
              <div className="welcome-grid">
                <div className="welcome-card">
                  <h3>Browse & build</h3>
                  <p>Pick items fast with live availability and prep times.</p>
                </div>
                <div className="welcome-card">
                  <h3>Track in real time</h3>
                  <p>Stay updated from pending to ready-for-pickup.</p>
                </div>
                <div className="welcome-card">
                  <h3>Pick up confidently</h3>
                  <p>Scan the QR token for quick, secure handoff.</p>
                </div>
              </div>
            </section>
          ) : (
            <section className="card auth-card">
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
            </section>
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <ToastContainer position="bottom-right" newestOnTop />
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">QueueLess</span>
          <span className="brand-subtitle">Digital Canteen Ordering</span>
        </div>
        {user.role === 'student' && (
          <div className="topbar-nav">
            <button
              className={`tab-button ${
                studentPage === 'menu' ? 'active' : ''
              }`}
              onClick={() => setStudentPage('menu')}
            >
              Menu
            </button>
            <button
              className={`tab-button ${
                studentPage === 'orders' ? 'active' : ''
              }`}
              onClick={() => setStudentPage('orders')}
            >
              Orders
            </button>
          </div>
        )}
        {user.role === 'vendor' && (
          <div className="topbar-nav">
            <button
              className={`tab-button ${vendorPage === 'menu' ? 'active' : ''}`}
              onClick={() => setVendorPage('menu')}
            >
              Menu
            </button>
            <button
              className={`tab-button ${
                vendorPage === 'orders' ? 'active' : ''
              }`}
              onClick={() => setVendorPage('orders')}
            >
              Orders
            </button>
            <button
              className={`tab-button ${vendorPage === 'scan' ? 'active' : ''}`}
              onClick={() => setVendorPage('scan')}
            >
              Scan
            </button>
          </div>
        )}
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
            {studentPage === 'menu' && (
              <section className="grid">
                <div className="card">
                  <div className="section-header">
                    <h2>Menu</h2>
                    <p>Pick your items and add them to cart.</p>
                  </div>
                  <div className="list">
                    {menu.length === 0 && (
                      <div className="empty-state">
                        No menu items available.
                      </div>
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
                      <div className="item-meta">Razorpay</div>
                    </div>
                    {requiresOnlinePayment && (
                      <div className="payment-box">
                        <div className="payment-row">
                          <div>
                            <div className="item-title">Razorpay Checkout</div>
                            <div className="item-meta">
                              Amount {currency.format(cartTotal)}
                            </div>
                            {paymentStatus && (
                              <div className="item-meta">
                                Status: {paymentStatus}
                              </div>
                            )}
                          </div>
                          <div className="actions">
                            <button
                              className="ghost"
                              onClick={createPaymentOrder}
                              disabled={cart.length === 0}
                            >
                              Generate
                            </button>
                            <button
                              className="primary"
                              onClick={confirmPayment}
                              disabled={!paymentIntent}
                            >
                              Pay Now
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    <button
                      className="primary"
                      disabled={
                        cart.length === 0 ||
                        (requiresOnlinePayment && paymentStatus !== 'paid')
                      }
                      onClick={placeOrder}
                    >
                      Place Order
                    </button>
                  </div>
                </div>
              </section>
            )}

            {studentPage === 'orders' && (
              <section className="card">
                <div className="section-header">
                  <h2>Order Tracker</h2>
                  <p>
                    Active {activeOrders.length} · Past {pastOrders.length}
                  </p>
                </div>
                <div className="orders-grid">
                  <div className="card">
                    <div className="section-header">
                      <h3>Active Orders</h3>
                      <p>Preparing, ready, or pending pickup.</p>
                    </div>
                    <div className="list">
                      {activeOrders.length === 0 && (
                        <div className="empty-state">
                          No active orders right now.
                        </div>
                      )}
                      {activeOrders.map((order) => (
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
                            {order.pickupToken && order.paymentId && (
                                <div className="pickup-box">
                                  <div className="item-title">Pickup QR</div>
                                  <div className="item-meta">
                                    Show this at the counter to complete pickup.
                                  </div>
                                  <img
                                    className="pickup-qr"
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(
                                      order.pickupToken,
                                    )}`}
                                    alt="Pickup QR"
                                  />
                                  <div className="item-meta">
                                    Token: {order.pickupToken}
                                  </div>
                                </div>
                              )}
                          </div>
                          <div className="actions">
                            <span
                              className={`chip ${order.status.toLowerCase()}`}
                            >
                              {order.status}
                            </span>
                            <span className="chip">
                              {currency.format(order.total)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="card">
                    <div className="section-header">
                      <h3>Past Orders</h3>
                      <p>Completed orders and receipts.</p>
                    </div>
                    <div className="list">
                      {pastOrders.length === 0 && (
                        <div className="empty-state">
                          No completed orders yet.
                        </div>
                      )}
                      {pastOrders.map((order) => (
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
                              {new Date(order.createdAt).toLocaleString()}
                            </div>
                            <div className="item-meta">
                              Payment: {order.paymentMethodLabel}
                            </div>
                          </div>
                          <div className="actions">
                            <span className="chip completed">Completed</span>
                            <span className="chip">
                              {currency.format(order.total)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {user.role === 'admin' && (
          <>
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
                    <div className="stepper">
                      <button
                        type="button"
                        className="stepper-btn"
                        onClick={() => adjustMenuFormStock(-1)}
                      >
                        -
                      </button>
                      <input
                        name="stock"
                        type="number"
                        min="0"
                        value={menuForm.stock}
                        onChange={handleMenuFormChange}
                        required
                      />
                      <button
                        type="button"
                        className="stepper-btn"
                        onClick={() => adjustMenuFormStock(1)}
                      >
                        +
                      </button>
                    </div>
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
            {vendorPage === 'menu' && (
              <section className="grid">
                <div className="card">
                  <div className="section-header">
                    <h2>Menu Editor</h2>
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
                              <div className="stepper">
                                <button
                                  type="button"
                                  className="stepper-btn"
                                  onClick={() =>
                                    adjustVendorDraftStock(item.id, -1)
                                  }
                                >
                                  -
                                </button>
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
                                <button
                                  type="button"
                                  className="stepper-btn"
                                  onClick={() => adjustVendorDraftStock(item.id, 1)}
                                >
                                  +
                                </button>
                              </div>
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
            )}

            {vendorPage === 'orders' && (
              <section className="card">
                <div className="section-header">
                  <h2>Incoming Orders</h2>
                  <p>Move orders from preparing to ready for pickup.</p>
                </div>
                <div className="list">
                  {activeOrders.length === 0 && (
                    <div className="empty-state">No active orders.</div>
                  )}
                  {activeOrders.map((order) => (
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
                      <div className="actions status-actions">
                        {['Pending', 'Preparing', 'Ready'].map((status) => (
                          <button
                            key={status}
                            type="button"
                            className={`status-button ${
                              order.status === status ? 'active' : ''
                            }`}
                            onClick={() => updateOrderStatus(order.id, status)}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="section-header">
                  <h3>Completed Orders</h3>
                  <p>Orders verified via pickup QR.</p>
                </div>
                <div className="list">
                  {pastOrders.length === 0 && (
                    <div className="empty-state">
                      No completed orders yet.
                    </div>
                  )}
                  {pastOrders.map((order) => (
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
                          {new Date(order.createdAt).toLocaleString()}
                        </div>
                        <div className="item-meta">
                          Payment: {order.paymentMethodLabel}
                        </div>
                      </div>
                      <div className="actions">
                        <span className="chip completed">Completed</span>
                        <span className="chip">
                          {currency.format(order.total)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {vendorPage === 'scan' && (
              <section className="card">
                <div className="section-header">
                  <h2>Scan Pickup QR</h2>
                  <p>Verify the token to complete the order.</p>
                </div>
                <div className="scan-layout">
                  <div className="scan-panel">
                    <div id="qr-reader" className="scan-reader" />
                    <div className="form-row">
                      <label>Pickup Token</label>
                      <input
                        value={scanToken}
                        onChange={(event) => setScanToken(event.target.value)}
                        placeholder="Scan or paste token"
                      />
                    </div>
                    <button
                      className="primary"
                      onClick={() => redeemOrderByToken(scanToken)}
                      disabled={!scanToken}
                    >
                      Complete Order
                    </button>
                  </div>
                  <div className="scan-list">
                    <div className="section-header">
                      <h3>Ready Orders</h3>
                      <p>Match the pickup token with these orders.</p>
                    </div>
                    <div className="list">
                      {readyOrders.length === 0 && (
                        <div className="empty-state">
                          No ready orders to verify.
                        </div>
                      )}
                      {readyOrders.map((order) => (
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
                              Total {currency.format(order.total)}
                            </div>
                          </div>
                          <div className="actions">
                            <span className="chip ready">Ready</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default App
