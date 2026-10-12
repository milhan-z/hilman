// Original Hilman notebook drawings. No external assets or fonts.
// Run: node scripts/create-notebook-doodles.mjs
// Emits shape-only Lottie JSON and matching final-frame SVGs for no-script,
// reduced-motion and loading/error fallbacks. Coordinates are on a 320px desk.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const colors = { ink: "#1f1d1b", paper: "#f4eedf", yellow: "#f5c518", red: "#b5162b", trail: "#b99a38" };
const rgb = (hex) => hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16) / 255);
const fixed = (k) => ({ a: 0, k });
const tween = (from, to, start, end) => ({ a: 1, k: [
  { t: start, s: Array.isArray(from) ? from : [from], e: Array.isArray(to) ? to : [to], o: { x: 0.22, y: 1 }, i: { x: 0.68, y: 1 } },
  { t: end, s: Array.isArray(to) ? to : [to] },
] });
const path = (points, { close = false, fill, stroke = "ink", width = 3, start = 0, end = 20, curves } = {}) => ({ points, close, fill, stroke, width, start, end, curves });
const line = (points, start, end, stroke = "ink", width = 3) => path(points, { start, end, stroke, width });
const box = (x, y, w, h, fill = "paper") => path([[x, y], [x + w, y - 1], [x + w + 1, y + h], [x - 1, y + h + 1]], { close: true, fill });
const ellipse = (x, y, radius, fill, start = 0) => {
  const k = radius * 0.5523;
  return path([[x, y - radius], [x + radius, y], [x, y + radius], [x - radius, y]], {
    close: true, fill, start, end: start + 14,
    curves: { i: [[-k, 0], [0, -k], [k, 0], [0, k]], o: [[k, 0], [0, k], [-k, 0], [0, -k]] },
  });
};
const sparkle = (x, y, start) => [line([[x - 11, y], [x + 11, y]], start, start + 7, "yellow", 4), line([[x, y - 11], [x, y + 11]], start + 2, start + 10, "yellow", 4)];
const layer = (name, paths, { at = [0, 0], from = at, rotate = 0, turn = rotate, start = 0, end = 18 } = {}) => ({ name, paths, at, from, rotate, turn, start, end });

const drawings = {
  "play-design": [
    layer("loose sheet", [box(-90, -76, 180, 152)], { at: [151, 163], from: [146, 170], rotate: 5, turn: 8 }),
    layer("layout sketch", [
      box(-92, -78, 184, 156),
      path([[-30, -87], [28, -86], [24, -66], [-34, -67]], { fill: "yellow", stroke: null, close: true }),
      line([[-68, -48], [-5, -48]], 13, 23, "yellow", 9),
      line([[-68, -31], [57, -31]], 18, 29),
      box(-68, -10, 67, 60),
      ellipse(-34, 19, 19, "yellow", 23),
      line([[16, -7], [64, -7]], 25, 35), line([[16, 8], [52, 8]], 28, 38),
      line([[16, 30], [61, 30]], 31, 41, "red"), line([[16, 45], [43, 45]], 34, 43),
    ], { at: [147, 156], from: [138, 165], rotate: -5, turn: -9, start: 4, end: 20 }),
    layer("yellow pencil", [
      path([[-7, -57], [7, -57], [7, 35], [0, 54], [-7, 35]], { close: true, fill: "yellow" }),
      path([[-7, 35], [7, 35], [0, 54]], { close: true, fill: "paper" }),
      line([[0, 47], [0, 53]], 0, 1, "ink", 4),
      line([[-6, -45], [6, -45]], 0, 1, "red", 7), line([[0, -35], [0, 29]], 0, 1, "ink", 1.5),
    ], { at: [240, 214], from: [202, 162], rotate: 31, turn: 17, start: 26, end: 49 }),
    layer("small discovery", sparkle(257, 73, 44)),
  ],
  "play-motion": [
    layer("flight path", [path([[54, 245], [119, 223], [158, 189], [124, 166], [111, 208], [202, 134]], {
      stroke: "trail", start: 5, end: 48,
      curves: { i: [[0, 0], [-22, 10], [0, 25], [20, -15], [-16, -14], [-37, 40]], o: [[24, 3], [22, -10], [0, -25], [-20, 15], [16, 14], [0, 0]] },
    })]),
    layer("folded paper plane", [
      path([[-61, -6], [61, -31], [17, 50], [1, 11]], { close: true, fill: "paper" }),
      path([[1, 11], [61, -31], [-15, 23], [-20, 46]], { close: true, fill: "yellow" }),
      line([[-20, 46], [1, 11]], 0, 1),
    ], { at: [220, 106], from: [132, 174], rotate: -9, turn: -23, start: 12, end: 50 }),
    layer("arrival", [...sparkle(278, 48, 46), line([[268, 180], [277, 187]], 48, 55, "red"), line([[274, 166], [285, 168]], 48, 55, "red")]),
  ],
  "play-code": [
    layer("browser window", [
      box(-104, -77, 208, 154), line([[-103, -45], [104, -45]], 6, 16),
      ellipse(-85, -60, 4, "red", 8), ellipse(-69, -60, 4, "yellow", 10), ellipse(-53, -60, 4, "paper", 12),
      line([[-37, -20], [-53, -5], [-37, 10]], 20, 31, "ink", 4),
      line([[35, -20], [51, -5], [35, 10]], 30, 41, "ink", 4),
      line([[12, -24], [-10, 16]], 26, 36, "red", 4),
      line([[-66, 36], [-15, 36]], 36, 45, "yellow", 8),
      line([[-1, 36], [48, 36]], 40, 50), line([[-66, 54], [15, 54]], 44, 54),
      line([[29, 49], [29, 59]], 49, 55, "red"),
    ], { at: [156, 165], from: [154, 177], rotate: -3, turn: -5, end: 19 }),
    layer("idea spark", sparkle(270, 63, 45)),
    layer("hand drawn check", [line([[240, 239], [250, 249], [270, 225]], 48, 59, "trail", 4)]),
  ],
};

function lottieShape(p) {
  const tangents = p.points.map(() => [0, 0]);
  return { ty: "gr", it: [
    { ty: "sh", ks: fixed({ v: p.points, i: p.curves?.i ?? tangents, o: p.curves?.o ?? tangents, c: p.close }) },
    ...(p.fill ? [{ ty: "fl", c: fixed(rgb(colors[p.fill])), o: fixed(100), r: 1 }] : []),
    ...(p.stroke ? [{ ty: "st", c: fixed(rgb(colors[p.stroke])), o: fixed(100), w: fixed(p.width), lc: 2, lj: 2 },
      ...(!p.fill ? [{ ty: "tm", s: fixed(0), e: tween(0, 100, p.start, p.end), o: fixed(0), m: 1 }] : [])] : []),
    { ty: "tr", p: fixed([0, 0]), a: fixed([0, 0]), s: fixed([100, 100]), r: fixed(0), o: fixed(100), sk: fixed(0), sa: fixed(0) },
  ] };
}
function svgPath(p) {
  let d = `M${p.points[0].join(" ")}`;
  const end = p.points.length + (p.close ? 1 : 0);
  for (let n = 1; n < end; n++) {
    const i = n % p.points.length, before = p.points[(n - 1) % p.points.length], point = p.points[i];
    if (p.curves) {
      const outgoing = p.curves.o[(n - 1) % p.points.length], incoming = p.curves.i[i];
      d += `C${before[0] + outgoing[0]} ${before[1] + outgoing[1]} ${point[0] + incoming[0]} ${point[1] + incoming[1]} ${point.join(" ")}`;
    } else d += `L${point.join(" ")}`;
  }
  if (p.close) d += "Z";
  return `<path d="${d}" fill="${colors[p.fill] ?? "none"}" stroke="${colors[p.stroke] ?? "none"}" stroke-width="${p.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
for (const [name, layers] of Object.entries(drawings)) {
  const json = { v: "5.7.4", fr: 30, ip: 0, op: 72, w: 320, h: 320, nm: name, ddd: 0, assets: [], markers: [],
    layers: layers.map((item, i) => ({ ddd: 0, ind: i + 1, ty: 4, nm: item.name, sr: 1,
      ks: { o: fixed(100), r: tween(item.turn, item.rotate, item.start, item.end), p: tween([...item.from, 0], [...item.at, 0], item.start, item.end), a: fixed([0, 0, 0]), s: fixed([100, 100, 100]) },
      shapes: item.paths.map(lottieShape).reverse(), ip: item.start, op: 72, st: 0, bm: 0,
    })).reverse(),
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">${layers.map((item) => `<g transform="translate(${item.at.join(" ")}) rotate(${item.rotate})">${item.paths.map(svgPath).join("")}</g>`).join("")}</svg>\n`;
  const root = new URL("../public/lottie/", import.meta.url);
  writeFileSync(fileURLToPath(new URL(`${name}.json`, root)), JSON.stringify(json) + "\n");
  writeFileSync(fileURLToPath(new URL(`${name}.svg`, root)), svg);
}
