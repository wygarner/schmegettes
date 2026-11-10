import "@mantine/core/styles.css";
// Fonts are bundled and served from the app's origin: no font CDN (design-system.md, "Fonts").
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-800.css";
import "@fontsource/oswald/latin-500.css";
import "@fontsource/oswald/latin-600.css";
import "@fontsource/oswald/latin-700.css";
import "./ui/kit.css";
import { createTheme, MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { GameScoreboard } from "./pages/GameScoreboard";
import { Home } from "./pages/Home";
import { HostLobby } from "./pages/HostLobby";
import { JoinCode } from "./pages/JoinCode";
import { JoinRoom } from "./pages/JoinRoom";
import { MyGames } from "./pages/MyGames";

// Shared with devtools/ prototypes via the same values; see docs/product-docs/architecture/design-system.md.
export const theme = createTheme({
  // Slate backgrounds, cobalt-green accent, turquoise-green secondary text
  // (docs/product-docs/architecture/design-system.md, "Color").
  primaryColor: "green",
  primaryShade: 4,
  autoContrast: true,
  colors: {
    // Slate: backgrounds, board cells, tiles. slate.9 is the brand slate #1B3644.
    slate: [
      "#e9f2f5",
      "#cbdee5",
      "#abc8d3",
      "#8bb1c0",
      "#6e9aac",
      "#578497",
      "#446f82",
      "#345a6b",
      "#264756",
      "#1b3644",
    ],
    // Cobalt green: the accent. green.4 is #94FF94; green.2 is near the turquoise green #B5FFC2.
    green: [
      "#effff1",
      "#d9ffdf",
      "#b5ffc2",
      "#a6ffaf",
      "#94ff94",
      "#7af07a",
      "#5fdb5f",
      "#46c246",
      "#33a633",
      "#238a23",
    ],
    // Mantine's dark scheme (inputs, modals, borders) in slate.
    dark: [
      "#c1d2d9",
      "#a6bdc7",
      "#8aa4b0",
      "#5e7b88",
      "#3c5a68",
      "#2a4553",
      "#1f3946",
      "#183039",
      "#12262e",
      "#0c1a21",
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
          <Route path="/host/:code" element={<HostLobby />} />
          <Route path="/join" element={<JoinCode />} />
          <Route path="/join/:code" element={<JoinRoom />} />
          <Route path="/games" element={<MyGames />} />
          <Route path="/games/:gameId" element={<GameScoreboard />} />
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
);
