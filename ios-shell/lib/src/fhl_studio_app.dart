import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'native_bridge.dart';

class FHLStudioApp extends StatelessWidget {
  const FHLStudioApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FHL Image Studio',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark(
        useMaterial3: true,
      ).copyWith(scaffoldBackgroundColor: const Color(0xFF09090B)),
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
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _bridge = NativeBridge();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF09090B))
      ..addJavaScriptChannel(
        'FlutterBridge',
        onMessageReceived: (message) {
          unawaited(_bridge.handleMessage(message.message));
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) async {
            if (_bridge.isBundledAppUrl(request.url)) {
              return NavigationDecision.navigate;
            }
            await _bridge.openExternalUrl(request.url);
            return NavigationDecision.prevent;
          },
          onPageFinished: (_) async {
            _loaded = true;
            await _updateEnvironment();
          },
        ),
      );
    _bridge.attachController(_controller);
    unawaited(_controller.loadFlutterAsset('assets/web/index.html'));
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
    WidgetsBinding.instance.removeObserver(this);
    _bridge.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: const Color(0xFF09090B),
      ),
      child: Scaffold(body: WebViewWidget(controller: _controller)),
    );
  }
}
