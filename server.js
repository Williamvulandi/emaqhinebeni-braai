const express = require("express");
const session = require("express-session");
const crypto = require("crypto");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
const port = process.env.PORT || 3000;

/* =====================================================
   HELMET + CSP (PayFast allowed)
   ===================================================== */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],

        // ✅ Allow form submission to PayFast
        formAction: [
          "'self'",
          "https://sandbox.payfast.co.za",
          "https://www.payfast.co.za",
        ],

        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  })
);

/* =====================================================
   MIDDLEWARE
   ===================================================== */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "braai-spot-secret",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

app.use(express.static("."));

/* =====================================================
   MENU (in-memory)
   ===================================================== */
const MENU = {
  "1": { id: 1, name: "Pork Braai Piece", price: 5 },
  "2": { id: 2, name: "Chicken Feet", price: 1 },
  "3": { id: 3, name: "Liver Stick", price: 10 },
  "4": { id: 4, name: "Small Fat Cake", price: 1 },
  "5": { id: 5, name: "Chicken Wings", price: 8 },
  "6": { id: 6, name: "Sausage Pieces", price: 6 },
};

/* =====================================================
   HELPERS
   ===================================================== */
function buildCart(cart = {}) {
  const items = [];
  let total = 0;

  for (const [itemId, qty] of Object.entries(cart)) {
    const item = MENU[itemId];
    if (!item) continue;

    items.push({ ...item, quantity: qty });
    total += item.price * qty;
  }

  return { items, total };
}

/**
 * PayFast signature encoding must match PHP's urlencode rules:
 * - spaces become +
 * - ~ becomes %7E
 * - ! ' ( ) * must be percent-encoded
 */
function pfUrlEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) =>
      "%" + c.charCodeAt(0).toString(16).toUpperCase()
    )
    .replace(/%7E/g, "~") // PayFast examples often tolerate either; keep stable
    .replace(/~/g, "%7E"); // enforce PHP style for "~"
}

function pfParamString(data) {
  return Object.keys(data)
    .filter((k) => data[k] !== undefined && data[k] !== null && data[k] !== "" && k !== "signature")
    .sort()
    .map((k) => `${k}=${pfUrlEncode(data[k])}`)
    .join("&");
}

function pfSignature(data, passphrase) {
  let str = pfParamString(data);
  if (passphrase && String(passphrase).length > 0) {
    str += `&passphrase=${pfUrlEncode(passphrase)}`;
  }
  return crypto.createHash("md5").update(str).digest("hex");
}

/* =====================================================
   CART API
   ===================================================== */
app.get("/api/cart", (req, res) => {
  if (!req.session.cart) req.session.cart = {};
  res.json(buildCart(req.session.cart));
});

app.post("/api/cart/add", (req, res) => {
  const { itemId, quantity = 1 } = req.body || {};
  if (!MENU[itemId]) return res.status(400).json({ error: "Invalid item" });

  if (!req.session.cart) req.session.cart = {};
  req.session.cart[itemId] =
    (req.session.cart[itemId] || 0) + Number(quantity || 1);

  res.json(buildCart(req.session.cart));
});

app.post("/api/cart/remove", (req, res) => {
  const { itemId, quantity = 1 } = req.body || {};
  if (!MENU[itemId]) return res.status(400).json({ error: "Invalid item" });

  if (!req.session.cart) req.session.cart = {};

  req.session.cart[itemId] = Math.max(
    0,
    (req.session.cart[itemId] || 0) - Number(quantity || 1)
  );

  if (req.session.cart[itemId] === 0) delete req.session.cart[itemId];

  res.json(buildCart(req.session.cart));
});

/* =====================================================
   CHECKOUT → PAYFAST (SANDBOX)
   ===================================================== */
app.post("/api/checkout", (req, res) => {
  if (!req.session.cart) req.session.cart = {};
  const { items, total } = buildCart(req.session.cart);

  if (!items.length) return res.status(400).json({ error: "Cart is empty" });

  const customer = req.body?.customer || {};
  const name_first = String(customer.firstName || "").trim();
  const name_last = String(customer.lastName || "").trim();
  const email_address = String(customer.email || "").trim();
  const cell_number = String(customer.phone || "").trim();

  if (!name_first || !name_last || !email_address) {
    return res.status(400).json({ error: "Missing customer details" });
  }

  // ✅ PayFast sandbox credentials (standard)
  const merchant_id = "10000100";
  const merchant_key = "46f0cd694581a";
  const passphrase = ""; // keep empty for sandbox unless you set one

  const orderId = `ORDER-${Date.now()}`;

  const payfastData = {
    merchant_id,
    merchant_key,

    return_url: `http://localhost:${port}/success`,
    cancel_url: `http://localhost:${port}/cancel`,
    notify_url: `http://localhost:${port}/notify`,

    m_payment_id: orderId,
    amount: Number(total).toFixed(2),

    // Keep these simple (signature-safe)
    item_name: "BraaiSpot Order",
    item_description: items.map((i) => `${i.name} x${i.quantity}`).join(", "),

    name_first,
    name_last,
    email_address,
    cell_number,
  };

  // ✅ Correct signature
  payfastData.signature = pfSignature(payfastData, passphrase);

  res.json({
    payfastProcessUrl: "https://sandbox.payfast.co.za/eng/process",
    payfastData,
  });
});

/* =====================================================
   PAYFAST ITN (DEV)
   ===================================================== */
app.post("/notify", (req, res) => {
  // Local testing: just acknowledge
  res.status(200).send("OK");
});

/* =====================================================
   PAGES
   ===================================================== */
app.get("/success", (req, res) => {
  req.session.cart = {};
  res.send(`
    <h1>Payment Submitted</h1>
    <p>Thank you for your order.</p>
    <a href="/">Back to Menu</a>
  `);
});

app.get("/cancel", (req, res) => {
  res.send(`
    <h1>Payment Cancelled</h1>
    <a href="/">Back to Menu</a>
  `);
});

/* =====================================================
   START SERVER
   ===================================================== */
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
