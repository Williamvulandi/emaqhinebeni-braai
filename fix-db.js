const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function fix() {
    const SQL = await initSqlJs();
    const dbPath = path.join(__dirname, 'database.db');

    if (!fs.existsSync(dbPath)) {
        console.error('Database file not found!');
        return;
    }

    const buf = fs.readFileSync(dbPath);
    const db = new SQL.Database(buf);

    console.log('Checking for typos...');
    const check = db.exec("SELECT email FROM users WHERE email LIKE '%igmail%'");
    if (check.length > 0) {
        console.log('Found typo entries:', check[0].values);
        db.run("DELETE FROM users WHERE email LIKE '%igmail%'");
        const data = db.export();
        fs.writeFileSync(dbPath, Buffer.from(data));
        console.log('✅ Successfully deleted @igmail.com entries');
    } else {
        console.log('No typo entries found.');
    }
}

fix().catch(err => console.error(err));
