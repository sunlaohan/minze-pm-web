# Portavia 本地复刻

参考站点：https://portavia.framer.website/projects

本项目保留参考站发布版本的 HTML、样式、响应式布局及交互运行时，字体、图片、图标、页面数据和模块均保存到本地。使用原发布布局作为复刻基线，避免手工近似重画导致动画、排版和细节偏差。它不是 Framer 编辑器源工程。

## 启动

需要 Node.js 20 或更新版本；预览和构建无需安装依赖。

```sh
npm run dev
```

访问 http://localhost:5173/projects 或 http://localhost:5173/ 。

```sh
npm run check
npm run build
npm run preview -- --port 4173
```

构建结果位于 `dist/`，每条路由生成独立的 `index.html`。

## 结构

- `src/pages/`：首页、About、Projects、Blogs、项目详情、文章详情和 404 的发布布局。
- `src/styles/local.css`：主题、导航、苹方字体和中英文排版层级。
- `src/scripts/local.js`：语言切换、图标主题开关、导航与动态内容本地化。
- `src/scripts/translations.js`：中文文案表，覆盖页面、项目、文章、FAQ 与图片说明；英文原文保持可切换。
- `src/scripts/profile-copy.js`：根据孙铭泽简历编写的中英文介绍、经历、项目案例与实践笔记；按页面和卡片作用域覆盖参考文案。
- `src/partials/navigation.html`：全站共用导航，语言切换后为太阳／月亮图标开关。
- `public/assets/media/`、`public/assets/fonts/`：本地图片、字体和媒体。
- `public/assets/runtime/`：参考站发布的交互及动画模块，保留依赖结构并将资源路径改成本地地址。
- `reference-manifest.json`：页面、素材来源及文件校验清单。
- `scripts/`：本地服务、构建、依赖完整性校验和参考基线同步工具。

## 已按要求调整

1. 首次访问默认中文、浅色模式。语言选择在本地保留；主题选择在当前浏览器会话内保留。
2. 深色背景为纯深黑色 `#080808`，移除噪点背景及其动效；明暗模式共用蓝紫色主题色 `#5e67e6`，主题色背景上的文字与图标均为白色。
3. 去掉服务列表悬停跟随的图片，保留列表展开、收起及文字反馈。
4. 去掉右下角 New release、Get Template 和 Made in Framer 推广内容。
5. 删除首页与 About 页的整个联系模块，以及导航中的 Contact 按钮；旧的 `#contact` 地址回到当前页面。
6. 桌面与手机导航均支持中英文切换，太阳／月亮图标控制位于语言切换之后，删除旧的底部开关。
7. 中文使用苹方（PingFang SC），按标题、次级标题、正文分别调整字号、字重和行距；英文沿用原版字体与排版。
8. 首页首屏的姓名与职位标题保留英文；一句话介绍随语言切换，中文为“把复杂业务，做成好用的 AI 产品。”，英文为“I turn complex workflows into practical AI products.”。中文胶囊按钮单独缩小字号并保留内边距，避免文字溢出。
9. 删除全站页脚的版权、创作来源和对应分隔线；社交图标及其模块全部保存本地，不再运行时从 Framer 加载。
10. 首页头像卡片正面使用用户提供的办公柴犬图片，以 4:5 比例等比裁切；翻转后的背面保留原电脑桌面照片。导航小头像同步为柴犬，并单独放大脸部。
11. About 页的人物照同步为办公柴犬，按原卡片等比裁切；其余轮播照片保留。
12. 根据简历更新能力、职业经历、项目、实践笔记、FAQ、联系方式及成果数字。首页 Banner 的姓名、职位标题、配图和样式保持原样，一句话介绍使用后续确认的中英文文案；原客户评价改为项目成果，避免保留模板的虚构背书。

导航、详情页、滚动动画、头像互动、服务列表、FAQ、移动导航和主题开关继续使用本地的原站交互。

## 表单

联系表单已删除。文章中的邮件订阅表单保留浏览器校验，本地预览不向模板作者后台提交数据；尚未连接实际订阅服务。

## 参考基线维护

正常开发无需重新下载参考站。如明确需要重新抓取，`scripts/mirror-reference.py` 使用 Python 3 和 `beautifulsoup4`，并自动执行 `scripts/customize-reference.py` 保留导航替换、联系模块移除等结构调整。重新同步会更新 `src/pages/` 和 `public/assets/` 的参考基线，执行前应保存本地修改；定制内容应优先维护在独立的 CSS、JS、文案表和导航模板中。
