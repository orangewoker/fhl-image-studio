package backend

// AutomationStatus is intentionally read-only from the frontend. It lets the
// packaged app expose whether it was started in Codex/E2E test mode without
// leaking API keys or private profile data.
type AutomationStatus struct {
	Enabled        bool     `json:"enabled"`
	Mode           string   `json:"mode,omitempty"`
	ServerURL      string   `json:"serverUrl,omitempty"`
	Port           int      `json:"port,omitempty"`
	E2EOnly        bool     `json:"e2eOnly,omitempty"`
	PackageVersion string   `json:"packageVersion,omitempty"`
	PID            int      `json:"pid,omitempty"`
	Executable     string   `json:"executable,omitempty"`
	StartedAt      int64    `json:"startedAt,omitempty"`
	BridgeMethods  []string `json:"bridgeMethods,omitempty"`
}

func (s *Service) SetAutomationStatus(status AutomationStatus) {
	s.mu.Lock()
	s.automationStatus = status
	s.mu.Unlock()
}

func (s *Service) GetAutomationStatus() AutomationStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.automationStatus
}
