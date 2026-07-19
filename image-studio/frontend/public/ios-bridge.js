(function installFHLStudioIOSBridge() {
  if (typeof window === "undefined") return;

  var diagnosticsChannel = window.FlutterDiagnostics;
  var reportStartupError = function reportStartupError(kind, value) {
    if (!diagnosticsChannel || typeof diagnosticsChannel.postMessage !== "function") return;
    var message = value && value.message ? value.message : String(value || "Unknown JavaScript error");
    diagnosticsChannel.postMessage(JSON.stringify({ kind: kind, message: message }));
  };
  window.addEventListener("error", function (event) {
    reportStartupError("JavaScript error", event.error || event.message);
  });
  window.addEventListener("unhandledrejection", function (event) {
    reportStartupError("Unhandled promise rejection", event.reason);
  });

  if (window.AndroidImageStudio) return;

  var channel = window.FlutterBridge;
  if (!channel || typeof channel.postMessage !== "function") return;

  var root = document.documentElement;
  if (root) {
    root.dataset.nativePlatform = "ios";
    root.classList.remove("dark");
    root.setAttribute("data-theme", "light");
    root.setAttribute("data-appearance", "light");
    root.style.colorScheme = "light";
    root.style.backgroundColor = "#ffffff";
  }

  // WKWebView can still deliver native iOS gesture events even when a page has
  // a fixed viewport. Cancel them as a second line of defence so the interface
  // always remains fitted to the current screen width.
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (eventName) {
    document.addEventListener(eventName, function (event) {
      event.preventDefault();
    }, { passive: false });
  });

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
    appVersion: "V0.0.1",
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
