(function(root) {
    'use strict';
    async function requestJSON(url, options = {}) {
        let response;
        try { response = await root.fetch(url, options); }
        catch { throw new Error('网络连接失败，内容已保留，请检查网络后重试'); }
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); }
        catch {
            if (response.status === 404 || response.status === 405) throw new Error('成长任务接口尚未部署，请更新并重启后端服务。填写的内容已保留。');
            if (response.status === 401) throw new Error('登录已过期，请重新登录。填写的内容已保留。');
            if (response.status >= 500) throw new Error('服务暂时不可用，请稍后重试。填写的内容已保留。');
            throw new Error('服务器返回了非 JSON 数据，请检查 API 转发和后端部署。填写的内容已保留。');
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('服务器响应格式无效，请稍后重试。填写的内容已保留。');
        if (!response.ok || data.success === false) throw new Error(data.message || '请求失败，请稍后重试');
        return data;
    }
    if (typeof module === 'object' && module.exports) module.exports = requestJSON;
    else root.apiRequest = requestJSON;
})(typeof window !== 'undefined' ? window : globalThis);