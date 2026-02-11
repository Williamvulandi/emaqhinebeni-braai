const db = require('./database');
const bcrypt = require('bcryptjs');

async function test() {
    console.log('--- STARTING AUTH TEST ---');
    await db.initDatabase();

    const testEmail = 'test' + Date.now() + '@example.com';
    const testPass = 'password123';

    console.log(`1. Testing Signup with ${testEmail}...`);
    try {
        const user = await db.createUser(testEmail, testPass, 'Test', 'User');
        console.log('✅ Signup successful. Code:', user.verificationToken);

        console.log('2. Testing Duplicate Signup for UNVERIFIED user (should succeed/update)...');
        const user2 = await db.createUser(testEmail, testPass, 'Test', 'User');
        if (user2.isExisting) {
            console.log('✅ Re-signup successful (user updated). New Code:', user2.verificationToken);
        } else {
            console.error('❌ Error: Expected isExisting to be true for duplicate signup');
        }

        console.log('2b. Testing Verification...');
        await db.verifyEmail(user2.verificationToken);
        console.log('✅ Email verified.');

        console.log('2c. Testing Duplicate Signup for VERIFIED user (should fail)...');
        try {
            await db.createUser(testEmail, testPass, 'Test', 'User');
            console.log('❌ Error: Expected duplicate signup of verified user to fail!');
        } catch (e) {
            console.log('✅ Duplicate signup of verified user failed as expected:', e.message);
        }

        console.log('3. Testing Login (correct credentials)...');
        const loginUser = await db.authenticateUser(testEmail, testPass);
        console.log('✅ Login successful for:', loginUser.email);

        console.log('4. Testing Login (incorrect password)...');
        try {
            await db.authenticateUser(testEmail, 'wrongpass');
            console.log('❌ Error: Expected login with wrong password to fail!');
        } catch (e) {
            console.log('✅ Wrong password failed as expected:', e.message);
        }

        console.log('5. Testing Forgot Password...');
        const resetToken = await db.createResetToken(testEmail);
        console.log('✅ Reset token generated:', resetToken);

        console.log('6. Testing Password Reset...');
        await db.resetPassword(resetToken, 'newpassword456');
        console.log('✅ Password reset successful.');

        console.log('7. Testing Login with new password...');
        const newLoginUser = await db.authenticateUser(testEmail, 'newpassword456');
        console.log('✅ Login successful with new password!');

    } catch (e) {
        console.error('❌ TEST FAILED:', e);
    }
}

test();
