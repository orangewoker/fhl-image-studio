package main

import (
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yuanhua/image-gptcodex/pkg/client"
)

func TestCreateContactSheetFallback(t *testing.T) {
	dir := t.TempDir()
	a := filepath.Join(dir, "main.png")
	b := filepath.Join(dir, "ref.png")
	writeTestPNG(t, a, color.RGBA{R: 255, A: 255})
	writeTestPNG(t, b, color.RGBA{B: 255, A: 255})

	out, err := createContactSheetFallback([]string{a, b}, dir, "20260602-200000")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, filepath.Join("fallback-inputs", "contact-sheet-20260602-200000.jpg")) {
		t.Fatalf("unexpected fallback path: %s", out)
	}
	f, err := os.Open(out)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	img, err := jpeg.Decode(f)
	if err != nil {
		t.Fatal(err)
	}
	if img.Bounds().Dx() != 1536 || img.Bounds().Dy() != 1536 {
		t.Fatalf("contact sheet size = %dx%d, want 1536x1536", img.Bounds().Dx(), img.Bounds().Dy())
	}
}

func TestShouldFallbackEditToContactSheetForFHLBusy(t *testing.T) {
	dir := t.TempDir()
	raw := filepath.Join(dir, "raw.json")
	if err := os.WriteFile(raw, []byte(`{"error":{"message":"无可用账号，请稍后重试","type":"upstream_error"}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	opts := cliOptions{
		mode:       client.ModeEdit,
		apiMode:    client.APIModeImages,
		imagePaths: []string{"a.png", "b.png"},
	}
	err := errors.New("上游返回 503:无可用账号，请稍后重试")
	if !shouldFallbackEditToContactSheet(opts, err, raw) {
		t.Fatal("expected contact sheet fallback")
	}
}

func TestImageOutputDirForSourceEvent(t *testing.T) {
	root := t.TempDir()
	outDir := filepath.Join(root, "output")

	if got := imageOutputDirForSourceEvent(outDir, "final"); got != outDir {
		t.Fatalf("final output dir = %s, want %s", got, outDir)
	}
	if got := imageOutputDirForSourceEvent(outDir, "images_api"); got != outDir {
		t.Fatalf("images_api output dir = %s, want %s", got, outDir)
	}
	if got := imageOutputDirForSourceEvent(outDir, "partial"); got != filepath.Join(root, "intermediate") {
		t.Fatalf("partial output dir = %s, want intermediate sibling", got)
	}
	if got := imageOutputDirForSourceEvent(outDir, "images_api_partial"); got != filepath.Join(root, "intermediate") {
		t.Fatalf("images_api_partial output dir = %s, want intermediate sibling", got)
	}
}

func writeTestPNG(t *testing.T, path string, c color.Color) {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 80, 60))
	for y := 0; y < img.Bounds().Dy(); y++ {
		for x := 0; x < img.Bounds().Dx(); x++ {
			img.Set(x, y, c)
		}
	}
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		t.Fatal(err)
	}
}
