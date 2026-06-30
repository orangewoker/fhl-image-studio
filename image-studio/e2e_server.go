package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"reflect"
	"strings"
	"time"

	"image-studio/backend"
)

var e2eBridgeMethods = []string{
	"GetAutomationStatus",
	"GetOutputDir",
	"SetOutputDir",
	"ReadImageAsBase64",
	"ReadTextFile",
	"ImportImageFromB64",
	"ImportImagePath",
	"RegisterImportedImageAsset",
	"RegisterMediaAsset",
	"RegisterTrustedOutputDir",
	"BuildBatchOutputPath",
	"SaveImageToDir",
	"SaveImagePathToDir",
	"SyncMaterialGroupToOutput",
}

var e2eBridgeMethodSet = func() map[string]struct{} {
	out := make(map[string]struct{}, len(e2eBridgeMethods))
	for _, method := range e2eBridgeMethods {
		out[method] = struct{}{}
	}
	return out
}()

func startE2EServer(assets fs.FS, svc *backend.Service, status backend.AutomationStatus) (*http.Server, string, int, error) {
	handler, err := newE2EHTTPHandler(assets, svc, status)
	if err != nil {
		return nil, "", 0, err
	}
	port := status.Port
	if port <= 0 {
		port = defaultE2EPort
	}
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return nil, "", 0, err
	}
	actualPort := listener.Addr().(*net.TCPAddr).Port
	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		if err := server.Serve(listener); !isServerClosed(err) {
			fmt.Printf("[FHL Studio E2E] server error: %v\n", err)
		}
	}()
	return server, fmt.Sprintf("http://127.0.0.1:%d/", actualPort), actualPort, nil
}

func newE2EHTTPHandler(assets fs.FS, svc *backend.Service, status backend.AutomationStatus) (http.Handler, error) {
	dist, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		return nil, err
	}
	static := svc.MediaHandler(http.FileServer(http.FS(dist)))
	mux := http.NewServeMux()
	mux.HandleFunc("/__e2e/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeE2EJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		writeE2EJSON(w, http.StatusOK, svc.GetAutomationStatus())
	})
	mux.HandleFunc("/__e2e/service/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeE2EJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		method := strings.TrimPrefix(r.URL.Path, "/__e2e/service/")
		handleE2EServiceCall(w, r, svc, method)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			writeE2EJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			serveE2EIndex(w, r, dist, status)
			return
		}
		static.ServeHTTP(w, r)
	})
	return mux, nil
}

func serveE2EIndex(w http.ResponseWriter, r *http.Request, dist fs.FS, status backend.AutomationStatus) {
	data, err := fs.ReadFile(dist, "index.html")
	if err != nil {
		http.Error(w, "index.html not found", http.StatusNotFound)
		return
	}
	injected := injectE2EBootstrap(data, status)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(injected)
}

func injectE2EBootstrap(indexHTML []byte, status backend.AutomationStatus) []byte {
	script := []byte(e2eBootstrapScript(status))
	marker := []byte("</head>")
	if idx := bytes.Index(indexHTML, marker); idx >= 0 {
		out := make([]byte, 0, len(indexHTML)+len(script))
		out = append(out, indexHTML[:idx]...)
		out = append(out, script...)
		out = append(out, indexHTML[idx:]...)
		return out
	}
	out := make([]byte, 0, len(indexHTML)+len(script))
	out = append(out, script...)
	out = append(out, indexHTML...)
	return out
}

func e2eBootstrapScript(status backend.AutomationStatus) string {
	status.Enabled = true
	status.BridgeMethods = append([]string(nil), e2eBridgeMethods...)
	statusJSON, _ := json.Marshal(status)
	methodsJSON, _ := json.Marshal(e2eBridgeMethods)
	return fmt.Sprintf(`<script>
(() => {
  const status = %s;
  const methods = %s;
  const call = async (name, args) => {
    const response = await fetch("/__e2e/service/" + encodeURIComponent(name), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args || [])
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      throw new Error(payload.error || ("E2E service call failed: " + name));
    }
    return payload.result;
  };
  window.__IMAGE_STUDIO_E2E_BOOTSTRAP = status;
  window.go = window.go || {};
  window.go.backend = window.go.backend || {};
  window.go.backend.Service = window.go.backend.Service || {};
  for (const name of methods) {
    window.go.backend.Service[name] = (...args) => call(name, args);
  }
  try {
    localStorage.setItem("gptcodex.e2e", "1");
    localStorage.setItem("gptcodex.kernelRuntimeMode", "remote");
  } catch {}
})();
</script>`, safeScriptJSON(statusJSON), safeScriptJSON(methodsJSON))
}

func safeScriptJSON(data []byte) string {
	return strings.ReplaceAll(string(data), "</", "<\\/")
}

func handleE2EServiceCall(w http.ResponseWriter, r *http.Request, svc *backend.Service, methodName string) {
	if _, ok := e2eBridgeMethodSet[methodName]; !ok {
		writeE2EJSON(w, http.StatusNotFound, map[string]string{"error": "method not exposed in E2E bridge"})
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 100<<20))
	if err != nil {
		writeE2EJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	var rawArgs []json.RawMessage
	if len(strings.TrimSpace(string(body))) > 0 {
		if err := json.Unmarshal(body, &rawArgs); err != nil {
			writeE2EJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON args"})
			return
		}
	}

	method := reflect.ValueOf(svc).MethodByName(methodName)
	if !method.IsValid() {
		writeE2EJSON(w, http.StatusNotFound, map[string]string{"error": "method not found"})
		return
	}
	methodType := method.Type()
	if methodType.NumIn() != len(rawArgs) {
		writeE2EJSON(w, http.StatusBadRequest, map[string]string{"error": "argument count mismatch"})
		return
	}
	args := make([]reflect.Value, methodType.NumIn())
	for i := 0; i < methodType.NumIn(); i++ {
		argType := methodType.In(i)
		holder := reflect.New(argType)
		if err := json.Unmarshal(rawArgs[i], holder.Interface()); err != nil {
			writeE2EJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("argument %d: %v", i+1, err)})
			return
		}
		args[i] = holder.Elem()
	}

	defer func() {
		if recovered := recover(); recovered != nil {
			writeE2EJSON(w, http.StatusInternalServerError, map[string]string{"error": fmt.Sprint(recovered)})
		}
	}()
	results := method.Call(args)
	result, callErr := unpackE2EResults(results)
	if callErr != nil {
		writeE2EJSON(w, http.StatusBadRequest, map[string]string{"error": callErr.Error()})
		return
	}
	writeE2EJSON(w, http.StatusOK, map[string]any{"result": result})
}

func unpackE2EResults(results []reflect.Value) (any, error) {
	if len(results) == 0 {
		return nil, nil
	}
	errorType := reflect.TypeOf((*error)(nil)).Elem()
	if last := results[len(results)-1]; last.IsValid() && last.Type().Implements(errorType) {
		if !last.IsNil() {
			return nil, last.Interface().(error)
		}
		results = results[:len(results)-1]
	}
	switch len(results) {
	case 0:
		return nil, nil
	case 1:
		return results[0].Interface(), nil
	default:
		out := make([]any, 0, len(results))
		for _, result := range results {
			out = append(out, result.Interface())
		}
		return out, nil
	}
}

func writeE2EJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
