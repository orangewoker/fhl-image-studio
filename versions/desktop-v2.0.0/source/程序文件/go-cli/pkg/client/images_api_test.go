package client

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRequestImagesAPIWithPartialStreamsPreviews(t *testing.T) {
	partialB64 := base64.StdEncoding.EncodeToString([]byte("partial"))
	finalB64 := base64.StdEncoding.EncodeToString([]byte("final"))
	var requestBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprintf(w, "data: {\"type\":\"image_generation.partial_image\",\"partial_image_index\":0,\"b64_json\":\"%s\"}\n", partialB64)
		fmt.Fprintf(w, "data: {\"type\":\"image_generation.completed\",\"b64_json\":\"%s\"}\n", finalB64)
	}))
	defer srv.Close()

	var partials []PartialImage
	res, err := RequestImagesAPIWithPartial(context.Background(), Options{
		APIKey:        "sk-test",
		Prompt:        "cat",
		BaseURL:       srv.URL,
		APIMode:       APIModeImages,
		PartialImages: 2,
	}, &bytes.Buffer{}, nil, func(partial PartialImage) {
		partials = append(partials, partial)
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(requestBody), `"stream":true`) {
		t.Fatalf("request body missing stream=true: %s", requestBody)
	}
	if !strings.Contains(string(requestBody), `"partial_images":2`) {
		t.Fatalf("request body missing partial_images=2: %s", requestBody)
	}
	if res.ImageB64 != finalB64 || res.SourceEvent != "images_api" {
		t.Fatalf("unexpected result: %+v", res)
	}
	if len(partials) != 1 || partials[0].ImageB64 != partialB64 || partials[0].PartialImageIndex != 0 {
		t.Fatalf("unexpected partials: %+v", partials)
	}
}

func TestImagesAPIWithRetriesRetriesFHLNoAvailableAccount(t *testing.T) {
	original := RetryBackoffSeconds
	RetryBackoffSeconds = 0
	t.Cleanup(func() { RetryBackoffSeconds = original })

	finalB64 := base64.StdEncoding.EncodeToString([]byte("final"))
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.Header().Set("Content-Type", "application/json")
		if hits < 3 {
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprint(w, `{"error":{"message":"无可用账号，请稍后重试","type":"upstream_error"}}`)
			return
		}
		fmt.Fprintf(w, `{"data":[{"b64_json":"%s","revised_prompt":"ok"}]}`, finalB64)
	}))
	defer srv.Close()

	res, _, err := RequestAndExtractWithRetries(
		context.Background(),
		&NativeTransport{},
		Options{
			APIKey:  "sk-test",
			Prompt:  "apple",
			BaseURL: srv.URL,
			APIMode: APIModeImages,
		},
		t.TempDir(),
		"20260602-200000",
		nil,
		nil,
	)
	if err != nil {
		t.Fatal(err)
	}
	if hits != 3 {
		t.Fatalf("hits = %d, want 3", hits)
	}
	if res.ImageB64 != finalB64 || res.SourceEvent != "images_api" {
		t.Fatalf("unexpected result: %+v", res)
	}
}

func TestBuildEditsMultipartSetsMaskMimeType(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "source.png")
	if err := os.WriteFile(src, fakePNG, 0o644); err != nil {
		t.Fatal(err)
	}

	buf, contentType, err := buildEditsMultipart(
		[]string{src},
		base64.StdEncoding.EncodeToString(fakePNG),
		"edit this",
		"gpt-image-2",
		"1024x1024",
		"auto",
		"png",
		"",
		0,
		RequestPolicyOpenAI,
		DefaultPartialImages,
	)
	if err != nil {
		t.Fatal(err)
	}

	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		t.Fatal(err)
	}
	reader := multipart.NewReader(buf, params["boundary"])
	foundMask := false
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		if part.FormName() == "mask" {
			foundMask = true
			if got := part.Header.Get("Content-Type"); got != "image/png" {
				t.Fatalf("mask content-type = %q, want image/png", got)
			}
		}
		_, _ = io.Copy(io.Discard, part)
	}
	if !foundMask {
		t.Fatal("expected mask part in multipart body")
	}
}

func TestBuildEditsMultipartOmitsMaskWhenEmpty(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "source.png")
	if err := os.WriteFile(src, fakePNG, 0o644); err != nil {
		t.Fatal(err)
	}

	buf, _, err := buildEditsMultipart(
		[]string{src},
		"",
		"edit this",
		"gpt-image-2",
		"1024x1024",
		"auto",
		"png",
		"",
		0,
		RequestPolicyOpenAI,
		DefaultPartialImages,
	)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(buf.String(), `name="mask"`) {
		t.Fatal("multipart body should omit mask part when mask is empty")
	}
}
