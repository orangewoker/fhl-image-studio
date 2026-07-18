import 'dart:io';

import 'package:fhl_image_studio_ios/src/native_file_service.dart';
import 'package:fhl_image_studio_ios/src/native_http_service.dart';
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
