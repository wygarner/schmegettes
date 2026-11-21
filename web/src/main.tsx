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
import { enforceFullscreen } from "./lib/fullscreen";
import { Account } from "./pages/Account";
import { GameScoreboard } from "./pages/GameScoreboard";
import { Home } from "./pages/Home";
import { HostLobby } from "./pages/HostLobby";
import { JoinCode } from "./pages/JoinCode";
import { JoinRoom } from "./pages/JoinRoom";
import { MyGames } from "./pages/MyGames";
import { Stats } from "./pages/Stats";
import { MergeRetry } from "./ui/MergeRetry";

// Shared with devtools/ prototypes via the same values; see docs/product-docs/architecture/design-system.md.
export const theme = createTheme({
  // Mauve backgrounds, Venice green accent, Corinthian pink secondary text
  // (docs/product-docs/architecture/design-system.md, "Color").
  primaryColor: "green",
  primaryShade: 4,
  autoContrast: true,
  colors: {
    // Mauve: backgrounds, board cells, tiles. mauve.4 is the brand light mauve #9161F2;
    // mauve.9 is the deep mauve under the board.
    mauve: [
      "#f3edfe",
      "#e2d6fc",
      "#c9b3f9",
      "#ad8cf6",
      "#9161f2",
      "#7a48e0",
      "#6436c4",
      "#4e2a9c",
      "#3b2075",
      "#2a1754",
    ],
    // Venice green: the accent. green.4 is #6BFFB3.
    green: [
      "#eafff4",
      "#cfffe6",
      "#a6ffd2",
      "#8affc3",
      "#6bffb3",
      "#4ff09e",
      "#36d986",
      "#25bd6f",
      "#18a05c",
      "#0e8049",
    ],
    // Corinthian pink: secondary text. pink.2 is #FFA6D9.
    pink: [
      "#fff0f8",
      "#ffd9ef",
      "#ffa6d9",
      "#ff8fce",
      "#ff78c3",
      "#f25eb2",
      "#d9479b",
      "#bd3383",
      "#9e226c",
      "#801655",
    ],
    // Mantine's dark scheme (inputs, modals, borders) in mauve.
    dark: [
      "#d6cfe6",
      "#bbb0d4",
      "#9f92bf",
      "#75679a",
      "#524478",
      "#3c3060",
      "#2e244d",
      "#241c3e",
      "#1b1433",
      "#140b2b",
    ],
  },
  fontFamily: "Inter, system-ui, sans-serif",
  headings: { fontFamily: "Oswald, Impact, sans-serif" },
});

enforceFullscreen();

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
          <Route path="/stats" element={<Stats />} />
          <Route path="/stats/leaderboard" element={<Stats />} />
          <Route path="/account" element={<Account />} />
        </Routes>
        <MergeRetry />
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
);
