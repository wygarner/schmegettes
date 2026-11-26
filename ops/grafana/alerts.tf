# One rule group per environment. Every rule carries env, which routes it (policies.tf) and
# appears in the email subject. Rules, thresholds and their dates: observability.md.
#
# Signal names, as Grafana Cloud stores OTLP data: resource attributes service.name and
# deployment.environment become the labels service_name and deployment_environment; metric
# dots become underscores, counters gain _total, and units become suffixes (_milliseconds).

locals {
  environments = toset(["staging", "production"])

  prom = { uid = var.prometheus_datasource_uid }
  loki = { uid = var.loki_datasource_uid }
}

resource "grafana_rule_group" "schmegettes" {
  for_each = local.environments

  name             = "schmegettes-${each.key}"
  folder_uid       = grafana_folder.schmegettes.uid
  interval_seconds = 60

  # 1. Uptime: every probe has failed a check for 2 minutes (one flaky probe doesn't page).
  rule {
    name      = "Uptime check failing (${each.key})"
    condition = "B"
    for       = "2m"
    labels    = { env = each.key, kind = "uptime" }
    annotations = {
      summary     = "{{ $labels.job }} has failed its uptime check from every probe for 2 minutes."
      runbook_url = "docs/system-docs/operations/incident-response.md"
    }
    no_data_state  = "Alerting"
    exec_err_state = "Error"

    data {
      ref_id         = "A"
      datasource_uid = local.prom.uid
      relative_time_range {
        from = 300
        to   = 0
      }
      model = jsonencode({
        refId   = "A"
        instant = true
        expr    = "max by (job) (probe_success{job=~\"schmegettes-${each.key}-.*\"})"
      })
    }
    data {
      ref_id         = "B"
      datasource_uid = "__expr__"
      relative_time_range {
        from = 0
        to   = 0
      }
      model = jsonencode({
        refId      = "B"
        type       = "threshold"
        expression = "A"
        conditions = [{ evaluator = { type = "lt", params = [1] } }]
      })
    }
  }

  # 2. Server errors: 5xx responses plus ERROR log lines from api and game, per 10 minutes.
  rule {
    name      = "Server errors (${each.key})"
    condition = "D"
    for       = "0s"
    labels    = { env = each.key, kind = "server_errors" }
    annotations = {
      summary     = "{{ $values.C }} server errors (5xx plus ERROR logs) in 10 minutes, above ${var.server_error_threshold}."
      runbook_url = "docs/system-docs/operations/incident-response.md"
    }
    no_data_state  = "OK"
    exec_err_state = "Error"

    data {
      ref_id         = "A"
      datasource_uid = local.prom.uid
      relative_time_range {
        from = 600
        to   = 0
      }
      model = jsonencode({
        refId   = "A"
        instant = true
        expr    = "sum(increase(http_server_request_duration_seconds_count{deployment_environment=\"${each.key}\", http_response_status_code=~\"5..\"}[10m])) or vector(0)"
      })
    }
    data {
      ref_id         = "B"
      datasource_uid = local.loki.uid
      relative_time_range {
        from = 600
        to   = 0
      }
      model = jsonencode({
        refId     = "B"
        queryType = "instant"
        expr      = "sum(count_over_time({deployment_environment=\"${each.key}\", service_name=~\"api|game\"} | severity_text=\"ERROR\" [10m])) or vector(0)"
      })
    }
    data {
      ref_id         = "C"
      datasource_uid = "__expr__"
      relative_time_range {
        from = 0
        to   = 0
      }
      model = jsonencode({ refId = "C", type = "math", expression = "$A + $B" })
    }
    data {
      ref_id         = "D"
      datasource_uid = "__expr__"
      relative_time_range {
        from = 0
        to   = 0
      }
      model = jsonencode({
        refId      = "D"
        type       = "threshold"
        expression = "C"
        conditions = [{ evaluator = { type = "gt", params = [var.server_error_threshold] } }]
      })
    }
  }

  # 3. A live game broke: a room crashed or a phase outlived its deadline by 30 s.
  rule {
    name      = "Live game broken (${each.key})"
    condition = "B"
    for       = "0s"
    labels    = { env = each.key, kind = "live_game" }
    annotations = {
      summary     = "{{ $values.A }} room crashes or stuck phases in 5 minutes. Search the logs for \"room crashed\" or \"phase stuck\" for the room_id."
      runbook_url = "docs/system-docs/operations/incident-response.md"
    }
    no_data_state  = "OK"
    exec_err_state = "Error"

    data {
      ref_id         = "A"
      datasource_uid = local.prom.uid
      relative_time_range {
        from = 300
        to   = 0
      }
      model = jsonencode({
        refId   = "A"
        instant = true
        expr    = "(sum(increase(schmegettes_rooms_crashed_total{deployment_environment=\"${each.key}\"}[5m])) or vector(0)) + (sum(increase(schmegettes_phase_stuck_total{deployment_environment=\"${each.key}\"}[5m])) or vector(0))"
      })
    }
    data {
      ref_id         = "B"
      datasource_uid = "__expr__"
      relative_time_range {
        from = 0
        to   = 0
      }
      model = jsonencode({
        refId      = "B"
        type       = "threshold"
        expression = "A"
        conditions = [{ evaluator = { type = "gt", params = [0] } }]
      })
    }
  }

  # 4. Client errors: Faro exceptions from the web app, per 15 minutes.
  rule {
    name      = "Client errors (${each.key})"
    condition = "B"
    for       = "0s"
    labels    = { env = each.key, kind = "client_errors" }
    annotations = {
      summary     = "{{ $values.A }} web errors in 15 minutes, above ${var.client_error_threshold}. Check Frontend Observability for the release and page."
      runbook_url = "docs/system-docs/operations/incident-response.md"
    }
    no_data_state  = "OK"
    exec_err_state = "Error"

    data {
      ref_id         = "A"
      datasource_uid = local.loki.uid
      relative_time_range {
        from = 900
        to   = 0
      }
      model = jsonencode({
        refId     = "A"
        queryType = "instant"
        expr      = "sum(count_over_time({app_name=\"schmegettes-web\", kind=\"exception\"} | logfmt | app_environment=\"${each.key}\" [15m])) or vector(0)"
      })
    }
    data {
      ref_id         = "B"
      datasource_uid = "__expr__"
      relative_time_range {
        from = 0
        to   = 0
      }
      model = jsonencode({
        refId      = "B"
        type       = "threshold"
        expression = "A"
        conditions = [{ evaluator = { type = "gt", params = [var.client_error_threshold] } }]
      })
    }
  }

  # 5. A failed deploy verification is not a rule here: GitHub emails the failed workflow, and
  # the deploy command writes a "failed" deploy annotation (observability.md).
}

# The test alert: one rule per environment on a constant, paused unless the environment is in
# test_alert_environments. Fire it with the grafana workflow's test_alert input, then run the
# workflow again with "none" to pause it (observability.md, "Test alert").
resource "grafana_rule_group" "test" {
  name             = "schmegettes-test"
  folder_uid       = grafana_folder.schmegettes.uid
  interval_seconds = 60

  dynamic "rule" {
    for_each = local.environments
    content {
      name      = "Test alert (${rule.value})"
      condition = "B"
      for       = "0s"
      is_paused = !contains(var.test_alert_environments, rule.value)
      labels    = { env = rule.value, kind = "test" }
      annotations = {
        summary = "Test alert for ${rule.value}. If this reached you, the alert path works: record the date in observability.md, then pause it."
      }
      no_data_state  = "OK"
      exec_err_state = "Error"

      data {
        ref_id         = "A"
        datasource_uid = "__expr__"
        relative_time_range {
          from = 0
          to   = 0
        }
        model = jsonencode({ refId = "A", type = "math", expression = "1" })
      }
      data {
        ref_id         = "B"
        datasource_uid = "__expr__"
        relative_time_range {
          from = 0
          to   = 0
        }
        model = jsonencode({
          refId      = "B"
          type       = "threshold"
          expression = "A"
          conditions = [{ evaluator = { type = "gt", params = [0] } }]
        })
      }
    }
  }
}
