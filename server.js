const express = require("express");
const session = require("express-session");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
const port = process.env.PORT || 3000;

/**
 * ENV VARS (set these in CMD before npm start)
 * set PAYSTACK_SECRET_KEY=sk_test_xxxxx
 */
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";

// Menu (IDs must match your HTML data-item-id)
const MENU = {
  1: { id: 1, name: "Pork Braai Piece", price: 5 },
  2: { id: 2, name: "Chicken Feet", price: 1 },
  3: { id: 3, name: "Liver Stick", price: 10 },
  4: { id: 4, name: "Small Fat Cake", price: 1 },
  5: { id: 5, name: "Chicken Wings", price: 8 },
  6: { id: 6, name: "Sausage Pieces", price: 6 }
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

// -------------------- Helpers --------------------
function getBaseUrl(req) {
  // Works on localhost and behind ngrok (x-forwarded-proto becomes https)
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${proto}://${req.get("host")}`;
}

function buildCart(req) {
  const cart = req.session.cart || {};
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

// -------------------- Cart API --------------------
app.get("/api/cart", (req, res) => {
  const { items, total } = buildCart(req);
  res.json({ items, total });
});

app.post("/api/cart/add", (req, res) => {
  const { itemId, quantity = 1 } = req.body || {};
  const id = Number(itemId);
  const qty = Number(quantity);

  if (!MENU[id]) return res.status(400).json({ error: "Invalid itemId" });
  if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: "Invalid quantity" });

  if (!req.session.cart) req.session.cart = {};
  req.session.cart[id] = (req.session.cart[id] || 0) + qty;

  const { items, total } = buildCart(req);
  res.json({ success: true, items, total });
});

app.post("/api/cart/remove", (req, res) => {
  const { itemId, quantity = 1 } = req.body || {};
  const id = Number(itemId);
  const qty = Number(quantity);

  if (!MENU[id]) return res.status(400).json({ error: "Invalid itemId" });
  if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: "Invalid quantity" });

  if (!req.session.cart) req.session.cart = {};
  const current = req.session.cart[id] || 0;
  const next = Math.max(0, current - qty);

  if (next === 0) delete req.session.cart[id];
  else req.session.cart[id] = next;

  const { items, total } = buildCart(req);
  res.json({ success: true, items, total });
});

app.post("/api/cart/clear", (req, res) => {
  req.session.cart = {};
  res.json({ success: true });
});

// -------------------- Paystack: Initialize --------------------
app.post("/api/paystack/initialize", async (req, res) => {
  if (!PAYSTACK_SECRET_KEY) {
    return res.status(500).json({
      error:
        "Missing PAYSTACK_SECRET_KEY. In CMD: set PAYSTACK_SECRET_KEY=sk_test_xxx ثم npm start"
    });
  }

  const { firstName, lastName, email, phone } = req.body || {};

  if (!firstName || !lastName || !email) {
    return res.status(400).json({ error: "Please fill First Name, Last Name, and Email." });
  }

  if (!String(email).includes("@")) {
    return res.status(400).json({ error: "Please enter a valid email." });
  }

  const { items, total } = buildCart(req);
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

    // Common TLS issue workaround (TESTING ONLY):
    // set NODE_TLS_REJECT_UNAUTHORIZED=0
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

      req.session.cart = {};
      req.session.checkout = null;

      return res.redirect("/success");
    }

    return res.redirect("/cancel");
  } catch (err) {
    console.error("Paystack verify error:", err);
    return res.redirect("/cancel");
  }
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
});
