const AES_KEY = 'YOUR_AES_KEY_HERE'; // 修改为你的加密密钥

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

    // GET /data
    if (request.method === 'GET' && url.pathname === '/data') {
      try {
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
        return new Response(JSON.stringify({ ...config, articles }), { headers });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers }); }
    }

    // POST /save
    if (request.method === 'POST' && url.pathname === '/save') {
      try {
        const { password, data } = await request.json();
        if (!(await verifyAdmin(password))) return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers });
        await env.SITE_DATA.put('siteData', JSON.stringify(data));
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 400, headers }); }
    }

    // POST /verify
    if (request.method === 'POST' && url.pathname === '/verify') {
      try {
        const { articleId, resourceIndex, password } = await request.json();
        const article = await env.DB.prepare('SELECT * FROM articles WHERE id=?').bind(articleId).first();
        if (!article) return new Response(JSON.stringify({ valid: false }), { headers });
        let links = [];
        if (typeof article.resource_links === 'string') try { links = JSON.parse(article.resource_links || '[]'); } catch(e) {}
        else if (Array.isArray(article.resource_links)) links = article.resource_links;
        const res = links[resourceIndex || 0];
        if (!res) return new Response(JSON.stringify({ valid: false }), { headers });
        const type = res.accessType || 'free';
        if (type === 'free') return new Response(JSON.stringify({ valid: true, url: res.url }), { headers });
        if ((type === 'password' || type === 'both') && password) {
          const encoder = new TextEncoder();
          const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(password));
          const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
          if (hashHex === res.password) return new Response(JSON.stringify({ valid: true, url: type === 'both' ? null : res.url, needPay: type === 'both' }), { headers });
          return new Response(JSON.stringify({ valid: false, error: '密码错误' }), { headers });
        }
        return new Response(JSON.stringify({ valid: false }), { headers });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 400, headers }); }
    }

    // POST /go
    if (request.method === 'POST' && url.pathname === '/go') {
      try {
        const { url: targetUrl } = await request.json();
        if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) return new Response(JSON.stringify({ error: '无效URL' }), { status: 400, headers });
        const token = await aesEncrypt(targetUrl, AES_KEY);
        if (!token) return new Response(JSON.stringify({ error: '加密失败' }), { status: 500, headers });
        return new Response(JSON.stringify({ success: true, goUrl: `https://YOUR_DOMAIN/go.html?token=${encodeURIComponent(token)}` }), { headers });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers }); }
    }

    // GET /article/:category_slug/:slug.html
    if (request.method === 'GET' && url.pathname.startsWith('/article/')) {
      const parts = url.pathname.replace('/article/', '').split('/');
      if (parts.length === 2) {
        const catSlug = parts[0];
        const artSlug = parts[1].replace('.html', '');
        const article = await env.DB.prepare('SELECT * FROM articles WHERE category_slug=? AND slug=?').bind(catSlug, artSlug).first();
        if (article) {
          let links = []; try { links = JSON.parse(article.resource_links || '[]'); } catch(e) {}
          links = links.map(l => ({ title:l.title||'', desc:l.desc||'', image:l.image||'', btnText:l.btnText||'下载', accessType:l.accessType||'free', price:l.price||0, qrcode:l.qrcode||'' }));
          const cover = article.cover || extractFirstImage(article.content || '');
          return new Response(JSON.stringify({ ...article, cover, resource_links: links }), { headers });
        }
      }
      return new Response(JSON.stringify({ error: '文章不存在' }), { status: 404, headers });
    }

    // GET /page/:slug.html
    if (request.method === 'GET' && url.pathname.startsWith('/page/')) {
      const slug = url.pathname.replace('/page/', '').replace('.html', '');
      const rawData = await env.SITE_DATA.get('siteData');
      const config = rawData ? JSON.parse(rawData) : {};
      const page = (config.pages || []).find(p => p.slug === slug);
      if (page) return new Response(JSON.stringify(page), { headers });
      return new Response(JSON.stringify({ error: '页面不存在' }), { status: 404, headers });
    }

    // POST /order
    if (request.method === 'POST' && url.pathname === '/order') {
      try {
        const { articleId, resourceIndex, email } = await request.json();
        if (!email) return new Response(JSON.stringify({ error: '请填写邮箱' }), { status: 400, headers });
        const article = await env.DB.prepare('SELECT * FROM articles WHERE id=?').bind(articleId).first();
        if (!article) return new Response(JSON.stringify({ error: '文章不存在' }), { status: 404, headers });
        let links = []; try { links = JSON.parse(article.resource_links || '[]'); } catch(e) {}
        const res = links[resourceIndex || 0];
        if (!res) return new Response(JSON.stringify({ error: '资源不存在' }), { status: 404, headers });
        const orderId = crypto.randomUUID(); const now = Date.now();
        await env.DB.prepare('INSERT INTO orders (id,article_id,resource_index,user_email,amount,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(orderId, articleId, resourceIndex||0, email, res.price||0, 'pending', now, now).run();
        return new Response(JSON.stringify({ success: true, orderId, qrcode: res.qrcode||'', amount: res.price||0 }), { headers });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers }); }
    }

    // GET /order-status
    if (request.method === 'GET' && url.pathname === '/order-status') {
      const orderId = url.searchParams.get('id');
      if (!orderId) return new Response(JSON.stringify({ error: '缺少订单ID' }), { status: 400, headers });
      const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first();
      if (!order) return new Response(JSON.stringify({ error: '订单不存在' }), { status: 404, headers });
      if (order.status === 'completed') {
        const article = await env.DB.prepare('SELECT * FROM articles WHERE id=?').bind(order.article_id).first();
        let links = []; try { links = JSON.parse(article?.resource_links || '[]'); } catch(e) {}
        const res = links[order.resource_index];
        return new Response(JSON.stringify({ status: 'completed', url: res?.url||'' }), { headers });
      }
      return new Response(JSON.stringify({ status: order.status }), { headers });
    }

    // GET /orders
    if (request.method === 'GET' && url.pathname === '/orders') {
      if (!(await verifyAdmin(url.searchParams.get('password')||''))) return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers });
      const { results } = await env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200').all();
      const enriched = await Promise.all((results||[]).map(async o => { const a = await env.DB.prepare('SELECT title FROM articles WHERE id=?').bind(o.article_id).first(); return {...o, article_title: a?.title||'未知'}; }));
      return new Response(JSON.stringify({ orders: enriched }), { headers });
    }

    // PUT /order-confirm
    if (request.method === 'PUT' && url.pathname === '/order-confirm') {
      try {
        const { password, orderId } = await request.json();
        if (!(await verifyAdmin(password))) return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers });
        const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first();
        if (!order) return new Response(JSON.stringify({ error: '订单不存在' }), { status: 404, headers });
        await env.DB.prepare('UPDATE orders SET status=?, updated_at=? WHERE id=?').bind('completed', Date.now(), orderId).run();
        const article = await env.DB.prepare('SELECT * FROM articles WHERE id=?').bind(order.article_id).first();
        let links = []; try { links = JSON.parse(article?.resource_links || '[]'); } catch(e) {}
        const res = links[order.resource_index];
        const token = await aesEncrypt(res?.url||'', AES_KEY);
        const goUrl = token ? `https://YOUR_DOMAIN/go.html?token=${encodeURIComponent(token)}` : '';
        const sent = await sendDownloadEmail(env, order.user_email, article?.title||'', goUrl, orderId);
        return new Response(JSON.stringify({ success: true, message: sent?'已确认，邮件已发送':'已确认', url: res?.url||'' }), { headers });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers }); }
    }

    // POST /test-smtp
    if (request.method === 'POST' && url.pathname === '/test-smtp') {
      try {
        const { password, smtp, to } = await request.json();
        if (!(await verifyAdmin(password))) return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers });
        const result = await sendEmailViaConfig(smtp, to, '测试邮件 - 站点名称', '<h2>站点名称</h2><p>SMTP配置成功！</p>');
        return new Response(JSON.stringify(result), { headers });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers }); }
    }

    // POST /articles
    if (request.method === 'POST' && url.pathname === '/articles') {
      try {
        const { password, article } = await request.json();
        if (!(await verifyAdmin(password))) return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers });
        const id = article.id || crypto.randomUUID(); const now = Date.now();
        const categorySlug = article.category_slug || generateSlug(article.category || '');
        const countR = await env.DB.prepare('SELECT MAX(article_order) as m FROM articles').first();
        const nextOrder = (countR?.m || 0) + 1;
        const artSlug = article.slug || String(nextOrder);
        let links = typeof article.resource_links === 'string' ? JSON.parse(article.resource_links||'[]') : (article.resource_links||[]);
        links = await hashPasswords(links);
        const cover = article.cover || extractFirstImage(article.content || '');
        await env.DB.prepare('INSERT INTO articles (id,title,slug,summary,category,category_slug,subcategory,subcategory_slug,content,cover,resource_links,article_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .bind(id, article.title||'', artSlug, article.summary||'', article.category||'', categorySlug, article.subcategory||'', article.subcategory_slug||'', article.content||'', cover, JSON.stringify(links), nextOrder, now, now).run();
        return new Response(JSON.stringify({ success: true, id, slug: artSlug, category_slug: categorySlug, order: nextOrder }), { headers });
      } catch (e) { return new Response(JSON.stringify({ error: '创建失败: ' + e.message }), { status: 500, headers }); }
    }

    // PUT /articles/:id
    if (request.method === 'PUT' && url.pathname.startsWith('/articles/')) {
      try {
        const { password, article } = await request.json();
        if (!(await verifyAdmin(password))) return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers });
        let links = typeof article.resource_links === 'string' ? JSON.parse(article.resource_links||'[]') : (article.resource_links||[]);
        links = await Promise.all(links.map(async l => {
          if ((l.accessType === 'password' || l.accessType === 'both') && l.password && l.password.length < 60) {
            const encoder = new TextEncoder();
            const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(l.password));
            l.password = Array.from(new Uint8Array(hashBuf)).map(x => x.toString(16).padStart(2, '0')).join('');
          }
          return l;
        }));
        const cover = article.cover || extractFirstImage(article.content || '');
        await env.DB.prepare('UPDATE articles SET title=?,slug=?,summary=?,category=?,category_slug=?,subcategory=?,subcategory_slug=?,content=?,cover=?,resource_links=?,updated_at=? WHERE id=?')
          .bind(article.title||'', article.slug||'', article.summary||'', article.category||'', article.category_slug||'', article.subcategory||'', article.subcategory_slug||'', article.content||'', cover, JSON.stringify(links), Date.now(), url.pathname.split('/')[2]).run();
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (e) { return new Response(JSON.stringify({ error: '更新失败: ' + e.message }), { status: 500, headers }); }
    }

    // DELETE /articles/:id
    if (request.method === 'DELETE' && url.pathname.startsWith('/articles/')) {
      try {
        const { password } = await request.json();
        if (!(await verifyAdmin(password))) return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers });
        await env.DB.prepare('DELETE FROM articles WHERE id=?').bind(url.pathname.split('/')[2]).run();
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers }); }
    }

    // POST /upload
    if (request.method === 'POST' && url.pathname === '/upload') {
      try {
        const formData = await request.formData();
        if (!(await verifyAdmin(formData.get('password')||''))) return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers: {...headers, 'Content-Type':'application/json'} });
        const file = formData.get('file');
        if (!file?.name) return new Response(JSON.stringify({ error: '没有文件' }), { status: 400, headers });
        const fn = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
        await env.BUCKET.put(fn, file.stream(), { httpMetadata: { contentType: file.type||'image/png' } });
        return new Response(JSON.stringify({ success: true, url: `https://YOUR_R2_DOMAIN/${fn}` }), { headers });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers }); }
    }

    // GET /search
    if (request.method === 'GET' && url.pathname === '/search') {
      const q = url.searchParams.get('q')||'';
      if (!q.trim()) return new Response(JSON.stringify({ results:[], total:0 }), { headers });
      const term = `%${q}%`;
      const { results } = await env.DB.prepare('SELECT id,title,slug,summary,category,category_slug,subcategory,cover,created_at FROM articles WHERE title LIKE ? OR summary LIKE ? OR content LIKE ? OR category LIKE ? ORDER BY created_at DESC LIMIT 30').bind(term,term,term,term).all();
      return new Response(JSON.stringify({ results: results||[], total: results?.length||0 }), { headers });
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers });
  }
};

async function verifyAdmin(p) {
  const h = 'YOUR_ADMIN_PASSWORD_SHA256_HASH'; // 修改为你的密码哈希
  const e = new TextEncoder(); const b = await crypto.subtle.digest('SHA-256', e.encode(p||''));
  return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')===h;
}

async function hashPasswords(links) {
  const e = new TextEncoder();
  return await Promise.all(links.map(async l => {
    if ((l.accessType==='password'||l.accessType==='both') && l.password && l.password.length<60) {
      const b = await crypto.subtle.digest('SHA-256', e.encode(l.password));
      l.password = Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
    }
    return l;
  }));
}

async function aesEncrypt(plaintext, key) {
  const kb = new TextEncoder().encode(key).slice(0,32);
  const ck = await crypto.subtle.importKey('raw', kb, { name:'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, ck, encoded);
  const combined = new Uint8Array(iv.length+encrypted.byteLength);
  combined.set(iv); combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

function generateSlug(text) {
  if(!text)return'other';
  return text.toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').substring(0,40)||'other';
}

function extractFirstImage(html) {
  if(!html)return'';
  const m=html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?m[1]:'';
}

async function sendEmailViaConfig(smtp,to,subject,html){
  try{
    const r=await fetch('https://api.mailchannels.net/tx/v1/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({personalizations:[{to:[{email:to}]}],from:{email:smtp.user,name:smtp.fromName||'站点名称'},subject,content:[{type:'text/html',value:html}]})});
    return{success:r.ok,error:r.ok?'':(await r.text()).substring(0,200)};
  }catch(e){return{success:false,error:e.message};}
}

async function sendDownloadEmail(env,to,title,url,orderId){
  try{
    const rd=await env.SITE_DATA.get('siteData');
    const cfg=rd?JSON.parse(rd):{};
    const smtp=cfg.smtp||{};
    const html=`<div style="max-width:600px;margin:0 auto;font-family:sans-serif;"><h2>站点名称</h2><p>下载链接：</p><div style="background:#f5f5f5;padding:16px;border-radius:8px;"><p><strong>${title}</strong></p><p><a href="${url}">点击下载</a></p></div><p style="color:#888;">订单：${orderId}</p></div>`;
    const r=await fetch('https://api.mailchannels.net/tx/v1/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({personalizations:[{to:[{email:to}]}],from:{email:smtp.user||'noreply@yourdomain.com',name:smtp.fromName||'站点名称'},subject:`下载链接 - ${title}`,content:[{type:'text/html',value:html}]})});
    return r.ok;
  }catch(e){return false;}
}
