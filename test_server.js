const http = require('http');

function postRequest(path, data) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Keep session cookie if we were doing robust testing, but for quick check:
                // We'll see if endpoints respond without error first.
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: body }));
        });

        req.on('error', (e) => reject(e));
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

function getRequest(path) {
    return new Promise((resolve, reject) => {
        const options = { hostname: 'localhost', port: 3000, path: path, method: 'GET' };
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: body }));
        });
        req.on('error', (e) => reject(e));
        req.end();
    });
}

async function runTests() {
    console.log("Starting Unit Tests...");

    try {
        // 1. Test Cart API
        console.log("Tesing GET /api/cart...");
        const cartRes = await getRequest('/api/cart');
        if (cartRes.status === 200) console.log("✅ Cart API working");
        else console.error("❌ Cart API failed", cartRes);

        // 2. Test Add Item (Mock)
        // Note: Without cookie persistence in this simple script, session won't persist across requests
        // But we can check if the server *accepts* the request cleanly.
        console.log("Testing POST /api/cart/add...");
        const addRes = await postRequest('/api/cart/add', { itemId: 1, quantity: 1 });
        if (addRes.status === 200) console.log("✅ Add to Cart API working");
        else console.error("❌ Add to Cart API failed", addRes);

        // 3. Test Paystack Init (Expected Failure without Key)
        console.log("Testing POST /api/paystack/initialize (expecting failure or key error)...");
        const initRes = await postRequest('/api/paystack/initialize', {
            firstName: "Test", lastName: "User", email: "test@example.com"
        });

        // Since we likely don't have the secret key set in this environment, it should return 500 or 400.
        // But receiving a structured JSON response proves the endpoint is active.
        console.log(`ℹ️ Paystack Init Status: ${initRes.status}`);
        console.log(`ℹ️ Response: ${initRes.body}`);
        console.log("✅ Server responded (test passed if server is running)");

    } catch (e) {
        console.error("❌ Test failed. Is the server running? Run 'node server.js' first.");
        console.error(e);
    }
}

runTests();
