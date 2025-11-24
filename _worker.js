// _worker.js — 内部改写：无 .html → landing-a；有 .html → landing-b；首页 "/" 不改写
// 随机注入：%%TAGLINE%% / %%HERO%% / %%HERO_SRC%%；支持 ?canon= 注入 canonical
// 从 canonical 提取 {tl} 注入 %%TITLE%% / %%DESCRIPTION%%（标题仅用 {tl}）
// 标题支持随机 Emoji（🏆 等）；此版已内置 40 枚“标题安全”表情

const TARGET_A = '/amp/landing-a.html';
const TARGET_B = '/amp/landing-b.html';

// 轮换模式：'random' | 'sticky_user' | 'sticky_path'
const MODE = 'sticky_path';

// 标题 Emoji 模式：'off' | 'random' | 'sticky_path'
const TITLE_EMOJI_MODE = 'sticky_path';
const EMOJIS = [
  '🏆','✨','🔥','🎯','⭐','💎','⚡','🎉','💥','💫',
  '🔔','✅','🚀','📣','⏱️','🔒','📱','🕹️','🎮','🎲',
  '♠️','♥️','♦️','♣️','🎰','🪙','💰','💸','🏅','🥇',
  '📈','🏁','🏟️','🏏','⚽','🏀','🎯','🎟️','🧧','🎁'
];

// KV 图
const HERO_SOURCES = ['/assets/1.png','/assets/2.png','/assets/3.png','/assets/4.png'];
const HERO_SNIPPETS = HERO_SOURCES.map(src =>
  `<amp-img src="${src}" width="1200" height="600" layout="responsive" alt="r8r8 Hero"></amp-img>`
);

// 可选：正文随机标语（与 <title> 无关）
const TAGLINES = [
  "100% Welcome Bonus up to ₹99,999",
  "200% New Player Pack up to ₹10,000",
  "Deposit ₹500, Get Extra ₹500 (New users)",
  "Daily 10% Cashback up to ₹3,000",
  "Spin & Win: 25 Free Spins on ₹1,000+",
  "UPI • Paytm • PhonePe — Instant Deposit",
  "Register in 30s • OTP Login • Fast KYC",
  "Mobile-first • Low Data • Hindi/English",
  "Slots Rescue Bonus — Every Day",
  "Sports Lucky Streak Bonus up to ₹39,999",
  "Real-time Rebate • Daily Cashback up to 2.88%",
  "Lucky Spin — 100% Win",
  "Refer & Earn — Rewards up to ₹599,999",
  "Secure • Responsible • 18+ Only",
  "Festival Special: Extra Spins on Signup",
  "VIP Perks • Level-up Bonus",
  "Live Dealers • High-Payout Tables",
  "Mega Sports Week • Bonus On",
  "Newbie Protection: Loss Cover Bonus",
  "Fast UPI Bonus: ₹200 on First Deposit",
  "Weekly Surprise Drops • Don’t Miss Out",
  "Choose Your Perk: Big Bonus or Cashback",
  "Teen Patti • Andar Bahar • Slots — All in One",
  "T&Cs apply • Know your limits",
  "Welcome Pack for India • Grab it Now",
  "Top-up Boost Day • Limited Time",
  "Instant Withdrawals • Trusted & Secure",
  "Play More, Earn More — Daily Missions",
  "Exclusive Telegram Offers • Join Now",
  "Best Odds • Bigger Thrills • r8r8"
];

const ASSET_EXT = /\.(css|js|mjs|map|png|jpg|jpeg|gif|svg|webp|ico|txt|json|xml|woff2?|ttf|otf|eot|wasm|mp4|mp3|webm|ogg)$/i;
const DEFAULT_ORIGIN = 'https://r8r899.com';
const DEFAULT_TITLE = 'r8r8 — India Welcome Offers';
const DEFAULT_DESCRIPTION = 'UPI • Paytm • PhonePe. Register in 30s. 18+ | Play Responsibly';

// ===== 工具 =====
function wantsHTML(req) {
  const accept = req.headers.get('accept') || '';
  return accept.includes('text/html') || accept.includes('*/*') || accept === '';
}
function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h >>> 0;
}
function pickIndex(arrLen, req, urlPath, cookieName) {
  if (MODE === 'sticky_user') {
    const m = new RegExp(`${cookieName}=(\\d+)`).exec(req.headers.get('cookie') || '');
    return m ? (Number(m[1]) % arrLen) : Math.floor(Math.random() * arrLen);
  }
  if (MODE === 'sticky_path') return hash32(urlPath) % arrLen;
  return Math.floor(Math.random() * arrLen);
}
function stripTags(s='') { return s.replace(/<\/?[^>]+>/g, ''); }
function htmlEscape(s='') {
  return s.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function sanitizeForTag(s, maxLen, fallback) {
  if (!s) return fallback;
  s = stripTags(String(s)).trim().replace(/\s+/g,' ');
  if (s.length > maxLen) s = s.slice(0, maxLen-1) + '…';
  return s || fallback;
}
// 提取 {tl}（Unicode 友好），仅返回 {tl} 的人类化标题
function extractTL(canonHref) {
  try {
    const u = new URL(canonHref);
    let last = u.pathname.split('/').filter(Boolean).pop() || '';
    last = decodeURIComponent(last);
    const m = last.match(/^([\p{L}\p{N}\-_.%]+)-(casino|lottery|player|gaming|lucky)(?:\.html)?$/iu);
    if (!m) return null;
    const tlSlug = m[1];
    const tlName = tlSlug.split(/[-_]+/).map(w => w ? (w[0].toUpperCase() + w.slice(1)) : '').join(' ').trim();
    return tlName;
  } catch { return null; }
}
// 选 Emoji（随机/路径稳定/关闭）
function pickEmoji(urlPath) {
  if (TITLE_EMOJI_MODE === 'off') return '';
  if (TITLE_EMOJI_MODE === 'sticky_path') return EMOJIS[hash32('t' + urlPath) % EMOJIS.length];
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}
// 前/后位置（路径稳定或随机）
function decorateTitle(base, urlPath) {
  const e = pickEmoji(urlPath);
  if (!e) return base;
  const front = (TITLE_EMOJI_MODE === 'sticky_path')
    ? (hash32('p' + urlPath) % 2 === 0)
    : (Math.random() < 0.5);
  return front ? `${e} ${base}` : `${base} ${e}`;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    if (!['GET','HEAD'].includes(method)) return env.ASSETS.fetch(req);

    // 1) 首页不改写
    if (url.pathname === '/') return env.ASSETS.fetch(req);

    // 2) 放行静态资源与真实 /amp/* 文件
    const isAsset =
      ASSET_EXT.test(url.pathname) ||
      url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/static/') ||
      url.pathname.startsWith('/_assets/') ||
      url.pathname.startsWith('/amp/');
    if (isAsset || !wantsHTML(req)) return env.ASSETS.fetch(req);

    const isHTMLPath = /\.html?$/i.test(url.pathname);
    const targetPath = isHTMLPath ? TARGET_B : TARGET_A;

    // 3) 读取模板
    let resp = await env.ASSETS.fetch(new Request(new URL(targetPath, url), req));
    if ([301,302,307,308].includes(resp.status)) {
      const loc = resp.headers.get('Location');
      if (loc) resp = await env.ASSETS.fetch(new Request(new URL(loc, url), req));
    }

    let html = await resp.text();
    const headers = new Headers(resp.headers);

    // 4) KV/文案索引
    const heroIdx = pickIndex(HERO_SNIPPETS.length, req, url.pathname, 'hero');
    const tlIdx   = pickIndex(TAGLINES.length, req, url.pathname, 'tg');

    // 5) canonical（优先 ?canon=；否则 DEFAULT_ORIGIN + 同路径）
    let canonical = null;
    const canonQ = url.searchParams.get('canon');
    if (canonQ) {
      try {
        const cu = new URL(canonQ);
        if (cu.protocol === 'https:' && canonQ.length < 2048) canonical = cu.href;
      } catch (_) {}
    }
    if (!canonical) {
      const u2 = new URL(url);
      u2.searchParams.delete('canon');
      canonical = DEFAULT_ORIGIN + u2.pathname + (u2.search || '');
    }

    // 6) 生成 Title/Description（带 Emoji）
    const tlName = extractTL(canonical);
    const autoTitleBase = tlName || DEFAULT_TITLE;
    const autoDescBase  =
      tlName
        ? `Play ${tlName} with UPI • Paytm • PhonePe. Register in 30s — OTP Login, Fast KYC. 18+ | T&Cs apply.`
        : DEFAULT_DESCRIPTION;

    const decoratedTitle = decorateTitle(autoTitleBase, url.pathname);
    const title = sanitizeForTag(decoratedTitle, 70,  DEFAULT_TITLE);
    const descr = sanitizeForTag(autoDescBase,    160, DEFAULT_DESCRIPTION);

    // 7) 替换占位符
    if (html.includes('%%HERO%%'))      html = html.replace('%%HERO%%', HERO_SNIPPETS[heroIdx]);
    if (html.includes('%%HERO_SRC%%'))  html = html.replace(/%%HERO_SRC%%/g, HERO_SOURCES[heroIdx]);
    if (html.includes('%%TAGLINE%%'))   html = html.replace(/%%TAGLINE%%/g, TAGLINES[tlIdx]);

    if (html.includes('%%CANONICAL%%'))   html = html.replace(/%%CANONICAL%%/g, canonical);
    if (html.includes('%%TITLE%%'))       html = html.replace(/%%TITLE%%/g, htmlEscape(title));
    if (html.includes('%%DESCRIPTION%%')) html = html.replace(/%%DESCRIPTION%%/g, htmlEscape(descr));
    if (tlName && html.includes('%%TL%%')) html = html.replace(/%%TL%%/g, htmlEscape(tlName));

    // 8) 缓存
    if (MODE === 'sticky_user') {
      headers.set('Vary', 'Accept, Cookie');
      headers.set('Cache-Control', 'private, max-age=0, no-cache');
      headers.append('Set-Cookie', `hero=${heroIdx}; Path=/; Max-Age=86400; SameSite=Lax`);
      headers.append('Set-Cookie', `tg=${tlIdx}; Path=/; Max-Age=86400; SameSite=Lax`);
    } else if (MODE === 'sticky_path') {
      headers.set('Vary', 'Accept');
      headers.set('Cache-Control', 'public, max-age=600, s-maxage=86400');
    } else {
      headers.set('Vary', 'Accept');
      headers.set('Cache-Control', 'no-store');
    }

    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('X-Canonical', canonical);
    headers.set('X-Title', title);
    headers.set('X-Description', descr);
    headers.set('X-Title-Emoji-Mode', TITLE_EMOJI_MODE);
    headers.delete('Location');

    return new Response(html, { status: 200, headers });
  }
};
