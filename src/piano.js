import { NOTES, MELODIES, checkNote } from "./piano-rules.js";

export function createPiano(dialog, { audio, progress, onNote, onClear, onComplete, onClose }) {
  const status = dialog.querySelector("#piano-status");
  const free = dialog.querySelector("#piano-free");
  const challenge = dialog.querySelector("#piano-challenge");
  const levels = dialog.querySelector("#piano-level");
  const replay = dialog.querySelector("#piano-replay");
  const options = dialog.querySelector(".piano-challenge-options");
  const stars = dialog.querySelector(".piano-stars");
  const noteButtons = NOTES.map(({ name, pitch, color }, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "piano-note";
    button.style.setProperty("--note", "#" + color.toString(16).padStart(6, "0"));
    button.textContent = name;
    const heading = document.createElement("small");
    heading.textContent = pitch;
    button.append(heading);
    button.addEventListener("click", () => press(index));
    dialog.querySelector(".piano-keys").append(button);
    return button;
  });

  let mode = "free";
  let level = 0;
  let position = 0;
  let fullRun = false;
  let timer;
  let generation = 0;
  const flashes = new Map();

  function updateMenu() {
    free.setAttribute("aria-pressed", String(mode === "free"));
    challenge.setAttribute("aria-pressed", String(mode !== "free"));
    options.hidden = mode === "free";
    for (const [index, option] of Array.from(levels.options).entries()) {
      option.disabled = index >= progress.unlocked;
    }
    levels.value = level;
    levels.disabled = mode === "demo";
    replay.disabled = mode === "demo";
    noteButtons.forEach((button) => { button.disabled = !["free", "input"].includes(mode); });
  }

  function clear() {
    generation++;
    clearTimeout(timer);
    for (const [index, timeout] of flashes) {
      clearTimeout(timeout);
      noteButtons[index].classList.remove("playing");
    }
    flashes.clear();
    stars.hidden = true;
    audio.stopPiano();
    onClear();
  }

  function sound(index, gesture = false) {
    if (gesture) {
      const current = generation;
      const ready = audio.activate();
      ready.then((running) => {
        if (running && dialog.open && current === generation) audio.note(NOTES[index].frequency);
      });
    } else {
      audio.note(NOTES[index].frequency);
    }
    onNote(index);
    const button = noteButtons[index];
    button.classList.add("playing");
    clearTimeout(flashes.get(index));
    flashes.set(index, setTimeout(() => {
      button.classList.remove("playing");
      flashes.delete(index);
    }, 370));
  }

  function startLevel() {
    clear();
    mode = "demo";
    position = 0;
    updateMenu();
    const melody = MELODIES[level];
    status.textContent = "第 " + (level + 1) + " 关 · 先听这段 " + melody.length + " 音旋律";
    function demo(index) {
      if (index < melody.length) {
        sound(melody[index]);
        timer = setTimeout(() => demo(index + 1), 610);
      } else {
        mode = "input";
        status.textContent = "轮到你了 · 0 / " + melody.length;
        updateMenu();
      }
    }
    timer = setTimeout(() => demo(0), 400);
  }

  function freePlay() {
    clear();
    mode = "free";
    status.textContent = "轻触琴键，弹出自己的旋律。";
    updateMenu();
  }

  function press(index) {
    if (mode !== "free" && mode !== "input") return;
    sound(index, true);
    if (mode === "free") return;
    const result = checkNote(level, position, index);
    if (result === "retry") {
      mode = "retry";
      status.textContent = "差一点。可以再听一遍，按自己的节奏来。";
      updateMenu();
      return;
    }
    position++;
    if (result === "next") {
      status.textContent = "轮到你了 · " + position + " / " + MELODIES[level].length;
      return;
    }

    const reward = onComplete(level, fullRun);
    stars.hidden = false;
    mode = "complete";
    if (level < MELODIES.length - 1) {
      status.textContent = "第 " + (level + 1) + " 关完成！准备好后进入下一关。";
      replay.textContent = "下一关";
    } else {
      status.textContent = reward.claimed
        ? "三关全部完成！" + (reward.energy ? " 月光能量 +" + Math.round(reward.energy * 10) / 10 : " 月光能量已满。")
        : fullRun ? "三关全部完成！今天的奖励已领取。" : "第 3 关完成！从第 1 关连过三关即可领取每日奖励。";
      replay.textContent = "从第一关开始";
    }
    updateMenu();
  }

  function begin() {
    void audio.activate();
    level = 0;
    fullRun = true;
    replay.textContent = "重听旋律";
    startLevel();
  }

  free.addEventListener("click", () => { void audio.activate(); freePlay(); });
  challenge.addEventListener("click", begin);
  replay.addEventListener("click", () => {
    if (mode === "complete" && level === MELODIES.length - 1) return begin();
    void audio.activate();
    if (mode === "complete") level++;
    replay.textContent = "重听旋律";
    startLevel();
  });
  levels.addEventListener("change", () => {
    void audio.activate();
    level = Number(levels.value);
    fullRun = level === 0;
    replay.textContent = "重听旋律";
    startLevel();
  });
  dialog.querySelector("#piano-exit").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { clear(); onClose(); });

  return {
    open() {
      if (dialog.open) return;
      void audio.activate();
      freePlay();
      dialog.showModal();
    },
    close() { if (dialog.open) dialog.close(); },
    interrupt() {
      if (!dialog.open) return;
      clear();
      if (mode !== "demo") return;
      mode = "retry";
      status.textContent = "演示已暂停，轻触「重听旋律」继续。";
      updateMenu();
    },
  };
}
