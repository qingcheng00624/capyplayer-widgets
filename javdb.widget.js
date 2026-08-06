// JavDB 组件 for CapyPlayer v1.0.4
// 双模式：
//  1) API 模式（默认）：走中转服务 http://152.53.53.48:8456
//     —— 服务端用云浏览器过 Cloudflare，无需任何配置，直接可用
//  2) 直连模式（备用）：站点地址填 https://javdb.com 等镜像域名，
//     被 CF 拦截时需在手机浏览器过人机验证并填「站点 Cookie」
// 模块: 热门 / 有码 / 无码 / 欧美 / FC2 / 动漫 / 搜索
// 列表 -> 详情信息（不含在线播放地址）
var WidgetMetadata = {
  id: "javdb",
  title: "JavDB",
  description: "JavDB 成人影片数据库：热门、分类与搜索，可查看影片详情信息（番号、发行日期、评分、演员、标签、磁力）。",
  author: "Hermes",
  version: "1.0.4",
  site: "http://152.53.53.48:8456",
  icon: "https://c0.jdbstatic.com/images/logo_120x120.png",
  globalParams: [
    { name: "site", label: "数据源地址", type: "string", defaultValue: "http://152.53.53.48:8456", description: "默认中转服务（免配置）；也可填 javdb 镜像域名走直连模式" },
    { name: "cookie", label: "站点 Cookie", type: "string", defaultValue: "", description: "仅直连模式被拦截时使用：手机浏览器过验证后复制的 Cookie" },
    { name: "userAgent", label: "请求 UA", type: "string", defaultValue: "", description: "仅直连模式使用：与过验证浏览器一致的 UA" }
  ],
  modules: [
    { id: "categories", title: "分类", type: "category", functionName: "getCategories", cacheDuration: 3600, description: "分类卡片：热门 / 有码 / 欧美" },
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

var _site = "http://152.53.53.48:8456";
var _cookie = "";
var _ua = DEFAULT_UA;

function siteBase(params) {
  var s = (params && params.site) ? String(params.site) : "http://152.53.53.48:8456";
  return s.replace(/\/+$/, "");
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

// ---- 请求层 ----
async function requestRaw(url, query, timeoutMs) {
  var headers = {
    "User-Agent": _ua,
    "Accept-Language": "zh-CN,zh;q=0.9,ja;q=0.8"
  };
  if (_cookie) headers["Cookie"] = _cookie;
  var resp = await Widget.http.get(url, {
    params: query || {},
    headers: headers,
    timeout: timeoutMs || 45000
  });
  if (!resp.ok) {
    throw new Error("HTTP " + resp.status + " - " + url);
  }
  return resp.data;
}

// 尝试解析 JSON；非 JSON 返回 null
function tryParseJson(data) {
  if (data && typeof data === "object") return data;
  if (typeof data !== "string") return null;
  var t = data.trim();
  if (t.indexOf("{") !== 0 && t.indexOf("[") !== 0) return null;
  try {
    return JSON.parse(t);
  } catch (e) {
    return null;
  }
}

// 直连模式 HTML 抓取（带 CF 检测）
async function fetchHtml(url, query) {
  var data = await requestRaw(url, query, 30000);
  var html = typeof data === "string" ? data : JSON.stringify(data || "");
  if (html.indexOf("Just a moment") !== -1 || html.indexOf("challenge-platform") !== -1 || html.indexOf("cf-chl-") !== -1) {
    throw new Error("站点被 Cloudflare 拦截：请改用默认中转地址，或在直连模式填「站点 Cookie」");
  }
  return html;
}

// ---- HTML 解析层（直连模式） ----
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
// 分类卡片（category 模块）：返回分类列表，点击后 params 透传给内容数据源
async function getCategories(params) {
  try {
    _site = siteBase(params);
    _cookie = (params && params.cookie) ? String(params.cookie).trim() : "";
    _ua = (params && params.userAgent) ? String(params.userAgent).trim() : DEFAULT_UA;
    return [
      { id: "hot", name: "热门", params: { category: "hot", page: 1 } },
      { id: "censored", name: "有码", params: { category: "censored", page: 1 } },
      { id: "western", name: "欧美", params: { category: "western", page: 1 } },
      { id: "fc2", name: "FC2", params: { category: "fc2", page: 1 } },
      { id: "anime", name: "动漫", params: { category: "anime", page: 1 } }
    ];
  } catch (err) {
    console.error("javdb categories failed", err.message);
    throw err;
  }
}

function pathForCategory(cat) {
  if (cat === "hot") return "/";
  if (cat === "censored") return "/censored";
  if (cat === "western") return "/western";
  if (cat === "fc2") return "/fc2";
  if (cat === "anime") return "/anime";
  if (cat === "uncensored") return "/uncensored";
  return "/";
}

async function listModule(path, params, extra) {
  try {
    _site = siteBase(params);
    _cookie = (params && params.cookie) ? String(params.cookie).trim() : "";
    _ua = (params && params.userAgent) ? String(params.userAgent).trim() : DEFAULT_UA;
    if (_cookie) Widget.storage.set("javdb_cookie", _cookie);
    if (_ua !== DEFAULT_UA) Widget.storage.set("javdb_ua", _ua);

    // 分类卡片透传的 category 参数 -> 映射路径
    if (params && params.category) {
      path = pathForCategory(String(params.category));
    }

    // API 模式：{site}/list?path=...&page=...
    var apiPath = path;
    if (extra && extra.q) apiPath += "?q=" + encodeURIComponent(String(extra.q));
    var data = await requestRaw(_site + "/list", { path: apiPath, page: (params && params.page) || 1 });
    var j = tryParseJson(data);
    if (j && Array.isArray(j.items)) {
      var out = [];
      for (var i = 0; i < j.items.length; i++) {
        var it = j.items[i] || {};
        var id = String(it.id || ("item_" + i));
        out.push({
          id: id,
          title: it.title || id,
          posterUrl: it.posterUrl || "",
          rating: typeof it.rating === "number" ? it.rating : null,
          year: it.year ? String(it.year) : null,
          mediaType: "movie",
          link: "/v/" + id
        });
      }
      return out;
    }
    if (j && j.error) throw new Error("API: " + j.error);

    // 降级：直连模式抓 HTML
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
    var codeM = String(link).match(/\/v\/([A-Za-z0-9]+)/);
    var code = codeM ? codeM[1] : String(link).replace(/^\/v\//, "");
    var data = await requestRaw(_site + "/detail", { code: code });
    var j = tryParseJson(data);
    if (j) {
      if (j.error) throw new Error("API: " + j.error);
      if (j.title) return j;
    }
    // 降级：直连模式
    var html = typeof data === "string" ? data : JSON.stringify(data || "");
    return parseDetail(html);
  } catch (err) {
    console.error("javdb detail failed", link, err.message);
    throw err;
  }
}

// ---- 资源（磁力链接列表，填充详情页「资源」区块） ----
// 组件协议中的 loadResources：返回资源项数组，每项至少含 videoUrl
async function loadResources(link) {
  if (!link) throw new Error("missing link");
  try {
    var codeM = String(link).match(/\/v\/([A-Za-z0-9]+)/);
    var code = codeM ? codeM[1] : String(link).replace(/^\/v\//, "");
    var data = await requestRaw(_site + "/detail", { code: code });
    var j = tryParseJson(data);
    var magnets = (j && Array.isArray(j.magnets)) ? j.magnets : [];
    if (j && j.error) throw new Error("API: " + j.error);
    if (!magnets.length) return [];
    var items = [];
    for (var i = 0; i < magnets.length; i++) {
      var m = magnets[i] || {};
      var name = m.name || ("资源 " + (i + 1));
      var size = m.size ? " (" + m.size + ")" : "";
      items.push({
        id: "magnet_" + i,
        title: name + size,
        videoUrl: m.magnet || "",
        description: m.size || ""
      });
    }
    return items;
  } catch (err) {
    console.error("javdb resources failed", link, err.message);
    throw err;
  }
}
