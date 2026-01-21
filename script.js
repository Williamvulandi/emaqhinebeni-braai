document.addEventListener("DOMContentLoaded", () => {
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
  async function updateCartDisplay() {
    try {
      const response = await fetch("/api/cart");
      const data = await response.json();

      const cartItemsDiv = document.getElementById("cart-items");
      const cartTotalSpan = document.getElementById("cart-total");

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

      cartTotalSpan.textContent = Number(data.total || 0).toFixed(2);

      // Sync the quantities on each menu card (kiosk behaviour)
      document.querySelectorAll(".menu-card").forEach((card) => {
        const id = String(card.dataset.itemId);
        const qtySpan = card.querySelector(".quantity");
        const match = data.items.find((x) => String(x.id) === id);
        qtySpan.textContent = match ? match.quantity : 0;
      });
    } catch (error) {
      console.error("Error updating cart:", error);
    }
  }

  // -------------------- Quantity buttons --------------------
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
          // remove one
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

  // -------------------- Checkout --------------------
  document.getElementById("checkout-btn")?.addEventListener("click", async () => {
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data?.error || "Checkout failed");
        return;
      }

      if (data.error) {
        alert(data.error);
        return;
      }

      // Create PayFast form and submit
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "https://sandbox.payfast.co.za/eng/process";

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
      console.error("Error during checkout:", error);
    }
  });

  // Initial load
  updateCartDisplay();
});
