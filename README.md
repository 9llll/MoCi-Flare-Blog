================================================================================
                    🌿 莫辞の资源库 - 项目部署文档
================================================================================

一个基于 Cloudflare Workers + D1 + R2 + KV 的轻量级博客与资源管理系统。


================================================================================
                         ✨ 功能特性
================================================================================

  📝 博客文章管理（Quill 富文本编辑器）
  📦 资源下载（公开 / 密码 / 付费）
  🔒 安全跳转（AES-GCM 加密 + go.html 免责声明）
  💰 付费系统（扫码支付 + 邮件通知）
  🎨 低饱和度蓝灰 + 暖金配色，深色/浅色切换
  📱 PC 4列 / 平板 3列 / 手机 2列自适应
  🔍 全文搜索、文章目录、相关文章、上一篇/下一篇
  📑 自定义单页、友链、广告位、SEO 配置
  🔐 AES-GCM 加密 + SHA-256 密码哈希
  ⚡ KV 缓存 + R2 图片缓存（CDN 加速）


================================================================================
                         🏗️ 技术栈
================================================================================

  前端         原生 HTML/CSS/JS
  后端         Cloudflare Workers
  数据库       D1 (SQLite)
  存储         R2 + KV
  邮件         MailChannels
  加密         Web Crypto API (AES-GCM + SHA-256)
  部署         Cloudflare Pages + Workers


================================================================================
                         📁 项目结构
================================================================================

  /
  ├── index.html                    # 前台空壳（~1.5KB）
  ├── admin.html                    # 管理后台空壳（~3KB）
  ├── go.html                       # 安全跳转页面
  ├── go-browser.html               # 浏览器提示页面
  ├── _redirects                    # Cloudflare Pages 路由
  ├── static/
  │   ├── css/
  │   │   ├── main.css              # 前台样式
  │   │   └── admin.css             # 后台样式
  │   ├── js/
  │   │   ├── main.js               # 前台逻辑
  │   │   ├── admin.js              # 后台逻辑
  │   │   └── ua-detect.js          # 微信/QQ 检测
  │   └── lib/                      # 第三方库（可选）
  └── README.md


================================================================================
                      🚀 一键部署（推荐）
================================================================================


  📌 方式一：Cloudflare Pages + Workers（官方推荐）
  ──────────────────────────────────────────────────────────────────────────────

  第 1 步：Fork 本仓库
  ────────────────────
  点击 GitHub 右上角的 Fork 按钮，将仓库复制到你的账号下。


  第 2 步：部署 Cloudflare Pages
  ──────────────────────────────

  方式 A：通过 Dashboard（Web 界面）
  ──────────────────────────────────
  1. 登录 Cloudflare Dashboard（https://dash.cloudflare.com）
  2. 进入 Pages → 创建项目 → 连接 GitHub
  3. 选择你 Fork 的仓库
  4. 构建设置：
     - 构建命令：留空
     - 输出目录：/
  5. 点击「保存并部署」
  6. 设置自定义域名（可选）

  方式 B：通过 Wrangler CLI（命令行）
  ────────────────────────────────────
  npm install -g wrangler
  wrangler login
  wrangler pages deploy . --project-name=你的项目名


  第 3 步：部署 Cloudflare Worker
  ────────────────────────────────

  1. 安装 Wrangler
  npm install -g wrangler

  2. 登录
  wrangler login

  3. 创建 wrangler.toml（参考下方配置）
  4. 部署 Worker
  wrangler deploy


  wrangler.toml 配置示例：
  ────────────────────────

  name = "site-api"
  main = "worker.js"
  compatibility_date = "2024-01-01"

  [[d1_databases]]
  binding = "DB"
  database_name = "你的D1数据库名"
  database_id = "你的D1数据库ID"

  [[r2_buckets]]
  binding = "BUCKET"
  bucket_name = "你的R2存储桶名"

  [[kv_namespaces]]
  binding = "SITE_DATA"
  id = "你的KV命名空间ID"


  第 4 步：创建 D1 数据库
  ────────────────────────

  在 Cloudflare D1 控制台或通过 wrangler 执行以下 SQL：

  CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      title TEXT,
      slug TEXT,
      summary TEXT,
      category TEXT,
      category_slug TEXT,
      subcategory TEXT,
      subcategory_slug TEXT,
      content TEXT,
      cover TEXT,
      resource_links TEXT,
      article_order INTEGER,
      created_at INTEGER,
      updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      article_id TEXT,
      resource_index INTEGER,
      user_email TEXT,
      amount REAL,
      status TEXT,
      created_at INTEGER,
      updated_at INTEGER
  );

  CREATE INDEX idx_articles_category_slug ON articles(category_slug);
  CREATE INDEX idx_articles_slug ON articles(slug);
  CREATE INDEX idx_orders_status ON orders(status);
  CREATE INDEX idx_orders_created_at ON orders(created_at);

  通过 Wrangler 执行：
  wrangler d1 execute 你的D1数据库名 --file=schema.sql


  第 5 步：配置环境变量（可选）
  ─────────────────────────────

  # 设置 AES 加密密钥
  wrangler secret put AES_KEY
  # 输入: 你的32字节密钥（如: your-32-byte-secret-key-here!!!!!）


================================================================================


  📌 方式二：Vercel + Cloudflare Workers
  ──────────────────────────────────────────────────────────────────────────────

  # 1. 安装 Vercel CLI
  npm install -g vercel

  # 2. 部署静态文件到 Vercel
  vercel --prod

  # 3. Worker 仍部署在 Cloudflare（参考方式一第 3 步）


================================================================================


  📌 方式三：Netlify + Cloudflare Workers
  ──────────────────────────────────────────────────────────────────────────────

  # 1. 登录 Netlify
  # 2. 连接 GitHub 仓库
  # 3. 构建设置：
  #    - 构建命令：留空
  #    - 发布目录：/
  # 4. 点击部署

  # Worker 仍部署在 Cloudflare（参考方式一第 3 步）


================================================================================


  📌 方式四：纯静态托管 + Worker（最简方案）
  ──────────────────────────────────────────────────────────────────────────────

  # 1. 将静态文件上传到任何静态托管服务
  #    - Cloudflare Pages（推荐）
  #    - Vercel
  #    - Netlify
  #    - GitHub Pages
  #    - 阿里云 OSS + CDN

  # 2. Worker 部署在 Cloudflare（参考方式一第 3 步）


================================================================================
                      🔧 本地开发
================================================================================


  1. 克隆仓库
  ─────────────
  git clone https://github.com/你的用户名/你的仓库名.git
  cd 你的仓库名


  2. 修改配置
  ────────────
  编辑 static/js/main.js 和 static/js/admin.js 中的 API 地址：

  const API = 'https://site-api.moci.cc';  // 改为你的 Worker 地址


  3. 本地预览
  ────────────

  # 使用 Python 简单预览
  python3 -m http.server 8080

  # 或使用 Node.js
  npx serve .

  # 或使用 Wrangler
  wrangler pages dev .


================================================================================
                      🔐 安全配置
================================================================================


  1. 修改管理密码
  ─────────────────
  在 worker.js 中找到 ADMIN_HASH：
  const ADMIN_HASH = '你的SHA-256哈希值';

  生成新密码哈希（在浏览器控制台执行）：
  输入你的密码，获取 SHA-256 哈希
  工具：https://emn178.github.io/online-tools/sha256.html


  2. 修改 AES 加密密钥
  ──────────────────────

  方式 A：通过环境变量（推荐）
  wrangler secret put AES_KEY
  # 输入: 你的32字节密钥

  方式 B：直接修改 worker.js
  const AES_KEY = 'your-32-byte-secret-key-here!!!!!';


  3. 修改密钥（在 admin.html 中）
  ────────────────────────────────
  // admin.html 中的管理密码
  const PWD = '你的管理密码';
  const ADMIN_HASH = '你的SHA-256哈希值';


================================================================================
                      📦 环境变量
================================================================================

  变量名         说明                        必填
  ────────────────────────────────────────────────────────────────
  AES_KEY        AES-GCM 加密密钥（32字节）    ✅
  DB             D1 数据库绑定                 ✅
  BUCKET         R2 存储桶绑定                 ✅
  SITE_DATA      KV 命名空间绑定               ✅


================================================================================
                      🧪 测试验证
================================================================================


  1. 访问首页
  ─────────────
  curl https://你的域名/


  2. 访问管理后台
  ────────────────
  curl https://你的域名/admin.html
  # 输入管理密码登录


  3. 测试 API
  ────────────

  # 获取数据
  curl https://site-api.moci.cc/data

  # 验证密码
  curl -X POST https://site-api.moci.cc/verify \
    -H "Content-Type: application/json" \
    -d '{"articleId":"xxx","resourceIndex":0,"password":"你的密码哈希"}'

  # 获取加密下载链接
  curl -X POST https://site-api.moci.cc/get-go-url \
    -H "Content-Type: application/json" \
    -d '{"articleId":"xxx","resourceIndex":0}'


================================================================================
                      📱 移动端适配
================================================================================

  ✅ 汉堡菜单（左对齐）
  ✅ 搜索框（点击展开）
  ✅ 分类标签缩小
  ✅ 卡片 2 列布局
  ✅ 响应式弹窗
  ✅ 触摸友好按钮


================================================================================
                      🛠️ 常见问题
================================================================================


  Q: 首页加载慢？
  ─────────────────
  A: 已实现 KV 缓存，首次加载后后续访问 < 200ms。
     如仍慢，检查 D1 数据库冷启动。


  Q: 图片上传失败？
  ──────────────────
  A: 检查 R2 存储桶权限，确保 Worker 有写入权限。


  Q: 邮件发送失败？
  ──────────────────
  A: 检查 SMTP 配置，或使用 MailChannels 默认配置。


  Q: 密码验证失败？
  ──────────────────
  A: 确保密码是 SHA-256 哈希值，且与数据库中存储的哈希一致。


  Q: 部署后页面空白？
  ────────────────────
  A: 检查 _redirects 文件是否正确，
     确认 /article/* 和 /page/* 路由配置。


  Q: 微信/QQ 中打开提示跳转浏览器？
  ──────────────────────────────────
  A: 这是正常行为，微信/QQ 内无法正常下载，
     跳转到 go-browser.html 提示用户用浏览器打开。


================================================================================
                      📊 部署方式对比
================================================================================

  方式                           难度  速度  费用      推荐
  ────────────────────────────────────────────────────────────────
  Cloudflare Pages + Workers     ⭐⭐   ⚡快  免费      ✅ 强烈推荐
  Vercel + Workers               ⭐⭐   ⚡快  免费      ✅ 推荐
  Netlify + Workers              ⭐⭐   ⚡快  免费      ✅ 推荐
  GitHub Pages + Workers         ⭐⭐⭐  🐢慢  免费      ⚠️ 国内访问慢
  阿里云 OSS + Workers           ⭐⭐⭐  ⚡快  付费      ⚠️ 需要域名备案


================================================================================
                      📄 许可证
================================================================================

  MIT License


================================================================================
                      📞 联系方式
================================================================================

  如有问题，请通过以下方式联系：

  邮箱：x@moci.cc
  网站：https://www.moci.cc


================================================================================

                    Made with ❤️ by 莫辞

================================================================================
