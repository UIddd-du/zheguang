/* ============================================================
   折光 · 棱的 AI 转发（Cloudflare Pages Functions）
   浏览器 → 同域 /chat → 智谱 open.bigmodel.cn
   Key 存 Pages 项目 Settings → Environment variables and secrets
     变量名：ZHIPU_API_KEY（Secret 类型）
   ============================================================ */

const UPSTREAM = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MAX_BODY = 64 * 1024;

function corsHeaders(env, origin) {
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

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, cors)
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '';
  const cors = corsHeaders(env, origin);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: { message: '只支持 POST' } }, 405, cors);

  if (!env.ZHIPU_API_KEY) {
    return json({ error: { message: '服务端还没配置 ZHIPU_API_KEY' } }, 500, cors);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: { message: '内容太长' } }, 413, cors);

  let body;
  try { body = JSON.parse(raw); } catch (e) { return json({ error: { message: '格式不对' } }, 400, cors); }

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
