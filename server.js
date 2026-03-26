// Load environment variables FIRST
require('dotenv').config();

const express = require("express");
const session = require("express-session");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const path = require("path");
const db = require("./database");
const emailService = require("./email");

// SSL bypass for development only
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  console.log('⚠️  SSL verification disabled (development mode)');
}

const app = express();
const port = process.env.PORT || 3000;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (!PAYSTACK_SECRET_KEY) {
  console.warn("⚠️  PAYSTACK_SECRET_KEY not set — payments will fail");
}

// ==================== HTML Escape Helper ====================
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ==================== Middleware ====================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.paystack.co"],
    }
  }
}));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', generalLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/verify-code', authLimiter);

// Serve static files from public/ directory ONLY
app.use(express.static(path.join(__dirname, "public")));

// Initialize database
let dbReady = false;
db.initDatabase().then(() => {
  dbReady = true;
  console.log('✅ Database ready');
}).catch(err => {
  console.error('❌ Database initialization failed:', err);
});

// ==================== Auth Middleware ====================
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireVerified(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const user = db.getUserById(req.session.userId);
  if (!user || !user.emailVerified) {
    return res.status(403).json({ error: 'Please verify your email first' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const user = db.getUserById(req.session.userId);
  if (!user || user.email.toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ==================== Helpers ====================
function getBaseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL;
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${proto}://${req.get("host")}`;
}

function buildCart(userId) {
  const cart = db.getUserCart(userId);
  const menuItems = db.getMenuItems();
  const menuMap = {};
  menuItems.forEach(m => { menuMap[m.id] = m; });

  const items = [];
  let total = 0;

  for (const [idStr, qty] of Object.entries(cart)) {
    const id = Number(idStr);
    const menuItem = menuMap[id];
    if (!menuItem || !menuItem.available) continue;
    const q = Number(qty) || 0;
    if (q <= 0) continue;
    items.push({ id: menuItem.id, name: menuItem.name, price: menuItem.price, quantity: q, lineTotal: menuItem.price * q });
    total += menuItem.price * q;
  }

  return { items, total };
}

// ==================== Health Check ====================
app.get("/healthz", (req, res) => {
  res.json({ status: "ok", dbReady, timestamp: new Date().toISOString() });
});

// ==================== Menu API ====================
app.get("/api/menu", (req, res) => {
  try {
    const items = db.getMenuItems().filter(i => i.available);
    res.json({ items });
  } catch (err) {
    console.error('Menu error:', err);
    res.status(500).json({ error: 'Failed to load menu' });
  }
});

// ==================== Authentication API ====================
app.post("/api/auth/signup", async (req, res) => {
  try {
    let { email, password, firstName, lastName } = req.body;
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (email.toLowerCase().includes('@igmail.com')) {
      email = email.toLowerCase().replace('@igmail.com', '@gmail.com');
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await db.createUser(email, password, firstName, lastName);

    emailService.sendVerificationEmail(user.email, user.firstName, user.verificationToken)
      .catch(err => console.error('Failed to send verification email:', err));

    const message = user.isExisting
      ? 'Welcome back! A new verification code has been sent to your email.'
      : 'Account created! Please check your email for your 6-digit verification code.';

    res.json({
      success: true,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, emailVerified: false },
      message
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(400).json({ error: err.message || 'Signup failed' });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    let { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (email.toLowerCase().includes('@igmail.com')) {
      email = email.toLowerCase().replace('@igmail.com', '@gmail.com');
    }

    const user = await db.authenticateUser(email, password);
    req.session.userId = user.id;

    res.json({
      success: true,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, emailVerified: user.emailVerified }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session.userId) return res.json({ authenticated: false });
  const user = db.getUserById(req.session.userId);
  if (!user) return res.json({ authenticated: false });

  const isAdmin = user.email.toLowerCase() === ADMIN_EMAIL;
  res.json({
    authenticated: true,
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, emailVerified: user.emailVerified, isAdmin }
  });
});

// Email verification (link)
app.get(["/api/auth/verify/:token", "/verify-email"], async (req, res) => {
  try {
    const token = req.params.token || req.query.token;
    if (!token) throw new Error('Token is missing');
    const userId = db.verifyEmail(token);
    req.session.userId = userId;
    res.redirect('/verify-success');
  } catch (err) {
    console.error('Verification error:', err);
    res.redirect('/verify-error');
  }
});

// Email verification (code)
app.post("/api/auth/verify-code", async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Verification code is required' });
    const userId = db.verifyEmail(code);
    req.session.userId = userId;
    res.json({ success: true, message: 'Email verified successfully!' });
  } catch (err) {
    console.error('Verification error:', err);
    res.status(400).json({ error: err.message || 'Invalid verification code' });
  }
});

// Forgot password
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email: userEmail } = req.body;
    if (!userEmail) return res.status(400).json({ error: 'Email is required' });
    const user = db.getUserByEmail(userEmail);
    if (user) {
      const token = db.createResetToken(userEmail);
      emailService.sendPasswordResetEmail(user.email, user.firstName, token)
        .catch(err => console.error('Failed to send reset email:', err));
    }
    res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    await db.resetPassword(token, password);
    res.json({ success: true, message: 'Password has been reset successfully.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(400).json({ error: err.message || 'Failed to reset password' });
  }
});

// Reset password page
app.get("/reset-password", (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/');
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Password - Emaqhinebeni</title>
      <style>
        body { font-family: 'Inter', Arial, sans-serif; background: #F8F9FA; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: white; padding: 2rem; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
        h1 { color: #0A1E2F; margin-bottom: 1.5rem; text-align: center; }
        input { width: 100%; padding: 0.75rem; margin-bottom: 1rem; border: 2px solid #EEE; border-radius: 10px; box-sizing: border-box; }
        button { width: 100%; padding: 0.75rem; border: none; border-radius: 50px; background: #EF3125; color: white; font-weight: 600; cursor: pointer; }
        .success { color: #25D366; text-align: center; display: none; }
        .error { color: #EF3125; text-align: center; margin-bottom: 1rem; display: none; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Reset Password</h1>
        <div id="error" class="error"></div>
        <div id="success" class="success">✅ Password reset! Redirecting to login...</div>
        <form id="resetForm">
          <input type="password" id="password" placeholder="New Password (min 6 chars)" required minlength="6">
          <input type="password" id="confirmPassword" placeholder="Confirm New Password" required minlength="6">
          <button type="submit">Reset Password</button>
        </form>
      </div>
      <script>
        document.getElementById('resetForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const password = document.getElementById('password').value;
          const confirmPassword = document.getElementById('confirmPassword').value;
          const errorDiv = document.getElementById('error');
          const successDiv = document.getElementById('success');
          if (password !== confirmPassword) {
            errorDiv.textContent = 'Passwords do not match';
            errorDiv.style.display = 'block';
            return;
          }
          try {
            const res = await fetch('/api/auth/reset-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: '${escapeHtml(token)}', password })
            });
            const data = await res.json();
            if (res.ok) {
              successDiv.style.display = 'block';
              document.getElementById('resetForm').style.display = 'none';
              setTimeout(() => window.location.href = '/', 3000);
            } else {
              errorDiv.textContent = data.error || 'Failed to reset password';
              errorDiv.style.display = 'block';
            }
          } catch (err) {
            errorDiv.textContent = 'Connection error';
            errorDiv.style.display = 'block';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Resend verification
app.post("/api/auth/resend-verification", requireAuth, async (req, res) => {
  try {
    const user = db.getUserById(req.session.userId);
    if (user.emailVerified) return res.status(400).json({ error: 'Email already verified' });
    const newToken = db.resendVerificationToken(req.session.userId);
    await emailService.sendVerificationEmail(user.email, user.firstName, newToken);
    res.json({ success: true, message: 'Verification email sent!' });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// ==================== Cart API ====================
app.get("/api/cart", requireVerified, (req, res) => {
  const { items, total } = buildCart(req.session.userId);
  res.json({ items, total });
});

app.post("/api/cart/add", requireVerified, (req, res) => {
  try {
    const { itemId, quantity = 1 } = req.body || {};
    const id = Number(itemId);
    const qty = Number(quantity);
    const menuItem = db.getMenuItem(id);
    if (!menuItem || !menuItem.available) return res.status(400).json({ error: "Invalid or unavailable item" });
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: "Invalid quantity" });

    const cart = db.getUserCart(req.session.userId);
    const currentQty = cart[id] || 0;
    db.updateCartItem(req.session.userId, id, currentQty + qty);

    const { items, total } = buildCart(req.session.userId);
    res.json({ success: true, items, total });
  } catch (err) {
    console.error('Cart add error:', err);
    res.status(500).json({ error: 'Failed to add item to cart' });
  }
});

app.post("/api/cart/remove", requireVerified, (req, res) => {
  try {
    const { itemId, quantity = 1 } = req.body || {};
    const id = Number(itemId);
    const qty = Number(quantity);
    const menuItem = db.getMenuItem(id);
    if (!menuItem) return res.status(400).json({ error: "Invalid item" });
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: "Invalid quantity" });

    const cart = db.getUserCart(req.session.userId);
    const current = cart[id] || 0;
    db.updateCartItem(req.session.userId, id, Math.max(0, current - qty));

    const { items, total } = buildCart(req.session.userId);
    res.json({ success: true, items, total });
  } catch (err) {
    console.error('Cart remove error:', err);
    res.status(500).json({ error: 'Failed to remove item from cart' });
  }
});

app.post("/api/cart/clear", requireVerified, (req, res) => {
  db.clearUserCart(req.session.userId);
  res.json({ success: true });
});

// ==================== Orders API ====================
app.get("/api/orders", requireAuth, (req, res) => {
  try {
    const orders = db.getOrdersByUser(req.session.userId);
    res.json({ orders });
  } catch (err) {
    console.error('Orders error:', err);
    res.status(500).json({ error: 'Failed to load orders' });
  }
});

app.get("/api/orders/:id", requireAuth, (req, res) => {
  try {
    const order = db.getOrderById(Number(req.params.id));
    if (!order || order.userId !== req.session.userId) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({ order });
  } catch (err) {
    console.error('Order detail error:', err);
    res.status(500).json({ error: 'Failed to load order' });
  }
});

// ==================== Paystack: Initialize ====================
app.post("/api/paystack/initialize", async (req, res) => {
  if (!PAYSTACK_SECRET_KEY) {
    return res.status(500).json({ error: "Payment system not configured. Contact support." });
  }

  let { firstName, lastName, email, phone } = req.body || {};
  if (email && email.toLowerCase().includes('@igmail.com')) {
    email = email.toLowerCase().replace('@igmail.com', '@gmail.com');
  }
  if (!firstName || !lastName || !email) {
    return res.status(400).json({ error: "Please fill First Name, Last Name, and Email." });
  }
  if (!String(email).includes("@")) {
    return res.status(400).json({ error: "Please enter a valid email." });
  }
  if (!req.session.userId) {
    return res.status(401).json({ error: "Please log in to checkout." });
  }

  const { items, total } = buildCart(req.session.userId);
  if (!items.length || total <= 0) {
    return res.status(400).json({ error: "Cart is empty. Add items before checkout." });
  }

  const amountInCents = Math.round(total * 100);
  const callback_url = `${getBaseUrl(req)}/paystack/callback`;

  req.session.checkout = {
    customer: { firstName, lastName, email, phone: phone || "" },
    items, total, amountInCents
  };

  try {
    const payload = {
      email, amount: amountInCents, callback_url,
      metadata: {
        customer: { firstName, lastName, phone: phone || "" },
        cart_items: items, cart_total: total
      }
    };

    const resp = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const raw = await resp.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { raw }; }

    if (!resp.ok || !data.status) {
      return res.status(400).json({ error: data.message || "Paystack rejected the request." });
    }

    req.session.checkout.reference = data.data.reference;
    return res.json({ authorization_url: data.data.authorization_url, reference: data.data.reference });
  } catch (err) {
    console.error("Paystack initialize error:", err);
    return res.status(500).json({ error: "Server error initializing payment." });
  }
});

// ==================== Paystack: Callback Verify ====================
app.get("/paystack/callback", async (req, res) => {
  if (!PAYSTACK_SECRET_KEY) return res.status(500).send("Payment system error");
  const reference = req.query.reference;
  if (!reference) return res.status(400).send("Missing reference");

  try {
    const verifyResp = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { method: "GET", headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
    );

    const raw = await verifyResp.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { raw }; }

    if (!verifyResp.ok || !data.status) return res.redirect("/cancel");

    const payStatus = data.data.status;
    const paidAmount = Number(data.data.amount);
    const expected = Number(req.session.checkout?.amountInCents || 0);

    if (payStatus === "success" && paidAmount === expected) {
      const checkout = req.session.checkout;
      const customer = checkout?.customer || {};

      // Save order to database
      try {
        db.createOrder(req.session.userId, reference, checkout.items, checkout.total, {
          email: customer.email, firstName: customer.firstName,
          lastName: customer.lastName, phone: customer.phone
        });
      } catch (orderErr) {
        console.error('Failed to save order:', orderErr);
      }

      // Send confirmation email
      emailService.sendOrderConfirmationEmail(customer.email, customer.firstName, {
        reference, items: checkout.items, total: checkout.total
      }).catch(err => console.error('Confirmation email failed:', err));

      // Send notification to business
      emailService.sendOrderNotificationEmail({
        reference, items: checkout.items, total: checkout.total,
        customerFirstName: customer.firstName, customerLastName: customer.lastName,
        customerEmail: customer.email, customerPhone: customer.phone
      }).catch(err => console.error('Notification email failed:', err));

      req.session.lastReceipt = { reference, total: (expected / 100).toFixed(2), items: checkout.items, customer };
      db.clearUserCart(req.session.userId);
      req.session.checkout = null;

      return res.redirect("/success");
    }

    return res.redirect("/cancel");
  } catch (err) {
    console.error("Paystack verify error:", err);
    return res.redirect("/cancel");
  }
});

// ==================== Paystack: Webhook ====================
app.post("/api/paystack/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).send('Invalid signature');
    }

    const event = req.body;
    if (event.event === 'charge.success') {
      const { reference, amount, metadata } = event.data;
      const existingOrder = db.getOrderByReference(reference);

      if (!existingOrder && metadata) {
        // Order wasn't created via callback — create it now
        console.log(`📦 Webhook: Creating order for reference ${reference}`);
        // Webhook doesn't have session userId, so we skip user association here
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err);
    res.sendStatus(200); // Always return 200 to Paystack
  }
});

// ==================== Admin API ====================
app.get("/api/admin/orders", requireAdmin, (req, res) => {
  try {
    const orders = db.getAllOrders();
    res.json({ orders });
  } catch (err) {
    console.error('Admin orders error:', err);
    res.status(500).json({ error: 'Failed to load orders' });
  }
});

app.patch("/api/admin/orders/:id/status", requireAdmin, (req, res) => {
  try {
    const { status } = req.body;
    db.updateOrderStatus(Number(req.params.id), status);
    res.json({ success: true });
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/admin/menu", requireAdmin, (req, res) => {
  try {
    const items = db.getMenuItems();
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load menu' });
  }
});

app.put("/api/admin/menu/:id", requireAdmin, (req, res) => {
  try {
    db.updateMenuItem(Number(req.params.id), req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/admin/menu", requireAdmin, (req, res) => {
  try {
    const id = db.addMenuItem(req.body);
    res.json({ success: true, id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/admin/menu/:id", requireAdmin, (req, res) => {
  try {
    db.deleteMenuItem(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/admin/stats", requireAdmin, (req, res) => {
  try {
    const orders = db.getAllOrders();
    const totalRevenue = orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.total, 0);
    const totalOrders = orders.length;
    const pendingOrders = orders.filter(o => o.status === 'received').length;
    res.json({ totalRevenue, totalOrders, pendingOrders });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// ==================== Verification Pages ====================
app.get("/verify-success", (req, res) => {
  res.send(`
    <div style="font-family: Arial; max-width: 720px; margin: 40px auto; text-align: center;">
      <h1 style="color: #25D366;">✅ Email Verified!</h1>
      <p style="font-size: 1.1rem; margin: 20px 0;">Your email has been successfully verified.</p>
      <p>You can now add items to your cart and place orders!</p>
      <a href="/" style="display: inline-block; margin-top: 20px; padding: 12px 30px; background: #EF3125; color: white; text-decoration: none; border-radius: 50px; font-weight: 600;">Go to Menu</a>
    </div>
  `);
});

app.get("/verify-error", (req, res) => {
  res.send(`
    <div style="font-family: Arial; max-width: 720px; margin: 40px auto; text-align: center;">
      <h1 style="color: #EF3125;">❌ Verification Failed</h1>
      <p style="font-size: 1.1rem; margin: 20px 0;">The verification link is invalid or has expired.</p>
      <a href="/" style="display: inline-block; margin-top: 20px; padding: 12px 30px; background: #EF3125; color: white; text-decoration: none; border-radius: 50px; font-weight: 600;">Go to Home</a>
    </div>
  `);
});

// ==================== Payment Result Pages ====================
app.get("/success", (req, res) => {
  const receipt = req.session.lastReceipt;
  const itemsHtml = (receipt?.items || [])
    .map(i => `<li>${escapeHtml(i.name)} x${i.quantity} = R${(i.price * i.quantity).toFixed(2)}</li>`)
    .join("");

  res.send(`
    <div style="font-family: Arial; max-width: 720px; margin: 40px auto;">
      <h1>Payment Successful ✅</h1>
      <p><b>Reference:</b> ${escapeHtml(receipt?.reference || 'N/A')}</p>
      <p><b>Total Paid:</b> R${escapeHtml(receipt?.total || '0.00')}</p>
      <h3>Order Items</h3>
      <ul>${itemsHtml}</ul>
      <p style="color: #25D366; margin-top: 1rem;">📧 A confirmation email has been sent.</p>
      <a href="/">Back to Menu</a>
    </div>
  `);
});

app.get("/cancel", (req, res) => {
  res.send(`
    <div style="font-family: Arial; max-width: 720px; margin: 40px auto;">
      <h1>Payment Not Completed ❌</h1>
      <a href="/">Back to Menu</a>
    </div>
  `);
});

// ==================== Admin Page ====================
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// ==================== Start ====================
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
