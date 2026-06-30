package backend

import (
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

func TestImportImageFileCopiesExternalSourceIntoManagedImports(t *testing.T) {
	packageRoot := t.TempDir()
	t.Setenv(publicRootEnvName, packageRoot)

	externalPath := filepath.Join(t.TempDir(), "reference.png")
	writeImportSourceTestPNG(t, externalPath)

	svc := NewService()
	if _, err := svc.ensureManagedReadablePath(externalPath, managedImageFile); err == nil {
		t.Fatal("expected original external source path to be rejected")
	}

	imported, err := svc.ImportImagePath(externalPath)
	if err != nil {
		t.Fatal(err)
	}
	if imported.Path == "" || imported.Path == externalPath {
		t.Fatalf("imported path = %q, want managed copy different from source", imported.Path)
	}

	importsRoot, err := importsDir()
	if err != nil {
		t.Fatal(err)
	}
	if !isWithinRoot(imported.Path, importsRoot) {
		t.Fatalf("imported path = %q, want within %q", imported.Path, importsRoot)
	}
	if _, err := svc.ensureManagedReadablePath(imported.Path, managedImageFile); err != nil {
		t.Fatalf("expected managed import copy to be readable: %v", err)
	}

	if imported.ImageID == "" || imported.PreviewURL == "" {
		t.Fatalf("expected imported path to register a preview asset, got %+v", imported)
	}
}

func writeImportSourceTestPNG(t *testing.T, path string) {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 16, 12))
	for y := 0; y < 12; y++ {
		for x := 0; x < 16; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x * 8), G: uint8(y * 12), B: 180, A: 255})
		}
	}
	if err := os.MkdirAll(filepath.Dir(path), secureDirMode); err != nil {
		t.Fatal(err)
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, secureFileMode)
	if err != nil {
		t.Fatal(err)
	}
	if err := png.Encode(f, img); err != nil {
		_ = f.Close()
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
}
