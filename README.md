# 🌿 莫辞の资源库 - 项目部署文档


一个基于 Cloudflare Workers + D1 + R2 + KV 的轻量级博客与资源管理系统。


##  ✨ 功能特性   -详细查看：[功能介绍](https://github.com/9llll/MoCi-Flare-Blog/edit/main/Readme1.md)

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



# 🏗️ 技术栈

  前端         原生 HTML/CSS/JS
  后端         Cloudflare Workers
  数据库       D1 (SQLite)
  存储         R2 + KV
  邮件         MailChannels
  加密         Web Crypto API (AES-GCM + SHA-256)
  部署         Cloudflare Pages + Workers



#  🚀 一键部署（推荐）



  📌 方式一：Cloudflare Pages + Workers（官方推荐）
  ──────────────────────────────────────────────────────────────────────────────

  第 1 步：Fork 本仓库
  点击 GitHub 右上角的 Fork 按钮，将仓库复制到你的账号下。


  第 2 步：部署 Cloudflare Pages
  ──────────────────────────────

  方式 A：通过 Dashboard
  1. 登录 Cloudflare Dashboard（https://dash.cloudflare.com）
  2. 进入 Pages → 创建项目 → 连接 GitHub
  3. 选择你 Fork 的仓库
  4. 构建设置：构建命令留空，输出目录 /
  5. 点击「保存并部署」
  6. 设置自定义域名（可选）

  方式 B：通过 Wrangler CLI
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

  在 Cloudflare D1 控制台或通过 wrangler 执行：

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

  npm install -g vercel
  vercel --prod
  # Worker 仍部署在 Cloudflare（参考方式一第 3 步）


================================================================================


  📌 方式三：Netlify + Cloudflare Workers
  ──────────────────────────────────────────────────────────────────────────────

  登录 Netlify → 连接 GitHub 仓库 → 构建设置留空 → 部署
  # Worker 仍部署在 Cloudflare（参考方式一第 3 步）


================================================================================


  📌 方式四：纯静态托管 + Worker（最简方案）
  ──────────────────────────────────────────────────────────────────────────────

  1. 将静态文件上传到 Cloudflare Pages / Vercel / Netlify / GitHub Pages
  2. Worker 部署在 Cloudflare（参考方式一第 3 步）


================================================================================
                      🔧 本地开发
================================================================================

  git clone https://github.com/你的用户名/你的仓库名.git
  cd 你的仓库名

  修改 static/js/main.js 和 static/js/admin.js 中的 API 地址：
  const API = 'https://[你的Worker域名].workers.dev';

  本地预览：
  python3 -m http.server 8080
  或
  npx serve .
  或
  wrangler pages dev .


================================================================================
                      🔐 安全配置
================================================================================

  1. 修改管理密码
  在 worker.js 中找到 ADMIN_HASH，替换为你的 SHA-256 哈希值
  生成工具：https://emn178.github.io/online-tools/sha256.html

  2. 修改 AES 加密密钥
  wrangler secret put AES_KEY
  输入: 你的32字节密钥

  3. 修改密钥（在 admin.html 中）
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
                      📱 移动端适配
================================================================================

  ✅ 汉堡菜单（左对齐）
  ✅ 搜索框（点击展开）
  ✅ 分类标签缩小
  ✅ 卡片 2 列布局
  ✅ 响应式弹窗
  ✅ 触摸友好按钮


================================================================================
                      📄 许可证
================================================================================

  MIT License


================================================================================
                      📞 联系方式
================================================================================

  邮箱：x@moci.cc
  网站：https://www.moci.cc


================================================================================
                    Made with ❤️ by 莫辞
================================================================================
