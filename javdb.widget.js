// JavDB 组件 for CapyPlayer
// 数据源: https://javdb.com（站点地址可在组件参数中更换为可用镜像）
// 模块: 热门 / 有码 / 无码 / 欧美 / FC2 / 动漫 / 搜索
// 列表 -> 详情信息（不含在线播放地址）
//
// 被 Cloudflare 拦截(403)时：在手机浏览器（推荐 Kiwi Browser）打开站点过
// 人机验证，复制 Cookie 填入「站点 Cookie」参数，并把「请求 UA」填成与
// 浏览器一致，即可正常访问（cookie 过期后需重新过验证）。
var WidgetMetadata = {
  id: "javdb",
  title: "JavDB",
  description: "JavDB 成人影片数据库：热门、分类与搜索，可查看影片详情信息（番号、发行日期、评分、演员、标签、磁力）。",
  author: "Hermes",
  version: "1.0.1",
  site: "https://javdb.com",
  icon: "https://c0.jdbstatic.com/images/logo_120x120.png",
  globalParams: [
    { name: "site", label: "站点地址", type: "string", defaultValue: "https://javdb.com", description: "主站被拦截时可更换为可用镜像域名" },
    { name: "cookie", label: "站点 Cookie", type: "string", defaultValue: "", description: "手机浏览器过 Cloudflare 人机验证后复制的 Cookie（可选，被拦截时填写）" },
    { name: "userAgent", label: "请求 UA", type: "string", defaultValue: "", description: "与过验证所用浏览器一致的 User-Agent（配合 Cookie 使用，可留空）" }
  ],
  modules: [
    { id: "hot", title: "热门", type: "media_list", functionName: "getHot", cacheDuration: 600, params: [{ name: "page", label: "页码", type: "page" }] },
    { id: "censored", title: "有码", type: "media_list", functionName: "getCensored", cacheDuration: 600, params: [{ name: "page", label: "页码", type: "page" }] },
    { id: "uncensored", title: "无码", type: "media_list", functionName: "getUncensored", cacheDuration: 600, params: [{ name: "page", label: "页码", type: "page" }] },
    { id: "western", title: "欧美", type: "media_list", functionName: "getWestern", cacheDuration: 600, params: [{ name: "page", label: "页码", type: "page" }] },
    { id: "fc2", title: "FC2", type: "media_list", functionName: "getFc2", cacheDuration: 600, params: [{ name: "page", label: "页码", type: "page" }] },
    { id: "anime", title: "动漫", type: "media_list", functionName: "getAnime", cacheDuration: 600, params: [{ name: "page", label: "页码", type: "page" }] },
    { id: "search", title: "搜索", type: "media_list", functionName: "searchJavdb", cacheDuration: 300, params: [
      { name: "q", label: "关键词", type: "string", required: true, description: "番号或标题关键词" },
      { name: "page", label: "页码", type: "page" }
    ] }
  ]
};

var DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// 当前站点 / cookie / UA（globalParams 由数据源函数写入，loadDetail 读取）
var _site = "https://javdb.com";
var _cookie = "";
var _ua = DEFAULT_UA;

function siteBase(params) {
  var s = (params && params.site) ? String(params.site) : "https://javdb.com";
  return s.replace(/\/+$/, "");
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

// ---- 请求层 ----
async function fetchHtml(url, query) {
  // 优先取持久化的 cookie/UA（loadDetail 不经过模块参数，从 storage 读取）
  var cookie = Widget.storage.get("javdb_cookie", "");
  var ua = Widget.storage.get("javdb_ua", "");
  if (!cookie) cookie = _cookie;
  if (!ua) ua = _ua;
  var headers = {
    "User-Agent": ua || DEFAULT_UA,
    "Accept-Language": "zh-CN,zh;q=0.9,ja;q=0.8"
  };
  if (cookie) headers["Cookie"] = cookie;
  var resp = await Widget.http.get(url, {
    params: query || {},
    headers: headers,
    timeout: 30000
  });
  if (!resp.ok) {
    if (resp.status === 403) {
      throw new Error("HTTP 403 被 Cloudflare 拦截：请在组件参数中填写「站点 Cookie」（手机浏览器过人机验证后复制）");
    }
    throw new Error("HTTP " + resp.status + " - " + url);
  }
  var html = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data || "");
  if (html.indexOf("Just a moment") !== -1 || html.indexOf("challenge-platform") !== -1 || html.indexOf("cf-chl-") !== -1) {
    throw new Error("站点被 Cloudflare 拦截：请在组件参数中填写「站点 Cookie」（手机浏览器过人机验证后复制）");
  }
  return html;
}

// ---- 解析层 ----
// 列表卡片: <a class="box" href=".../v/CODE" title="标题"> 内含 .cover img / .video-title / .score .value / .meta
function parseList(html) {
  var docId = Widget.dom.parse(html);
  var cards = Widget.dom.select(docId, "a.box");
  var items = [];
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];
    var attrs = card.attributes || {};
    var href = attrs.href || "";
    var m = href.match(/\/v\/([A-Za-z0-9]+)/);
    if (!m) continue;
    var code = m[1];

    var inner = card.html || "";
    var imgM = inner.match(/<img[^>]*src="([^"]+)"/);
    var poster = imgM ? imgM[1] : "";

    // 完整标题（番号+标题）优先取 .video-title 的文本
    var vtM = inner.match(/<div class="video-title">([\s\S]*?)<\/div>/);
    var title = vtM ? stripTags(vtM[1]) : "";
    if (!title) title = attrs.title ? String(attrs.title).trim() : "";
    if (!title) title = cleanText(card.text);

    var cardText = cleanText(card.text);
    var rating = null;
    var rm = cardText.match(/(\d+(?:\.\d+)?), by \d+ users/);
    if (rm) rating = parseFloat(rm[1]);

    var year = null;
    var ym = cardText.match(/\d{2}\/\d{2}\/(\d{4})/);
    if (ym) year = ym[1];

    items.push({
      id: code,
      title: title || code,
      posterUrl: poster,
      rating: rating,
      year: year ? String(year) : null,
      mediaType: "movie",
      link: "/v/" + code
    });
  }
  Widget.dom.remove(docId);
  return items;
}

// 详情信息块: <nav class="panel movie-panel-info"> 内 .panel-block，文本形如 "Released Date: 2018-02-01"
function parseDetail(html) {
  var docId = Widget.dom.parse(html);

  var h2s = Widget.dom.select(docId, "h2.title strong");
  var parts = [];
  for (var i = 0; i < h2s.length; i++) {
    var t = cleanText(h2s[i].text);
    if (t) parts.push(t);
  }
  var title = parts.join(" ").trim();

  var covers = Widget.dom.select(docId, "img.video-cover");
  var poster = covers.length ? (covers[0].attributes.src || "") : "";

  var tiles = Widget.dom.select(docId, "a.tile-item");
  var backdrop = tiles.length ? (tiles[0].attributes.href || "") : "";

  var rating = null, year = null;
  var released = "", duration = "", director = "", maker = "", actors = "", tags = "";

  var blocks = Widget.dom.select(docId, ".movie-panel-info .panel-block");
  for (var j = 0; j < blocks.length; j++) {
    var bt = cleanText(blocks[j].text);
    var bm = bt.match(/^(ID|Released Date|Duration|Director|Maker|Publisher|Rating|Tags|Actor\(s\))\s*:?\s*(.*)$/);
    if (!bm) continue;
    var label = bm[1];
    var vtext = bm[2].trim();
    if (label === "Released Date") {
      released = vtext;
      var ym = vtext.match(/^(\d{4})/);
      if (ym) year = ym[1];
    } else if (label === "Rating") {
      var rm = vtext.match(/(\d+(?:\.\d+)?)/);
      if (rm) rating = parseFloat(rm[1]);
    } else if (label === "Duration") {
      duration = vtext;
    } else if (label === "Director") {
      director = vtext;
    } else if (label === "Maker") {
      maker = vtext;
    } else if (label === "Actor(s)") {
      actors = vtext.replace(/[♀♂]/g, " ").replace(/\s+/g, " ").trim();
    } else if (label === "Tags") {
      tags = vtext.replace(/\s*,\s*/g, ", ").trim();
    }
  }

  // 磁力链接: #magnets-content .item，内部 a[href^="magnet:"]
  var magnets = [];
  var items = Widget.dom.select(docId, "#magnets-content .item");
  for (var k = 0; k < items.length; k++) {
    var inner = items[k].html || "";
    var mm = inner.match(/href="(magnet:[^"]*)"/);
    if (!mm) continue;
    var nameM = inner.match(/class="name"[^>]*>([\s\S]*?)<\/span>/);
    var sizeM = inner.match(/class="meta"[^>]*>([\s\S]*?)<\/span>/);
    magnets.push({
      name: nameM ? stripTags(nameM[1]) : mm[1].slice(0, 60),
      size: sizeM ? stripTags(sizeM[1]) : "",
      magnet: mm[1].replace(/&amp;/g, "&")
    });
  }
  Widget.dom.remove(docId);

  var desc = [];
  if (released) desc.push("发行日期: " + released);
  if (duration) desc.push("时长: " + duration);
  if (director) desc.push("导演: " + director);
  if (maker) desc.push("厂商: " + maker);
  if (actors) desc.push("演员: " + actors);
  if (tags) desc.push("标签: " + tags);
  if (magnets.length) {
    desc.push("");
    desc.push("磁力链接:");
    for (var q = 0; q < magnets.length && q < 5; q++) {
      desc.push("- " + magnets[q].name + (magnets[q].size ? " (" + magnets[q].size + ")" : ""));
    }
    if (magnets.length > 5) desc.push("- 等 " + magnets.length + " 个");
  }

  return {
    title: title || "JavDB",
    posterUrl: poster,
    backdropUrl: backdrop,
    rating: rating,
    year: year ? String(year) : null,
    description: desc.join("\n"),
    magnets: magnets
  };
}

// ---- 数据源函数（模块） ----
async function listModule(path, params, extra) {
  try {
    _site = siteBase(params);
    _cookie = (params && params.cookie) ? String(params.cookie).trim() : "";
    _ua = (params && params.userAgent) ? String(params.userAgent).trim() : DEFAULT_UA;
    if (_cookie) Widget.storage.set("javdb_cookie", _cookie);
    if (_ua !== DEFAULT_UA) Widget.storage.set("javdb_ua", _ua);
    var qp = { page: (params && params.page) || 1 };
    if (extra) {
      for (var k in extra) qp[k] = extra[k];
    }
    var html = await fetchHtml(_site + path, qp);
    return parseList(html);
  } catch (err) {
    console.error("javdb list failed", path, err.message);
    throw err;
  }
}

async function getHot(params) {
  return listModule("/", params);
}

async function getCensored(params) {
  return listModule("/censored", params);
}

async function getUncensored(params) {
  return listModule("/uncensored", params);
}

async function getWestern(params) {
  return listModule("/western", params);
}

async function getFc2(params) {
  return listModule("/fc2", params);
}

async function getAnime(params) {
  return listModule("/anime", params);
}

async function searchJavdb(params) {
  var q = (params && params.q ? String(params.q) : "").trim();
  if (!q) return [];
  return listModule("/search", params, { q: q });
}

// ---- 详情 ----
async function loadDetail(link) {
  if (!link) throw new Error("missing link");
  try {
    var url = link.indexOf("http") === 0 ? link : _site + link;
    var html = await fetchHtml(url);
    return parseDetail(html);
  } catch (err) {
    console.error("javdb detail failed", link, err.message);
    throw err;
  }
}
