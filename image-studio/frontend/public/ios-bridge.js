(function installFHLStudioIOSBridge() {
  if (typeof window === "undefined" || window.AndroidImageStudio) return;

  var channel = window.FlutterBridge;
  if (!channel || typeof channel.postMessage !== "function") return;

  var metrics = {
    widthPx: Math.round(window.innerWidth * (window.devicePixelRatio || 1)),
    heightPx: Math.round(window.innerHeight * (window.devicePixelRatio || 1)),
    density: window.devicePixelRatio || 1,
    densityDpi: Math.round((window.devicePixelRatio || 1) * 160),
    screenWidthDp: Math.round(window.innerWidth),
    screenHeightDp: Math.round(window.innerHeight),
    smallestScreenWidthDp: Math.round(Math.min(window.innerWidth, window.innerHeight)),
    orientation: window.innerWidth >= window.innerHeight ? "landscape" : "portrait",
  };
  var diagnostics = {
    appVersion: "V2.0.2.1",
    packageName: "top.fangtangyuan.fhlImageStudio",
    platform: "ios",
    model: navigator.platform || "iPhone/iPad",
    webViewVersion: navigator.userAgent || "WKWebView",
  };

  window.__imageStudioIOSUpdateEnvironment = function updateEnvironment(nextMetrics, nextDiagnostics) {
    if (nextMetrics && typeof nextMetrics === "object") metrics = Object.assign({}, metrics, nextMetrics);
    if (nextDiagnostics && typeof nextDiagnostics === "object") diagnostics = Object.assign({}, diagnostics, nextDiagnostics);
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("orientationchange"));
  };

  window.AndroidImageStudio = {
    supportsBackgroundJobs: false,
    invoke: function invoke(requestId, method, payloadJson) {
      channel.postMessage(JSON.stringify({
        requestId: String(requestId || ""),
        method: String(method || ""),
        payloadJson: String(payloadJson || "[]"),
      }));
    },
    getDisplayMetricsJson: function getDisplayMetricsJson() {
      return JSON.stringify(metrics);
    },
    getDeviceDiagnosticsJson: function getDeviceDiagnosticsJson() {
      return JSON.stringify(Object.assign({}, diagnostics, metrics));
    },
  };
})();
