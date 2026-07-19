import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'local_asset_server.dart';
import 'native_bridge.dart';

class FHLStudioApp extends StatelessWidget {
  const FHLStudioApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ai Image',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.light(
        useMaterial3: true,
      ).copyWith(scaffoldBackgroundColor: Colors.white),
      home: const FHLStudioWebView(),
    );
  }
}

class FHLStudioWebView extends StatefulWidget {
  const FHLStudioWebView({super.key});

  @override
  State<FHLStudioWebView> createState() => _FHLStudioWebViewState();
}

class _FHLStudioWebViewState extends State<FHLStudioWebView>
    with WidgetsBindingObserver {
  late final WebViewController _controller;
  late final NativeBridge _bridge;
  final LocalAssetServer _assetServer = LocalAssetServer();
  bool _loaded = false;
  bool _frontendReady = false;
  String? _startupError;
  Timer? _startupWatchdog;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _bridge = NativeBridge();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..enableZoom(false)
      ..setBackgroundColor(Colors.white)
      ..addJavaScriptChannel(
        'FlutterBridge',
        onMessageReceived: (message) {
          unawaited(_bridge.handleMessage(message.message));
        },
      )
      ..addJavaScriptChannel(
        'FlutterDiagnostics',
        onMessageReceived: (message) {
          _handleFrontendDiagnostic(message.message);
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (url) {
            if (!_assetServer.owns(url)) return;
            _startupWatchdog?.cancel();
            _loaded = false;
            _frontendReady = false;
            if (mounted) {
              setState(() => _startupError = null);
            }
          },
          onNavigationRequest: (request) async {
            if (_assetServer.owns(request.url) ||
                _bridge.isBundledAppUrl(request.url)) {
              return NavigationDecision.navigate;
            }
            await _bridge.openExternalUrl(request.url);
            return NavigationDecision.prevent;
          },
          onPageFinished: (url) async {
            if (!_assetServer.owns(url)) return;
            _loaded = true;
            await _updateEnvironment();
            _startupWatchdog?.cancel();
            _startupWatchdog = Timer(
              const Duration(seconds: 2),
              () => unawaited(_verifyFrontendMounted()),
            );
          },
          onWebResourceError: (error) {
            if (error.isForMainFrame == true && !_frontendReady) {
              _showStartupError('页面加载失败：${error.description}');
            }
          },
        ),
      );
    _bridge.attachController(_controller);
    unawaited(_startFrontend());
  }

  Future<void> _startFrontend() async {
    _startupWatchdog?.cancel();
    if (mounted) {
      setState(() {
        _loaded = false;
        _frontendReady = false;
        _startupError = null;
      });
    }
    try {
      final indexUri = await _assetServer.start();
      await _controller.loadRequest(indexUri);
      _startupWatchdog = Timer(
        const Duration(seconds: 10),
        () => _showStartupError('页面启动超时，前端没有完成挂载。'),
      );
    } catch (error) {
      _showStartupError('本地页面服务启动失败：$error');
    }
  }

  void _handleFrontendDiagnostic(String rawMessage) {
    if (_frontendReady) return;
    try {
      final decoded = jsonDecode(rawMessage);
      if (decoded is Map) {
        final kind = decoded['kind']?.toString() ?? 'JavaScript';
        final message = decoded['message']?.toString() ?? '未知错误';
        _showStartupError('$kind：$message');
        return;
      }
    } catch (_) {
      // Fall through and show the original diagnostic text.
    }
    _showStartupError('JavaScript：$rawMessage');
  }

  Future<void> _verifyFrontendMounted() async {
    if (!mounted || _frontendReady || _startupError != null) return;
    try {
      final result = await _controller.runJavaScriptReturningResult(
        "Boolean(document.getElementById('root')?.firstElementChild)",
      );
      final mounted = result == true || result.toString() == 'true';
      if (!mounted) {
        _showStartupError('前端入口已加载，但 React 页面没有挂载。');
        return;
      }
      _startupWatchdog?.cancel();
      if (!this.mounted) return;
      setState(() {
        _frontendReady = true;
        _startupError = null;
      });
    } catch (error) {
      _showStartupError('页面状态检查失败：$error');
    }
  }

  void _showStartupError(String message) {
    _startupWatchdog?.cancel();
    if (!mounted || _frontendReady) return;
    final clean = message.trim();
    setState(() {
      _startupError = clean.length > 600 ? clean.substring(0, 600) : clean;
    });
  }

  @override
  void didChangeMetrics() {
    super.didChangeMetrics();
    unawaited(_updateEnvironment());
  }

  Future<void> _updateEnvironment() async {
    if (!_loaded || !mounted) return;
    final view = View.of(context);
    final size = view.physicalSize;
    final density = view.devicePixelRatio;
    final logicalWidth = size.width / density;
    final logicalHeight = size.height / density;
    final padding = MediaQuery.paddingOf(context);
    final metrics = <String, Object>{
      'widthPx': size.width.round(),
      'heightPx': size.height.round(),
      'density': density,
      'densityDpi': (density * 160).round(),
      'screenWidthDp': logicalWidth.round(),
      'screenHeightDp': logicalHeight.round(),
      'smallestScreenWidthDp':
          (logicalWidth < logicalHeight ? logicalWidth : logicalHeight).round(),
      'orientation': logicalWidth >= logicalHeight ? 'landscape' : 'portrait',
    };
    final diagnostics = <String, Object>{
      'safeArea': <String, double>{
        'left': padding.left,
        'top': padding.top,
        'right': padding.right,
        'bottom': padding.bottom,
      },
    };
    final script =
        '''
      window.__imageStudioIOSUpdateEnvironment?.(
        ${jsonEncode(metrics)},
        ${jsonEncode(diagnostics)}
      );
      (() => {
        const root = document.documentElement;
        if (!root) return;
        root.style.setProperty('--android-safe-left', '${padding.left}px');
        root.style.setProperty('--android-safe-top', '${padding.top}px');
        root.style.setProperty('--android-safe-right', '${padding.right}px');
        root.style.setProperty('--android-safe-bottom', '${padding.bottom}px');
        root.style.setProperty('--android-safe-left-value', '${padding.left}px');
        root.style.setProperty('--android-safe-top-value', '${padding.top}px');
        root.style.setProperty('--android-safe-right-value', '${padding.right}px');
        root.style.setProperty('--android-safe-bottom-value', '${padding.bottom}px');
        root.style.setProperty('--android-header-safe-top-value', '${padding.top.clamp(24, 52)}px');
        window.__imageStudioAndroidSafeArea = ${jsonEncode(diagnostics['safeArea'])};
      })();
    ''';
    await _controller.runJavaScript(script);
  }

  @override
  void dispose() {
    _startupWatchdog?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _bridge.dispose();
    unawaited(_assetServer.close());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: Colors.white,
        systemNavigationBarIconBrightness: Brightness.dark,
      ),
      child: Scaffold(
        body: Stack(
          fit: StackFit.expand,
          children: [
            WebViewWidget(controller: _controller),
            if (!_frontendReady && _startupError == null)
              const ColoredBox(
                color: Colors.white,
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircularProgressIndicator(),
                      SizedBox(height: 18),
                      Text('正在启动 Ai Image…'),
                    ],
                  ),
                ),
              ),
            if (_startupError case final error?)
              ColoredBox(
                color: Colors.white,
                child: SafeArea(
                  minimum: const EdgeInsets.all(24),
                  child: Center(
                    child: SingleChildScrollView(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 520),
                        child: Card(
                          child: Padding(
                            padding: const EdgeInsets.all(20),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const Text(
                                  '启动失败',
                                  style: TextStyle(
                                    fontSize: 20,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                SelectableText(error),
                                const SizedBox(height: 18),
                                FilledButton.icon(
                                  onPressed: _startFrontend,
                                  icon: const Icon(Icons.refresh),
                                  label: const Text('重新加载'),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
