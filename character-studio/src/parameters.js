// The control definitions also define the accepted range of imported values.
const range = (key, label, min, max, step = 0.01) => ({ key, label, min, max, step });
const choice = (key, label, options) => ({ key, label, options });
const color = (key, label) => ({ key, label, type: "color" });

export const sections = {
  body: { title: "身体", controls: [
    range("width", "宽度", 1.1, 2.9), range("height", "高度", 0.85, 2.35),
    range("depth", "厚度", 0.8, 2.1), range("flat", "底部扁平", 0, 1),
    range("lean", "整体倾斜", -0.38, 0.38),
  ] },
  outline: { title: "轮廓", controls: [
    range("lobes", "起伏数量", 1, 7, 1), range("amplitude", "起伏幅度", 0, 0.36),
    range("roundness", "圆润度", 0, 1), range("asymmetry", "不对称", 0, 0.55),
  ] },
  face: { title: "五官", controls: [
    choice("expression", "表情", { calm: "平静", happy: "开心", curious: "好奇", sleepy: "困倦", closed: "闭眼微笑" }),
    range("eyeSize", "眼睛大小", 0.05, 0.17), range("eyeGap", "眼睛间距", 0.16, 0.53),
    range("eyeHeight", "眼睛高度", -0.35, 0.34), range("eyeAspect", "眼睛宽高比", 0.55, 1.4),
    choice("eyeShape", "眼睛形状", { oval: "椭圆", round: "圆润", seed: "水滴" }),
    range("highlight", "高光大小", 0, 0.55), color("eyeColor", "眼睛颜色"),
    range("mouthSize", "嘴巴大小", 0.035, 0.15, 0.005), range("mouthHeight", "嘴巴位置", -0.39, 0.18),
    choice("mouth", "嘴巴形状", { smile: "微笑", round: "圆嘴", small: "轻抿" }),
    color("blushColor", "腮红颜色"), range("blush", "腮红透明度", 0, 0.55),
  ] },
  appendages: { title: "附属结构", controls: [
    choice("crest", "头顶造型", { none: "无凸起", single: "单个云朵凸起", double: "双云朵凸起", feeler: "柔软触角" }),
    range("crestSize", "凸起大小", 0.1, 1), range("crestLength", "凸起长度", 0.1, 1),
    range("crestPosition", "凸起位置", -0.55, 0.55), range("crestBend", "弯曲程度", -1, 1),
    range("crestAsym", "左右不对称", 0, 0.85),
    choice("feet", "四肢", { none: "无四肢", tucked: "隐藏式小脚", short: "短小脚掌" }),
    range("feetSize", "脚掌大小", 0.1, 1), range("feetPosition", "脚掌位置", 0, 1),
    range("feetLength", "脚掌长度", 0.1, 1),
    choice("tail", "尾巴", { none: "无尾巴", puff: "小云团尾巴", flowing: "柔软云尾" }),
    range("tailSize", "尾巴大小", 0.1, 1), range("tailPosition", "尾巴位置", -1, 1),
    range("tailLength", "尾巴长度", 0.1, 1),
  ] },
  material: { title: "材质", controls: [
    color("bodyColor", "身体颜色"), range("roughness", "粗糙度", 0.35, 1),
    range("sheen", "光泽", 0, 0.55), range("glow", "柔和发光", 0, 1),
    { key: "mark", label: "月牙印记", type: "checkbox" }, color("markColor", "月牙颜色"),
    range("markSize", "月牙大小", 0.035, 0.22, 0.005), range("markX", "月牙左右位置", -0.56, 0.56),
    range("markY", "月牙高度", -0.22, 0.53),
  ] },
  animation: { title: "动画", controls: [
    range("speed", "播放速度", 0.25, 2), range("motion", "动作幅度", 0, 1.65),
    range("hover", "悬浮高度", 0, 0.65),
  ] },
};

export const palette = {
  "#fff3e6": "温暖乳白", "#edf0ff": "月光银白", "#f8e4bb": "淡奶油色", "#dce7f0": "极浅灰蓝",
};

export const animations = {
  breathe: "呼吸", blink: "眨眼", float: "漂浮", land: "回弹",
};

const soft = {
  width: 2.38, height: 1.50, depth: 1.45, flat: 0.66, lean: -0.05,
  lobes: 4, amplitude: 0.25, roundness: 0.7, asymmetry: 0.24,
  crest: "none", crestSize: 0.55, crestLength: 0.55, crestPosition: -0.06, crestBend: 0.25, crestAsym: 0.4,
  expression: "calm", eyeSize: 0.12, eyeGap: 0.31, eyeHeight: -0.09, eyeAspect: 0.88, eyeShape: "round",
  highlight: 0.28, eyeColor: "#423746", mouthSize: 0.07, mouthHeight: -0.28, mouth: "smile",
  blushColor: "#d99b91", blush: 0.19,
  feet: "tucked", feetSize: 0.65, feetPosition: 0.42, feetLength: 0.55,
  tail: "none", tailSize: 0.5, tailPosition: 0.25, tailLength: 0.7,
  bodyColor: "#fff3e6", roughness: 0.92, sheen: 0.15, glow: 0.03,
  mark: false, markColor: "#c99546", markSize: 0.112, markX: 0.045, markY: 0.27,
  speed: 1, motion: 1, hover: 0,
};

const floating = {
  ...soft, width: 1.84, height: 1.61, depth: 1.34, flat: 0.03, lean: 0.095,
  lobes: 3, amplitude: 0.21, roundness: 0.64, asymmetry: 0.40,
  crest: "double", crestSize: 0.94, crestLength: 0.74, crestPosition: -0.12, crestBend: 0.38, crestAsym: 0.73,
  expression: "curious", eyeSize: 0.126, eyeShape: "oval", eyeHeight: -0.015, eyeGap: 0.29,
  mouthHeight: -0.275, mouth: "round",
  feet: "none", tail: "flowing", tailSize: 0.71, tailPosition: 0.8, tailLength: 0.89,
  bodyColor: "#faf3e9", glow: 0.07, markX: -0.08, markY: 0.315, hover: 0.33,
};

const variant = (preset, name, description, base, edits = {}) => ({
  name, description, values: { ...base, ...edits, preset },
});

export const presets = {
  ac1: variant("ac1", "初云", "舒展的双肩与圆眼", soft),
  ac2: variant("ac2", "浅眠", "低伏的宽底与困倦眼", soft, {
    width: 2.66, height: 1.18, depth: 1.67, flat: 0.92, lean: 0.08,
    lobes: 3, amplitude: 0.24, asymmetry: 0.43, roundness: 0.56,
    feet: "short", feetPosition: 0.79, feetSize: 0.83, feetLength: 0.74,
    expression: "sleepy", eyeShape: "oval", eyeSize: 0.148, eyeAspect: 1.22, eyeGap: 0.36,
    eyeHeight: 0.03, mouthHeight: -0.30, mouthSize: 0.052, mouth: "small", blush: 0.14,
  }),
  ac3: variant("ac3", "团晴", "斜肩、偏窄身形与眯笑", soft, {
    width: 2.13, height: 1.57, depth: 1.31, flat: 0.46, lean: -0.12,
    lobes: 5, amplitude: 0.34, asymmetry: 0.41, roundness: 0.82,
    feet: "none", expression: "closed", eyeSize: 0.113, eyeAspect: 1.16, eyeGap: 0.22,
    eyeHeight: -0.18, mouthSize: 0.085, mouthHeight: -0.36, blush: 0.29,
  }),
  bd1: variant("bd1", "探云", "偏心云冠与逗号形云尾", floating),
  bd2: variant("bd2", "浮穗", "高挑单峰与长弯尾", floating, {
    width: 1.47, height: 1.83, depth: 1.27, lean: -0.15, lobes: 4, amplitude: 0.17,
    crest: "single", crestSize: 0.78, crestLength: 0.82, crestPosition: 0.39, crestBend: -0.62,
    tailPosition: -0.96, tailSize: 0.54, tailLength: 0.99, hover: 0.39,
    expression: "calm", eyeShape: "seed", eyeSize: 0.113, eyeAspect: 0.82, eyeGap: 0.34,
    eyeHeight: -0.09, mouthSize: 0.061, mouthHeight: -0.295, mouth: "smile", blush: 0.13, mark: true,
  }),
  bd3: variant("bd3", "游絮", "横展云冠与轻短尾", floating, {
    width: 2.12, height: 1.30, depth: 1.10, lean: 0.075, lobes: 5, amplitude: 0.32,
    asymmetry: 0.39, roundness: 0.64, crestSize: 0.82, crestLength: 0.58,
    crestPosition: 0.06, crestAsym: 0.39, crestBend: 0.37,
    tail: "puff", tailPosition: 0.49, tailSize: 0.91, tailLength: 0.79, hover: 0.47,
    expression: "happy", eyeShape: "round", eyeSize: 0.101, eyeAspect: 1, eyeGap: 0.34,
    eyeHeight: -0.045, mouthHeight: -0.32, mouthSize: 0.068, mouth: "smile", blush: 0.26,
  }),
};

export function normalizeParameters(input) {
  const preset = Object.prototype.hasOwnProperty.call(presets, input?.preset) ? input.preset : "ac1";
  const values = { ...presets[preset].values };

  for (const { controls } of Object.values(sections)) {
    for (const control of controls) {
      const { key, type, options, min, max, step } = control;
      const value = input?.[key];
      if (options && typeof value === "string" && Object.prototype.hasOwnProperty.call(options, value)) values[key] = value;
      if (type === "checkbox" && typeof value === "boolean") values[key] = value;
      if (type === "color" && typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) {
        values[key] = value.toLowerCase();
      }
      if (step && typeof value === "number" && Number.isFinite(value)) {
        values[key] = Number(Math.min(max, Math.max(min, min + Math.round((value - min) / step) * step)).toFixed(3));
      }
    }
  }
  return values;
}
