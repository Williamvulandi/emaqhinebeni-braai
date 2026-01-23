// Braai Spot - Cart + Checkout (Paystack-ready)
document.addEventListener("DOMContentLoaded", () => {
  // Fade-in animation
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          obs.unobserve(e.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  document.querySelectorAll(".fade-in").forEach((el) => observer.observe(el));

  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelector(a.getAttribute("href")).scrollIntoView({ behavior: "smooth" });
    });
  });

  const cartItemsDiv = document.getElementById("cart-items");
  const cartTotalSpan = document.getElementById("cart-total");
  const checkoutBtn = document.getElementById("checkout-btn");

  async function updateCartDisplay() {
    try {
      const res = await fetch("/api/cart");
      const data = await res.json();

      cartItemsDiv.innerHTML = "";
      data.items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "cart-item";
        row.innerHTML = `
          <span>${item.name} x${item.quantity}</span>
          <span>R${(item.price * item.quantity).toFixed(2)}</span>
        `;
        cartItemsDiv.appendChild(row);
      });

      cartTotalSpan.textContent = Number(data.total || 0).toFixed(2);
    } catch (err) {
      console.error("Cart display error:", err);
    }
  }

  // Quantity buttons (+ / -)
  document.querySelectorAll(".qty-btn").forEach((btn) => {
    btn.addEventListener("click", async function () {
      const card = this.closest(".menu-card");
      const itemId = card.dataset.itemId;
      const quantitySpan = card.querySelector(".quantity");
      let quantity = parseInt(quantitySpan.textContent, 10) || 0;

      try {
        if (this.classList.contains("plus")) {
          quantity += 1;
          await fetch("/api/cart/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId, quantity: 1 })
          });
        } else if (this.classList.contains("minus") && quantity > 0) {
          quantity -= 1;
          await fetch("/api/cart/remove", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId, quantity: 1 })
          });
        }

        quantitySpan.textContent = quantity;
        updateCartDisplay();
      } catch (err) {
        console.error("Qty update error:", err);
      }
    });
  });

  // Checkout (Paystack initialize → redirect)
  checkoutBtn.addEventListener("click", async () => {
    try {
      const firstName = document.getElementById("cust-first-name")?.value?.trim() || "";
      const lastName = document.getElementById("cust-last-name")?.value?.trim() || "";
      const email = document.getElementById("cust-email")?.value?.trim() || "";
      const phone = document.getElementById("cust-phone")?.value?.trim() || "";

      if (!firstName || !lastName || !email) {
        alert("Please fill in First Name, Last Name, and Email before checkout.");
        return;
      }

      const res = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, phone })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Checkout failed.");
        return;
      }

      // Redirect to Paystack secure checkout
      window.location.href = data.authorization_url;
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Checkout error. Please try again.");
    }
  });

  // Load cart on page open
  updateCartDisplay();
});
