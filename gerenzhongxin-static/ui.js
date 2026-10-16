'use strict';
function safeWebUrl(value) {
    if (!value) return '';
    try { const url = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
// Attach the session only to same-origin API calls, including existing admin tools.
const originalFetch = window.fetch.bind(window);
window.fetch = function(input, init = {}) {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        const token = localStorage.getItem('nfc_login_token');
        if (token) headers.set('Authorization', 'Bearer ' + token);
        init = { ...init, headers };
    }
    return originalFetch(input, init);
};
document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggle-password');
    const password = document.getElementById('password');
    if (toggle) toggle.addEventListener('click', () => {
        const show = password.type === 'password';
        password.type = show ? 'text' : 'password';
        toggle.textContent = show ? '隐藏' : '显示';
        toggle.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
        toggle.setAttribute('aria-pressed', String(show));
    });
    if (password) password.addEventListener('keyup', event => document.getElementById('caps-lock').classList.toggle('hidden', !event.getModifierState('CapsLock')));
    document.querySelectorAll('.tab, .sidebar-btn, .badges-toggle').forEach(control => {
        control.setAttribute('role', 'button'); control.tabIndex = 0;
        control.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); control.click(); } });
    });
    document.querySelectorAll('img.profile-img, #edit-avatar-preview').forEach(img => { img.addEventListener('error', () => { if (!img.src.endsWith('/avatar.svg')) img.src = '/avatar.svg'; }); if (!img.getAttribute('src')) img.src = '/avatar.svg'; });
    document.querySelectorAll('a[target="_blank"]').forEach(link => link.rel = 'noopener noreferrer');
});

// Share the same persistent NFC profile URL already provided by the server.
document.addEventListener('DOMContentLoaded', () => {
    async function profileUrl() {
        const userId = document.getElementById('main-container').dataset.profileId;
        if (!userId) throw new Error('请先登录');
        const response = await fetch('/api/encrypt-user-id/' + encodeURIComponent(userId));
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || '无法获取名片链接');
        return new URL(data.url, location.origin).href;
    }
    function message(title, text) { if (typeof showNotification === 'function') showNotification(title, text); }
    const copy = document.getElementById('copy-profile-link-btn');
    if (copy) copy.addEventListener('click', async () => {
        copy.disabled = true;
        try {
            const url = await profileUrl();
            if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(url);
            else {
                const field = document.createElement('textarea'); field.value = url; document.body.append(field); field.select();
                const copied = document.execCommand('copy'); field.remove();
                if (!copied) throw new Error('无法自动复制，请通过公开名片的地址栏复制链接');
            }
            message('复制成功', '名片链接已复制，可以分享给朋友或写入 NFC 卡片');
        } catch (error) { message('复制失败', error.message); }
        finally { copy.disabled = false; }
    });
    const preview = document.getElementById('preview-profile-btn');
    if (preview) preview.addEventListener('click', async () => {
        // Open synchronously to avoid popup blockers, then resolve the existing profile URL.
        const tab = window.open('about:blank', '_blank');
        if (tab) tab.opener = null;
        try { const url = await profileUrl(); if (tab) tab.location.href = url; else throw new Error('请允许浏览器打开公开名片'); }
        catch (error) { if (tab) tab.close(); message('无法打开名片', error.message); }
    });
});

// Enter each editor at its heading instead of retaining the previous view's scroll.
window.showEditorStart = function(sectionId) {
    const section=document.getElementById(sectionId);
    requestAnimationFrame(()=>{
        if(!section || section.classList.contains('hidden') || !section.getClientRects().length)return;
        const heading=section.querySelector('h2, h3');
        if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
        section.scrollIntoView({behavior:'instant',block:'start'});
    });
};
