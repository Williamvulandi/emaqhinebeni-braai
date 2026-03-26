// Khanya Kitchen - Main Script
let authState = { authenticated: false, user: null };

document.addEventListener("DOMContentLoaded", () => {
  // Check auth first, then load menu
  checkAuthStatus().then(() => {
    loadMenu();
    hideLoadingOverlay();
  });

  // -------------------- Smooth Scroll --------------------
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      const target = document.querySelector(a.getAttribute("href"));
      if (target) {
        target.scrollIntoView({ behavior: "smooth" });
        // Close mobile menu if open
        document.getElementById("nav-links")?.classList.remove("active");
        document.getElementById("hamburger-btn")?.classList.remove("active");
      }
    });
  });

  // -------------------- Hamburger Menu --------------------
  const hamburgerBtn = document.getElementById("hamburger-btn");
  const navLinks = document.getElementById("nav-links");
  if (hamburgerBtn && navLinks) {
    hamburgerBtn.addEventListener("click", () => {
      hamburgerBtn.classList.toggle("active");
      navLinks.classList.toggle("active");
    });
  }

  // -------------------- Origin Check --------------------
  function checkOrigin() {
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const isPort3000 = window.location.port === "3000" || window.location.port === "";

    if (isLocalhost && !isPort3000) {
      const correctUrl = `http://localhost:3000${window.location.pathname}${window.location.search}`;
      if (confirm(`⚠️ You are on port ${window.location.port}.\nClick OK to go to:\n${correctUrl}`)) {
        window.location.href = correctUrl;
      }
    } else if (window.location.protocol === "file:") {
      alert("⚠️ Please run the server and go to http://localhost:3000");
    }
  }
  checkOrigin();

  // -------------------- Cart Elements --------------------
  const cartItemsDiv = document.getElementById("cart-items");
  const cartTotalSpan = document.getElementById("cart-total");

  // -------------------- Load Menu From API --------------------
  async function loadMenu() {
    try {
      const res = await fetch("/api/menu");
      if (!res.ok) throw new Error("Failed to load menu");
      const data = await res.json();
      renderMenu(data.items || []);
    } catch (err) {
      console.error("Menu load error:", err);
      document.getElementById("menu-grid").innerHTML =
        '<p style="text-align: center; color: var(--gray-text); grid-column: 1/-1;">Failed to load menu. Please refresh the page.</p>';
    }
  }

  function renderMenu(items) {
    const grid = document.getElementById("menu-grid");
    grid.innerHTML = "";

    items.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "menu-card";
      card.dataset.itemId = item.id;
      card.style.animationDelay = `${index * 0.1}s`;

      card.innerHTML = `
        <div class="card-image">
          <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy">
        </div>
        <div class="card-details">
          <div class="card-header">
            <h3>${escapeHtml(item.name)}</h3>
            <span class="price">R${item.price}</span>
          </div>
          <p>${escapeHtml(item.description)}</p>
          <div class="quantity-controls">
            <button class="qty-btn minus">-</button>
            <span class="quantity">0</span>
            <button class="qty-btn plus">+</button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });

    // Attach quantity button listeners
    attachQtyListeners();
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // -------------------- Cart Display --------------------
  async function updateCartDisplay() {
    try {
      const res = await fetch("/api/cart");
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();

      cartItemsDiv.innerHTML = "";
      const items = data.items || [];

      if (items.length > 0) {
        items.forEach(item => {
          const row = document.createElement("div");
          row.className = "cart-item";
          row.innerHTML = `<span>${escapeHtml(item.name)} x${item.quantity}</span><span>R${(item.price * item.quantity).toFixed(2)}</span>`;
          cartItemsDiv.appendChild(row);
        });
      } else {
        cartItemsDiv.innerHTML = "<p>Your cart is empty.</p>";
      }

      cartTotalSpan.textContent = Number(data.total || 0).toFixed(2);

      let totalQty = 0;
      document.querySelectorAll(".menu-card").forEach(card => {
        const id = String(card.dataset.itemId);
        const qtySpan = card.querySelector(".quantity");
        const match = items.find(x => String(x.id) === id);
        const qty = match ? match.quantity : 0;
        if (qtySpan) qtySpan.textContent = qty;
        totalQty += qty;
      });

      const badge = document.getElementById("cart-count");
      if (badge) badge.textContent = totalQty;
    } catch (err) {
      console.error("Cart update error:", err);
    }
  }

  // -------------------- Toast --------------------
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
    setTimeout(() => { toast.classList.remove("show"); }, 3000);
  }

  // -------------------- Quantity Buttons --------------------
  function attachQtyListeners() {
    document.querySelectorAll(".qty-btn").forEach(btn => {
      btn.addEventListener("click", async function () {
        const card = this.closest(".menu-card");
        const itemId = card.dataset.itemId;
        const itemName = card.querySelector("h3").innerText;
        const quantitySpan = card.querySelector(".quantity");
        let startQty = parseInt(quantitySpan.textContent, 10) || 0;

        try {
          if (this.classList.contains("plus")) {
            quantitySpan.textContent = startQty + 1;
            const res = await fetch("/api/cart/add", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ itemId, quantity: 1 })
            });

            if (res.status === 401) {
              showToast("Please log in to add items to cart", "error");
              quantitySpan.textContent = startQty;
              setTimeout(() => document.getElementById("login-modal").classList.add("active"), 1000);
              return;
            }
            if (res.status === 403) {
              showToast("Please verify your email to start ordering", "error");
              quantitySpan.textContent = startQty;
              return;
            }
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || "Add failed");
            }
            showToast(`Added ${itemName} to cart`);
          } else if (this.classList.contains("minus") && startQty > 0) {
            quantitySpan.textContent = startQty - 1;
            const res = await fetch("/api/cart/remove", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ itemId, quantity: 1 })
            });

            if (res.status === 401) {
              showToast("Please log in first", "error");
              quantitySpan.textContent = startQty;
              setTimeout(() => document.getElementById("login-modal").classList.add("active"), 1000);
              return;
            }
            if (res.status === 403) {
              showToast("Please verify your email", "error");
              quantitySpan.textContent = startQty;
              return;
            }
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || "Remove failed");
            }
            showToast(`Removed ${itemName}`, "success");
          }
          updateCartDisplay();
        } catch (err) {
          console.error("Qty error:", err);
          if (err instanceof TypeError && err.message.includes("fetch")) {
            showToast("Connection error. Is the server running?", "error");
          } else {
            showToast(`Error: ${err.message}`, "error");
          }
          if (quantitySpan) quantitySpan.textContent = startQty;
          updateCartDisplay();
        }
      });
    });
  }

  // -------------------- Checkout --------------------
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
          alert(data.error || "Checkout failed.");
          checkoutBtn.textContent = originalText;
          checkoutBtn.disabled = false;
          return;
        }

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
        checkoutBtn.disabled = false;
      }
    });
  }

  // -------------------- Authentication --------------------
  async function checkAuthStatus() {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();

      if (data.authenticated) {
        authState.authenticated = true;
        authState.user = data.user;
        updateAuthUI();
        updateCartDisplay();
        loadOrders();
      } else {
        authState.authenticated = false;
        authState.user = null;
        updateAuthUI();
      }
    } catch (err) {
      console.error("Auth check failed:", err);
      authState.authenticated = false;
      updateAuthUI();
    }
  }

  function updateAuthUI() {
    const authButtons = document.getElementById("auth-buttons");
    const userInfo = document.getElementById("user-info");
    const userName = document.getElementById("user-name");
    const verificationBanner = document.getElementById("verification-banner");
    const ordersSection = document.getElementById("orders-section");
    const navOrdersLink = document.getElementById("nav-orders-link");
    const navAdminLink = document.getElementById("nav-admin-link");

    if (authState.authenticated && authState.user) {
      authButtons.style.display = "none";
      userInfo.style.display = "flex";
      userName.textContent = `Hi, ${authState.user.firstName}`;

      if (verificationBanner) {
        verificationBanner.style.display = authState.user.emailVerified ? "none" : "block";
      }

      // Show orders section and nav link
      if (ordersSection) ordersSection.style.display = "block";
      if (navOrdersLink) navOrdersLink.style.display = "block";

      // Show admin link if admin
      if (navAdminLink && authState.user.isAdmin) {
        navAdminLink.style.display = "block";
      }

      // Pre-fill customer details
      const custFirst = document.getElementById("cust-first-name");
      const custLast = document.getElementById("cust-last-name");
      const custEmail = document.getElementById("cust-email");
      if (custFirst && !custFirst.value) custFirst.value = authState.user.firstName || "";
      if (custLast && !custLast.value) custLast.value = authState.user.lastName || "";
      if (custEmail && !custEmail.value) custEmail.value = authState.user.email || "";
    } else {
      authButtons.style.display = "flex";
      userInfo.style.display = "none";
      if (verificationBanner) verificationBanner.style.display = "none";
      if (ordersSection) ordersSection.style.display = "none";
      if (navOrdersLink) navOrdersLink.style.display = "none";
      if (navAdminLink) navAdminLink.style.display = "none";
    }
  }

  // -------------------- Orders --------------------
  async function loadOrders() {
    if (!authState.authenticated) return;
    try {
      const res = await fetch("/api/orders");
      if (!res.ok) return;
      const data = await res.json();
      renderOrders(data.orders || []);
    } catch (err) {
      console.error("Orders load error:", err);
    }
  }

  function renderOrders(orders) {
    const list = document.getElementById("orders-list");
    if (!list) return;

    if (orders.length === 0) {
      list.innerHTML = '<p style="text-align: center; color: var(--gray-text);">No orders yet. Start ordering from our menu!</p>';
      return;
    }

    list.innerHTML = orders.map(order => {
      const itemsHtml = order.items.map(i =>
        `<li>${escapeHtml(i.name)} x${i.quantity} — R${(i.price * i.quantity).toFixed(2)}</li>`
      ).join('');

      const date = new Date(order.createdAt).toLocaleDateString('en-ZA', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      return `
        <div class="order-card">
          <div class="order-card-header">
            <h3>#${escapeHtml(order.reference)}</h3>
            <span class="order-status ${order.status}">${order.status}</span>
          </div>
          <ul class="order-items-list">${itemsHtml}</ul>
          <div class="order-total">Total: R${order.total.toFixed(2)}</div>
          <div class="order-date">${date}</div>
        </div>
      `;
    }).join('');
  }

  // -------------------- Loading Overlay --------------------
  function hideLoadingOverlay() {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) {
      overlay.classList.add("hidden");
      setTimeout(() => overlay.remove(), 500);
    }
  }

  // -------------------- Modal Controls --------------------
  const loginModal = document.getElementById("login-modal");
  const signupModal = document.getElementById("signup-modal");
  const forgotPasswordModal = document.getElementById("forgot-password-modal");
  const verifyModal = document.getElementById("verify-modal");

  document.getElementById("login-btn")?.addEventListener("click", () => loginModal.classList.add("active"));
  document.getElementById("signup-btn")?.addEventListener("click", () => signupModal.classList.add("active"));

  document.getElementById("forgot-password-link")?.addEventListener("click", e => {
    e.preventDefault();
    loginModal.classList.remove("active");
    forgotPasswordModal.classList.add("active");
  });

  document.getElementById("forgot-to-login")?.addEventListener("click", e => {
    e.preventDefault();
    forgotPasswordModal.classList.remove("active");
    loginModal.classList.add("active");
  });

  document.querySelectorAll(".modal-close").forEach(closeBtn => {
    closeBtn.addEventListener("click", function () {
      document.getElementById(this.getAttribute("data-modal")).classList.remove("active");
    });
  });

  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", function (e) {
      if (e.target === this) this.classList.remove("active");
    });
  });

  document.getElementById("switch-to-signup")?.addEventListener("click", e => {
    e.preventDefault();
    loginModal.classList.remove("active");
    signupModal.classList.add("active");
  });

  document.getElementById("switch-to-login")?.addEventListener("click", e => {
    e.preventDefault();
    signupModal.classList.remove("active");
    loginModal.classList.add("active");
  });

  // -------------------- Signup --------------------
  document.getElementById("signup-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const firstName = document.getElementById("signup-firstname").value.trim();
    const lastName = document.getElementById("signup-lastname").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, firstName, lastName })
      });
      const data = await res.json();
      if (res.ok) {
        signupModal.classList.remove("active");
        verifyModal.classList.add("active");
        showToast(data.message || `Welcome, ${firstName}! Please verify your email.`, "success");
      } else {
        showToast(data.error || "Signup failed", "error");
      }
    } catch (err) {
      console.error("Signup error:", err);
      showToast("Connection error. Please try again.", "error");
    }
  });

  // -------------------- Login --------------------
  document.getElementById("login-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        authState.authenticated = true;
        authState.user = data.user;
        updateAuthUI();
        loginModal.classList.remove("active");
        if (!data.user.emailVerified) {
          verifyModal.classList.add("active");
          showToast("Please verify your email address.", "info");
        } else {
          showToast(`Welcome back, ${data.user.firstName}!`, "success");
        }
        updateCartDisplay();
        loadOrders();
      } else {
        showToast(data.error || "Login failed", "error");
      }
    } catch (err) {
      console.error("Login error:", err);
      showToast("Connection error. Please try again.", "error");
    }
  });

  // -------------------- Logout --------------------
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      authState.authenticated = false;
      authState.user = null;
      updateAuthUI();
      showToast("Logged out successfully", "success");
      cartItemsDiv.innerHTML = "<p>Your cart is empty.</p>";
      cartTotalSpan.textContent = "0.00";
      document.querySelectorAll(".quantity").forEach(qty => qty.textContent = "0");
      const badge = document.getElementById("cart-count");
      if (badge) badge.textContent = "0";
    } catch (err) {
      console.error("Logout error:", err);
    }
  });

  // -------------------- Forgot Password --------------------
  document.getElementById("forgot-password-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.getElementById("forgot-email").value.trim();
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, "success");
        forgotPasswordModal.classList.remove("active");
      } else {
        showToast(data.error || "Request failed", "error");
      }
    } catch (err) {
      showToast("Connection error", "error");
    }
  });

  // -------------------- Verify Code --------------------
  document.getElementById("verify-code-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const code = document.getElementById("verify-code-input").value.trim();
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Email verified successfully!", "success");
        verifyModal.classList.remove("active");
        await checkAuthStatus();
      } else {
        showToast(data.error || "Verification failed", "error");
      }
    } catch (err) {
      console.error("Verification error:", err);
      showToast("Connection error. Please try again.", "error");
    }
  });

  // -------------------- Resend --------------------
  const handleResend = async e => {
    if (e) e.preventDefault();
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = await res.json();
      if (res.ok) { showToast(data.message || "New code sent!", "success"); }
      else { showToast(data.error || "Failed to resend code", "error"); }
    } catch (err) { showToast("Connection error", "error"); }
  };

  document.getElementById("resend-code-btn")?.addEventListener("click", handleResend);
  document.getElementById("resend-verification-btn")?.addEventListener("click", handleResend);
  document.getElementById("open-verify-btn")?.addEventListener("click", () => verifyModal.classList.add("active"));

  // Initial state
  if (!authState.authenticated) {
    cartItemsDiv.innerHTML = "<p style='text-align: center; color: var(--gray-text);'>Please log in to start ordering</p>";
  }
});
