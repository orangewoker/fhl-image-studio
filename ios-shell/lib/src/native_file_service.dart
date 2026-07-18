import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:gal/gal.dart';
import 'package:mime/mime.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

class NativeFileService {
  Directory? _root;

  Future<Directory> get root async => _root ??= await _initializeRoot();

  Future<Directory> get output async => _subdirectory('output');
  Future<Directory> get imports async => _subdirectory('imports');
  Future<Directory> get shareCache async => _subdirectory('share');

  Future<Map<String, Object?>> pickImage() async {
    final result = await FilePicker.pickFiles(
      type: FileType.image,
      withData: true,
    );
    if (result == null || result.files.isEmpty) {
      return <String, Object?>{
        'path': '',
        'name': '',
        'size': 0,
        'imageB64': '',
      };
    }
    final picked = result.files.single;
    final bytes = picked.bytes ?? await File(picked.path!).readAsBytes();
    if (bytes.length > 50 * 1024 * 1024) {
      throw const FileSystemException('图片超过 50 MB，无法导入');
    }
    final file = await _writeUnique(await imports, picked.name, bytes);
    return _imageReference(file, bytes, picked.name);
  }

  Future<String> importHistory() async {
    final result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: const <String>['json', 'txt'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return '';
    final picked = result.files.single;
    final bytes = picked.bytes ?? await File(picked.path!).readAsBytes();
    return utf8.decode(bytes, allowMalformed: true);
  }

  Future<String> exportHistory(String content) async {
    final name = 'fhl-studio-history-${_timestamp()}.json';
    final bytes = Uint8List.fromList(utf8.encode(content));
    final saved = await FilePicker.saveFile(
      fileName: name,
      type: FileType.custom,
      allowedExtensions: const <String>['json'],
      bytes: bytes,
    );
    if (saved != null && saved.isNotEmpty) return saved;
    return (await _writeUnique(await output, name, bytes)).path;
  }

  Future<Map<String, Object?>> importImageBase64(
    String imageB64,
    String suggestedName,
  ) async {
    final bytes = _decodeBase64(imageB64);
    final file = await _writeUnique(await imports, suggestedName, bytes);
    return _imageReference(file, bytes, suggestedName)
      ..['imageB64'] = base64Encode(bytes);
  }

  Future<String> saveImageBase64(String imageB64, String suggestedName) async {
    final bytes = _decodeBase64(imageB64);
    final file = await _writeUnique(await output, suggestedName, bytes);
    await _publishToPhotos(file);
    return file.path;
  }

  Future<String> saveImagePath(String sourcePath, String suggestedName) async {
    final source = _fileForPath(sourcePath);
    final bytes = await source.readAsBytes();
    final file = await _writeUnique(
      await output,
      suggestedName.isEmpty ? p.basename(source.path) : suggestedName,
      bytes,
    );
    await _publishToPhotos(file);
    return file.path;
  }

  Future<String> saveImageToDirectory(
    String imageB64,
    String directory,
    String suggestedName,
  ) async {
    final target = await _safeDirectory(directory);
    final file = await _writeUnique(
      target,
      suggestedName,
      _decodeBase64(imageB64),
    );
    return file.path;
  }

  Future<String> saveImagePathToDirectory(
    String sourcePath,
    String directory,
    String suggestedName,
  ) async {
    final source = _fileForPath(sourcePath);
    final target = await _safeDirectory(directory);
    final file = await _writeUnique(
      target,
      suggestedName.isEmpty ? p.basename(source.path) : suggestedName,
      await source.readAsBytes(),
    );
    return file.path;
  }

  Future<String> shareImageBase64(String imageB64, String suggestedName) async {
    final file = await _writeUnique(
      await shareCache,
      suggestedName,
      _decodeBase64(imageB64),
    );
    await _shareFile(file);
    return file.path;
  }

  Future<String> shareImagePath(String sourcePath, String suggestedName) async {
    final source = _fileForPath(sourcePath);
    final file = await _writeUnique(
      await shareCache,
      suggestedName.isEmpty ? p.basename(source.path) : suggestedName,
      await source.readAsBytes(),
    );
    await _shareFile(file);
    return file.path;
  }

  Future<String> readImageBase64(String path) async =>
      base64Encode(await _fileForPath(path).readAsBytes());

  Future<String> readText(String path) async =>
      _fileForPath(path).readAsString();

  Future<void> openFile(String path) async => _shareFile(_fileForPath(path));

  Future<Map<String, Object?>> registerAsset(
    String path, {
    String thumbPath = '',
  }) async {
    final main = _fileForPath(path);
    final preview = thumbPath.trim().isEmpty ? main : _fileForPath(thumbPath);
    final bytes = await preview.readAsBytes();
    return <String, Object?>{
      'savedPath': main.path,
      if (thumbPath.trim().isNotEmpty) 'thumbPath': preview.path,
      ..._previewReference(preview, bytes),
    };
  }

  Future<String> outputPath() async => (await output).path;

  static String sanitizeFileName(
    String value, {
    String fallback = 'image.png',
  }) {
    var clean = p
        .basename(value.trim())
        .replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1F]'), '-');
    clean = clean.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (clean.isEmpty || clean == '.' || clean == '..') clean = fallback;
    if (p.extension(clean).isEmpty) clean = '$clean.png';
    return clean.length > 120
        ? '${p.basenameWithoutExtension(clean).substring(0, 100)}${p.extension(clean)}'
        : clean;
  }

  Future<Directory> _initializeRoot() async {
    final documents = await getApplicationDocumentsDirectory();
    final dir = Directory(p.join(documents.path, 'FHLStudio'));
    await dir.create(recursive: true);
    return dir;
  }

  Future<Directory> _subdirectory(String name) async {
    final dir = Directory(p.join((await root).path, name));
    await dir.create(recursive: true);
    return dir;
  }

  Future<Directory> _safeDirectory(String requested) async {
    final appRoot = p.normalize((await root).absolute.path);
    final candidate = requested.trim().isEmpty
        ? (await output).path
        : p.normalize(File(requested).absolute.path);
    if (candidate != appRoot && !p.isWithin(appRoot, candidate)) return output;
    final dir = Directory(candidate);
    await dir.create(recursive: true);
    return dir;
  }

  Future<File> _writeUnique(
    Directory directory,
    String name,
    List<int> bytes,
  ) async {
    final safe = sanitizeFileName(name, fallback: 'image-${_timestamp()}.png');
    final stem = p.basenameWithoutExtension(safe);
    final extension = p.extension(safe);
    var file = File(p.join(directory.path, safe));
    var index = 1;
    while (await file.exists()) {
      file = File(p.join(directory.path, '$stem-$index$extension'));
      index += 1;
    }
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  Future<void> _publishToPhotos(File file) async {
    try {
      final allowed = await Gal.hasAccess() || await Gal.requestAccess();
      if (allowed) await Gal.putImage(file.path);
    } catch (_) {
      // The app copy remains available for sharing when Photos access is denied.
    }
  }

  Future<void> _shareFile(File file) async {
    await SharePlus.instance.share(
      ShareParams(
        files: <XFile>[XFile(file.path, mimeType: lookupMimeType(file.path))],
        title: p.basename(file.path),
      ),
    );
  }

  static File _fileForPath(String raw) {
    final value = raw.trim();
    if (value.isEmpty) throw const FileSystemException('文件路径为空');
    final uri = Uri.tryParse(value);
    return File(uri?.scheme == 'file' ? uri!.toFilePath() : value);
  }

  static Uint8List _decodeBase64(String value) {
    final clean = value
        .substring(value.indexOf(',') + 1)
        .replaceAll(RegExp(r'\s+'), '');
    if (clean.isEmpty) throw const FormatException('图片数据为空');
    return base64Decode(clean);
  }

  static Map<String, Object?> _imageReference(
    File file,
    List<int> bytes,
    String name,
  ) {
    return <String, Object?>{
      'path': file.path,
      'name': name,
      'size': bytes.length,
      'imageB64': base64Encode(bytes),
      'mimeType': lookupMimeType(file.path) ?? 'image/png',
      ..._previewReference(file, bytes),
    };
  }

  static Map<String, Object?> _previewReference(File file, List<int> bytes) {
    final mime = lookupMimeType(file.path) ?? 'image/png';
    return <String, Object?>{
      'previewUrl': 'data:$mime;base64,${base64Encode(bytes)}',
    };
  }

  static String _timestamp() {
    final now = DateTime.now();
    String two(int value) => value.toString().padLeft(2, '0');
    return '${now.year}${two(now.month)}${two(now.day)}-${two(now.hour)}${two(now.minute)}${two(now.second)}';
  }
}
