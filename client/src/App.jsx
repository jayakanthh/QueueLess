import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const [scanActive, setScanActive] = useState(false)
  const [scanError, setScanError] = useState('')
  const [studentPage, setStudentPage] = useState('menu')
  const [vendorPage, setVendorPage] = useState('orders')
  const [showWelcome, setShowWelcome] = useState(!token)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const scanFrameRef = useRef(null)
  const scanActiveRef = useRef(false)
  const zxingReaderRef = useRef(null)
  const zxingControlsRef = useRef(null)
  const fileInputRef = useRef(null)

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
    if (user.role !== 'admin' && user.role !== 'vendor') return
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
    scanActiveRef.current = scanActive
  }, [scanActive])

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
    stopScanner()
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

  async function redeemOrderByToken(token) {
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
  }

  function stopScanner() {
    if (scanFrameRef.current) {
      cancelAnimationFrame(scanFrameRef.current)
      scanFrameRef.current = null
    }
    if (zxingControlsRef.current) {
      zxingControlsRef.current.stop()
      zxingControlsRef.current = null
    }
    zxingReaderRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setScanActive(false)
  }

  async function startScanner() {
    resetMessage()
    setScanError('')
    stopScanner()
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setScanError('Camera access is unavailable. Use Scan from Photo.')
        return
      }
      if ('BarcodeDetector' in window) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        streamRef.current = stream
        setScanActive(true)
        scanActiveRef.current = true
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        const scanLoop = async () => {
          if (!scanActiveRef.current || !videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes.length > 0) {
              const value = codes[0].rawValue || ''
              if (value) {
                setScanToken(value)
                stopScanner()
                redeemOrderByToken(value)
                return
              }
            }
          } catch (error) {
            setScanError(error.message)
          }
          scanFrameRef.current = requestAnimationFrame(scanLoop)
        }
        scanFrameRef.current = requestAnimationFrame(scanLoop)
        return
      }
      setScanActive(true)
      scanActiveRef.current = true
      if (!videoRef.current) {
        setScanError('Camera is not ready yet.')
        return
      }
      const module = await import('@zxing/browser')
      const { BrowserQRCodeReader } = module
      if (!BrowserQRCodeReader) {
        setScanError('QR scanner failed to load.')
        return
      }
      const reader = new BrowserQRCodeReader()
      zxingReaderRef.current = reader
      setScanActive(true)
      scanActiveRef.current = true
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, error, controlsRef) => {
          if (result) {
            const value = result.getText?.() || ''
            if (value) {
              setScanToken(value)
              if (controlsRef) {
                controlsRef.stop()
              }
              stopScanner()
              redeemOrderByToken(value)
            }
            return
          }
          if (error && error.name !== 'NotFoundException') {
            setScanError(error.message)
          }
        },
      )
      zxingControlsRef.current = controls
    } catch (error) {
      setScanError(error.message)
      stopScanner()
    }
  }

  function triggerImageScan() {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  async function handleImageFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    resetMessage()
    setScanError('')
    try {
      const module = await import('@zxing/browser')
      const { BrowserQRCodeReader } = module
      if (!BrowserQRCodeReader) {
        setScanError('QR scanner failed to load.')
        return
      }
      const reader = new BrowserQRCodeReader()
      const url = URL.createObjectURL(file)
      try {
        const result = await reader.decodeFromImageUrl(url)
        const value = result?.getText?.() || ''
        if (!value) {
          setScanError('No QR code found in the image.')
          return
        }
        setScanToken(value)
        redeemOrderByToken(value)
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      setScanError(error.message || 'Unable to read QR image.')
    }
  }

  useEffect(() => {
    if (vendorPage === 'scan') return
    stopScanner()
  }, [vendorPage])

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
              <div className="portal-tabs">
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
            </section>
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
              <div className="portal-tabs">
                <button
                  className={`tab-button ${
                    vendorPage === 'menu' ? 'active' : ''
                  }`}
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
                  className={`tab-button ${
                    vendorPage === 'scan' ? 'active' : ''
                  }`}
                  onClick={() => setVendorPage('scan')}
                >
                  Scan
                </button>
              </div>
            </section>
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
                    <div className="scan-video">
                      <video ref={videoRef} muted playsInline />
                      {!scanActive && (
                        <div className="empty-state">
                          Camera is off. Start scanning to verify pickup.
                        </div>
                      )}
                    </div>
                    <div className="scan-actions">
                      <button
                        className="primary"
                        onClick={startScanner}
                        disabled={scanActive}
                      >
                        Start Camera
                      </button>
                      <button
                        className="ghost"
                        type="button"
                        onClick={triggerImageScan}
                      >
                        Scan from Photo
                      </button>
                      <button
                        className="ghost"
                        onClick={stopScanner}
                        disabled={!scanActive}
                      >
                        Stop
                      </button>
                      {scanError && (
                        <div className="scan-error">{scanError}</div>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageFile}
                      style={{ display: 'none' }}
                    />
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
