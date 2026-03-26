const nodemailer = require('nodemailer');

const EMAIL_CONFIG = {
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || ''
  }
};

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport(EMAIL_CONFIG);
  }
  return transporter;
}

function getAppUrl() {
  return process.env.APP_URL || 'http://localhost:3000';
}

// ==================== Verification Email ====================
async function sendVerificationEmail(email, firstName, verificationToken) {
  const appUrl = getAppUrl();
  const verificationUrl = `${appUrl}/verify-email?token=${verificationToken}`;

  const mailOptions = {
    from: `"Emaqhinebeni Braai" <${EMAIL_CONFIG.auth.user}>`,
    to: email,
    subject: 'Verify Your Email - Emaqhinebeni',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #0A1E2F; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #EF3125 0%, #FF6B6B 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: white; margin: 0; }
          .content { background: white; padding: 40px 30px; border: 1px solid #eee; }
          .code-box { background: #F8F9FA; border: 2px dashed #EF3125; padding: 20px; text-align: center; font-size: 32px; font-weight: 800; letter-spacing: 10px; color: #EF3125; margin: 20px 0; border-radius: 10px; }
          .button { display: inline-block; padding: 15px 40px; background: #EF3125; color: white; text-decoration: none; border-radius: 50px; margin: 20px 0; font-weight: 600; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>🍖 Emaqhinebeni</h1></div>
          <div class="content">
            <h2>Hi ${escapeHtml(firstName)}!</h2>
            <p>Thank you for signing up at Emaqhinebeni! Enter this verification code or click the button below:</p>
            <div class="code-box">${escapeHtml(verificationToken)}</div>
            <p style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </p>
            <p style="color: #666; font-size: 14px;">If you didn't create an account, please ignore this email.</p>
          </div>
          <div class="footer"><p>&copy; 2026 Emaqhinebeni. All rights reserved.</p></div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const t = getTransporter();
    await t.sendMail(mailOptions);
    console.log('✅ Verification email sent to', email);
    return true;
  } catch (error) {
    console.error('❌ Error sending verification email:', error.message);
    return false;
  }
}

// ==================== Password Reset Email ====================
async function sendPasswordResetEmail(email, firstName, resetToken) {
  const appUrl = getAppUrl();
  const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: `"Emaqhinebeni Braai" <${EMAIL_CONFIG.auth.user}>`,
    to: email,
    subject: 'Reset Your Password - Emaqhinebeni',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #0A1E2F; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #EF3125 0%, #FF6B6B 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: white; margin: 0; }
          .content { background: white; padding: 40px 30px; border: 1px solid #eee; }
          .code-box { background: #F8F9FA; border: 2px dashed #EF3125; padding: 20px; text-align: center; font-size: 32px; font-weight: 800; letter-spacing: 10px; color: #EF3125; margin: 20px 0; border-radius: 10px; }
          .button { display: inline-block; padding: 15px 40px; background: #EF3125; color: white; text-decoration: none; border-radius: 50px; margin: 20px 0; font-weight: 600; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>🍖 Emaqhinebeni</h1></div>
          <div class="content">
            <h2>Hi ${escapeHtml(firstName)}!</h2>
            <p>You requested a password reset. Enter the code below or click the button. This expires in 1 hour.</p>
            <div class="code-box">${escapeHtml(resetToken)}</div>
            <p style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <p style="margin-top: 30px; color: #666; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
          </div>
          <div class="footer"><p>&copy; 2026 Emaqhinebeni. All rights reserved.</p></div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const t = getTransporter();
    await t.sendMail(mailOptions);
    console.log('✅ Password reset email sent to', email);
    return true;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error.message);
    return false;
  }
}

// ==================== Order Confirmation Email ====================
async function sendOrderConfirmationEmail(email, firstName, order) {
  const itemsHtml = order.items.map(item =>
    `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(item.name)}</td>
     <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
     <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">R${(item.price * item.quantity).toFixed(2)}</td></tr>`
  ).join('');

  const mailOptions = {
    from: `"Emaqhinebeni Braai" <${EMAIL_CONFIG.auth.user}>`,
    to: email,
    subject: `Order Confirmed #${order.reference} - Emaqhinebeni`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #0A1E2F; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: white; margin: 0; }
          .content { background: white; padding: 40px 30px; border: 1px solid #eee; }
          .total { font-size: 1.5rem; font-weight: 800; color: #EF3125; text-align: right; margin-top: 10px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>✅ Order Confirmed!</h1></div>
          <div class="content">
            <h2>Hi ${escapeHtml(firstName)}!</h2>
            <p>Your order has been received and is being prepared.</p>
            <p><strong>Reference:</strong> ${escapeHtml(order.reference)}</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <thead>
                <tr style="background: #F8F9FA;">
                  <th style="padding: 10px; text-align: left;">Item</th>
                  <th style="padding: 10px; text-align: center;">Qty</th>
                  <th style="padding: 10px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>
            <div class="total">Total: R${order.total.toFixed(2)}</div>
          </div>
          <div class="footer"><p>&copy; 2026 Emaqhinebeni. All rights reserved.</p></div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const t = getTransporter();
    await t.sendMail(mailOptions);
    console.log('✅ Order confirmation email sent to', email);
    return true;
  } catch (error) {
    console.error('❌ Error sending order confirmation:', error.message);
    return false;
  }
}

// ==================== Order Notification (to business) ====================
async function sendOrderNotificationEmail(order) {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
  if (!adminEmail) return false;

  const itemsList = order.items.map(item =>
    `• ${item.name} x${item.quantity} = R${(item.price * item.quantity).toFixed(2)}`
  ).join('\n');

  const mailOptions = {
    from: `"Emaqhinebeni Orders" <${EMAIL_CONFIG.auth.user}>`,
    to: adminEmail,
    subject: `🔔 New Order #${order.reference} - R${order.total.toFixed(2)}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #EF3125;">🔔 New Order Received!</h1>
        <p><strong>Reference:</strong> ${escapeHtml(order.reference)}</p>
        <p><strong>Customer:</strong> ${escapeHtml(order.customerFirstName)} ${escapeHtml(order.customerLastName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(order.customerEmail)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(order.customerPhone || 'N/A')}</p>
        <hr>
        <pre style="font-size: 14px;">${escapeHtml(itemsList)}</pre>
        <h2 style="color: #EF3125;">Total: R${order.total.toFixed(2)}</h2>
        <p><a href="${getAppUrl()}/admin" style="padding: 12px 24px; background: #EF3125; color: white; text-decoration: none; border-radius: 50px;">View in Admin</a></p>
      </div>
    `
  };

  try {
    const t = getTransporter();
    await t.sendMail(mailOptions);
    console.log('✅ Order notification sent to admin');
    return true;
  } catch (error) {
    console.error('❌ Error sending order notification:', error.message);
    return false;
  }
}

// ==================== HTML Escape Helper ====================
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendOrderNotificationEmail
};
