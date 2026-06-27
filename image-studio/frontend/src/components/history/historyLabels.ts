export function qualityLabel(raw: string): string {
  switch (raw) {
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "standard":
      return "standard";
    case "hd":
      return "hd";
    case "auto":
      return "auto";
    default:
      return raw;
  }
}

export function sizeLabel(raw: string): string {
  const apimartSize = String(raw || "").trim().match(/^(\d+:\d+)(?:@(1k|2k|4k))?$/i);
  if (apimartSize) {
    return `${apimartSize[1]} @ ${(apimartSize[2] || "1K").toUpperCase()}`;
  }
  switch (raw) {
    case "256x256":
      return "1:1 @ 256";
    case "512x512":
      return "1:1 @ 512";
    case "1024x1024":
      return "1:1 @ 1K";
    case "1536x1024":
      return "3:2 @ 1K";
    case "1024x1536":
      return "2:3 @ 1K";
    case "1536x864":
      return "16:9 @ 1K";
    case "864x1536":
      return "9:16 @ 1K";
    case "1664x944":
      return "7:4 @ 1K";
    case "944x1664":
      return "4:7 @ 1K";
    case "2048x2048":
      return "1:1 @ 2K";
    case "2048x1360":
      return "3:2 @ 2K";
    case "1360x2048":
      return "2:3 @ 2K";
    case "2048x1152":
      return "16:9 @ 2K";
    case "1152x2048":
      return "9:16 @ 2K";
    case "2208x1264":
      return "7:4 @ 2K";
    case "1264x2208":
      return "4:7 @ 2K";
    case "2880x2880":
      return "1:1 @ 4K";
    case "3520x2352":
      return "3:2 @ 4K";
    case "2352x3520":
      return "2:3 @ 4K";
    case "3840x2160":
      return "16:9 @ 4K";
    case "2160x3840":
      return "9:16 @ 4K";
    case "3808x2176":
      return "7:4 @ 4K";
    case "2176x3808":
      return "4:7 @ 4K";
    case "auto":
      return "auto";
    default:
      if (/^\d+x\d+$/.test(raw)) {
        return raw.replace("x", "x");
      }
      return raw;
  }
}