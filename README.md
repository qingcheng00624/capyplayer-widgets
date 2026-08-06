# CapyPlayer Widgets

CapyPlayer 组件集合（https://capyplayer.feifeiduck.cn/zh/dev/widget/widgetdev）

## 组件列表

| 文件 | 说明 |
| --- | --- |
| [javdb.widget.js](javdb.widget.js) | JavDB 成人影片数据库：热门 / 有码 / 欧美 / 搜索（无码、FC2、动漫分类需要 JavDB 登录，暂不可用），详情含番号、发行日期、评分、演员、标签、磁力链接 |

## 安装方法

1. 复制组件 URL：
   `https://raw.githubusercontent.com/qingcheng00624/capyplayer-widgets/main/javdb.widget.js`
2. 打开 CapyPlayer App →「组件」页 → 点 `+`
3. 粘贴组件 URL，预览后安装

## 工作原理

组件默认走**中转服务**（`http://152.53.53.48:8456`）：服务端用云浏览器通过 Cloudflare 验证后抓取 JavDB 数据并转为 JSON，**无需任何配置**，打开即用。列表缓存 5 分钟、详情缓存 10 分钟。

### 直连模式（备用）

如果中转服务不可用，可在组件参数中把「数据源地址」改为 `https://javdb.com`（或可用镜像域名），组件自动切换为直连抓取。此时被 Cloudflare 拦截（HTTP 403）的话：

1. 手机安装 **Kiwi Browser**，打开 `https://javdb.com` 过人机验证
2. 装 **Cookie-Editor** 扩展（Chrome 应用商店），在 javdb.com 页面 Export → Header string 复制
3. 把 Cookie 填入组件「站点 Cookie」参数，UA 填入「请求 UA」（在 whatismybrowser.com 查看）
4. Cookie 过期后重复以上步骤

## 常见问题

- **无码 / FC2 / 动漫分类报「需要登录」**：JavDB 这些分类对未登录用户不可见，属正常限制，使用热门 / 有码 / 欧美 / 搜索即可。
- **中转服务延迟 3~8 秒**：云浏览器抓取需要时间，属正常，二次请求会命中缓存变快。
