const express = require("express");
const session = require("express-session");
const cors = require("cors");
const helmet = require("helmet");
const fs = require("fs");
const path = require("path");
const db = require("./database");
const emailService = require("./email");

// ⚠️ GLOBAL SSL BYPASS for local development issues
// This fixes "unable to verify the first certificate" errors
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const app = express();
const port = process.env.PORT || 3000;

// Basic .env parser
const ENV_PATH = path.join(__dirname, '.env');
if (fs.existsSync(ENV_PATH)) {
  console.log('📝 Found .env file, loading variables...');
  const envConfig = fs.readFileSync(ENV_PATH, 'utf8');
  envConfig.split(/\r?\n/).forEach(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) return;
    const [key, ...valueParts] = trimmedLine.split('=');
    if (key && valueParts.length > 0) {
      const varKey = key.trim();
      const varValue = valueParts.join('=').trim();
      process.env[varKey] = varValue;
      console.log(`✅ Loaded ${varKey}`);
    }
  });
} else {
  console.warn('⚠️ No .env file found at:', ENV_PATH);
}

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
if (PAYSTACK_SECRET_KEY) {
  console.log(`🎫 Paystack Key detected (starts with: ${PAYSTACK_SECRET_KEY.substring(0, 7)}...)`);
} else {
  console.error("❌ ERROR: PAYSTACK_SECRET_KEY is empty in .env or environment variables!");
}

// Menu (IDs must match your HTML data-item-id)
const MENU = {
  1: { id: 1, name: "Pork Braai Piece", price: 5 },
  2: { id: 2, name: "Chicken Feet", price: 1 },
  3: { id: 3, name: "Kebabs", price: 10 },
  4: { id: 4, name: "Small Fat Cake", price: 1 },
  5: { id: 5, name: "Chicken Wings", price: 8 },
  6: { id: 6, name: "Sausage Pieces", price: 6 },
  7: { id: 7, name: "Pap + Pork + Chakalaka", price: 35 },
  8: { id: 8, name: "Pap + Wings + Chakalaka", price: 40 },
  9: { id: 9, name: "Pap + Sausage + Chakalaka", price: 30 },
  10: { id: 10, name: "Big Pork Piece", price: 10 }
};

// -------------------- Middleware --------------------
app.use(
  helmet({
    // Disable CSP while testing so forms/redirects aren't blocked by browser CSP
    contentSecurityPolicy: false
  })
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "braai-spot-secret",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
  })
);

// Serve your static files from project root
app.use(express.static("."));

// Initialize database
let dbReady = false;
db.initDatabase().then(() => {
  dbReady = true;
  console.log('✅ Database ready');
}).catch(err => {
  console.error('❌ Database initialization failed:', err);
});

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Email verification middleware
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

// -------------------- Helpers --------------------
function getBaseUrl(req) {
  // Works on localhost and behind ngrok (x-forwarded-proto becomes https)
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${proto}://${req.get("host")}`;
}

function buildCart(userId) {
  const cart = db.getUserCart(userId);
  const items = [];
  let total = 0;

  for (const [idStr, qty] of Object.entries(cart)) {
    const id = Number(idStr);
    const menuItem = MENU[id];
    if (!menuItem) continue;

    const q = Number(qty) || 0;
    if (q <= 0) continue;

    items.push({
      id: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      quantity: q,
      lineTotal: menuItem.price * q
    });

    total += menuItem.price * q;
  }

  return { items, total };
}

// -------------------- Authentication API --------------------
app.post("/api/auth/signup", async (req, res) => {
  try {
    let { email, password, firstName, lastName } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Auto-fix common igmail typo for the user
    if (email.toLowerCase().includes('@igmail.com')) {
      email = email.toLowerCase().replace('@igmail.com', '@gmail.com');
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Send verification email (don't block on this)
    emailService.sendVerificationEmail(user.email, user.firstName, user.verificationToken)
      .catch(err => console.error('Failed to send verification email:', err));

    // req.session.userId = user.id; // Removed to prevent auto-login before verification

    const message = user.isExisting
      ? 'Welcome back! Your account was not yet verified. A new verification code has been sent to your email.'
      : 'Account created! Please check your email for your 6-digit verification code.';

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: false
      },
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

    // Auto-fix common igmail typo
    if (email.toLowerCase().includes('@igmail.com')) {
      email = email.toLowerCase().replace('@igmail.com', '@gmail.com');
    }

    const user = await db.authenticateUser(email, password);
    req.session.userId = user.id;

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified
      }
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
  if (!req.session.userId) {
    return res.json({ authenticated: false });
  }

  const user = db.getUserById(req.session.userId);
  if (!user) {
    return res.json({ authenticated: false });
  }

  res.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      emailVerified: user.emailVerified
    }
  });
});

// Email verification endpoint (Link) - Support both /verify-email and /api/auth/verify
app.get(["/api/auth/verify/:token", "/verify-email"], async (req, res) => {
  try {
    const token = req.params.token || req.query.token;
    if (!token) throw new Error('Token is missing');

    const userId = db.verifyEmail(token);

    // Auto-login the user ONLY AFTER successful verification
    req.session.userId = userId;

    // Redirect to success page
    res.redirect('/verify-success');
  } catch (err) {
    console.error('Verification error:', err);
    res.redirect('/verify-error');
  }
});

// Email verification endpoint (Code)
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

// Forgot password endpoint
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

    // Always return success to prevent email enumeration
    res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password endpoint
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
              body: JSON.stringify({ token: '${token}', password })
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

// Resend verification email
app.post("/api/auth/resend-verification", requireAuth, async (req, res) => {
  try {
    const user = db.getUserById(req.session.userId);

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    const newToken = db.resendVerificationToken(req.session.userId);
    await emailService.sendVerificationEmail(user.email, user.firstName, newToken);

    res.json({ success: true, message: 'Verification email sent!' });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// -------------------- Cart API (Protected - Requires Verified Email) --------------------
app.get("/api/cart", requireVerified, (req, res) => {
  const { items, total } = buildCart(req.session.userId);
  res.json({ items, total });
});

app.post("/api/cart/add", requireVerified, (req, res) => {
  const { itemId, quantity = 1 } = req.body || {};
  const id = Number(itemId);
  const qty = Number(quantity);

  if (!MENU[id]) return res.status(400).json({ error: "Invalid itemId" });
  if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: "Invalid quantity" });

  // Get current quantity from DB
  const cart = db.getUserCart(req.session.userId);
  const currentQty = cart[id] || 0;
  const newQty = currentQty + qty;

  db.updateCartItem(req.session.userId, id, newQty);

  const { items, total } = buildCart(req.session.userId);
  res.json({ success: true, items, total });
});

app.post("/api/cart/remove", requireVerified, (req, res) => {
  const { itemId, quantity = 1 } = req.body || {};
  const id = Number(itemId);
  const qty = Number(quantity);

  if (!MENU[id]) return res.status(400).json({ error: "Invalid itemId" });
  if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: "Invalid quantity" });

  // Get current quantity from DB
  const cart = db.getUserCart(req.session.userId);
  const current = cart[id] || 0;
  const next = Math.max(0, current - qty);

  db.updateCartItem(req.session.userId, id, next);

  const { items, total } = buildCart(req.session.userId);
  res.json({ success: true, items, total });
});

app.post("/api/cart/clear", requireVerified, (req, res) => {
  db.clearUserCart(req.session.userId);
  res.json({ success: true });
});

// -------------------- Paystack: Initialize --------------------
app.post("/api/paystack/initialize", async (req, res) => {
  if (!PAYSTACK_SECRET_KEY) {
    return res.status(500).json({
      error:
        "Missing PAYSTACK_SECRET_KEY. In CMD: set PAYSTACK_SECRET_KEY=sk_test_xxx then npm start"
    });
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

  // Save expected amount + cart snapshot
  req.session.checkout = {
    customer: { firstName, lastName, email, phone: phone || "" },
    items,
    total,
    amountInCents
  };

  // Debug logs
  console.log("=== PAYSTACK INIT ===");
  console.log("callback_url:", callback_url);
  console.log("email:", email);
  console.log("amountInCents:", amountInCents);
  console.log("secretKeyStartsWith:", String(PAYSTACK_SECRET_KEY).slice(0, 8)); // should be sk_test_
  console.log("=====================");

  try {
    const payload = {
      email,
      amount: amountInCents,
      callback_url,
      metadata: {
        customer: { firstName, lastName, phone: phone || "" },
        cart_items: items,
        cart_total: total
      }
    };

    const fetchOptions = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    };

    // SSL verification is now disabled globally at the top of the file for local dev
    const resp = await fetch("https://api.paystack.co/transaction/initialize", fetchOptions);

    const raw = await resp.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }

    console.log("Paystack HTTP:", resp.status);
    console.log("Paystack body:", data);

    if (!resp.ok || !data.status) {
      return res.status(400).json({
        error: data.message || "Paystack rejected the request. Check server terminal logs."
      });
    }

    // Save reference for verify step
    req.session.checkout.reference = data.data.reference;

    return res.json({
      authorization_url: data.data.authorization_url,
      reference: data.data.reference
    });
  } catch (err) {
    console.error("Paystack initialize error (REAL):", err);
    return res.status(500).json({
      error:
        "Server error initializing payment. Check server terminal error (network/SSL/proxy)."
    });
  }
});

// -------------------- Paystack: Callback Verify --------------------
app.get("/paystack/callback", async (req, res) => {
  if (!PAYSTACK_SECRET_KEY) return res.status(500).send("Missing PAYSTACK_SECRET_KEY");

  const reference = req.query.reference;
  if (!reference) return res.status(400).send("Missing reference");

  try {
    const verifyResp = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
      }
    );

    const raw = await verifyResp.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }

    console.log("=== PAYSTACK VERIFY ===");
    console.log("HTTP:", verifyResp.status);
    console.log("body:", data);
    console.log("======================");

    if (!verifyResp.ok || !data.status) {
      return res.redirect("/cancel");
    }

    const payStatus = data.data.status; // "success"
    const paidAmount = Number(data.data.amount); // in cents
    const expected = Number(req.session.checkout?.amountInCents || 0);

    if (payStatus === "success" && paidAmount === expected) {
      // Create receipt and clear cart
      req.session.lastReceipt = {
        reference,
        total: (expected / 100).toFixed(2),
        items: req.session.checkout?.items || [],
        customer: req.session.checkout?.customer || null
      };

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

// -------------------- Verification Pages --------------------
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
      <p>Please request a new verification email from your account.</p>
      <a href="/" style="display: inline-block; margin-top: 20px; padding: 12px 30px; background: #EF3125; color: white; text-decoration: none; border-radius: 50px; font-weight: 600;">Go to Home</a>
    </div>
  `);
});

// -------------------- Pages --------------------
app.get("/success", (req, res) => {
  const receipt = req.session.lastReceipt;

  const itemsHtml = (receipt?.items || [])
    .map((i) => `<li>${i.name} x${i.quantity} = R${(i.price * i.quantity).toFixed(2)}</li>`)
    .join("");

  res.send(`
    <div style="font-family: Arial; max-width: 720px; margin: 40px auto;">
      <h1>Payment Successful ✅</h1>
      <p><b>Reference:</b> ${receipt?.reference || "N/A"}</p>
      <p><b>Total Paid:</b> R${receipt?.total || "0.00"}</p>
      <h3>Order Items</h3>
      <ul>${itemsHtml}</ul>
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

// -------------------- Start --------------------
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`IMPORTANT: Ensure you have set a valid PAYSTACK_SECRET_KEY in the code or environment variables.`);
});
