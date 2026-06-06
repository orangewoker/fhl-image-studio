package main

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"image"
	"image/color"
	imagedraw "image/draw"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/yuanhua/image-gptcodex/internal/fsio"
	"github.com/yuanhua/image-gptcodex/internal/promptui"
	"github.com/yuanhua/image-gptcodex/pkg/client"
)

const (
	defaultBaseURL       = "https://www.fhl.mom"
	defaultAPIMode       = string(client.APIModeResponses)
	defaultRequestPolicy = string(client.RequestPolicyOpenAI)
	defaultTextModel     = "gpt-5.5"
	defaultImageModel    = "gpt-image-2"
	defaultSize          = "1024x1024"
	defaultQuality       = "medium"
	defaultOutputFormat  = "png"
)

type multiFlag []string

func (m *multiFlag) String() string {
	if m == nil {
		return ""
	}
	return strings.Join(*m, ",")
}

func (m *multiFlag) Set(value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	*m = append(*m, value)
	return nil
}

type commandResult struct {
	OK                bool     `json:"ok"`
	Error             string   `json:"error,omitempty"`
	ImagePath         string   `json:"imagePath,omitempty"`
	RawPath           string   `json:"rawPath,omitempty"`
	Mode              string   `json:"mode,omitempty"`
	APIMode           string   `json:"apiMode,omitempty"`
	Size              string   `json:"size,omitempty"`
	Quality           string   `json:"quality,omitempty"`
	OutputFormat      string   `json:"outputFormat,omitempty"`
	SourceEvent       string   `json:"sourceEvent,omitempty"`
	RevisedPrompt     string   `json:"revisedPrompt,omitempty"`
	ElapsedSec        float64  `json:"elapsedSec,omitempty"`
	FallbackMode      string   `json:"fallbackMode,omitempty"`
	FallbackInputPath string   `json:"fallbackInputPath,omitempty"`
	FallbackReason    string   `json:"fallbackReason,omitempty"`
	AttemptSummary    []string `json:"attemptSummary,omitempty"`
}

type cliOptions struct {
	apiKey         string
	mode           client.Mode
	prompt         string
	imagePaths     []string
	size           string
	quality        string
	outputFormat   string
	outDir         string
	rawDir         string
	inputDir       string
	baseURL        string
	apiMode        client.APIMode
	requestPolicy  client.RequestPolicy
	textModelID    string
	imageModelID   string
	negativePrompt string
	seed           int64
	partialImages  int
	maskB64        string
	jsonMode       bool
	jsonlEvents    bool
	interactive    bool
}

func main() {
	jsonHint := hasFlag(os.Args[1:], "json")
	result, err := run(os.Args[1:], jsonHint)
	if jsonHint {
		if result.Error == "" && err != nil {
			result.Error = err.Error()
		}
		_ = json.NewEncoder(os.Stdout).Encode(result)
	}
	if err != nil {
		if !jsonHint {
			fmt.Fprintln(os.Stderr, "error:", err)
		}
		os.Exit(1)
	}
}

func run(args []string, jsonHint bool) (commandResult, error) {
	opts, err := buildOptions(args, jsonHint)
	if err != nil {
		return failResult(opts, err)
	}
	return execute(opts)
}

func buildOptions(args []string, jsonHint bool) (cliOptions, error) {
	var images multiFlag
	var opts cliOptions
	fs := flag.NewFlagSet("gptcodex-image", flag.ContinueOnError)
	if jsonHint {
		fs.SetOutput(io.Discard)
	} else {
		fs.SetOutput(os.Stderr)
	}

	apiKey := fs.String("api-key", "", "API key; env IMAGE_STUDIO_API_KEY or GPTCODEX_API_KEY also accepted")
	mode := fs.String("mode", "", "generate | edit; empty auto-selects edit when --image is provided")
	fs.Var(&images, "image", "source image path; repeat for multiple reference images")
	size := fs.String("size", "", "image size, e.g. 1024x1024, 864x1536, auto")
	quality := fs.String("quality", "", "auto | high | medium | low")
	prompt := fs.String("prompt", "", "prompt text or edit instruction")
	promptFile := fs.String("prompt-file", "", "UTF-8 text file containing the prompt")
	outDir := fs.String("out-dir", "", "image output directory")
	rawDir := fs.String("raw-dir", "", "raw upstream response output directory")
	inputDir := fs.String("input-dir", "", "base directory for relative --image paths")
	baseURL := fs.String("base-url", "", "upstream base URL")
	apiMode := fs.String("api-mode", "", "responses | images")
	requestPolicy := fs.String("request-policy", "", "openai | compat")
	textModel := fs.String("text-model", "", "Responses API text model")
	imageModel := fs.String("image-model", "", "image model")
	outputFormat := fs.String("output-format", "", "png | jpeg | webp")
	negativePrompt := fs.String("negative-prompt", "", "negative prompt; sent only in compat policy")
	seed := fs.Int64("seed", 0, "seed; 0 lets upstream choose")
	partialImages := fs.Int("partial-images", 0, "stream early image previews; 0 uses the upstream default")
	maskPath := fs.String("mask", "", "optional mask image path")
	configPath := fs.String("config", "", "env-style config file; default config/cli.env.local")
	jsonMode := fs.Bool("json", false, "print final result JSON to stdout")
	jsonlEvents := fs.Bool("jsonl-events", false, "print progress JSON lines to stderr")
	noInput := fs.Bool("no-input", false, "fail instead of prompting for missing values")
	interactive := fs.Bool("interactive", false, "enable legacy terminal prompts for missing values")

	if err := fs.Parse(args); err != nil {
		return opts, err
	}
	jsonOutput := jsonHint || *jsonMode
	if *noInput && *interactive {
		return opts, fmt.Errorf("--no-input and --interactive cannot be used together")
	}

	cfg, err := loadConfig(resolveConfigPath(*configPath))
	if err != nil {
		return opts, err
	}

	opts = cliOptions{
		apiKey:         resolveString(*apiKey, []string{"IMAGE_STUDIO_API_KEY", "GPTCODEX_API_KEY"}, cfg, []string{"IMAGE_STUDIO_API_KEY", "GPTCODEX_API_KEY"}, ""),
		prompt:         strings.TrimSpace(*prompt),
		size:           resolveString(*size, []string{"IMAGE_STUDIO_SIZE"}, cfg, []string{"IMAGE_STUDIO_SIZE"}, defaultSize),
		quality:        resolveString(*quality, []string{"IMAGE_STUDIO_QUALITY"}, cfg, []string{"IMAGE_STUDIO_QUALITY"}, defaultQuality),
		outputFormat:   resolveString(*outputFormat, []string{"IMAGE_STUDIO_OUTPUT_FORMAT"}, cfg, []string{"IMAGE_STUDIO_OUTPUT_FORMAT"}, defaultOutputFormat),
		outDir:         resolveString(*outDir, []string{"IMAGE_STUDIO_OUTPUT_DIR"}, cfg, []string{"IMAGE_STUDIO_OUTPUT_DIR"}, defaultOutputDir()),
		inputDir:       resolveString(*inputDir, []string{"IMAGE_STUDIO_INPUT_DIR"}, cfg, []string{"IMAGE_STUDIO_INPUT_DIR"}, defaultInputDir()),
		baseURL:        resolveString(*baseURL, []string{"IMAGE_STUDIO_UPSTREAM_BASE_URL"}, cfg, []string{"IMAGE_STUDIO_UPSTREAM_BASE_URL"}, defaultBaseURL),
		textModelID:    resolveString(*textModel, []string{"IMAGE_STUDIO_TEXT_MODEL"}, cfg, []string{"IMAGE_STUDIO_TEXT_MODEL"}, defaultTextModel),
		imageModelID:   resolveString(*imageModel, []string{"IMAGE_STUDIO_IMAGE_MODEL"}, cfg, []string{"IMAGE_STUDIO_IMAGE_MODEL"}, defaultImageModel),
		negativePrompt: strings.TrimSpace(*negativePrompt),
		seed:           *seed,
		partialImages:  *partialImages,
		jsonMode:       jsonOutput,
		jsonlEvents:    *jsonlEvents,
		interactive:    *interactive,
	}
	opts.rawDir = resolveString(*rawDir, []string{"IMAGE_STUDIO_RAW_DIR"}, cfg, []string{"IMAGE_STUDIO_RAW_DIR"}, filepath.Join(opts.outDir, "log"))
	if opts.negativePrompt == "" {
		opts.negativePrompt = resolveString("", []string{"IMAGE_STUDIO_NEGATIVE_PROMPT"}, cfg, []string{"IMAGE_STUDIO_NEGATIVE_PROMPT"}, "")
	}
	if opts.seed == 0 {
		if rawSeed := resolveString("", []string{"IMAGE_STUDIO_SEED"}, cfg, []string{"IMAGE_STUDIO_SEED"}, ""); rawSeed != "" {
			parsed, err := strconv.ParseInt(rawSeed, 10, 64)
			if err != nil {
				return opts, fmt.Errorf("IMAGE_STUDIO_SEED must be an integer: %w", err)
			}
			opts.seed = parsed
		}
	}
	if opts.partialImages == 0 {
		if rawPartial := resolveString("", []string{"IMAGE_STUDIO_PARTIAL_IMAGES"}, cfg, []string{"IMAGE_STUDIO_PARTIAL_IMAGES"}, ""); rawPartial != "" {
			parsed, err := strconv.Atoi(rawPartial)
			if err != nil {
				return opts, fmt.Errorf("IMAGE_STUDIO_PARTIAL_IMAGES must be an integer: %w", err)
			}
			opts.partialImages = parsed
		}
	}

	apiModeValue := resolveString(*apiMode, []string{"IMAGE_STUDIO_API_MODE"}, cfg, []string{"IMAGE_STUDIO_API_MODE"}, defaultAPIMode)
	opts.apiMode, err = normalizeAPIMode(apiModeValue)
	if err != nil {
		return opts, err
	}
	policyValue := resolveString(*requestPolicy, []string{"IMAGE_STUDIO_REQUEST_POLICY"}, cfg, []string{"IMAGE_STUDIO_REQUEST_POLICY"}, defaultRequestPolicy)
	opts.requestPolicy, err = normalizeRequestPolicy(policyValue)
	if err != nil {
		return opts, err
	}

	if opts.prompt == "" && strings.TrimSpace(*promptFile) != "" {
		b, err := os.ReadFile(strings.TrimSpace(*promptFile))
		if err != nil {
			return opts, fmt.Errorf("read prompt-file: %w", err)
		}
		opts.prompt = strings.TrimSpace(string(b))
	}

	if len(images) > 0 {
		opts.imagePaths, err = resolveImagePaths(images, opts.inputDir)
		if err != nil {
			return opts, err
		}
	}

	if strings.TrimSpace(*maskPath) != "" {
		opts.maskB64, err = readImageBase64(resolveMaybeInputPath(*maskPath, opts.inputDir))
		if err != nil {
			return opts, fmt.Errorf("read mask: %w", err)
		}
	}

	if err := resolveInteractive(&opts, *mode); err != nil {
		return opts, err
	}
	return opts, nil
}

func resolveInteractive(opts *cliOptions, modeFlag string) error {
	p := promptui.NewPrompter()
	if strings.TrimSpace(opts.apiKey) == "" {
		if !opts.interactive {
			return client.ErrEmptyAPIKey
		}
		v, err := p.APIKey()
		if err != nil {
			return err
		}
		opts.apiKey = v
	}

	switch strings.ToLower(strings.TrimSpace(modeFlag)) {
	case "generate":
		if len(opts.imagePaths) > 0 {
			return fmt.Errorf("--mode generate cannot be used with --image")
		}
		opts.mode = client.ModeGenerate
	case "edit":
		opts.mode = client.ModeEdit
	case "":
		if len(opts.imagePaths) > 0 || opts.maskB64 != "" {
			opts.mode = client.ModeEdit
		} else if opts.interactive {
			mode, err := p.Mode()
			if err != nil {
				return err
			}
			opts.mode = mode
		} else {
			opts.mode = client.ModeGenerate
		}
	default:
		return fmt.Errorf("--mode must be generate or edit")
	}

	if opts.mode == client.ModeEdit && len(opts.imagePaths) == 0 {
		if !opts.interactive {
			return fmt.Errorf("edit mode requires at least one --image")
		}
		source, err := p.ImagePath()
		if err != nil {
			return err
		}
		opts.imagePaths = []string{resolveMaybeInputPath(source, opts.inputDir)}
	}
	if strings.TrimSpace(opts.prompt) == "" {
		if !opts.interactive {
			return client.ErrEmptyPrompt
		}
		v, err := p.PromptText(opts.mode)
		if err != nil {
			return err
		}
		opts.prompt = v
	}
	return nil
}

func execute(opts cliOptions) (commandResult, error) {
	if err := fsio.EnsureDir(opts.outDir); err != nil {
		return failResult(opts, err)
	}
	if err := fsio.EnsureDir(opts.rawDir); err != nil {
		return failResult(opts, err)
	}

	transport, err := client.PickTransport()
	if err != nil {
		return failResult(opts, err)
	}

	clientOpts := client.Options{
		APIKey:           strings.TrimSpace(opts.apiKey),
		Prompt:           strings.TrimSpace(opts.prompt),
		Mode:             opts.mode,
		Size:             opts.size,
		Quality:          opts.quality,
		OutputFormat:     opts.outputFormat,
		ImagePaths:       opts.imagePaths,
		APIMode:          opts.apiMode,
		RequestPolicy:    opts.requestPolicy,
		MaskB64:          opts.maskB64,
		Seed:             opts.seed,
		NegativePrompt:   opts.negativePrompt,
		BaseURL:          opts.baseURL,
		TextModelID:      opts.textModelID,
		ImageModelID:     opts.imageModelID,
		NoPromptRevision: true,
		PartialImages:    opts.partialImages,
	}
	if opts.apiMode == client.APIModeResponses && opts.mode == client.ModeEdit {
		for _, p := range opts.imagePaths {
			dataURL, err := client.ImageFileToDataURL(p)
			if err != nil {
				return failResult(opts, err)
			}
			clientOpts.ImageDataURLs = append(clientOpts.ImageDataURLs, dataURL)
		}
	}

	startedAt := time.Now()
	timestamp := timestampWithMillis(startedAt)
	log := logger(opts)
	progress := func(stage string, elapsed int, bytes int64) {
		if opts.jsonlEvents {
			emitEvent("progress", map[string]any{
				"stage":      stage,
				"elapsedSec": elapsed,
				"bytes":      bytes,
			})
			return
		}
		fmt.Fprintf(log, "waiting %ds, stage=%s, received=%s\n", elapsed, stage, client.FormatBytes(bytes))
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	if !opts.jsonMode {
		fmt.Fprintln(log, "FHL Image Studio CLI")
		fmt.Fprintf(log, "requesting %s, size %s, quality %s...\n", modeActionLabel(opts.mode), opts.size, opts.quality)
	}

	result, rawPath, err := client.RequestAndExtractWithRetries(ctx, transport, clientOpts, opts.rawDir, timestamp, func(msg string) {
		if opts.jsonlEvents {
			emitEvent("log", map[string]any{"message": msg})
			return
		}
		fmt.Fprintln(log, msg)
	}, progress)
	if rawPath != "" {
		rawPath, _ = filepath.Abs(rawPath)
	}
	actualAPIMode := opts.apiMode
	attemptSummary := []string{fmt.Sprintf("%s:%s", opts.mode, opts.apiMode)}
	fallbackMode := ""
	fallbackInputPath := ""
	fallbackReason := ""
	if err != nil && shouldFallbackResponsesToImages(opts, err, rawPath) {
		attemptSummary = append(attemptSummary, "responses_to_images")
		if !opts.jsonMode {
			fmt.Fprintln(log, "Responses returned text-only/no image tool; retrying once with Images API...")
		} else if opts.jsonlEvents {
			emitEvent("log", map[string]any{"message": "Responses returned text-only/no image tool; retrying once with Images API"})
		}
		fallbackOpts := clientOpts
		fallbackOpts.APIMode = client.APIModeImages
		fallbackTimestamp := timestamp + "-images-fallback"
		result, rawPath, err = client.RequestAndExtractWithRetries(ctx, transport, fallbackOpts, opts.rawDir, fallbackTimestamp, func(msg string) {
			if opts.jsonlEvents {
				emitEvent("log", map[string]any{"message": msg})
				return
			}
			fmt.Fprintln(log, msg)
		}, progress)
		if rawPath != "" {
			rawPath, _ = filepath.Abs(rawPath)
		}
		if err == nil {
			actualAPIMode = client.APIModeImages
		}
	}
	if err != nil && shouldFallbackEditToContactSheet(opts, err, rawPath) {
		fallbackMode = "contact_sheet"
		fallbackReason = fallbackReasonForEditFailure(err, rawPath)
		attemptSummary = append(attemptSummary, "contact_sheet_fallback")
		if opts.jsonlEvents {
			emitEvent("log", map[string]any{"message": "多参考图直传失败,正在生成兼容参考图并重试"})
		} else {
			fmt.Fprintln(log, "多参考图直传失败,正在生成兼容参考图并重试...")
		}
		sheetPath, sheetErr := createContactSheetFallback(opts.imagePaths, opts.rawDir, timestamp)
		if sheetErr == nil {
			fallbackInputPath = sheetPath
			fallbackOpts := clientOpts
			fallbackOpts.APIMode = client.APIModeImages
			fallbackOpts.ImagePaths = []string{sheetPath}
			fallbackOpts.ImageDataURLs = nil
			fallbackOpts.Prompt = contactSheetFallbackPrompt(clientOpts.Prompt, len(opts.imagePaths))
			fallbackTimestamp := timestamp + "-contact-sheet-fallback"
			result, rawPath, err = client.RequestAndExtractWithRetries(ctx, transport, fallbackOpts, opts.rawDir, fallbackTimestamp, func(msg string) {
				if opts.jsonlEvents {
					emitEvent("log", map[string]any{"message": msg})
					return
				}
				fmt.Fprintln(log, msg)
			}, progress)
			if rawPath != "" {
				rawPath, _ = filepath.Abs(rawPath)
			}
			if err == nil {
				actualAPIMode = client.APIModeImages
			}
		} else {
			err = fmt.Errorf("%w; contact sheet fallback failed: %v", err, sheetErr)
		}
	}
	if err != nil {
		out := baseResult(opts)
		out.RawPath = rawPath
		out.Error = err.Error()
		out.FallbackMode = fallbackMode
		out.FallbackInputPath = fallbackInputPath
		out.FallbackReason = fallbackReason
		out.AttemptSummary = attemptSummary
		return out, err
	}

	imageName := fsio.BuildImageName(opts.mode, opts.prompt, timestamp, opts.outputFormat)
	imageDir := imageOutputDirForSourceEvent(opts.outDir, result.SourceEvent)
	if err := fsio.EnsureDir(imageDir); err != nil {
		out := baseResult(opts)
		out.RawPath = rawPath
		out.Error = err.Error()
		out.FallbackMode = fallbackMode
		out.FallbackInputPath = fallbackInputPath
		out.FallbackReason = fallbackReason
		out.AttemptSummary = attemptSummary
		return out, err
	}
	imagePath, err := fsio.SaveImage(result.ImageB64, filepath.Join(imageDir, imageName))
	if err != nil {
		out := baseResult(opts)
		out.RawPath = rawPath
		out.Error = err.Error()
		out.FallbackMode = fallbackMode
		out.FallbackInputPath = fallbackInputPath
		out.FallbackReason = fallbackReason
		out.AttemptSummary = attemptSummary
		return out, err
	}

	out := baseResult(opts)
	out.OK = true
	out.APIMode = string(actualAPIMode)
	out.ImagePath = imagePath
	out.RawPath = rawPath
	out.SourceEvent = result.SourceEvent
	out.RevisedPrompt = result.RevisedPrompt
	out.ElapsedSec = roundElapsed(time.Since(startedAt).Seconds())
	out.FallbackMode = fallbackMode
	out.FallbackInputPath = fallbackInputPath
	out.FallbackReason = fallbackReason
	out.AttemptSummary = attemptSummary
	if !opts.jsonMode {
		fmt.Fprintf(log, "image saved: %s\n", imagePath)
		fmt.Fprintf(log, "raw response saved: %s\n", rawPath)
		if result.RevisedPrompt != "" {
			fmt.Fprintf(log, "revised prompt: %s\n", result.RevisedPrompt)
		}
	}
	return out, nil
}

func shouldFallbackResponsesToImages(opts cliOptions, err error, rawPath string) bool {
	if opts.apiMode != client.APIModeResponses || err == nil {
		return false
	}
	if opts.mode != client.ModeGenerate && opts.mode != client.ModeEdit {
		return false
	}
	if !strings.Contains(err.Error(), "image_generation_call.result") {
		return false
	}
	rawBytes, readErr := os.ReadFile(rawPath)
	if readErr != nil {
		return false
	}
	raw := string(rawBytes)
	if strings.Contains(raw, `"type":"image_generation_call"`) ||
		strings.Contains(raw, `"partial_image_b64"`) ||
		strings.Contains(raw, `"tools":[{"type":"image_generation"`) {
		return false
	}
	return strings.Contains(raw, `<image_generation`) ||
		strings.Contains(raw, `"tools":[]`) ||
		strings.Contains(raw, `"tool_choice":"auto"`)
}

func shouldFallbackEditToContactSheet(opts cliOptions, err error, rawPath string) bool {
	if err == nil || opts.mode != client.ModeEdit || len(opts.imagePaths) < 2 {
		return false
	}
	rawBytes, _ := os.ReadFile(rawPath)
	raw := string(rawBytes)
	lowerRaw := strings.ToLower(raw)
	lowerErr := strings.ToLower(err.Error())
	if strings.Contains(lowerRaw, "content_policy") ||
		strings.Contains(lowerRaw, "moderation") ||
		strings.Contains(lowerRaw, "invalid_api_key") ||
		strings.Contains(lowerRaw, "incorrect_api_key") ||
		strings.Contains(lowerRaw, "insufficient_quota") ||
		strings.Contains(lowerRaw, "billing_hard_limit") ||
		strings.Contains(lowerRaw, "model_not_found") {
		return false
	}
	if client.IsRetryable(raw) {
		return true
	}
	for _, marker := range []string{
		"image_generation_call.result",
		"no image",
		"503",
		"502",
		"504",
		"524",
		"upstream_error",
		"no available account",
		"temporarily unavailable",
		"multipart",
		"image[]",
		"too many images",
		"unsupported image",
	} {
		if strings.Contains(lowerErr, marker) || strings.Contains(lowerRaw, marker) {
			return true
		}
	}
	for _, marker := range []string{"无可用账号", "请稍后重试", "稍后重试", "上游返回"} {
		if strings.Contains(err.Error(), marker) || strings.Contains(raw, marker) {
			return true
		}
	}
	return false
}

func fallbackReasonForEditFailure(err error, rawPath string) string {
	rawBytes, _ := os.ReadFile(rawPath)
	raw := string(rawBytes)
	lower := strings.ToLower(err.Error() + "\n" + raw)
	if strings.Contains(err.Error(), "无可用账号") ||
		strings.Contains(raw, "无可用账号") ||
		strings.Contains(err.Error(), "请稍后重试") ||
		strings.Contains(raw, "请稍后重试") ||
		strings.Contains(lower, "no available account") ||
		strings.Contains(lower, "503") {
		return "upstream_busy"
	}
	if strings.Contains(lower, "multipart") ||
		strings.Contains(lower, "image[]") ||
		strings.Contains(lower, "too many images") ||
		strings.Contains(lower, "unsupported image") {
		return "multi_image_compatibility"
	}
	if strings.Contains(lower, "image_generation_call.result") || strings.Contains(lower, "no image") {
		return "no_final_image"
	}
	return "retryable_edit_failure"
}

func contactSheetFallbackPrompt(prompt string, sourceCount int) string {
	return strings.TrimSpace(prompt) + fmt.Sprintf(
		"\n\n多参考图兼容模式说明:输入图是一张参考合成图,左侧大图是第 1 张主图,右侧从上到下/从左到右是第 2 到第 %d 张参考图。请以左侧主图为被修改对象,只吸收右侧参考图的人物、风格、场景或材质信息,不要输出拼图、边框、分栏或参考图版式。",
		sourceCount,
	)
}

func createContactSheetFallback(paths []string, rawDir string, timestamp string) (string, error) {
	if len(paths) < 2 {
		return "", errors.New("contact sheet fallback needs at least two images")
	}
	decoded := make([]image.Image, 0, len(paths))
	for _, p := range paths {
		img, err := decodeInputImage(p)
		if err != nil {
			return "", fmt.Errorf("decode %s: %w", filepath.Base(p), err)
		}
		decoded = append(decoded, img)
	}

	const (
		sheetSize = 1536
		margin    = 28
		gap       = 18
		mainWidth = 1020
		jpegQ     = 88
	)
	canvas := image.NewRGBA(image.Rect(0, 0, sheetSize, sheetSize))
	imagedraw.Draw(canvas, canvas.Bounds(), image.NewUniform(color.RGBA{R: 246, G: 246, B: 246, A: 255}), image.Point{}, imagedraw.Src)

	mainRect := image.Rect(margin, margin, margin+mainWidth, sheetSize-margin)
	drawCell(canvas, mainRect)
	drawImageFit(canvas, decoded[0], insetRect(mainRect, 10))

	refs := decoded[1:]
	refX := mainRect.Max.X + gap
	refW := sheetSize - margin - refX
	cols := 1
	if len(refs) > 3 {
		cols = 2
	}
	rows := (len(refs) + cols - 1) / cols
	if rows < 1 {
		rows = 1
	}
	cellW := (refW - gap*(cols-1)) / cols
	cellH := (sheetSize - margin*2 - gap*(rows-1)) / rows
	for i, ref := range refs {
		col := i % cols
		row := i / cols
		x := refX + col*(cellW+gap)
		y := margin + row*(cellH+gap)
		rect := image.Rect(x, y, x+cellW, y+cellH)
		drawCell(canvas, rect)
		drawImageFit(canvas, ref, insetRect(rect, 8))
	}

	outDir := filepath.Join(rawDir, "fallback-inputs")
	if err := fsio.EnsureDir(outDir); err != nil {
		return "", err
	}
	outPath := filepath.Join(outDir, fmt.Sprintf("contact-sheet-%s.jpg", timestamp))
	f, err := os.OpenFile(outPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return "", err
	}
	defer f.Close()
	if err := jpeg.Encode(f, canvas, &jpeg.Options{Quality: jpegQ}); err != nil {
		return "", err
	}
	return filepath.Abs(outPath)
}

func decodeInputImage(path string) (image.Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	img, _, err := image.Decode(f)
	return img, err
}

func insetRect(rect image.Rectangle, inset int) image.Rectangle {
	return image.Rect(rect.Min.X+inset, rect.Min.Y+inset, rect.Max.X-inset, rect.Max.Y-inset)
}

func drawCell(dst *image.RGBA, rect image.Rectangle) {
	imagedraw.Draw(dst, rect, image.NewUniform(color.RGBA{R: 255, G: 255, B: 255, A: 255}), image.Point{}, imagedraw.Src)
	border := color.RGBA{R: 218, G: 218, B: 218, A: 255}
	imagedraw.Draw(dst, image.Rect(rect.Min.X, rect.Min.Y, rect.Max.X, rect.Min.Y+2), image.NewUniform(border), image.Point{}, imagedraw.Src)
	imagedraw.Draw(dst, image.Rect(rect.Min.X, rect.Max.Y-2, rect.Max.X, rect.Max.Y), image.NewUniform(border), image.Point{}, imagedraw.Src)
	imagedraw.Draw(dst, image.Rect(rect.Min.X, rect.Min.Y, rect.Min.X+2, rect.Max.Y), image.NewUniform(border), image.Point{}, imagedraw.Src)
	imagedraw.Draw(dst, image.Rect(rect.Max.X-2, rect.Min.Y, rect.Max.X, rect.Max.Y), image.NewUniform(border), image.Point{}, imagedraw.Src)
}

func drawImageFit(dst *image.RGBA, src image.Image, rect image.Rectangle) {
	srcBounds := src.Bounds()
	sw := srcBounds.Dx()
	sh := srcBounds.Dy()
	if sw <= 0 || sh <= 0 || rect.Dx() <= 0 || rect.Dy() <= 0 {
		return
	}
	scaleW := float64(rect.Dx()) / float64(sw)
	scaleH := float64(rect.Dy()) / float64(sh)
	scale := scaleW
	if scaleH < scale {
		scale = scaleH
	}
	dw := int(float64(sw)*scale + 0.5)
	dh := int(float64(sh)*scale + 0.5)
	if dw < 1 {
		dw = 1
	}
	if dh < 1 {
		dh = 1
	}
	x := rect.Min.X + (rect.Dx()-dw)/2
	y := rect.Min.Y + (rect.Dy()-dh)/2
	for yy := 0; yy < dh; yy++ {
		sy := srcBounds.Min.Y + yy*sh/dh
		for xx := 0; xx < dw; xx++ {
			sx := srcBounds.Min.X + xx*sw/dw
			dst.Set(x+xx, y+yy, src.At(sx, sy))
		}
	}
}

func failResult(opts cliOptions, err error) (commandResult, error) {
	out := baseResult(opts)
	if err != nil {
		out.Error = err.Error()
	}
	return out, err
}

func baseResult(opts cliOptions) commandResult {
	return commandResult{
		OK:           false,
		Mode:         string(opts.mode),
		APIMode:      string(opts.apiMode),
		Size:         opts.size,
		Quality:      opts.quality,
		OutputFormat: opts.outputFormat,
	}
}

func logger(opts cliOptions) io.Writer {
	if opts.jsonMode {
		return os.Stderr
	}
	return os.Stdout
}

func emitEvent(kind string, payload map[string]any) {
	payload["type"] = kind
	_ = json.NewEncoder(os.Stderr).Encode(payload)
}

func modeActionLabel(mode client.Mode) string {
	if mode == client.ModeEdit {
		return "edit"
	}
	return "generate"
}

func resolveString(flagValue string, envNames []string, cfg map[string]string, cfgNames []string, fallback string) string {
	if strings.TrimSpace(flagValue) != "" {
		return strings.TrimSpace(flagValue)
	}
	for _, name := range envNames {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	for _, name := range cfgNames {
		if value := strings.TrimSpace(cfg[name]); value != "" {
			return value
		}
	}
	return fallback
}

func resolveConfigPath(flagValue string) string {
	if strings.TrimSpace(flagValue) != "" {
		return strings.TrimSpace(flagValue)
	}
	if env := strings.TrimSpace(os.Getenv("IMAGE_STUDIO_CONFIG")); env != "" {
		return env
	}
	candidate := filepath.Join("config", "cli.env.local")
	if _, err := os.Stat(candidate); err == nil {
		return candidate
	}
	return ""
}

func loadConfig(path string) (map[string]string, error) {
	out := map[string]string{}
	if strings.TrimSpace(path) == "" {
		return out, nil
	}
	f, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return out, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(strings.TrimPrefix(scanner.Text(), "\ufeff"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		idx := strings.Index(line, "=")
		if idx <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		value := strings.TrimSpace(line[idx+1:])
		value = strings.Trim(value, `"`)
		value = strings.Trim(value, `'`)
		out[key] = value
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	return out, nil
}

func normalizeAPIMode(value string) (client.APIMode, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", string(client.APIModeResponses):
		return client.APIModeResponses, nil
	case string(client.APIModeImages):
		return client.APIModeImages, nil
	default:
		return "", fmt.Errorf("--api-mode must be responses or images")
	}
}

func normalizeRequestPolicy(value string) (client.RequestPolicy, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", string(client.RequestPolicyOpenAI):
		return client.RequestPolicyOpenAI, nil
	case string(client.RequestPolicyCompat):
		return client.RequestPolicyCompat, nil
	default:
		return "", fmt.Errorf("--request-policy must be openai or compat")
	}
}

func resolveImagePaths(values []string, inputDir string) ([]string, error) {
	paths := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		path := resolveMaybeInputPath(value, inputDir)
		if seen[path] {
			continue
		}
		seen[path] = true
		paths = append(paths, path)
	}
	return paths, nil
}

func resolveMaybeInputPath(raw string, inputDir string) string {
	cleaned, err := client.NormalizePath(raw)
	if err != nil {
		return strings.TrimSpace(raw)
	}
	if filepath.IsAbs(cleaned) {
		return cleaned
	}
	if _, err := os.Stat(cleaned); err == nil {
		return cleaned
	}
	if strings.TrimSpace(inputDir) != "" {
		candidate := filepath.Join(inputDir, cleaned)
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return cleaned
}

func readImageBase64(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

func defaultOutputDir() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "output"
	}
	return filepath.Join(cwd, "output")
}

func imageOutputDirForSourceEvent(outDir, sourceEvent string) string {
	if !isIntermediateSourceEvent(sourceEvent) {
		return outDir
	}
	parent := filepath.Dir(filepath.Clean(outDir))
	if parent == "." || parent == "" {
		return "intermediate"
	}
	return filepath.Join(parent, "intermediate")
}

func isIntermediateSourceEvent(sourceEvent string) bool {
	return strings.Contains(strings.ToLower(strings.TrimSpace(sourceEvent)), "partial")
}

func defaultInputDir() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "input"
	}
	return filepath.Join(cwd, "input")
}

func timestampWithMillis(t time.Time) string {
	return t.Format("20060102-150405") + fmt.Sprintf("-%03d", t.Nanosecond()/int(time.Millisecond))
}

func roundElapsed(v float64) float64 {
	return float64(int(v*10+0.5)) / 10
}

func hasFlag(args []string, name string) bool {
	prefix := "--" + name
	for _, arg := range args {
		if arg == prefix || strings.HasPrefix(arg, prefix+"=") {
			return true
		}
	}
	return false
}
