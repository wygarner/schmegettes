import "@mantine/core/styles.css";
import { AppShell, MantineProvider, NavLink, Text } from "@mantine/core";
import { type ComponentType, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

// Every file under src/designs/{category}/{flow}.tsx is a prototype, found automatically.
const modules = import.meta.glob<{ default: ComponentType }>("./designs/**/*.tsx", { eager: true });
const designs = Object.entries(modules).map(([path, mod]) => {
  const [, category = "misc", flow = path] = path.match(/designs\/([^/]+)\/([^/]+)\.tsx$/) ?? [];
  return { key: path, category, flow, Component: mod.default };
});

function App() {
  const [selected, setSelected] = useState(designs[0]?.key);
  const active = designs.find((d) => d.key === selected);
  const categories = [...new Set(designs.map((d) => d.category))];

  return (
    <AppShell navbar={{ width: 260, breakpoint: "sm" }} padding="md">
      <AppShell.Navbar p="sm">
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
        {active ? <active.Component /> : <Text>No designs yet. /designer adds them under src/designs/.</Text>}
      </AppShell.Main>
    </AppShell>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
createRoot(root).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </StrictMode>,
);
