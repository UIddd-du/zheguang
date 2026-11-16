/* 折光 · 棱的 AI 转发（腾讯云云函数 SCF）
   浏览器 → 这里 → 智谱 open.bigmodel.cn
   环境变量（云函数控制台 → 函数配置 → 环境变量）：
     ZHIPU_API_KEY   必填，智谱 API Key
     ALLOW_ORIGIN    可选，默认 *。建议填 https://uiddd-du.github.io
*/

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
    'Access-Control-Max-Age': 86400
  };
}

function json(obj, status, cors) {
  return {
    statusCode: status,
    headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, cors),
    body: JSON.stringify(obj)
  };
}

exports.main = async (event, context) => {
  const env = process.env;
  const origin = (event.headers && (event.headers.Origin || event.headers.origin)) || '';
  const cors = corsHeaders(env, origin);

  // 路径兼容：SCF API Gateway 可能传 /chat 或空
  const path = (event.path || event.rawPath || '').replace(/\/+$/, '');
  const method = (event.httpMethod || event.method || 'POST').toUpperCase();

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  if (path && path !== '/chat' && path !== '') {
    return json({ error: { message: 'not found' } }, 404, cors);
  }
  if (method !== 'POST') {
    return json({ error: { message: '只支持 POST' } }, 405, cors);
  }

  if (!env.ZHIPU_API_KEY) {
    return json({ error: { message: '服务端还没配置 ZHIPU_API_KEY' } }, 500, cors);
  }

  let raw = event.body || '';
  if (event.isBase64Encoded) {
    try { raw = Buffer.from(raw, 'base64').toString('utf-8'); } catch (e) {}
  }
  if (raw.length > MAX_BODY) {
    return json({ error: { message: '内容太长' } }, 413, cors);
  }

  let body;
  try { body = JSON.parse(raw); } catch (e) {
    return json({ error: { message: '格式不对' } }, 400, cors);
  }

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
    return {
      statusCode: up.status,
      headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, cors),
      body: text
    };
  } catch (e) {
    return json({ error: { message: '上游不可达：' + e.message } }, 502, cors);
  }
};
