# Casa do Mar — 可运行的多语言民宿预订站点（原型）

这是方案文档里「方案 A」的可运行落地版本：一个 **12 个单元**、**7 种语言**（英/葡/法/西/俄/阿/中，含 RTL）、**5 步站内预订闭环**、**可切换浅色 / 深色 / 三种强调色** 的静态站点。

零依赖、零构建：没有 npm 安装、没有打包器，双击 `index.html` 就能跑。

**已上线**：https://cry339700-cmyk.github.io/casa-do-mar-prototype/ ——部署、更新、换托管商、绑域名、上线前清单见 [DEPLOY.md](DEPLOY.md)。

```
apartments-site/
├── index.html            # 唯一的 HTML 外壳（含首屏前解析配色的内联脚本）
├── assets/
│   ├── styles.css        # 全部样式：语义 token + 两套配色，逻辑属性写满，RTL 共用同一份
│   ├── core.js           # 纯逻辑：定价/档期/校验/格式化（无 DOM，可被 node 测试直接加载）
│   └── app.js            # 哈希路由 + 视图 + 日历 + 预订向导 + 模拟支付 + 配色切换
├── data/site-data.js     # 12 个单元、费率、季节系数、税费、封房窗口、语言清单
├── i18n/{en,pt,fr,es,ru,ar,zh}.js  # 七份词表，键集完全一致（189 键）
├── tests/                # node --test：core 15 + theme 6 + smoke 20 = 41 项
└── package.json
```

## 运行

```bash
# 方式一：直接打开（file:// 可用，路由走 hash）
open index.html

# 方式二：本地服务器（推荐，测试与分享都用这个）
cd apartments-site && python3 -m http.server 8080   # 然后访问 http://localhost:8080
```

跑测试（需要 Node 18+，无依赖）：

```bash
cd apartments-site && node --test tests/*.test.mjs tests/app.smoke.mjs
# 41 项全部通过
```

## 已实现的验收点

| 要求 | 实现情况 |
| --- | --- |
| 英语 / 葡语 / 法语 / 西语必备 | 四语齐全，英语为默认且 **不带前缀**（`#/`），其余为 `#/pt/` `#/fr/` `#/es/` |
| 追加俄语 | 完整词表 + 俄语三复数（1 ночь / 2 ночи / 5 ночей，21 ночь） |
| 追加阿拉伯语 + RTL | `<html dir="rtl">`、阿拉伯字体栈、日历翻页箭头镜像；样式表内零 `left/right`，全部用 `margin-inline`/`padding-inline`/`inset-inline` 等逻辑属性 |
| 追加简体中文 | 完整词表（189 键与英文一一对应），另配中文排版规则（见下） |
| 站内完成：选房 → 选日期 → 价格与可订 → 提交与支付 → 确认 | 5 步向导 + 确认页，状态全部写在 URL 里，可前进可后退可刷新 |
| 深色模式（黑底、黑字变白、橙色更醒目） | 语义 token 双套值；正文 `#f4eee3` on `#14110d`（16.3:1），强调色由 `#b0523c` 提亮到 `#e2795a`（4.57:1 → 6.38:1），按钮文字反转为深色压在橙底上 |
| 未知项不编造 | 页面上以 `.ph` 高亮 `LEGAL_ENTITY_TBD` / `LICENSE_NO` / `ADDRESS_TBD` / `DOMAIN_TBD`，页脚明确列出占位范围 |

## 截图（docs/screenshots/）

| 页面 | 说明 |
| --- | --- |
| ![首页](docs/screenshots/home-en.png) | 浅色首页：拱门装饰替代缺失的照片（D11 待补充），不做假图 |
| ![深色首页](docs/screenshots/home-en-dark.png) | 深色首页：纸底转墨底，正文近白，强调色更亮而不是被压暗 |
| ![中文首页](docs/screenshots/home-zh.png) | 中文首页：宋体标题、1.75 行高、无字距 |
| ![中文深色](docs/screenshots/home-zh-dark.png) | 中文 + 深色：两套体系的交叉验证 |
| ![公寓列表](docs/screenshots/apartments-en.png) | 列表：房型筛选 + 有房/无房标签，卡片用同一拱形母题 |
| ![深色列表](docs/screenshots/apartments-en-dark.png) | 深色列表：卡片比纸底浅一档，靠色阶而不是边框区分层次 |
| ![单元页](docs/screenshots/unit-en.png) | 单元页：右栏黏性报价卡，日历里被占的夜晚划掉且点不动 |
| ![深色单元页](docs/screenshots/unit-en-dark.png) | 深色单元页：报价明细、税行「待确认」标记都在深色下重算过对比度 |
| ![预订第 3 步](docs/screenshots/booking-step3-en.png) | 第 3 步「核对」：先把住宿事实和价格摆出来，再让人填资料 |
| ![预订第 4 步](docs/screenshots/booking-step4-en.png) | 第 4 步「资料」：入住人信息 + 同意条款 |
| ![深色核对页](docs/screenshots/booking-review-en-dark.png) | 深色核对页：步骤条当前项与计数一致（5 步） |
| ![深色支付页](docs/screenshots/booking-payment-en-dark.png) | 深色支付页：主按钮用提亮后的橙底 + 深色文字 |
| ![确认页](docs/screenshots/confirmation-en.png) | 确认页：编号、住宿事实、金额明细、加日历 / 打印 / 取消 |
| ![深色确认页](docs/screenshots/confirmation-en-dark.png) | 深色确认页：收据卡片靠纸色差浮起，虚线分隔仍然可见 |
| ![阿拉伯语首页](docs/screenshots/home-ar-rtl.png) | 阿拉伯语：整站镜像，导航、数字、拱门全部翻转 |
| ![阿拉伯语深色](docs/screenshots/home-ar-rtl-dark.png) | 阿拉伯语 + 深色：RTL 与配色互不干扰 |
| ![橄榄色深色](docs/screenshots/home-en-olive-dark.png) | 换强调色（橄榄）：一处 token 切换，全站按钮/链接/星标跟着变 |
| ![设置菜单](docs/screenshots/setts-menu-dark.png) | 显示设置：跟随系统 / 浅色 / 深色 + 三个强调色色板 |
| ![移动端深色](docs/screenshots/home-mobile-en-dark.png) | 390×844 移动端：无横向溢出，导航折行，卡片单列 |

## 配色系统（浅色 / 深色 / 强调色）

三层结构，**深色不是滤镜，是第二套 token 值**：

1. `--paper/--paper-2/--paper-3/--card`（底）、`--ink…--ink-4`（字）、`--clay/--olive/--brass`（强调）、`--line/--sel/--ring`（结构）、`--ok/--err`（状态）。组件只写 `var(--token)`，样式表里不再出现第二处硬编码颜色。
2. `html[data-theme="dark"]` 换的是同一批 token 的值，所以组件代码一行没改就有深色。
3. `html[data-accent="olive"|"brass"]` 只覆盖强调色相关的几个 token，浅色深色都成立。

几个关键决策：

- **橙色要更醒目，而不是更暗**。浅色的 `#b0523c` 压在近黑底上会糊成褐色，深色改用 `#e2795a`（对比 6.38:1，浅色只有 4.57:1）。测试里直接断言「深色强调色的亮度 ≥ 浅色的 1.4 倍」且「在深底上比在浅底上更跳」。
- **按钮文字翻转**。深色下橙底上的字从 `#fdf9f4` 换成 `#1a1310`（6.17:1），否则就是白字压亮橙，看着刺眼且过不了对比度。
- **首屏不闪白**。`index.html` 在样式表之前跑一段内联脚本，读 `localStorage` 与 `prefers-color-scheme`，先把 `data-theme` 写到 `<html>`，再取样式。配色切换是「自动」时，系统主题变化会实时跟随。
- **打印强制回浅色**。`@media print` 里把 `html[data-theme="dark"]` 一并改回浅色 token，确认页打印出来仍是白纸黑字。
- **测试守门**。`tests/theme.test.mjs` 读 `styles.css` 文本做六件事：两套配色的 token 集必须一致（少一个就回退成浅色值 = 深色页里出现白卡）、硬编码色值只能在 token 定义处出现一次、`var(--x)` 必须都有定义、10 组前景/背景在**两套**配色下都要 ≥ 4.5:1、深色强调色必须更亮、深色必须是真反转。

## 视觉与排版决策

- 版式走纸质编辑风：暖纸底、衬线大标题、2px 直角、大量留白。刻意避开「模板感」的圆角卡片 + 蓝色主按钮。
- 没有照片时**不放假图**：用统一的拱门线稿作为占位母题，卡片上写「户型 · 门牌」，页面上再以 `.ph` 高亮所有待补充的值。
- 中东与中文的字体、行高、字距分别处理：阿拉伯语走系统阿拉伯字体栈；中文用 `Songti SC / PingFang SC`，行高 1.75，标题字距归零（西文的 `letter-spacing` 在汉字上会散架）。
- 阿拉伯语不是「翻一下文字」：`<html dir="rtl">`、日历翻页箭头镜像、样式表零 `left/right`。
- 数字在 RTL 段落里用 `U+2066…U+2069`（LRI/PDI）成组隔离：否则 `€589.47` 会变成 `589.47€`、`−10%` 会变成 `%10−`、日期区间的两个日期会互换位置。日期整体隔离（`<bdi>`），因为阿拉伯语月份名是强 RTL 字符。
- 标签的 `text-transform` 只在词上生效，单位（m²）改写成 `Area / المساحة / Площадь / 面积` 这类词，避免出现 `M²`。

## 多语言做法

- 词表是**扁平键 + 插值**：`"quote.expires": "Quote held for {n} minutes"`，`t(key, vars)` 负责替换。
- 复数走 `Intl.PluralRules` 的等价实现（`core.js` 的 `pluralCategory`），键是 `"nights"` / `"guests"` 这样的对象：`{ one, few, many, other }`，缺类目自动回退；中文没有形态变化，`one` 与 `other` 用同一串。
- 语言切换只换 `state.locale` 并重渲染，不刷新整页；当前路径与查询串原样带过去，客人不会掉出预订流程。
- 语言名用 **各自语言的自称**（Português / Français / Русский / العربية / 中文），不做「Portuguese」式的英译。
- 阿拉伯语价格与日期强制 `numberingSystem: 'latn'`（避免阿拉伯-印度数字在价格上造成歧义），但文案本身从右到左。
- 词表键集有测试守着：**七份**词表键集必须完全一致、插值占位符必须一致、复数类目必须齐全——加语言时漏翻会直接测试失败。

## 预订流程（5 步，状态在 URL 里）

```
#/booking?step=1                                     1 选单元（12 个，显示最低价）
#/booking?unit=unit-05&in=…&out=…&g=2&step=2          2 选日期（日历 + 人数）
#/booking?…&step=3                                    3 核对（住宿事实 + 右侧价格与房态）
#/booking?…&step=4                                    4 资料（入住人信息 + 同意条款）
#/booking?…&step=5                                    5 支付（模拟）
#/confirmation/CDM-20260304-XXXX                      确认页（可下载 .ics / 取消）
```

步骤条、计数器与屏幕内容三者一致，由测试逐格断言（曾经把「核对」和「资料」合成一屏，导致付款页顶着「第 4 步」的帽子，现在锁死了）。

关键逻辑：

- `core.rangeCheck` 是唯一的档期裁判：`required → order → past → window → minStay → maxStay → blocked`，错误码一一对应到 i18n 文案。
- 日历里被占的夜晚直接 `disabled`，点不动，避免用户进入注定失败的报价。
- 报价 `core.quote` 返回明细行（住宿 / 清洁 / 加人 / 长住折扣 / 城市税），折扣行金额是负数，城市税带 `isPlaceholder` 标记并在界面上打星提示「税率待确认」。
- 折扣：≥7 晚 −10%，≥28 晚 −25%。周末（周五、周六）1.15 倍，季节系数 12 个月各不相同。
- 支付是**模拟**：Luhn 校验卡号、`MM/YY` 不过期、CVC 3–4 位；通过后生成 `CDM-YYYYMMDD-XXXX` 编号，写 `localStorage` 的 `lcs.bookings`，跳到确认页。测试里用 `4242 4242 4242 4242` / `12/29` / `123`。
- 已确认的订单会立刻占住档期（刷新日历即可看到那几天变灰）；取消后档期立刻释放。这两条都有测试覆盖。

## 接真实后端时要替换的三处

原型把「可信逻辑」和「不可信界面」分开了，替换点很窄：

1. `core.quote` → 服务端 `POST /api/quotes`（返回同样的 `lines[] / totalMinor / expiresAt` 结构，前端不用改渲染）。
2. `core.buildUnavailability` → 服务端档期表 + `booking_nights(unit_id, stay_date)` 主键锁（方案里的防超卖设计），前端只读 `GET /api/units/{id}/calendar`。
3. `validatePay` + `completeBooking` → 支付渠道的托管收银台 / 支付意图（3DS 在渠道侧完成），回调走 `POST /api/webhooks/payment`，成功后才有 `confirmed`。

订单编号、金额、税行都已在数据模型里预留（`totalMinor`、`dueNowMinor`、`lines[]`、`currency`），接真库时按方案 §4.3 的 `bookings` 表落库即可。

## 占位符清单（对回方案 D1–D12）

| 方案编号 | 占位符 | 出现位置 |
| --- | --- | --- |
| D1 | 国家 / 城市 | 全站文案只说「水边五分钟」，未写地名 |
| D2 | `LICENSE_NO` | `/legal`、页脚 |
| D3 | 支付渠道 | 模拟支付，未接任何 PSP |
| D4 | OTA / 渠道管理器 / PMS | 未接，档期来自本地 fixtures |
| D5 | 预算 / 技术栈 | 本原型用零构建静态站演示，不代表最终栈 |
| D6 | 品牌 `Casa do Mar` / `DOMAIN_TBD` / `LEGAL_ENTITY_TBD` | 站头、页脚、`/legal` |
| D7 | 上线时间 | 未涉及 |
| D8 | 单元类型 / 定价规则 | 4 种户型、12 个单元、季节与周末系数均为 fixture |
| D9 | 税费 | `quote.tax` 行标 `isPlaceholder`，界面打星 |
| D10 | 葡语变体 / 阿语数字 / 法务语言 | 葡语用中立写法，阿语数字用 latn，法务页仅英文占位；中文为通用简体，未做繁体或地区变体 |
| D11 | 图片素材 | 无照片，用排版化的「门牌」占位，未放任何外部图片 |
| D12 | 货币 / 时区 / 预订窗口 / 锁房时长 | `EUR`、12 个月窗口、报价 15 分钟、锁房 30 分钟（配置里可改） |

数据与配置全部集中在 `data/site-data.js` 一个文件：改价格、改单元数、改季节系数、改税、加语言，都不用动 `app.js`（加语言需要新增词表文件 + 在 `index.html` 与 `config.locales` 里登记）。

## 已知边界

- 无后端：刷新后订单还在（`localStorage`），换浏览器就没了。
- 无邮件：确认页写着「确认邮件已发往 …」，实际不发信。
- 无真实支付、无 3DS、无退款流程；取消只是把状态改成 `cancelled` 并释放档期。
- 无照片与地图（地图故意不加载，页面上写明了原因）。
- 配色只覆盖本原型的组件；接入真实设计系统时，新组件必须继续用语义 token，否则深色会漏白。`theme.test.mjs` 只能守住 `styles.css` 里的现状，守不住未来的新代码。
- 生产环境还需要：`hreflang`/`sitemap`/`robots`、服务端渲染的 `<html lang>`、结构化数据、真实 CMS 或词表管理流程、法务页本地化、以及 `prefers-color-scheme` 之外的用户偏好跨设备同步。
