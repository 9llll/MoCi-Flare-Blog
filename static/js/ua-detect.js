// static/js/ua-detect.js
// 微信/QQ 浏览器检测，强制跳转浏览器打开
(function() {
    var ua = navigator.userAgent.toLowerCase();
    var isWechat = ua.indexOf('micromessenger') > -1;
    var isQQ = ua.indexOf('qq/') > -1 && ua.indexOf('mqqbrowser') === -1;
    if (isWechat || isQQ) {
        var currentUrl = encodeURIComponent(window.location.href);
        window.location.href = '/go-browser.html?url=' + currentUrl;
    }
})();
