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
