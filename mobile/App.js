import { StatusBar } from 'expo-status-bar'
import { CameraView, useCameraPermissions } from 'expo-camera'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000'

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`

export default function App() {
  const [authTab, setAuthTab] = useState('login')
  const [token, setToken] = useState('')
  const [user, setUser] = useState(null)
  const [menu, setMenu] = useState([])
  const [orders, setOrders] = useState([])
  const [cart, setCart] = useState([])
  const [message, setMessage] = useState('')
  const [splitEnabled, setSplitEnabled] = useState(false)
  const [splitWith, setSplitWith] = useState('')
  const [splitAmount, setSplitAmount] = useState('')
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL)
  const [apiInput, setApiInput] = useState(DEFAULT_API_URL)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [registerForm, setRegisterForm] = useState({
    name: '',
    email: '',
    password: '',
  })
  const [studentPage, setStudentPage] = useState('menu')
  const [menuCategory, setMenuCategory] = useState('All')
  const [vendorPage, setVendorPage] = useState('orders')
  const [scanToken, setScanToken] = useState('')
  const [scanEnabled, setScanEnabled] = useState(true)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const lastOrderStatusRef = useRef(new Map())
  const hasLoadedOrdersRef = useRef(false)

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.qty, 0),
    [cart],
  )
  useEffect(() => {
    if (!splitEnabled) return
    if (cartTotal <= 0) {
      setSplitAmount('')
      return
    }
    const amount = Number(splitAmount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > cartTotal) {
      setSplitAmount(String(cartTotal))
    }
  }, [cartTotal, splitEnabled, splitAmount])
  const activeOrders = useMemo(
    () => orders.filter((order) => order.status !== 'Completed'),
    [orders],
  )
  const pastOrders = useMemo(
    () => orders.filter((order) => order.status === 'Completed'),
    [orders],
  )
  const cartQtyMap = useMemo(() => {
    const map = new Map()
    cart.forEach((item) => {
      map.set(item.itemId, item.qty)
    })
    return map
  }, [cart])
  const menuCategories = useMemo(() => {
    const categories = ['All']
    menu.forEach((item) => {
      const category = item.category || 'Other'
      if (!categories.includes(category)) {
        categories.push(category)
      }
    })
    return categories
  }, [menu])
  const visibleMenu = useMemo(() => {
    if (menuCategory === 'All') return menu
    return menu.filter((item) => (item.category || 'Other') === menuCategory)
  }, [menu, menuCategory])

  const apiFetch = useCallback(
    async (path, options = {}) => {
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const response = await fetch(`${apiUrl}${path}`, {
        ...options,
        headers,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.message || 'Request failed')
      }
      return data
    },
    [apiUrl, token],
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
      await AsyncStorage.removeItem('ql_token')
      setUser(null)
    }
  }, [apiFetch, token])

  useEffect(() => {
    const bootstrap = async () => {
      const storedToken = await AsyncStorage.getItem('ql_token')
      const storedApiUrl = await AsyncStorage.getItem('ql_api_url')
      if (storedApiUrl) {
        setApiUrl(storedApiUrl)
        setApiInput(storedApiUrl)
      }
      if (storedToken) {
        setToken(storedToken)
      }
    }
    bootstrap()
  }, [])

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
        Alert.alert(
          'Order ready',
          `Order ${order.orderNumber} is ready for pickup`,
        )
      }
      lastOrderStatusRef.current.set(order.id, order.status)
    })
  }, [orders, user])
  useEffect(() => {
    if (!menuCategories.includes(menuCategory)) {
      setMenuCategory('All')
    }
  }, [menuCategories, menuCategory])

  const saveApiUrl = async () => {
    const trimmed = apiInput.trim()
    if (!trimmed) return
    setApiUrl(trimmed)
    await AsyncStorage.setItem('ql_api_url', trimmed)
    Alert.alert('Saved', 'Server URL updated')
  }

  const handleLogin = async () => {
    setMessage('')
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginForm),
      })
      setToken(data.token)
      setUser(data.user)
      await AsyncStorage.setItem('ql_token', data.token)
    } catch (error) {
      setMessage(error.message)
    }
  }

  const handleRegister = async () => {
    setMessage('')
    try {
      const data = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(registerForm),
      })
      setToken(data.token)
      setUser(data.user)
      await AsyncStorage.setItem('ql_token', data.token)
    } catch (error) {
      setMessage(error.message)
    }
  }

  const handleLogout = async () => {
    setMessage('')
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch {
    }
    setToken('')
    setUser(null)
    setSplitEnabled(false)
    setSplitWith('')
    setSplitAmount('')
    await AsyncStorage.removeItem('ql_token')
  }

  const addToCart = (item) => {
    const stock = item.stock ?? 0
    if (!item.available || stock === 0) {
      Alert.alert('Out of stock', 'This item is currently unavailable.')
      return
    }
    setCart((prev) => {
      const existing = prev.find((entry) => entry.itemId === item.id)
      const nextQty = (existing?.qty || 0) + 1
      if (stock > 0 && nextQty > stock) {
        Alert.alert('Stock limit', `Only ${stock} available.`)
        return prev
      }
      if (existing) {
        return prev.map((entry) =>
          entry.itemId === item.id
            ? { ...entry, qty: entry.qty + 1 }
            : entry,
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

  const updateCartQty = (itemId, qty) => {
    setCart((prev) => {
      const menuItem = menu.find((item) => item.id === itemId)
      const maxStock = menuItem?.stock ?? null
      if (maxStock === 0) {
        return prev.filter((item) => item.itemId !== itemId)
      }
      const nextQty =
        maxStock && qty > maxStock ? maxStock : qty
      if (nextQty <= 0) {
        return prev.filter((item) => item.itemId !== itemId)
      }
      return prev.map((item) =>
        item.itemId === itemId ? { ...item, qty: nextQty } : item,
      )
    })
  }

  const placeOrder = async () => {
    setMessage('')
    const trimmedSplitWith = splitWith.trim()
    const splitAmountValue = Number(splitAmount)
    if (splitEnabled) {
      if (!trimmedSplitWith) {
        setMessage('Enter who paid for the split expense.')
        return
      }
      if (!Number.isFinite(splitAmountValue) || splitAmountValue <= 0) {
        setMessage('Enter a valid split amount.')
        return
      }
      if (splitAmountValue > cartTotal) {
        setMessage('Split amount cannot exceed the total.')
        return
      }
    }
    try {
      const order = await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map((item) => ({ itemId: item.itemId, qty: item.qty })),
          paymentMethod: 'razorpay_simulated',
          paymentId: null,
          ...(splitEnabled && {
            splitExpense: {
              enabled: true,
              withName: trimmedSplitWith,
              amount: splitAmountValue,
            },
          }),
        }),
      })
      setCart([])
      setSplitEnabled(false)
      setSplitWith('')
      setSplitAmount('')
      setOrders((prev) => [order, ...prev])
      loadMenu().catch(() => {})
    } catch (error) {
      setMessage(error.message)
    }
  }

  const updateOrderStatus = async (orderId, status) => {
    setMessage('')
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

  const redeemOrderByToken = async (tokenValue) => {
    setMessage('')
    if (!tokenValue) return
    try {
      await apiFetch('/api/orders/redeem-by-token', {
        method: 'POST',
        body: JSON.stringify({ token: tokenValue }),
      })
      setScanToken('')
      loadOrders().catch(() => {})
      Alert.alert('Pickup completed', 'Order marked as completed')
    } catch (error) {
      Alert.alert('Scan failed', error.message)
    }
  }

  const handleBarcodeScanned = ({ data }) => {
    if (!data || !scanEnabled) return
    setScanEnabled(false)
    setScanToken(data)
    redeemOrderByToken(data).finally(() => {
      setTimeout(() => setScanEnabled(true), 3000)
    })
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.hero}>
            <Text style={styles.heroPill}>Smart Canteen</Text>
            <Text style={styles.heroTitle}>QueueLess Mobile</Text>
            <Text style={styles.heroSubtitle}>Sign in to continue</Text>
          </View>

          <View style={styles.tabRow}>
            <Pressable
              style={[
                styles.tabButton,
                authTab === 'login' && styles.tabActive,
              ]}
              onPress={() => setAuthTab('login')}
            >
              <Text
                style={[
                  styles.tabText,
                  authTab === 'login' && styles.tabTextActive,
                ]}
              >
                Login
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.tabButton,
                authTab === 'register' && styles.tabActive,
              ]}
              onPress={() => setAuthTab('register')}
            >
              <Text
                style={[
                  styles.tabText,
                  authTab === 'register' && styles.tabTextActive,
                ]}
              >
                Register
              </Text>
            </Pressable>
          </View>

          {authTab === 'login' ? (
            <View style={styles.card}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={loginForm.email}
                onChangeText={(value) =>
                  setLoginForm((prev) => ({ ...prev, email: value }))
                }
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={loginForm.password}
                onChangeText={(value) =>
                  setLoginForm((prev) => ({ ...prev, password: value }))
                }
                secureTextEntry
              />
              <Pressable style={styles.primaryButton} onPress={handleLogin}>
                <Text style={styles.primaryButtonText}>Login</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={registerForm.name}
                onChangeText={(value) =>
                  setRegisterForm((prev) => ({ ...prev, name: value }))
                }
              />
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={registerForm.email}
                onChangeText={(value) =>
                  setRegisterForm((prev) => ({ ...prev, email: value }))
                }
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={registerForm.password}
                onChangeText={(value) =>
                  setRegisterForm((prev) => ({ ...prev, password: value }))
                }
                secureTextEntry
              />
              <Pressable style={styles.primaryButton} onPress={handleRegister}>
                <Text style={styles.primaryButtonText}>Create account</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.label}>Server URL</Text>
            <TextInput
              style={styles.input}
              value={apiInput}
              onChangeText={setApiInput}
              autoCapitalize="none"
            />
            <Pressable style={styles.ghostButton} onPress={saveApiUrl}>
              <Text style={styles.ghostButtonText}>Save URL</Text>
            </Pressable>
          </View>

          {!!message && <Text style={styles.errorText}>{message}</Text>}
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>QueueLess</Text>
          <View style={styles.headerMeta}>
            <Text style={styles.subtitle}>{user.name}</Text>
            <View style={styles.rolePill}>
              <Text style={styles.rolePillText}>{user.role}</Text>
            </View>
          </View>
        </View>
        <Pressable style={styles.ghostDanger} onPress={handleLogout}>
          <Text style={styles.ghostDangerText}>Logout</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {!!message && <Text style={styles.errorText}>{message}</Text>}

        {user.role === 'student' && (
          <View style={styles.section}>
            <View style={styles.tabRow}>
              <Pressable
                style={[
                  styles.tabButton,
                  studentPage === 'menu' && styles.tabActive,
                ]}
                onPress={() => setStudentPage('menu')}
              >
                <Text
                  style={[
                    styles.tabText,
                    studentPage === 'menu' && styles.tabTextActive,
                  ]}
                >
                  Menu
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.tabButton,
                  studentPage === 'orders' && styles.tabActive,
                ]}
                onPress={() => setStudentPage('orders')}
              >
                <Text
                  style={[
                    styles.tabText,
                    studentPage === 'orders' && styles.tabTextActive,
                  ]}
                >
                  Orders
                </Text>
              </Pressable>
            </View>

            {studentPage === 'menu' ? (
              <>
                <Text style={styles.sectionTitle}>Menu</Text>
                <View style={styles.categoryTabs}>
                  {menuCategories.map((category) => (
                    <Pressable
                      key={category}
                      style={[
                        styles.tabButton,
                        menuCategory === category && styles.tabActive,
                      ]}
                      onPress={() => setMenuCategory(category)}
                    >
                      <Text
                        style={[
                          styles.tabText,
                          menuCategory === category && styles.tabTextActive,
                        ]}
                      >
                        {category}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {visibleMenu.map((item) => {
                  const stockValue = item.stock ?? 0
                  const inCartQty = cartQtyMap.get(item.id) || 0
                  const atLimit = stockValue > 0 && inCartQty >= stockValue
                  const isUnavailable = !item.available || stockValue === 0
                  return (
                    <View key={item.id} style={styles.card}>
                      <Text style={styles.itemTitle}>{item.name}</Text>
                      <Text style={styles.itemMeta}>
                        {item.category} · {item.prepTime} min
                      </Text>
                    <Text style={styles.priceText}>
                      {formatCurrency(item.price)}
                    </Text>
                      <Text style={styles.itemMeta}>
                        Stock: {item.stock ?? 0}
                      </Text>
                      {isUnavailable && (
                        <Text style={styles.itemWarning}>Out of stock</Text>
                      )}
                      <Pressable
                        style={styles.primaryButton}
                        onPress={() => addToCart(item)}
                        disabled={isUnavailable || atLimit}
                      >
                        <Text style={styles.primaryButtonText}>Add</Text>
                      </Pressable>
                    </View>
                  )
                })}

                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Cart</Text>
                  {cart.length === 0 && (
                    <Text style={styles.itemMeta}>Cart is empty.</Text>
                  )}
                  {cart.map((item) => {
                    const menuItem = menu.find(
                      (entry) => entry.id === item.itemId,
                    )
                    const maxStock = menuItem?.stock ?? null
                    const isMaxed = maxStock && item.qty >= maxStock
                    return (
                      <View key={item.itemId} style={styles.rowBetween}>
                        <Text style={styles.itemMeta}>{item.name}</Text>
                        <View style={styles.qtyRow}>
                          <Pressable
                            style={styles.qtyButton}
                            onPress={() =>
                              updateCartQty(item.itemId, item.qty - 1)
                            }
                          >
                            <Text style={styles.qtyButtonText}>-</Text>
                          </Pressable>
                          <Text style={styles.qtyValue}>{item.qty}</Text>
                          <Pressable
                            style={[
                              styles.qtyButton,
                              isMaxed && styles.qtyButtonDisabled,
                            ]}
                            onPress={() =>
                              updateCartQty(item.itemId, item.qty + 1)
                            }
                            disabled={isMaxed}
                          >
                            <Text style={styles.qtyButtonText}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    )
                  })}
                  <View style={styles.rowBetween}>
                    <Text style={styles.itemTitle}>Total</Text>
                    <Text style={styles.totalText}>
                      {formatCurrency(cartTotal)}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.rowBetween}
                    onPress={() => {
                      const next = !splitEnabled
                      setSplitEnabled(next)
                      if (!next) {
                        setSplitWith('')
                        setSplitAmount('')
                      } else if (cartTotal > 0) {
                        setSplitAmount(String(cartTotal))
                      }
                    }}
                  >
                    <Text style={styles.itemMeta}>Split expense</Text>
                    <Text style={styles.itemMeta}>
                      {splitEnabled ? 'On' : 'Off'}
                    </Text>
                  </Pressable>
                  {splitEnabled && (
                    <>
                      <Text style={styles.label}>Paid by</Text>
                      <TextInput
                        style={styles.input}
                        value={splitWith}
                        onChangeText={setSplitWith}
                        placeholder="Friend name"
                      />
                      <Text style={styles.label}>Amount to pay back (₹)</Text>
                      <TextInput
                        style={styles.input}
                        value={splitAmount}
                        onChangeText={setSplitAmount}
                        keyboardType="numeric"
                        placeholder="0"
                      />
                    </>
                  )}
                  <Pressable
                    style={styles.primaryButton}
                    onPress={placeOrder}
                    disabled={cart.length === 0}
                  >
                    <Text style={styles.primaryButtonText}>Place order</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Active Orders</Text>
                {activeOrders.length === 0 && (
                  <Text style={styles.itemMeta}>No active orders.</Text>
                )}
                {activeOrders.map((order) => (
                  <View key={order.id} style={styles.card}>
                    <Text style={styles.itemTitle}>
                      Order {order.orderNumber}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {order.items
                        .map((item) => `${item.name} × ${item.qty}`)
                        .join(', ')}
                    </Text>
                    <Text style={styles.itemMeta}>
                      ETA {order.etaMinutes} min
                    </Text>
                    <Text style={styles.itemMeta}>Status: {order.status}</Text>
                    {!!order.splitEnabled &&
                      order.splitWith &&
                      order.splitAmount && (
                        <Text style={styles.itemMeta}>
                          Split: {order.splitWith} ·{' '}
                          {formatCurrency(order.splitAmount)}
                        </Text>
                      )}
                    {!!order.pickupToken && (
                      <Text style={styles.itemMeta}>
                        Pickup token: {order.pickupToken}
                      </Text>
                    )}
                  </View>
                ))}
                <Text style={styles.sectionTitle}>Past Orders</Text>
                {pastOrders.length === 0 && (
                  <Text style={styles.itemMeta}>No past orders.</Text>
                )}
                {pastOrders.map((order) => (
                  <View key={order.id} style={styles.card}>
                    <Text style={styles.itemTitle}>
                      Order {order.orderNumber}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {order.items
                        .map((item) => `${item.name} × ${item.qty}`)
                        .join(', ')}
                    </Text>
                    <Text style={styles.itemMeta}>
                      Total {formatCurrency(order.total)}
                    </Text>
                    {!!order.splitEnabled &&
                      order.splitWith &&
                      order.splitAmount && (
                        <Text style={styles.itemMeta}>
                          Split: {order.splitWith} ·{' '}
                          {formatCurrency(order.splitAmount)}
                        </Text>
                      )}
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {user.role === 'vendor' && (
          <View style={styles.section}>
            <View style={styles.tabRow}>
              <Pressable
                style={[
                  styles.tabButton,
                  vendorPage === 'orders' && styles.tabActive,
                ]}
                onPress={() => setVendorPage('orders')}
              >
                <Text
                  style={[
                    styles.tabText,
                    vendorPage === 'orders' && styles.tabTextActive,
                  ]}
                >
                  Orders
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.tabButton,
                  vendorPage === 'scan' && styles.tabActive,
                ]}
                onPress={() => setVendorPage('scan')}
              >
                <Text
                  style={[
                    styles.tabText,
                    vendorPage === 'scan' && styles.tabTextActive,
                  ]}
                >
                  Scan
                </Text>
              </Pressable>
            </View>

            {vendorPage === 'orders' ? (
              <>
                <Text style={styles.sectionTitle}>Incoming Orders</Text>
                {orders.length === 0 && (
                  <Text style={styles.itemMeta}>No orders yet.</Text>
                )}
                {orders.map((order) => (
                  <View key={order.id} style={styles.card}>
                    <Text style={styles.itemTitle}>
                      Order {order.orderNumber} · {order.customerName}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {order.items
                        .map((item) => `${item.name} × ${item.qty}`)
                        .join(', ')}
                    </Text>
                    <Text style={styles.itemMeta}>
                      ETA {order.etaMinutes} min
                    </Text>
                    {!!order.splitEnabled &&
                      order.splitWith &&
                      order.splitAmount && (
                        <Text style={styles.itemMeta}>
                          Split: {order.splitWith} ·{' '}
                          {formatCurrency(order.splitAmount)}
                        </Text>
                      )}
                    <View style={styles.rowWrap}>
                      {['Pending', 'Preparing', 'Ready'].map((status) => (
                        <Pressable
                          key={status}
                          style={[
                            styles.statusButton,
                            order.status === status && styles.statusButtonActive,
                          ]}
                          onPress={() => updateOrderStatus(order.id, status)}
                        >
                          <Text
                            style={[
                              styles.statusButtonText,
                              order.status === status &&
                                styles.statusButtonTextActive,
                            ]}
                          >
                            {status}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Scan Pickup Token</Text>
                <View style={styles.card}>
                  {cameraPermission?.granted ? (
                    <CameraView
                      style={styles.camera}
                      onBarcodeScanned={handleBarcodeScanned}
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    />
                  ) : (
                    <Pressable
                      style={styles.primaryButton}
                      onPress={requestCameraPermission}
                    >
                      <Text style={styles.primaryButtonText}>
                        Enable Camera
                      </Text>
                    </Pressable>
                  )}
                  <Text style={styles.itemMeta}>Or enter token manually</Text>
                  <TextInput
                    style={styles.input}
                    value={scanToken}
                    onChangeText={setScanToken}
                    autoCapitalize="none"
                  />
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => redeemOrderByToken(scanToken)}
                    disabled={!scanToken}
                  >
                    <Text style={styles.primaryButtonText}>Complete pickup</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        )}

        {user.role === 'admin' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Orders</Text>
            {orders.length === 0 && (
              <Text style={styles.itemMeta}>No orders yet.</Text>
            )}
            {orders.map((order) => (
              <View key={order.id} style={styles.card}>
                <Text style={styles.itemTitle}>
                  Order {order.orderNumber} · {order.customerName}
                </Text>
                <Text style={styles.itemMeta}>
                  {order.items
                    .map((item) => `${item.name} × ${item.qty}`)
                    .join(', ')}
                </Text>
                <Text style={styles.itemMeta}>
                  Total {formatCurrency(order.total)}
                </Text>
                    {!!order.splitEnabled &&
                      order.splitWith &&
                      order.splitAmount && (
                        <Text style={styles.itemMeta}>
                          Split: {order.splitWith} ·{' '}
                          {formatCurrency(order.splitAmount)}
                        </Text>
                      )}
                <View style={styles.rowWrap}>
                  {['Pending', 'Preparing', 'Ready', 'Completed'].map(
                    (status) => (
                      <Pressable
                        key={status}
                        style={[
                          styles.statusButton,
                          order.status === status && styles.statusButtonActive,
                        ]}
                        onPress={() => updateOrderStatus(order.id, status)}
                      >
                        <Text
                          style={[
                            styles.statusButtonText,
                            order.status === status &&
                              styles.statusButtonTextActive,
                          ]}
                        >
                          {status}
                        </Text>
                      </Pressable>
                    ),
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#eef2ff',
  },
  container: {
    padding: 20,
    gap: 18,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  hero: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  heroPill: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#e0e7ff',
    color: '#4338ca',
    fontSize: 11,
    fontWeight: '600',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#475569',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  label: {
    fontSize: 12,
    color: '#334155',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#ffffff',
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  ghostButton: {
    borderWidth: 1,
    borderColor: '#c7d2fe',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  ghostButtonText: {
    color: '#4f46e5',
    fontWeight: '600',
  },
  ghostDanger: {
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#fff1f2',
  },
  ghostDangerText: {
    color: '#dc2626',
    fontWeight: '600',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 10,
  },
  categoryTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  tabActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  tabText: {
    fontSize: 13,
    color: '#334155',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  priceText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4338ca',
  },
  itemMeta: {
    fontSize: 12,
    color: '#64748b',
  },
  itemWarning: {
    fontSize: 12,
    color: '#b45309',
    fontWeight: '600',
  },
  rolePill: {
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#e0e7ff',
  },
  rolePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4338ca',
    textTransform: 'capitalize',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonDisabled: {
    opacity: 0.5,
  },
  qtyButtonText: {
    fontSize: 16,
    color: '#1d4ed8',
  },
  qtyValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  statusButtonActive: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
  },
  statusButtonText: {
    fontSize: 12,
    color: '#334155',
  },
  statusButtonTextActive: {
    color: '#ffffff',
  },
  camera: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
  },
})
