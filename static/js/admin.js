// ============================================================
// static/js/admin.js
// 莫辞の资源库 - 管理后台完整逻辑
// ============================================================

const API = 'https://site-api.moci.cc';
const PWD = 'x1291095';
const ADMIN_HASH = 'a841990184dd6b62b721e5641e6f55bc5bc8a5909d6fcf3e9bae6e7a7d5b2eb7';

let config = { categories: [], friends: [], pages: [], about: '', site: {}, seo: {}, footer: {}, ads: {}, smtp: {} };
let articles = [];
let quill = null, aboutQuill = null, pageQuill = null;
let editIdx = -1, resourceLinks = [], editingPageIndex = -1;

function $(id) { return document.getElementById(id); }

function toast(msg, err) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (err ? ' error' : '') + ' show';
    setTimeout(() => t.classList.remove('show'), 2500);
}

function toggleSidebar() {
    $('sidebar').classList.toggle('open');
}

// ============================================================
// 登录/登出
// ============================================================

async function login() {
    const p = $('loginPwd').value;
    if (!p) { $('loginError').textContent = '请输入密码'; return; }
    const e = new TextEncoder();
    const b = await crypto.subtle.digest('SHA-256', e.encode(p));
    if (Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('') === ADMIN_HASH) {
        sessionStorage.setItem('admin_logged', 'true');
        $('loginOverlay').style.display = 'none';
        $('sidebar').style.display = 'flex';
        $('mainContent').style.display = 'block';
        if (window.innerWidth <= 768) $('hamburgerBtn').style.display = 'flex';
        loadAll();
    } else {
        $('loginError').textContent = '密码错误';
        $('loginPwd').value = '';
    }
}

function logout() {
    sessionStorage.removeItem('admin_logged');
    location.reload();
}

if (sessionStorage.getItem('admin_logged') === 'true') {
    $('loginOverlay').style.display = 'none';
    $('sidebar').style.display = 'flex';
    $('mainContent').style.display = 'block';
    if (window.innerWidth <= 768) $('hamburgerBtn').style.display = 'flex';
    loadAll();
}

// ============================================================
// R2 上传 + Quill 初始化
// ============================================================

async function uploadToR2File(file) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('password', PWD);
    const r = await fetch(`${API}/upload`, { method: 'POST', body: fd });
    const d = await r.json();
    if (d.success) return d.url;
    throw new Error(d.error || '上传失败');
}

function initQuill() {
    function imgHandler(editor) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.click();
        input.onchange = async () => {
            const f = input.files[0];
            if (!f) return;
            try {
                toast('📤 上传中...');
                const url = await uploadToR2File(f);
                const range = editor.getSelection();
                editor.insertEmbed(range.index, 'image', url);
                toast('✅ 已上传');
            } catch (e) {
                toast('❌ 上传失败', true);
            }
        };
    }
    function bindPasteUpload(editor) {
        editor.root.addEventListener('paste', async (e) => {
            const items = (e.clipboardData || window.clipboardData).items;
            for (const item of items) {
                if (item.type.indexOf('image') !== -1) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        try {
                            toast('📤 图片上传中...');
                            const url = await uploadToR2File(file);
                            const range = editor.getSelection();
                            editor.insertEmbed(range.index, 'image', url);
                            toast('✅ 已上传');
                        } catch (err) {
                            toast('❌ 上传失败', true);
                        }
                    }
                    return;
                }
            }
            const html = (e.clipboardData || window.clipboardData).getData('text/html');
            if (html && /<img[^>]+src=["']data:image\/[^"']+["'][^>]*>/gi.test(html)) {
                e.preventDefault();
                toast('⚠️ 请直接粘贴截图或使用上传按钮', true);
            }
        });
    }

    quill = new Quill('#quillEditor', {
        theme: 'snow',
        modules: {
            toolbar: {
                container: [[{ 'header': [1, 2, 3, false] }], ['bold', 'italic', 'underline'], ['blockquote', 'code-block'], [{ 'list': 'ordered' }, { 'list': 'bullet' }], ['link', 'image', 'video'], ['clean']],
                handlers: { image: () => imgHandler(quill) }
            }
        },
        placeholder: '文章内容...'
    });
    bindPasteUpload(quill);

    aboutQuill = new Quill('#aboutEditor', {
        theme: 'snow',
        modules: {
            toolbar: {
                container: [[{ 'header': [1, 2, false] }], ['bold', 'italic'], ['link', 'image'], ['clean']],
                handlers: { image: () => imgHandler(aboutQuill) }
            }
        },
        placeholder: '关于页面...'
    });
    bindPasteUpload(aboutQuill);

    pageQuill = new Quill('#pageQuillEditor', {
        theme: 'snow',
        modules: {
            toolbar: {
                container: [[{ 'header': [1, 2, 3, false] }], ['bold', 'italic', 'underline'], ['blockquote', 'code-block'], [{ 'list': 'ordered' }, { 'list': 'bullet' }], ['link', 'image', 'video'], ['clean']],
                handlers: { image: () => imgHandler(pageQuill) }
            }
        },
        placeholder: '单页内容...'
    });
    bindPasteUpload(pageQuill);
}

// ============================================================
// 数据加载/保存
// ============================================================

async function loadAll() {
    try {
        const r = await fetch(`${API}/data`);
        if (r.ok) {
            const d = await r.json();
            config = { categories: d.categories || [], friends: d.friends || [], pages: d.pages || [], about: d.about || '', site: d.site || {}, seo: d.seo || {}, footer: d.footer || {}, ads: d.ads || {}, smtp: d.smtp || {} };
            articles = d.articles || [];
        }
    } catch (e) {}
    renderAll();
}

function renderAll() {
    renderArticles();
    renderCategories();
    renderFriends();
    renderPages();
    loadOrders();
    $('siteTitle').value = config.site?.title || '';
    $('siteSubtitle').value = config.site?.subtitle || '';
    $('siteDesc').value = config.site?.desc || '';
    $('siteKeywords').value = config.site?.keywords || '';
    $('siteLogo').value = config.site?.logo || '';
    $('siteFavicon').value = config.site?.favicon || '';
    $('siteCopyright').value = config.site?.copyright || '';
    $('siteICP').value = config.site?.icp || '';
    $('randomImageApi').value = config.site?.randomImageApi || 'https://picsum.photos/400/200?random=';
    $('seoDesc').value = config.seo?.desc || '';
    $('seoKeywords').value = config.seo?.keywords || '';
    $('seoGoogle').value = config.seo?.google || '';
    $('seoBing').value = config.seo?.bing || '';
    $('seoBaidu').value = config.seo?.baidu || '';
    $('seoSitemap').value = config.seo?.sitemap !== false ? '1' : '0';
    $('seoRSS').value = config.seo?.rss !== false ? '1' : '0';
    $('seoRSSCount').value = config.seo?.rssCount || 20;
    $('seoSitemapUrl').value = config.seo?.sitemapUrl || '';
    $('seoRobots').value = config.seo?.robots || '';
    $('footerAbout').value = config.footer?.about || '';
    $('footerContactTitle').value = config.footer?.contactTitle || '联系方式';
    for (let i = 1; i <= 4; i++) {
        $('footerContact' + i + 'Label').value = config.footer?.['contact' + i + 'Label'] || '';
        $('footerContact' + i + 'Value').value = config.footer?.['contact' + i + 'Value'] || '';
        $('footerContact' + i + 'Url').value = config.footer?.['contact' + i + 'Url'] || '';
    }
    $('footerLinks').value = JSON.stringify(config.footer?.links || [], null, 2);
    $('footerScript').value = config.footer?.script || '';
    $('adTopBanner').value = config.ads?.topBanner || '';
    $('adSidebar').value = config.ads?.sidebar || '';
    $('adInArticle').value = config.ads?.inArticle || '';
    $('adBottomBanner').value = config.ads?.bottomBanner || '';
    $('adListBetween').value = config.ads?.listBetween || '';
    $('adMobile').value = config.ads?.mobile || '';
    $('smtpHost').value = config.smtp?.host || '';
    $('smtpPort').value = config.smtp?.port || '587';
    $('smtpUser').value = config.smtp?.user || '';
    $('smtpPass').value = config.smtp?.pass || '';
    $('smtpFromName').value = config.smtp?.fromName || '莫辞の资源库';
    $('smtpSecure').value = config.smtp?.secure || 'tls';
    if (aboutQuill) aboutQuill.root.innerHTML = config.about || '';
}

async function saveAll() {
    config.site = { title: $('siteTitle').value, subtitle: $('siteSubtitle').value, desc: $('siteDesc').value, keywords: $('siteKeywords').value, logo: $('siteLogo').value, favicon: $('siteFavicon').value, copyright: $('siteCopyright').value, icp: $('siteICP').value, randomImageApi: $('randomImageApi').value || 'https://picsum.photos/400/200?random=' };
    config.seo = { desc: $('seoDesc').value, keywords: $('seoKeywords').value, google: $('seoGoogle').value, bing: $('seoBing').value, baidu: $('seoBaidu').value, sitemap: $('seoSitemap').value === '1', rss: $('seoRSS').value === '1', rssCount: parseInt($('seoRSSCount').value) || 20, sitemapUrl: $('seoSitemapUrl').value, robots: $('seoRobots').value };
    const footer = { about: $('footerAbout').value, contactTitle: $('footerContactTitle').value || '联系方式', links: (() => { try { return JSON.parse($('footerLinks').value); } catch (e) { return []; } })(), script: $('footerScript').value };
    for (let i = 1; i <= 4; i++) { footer['contact' + i + 'Label'] = $('footerContact' + i + 'Label').value; footer['contact' + i + 'Value'] = $('footerContact' + i + 'Value').value; footer['contact' + i + 'Url'] = $('footerContact' + i + 'Url').value; }
    config.footer = footer;
    config.ads = { topBanner: $('adTopBanner').value, sidebar: $('adSidebar').value, inArticle: $('adInArticle').value, bottomBanner: $('adBottomBanner').value, listBetween: $('adListBetween').value, mobile: $('adMobile').value };
    config.smtp = { host: $('smtpHost').value, port: parseInt($('smtpPort').value) || 587, user: $('smtpUser').value, pass: $('smtpPass').value, fromName: $('smtpFromName').value || '莫辞の资源库', secure: $('smtpSecure').value || 'tls' };
    config.about = aboutQuill ? aboutQuill.root.innerHTML : '';
    try {
        const r = await fetch(`${API}/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PWD, data: config }) });
        const d = await r.json();
        toast(d.success ? '✅ 保存成功' : '❌ ' + d.error, !d.success);
    } catch (e) { toast('❌ 网络错误', true); }
}

// ============================================================
// 导航切换
// ============================================================

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        this.classList.add('active');
        document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
        const p = $(`panel-${this.dataset.panel}`);
        if (p) p.classList.remove('hidden');
        if (window.innerWidth <= 768) $('sidebar').classList.remove('open');
    });
});

// ============================================================
// 分类管理
// ============================================================

function getMergedCategories() {
    const cats = config.categories || [];
    const merged = {};
    cats.forEach(c => {
        const n = typeof c === 'string' ? c : c.name;
        const s = c.slug || '';
        if (!merged[n]) merged[n] = { name: n, slug: s, children: {} };
        if (typeof c !== 'string' && c.children) {
            c.children.forEach(ch => {
                const chName = typeof ch === 'string' ? ch : ch.name;
                const chSlug = typeof ch === 'string' ? '' : ch.slug || '';
                merged[n].children[chName] = chSlug;
            });
        }
    });
    return Object.values(merged).map(c => ({ ...c, children: Object.entries(c.children).map(([name, slug]) => ({ name, slug })) }));
}

function renderCategories() {
    const uniqueCats = getMergedCategories();
    $('categoryList').innerHTML = uniqueCats.map(c =>
        `<div class="list-item"><div class="item-info"><div class="item-title">${c.name} ${c.slug ? `<small style="color:var(--text-muted)">(${c.slug})</small>` : ''}</div>${c.children.length ? `<div class="item-meta">子分类：${c.children.map(ch => ch.name + (ch.slug ? `(${ch.slug})` : '')).join(', ')}</div>` : ''}</div><button class="btn small danger" onclick="deleteCategoryByName('${c.name}')">删除</button></div>`
    ).join('');
    updateCatSelects();
}

function deleteCategoryByName(name) {
    config.categories = (config.categories || []).filter(c => {
        const n = typeof c === 'string' ? c : c.name;
        return n !== name;
    });
    renderCategories();
}

function addCategory() {
    const n = $('catName').value.trim(),
        ps = $('catSlug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'),
        chRaw = $('catChildren').value.trim();
    let children = [];
    if (chRaw) {
        children = chRaw.split(',').map(s => {
            const parts = s.trim().split('|');
            return { name: parts[0].trim(), slug: (parts[1] || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') };
        }).filter(c => c.name);
    }
    if (n) {
        config.categories.push({ name: n, slug: ps, children });
        renderCategories();
        $('catName').value = '';
        $('catSlug').value = '';
        $('catChildren').value = '';
    }
}

function updateCatSelects() {
    const uniqueCats = getMergedCategories();
    let o = '<option value="">未分类</option>';
    uniqueCats.forEach(c => {
        o += `<option value="${c.name}" data-slug="${c.slug}">${c.name}${c.slug ? ' (' + c.slug + ')' : ''}</option>`;
    });
    $('artCategory').innerHTML = o;
}

function updateSubcat(cat) {
    const cats = config.categories || [];
    let allChildren = [];
    cats.forEach(c => {
        const n = typeof c === 'string' ? c : c.name;
        if (n === cat && typeof c !== 'string' && c.children) {
            c.children.forEach(ch => {
                const chName = typeof ch === 'string' ? ch : ch.name;
                const chSlug = typeof ch === 'string' ? '' : ch.slug || '';
                if (!allChildren.find(x => x.name === chName)) allChildren.push({ name: chName, slug: chSlug });
            });
        }
    });
    let o = '<option value="">无</option>';
    allChildren.forEach(ch => {
        o += `<option value="${ch.name}" data-slug="${ch.slug}">${ch.name}${ch.slug ? ' (' + ch.slug + ')' : ''}</option>`;
    });
    $('artSubcategory').innerHTML = o;
}

$('artCategory').addEventListener('change', function() { updateSubcat(this.value); });

// ============================================================
// 文章管理
// ============================================================

function renderArticles() {
    $('articleList').innerHTML = articles.map((a, i) => {
        let links = [];
        if (Array.isArray(a.resource_links)) links = a.resource_links;
        else if (typeof a.resource_links === 'string') try { links = JSON.parse(a.resource_links); } catch (e) {}
        return `<div class="list-item"><div class="item-info"><div class="item-title">${a.title || '无标题'}</div><div class="item-meta">${a.category || ''} ${a.subcategory || ''} · ${links.length}资源</div></div><div style="display:flex;gap:4px"><button class="btn small" onclick="openArticleEdit(${i})">✏️</button><button class="btn small danger" onclick="deleteArticle('${a.id}',${i})">🗑</button></div></div>`;
    }).join('');
}

function openArticleEdit(idx = -1) {
    $('articleModal').classList.remove('hidden');
    editIdx = idx;
    resourceLinks = [];
    updateCatSelects();
    if (idx >= 0) {
        const a = articles[idx];
        $('articleId').value = a.id;
        $('artTitle').value = a.title || '';
        $('artSummary').value = a.summary || '';
        $('artCover').value = a.cover || '';
        $('artCategory').value = a.category || '';
        updateSubcat(a.category);
        $('artSubcategory').value = a.subcategory || '';
        if (Array.isArray(a.resource_links)) resourceLinks = JSON.parse(JSON.stringify(a.resource_links));
        else if (typeof a.resource_links === 'string') try { resourceLinks = JSON.parse(a.resource_links || '[]'); } catch (e) {}
        resourceLinks = resourceLinks.map(r => ({ title: r.title || '', desc: r.desc || '', image: r.image || '', url: r.url || '', btnText: r.btnText || '下载', accessType: r.accessType || 'free', password: r.password || '', price: r.price || 0, qrcode: r.qrcode || '' }));
        $('modalTitle').textContent = '编辑文章';
        if (quill) quill.root.innerHTML = a.content || '';
    } else {
        $('articleId').value = '';
        $('artTitle').value = '';
        $('artSummary').value = '';
        $('artCover').value = '';
        $('artCategory').value = '';
        $('artSubcategory').value = '';
        $('modalTitle').textContent = '新建文章';
        if (quill) quill.root.innerHTML = '';
    }
    renderResourceLinks();
}

function addResourceLink(d = {}) {
    resourceLinks.push({ title: d.title || '', desc: d.desc || '', image: d.image || '', url: d.url || '', btnText: d.btnText || '下载', accessType: d.accessType || 'free', password: '', price: d.price || 0, qrcode: d.qrcode || '' });
    renderResourceLinks();
}

function removeResourceLink(i) {
    resourceLinks.splice(i, 1);
    renderResourceLinks();
}

function toggleAccessType(i) {
    const type = resourceLinks[i].accessType;
    const pwdGroup = document.getElementById('pwdGroup' + i);
    const payGroup = document.getElementById('payGroup' + i);
    if (pwdGroup) pwdGroup.style.display = (type === 'password') ? 'block' : 'none';
    if (payGroup) payGroup.style.display = (type === 'pay') ? 'block' : 'none';
    const inputs = document.querySelectorAll('#resourceLinksList input');
    inputs.forEach(el => el.classList.remove('error'));
}

function renderResourceLinks() {
    if (resourceLinks.length === 0) {
        $('resourceLinksList').innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:14px;border:1px dashed var(--border);border-radius:var(--radius)">暂无资源，点击上方按钮添加</p>';
        return;
    }
    $('resourceLinksList').innerHTML = resourceLinks.map((rl, i) =>
        `<div style="border:1px solid var(--border-light);padding:12px;border-radius:var(--radius);margin-bottom:8px;background:var(--bg)" data-index="${i}">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                <strong style="color:var(--accent)">📦 资源 #${i+1}</strong>
                <button class="btn small danger" onclick="removeResourceLink(${i})">🗑</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                <div><label>标题 <span class="required">*</span></label><input type="text" class="res-title-input" value="${rl.title}" onchange="resourceLinks[${i}].title=this.value" placeholder="资源名称"></div>
                <div><label>描述</label><input type="text" value="${rl.desc}" onchange="resourceLinks[${i}].desc=this.value" placeholder="简短描述"></div>
                <div><label>图片 URL</label><input type="text" value="${rl.image}" onchange="resourceLinks[${i}].image=this.value" placeholder="https://r2.moci.cc/cover.jpg"></div>
                <div><label>链接 <span class="required">*</span></label><input type="text" class="res-url-input" value="${rl.url}" onchange="resourceLinks[${i}].url=this.value" placeholder="https://example.com/file.zip"></div>
                <div><label>按钮文字</label><input type="text" value="${rl.btnText}" onchange="resourceLinks[${i}].btnText=this.value"></div>
                <div><label>类型 <span class="required">*</span></label>
                    <select onchange="resourceLinks[${i}].accessType=this.value;toggleAccessType(${i})">
                        <option value="free" ${rl.accessType==='free'?'selected':''}>🌐 公开</option>
                        <option value="password" ${rl.accessType==='password'?'selected':''}>🔒 密码</option>
                        <option value="pay" ${rl.accessType==='pay'?'selected':''}>💰 付费</option>
                    </select>
                </div>
            </div>
            <div id="pwdGroup${i}" style="margin-top:6px;display:${rl.accessType==='password'?'block':'none'}">
                <label>密码 <span class="required">*</span></label>
                <input type="text" class="res-pwd-input" value="${rl.password||''}" onchange="resourceLinks[${i}].password=this.value" placeholder="设置下载密码">
                <div class="field-hint">密码将在前台验证，请牢记</div>
            </div>
            <div id="payGroup${i}" style="margin-top:6px;display:${rl.accessType==='pay'?'block':'none'}">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                    <div><label>价格 (¥) <span class="required">*</span></label>
                        <input type="number" class="res-price-input" step="0.01" min="0.01" value="${rl.price}" onchange="resourceLinks[${i}].price=parseFloat(this.value)||0" placeholder="0.00">
                        <div class="field-hint">必须大于 0</div>
                    </div>
                    <div><label>收款码 URL <span class="required">*</span></label>
                        <input type="text" class="res-qrcode-input" value="${rl.qrcode}" onchange="resourceLinks[${i}].qrcode=this.value" placeholder="https://r2.moci.cc/qrcode.png">
                    </div>
                </div>
            </div>
        </div>`
    ).join('');
}

function validateResourceLinks() {
    let errors = [];
    resourceLinks.forEach((rl, i) => {
        if (!rl.title || !rl.title.trim()) { errors.push(`资源 #${i+1}: 标题不能为空`); }
        if (!rl.url || !rl.url.trim()) { errors.push(`资源 #${i+1}: 链接不能为空`); } else if (!rl.url.startsWith('http://') && !rl.url.startsWith('https://')) { errors.push(`资源 #${i+1}: 链接格式无效，必须以 http:// 或 https:// 开头`); }
        if (rl.accessType === 'password') {
            if (!rl.password || !rl.password.trim()) { errors.push(`资源 #${i+1}: 密码类型必须设置密码`); }
        }
        if (rl.accessType === 'pay') {
            if (!rl.price || rl.price <= 0) { errors.push(`资源 #${i+1}: 付费类型价格必须大于 0`); }
            if (!rl.qrcode || !rl.qrcode.trim()) { errors.push(`资源 #${i+1}: 付费类型必须设置收款码 URL`); }
        }
    });
    return errors;
}

async function saveArticle() {
    const title = $('artTitle').value.trim();
    if (!title) { toast('请填写文章标题', true);
        $('artTitle').focus(); return; }
    const validationErrors = validateResourceLinks();
    if (validationErrors.length > 0) { toast('❌ ' + validationErrors.join('；'), true); return; }
    const catSelect = $('artCategory');
    const subcatSelect = $('artSubcategory');
    const catSlug = catSelect.options[catSelect.selectedIndex]?.dataset?.slug || '';
    const subcatSlug = subcatSelect.options[subcatSelect.selectedIndex]?.dataset?.slug || '';
    const article = {
        id: editIdx >= 0 ? articles[editIdx].id : crypto.randomUUID(),
        title: title,
        slug: editIdx >= 0 ? articles[editIdx].slug : '',
        summary: $('artSummary').value.trim(),
        cover: $('artCover').value.trim(),
        category: $('artCategory').value,
        category_slug: catSlug,
        subcategory: $('artSubcategory').value,
        subcategory_slug: subcatSlug,
        resource_links: JSON.stringify(resourceLinks),
        content: quill ? quill.root.innerHTML : ''
    };
    const m = editIdx >= 0 ? 'PUT' : 'POST',
        u = editIdx >= 0 ? `${API}/articles/${article.id}` : `${API}/articles`;
    try {
        const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PWD, article }) });
        const d = await r.json();
        if (d.success) {
            if (editIdx >= 0) articles[editIdx] = article;
            else articles.unshift(article);
            $('articleModal').classList.add('hidden');
            renderArticles();
            toast('✅ 已保存');
        } else toast('❌ ' + d.error, true);
    } catch (e) { toast('❌ 网络错误', true); }
}

async function deleteArticle(id, idx) {
    if (!confirm('确定删除？')) return;
    try {
        const r = await fetch(`${API}/articles/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PWD }) });
        const d = await r.json();
        if (d.success) { articles.splice(idx, 1);
            renderArticles();
            toast('✅ 已删除'); } else toast('❌ ' + d.error, true);
    } catch (e) { toast('❌ 网络错误', true); }
}

// ============================================================
// 友链管理
// ============================================================

function renderFriends() {
    $('friendList').innerHTML = (config.friends || []).map((f, i) =>
        `<div class="list-item"><div class="item-info"><div class="item-title">${f.name}</div><div class="item-meta">${f.url}</div></div><button class="btn small danger" onclick="config.friends.splice(${i},1);renderFriends()">删除</button></div>`
    ).join('');
}

function addFriend() {
    const n = $('friendName').value.trim(),
        u = $('friendUrl').value.trim();
    if (n && u) { config.friends.push({ name: n, url: u, desc: $('friendDesc').value.trim() });
        renderFriends();
        $('friendName').value = '';
        $('friendUrl').value = '';
        $('friendDesc').value = ''; }
}

// ============================================================
// 单页管理
// ============================================================

function renderPages() {
    const pages = config.pages || [];
    $('pagesList').innerHTML = pages.length ? pages.map((p, i) =>
        `<div class="list-item"><div class="item-info"><div class="item-title">${p.title}</div><div class="item-meta">/page/${p.slug} · ${p.showInNav?'✅ 导航:'+p.navLabel:'❌ 隐藏'}</div></div><div style="display:flex;gap:4px"><button class="btn small" onclick="openPageEdit(${i})">✏️</button><button class="btn small danger" onclick="config.pages.splice(${i},1);renderPages()">🗑</button></div></div>`
    ).join('') : '<p style="text-align:center;padding:30px;color:var(--text-muted)">暂无单页</p>';
}

function openPageEdit(idx = -1) {
    $('pageModal').classList.remove('hidden');
    editingPageIndex = idx;
    if (idx >= 0) {
        const p = config.pages[idx];
        $('pageId').value = idx;
        $('pageTitle').value = p.title;
        $('pageSlug').value = p.slug;
        $('pageShowInNav').value = p.showInNav ? '1' : '0';
        $('pageNavLabel').value = p.navLabel || '';
        $('pageModalTitle').textContent = '编辑单页';
        if (pageQuill) pageQuill.root.innerHTML = p.content || '';
    } else {
        $('pageId').value = '-1';
        $('pageTitle').value = '';
        $('pageSlug').value = '';
        $('pageShowInNav').value = '1';
        $('pageNavLabel').value = '';
        $('pageModalTitle').textContent = '新建单页';
        if (pageQuill) pageQuill.root.innerHTML = '';
    }
}

function savePage() {
    const title = $('pageTitle').value.trim(),
        slug = $('pageSlug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!title || !slug) { toast('请填写标题和标识', true); return; }
    const dup = (config.pages || []).find((p, i) => p.slug === slug && i !== editingPageIndex);
    if (dup) { toast('标识已存在', true); return; }
    const d = { id: editingPageIndex >= 0 ? config.pages[editingPageIndex].id : 'p-' + Date.now(), title, slug, content: pageQuill ? pageQuill.root.innerHTML : '', showInNav: $('pageShowInNav').value === '1', navLabel: $('pageNavLabel').value.trim() || title };
    if (!config.pages) config.pages = [];
    if (editingPageIndex >= 0) config.pages[editingPageIndex] = d;
    else config.pages.push(d);
    $('pageModal').classList.add('hidden');
    renderPages();
    toast('✅ 已保存');
}

// ============================================================
// 订单管理
// ============================================================

async function loadOrders() {
    try {
        const r = await fetch(`${API}/orders?password=${PWD}`);
        const d = await r.json();
        const orders = d.orders || [],
            f = $('orderFilter').value;
        const fd = f === 'all' ? orders : orders.filter(o => o.status === f);
        $('orderList').innerHTML = fd.length ? fd.map(o =>
            `<div class="list-item"><div class="item-info"><div class="item-title">${o.article_title}</div><div class="item-meta">📧${o.user_email} 💰¥${o.amount} 🕐${new Date(o.created_at).toLocaleString()}</div></div><div style="display:flex;align-items:center;gap:6px"><span class="tag" style="background:${o.status==='completed'?'#d1fae5':'#fef3c7'};color:${o.status==='completed'?'#065f46':'#92400e'}">${o.status==='completed'?'✅已完成':'⏳待确认'}</span>${o.status==='pending'?`<button class="btn small success" onclick="confirmOrder('${o.id}')">✅确认</button>`:''}</div></div>`
        ).join('') : '<p style="text-align:center;padding:30px;color:var(--text-muted)">暂无订单</p>';
    } catch (e) { toast('加载失败', true); }
}

async function confirmOrder(id) {
    if (!confirm('确认收款并发送邮件？')) return;
    try {
        const r = await fetch(`${API}/order-confirm`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PWD, orderId: id }) });
        const d = await r.json();
        toast(d.success ? '✅ ' + d.message : '❌ ' + d.error, !d.success);
        loadOrders();
    } catch (e) { toast('❌ 网络错误', true); }
}

// ============================================================
// SMTP 测试
// ============================================================

async function testSMTP() {
    const email = prompt('测试邮箱：');
    if (!email) return;
    const smtp = { host: $('smtpHost').value, port: parseInt($('smtpPort').value) || 587, user: $('smtpUser').value, pass: $('smtpPass').value, fromName: $('smtpFromName').value || '莫辞の资源库', secure: $('smtpSecure').value || 'tls' };
    if (!smtp.host || !smtp.user || !smtp.pass) { $('smtpTestResult').innerHTML = '<span style="color:var(--danger)">❌ 请填写完整</span>'; return; }
    $('smtpTestResult').innerHTML = '<span style="color:var(--accent)">⏳ 发送中...</span>';
    try {
        const r = await fetch(`${API}/test-smtp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PWD, smtp, to: email }) });
        const d = await r.json();
        $('smtpTestResult').innerHTML = d.success ? '<span style="color:var(--success)">✅ 成功</span>' : `<span style="color:var(--danger)">❌ ${d.error}</span>`;
    } catch (e) { $('smtpTestResult').innerHTML = '<span style="color:var(--danger)">❌ 网络错误</span>'; }
}

// ============================================================
// 初始化
// ============================================================

initQuill();
setInterval(() => {
    if (sessionStorage.getItem('admin_logged') === 'true') saveAll();
}, 120000);
