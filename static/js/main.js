// ============================================================
// static/js/main.js
// 莫辞の资源库 - 前台完整逻辑
// 所有下载都经过 go.html 安全跳转
// ============================================================

// ============================================================
// ⚠️ 请修改为你的 Worker API 地址
// ============================================================

const API = 'https://site-api.moci.cc';

// ============================================================
// 全局状态
// ============================================================

let data = { articles: [], categories: [], friends: [], pages: [], about: '', site: {}, seo: {}, footer: {}, ads: {} };
let currentPage = 'home', currentCat = '全部', currentSubcat = '全部';
let pendingArticleId = null, pendingResIndex = 0, currentPayOrderId = null;

// ⭐ 视图和分页状态
let currentView = 'card'; // 'card' | 'list'
let currentPageNum = 1;
const PAGE_SIZE_CARD = 12; // 3行 × 4列
const PAGE_SIZE_LIST = 20;

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
// 获取过滤后的文章列表
// ============================================================

function getFilteredArticles() {
    let filtered = data.articles || [];
    if (currentCat !== '全部') filtered = filtered.filter(a => a.category === currentCat);
    if (currentSubcat !== '全部') filtered = filtered.filter(a => a.subcategory === currentSubcat);
    return filtered;
}

// ============================================================
// 分页函数
// ============================================================

function getPageSize() {
    return currentView === 'card' ? PAGE_SIZE_CARD : PAGE_SIZE_LIST;
}

function getTotalPages(total) {
    const size = getPageSize();
    return Math.ceil(total / size) || 1;
}

function getPaginatedItems(items, page) {
    const size = getPageSize();
    const start = (page - 1) * size;
    const end = start + size;
    return items.slice(start, end);
}

function renderPagination(total, page) {
    const container = document.getElementById('pagination');
    if (!container) return;

    const totalPages = getTotalPages(total);
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    const size = getPageSize();
    const start = (page - 1) * size + 1;
    const end = Math.min(page * size, total);
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) {
        pageInfo.textContent = `共 ${total} 篇 · 第 ${page}/${totalPages} 页`;
    }

    let html = '';

    // 上一页
    html += `<button onclick="goToPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>‹</button>`;

    // 页码
    let pages = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        pages.push(1);
        if (page > 3) pages.push('...');
        for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
            pages.push(i);
        }
        if (page < totalPages - 2) pages.push('...');
        pages.push(totalPages);
    }

    pages.forEach(p => {
        if (p === '...') {
            html += `<span class="ellipsis">…</span>`;
        } else {
            html += `<button onclick="goToPage(${p})" class="${p === page ? 'active' : ''}">${p}</button>`;
        }
    });

    // 下一页
    html += `<button onclick="goToPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>›</button>`;

    // 信息
    html += `<span class="info">显示 ${start}-${end} 篇</span>`;

    container.innerHTML = html;
}

function goToPage(page) {
    const total = getFilteredArticles().length;
    const totalPages = getTotalPages(total);
    if (page < 1 || page > totalPages) return;
    currentPageNum = page;
    renderCards();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// 视图切换
// ============================================================

function switchView(view) {
    currentView = view;
    currentPageNum = 1;

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    try {
        localStorage.setItem('moci_view_preference', view);
    } catch (e) {}

    renderCards();
}

// ============================================================
// 更新视图信息
// ============================================================

function updateViewInfo(total) {
    const info = document.getElementById('viewInfo');
    if (info) {
        const viewName = currentView === 'card' ? '卡片' : '列表';
        const size = getPageSize();
        info.textContent = `${viewName}视图 · 每页${size}篇 · 共${total}篇`;
    }
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

        <!-- ========== 主内容 ========== -->
        <div class="container">
            <div class="ad-slot" id="adTopBanner"></div>
            <div class="ad-slot" id="adMobile"></div>

            <!-- ⭐ 首页视图 (homeView) -->
            <div id="homeView">
                <!-- 视图切换控件 -->
                <div class="view-controls" id="viewControls">
                    <div class="left">
                        <button class="view-btn active" data-view="card" onclick="switchView('card')">
                            <svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                            卡片
                        </button>
                        <button class="view-btn" data-view="list" onclick="switchView('list')">
                            <svg viewBox="0 0 24 24" width="16" height="16"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                            列表
                        </button>
                        <span class="view-info" id="viewInfo"></span>
                    </div>
                    <div class="right">
                        <span class="view-info" id="pageInfo"></span>
                    </div>
                </div>

                <!-- 文章卡片/列表网格 -->
                <div class="card-grid" id="cardGrid"></div>

                <!-- 分页控件 -->
                <div class="pagination" id="pagination"></div>
            </div>

            <!-- 文章详情页 -->
            <div id="articleView" class="hidden"></div>

            <!-- 友链页 -->
            <div id="friendsView" class="hidden">
                <div class="page-content">
                    <h2>🔗 友情链接</h2>
                    <div id="friendsList"></div>
                </div>
            </div>

            <!-- 关于页 -->
            <div id="aboutView" class="hidden">
                <div class="page-content">
                    <div id="aboutContent"></div>
                </div>
            </div>

            <!-- 归档页 -->
            <div id="archiveView" class="hidden">
                <div class="page-content">
                    <h2>📚 文章归档</h2>
                    <div id="archiveList"></div>
                </div>
            </div>

            <div class="ad-slot" id="adBottomBanner"></div>
        </div>

        <!-- ========== 页脚 ========== -->
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
                <button class="modal-close" onclick="closePayModal()">✕</button>
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
                <button class="modal-close" onclick="closeSearchModal()">✕</button>
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
// 弹窗关闭函数
// ============================================================

function closePayModal() {
    document.getElementById('payModal').classList.add('hidden');
}

function closeSearchModal() {
    document.getElementById('searchModal').classList.add('hidden');
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
        try { links = JSON.parse(a.resource_links); } catch (e) {}
    }
    const res = links[ri];
    if (!res) return;
    pendingArticleId = aid;
    pendingResIndex = ri;
    document.getElementById('pwdResTitle').textContent = res.title || a.title;
    document.getElementById('pwdInput').value = '';
    document.getElementById('pwdError').textContent = '';
    document.getElementById('pwdInput').classList.remove('shake');
    document.getElementById('pwdModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('pwdInput').focus(), 100);
}

function closePwdModal() {
    document.getElementById('pwdModal').classList.add('hidden');
    document.getElementById('pwdInput').classList.remove('shake');
}

async function verifyPwd() {
    const pwd = document.getElementById('pwdInput').value.trim();
    if (!pwd) {
        document.getElementById('pwdError').textContent = '请输入密码';
        document.getElementById('pwdInput').classList.add('shake');
        setTimeout(() => document.getElementById('pwdInput').classList.remove('shake'), 400);
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
            document.getElementById('pwdError').innerHTML = '<span class="pwd-success">✅ 密码正确，正在跳转...</span>';
            setTimeout(() => {
                closePwdModal();
                if (d.needPay) {
                    openPayModal(pendingArticleId, pendingResIndex);
                } else {
                    redirectToGo(pendingArticleId, pendingResIndex);
                }
            }, 800);
        } else {
            document.getElementById('pwdError').textContent = '❌ ' + (d.error || '密码错误');
            document.getElementById('pwdInput').classList.add('shake');
            document.getElementById('pwdInput').value = '';
            setTimeout(() => document.getElementById('pwdInput').classList.remove('shake'), 400);
        }
    } catch (e) {
        document.getElementById('pwdError').textContent = '验证失败：' + e.message;
        document.getElementById('pwdInput').classList.add('shake');
        setTimeout(() => document.getElementById('pwdInput').classList.remove('shake'), 400);
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
        try { links = JSON.parse(a.resource_links); } catch (e) {}
    }
    const res = links[ri];
    if (!res) return;
    pendingArticleId = aid;
    pendingResIndex = ri;
    document.getElementById('payResTitle').textContent = res.title || a.title;
    document.getElementById('payAmount').textContent = res.price || 0;
    document.getElementById('payEmail').value = '';
    document.getElementById('payForm').style.display = 'block';
    document.getElementById('payWait').style.display = 'none';
    document.getElementById('payResult').innerHTML = '';
    document.getElementById('payModal').classList.remove('hidden');
}

async function createOrder() {
    const email = document.getElementById('payEmail').value.trim();
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
            document.getElementById('payQRCode').src = d.qrcode || '';
            document.getElementById('payForm').style.display = 'none';
            document.getElementById('payWait').style.display = 'block';
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
            document.getElementById('payResult').innerHTML = `
                <span style="color:var(--success)">✅ 支付成功！</span>
                <br>
                <button class="btn" onclick="redirectToGo('${pendingArticleId}', ${pendingResIndex})"
                        style="background:var(--accent);color:#fff;margin-top:8px;">
                    📥 立即下载
                </button>
            `;
        } else if (d.status === 'pending') {
            document.getElementById('payResult').innerHTML = '<span style="color:#f59e0b">⏳ 等待确认...</span>';
        } else {
            document.getElementById('payResult').innerHTML = '<span style="color:var(--danger)">❌ ' + d.status + '</span>';
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
    document.getElementById('pageTitle').textContent = s.title || '莫辞の资源库';
    document.getElementById('metaDesc').setAttribute('content', seo.desc || s.desc || '');
    document.getElementById('metaKeywords').setAttribute('content', seo.keywords || s.keywords || '');
    document.getElementById('faviconLink').setAttribute('href', s.favicon || '');
    document.getElementById('siteName').textContent = s.title || '莫辞の资源库';
    if (s.logo) {
        document.getElementById('logoImg').innerHTML = `<img src="${s.logo}" style="width:100%;height:100%;object-fit:cover">`;
    }
}

function renderNav() {
    const pages = (data.pages || []).filter(p => p.showInNav);
    let h = '<a data-page="home" class="active">首页</a>';
    pages.forEach(p => {
        h += `<a data-page="page-${p.slug}">${p.navLabel || p.title}</a>`;
    });
    h += '<a data-page="friends">友链</a><a data-page="about">关于</a><a data-page="archive">归档</a>';
    document.getElementById('topNav').innerHTML = h;
    document.querySelectorAll('#topNav a').forEach(el => {
        el.addEventListener('click', function(e) {
            e.preventDefault();
            navigate(this.dataset.page);
        });
    });

    let m = '<a data-page="home" onclick="navigate(\'home\');toggleMobileNav()">首页</a>';
    pages.forEach(p => {
        m += `<a data-page="page-${p.slug}" onclick="navigate('page-${p.slug}');toggleMobileNav()">${p.navLabel || p.title}</a>`;
    });
    m += '<a data-page="friends" onclick="navigate(\'friends\');toggleMobileNav()">友链</a>';
    m += '<a data-page="about" onclick="navigate(\'about\');toggleMobileNav()">关于</a>';
    m += '<a data-page="archive" onclick="navigate(\'archive\');toggleMobileNav()">归档</a>';
    document.getElementById('mobileNavOverlay').innerHTML = m;
}

function renderFooter() {
    const f = data.footer || {};
    const s = data.site || {};
    document.getElementById('footerAboutText').textContent = f.about || s.desc || '分享优质资源。';
    const ct = f.contactTitle || '联系方式';
    document.getElementById('footerContactTitle').textContent = '📬 ' + ct;
    let c = '';
    for (let i = 1; i <= 4; i++) {
        const l = f['contact' + i + 'Label'] || '';
        const v = f['contact' + i + 'Value'] || '';
        const u = f['contact' + i + 'Url'] || '';
        if (l && v) {
            if (u) c += `<div>${l} <a href="${u}" target="_blank">${v}</a></div>`;
            else c += `<div>${l} ${v}</div>`;
        }
    }
    if (!c) c = '<div>暂无联系方式</div>';
    document.getElementById('footerContact').innerHTML = c;

    let l = '';
    (f.links || []).forEach(x => {
        l += `<div><a href="${x.url}">${x.name}</a></div>`;
    });
    (data.pages || []).filter(p => p.showInNav).forEach(p => {
        l += `<div><a href="/page/${p.slug}.html">${p.navLabel || p.title}</a></div>`;
    });
    if (!l) l = '<div>暂无链接</div>';
    document.getElementById('footerLinksList').innerHTML = l;
    document.getElementById('footerCopyright').textContent = s.copyright || `© ${new Date().getFullYear()} ${s.title || '莫辞の资源库'}`;
    document.getElementById('footerICP').textContent = s.icp || '';
    document.getElementById('footerICP').style.display = s.icp ? '' : 'none';
    if (f.script) document.getElementById('footerScript').innerHTML = f.script;
}

function renderAds() {
    const a = data.ads || {};
    const map = { adTopBanner: 'topBanner', adMobile: 'mobile', adBottomBanner: 'bottomBanner' };
    Object.entries(map).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = a[key] || '';
            el.style.display = a[key] ? '' : 'none';
        }
    });
}

function renderCats() {
    const cats = data.categories || [];
    const merged = {};
    cats.forEach(c => {
        const n = typeof c === 'string' ? c : c.name;
        if (!merged[n]) merged[n] = { name: n, children: [] };
        if (typeof c !== 'string' && c.children) {
            c.children.forEach(ch => {
                const chName = typeof ch === 'string' ? ch : ch.name;
                if (!merged[n].children.includes(chName)) merged[n].children.push(chName);
            });
        }
    });
    const uniqueCats = Object.values(merged);
    let h = '<span class="cat-tag active" onclick="filterCat(\'全部\')">📂 全部</span>';
    uniqueCats.forEach(c => {
        h += `<span class="cat-tag" onclick="filterCat('${c.name}')">${c.name}</span>`;
    });
    document.getElementById('catBar').innerHTML = h;
    renderSubcats();
}

function renderSubcats() {
    if (currentCat === '全部') {
        document.getElementById('subcatBar').innerHTML = '';
        return;
    }
    const cats = data.categories || [];
    let allChildren = [];
    cats.forEach(c => {
        const n = typeof c === 'string' ? c : c.name;
        if (n === currentCat && typeof c !== 'string' && c.children) {
            c.children.forEach(ch => {
                const chName = typeof ch === 'string' ? ch : ch.name;
                if (!allChildren.includes(chName)) allChildren.push(chName);
            });
        }
    });
    if (allChildren.length === 0) {
        document.getElementById('subcatBar').innerHTML = '';
        return;
    }
    let h = `<span class="subcat-label">📁 ${currentCat}：</span>`;
    h += '<span class="subcat-tag active" onclick="filterSubcat(\'全部\')">全部</span>';
    allChildren.forEach(s => {
        h += `<span class="subcat-tag" onclick="filterSubcat('${s}')">${s}</span>`;
    });
    document.getElementById('subcatBar').innerHTML = h;
}

function filterCat(cat) {
    currentCat = cat;
    currentSubcat = '全部';
    currentPageNum = 1;
    renderCats();
    document.querySelectorAll('.cat-tag').forEach(tag => {
        const txt = tag.textContent.trim();
        tag.classList.toggle('active', txt === cat || (cat === '全部' && txt === '📂 全部'));
    });
    renderCards();
}

function filterSubcat(subcat) {
    currentSubcat = subcat;
    currentPageNum = 1;
    renderSubcats();
    document.querySelectorAll('.subcat-tag').forEach(t => {
        t.classList.toggle('active', t.textContent.trim() === subcat);
    });
    renderCards();
}

// ============================================================
// 核心渲染：卡片/列表 + 分页
// ============================================================

function renderCards() {
    const filtered = getFilteredArticles();
    const total = filtered.length;
    const totalPages = getTotalPages(total);

    if (currentPageNum > totalPages) currentPageNum = totalPages || 1;

    const paginated = getPaginatedItems(filtered, currentPageNum);
    const grid = document.getElementById('cardGrid');

    if (!paginated.length) {
        grid.innerHTML = '<p style="text-align:center;padding:80px;color:var(--text-muted);grid-column:1/-1">📭 暂无内容</p>';
        renderPagination(0, 1);
        return;
    }

    // ⭐ 切换视图类
    grid.className = 'card-grid' + (currentView === 'list' ? ' list-view' : '');

    const randomApi = (data.site && data.site.randomImageApi) || 'https://picsum.photos/400/200?random=';
    let h = '';

    paginated.forEach((a, i) => {
        const coverUrl = a.cover || '';
        const randomImg = coverUrl || `${randomApi}${a.id || i}`;
        const imgHtml = `<img src="${randomImg}" alt="${a.title}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`;

        h += `<div class="card" onclick="openArticle('${a.id}')">
            <div class="card-img">${imgHtml}</div>
            <div class="card-body">
                <span class="card-cat">${a.category || '未分类'}${a.subcategory ? ' · ' + a.subcategory : ''}</span>
                <div class="card-title">${a.title}</div>
                <div class="card-desc">${a.summary || ''}</div>
                <div class="card-date">🕐 ${formatDate(a.created_at)}</div>
            </div>
        </div>`;

        // 列表视图不插入广告
        if (currentView === 'card' && data.ads?.listBetween && (i + 1) % 6 === 0) {
            h += `<div style="grid-column:1/-1">${data.ads.listBetween}</div>`;
        }
    });

    grid.innerHTML = h;
    renderPagination(total, currentPageNum);
    updateViewInfo(total);
}

// ============================================================
// 导航 & 路由
// ============================================================

function navigate(page) {
    currentPage = page;
    document.querySelectorAll('#topNav a').forEach(a => a.classList.remove('active'));
    const activeLink = document.querySelector(`#topNav a[data-page="${page}"]`);
    if (activeLink) activeLink.classList.add('active');

    ['homeView', 'articleView', 'friendsView', 'aboutView', 'archiveView', 'pageView'].forEach(v => {
        const el = document.getElementById(v);
        if (el) el.classList.add('hidden');
    });

    const cs = document.getElementById('catSection');
    if (cs) cs.classList.add('hidden');

    if (page === 'home') {
        document.getElementById('homeView').classList.remove('hidden');
        if (cs) cs.classList.remove('hidden');
        renderCats();
        renderCards();
        window.history.pushState({ page: 'home' }, '', '/');
    } else if (page === 'friends') {
        document.getElementById('friendsView').classList.remove('hidden');
        renderFriends();
    } else if (page === 'about') {
        document.getElementById('aboutView').classList.remove('hidden');
        document.getElementById('aboutContent').innerHTML = data.about || '<p style="text-align:center;padding:60px;color:var(--text-muted)">暂无内容</p>';
    } else if (page === 'archive') {
        document.getElementById('archiveView').classList.remove('hidden');
        renderArchive();
    } else if (page.startsWith('page-')) {
        const slug = page.replace('page-', '');
        const pd = (data.pages || []).find(p => p.slug === slug);
        if (pd) {
            if (!document.getElementById('pageView')) {
                const el = document.createElement('div');
                el.id = 'pageView';
                el.className = 'hidden';
                document.querySelector('.container').appendChild(el);
            }
            document.getElementById('pageView').classList.remove('hidden');
            document.getElementById('pageView').innerHTML = `<div class="page-content"><h2>${pd.title}</h2><div class="article-content">${pd.content || ''}</div></div>`;
            window.history.pushState({ page: page }, '', `/page/${slug}.html`);
        }
    }
}

function handleRoute() {
    const path = location.pathname;
    const pageMatch = path.match(/^\/page\/(.+)\.html$/);
    if (pageMatch) { loadPage(pageMatch[1]); return true; }
    const articleMatch = path.match(/^\/article\/(.+)\/(.+)\.html$/);
    if (articleMatch) { loadArticle(articleMatch[1], articleMatch[2]); return true; }
    return false;
}

async function loadPage(slug) {
    try {
        const r = await fetch(`${API}/page/${slug}.html`);
        const d = await r.json();
        if (d && !d.error) navigate('page-' + slug);
    } catch (e) {}
}

async function loadArticle(catSlug, artSlug) {
    try {
        const r = await fetch(`${API}/article/${catSlug}/${artSlug}.html`);
        const d = await r.json();
        if (d && !d.error) {
            const idx = (data.articles || []).findIndex(x => x.id === d.id);
            if (idx >= 0) data.articles[idx] = d;
            else data.articles.unshift(d);
            openArticle(d.id, true);
        }
    } catch (e) {}
}

// ============================================================
// 文章详情
// ============================================================

function openArticle(id, fromRoute = false) {
    const a = data.articles.find(x => x.id === id);
    if (!a) return;
    currentPage = 'article';
    ['homeView', 'friendsView', 'aboutView', 'archiveView', 'pageView'].forEach(v => {
        const el = document.getElementById(v);
        if (el) el.classList.add('hidden');
    });
    document.getElementById('catSection').classList.add('hidden');
    document.getElementById('articleView').classList.remove('hidden');

    const catSlug = a.category_slug || 'other';
    const artSlug = a.slug || a.article_order || '1';
    if (!fromRoute) {
        window.history.pushState({ articleId: id }, '', `/article/${catSlug}/${artSlug}.html`);
    }

    let links = [];
    if (Array.isArray(a.resource_links)) links = a.resource_links;
    else if (typeof a.resource_links === 'string') {
        try { links = JSON.parse(a.resource_links); } catch (e) {}
    }

    const fullDate = new Date(a.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    let h = `<div class="back-btn" onclick="navigate('home')">← 返回首页</div>
        <div class="article-layout"><div class="article-main">
        <h1>${a.title}</h1>
        <div class="article-meta"><span>📅 ${fullDate}</span><span>📂 ${a.category || '未分类'}${a.subcategory ? ' / ' + a.subcategory : ''}</span></div>`;

    if (data.ads?.inArticle) h += `<div style="margin:16px 0">${data.ads.inArticle}</div>`;
    h += `<div class="article-content">${a.content || ''}</div>`;

    const idx = data.articles.findIndex(x => x.id === id);
    const prev = idx > 0 ? data.articles[idx - 1] : null;
    const next = idx < data.articles.length - 1 ? data.articles[idx + 1] : null;
    if (prev || next) {
        h += '<div class="prev-next">';
        if (prev) h += `<a onclick="openArticle('${prev.id}')">← ${prev.title}</a>`;
        else h += '<span></span>';
        if (next) h += `<a onclick="openArticle('${next.id}')">${next.title} →</a>`;
        else h += '<span></span>';
        h += '</div>';
    }

    const related = data.articles.filter(x => x.category === a.category && x.id !== a.id).slice(0, 4);
    if (related.length > 0) {
        h += `<div class="related-box"><h3>📖 相关文章</h3><div class="related-grid">`;
        related.forEach(r => {
            h += `<div class="related-item" onclick="openArticle('${r.id}')">
                <img src="${r.cover || ''}" onerror="this.style.display='none'"><span>${r.title}</span>
            </div>`;
        });
        h += '</div></div>';
    }

    h += `<div class="disclaimer-box"><strong>📢 免责声明</strong><br>
        1. 本站资源来源于网络收集，仅供学习交流使用，请勿用于商业用途。本站不提供任何技术支持。<br>
        2. 如本站内容侵犯了您的合法权益，请通过联系方式告知，我们将第一时间核实处理。</div>
        </div><div class="article-sidebar"><div class="sidebar-card">`;

    if (data.ads?.sidebar) h += `<div style="margin-bottom:12px">${data.ads.sidebar}</div>`;

    if (links.length > 0) {
        h += '<div class="resource-header">📥 资源下载</div>';
        links.forEach((res, i) => {
            h += '<div class="resource-item">';
            if (res.image) h += `<img src="${res.image}" onerror="this.style.display='none'">`;
            if (res.title) h += `<div class="res-title">${res.title}</div>`;
            if (res.desc) h += `<div class="res-desc">${res.desc}</div>`;
            const type = res.accessType || 'free';
            const btnText = res.btnText || '下载';

            if (type === 'free') {
                h += `<button class="res-btn free" onclick="event.stopPropagation();redirectToGo('${a.id}', ${i})">🚀 ${btnText}</button>`;
            } else if (type === 'password') {
                h += `<button class="res-btn password" onclick="event.stopPropagation();openPwdModal('${a.id}', ${i})">🔒 ${btnText}</button>`;
            } else if (type === 'pay') {
                h += `<button class="res-btn pay" onclick="event.stopPropagation();openPayModal('${a.id}', ${i})">💰 ${btnText} · ¥${res.price || 0}</button>`;
            }
            h += '</div>';
        });
    }

    h += `<div class="toc-title">📑 文章目录</div><ul class="toc-list" id="tocList"></ul>
        </div></div></div>`;

    document.getElementById('articleView').innerHTML = h;
    setTimeout(() => {
        document.querySelectorAll('#articleView pre code').forEach(block => hljs.highlightElement(block));
        generateTOC();
    }, 150);
    window.scrollTo(0, 0);
}

function generateTOC() {
    const headings = document.querySelectorAll('#articleView .article-content h1, #articleView .article-content h2, #articleView .article-content h3');
    const toc = document.getElementById('tocList');
    if (!toc) return;
    if (!headings.length) {
        toc.innerHTML = '<li style="color:var(--text-muted);padding:8px">暂无目录</li>';
        return;
    }
    headings.forEach((h, i) => {
        if (!h.id) h.id = 'h-' + i;
    });
    toc.innerHTML = Array.from(headings).map(h =>
        `<li><a href="#${h.id}" onclick="event.preventDefault();document.getElementById('${h.id}').scrollIntoView({behavior:'smooth'})">${h.textContent}</a></li>`
    ).join('');
}

// ============================================================
// 友链
// ============================================================

function renderFriends() {
    const fs = data.friends || [];
    document.getElementById('friendsList').innerHTML = fs.length
        ? fs.map(f => `<a href="${f.url}" target="_blank" rel="noopener" class="friend-link"><strong>${f.name}</strong>${f.desc ? '<span>' + f.desc + '</span>' : ''}</a>`).join('')
        : '<p style="text-align:center;padding:60px;color:var(--text-muted)">暂无友链</p>';
}

// ============================================================
// 归档
// ============================================================

function renderArchive() {
    const arts = data.articles || [];
    const grouped = {};
    arts.forEach(a => {
        const y = new Date(a.created_at).getFullYear();
        if (!grouped[y]) grouped[y] = [];
        grouped[y].push(a);
    });
    const years = Object.keys(grouped).sort((a, b) => b - a);
    if (!years.length) {
        document.getElementById('archiveList').innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-muted)">暂无文章</p>';
        return;
    }
    let h = '';
    years.forEach(y => {
        h += `<h3 style="color:var(--accent)">📅 ${y} 年</h3>`;
        grouped[y].sort((a, b) => b.created_at - a.created_at).forEach(a => {
            h += `<div class="friend-link" style="cursor:pointer" onclick="openArticle('${a.id}')">
                <strong>${a.title}</strong>
                <span>${new Date(a.created_at).toLocaleDateString('zh-CN')} · ${a.category || ''}</span>
            </div>`;
        });
    });
    document.getElementById('archiveList').innerHTML = h;
}

// ============================================================
// 搜索
// ============================================================

function openSearch() {
    document.getElementById('searchModalInput').value = document.getElementById('searchInput').value;
    document.getElementById('searchResults').innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-muted)">输入关键词搜索</p>';
    document.getElementById('searchModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('searchModalInput').focus(), 100);
}

async function doSearch() {
    const q = document.getElementById('searchModalInput').value.trim();
    if (!q) return;
    try {
        const r = await fetch(`${API}/search?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        document.getElementById('searchResults').innerHTML = (d.results || []).length
            ? d.results.map(a =>
                `<div class="search-result-item" onclick="document.getElementById('searchModal').classList.add('hidden');openArticle('${a.id}')">
                    <strong>${a.title}</strong><small>${a.summary || ''}</small>
                </div>`
            ).join('')
            : '<p style="text-align:center;padding:20px;color:var(--text-muted)">未找到结果</p>';
    } catch (e) {
        toast('❌ 搜索失败');
    }
}

// ============================================================
// 初始化
// ============================================================

async function init() {
    // 1. 渲染 HTML 骨架
    renderApp();

    // 2. ⭐ 恢复视图偏好
    try {
        const savedView = localStorage.getItem('moci_view_preference');
        if (savedView === 'list' || savedView === 'card') {
            currentView = savedView;
        }
    } catch (e) {}

    // 3. 加载数据
    try {
        const r = await fetch(`${API}/data`);
        if (r.ok) data = await r.json();
    } catch (e) {
        console.error('加载数据失败:', e);
    }

    ['articles', 'categories', 'friends', 'pages'].forEach(k => {
        if (!data[k]) data[k] = [];
    });
    ['about', 'site', 'seo', 'footer', 'ads'].forEach(k => {
        if (!data[k]) data[k] = {};
    });

    applySiteConfig();
    renderNav();
    renderFooter();
    renderAds();

    // 4. ⭐ 应用视图按钮状态
    setTimeout(() => {
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === currentView);
        });
        if (!handleRoute()) navigate('home');
    }, 100);

    // 5. 事件监听
    window.addEventListener('scroll', () => {
        const btn = document.getElementById('backToTop');
        if (btn) btn.classList.toggle('show', window.scrollY > 500);
    });
    window.addEventListener('popstate', () => {
        if (!handleRoute()) navigate('home');
    });

    document.addEventListener('click', e => {
        if (e.target.classList.contains('modal-overlay')) {
            e.target.classList.add('hidden');
        }
    });
}

// ============================================================
// 启动
// ============================================================

document.addEventListener('DOMContentLoaded', init);
