/**
 * Script khởi động server - tự giải phóng port nếu đang bị chiếm
 * Dùng: node start.js         → port 3000
 *       PORT=3001 node start.js → port 3001 (chạy nhiều tk cùng lúc)
 */
const { execSync } = require('child_process');
const PORT = parseInt(process.env.PORT || '3000', 10);

function killPort(port) {
    try {
        if (process.platform === 'win32') {
            const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
            const pids = new Set();
            out.split('\n').forEach(line => {
                const m = line.trim().match(/\s+(\d+)\s*$/);
                if (m && m[1] !== '0') pids.add(m[1]);
            });
            pids.forEach(pid => {
                try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }); } catch (_) {}
            });
            if (pids.size) console.log('Đã giải phóng port', port);
        } else {
            execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
        }
    } catch (e) {
        // Port không bị chiếm hoặc không tìm thấy process
    }
}

killPort(PORT);
require('./server.js');
