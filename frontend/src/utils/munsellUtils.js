// munsellUtils.js
// colorjs.io is loaded dynamically below (not statically imported here) so
// its ~38KB gzipped only has to be fetched/parsed by sessions that actually
// run the D-15 colour-vision task, rather than by every task in the app.
import { fetchWithTimeout } from "./fetchWithTimeout";

// A budget/weak-CPU device + slow mobile network combo has been observed
// taking close to a minute for a comparable fetch+WASM stage elsewhere in
// this app -- give this real headroom rather than just enough to catch a
// genuine infinite hang.
const FETCH_TIMEOUT_MS = 30000;

// The exact order of hues for the D-15 test (Pilot + Caps 1 to 15)
const D15_HUES = [
  "10B", "5B", "10BG", "5BG", "10G", "5G", "10GY", "5GY",
  "5Y", "10YR", "2.5YR", "7.5R", "2.5R", "5RP", "10P", "5P"
];

export async function loadAndComputeD15Colors(datFileUrl = "/realColor.dat", targetValue = 8, targetChroma = 2) {
  try {
    // 1. Fetch the raw text file from the public folder
    const response = await fetchWithTimeout(datFileUrl, {}, FETCH_TIMEOUT_MS);
    if (!response.ok) throw new Error("Could not load realColor.dat");
    const text = await response.text();

    // 2. Parse the text
    const lines = text.split("\n");
    const parsedData = {};

    for (const line of lines) {
      // Skip the header line or empty lines
      if (!line.trim() || line.includes("h")) continue;
      
      // Split the line by any amount of whitespace
      const parts = line.trim().split(/\s+/);
      
      if (parts.length >= 6) {
        const h = parts[0];
        const V = parseFloat(parts[1]);
        const C = parseFloat(parts[2]);
        const x = parseFloat(parts[3]);
        const y = parseFloat(parts[4]);
        const Y = parseFloat(parts[5]);

        // If this row matches our target Value, Chroma, and is one of our needed Hues
        if (V === targetValue && C === targetChroma && D15_HUES.includes(h)) {
          parsedData[h] = { x, y, Y };
        }
      }
    }

    // 3. Compute sRGB colors in the exact Farnsworth sequence.
    // Loaded here (not at module scope) so this ~38KB gzipped dependency is
    // only fetched once a D-15 session actually needs it.
    const { default: Color } = await import("colorjs.io");
    const computedColors = D15_HUES.map(hue => {
      const data = parsedData[hue];
      
      if (!data) {
        console.warn(`Missing data in real.dat for Hue: ${hue} V: ${targetValue} C: ${targetChroma}`);
        return "#CCCCCC"; // Fallback gray if data is somehow missing
      }
      
      // Convert xyY to XYZ (Normalizing Y from 0-100 to 0.0-1.0)
      const normalizedY = data.Y / 100;
      const X = (normalizedY / data.y) * data.x;
      const Z = (normalizedY / data.y) * (1 - data.x - data.y);

      // Convert to sRGB with gamut mapping using colorjs.io
      const capColor = new Color("xyz", [X, normalizedY, Z]);
      const srgbColor = capColor.toGamut({ space: "srgb", method: "oklch.chroma" });
      
      // Return a standard CSS rgb() string
      return srgbColor.toString({ format: "rgb" });
    });

    return computedColors;

  } catch (error) {
    console.error("Error computing colors:", error);
    return [];
  }
}