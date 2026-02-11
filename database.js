const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'database.db');
let db = null;

// Initialize database
async function initDatabase() {
    const SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
        console.log('✅ Database loaded from file');

        // Migration: Add email verification and password reset columns if they don't exist
        try {
            db.run('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0');
            db.run('ALTER TABLE users ADD COLUMN verification_token TEXT');
        } catch (e) { }
        try {
            db.run('ALTER TABLE users ADD COLUMN reset_token TEXT');
            db.run('ALTER TABLE users ADD COLUMN reset_expires DATETIME');
            console.log('✅ Added password reset columns');
            saveDatabase();
        } catch (e) {
            // Columns already exist, ignore
        }
    } else {
        db = new SQL.Database();
        console.log('✅ New database created');

        // Create tables
        db.run(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email_verified INTEGER DEFAULT 0,
        verification_token TEXT,
        reset_token TEXT,
        reset_expires DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

        db.run(`
      CREATE TABLE carts (
        user_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, item_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

        console.log('✅ Tables created');
        saveDatabase();
    }

    return db;
}

// Save database to disk
function saveDatabase() {
    if (!db) return;
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// User operations
async function createUser(email, password, firstName, lastName) {
    if (!db) throw new Error('Database not initialized');

    // Validate email
    email = email.toLowerCase().trim();
    if (!email.includes('@')) {
        throw new Error('Invalid email format');
    }

    // Check if user exists
    const existing = db.exec('SELECT id, email_verified FROM users WHERE email = ?', [email]);

    if (existing.length > 0 && existing[0].values.length > 0) {
        const row = existing[0].values[0];
        const userId = row[0];
        const isVerified = row[1] === 1;

        if (isVerified) {
            throw new Error('Email already registered');
        } else {
            // User exists but is NOT verified. Update their token, name, AND password.
            // This is "user friendly" as requested.
            const newToken = Math.floor(100000 + Math.random() * 900000).toString();
            const passwordHash = await bcrypt.hash(password, 10);
            db.run('UPDATE users SET verification_token = ?, password_hash = ?, first_name = ?, last_name = ? WHERE id = ?', [newToken, passwordHash, firstName, lastName, userId]);
            saveDatabase();

            return {
                id: userId,
                email,
                firstName,
                lastName,
                verificationToken: newToken,
                isExisting: true
            };
        }
    }

    // New user path
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate 6-digit verification code
    const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();

    // Insert user
    db.run(
        'INSERT INTO users (email, password_hash, first_name, last_name, email_verified, verification_token) VALUES (?, ?, ?, ?, 0, ?)',
        [email, passwordHash, firstName, lastName, verificationToken]
    );

    saveDatabase();

    // Get the user ID
    const result = db.exec('SELECT last_insert_rowid() as id');
    const userId = result[0].values[0][0];

    return {
        id: userId,
        email,
        firstName,
        lastName,
        verificationToken,
        isExisting: false
    };
}

async function authenticateUser(email, password) {
    if (!db) throw new Error('Database not initialized');

    email = email.toLowerCase().trim();

    const result = db.exec(
        'SELECT id, email, password_hash, first_name, last_name, email_verified FROM users WHERE email = ?',
        [email]
    );

    if (result.length === 0 || result[0].values.length === 0) {
        throw new Error('Invalid credentials');
    }

    const row = result[0].values[0];
    const user = {
        id: row[0],
        email: row[1],
        passwordHash: row[2],
        firstName: row[3],
        lastName: row[4],
        emailVerified: row[5]
    };

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
        throw new Error('Invalid credentials');
    }

    return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified === 1
    };
}

function getUserByEmail(email) {
    if (!db) throw new Error('Database not initialized');

    email = email.toLowerCase().trim();
    const result = db.exec(
        'SELECT id, email, first_name, last_name, email_verified, verification_token, reset_token FROM users WHERE email = ?',
        [email]
    );

    if (result.length === 0 || result[0].values.length === 0) {
        return null;
    }

    const row = result[0].values[0];
    return {
        id: row[0],
        email: row[1],
        firstName: row[2],
        lastName: row[3],
        emailVerified: row[4] === 1,
        verificationToken: row[5],
        resetToken: row[6]
    };
}

function getUserById(userId) {
    if (!db) throw new Error('Database not initialized');

    const result = db.exec(
        'SELECT id, email, first_name, last_name, email_verified, verification_token, reset_token FROM users WHERE id = ?',
        [userId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
        return null;
    }

    const row = result[0].values[0];
    return {
        id: row[0],
        email: row[1],
        firstName: row[2],
        lastName: row[3],
        emailVerified: row[4] === 1,
        verificationToken: row[5],
        resetToken: row[6]
    };
}

// Cart operations
function getUserCart(userId) {
    if (!db) throw new Error('Database not initialized');

    const result = db.exec(
        'SELECT item_id, quantity FROM carts WHERE user_id = ? AND quantity > 0',
        [userId]
    );

    const cart = {};
    if (result.length > 0) {
        result[0].values.forEach(row => {
            cart[row[0]] = row[1];
        });
    }

    return cart;
}

function updateCartItem(userId, itemId, quantity) {
    if (!db) throw new Error('Database not initialized');

    if (quantity <= 0) {
        // Remove item
        db.run('DELETE FROM carts WHERE user_id = ? AND item_id = ?', [userId, itemId]);
    } else {
        // Insert or update
        db.run(
            `INSERT INTO carts (user_id, item_id, quantity) VALUES (?, ?, ?)
       ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = ?`,
            [userId, itemId, quantity, quantity]
        );
    }

    saveDatabase();
}

function clearUserCart(userId) {
    if (!db) throw new Error('Database not initialized');
    db.run('DELETE FROM carts WHERE user_id = ?', [userId]);
    saveDatabase();
}

// Email verification functions
function verifyEmail(token) {
    if (!db) throw new Error('Database not initialized');

    const result = db.exec(
        'SELECT id FROM users WHERE verification_token = ?',
        [token]
    );

    if (result.length === 0 || result[0].values.length === 0) {
        throw new Error('Invalid verification code');
    }

    const userId = result[0].values[0][0];

    // Update user as verified
    db.run(
        'UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?',
        [userId]
    );

    saveDatabase();
    return userId;
}

function resendVerificationToken(userId) {
    if (!db) throw new Error('Database not initialized');

    const newToken = Math.floor(100000 + Math.random() * 900000).toString();

    db.run(
        'UPDATE users SET verification_token = ? WHERE id = ?',
        [newToken, userId]
    );

    saveDatabase();
    return newToken;
}

// Password reset functions
function createResetToken(email) {
    if (!db) throw new Error('Database not initialized');

    email = email.toLowerCase().trim();
    const result = db.exec('SELECT id FROM users WHERE email = ?', [email]);

    if (result.length === 0 || result[0].values.length === 0) {
        return null;
    }

    const userId = result[0].values[0][0];

    // Generate a 6-digit numeric code
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 3600000).toISOString(); // 1 hour expiration

    db.run(
        'UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?',
        [token, expires, userId]
    );

    saveDatabase();
    return token;
}

async function resetPassword(token, newPassword) {
    if (!db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const result = db.exec(
        'SELECT id FROM users WHERE reset_token = ? AND reset_expires > ?',
        [token, now]
    );

    if (result.length === 0 || result[0].values.length === 0) {
        throw new Error('Invalid or expired reset code');
    }

    const userId = result[0].values[0][0];
    const passwordHash = await bcrypt.hash(newPassword, 10);

    db.run(
        'UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?',
        [passwordHash, userId]
    );

    saveDatabase();
    return userId;
}

module.exports = {
    initDatabase,
    saveDatabase,
    createUser,
    authenticateUser,
    getUserById,
    getUserByEmail,
    getUserCart,
    updateCartItem,
    clearUserCart,
    verifyEmail,
    resendVerificationToken,
    createResetToken,
    resetPassword
};
