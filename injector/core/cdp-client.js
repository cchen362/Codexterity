'use strict';

/**
 * Codexterity — a zero-dependency Chrome DevTools Protocol client (Plan 0005 M1)
 * -------------------------------------------------------------------------------
 * Fact 9 in docs/plans/0005-package-identity-cdp-injection.md: the "CDP
 * fallback" D-0001-1 and docs/ENGINEERING.md have long described as "built,
 * not default" was never written. This module (plus cdp-page.js) is that
 * build, now the WINDOWS PRIMARY (not a fallback — the plan's "The design").
 *
 * Fact 10: Node 22.14.0 (this machine) has a global `WebSocket` client, stable
 * since Node 22.4 — no dependency is needed, and package.json's `engines`
 * floor moves to `>=22.4` in this milestone for exactly that reason.
 *
 * The wire protocol (https://chromedevtools.github.io/devtools-protocol/):
 * every message is a JSON object with a numeric `id`; a response carries that
 * same `id` plus either `result` or `error`; an event carries `method` and
 * `params` and no `id`. Flat sessions (`Target.attachToTarget {flatten:true}`)
 * multiplex several target sessions over the ONE browser websocket by adding
 * a `sessionId` string to every message bound for (or coming from) an
 * attached target — the browser-level connection itself has no sessionId.
 *
 * `CdpConnection` holds ONLY that framing/id-matching/session-routing logic,
 * deliberately separated from `connect()`'s real WebSocket wiring, so it can
 * be driven with a fake socket object under node:test (no network, no
 * Electron, no real Chrome) — the same "extract the pure logic so the
 * degradation path is testable" move landmarks.js made for the landmark
 * verdict logic (see that file's own header comment).
 */

/**
 * A socket-like object this class can drive: anything exposing `send(text)`
 * and `addEventListener(eventName, handler)` for at least 'message',
 * 'close' and 'error'. A real `WebSocket` satisfies this directly; a test
 * fake need only implement these three events.
 */
class CdpConnection {
  constructor(socket) {
    this._socket = socket;
    this._nextId = 1;
    this._pending = new Map(); // id -> {resolve, reject, method}
    this._eventHandlers = new Map(); // eventName -> Set<handler>
    this._closeHandlers = new Set();
    this._closed = false;

    socket.addEventListener('message', (event) => this._onMessage(event));
    socket.addEventListener('close', () => this._onClose());
    socket.addEventListener('error', (event) => this._onSocketError(event));
  }

  /**
   * Send a CDP command and resolve with its `result` when the matching
   * response arrives. Rejects with an Error carrying the method name and the
   * protocol's own message when the response carries `error` instead — a
   * caller trying to diagnose "why did Target.attachToTarget fail" needs the
   * method name in the rejection, not just "Unexpected response".
   *
   * `sessionId`, when given, is attached to the outgoing message per the flat
   *-sessions wire format above, so the command is routed to that attached
   * target rather than interpreted as a browser-level command.
   */
  send(method, params = {}, sessionId) {
    if (this._closed) {
      return Promise.reject(new Error(`cannot send ${method}: the CDP connection is closed`));
    }
    const id = this._nextId++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject, method });
      try {
        this._socket.send(JSON.stringify(message));
      } catch (err) {
        this._pending.delete(id);
        reject(err);
      }
    });
  }

  /**
   * Subscribe to a CDP event by name (e.g. 'Target.targetCreated'). The
   * handler receives `(params, sessionId)` — `sessionId` is `undefined` for
   * a browser-level event and a string for one scoped to an attached target,
   * which is exactly the distinction the attacher needs to tell "a new page
   * anywhere" apart from "this specific page navigated".
   */
  on(eventName, handler) {
    if (!this._eventHandlers.has(eventName)) this._eventHandlers.set(eventName, new Set());
    this._eventHandlers.get(eventName).add(handler);
    return () => this._eventHandlers.get(eventName)?.delete(handler);
  }

  /** Register a handler run once when the underlying socket closes. */
  onClose(handler) {
    this._closeHandlers.add(handler);
    return () => this._closeHandlers.delete(handler);
  }

  /** Close the underlying socket. Idempotent. */
  close() {
    if (this._closed) return;
    this._closed = true;
    try {
      this._socket.close();
    } catch (err) {
      // Nothing further to do; onClose handlers still fire from the
      // socket's own 'close' event, or we run them directly below if the
      // socket never emits one (e.g. it was already gone).
    }
  }

  _onMessage(event) {
    let msg;
    try {
      msg = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
    } catch (err) {
      // A malformed frame from the browser is not something the attacher
      // can act on; drop it rather than throwing out of a socket event
      // handler (docs/ENGINEERING.md: never half-styled, never crashed).
      return;
    }

    if (typeof msg.id === 'number' && this._pending.has(msg.id)) {
      const { resolve, reject, method } = this._pending.get(msg.id);
      this._pending.delete(msg.id);
      if (msg.error) {
        reject(new Error(`${method} failed: ${msg.error.message || JSON.stringify(msg.error)}`));
      } else {
        resolve(msg.result);
      }
      return;
    }

    if (msg.method) {
      const handlers = this._eventHandlers.get(msg.method);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(msg.params, msg.sessionId);
          } catch (err) {
            // A handler throwing must never take down the connection or
            // stop later events/messages from being processed — the same
            // "never throw out of an event handler" rule the attacher's own
            // contract states.
          }
        }
      }
    }
  }

  _onClose() {
    if (this._closed) {
      // close() already marked us closed; still run handlers exactly once.
    }
    this._closed = true;
    for (const { reject, method } of this._pending.values()) {
      reject(new Error(`${method} never received a response: the CDP connection closed`));
    }
    this._pending.clear();
    for (const handler of this._closeHandlers) {
      try {
        handler();
      } catch (err) {
        // See _onMessage: a handler must never propagate out of here.
      }
    }
  }

  _onSocketError(event) {
    // A socket-level error precedes (or substitutes for) a close event on
    // some WebSocket implementations; treat it as a close so pending
    // commands are rejected rather than hanging forever.
    this._onClose();
  }
}

/**
 * Connect to a CDP websocket endpoint (a `webSocketDebuggerUrl` from
 * `/json/version` or `/json`) using Node's global `WebSocket`, and wire it
 * into a `CdpConnection`. This is the only place a real network socket is
 * touched — everything else in this module is pure and testable with a fake.
 */
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = new WebSocket(wsUrl);
    const onOpen = () => {
      if (settled) return;
      settled = true;
      socket.removeEventListener('error', onError);
      resolve(new CdpConnection(socket));
    };
    const onError = (event) => {
      if (settled) return;
      settled = true;
      socket.removeEventListener('open', onOpen);
      reject(new Error(`failed to connect to ${wsUrl}: ${event && event.message ? event.message : 'socket error'}`));
    };
    socket.addEventListener('open', onOpen);
    socket.addEventListener('error', onError);
  });
}

module.exports = { CdpConnection, connect };
