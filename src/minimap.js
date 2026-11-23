import { GROUND_DECKS, HOME, PLATFORMS, ROUTE, SKY_GATE, TREES, WORLD_LIMIT, creekZ } from "./map.js";

const SIZE = 240;
const PADDING = 12;
const ground = { x: 0, z: 0, span: WORLD_LIMIT * 2 };
const sky = { x: 0, z: -5, span: 48 };

export function createMinimap(container, practiceHalfWidth) {
  const canvas = container.querySelector("canvas");
  const marker = container.querySelector(".minimap-marker");
  const label = container.querySelector(".minimap-label");
  const context = canvas.getContext("2d");
  if (!context) return () => {};

  const practice = { ...HOME, span: practiceHalfWidth * 2 };
  let currentLayer;
  let lastX, lastZ, lastYaw;
  let bounds = ground;
  const scale = () => (SIZE - 2 * PADDING) / bounds.span;
  const projectX = (x) => SIZE / 2 + (x - bounds.x) * scale();
  const projectZ = (z) => SIZE / 2 + (z - bounds.z) * scale();

  function rectangle(x, z, width, depth, color) {
    context.fillStyle = color;
    context.fillRect(projectX(x - width / 2), projectZ(z - depth / 2), width * scale(), depth * scale());
  }

  function dot(x, z, radius, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(projectX(x), projectZ(z), radius, 0, Math.PI * 2);
    context.fill();
  }

  function line(points, width, color) {
    context.strokeStyle = color;
    context.lineWidth = width;
    context.lineCap = context.lineJoin = "round";
    context.beginPath();
    points.forEach(([x, z], index) => {
      if (index === 0) context.moveTo(projectX(x), projectZ(z));
      else context.lineTo(projectX(x), projectZ(z));
    });
    context.stroke();
  }

  function paint(layer) {
    const isSky = layer === "sky";
    bounds = isSky ? sky : layer === "practice" ? practice : ground;
    label.textContent = isSky ? "天空群岛" : layer === "practice" ? "练习草地" : "地面";
    context.fillStyle = isSky ? "#dce4f7" : "#e8efdc";
    context.fillRect(0, 0, SIZE, SIZE);
    if (isSky) {
      for (const { x, z, w, d, checkpoint } of PLATFORMS) {
        rectangle(x, z, w, d, checkpoint ? "#a9bd96" : "#c4a47b");
        if (checkpoint) dot(checkpoint.x, checkpoint.z, 4, "#faf0bd");
      }
    } else if (layer === "practice") {
      rectangle(HOME.x, HOME.z, practice.span, practice.span, "#bed3a5");
      rectangle(HOME.x, HOME.z - 4, 3, 22, "#e9d6a7");
    } else {
      rectangle(0, 0, ground.span, ground.span, "#b9cda0");
      for (const tree of TREES) dot(tree.x, tree.z, 1.35, "#749868");
      const river = Array.from({ length: 49 }, (_, index) => {
        const x = -WORLD_LIMIT + index * ground.span / 48;
        return [x, creekZ(x)];
      });
      line(river, 6, "#83bfc4");
      line(ROUTE, 4.5, "#f7ebc5");
      for (const { x, z, w, d } of GROUND_DECKS) rectangle(x, z, w, d, "#a78666");
      dot(HOME.x, HOME.z, 5, "#fff4c7");
      dot(SKY_GATE.x, SKY_GATE.z, 5, "#8b65b2");
    }
  }

  return function update(position, yaw, layer) {
    if (layer === currentLayer && position.x === lastX && position.z === lastZ && yaw === lastYaw) return;
    if (layer !== currentLayer) {
      paint(layer);
      currentLayer = layer;
      container.hidden = false;
    }
    lastX = position.x;
    lastZ = position.z;
    lastYaw = yaw;
    const limit = (pixel) => Math.max(PADDING, Math.min(SIZE - PADDING, pixel)) / SIZE * 100;
    marker.style.left = `${limit(projectX(position.x))}%`;
    marker.style.top = `${limit(projectZ(position.z))}%`;
    marker.style.transform = `translate(-50%, -50%) rotate(${-yaw}rad)`;
  };
}
