import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import * as db from '../database.js';

const TEST_DB_PATH = path.join(process.cwd(), 'test_database.db');

describe('Authentication Logic', () => {
    beforeAll(async () => {
        // Mock DB_PATH in database.js if possible, or just ensure we clean up
        // Since database.js uses a hardcoded DB_PATH, we'll need to be careful.
        // For a true unit test, we might want to refactor database.js to accept a path.
        // But for now, we'll just run against a temporary file and clean up.
        if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
        
        // Note: database.js currently uses its own internal DB_PATH.
        // We'll initialize it and then we can test the logic.
        await db.initDatabase();
    });

    it('should create a new user', async () => {
        const email = `test_${Date.now()}@example.com`;
        const user = await db.createUser(email, 'password123', 'Vitest', 'User');
        
        expect(user).toBeDefined();
        expect(user.email).toBe(email);
        expect(user.firstName).toBe('Vitest');
        expect(user.verificationToken).toHaveLength(6);
    });

    it('should fail to create a user with invalid email', async () => {
        await expect(db.createUser('invalidemail', 'password123', 'Fail', 'User'))
            .rejects.toThrow('Invalid email format');
    });

    it('should authenticate a verified user', async () => {
        const email = `auth_${Date.now()}@example.com`;
        const user = await db.createUser(email, 'password123', 'Auth', 'User');
        
        // Verify the email first
        await db.verifyEmail(user.verificationToken);
        
        const authenticated = await db.authenticateUser(email, 'password123');
        expect(authenticated.email).toBe(email);
        expect(authenticated.emailVerified).toBe(true);
    });

    it('should fail authentication with wrong password', async () => {
        const email = `wrongpass_${Date.now()}@example.com`;
        await db.createUser(email, 'password123', 'Wrong', 'Pass');
        
        await expect(db.authenticateUser(email, 'wrongpassword'))
            .rejects.toThrow('Invalid credentials');
    });
});
