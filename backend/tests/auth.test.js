import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { io } from 'socket.io-client';
import { createApp } from '../src/server.js';

let app;
let server;
let baseUrl;

function waitForServer() {
  return new Promise((resolve) => {
    const check = () => {
      if (server && server.address()) {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
        return;
      }
      setTimeout(check, 25);
    };
    check();
  });
}

test.before(async () => {
  ({ app, server } = createApp());

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  await waitForServer();
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('registers a user and logs them in with password', async () => {
  const signupRes = await request(app)
    .post('/api/auth/signup')
    .send({
      name: 'Test User',
      email: 'user@example.com',
      password: 'Passw0rd!' 
    })
    .expect(201);

  assert.ok(signupRes.body.token);
  assert.equal(signupRes.body.user.email, 'user@example.com');

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'user@example.com',
      password: 'Passw0rd!'
    })
    .expect(200);

  assert.ok(loginRes.body.token);
  assert.equal(loginRes.body.user.email, 'user@example.com');
});

test('sends and verifies an OTP for email-based auth', async () => {
  const otpRes = await request(app)
    .post('/api/auth/send-otp')
    .send({ email: 'otp@example.com' })
    .expect(200);

  assert.ok(otpRes.body.otp);

  const verifyRes = await request(app)
    .post('/api/auth/verify-otp')
    .send({
      email: 'otp@example.com',
      otp: otpRes.body.otp
    })
    .expect(200);

  assert.ok(verifyRes.body.token);
  assert.equal(verifyRes.body.user.email, 'otp@example.com');
});

test('supports real-time team collaboration events', async () => {
  const socket = io(baseUrl, {
    transports: ['websocket'],
    timeout: 5000
  });

  const received = new Promise((resolve) => {
    socket.on('team:message', (payload) => {
      resolve(payload);
    });
  });

  socket.emit('team:join', { teamId: 'team-1' });
  socket.emit('team:message', {
    teamId: 'team-1',
    user: 'demo-user',
    text: 'Hello team!'
  });

  const payload = await received;
  assert.equal(payload.teamId, 'team-1');
  assert.equal(payload.text, 'Hello team!');
  socket.disconnect();
});
