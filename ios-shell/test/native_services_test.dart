import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:fhl_image_studio_ios/src/native_file_service.dart';
import 'package:fhl_image_studio_ios/src/native_http_service.dart';
import 'package:fhl_image_studio_ios/src/local_asset_server.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('pubspec includes the compiled React asset directory', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(pubspec, contains('- assets/web/'));
    expect(pubspec, contains('- assets/web/assets/'));
    expect(Directory('assets/web/assets').existsSync(), isTrue);
    expect(
      Directory(
        'assets/web/assets',
      ).listSync().whereType<File>().any((file) => file.path.endsWith('.js')),
      isTrue,
    );
  });

  test(
    'loopback server serves the entry and every static module reference',
    () async {
      final server = LocalAssetServer(
        loadAsset: (key) async {
          final bytes = await File(key).readAsBytes();
          return ByteData.sublistView(Uint8List.fromList(bytes));
        },
      );
      final client = HttpClient();
      addTearDown(() async {
        client.close(force: true);
        await server.close();
      });

      final indexUri = await server.start();
      expect(indexUri.port, LocalAssetServer.stablePort);
      expect(server.owns(indexUri.toString()), isTrue);
      final indexResponse = await (await client.getUrl(indexUri)).close();
      expect(indexResponse.statusCode, HttpStatus.ok);
      expect(indexResponse.headers.contentType?.mimeType, 'text/html');
      final html = await indexResponse.transform(const Utf8Decoder()).join();

      final references = RegExp(
        r'''(?:src|href)=["']\.\/(assets\/[^"']+)["']''',
      ).allMatches(html).map((match) => match.group(1)!).toSet();
      expect(references.where((path) => path.endsWith('.js')), isNotEmpty);
      expect(references.where((path) => path.endsWith('.css')), isNotEmpty);

      for (final reference in references) {
        final response = await (await client.getUrl(
          indexUri.resolve(reference),
        )).close();
        expect(response.statusCode, HttpStatus.ok, reason: reference);
        await response.drain<void>();
      }
    },
  );

  test('loopback server keeps the same web origin after restart', () async {
    Future<ByteData> loadAsset(String key) async {
      final bytes = await File(key).readAsBytes();
      return ByteData.sublistView(Uint8List.fromList(bytes));
    }

    final first = LocalAssetServer(loadAsset: loadAsset);
    final firstOrigin = (await first.start()).origin;
    await first.close();

    final second = LocalAssetServer(loadAsset: loadAsset);
    addTearDown(second.close);
    final secondOrigin = (await second.start()).origin;

    expect(firstOrigin, 'http://127.0.0.1:17381');
    expect(secondOrigin, firstOrigin);
  });

  test(
    'loopback server blocks traversal paths and emits module MIME types',
    () {
      expect(
        LocalAssetServer.assetPathForRequest(
          Uri.parse('/assets/%2e%2e/secret'),
        ),
        isNull,
      );
      expect(
        LocalAssetServer.contentTypeForPath('assets/app.js').mimeType,
        'text/javascript',
      );
      expect(
        LocalAssetServer.contentTypeForPath('assets/app.css').mimeType,
        'text/css',
      );
    },
  );

  group('NativeHttpService URL validation', () {
    test('accepts supported upstream URLs', () {
      expect(
        NativeHttpService.validateHttpUri('https://www.fhl.mom/v1/models').host,
        'www.fhl.mom',
      );
      expect(
        NativeHttpService.validateHttpUri('http://192.168.1.8:8080').port,
        8080,
      );
    });

    test('rejects invalid or unsupported URLs', () {
      expect(
        () => NativeHttpService.validateHttpUri('file:///tmp/key'),
        throwsFormatException,
      );
      expect(
        () => NativeHttpService.validateHttpUri('not-a-url'),
        throwsFormatException,
      );
    });

    test('normalizes a trailing v1 path for probes', () {
      expect(
        NativeHttpService.validateUpstreamBaseUri(
          'https://example.com/v1/',
        ).toString(),
        'https://example.com',
      );
    });

    test('parses and deduplicates custom provider model lists', () {
      expect(
        NativeHttpService.parseModelIDs({
          'data': [
            {'id': 'vision-image-v2'},
            {'model': 'chat-text-v1'},
            'vision-image-v2',
          ],
        }),
        ['chat-text-v1', 'vision-image-v2'],
      );
      expect(
        NativeHttpService.parseModelIDs({
          'models': [
            {'name': 'private-model'},
          ],
        }),
        ['private-model'],
      );
    });

    test('classifies transient reset failures for automatic retries', () {
      expect(
        NativeHttpService.isTransientProbeError(
          const SocketException('Connection reset by peer'),
        ),
        isTrue,
      );
      expect(
        NativeHttpService.isTransientProbeError(
          const HttpException('上游连接测试返回 HTTP 401'),
        ),
        isFalse,
      );
    });

    test('formats exhausted FHL retries without Dart wrapper noise', () {
      expect(
        NativeHttpService.probeFailureMessage(
          const SocketException('Connection reset by peer'),
          host: 'www.fhl.mom',
          exhaustedTransientRetries: true,
        ),
        'FHL 连接被服务器重置（已自动重试 3 次）。请切换网络后再次测试；API Key 尚未完成验证。',
      );
      expect(
        NativeHttpService.probeFailureMessage(
          StateError('HTTP 401'),
          host: 'example.com',
          exhaustedTransientRetries: false,
        ),
        'HTTP 401',
      );
    });
  });

  group('NativeFileService filename safety', () {
    test('removes path traversal and forbidden characters', () {
      expect(
        NativeFileService.sanitizeFileName('../bad:name?.png'),
        'bad-name-.png',
      );
    });

    test('adds a PNG extension when needed', () {
      expect(
        NativeFileService.sanitizeFileName('generated image'),
        'generated image.png',
      );
    });
  });
}
