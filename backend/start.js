/**
 * Script khởi động server - tự giải phóng port nếu đang bị chiếm
 * Dùng: node backend/start.js            → port 3000
 *       PORT=3001 node backend/start.js  → port 3001 (chạy nhiều tk cùng lúc)
 */
const { execSync } = require('child_process');
const PORT = parseInt(process.env.PORT || '3000', 10);

function killPort(port) {
    try {
        if (process.platform === 'win32') {
            // Use PowerShell cmdlets instead of `netstat` to avoid PATH issues.
            const ps = `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`;
            const cmd = `powershell -NoProfile -Command "$pids = @(${ps}); foreach ($pid in $pids) { if ($pid -and $pid -ne 0) { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue | Out-Null } }"`;
            execSync(cmd, { stdio: 'ignore' });
            console.log('Đã giải phóng port (nếu cần)', port);
        } else {
            execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
        }
    } catch (e) {
        // Port không bị chiếm hoặc không tìm thấy process
    }
}

killPort(PORT);
require('./server.js');
