const express = require("express");
const session = require("express-session");
const crypto = require("crypto");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "braai-spot-secret",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

app.use(express.static("."));

const MENU = {
  "1": { id: 1, name: "Pork Braai Piece", price: 5, image: "images/pork.png", description: "Succulent, flame-grilled pork seasoned to perfection." },
  "2": { id: 2, name: "Chicken Feet", price: 1, image: "images/chicken_feet.png", description: "Traditional Maotwana cooked in a savory spicy sauce." },
  "3": { id: 3, name: "Liver Stick", price: 10, image: "images/kebkeb.webp", description: "Rich liver mixed with fat, grilled on a stick." },
  "4": { id: 4, name: "Small Fat Cake", price: 1, image: "images/fat-cakes.webp", description: "Freshly fried, golden brown traditional fat cakes." },
  "5": { id: 5, name: "Chicken Wings", price: 8, image: "images/wings.webp", description: "Crispy, flavorful chicken wings grilled to perfection." },
  "6": { id: 6, name: "Sausage Pieces", price: 6, image: "images/sausage-small-pieces.webp", description: "Juicy sausage pieces seasoned and grilled." },
};

function cartResponse(cartObj) {
  const items = [];
  let total = 0;

  for (const [itemId, qty] of Object.entries(cartObj || {})) {
    const item = MENU[itemId];
    if (!item) continue;
    items.push({ ...item, quantity: qty });
    total += item.price * qty;
  }
  return { items, total };
}

function pfEncode(data) {
  return Object.keys(data)
    .filter((k) => data[k] !== undefined && data[k] !== null && data[k] !== "")
    .sort()
    .map((k) => `${k}=${encodeURIComponent(String(data[k]).trim())}`)
    .join("&");
}

function pfSignature(data, passphrase) {
  const base = pfEncode(data);
  const withPass = passphrase ? `${base}&passphrase=${encodeURIComponent(passphrase)}` : base;
  return crypto.createHash("md5").update(withPass).digest("hex");
}

app.get("/api/menu", (req, res) => {
  res.json(Object.values(MENU));
});

app.get("/api/cart", (req, res) => {
  if (!req.session.cart) req.session.cart = {};
  res.json(cartResponse(req.session.cart));
});

app.post("/api/cart/add", (req, res) => {
  const { itemId, quantity = 1 } = req.body || {};
  if (!MENU[itemId]) return res.status(400).json({ error: "Invalid itemId" });

  if (!req.session.cart) req.session.cart = {};
  const q = Math.max(1, Number(quantity || 1));
  req.session.cart[itemId] = (req.session.cart[itemId] || 0) + q;

  res.json(cartResponse(req.session.cart));
});

app.post("/api/cart/remove", (req, res) => {
  const { itemId, quantity = 1 } = req.body || {};
  if (!MENU[itemId]) return res.status(400).json({ error: "Invalid itemId" });

  if (!req.session.cart) req.session.cart = {};
  const q = Math.max(1, Number(quantity || 1));
  const current = req.session.cart[itemId] || 0;
  const next = Math.max(0, current - q);

  if (next === 0) delete req.session.cart[itemId];
  else req.session.cart[itemId] = next;

  res.json(cartResponse(req.session.cart));
});

app.post("/api/checkout", (req, res) => {
  if (!req.session.cart) req.session.cart = {};
  const { items, total } = cartResponse(req.session.cart);

  if (!items.length) return res.status(400).json({ error: "Cart is empty" });

  const merchant_id = process.env.PF_MERCHANT_ID || "10000100";
  const merchant_key = process.env.PF_MERCHANT_KEY || "46f0cd694581a";
  const passphrase = process.env.PF_PASSPHRASE || "";

  const data = {
    merchant_id,
    merchant_key,
    return_url: `http://localhost:${port}/success`,
    cancel_url: `http://localhost:${port}/cancel`,
    notify_url: `http://localhost:${port}/notify`,
    m_payment_id: `ORDER-${Date.now()}`,
    amount: total.toFixed(2),
    item_name: "BraaiSpot Order",
    item_description: items.map((i) => `${i.name} x${i.quantity}`).join(", "),
  };

  data.signature = pfSignature(data, passphrase);
  res.json({ payfastData: data });
});

app.post("/notify", (req, res) => {
  res.status(200).send("OK");
});

app.get("/success", (req, res) => {
  res.send('<h1>Payment Successful!</h1><a href="/">Back to Menu</a>');
});

app.get("/cancel", (req, res) => {
  res.send('<h1>Payment Cancelled</h1><a href="/">Back to Menu</a>');
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
