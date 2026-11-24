import "./studio.css";
import { animations, normalizeParameters, palette, presets, sections } from "./parameters.js";
import { createPreview } from "./preview.js";
import { createMoonModel } from "./moon-model.js";

const byId = (id) => document.getElementById(id);
const storageKey = "cloudhaven.character-studio.v1";
const format = "cloudhaven-character-studio";

function readStorage() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || {};
  } catch {
    return {};
  }
}

const saved = readStorage();
let values = normalizeParameters(saved.current);
let currentName = typeof saved.currentName === "string" ? saved.currentName.slice(0, 48) : "";
let schemes = Array.isArray(saved.schemes) ? saved.schemes.filter(
  (entry) => entry && typeof entry.id === "string" && typeof entry.name === "string" && entry.values,
).map((entry) => ({ id: entry.id, name: entry.name.slice(0, 48), values: normalizeParameters(entry.values) })) : [];
let selectedAnimation = "breathe";
let saveTimer;
let messageTimer;
let pendingUpdate = 0;
let comparing = false;
const comparisonIds = new Set();
const fields = new Map();
const tabs = new Map();
const presetButtons = new Map();
const motionButtons = new Map();
const angleButtons = [...document.querySelectorAll("[data-angle]")];
let colorPreset;
let preview;

try {
  preview = createPreview(byId("viewport"), values, () => {
    setPressed(byId("auto-spin"), false);
    angleButtons.forEach((button) => setPressed(button, false));
  });
} catch (error) {
  console.error("Character Studio preview failed", error);
  byId("render-error").hidden = false;
  byId("snapshot").disabled = true;
}

function setPressed(button, state) {
  button.setAttribute("aria-pressed", String(state));
}

function announce(message) {
  const toast = byId("status");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function persist() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(storageKey, JSON.stringify({ current: values, currentName, schemes }));
    return true;
  } catch {
    announce("当前浏览器无法写入本地存储。可以导出 JSON 保留方案。");
    return false;
  }
}

function scheduleUpdate() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 180);
  if (!pendingUpdate) {
    pendingUpdate = requestAnimationFrame(() => {
      pendingUpdate = 0;
      preview?.setParameters(values);
    });
  }
}

function makeButton(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  return button;
}

function changeParameter(key, value) {
  values = { ...values, [key]: value };
  if (key === "bodyColor") syncPalette();
  scheduleUpdate();
}

function syncPalette() {
  colorPreset.value = Object.prototype.hasOwnProperty.call(palette, values.bodyColor) ? values.bodyColor : "custom";
}

function appendControl(container, control) {
  const { key, label, options, type, min, max, step } = control;
  const row = document.createElement("div");
  const fieldLabel = document.createElement("label");
  const id = "field-" + key;
  fieldLabel.htmlFor = id;
  fieldLabel.textContent = label;
  const field = document.createElement(options ? "select" : "input");
  field.id = id;
  row.className = step ? "field" : "field field-inline";
  let output;
  if (options) {
    for (const [value, name] of Object.entries(options)) field.add(new Option(name, value));
  } else {
    field.type = type || "range";
  }
  if (step) {
    field.min = min;
    field.max = max;
    field.step = step;
    output = document.createElement("output");
    output.htmlFor = id;
    const headline = document.createElement("div");
    headline.className = "field-top";
    headline.append(fieldLabel, output);
    row.append(headline, field);
  } else {
    row.append(fieldLabel, field);
  }
  field.addEventListener("input", () => {
    const value = type === "checkbox" ? field.checked : step ? field.valueAsNumber : field.value;
    if (output) output.textContent = value;
    changeParameter(key, value);
  });
  fields.set(key, { field, output });
  container.append(row);
}

function selectTab(id, focus = false) {
  for (const [key, { button, panel }] of tabs) {
    const active = key === id;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    panel.hidden = !active;
    if (active && focus) button.focus();
  }
  byId("parameter-panels").scrollTop = 0;
}

for (const [key, section] of Object.entries(sections)) {
  const tab = makeButton(section.title);
  tab.id = "tab-" + key;
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-controls", "panel-" + key);
  tab.addEventListener("click", () => selectTab(key));
  tab.addEventListener("keydown", (event) => {
    const keys = Object.keys(sections);
    const index = keys.indexOf(key);
    const next = {
      ArrowLeft: (index + keys.length - 1) % keys.length,
      ArrowRight: (index + 1) % keys.length,
      Home: 0,
      End: keys.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    selectTab(keys[next], true);
  });
  byId("parameter-tabs").append(tab);
  const panel = document.createElement("section");
  panel.className = "parameter-panel";
  panel.id = "panel-" + key;
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-labelledby", tab.id);
  const heading = document.createElement("div");
  heading.className = "section-heading";
  const title = document.createElement("h3");
  title.textContent = section.title + "参数";
  const reset = makeButton("恢复默认");
  reset.className = "quiet";
  reset.addEventListener("click", () => {
    for (const { key: name } of section.controls) values[name] = presets[values.preset].values[name];
    syncControls();
    scheduleUpdate();
    announce("已恢复" + section.title + "参数");
  });
  heading.append(title, reset);
  panel.append(heading);
  const group = document.createElement("div");
  group.className = "fields";
  if (key === "material") {
    const row = document.createElement("div");
    row.className = "field field-inline";
    const label = document.createElement("label");
    label.textContent = "基础色彩";
    label.htmlFor = "color-preset";
    colorPreset = document.createElement("select");
    colorPreset.id = label.htmlFor;
    for (const [value, name] of Object.entries(palette)) colorPreset.add(new Option(name, value));
    colorPreset.add(new Option("自定义颜色", "custom"));
    colorPreset.addEventListener("change", () => {
      const { field } = fields.get("bodyColor");
      if (colorPreset.value === "custom") field.focus();
      else {
        changeParameter("bodyColor", colorPreset.value);
        field.value = values.bodyColor;
      }
    });
    row.append(label, colorPreset);
    group.append(row);
  }
  for (const control of section.controls) appendControl(group, control);
  panel.append(group);
  byId("parameter-panels").append(panel);
  tabs.set(key, { button: tab, panel });
}

const familyName = (key) => key.startsWith("ac") ? "软云幼崽" : "浮云幼灵";
for (const prefix of ["ac", "bd"]) {
  const group = document.createElement("div");
  group.className = "preset-family";
  const title = document.createElement("h4");
  title.textContent = prefix.toUpperCase() + " · " + familyName(prefix);
  group.append(title);
  const options = document.createElement("div");
  options.className = "preset-family-options";
  group.append(options);
  for (const [key, preset] of Object.entries(presets)) {
    if (!key.startsWith(prefix)) continue;
    const button = makeButton("");
    const name = document.createElement("strong");
    name.textContent = preset.name;
    const code = document.createElement("small");
    code.textContent = key.toUpperCase();
    button.title = preset.description;
    button.append(name, code);
    button.addEventListener("click", () => loadPreset(key));
    presetButtons.set(key, button);
    options.append(button);
    for (const id of ["preset-left", "preset-right"]) {
      byId(id).add(new Option(key.toUpperCase() + " · " + preset.name, key));
    }
  }
  byId("preset-options").append(group);
}
byId("preset-right").value = "bd1";

for (const [key, label] of Object.entries(animations)) {
  const button = makeButton(label);
  button.addEventListener("click", () => playAnimation(key));
  motionButtons.set(key, button);
  byId("motion-buttons").append(button);
}

function syncControls() {
  for (const [key, { field, output }] of fields) {
    if (field.type === "checkbox") field.checked = values[key];
    else field.value = values[key];
    if (output) output.textContent = values[key];
  }
  syncPalette();
  for (const [key, button] of presetButtons) setPressed(button, key === values.preset);
  for (const [key, button] of motionButtons) setPressed(button, key === selectedAnimation);
  const base = presets[values.preset];
  byId("view-name").textContent = comparing ? "并排对比" : currentName || base.name;
  byId("stage-name").textContent = currentName || base.name;
  byId("stage-english").textContent = values.preset.toUpperCase() + " · " + familyName(values.preset) + " · " + base.description;
}

function playAnimation(key) {
  selectedAnimation = key;
  preview?.play(key);
  for (const [name, button] of motionButtons) setPressed(button, name === key);
}

function applyValues(next, name = "") {
  stopComparison();
  values = normalizeParameters(next);
  currentName = name;
  selectedAnimation = "breathe";
  preview?.play("breathe");
  syncControls();
  scheduleUpdate();
}

function loadPreset(key) {
  applyValues(presets[key].values);
}

byId("preset-reset").addEventListener("click", () => {
  loadPreset(values.preset);
  announce("已恢复基础预设");
});

byId("inspector-toggle").addEventListener("click", () => {
  const content = byId("inspector-content");
  content.hidden = !content.hidden;
  byId("inspector-toggle").setAttribute("aria-expanded", String(!content.hidden));
  byId("inspector-toggle").textContent = content.hidden ? "展开" : "收起";
});
byId("animation-settings").addEventListener("click", () => {
  if (byId("inspector-content").hidden) byId("inspector-toggle").click();
  selectTab("animation", true);
});

function toggle(id, action) {
  const button = byId(id);
  button.addEventListener("click", () => {
    const enabled = button.getAttribute("aria-pressed") !== "true";
    setPressed(button, enabled);
    action(enabled);
  });
}

toggle("auto-spin", (enabled) => {
  preview?.setAuto(enabled);
  if (enabled) angleButtons.forEach((button) => setPressed(button, false));
});
toggle("ground-toggle", (enabled) => preview?.setGround(enabled));
toggle("background-toggle", (enabled) => {
  byId("stage").classList.toggle("no-background", !enabled);
  preview?.setBackground(enabled);
});
for (const button of angleButtons) {
  button.addEventListener("click", () => {
    const angle = button.dataset.angle;
    for (const view of angleButtons) setPressed(view, view.dataset.angle === (angle === "reset" ? "front" : angle));
    setPressed(byId("auto-spin"), false);
    preview?.setAngle(angle);
  });
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function filename(name, extension) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").slice(0, 48) + "." + extension;
}

byId("snapshot").addEventListener("click", () => {
  preview?.snapshot((blob) => {
    if (blob) download(blob, filename(comparing ? "Character-Studio-对比" : currentName || presets[values.preset].name, "png"));
    else announce("截图失败，请重试");
  });
});

byId("export-glb").addEventListener("click", async () => {
  const button = byId("export-glb");
  const parameters = values;
  const name = currentName || presets[values.preset].name;
  let model;
  button.disabled = true;
  try {
    const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
    // Export an unanimated instance with its own materials and textures.
    model = createMoonModel(parameters);
    model.root.name = name;
    const contents = await new GLTFExporter().parseAsync(model.root, { binary: true, maxTextureSize: 1024 });
    download(new Blob([contents], { type: "model/gltf-binary" }), filename(name, "glb"));
    announce("已导出静态 GLB");
  } catch (error) {
    console.error("GLB export failed", error);
    announce("GLB 导出失败，请重试");
  } finally {
    model?.dispose();
    button.disabled = false;
  }
});

function openDialog(id) {
  const dialog = byId(id);
  if (typeof dialog.showModal === "function") dialog.showModal();
  else {
    dialog.setAttribute("open", "");
    dialog.classList.add("dialog-fallback");
    dialog.querySelector("button")?.focus();
  }
}

function closeDialog(id) {
  const dialog = byId(id);
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

for (const button of document.querySelectorAll("[data-close]")) {
  button.addEventListener("click", () => closeDialog(button.dataset.close));
}

function addScheme(name, parameters) {
  const random = new Uint32Array(3);
  crypto.getRandomValues(random);
  const id = Array.from(random, (part) => part.toString(36)).join("-");
  schemes = [...schemes, { id, name, values: { ...parameters } }];
}

byId("save-open").addEventListener("click", () => {
  byId("scheme-name").value = currentName || presets[values.preset].name;
  openDialog("save-dialog");
  byId("scheme-name").select();
});

byId("save-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = byId("scheme-name").value.trim();
  if (!name) {
    byId("scheme-name").focus();
    return;
  }
  addScheme(name, values);
  currentName = name;
  closeDialog("save-dialog");
  renderLibrary();
  syncControls();
  if (persist()) announce("已保存「" + name + "」");
});

function updateCompareButton() {
  byId("compare-open").disabled = !preview || comparisonIds.size !== 2;
  byId("library-feedback").textContent = schemes.length
    ? `请选择两个方案进行对比（已选 ${comparisonIds.size} 个）`
    : "保存角色后，方案会显示在这里。";
  for (const checkbox of byId("scheme-list").querySelectorAll("input")) {
    checkbox.disabled = comparisonIds.size === 2 && !checkbox.checked;
  }
}

function renderLibrary() {
  const list = byId("scheme-list");
  list.replaceChildren();
  byId("scheme-count").textContent = schemes.length;
  for (const scheme of schemes) {
    const row = document.createElement("li");
    row.className = "scheme-row";
    const label = document.createElement("label");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = comparisonIds.has(scheme.id);
    check.addEventListener("change", () => {
      if (check.checked) comparisonIds.add(scheme.id);
      else comparisonIds.delete(scheme.id);
      updateCompareButton();
    });
    const name = document.createElement("span");
    name.textContent = scheme.name;
    label.append(check, name);
    const actions = document.createElement("div");
    const load = makeButton("载入");
    load.addEventListener("click", () => {
      closeDialog("library-dialog");
      applyValues(scheme.values, scheme.name);
    });
    const copy = makeButton("复制");
    copy.addEventListener("click", () => {
      addScheme(scheme.name.slice(0, 43) + " 副本", scheme.values);
      const copied = persist();
      renderLibrary();
      if (copied) byId("library-feedback").textContent = "已复制「" + scheme.name + "」";
    });
    const remove = makeButton("删除");
    remove.addEventListener("click", () => {
      if (!confirm("删除「" + scheme.name + "」？")) return;
      if (comparisonIds.has(scheme.id)) stopComparison();
      comparisonIds.delete(scheme.id);
      schemes = schemes.filter((entry) => entry.id !== scheme.id);
      persist();
      renderLibrary();
    });
    for (const action of [load, copy, remove]) action.setAttribute("aria-label", action.textContent + "「" + scheme.name + "」");
    actions.append(load, copy, remove);
    row.append(label, actions);
    list.append(row);
  }
  updateCompareButton();
}

function stopComparison() {
  if (!comparing) return;
  comparing = false;
  preview?.compare([]);
  byId("compare-labels").hidden = true;
  byId("compare-exit").hidden = true;
  byId("stage-caption").hidden = false;
  byId("stage").classList.remove("comparing");
  syncControls();
}

byId("library-open").addEventListener("click", () => {
  renderLibrary();
  openDialog("library-dialog");
});
function startComparison(chosen) {
  if (!preview || chosen.length !== 2 || chosen.some((entry) => !entry)) return;
  comparing = true;
  preview.compare(chosen.map((entry) => entry.values));
  angleButtons.find((button) => button.dataset.angle === "reset").click();
  byId("compare-left").textContent = chosen[0].name;
  byId("compare-right").textContent = chosen[1].name;
  byId("compare-labels").hidden = false;
  byId("compare-exit").hidden = false;
  byId("stage-caption").hidden = true;
  byId("stage").classList.add("comparing");
  syncControls();
  byId("stage").scrollIntoView({ block: "nearest" });
}

byId("compare-open").addEventListener("click", () => {
  const chosen = [...comparisonIds].map((id) => schemes.find((scheme) => scheme.id === id));
  closeDialog("library-dialog");
  startComparison(chosen);
});
byId("compare-presets").disabled = !preview;
byId("compare-presets").addEventListener("click", () => {
  closeDialog("library-dialog");
  openDialog("preset-compare-dialog");
});
byId("preset-compare-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const keys = ["preset-left", "preset-right"].map((id) => byId(id).value);
  if (keys[0] === keys[1]) {
    announce("请选择不同的两个预设");
    return;
  }
  closeDialog("preset-compare-dialog");
  startComparison(keys.map((key) => ({
    name: key.toUpperCase() + " · " + presets[key].name,
    values: presets[key].values,
  })));
});
byId("compare-exit").addEventListener("click", stopComparison);

byId("export-current").addEventListener("click", () => {
  const name = currentName || presets[values.preset].name;
  const json = JSON.stringify({ format, version: 1, name, parameters: values }, null, 2);
  download(new Blob([json], { type: "application/json" }), filename(name, "json"));
});
byId("import-open").addEventListener("click", () => byId("import-file").click());
byId("import-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > 512 * 1024) throw new Error("File exceeds size limit");
    const imported = JSON.parse(await file.text());
    if (imported?.format !== format || imported.version !== 1
      || !Object.prototype.hasOwnProperty.call(presets, imported.parameters?.preset)) {
      throw new Error("Unsupported schema");
    }
    const name = typeof imported.name === "string" ? imported.name.trim().slice(0, 48) : "";
    closeDialog("library-dialog");
    applyValues(imported.parameters, name);
    if (persist()) announce("已导入方案");
  } catch {
    byId("library-feedback").textContent = "无法导入。请选择 Character Studio 导出的 JSON 参数文件。";
  }
});

window.addEventListener("pagehide", persist);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && saveTimer) persist();
});
selectTab("body");
syncControls();
renderLibrary();
