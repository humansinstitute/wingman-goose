// Session SDK (CommonJS) - P1: file registry + unix socket attach server
// Follows PRD/API Spec v1.0 for local attach

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');

const REG_DIR = path.join(os.homedir(), '.goose', 'sessions');

function ensureDir(p) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { mode: 0o700, recursive: true });
  }
}

function safeWriteFile(p, data) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, p);
}

function nowIso() {
  return new Date().toISOString();
}

function genId() { return crypto.randomUUID(); }
function genToken() { return crypto.randomBytes(32).toString('base64'); }

class SessionRegistry {
  constructor(descriptorBase) {
    ensureDir(REG_DIR);
    this.session_id = descriptorBase.session_id || genId();
    const base = process.env.GOOSE_SOCKET_DIR || (fs.existsSync('/var/tmp') ? '/var/tmp/goose' : '/tmp/goose');
    try { fs.mkdirSync(base, { recursive: true, mode: 0o700 }); } catch {}
    this.socketPath = descriptorBase.attach?.path || `${base}/sess_${this.session_id}.sock`;
    this.descriptorPath = path.join(REG_DIR, `session_${this.session_id}.json`);
    this.protocol_version = descriptorBase.protocol_version || '1.0';
    this.origin = descriptorBase.origin || 'cli';
    this.display_name = descriptorBase.display_name || 'Wingman Session';
    this.pid = descriptorBase.pid || process.pid;
    this.start_time = descriptorBase.start_time || nowIso();
    this.status = 'running';
    this.heartbeatIntervalMs = descriptorBase.heartbeatIntervalMs || 2000;
    this.token = genToken(); // memory-only
    this.interval = null;
  }

  _descriptor() {
    return {
      session_id: this.session_id,
      display_name: this.display_name,
      origin: this.origin,
      pid: this.pid,
      start_time: this.start_time,
      protocol_version: this.protocol_version,
      capabilities: {},
      attach: { transport: 'unix_socket', path: this.socketPath },
      security: { require_user_confirm_on_first_attach: true },
      heartbeat: { interval_ms: this.heartbeatIntervalMs, last_heartbeat: nowIso() },
      status: this.status,
    };
  }

  start() {
    // initial write
    safeWriteFile(this.descriptorPath, JSON.stringify(this._descriptor(), null, 2));
    // heartbeat loop
    this.interval = setInterval(() => {
      const d = this._descriptor();
      safeWriteFile(this.descriptorPath, JSON.stringify(d, null, 2));
    }, this.heartbeatIntervalMs);

    return {
      stop: async () => {
        if (this.interval) clearInterval(this.interval);
        try { fs.unlinkSync(this.descriptorPath); } catch {}
      },
      session_id: this.session_id,
      socketPath: this.socketPath,
      token: this.token,
    };
  }
}

function createAttachServer({ socketPath, protocolVersion = '1.0', onConsent }) {
  // Clean previous socket if exists
  try { fs.unlinkSync(socketPath); } catch {}

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let authorized = false;
    let nonce = null;

    const send = (obj) => socket.write(JSON.stringify(obj) + '\n');

    socket.on('data', (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx); buffer = buffer.slice(idx + 1);
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { return; }

        if (msg.type === 'attach_request') {
          if (msg.protocol_version !== protocolVersion) {
            return send({ type: 'attach_error', session_id: msg.session_id, code: 'incompatible', message: 'protocol mismatch' });
          }
          // Ask consent for first-time client (mock: allow)
          Promise.resolve(onConsent ? onConsent({ client_fp: msg.client_fp }) : 'allow')
          .then((decision) => {
            if (decision === 'deny') {
              return send({ type: 'attach_error', session_id: msg.session_id, code: 'unauthorized', message: 'denied' });
            }
            nonce = crypto.randomBytes(32);
            const encrypted_auth_token = crypto.createHash('sha256').update('secret:' + msg.client_fp).digest('base64');
            send({ type: 'attach_challenge', session_id: msg.session_id, nonce: nonce.toString('base64'), encrypted_auth_token });
          });
        } else if (msg.type === 'attach_proof') {
          if (!nonce) {
            return send({ type: 'attach_error', session_id: msg.session_id, code: 'unauthorized', message: 'no challenge' });
          }
          // In P1 mock, accept any signed_nonce
          authorized = true;
          send({ type: 'attach_ok', session_id: msg.session_id, server_info: { pid: process.pid, version: '1.0.0' } });
        }
      }
    });

    socket.on('error', () => {});
  });

  server.listen(socketPath, () => {
    try { fs.chmodSync(socketPath, 0o600); } catch {}
  });

  return {
    close: async () => new Promise((resolve) => server.close(() => resolve())),
  };
}

module.exports = { SessionRegistry, createAttachServer };
