'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CdpConnection } = require('../../injector/core/cdp-client.js');

/**
 * A fake socket implementing exactly what CdpConnection needs:
 * send(text), close(), and addEventListener for 'message'/'close'/'error'.
 * Captures every sent frame (parsed back to an object) so a test can assert
 * on the exact CDP message shape without a real network round trip.
 */
function makeFakeSocket() {
  const listeners = { message: [], close: [], error: [] };
  const sent = [];
  return {
    sent,
    addEventListener(name, handler) {
      listeners[name].push(handler);
    },
    send(text) {
      sent.push(JSON.parse(text));
    },
    close() {
      for (const handler of listeners.close) handler();
    },
    // Test helpers, not part of the socket-like contract itself.
    emitMessage(obj) {
      for (const handler of listeners.message) handler({ data: JSON.stringify(obj) });
    },
    emitClose() {
      for (const handler of listeners.close) handler();
    },
  };
}

test('send() resolves with result when a matching response arrives', async () => {
  const socket = makeFakeSocket();
  const conn = new CdpConnection(socket);
  const promise = conn.send('Target.getTargets', {});
  assert.equal(socket.sent.length, 1);
  assert.equal(socket.sent[0].method, 'Target.getTargets');
  assert.equal(typeof socket.sent[0].id, 'number');
  socket.emitMessage({ id: socket.sent[0].id, result: { targetInfos: [] } });
  const result = await promise;
  assert.deepEqual(result, { targetInfos: [] });
});

test('send() attaches sessionId to the outgoing message when given one', async () => {
  const socket = makeFakeSocket();
  const conn = new CdpConnection(socket);
  conn.send('Page.enable', {}, 'session-123');
  assert.equal(socket.sent[0].sessionId, 'session-123');
});

test('send() rejects with the method name and message when the response carries an error', async () => {
  const socket = makeFakeSocket();
  const conn = new CdpConnection(socket);
  const promise = conn.send('Target.attachToTarget', { targetId: 'x' });
  const id = socket.sent[0].id;
  socket.emitMessage({ id, error: { message: 'No target with given id found' } });
  await assert.rejects(promise, (err) => {
    assert.match(err.message, /Target\.attachToTarget/);
    assert.match(err.message, /No target with given id found/);
    return true;
  });
});

test('ids increase monotonically across multiple sends, so responses cannot be cross-matched', async () => {
  const socket = makeFakeSocket();
  const conn = new CdpConnection(socket);
  conn.send('A', {});
  conn.send('B', {});
  const ids = socket.sent.map((m) => m.id);
  assert.equal(new Set(ids).size, 2);
  assert.notEqual(ids[0], ids[1]);
});

test('on() delivers event params and sessionId to a subscribed handler', () => {
  const socket = makeFakeSocket();
  const conn = new CdpConnection(socket);
  const seen = [];
  conn.on('Target.targetCreated', (params, sessionId) => seen.push({ params, sessionId }));
  socket.emitMessage({ method: 'Target.targetCreated', params: { targetInfo: { targetId: 't1' } }, sessionId: 's1' });
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].params, { targetInfo: { targetId: 't1' } });
  assert.equal(seen[0].sessionId, 's1');
});

test('on() delivers a browser-level event (no sessionId) with sessionId undefined', () => {
  const socket = makeFakeSocket();
  const conn = new CdpConnection(socket);
  const seen = [];
  conn.on('Target.targetDestroyed', (params, sessionId) => seen.push(sessionId));
  socket.emitMessage({ method: 'Target.targetDestroyed', params: { targetId: 't1' } });
  assert.equal(seen[0], undefined);
});

test('an event with no subscribed handler is silently ignored (no throw)', () => {
  const socket = makeFakeSocket();
  const conn = new CdpConnection(socket);
  assert.doesNotThrow(() => {
    socket.emitMessage({ method: 'Some.unhandledEvent', params: {} });
  });
});

test('a throwing event handler does not stop the connection or other handlers', () => {
  const socket = makeFakeSocket();
  const conn = new CdpConnection(socket);
  const seen = [];
  conn.on('X', () => {
    throw new Error('boom');
  });
  conn.on('X', () => seen.push('second handler ran'));
  assert.doesNotThrow(() => socket.emitMessage({ method: 'X', params: {} }));
  assert.deepEqual(seen, ['second handler ran']);
});

test('onClose() handlers fire when the socket closes, and pending sends reject', async () => {
  const socket = makeFakeSocket();
  const conn = new CdpConnection(socket);
  const pending = conn.send('Never.answered', {});
  let closeFired = false;
  conn.onClose(() => {
    closeFired = true;
  });
  socket.emitClose();
  assert.equal(closeFired, true);
  await assert.rejects(pending, /connection closed/);
});

test('send() after close() rejects immediately without touching the socket', async () => {
  const socket = makeFakeSocket();
  const conn = new CdpConnection(socket);
  conn.close();
  socket.sent.length = 0; // close() itself sends nothing; reset for clarity
  await assert.rejects(conn.send('X', {}), /connection is closed/);
  assert.equal(socket.sent.length, 0);
});

test('a malformed (non-JSON) message frame is dropped rather than throwing', () => {
  const listeners = [];
  const socket = {
    addEventListener(name, handler) {
      if (name === 'message') listeners.push(handler);
    },
    send() {},
    close() {},
  };
  const conn = new CdpConnection(socket);
  assert.doesNotThrow(() => listeners[0]({ data: 'not json {{{' }));
});

test('CdpConnection close() is idempotent and safe to call twice', () => {
  const socket = makeFakeSocket();
  const conn = new CdpConnection(socket);
  assert.doesNotThrow(() => {
    conn.close();
    conn.close();
  });
});
