/* 折光 · 运行时配置
   aiBase 留空时：
     localhost / 局域网 IP  → 走本机 server.mjs 的 /api/chat
     GitHub Pages          → 走下方腾讯云 SCF 公网函数地址
   也可以在 App 里「我的 → 棱的模型 → 服务地址」临时覆盖。 */
window.ZG_CFG = {
  aiBase: 'https://1320740978-1h0ifbx8bj.ap-guangzhou.tencentscf.com',
  model: 'glm-4-flash'
};
