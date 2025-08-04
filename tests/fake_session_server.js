// Fake session server for CI and local tests
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const REG_DIR = path.join(os.homedir(), '.goose', 'sessions');

function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true,mode:0o700}); }
function write(p, d){ fs.writeFileSync(p+'.tmp', JSON.stringify(d,null,2), {mode:0o600}); fs.renameSync(p+'.tmp', p); }

async function startFakeSession({ id = 'test-' + Date.now(), healthy=true }={}){
  ensureDir(REG_DIR);
  const socketPath = `/var/tmp/goose/sess_${id}.sock`;
  try { fs.unlinkSync(socketPath); } catch {}

  const descriptorPath = path.join(REG_DIR, `session_${id}.json`);
  const desc = {
    session_id: id,
    display_name: 'Fake GUI Session',
    origin: 'gui',
    pid: process.pid,
    start_time: new Date().toISOString(),
    protocol_version: '1.0',
    attach: { transport: 'unix_socket', path: socketPath },
    heartbeat: { interval_ms: 2000, last_heartbeat: new Date().toISOString() },
    status: 'running'
  };
  write(descriptorPath, desc);

  const server = net.createServer((sock)=>{
    sock.setEncoding('utf8');
    let buf='';
    const send = (o)=> sock.write(JSON.stringify(o)+'\n');
    sock.on('data', (c)=>{
      buf += c;
      let i; while((i=buf.indexOf('\n'))!==-1){
        const line = buf.slice(0,i); buf = buf.slice(i+1);
        if(!line.trim()) continue;
        let m; try{ m = JSON.parse(line); } catch{ continue; }
        if(m.type==='attach_request'){
          send({ type:'attach_challenge', session_id: id, nonce: 'x', encrypted_auth_token: 'y' });
        } else if(m.type==='attach_proof'){
          send({ type:'attach_ok', session_id: id, server_info: { pid: process.pid, version: 'fake' } });
        }
      }
    });
  });

  server.listen(socketPath, ()=>{ try { fs.chmodSync(socketPath,0o600);} catch{} });

  const hb = setInterval(()=>{
    desc.heartbeat.last_heartbeat = new Date().toISOString();
    write(descriptorPath, desc);
  }, 2000);

  return {
    stop: async ()=>{ clearInterval(hb); try{ fs.unlinkSync(socketPath);}catch{} try{ fs.unlinkSync(descriptorPath);}catch{} server.close(); },
    descriptorPath,
    socketPath,
    id,
  };
}

if (require.main === module) {
  startFakeSession().then(()=> console.log('fake session started'));
}

module.exports = { startFakeSession };
