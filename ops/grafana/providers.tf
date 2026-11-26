# Grafana alerting, dashboards and Synthetic Monitoring as code. Applied by
# .github/workflows/grafana.yml on merge to develop; docs/system-docs/operations/observability.md.
#
# Nothing here names this deployment's stack or state bucket: the backend's bucket, endpoint and
# region come from -backend-config at init (grafana.yml), and the URLs, targets and email from
# variables.

terraform {
  required_version = "~> 1.17.0"

  # State in a private Supabase Storage bucket, through its S3-compatible API
  # (observability.md, "Setting up a stack"). The bucket is passed at init; the endpoint, region
  # and credentials come from AWS_ENDPOINT_URL_S3, AWS_REGION, AWS_ACCESS_KEY_ID and
  # AWS_SECRET_ACCESS_KEY. There is no state lock:
  # grafana.yml's concurrency group runs one apply at a time, and only it applies.
  backend "s3" {
    key                         = "grafana/terraform.tfstate"
    use_path_style              = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }

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
