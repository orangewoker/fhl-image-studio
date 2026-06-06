package top.fangtangyuan.fhlstudio.android

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.URI
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CancellationException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread
import kotlin.math.max
import kotlin.math.roundToInt

object AndroidJobEventBus {
    private val listeners = CopyOnWriteArraySet<(JSONObject) -> Unit>()

    fun addListener(listener: (JSONObject) -> Unit): () -> Unit {
        listeners.add(listener)
        return { listeners.remove(listener) }
    }

    fun emit(event: JSONObject) {
        val copy = JSONObject(event.toString())
        for (listener in listeners) {
            try {
                listener(JSONObject(copy.toString()))
            } catch (_: Exception) {
                // Keep one bad WebView listener from breaking background work.
            }
        }
    }
}

object AndroidJobManager {
    private const val registryVersion = 1
    private const val maxGroups = 50
    private const val maxAttempts = 3
    private const val retryBackoffMs = 15_000L
    private const val defaultTextModel = "gpt-5.5"
    private const val defaultImageModel = "gpt-image-2"
    private const val noPromptRevisionInstructions =
        "You are a tool runner. Pass the user prompt to image_generation VERBATIM. DO NOT rewrite, expand, polish, or revise it in any way. Use the exact text the user gave."
    private const val safeImageToolInstructions =
        "Use the image_generation tool and return an image result, not a text-only answer. If the user's wording is ambiguous or may trigger a safety refusal, adapt it into a policy-compliant visual prompt while preserving the creative intent."
    private const val uploadCopyJpegQuality = 82
    private const val previewMaxEdge = 1280
    private const val previewJpegQuality = 78

    private val lock = Any()
    private val fullPayloads = ConcurrentHashMap<String, JSONObject>()
    private val liveJobIds = ConcurrentHashMap.newKeySet<String>()
    private val cancelledJobIds = ConcurrentHashMap.newKeySet<String>()
    private val activeConnections = ConcurrentHashMap<String, HttpURLConnection>()
    private val workerRunning = AtomicBoolean(false)
    @Volatile private var onIdle: (() -> Unit)? = null

    fun submit(context: Context, payload: JSONObject): JSONObject {
        val appContext = context.applicationContext
        val apiMode = payload.optString("apiMode", "responses").lowercase(Locale.US)
        if (apiMode != "responses") {
            throw IllegalArgumentException("Android 后台任务第一版仅支持 Responses/SSE，请使用一键配置 FHL 或切回 Responses。")
        }

        val now = System.currentTimeMillis()
        val workspaceId = payload.optString("workspaceId").ifBlank { "default" }
        val batchCount = payload.optInt("batchCount", 1).coerceIn(1, 9)
        val groupId = "android-group-${UUID.randomUUID()}"
        val slotIds = JSONArray()
        val slots = JSONArray()
        for (index in 0 until batchCount) {
            val jobId = "android-job-${UUID.randomUUID()}"
            slotIds.put(jobId)
            slots.put(
                JSONObject()
                    .put("jobId", jobId)
                    .put("groupId", groupId)
                    .put("workspaceId", workspaceId)
                    .put("batchIndex", index)
                    .put("status", "queued")
                    .put("createdAt", now)
                    .put("updatedAt", now)
                    .put("startedAt", JSONObject.NULL)
                    .put("finishedAt", JSONObject.NULL)
                    .put("stage", if (index == 0) "等待后台服务启动" else "排队中")
                    .put("elapsedSec", 0)
                    .put("bytes", 0),
            )
            liveJobIds.add(jobId)
        }

        val group = JSONObject()
            .put("groupId", groupId)
            .put("workspaceId", workspaceId)
            .put("createdAt", now)
            .put("mode", if (payload.optString("mode") == "edit") "edit" else "generate")
            .put("apiMode", "responses")
            .put("prompt", payload.optString("prompt"))
            .put("batchCount", batchCount)
            .put("size", payload.optString("size", "1024x1024"))
            .put("quality", payload.optString("quality", "medium"))
            .put("outputFormat", payload.optString("outputFormat", "png"))
            .put("negativePrompt", payload.optString("negativePrompt"))
            .put("styleTag", payload.optString("styleTag"))
            .put("seed", payload.optLong("seed", 0L))
            .put("sourceImagePaths", safeStringArray(payload.optJSONArray("sourceImagePaths")))
            .put("slotIds", slotIds)
            .put("slots", slots)
            .put("statusSummary", summarizeSlots(slots))

        fullPayloads[groupId] = JSONObject(payload.toString())
        synchronized(lock) {
            val registry = loadRegistry(appContext)
            val groups = registry.optJSONArray("groups") ?: JSONArray()
            val nextGroups = JSONArray()
            nextGroups.put(group)
            for (i in 0 until groups.length()) {
                val existing = groups.optJSONObject(i) ?: continue
                if (existing.optString("groupId") != groupId && nextGroups.length() < maxGroups) {
                    nextGroups.put(existing)
                }
            }
            saveRegistry(appContext, registry.put("groups", nextGroups))
        }

        startService(appContext)
        val jobIds = JSONArray()
        for (i in 0 until slotIds.length()) jobIds.put(slotIds.optString(i))
        return JSONObject()
            .put("groupId", groupId)
            .put("jobIds", jobIds)
            .put("group", group)
    }

    fun list(context: Context, workspaceId: String, limit: Int): JSONObject {
        val appContext = context.applicationContext
        synchronized(lock) {
            markDeadRunningJobsInterruptedLocked(appContext)
            val registry = loadRegistry(appContext)
            val groups = registry.optJSONArray("groups") ?: JSONArray()
            val out = JSONArray()
            for (i in 0 until groups.length()) {
                val group = groups.optJSONObject(i) ?: continue
                if (group.optString("workspaceId") == workspaceId && out.length() < limit.coerceIn(1, maxGroups)) {
                    out.put(group)
                }
            }
            return JSONObject()
                .put("workspaceId", workspaceId)
                .put("groups", out)
        }
    }

    fun cancel(context: Context, jobIds: JSONArray): JSONObject {
        val appContext = context.applicationContext
        val cancelled = JSONArray()
        for (i in 0 until jobIds.length()) {
            val jobId = jobIds.optString(i).trim()
            if (jobId.isBlank()) continue
            cancelledJobIds.add(jobId)
            activeConnections.remove(jobId)?.disconnect()
            cancelled.put(jobId)
            updateSlot(appContext, jobId, "cancelled") { slot ->
                slot.put("status", "cancelled")
                slot.put("stage", "已取消")
                slot.put("finishedAt", System.currentTimeMillis())
                slot.put("errorMessage", "")
            }
            liveJobIds.remove(jobId)
        }
        return JSONObject().put("cancelledJobIds", cancelled)
    }

    fun attach(context: Context): JSONObject {
        val appContext = context.applicationContext
        synchronized(lock) {
            markDeadRunningJobsInterruptedLocked(appContext)
            val groups = loadRegistry(appContext).optJSONArray("groups") ?: JSONArray()
            for (i in 0 until groups.length()) {
                val group = groups.optJSONObject(i) ?: continue
                val slots = group.optJSONArray("slots") ?: continue
                for (j in 0 until slots.length()) {
                    val slot = slots.optJSONObject(j) ?: continue
                    AndroidJobEventBus.emit(
                        JSONObject()
                            .put("type", eventTypeForStatus(slot.optString("status")))
                            .put("slot", JSONObject(slot.toString()))
                            .put("group", JSONObject(group.toString())),
                    )
                }
            }
        }
        return JSONObject().put("ok", true)
    }

    fun ensureWorker(context: Context, idleCallback: (() -> Unit)? = null) {
        val appContext = context.applicationContext
        onIdle = idleCallback ?: onIdle
        if (!workerRunning.compareAndSet(false, true)) return
        thread(name = "fhl-studio-android-jobs") {
            try {
                runWorker(appContext)
            } finally {
                workerRunning.set(false)
                if (hasQueuedWork(appContext)) {
                    ensureWorker(appContext, onIdle)
                } else {
                    onIdle?.invoke()
                }
            }
        }
    }

    private fun runWorker(context: Context) {
        while (true) {
            val next = nextQueuedSlot(context) ?: return
            val group = next.first
            val slot = next.second
            val groupId = group.optString("groupId")
            val jobId = slot.optString("jobId")
            val payload = fullPayloads[groupId]
            if (payload == null) {
                updateSlot(context, jobId, "error") { current ->
                    current.put("status", "interrupted")
                    current.put("stage", "任务已中断")
                    current.put("errorMessage", "App 进程重启后无法继续未完成任务")
                    current.put("finishedAt", System.currentTimeMillis())
                }
                liveJobIds.remove(jobId)
                continue
            }
            if (cancelledJobIds.contains(jobId)) {
                updateSlot(context, jobId, "cancelled") { current ->
                    current.put("status", "cancelled")
                    current.put("stage", "已取消")
                    current.put("finishedAt", System.currentTimeMillis())
                }
                liveJobIds.remove(jobId)
                continue
            }
            executeSlot(context, group, slot, payload)
        }
    }

    private fun executeSlot(context: Context, group: JSONObject, slot: JSONObject, payload: JSONObject) {
        val jobId = slot.optString("jobId")
        val batchIndex = slot.optInt("batchIndex", 0)
        val startedAt = System.currentTimeMillis()
        updateSlot(context, jobId, "snapshot") { current ->
            current.put("status", "running")
            current.put("stage", "后台任务已启动")
            current.put("startedAt", startedAt)
            current.put("updatedAt", startedAt)
        }
        try {
            val slotPayload = JSONObject(payload.toString())
            val baseSeed = payload.optLong("seed", 0L)
            if (baseSeed > 0L) slotPayload.put("seed", baseSeed + batchIndex)
            val result = requestResponsesWithRetries(context, jobId, slotPayload, startedAt)
            if (cancelledJobIds.contains(jobId)) throw CancellationException("cancelled")
            val outputFormat = payload.optString("outputFormat", "png").ifBlank { "png" }
            val savedPath = saveFinalImage(
                context,
                result.imageB64,
                outputFormat,
                "fhl-${payload.optString("mode", "generate")}-${safeNamePart(payload.optString("prompt"))}-${timestampForFile()}-${batchIndex + 1}.$outputFormat",
            )
            val preview = createPreviewFile(context, savedPath)
            updateSlot(context, jobId, "terminal") { current ->
                current.put("status", "succeeded")
                current.put("stage", "生成完成")
                current.put("finishedAt", System.currentTimeMillis())
                current.put("elapsedSec", ((System.currentTimeMillis() - startedAt) / 1000.0))
                current.put("savedPath", savedPath)
                if (preview != null) {
                    current.put("thumbPath", preview.path)
                    current.put("previewUrl", preview.dataUrl)
                    current.put("previewWidth", preview.width)
                    current.put("previewHeight", preview.height)
                }
                current.put("rawPath", result.rawPath)
                current.put("revisedPrompt", result.revisedPrompt)
                current.put("sourceEvent", result.sourceEvent)
            }
        } catch (cancelled: CancellationException) {
            updateSlot(context, jobId, "cancelled") { current ->
                current.put("status", "cancelled")
                current.put("stage", "已取消")
                current.put("finishedAt", System.currentTimeMillis())
                current.put("elapsedSec", ((System.currentTimeMillis() - startedAt) / 1000.0))
            }
        } catch (error: JobRequestException) {
            updateSlot(context, jobId, "error") { current ->
                current.put("status", "failed")
                current.put("stage", "生成失败")
                current.put("finishedAt", System.currentTimeMillis())
                current.put("elapsedSec", ((System.currentTimeMillis() - startedAt) / 1000.0))
                current.put("errorMessage", error.message ?: "生成失败")
                if (!error.rawPath.isNullOrBlank()) current.put("rawPath", error.rawPath)
            }
        } catch (error: Exception) {
            updateSlot(context, jobId, "error") { current ->
                current.put("status", "failed")
                current.put("stage", "生成失败")
                current.put("finishedAt", System.currentTimeMillis())
                current.put("elapsedSec", ((System.currentTimeMillis() - startedAt) / 1000.0))
                current.put("errorMessage", error.message ?: error.javaClass.simpleName)
            }
        } finally {
            activeConnections.remove(jobId)?.disconnect()
            liveJobIds.remove(jobId)
            if (allGroupSlotsTerminal(context, group.optString("groupId"))) {
                fullPayloads.remove(group.optString("groupId"))
            }
        }
    }

    private fun requestResponsesWithRetries(
        context: Context,
        jobId: String,
        originalPayload: JSONObject,
        startedAt: Long,
    ): JobImageResult {
        var lastError: JobRequestException? = null
        for (attempt in 1..maxAttempts) {
            if (cancelledJobIds.contains(jobId)) throw CancellationException("cancelled")
            val payload = stabilizePayload(originalPayload, attempt)
            try {
                return requestResponsesOnce(context, jobId, payload, attempt, startedAt)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: JobRequestException) {
                lastError = error
                if (attempt < maxAttempts && error.retryable) {
                    updateSlot(context, jobId, "snapshot") { slot ->
                        slot.put("stage", retryStage(attempt, payload))
                    }
                    sleepWithCancel(jobId, retryBackoffMs)
                    continue
                }
                throw error
            }
        }
        throw lastError ?: JobRequestException("生成失败", null, false)
    }

    private fun requestResponsesOnce(
        context: Context,
        jobId: String,
        payload: JSONObject,
        attempt: Int,
        startedAt: Long,
    ): JobImageResult {
        val baseUrl = normalizeBaseURL(payload.optString("baseURL"))
        val apiKey = payload.optString("apiKey").trim()
        if (apiKey.isBlank()) throw JobRequestException("API Key 为空，请先在一键配置里填写并测试。", null, false)
        val url = "$baseUrl/v1/responses"
        val body = buildResponsesPayload(context, payload).toString()
        val bodyBytes = body.toByteArray(Charsets.UTF_8)
        val proxyMode = payload.optString("proxyMode", "system")
        val proxyUrl = payload.optString("proxyURL", "")
        val raw = StringBuilder()
        var bytesReceived = 0L
        var lastPartial: JobImageResult? = null
        updateSlot(context, jobId, "snapshot") { slot ->
            slot.put("stage", "第 $attempt/$maxAttempts 次请求 FHL Responses/SSE")
            slot.put("elapsedSec", ((System.currentTimeMillis() - startedAt) / 1000.0))
            slot.put("bytes", bytesReceived)
        }

        val connection = openHttpConnection(url, proxyMode, proxyUrl).apply {
            requestMethod = "POST"
            instanceFollowRedirects = true
            connectTimeout = 30_000
            readTimeout = 600_000
            doInput = true
            doOutput = true
            setRequestProperty("Authorization", "Bearer $apiKey")
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "text/event-stream, application/json")
            setRequestProperty("User-Agent", "fhl-studio-android")
        }
        activeConnections[jobId] = connection
        try {
            connection.outputStream.use { it.write(bodyBytes) }
            val status = connection.responseCode
            val stream = if (status >= 400) connection.errorStream else connection.inputStream
            stream?.bufferedReader(Charsets.UTF_8)?.useLines { lines ->
                lines.forEach { line ->
                    if (cancelledJobIds.contains(jobId)) throw CancellationException("cancelled")
                    raw.append(line).append('\n')
                    bytesReceived += line.toByteArray(Charsets.UTF_8).size + 1
                    parseSSEEventLine(line)?.let { event ->
                        val partial = partialFromEvent(event)
                        if (partial != null) lastPartial = partial
                        val summary = summarizeSSEEvent(event)
                        if (summary.isNotBlank()) {
                            updateSlot(context, jobId, "snapshot") { slot ->
                                slot.put("stage", summary)
                                slot.put("elapsedSec", ((System.currentTimeMillis() - startedAt) / 1000.0))
                                slot.put("bytes", bytesReceived)
                            }
                        }
                    }
                }
            }
            val rawText = raw.toString()
            val rawPath = writeRawLog(context, "sse-response-attempt$attempt-${jobId.takeLast(8)}.txt", rawText)
            if (status !in 200..299) {
                throw JobRequestException(describeProblem(rawText, status), rawPath, isRetryableRaw(rawText, status))
            }
            val result = extractFinalImageResult(rawText)
            if (result != null) return result.copy(rawPath = rawPath)
            if (lastPartial != null) {
                val intermediatePath = saveIntermediateImage(
                    context,
                    lastPartial!!.imageB64,
                    payload.optString("outputFormat", "png").ifBlank { "png" },
                    "partial-${timestampForFile()}-${jobId.takeLast(8)}.${payload.optString("outputFormat", "png").ifBlank { "png" }}",
                )
                throw JobRequestException("FHL 只返回了中间预览图，未返回 final；中间图已保存到 $intermediatePath。", rawPath, true)
            }
            throw JobRequestException(describeProblem(rawText, status), rawPath, true)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: JobRequestException) {
            throw error
        } catch (error: Exception) {
            val rawPath = if (raw.isNotBlank()) writeRawLog(context, "sse-response-attempt$attempt-${jobId.takeLast(8)}.txt", raw.toString()) else null
            throw JobRequestException(error.message ?: error.javaClass.simpleName, rawPath, true)
        } finally {
            activeConnections.remove(jobId)?.disconnect()
        }
    }

    private fun buildResponsesPayload(context: Context, payload: JSONObject): JSONObject {
        val sourceDataUrls = resolveSourceDataURLs(context, payload)
        val content = JSONArray().put(JSONObject().put("type", "input_text").put("text", payload.optString("prompt").trim()))
        for (i in 0 until sourceDataUrls.length()) {
            content.put(JSONObject().put("type", "input_image").put("image_url", sourceDataUrls.optString(i)))
        }
        val compat = payload.optString("requestPolicy", "openai") == "compat"
        val tool = JSONObject()
            .put("type", "image_generation")
            .put("model", payload.optString("imageModelID", defaultImageModel).ifBlank { defaultImageModel })
            .put("action", if (sourceDataUrls.length() > 0) "edit" else "generate")
            .put("size", payload.optString("size", "1024x1024").ifBlank { "1024x1024" })
            .put("quality", payload.optString("quality", "medium").ifBlank { "medium" })
            .put("output_format", payload.optString("outputFormat", "png").ifBlank { "png" })
            .put("moderation", "low")
            .put("partial_images", normalizePartialImages(payload.opt("partialImages")))
        val seed = payload.optLong("seed", 0L)
        val negativePrompt = payload.optString("negativePrompt").trim()
        if (compat && seed > 0L) tool.put("seed", seed)
        if (compat && negativePrompt.isNotBlank()) tool.put("negative_prompt", negativePrompt)
        val maskB64 = payload.optString("maskB64").trim()
        if (maskB64.isNotBlank()) {
            tool.put("input_image_mask", JSONObject().put("image_url", "data:image/png;base64,$maskB64"))
        }
        return JSONObject()
            .put("model", payload.optString("textModelID", defaultTextModel).ifBlank { defaultTextModel })
            .put("input", JSONArray().put(JSONObject().put("role", "user").put("content", content)))
            .put("tools", JSONArray().put(tool))
            .put("tool_choice", JSONObject().put("type", "image_generation"))
            .put("reasoning", JSONObject().put("effort", "xhigh"))
            .put("store", false)
            .put("stream", true)
            .put(
                "instructions",
                if (payload.optBoolean("noPromptRevision", true)) noPromptRevisionInstructions else safeImageToolInstructions,
            )
    }

    private fun resolveSourceDataURLs(context: Context, payload: JSONObject): JSONArray {
        val paths = payload.optJSONArray("sourceImagePaths")
            ?: payload.optJSONArray("imagePaths")
            ?: JSONArray()
        val out = JSONArray()
        for (i in 0 until paths.length()) {
            val path = paths.optString(i).trim()
            if (path.isBlank()) continue
            val dataUrl = sourcePathToDataURL(context, path, paths.length())
            if (dataUrl.isNotBlank()) out.put(dataUrl)
        }
        val singlePath = payload.optString("imagePath").trim()
        if (out.length() == 0 && singlePath.isNotBlank()) {
            val dataUrl = sourcePathToDataURL(context, singlePath, 1)
            if (dataUrl.isNotBlank()) out.put(dataUrl)
        }
        return out
    }

    private fun sourcePathToDataURL(context: Context, path: String, sourceCount: Int): String {
        val fileBytes = openInputStream(context, path).use { it.readBytes() }
        val compressed = compressUploadCopy(fileBytes, sourceCount)
        val bytes = compressed ?: fileBytes
        val mime = if (compressed != null) "image/jpeg" else mimeForPath(path)
        return "data:$mime;base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}"
    }

    private fun compressUploadCopy(bytes: ByteArray, sourceCount: Int): ByteArray? {
        val threshold = if (sourceCount >= 2) 512 * 1024 else (2.5 * 1024 * 1024).toInt()
        if (bytes.size < threshold) return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val maxLongSide = when {
            sourceCount >= 3 -> 1024
            sourceCount >= 2 -> 1280
            else -> 1600
        }
        val scale = minOf(1f, maxLongSide.toFloat() / max(bounds.outWidth, bounds.outHeight).toFloat())
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / sample > maxLongSide * 2) sample *= 2
        val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
            ?: return null
        val scaled = try {
            if (scale >= 0.999f) decoded
            else Bitmap.createScaledBitmap(
                decoded,
                max(1, (bounds.outWidth * scale).roundToInt()),
                max(1, (bounds.outHeight * scale).roundToInt()),
                true,
            )
        } catch (_: Exception) {
            decoded
        }
        return try {
            val out = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.JPEG, uploadCopyJpegQuality, out)
            val next = out.toByteArray()
            if (next.size >= bytes.size && scale >= 0.999f) null else next
        } finally {
            if (scaled != decoded) scaled.recycle()
            decoded.recycle()
        }
    }

    private fun updateSlot(
        context: Context,
        jobId: String,
        eventType: String,
        mutate: (JSONObject) -> Unit,
    ): Pair<JSONObject, JSONObject>? {
        synchronized(lock) {
            val registry = loadRegistry(context)
            val groups = registry.optJSONArray("groups") ?: return null
            for (groupIndex in 0 until groups.length()) {
                val group = groups.optJSONObject(groupIndex) ?: continue
                val slots = group.optJSONArray("slots") ?: continue
                for (slotIndex in 0 until slots.length()) {
                    val slot = slots.optJSONObject(slotIndex) ?: continue
                    if (slot.optString("jobId") != jobId) continue
                    mutate(slot)
                    slot.put("updatedAt", System.currentTimeMillis())
                    group.put("statusSummary", summarizeSlots(slots))
                    saveRegistry(context, registry)
                    val event = JSONObject()
                        .put("type", eventType)
                        .put("slot", JSONObject(slot.toString()))
                        .put("group", JSONObject(group.toString()))
                    AndroidJobEventBus.emit(event)
                    return group to slot
                }
            }
        }
        return null
    }

    private fun nextQueuedSlot(context: Context): Pair<JSONObject, JSONObject>? {
        synchronized(lock) {
            val registry = loadRegistry(context)
            val groups = registry.optJSONArray("groups") ?: return null
            for (i in 0 until groups.length()) {
                val group = groups.optJSONObject(i) ?: continue
                val slots = group.optJSONArray("slots") ?: continue
                for (j in 0 until slots.length()) {
                    val slot = slots.optJSONObject(j) ?: continue
                    if (slot.optString("status") == "queued") {
                        return JSONObject(group.toString()) to JSONObject(slot.toString())
                    }
                }
            }
        }
        return null
    }

    private fun hasQueuedWork(context: Context): Boolean {
        synchronized(lock) {
            val groups = loadRegistry(context).optJSONArray("groups") ?: return false
            for (i in 0 until groups.length()) {
                val slots = groups.optJSONObject(i)?.optJSONArray("slots") ?: continue
                for (j in 0 until slots.length()) {
                    if (slots.optJSONObject(j)?.optString("status") == "queued") return true
                }
            }
            return false
        }
    }

    private fun allGroupSlotsTerminal(context: Context, groupId: String): Boolean {
        synchronized(lock) {
            val groups = loadRegistry(context).optJSONArray("groups") ?: return true
            for (i in 0 until groups.length()) {
                val group = groups.optJSONObject(i) ?: continue
                if (group.optString("groupId") != groupId) continue
                val slots = group.optJSONArray("slots") ?: return true
                for (j in 0 until slots.length()) {
                    when (slots.optJSONObject(j)?.optString("status")) {
                        "queued", "running" -> return false
                    }
                }
            }
        }
        return true
    }

    private fun markDeadRunningJobsInterruptedLocked(context: Context) {
        val registry = loadRegistry(context)
        var dirty = false
        val groups = registry.optJSONArray("groups") ?: return
        for (i in 0 until groups.length()) {
            val group = groups.optJSONObject(i) ?: continue
            val slots = group.optJSONArray("slots") ?: continue
            for (j in 0 until slots.length()) {
                val slot = slots.optJSONObject(j) ?: continue
                val status = slot.optString("status")
                val jobId = slot.optString("jobId")
                if ((status == "queued" || status == "running") && !liveJobIds.contains(jobId)) {
                    slot.put("status", "interrupted")
                    slot.put("stage", "任务已中断")
                    slot.put("errorMessage", "App 或系统重启后无法继续未完成任务")
                    slot.put("finishedAt", System.currentTimeMillis())
                    slot.put("updatedAt", System.currentTimeMillis())
                    dirty = true
                }
            }
            if (dirty) group.put("statusSummary", summarizeSlots(slots))
        }
        if (dirty) saveRegistry(context, registry)
    }

    private fun eventTypeForStatus(status: String): String {
        return when (status) {
            "succeeded" -> "terminal"
            "failed", "interrupted" -> "error"
            "cancelled" -> "cancelled"
            else -> "snapshot"
        }
    }

    private fun loadRegistry(context: Context): JSONObject {
        val file = registryFile(context)
        if (!file.isFile) {
            return JSONObject()
                .put("version", registryVersion)
                .put("updatedAt", System.currentTimeMillis())
                .put("groups", JSONArray())
        }
        return try {
            JSONObject(file.readText(Charsets.UTF_8))
        } catch (_: Exception) {
            JSONObject()
                .put("version", registryVersion)
                .put("updatedAt", System.currentTimeMillis())
                .put("groups", JSONArray())
        }
    }

    private fun saveRegistry(context: Context, registry: JSONObject) {
        val file = registryFile(context)
        file.parentFile?.mkdirs()
        registry.put("version", registryVersion)
        registry.put("updatedAt", System.currentTimeMillis())
        file.writeText(registry.toString(2), Charsets.UTF_8)
    }

    private fun registryFile(context: Context): File = File(context.filesDir, "jobs/android-jobs.v1.json")

    private fun summarizeSlots(slots: JSONArray): JSONObject {
        val out = JSONObject()
            .put("queued", 0)
            .put("running", 0)
            .put("succeeded", 0)
            .put("failed", 0)
            .put("cancelled", 0)
            .put("interrupted", 0)
        for (i in 0 until slots.length()) {
            val status = slots.optJSONObject(i)?.optString("status") ?: continue
            if (out.has(status)) out.put(status, out.optInt(status) + 1)
        }
        return out
    }

    private fun safeStringArray(input: JSONArray?): JSONArray {
        val out = JSONArray()
        if (input == null) return out
        for (i in 0 until input.length()) {
            val value = input.optString(i).trim()
            if (value.isNotBlank()) out.put(value)
        }
        return out
    }

    private fun startService(context: Context) {
        val intent = Intent(context, AndroidJobService::class.java).setAction(AndroidJobService.ACTION_RUN_JOBS)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(context, intent)
        } else {
            context.startService(intent)
        }
    }

    private fun sleepWithCancel(jobId: String, ms: Long) {
        val end = System.currentTimeMillis() + ms
        while (System.currentTimeMillis() < end) {
            if (cancelledJobIds.contains(jobId)) throw CancellationException("cancelled")
            Thread.sleep(250L)
        }
    }

    private fun stabilizePayload(original: JSONObject, attempt: Int): JSONObject {
        val payload = JSONObject(original.toString())
        if (attempt > 1) payload.put("partialImages", 0)
        if (attempt >= 3) {
            payload.put("size", stableSizeForRetry(payload.optString("size", "1024x1024")))
            payload.put("noPromptRevision", false)
            val quality = payload.optString("quality", "medium")
            if (quality == "auto" || quality == "high") payload.put("quality", "medium")
        }
        return payload
    }

    private fun stableSizeForRetry(size: String): String = when (size) {
        "2048x2048", "2880x2880" -> "1024x1024"
        "2048x1360", "3456x2304" -> "1536x1024"
        "1360x2048", "2304x3456" -> "1024x1536"
        "2048x1152", "3840x2160" -> "1536x864"
        "1152x2048", "2160x3840" -> "864x1536"
        "auto" -> "1024x1024"
        else -> size.ifBlank { "1024x1024" }
    }

    private fun retryStage(attempt: Int, payload: JSONObject): String {
        return if (attempt == 1) {
            "上游不稳定，15 秒后关闭 partial 自动重试"
        } else {
            "上游仍不稳定，15 秒后使用 ${payload.optString("size")} / ${payload.optString("quality")} 稳定参数重试"
        }
    }

    private fun parseSSEEventLine(line: String): JSONObject? {
        val trimmed = line.trim()
        if (!trimmed.startsWith("data: ")) return null
        val payload = trimmed.removePrefix("data: ").trim()
        if (payload.isBlank() || payload == "[DONE]") return null
        return try {
            JSONObject(payload)
        } catch (_: Exception) {
            null
        }
    }

    private fun summarizeSSEEvent(event: JSONObject): String {
        return when (event.optString("type")) {
            "response.created" -> "请求已创建"
            "response.in_progress" -> "模型处理中"
            "response.image_generation_call.in_progress" -> "图片工具已启动"
            "response.image_generation_call.generating" -> "图片正在生成"
            "response.image_generation_call.partial_image" -> "收到中间预览"
            "response.output_item.done" -> {
                val item = event.optJSONObject("item")
                if (item?.optString("type") == "image_generation_call" && item.optString("result").isNotBlank()) {
                    "收到 final 图片，正在保存"
                } else {
                    "模型输出项完成"
                }
            }
            "response.completed" -> "接口已完成"
            else -> event.optString("type").takeIf { it.isNotBlank() }?.let { "接口事件：$it" } ?: ""
        }
    }

    private fun partialFromEvent(event: JSONObject): JobImageResult? {
        if (event.optString("type") != "response.image_generation_call.partial_image") return null
        val b64 = event.optString("partial_image_b64")
        if (b64.isBlank()) return null
        return JobImageResult(b64, event.optString("revised_prompt"), "partial", null)
    }

    private fun extractFinalImageResult(raw: String): JobImageResult? {
        for (line in raw.split(Regex("\\r?\\n"))) {
            val event = parseSSEEventLine(line) ?: continue
            val item = event.optJSONObject("item")
            if (event.optString("type") == "response.output_item.done" && item?.optString("type") == "image_generation_call") {
                val result = item.optString("result")
                if (result.isNotBlank()) return JobImageResult(result, item.optString("revised_prompt"), "final", null)
            }
            val found = walkForImageCall(event)
            if (found != null) {
                return JobImageResult(found.optString("result"), found.optString("revised_prompt"), "final", null)
            }
        }
        return try {
            val found = walkForImageCall(JSONObject(raw))
            if (found != null) JobImageResult(found.optString("result"), found.optString("revised_prompt"), "json", null) else null
        } catch (_: Exception) {
            null
        }
    }

    private fun walkForImageCall(value: Any?): JSONObject? {
        when (value) {
            is JSONObject -> {
                if (value.optString("type") == "image_generation_call" && value.optString("result").isNotBlank()) return value
                val keys = value.keys()
                while (keys.hasNext()) {
                    val found = walkForImageCall(value.opt(keys.next()))
                    if (found != null) return found
                }
            }
            is JSONArray -> {
                for (i in 0 until value.length()) {
                    val found = walkForImageCall(value.opt(i))
                    if (found != null) return found
                }
            }
        }
        return null
    }

    private fun describeProblem(raw: String, status: Int): String {
        val text = raw.trim()
        if (text.isBlank()) return if (status > 0) "接口返回 $status 且内容为空" else "接口返回为空"
        val lower = text.lowercase(Locale.US)
        if (lower.contains("524")) return "Cloudflare 524：上游超时"
        if (lower.contains("504") || lower.contains("gateway time-out")) return "Cloudflare 504：上游网关超时"
        return try {
            val parsed = JSONObject(text)
            parsed.optJSONObject("error")?.optString("message")?.takeIf { it.isNotBlank() }
                ?: parsed.optString("message").takeIf { it.isNotBlank() }
                ?: "接口已返回内容，但没有发现 image_generation_call.result"
        } catch (_: Exception) {
            "接口已返回内容，但没有发现 image_generation_call.result"
        }
    }

    private fun isRetryableRaw(raw: String, status: Int): Boolean {
        if (status in listOf(502, 503, 504, 524)) return true
        val lower = raw.lowercase(Locale.US)
        return listOf(
            "timeout",
            "gateway",
            "temporarily unavailable",
            "origin_gateway_timeout",
            "no final",
            "没有返回图片",
            "image_generation_call.result",
        ).any { lower.contains(it) }
    }

    private fun normalizePartialImages(value: Any?): Int {
        val n = when (value) {
            is Number -> value.toInt()
            is String -> value.toIntOrNull()
            else -> null
        } ?: 1
        return n.coerceIn(0, 3)
    }

    private fun normalizeBaseURL(raw: String): String {
        val cleaned = raw.trim().trimEnd('/')
        if (cleaned.isBlank()) throw JobRequestException("BASE_URL 为空", null, false)
        return cleaned
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

    private fun normalizeProxyMode(raw: String): String = when (raw.trim().lowercase(Locale.US)) {
        "none" -> "none"
        "custom" -> "custom"
        else -> "system"
    }

    private fun parseCustomProxy(raw: String): Proxy {
        val uri = URI(raw.trim())
        val scheme = uri.scheme?.lowercase(Locale.US) ?: ""
        if (scheme != "http" && scheme != "https") throw IllegalArgumentException("代理地址仅支持 http:// 或 https://")
        val host = uri.host ?: throw IllegalArgumentException("代理地址必须包含主机")
        val port = if (uri.port > 0) uri.port else if (scheme == "https") 443 else 80
        return Proxy(Proxy.Type.HTTP, InetSocketAddress.createUnresolved(host, port))
    }

    private fun openInputStream(context: Context, path: String): InputStream {
        val trimmed = path.trim()
        if (trimmed.startsWith("content://")) {
            return context.contentResolver.openInputStream(Uri.parse(trimmed))
                ?: throw IllegalArgumentException("无法读取内容 URI")
        }
        return FileInputStream(File(trimmed))
    }

    private fun defaultOutputDir(context: Context): File {
        val prefs = context.getSharedPreferences("image_studio_android", Context.MODE_PRIVATE)
        val saved = prefs.getString("output_dir", "") ?: ""
        if (saved.isNotBlank()) return File(saved).apply { mkdirs() }
        val pictures = context.getExternalFilesDir(Environment.DIRECTORY_PICTURES)
        return File(pictures ?: context.filesDir, "ImageStudio").apply { mkdirs() }
    }

    private fun saveFinalImage(context: Context, imageB64: String, outputFormat: String, suggestedName: String): String {
        val bytes = Base64.decode(imageB64, Base64.DEFAULT)
        val name = ensureImageFileName(suggestedName, outputFormat)
        val dir = defaultOutputDir(context)
        val file = uniqueFile(dir, name)
        FileOutputStream(file).use { it.write(bytes) }
        return file.absolutePath
    }

    private fun saveIntermediateImage(context: Context, imageB64: String, outputFormat: String, suggestedName: String): String {
        val bytes = Base64.decode(imageB64, Base64.DEFAULT)
        val file = uniqueFile(File(context.filesDir, "intermediate").apply { mkdirs() }, ensureImageFileName(suggestedName, outputFormat))
        FileOutputStream(file).use { it.write(bytes) }
        return file.absolutePath
    }

    private fun createPreviewFile(context: Context, savedPath: String): PreviewAsset? {
        return try {
            val source = File(savedPath)
            if (!source.exists()) return null
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(source.absolutePath, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
            val maxEdge = max(bounds.outWidth, bounds.outHeight)
            var sample = 1
            while (maxEdge / sample > previewMaxEdge * 2) sample *= 2
            val decoded = BitmapFactory.decodeFile(
                source.absolutePath,
                BitmapFactory.Options().apply { inSampleSize = sample },
            ) ?: return null
            val scaled = try {
                val scale = minOf(1f, previewMaxEdge.toFloat() / max(decoded.width, decoded.height).toFloat())
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
            try {
                val out = ByteArrayOutputStream()
                scaled.compress(Bitmap.CompressFormat.JPEG, previewJpegQuality, out)
                val bytes = out.toByteArray()
                val previewFile = uniqueFile(
                    File(context.filesDir, "previews").apply { mkdirs() },
                    "${source.nameWithoutExtension}-preview.jpg",
                )
                FileOutputStream(previewFile).use { it.write(bytes) }
                PreviewAsset(
                    previewFile.absolutePath,
                    "data:image/jpeg;base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}",
                    scaled.width,
                    scaled.height,
                )
            } finally {
                if (scaled != decoded) scaled.recycle()
                decoded.recycle()
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun writeRawLog(context: Context, name: String, text: String): String {
        val file = uniqueFile(File(context.filesDir, "log").apply { mkdirs() }, safeFileName(name, "sse-response.txt"))
        file.writeText(text, Charsets.UTF_8)
        return file.absolutePath
    }

    private fun uniqueFile(directory: File, name: String): File {
        var candidate = File(directory, name)
        if (!candidate.exists()) return candidate
        val dot = name.lastIndexOf('.')
        val stem = if (dot >= 0) name.substring(0, dot) else name
        val ext = if (dot >= 0) name.substring(dot) else ""
        var index = 2
        while (candidate.exists()) {
            candidate = File(directory, "$stem-$index$ext")
            index += 1
        }
        return candidate
    }

    private fun ensureImageFileName(raw: String, outputFormat: String): String {
        val ext = when (outputFormat.lowercase(Locale.US)) {
            "jpeg", "jpg" -> "jpg"
            "webp" -> "webp"
            else -> "png"
        }
        val safe = safeFileName(raw, "image-${timestampForFile()}.$ext")
        return if (Regex("\\.(png|jpe?g|webp)$", RegexOption.IGNORE_CASE).containsMatchIn(safe)) safe else "$safe.$ext"
    }

    private fun safeFileName(raw: String, fallback: String): String {
        val cleaned = raw.trim().replace(Regex("[^A-Za-z0-9._\\-\\u4E00-\\u9FFF]+"), "-").trim('-')
        return cleaned.ifBlank { fallback }
    }

    private fun safeNamePart(raw: String): String = safeFileName(raw.take(24), "image")

    private fun mimeForPath(path: String): String {
        val lower = path.lowercase(Locale.US)
        return when {
            lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
            lower.endsWith(".webp") -> "image/webp"
            else -> "image/png"
        }
    }

    private fun timestampForFile(): String = SimpleDateFormat("yyyyMMdd-HHmmss-SSS", Locale.US).format(Date())

    private data class JobImageResult(
        val imageB64: String,
        val revisedPrompt: String,
        val sourceEvent: String,
        val rawPath: String?,
    )

    private data class PreviewAsset(
        val path: String,
        val dataUrl: String,
        val width: Int,
        val height: Int,
    )

    private class JobRequestException(
        message: String,
        val rawPath: String?,
        val retryable: Boolean,
    ) : Exception(message)
}
