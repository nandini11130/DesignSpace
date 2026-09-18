import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { io } from 'socket.io-client';
import { createApp } from '../src/server.js';

let app;
let server;
let baseUrl;
let db;

test.before(async () => {
  ({ app, server, db } = createApp());
  db.prepare('DELETE FROM users').run();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('registers and logs in a user with password', async () => {
  const email = `demo-${Date.now()}@example.com`;

  const signupRes = await request(app)
    .post('/api/auth/signup')
    .send({ name: 'Demo User', email, password: 'Passw0rd!' })
    .expect(201);

  assert.ok(signupRes.body.token);
  assert.equal(signupRes.body.user.email, email);

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'Passw0rd!' })
    .expect(200);

  assert.ok(loginRes.body.token);
  assert.equal(loginRes.body.user.email, email);
});

test('returns a duplicate-user error when signup is repeated', async () => {
  const email = `existing-${Date.now()}@example.com`;

  const res = await request(app)
    .post('/api/auth/signup')
    .send({ name: 'Existing User', email, password: 'Passw0rd!' })
    .expect(201);

  assert.equal(res.body.user.email, email);

  const duplicateRes = await request(app)
    .post('/api/auth/signup')
    .send({ name: 'Existing User', email, password: 'Passw0rd!' })
    .expect(409);

  assert.equal(duplicateRes.body.message, 'User already exists.');
});

test('returns a clear message when login email is not registered', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'ghost-user-123@example.com', password: 'WrongPass123!' })
    .expect(401);

  assert.equal(res.body.message, 'User does not exist. Please sign up first.');
});

test('removes a user from the persistent database', async () => {
  const email = `delete-${Date.now()}@example.com`;

  const signupRes = await request(app)
    .post('/api/auth/signup')
    .send({ name: 'Delete User', email, password: 'Passw0rd!' })
    .expect(201);

  assert.equal(signupRes.body.user.email, email);

  const deleteRes = await request(app)
    .delete(`/api/auth/users/${encodeURIComponent(email)}`)
    .expect(200);

  assert.equal(deleteRes.body.message, 'User removed successfully.');

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'Passw0rd!' })
    .expect(401);

  assert.equal(loginRes.body.message, 'User does not exist. Please sign up first.');
});

test('sends and verifies OTP', async () => {
  const otpRes = await request(app).post('/api/auth/send-otp').send({ email: 'otp@example.com' }).expect(200);
  assert.ok(otpRes.body.otp);

  const verifyRes = await request(app)
    .post('/api/auth/verify-otp')
    .send({ email: 'otp@example.com', otp: otpRes.body.otp })
    .expect(200);

  assert.ok(verifyRes.body.token);
  assert.equal(verifyRes.body.user.email, 'otp@example.com');
});

test('allows password reset using a verified OTP step', async () => {
  const email = `reset-${Date.now()}@example.com`;

  await request(app)
    .post('/api/auth/signup')
    .send({ name: 'Reset User', email, password: 'InitialPass123!' })
    .expect(201);

  const forgotRes = await request(app)
    .post('/api/auth/forgot-password')
    .send({ email })
    .expect(200);

  assert.ok(forgotRes.body.otp);

  const resetRes = await request(app)
    .post('/api/auth/reset-password')
    .send({ email, otp: forgotRes.body.otp, password: 'NewPass456!' })
    .expect(200);

  assert.equal(resetRes.body.message, 'Password updated successfully.');

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'NewPass456!' })
    .expect(200);

  assert.equal(loginRes.body.user.email, email);
});

test('supports realtime team messaging over Socket.IO', async () => {
  const socket = io(baseUrl, { transports: ['websocket'], timeout: 5000 });

  const messageReceived = new Promise((resolve) => {
    socket.on('team:message', (payload) => {
      resolve(payload);
    });
  });

  socket.emit('team:join', { teamId: 'team-1' });
  socket.emit('team:message', { teamId: 'team-1', user: 'demo-user', text: 'Hello team!' });

  const payload = await messageReceived;
  assert.equal(payload.teamId, 'team-1');
  assert.equal(payload.text, 'Hello team!');
  socket.disconnect();
});
