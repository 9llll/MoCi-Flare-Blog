#  MoCi-Flare-Blog
### 轻量级博客与资源管理系统
### 基于 Cloudflare Workers + D1 + R2 + KV 全栈架构

在线预览：https://s.moci.cc/


项目简介
--------
MoCi-Flare-Blog 是一套轻量级博客与资源管理系统，采用卡片式布局展示文章，
支持资源下载、付费阅读、密码保护、邮件通知、AES加密跳转、
自定义单页等功能。零服务器成本，一键部署到 Cloudflare。


文件清单
--------
index.html      前端首页（卡片式布局、响应式、深色/浅色主题）
admin.html      管理后台（文章管理、分类、友链、单页、订单、SEO、SMTP）
worker.js       Cloudflare Worker（API服务、AES加密、数据库操作）
go.html         安全跳转页面（3秒倒计时、AES-256解密）
README.txt      本文件


功能特性
--------
[博客功能]
  - Quill 富文本编辑器
  - 文章封面自动提取
  - 二级分类筛选（支持自定义英文slug）
  - 文章独立URL（纯英文，无中文）
  - 发布时间显示（今天/昨天/日期）
  - 相关文章推荐
  - 上一篇/下一篇导航
  - 文章目录自动生成
  - 全文搜索

[资源下载]
  - 公开访问
  - 密码保护
  - 付费下载
  - 密码+付费
  - AES-256-GCM 加密安全跳转

[付费系统]
  - 扫码支付
  - 订单管理
  - 邮件自动发送下载链接

[设计]
  - 微软雅黑字体，靛蓝商务配色
  - 深色/浅色主题一键切换
  - PC 4列 / 平板 3列 / 手机 2列 自适应
  - 移动端汉堡菜单
  - 后台移动端自适应

[其他]
  - 自定义单页（支持导航栏显示/隐藏）
  - 友链管理
  - 广告位管理（6个位置）
  - SEO 配置（Meta/Sitemap/RSS/Robots）
  - 底部信息栏（自定义联系方式/版权/ICP/统计代码）
  - SMTP 邮件配置
  - 截图粘贴自动上传云端
  - 回到顶部按钮
  - 文章底部免责声明


部署步骤
--------

第一步：创建 Cloudflare 资源
  1. 创建 D1 数据库
  2. 创建 R2 存储桶
  3. 创建 KV 命名空间
  4. 配置 R2 自定义域名

第二步：初始化 D1 数据库
  进入 D1 控制台，逐条执行：

  CREATE TABLE articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT DEFAULT '',
    summary TEXT DEFAULT '',
    category TEXT DEFAULT '',
    category_slug TEXT DEFAULT '',
    subcategory TEXT DEFAULT '',
    subcategory_slug TEXT DEFAULT '',
    content TEXT DEFAULT '',
    cover TEXT DEFAULT '',
    resource_links TEXT DEFAULT '[]',
    article_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX idx_articles_created ON articles(created_at DESC);
  CREATE INDEX idx_articles_category ON articles(category_slug);
  CREATE INDEX idx_articles_slug ON articles(slug);

  CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL,
    resource_index INTEGER DEFAULT 0,
    user_email TEXT NOT NULL,
    amount REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX idx_orders_status ON orders(status);

第三步：部署 Worker
  1. 创建 Cloudflare Worker
  2. 粘贴 worker.js 代码
  3. 绑定 KV（变量名: SITE_DATA）
  4. 绑定 D1（变量名: DB）
  5. 绑定 R2（变量名: BUCKET）
  6. 修改配置项（见下方）
  7. 部署

第四步：上传前端文件
  将 index.html、admin.html、go.html 上传到站点根目录


配置说明
--------
部署前需修改以下占位符：

  worker.js 中：
    AES_KEY                  - 加密密钥（自定义字符串）
    ADMIN_HASH               - 管理密码 SHA-256 哈希
    r2.yourdomain.com        - 替换为你的 R2 域名
    s.yourdomain.com         - 替换为你的站点域名

  index.html 中：
    site-api.yourdomain.com  - 替换为你的 Worker 域名

  admin.html 中：
    site-api.yourdomain.com  - 替换为你的 Worker 域名

  go.html 中：
    s.yourdomain.com         - 替换为你的站点域名
    AES_KEY                  - 与 worker.js 保持一致


修改管理密码
-----------
在浏览器控制台运行以下代码，获取新密码的哈希值：

  async function hash(p) {
    const e = new TextEncoder();
    const b = await crypto.subtle.digest('SHA-256', e.encode(p));
    return Array.from(new Uint8Array(b)).map(x =>
      x.toString(16).padStart(2, '0')
    ).join('');
  }
  hash('你的新密码').then(console.log);

将输出的哈希值替换 worker.js 中的 ADMIN_HASH。


API 接口
--------
  GET    /data                    获取站点数据
  POST   /save                    保存站点配置（需密码）
  POST   /verify                  验证资源密码
  POST   /go                      生成加密跳转链接
  POST   /articles                创建文章（需密码）
  PUT    /articles/:id            更新文章（需密码）
  DELETE /articles/:id            删除文章（需密码）
  POST   /upload                  上传图片到R2（需密码）
  GET    /search?q=关键词          搜索文章
  POST   /order                   创建付费订单
  GET    /order-status?id=        查询订单状态
  GET    /orders                  获取订单列表（需密码）
  PUT    /order-confirm           确认收款并发送邮件（需密码）
  POST   /test-smtp               测试SMTP邮件（需密码）
  GET    /page/:slug.html         获取单页内容
  GET    /article/:cat/:slug.html 获取文章内容
  GET    /debug                   检查绑定状态


数据存储
--------
  KV (SITE_DATA)    - 站点配置、分类、友链、单页、广告、SEO、SMTP
  D1                - 文章内容、订单记录
  R2                - 上传的图片文件


安全特性
--------
  - 管理密码 SHA-256 验证
  - 资源密码服务端验证
  - 资源链接对前端不可见
  - AES-256-GCM 加密跳转
  - 图片自动上传云端，禁止 base64 存入数据库
  - MailChannels 邮件服务（免费）


技术栈
--------
  前端：原生 HTML/CSS/JS、Quill 编辑器、Highlight.js
  后端：Cloudflare Workers
  数据库：Cloudflare D1 (SQLite)
  存储：Cloudflare R2 + KV
  邮件：MailChannels
  加密：AES-256-GCM


注意事项
--------
  1. 部署前请确保 D1 表已创建
  2. Worker 需绑定 KV、D1、R2 三个资源
  3. R2 需配置公开访问域名
  4. AES_KEY 需在所有文件中保持一致
  5. 分类必须设置英文 slug，否则文章URL会出现中文
  6. 图片粘贴会自动上传R2，请勿直接粘贴 base64 图片


更新日志
--------
  v1.0  首次发布
        - 完整博客与资源管理功能
        - AES加密安全跳转
        - 付费订单系统
        - 响应式卡片布局
        - 图片自动上传云端
        - 分类自定义英文slug
        - 文章独立URL
        - 相关文章/上一篇下一篇
        - 深色/浅色主题


================================================================================
                            GNU 通用公共许可证
                     GNU General Public License v3.0
================================================================================

版权所有 (C) 2025  MoCi-Flare-Blog

本程序是自由软件：你可以基于自由软件基金会发布的 GNU 通用公共许可证
（GPL v3）的条款重新分发和/或修改它，无论使用许可证的第三版，还是
（由你选择）任何更新的版本。

本程序发布是希望它有用，但不提供任何担保；甚至不保证适销性或适用于
特定用途。更多细节请参见 GNU 通用公共许可证。

你应该已经收到了一份 GNU 通用公共许可证的副本和本程序。如果没有，
请参阅 <https://www.gnu.org/licenses/>。


条款摘要
--------
  ✅ 允许：商业使用、修改、分发、专利使用、私人使用
  ⚠️ 条件：必须开源、使用相同许可证、保留版权声明
  ❌ 限制：不提供担保、不承担法律责任


================================================================================
                       MoCi-Flare-Blog
          轻量级博客与资源管理系统 · Serverless 全栈架构
              基于 GPL v3 协议开源 · 二改必须开源
================================================================================
