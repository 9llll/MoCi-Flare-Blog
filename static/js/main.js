// ============================================================
// static/js/main.js
// 莫辞の资源库 - 前台完整逻辑
// 所有下载都经过 go.html 安全跳转
// ============================================================

// ============================================================
// ⚠️ 请修改为你的 Worker API 地址
// ============================================================

const API = 'https://[你的Worker域名].workers.dev';

// ============================================================
// 全局状态
// ============================================================

let data = { articles: [], categories: [], friends: [], pages: [], about: '', site: {}, seo: {}, footer: {}, ads: {} };
let currentPage = 'home', currentCat = '全部', currentSubcat = '全部';
let pendingArticleId = null, pendingResIndex = 0, currentPayOrderId = null;

// ============================================================
// 工具函数
// ============================================================

function $(id) { return document.getElementById(id); }

function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast show';
    setTimeout(() => t.classList.remove('show'), 2200);
}

function toggleMobileNav() {
    const b = $('hamburgerBtn');
    const o = $('mobileNavOverlay');
    if (b) b.classList.toggle('open');
    if (o) o.classList.toggle('show');
    document.body.style.overflow = o?.classList.contains('show') ? 'hidden' : '';
}

function formatDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000 && d.getDate() === now.getDate()) return '今天';
    if (diff < 172800000 && d.getDate() === now.getDate() - 1) return '昨天';
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function toggleTheme() {
    document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
}

// ============================================================
// 渲染 HTML 骨架
// ============================================================

function renderApp() {
    document.getElementById('app').innerHTML = `
        <!-- 顶部导航 -->
        <header class="top-header">
            <div class="top-inner">
                <button class="hamburger-btn" id="hamburgerBtn" onclick="toggleMobileNav()"><span></span></button>
                <a class="site-logo-link" onclick="navigate('home')">
                    <div class="site-logo-img" id="logoImg">🌿</div>
                    <span id="siteName">莫辞の资源库</span>
                </a>
                <nav class="top-nav" id="topNav">
                    <a data-page="home" class="active">首页</a>
                    <a data-page="friends">友链</a>
                    <a data-page="about">关于</a>
                    <a data-page="archive">归档</a>
                </nav>
                <div class="header-actions">
                    <div class="search-box">
                        <input type="text" id="searchInput" placeholder="搜索..." onkeydown="if(event.key==='Enter')openSearch()">
                        <button onclick="openSearch()">
                            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        </button>
                    </div>
                    <button class="icon-btn" onclick="toggleTheme()">
                        <svg class="sun-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                        <svg class="moon-icon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    </button>
                </div>
            </div>
        </header>

        <!-- 移动端导航 -->
        <div class="mobile-nav-overlay" id="mobileNavOverlay"></div>

        <!-- 分类栏 -->
        <div class="cat-section" id="catSection">
            <div class="cat-bar" id="catBar"></div>
            <div class="subcat-bar" id="subcatBar"></div>
        </div>

        <!-- 主内容 -->
        <div class="container">
            <div class="ad-slot" id="adTopBanner"></div>
            <div class="ad-slot" id="adMobile"></div>
            <div id="homeView"><div class="card-grid" id="cardGrid"></div></div>
            <div id="articleView" class="hidden"></div>
            <div id="friendsView" class="hidden"><div class="page-content"><h2>🔗 友情链接</h2><div id="friendsList"></div></div></div>
            <div id="aboutView" class="hidden"><div class="page-content"><div id="aboutContent"></div></div></div>
            <div id="archiveView" class="hidden"><div class="page-content"><h2>📚 文章归档</h2><div id="archiveList"></div></div></div>
            <div class="ad-slot" id="adBottomBanner"></div>
        </div>

        <!-- 页脚 -->
        <footer class="site-footer">
            <div style="max-width:1240px;margin:0 auto;padding:0 24px;">
                <div class="footer-grid">
                    <div class="footer-col"><h4>📖 关于本站</h4><p id="footerAboutText"></p></div>
                    <div class="footer-col"><h4 id="footerContactTitle">📬 联系方式</h4><div id="footerContact"></div></div>
                    <div class="footer-col"><h4>🔗 快速链接</h4><div id="footerLinksList"></div></div>
                </div>
                <div class="footer-bottom"><p id="footerCopyright"></p><p id="footerICP" style="margin-top:4px;"></p></div>
            </div>
            <div id="footerScript"></div>
        </footer>

        <!-- 返回顶部 -->
        <button class="back-to-top" id="backToTop" onclick="window.scrollTo({top:0,behavior:'smooth'})">⬆</button>

        <!-- 密码弹窗 -->
        <div class="modal-overlay hidden" id="pwdModal">
            <div class="modal-box">
                <button class="modal-close" onclick="closePwdModal()">✕</button>
                <h3>🔒 密码验证</h3>
                <p id="pwdResTitle" style="text-align:center;color:var(--text-muted);margin-bottom:8px;"></p>
                <input type="password" id="pwdInput" placeholder="输入密码" onkeydown="if(event.key==='Enter')verifyPwd()">
                <button class="btn" onclick="verifyPwd()" style="background:var(--accent);color:#fff;">验证</button>
                <p id="pwdError" style="color:var(--danger);text-align:center;margin-top:6px;font-size:.82rem;min-height:20px"></p>
            </div>
        </div>

        <!-- 付费弹窗 -->
        <div class="modal-overlay hidden" id="payModal">
            <div class="modal-box">
                <button class="modal-close" onclick="$('payModal').classList.add('hidden')">✕</button>
                <h3>💰 付费下载</h3>
                <div id="payForm">
                    <p style="text-align:center"><strong id="payResTitle"></strong></p>
                    <p style="text-align:center;color:var(--warm-gold);font-weight:700;">¥<span id="payAmount">0</span></p>
                    <input type="email" id="payEmail" placeholder="接收链接的邮箱">
                    <button class="btn" onclick="createOrder()" style="background:var(--warm-gold);color:#fff;">💳 确认支付</button>
                </div>
                <div id="payWait" style="display:none;text-align:center;">
                    <p>📱 请扫码支付</p>
                    <img id="payQRCode" src="" style="max-width:180px;border-radius:10px;">
                    <p style="font-size:.76rem;color:var(--text-muted);">支付后链接发送到邮箱</p>
                    <button class="btn" onclick="checkPayStatus()" style="background:var(--accent);color:#fff;">🔄 查询状态</button>
                    <p id="payResult" style="margin-top:6px;"></p>
                </div>
            </div>
        </div>

        <!-- 搜索弹窗 -->
        <div class="modal-overlay hidden" id="searchModal">
            <div class="modal-box search-modal-box">
                <button class="modal-close" onclick="$('searchModal').classList.add('hidden')">✕</button>
                <h3>🔍 搜索</h3>
                <div class="search-input-row">
                    <input type="text" id="searchModalInput" placeholder="关键词..." onkeydown="if(event.key==='Enter')doSearch()">
                    <button onclick="doSearch()">搜索</button>
                </div>
                <div id="searchResults"></div>
            </div>
        </div>

        <!-- Toast -->
        <div class="toast" id="toast"></div>
    `;
}

// ============================================================
// 核心下载函数：所有资源都走 go.html 跳转
// ============================================================

async function redirectToGo(articleId, resourceIndex) {
    try {
        toast('⏳ 正在准备下载链接...');
        
        const r = await fetch(`${API}/get-go-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ articleId, resourceIndex })
        });
        
        const d = await r.json();
        
        if (d.success && d.goUrl) {
            window.location.href = d.goUrl;
        } else {
            toast('❌ ' + (d.error || '获取下载链接失败'));
        }
    } catch (e) {
        toast('❌ 网络错误：' + e.message);
        console.error('[redirectToGo] 错误:', e);
    }
}

// ============================================================
// 公开资源下载
// ============================================================

function getResourceUrl(aid, ri) {
    redirectToGo(aid, ri);
}

// ============================================================
// 密码验证
// ============================================================

function openPwdModal(aid, ri) {
    const a = data.articles.find(x => x.id === aid);
    if (!a) return;
    let links = [];
    if (Array.isArray(a.resource_links)) links = a.resource_links;
    else if (typeof a.resource_links === 'string') {
        try { links = JSON.parse(a.resource_links); } catch(e) {}
    }
    const res = links[ri];
    if (!res) return;
    pendingArticleId = aid;
    pendingResIndex = ri;
    $('pwdResTitle').textContent = res.title || a.title;
    $('pwdInput').value = '';
    $('pwdError').textContent = '';
    $('pwdInput').classList.remove('shake');
    $('pwdModal').classList.remove('hidden');
    setTimeout(() => $('pwdInput').focus(), 100);
}

function closePwdModal() {
    $('pwdModal').classList.add('hidden');
    $('pwdInput').classList.remove('shake');
}

async function verifyPwd() {
    const pwd = $('pwdInput').value.trim();
    if (!pwd) {
        $('pwdError').textContent = '请输入密码';
        $('pwdInput').classList.add('shake');
        setTimeout(() => $('pwdInput').classList.remove('shake'), 400);
        return;
    }
    
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(pwd);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashHex = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        
        const r = await fetch(`${API}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                articleId: pendingArticleId,
                resourceIndex: pendingResIndex,
                password: hashHex
            })
        });
        
        const d = await r.json();
        
        if (d.valid) {
            $('pwdError').innerHTML = '<span class="pwd-success">✅ 密码正确，正在跳转...</span>';
            setTimeout(() => {
                closePwdModal();
                if (d.needPay) {
                    openPayModal(pendingArticleId, pendingResIndex);
                } else {
                    redirectToGo(pendingArticleId, pendingResIndex);
                }
            }, 800);
        } else {
            $('pwdError').textContent = '❌ ' + (d.error || '密码错误');
            $('pwdInput').classList.add('shake');
            $('pwdInput').value = '';
            setTimeout(() => $('pwdInput').classList.remove('shake'), 400);
        }
    } catch (e) {
        $('pwdError').textContent = '验证失败：' + e.message;
        $('pwdInput').classList.add('shake');
        setTimeout(() => $('pwdInput').classList.remove('shake'), 400);
    }
}

// ============================================================
// 付费功能
// ============================================================

function openPayModal(aid, ri) {
    const a = data.articles.find(x => x.id === aid);
    if (!a) return;
    let links = [];
    if (Array.isArray(a.resource_links)) links = a.resource_links;
    else if (typeof a.resource_links === 'string') {
        try { links = JSON.parse(a.resource_links); } catch(e) {}
    }
    const res = links[ri];
    if (!res) return;
    pendingArticleId = aid;
    pendingResIndex = ri;
    $('payResTitle').textContent = res.title || a.title;
    $('payAmount').textContent = res.price || 0;
    $('payEmail').value = '';
    $('payForm').style.display = 'block';
    $('payWait').style.display = 'none';
    $('payResult').innerHTML = '';
    $('payModal').classList.remove('hidden');
}

async function createOrder() {
    const email = $('payEmail').value.trim();
    if (!email) { toast('请填写邮箱'); return; }
    try {
        const r = await fetch(`${API}/order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                articleId: pendingArticleId,
                resourceIndex: pendingResIndex,
                email
            })
        });
        const d = await r.json();
        if (d.success) {
            currentPayOrderId = d.orderId;
            $('payQRCode').src = d.qrcode || '';
            $('payForm').style.display = 'none';
            $('payWait').style.display = 'block';
            toast('✅ 订单已创建');
        } else {
            toast('❌ ' + (d.error || '创建失败'));
        }
    } catch (e) {
        toast('❌ 网络错误');
    }
}

async function checkPayStatus() {
    if (!currentPayOrderId) { toast('❌ 没有待查询的订单'); return; }
    try {
        const r = await fetch(`${API}/order-status?id=${currentPayOrderId}`);
        const d = await r.json();
        if (d.status === 'completed') {
            $('payResult').innerHTML = `
                <span style="color:var(--success)">✅ 支付成功！</span>
                <br>
                <button class="btn" onclick="redirectToGo('${pendingArticleId}', ${pendingResIndex})"
                        style="background:var(--accent);color:#fff;margin-top:8px;">
                    📥 立即下载
                </button>
            `;
        } else if (d.status === 'pending') {
            $('payResult').innerHTML = '<span style="color:#f59e0b">⏳ 等待确认...</span>';
        } else {
            $('payResult').innerHTML = '<span style="color:var(--danger)">❌ ' + d.status + '</span>';
        }
    } catch (e) {
        toast('❌ 查询失败');
    }
}

// ============================================================
// 渲染函数
// ============================================================

function applySiteConfig() {
    const s = data.site || {};
    const seo = data.seo || {};
    $('pageTitle').textContent = s.title || '莫辞の资源库';
    $('metaDesc').setAttribute('content', seo.desc || s.desc || '');
    $('metaKeywords').setAttribute('content', seo.keywords || s.keywords || '');
    $('faviconLink').setAttribute('href', s.favicon || '');
    $('siteName').textContent = s.title || '莫辞の资源库';
    if (s.logo) {
        $('logoImg').innerHTML = `<img src="${s.logo}" style="width:100%;height:100%;object-fit:cover">`;
    }
}

function renderNav() {
    const pages = (data.pages || []).filter(p => p.showInNav);
    let h = '<a data-page="home" class="active">首页</a>';
    pages.forEach(p => {
        h += `<a data-page="page-${p.slug}">${p.navLabel || p.title}</a>`;
    });
    h += '<a data-page="friends">友链</a><a data-page
