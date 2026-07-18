import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'native_file_service.dart';
import 'native_http_service.dart';

class NativeBridge {
  NativeBridge() {
    _http = NativeHttpService(onProgress: _emitProgress);
  }

  late final NativeHttpService _http;
  final NativeFileService _files = NativeFileService();
  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage(
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );
  WebViewController? _controller;
  bool _fullscreen = false;

  void attachController(WebViewController controller) =>
      _controller = controller;

  bool isBundledAppUrl(String raw) {
    final uri = Uri.tryParse(raw);
    if (uri == null) return false;
    return uri.scheme == 'file' ||
        uri.scheme == 'about' ||
        uri.scheme == 'data';
  }

  Future<void> handleMessage(String rawMessage) async {
    String requestId = '';
    try {
      final envelope = jsonDecode(rawMessage);
      if (envelope is! Map) throw const FormatException('原生桥接消息格式错误');
      requestId = envelope['requestId']?.toString() ?? '';
      final method = envelope['method']?.toString() ?? '';
      final decodedArgs = jsonDecode(
        envelope['payloadJson']?.toString() ?? '[]',
      );
      final args = decodedArgs is List ? decodedArgs : <dynamic>[];
      final result = await _invoke(method, args);
      await _resolve(requestId, result);
    } catch (error) {
      await _reject(requestId, _cleanError(error));
    }
  }

  Future<Object?> _invoke(String method, List<dynamic> args) async {
    switch (method) {
      case 'OpenImageDialog':
        return _files.pickImage();
      case 'ImportHistoryFromFile':
        return _files.importHistory();
      case 'GetOutputDir':
      case 'ChooseOutputDir':
        return _files.outputPath();
      case 'SetOutputDir':
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('output_dir_hint', _stringArg(args, 0));
        return null;
      case 'GetStoredAPIKey':
        return _secureStorage
            .read(key: _apiKeyStorageKey(_stringArg(args, 0)))
            .then((value) => value ?? '');
      case 'SetStoredAPIKey':
        final key = _apiKeyStorageKey(_stringArg(args, 0));
        final value = _stringArg(args, 1).trim();
        if (value.isEmpty) {
          await _secureStorage.delete(key: key);
        } else {
          await _secureStorage.write(key: key, value: value);
        }
        return null;
      case 'DeleteStoredAPIKey':
        await _secureStorage.delete(
          key: _apiKeyStorageKey(_stringArg(args, 0)),
        );
        return null;
      case 'OpenExternalURL':
        await openExternalUrl(_stringArg(args, 0));
        return null;
      case 'OpenOutputDir':
        return _files.outputPath();
      case 'ImportImageFromB64':
        return _files.importImageBase64(
          _stringArg(args, 0),
          _stringArg(args, 1),
        );
      case 'RegisterMediaAsset':
        return _files.registerAsset(
          _stringArg(args, 0),
          thumbPath: _stringArg(args, 1),
        );
      case 'RegisterImportedImageAsset':
        return _files.registerAsset(_stringArg(args, 0));
      case 'ReadImageAsBase64':
        return _files.readImageBase64(_stringArg(args, 0));
      case 'ReadTextFile':
        return _files.readText(_stringArg(args, 0));
      case 'OpenFile':
        await _files.openFile(_stringArg(args, 0));
        return null;
      case 'ExportHistoryToFile':
        return _files.exportHistory(_stringArg(args, 0));
      case 'SaveImageAs':
        return _files.saveImageBase64(_stringArg(args, 0), _stringArg(args, 1));
      case 'SaveImagePathAs':
        return _files.saveImagePath(_stringArg(args, 0), _stringArg(args, 1));
      case 'SaveImageToDir':
        return _files.saveImageToDirectory(
          _stringArg(args, 0),
          _stringArg(args, 1),
          _stringArg(args, 2),
        );
      case 'SaveImagePathToDir':
        return _files.saveImagePathToDirectory(
          _stringArg(args, 0),
          _stringArg(args, 1),
          _stringArg(args, 2),
        );
      case 'ShareImageAs':
        return _files.shareImageBase64(
          _stringArg(args, 0),
          _stringArg(args, 1),
        );
      case 'ShareImagePathAs':
        return _files.shareImagePath(_stringArg(args, 0), _stringArg(args, 1));
      case 'HttpRequestText':
        return _http.request(_mapArg(args, 0));
      case 'ProbeUpstream':
        return _http.probe(_mapArg(args, 0));
      case 'CancelHttpRequest':
        _http.cancel(_stringArg(args, 0));
        return null;
      case 'Vibrate':
        await HapticFeedback.selectionClick();
        return null;
      case 'SetFullscreen':
        _fullscreen = _boolArg(args, 0);
        if (_fullscreen) {
          await SystemChrome.setEnabledSystemUIMode(
            SystemUiMode.immersiveSticky,
          );
        } else {
          await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
        }
        return null;
      case 'IsFullscreen':
        return _fullscreen;
      case 'SubmitAndroidJobs':
      case 'ListAndroidJobs':
      case 'CancelAndroidJobs':
      case 'AttachAndroidJobEvents':
        throw UnsupportedError('iOS 使用前台远程内核，不启用 Android 后台任务桥接');
      default:
        throw UnsupportedError('$method 尚未在 iOS shell 中实现');
    }
  }

  Future<void> openExternalUrl(String raw) async {
    final uri = Uri.tryParse(raw.trim());
    if (uri == null || !uri.hasScheme) throw const FormatException('URL 无效');
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      throw StateError('无法打开 URL');
    }
  }

  Future<void> _resolve(String requestId, Object? payload) async {
    final controller = _controller;
    if (controller == null || requestId.isEmpty) return;
    await controller.runJavaScript(
      'window.__imageStudioNativeResolve?.(${jsonEncode(requestId)}, ${jsonEncode(payload)});',
    );
  }

  Future<void> _reject(String requestId, String message) async {
    final controller = _controller;
    if (controller == null || requestId.isEmpty) return;
    await controller.runJavaScript(
      'window.__imageStudioNativeReject?.(${jsonEncode(requestId)}, ${jsonEncode(message)});',
    );
  }

  Future<void> _emitProgress(
    String requestKey,
    Map<String, Object?> payload,
  ) async {
    final controller = _controller;
    if (controller == null) return;
    await controller.runJavaScript(
      'window.__imageStudioNativeProgress?.(${jsonEncode(requestKey)}, ${jsonEncode(payload)});',
    );
  }

  static String _stringArg(List<dynamic> args, int index) =>
      index < args.length && args[index] != null ? args[index].toString() : '';

  static bool _boolArg(List<dynamic> args, int index) =>
      index < args.length && args[index] == true;

  static Map<String, dynamic> _mapArg(List<dynamic> args, int index) {
    if (index >= args.length || args[index] is! Map) return <String, dynamic>{};
    return Map<String, dynamic>.from(args[index] as Map);
  }

  static String _apiKeyStorageKey(String user) =>
      'fhl-studio.api-key.${user.trim()}';

  static String _cleanError(Object error) {
    final value = error.toString();
    return value
        .replaceFirst(
          RegExp(
            r'^(Exception|StateError|FormatException|Unsupported operation):\s*',
          ),
          '',
        )
        .trim();
  }

  void dispose() {
    _http.dispose();
    _controller = null;
  }
}
