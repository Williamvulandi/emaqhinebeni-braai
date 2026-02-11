const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Basic .env parser since we can't install dotenv
const ENV_PATH = path.join(__dirname, '.env');
if (fs.existsSync(ENV_PATH)) {
  const envConfig = fs.readFileSync(ENV_PATH, 'utf8');
  envConfig.split(/\r?\n/).forEach(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) return;
    const [key, ...valueParts] = trimmedLine.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const EMAIL_CONFIG = {
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-app-password'
  }
};

// Create reusable transporter
let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport(EMAIL_CONFIG);
  }
  return transporter;
}

/**
 * Send verification email
 * @param {string} email - Recipient email
 * @param {string} firstName - User's first name
 * @param {string} verificationToken - Unique verification token
 */
async function sendVerificationEmail(email, firstName, verificationToken) {
  // Verification link always points to localhost:3000
  const verificationUrl = `http://localhost:3000/verify-email?token=${verificationToken}`;

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
          .button:hover { background: #D42719; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🍖 Emaqhinebeni</h1>
          </div>
          <div class="content">
            <h2>Hi ${firstName}!</h2>
            <p>Thank you for signing up at Emaqhinebeni! To complete your registration, please enter this verification code or click the button below:</p>
            
            <div class="code-box">${verificationToken}</div>

            <p style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </p>
            
            <p style="color: #666; font-size: 14px;">If you didn't create an account, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>© 2026 Emaqhinebeni. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const transporter = getTransporter();
    console.log(`📤 Sending verification email...`);
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Verification email sent to', email);
    return true;
  } catch (error) {
    console.error('❌ Error sending verification email:', error.message);
    // Don't throw error - allow signup to proceed even if email fails
    return false;
  }
}

/**
 * Send password reset email
 * @param {string} email - Recipient email
 * @param {string} firstName - User's first name
 * @param {string} resetToken - Unique reset token
 */
async function sendPasswordResetEmail(email, firstName, resetToken) {
  const resetUrl = `http://localhost:3000/reset-password?token=${resetToken}`;

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
          .button:hover { background: #D42719; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🍖 Emaqhinebeni</h1>
          </div>
          <div class="content">
            <h2>Hi ${firstName}!</h2>
            <p>You requested a password reset for your Emaqhinebeni account.</p>
            <p>Please enter the code below on the website or click the button. This code will expire in 1 hour.</p>
            
            <div class="code-box">${resetToken}</div>

            <p style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            
            <p style="margin-top: 30px; color: #666; font-size: 13px;">If you didn't request a password reset, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>© 2026 Emaqhinebeni. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const transporter = getTransporter();
    console.log(`📤 Sending password reset email...`);
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Password reset email sent to', email);
    return true;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error.message);
    return false;
  }
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};
