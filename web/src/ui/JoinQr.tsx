import qrcode from "qrcode-generator";
import { useMemo } from "react";

/** The address a QR code opens for a room: this environment's join page with the code in it. */
export function joinUrl(origin: string, code: string): string {
  return `${origin}/join/${code}`;
}

/** One path for the dark modules, offset by the quiet margin. */
function modulesPath(text: string, margin: number): { path: string; size: number } {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let path = "";
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(row, col)) path += `M${col + margin} ${row + margin}h1v1h-1z`;
    }
  }
  return { path, size: n + 2 * margin };
}

/**
 * The lobby's QR code (lobby feature brief): dark modules on a white square with a 4-module
 * quiet margin in every theme, so phone cameras read it off a mirrored TV. It opens
 * `{origin}/join/{code}`, which starts at the microphone step. `size` is any CSS length.
 */
export function JoinQr({
  code,
  size,
  origin = window.location.origin,
}: {
  code: string;
  size: string;
  origin?: string;
}) {
  const { path, size: modules } = useMemo(() => modulesPath(joinUrl(origin, code), 4), [origin, code]);
  return (
    <svg
      role="img"
      aria-label={`QR code to join room ${code}`}
      viewBox={`0 0 ${modules} ${modules}`}
      shapeRendering="crispEdges"
      style={{ width: size, height: size, display: "block", flexShrink: 0, borderRadius: 6 }}
    >
      <rect width={modules} height={modules} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
