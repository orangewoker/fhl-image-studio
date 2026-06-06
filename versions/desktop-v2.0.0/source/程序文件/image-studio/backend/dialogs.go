package backend

import (
	"encoding/base64"
	"errors"
	"fmt"
	neturl "net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// OpenImageDialog shows a file picker filtered to supported image types and
// returns the selected absolute path, size, and a managed AVIF preview URL when
// thumbnail generation succeeds.
const maxDialogReadBytes int64 = 50 * 1024 * 1024

func (s *Service) OpenImageDialog() (SelectFileResponse, error) {
	path, err := runtime.OpenFileDialog(s.ctx, runtime.OpenDialogOptions{
		Title: "选择源图片",
		Filters: []runtime.FileFilter{
			{DisplayName: "支持的图片 (*.png;*.jpg;*.jpeg;*.webp)", Pattern: "*.png;*.jpg;*.jpeg;*.webp"},
			{DisplayName: "所有文件 (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil {
		return SelectFileResponse{}, err
	}
	if path == "" {
		return SelectFileResponse{}, nil
	}
	info, err := os.Stat(path)
	if err != nil {
		return SelectFileResponse{}, err
	}
	resp := SelectFileResponse{Path: path, Size: info.Size()}
	if info.Size() > 0 && info.Size() <= maxDialogReadBytes {
		if preview, previewErr := s.registerImportedPreview(path); previewErr == nil {
			resp.ImageID = preview.ID
			resp.PreviewURL = preview.PreviewURL
			resp.PreviewWidth = preview.PreviewWidth
			resp.PreviewHeight = preview.PreviewHeight
		}
	}
	return resp, nil
}

// SaveImageAs prompts the user for a destination and writes the base64 PNG to disk.
func (s *Service) SaveImageAs(imageB64, suggestedName string) (string, error) {
	if suggestedName == "" {
		suggestedName = fmt.Sprintf("image-%d.png", time.Now().Unix())
	}
	dst, err := runtime.SaveFileDialog(s.ctx, runtime.SaveDialogOptions{
		Title:           "保存图片",
		DefaultFilename: suggestedName,
		Filters: []runtime.FileFilter{
			{DisplayName: "PNG 图片 (*.png)", Pattern: "*.png"},
		},
	})
	if err != nil || dst == "" {
		return "", err
	}
	return writeBase64PNG(imageB64, dst)
}

// SaveImagePathAs copies an existing managed image to a user-selected path.
// Generated results use this path-first route so the frontend does not have to
// read the full image into JS memory just to save a copy.
func (s *Service) SaveImagePathAs(path, suggestedName string) (string, error) {
	allowed, err := s.ensureManagedReadablePath(path, managedImageFile)
	if err != nil {
		return "", err
	}
	if suggestedName == "" {
		suggestedName = filepath.Base(allowed)
	}
	dst, err := runtime.SaveFileDialog(s.ctx, runtime.SaveDialogOptions{
		Title:           "保存图片",
		DefaultFilename: suggestedName,
		Filters: []runtime.FileFilter{
			{DisplayName: "图片文件 (*.png;*.jpg;*.jpeg;*.webp;*.avif)", Pattern: "*.png;*.jpg;*.jpeg;*.webp;*.avif"},
			{DisplayName: "所有文件 (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil || dst == "" {
		return "", err
	}
	data, err := os.ReadFile(allowed)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(dst, data, secureFileMode); err != nil {
		return "", err
	}
	abs, _ := filepath.Abs(dst)
	return abs, nil
}

// GetOutputDir returns the directory where generated images and raw response
// dumps are written —— 用户自定义优先,空时回退到默认。
func (s *Service) GetOutputDir() (string, error) {
	return s.resolvedOutputDir()
}

// OpenOutputDir reveals the output directory in the OS file explorer.
// 兜底:用户在第一次生成前就点「打开输出目录」,默认路径还不存在 ——
// `open` / `xdg-open` / `explorer` 拿到不存在的路径都会失败(macOS / Linux
// 表现为完全打不开),所以这里把根目录 + images/log 子目录预建好。
func (s *Service) OpenOutputDir() error {
	dir, err := s.resolvedOutputDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(imagesSubdir(dir), secureDirMode); err != nil {
		return err
	}
	if err := os.MkdirAll(thumbsSubdir(dir), secureDirMode); err != nil {
		return err
	}
	if err := os.MkdirAll(previewsSubdir(dir), secureDirMode); err != nil {
		return err
	}
	if err := os.MkdirAll(logSubdir(dir), secureDirMode); err != nil {
		return err
	}
	return openInExplorer(dir)
}

// OpenExternalURL launches a URL in the default browser. Used for GitHub /
// MIT license / Issues links in the About dialog and Footer.
func (s *Service) OpenExternalURL(rawURL string) error {
	if rawURL == "" {
		return errors.New("url is empty")
	}
	parsed, err := neturl.Parse(rawURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return errors.New("invalid external url")
	}
	switch parsed.Scheme {
	case "http", "https":
	default:
		return errors.New("unsupported external url scheme")
	}
	return openInExplorer(rawURL)
}

// OpenFile 在系统默认应用里打开一个本地文件 —— 前端「查看日志」按钮调用,
// 让用户拿系统记事本 / TextEdit / xdg-open 关联程序读 sse-response-*.txt
// 这类原始上游响应。文件不存在就返回错误。
func (s *Service) OpenFile(path string) error {
	if strings.TrimSpace(path) == "" {
		return errors.New("path is empty")
	}
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("文件不存在或无法访问:%w", err)
	}
	return openInExplorer(path)
}

// ReadImageAsBase64 loads an image file from disk and returns its bytes as
// standard base64. Used by the frontend to refresh the canvas after a
// rotate/flip/crop operation produced a new file in imports/.
func (s *Service) ReadImageAsBase64(path string) (string, error) {
	allowed, err := s.ensureManagedReadablePath(path, managedImageFile)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(allowed)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

// ReadTextFile returns a file's contents as a string. Used to display the raw
// SSE response in the "查看 raw" modal.
func (s *Service) ReadTextFile(path string) (string, error) {
	allowed, err := s.ensureManagedReadablePath(path, managedRawLogFile)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(allowed)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// ExportHistoryToFile writes a JSON dump (provided by the frontend) to a
// user-chosen path. Powers the "导出历史" action in settings.
func (s *Service) ExportHistoryToFile(jsonContent string) (string, error) {
	dst, err := runtime.SaveFileDialog(s.ctx, runtime.SaveDialogOptions{
		Title:           "导出历史记录",
		DefaultFilename: fmt.Sprintf("image-studio-history-%s.json", time.Now().Format("20060102-150405")),
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON (*.json)", Pattern: "*.json"},
		},
	})
	if err != nil || dst == "" {
		return "", err
	}
	if err := os.WriteFile(dst, []byte(jsonContent), secureFileMode); err != nil {
		return "", err
	}
	return dst, nil
}

// ImportHistoryFromFile opens a file picker and returns the JSON content as a
// string. The frontend then parses and merges the entries into IndexedDB.
func (s *Service) ImportHistoryFromFile() (string, error) {
	src, err := runtime.OpenFileDialog(s.ctx, runtime.OpenDialogOptions{
		Title: "选择历史 JSON 文件",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON (*.json)", Pattern: "*.json"},
		},
	})
	if err != nil || src == "" {
		return "", err
	}
	data, err := os.ReadFile(src)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
