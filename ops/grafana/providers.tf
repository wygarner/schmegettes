# Grafana alerting, dashboards and Synthetic Monitoring as code. Applied by
# .github/workflows/grafana.yml on merge to develop; docs/system-docs/operations/observability.md.
#
# Nothing here names this deployment's stack: the HCP Terraform organization and workspace come
# from TF_CLOUD_ORGANIZATION and TF_WORKSPACE, and the URLs, targets and email from variables.

terraform {
  required_version = "~> 1.17.0"

  # State and locking only; plans and applies run in GitHub Actions (execution mode: local).
  cloud {}

  required_providers {
    grafana = {
      source  = "grafana/grafana"
      version = "~> 4.55"
    }
  }
}

provider "grafana" {
  url             = var.grafana_url
  auth            = var.grafana_auth
  sm_url          = var.sm_url
  sm_access_token = var.sm_access_token
}
