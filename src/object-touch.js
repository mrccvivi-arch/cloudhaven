import { MathUtils, Mesh, MeshBasicMaterial, BackSide, Raycaster, Vector2, Vector3 } from "three";

const tapOffsets = [[-1, 0], [1, 0], [0, -1], [0, 1], [-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]];

export function createObjectTap(camera, occludes, padding) {
  const nearbyRay = new Raycaster();
  const point = new Vector2();
  return (rect, pointer, ray, avatarHit, target, layer) => {
    const exact = ray.intersectObject(target, true)[0];
    if (exact) return exact.distance < (avatarHit?.distance ?? Infinity) &&
      !occludes(ray, layer, exact.distance, target);
    if (avatarHit) return false;
    const padX = padding * 2 / rect.width, padY = padding * 2 / rect.height;
    return tapOffsets.some(([dx, dy]) => {
      point.set(pointer.x + dx * padX, pointer.y + dy * padY);
      nearbyRay.setFromCamera(point, camera);
      const nearby = nearbyRay.intersectObject(target, true)[0];
      return nearby && !occludes(ray, layer, nearby.distance, target) &&
        !occludes(nearbyRay, layer, nearby.distance, target);
    });
  };
}

export function createObjectTutorial(element, camera, occludes, labelLift = 0) {
  const sight = new Raycaster();
  const anchor = new Vector3(), projection = new Vector3();
  let checkAt = 0, unobstructed = false;
  return (eligible, position, target, layer, time) => {
    let show = eligible;
    if (show) {
      camera.updateMatrixWorld();
      anchor.copy(position);
      anchor.y += .04;
      projection.copy(anchor).project(camera);
      show = Math.abs(projection.x) < .92 && Math.abs(projection.y) < .86 && Math.abs(projection.z) <= 1;
      if (show && time >= checkAt) {
        checkAt = time + 100;
        anchor.sub(camera.position);
        const distance = anchor.length();
        sight.set(camera.position, anchor.divideScalar(distance));
        unobstructed = !occludes(sight, layer, distance, target);
      }
      show &&= unobstructed;
      if (show) {
        element.style.left = ((projection.x + 1) * 50).toFixed(2) + "%";
        element.style.top = ((1 - projection.y) * 50).toFixed(2) + "%";
        if (labelLift) {
          anchor.copy(position);
          anchor.y += labelLift;
          anchor.project(camera);
          element.style.setProperty("--tutorial-label-lift", Math.max(0, (anchor.y - projection.y) * 50).toFixed(2) + "vh");
        }
      }
    } else {
      checkAt = 0;
    }
    element.classList.toggle("visible", show);
    return show;
  };
}

export function addTutorialGlow(mesh, scale) {
  // An expanded back-face pass leaves only the object's silhouette visible.
  const outline = new Mesh(mesh.geometry, new MeshBasicMaterial({
    color: 0xffedbf, side: BackSide, transparent: true, opacity: 0, depthWrite: false,
  }));
  outline.position.copy(mesh.position);
  outline.rotation.copy(mesh.rotation);
  outline.scale.copy(mesh.scale).multiplyScalar(scale);
  outline.userData.ignoreTouchOcclusion = true;
  outline.raycast = () => {};
  outline.visible = false;
  mesh.parent.add(outline);
  let opacity = 0;
  return (visible, elapsed, time) => {
    opacity = MathUtils.damp(opacity, visible ? 1 : 0, 11, elapsed);
    outline.visible = opacity > .015;
    outline.material.opacity = opacity * (.55 + Math.sin(time * 2.1) * .24);
  };
}
