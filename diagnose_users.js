const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.db');

async function diagnose() {
    if (!fs.existsSync(DB_PATH)) {
        console.log('Database file not found.');
        return;
    }

    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(DB_PATH);
    const db = new SQL.Database(buffer);

    console.log('--- USERS TABLE ---');
    const users = db.exec('SELECT id, email, first_name, last_name, email_verified, verification_token, reset_token FROM users');
    if (users.length > 0) {
        console.table(users[0].values.map(v => {
            const row = {};
            users[0].columns.forEach((col, i) => row[col] = v[i]);
            return row;
        }));
    } else {
        console.log('No users found.');
    }
}

diagnose();
