import "@mantine/core/styles.css";
import { createTheme, MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { Home } from "./pages/Home";

// Shared with devtools/ prototypes via the same values; see docs/product-docs/architecture/design-system.md.
export const theme = createTheme({
  primaryColor: "boardBlue",
  colors: {
    boardBlue: [
      "#e8eaff",
      "#c9cdf7",
      "#a5abee",
      "#7f87e6",
      "#5f68df",
      "#4a53da",
      "#3f48d9",
      "#3139c1",
      "#2932ad",
      "#060ce9",
    ],
  },
  fontFamily: "Inter, system-ui, sans-serif",
  headings: { fontFamily: "Oswald, Impact, sans-serif" },
});

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");

createRoot(root).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
);
