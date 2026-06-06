package top.gptcodex.imagestudio.android

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject
import org.json.JSONArray
import android.provider.OpenableColumns
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.URI
import java.net.Proxy
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.concurrent.ConcurrentHashMap
import java.util.Locale
import kotlin.concurrent.thread
import kotlin.math.max
import kotlin.math.roundToInt
import android.graphics.Bitmap
import android.graphics.BitmapFactory

class AndroidImageStudioBridge(
    private val context: Context,
    private val webView: WebView,
    private val launchOpenImageDialog: () -> Unit,
    private val launchImportHistory: () -> Unit,
) {
    private val prefs = context.getSharedPreferences("image_studio_android", Context.MODE_PRIVATE)
    private val outputDirKey = "output_dir"
    private var pendingOpenImageRequestId: String? = null
    private var pendingImportHistoryRequestId: String? = null
    private val httpRequests = ConcurrentHashMap<String, HttpURLConnection>()
    @Volatile private var fullscreen = false

    companion object {
        private const val maxDialogReadBytes: Long = 50L * 1024L * 1024L
        private const val maxPreviewEdge = 384
    }

    @JavascriptInterface
    fun invoke(requestId: String, method: String, payloadJson: String) {
        try {
            val args = JSONArray(payloadJson)
            when (method) {
                "OpenImageDialog" -> {
                    if (pendingOpenImageRequestId != null) {
                        throw IllegalStateException("图片选择已在进行中")
                    }
                    pendingOpenImageRequestId = requestId
                    launchOpenImageDialog()
                    return
                }
                "ImportHistoryFromFile" -> {
                    if (pendingImportHistoryRequestId != null) {
                        throw IllegalStateException("历史导入已在进行中")
                    }
                    pendingImportHistoryRequestId = requestId
                    launchImportHistory()
                    return
                }
            }
            val result: Any? = when (method) {
                "GetOutputDir" -> getOutputDir()
                "SetOutputDir" -> {
                    setOutputDir(args.optString(0, ""))
                    null
                }
                "ChooseOutputDir" -> getOutputDir()
                "GetStoredAPIKey" -> getStoredApiKey(args.optString(0))
                "SetStoredAPIKey" -> {
                    setStoredApiKey(args.optString(0), args.optString(1))
                    null
                }
                "DeleteStoredAPIKey" -> {
                    deleteStoredApiKey(args.optString(0))
                    null
                }
                "OpenExternalURL" -> {
                    openExternalUrl(args.optString(0))
                    null
                }
                "OpenOutputDir" -> {
                    openOutputDir()
                    null
                }
                "ImportImageFromB64" -> importImageFromB64(args.optString(0), args.optString(1))
                "ReadImageAsBase64" -> readImageAsBase64(args.optString(0))
                "ReadTextFile" -> readTextFile(args.optString(0))
                "OpenFile" -> {
                    openFile(args.optString(0))
                    null
                }
                "ExportHistoryToFile" -> exportHistory(args.optString(0))
                "SaveImageAs" -> saveImage(args.optString(0), args.optString(1))
                "SaveImagePathAs" -> saveImagePathAs(args.optString(0), args.optString(1))
                "HttpRequestText" -> {
                    val payload = args.optJSONObject(0) ?: throw IllegalArgumentException("缺少 HTTP 请求参数")
                    runHttpRequestText(requestId, payload)
                }
                "ProbeUpstream" -> {
                    val payload = args.optJSONObject(0) ?: throw IllegalArgumentException("缺少测活参数")
                    runProbeUpstream(requestId, payload)
                }
                "CancelHttpRequest" -> {
                    cancelHttpRequest(args.optString(0))
                    null
                }
                "Vibrate" -> {
                    vibrate(args.optLong(0, 50L))
                    null
                }
                "SetFullscreen" -> {
                    setFullscreen(args.optBoolean(0, false))
                    null
                }
                "IsFullscreen" -> fullscreen
                else -> throw UnsupportedOperationException("$method is not implemented in Android shell yet")
            }
            resolve(requestId, result)
        } catch (_: EarlyResolve) {
            return
        } catch (error: Exception) {
            reject(requestId, error.message ?: error.javaClass.simpleName)
        }
    }

    @JavascriptInterface
    fun getOutputDir(): String {
        return prefs.getString(outputDirKey, defaultOutputDir().absolutePath) ?: defaultOutputDir().absolutePath
    }

    @JavascriptInterface
    fun setOutputDir(path: String) {
        val dir = if (path.isBlank()) defaultOutputDir() else File(path)
        dir.mkdirs()
        prefs.edit().putString(outputDirKey, dir.absolutePath).apply()
    }

    @JavascriptInterface
    fun importImageFromB64(imageB64: String, suggestedName: String): Map<String, Any> {
        val bytes = Base64.decode(imageB64, Base64.DEFAULT)
        val file = writeImportedBytes(bytes, suggestedName)
        return mapOf(
            "path" to file.absolutePath,
            "imageB64" to imageB64,
        )
    }

    @JavascriptInterface
    fun getStoredApiKey(user: String): String {
        return prefs.getString("apikey_$user", "") ?: ""
    }

    @JavascriptInterface
    fun setStoredApiKey(user: String, value: String) {
        if (value.isBlank()) prefs.edit().remove("apikey_$user").apply()
        else prefs.edit().putString("apikey_$user", value.trim()).apply()
    }

    @JavascriptInterface
    fun deleteStoredApiKey(user: String) {
        prefs.edit().remove("apikey_$user").apply()
    }

    @JavascriptInterface
    fun getDisplayMetricsJson(): String {
        val dm = context.resources.displayMetrics
        val config = context.resources.configuration
        val widthPx = dm.widthPixels
        val heightPx = dm.heightPixels
        val orientation = when (config.orientation) {
            Configuration.ORIENTATION_LANDSCAPE -> "landscape"
            Configuration.ORIENTATION_PORTRAIT -> "portrait"
            else -> "undefined"
        }
        return JSONObject()
            .put("widthPx", widthPx)
            .put("heightPx", heightPx)
            .put("density", dm.density.toDouble())
            .put("densityDpi", dm.densityDpi)
            .put("screenWidthDp", config.screenWidthDp)
            .put("screenHeightDp", config.screenHeightDp)
            .put("smallestScreenWidthDp", config.smallestScreenWidthDp)
            .put("orientation", orientation)
            .toString()
    }

    @JavascriptInterface
    fun openOutputDir(): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            return "MediaStore"
        }
        val dir = File(getOutputDir()).apply { mkdirs() }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", dir)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "*/*")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(intent)
        return dir.absolutePath
    }

    @JavascriptInterface
    fun openExternalUrl(url: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    @JavascriptInterface
    fun exportHistory(jsonContent: String): String {
        val file = File(getOutputDir(), "image-studio-history-${timestamp()}.json")
        file.parentFile?.mkdirs()
        file.writeText(jsonContent)
        return file.absolutePath
    }

    @JavascriptInterface
    fun readImageAsBase64(path: String): String {
        val bytes = openInputStreamForPath(path).use { it.readBytes() }
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    @JavascriptInterface
    fun readTextFile(path: String): String {
        return openInputStreamForPath(path).bufferedReader().use { it.readText() }
    }

    @JavascriptInterface
    fun openFile(path: String) {
        val uriAndMime = uriAndMimeForPath(path)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uriAndMime.first, uriAndMime.second)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(intent)
    }

    @JavascriptInterface
    fun saveImage(imageB64: String, suggestedName: String): String {
        if (imageB64.isBlank()) throw IllegalArgumentException("图片数据为空")
        val name = ensureImageFileName(suggestedName, "image-${timestamp()}.png")
        val bytes = Base64.decode(imageB64, Base64.DEFAULT)
        return saveImageStream(name, imageMimeForName(name)) { output ->
            output.write(bytes)
        }
    }

    @JavascriptInterface
    fun saveImagePathAs(path: String, suggestedName: String): String {
        val trimmed = path.trim()
        if (trimmed.isBlank()) throw IllegalArgumentException("图片路径为空")
        val fallback = trimmed.substringAfterLast('/').substringAfterLast('\\').ifBlank { "image-${timestamp()}.png" }
        val name = ensureImageFileName(suggestedName.ifBlank { fallback }, fallback)
        return saveImageStream(name, imageMimeForName(name)) { output ->
            openInputStreamForPath(trimmed).use { input ->
                input.copyTo(output)
            }
        }
    }

    private fun saveImageStream(name: String, mimeType: String, write: (OutputStream) -> Unit): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val contentValues = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + File.separator + "ImageStudio")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }

            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)
            if (uri != null) {
                try {
                    resolver.openOutputStream(uri)?.use { output ->
                        write(output)
                    } ?: throw IllegalStateException("无法写入相册文件")
                } catch (error: Exception) {
                    resolver.delete(uri, null, null)
                    throw error
                }
                contentValues.clear()
                contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, contentValues, null, null)
                return uri.toString()
            }
        }

        val file = File(getOutputDir(), name)
        file.parentFile?.mkdirs()
        FileOutputStream(file).use { output ->
            write(output)
        }
        return file.absolutePath
    }

    @JavascriptInterface
    fun vibrate(milliseconds: Long) {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vibratorManager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(milliseconds)
        }
    }

    @JavascriptInterface
    fun setFullscreen(enabled: Boolean) {
        fullscreen = enabled
        val activity = context as? AppCompatActivity ?: return
        activity.runOnUiThread {
            WindowCompat.setDecorFitsSystemWindows(activity.window, false)
            val controller = WindowInsetsControllerCompat(activity.window, webView)
            if (enabled) {
                controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                controller.hide(WindowInsetsCompat.Type.systemBars())
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars())
            }
            webView.post {
                webView.evaluateJavascript(
                    """
                    (() => {
                      window.dispatchEvent(new Event('resize'));
                      if (window.visualViewport) {
                        window.visualViewport.dispatchEvent(new Event('resize'));
                      }
                    })();
                    """.trimIndent(),
                    null,
                )
            }
        }
    }

    private fun runHttpRequestText(requestId: String, payload: JSONObject): Nothing {
        val requestKey = payload.optString("requestKey").ifBlank { requestId }
        val url = payload.optString("url").trim()
        val method = payload.optString("method", "GET").trim().uppercase(Locale.US)
        val headersJson = payload.optJSONObject("headers")
        val bodyBase64 = payload.optString("bodyBase64")
        val contentType = payload.optString("contentType")
        val streamLines = payload.optBoolean("streamLines", false)
        val proxyMode = payload.optString("proxyMode", "system")
        val proxyUrl = payload.optString("proxyURL", "")
        thread(name = "image-studio-http-$requestKey") {
            try {
                val connection = openHttpConnection(url, proxyMode, proxyUrl).apply {
                    requestMethod = method
                    instanceFollowRedirects = true
                    connectTimeout = 30_000
                    readTimeout = 180_000
                    doInput = true
                }
                httpRequests[requestKey] = connection
                if (headersJson != null) {
                    val keys = headersJson.keys()
                    while (keys.hasNext()) {
                        val key = keys.next()
                        connection.setRequestProperty(key, headersJson.optString(key))
                    }
                }
                if (contentType.isNotBlank() && connection.getRequestProperty("Content-Type").isNullOrBlank()) {
                    connection.setRequestProperty("Content-Type", contentType)
                }
                val requestBytes = if (bodyBase64.isBlank()) ByteArray(0) else Base64.decode(bodyBase64, Base64.DEFAULT)
                if (requestBytes.isNotEmpty()) {
                    connection.doOutput = true
                    connection.outputStream.use { it.write(requestBytes) }
                }
                val status = connection.responseCode
                val stream = if (status >= 400) connection.errorStream else connection.inputStream
                val body = if (streamLines) {
                    val lines = mutableListOf<String>()
                    stream?.bufferedReader()?.useLines { sequence ->
                        sequence.forEach { line ->
                            lines.add(line)
                            emitNativeProgress(requestKey, mapOf("line" to line))
                        }
                    }
                    if (lines.isEmpty()) "" else lines.joinToString(separator = "\n", postfix = "\n")
                } else {
                    stream?.bufferedReader()?.use { it.readText() } ?: ""
                }
                val result = mapOf(
                    "status" to status,
                    "body" to body,
                    "contentType" to (connection.contentType ?: ""),
                )
                resolve(requestId, result)
            } catch (error: Exception) {
                reject(requestId, error.message ?: error.javaClass.simpleName)
            } finally {
                httpRequests.remove(requestKey)?.disconnect()
            }
        }
        throw EarlyResolve()
    }

    private fun runProbeUpstream(requestId: String, payload: JSONObject): Nothing {
        val baseUrl = validateProbeBaseUrl(payload.optString("baseURL"))
        val apiKey = payload.optString("apiKey").trim()
        val proxyMode = payload.optString("proxyMode", "system")
        val proxyUrl = payload.optString("proxyURL", "")
        if (apiKey.isBlank()) throw IllegalArgumentException("API Key 不能为空")
        thread(name = "image-studio-probe-${requestId.take(12)}") {
            try {
                val connection = openHttpConnection("$baseUrl/v1/models", proxyMode, proxyUrl).apply {
                    requestMethod = "GET"
                    instanceFollowRedirects = true
                    connectTimeout = 20_000
                    readTimeout = 20_000
                    doInput = true
                    setRequestProperty("Authorization", "Bearer $apiKey")
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("User-Agent", "image-studio-android")
                }
                val status = connection.responseCode
                val stream = if (status >= 400) connection.errorStream else connection.inputStream
                val body = stream?.bufferedReader()?.use { reader ->
                    reader.readText().take(1_048_576)
                } ?: ""
                connection.disconnect()
                if (status !in 200..299) {
                    throw IllegalStateException("上游 /v1/models 返回 $status${summarizeProbeBody(body).let { if (it.isBlank()) "" else ": $it" }}")
                }
                val parsed = JSONObject(body)
                if (!parsed.has("data") || parsed.isNull("data")) {
                    throw IllegalStateException("上游 /v1/models 响应缺少 data 数组")
                }
                val data = parsed.optJSONArray("data") ?: throw IllegalStateException("上游 /v1/models 响应缺少 data 数组")
                resolve(requestId, mapOf("modelCount" to data.length()))
            } catch (error: Exception) {
                reject(requestId, error.message ?: error.javaClass.simpleName)
            }
        }
        throw EarlyResolve()
    }

    private fun openHttpConnection(url: String, proxyMode: String, proxyUrl: String): HttpURLConnection {
        val target = URL(url)
        val connection = when (normalizeProxyMode(proxyMode)) {
            "none" -> target.openConnection(Proxy.NO_PROXY)
            "custom" -> target.openConnection(parseCustomProxy(proxyUrl))
            else -> target.openConnection()
        }
        return connection as HttpURLConnection
    }

    private fun normalizeProxyMode(raw: String): String {
        return when (raw.trim().lowercase(Locale.US)) {
            "none" -> "none"
            "custom" -> "custom"
            else -> "system"
        }
    }

    private fun parseCustomProxy(raw: String): Proxy {
        val cleaned = raw.trim()
        if (cleaned.isBlank()) throw IllegalArgumentException("自定义代理地址不能为空")
        val uri = try {
            URI(cleaned)
        } catch (error: Exception) {
            throw IllegalArgumentException("代理地址无效: ${error.message ?: error.javaClass.simpleName}")
        }
        val scheme = uri.scheme?.lowercase(Locale.US) ?: ""
        if (scheme != "http" && scheme != "https") {
            throw IllegalArgumentException("代理地址仅支持 http:// 或 https://")
        }
        val host = uri.host ?: throw IllegalArgumentException("代理地址必须包含主机")
        if (!uri.rawQuery.isNullOrBlank() || !uri.rawFragment.isNullOrBlank()) {
            throw IllegalArgumentException("代理地址不能包含 query 或 fragment")
        }
        val path = uri.rawPath ?: ""
        if (path.isNotBlank() && path != "/") {
            throw IllegalArgumentException("代理地址不能包含路径")
        }
        val port = if (uri.port > 0) uri.port else if (scheme == "https") 443 else 80
        return Proxy(Proxy.Type.HTTP, InetSocketAddress.createUnresolved(host, port))
    }

    private fun cancelHttpRequest(requestKey: String) {
        httpRequests.remove(requestKey)?.disconnect()
    }

    private fun validateProbeBaseUrl(raw: String): String {
        val cleaned = raw.trim().trimEnd('/')
        if (cleaned.isBlank()) throw IllegalArgumentException("未配置上游 BASE_URL")
        val uri = try {
            URI(cleaned)
        } catch (error: Exception) {
            throw IllegalArgumentException("BASE_URL 无效: ${error.message ?: error.javaClass.simpleName}")
        }
        val scheme = uri.scheme?.lowercase(Locale.US) ?: ""
        val host = uri.host ?: ""
        if (scheme.isBlank() || host.isBlank()) {
            throw IllegalArgumentException("BASE_URL 必须包含协议和主机,例如 https://example.com")
        }
        if (scheme == "https") return cleaned
        if (scheme == "http" && isProbeLoopbackHost(host)) return cleaned
        if (scheme == "http") {
            throw IllegalArgumentException("拒绝使用非 TLS 上游: $cleaned。只有 localhost / 127.0.0.1 / ::1 允许 http://")
        }
        throw IllegalArgumentException("BASE_URL 仅支持 http:// 或 https://")
    }

    private fun isProbeLoopbackHost(host: String): Boolean {
        val lower = host.lowercase(Locale.US).trim('[', ']')
        return lower == "localhost" || lower.endsWith(".localhost") || lower == "127.0.0.1" || lower == "::1" || lower == "0:0:0:0:0:0:0:1"
    }

    private fun summarizeProbeBody(body: String): String {
        val trimmed = body.trim()
        if (trimmed.isBlank()) return ""
        return try {
            val parsed = JSONObject(trimmed)
            val message = parsed.optJSONObject("error")?.optString("message")?.trim().orEmpty()
            val fallback = parsed.optString("message").trim()
            (message.ifBlank { fallback }).ifBlank { trimmed }.take(160)
        } catch (_: Exception) {
            trimmed.take(160)
        }
    }

    fun onOpenImageDialogResult(uri: Uri?) {
        val requestId = pendingOpenImageRequestId ?: return
        pendingOpenImageRequestId = null
        if (uri == null) {
            resolve(requestId, mapOf("path" to "", "size" to 0, "imageB64" to ""))
            return
        }
        try {
            val suggestedName = queryDisplayName(uri) ?: "import-${timestamp()}.png"
            val copied = copyUriToImports(uri, suggestedName)
            resolve(
                requestId,
                mapOf(
                    "path" to copied.file.absolutePath,
                    "size" to copied.size,
                    "imageB64" to copied.imageB64,
                    "previewB64" to copied.previewB64,
                ),
            )
        } catch (error: Exception) {
            reject(requestId, error.message ?: error.javaClass.simpleName)
        }
    }

    fun onImportHistoryResult(uri: Uri?) {
        val requestId = pendingImportHistoryRequestId ?: return
        pendingImportHistoryRequestId = null
        if (uri == null) {
            resolve(requestId, "")
            return
        }
        try {
            val text = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() } ?: ""
            resolve(requestId, text)
        } catch (error: Exception) {
            reject(requestId, error.message ?: error.javaClass.simpleName)
        }
    }

    private fun defaultOutputDir(): File {
        val pictures = context.getExternalFilesDir(Environment.DIRECTORY_PICTURES)
        return File(pictures ?: context.filesDir, "ImageStudio")
    }

    private fun importsDir(): File {
        return File(context.filesDir, "imports").apply { mkdirs() }
    }

    private fun sanitizeFileName(name: String, fallback: String): String {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return fallback
        return trimmed.replace(Regex("[^A-Za-z0-9._\\-\\u4E00-\\u9FFF]+"), "-")
    }

    private fun ensureImageFileName(name: String, fallback: String): String {
        val safe = sanitizeFileName(name, fallback)
        return if (Regex("\\.(png|jpe?g|webp)$", RegexOption.IGNORE_CASE).containsMatchIn(safe)) {
            safe
        } else {
            "$safe.png"
        }
    }

    private fun imageMimeForName(name: String): String {
        val lower = name.lowercase(Locale.US)
        return when {
            lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
            lower.endsWith(".webp") -> "image/webp"
            else -> "image/png"
        }
    }

    private fun queryDisplayName(uri: Uri): String? {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) {
                val name = cursor.getString(index)
                if (!name.isNullOrBlank()) return name
            }
        }
        return null
    }

    private data class CopiedImport(
        val file: File,
        val size: Long,
        val imageB64: String,
        val previewB64: String,
    )

    private fun copyUriToImports(uri: Uri, suggestedName: String): CopiedImport {
        val name = sanitizeFileName(suggestedName, "import-${timestamp()}.png")
        val target = File(importsDir(), "${timestamp()}-$name")
        var total = 0L
        val preview = java.io.ByteArrayOutputStream()
        context.contentResolver.openInputStream(uri)?.use { input ->
            FileOutputStream(target).use { output ->
                val buffer = ByteArray(8192)
                while (true) {
                    val read = input.read(buffer)
                    if (read <= 0) break
                    output.write(buffer, 0, read)
                    total += read
                    if (total <= maxDialogReadBytes) {
                        preview.write(buffer, 0, read)
                    }
                }
            }
        } ?: throw IllegalStateException("无法读取所选文件")
        val imageB64 = if (total in 1..maxDialogReadBytes) {
            Base64.encodeToString(preview.toByteArray(), Base64.NO_WRAP)
        } else {
            ""
        }
        return CopiedImport(target, total, imageB64, createPreviewB64(target))
    }

    private fun createPreviewB64(file: File): String {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return ""
        val maxEdge = max(bounds.outWidth, bounds.outHeight)
        var sample = 1
        while (maxEdge / sample > maxPreviewEdge * 2) sample *= 2
        val decode = BitmapFactory.Options().apply { inSampleSize = sample }
        val decoded = BitmapFactory.decodeFile(file.absolutePath, decode) ?: return ""
        val scaled = try {
            val scale = minOf(1f, maxPreviewEdge.toFloat() / max(decoded.width, decoded.height).toFloat())
            if (scale >= 0.999f) decoded
            else Bitmap.createScaledBitmap(
                decoded,
                max(1, (decoded.width * scale).roundToInt()),
                max(1, (decoded.height * scale).roundToInt()),
                true,
            )
        } catch (_: Exception) {
            decoded
        }
        return try {
            val out = java.io.ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.JPEG, 74, out)
            Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        } finally {
            if (scaled != decoded) scaled.recycle()
            decoded.recycle()
        }
    }

    private fun writeImportedBytes(bytes: ByteArray, suggestedName: String): File {
        val safeName = sanitizeFileName(suggestedName, "import-${timestamp()}.png")
        val file = File(importsDir(), "${timestamp()}-$safeName")
        file.writeBytes(bytes)
        return file
    }

    private fun openInputStreamForPath(path: String): InputStream {
        val trimmed = path.trim()
        if (trimmed.startsWith("content://")) {
            return context.contentResolver.openInputStream(Uri.parse(trimmed))
                ?: throw IllegalArgumentException("无法读取内容 URI: $trimmed")
        }
        return FileInputStream(File(trimmed))
    }

    private fun uriAndMimeForPath(path: String): Pair<Uri, String> {
        val trimmed = path.trim()
        val mime = when {
            trimmed.endsWith(".png", true) -> "image/png"
            trimmed.endsWith(".jpg", true) || trimmed.endsWith(".jpeg", true) -> "image/jpeg"
            trimmed.endsWith(".webp", true) -> "image/webp"
            trimmed.endsWith(".json", true) -> "application/json"
            trimmed.endsWith(".txt", true) -> "text/plain"
            else -> "*/*"
        }
        if (trimmed.startsWith("content://")) {
            return Uri.parse(trimmed) to mime
        }
        val file = File(trimmed)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        return uri to mime
    }

    private fun timestamp(): String = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())

    private fun resolve(requestId: String, payload: Any?) {
        val serialized = when (payload) {
            null -> "null"
            is String -> JSONObject.quote(payload)
            is Number, is Boolean -> payload.toString()
            else -> JSONObject.wrap(payload)?.toString() ?: "null"
        }
        webView.post {
            webView.evaluateJavascript("window.__imageStudioNativeResolve(${JSONObject.quote(requestId)}, $serialized)", null)
        }
    }

    private fun reject(requestId: String, message: String) {
        webView.post {
            webView.evaluateJavascript(
                "window.__imageStudioNativeReject(${JSONObject.quote(requestId)}, ${JSONObject.quote(message)})",
                null,
            )
        }
    }

    private fun emitNativeProgress(requestId: String, payload: Any?) {
        val serialized = when (payload) {
            null -> "null"
            is String -> JSONObject.quote(payload)
            is Number, is Boolean -> payload.toString()
            else -> JSONObject.wrap(payload)?.toString() ?: "null"
        }
        webView.post {
            webView.evaluateJavascript("window.__imageStudioNativeProgress?.(${JSONObject.quote(requestId)}, $serialized)", null)
        }
    }

    private class EarlyResolve : RuntimeException()
}
