// Braai Spot - Script
document.addEventListener("DOMContentLoaded", () => {
  // -------------------- Fade-in animations --------------------
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

  // -------------------- Smooth Scroll --------------------
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelector(a.getAttribute("href")).scrollIntoView({ behavior: "smooth" });
    });
  });

  // -------------------- Port Check (Crucial for User) --------------------
  if (window.location.port === "5500" || window.location.port === "5501") {
    const correctUrl = "http://localhost:3000";
    const msg = `⚠️ YOU ARE ON THE WRONG LINK ⚠️\n\nThe cart will NOT work here.\n\nClick OK to go to the correct link:\n${correctUrl}`;
    if (confirm(msg)) {
      window.location.href = correctUrl;
    }
  }

  // -------------------- Cart Logic --------------------
  const cartItemsDiv = document.getElementById("cart-items");
  const cartTotalSpan = document.getElementById("cart-total");

  async function updateCartDisplay() {
    try {
      const res = await fetch("/api/cart");

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();

      // Update items list
      cartItemsDiv.innerHTML = "";
      const items = data.items || [];

      if (items.length > 0) {
        items.forEach((item) => {
          const row = document.createElement("div");
          row.className = "cart-item";
          row.innerHTML = `
            <span>${item.name} x${item.quantity}</span>
            <span>R${(item.price * item.quantity).toFixed(2)}</span>
          `;
          cartItemsDiv.appendChild(row);
        });
      } else {
        cartItemsDiv.innerHTML = "<p>Your cart is empty.</p>";
      }

      // Update total
      cartTotalSpan.textContent = Number(data.total || 0).toFixed(2);

      // Sync the quantities on menu cards
      let totalQty = 0;
      document.querySelectorAll(".menu-card").forEach((card) => {
        const id = String(card.dataset.itemId);
        const qtySpan = card.querySelector(".quantity");
        const match = items.find((x) => String(x.id) === id);

        const qty = match ? match.quantity : 0;
        if (qtySpan) qtySpan.textContent = qty;
        totalQty += qty;
      });

      // Update badge
      const badge = document.getElementById("cart-count");
      if (badge) badge.textContent = totalQty;

    } catch (err) {
      console.error("Cart update error:", err);
      // Optional: Visual indicator that connection failed?
      // cartTotalSpan.innerText = "Error";
    }
  }

  // -------------------- Quantity Buttons --------------------
  // -------------------- Toast Notification --------------------
  function showToast(message, type = "success") {
    let toast = document.getElementById("toast-notification");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast-notification";
      toast.className = "toast";
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }

  // -------------------- Quantity Buttons --------------------
  document.querySelectorAll(".qty-btn").forEach((btn) => {
    btn.addEventListener("click", async function () {
      const card = this.closest(".menu-card");
      const itemId = card.dataset.itemId;
      const itemName = card.querySelector("h3").innerText;
      const quantitySpan = card.querySelector(".quantity");
      let startQty = parseInt(quantitySpan.textContent, 10) || 0;

      try {
        if (this.classList.contains("plus")) {
          // Optimistic UI update
          quantitySpan.textContent = startQty + 1;
          const res = await fetch("/api/cart/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId, quantity: 1 })
          });
          if (!res.ok) throw new Error("Add failed");
          showToast(`Added ${itemName} to cart`);
        } else if (this.classList.contains("minus") && startQty > 0) {
          // Optimistic UI update
          quantitySpan.textContent = startQty - 1;
          const res = await fetch("/api/cart/remove", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId, quantity: 1 })
          });
          if (!res.ok) throw new Error("Remove failed");
          showToast(`Removed ${itemName}`, "success");
        }
        // Sync ground truth
        updateCartDisplay();
      } catch (err) {
        console.error("Qty error:", err);
        showToast("Connection error. Is server running?", "error");

        // Revert optimistic update
        if (quantitySpan) quantitySpan.textContent = startQty;

        // Try to sync anyway (might fail again, but good practice)
        updateCartDisplay();
      }
    });
  });

  // -------------------- Checkout (Paystack) --------------------
  const checkoutBtn = document.getElementById("checkout-btn");
  if (checkoutBtn) {
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

        const originalText = checkoutBtn.textContent;
        checkoutBtn.textContent = "Processing...";
        checkoutBtn.disabled = true;

        const res = await fetch("/api/paystack/initialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstName, lastName, email, phone })
        });

        const data = await res.json();

        if (!res.ok) {
          alert(data.error || "Checkout initializing failed.");
          checkoutBtn.textContent = originalText;
          checkoutBtn.disabled = false;
          return;
        }

        // Redirect to Paystack
        if (data.authorization_url) {
          window.location.href = data.authorization_url;
        } else {
          alert("Error: No payment URL received.");
          checkoutBtn.textContent = originalText;
          checkoutBtn.disabled = false;
        }

      } catch (err) {
        console.error("Checkout error:", err);
        alert("Connection error. Ensure server is running.");
        const btn = document.getElementById("checkout-btn");
        if (btn) btn.disabled = false;
      }
    });
  }

  // Initial Load
  updateCartDisplay();
});
