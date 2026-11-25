# Production pages at once. Staging goes to the same inbox, grouped into at most one email a
# day, so it never trains anyone to ignore production. The env label is in every subject.
resource "grafana_notification_policy" "root" {
  contact_point = grafana_contact_point.email.name
  group_by      = ["alertname", "env"]

  policy {
    matcher {
      label = "env"
      match = "="
      value = "production"
    }
    contact_point   = grafana_contact_point.email.name
    group_by        = ["alertname", "env"]
    group_wait      = "30s"
    group_interval  = "5m"
    repeat_interval = "4h"
  }

  policy {
    matcher {
      label = "env"
      match = "="
      value = "staging"
    }
    contact_point   = grafana_contact_point.email.name
    group_by        = ["env"]
    group_wait      = "1h"
    group_interval  = "24h"
    repeat_interval = "24h"
  }
}
