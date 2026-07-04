// ============================================================
// worker.js - 莫辞の资源库 API
// 技术栈: Cloudflare Workers + D1 + R2 + KV
// ============================================================

// ============================================================
// ⚠️ 请修改以下配置
// ============================================================

// AES 加密密钥（32字节，建议通过环境变量设置）
// 通过 wrangler secret put AES_KEY 设置更安全
const AES_KEY = 'your-32-byte-secret-key-here!!!!!';

// 管理员密码 SHA-256 哈希
// 默认密码: admin123
// 生成方式: 在浏览器控制台执行 SHA-256('你的密码')
// 工具: https://emn178.github.io/online-tools/sha256.html
const ADMIN_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';

// ============================================================
// AES 加密/解密函数
// ============================================================

/**
 * AES-GCM 加密
 */
async function aesEncrypt(plaintext) {
    try {
        const keyBytes = new TextEncoder().encode(AES_KEY).slice(0, 32);
        const key = await crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-GCM' },
            false,
            ['encrypt']
        );
        
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(plaintext);
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoded
        );
        
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);
        
        return btoa(String.fromCharCode(...combined));
    } catch (e) {
        console.error('加密失败:', e);
        return null;
    }
}

/**
 * AES-GCM 解密
 */
async function aesDecrypt(encryptedBase64) {
    try {
        const keyBytes = new TextEncoder().encode(AES_KEY).slice(0, 32);
        const key = await crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );
        
        const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12);
        const encrypted = combined.slice(12);
        
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            encrypted
        );
        
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error('解密失败:', e);
        return null;
    }
}

// ============================================================
// Worker 主入口
// ============================================================

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'application/json'
        };
        
        // OPTIONS 预检请求
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers });
        }

        // ============================================================
        // GET /debug - 调试接口
        // ============================================================
        if (request.method === 'GET' && url.pathname === '/debug') {
            return new Response(JSON.stringify({
                hasKV: !!env.SITE_DATA,
                hasDB: !!env.DB,
                hasBucket: !!env.BUCKET
            }), { headers });
        }

        // ============================================================
        // GET /decrypt-go-url - 解密 URL（go.html 调用）
        // ============================================================
        if (request.method === 'GET' && url.pathname === '/decrypt-go-url') {
            try {
                const token = url.searchParams.get('token');
                if (!token) {
                    return new Response(JSON.stringify({ error: '缺少令牌' }), {
                        status: 400,
                        headers
                    });
                }
                
                const decryptedUrl = await aesDecrypt(token);
                if (!decryptedUrl) {
                    return new Response(JSON.stringify({ error: '解密失败，令牌无效' }), {
                        status: 400,
                        headers
                    });
                }
                
                if (!decryptedUrl.startsWith('http://') && !decryptedUrl.startsWith('https://')) {
                    return new Response(JSON.stringify({ error: '链接格式无效' }), {
                        status: 400,
                        headers
                    });
                }
                
                return new Response(JSON.stringify({
                    success: true,
                    url: decryptedUrl
                }), { headers });
                
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 500,
                    headers
                });
            }
        }

        // ============================================================
        // GET /data - 获取全部数据（带 KV 缓存）
        // ============================================================
        if (request.method === 'GET' && url.pathname === '/data') {
            try {
                const cacheKey = 'data_cache';
                const cached = await env.SITE_DATA.get(cacheKey);
                if (cached) {
                    return new Response(cached, {
                        headers: { ...headers, 'Cache-Control': 'public, max-age=60' }
                    });
                }

                const rawData = await env.SITE_DATA.get('siteData');
                const config = rawData ? JSON.parse(rawData) : {
                    categories: [],
                    friends: [],
                    pages: [],
                    about: '',
                    site: {},
                    seo: {},
                    footer: {},
                    ads: {},
                    smtp: {}
                };

                let articles = [];
                if (env.DB) {
                    const { results } = await env.DB
                        .prepare('SELECT * FROM articles ORDER BY article_order ASC, created_at DESC')
                        .all();
                    articles = (results || []).map(a => {
                        let links = [];
                        if (typeof a.resource_links === 'string') {
                            try { links = JSON.parse(a.resource_links || '[]'); } catch(e) {}
                        } else if (Array.isArray(a.resource_links)) {
                            links = a.resource_links;
                        }
                        links = links.map(l => ({
                            title: l.title || '',
                            desc: l.desc || '',
                            image: l.image || '',
                            btnText: l.btnText || '下载',
                            accessType: l.accessType || 'free',
                            price: l.price || 0,
                            qrcode: l.qrcode || '',
                            hasPassword: !!(l.accessType === 'password'),
                            hasPay: !!(l.accessType === 'pay')
                        }));
                        const cover = a.cover || extractFirstImage(a.content || '');
                        return { ...a, cover, resource_links: links, password: undefined };
                    });
                }

                const result = JSON.stringify({ ...config, articles });
                await env.SITE_DATA.put(cacheKey, result, { expirationTtl: 60 });
                return new Response(result, {
                    headers: { ...headers, 'Cache-Control': 'public, max-age=60' }
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
            }
        }

        // ============================================================
        // POST /save - 保存配置（清除缓存）
        // ============================================================
        if (request.method === 'POST' && url.pathname === '/save') {
            try {
                const { password, data } = await request.json();
                if (!(await verifyAdmin(password))) {
                    return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers });
                }
                await env.SITE_DATA.put('siteData', JSON.stringify(data));
                await env.SITE_DATA.delete('data_cache');
                return new Response(JSON.stringify({ success: true }), { headers });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 400, headers });
            }
        }

        // ============================================================
        // POST /verify - 验证密码（接收 SHA-256 哈希值）
        // ============================================================
        if (request.method === 'POST' && url.pathname === '/verify') {
            try {
                const { articleId, resourceIndex, password } = await request.json();
                
                if (!articleId) {
                    return new Response(JSON.stringify({ valid: false, error: '缺少文章ID' }), { headers });
                }
                if (resourceIndex === undefined || resourceIndex === null) {
                    return new Response(JSON.stringify({ valid: false, error: '缺少资源索引' }), { headers });
                }
                
                const article = await env.DB
                    .prepare('SELECT * FROM articles WHERE id=?')
                    .bind(articleId)
                    .first();
                    
                if (!article) {
                    return new Response(JSON.stringify({ valid: false, error: '文章不存在' }), { headers });
                }
                
                let links = [];
                if (typeof article.resource_links === 'string') {
                    try { links = JSON.parse(article.resource_links || '[]'); } catch(e) {}
                } else if (Array.isArray(article.resource_links)) {
                    links = article.resource_links;
                }
                
                const res = links[resourceIndex || 0];
                if (!res) {
                    return new Response(JSON.stringify({ valid: false, error: '资源不存在' }), { headers });
                }
                
                const type = res.accessType || 'free';
                
                if (type === 'free') {
                    return new Response(JSON.stringify({ valid: true }), { headers });
                }
                
                if (type === 'password') {
                    if (!password) {
                        return new Response(JSON.stringify({ valid: false, error: '请输入密码' }), { headers });
                    }
                    if (password === res.password) {
                        return new Response(JSON.stringify({ valid: true }), { headers });
                    }
                    return new Response(JSON.stringify({ valid: false, error: '密码错误' }), { headers });
                }
                
                if (type === 'pay') {
                    return new Response(JSON.stringify({ valid: true, needPay: true }), { headers });
                }
                
                return new Response(JSON.stringify({ valid: false, error: '未知资源类型' }), { headers });
                
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 400,
                    headers
                });
            }
        }

        // ============================================================
        // POST /get-go-url - 获取加密的跳转链接
        // ============================================================
        if (request.method === 'POST' && url.pathname === '/get-go-url') {
            try {
                const { articleId, resourceIndex } = await request.json();
                
                if (!articleId) {
                    return new Response(JSON.stringify({ error: '缺少文章ID' }), {
                        status: 400,
                        headers
                    });
                }
                if (resourceIndex === undefined || resourceIndex === null) {
                    return new Response(JSON.stringify({ error: '缺少资源索引' }), {
                        status: 400,
                        headers
                    });
                }
                
                const article = await env.DB
                    .prepare('SELECT * FROM articles WHERE id=?')
                    .bind(articleId)
                    .first();
                    
                if (!article) {
                    return new Response(JSON.stringify({ error: '文章不存在' }), {
                        status: 404,
                        headers
                    });
                }
                
                let links = [];
                if (typeof article.resource_links === 'string') {
                    try { links = JSON.parse(article.resource_links || '[]'); } catch(e) {}
                } else if (Array.isArray(article.resource_links)) {
                    links = article.resource_links;
                }
                
                const res = links[resourceIndex || 0];
                if (!res) {
                    return new Response(JSON.stringify({ error: '资源不存在' }), {
                        status: 404,
                        headers
                    });
                }
                
                const targetUrl = res.url;
                if (!targetUrl || !targetUrl.trim()) {
                    return new Response(JSON.stringify({ error: '资源链接为空' }), {
                        status: 400,
                        headers
                    });
                }
                if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
                    return new Response(JSON.stringify({ error: '链接格式无效，请确保以 http:// 或 https:// 开头' }), {
                        status: 400,
                        headers
                    });
                }
                
                const encryptedToken = await aesEncrypt(targetUrl);
                if (!encryptedToken) {
                    return new Response(JSON.stringify({ error: '加密失败，请重试' }), {
                        status: 500,
                        headers
                    });
                }
                
                return new Response(JSON.stringify({
                    success: true,
                    goUrl: `https://[你的Pages域名]/go.html?token=${encodeURIComponent(encryptedToken)}`
                }), { headers });
                
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 500,
                    headers
                });
            }
        }

        // ============================================================
        // GET /article/:category_slug/:slug.html - 获取单篇文章
        // ============================================================
        if (request.method === 'GET' && url.pathname.startsWith('/article/')) {
            try {
                const parts = url.pathname.replace('/article/', '').split('/');
                if (parts.length === 2) {
                    const catSlug = parts[0];
                    const artSlug = parts[1].replace('.html', '');
                    
                    const cacheKey = `article_${catSlug}_${artSlug}`;
                    const cached = await env.SITE_DATA.get(cacheKey);
                    if (cached) {
                        return new Response(cached, {
                            headers: { ...headers, 'Cache-Control': 'public, max-age=300' }
                        });
                    }
                    
                    const article = await env.DB
                        .prepare('SELECT * FROM articles WHERE category_slug=? AND slug=?')
                        .bind(catSlug, artSlug)
                        .first();
                        
                    if (article) {
                        let links = [];
                        try { links = JSON.parse(article.resource_links || '[]'); } catch(e) {}
                        links = links.map(l => ({
                            title: l.title || '',
                            desc: l.desc || '',
                            image: l.image || '',
                            btnText: l.btnText || '下载',
                            accessType: l.accessType || 'free',
                            price: l.price || 0,
                            qrcode: l.qrcode || ''
                        }));
                        const cover = article.cover || extractFirstImage(article.content || '');
                        const result = JSON.stringify({ ...article, cover, resource_links: links });
                        
                        await env.SITE_DATA.put(cacheKey, result, { expirationTtl: 300 });
                        return new Response(result, {
                            headers: { ...headers, 'Cache-Control': 'public, max-age=300' }
                        });
                    }
                }
                return new Response(JSON.stringify({ error: '文章不存在' }), { status: 404, headers });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
            }
        }

        // ============================================================
        // GET /page/:slug.html - 获取单页
        // ============================================================
        if (request.method === 'GET' && url.pathname.startsWith('/page/')) {
            try {
                const slug = url.pathname.replace('/page/', '').replace('.html', '');
                
                const cacheKey = `page_${slug}`;
                const cached = await env.SITE_DATA.get(cacheKey);
                if (cached) {
                    return new Response(cached, {
                        headers: { ...headers, 'Cache-Control': 'public, max-age=300' }
                    });
                }
                
                const rawData = await env.SITE_DATA.get('siteData');
                const config = rawData ? JSON.parse(rawData) : {};
                const page = (config.pages || []).find(p => p.slug === slug);
                
                if (page) {
                    const result = JSON.stringify(page);
                    await env.SITE_DATA.put(cacheKey, result, { expirationTtl: 300 });
                    return new Response(result, {
                        headers: { ...headers, 'Cache-Control': 'public, max-age=300' }
                    });
                }
                return new Response(JSON.stringify({ error: '页面不存在' }), { status: 404, headers });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
            }
        }

        // ============================================================
        // POST /order - 创建付费订单
        // ============================================================
        if (request.method === 'POST' && url.pathname === '/order') {
            try {
                const { articleId, resourceIndex, email } = await request.json();
                if (!email) {
                    return new Response(JSON.stringify({ error: '请填写邮箱' }), { status: 400, headers });
                }
                
                const article = await env.DB
                    .prepare('SELECT * FROM articles WHERE id=?')
                    .bind(articleId)
                    .first();
                if (!article) {
                    return new Response(JSON.stringify({ error: '文章不存在' }), { status: 404, headers });
                }
                
                let links = [];
                try { links = JSON.parse(article.resource_links || '[]'); } catch(e) {}
                const res = links[resourceIndex || 0];
                if (!res) {
                    return new Response(JSON.stringify({ error: '资源不存在' }), { status: 404, headers });
                }
                
                const orderId = crypto.randomUUID();
                const now = Date.now();
                await env.DB
                    .prepare('INSERT INTO orders (id,article_id,resource_index,user_email,amount,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
                    .bind(orderId, articleId, resourceIndex || 0, email, res.price || 0, 'pending', now, now)
                    .run();
                    
                return new Response(JSON.stringify({
                    success: true,
                    orderId,
                    qrcode: res.qrcode || '',
                    amount: res.price || 0
                }), { headers });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
            }
        }

        // ============================================================
        // GET /order-status - 查询订单状态
        // ============================================================
        if (request.method === 'GET' && url.pathname === '/order-status') {
            try {
                const orderId = url.searchParams.get('id');
                if (!orderId) {
                    return new Response(JSON.stringify({ error: '缺少订单ID' }), { status: 400, headers });
                }
                
                const order = await env.DB
                    .prepare('SELECT * FROM orders WHERE id=?')
                    .bind(orderId)
                    .first();
                if (!order) {
                    return new Response(JSON.stringify({ error: '订单不存在' }), { status: 404, headers });
                }
                
                if (order.status === 'completed') {
                    const article = await env.DB
                        .prepare('SELECT * FROM articles WHERE id=?')
                        .bind(order.article_id)
                        .first();
                    let links = [];
                    try { links = JSON.parse(article?.resource_links || '[]'); } catch(e) {}
                    const res = links[order.resource_index];
                    return new Response(JSON.stringify({
                        status: 'completed',
                        url: res?.url || ''
                    }), { headers });
                }
                
                return new Response(JSON.stringify({ status: order.status }), { headers });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
            }
        }

        // ============================================================
        // GET /orders - 获取所有订单（管理后台）
        // ============================================================
        if (request.method === 'GET' && url.pathname === '/orders') {
            try {
                if (!(await verifyAdmin(url.searchParams.get('password') || ''))) {
                    return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers });
                }
                
                const { results } = await env.DB
                    .prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200')
                    .all();
                    
                const enriched = await Promise.all((results || []).map(async o => {
                    const a = await env.DB
                        .prepare('SELECT title FROM articles WHERE id=?')
                        .bind(o.article_id)
                        .first();
                    return { ...o, article_title: a?.title || '未知' };
                }));
                
                return new Response(JSON.stringify({ orders: enriched }), { headers });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
            }
        }

        // ============================================================
        // PUT /order-confirm - 确认订单（管理后台）
        // ============================================================
        if (request.method === 'PUT' && url.pathname === '/order-confirm') {
            try {
                const { password, orderId } = await request.json();
                if (!(await verifyAdmin(password))) {
                    return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers });
                }
                
                const order = await env.DB
                    .prepare('SELECT * FROM orders WHERE id=?')
                    .bind(orderId)
                    .first();
                if (!order) {
                    return new Response(JSON.stringify({ error: '订单不存在' }), { status: 404, headers });
                }
                
                await env.DB
                    .prepare('UPDATE orders SET status=?, updated_at=? WHERE id=?')
                    .bind('completed', Date.now(), orderId)
                    .run();
                    
                const article = await env.DB
                    .prepare('SELECT * FROM articles WHERE id=?')
                    .bind(order.article_id)
                    .first();
                    
                let links = [];
                try { links = JSON.parse(article?.resource_links || '[]'); } catch(e) {}
                const res = links[order.resource_index];
                const downloadUrl = res?.url || '';
                
                const sent = await sendDownloadEmail(
                    env,
                    order.user_email,
                    article?.title || '',
                    downloadUrl,
                    orderId
                );
                
                return new Response(JSON.stringify({
                    success: true,
                    message: sent ? '已确认，邮件已发送' : '已确认'
                }), { headers });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
            }
        }

        // ============================================================
        // POST /test-smtp - 测试邮件配置
        // ============================================================
        if (request.method === 'POST' && url.pathname === '/test-smtp') {
            try {
                const { password, smtp, to } = await request.json();
                if (!(await verifyAdmin(password))) {
                    return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers });
                }
                const result = await sendEmailViaConfig(
                    smtp,
                    to,
                    '测试邮件 - 莫辞の资源库',
                    '<h2>莫辞の资源库</h2><p>SMTP配置成功！</p>'
                );
                return new Response(JSON.stringify(result), { headers });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
            }
        }

        // ============================================================
        // POST /articles - 创建文章
        // ============================================================
        if (request.method === 'POST' && url.pathname === '/articles') {
            try {
                const { password, article } = await request.json();
                if (!(await verifyAdmin(password))) {
                    return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers });
                }
                
                const id = article.id || crypto.randomUUID();
                const now = Date.now();
                const categorySlug = article.category_slug || generateSlug(article.category || '');
                const countR = await env.DB.prepare('SELECT MAX(article_order) as m FROM articles').first();
                const nextOrder = (countR?.m || 0) + 1;
                const artSlug = article.slug || String(nextOrder);
                
                let links = typeof article.resource_links === 'string'
                    ? JSON.parse(article.resource_links || '[]')
                    : (article.resource_links || []);
                links = await hashPasswords(links);
                const cover = article.cover || extractFirstImage(article.content || '');
                
                await env.DB
                    .prepare('INSERT INTO articles (id,title,slug,summary,category,category_slug,subcategory,subcategory_slug,content,cover,resource_links,article_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
                    .bind(
                        id,
                        article.title || '',
                        artSlug,
                        article.summary || '',
                        article.category || '',
                        categorySlug,
                        article.subcategory || '',
                        article.subcategory_slug || '',
                        article.content || '',
                        cover,
                        JSON.stringify(links),
                        nextOrder,
                        now,
                        now
                    )
                    .run();
                    
                await env.SITE_DATA.delete('data_cache');
                
                return new Response(JSON.stringify({
                    success: true,
                    id,
                    slug: artSlug,
                    category_slug: categorySlug,
                    order: nextOrder
                }), { headers });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
            }
        }

        // ============================================================
        // PUT /articles/:id - 更新文章
        // ============================================================
        if (request.method === 'PUT' && url.pathname.startsWith('/articles/')) {
            try {
                const { password, article } = await request.json();
                if (!(await verifyAdmin(password))) {
                    return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers });
                }
                
                let links = typeof article.resource_links === 'string'
                    ? JSON.parse(article.resource_links || '[]')
                    : (article.resource_links || []);
                links = await hashPasswords(links);
                const cover = article.cover || extractFirstImage(article.content || '');
                
                const articleId = url.pathname.split('/')[2];
                await env.DB
                    .prepare('UPDATE articles SET title=?,slug=?,summary=?,category=?,category_slug=?,subcategory=?,subcategory_slug=?,content=?,cover=?,resource_links=?,updated_at=? WHERE id=?')
                    .bind(
                        article.title || '',
                        article.slug || '',
                        article.summary || '',
                        article.category || '',
                        article.category_slug || '',
                        article.subcategory || '',
                        article.subcategory_slug || '',
                        article.content || '',
                        cover,
                        JSON.stringify(links),
                        Date.now(),
                        articleId
                    )
                    .run();
                    
                await env.SITE_DATA.delete('data_cache');
                const cacheKeys = await env.SITE_DATA.list({ prefix: 'article_' });
                for (const key of cacheKeys.keys) {
                    await env.SITE_DATA.delete(key.name);
                }
                
                return new Response(JSON.stringify({ success: true }), { headers });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
            }
        }

        // ============================================================
        // DELETE /articles/:id - 删除文章
        // ============================================================
        if (request.method === 'DELETE' && url.pathname.startsWith('/articles/')) {
            try {
                const { password } = await request.json();
                if (!(await verifyAdmin(password))) {
                    return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers });
                }
                
                const articleId = url.pathname.split('/')[2];
                await env.DB
                    .prepare('DELETE FROM articles WHERE id=?')
                    .bind(articleId)
                    .run();
                    
                await env.SITE_DATA.delete('data_cache');
                const cacheKeys = await env.SITE_DATA.list({ prefix: 'article_' });
                for (const key of cacheKeys.keys) {
                    await env.SITE_DATA.delete(key.name);
                }
                
                return new Response(JSON.stringify({ success: true }), { headers });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
            }
        }

        // ============================================================
        // POST /upload - 上传文件到 R2
        // ============================================================
        if (request.method === 'POST' && url.pathname === '/upload') {
            try {
                const formData = await request.formData();
                const password = formData.get('password') || '';
                
                if (!(await verifyAdmin(password))) {
                    return new Response(JSON.stringify({ error: '密码错误' }), {
                        status: 401,
                        headers: { ...headers, 'Content-Type': 'application/json' }
                    });
                }
                
                const file = formData.get('file');
                if (!file || !file.name) {
                    return new Response(JSON.stringify({ error: '没有文件' }), {
                        status: 400,
                        headers: { ...headers, 'Content-Type': 'application/json' }
                    });
                }
                
                const ext = file.name.split('.').pop() || 'bin';
                const fn = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
                
                await env.BUCKET.put(fn, file.stream(), {
                    httpMetadata: {
                        contentType: file.type || 'application/octet-stream',
                        cacheControl: 'public, max-age=31536000, immutable'
                    }
                });
                
                return new Response(JSON.stringify({
                    success: true,
                    url: `https://[你的R2域名]/${fn}`
                }), { headers });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 500,
                    headers: { ...headers, 'Content-Type': 'application/json' }
                });
            }
        }

        // ============================================================
        // GET /search - 搜索文章
        // ============================================================
        if (request.method === 'GET' && url.pathname === '/search') {
            try {
                const q = url.searchParams.get('q') || '';
                if (!q.trim()) {
                    return new Response(JSON.stringify({ results: [], total: 0 }), { headers });
                }
                
                const term = `%${q}%`;
                const { results } = await env.DB
                    .prepare('SELECT id,title,slug,summary,category,category_slug,subcategory,cover,created_at FROM articles WHERE title LIKE ? OR summary LIKE ? OR content LIKE ? OR category LIKE ? ORDER BY created_at DESC LIMIT 30')
                    .bind(term, term, term, term)
                    .all();
                    
                return new Response(JSON.stringify({
                    results: results || [],
                    total: results?.length || 0
                }), { headers });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
            }
        }

        // ============================================================
        // 404 - 未找到
        // ============================================================
        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers });
    }
};

// ============================================================
// 辅助函数
// ============================================================

/**
 * 验证管理员密码
 */
async function verifyAdmin(password) {
    const encoder = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', encoder.encode(password || ''));
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('') === ADMIN_HASH;
}

/**
 * 哈希资源密码
 */
async function hashPasswords(links) {
    const encoder = new TextEncoder();
    return await Promise.all(links.map(async l => {
        if (l.accessType === 'password' && l.password && l.password.length < 60) {
            const buf = await crypto.subtle.digest('SHA-256', encoder.encode(l.password));
            l.password = Array.from(new Uint8Array(buf))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
        }
        return l;
    }));
}

/**
 * 生成 URL Slug
 */
function generateSlug(text) {
    if (!text) return 'other';
    return text
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 40) || 'other';
}

/**
 * 从 HTML 中提取第一张图片
 */
function extractFirstImage(html) {
    if (!html) return '';
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return match ? match[1] : '';
}

/**
 * 通过 SMTP 发送邮件
 */
async function sendEmailViaConfig(smtp, to, subject, html) {
    try {
        const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                personalizations: [{ to: [{ email: to }] }],
                from: {
                    email: smtp.user || 'noreply@[你的域名]',
                    name: smtp.fromName || '莫辞の资源库'
                },
                subject,
                content: [{ type: 'text/html', value: html }]
            })
        });
        return {
            success: response.ok,
            error: response.ok ? '' : (await response.text()).substring(0, 200)
        };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * 发送下载链接邮件
 */
async function sendDownloadEmail(env, to, title, url, orderId) {
    try {
        const rawData = await env.SITE_DATA.get('siteData');
        const config = rawData ? JSON.parse(rawData) : {};
        const smtp = config.smtp || {};
        
        const html = `
            <div style="max-width:600px;margin:0 auto;font-family:sans-serif;">
                <h2>莫辞の资源库</h2>
                <p>您购买的资源下载链接：</p>
                <div style="background:#f5f5f5;padding:16px;border-radius:8px;">
                    <p><strong>${title}</strong></p>
                    <p><a href="${url}" style="color:#4f46e5;font-weight:bold;">点击下载</a></p>
                </div>
                <p style="color:#888;font-size:12px;">订单号：${orderId}</p>
                <p style="color:#888;font-size:12px;">如有问题，请联系站长。</p>
            </div>
        `;
        
        const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                personalizations: [{ to: [{ email: to }] }],
                from: {
                    email: smtp.user || 'noreply@[你的域名]',
                    name: smtp.fromName || '莫辞の资源库'
                },
                subject: `下载链接 - ${title}`,
                content: [{ type: 'text/html', value: html }]
            })
        });
        return response.ok;
    } catch (e) {
        return false;
    }
}
