const express = require("express");
const https = require("https");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static("."));

// PAYSTACK CONFIGURATION
// REPLACE 'sk_test_...' WITH YOUR ACTUAL PAYSTACK SECRET KEY
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "sk_test_replace_this_with_your_actual_key";

app.post("/api/checkout", (req, res) => {
  const { email, amount } = req.body;

  if (!email || !amount) {
    return res.status(400).json({ error: "Email and amount are required" });
  }

  // Paystack expects amount in kobo (cent equivalent), so multiply Rand by 100
  const amountInKobo = Math.round(parseFloat(amount) * 100);

  const params = JSON.stringify({
    email: email,
    amount: amountInKobo,
    callback_url: `http://localhost:${port}/success`, // Redirect here after payment
    metadata: {
      cancel_action: `http://localhost:${port}/cancel`
    }
  });

  const options = {
    hostname: 'api.paystack.co',
    port: 443,
    path: '/transaction/initialize',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json'
    }
  };

  const request = https.request(options, apiRes => {
    let data = '';

    apiRes.on('data', (chunk) => {
      data += chunk;
    });

    apiRes.on('end', () => {
      try {
        const parsedData = JSON.parse(data);
        if (parsedData.status) {
          res.json({ authorization_url: parsedData.data.authorization_url });
        } else {
          res.status(400).json({ error: parsedData.message || "Payment initialization failed" });
        }
      } catch (e) {
        res.status(500).json({ error: "Failed to parse Paystack response" });
      }
    });
  });

  request.on('error', error => {
    console.error(error);
    res.status(500).json({ error: "Connection to Paystack failed" });
  });

  request.write(params);
  request.end();
});

app.get("/success", (req, res) => {
  // You would typically verify the transaction here using the reference in the query params
  res.send(`
    <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: green;">Payment Successful!</h1>
        <p>Thank you for your order.</p>
        <a href="/" style="display: inline-block; background: #EF3125; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Back to Menu</a>
    </div>
  `);
});

app.get("/cancel", (req, res) => {
  res.send(`
    <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: red;">Payment Cancelled</h1>
        <a href="/" style="display: inline-block; background: #333; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Back to Menu</a>
    </div>
  `);
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`IMPORTANT: Ensure you have set a valid PAYSTACK_SECRET_KEY in the code or environment variables.`);
});
