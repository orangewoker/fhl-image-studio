package client

import (
	"net/http"
	"testing"
)

func TestNormalizeProxyConfigDefaultsToSystem(t *testing.T) {
	got, err := NormalizeProxyConfig("", "")
	if err != nil {
		t.Fatal(err)
	}
	if got.Mode != ProxyModeSystem || got.URL != "" {
		t.Fatalf("unexpected config: %#v", got)
	}
}

func TestNormalizeProxyConfigAcceptsCustomHTTPAndHTTPS(t *testing.T) {
	for _, raw := range []string{"http://127.0.0.1:7890", "https://proxy.example:8443"} {
		got, err := NormalizeProxyConfig(ProxyModeCustom, raw)
		if err != nil {
			t.Fatalf("NormalizeProxyConfig(%q) error: %v", raw, err)
		}
		if got.Mode != ProxyModeCustom || got.URL != raw {
			t.Fatalf("unexpected config: %#v", got)
		}
	}
}

func TestNormalizeProxyConfigRejectsInvalidCustomURL(t *testing.T) {
	for _, raw := range []string{"", "socks5://127.0.0.1:1080", "http://proxy.example:8080/path", "http://proxy.example:8080?q=1"} {
		if _, err := NormalizeProxyConfig(ProxyModeCustom, raw); err == nil {
			t.Fatalf("expected %q to be rejected", raw)
		}
	}
}

func TestNewHTTPTransportNoProxyClearsProxyFunc(t *testing.T) {
	transport, err := NewHTTPTransport(ProxyConfig{Mode: ProxyModeNone})
	if err != nil {
		t.Fatal(err)
	}
	if transport.Proxy != nil {
		t.Fatal("no-proxy transport should not have a proxy func")
	}
}

func TestNewHTTPTransportCustomProxy(t *testing.T) {
	transport, err := NewHTTPTransport(ProxyConfig{Mode: ProxyModeCustom, URL: "http://127.0.0.1:7890"})
	if err != nil {
		t.Fatal(err)
	}
	if transport.Proxy == nil {
		t.Fatal("custom proxy transport should have a proxy func")
	}
	req, err := http.NewRequest(http.MethodGet, "https://example.com/v1/models", nil)
	if err != nil {
		t.Fatal(err)
	}
	got, err := transport.Proxy(req)
	if err != nil {
		t.Fatal(err)
	}
	if got.String() != "http://127.0.0.1:7890" {
		t.Fatalf("proxy URL = %q", got.String())
	}
}
