# Khanya Kitchen

A self-service food ordering website with user authentication, cart functionality, Paystack payment integration, and admin dashboard.

## Features

- 🍖 **Dynamic Menu** — menu items stored in database, manageable via admin panel
- 🛒 **Shopping Cart** — add/remove items with real-time total calculation
- 💳 **Paystack Payments** — secure checkout with callback verification and webhooks
- 👤 **User Authentication** — signup, login, email verification (6-digit code), password reset
- 📧 **Email Notifications** — verification, password reset, order confirmation, business alerts
- 📦 **Order Tracking** — users can view their order history and status
- ⚙️ **Admin Dashboard** — manage orders (update status), edit menu items, view revenue stats
- 🔒 **Security** — Helmet CSP, rate limiting, bcrypt hashing, input sanitization, secure sessions

## Setup

### 1. Install Node.js
Download from https://nodejs.org/ (v20+ recommended)

### 2. Install Dependencies
```
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the project root:
```env
# Gmail (use App Password: https://myaccount.google.com/apppasswords)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Paystack (https://dashboard.paystack.com/)
PAYSTACK_SECRET_KEY=sk_test_xxxxx

# App Settings
SESSION_SECRET=your-random-secret-string
APP_URL=http://localhost:3000
ADMIN_EMAIL=your-admin-email@gmail.com
```

### 4. Start the Server
```
npm start
```

### 5. Open in Browser
Go to http://localhost:3000

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Current user info |
| POST | `/api/auth/verify-code` | Verify email with 6-digit code |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password with token |
| POST | `/api/auth/resend-verification` | Resend verification email |

### Menu & Cart
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/menu` | Get all available menu items |
| GET | `/api/cart` | Get current cart |
| POST | `/api/cart/add` | Add item to cart |
| POST | `/api/cart/remove` | Remove item from cart |
| POST | `/api/cart/clear` | Clear entire cart |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | User's order history |
| GET | `/api/orders/:id` | Order detail |

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/paystack/initialize` | Start Paystack payment |
| GET | `/paystack/callback` | Paystack redirect callback |
| POST | `/api/paystack/webhook` | Paystack server webhook |

### Admin (requires admin email match)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/orders` | All orders |
| PATCH | `/api/admin/orders/:id/status` | Update order status |
| GET | `/api/admin/menu` | All menu items |
| PUT | `/api/admin/menu/:id` | Update menu item |
| POST | `/api/admin/menu` | Add menu item |
| DELETE | `/api/admin/menu/:id` | Delete menu item |
| GET | `/api/admin/stats` | Revenue and order stats |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/healthz` | Health check |

## Deployment (Render)

1. Push to GitHub
2. Connect repo in Render dashboard
3. Set environment variables in Render:
   - `PAYSTACK_SECRET_KEY` (live key for production)
   - `EMAIL_USER` and `EMAIL_PASS`
   - `SESSION_SECRET` (auto-generated in render.yaml)
   - `APP_URL` (your Render URL)
   - `ADMIN_EMAIL`
4. Deploy — `render.yaml` handles the rest

## Testing

```
npm test
```

Runs unit tests with Vitest for authentication, cart, and order operations.

## Project Structure

```
├── server.js          # Express server, routes, middleware
├── database.js        # SQLite database (sql.js), all CRUD operations
├── email.js           # Nodemailer email service
├── public/            # Static files (served to browser)
│   ├── index.html     # Main app page
│   ├── style.css      # Styles
│   ├── script.js      # Frontend logic
│   ├── admin.html     # Admin dashboard
│   ├── manifest.json  # PWA manifest
│   └── images/        # Menu item images
├── tests/             # Unit tests
├── .env               # Environment variables (not in git)
├── render.yaml        # Render deployment config
└── package.json
```