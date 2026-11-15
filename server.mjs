/* 折光 App · 本地预览服务（手机同一 WiFi 可直接打开） */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = import.meta.dirname;
const PORT = Number(process.env.PORT || 8080);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon'
};

function json(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);

  /* 棱的模型转发：浏览器 → 本地服务 → 智谱（绕开 CORS） */
  if (url === '/api/chat') {
    if (req.method !== 'POST') { json(res, 405, { error: { message: '只支持 POST' } }); return; }
    let body = '';
    req.on('data', c => {
      body += c;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', async () => {
      const key = String(req.headers['x-ai-key'] || process.env.ZHIPU_API_KEY || '').trim();
      if (!key) { json(res, 401, { error: { message: '缺少 API Key' } }); return; }
      try {
        const up = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
          body
        });
        const txt = await up.text();
        res.writeHead(up.status, { 'content-type': 'application/json; charset=utf-8' });
        res.end(txt);
      } catch (e) {
        json(res, 502, { error: { message: '上游不可达：' + e.message } });
      }
    });
    return;
  }

  let file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  fs.stat(file, (err, st) => {
    if (err || st.isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 ' + url);
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache'
    });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, () => {
  const nets = os.networkInterfaces();
  const ips = Object.values(nets).flat()
    .filter(n => n && n.family === 'IPv4' && !n.internal)
    .map(n => n.address);
  console.log('\n  折光 App 已启动\n');
  console.log('  本机      http://localhost:' + PORT + '/');
  ips.forEach(ip => console.log('  手机访问  http://' + ip + ':' + PORT + '/'));
  console.log('\n  手机与电脑连同一 WiFi，用浏览器打开上面的「手机访问」地址\n  浏览器菜单 →「添加到主屏幕」即可像 App 一样使用\n');
});
