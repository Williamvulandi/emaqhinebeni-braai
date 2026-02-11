const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// 1. Manually parse .env
const ENV_PATH = path.join(__dirname, '.env');
console.log('--- Checking .env file at:', ENV_PATH);

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
    console.log('✅ .env file found and loaded.');
} else {
    console.log('❌ .env file NOT found. Please create one.');
}

const user = process.env.EMAIL_USER;
const pass = process.env.EMAIL_PASS;

console.log('--- Testing Credentials ---');
console.log('Email User:', user || '(not set)');
console.log('Email Pass:', pass ? (pass.length + ' characters long') : '(not set)');

if (!user || user.includes('your-email')) {
    console.log('❌ ERROR: You have not set your EMAIL_USER in .env');
    process.exit(1);
}
if (!pass || pass.includes('your-app-password')) {
    console.log('❌ ERROR: You have not set your EMAIL_PASS in .env. Remember to use a 16-letter App Password!');
    process.exit(1);
}

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
});

console.log('--- Attempting to send Test Email to', user, '---');

transporter.sendMail({
    from: `"Braai Spot Test" <${user}>`,
    to: user,
    subject: 'Test Email - Braai Spot Setup',
    text: 'If you are reading this, your email configuration is working perfectly!',
    html: '<b>If you are reading this, your email configuration is working perfectly!</b>'
}, (err, info) => {
    if (err) {
        console.log('❌ FAILED: Your credentials are still wrong.');
        console.error('Error Details:', err.message);
        if (err.message.includes('BadCredentials')) {
            console.log('\n💡 HELPFUL TIP: You must use a 16-letter "App Password" from Google.');
            console.log('Go here: https://myaccount.google.com/apppasswords');
        }
    } else {
        console.log('✅ SUCCESS! Email sent successfully. You should see it in your inbox shortly.');
        console.log('Message ID:', info.messageId);
    }
});
