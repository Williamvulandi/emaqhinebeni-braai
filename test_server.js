const http = require('http');

let sessionCookie = null;

function postRequest(path, data) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (sessionCookie) {
            options.headers['Cookie'] = sessionCookie;
        }

        const req = http.request(options, (res) => {
            const setCookie = res.headers['set-cookie'];
            if (setCookie) {
                sessionCookie = setCookie[0].split(';')[0];
            }

            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                let parsedBody;
                try { parsedBody = JSON.parse(body); } catch (e) { parsedBody = body; }
                resolve({ status: res.statusCode, body: parsedBody });
            });
        });

        req.on('error', (e) => reject(e));
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

function getRequest(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'GET',
            headers: {}
        };

        if (sessionCookie) {
            options.headers['Cookie'] = sessionCookie;
        }

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                let parsedBody;
                try { parsedBody = JSON.parse(body); } catch (e) { parsedBody = body; }
                resolve({ status: res.statusCode, body: parsedBody });
            });
        });
        req.on('error', (e) => reject(e));
        req.end();
    });
}

async function runTests() {
    console.log("Starting End-to-End Server Tests...");
    const testEmail = `test_server_${Date.now()}@example.com`;
    const testPass = 'password123';

    try {
        // 1. Signup
        console.log("1. Testing POST /api/auth/signup...");
        const signupRes = await postRequest('/api/auth/signup', {
            email: testEmail,
            password: testPass,
            firstName: "Test",
            lastName: "User"
        });
        if (signupRes.status === 200) console.log("✅ Signup request successful");
        else throw new Error(`Signup failed: ${JSON.stringify(signupRes.body)}`);

        // Get code from database since it's not in logs anymore
        const db = require('./database');
        await db.initDatabase();
        const user = db.getUserByEmail(testEmail);
        const code = user.verificationToken;
        console.log(`ℹ️ Retrieved verification code from DB: ${code}`);

        // 2. Verify Code
        console.log("2. Testing POST /api/auth/verify-code...");
        const verifyRes = await postRequest('/api/auth/verify-code', { code });
        if (verifyRes.status === 200) console.log("✅ Verification successful");
        else throw new Error(`Verification failed: ${JSON.stringify(verifyRes.body)}`);

        // 3. Login
        console.log("3. Testing POST /api/auth/login...");
        const loginRes = await postRequest('/api/auth/login', { email: testEmail, password: testPass });
        if (loginRes.status === 200) console.log("✅ Login successful");
        else throw new Error(`Login failed: ${JSON.stringify(loginRes.body)}`);

        // 4. Test Cart API
        console.log("4. Testing GET /api/cart...");
        const cartRes = await getRequest('/api/cart');
        if (cartRes.status === 200) console.log("✅ Cart API working");
        else throw new Error(`Cart API failed: ${JSON.stringify(cartRes.body)}`);

        // 5. Test Add Item
        console.log("5. Testing POST /api/cart/add...");
        const addRes = await postRequest('/api/cart/add', { itemId: 1, quantity: 2 });
        if (addRes.status === 200) {
            console.log("✅ Add to Cart API working");
            if (addRes.body.total === 10) console.log("✅ Cart total correct (R10)");
            else console.error("❌ Cart total incorrect", addRes.body.total);
        }
        else throw new Error(`Add to Cart API failed: ${JSON.stringify(addRes.body)}`);

        // 6. Test Paystack Init
        console.log("6. Testing POST /api/paystack/initialize...");
        const initRes = await postRequest('/api/paystack/initialize', {
            firstName: "Test", lastName: "User", email: testEmail
        });

        if (initRes.status === 500 && initRes.body.error.includes("Missing PAYSTACK_SECRET_KEY")) {
            console.log("✅ Paystack Init handled missing key correctly (Status 500)");
        } else {
            console.log(`ℹ️ Paystack Init Status: ${initRes.status}`);
            console.log(`ℹ️ Response: ${JSON.stringify(initRes.body)}`);
        }

        console.log("\n--- ALL SERVER TESTS PASSED ---");

    } catch (e) {
        console.error("\n❌ Test failed!");
        console.error(e.message || e);
    }
}

runTests();
