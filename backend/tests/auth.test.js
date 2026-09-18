import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { io } from 'socket.io-client';
import { createApp } from '../src/server.js';

let app;
let server;
let baseUrl;

test.before(async () => {
  ({ app, server } = createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('registers and logs in a user with password', async () => {
  const signupRes = await request(app)
    .post('/api/auth/signup')
    .send({ name: 'Demo User', email: 'demo@example.com', password: 'Passw0rd!' })
    .expect(201);

  assert.ok(signupRes.body.token);
  assert.equal(signupRes.body.user.email, 'demo@example.com');

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'demo@example.com', password: 'Passw0rd!' })
    .expect(200);

  assert.ok(loginRes.body.token);
  assert.equal(loginRes.body.user.email, 'demo@example.com');
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
