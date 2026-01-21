# Braai Spot Ordering System

A self-service food ordering website with cart functionality and PayFast payment integration.

## Setup

1. Install Node.js from https://nodejs.org/

2. Install dependencies:
   ```
   npm install
   ```

3. Start the server:
   ```
   npm start
   ```

4. Open http://localhost:3000 in your browser.

## Features

- Menu display with add/remove quantity controls
- Shopping cart with total calculation
- Checkout with PayFast integration for Capitec EFT payments
- Order tracking in SQLite database

## PayFast Setup

For production, sign up at payfast.io and replace the placeholder credentials in server.js:
- merchant_id
- merchant_key
- passphrase

Set payment_method to 'cp' for Capitec EFT.

## Database

Orders are stored in orders.db (SQLite). Menu items are pre-populated.

## Testing

Use PayFast sandbox for testing payments: https://sandbox.payfast.co.za/