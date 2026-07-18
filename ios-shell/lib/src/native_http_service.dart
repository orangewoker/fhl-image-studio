import 'dart:async';
import 'dart:convert';
import 'dart:io';

typedef NativeProgressCallback =
    Future<void> Function(String requestKey, Map<String, Object?> payload);

class NativeHttpService {
  NativeHttpService({required this.onProgress});

  final NativeProgressCallback onProgress;
  final Map<String, HttpClient> _activeClients = <String, HttpClient>{};

  Future<Map<String, Object?>> request(Map<String, dynamic> payload) async {
    final requestKey =
        (payload['requestKey'] as String?)?.trim().isNotEmpty == true
        ? (payload['requestKey'] as String).trim()
        : 'ios-http-${DateTime.now().microsecondsSinceEpoch}';
    final uri = validateHttpUri(payload['url']?.toString() ?? '');
    final method = (payload['method']?.toString() ?? 'GET')
        .trim()
        .toUpperCase();
    final responseBase64 = payload['responseBase64'] == true;
    final streamLines = payload['streamLines'] == true && !responseBase64;
    final client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 30)
      ..idleTimeout = const Duration(seconds: 15)
      ..autoUncompress = true;
    _configureProxy(
      client,
      payload['proxyMode']?.toString() ?? 'system',
      payload['proxyURL']?.toString() ?? '',
    );
    _activeClients[requestKey] = client;

    try {
      final request = await client
          .openUrl(method, uri)
          .timeout(const Duration(seconds: 35));
      final headers = payload['headers'];
      if (headers is Map) {
        for (final entry in headers.entries) {
          final name = entry.key.toString().trim();
          if (name.isEmpty) continue;
          request.headers.set(name, entry.value.toString());
        }
      }
      final contentType = payload['contentType']?.toString().trim() ?? '';
      if (contentType.isNotEmpty && request.headers.contentType == null) {
        request.headers.set(HttpHeaders.contentTypeHeader, contentType);
      }
      final bodyBase64 = payload['bodyBase64']?.toString() ?? '';
      if (bodyBase64.isNotEmpty) {
        request.add(base64Decode(_cleanBase64(bodyBase64)));
      }

      final response = await request.close().timeout(
        const Duration(minutes: 4),
      );
      final responseContentType =
          response.headers.value(HttpHeaders.contentTypeHeader) ?? '';
      if (responseBase64) {
        final bytes = await _readBytes(
          response,
        ).timeout(const Duration(minutes: 4));
        return <String, Object?>{
          'status': response.statusCode,
          'body': '',
          'bodyBase64': base64Encode(bytes),
          'contentType': responseContentType,
        };
      }
      if (streamLines) {
        final lines = <String>[];
        await for (final line
            in response
                .transform(const Utf8Decoder(allowMalformed: true))
                .transform(const LineSplitter())) {
          lines.add(line);
          await onProgress(requestKey, <String, Object?>{'line': line});
        }
        return <String, Object?>{
          'status': response.statusCode,
          'body': lines.isEmpty ? '' : '${lines.join('\n')}\n',
          'bodyBase64': '',
          'contentType': responseContentType,
        };
      }
      final bytes = await _readBytes(
        response,
      ).timeout(const Duration(minutes: 4));
      return <String, Object?>{
        'status': response.statusCode,
        'body': utf8.decode(bytes, allowMalformed: true),
        'bodyBase64': '',
        'contentType': responseContentType,
      };
    } finally {
      _activeClients.remove(requestKey);
      client.close(force: true);
    }
  }

  Future<Map<String, Object?>> probe(Map<String, dynamic> payload) async {
    final apiKey = payload['apiKey']?.toString().trim() ?? '';
    if (apiKey.isEmpty) throw const FormatException('API Key 不能为空');
    final apiMode =
        payload['apiMode']?.toString().trim().toLowerCase() ?? 'responses';
    final baseUri = validateUpstreamBaseUri(
      payload['baseURL']?.toString() ?? '',
    );
    final candidates = <Uri>[baseUri];
    if (apiMode == 'apimart' &&
        baseUri.host.toLowerCase() == 'api.apimart.ai') {
      candidates.add(Uri.parse('https://api.apib.ai'));
    }
    Object? lastError;
    for (final candidate in candidates) {
      try {
        final suffix = apiMode == 'apimart' ? '/v1/balance' : '/v1/models';
        final result = await request(<String, dynamic>{
          'requestKey': 'probe-${DateTime.now().microsecondsSinceEpoch}',
          'url':
              '${candidate.toString().replaceFirst(RegExp(r'/+$'), '')}$suffix',
          'method': 'GET',
          'headers': <String, String>{
            'Authorization': 'Bearer $apiKey',
            'Accept': 'application/json',
            'User-Agent': 'fhl-studio-ios',
          },
          'proxyMode': payload['proxyMode'] ?? 'system',
          'proxyURL': payload['proxyURL'] ?? '',
        });
        final status = result['status'] as int;
        final body = result['body']?.toString() ?? '';
        if (status < 200 || status >= 300) {
          throw HttpException('上游连接测试返回 HTTP $status${_bodySummary(body)}');
        }
        if (apiMode == 'apimart') return <String, Object?>{'ok': true};
        final parsed = jsonDecode(body);
        final models = parseModelIDs(parsed);
        return <String, Object?>{'modelCount': models.length, 'models': models};
      } catch (error) {
        lastError = error;
      }
    }
    throw StateError(lastError?.toString() ?? '上游连接测试失败');
  }

  void cancel(String requestKey) {
    _activeClients.remove(requestKey)?.close(force: true);
  }

  void dispose() {
    for (final client in _activeClients.values) {
      client.close(force: true);
    }
    _activeClients.clear();
  }

  static Uri validateHttpUri(String raw) {
    final uri = Uri.tryParse(raw.trim());
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      throw const FormatException('请求 URL 无效');
    }
    if (uri.scheme != 'https' && uri.scheme != 'http') {
      throw const FormatException('请求 URL 仅支持 http:// 或 https://');
    }
    return uri;
  }

  static Uri validateUpstreamBaseUri(String raw) {
    final normalized = raw
        .trim()
        .replaceFirst(RegExp(r'/+$'), '')
        .replaceFirst(RegExp(r'/v1$'), '');
    if (normalized.isEmpty) throw const FormatException('未配置上游 BASE_URL');
    return validateHttpUri(normalized);
  }

  static List<String> parseModelIDs(Object? parsed) {
    if (parsed is! Map) {
      throw const FormatException('上游 /v1/models 响应格式无效');
    }
    final entries = parsed['data'] is List
        ? parsed['data'] as List
        : parsed['models'] is List
        ? parsed['models'] as List
        : null;
    if (entries == null) {
      throw const FormatException('上游 /v1/models 响应缺少 data/models 数组');
    }
    final models =
        entries
            .map((entry) {
              if (entry is String) return entry.trim();
              if (entry is Map) {
                return (entry['id'] ?? entry['model'] ?? entry['name'] ?? '')
                    .toString()
                    .trim();
              }
              return '';
            })
            .where((id) => id.isNotEmpty)
            .toSet()
            .toList()
          ..sort();
    return models;
  }

  static String _cleanBase64(String value) {
    final comma = value.indexOf(',');
    return (comma >= 0 ? value.substring(comma + 1) : value).replaceAll(
      RegExp(r'\s+'),
      '',
    );
  }

  static Future<List<int>> _readBytes(HttpClientResponse response) async {
    final bytes = <int>[];
    await for (final chunk in response) {
      bytes.addAll(chunk);
    }
    return bytes;
  }

  static String _bodySummary(String body) {
    final clean = body.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (clean.isEmpty) return '';
    return ': ${clean.length > 160 ? clean.substring(0, 160) : clean}';
  }

  static void _configureProxy(
    HttpClient client,
    String modeValue,
    String proxyUrl,
  ) {
    final mode = modeValue.trim().toLowerCase();
    if (mode == 'none') {
      client.findProxy = (_) => 'DIRECT';
      return;
    }
    if (mode != 'custom') return;
    final proxy = validateHttpUri(proxyUrl);
    final port = proxy.hasPort
        ? proxy.port
        : (proxy.scheme == 'https' ? 443 : 80);
    client.findProxy = (_) => 'PROXY ${proxy.host}:$port';
  }
}
