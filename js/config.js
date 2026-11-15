/* 折光 · 运行时配置
   aiBase 留空时：
     localhost / 局域网 IP  → 走本机 server.mjs 的 /api/chat
     GitHub Pages          → 走下面这行填的 Worker 地址
   部署完 Worker 后把地址填进来即可，例如：
     aiBase: 'https://zheguang-ai.xxx.workers.dev'
   也可以在 App 里「我的 → 棱的模型 → 服务地址」临时覆盖。 */
window.ZG_CFG = {
  aiBase: '',
  model: 'glm-4-flash'
};
