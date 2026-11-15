/* ============================================================
   折光 · 棱的 AI 转发（Cloudflare Worker）
   浏览器 → 这里 → 智谱 open.bigmodel.cn

   环境变量（Worker 设置里加）：
     ZHIPU_API_KEY   必填，智谱 API Key
     ALLOW_ORIGIN    可选，允许的来源，默认 *。建议上线后填
                     https://<你的用户名>.github.io
   ============================================================ */

const UPSTREAM = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MAX_BODY = 64 * 1024;

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, cors)
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allow = (env.ALLOW_ORIGIN || '*').trim();
  const list = allow.split(',').map(s => s.trim());
  const ok = allow === '*' || list.indexOf(origin) > -1;
  return {
    'Access-Control-Allow-Origin': ok ? (allow === '*' ? '*' : origin) : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/health') {
      return json({ ok: true, hasKey: !!env.ZHIPU_API_KEY }, 200, cors);
    }

    if (url.pathname !== '/chat') return json({ error: { message: 'not found' } }, 404, cors);
    if (request.method !== 'POST') return json({ error: { message: '只支持 POST' } }, 405, cors);

    if (!env.ZHIPU_API_KEY) {
      return json({ error: { message: '服务端还没配置 ZHIPU_API_KEY' } }, 500, cors);
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: { message: '内容太长' } }, 413, cors);

    let body;
    try { body = JSON.parse(raw); } catch (e) { return json({ error: { message: '格式不对' } }, 400, cors); }

    /* 只放行本产品用得到的字段，模型白名单 */
    const model = /^glm-[a-z0-9.\-]+$/i.test(body.model || '') ? body.model : 'glm-4-flash';
    if (!Array.isArray(body.messages) || !body.messages.length) {
      return json({ error: { message: '缺少 messages' } }, 400, cors);
    }
    const payload = {
      model,
      messages: body.messages.slice(-14).map(m => ({
        role: ['system', 'user', 'assistant'].indexOf(m.role) > -1 ? m.role : 'user',
        content: String(m.content || '').slice(0, 4000)
      })),
      temperature: Math.min(1.2, Math.max(0, Number(body.temperature) || 0.8)),
      max_tokens: Math.min(800, Math.max(60, Number(body.max_tokens) || 300)),
      stream: false
    };

    try {
      const up = await fetch(UPSTREAM, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + env.ZHIPU_API_KEY
        },
        body: JSON.stringify(payload)
      });
      const text = await up.text();
      return new Response(text, {
        status: up.status,
        headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, cors)
      });
    } catch (e) {
      return json({ error: { message: '上游不可达：' + e.message } }, 502, cors);
    }
  }
};
