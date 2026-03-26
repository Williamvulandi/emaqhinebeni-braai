const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'database.db');
let db = null;

// ==================== Initialize ====================
async function initDatabase() {
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
        console.log('✅ Database loaded from file');

        // Migrations — add columns if missing
        const migrations = [
            'ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0',
            'ALTER TABLE users ADD COLUMN verification_token TEXT',
            'ALTER TABLE users ADD COLUMN reset_token TEXT',
            'ALTER TABLE users ADD COLUMN reset_expires DATETIME'
        ];
        migrations.forEach(sql => { try { db.run(sql); } catch (e) { /* already exists */ } });

        // Create orders table if it doesn't exist
        db.run(`
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                reference TEXT UNIQUE NOT NULL,
                items TEXT NOT NULL,
                total REAL NOT NULL,
                status TEXT DEFAULT 'received',
                customer_email TEXT,
                customer_first_name TEXT,
                customer_last_name TEXT,
                customer_phone TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Create menu_items table if it doesn't exist
        db.run(`
            CREATE TABLE IF NOT EXISTS menu_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                description TEXT,
                image TEXT,
                category TEXT DEFAULT 'main',
                available INTEGER DEFAULT 1,
                sort_order INTEGER DEFAULT 0
            )
        `);

        // Seed menu if empty
        seedMenuIfEmpty();
        saveDatabase();
    } else {
        db = new SQL.Database();
        console.log('✅ New database created');

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

        db.run(`
            CREATE TABLE orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                reference TEXT UNIQUE NOT NULL,
                items TEXT NOT NULL,
                total REAL NOT NULL,
                status TEXT DEFAULT 'received',
                customer_email TEXT,
                customer_first_name TEXT,
                customer_last_name TEXT,
                customer_phone TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        db.run(`
            CREATE TABLE menu_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                description TEXT,
                image TEXT,
                category TEXT DEFAULT 'main',
                available INTEGER DEFAULT 1,
                sort_order INTEGER DEFAULT 0
            )
        `);

        seedMenuIfEmpty();
        console.log('✅ Tables created');
        saveDatabase();
    }

    return db;
}

// ==================== Seed Menu ====================
function seedMenuIfEmpty() {
    if (!db) return;
    const result = db.exec('SELECT COUNT(*) FROM menu_items');
    const count = result[0]?.values[0]?.[0] || 0;
    if (count > 0) return;

    const items = [
        { id: 1, name: 'Pork Braai Piece', price: 5, description: 'Succulent, flame-grilled pork seasoned to perfection.', image: 'images/pork_braai_piece.jpeg', category: 'single', sort_order: 1 },
        { id: 2, name: 'Chicken Feet', price: 1, description: 'Traditional "Maotwana" cooked in a savory spicy sauce.', image: 'images/chicken_feet.png', category: 'single', sort_order: 9 },
        { id: 3, name: 'Kebabs', price: 10, description: 'Rich liver mixed with fat, grilled on a stick.', image: 'images/clean_grilled_food.png', category: 'single', sort_order: 3 },
        { id: 4, name: 'Pap + Kebabs + Chakalaka', price: 40, description: 'Traditional pap served with grilled liver kebabs and spicy chakalaka.', image: 'images/pap_kebabs_chakalaka.jpg', category: 'combo', sort_order: 4 },
        { id: 5, name: 'Chicken Wings', price: 8, description: 'Crispy, flavorful chicken wings grilled to perfection.', image: 'images/clean_braai_chicken_wings.png', category: 'single', sort_order: 5 },
        { id: 6, name: 'Sausage Pieces', price: 6, description: 'Juicy sausage pieces seasoned and grilled.', image: 'images/clean_braai_sausage.png', category: 'single', sort_order: 6 },
        { id: 7, name: 'Pap + Pork + Chakalaka', price: 35, description: 'Traditional pap served with pork and spicy chakalaka.', image: 'images/clean_food_plate.png', category: 'combo', sort_order: 7 },
        { id: 8, name: 'Pap + Wings + Chakalaka', price: 40, description: 'Crispy wings served with pap and chakalaka.', image: 'images/clean_food_plate_wings.png', category: 'combo', sort_order: 8 },
        { id: 9, name: 'Pap + Sausage + Chakalaka', price: 30, description: 'Juicy sausage served with pap and chakalaka.', image: 'images/pap_wors_chak_new.jpg', category: 'combo', sort_order: 2 },
        { id: 10, name: 'Big Pork Piece', price: 10, description: 'Generous cut of flame-grilled pork.', image: 'images/big_pork_piece.jpg', category: 'single', sort_order: 1.5 }
    ];

    items.forEach(item => {
        db.run(
            'INSERT INTO menu_items (id, name, price, description, image, category, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [item.id, item.name, item.price, item.description, item.image, item.category, item.sort_order]
        );
    });
    console.log('✅ Menu items seeded');
}

// ==================== Helpers ====================
function saveDatabase() {
    if (!db) return;
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ==================== User Operations ====================
async function createUser(email, password, firstName, lastName) {
    if (!db) throw new Error('Database not initialized');

    email = email.toLowerCase().trim();
    if (!email.includes('@')) throw new Error('Invalid email format');

    const existing = db.exec('SELECT id, email_verified FROM users WHERE email = ?', [email]);

    if (existing.length > 0 && existing[0].values.length > 0) {
        const row = existing[0].values[0];
        const userId = row[0];
        const isVerified = row[1] === 1;

        if (isVerified) {
            throw new Error('Email already registered');
        } else {
            const newToken = Math.floor(100000 + Math.random() * 900000).toString();
            const passwordHash = await bcrypt.hash(password, 10);
            db.run('UPDATE users SET verification_token = ?, password_hash = ?, first_name = ?, last_name = ? WHERE id = ?', [newToken, passwordHash, firstName, lastName, userId]);
            saveDatabase();
            return { id: userId, email, firstName, lastName, verificationToken: newToken, isExisting: true };
        }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();

    db.run(
        'INSERT INTO users (email, password_hash, first_name, last_name, email_verified, verification_token) VALUES (?, ?, ?, ?, 0, ?)',
        [email, passwordHash, firstName, lastName, verificationToken]
    );
    saveDatabase();

    const result = db.exec('SELECT last_insert_rowid() as id');
    const userId = result[0].values[0][0];

    return { id: userId, email, firstName, lastName, verificationToken, isExisting: false };
}

async function authenticateUser(email, password) {
    if (!db) throw new Error('Database not initialized');
    email = email.toLowerCase().trim();

    const result = db.exec(
        'SELECT id, email, password_hash, first_name, last_name, email_verified FROM users WHERE email = ?',
        [email]
    );

    if (result.length === 0 || result[0].values.length === 0) throw new Error('Invalid credentials');

    const row = result[0].values[0];
    const user = { id: row[0], email: row[1], passwordHash: row[2], firstName: row[3], lastName: row[4], emailVerified: row[5] };

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new Error('Invalid credentials');

    return { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, emailVerified: user.emailVerified === 1 };
}

function getUserByEmail(email) {
    if (!db) throw new Error('Database not initialized');
    email = email.toLowerCase().trim();
    const result = db.exec(
        'SELECT id, email, first_name, last_name, email_verified, verification_token, reset_token FROM users WHERE email = ?',
        [email]
    );
    if (result.length === 0 || result[0].values.length === 0) return null;
    const row = result[0].values[0];
    return { id: row[0], email: row[1], firstName: row[2], lastName: row[3], emailVerified: row[4] === 1, verificationToken: row[5], resetToken: row[6] };
}

function getUserById(userId) {
    if (!db) throw new Error('Database not initialized');
    const result = db.exec(
        'SELECT id, email, first_name, last_name, email_verified, verification_token, reset_token FROM users WHERE id = ?',
        [userId]
    );
    if (result.length === 0 || result[0].values.length === 0) return null;
    const row = result[0].values[0];
    return { id: row[0], email: row[1], firstName: row[2], lastName: row[3], emailVerified: row[4] === 1, verificationToken: row[5], resetToken: row[6] };
}

// ==================== Cart Operations ====================
function getUserCart(userId) {
    if (!db) throw new Error('Database not initialized');
    const result = db.exec('SELECT item_id, quantity FROM carts WHERE user_id = ? AND quantity > 0', [userId]);
    const cart = {};
    if (result.length > 0) {
        result[0].values.forEach(row => { cart[row[0]] = row[1]; });
    }
    return cart;
}

function updateCartItem(userId, itemId, quantity) {
    if (!db) throw new Error('Database not initialized');
    if (quantity <= 0) {
        db.run('DELETE FROM carts WHERE user_id = ? AND item_id = ?', [userId, itemId]);
    } else {
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

// ==================== Email Verification ====================
function verifyEmail(token) {
    if (!db) throw new Error('Database not initialized');
    const result = db.exec('SELECT id FROM users WHERE verification_token = ?', [token]);
    if (result.length === 0 || result[0].values.length === 0) throw new Error('Invalid verification code');
    const userId = result[0].values[0][0];
    db.run('UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?', [userId]);
    saveDatabase();
    return userId;
}

function resendVerificationToken(userId) {
    if (!db) throw new Error('Database not initialized');
    const newToken = Math.floor(100000 + Math.random() * 900000).toString();
    db.run('UPDATE users SET verification_token = ? WHERE id = ?', [newToken, userId]);
    saveDatabase();
    return newToken;
}

// ==================== Password Reset ====================
function createResetToken(email) {
    if (!db) throw new Error('Database not initialized');
    email = email.toLowerCase().trim();
    const result = db.exec('SELECT id FROM users WHERE email = ?', [email]);
    if (result.length === 0 || result[0].values.length === 0) return null;

    const userId = result[0].values[0][0];
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 3600000).toISOString();
    db.run('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?', [token, expires, userId]);
    saveDatabase();
    return token;
}

async function resetPassword(token, newPassword) {
    if (!db) throw new Error('Database not initialized');
    const now = new Date().toISOString();
    const result = db.exec('SELECT id FROM users WHERE reset_token = ? AND reset_expires > ?', [token, now]);
    if (result.length === 0 || result[0].values.length === 0) throw new Error('Invalid or expired reset code');

    const userId = result[0].values[0][0];
    const passwordHash = await bcrypt.hash(newPassword, 10);
    db.run('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [passwordHash, userId]);
    saveDatabase();
    return userId;
}

// ==================== Menu Operations ====================
function getMenuItems() {
    if (!db) throw new Error('Database not initialized');
    const result = db.exec('SELECT id, name, price, description, image, category, available, sort_order FROM menu_items ORDER BY sort_order ASC');
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
        id: row[0], name: row[1], price: row[2], description: row[3],
        image: row[4], category: row[5], available: row[6] === 1, sortOrder: row[7]
    }));
}

function getMenuItem(id) {
    if (!db) throw new Error('Database not initialized');
    const result = db.exec('SELECT id, name, price, description, image, category, available, sort_order FROM menu_items WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const row = result[0].values[0];
    return { id: row[0], name: row[1], price: row[2], description: row[3], image: row[4], category: row[5], available: row[6] === 1, sortOrder: row[7] };
}

function updateMenuItem(id, data) {
    if (!db) throw new Error('Database not initialized');
    const fields = [];
    const values = [];
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.price !== undefined) { fields.push('price = ?'); values.push(data.price); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.image !== undefined) { fields.push('image = ?'); values.push(data.image); }
    if (data.category !== undefined) { fields.push('category = ?'); values.push(data.category); }
    if (data.available !== undefined) { fields.push('available = ?'); values.push(data.available ? 1 : 0); }
    if (data.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(data.sortOrder); }
    if (fields.length === 0) return;
    values.push(id);
    db.run(`UPDATE menu_items SET ${fields.join(', ')} WHERE id = ?`, values);
    saveDatabase();
}

function addMenuItem(data) {
    if (!db) throw new Error('Database not initialized');
    db.run(
        'INSERT INTO menu_items (name, price, description, image, category, available, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [data.name, data.price, data.description || '', data.image || '', data.category || 'main', data.available !== false ? 1 : 0, data.sortOrder || 0]
    );
    saveDatabase();
    const result = db.exec('SELECT MAX(id) FROM menu_items');
    return result[0].values[0][0];
}

function deleteMenuItem(id) {
    if (!db) throw new Error('Database not initialized');
    db.run('DELETE FROM menu_items WHERE id = ?', [id]);
    saveDatabase();
}

// ==================== Order Operations ====================
function createOrder(userId, reference, items, total, customer) {
    if (!db) throw new Error('Database not initialized');
    db.run(
        `INSERT INTO orders (user_id, reference, items, total, status, customer_email, customer_first_name, customer_last_name, customer_phone)
         VALUES (?, ?, ?, ?, 'received', ?, ?, ?, ?)`,
        [userId, reference, JSON.stringify(items), total, customer.email || '', customer.firstName || '', customer.lastName || '', customer.phone || '']
    );
    saveDatabase();
    const result = db.exec('SELECT MAX(id) FROM orders');
    return result[0].values[0][0];
}

function getOrdersByUser(userId) {
    if (!db) throw new Error('Database not initialized');
    const result = db.exec(
        'SELECT id, reference, items, total, status, customer_email, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
    );
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
        id: row[0], reference: row[1], items: JSON.parse(row[2]), total: row[3],
        status: row[4], customerEmail: row[5], createdAt: row[6]
    }));
}

function getOrderById(orderId) {
    if (!db) throw new Error('Database not initialized');
    const result = db.exec(
        'SELECT id, user_id, reference, items, total, status, customer_email, customer_first_name, customer_last_name, customer_phone, created_at FROM orders WHERE id = ?',
        [orderId]
    );
    if (result.length === 0 || result[0].values.length === 0) return null;
    const row = result[0].values[0];
    return {
        id: row[0], userId: row[1], reference: row[2], items: JSON.parse(row[3]), total: row[4],
        status: row[5], customerEmail: row[6], customerFirstName: row[7], customerLastName: row[8],
        customerPhone: row[9], createdAt: row[10]
    };
}

function getOrderByReference(reference) {
    if (!db) throw new Error('Database not initialized');
    const result = db.exec('SELECT id, user_id, reference, items, total, status, customer_email, customer_first_name, customer_last_name, customer_phone, created_at FROM orders WHERE reference = ?', [reference]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const row = result[0].values[0];
    return {
        id: row[0], userId: row[1], reference: row[2], items: JSON.parse(row[3]), total: row[4],
        status: row[5], customerEmail: row[6], customerFirstName: row[7], customerLastName: row[8],
        customerPhone: row[9], createdAt: row[10]
    };
}

function getAllOrders() {
    if (!db) throw new Error('Database not initialized');
    const result = db.exec(
        'SELECT id, user_id, reference, items, total, status, customer_email, customer_first_name, customer_last_name, customer_phone, created_at FROM orders ORDER BY created_at DESC'
    );
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
        id: row[0], userId: row[1], reference: row[2], items: JSON.parse(row[3]), total: row[4],
        status: row[5], customerEmail: row[6], customerFirstName: row[7], customerLastName: row[8],
        customerPhone: row[9], createdAt: row[10]
    }));
}

function updateOrderStatus(orderId, status) {
    if (!db) throw new Error('Database not initialized');
    const validStatuses = ['received', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) throw new Error('Invalid status');
    db.run('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
    saveDatabase();
}

module.exports = {
    initDatabase, saveDatabase,
    createUser, authenticateUser, getUserById, getUserByEmail,
    getUserCart, updateCartItem, clearUserCart,
    verifyEmail, resendVerificationToken, createResetToken, resetPassword,
    getMenuItems, getMenuItem, updateMenuItem, addMenuItem, deleteMenuItem,
    createOrder, getOrdersByUser, getOrderById, getOrderByReference, getAllOrders, updateOrderStatus
};
