// Wingman SDK (CommonJS) - discovery + attach client per PRD P1
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const REG_DIR = path.join(os.homedir(), '.goose', 'sessions');

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function discoverLocalSessions({ staleThresholdMs = 5000 } = {}) {
  if (!fs.existsSync(REG_DIR)) return [];
  const files = fs.readdirSync(REG_DIR).filter(f => f.startsWith('session_') && f.endsWith('.json'));
  const now = Date.now();
  return files.map(f => {
    const full = path.join(REG_DIR, f);
    const d = readJsonSafe(full) || {};
    const last = Date.parse(d?.heartbeat?.last_heartbeat || 0);
    const age_ms = isNaN(last) ? Number.MAX_SAFE_INTEGER : (now - last);
    const healthy = age_ms <= staleThresholdMs;
    return { ...d, age_ms, healthy };
  }).sort((a,b)=>a.age_ms-b.age_ms);
}

function attach(session, { timeoutMs = 1500 } = {}) {
  return new Promise((resolve) => {
    const socketBase = process.env.GOOSE_SOCKET_DIR || (fs.existsSync('/var/tmp') ? '/var/tmp/goose' : '/tmp/goose');
    try { fs.mkdirSync(socketBase, { recursive: true, mode: 0o700 }); } catch {}
    const socketPath = session.attach?.path || `${socketBase}/sess_${session.session_id}.sock`;
    const sock = net.createConnection(socketPath);
    
    const timer = setTimeout(() => { try { sock.destroy(); } catch {} ; resolve({ ok: false, error: 'timeout' }); }, timeoutMs);

    let buffer = '';
    const finish = (res) => { clearTimeout(timer); try { sock.end(); } catch {}; resolve(res); };

    sock.on('connect', () => {
      const req = { type: 'attach_request', protocol_version: session.protocol_version || '1.0', session_id: session.session_id, client_fp: 'wingman-local-dev', client_pubkey: 'NA' };
      sock.write(JSON.stringify(req) + '\n');
    });

    sock.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx); buffer = buffer.slice(idx + 1);
        if (!line.trim()) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.type === 'attach_challenge') {
          const proof = { type: 'attach_proof', session_id: session.session_id, signed_nonce: 'stub' };
          sock.write(JSON.stringify(proof) + '\n');
        } else if (msg.type === 'attach_ok') {
          finish({ ok: true, info: msg.server_info });
        } else if (msg.type === 'attach_error') {
          finish({ ok: false, error: msg.code || 'error', message: msg.message });
        }
      }
    });

    sock.on('error', (e) => finish({ ok: false, error: 'socket_error', message: e.message }));
    sock.on('close', () => {});
  });
}

module.exports = { discoverLocalSessions, attach };
