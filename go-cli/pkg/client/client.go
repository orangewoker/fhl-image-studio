package client

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// RequestAndExtract performs one HTTP request (no retry) and returns the parsed image.
// It writes the raw response stream to rawSink, and (optionally) reports progress
// via the supplied callback. The callback is invoked from the goroutine that calls
// RequestAndExtract; receivers should be cheap or buffer internally.
func RequestAndExtract(
	ctx context.Context,
	transport Transport,
	opts Options,
	rawSink io.Writer,
	onProgress func(stage string, elapsedSeconds int, bytesReceived int64),
) (ImageResult, error) {
	return RequestAndExtractWithPartial(ctx, transport, opts, rawSink, onProgress, nil)
}

func RequestAndExtractWithPartial(
	ctx context.Context,
	transport Transport,
	opts Options,
	rawSink io.Writer,
	onProgress func(stage string, elapsedSeconds int, bytesReceived int64),
	onPartial func(PartialImage),
) (ImageResult, error) {
	payload, err := BuildPayload(opts)
	if err != nil {
		return ImageResult{}, err
	}

	baseURL := strings.TrimSpace(opts.BaseURL)
	if baseURL == "" {
		baseURL = strings.TrimSpace(BaseURL)
	}
	if baseURL == "" {
		return ImageResult{}, errors.New("未配置上游 BASE_URL,请在「设置 → 上游 BASE_URL」中填入兼容 Responses API 的中转站地址")
	}
	baseURL, err = ValidateBaseURL(baseURL)
	if err != nil {
		return ImageResult{}, err
	}
	req := Request{
		URL:     baseURL + "/v1/responses",
		APIKey:  opts.APIKey,
		Payload: payload,
	}

	collector := newResponseCollectorWithPartial(rawSink, onPartial)

	progressCh := make(chan string, 16)
	done := make(chan error, 1)
	startedAt := time.Now()

	go func() {
		done <- transport.Stream(ctx, req, collector, progressCh)
		close(progressCh)
	}()

	ticker := time.NewTicker(time.Duration(StatusIntervalSecond) * time.Second)
	defer ticker.Stop()

	lastStage := "等待接口响应"
	var streamErr error
loop:
	for {
		select {
		case <-ctx.Done():
			// Wait for goroutine to wind down so we don't leak.
			<-done
			return ImageResult{}, ctx.Err()
		case err, ok := <-done:
			if ok {
				streamErr = err
			}
			break loop
		case stage, ok := <-progressCh:
			if !ok {
				// Channel closed before done signal — drain.
				continue
			}
			lastStage = stage
		case <-ticker.C:
			if onProgress != nil {
				elapsed := int(time.Since(startedAt).Seconds())
				onProgress(lastStage, elapsed, collector.bytesReceived())
			}
		}
	}

	if streamErr != nil {
		// Stream errored mid-flight。但常见场景:上游已经把 final event(含完整
		// base64 result)发完之后,Cloudflare/上游 nginx 在 idle 阶段才把连接 reset。
		// 这时 collector 里其实已经提取到完整图;不该浪费一次重试。
		if result, perr := collector.result(); perr == nil && result.ImageB64 != "" {
			return result, nil
		}
		return ImageResult{}, streamErr
	}

	return collector.result()
}

// RequestAndExtractWithRetries wraps RequestAndExtract with the same retry
// policy as the Python script. It writes one raw-response file per attempt
// (sse-response-{timestamp}-attempt{N}.txt) under outputDir.
//
// Dispatches between the Responses API SSE flow and the standard Images API
// based on opts.APIMode. Empty / "responses" → SSE; "images" → Images API.
//
// Returns the final ImageResult and the path of the last raw-response file
// (handy for the CLI to print).
func RequestAndExtractWithRetries(
	ctx context.Context,
	transport Transport,
	opts Options,
	outputDir string,
	timestamp string,
	onLog func(string),
	onProgress func(stage string, elapsed int, bytes int64),
) (ImageResult, string, error) {
	return RequestAndExtractWithRetriesAndPartial(ctx, transport, opts, outputDir, timestamp, onLog, onProgress, nil)
}

func RequestAndExtractWithRetriesAndPartial(
	ctx context.Context,
	transport Transport,
	opts Options,
	outputDir string,
	timestamp string,
	onLog func(string),
	onProgress func(stage string, elapsed int, bytes int64),
	onPartial func(PartialImage),
) (ImageResult, string, error) {
	if opts.APIMode == APIModeImages {
		return imagesAPIWithRetries(ctx, opts, outputDir, timestamp, onLog, onProgress, onPartial)
	}
	return responsesAPIWithRetries(ctx, transport, opts, outputDir, timestamp, onLog, onProgress, onPartial)
}

func responsesAPIWithRetries(
	ctx context.Context,
	transport Transport,
	opts Options,
	outputDir string,
	timestamp string,
	onLog func(string),
	onProgress func(stage string, elapsed int, bytes int64),
	onPartial func(PartialImage),
) (ImageResult, string, error) {
	if onLog == nil {
		onLog = func(string) {}
	}

	if err := os.MkdirAll(outputDir, 0o700); err != nil {
		return ImageResult{}, "", fmt.Errorf("create output dir: %w", err)
	}

	var lastErr error
	var lastPath string

	for attempt := 1; attempt <= MaxAttempts; attempt++ {
		attemptOpts := stabilizeResponsesOptionsForAttempt(opts, attempt)
		rawPath := filepath.Join(outputDir, fmt.Sprintf("sse-response-%s-attempt%d.txt", timestamp, attempt))
		lastPath = rawPath
		onLog(fmt.Sprintf("第 %d/%d 次请求...", attempt, MaxAttempts))

		f, err := os.OpenFile(rawPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
		if err != nil {
			return ImageResult{}, lastPath, fmt.Errorf("create raw response file: %w", err)
		}

		result, reqErr := RequestAndExtractWithPartial(ctx, transport, attemptOpts, f, onProgress, onPartial)
		f.Close()

		if reqErr == nil {
			return result, rawPath, nil
		}

		// Decide whether to retry based on the body we just wrote.
		rawBytes, _ := os.ReadFile(rawPath)
		raw := string(rawBytes)

		if errors.Is(reqErr, ErrNoImageInResponse) {
			lastErr = reqErr
			reason := DescribeProblem(raw)
			if attempt < MaxAttempts && (IsRetryable(raw) || shouldRetryNoImageResponse(raw)) {
				onLog(reason)
				onLog(retryHintForResponsesAttempt(attempt, opts))
				onLog(fmt.Sprintf("这是可重试错误,%d 秒后自动重试...", RetryBackoffSeconds))
				if !sleepCtx(ctx, time.Duration(RetryBackoffSeconds)*time.Second) {
					return ImageResult{}, lastPath, ctx.Err()
				}
				continue
			}
			// 路径不再拼进 error message;调用方通过返回值里的 lastPath
			// 单独拿,前端用「查看日志」按钮直接打开。
			return ImageResult{}, lastPath, fmt.Errorf("%s", reason)
		}

		// Transport-level error (network / native HTTP failure). Retry up to MaxAttempts.
		lastErr = reqErr
		if attempt < MaxAttempts {
			onLog(fmt.Sprintf("%v", reqErr))
			onLog(fmt.Sprintf("%d 秒后自动重试...", RetryBackoffSeconds))
			if !sleepCtx(ctx, time.Duration(RetryBackoffSeconds)*time.Second) {
				return ImageResult{}, lastPath, ctx.Err()
			}
			continue
		}
		return ImageResult{}, lastPath, reqErr
	}

	if lastErr != nil {
		return ImageResult{}, lastPath, fmt.Errorf("多次请求后仍未成功:%w", lastErr)
	}
	return ImageResult{}, lastPath, fmt.Errorf("多次请求后仍未成功")
}

func stabilizeResponsesOptionsForAttempt(opts Options, attempt int) Options {
	if attempt <= 1 {
		return opts
	}
	next := opts
	if attempt >= 2 {
		next.NoPromptRevision = false
		next.AllowPromptAdaptation = true
	}
	if attempt >= 3 {
		next.Size = stableResponsesRetrySize(next.Size)
		if next.Quality == "" || next.Quality == "auto" || next.Quality == "high" {
			next.Quality = "medium"
		}
	}
	return next
}

func stableResponsesRetrySize(size string) string {
	switch size {
	case "2048x2048", "2880x2880":
		return "1024x1024"
	case "2048x1360", "3456x2304":
		return "1536x1024"
	case "1360x2048", "2304x3456":
		return "1024x1536"
	case "2048x1152", "3840x2160":
		return "1536x864"
	case "1152x2048", "2160x3840":
		return "864x1536"
	case "auto", "":
		return "1024x1024"
	default:
		return size
	}
}

func shouldRetryNoImageResponse(raw string) bool {
	lower := strings.ToLower(raw)
	return strings.Contains(lower, "response.output_text") ||
		strings.Contains(lower, "<image_generation") ||
		strings.Contains(lower, `"tools":[]`) ||
		strings.Contains(lower, `"tool_choice":"auto"`)
}

func retryHintForResponsesAttempt(attempt int, opts Options) string {
	if attempt == 1 {
		return "Auto retry: keeping Responses API and requiring the image_generation tool."
	}
	next := stabilizeResponsesOptionsForAttempt(opts, attempt+1)
	return fmt.Sprintf("Auto retry: keeping Responses API, using %s / %s, and requiring the image_generation tool.", next.Size, next.Quality)
}

func sleepCtx(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

// imagesAPIWithRetries runs the standard OpenAI Images API path with the same
// 3-attempt retry policy. Raw response per attempt is dumped to
// images-response-{timestamp}-attempt{N}.json so users can inspect upstream
// error messages.
func imagesAPIWithRetries(
	ctx context.Context,
	opts Options,
	outputDir string,
	timestamp string,
	onLog func(string),
	onProgress func(stage string, elapsed int, bytes int64),
	onPartial func(PartialImage),
) (ImageResult, string, error) {
	if onLog == nil {
		onLog = func(string) {}
	}
	if err := os.MkdirAll(outputDir, 0o700); err != nil {
		return ImageResult{}, "", fmt.Errorf("create output dir: %w", err)
	}

	var lastErr error
	var lastPath string

	for attempt := 1; attempt <= MaxAttempts; attempt++ {
		rawPath := filepath.Join(outputDir, fmt.Sprintf("images-response-%s-attempt%d.json", timestamp, attempt))
		lastPath = rawPath
		onLog(fmt.Sprintf("[Images API] 第 %d/%d 次请求...", attempt, MaxAttempts))

		f, err := os.OpenFile(rawPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
		if err != nil {
			return ImageResult{}, lastPath, fmt.Errorf("create raw response file: %w", err)
		}
		result, reqErr := RequestImagesAPIWithPartial(ctx, opts, f, onProgress, onPartial)
		f.Close()

		if reqErr == nil {
			return result, rawPath, nil
		}

		rawBytes, _ := os.ReadFile(rawPath)
		raw := string(rawBytes)

		lastErr = reqErr
		// Images API has no SSE / no partial — only retry on transport-level
		// errors and Cloudflare 5xx HTML pages.
		if attempt < MaxAttempts && (IsRetryable(raw) || isTransportishError(reqErr)) {
			onLog(fmt.Sprintf("%v", reqErr))
			onLog(fmt.Sprintf("%d 秒后自动重试...", RetryBackoffSeconds))
			if !sleepCtx(ctx, time.Duration(RetryBackoffSeconds)*time.Second) {
				return ImageResult{}, lastPath, ctx.Err()
			}
			continue
		}
		// 同上,raw 路径靠返回值带,不再嵌进 error message。
		return ImageResult{}, lastPath, reqErr
	}

	return ImageResult{}, lastPath, fmt.Errorf("多次请求后仍未成功:%w", lastErr)
}

// isTransportishError treats common transport-layer failures as retryable.
func isTransportishError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	for _, needle := range []string{
		"connection reset",
		"EOF",
		"timeout",
		"deadline exceeded",
		"i/o timeout",
		"TLS handshake",
		"no such host",
		"upstream connect error",
	} {
		if strings.Contains(msg, needle) {
			return true
		}
	}
	return false
}
