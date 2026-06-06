package backend

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProbeUpstreamRequestsModelsFromBackend(t *testing.T) {
	var gotAuth string
	var gotUserAgent string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		gotUserAgent = r.Header.Get("User-Agent")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"gpt-5.5"},{"id":"gpt-image-2"}]}`))
	}))
	defer srv.Close()

	got, err := probeUpstream(context.Background(), ProbeUpstreamOptions{
		APIKey:  " sk-test ",
		BaseURL: srv.URL + "/",
	})
	if err != nil {
		t.Fatalf("ProbeUpstream returned error: %v", err)
	}
	if got.ModelCount != 2 {
		t.Fatalf("model count = %d, want 2", got.ModelCount)
	}
	if gotAuth != "Bearer sk-test" {
		t.Fatalf("Authorization = %q", gotAuth)
	}
	if !strings.HasPrefix(gotUserAgent, "image-studio/") {
		t.Fatalf("unexpected User-Agent %q", gotUserAgent)
	}
}

func TestProbeUpstreamRejectsInvalidModelsJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"object":"list"}`))
	}))
	defer srv.Close()

	_, err := probeUpstream(context.Background(), ProbeUpstreamOptions{
		APIKey:  "sk-test",
		BaseURL: srv.URL,
	})
	if err == nil || !strings.Contains(err.Error(), "缺少 data 数组") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestProbeUpstreamSummarizesNon2xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":{"message":"forbidden key"}}`))
	}))
	defer srv.Close()

	_, err := probeUpstream(context.Background(), ProbeUpstreamOptions{
		APIKey:  "sk-test",
		BaseURL: srv.URL,
	})
	if err == nil || !strings.Contains(err.Error(), "403: forbidden key") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestProbeUpstreamUsesCustomProxy(t *testing.T) {
	var proxiedURL string
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxiedURL = r.URL.String()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"proxied-model"}]}`))
	}))
	defer proxy.Close()

	got, err := probeUpstream(context.Background(), ProbeUpstreamOptions{
		APIKey:    "sk-test",
		BaseURL:   "http://127.0.0.1:65535",
		ProxyMode: "custom",
		ProxyURL:  proxy.URL,
	})
	if err != nil {
		t.Fatalf("ProbeUpstream returned error: %v", err)
	}
	if got.ModelCount != 1 {
		t.Fatalf("model count = %d, want 1", got.ModelCount)
	}
	if proxiedURL != "http://127.0.0.1:65535/v1/models" {
		t.Fatalf("proxied URL = %q", proxiedURL)
	}
}

func TestServiceProbeUpstreamRequiresStartup(t *testing.T) {
	svc := NewService()
	_, err := svc.ProbeUpstream(ProbeUpstreamOptions{APIKey: "sk-test", BaseURL: "http://127.0.0.1:1"})
	if err == nil || !strings.Contains(err.Error(), "服务未启动") {
		t.Fatalf("unexpected error: %v", err)
	}
}
