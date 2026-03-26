import { describe, it, expect, beforeAll } from 'vitest';
import * as db from '../database.js';

describe('Order Operations', () => {
    let testUserId;

    beforeAll(async () => {
        await db.initDatabase();
        const email = `orders_test_${Date.now()}@example.com`;
        const user = await db.createUser(email, 'password123', 'Order', 'Tester');
        db.verifyEmail(user.verificationToken);
        testUserId = user.id;
    });

    it('should create an order', () => {
        const items = [
            { id: 1, name: 'Pork Braai Piece', price: 5, quantity: 2 },
            { id: 3, name: 'Kebabs', price: 10, quantity: 1 }
        ];
        const orderId = db.createOrder(testUserId, `TEST_REF_${Date.now()}`, items, 20, {
            email: 'test@example.com',
            firstName: 'Order',
            lastName: 'Tester',
            phone: '0712345678'
        });
        expect(orderId).toBeGreaterThan(0);
    });

    it('should retrieve orders by user', () => {
        const orders = db.getOrdersByUser(testUserId);
        expect(orders.length).toBeGreaterThanOrEqual(1);
        expect(orders[0].items).toBeInstanceOf(Array);
        expect(orders[0].total).toBe(20);
        expect(orders[0].status).toBe('received');
    });

    it('should retrieve order by id', () => {
        const orders = db.getOrdersByUser(testUserId);
        const order = db.getOrderById(orders[0].id);
        expect(order).not.toBeNull();
        expect(order.customerEmail).toBe('test@example.com');
    });

    it('should update order status', () => {
        const orders = db.getOrdersByUser(testUserId);
        db.updateOrderStatus(orders[0].id, 'preparing');
        const updated = db.getOrderById(orders[0].id);
        expect(updated.status).toBe('preparing');
    });

    it('should reject invalid status', () => {
        const orders = db.getOrdersByUser(testUserId);
        expect(() => db.updateOrderStatus(orders[0].id, 'invalid')).toThrow('Invalid status');
    });

    it('should list all orders', () => {
        const allOrders = db.getAllOrders();
        expect(allOrders.length).toBeGreaterThanOrEqual(1);
    });
});

describe('Menu Operations', () => {
    beforeAll(async () => {
        await db.initDatabase();
    });

    it('should return seeded menu items', () => {
        const items = db.getMenuItems();
        expect(items.length).toBeGreaterThanOrEqual(10);
    });

    it('should get a single menu item', () => {
        const item = db.getMenuItem(1);
        expect(item).not.toBeNull();
        expect(item.name).toBe('Pork Braai Piece');
        expect(item.price).toBe(5);
    });

    it('should update a menu item', () => {
        db.updateMenuItem(1, { price: 7 });
        const item = db.getMenuItem(1);
        expect(item.price).toBe(7);
        // Reset
        db.updateMenuItem(1, { price: 5 });
    });

    it('should add a new menu item', () => {
        const id = db.addMenuItem({ name: 'Test Item', price: 15, description: 'A test item' });
        expect(id).toBeGreaterThan(0);
        const item = db.getMenuItem(id);
        expect(item.name).toBe('Test Item');
        // Clean up
        db.deleteMenuItem(id);
    });
});
