package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"image-studio/backend"
)

func TestParseAutomationLaunchConfig(t *testing.T) {
	env := map[string]string{}
	getenv := func(key string) string { return env[key] }

	got := parseAutomationLaunchConfig([]string{"--e2e", "--e2e-port=9444"}, getenv)
	if !got.Enabled || got.Only || got.Port != 9444 || got.Source != "argv" {
		t.Fatalf("unexpected argv config: %#v", got)
	}

	env["IMAGE_STUDIO_E2E_ONLY"] = "1"
	env["IMAGE_STUDIO_E2E_PORT"] = "9555"
	got = parseAutomationLaunchConfig(nil, getenv)
	if !got.Enabled || !got.Only || got.Port != 9555 || got.Source != "env" {
		t.Fatalf("unexpected env config: %#v", got)
	}
}

func TestE2EHandlerInjectsBootstrapAndServiceBridge(t *testing.T) {
	svc := backend.NewService()
	status := backend.AutomationStatus{
		Enabled:        true,
		Mode:           "test",
		ServerURL:      "http://127.0.0.1:9230/",
		Port:           9230,
		PackageVersion: packageVersion,
	}
	svc.SetAutomationStatus(status)

	handler, err := newE2EHTTPHandler(assets, svc, status)
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("index status = %d", res.Code)
	}
	body := res.Body.String()
	if !bytes.Contains([]byte(body), []byte("__IMAGE_STUDIO_E2E_BOOTSTRAP")) {
		t.Fatal("index did not include E2E bootstrap")
	}
	if !bytes.Contains([]byte(body), []byte("RegisterImportedImageAsset")) {
		t.Fatal("index did not include E2E bridge methods")
	}

	callBody, _ := json.Marshal([]any{})
	req = httptest.NewRequest(http.MethodPost, "/__e2e/service/GetAutomationStatus", bytes.NewReader(callBody))
	res = httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("service status = %d body=%s", res.Code, res.Body.String())
	}
	var payload struct {
		Result backend.AutomationStatus `json:"result"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if !payload.Result.Enabled || payload.Result.PackageVersion != packageVersion {
		t.Fatalf("unexpected status payload: %#v", payload.Result)
	}
}
