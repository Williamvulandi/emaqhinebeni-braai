const MENU = {
  "1": { id: 1, name: "Pork Braai Piece", price: 5, image: "images/pork.png" },
  "10": { id: 10, name: "Big Pork Piece", price: 10, image: "images/pork.png" }, // Reusing pork image for now
  "2": { id: 2, name: "Chicken Feet", price: 1, image: "images/chicken_feet.png" },
  "3": { id: 3, name: "Liver Stick", price: 10, image: "images/kebkeb.webp" },
  "4": { id: 4, name: "Small Fat Cake", price: 1, image: "images/fat-cakes.webp" },
  "5": { id: 5, name: "Chicken Wings", price: 8, image: "images/wings.webp" },
  "6": { id: 6, name: "Sausage Pieces", price: 6, image: "images/sausage-small-pieces.webp" },
  "7": { id: 7, name: "Pap + Pork + Chakalaka", price: 35, image: "placeholder" },
  "8": { id: 8, name: "Pap + Wings + Chakalaka", price: 40, image: "placeholder" },
  "9": { id: 9, name: "Pap + Sausage + Chakalaka", price: 30, image: "placeholder" },
};

document.addEventListener("DOMContentLoaded", () => {
  // -------------------- State Management --------------------
  // Load cart from sessionStorage or initialize empty
  let cart = JSON.parse(sessionStorage.getItem('braaiCart')) || {};

  function saveCart() {
    sessionStorage.setItem('braaiCart', JSON.stringify(cart));
    updateCartDisplay();
  }

  // -------------------- Fade-in animations --------------------
  const observerOptions = { root: null, rootMargin: "0px", threshold: 0.1 };

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        obs.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll(".fade-in").forEach((el) => observer.observe(el));

  // -------------------- Smooth scroll --------------------
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      document.querySelector(this.getAttribute("href"))?.scrollIntoView({ behavior: "smooth" });
    });
  });

  // -------------------- Cart rendering + sync quantities --------------------
  function updateCartDisplay() {
    const cartItemsDiv = document.getElementById("cart-items");
    const cartTotalSpan = document.getElementById("cart-total");

    // Calculate items and total
    let total = 0;
    const items = [];

    for (const [itemId, qty] of Object.entries(cart)) {
      const item = MENU[itemId];
      if (item && qty > 0) {
        items.push({ ...item, quantity: qty });
        total += item.price * qty;
      }
    }

    // Render cart items
    if (items.length === 0) {
      cartItemsDiv.innerHTML = "<p>Your cart is empty.</p>";
    } else {
      cartItemsDiv.innerHTML = "";
      items.forEach((item) => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "cart-item";
        itemDiv.innerHTML = `
                    <span>${item.name} x${item.quantity}</span>
                    <span>R${(item.price * item.quantity).toFixed(2)}</span>
                `;
        cartItemsDiv.appendChild(itemDiv);
      });
    }

    cartTotalSpan.textContent = total.toFixed(2);

    // Sync the quantities on each menu card
    document.querySelectorAll(".menu-card").forEach((card) => {
      const id = String(card.dataset.itemId);
      const qtySpan = card.querySelector(".quantity");
      const qty = cart[id] || 0;
      qtySpan.textContent = qty;
    });
  }

  // -------------------- Quantity buttons --------------------
  document.querySelectorAll(".qty-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const card = this.closest(".menu-card");
      const itemId = card?.dataset?.itemId;
      if (!itemId) return;

      const currentQty = cart[itemId] || 0;

      if (this.classList.contains("plus")) {
        cart[itemId] = currentQty + 1;
      } else if (this.classList.contains("minus")) {
        if (currentQty > 0) {
          cart[itemId] = currentQty - 1;
          if (cart[itemId] === 0) {
            delete cart[itemId];
          }
        }
      }

      saveCart();
    });
  });

  // -------------------- Checkout --------------------
  document.getElementById("checkout-btn")?.addEventListener("click", async () => {
    const items = [];
    let total = 0;

    for (const [itemId, qty] of Object.entries(cart)) {
      const item = MENU[itemId];
      if (item && qty > 0) {
        items.push(`${item.name} x${qty}`);
        total += item.price * qty;
      }
    }

    if (items.length === 0) {
      alert("Your cart is empty!");
      return;
    }

    // Get email from input
    const emailInput = document.getElementById("receipt-email");
    const email = emailInput?.value?.trim();

    if (!email) {
      alert("Please enter your email address for the receipt.");
      emailInput?.focus();
      return;
    }

    try {
      const checkoutBtn = document.getElementById("checkout-btn");
      const originalText = checkoutBtn.textContent;
      checkoutBtn.textContent = "Processing...";
      checkoutBtn.disabled = true;

      const response = await fetch("http://localhost:3000/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, amount: total })
      });

      const data = await response.json();

      if (data.authorization_url) {
        // Redirect to Paystack
        window.location.href = data.authorization_url;
      } else {
        alert("Payment Error: " + (data.error || "Unknown error"));
        checkoutBtn.textContent = originalText;
        checkoutBtn.disabled = false;
      }
    } catch (error) {
      console.error(error);
      alert("An error occurred connecting to the server. Make sure the server is running.");
      const checkoutBtn = document.getElementById("checkout-btn");
      checkoutBtn.textContent = "Checkout";
      checkoutBtn.disabled = false;
    }
  });

  // Initial load
  updateCartDisplay();
});
