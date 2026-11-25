resource "grafana_contact_point" "email" {
  name = "Schmegettes email"

  email {
    addresses = [var.alert_email]
  }
}
