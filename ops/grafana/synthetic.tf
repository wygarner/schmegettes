# Uptime checks from outside Fly: each environment's api and game /healthz and the web home
# page, every 60 s from two probes. Targets come from HEALTH_TARGETS; no hostname is committed.
data "grafana_synthetic_monitoring_probes" "all" {}

locals {
  probe_ids = var.probe_names == null ? slice(
    [for name in sort(keys(data.grafana_synthetic_monitoring_probes.all.probes)) : data.grafana_synthetic_monitoring_probes.all.probes[name]],
    0, 2,
  ) : [for name in var.probe_names : data.grafana_synthetic_monitoring_probes.all.probes[name]]

  checks = merge([
    for env, targets in var.health_targets : {
      for component, url in targets : "${env}-${component}" => { env = env, component = component, url = url }
    }
  ]...)
}

resource "grafana_synthetic_monitoring_check" "health" {
  for_each = local.checks

  job       = "schmegettes-${each.key}"
  target    = each.value.url
  enabled   = true
  probes    = local.probe_ids
  frequency = 60000
  timeout   = 10000
  labels = {
    env       = each.value.env
    component = each.value.component
  }

  settings {
    http {
      method             = "GET"
      valid_status_codes = [200]
    }
  }
}
