resource "grafana_folder" "schmegettes" {
  title = "Schmegettes"
}

# "Is tonight's game OK?" Environment is a dashboard variable; data sources are picked by type,
# so the JSON names no stack.
resource "grafana_dashboard" "tonight" {
  folder      = grafana_folder.schmegettes.uid
  config_json = file("${path.module}/dashboards/tonight.json")
}
