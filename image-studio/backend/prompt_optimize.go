package backend

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/yuanhua/image-gptcodex/pkg/client"
)

type responseText struct {
	Output []struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"output"`
	OutputText string `json:"output_text"`
	Error      *struct {
		Message string `json:"message"`
	} `json:"error"`
	Message string `json:"message"`
}

const promptOptimizeBaseInstructions = "Rewrite the user's image prompt into a clearer, more detailed prompt for image generation. Keep the meaning, preserve the requested subject, and only return the improved prompt text. Do not add explanations, labels, markdown, or quotes."
const promptOptimizeRequiredModificationInstructions = " Apply the required modification direction before polishing the prompt. Treat it as a mandatory edit, not a style preference. Add, remove, replace, or reshape subjects, actions, positions, and relationships when requested. For added subjects or story elements, turn the relationship into concrete visual action instead of merely listing the new element. If it conflicts with the original prompt, the required modification direction wins. Preserve the original scene, style, lighting, composition, and intent wherever they do not conflict. Integrate the change into one coherent image prompt, and do not mention that a modification was requested."
const promptReverseInstructions = "Analyze the attached image and write a detailed Simplified Chinese text-to-image prompt that could recreate its visible subject, composition, style, lighting, colors, camera perspective, mood, and important visual details. The returned prompt must be in Simplified Chinese. Return only the prompt text. Do not mention that you are analyzing an image. Do not add explanations, labels, markdown, or quotes."
const promptReverseUserText = "Write a Simplified Chinese text-to-image prompt for the attached image."

// prepareUploadSourcePaths flattens transparent PNG sources onto white
// backgrounds before upload so the upstream model sees the actual content.
// It returns the possibly rewritten paths plus a cleanup function for any temp
// files that were created.
func prepareUploadSourcePaths(paths []string) ([]string, func(), error) {
	out := make([]string, 0, len(paths))
	tmpFiles := make([]string, 0, len(paths))
	cleanup := func() {
		for _, p := range tmpFiles {
			_ = os.Remove(p)
		}
	}

	for _, rawPath := range paths {
		path := strings.TrimSpace(rawPath)
		if path == "" {
			continue
		}
		rewrite, tmp, err := flattenTransparentImage(path)
		if err != nil {
			cleanup()
			return nil, nil, err
		}
		if tmp != "" {
			tmpFiles = append(tmpFiles, tmp)
		}
		out = append(out, rewrite)
	}

	return out, cleanup, nil
}

func flattenTransparentImage(path string) (string, string, error) {
	ext := strings.ToLower(filepath.Ext(path))
	if ext != ".png" {
		return path, "", nil
	}

	f, err := os.Open(path)
	if err != nil {
		return "", "", err
	}
	defer f.Close()

	src, _, err := image.Decode(f)
	if err != nil {
		return path, "", nil
	}
	if !imageHasTransparency(src) {
		return path, "", nil
	}

	// PNG references with transparency tend to be the problematic case in
	// issue #3, so always flatten them before upload.
	bounds := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	draw.Draw(dst, dst.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
	draw.Draw(dst, dst.Bounds(), src, bounds.Min, draw.Over)

	tmp, err := os.CreateTemp("", "image-studio-flat-*.png")
	if err != nil {
		return "", "", err
	}
	if err := png.Encode(tmp, dst); err != nil {
		tmp.Close()
		_ = os.Remove(tmp.Name())
		return "", "", err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmp.Name())
		return "", "", err
	}
	return tmp.Name(), tmp.Name(), nil
}

func imageHasTransparency(src image.Image) bool {
	b := src.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			_, _, _, a := src.At(x, y).RGBA()
			if a != 0xffff {
				return true
			}
		}
	}
	return false
}

func optimizePromptWithLLM(
	ctx context.Context,
	baseURL, apiKey, textModelID, mode, prompt, optimizationGuidance string,
	sourcePaths []string,
	proxyConfig client.ProxyConfig,
) (string, error) {
	if strings.TrimSpace(prompt) == "" {
		return "", errors.New("提示词不能为空")
	}
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		return "", errors.New("未配置上游 BASE_URL")
	}
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return "", errors.New("API Key 不能为空")
	}
	textModelID = strings.TrimSpace(textModelID)
	if textModelID == "" {
		textModelID = client.TextModel
	}

	instruction := promptOptimizeBaseInstructions
	guidance := strings.TrimSpace(optimizationGuidance)
	if guidance != "" {
		instruction += promptOptimizeRequiredModificationInstructions
	}
	if strings.TrimSpace(mode) == "edit" {
		instruction += " Treat any attached images as reference context and preserve edit intent."
	}

	text := fmt.Sprintf("Original prompt:\n%s", strings.TrimSpace(prompt))
	if guidance != "" {
		text = fmt.Sprintf("%s\n\nRequired modification direction:\n%s", text, guidance)
	}
	content := []map[string]any{
		{
			"type": "input_text",
			"text": text,
		},
	}
	for _, p := range sourcePaths {
		dataURL, err := client.ImageFileToDataURL(p)
		if err != nil {
			return "", err
		}
		content = append(content, map[string]any{
			"type":      "input_image",
			"image_url": dataURL,
		})
	}

	payload := map[string]any{
		"model":        textModelID,
		"instructions": instruction,
		"input": []map[string]any{
			{
				"role":    "user",
				"content": content,
			},
		},
		"reasoning": map[string]any{"effort": "low"},
		"store":     false,
		"stream":    true,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal prompt optimization payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(baseURL, "/")+"/v1/responses", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("User-Agent", client.UserAgent())

	transport, err := client.NewHTTPTransport(proxyConfig)
	if err != nil {
		return "", err
	}
	httpClient := &http.Client{Timeout: 3 * time.Minute, Transport: transport}
	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode/100 != 2 {
		if msg := extractResponseErrorMessage(raw); msg != "" {
			return "", fmt.Errorf("上游返回 %d:%s", resp.StatusCode, msg)
		}
		return "", fmt.Errorf("上游返回 HTTP %d", resp.StatusCode)
	}

	optimized := strings.TrimSpace(extractResponseText(raw))
	if optimized == "" {
		return "", errors.New("上游没有返回可用的优化结果")
	}
	return optimized, nil
}

func reversePromptWithLLM(
	ctx context.Context,
	baseURL, apiKey, textModelID string,
	sourcePaths []string,
	proxyConfig client.ProxyConfig,
) (string, error) {
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		return "", errors.New("未配置上游 BASE_URL")
	}
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return "", errors.New("API Key 不能为空")
	}
	textModelID = strings.TrimSpace(textModelID)
	if textModelID == "" {
		textModelID = client.TextModel
	}
	if len(sourcePaths) == 0 {
		return "", errors.New("先选择或生成一张图片")
	}

	content := []map[string]any{
		{
			"type": "input_text",
			"text": promptReverseUserText,
		},
	}
	for _, p := range sourcePaths {
		dataURL, err := client.ImageFileToDataURL(p)
		if err != nil {
			return "", err
		}
		content = append(content, map[string]any{
			"type":      "input_image",
			"image_url": dataURL,
		})
	}

	payload := map[string]any{
		"model":        textModelID,
		"instructions": promptReverseInstructions,
		"input": []map[string]any{
			{
				"role":    "user",
				"content": content,
			},
		},
		"reasoning": map[string]any{"effort": "low"},
		"store":     false,
		"stream":    true,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal reverse prompt payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(baseURL, "/")+"/v1/responses", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream, application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("User-Agent", client.UserAgent())

	transport, err := client.NewHTTPTransport(proxyConfig)
	if err != nil {
		return "", err
	}
	httpClient := &http.Client{Timeout: 3 * time.Minute, Transport: transport}
	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode/100 != 2 {
		if msg := extractResponseErrorMessage(raw); msg != "" {
			return "", fmt.Errorf("上游返回 %d:%s", resp.StatusCode, msg)
		}
		return "", fmt.Errorf("上游返回 HTTP %d", resp.StatusCode)
	}

	prompt := strings.TrimSpace(extractResponseText(raw))
	if prompt == "" {
		if msg := extractResponseErrorMessage(raw); msg != "" {
			return "", fmt.Errorf("上游没有返回可用的反推提示词:%s", msg)
		}
		return "", errors.New("上游没有返回可用的反推提示词")
	}
	return prompt, nil
}

func extractResponseText(raw []byte) string {
	var parsed any
	if err := json.Unmarshal(raw, &parsed); err == nil {
		if text := extractResponseTextValue(parsed); text != "" {
			return text
		}
	}

	var deltas strings.Builder
	for _, rawLine := range strings.Split(string(raw), "\n") {
		line := strings.TrimSpace(rawLine)
		if strings.HasPrefix(line, "data:") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		}
		if line == "" || line == "[DONE]" || !strings.HasPrefix(line, "{") {
			continue
		}
		var event any
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			continue
		}
		if text := extractResponseTextValue(event); text != "" {
			return text
		}
		if delta := extractResponseTextDelta(event); delta != "" {
			deltas.WriteString(delta)
		}
	}

	return strings.TrimSpace(deltas.String())
}

func promptTextCandidate(value any) string {
	return promptTextCandidateDepth(value, 0)
}

func promptTextCandidateDepth(value any, depth int) string {
	if depth > 2 {
		return ""
	}
	if s, ok := value.(string); ok {
		return strings.TrimSpace(s)
	}
	if list, ok := value.([]any); ok {
		for _, child := range list {
			if text := promptTextCandidateDepth(child, depth+1); text != "" {
				return text
			}
		}
		return ""
	}
	m, ok := value.(map[string]any)
	if !ok {
		return ""
	}
	for _, key := range []string{"value", "text", "content", "parts"} {
		if text := promptTextCandidateDepth(m[key], depth+1); text != "" {
			return text
		}
	}
	return ""
}

func extractResponseTextValue(value any) string {
	switch v := value.(type) {
	case []any:
		for _, child := range v {
			if text := extractResponseTextValue(child); text != "" {
				return text
			}
		}
		return ""
	case map[string]any:
		return extractResponseTextMap(v)
	default:
		return ""
	}
}

func extractResponseTextMap(m map[string]any) string {
	if text := promptTextCandidate(m["output_text"]); text != "" {
		return text
	}

	typeValue, _ := m["type"].(string)
	genericText := promptTextCandidate(m["text"])
	if genericText == "" {
		genericText = promptTextCandidate(m["value"])
	}
	if genericText != "" {
		return genericText
	}

	if typeValue == "output_text" || typeValue == "text" || typeValue == "refusal" {
		if text := promptTextCandidate(m["text"]); text != "" {
			return text
		}
		if text := promptTextCandidate(m["content"]); text != "" {
			return text
		}
		if text := promptTextCandidate(m["value"]); text != "" {
			return text
		}
		if text := promptTextCandidate(m["refusal"]); text != "" {
			return text
		}
	}

	if response, ok := m["response"]; ok {
		if text := extractResponseTextValue(response); text != "" {
			return text
		}
	}
	if item, ok := m["item"]; ok {
		if text := extractResponseTextValue(item); text != "" {
			return text
		}
	}
	if message, ok := m["message"]; ok {
		if text := extractResponseTextValue(message); text != "" {
			return text
		}
		if text := promptTextCandidate(message); text != "" {
			return text
		}
	}

	for _, key := range []string{"output", "outputs", "messages", "data", "items", "parts", "summary", "candidates"} {
		child, ok := m[key]
		if !ok {
			continue
		}
		if text := extractResponseTextValue(child); text != "" {
			return text
		}
	}

	if content, ok := m["content"]; ok {
		if text := extractResponseTextValue(content); text != "" {
			return text
		}
		if role, _ := m["role"].(string); (role == "assistant" || typeValue == "message") && promptTextCandidate(content) != "" {
			return promptTextCandidate(content)
		}
	}

	if choices, ok := m["choices"].([]any); ok {
		for _, choiceValue := range choices {
			choice, ok := choiceValue.(map[string]any)
			if !ok {
				continue
			}
			if text := extractResponseTextValue(choice["message"]); text != "" {
				return text
			}
			if text := extractResponseTextValue(choice["delta"]); text != "" {
				return text
			}
			if text := promptTextCandidate(choice["text"]); text != "" {
				return text
			}
		}
	}

	return ""
}

func extractResponseTextDelta(value any) string {
	m, ok := value.(map[string]any)
	if !ok {
		return ""
	}
	typeValue, _ := m["type"].(string)
	if typeValue == "response.output_text.delta" || typeValue == "output_text.delta" {
		if delta, ok := m["delta"].(string); ok {
			return delta
		}
	}
	if choices, ok := m["choices"].([]any); ok {
		var b strings.Builder
		for _, choiceValue := range choices {
			choice, ok := choiceValue.(map[string]any)
			if !ok {
				continue
			}
			if delta, ok := choice["delta"].(map[string]any); ok {
				if content, ok := delta["content"].(string); ok {
					b.WriteString(content)
				}
			}
			if text, ok := choice["text"].(string); ok {
				b.WriteString(text)
			}
		}
		return b.String()
	}
	return ""
}

func extractResponseErrorMessage(raw []byte) string {
	var parsed responseText
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return strings.TrimSpace(string(raw))
	}
	if parsed.Error != nil && strings.TrimSpace(parsed.Error.Message) != "" {
		return parsed.Error.Message
	}
	if msg := strings.TrimSpace(parsed.Message); msg != "" {
		return msg
	}
	if s := strings.TrimSpace(string(raw)); s != "" {
		return s
	}
	return ""
}
