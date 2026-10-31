import QRCode from "qrcode";

/** A real, scannable QR code drawn as SVG squares (navy on white). */
export function QrCode({ text, size, color = "#1b2148" }: { text: string; size: number; color?: string }) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = modules.size;
  const quiet = 2;
  const cell = size / (n + quiet * 2);
  const rects = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (modules.get(r, c)) rects.push(<rect key={`${r}-${c}`} x={(c + quiet) * cell} y={(r + quiet) * cell} width={cell + 0.3} height={cell + 0.3} fill={color} />);
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", background: "#ffffff" }}>
      {rects}
    </svg>
  );
}
