document.addEventListener("DOMContentLoaded", () => {
  /* ===============================
     Fade-in animations
  =============================== */
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

  /* ===============================
     Smooth scroll
  =============================== */
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute("href"));
      if (target) target.scrollIntoView({ behavior: "smooth" });
    });
  });

  /* ===============================
     Cart display + sync quantities
  =============================== */
  async function updateCartDisplay() {
    try {
      const response = await fetch("/api/cart");
      const data = await response.json();

      const cartItemsDiv = document.getElementById("cart-items");
      const cartTotalSpan = document.getElementById("cart-total");
      const checkoutBtn = document.getElementById("checkout-btn");

      // Render cart items
      cartItemsDiv.innerHTML = "";
      data.items.forEach((item) => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "cart-item";
        itemDiv.innerHTML = `
          <span>${item.name} x${item.quantity}</span>
          <span>R${(item.price * item.quantity).toFixed(2)}</span>
        `;
        cartItemsDiv.appendChild(itemDiv);
      });

      const total = Number(data.total || 0);
      cartTotalSpan.textContent = total.toFixed(2);

      // Sync quantities on cards
      document.querySelectorAll(".menu-card").forEach((card) => {
        const id = String(card.dataset.itemId);
        const qtySpan = card.querySelector(".quantity");
        const match = data.items.find((x) => String(x.id) === id);
        qtySpan.textContent = match ? match.quantity : 0;
      });

      // Disable checkout if cart empty (optional but helpful)
      if (checkoutBtn) {
        checkoutBtn.disabled = total <= 0;
        checkoutBtn.style.opacity = total <= 0 ? "0.6" : "1";
        checkoutBtn.style.cursor = total <= 0 ? "not-allowed" : "pointer";
      }
    } catch (error) {
      console.error("Error updating cart:", error);
    }
  }

  /* ===============================
     Quantity buttons (+ / -)
  =============================== */
  document.querySelectorAll(".qty-btn").forEach((btn) => {
    btn.addEventListener("click", async function () {
      const card = this.closest(".menu-card");
      const itemId = card?.dataset?.itemId;
      if (!itemId) return;

      try {
        if (this.classList.contains("plus")) {
          await fetch("/api/cart/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId, quantity: 1 }),
          });
        } else if (this.classList.contains("minus")) {
          await fetch("/api/cart/remove", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId, quantity: 1 }),
          });
        }

        await updateCartDisplay();
      } catch (error) {
        console.error("Error updating quantity:", error);
      }
    });
  });

  /* ===============================
     Checkout (NO modal) - PayFast redirect
  =============================== */
  const checkoutBtn = document.getElementById("checkout-btn");
  if (!checkoutBtn) {
    console.error("Checkout button not found (#checkout-btn).");
    return;
  }

  checkoutBtn.addEventListener("click", async () => {
    try {
      // Get customer details
      const firstName = document.getElementById("cust-first-name")?.value.trim();
      const lastName = document.getElementById("cust-last-name")?.value.trim();
      const email = document.getElementById("cust-email")?.value.trim();
      const phone = document.getElementById("cust-phone")?.value.trim();

      if (!firstName || !lastName || !email) {
        alert("Please fill in First Name, Last Name and Email.");
        return;
      }

      // Call backend checkout
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { firstName, lastName, email, phone },
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        alert(data.error || "Checkout failed");
        return;
      }

      // IMPORTANT:
      // If your server returns "payfastProcessUrl", use it.
      // Otherwise fallback to sandbox.
      const payfastUrl =
        data.payfastProcessUrl || "https://sandbox.payfast.co.za/eng/process";

      // Build PayFast form & submit
      const form = document.createElement("form");
      form.method = "POST";
      form.action = payfastUrl;

      for (const [key, value] of Object.entries(data.payfastData)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }

      document.body.appendChild(form);
      form.submit();
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Something went wrong during checkout.");
    }
  });

  /* ===============================
     Initial load
  =============================== */
  updateCartDisplay();
});
