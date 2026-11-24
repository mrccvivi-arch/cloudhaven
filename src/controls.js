const keysByDirection = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

export function createControls({ canvas, joystick, jumpButton, onJump, onInteract, onTap, onLook, onZoom, onSettle, isPaused }) {
  const stick = joystick.querySelector("span");
  const keys = new Set();
  let movePointer;
  let lookPointer;
  let tap;
  const cameraTouches = new Map();
  let pinching = false;
  let pinchSpan = 0;
  let lastX;
  let lastY;
  let stickX = 0;
  let stickZ = 0;

  function moveStick(event) {
    const rect = joystick.getBoundingClientRect();
    const radius = rect.width * .34;
    stickX = (event.clientX - rect.left - rect.width / 2) / radius;
    stickZ = (event.clientY - rect.top - rect.height / 2) / radius;
    const magnitude = Math.max(1, Math.hypot(stickX, stickZ));
    stickX /= magnitude;
    stickZ /= magnitude;
    stick.style.transform = `translate(${stickX * radius}px, ${stickZ * radius}px)`;
  }

  joystick.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || movePointer !== undefined || isPaused()) return;
    movePointer = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    moveStick(event);
  });
  joystick.addEventListener("pointermove", (event) => {
    if (movePointer === event.pointerId) moveStick(event);
  });

  function touchSpan() {
    if (cameraTouches.size !== 2) return 0;
    const [first, second] = cameraTouches.values();
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || isPaused()) return;
    if (event.pointerType === "touch") {
      cameraTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      if (cameraTouches.size >= 2) {
        pinching = true;
        pinchSpan = touchSpan();
        tap = undefined;
        lookPointer = undefined;
      }
      if (pinching) return;
    }
    if (!tap) tap = { id: event.pointerId, x: event.clientX, y: event.clientY };
    if (lookPointer !== undefined ||
        (event.pointerType === "touch" && event.clientX < canvas.clientWidth / 2)) return;
    lookPointer = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    if (event.pointerType !== "touch") canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("wheel", (event) => {
    if (isPaused()) return;
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
    onZoom(Math.max(-.32, Math.min(.32, pixels * .0018)));
  }, { passive: false });

  canvas.addEventListener("pointermove", (event) => {
    const position = cameraTouches.get(event.pointerId);
    if (position) {
      position.x = event.clientX;
      position.y = event.clientY;
    }
    if (pinching) {
      if (position && !isPaused()) {
        const span = touchSpan();
        if (span > 10 && pinchSpan > 10) onZoom(Math.log(pinchSpan / span));
        pinchSpan = span;
      }
      return;
    }
    if (tap?.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) tap = undefined;
    if (lookPointer !== event.pointerId) return;
    onLook(event.clientX - lastX, event.clientY - lastY);
    lastX = event.clientX;
    lastY = event.clientY;
  });

  function clearStick() {
    movePointer = undefined;
    stickX = stickZ = 0;
    stick.style.transform = "";
  }

  for (const eventName of ["pointerup", "lostpointercapture", "pointercancel"]) {
    joystick.addEventListener(eventName, (event) => {
      if (movePointer !== event.pointerId) return;
      clearStick();
      onSettle();
    });
    canvas.addEventListener(eventName, (event) => {
      if (cameraTouches.delete(event.pointerId) && pinching) {
        pinchSpan = touchSpan();
        if (!cameraTouches.size) {
          pinching = false;
          onSettle();
        }
        return;
      }
      if (tap?.id === event.pointerId) {
        const stationary = Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= 8;
        tap = undefined;
        if (eventName === "pointerup" && stationary && !isPaused()) onTap(event.clientX, event.clientY);
      }
      if (lookPointer !== event.pointerId) return;
      lookPointer = undefined;
      onSettle();
    });
  }

  jumpButton.addEventListener("pointerdown", (event) => {
    if (event.button === 0 && !isPaused()) onJump();
  });
  jumpButton.addEventListener("click", (event) => {
    if (event.detail === 0 && !isPaused()) onJump();
  });
  window.addEventListener("keydown", (event) => {
    if (isPaused() || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.code === "Space" && document.activeElement?.tagName === "BUTTON") return;
    if (keysByDirection[event.code]) {
      event.preventDefault();
      keys.add(event.code);
    } else if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) onJump();
    } else if (event.code === "KeyE" && !event.repeat) onInteract();
  });
  window.addEventListener("keyup", (event) => {
    if (keys.delete(event.code)) onSettle();
  });

  function clear() {
    keys.clear();
    cameraTouches.clear();
    pinching = false;
    pinchSpan = 0;
    tap = undefined;
    clearStick();
    lookPointer = undefined;
  }
  window.addEventListener("blur", () => {
    clear();
    onSettle();
  });

  return {
    clear,
    get interacting() {
      return keys.size > 0 || movePointer !== undefined || lookPointer !== undefined ||
        tap !== undefined || cameraTouches.size > 0;
    },
    movement() {
      let x = stickX, z = stickZ;
      for (const key of keys) {
        x += keysByDirection[key][0];
        z += keysByDirection[key][1];
      }
      const scale = Math.max(1, Math.hypot(x, z));
      return [x / scale, z / scale];
    },
  };
}
