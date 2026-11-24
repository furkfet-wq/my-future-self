import { useEffect, useRef } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { sfx } from "../lib/sound.js";

// Carbon fibre Rubik's cube. The cube itself never spins: only its layers (3x3 slices) turn,
// one at a time, while the whole cube floats slowly up and down.

const SP = 1.04; // distance between cubie centres

// 2x2 twill weave drawn on a canvas, used as colour map and bump map.
function carbonCanvas(cells, bright) {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.fillStyle = "#030303";
  g.fillRect(0, 0, S, S);
  const s = S / cells;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const horiz = ((((j - i) % 4) + 4) % 4) < 2;
      const x = j * s;
      const y = i * s;
      const gr = horiz ? g.createLinearGradient(0, y, 0, y + s) : g.createLinearGradient(x, 0, x + s, 0);
      gr.addColorStop(0, "#080808");
      gr.addColorStop(0.5, bright);
      gr.addColorStop(1, "#080808");
      g.fillStyle = gr;
      g.fillRect(x + 1, y + 1, s - 2, s - 2);
      // fine strand lines
      g.strokeStyle = "rgba(0,0,0,0.35)";
      g.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        g.beginPath();
        if (horiz) {
          g.moveTo(x + 1, y + (s * k) / 4);
          g.lineTo(x + s - 1, y + (s * k) / 4);
        } else {
          g.moveTo(x + (s * k) / 4, y + 1);
          g.lineTo(x + (s * k) / 4, y + s - 1);
        }
        g.stroke();
      }
    }
  }
  return c;
}

function glowCanvas() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, "rgba(255,255,255,0.9)");
  gr.addColorStop(0.35, "rgba(255,255,255,0.25)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  return c;
}

export default function RubikHero() {
  const host = useRef(null);

  useEffect(() => {
    const el = host.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      el.classList.add("rk-off");
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    const camDir = new THREE.Vector3(6, 4.6, 7.2).normalize();

    // ---- materials ----
    const disposables = [envTex, pmrem];
    const makeTex = (canvas, color, rot) => {
      const t = new THREE.CanvasTexture(canvas);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      t.center.set(0.5, 0.5);
      t.rotation = rot;
      if (color) t.colorSpace = THREE.SRGBColorSpace;
      disposables.push(t);
      return t;
    };
    const tileCanvas = carbonCanvas(12, "#2e2e2e");
    const bodyCanvas = carbonCanvas(8, "#161616");
    const tileMat = new THREE.MeshPhysicalMaterial({
      map: makeTex(tileCanvas, true, Math.PI / 4),
      bumpMap: makeTex(tileCanvas, false, Math.PI / 4),
      bumpScale: 1.4,
      roughness: 0.38,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 0.65,
      color: 0x6e6e6e,
    });
    const bodyMat = new THREE.MeshPhysicalMaterial({
      map: makeTex(bodyCanvas, true, 0),
      bumpMap: makeTex(bodyCanvas, false, 0),
      bumpScale: 0.8,
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.15,
      color: 0x2e2e2e,
      envMapIntensity: 0.7,
    });
    disposables.push(tileMat, bodyMat);

    const bodyGeo = new RoundedBoxGeometry(0.98, 0.98, 0.98, 4, 0.09);
    const tileGeo = new RoundedBoxGeometry(0.84, 0.84, 0.03, 2, 0.012);
    disposables.push(bodyGeo, tileGeo);

    // ---- build 27 cubies ----
    const cube = new THREE.Group();
    const shell = new THREE.Group(); // shakes and lunges; the cube inside keeps its own turn
    scene.add(shell);
    shell.add(cube);
    const cubies = [];
    const faces = [
      { axis: "x", sign: 1, rot: [0, Math.PI / 2, 0] },
      { axis: "x", sign: -1, rot: [0, -Math.PI / 2, 0] },
      { axis: "y", sign: 1, rot: [-Math.PI / 2, 0, 0] },
      { axis: "y", sign: -1, rot: [Math.PI / 2, 0, 0] },
      { axis: "z", sign: 1, rot: [0, 0, 0] },
      { axis: "z", sign: -1, rot: [0, Math.PI, 0] },
    ];
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const c = new THREE.Group();
          c.position.set(x * SP, y * SP, z * SP);
          c.add(new THREE.Mesh(bodyGeo, bodyMat));
          const at = { x, y, z };
          for (const f of faces) {
            if (at[f.axis] !== f.sign) continue;
            const tile = new THREE.Mesh(tileGeo, tileMat);
            tile.rotation.set(...f.rot);
            tile.position[f.axis] = f.sign * 0.495;
            c.add(tile);
          }
          cube.add(c);
          cubies.push(c);
        }
      }
    }

    // ---- lights ----
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(5, 7, 6);
    const rim = new THREE.DirectionalLight(0xffffff, 1.6);
    rim.position.set(-6, 2, -5);
    const sweep = new THREE.PointLight(0xffffff, 26, 20, 2);
    scene.add(key, rim, sweep, new THREE.AmbientLight(0xffffff, 0.15));
    // red alarm light (off unless a prayer alarm is ringing)
    const red = new THREE.PointLight(0xff1a1a, 0, 22, 1.6);
    scene.add(red);

    // soft light pool under the cube
    const glowTex = new THREE.CanvasTexture(glowCanvas());
    const glowMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.2,
    });
    const glowGeo = new THREE.PlaneGeometry(6.5, 6.5);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -2.7;
    scene.add(glow);
    disposables.push(glowTex, glowMat, glowGeo);

    // ---- sizing ----
    function resize() {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      const dist = 12.2 * Math.max(1, 1.25 / camera.aspect);
      camera.position.copy(camDir).multiplyScalar(dist);
      camera.lookAt(0, -0.15, 0);
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // ---- layer turns ----
    let alive = true;
    let lastTurn = null;
    let turnTween = null;
    let waitCall = null;
    let turning = false;
    // Frenzy: on "mfs:celebrate" the layers turn faster and faster, then "mfs:frenzy-done" fires.
    let frenzy = null;
    let alarmOn = false;
    const CALM_DUR = 1.9;
    const CALM_GAP = 0.77;

    function next() {
      if (!alive) return;
      if (alarmOn) return turn();
      if (frenzy) {
        if (frenzy.left > 0) return turn();
        frenzy = null;
        sweep.intensity = 26;
        window.dispatchEvent(new Event("mfs:frenzy-done"));
        waitCall = gsap.delayedCall(1.2, turn);
        return;
      }
      waitCall = gsap.delayedCall(CALM_GAP, turn);
    }

    function onCelebrate() {
      if (!alive || reduce) {
        window.dispatchEvent(new Event("mfs:frenzy-done"));
        return;
      }
      if (frenzy) return;
      frenzy = { left: 26, dur: 0.85 };
      sweep.intensity = 60;
      if (turning) turnTween?.timeScale(5); // finish the slow turn quickly, then go
      else {
        waitCall?.kill();
        turn();
      }
    }
    window.addEventListener("mfs:celebrate", onCelebrate);

    function onAlarm(e) {
      const on = !!e.detail;
      if (on === alarmOn || !alive) return;
      alarmOn = on;
      if (on && !reduce) {
        if (turning) turnTween?.timeScale(6);
        else {
          waitCall?.kill();
          turn();
        }
      }
    }
    window.addEventListener("mfs:alarm", onAlarm);

    function turn() {
      if (!alive) return;
      turning = true;
      let dur = CALM_DUR;
      let ease = "power2.inOut";
      if (alarmOn) {
        dur = 0.16;
        ease = "none";
      } else if (poke.count >= 5 && !frenzy) {
        dur = Math.max(0.3, CALM_DUR - poke.count * 0.13);
      } else if (frenzy) {
        dur = frenzy.dur;
        ease = frenzy.dur < 0.25 ? "none" : "power1.inOut";
        frenzy.left--;
        frenzy.dur = Math.max(0.06, frenzy.dur * 0.82);
      }
      sfx.turn(alarmOn ? 0.9 : frenzy ? Math.min(1, 1 - dur / 0.95) : 0);
      const axes = ["x", "y", "z"];
      let axis, layer;
      do {
        axis = axes[Math.floor(Math.random() * 3)];
        layer = [-1, 0, 1][Math.floor(Math.random() * 3)];
      } while (lastTurn && lastTurn.axis === axis && lastTurn.layer === layer);
      lastTurn = { axis, layer };
      const dir = Math.random() < 0.5 ? 1 : -1;
      const pivot = new THREE.Group();
      cube.add(pivot);
      const members = cubies.filter((c) => Math.round(c.position[axis] / SP) === layer);
      members.forEach((m) => pivot.attach(m));
      turnTween = gsap.to(pivot.rotation, {
        [axis]: (dir * Math.PI) / 2,
        duration: dur,
        ease,
        onComplete: () => {
          turning = false;
          members.forEach((m) => {
            cube.attach(m);
            m.position.set(
              Math.round(m.position.x / SP) * SP,
              Math.round(m.position.y / SP) * SP,
              Math.round(m.position.z / SP) * SP
            );
            m.quaternion.normalize();
          });
          cube.remove(pivot);
          next();
        },
      });
    }

    // ---- intro + loop ----
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);

    // ---- drag to turn the whole cube (with momentum) ----
    const canvas = renderer.domElement;
    const drag = { on: false, x: 0, y: 0, vx: 0, vy: 0 };
    const AX = new THREE.Vector3(1, 0, 0);
    const AY = new THREE.Vector3(0, 1, 0);
    const rotateBy = (dx, dy) => {
      cube.rotateOnWorldAxis(AY, dx);
      cube.rotateOnWorldAxis(AX, dy);
    };
    // ---- clicking (poking) the cube ----
    // each click knocks and shakes it a little more; 5 s without a click and it calms down;
    // the 12th click in a row makes it angry and it smashes into the screen.
    const HIT_AT = 12; // clicks in a row before it hits the screen
    const poke = { count: 0, last: 0, amp: 0, attacking: false };
    function onPoke() {
      if (poke.attacking) return;
      const now = performance.now();
      if (now - poke.last > 5000) poke.count = 0;
      poke.count++;
      poke.last = now;
      sfx.knock(poke.count);
      if (reduce) return;
      poke.amp = Math.min(0.05 + poke.count * 0.045, 0.6);
      if (poke.count === 9) sfx.growl(0.5);
      if (poke.count >= HIT_AT) attack();
    }
    let attackTl = null;
    function attack() {
      poke.attacking = true;
      sfx.growl(1);
      const d = camera.position.clone().normalize();
      attackTl = gsap
        .timeline({
          onComplete: () => {
            poke.attacking = false;
            poke.count = 0;
            poke.amp = 0;
          },
        })
        .to(shell.position, { x: -d.x * 1.6, y: -d.y * 1.6, z: -d.z * 1.6, duration: 0.8, ease: "sine.inOut" })
        .to(shell.rotation, { z: 0.25, duration: 0.8, ease: "sine.inOut" }, 0)
        .to(shell.position, {
          x: d.x * 7.4,
          y: d.y * 7.4,
          z: d.z * 7.4,
          duration: 0.34,
          ease: "power3.in",
          onComplete: () => {
            sfx.smash();
            const r = el.getBoundingClientRect();
            window.dispatchEvent(new CustomEvent("mfs:screen-hit", { detail: { x: r.left + r.width / 2, y: r.top + r.height / 2 } }));
          },
        })
        .to(shell.rotation, { z: 0, duration: 0.34, ease: "power3.in" }, "<")
        .to(shell.position, { x: 0, y: 0, z: 0, duration: 1.3, ease: "power3.out", delay: 0.25 });
    }

    const onDown = (e) => {
      drag.on = true;
      drag.sx = e.clientX;
      drag.sy = e.clientY;
      drag.t0 = performance.now();
      drag.released = 0;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.vx = drag.vy = 0;
      canvas.setPointerCapture(e.pointerId);
      el.classList.add("grabbing", "used");
    };
    const onMove = (e) => {
      if (!drag.on) return;
      const dx = (e.clientX - drag.x) * 0.009;
      const dy = (e.pointerType === "touch" ? 0 : e.clientY - drag.y) * 0.009;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.vx = dx;
      drag.vy = dy;
      rotateBy(dx, dy);
      if (reduce) renderer.render(scene, camera);
    };
    const onUp = (e) => {
      // a quick press without moving is a click (poke), not a drag
      if (drag.on && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6 && performance.now() - drag.t0 < 450) onPoke();
      if (drag.on) drag.released = performance.now();
      drag.on = false;
      el.classList.remove("grabbing");
      if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    const t0 = performance.now();
    const HOME = new THREE.Quaternion();
    let lastT = t0;
    function frame() {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;
      if (poke.amp > 0 && !poke.attacking) {
        // side-to-side shake, fading to nothing 5 s after the last click
        const k = Math.max(0, 1 - (now - poke.last) / 5000);
        const a = poke.amp * k * k;
        shell.rotation.z = Math.sin(now * 0.034) * a;
        shell.position.x = Math.sin(now * 0.047) * a * 0.9;
        if (k === 0) {
          poke.amp = 0;
          poke.count = 0;
          shell.rotation.z = 0;
          shell.position.x = 0;
        }
      }
      if (!drag.on && (Math.abs(drag.vx) > 0.0002 || Math.abs(drag.vy) > 0.0002)) {
        rotateBy(drag.vx, drag.vy);
        drag.vx *= 0.94;
        drag.vy *= 0.94;
      } else if (!drag.on && drag.released && now - drag.released > 5000) {
        // slowly turn back to the normal position (about 3 seconds)
        if (cube.quaternion.angleTo(HOME) > 0.001) cube.quaternion.slerp(HOME, 1 - Math.exp(-dt * 1.4));
        else {
          cube.quaternion.copy(HOME);
          drag.released = 0;
          el.classList.remove("used");
        }
      }
      if (!visible || document.hidden) return;
      const t = (performance.now() - t0) / 1000;
      const lift = reduce ? 0 : Math.sin(t * 0.75) * 0.24;
      cube.position.y = 0.05 + lift;
      glow.material.opacity = 0.2 - lift * 0.18;
      glow.scale.setScalar(1 - lift * 0.25);
      sweep.position.set(Math.cos(t * 0.4) * 5.5, 3.2 + Math.sin(t * 0.25), Math.sin(t * 0.4) * 5.5);
      if (alarmOn) {
        // light slides down over the cube again and again, blinking on and off
        red.position.set(3.2, 5.5 - ((t * 1.6) % 1) * 10, 4.2);
        red.intensity = Math.floor(t * 4) % 2 ? 140 : 0;
      } else if (poke.attacking) {
        red.position.set(2.5, 2.5, 6);
        red.intensity = 160;
      } else if (poke.count >= 5 && now - poke.last < 5000) {
        red.position.set(2.5, 2.5, 6);
        red.intensity = (poke.count - 4) * 11 * (0.75 + 0.25 * Math.sin(t * 9));
      } else red.intensity = 0;
      renderer.render(scene, camera);
    }

    if (reduce) {
      frame();
    } else {
      gsap.from(cube.scale, { x: 0.5, y: 0.5, z: 0.5, duration: 1.8, ease: "expo.out" });
      gsap.from(renderer.domElement, { opacity: 0, duration: 1.2, ease: "power2.out" });
      waitCall = gsap.delayedCall(1.4, turn);
      gsap.ticker.add(frame);
    }

    return () => {
      alive = false;
      window.removeEventListener("mfs:celebrate", onCelebrate);
      window.removeEventListener("mfs:alarm", onAlarm);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      gsap.ticker.remove(frame);
      turnTween?.kill();
      attackTl?.kill();
      waitCall?.kill();
      gsap.killTweensOf(cube.scale);
      gsap.killTweensOf(renderer.domElement);
      ro.disconnect();
      io.disconnect();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="rk" ref={host} aria-hidden="true">
      <span className="rk-hint">Drag to turn the cube</span>
    </div>
  );
}
