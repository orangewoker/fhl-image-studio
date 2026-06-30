package backend

import "testing"

func TestAutomationStatusRoundTrip(t *testing.T) {
	svc := NewService()
	if got := svc.GetAutomationStatus(); got.Enabled {
		t.Fatal("default automation status should be disabled")
	}

	want := AutomationStatus{
		Enabled:        true,
		Mode:           "argv",
		ServerURL:      "http://127.0.0.1:9230/",
		Port:           9230,
		PackageVersion: "2.0.2.1",
		BridgeMethods:  []string{"GetAutomationStatus"},
	}
	svc.SetAutomationStatus(want)
	got := svc.GetAutomationStatus()
	if !got.Enabled || got.ServerURL != want.ServerURL || got.Port != want.Port {
		t.Fatalf("unexpected automation status: %#v", got)
	}
	if len(got.BridgeMethods) != 1 || got.BridgeMethods[0] != "GetAutomationStatus" {
		t.Fatalf("unexpected bridge methods: %#v", got.BridgeMethods)
	}
}
