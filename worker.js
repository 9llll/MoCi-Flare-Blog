export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    // ========== GET /data → 返回站点数据（隐藏 passwordHash，添加 hasPassword） ==========
    if (request.method === 'GET' && url.pathname === '/data') {
      const rawData = await env.SITE_DATA.get('siteData');
      if (!rawData) return new Response('{}', { headers });

      const data = JSON.parse(rawData);
      // 处理资源数据：移除 passwordHash，添加 hasPassword
      if (data.resources && Array.isArray(data.resources)) {
        data.resources = data.resources.map(r => {
          const { passwordHash, ...rest } = r;
          return {
            ...rest,
            hasPassword: !!(r.needPassword && passwordHash)
          };
        });
      }
      return new Response(JSON.stringify(data), { headers });
    }

    // ========== POST /save → 保存站点数据 ==========
    if (request.method === 'POST' && url.pathname === '/save') {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rateKey = `rate:${ip}`;

      try {
        const attempts = parseInt(await env.SITE_DATA.get(rateKey)) || 0;
        if (attempts >= 5) {
          return new Response(
            JSON.stringify({ error: '请求过于频繁，请 60 秒后再试', code: 'RATE_LIMITED' }),
            { status: 429, headers }
          );
        }

        const { password, data } = await request.json();

        const ADMIN_HASH = 'a841990184dd6b62b721e5641e6f55bc5bc8a5909d6fcf3e9bae6e7a7d5b2eb7';
        const encoder = new TextEncoder();
        const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(password || ''));
        const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

        if (hashHex !== ADMIN_HASH) {
          await env.SITE_DATA.put(rateKey, (attempts + 1).toString(), { expirationTtl: 60 });
          const remaining = 5 - (attempts + 1);
          return new Response(
            JSON.stringify({ error: `密码错误，还剩 ${remaining} 次尝试`, remaining }),
            { status: 401, headers }
          );
        }

        await env.SITE_DATA.delete(rateKey);
        await env.SITE_DATA.put('siteData', JSON.stringify(data));

        return new Response(
          JSON.stringify({ success: true, message: '数据已保存到云端' }),
          { headers }
        );
      } catch (e) {
        return new Response(JSON.stringify({ error: '请求格式错误' }), { status: 400, headers });
      }
    }

    // ========== POST /verify → 验证资源密码 ==========
    if (request.method === 'POST' && url.pathname === '/verify') {
      try {
        const { resourceId, password } = await request.json();
        const rawData = await env.SITE_DATA.get('siteData');

        if (!rawData) {
          return new Response(JSON.stringify({ valid: false, error: '资源不存在' }), { headers });
        }

        const data = JSON.parse(rawData);
        const resource = data.resources?.find(r => r.id === resourceId);

        if (!resource) {
          return new Response(JSON.stringify({ valid: false, error: '资源不存在' }), { headers });
        }

        if (!resource.needPassword || !resource.passwordHash) {
          return new Response(JSON.stringify({ valid: true }), { headers });
        }

        const encoder = new TextEncoder();
        const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(password || ''));
        const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

        return new Response(
          JSON.stringify({ valid: hashHex === resource.passwordHash }),
          { headers }
        );
      } catch (e) {
        return new Response(JSON.stringify({ error: '请求格式错误' }), { status: 400, headers });
      }
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers });
  }
};
