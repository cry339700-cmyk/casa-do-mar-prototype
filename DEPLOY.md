# 部署上线（含现在已经上线的那一份）

## 0. 现状：站点已经在公网上了

| 项目 | 值 |
| --- | --- |
| 访问地址 | **https://cry339700-cmyk.github.io/casa-do-mar-prototype/** |
| 托管 | GitHub Pages（免费、HTTPS 自动签发、全球 CDN） |
| 源码仓库 | https://github.com/cry339700-cmyk/casa-do-mar-prototype （公开） |
| 发布分支 | `main`，发布根目录 `/` |
| 运行时文件 | `index.html` + `assets/` + `data/` + `i18n/`（约 130 KB，15 个文件） |

实测：首页与全部资源返回 200，Pages 构建状态 `built`，1440px 与移动端均无横向溢出，控制台零报错。

## 1. 改了代码怎么更新线上（最常用）

```bash
cd apartments-site
bash deploy/publish.sh        # 同步 → 有改动就提交推送，没改动就什么都不做
# 想看会改什么： DRY=1 bash deploy/publish.sh
```

脚本做的事：把 `index.html / robots.txt / .nojekyll / README.md / assets/ data/ i18n/` 同步到 `/tmp/cdm-pages` 这个 Pages 仓库克隆里（`--delete`，防止删掉的文件残留），有 diff 就提交并推送。GitHub Pages 通常 **20–60 秒**后生效，硬刷新（`Cmd+Shift+R`）就能看到。

为什么用 hash 路由反而省事：全站只有 `index.html` 一个入口，**不需要任何 rewrite 规则**，放在域名根目录或子目录（现在是子目录 `/casa-do-mar-prototype/`）都能跑；换成别的托管商也不用改配置。

## 2. 换一家托管商（三种路线，按省事程度排）

### A. Netlify Drop —— 最快，不碰命令行

1. 打开 https://app.netlify.com/drop
2. 把 `dist/casa-do-mar-site.zip` 直接拖进去（或拖 `apartments-site` 文件夹）
3. 得到 `https://<随机名>.netlify.app`，可在设置里改名、绑域名

适合：给客户看一眼、临时演示。仓库里的 `deploy/netlify.toml` 已经写好缓存头。

### B. Cloudflare Pages —— 国内访问相对稳，免费无限带宽

```bash
npm i -g wrangler          # 或 npx wrangler
cd apartments-site
npx wrangler pages deploy . --project-name casa-do-mar
```

构建命令留空、输出目录填 `.`（纯静态，无构建）。若要从 Git 仓库自动部署，在 Cloudflare 后台连 GitHub 仓库，构建命令空、输出目录 `/`。缓存头见 `deploy/cloudflare-headers.txt`（改名 `_headers`）。

### C. 自己的 VPS / 云服务器 —— 要自己的域名和完全控制时

```bash
cd apartments-site
docker build -f deploy/Dockerfile -t casa-do-mar:1 .
docker run -d --name casa -p 80:80 --restart unless-stopped casa-do-mar:1
```

`deploy/nginx.conf` 已经配好：静态资源 7 天强缓存、HTML 不缓存、gzip、`X-Content-Type-Options`、`Referrer-Policy`。要 HTTPS 就在前面加 Caddy（两行配置自动签发证书）或 `certbot --nginx`。

不用 Docker 也行：把运行时文件 rsync 到 `/var/www/casa-do-mar`，把 `deploy/nginx.conf` 放进 `/etc/nginx/conf.d/`。

| 路线 | 成本 | 上线耗时 | 适合 |
| --- | --- | --- | --- |
| GitHub Pages（已用） | 免费 | 已上线 | 演示、评审、内测 |
| Netlify Drop | 免费额度 | 1 分钟 | 临时给客户看 |
| Cloudflare Pages | 免费 | 5 分钟 | 正式对外、国内可访问性优先 |
| 自己的 VPS | 服务器费用 | 半小时 | 要绑定自己域名 + 后端 API 同机 |

## 3. 绑定自己的域名

占位符 **D6 `DOMAIN_TBD`** 一旦确定，按托管商操作：

- **GitHub Pages**：仓库 Settings → Pages → Custom domain 填 `www.example.com`，DNS 加一条 `CNAME www → cry339700-cmyk.github.io`；根域名（apex）用 4 条 A 记录指向 `185.199.108.153 / .109.153 / .110.153 / .111.153`。保存后勾上 **Enforce HTTPS**（证书自动签发，几分钟内生效）。仓库里同时新增一个内容为域名的 `CNAME` 文件，避免每次发布把自定义域名冲掉。
- **Cloudflare Pages**：项目 → Custom domains → 添加，DNS 在 Cloudflare 托管就一键完成。
- **自己的 VPS**：DNS A 记录指向服务器 IP，然后 `caddy reverse-proxy` 或 certbot 签证书。

注意：换了域名之后 `README` 和页面里所有 `DOMAIN_TBD` 要一起改成真实域名，页脚的占位提示也要同步删掉。

## 4. 上线前必须做的事（现在这份是原型，不是能收钱的站点）

1. **替换占位符**：`LICENSE_NO`（当地短租牌照）、`LEGAL_ENTITY_TBD`、`ADDRESS_TBD`、`DOMAIN_TBD`、品牌名、真实房价与税费规则（`data/site-data.js` 一个文件全包）。税费现在是「占位税率」，页面上打了星，**上线前必须换成真实规则**。
2. **接真实支付**：现在是模拟收银台（Luhn 校验 + 本地写单），一毛钱都收不到。真正收款必须有一个服务端：`POST /api/quotes`、`booking_nights(unit_id, stay_date)` 主键防超卖、托管收银台 + `POST /api/webhooks/payment` 回调。这条正好接回方案 §4 的 BFF 设计。
3. **法务页本地化**：`/policies` 与 `/legal` 现在只有英文占位文案，葡/法/西/俄/阿/中都要有真实版本；隐私政策与取消条款必须和实际营业规则一致（欧盟还涉及 GDPR 的 cookie 与数据留存说明）。
4. **把 `robots.txt` 从"禁止抓取"改成真实规则**，加上 `sitemap.xml`。
5. **关掉原型提示**：页脚那行「本版中的占位项…」和卡片上的「原型 / fixtures」说明要删。

## 5. 一个必须说清的限制：hash 路由不适合做 SEO

现在所有页面都是 `/#/zh/apartments/unit-05` 这种 hash 地址。hash 之后的部分**不会发给服务器**，搜索引擎只能看到一个 `index.html`，等于十二个单元页、七种语言版本全部无法单独被收录。

- 用于演示、评审、给房东/合伙人看：完全没问题，而且换托管商零配置。
- 要真正靠自然搜索获客：必须切到真实路径（`/zh/apartments/unit-05`）+ 服务端渲染或预渲染 + `hreflang` 互指 + 每页独立的 title/description/结构化数据（`LodgingBusiness`、`Offer`）。

这正是方案里「方案 A：Next.js SSR/ISR + next-intl」那一阶段要解决的问题。当前原型的价值是把**数据模型、定价逻辑、五步流程、七语词表、双配色**全部验证过一遍，迁到 Next.js 时 `core.js` 可以原样复用（它没有 DOM 依赖），词表也只是换一层加载方式。

## 6. 仓库与权限备注

- 公开仓库意味着任何人能看到源码与 fixture 数据。原型阶段没问题（里面没有任何真实个人信息、密钥或支付凭据），但**接入真实支付密钥后必须改成私有仓库**，密钥只能放服务端环境变量。
- 想撤回这次发布：`gh repo delete cry339700-cmyk/casa-do-mar-prototype` （或仓库 Settings → 底部 Delete），Pages 随之消失。
- 想换仓库名：`gh repo rename <新名>`，页面地址会变成 `https://cry339700-cmyk.github.io/<新名>/`，记得同步改 `deploy/publish.sh` 里的 `REPO_SLUG`。
