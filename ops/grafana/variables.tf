variable "grafana_url" {
  description = "The stack's URL (GRAFANA_URL)."
  type        = string
}

variable "grafana_auth" {
  description = "Service-account token for alerting and dashboards (GRAFANA_TF_TOKEN)."
  type        = string
  sensitive   = true
}

variable "sm_url" {
  description = "Synthetic Monitoring API URL for the stack's region (GRAFANA_SM_URL)."
  type        = string
}

variable "sm_access_token" {
  description = "Synthetic Monitoring access token (GRAFANA_SM_TOKEN)."
  type        = string
  sensitive   = true
}

variable "alert_email" {
  description = "Where alerts go (ALERT_EMAIL). Never committed."
  type        = string
  sensitive   = true
}

variable "health_targets" {
  description = <<-EOT
    HEALTH_TARGETS: per environment, the URLs the uptime checks fetch, e.g.
    {"production": {"api": "https://…/healthz", "game": "https://…/healthz", "web": "https://…/"}, "staging": {…}}
  EOT
  type        = map(map(string))
}

variable "probe_names" {
  description = "Synthetic Monitoring probes to check from. Null: the first two public probes by name."
  type        = list(string)
  default     = null
}

variable "prometheus_datasource_uid" {
  description = "The stack's Prometheus (Mimir) data source."
  type        = string
  default     = "grafanacloud-prom"
}

variable "loki_datasource_uid" {
  description = "The stack's Loki data source."
  type        = string
  default     = "grafanacloud-logs"
}

# Starting thresholds. Reset them from a week of production baseline and record the number
# and date in observability.md ("Alert rules").
variable "server_error_threshold" {
  description = "5xx responses plus ERROR log lines per 10 minutes, per environment."
  type        = number
  default     = 5
}

variable "client_error_threshold" {
  description = "Faro errors per 15 minutes, per environment."
  type        = number
  default     = 20
}

variable "test_alert_environments" {
  description = "Environments whose test alert is unpaused (observability.md, \"Test alert\")."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for e in var.test_alert_environments : contains(["staging", "production"], e)])
    error_message = "test_alert_environments takes staging and/or production."
  }
}
