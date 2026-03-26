import { describe, it, expect, beforeAll } from 'vitest';
import * as db from '../database.js';

describe('Cart Operations', () => {
    let testUserId;

    beforeAll(async () => {
        await db.initDatabase();
        const email = `cart_test_${Date.now()}@example.com`;
        const user = await db.createUser(email, 'password123', 'Cart', 'Tester');
        db.verifyEmail(user.verificationToken);
        testUserId = user.id;
    });

    it('should start with an empty cart', () => {
        const cart = db.getUserCart(testUserId);
        expect(Object.keys(cart).length).toBe(0);
    });

    it('should add an item to the cart', () => {
        db.updateCartItem(testUserId, 1, 3);
        const cart = db.getUserCart(testUserId);
        expect(cart[1]).toBe(3);
    });

    it('should update quantity of an existing item', () => {
        db.updateCartItem(testUserId, 1, 5);
        const cart = db.getUserCart(testUserId);
        expect(cart[1]).toBe(5);
    });

    it('should add multiple different items', () => {
        db.updateCartItem(testUserId, 2, 2);
        db.updateCartItem(testUserId, 3, 1);
        const cart = db.getUserCart(testUserId);
        expect(Object.keys(cart).length).toBe(3);
        expect(cart[2]).toBe(2);
        expect(cart[3]).toBe(1);
    });

    it('should remove item when quantity is 0 or less', () => {
        db.updateCartItem(testUserId, 3, 0);
        const cart = db.getUserCart(testUserId);
        expect(cart[3]).toBeUndefined();
    });

    it('should clear the entire cart', () => {
        db.clearUserCart(testUserId);
        const cart = db.getUserCart(testUserId);
        expect(Object.keys(cart).length).toBe(0);
    });
});
