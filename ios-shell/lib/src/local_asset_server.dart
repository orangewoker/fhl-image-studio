import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Serves the bundled Vite application from a same-origin loopback URL.
///
/// WKWebView applies CORS restrictions to ES modules loaded from `file://`.
/// A tiny loopback server gives index.html, JavaScript and CSS the same HTTP
/// origin while keeping every application asset inside the app bundle.
class LocalAssetServer {
  /// Keep the web origin stable across launches so WKWebView can restore the
  /// same localStorage/IndexedDB databases instead of creating a new origin
  /// for every random loopback port.
  static const int stablePort = 17381;

  LocalAssetServer({Future<ByteData> Function(String key)? loadAsset})
    : _loadAsset = loadAsset ?? rootBundle.load;

  final Future<ByteData> Function(String key) _loadAsset;
  HttpServer? _server;

  Uri get origin {
    final server = _server;
    if (server == null) throw StateError('Local asset server is not running');
    return Uri(scheme: 'http', host: '127.0.0.1', port: server.port);
  }

  Uri get indexUri => origin.replace(path: '/index.html');

  Future<Uri> start() async {
    if (_server != null) return indexUri;
    final server = await HttpServer.bind(
      InternetAddress.loopbackIPv4,
      stablePort,
    );
    _server = server;
    unawaited(_serve(server));
    return indexUri;
  }

  bool owns(String rawUrl) {
    final server = _server;
    final uri = Uri.tryParse(rawUrl);
    if (server == null || uri == null) return false;
    return uri.scheme == 'http' &&
        (uri.host == '127.0.0.1' || uri.host == 'localhost') &&
        uri.port == server.port;
  }

  Future<void> close() async {
    final server = _server;
    _server = null;
    await server?.close(force: true);
  }

  Future<void> _serve(HttpServer server) async {
    await for (final request in server) {
      unawaited(_handle(request));
    }
  }

  Future<void> _handle(HttpRequest request) async {
    final response = request.response;
    try {
      if (request.method != 'GET' && request.method != 'HEAD') {
        response.statusCode = HttpStatus.methodNotAllowed;
        return;
      }

      final path = assetPathForRequest(request.uri);
      if (path == null) {
        response.statusCode = HttpStatus.notFound;
        return;
      }

      final data = await _loadAsset('assets/web/$path');
      final bytes = data.buffer.asUint8List(
        data.offsetInBytes,
        data.lengthInBytes,
      );
      response.statusCode = HttpStatus.ok;
      response.headers
        ..contentType = contentTypeForPath(path)
        ..set(HttpHeaders.cacheControlHeader, 'no-cache')
        ..set('X-Content-Type-Options', 'nosniff')
        ..contentLength = bytes.length;
      if (request.method == 'GET') response.add(bytes);
    } on FlutterError {
      response.statusCode = HttpStatus.notFound;
    } catch (_) {
      response.statusCode = HttpStatus.internalServerError;
    } finally {
      await response.close();
    }
  }

  static String? assetPathForRequest(Uri uri) {
    final encoded = uri.toString().split('?').first.toLowerCase();
    if (encoded.contains('%2e%2e')) return null;
    if (uri.pathSegments.any((segment) => segment == '..')) return null;
    final path = uri.pathSegments
        .where((segment) => segment.isNotEmpty)
        .join('/');
    if (path.isEmpty) return 'index.html';
    const rootAssets = <String>{
      'index.html',
      'ios-bridge.js',
      'favicon.ico',
      'favicon.png',
    };
    if (!path.startsWith('assets/') && !rootAssets.contains(path)) return null;
    return path;
  }

  static ContentType contentTypeForPath(String path) {
    final extension = path.contains('.')
        ? path.substring(path.lastIndexOf('.') + 1).toLowerCase()
        : '';
    return switch (extension) {
      'html' => ContentType.html,
      'js' || 'mjs' => ContentType('text', 'javascript', charset: 'utf-8'),
      'css' => ContentType('text', 'css', charset: 'utf-8'),
      'json' => ContentType.json,
      'png' => ContentType('image', 'png'),
      'jpg' || 'jpeg' => ContentType('image', 'jpeg'),
      'webp' => ContentType('image', 'webp'),
      'svg' => ContentType('image', 'svg+xml'),
      'ico' => ContentType('image', 'x-icon'),
      'woff' => ContentType('font', 'woff'),
      'woff2' => ContentType('font', 'woff2'),
      _ => ContentType.binary,
    };
  }
}
