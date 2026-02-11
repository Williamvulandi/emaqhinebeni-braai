// Braai Spot - Script
let authState = {
  authenticated: false,
  user: null
};

document.addEventListener("DOMContentLoaded", () => {
  // Check authentication status first
  checkAuthStatus();
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

          if (res.status === 401) {
            showToast("Please log in to add items to cart", "error");
            quantitySpan.textContent = startQty; // Revert
            setTimeout(() => {
              document.getElementById("login-modal").classList.add("active");
            }, 1000);
            return;
          }

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

          if (res.status === 401) {
            showToast("Please log in first", "error");
            quantitySpan.textContent = startQty; // Revert
            setTimeout(() => {
              document.getElementById("login-modal").classList.add("active");
            }, 1000);
            return;
          }

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

  // -------------------- Authentication Functions --------------------
  async function checkAuthStatus() {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();

      if (data.authenticated) {
        authState.authenticated = true;
        authState.user = data.user;
        updateAuthUI();
        updateCartDisplay(); // Load cart after auth check
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

    if (authState.authenticated && authState.user) {
      authButtons.style.display = "none";
      userInfo.style.display = "flex";
      userName.textContent = `Hi, ${authState.user.firstName}`;

      // Show verification banner if not verified
      if (verificationBanner) {
        verificationBanner.style.display = authState.user.emailVerified ? "none" : "block";
      }
    } else {
      authButtons.style.display = "flex";
      userInfo.style.display = "none";
      if (verificationBanner) {
        verificationBanner.style.display = "none";
      }
    }
  }

  // Modal controls
  const loginModal = document.getElementById("login-modal");
  const signupModal = document.getElementById("signup-modal");
  const forgotPasswordModal = document.getElementById("forgot-password-modal");
  const verifyModal = document.getElementById("verify-modal");

  const loginBtn = document.getElementById("login-btn");
  const signupBtn = document.getElementById("signup-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const forgotPasswordLink = document.getElementById("forgot-password-link");
  const forgotToLogin = document.getElementById("forgot-to-login");

  loginBtn?.addEventListener("click", () => {
    loginModal.classList.add("active");
  });

  signupBtn?.addEventListener("click", () => {
    signupModal.classList.add("active");
  });

  forgotPasswordLink?.addEventListener("click", (e) => {
    e.preventDefault();
    loginModal.classList.remove("active");
    forgotPasswordModal.classList.add("active");
  });

  forgotToLogin?.addEventListener("click", (e) => {
    e.preventDefault();
    forgotPasswordModal.classList.remove("active");
    loginModal.classList.add("active");
  });

  // Close modals
  document.querySelectorAll(".modal-close").forEach(closeBtn => {
    closeBtn.addEventListener("click", function () {
      const modalId = this.getAttribute("data-modal");
      document.getElementById(modalId).classList.remove("active");
    });
  });

  // Close modal on background click
  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", function (e) {
      if (e.target === this) {
        this.classList.remove("active");
      }
    });
  });

  // Switch between login and signup
  document.getElementById("switch-to-signup")?.addEventListener("click", (e) => {
    e.preventDefault();
    loginModal.classList.remove("active");
    signupModal.classList.add("active");
  });

  document.getElementById("switch-to-login")?.addEventListener("click", (e) => {
    e.preventDefault();
    signupModal.classList.remove("active");
    loginModal.classList.add("active");
  });

  // Signup form
  document.getElementById("signup-form")?.addEventListener("submit", async (e) => {
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
        // Stop auto-login: authState should NOT be updated here
        // authState.authenticated = true;
        // authState.user = data.user;
        // updateAuthUI();

        signupModal.classList.remove("active");
        verifyModal.classList.add("active");
        showToast(data.message || `Welcome, ${firstName}! Please verify your email.`, "success");
        // updateCartDisplay(); // Cart will fail if not authenticated anyway
      } else {
        showToast(data.error || "Signup failed", "error");
      }
    } catch (err) {
      console.error("Signup error:", err);
      showToast("Connection error. Please try again.", "error");
    }
  });

  // Login form
  document.getElementById("login-form")?.addEventListener("submit", async (e) => {
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
      } else {
        showToast(data.error || "Login failed", "error");
      }
    } catch (err) {
      console.error("Login error:", err);
      showToast("Connection error. Please try again.", "error");
    }
  });

  // Logout
  logoutBtn?.addEventListener("click", async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      authState.authenticated = false;
      authState.user = null;
      updateAuthUI();
      showToast("Logged out successfully", "success");

      // Clear cart display
      cartItemsDiv.innerHTML = "<p>Your cart is empty.</p>";
      cartTotalSpan.textContent = "0.00";
      document.querySelectorAll(".quantity").forEach(qty => qty.textContent = "0");
      const badge = document.getElementById("cart-count");
      if (badge) badge.textContent = "0";
    } catch (err) {
      console.error("Logout error:", err);
    }
  });

  // Forgot Password form
  document.getElementById("forgot-password-form")?.addEventListener("submit", async (e) => {
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

  // Verify Code form
  document.getElementById("verify-code-form")?.addEventListener("submit", async (e) => {
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
        if (authState.user) authState.user.emailVerified = true;
        updateAuthUI();
      } else {
        showToast(data.error || "Verification failed", "error");
      }
    } catch (err) {
      console.error("Verification error:", err);
      showToast("Connection error. Please try again.", "error");
    }
  });

  // Resend logic
  const handleResend = async (e) => {
    if (e) e.preventDefault();
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "New verification code sent!", "success");
      } else {
        showToast(data.error || "Failed to resend code", "error");
      }
    } catch (err) {
      showToast("Connection error", "error");
    }
  };

  document.getElementById("resend-code-btn")?.addEventListener("click", handleResend);
  document.getElementById("resend-verification-btn")?.addEventListener("click", handleResend);
  document.getElementById("open-verify-btn")?.addEventListener("click", () => {
    verifyModal.classList.add("active");
  });

  // Initial Load - only if authenticated
  if (!authState.authenticated) {
    // Show message to log in
    cartItemsDiv.innerHTML = "<p style='text-align: center; color: var(--gray-text);'>Please log in to start ordering</p>";
  }
});
