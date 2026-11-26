import { FOREST_BRIDGE, ISLAND_BRIDGE, PIER, PIER_PATH, POND, SUMMER, SUMMER_BOUNDS, SUMMER_NAME, SUMMER_PATH,
  bridgeCenter, coastPoint, inlandCoastPoint, pierPoint, wadePoint } from "./summer-layout.js";
import { CONSTRUCTION_SITES, fixedBuilt } from "./construction-sites.js";
import { GROUND_DECKS, HOME, MAP_FACILITIES, PLATFORMS, ROUTE, SKY_GATE, TREES, WORLD_LIMIT, creekZ } from "./map.js";

const SIZE = 240;
const PADDING = 12;
const ground = { x: 0, z: 0, span: WORLD_LIMIT * 2 };
const sky = { x: 0, z: -5, span: 48 };

const constructionSymbols = {
  "starlight-circle": "M8 1 10 6 15 8 10 10 8 15 6 10 1 8 6 6Z",
  "forest-platform": "M1 13 6.5 3 9.4 8 11.2 5 15 13Z",
  "golden-garden": "M8 5C4-1 0 6 5 8 0 10 4 17 8 11 12 17 16 10 11 8 16 6 12-1 8 5ZM8 7a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z",
  "moon-altar": "M10 1.5a6.5 6.5 0 1 0 4.1 9.1A5.4 5.4 0 0 1 10 1.5Z",
};

function constructionIcon(id) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS(svg.namespaceURI, "path");
  svg.setAttribute("viewBox", "0 0 16 16");
  path.setAttribute("d", constructionSymbols[id]);
  path.setAttribute("fill", "currentColor");
  path.setAttribute("fill-rule", "evenodd");
  svg.append(path);
  return svg;
}

const fixedFacilities = CONSTRUCTION_SITES.map((site) => ({
  id: site.id, name: site.name, position: site, fixed: true,
  visibleOn: (layer) => layer === site.layer,
}));

function markerLabel(entry) {
  if (!entry) return "";
  return entry.fixed ? `${entry.name} · ${entry.built ? "已建造" : "未建造"}` : entry.name;
}

export function createMinimap(container, practiceHalfWidth) {
  const canvas = container.querySelector("canvas");
  const marker = container.querySelector(".minimap-marker");
  const facilities = container.querySelector(".minimap-facilities");
  const facilityName = container.querySelector(".minimap-facility-name");
  const label = container.querySelector(".minimap-label");
  const context = canvas.getContext("2d");
  if (!context) return () => {};

  const practice = { ...HOME, span: practiceHalfWidth * 2 };
  let currentLayer, lastPlacements;
  let lastX, lastZ, lastYaw;
  let bounds = ground;
  const scale = () => (SIZE - 2 * PADDING) / bounds.span;
  const projectX = (x) => SIZE / 2 + (x - bounds.x) * scale();
  const projectZ = (z) => SIZE / 2 + (z - bounds.z) * scale();

  const percent = (pixel) => `${Math.max(PADDING, Math.min(SIZE - PADDING, pixel)) / SIZE * 100}%`;
  function placeMarker(node, x, z) {
    node.style.left = percent(projectX(x));
    node.style.top = percent(projectZ(z));
  }

  let selected;
  function select(entry) {
    selected?.button.setAttribute("aria-expanded", "false");
    selected = entry;
    facilityName.hidden = !entry;
    facilityName.parentElement.classList.toggle("minimap-show-construction", !!entry?.fixed);
    facilityName.textContent = markerLabel(entry);
    selected?.button.setAttribute("aria-expanded", "true");
  }

  const facilityMarkers = [...MAP_FACILITIES, ...fixedFacilities].map((facility) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "minimap-facility";
    button.dataset.facility = facility.id;
    button.setAttribute("aria-label", facility.name);
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", facilityName.id);
    const icon = document.createElement("span");
    if (facility.fixed) {
      button.classList.add("minimap-construction");
      icon.append(constructionIcon(facility.id));
    } else icon.textContent = facility.icon;
    icon.setAttribute("aria-hidden", "true");
    button.append(icon);
    facilities.append(button);
    const entry = { ...facility, button };
    button.addEventListener("click", () => select(selected === entry ? undefined : entry));
    return entry;
  });

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

  function paintIsland() {
    context.fillStyle = "#a6d6da";
    context.fillRect(0, 0, SIZE, SIZE);
    const bands = [[wadePoint, "#c5e7e1"], [coastPoint, "#f5e2b9"], [(a) => inlandCoastPoint(a, .85), "#abc480"]];
    for (const [point, color] of bands) {
      const shore = Array.from({ length: 145 }, (_, i) => point(i / 144 * Math.PI * 2));
      context.fillStyle = color;
      context.beginPath();
      shore.forEach(([x, z], index) => {
        if (index === 0) context.moveTo(projectX(x), projectZ(z));
        else context.lineTo(projectX(x), projectZ(z));
      });
      context.fill();
    }
    line(SUMMER_PATH, 3.5, "#f5e8c4");
    line(PIER_PATH, 2.4, "#f5e8c4");
    context.fillStyle = "#71b4bd";
    context.beginPath();
    context.ellipse(projectX(POND.x), projectZ(POND.z), POND.rx * scale(), POND.rz * scale(), -.2, 0, Math.PI * 2);
    context.fill();
    line([pierPoint(0, 0), pierPoint(0, PIER.length)].map(({ x, z }) => [x, z]), 5, "#a98462");
    const bridge = ISLAND_BRIDGE;
    line(Array.from({ length: 17 }, (_, i) => {
      const z = bridge.start + (bridge.end - bridge.start) * i / 16;
      return [bridgeCenter(bridge, z), z];
    }), 4, "#e7bbdd");
  }

  function paint(layer) {
    const isSky = layer === "sky";
    bounds = layer === SUMMER ? SUMMER_BOUNDS : isSky ? sky : layer === "practice" ? practice : ground;
    select(undefined);
    for (const { button, position, visibleOn } of facilityMarkers) {
      button.hidden = !visibleOn(layer);
      if (!button.hidden) placeMarker(button, position.x, position.z);
    }
    label.textContent = layer === SUMMER ? SUMMER_NAME : isSky ? "天空群岛" : layer === "practice" ? "练习草地" : "地面";
    context.fillStyle = isSky ? "#dce4f7" : "#e8efdc";
    context.fillRect(0, 0, SIZE, SIZE);
    if (layer === SUMMER) {
      paintIsland();
    } else if (isSky) {
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
      dot(SKY_GATE.x, SKY_GATE.z, 5, "#8b65b2");
      line([[FOREST_BRIDGE.x, FOREST_BRIDGE.start], [FOREST_BRIDGE.x, FOREST_BRIDGE.end]], 4, "#e7bbdd");
    }
  }

  return function update(position, yaw, layer, placements) {
    if (placements !== lastPlacements) {
      lastPlacements = placements;
      for (const entry of facilityMarkers) {
        if (!entry.fixed) continue;
        entry.built = fixedBuilt(placements, entry.id);
        entry.button.dataset.built = entry.built;
        entry.button.setAttribute("aria-label", markerLabel(entry));
      }
      if (selected?.fixed) facilityName.textContent = markerLabel(selected);
    }
    if (layer === currentLayer && position.x === lastX && position.z === lastZ && yaw === lastYaw) return;
    if (layer !== currentLayer) {
      paint(layer);
      currentLayer = layer;
      container.hidden = false;
    }
    lastX = position.x;
    lastZ = position.z;
    lastYaw = yaw;
    placeMarker(marker, position.x, position.z);
    marker.style.transform = `translate(-50%, -50%) rotate(${-yaw}rad)`;
  };
}
