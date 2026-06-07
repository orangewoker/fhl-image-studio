package client

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"
)

const noPromptRevisionInstructions = "You are a tool runner. Pass the user prompt to image_generation VERBATIM. DO NOT rewrite, expand, polish, or revise it in any way. Use the exact text the user gave."
const safeImageToolInstructions = "Use the image_generation tool and return an image result, not a text-only answer. If the user's wording is ambiguous or may trigger a safety refusal, adapt it into a policy-compliant visual prompt while preserving the creative intent."

// BuildPayload mirrors Python's build_payload. Returns canonical JSON bytes.
//
// When opts has one or more image data URLs (via ImageDataURLs or the legacy
// single ImageDataURL field), action becomes "edit" and each URL is appended
// as its own input_image content block, in order. When opts.MaskB64 is
// non-empty, it is embedded as the tool's "input_image_mask.image_url"
// parameter using a base64 data URL.
func BuildPayload(opts Options) ([]byte, error) {
	if strings.TrimSpace(opts.Prompt) == "" {
		return nil, ErrEmptyPrompt
	}
	size := opts.Size
	if size == "" {
		size = DefaultSize
	}
	quality := opts.Quality
	if quality == "" {
		quality = DefaultQuality
	}
	outputFormat := opts.OutputFormat
	if outputFormat == "" {
		outputFormat = OutputFormat
	}
	includeExtended := shouldSendExtendedImageParameters(opts.RequestPolicy)

	content := []map[string]any{
		{"type": "input_text", "text": opts.Prompt},
	}
	action := "generate"
	imageURLs := opts.EffectiveImageDataURLs()
	for _, url := range imageURLs {
		content = append(content, map[string]any{
			"type":      "input_image",
			"image_url": url,
		})
	}
	if len(imageURLs) > 0 {
		action = "edit"
	}

	imgModel := opts.ImageModelID
	if imgModel == "" {
		imgModel = ImageModel
	}
	tool := map[string]any{
		"type":           "image_generation",
		"model":          imgModel,
		"action":         action,
		"size":           size,
		"quality":        quality,
		"output_format":  outputFormat,
		"moderation":     "low",
		"partial_images": 0,
	}
	if opts.MaskB64 != "" {
		tool["input_image_mask"] = map[string]any{
			"image_url": imageDataURLFromBase64(opts.MaskB64, "image/png"),
		}
	}
	if includeExtended && opts.Seed != 0 {
		tool["seed"] = opts.Seed
	}
	if includeExtended && strings.TrimSpace(opts.NegativePrompt) != "" {
		tool["negative_prompt"] = opts.NegativePrompt
	}
	tool["partial_images"] = normalizePartialImages(opts.PartialImages)

	textModel := opts.TextModelID
	if textModel == "" {
		textModel = TextModel
	}
	payload := map[string]any{
		"model": textModel,
		"input": []map[string]any{
			{"role": "user", "content": content},
		},
		"tools":       []map[string]any{tool},
		"tool_choice": map[string]any{"type": "image_generation"},
		"reasoning":   map[string]any{"effort": "xhigh"},
		"store":       false,
		"stream":      true,
	}
	// The first attempt uses the official strict wording; retry paths can switch
	// to the safer wording when upstream returns text instead of a tool result.
	if opts.AllowPromptAdaptation {
		payload["instructions"] = safeImageToolInstructions
	} else {
		payload["instructions"] = noPromptRevisionInstructions
	}

	// Use a non-escaping encoder so 中文 prompts don't get \uXXXX-mangled.
	var buf strings.Builder
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(payload); err != nil {
		return nil, fmt.Errorf("encode payload: %w", err)
	}
	// Encoder appends a trailing '\n'; strip for cleanliness.
	out := strings.TrimRight(buf.String(), "\n")
	return []byte(out), nil
}

func normalizePartialImages(value int) int {
	if value <= 0 {
		return DefaultPartialImages
	}
	if value > 3 {
		return 3
	}
	return value
}

var slugRe = regexp.MustCompile(`-{2,}`)

// Slugify mirrors Python's slugify: keep ASCII word chars and CJK; collapse separators.
func Slugify(text, fallback string) string {
	text = strings.ToLower(strings.TrimSpace(text))

	var b strings.Builder
	for _, r := range text {
		switch {
		case unicode.IsLetter(r), unicode.IsDigit(r), r == '_':
			b.WriteRune(r)
		case r >= 0x4e00 && r <= 0x9fff:
			b.WriteRune(r)
		default:
			b.WriteByte('-')
		}
	}
	s := slugRe.ReplaceAllString(b.String(), "-")
	s = strings.Trim(s, "-")
	if len(s) > 40 {
		// Truncate by rune count, not byte count, to avoid splitting CJK.
		runes := []rune(s)
		if len(runes) > 40 {
			s = string(runes[:40])
		}
	}
	if s == "" {
		if fallback == "" {
			return "image"
		}
		return fallback
	}
	return s
}

// NormalizePath strips surrounding quotes and expands ~ like Python's normalize_path_input.
func NormalizePath(raw string) (string, error) {
	cleaned := strings.TrimSpace(raw)
	cleaned = strings.Trim(cleaned, `"`)
	cleaned = strings.Trim(cleaned, `'`)
	if cleaned == "" {
		return "", fmt.Errorf("image path must not be empty")
	}
	if strings.HasPrefix(cleaned, "~") {
		home, err := os.UserHomeDir()
		if err == nil {
			cleaned = filepath.Join(home, strings.TrimPrefix(cleaned, "~"))
		}
	}
	return cleaned, nil
}

// ImageFileToDataURL reads a local image and returns a base64 data: URL.
func ImageFileToDataURL(path string) (string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("找不到图片文件:%s", path)
	}
	if info.IsDir() {
		return "", fmt.Errorf("路径不是文件:%s", path)
	}
	ext := strings.ToLower(filepath.Ext(path))
	mime, ok := SupportedImageMime[ext]
	if !ok {
		supported := strings.Join([]string{".jpeg", ".jpg", ".png", ".webp"}, ", ")
		extLabel := ext
		if extLabel == "" {
			extLabel = "(无扩展名)"
		}
		return "", fmt.Errorf("不支持的图片格式:%s。支持:%s", extLabel, supported)
	}
	if info.Size() > MaxInputImageBytes {
		return "", fmt.Errorf("图片文件超过 50MB,请换一张更小的图片")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read image: %w", err)
	}
	encoded := base64.StdEncoding.EncodeToString(data)
	return fmt.Sprintf("data:%s;base64,%s", mime, encoded), nil
}

func imageDataURLFromBase64(raw, mime string) string {
	encoded := strings.TrimSpace(raw)
	if encoded == "" {
		return ""
	}
	cleanMime := strings.TrimSpace(mime)
	if cleanMime == "" {
		cleanMime = "image/png"
	}
	return fmt.Sprintf("data:%s;base64,%s", cleanMime, encoded)
}

func normalizeRequestPolicy(policy RequestPolicy) RequestPolicy {
	if policy == RequestPolicyCompat {
		return RequestPolicyCompat
	}
	return RequestPolicyOpenAI
}

func shouldSendExtendedImageParameters(policy RequestPolicy) bool {
	return normalizeRequestPolicy(policy) == RequestPolicyCompat
}

// FormatBytes mirrors Python's format_bytes.
func FormatBytes(size int64) string {
	if size < 1024 {
		return fmt.Sprintf("%d B", size)
	}
	if size < 1024*1024 {
		return fmt.Sprintf("%.1f KB", float64(size)/1024)
	}
	return fmt.Sprintf("%.1f MB", float64(size)/1024/1024)
}
