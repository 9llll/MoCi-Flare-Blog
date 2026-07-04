export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers });

    // GET /debug
    if (request.method === 'GET' && url.pathname === '/debug') {
      return new Response(JSON.stringify({ hasKV: !!env.SITE_DATA, hasDB: !!env.DB, hasBucket: !!env.BUCKET }), { headers });
    }

    // GET /data - 带 KV 缓存
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
        const config = rawData ? JSON.parse(rawData) : { categories:[], friends:[], pages:[], about:'', site:{}, seo:{}, footer:{}, ads:{}, smtp:{} };
        let articles = [];
        if (env.DB) {
          const { results } = await env.DB.prepare('SELECT * FROM articles ORDER BY article_order ASC, created_at DESC').all();
          articles = (results || []).map(a => {
            let links = [];
            if (typeof a.resource_links === 'string') try { links = JSON.parse(a.resource_links || '[]'); } catch(e) {}
            else if (Array.isArray(a.resource_links)) links = a.resource_links;
            links = links.map(l => ({ title:l.title||'', desc:l.desc||'', image:l.image||'', btnText:l.btnText||'下载', accessType:l.accessType||'free', price:l.price||0, qrcode:l.qrcode||'', hasPassword:!!(l.accessType==='password'||l.accessType==='both'), hasPay:!!(l.accessType==='pay'||l.accessType==='both') }));
            const cover = a.cover || extractFirstImage(a.content || '');
            return { ...a, cover, resource_links: links, password: undefined };
          });
        }
        const result = JSON.stringify({ ...config, articles });
        await env.SITE_DATA.put(cacheKey, result, { expirationTtl: 60 });
        return new Response(result, { headers: { ...headers, 'Cache-Control': 'public, max-age=60' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    // POST /save - 清除缓存
    if (request.method === 'POST' && url.pathname === '/save') {
      try {
        const { password, data } = await request.json();
        if (!(await verifyAdmin(password))) return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers });
        await env.SITE_DATA.put('siteData', JSON.stringify(data));
        await env.SITE_DATA.delete('data_cache');
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 400, headers });
      }
    }

    // POST /verify - 只验证密码，不返回 URL
    if (request.method === 'POST' && url.pathname === '/verify') {
      try {
        const { articleId, resourceIndex, password } = await request.json();
        const article = await env.DB.prepare('SELECT * FROM articles WHERE id=?').bind(articleId).first();
        if (!article) return new Response(JSON.stringify({ valid: false, error: '文章不存在' }), { headers });
        let links = [];
        if (typeof article.resource_links === 'string') try { links = JSON.parse(article.resource_links || '[]'); } catch(e) {}
        else if (Array.isArray(article.resource_links)) links = article.resource_links;
        const res = links[resourceIndex || 0];
        if (!res) return new Response(JSON.stringify({ valid: false, error: '资源不存在' }), { headers });
        const type = res.accessType || 'free';
        if (type === 'free') return new Response(JSON.stringify({ valid: true }), { headers });
        if ((type === 'password' || type === 'both') && password) {
          const encoder = new TextEncoder();
          const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(password));
          const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
          if (hashHex === res.password) return new Response(JSON.stringify({ valid: true, needPay: type === 'both' }), { headers });
          return new Response(JSON.stringify({ valid: false, error: '密码错误' }), { headers });
        }
        return new Response(JSON.stringify({ valid: false, error: '需要密码或付费' }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 400, headers });
      }
    }

    // ✅ 新增：获取资源真实 URL（不加密）
    if (request.method === 'POST' && url.pathname === '/get-url') {
      try {
        const { articleId, resourceIndex } = await request.json();
        const article = await env.DB.prepare('SELECT * FROM articles WHERE id=?').bind(articleId).first();
        if (!article) return new Response(JSON.stringify({ error: '文章不存在' }), { status: 404, headers });
        let links = [];
        if (typeof article.resource_links === 'string') try { links = JSON.parse(article.resource_links || '[]'); } catch(e) {}
        else if (Array.isArray(article.resource_links)) links = article.resource_links;
        const res = links[resourceIndex || 0];
        if (!res) return new Response(JSON.stringify({ error: '资源不存在' }), { status: 404, headers });
        const targetUrl = res.url;
        if (!targetUrl || !targetUrl.trim()) {
          return new Response(JSON.stringify({ error: '资源链接为空' }), { status: 400, headers });
        }
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
          return new Response(JSON.stringify({ error: '链接格式无效' }), { status: 400, headers });
        }
        return new Response(JSON.stringify({ success: true, url: targetUrl }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    // ... 其余路由保持不变（GET /article/, GET /page/, POST /order, GET /order-status, GET /orders, PUT /order-confirm, POST /test-smtp, POST /articles, PUT /articles, DELETE /articles, POST /upload, GET /search）
    
    return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers });
  }
};

async function verifyAdmin(p) {
  const h = 'a841990184dd6b62b721e5641e6f55bc5bc8a5909d6fcf3e9bae6e7a7d5b2eb7';
  const e = new TextEncoder();
  const b = await crypto.subtle.digest('SHA-256', e.encode(p || ''));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('') === h;
}

function extractFirstImage(html) {
  if (!html) return '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : '';
}
