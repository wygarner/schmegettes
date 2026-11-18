import { AppShell, NavLink, Text } from "@mantine/core";
import { type ComponentType, useState } from "react";
import { AdminPage } from "./admin/AdminPage";

// Every file under src/designs/{category}/{flow}.tsx is a prototype, found automatically.
const modules = import.meta.glob<{ default: ComponentType }>("./designs/**/*.tsx", { eager: true });
const designs = Object.entries(modules).map(([path, mod]) => {
  const [, category = "misc", flow = path] = path.match(/designs\/([^/]+)\/([^/]+)\.tsx$/) ?? [];
  return { key: path, category, flow, Component: mod.default };
});

// The Admin page is a real tool, not a prototype: it signs in to local, staging, or production.
const adminKey = "admin";

export function App() {
  const [selected, setSelected] = useState<string | undefined>(designs[0]?.key);
  const active = designs.find((d) => d.key === selected);
  const categories = [...new Set(designs.map((d) => d.category))];

  return (
    <AppShell navbar={{ width: 260, breakpoint: "sm" }} padding="md">
      <AppShell.Navbar p="sm">
        <NavLink label="Admin" active={selected === adminKey} onClick={() => setSelected(adminKey)} />
        {categories.map((category) => (
          <NavLink key={category} label={category} defaultOpened>
            {designs
              .filter((d) => d.category === category)
              .map((d) => (
                <NavLink key={d.key} label={d.flow} active={d.key === selected} onClick={() => setSelected(d.key)} />
              ))}
          </NavLink>
        ))}
      </AppShell.Navbar>
      <AppShell.Main>
        {selected === adminKey ? (
          <AdminPage />
        ) : active ? (
          <active.Component />
        ) : (
          <Text>No designs yet. /designer adds them under src/designs/.</Text>
        )}
      </AppShell.Main>
    </AppShell>
  );
}
