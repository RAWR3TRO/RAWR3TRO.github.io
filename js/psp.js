/* ============================================================
   THE MACHINE — a real-time PSP you can actually operate.

   · GLB is loaded, then re-oriented FROM THE SCREEN PLANE, so
     nothing depends on how the model happened to be exported.
   · The screen is a live <canvas> pushed through a CRT shader:
     pixel grid, scanlines, RGB shift, barrel warp, phosphor.
   · The screen is the main light source — its average colour
     drives point lights, so a bright frame genuinely throws
     light across the buttons and the shell.

   Adapted for RAW.RETRO: the on-glass display is set in VCR to
   match the site's OSD, and it reads in white rather than the
   cyan of the original, because this brand is black and white
   and a coloured HUD would be the only hue on the entire page.
   ============================================================ */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const WORKS  = window.RR_WORKS || [];
const RR     = window.RR || { fireReady() {}, onReady(f) { f(); } };
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas    = document.getElementById('pspCanvas');
const stage     = document.querySelector('.machine__stage');
const section   = document.querySelector('.machine');
const loadingEl = document.getElementById('pspLoading');

const railIdx   = document.getElementById('railIdx');
const railTot   = document.getElementById('railTot');
const railOpen  = document.getElementById('railOpen');
const railTitle = document.getElementById('railTitle');
const railEl    = document.getElementById('rail');

if (canvas && WORKS.length) init();

function init() {

  /* ---------------------------------------------------------- */
  /* RENDERER / SCENE                                            */
  /* ---------------------------------------------------------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();

  /* No scene.background: the whole chain is alpha-preserving (clearAlpha 0 on
     the renderer AND on the RenderPass), so the canvas is genuinely
     transparent and the page's own scrolling backdrop shows through. */
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
  camera.position.set(0, 0, 30);

  const root  = new THREE.Group();     // drag transforms
  const model = new THREE.Group();     // orientation correction
  root.add(model);
  scene.add(root);

  /* ambient set dressing — deliberately dim; the screen does the work */
  const hemi = new THREE.HemisphereLight(0x2a3a4d, 0x05070a, 0.55);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xbcd4e8, 0.85);
  keyLight.position.set(-8, 9, 12);
  scene.add(keyLight);

  const rimIce = new THREE.DirectionalLight(0xdfefff, 1.15);
  rimIce.position.set(11, 4, -9);
  scene.add(rimIce);

  const rimHot = new THREE.DirectionalLight(0x9fb4c8, 0.7);
  rimHot.position.set(-12, -5, -7);
  scene.add(rimHot);

  /* screen spill — recoloured every time the content changes */
  const spillA = new THREE.PointLight(0xffffff, 0, 26, 2);
  const spillB = new THREE.PointLight(0xffffff, 0, 20, 2);
  const spillC = new THREE.PointLight(0xffffff, 0, 20, 2);
  scene.add(spillA, spillB, spillC);

  /* short-lived flash used for button presses */
  const pressLight = new THREE.PointLight(0xffffff, 0, 9, 2);
  scene.add(pressLight);
  let pressLightLife = 0;

  /* ---------------------------------------------------------- */
  /* SCREEN CANVAS — what the CRT shader samples                 */
  /* ---------------------------------------------------------- */
  const SW = 960, SH = 544;            // 2x PSP native (480x272)
  const sc = document.createElement('canvas');
  sc.width = SW; sc.height = SH;
  const sctx = sc.getContext('2d', { willReadFrequently: false });
  sctx.fillStyle = '#050505';
  sctx.fillRect(0, 0, SW, SH);

  const screenTex = new THREE.CanvasTexture(sc);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.minFilter = THREE.LinearFilter;
  screenTex.magFilter = THREE.LinearFilter;
  screenTex.generateMipmaps = false;

  /* tiny canvas used to average the frame for the spill colour */
  const av = document.createElement('canvas');
  av.width = 8; av.height = 5;
  const avctx = av.getContext('2d', { willReadFrequently: true });

  /* ---------------------------------------------------------- */
  /* CRT MATERIAL                                                */
  /* ---------------------------------------------------------- */
  const crtMat = new THREE.ShaderMaterial({
    uniforms: {
      uTex:    { value: screenTex },
      uTime:   { value: 0 },
      uPower:  { value: 0 },          // 0 = dead screen, 1 = fully on
      uWarp:   { value: 0 },          // channel-change tear
      uGrid:   { value: new THREE.Vector2(240, 136) },
      uBright: { value: 0.94 }
    },
    transparent: false,
    toneMapped: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D uTex;
      uniform float uTime, uPower, uWarp, uBright;
      uniform vec2 uGrid;
      varying vec2 vUv;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

      void main(){
        vec2 uv = vUv;

        /* barrel — the glass is not flat */
        vec2 c = uv - 0.5;
        float r2 = dot(c, c);
        uv = 0.5 + c * (1.0 + 0.032 * r2);

        /* horizontal tear while switching channels */
        float band = step(0.5, hash(vec2(floor(uv.y * 26.0), floor(uTime * 22.0))));
        uv.x += uWarp * (band - 0.5) * 0.09;

        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
          gl_FragColor = vec4(0.006, 0.006, 0.007, 1.0);
          return;
        }

        /* quantise to the pixel grid — the low-res look */
        vec2 g = uGrid;
        vec2 quv = (floor(uv * g) + 0.5) / g;

        /* chromatic split, widening toward the edges */
        float ab = (0.0005 + 0.0035 * r2) * (1.0 + uWarp * 6.0);
        float rr = texture2D(uTex, vec2(quv.x + ab, quv.y)).r;
        float gg = texture2D(uTex, quv).g;
        float bb = texture2D(uTex, vec2(quv.x - ab, quv.y)).b;
        vec3 col = vec3(rr, gg, bb);

        /* phosphor mask: vertical RGB stripes + scanline gaps */
        float sub = mod(floor(uv.x * g.x * 3.0), 3.0);
        vec3 mask = vec3(sub < 1.0 ? 1.0 : 0.90, (sub >= 1.0 && sub < 2.0) ? 1.0 : 0.90, sub >= 2.0 ? 1.0 : 0.90);
        col *= mask;

        float scan = 0.93 + 0.07 * cos(uv.y * g.y * 6.28318);
        col *= scan;

        /* glass reflection + vignette */
        col += vec3(0.06, 0.065, 0.075) * pow(1.0 - uv.y, 3.0) * 0.45;
        col *= 1.0 - 0.30 * pow(r2 * 1.55, 1.6);

        /* a whisper of static, fixed to the pixel grid so it never crawls */
        col += (hash(quv * 620.0) - 0.5) * 0.014;

        /* power-on: a bright horizontal line that opens out */
        float open = smoothstep(0.0, 1.0, uPower);
        float slit = smoothstep(open * 0.62 + 0.002, 0.0, abs(uv.y - 0.5));
        col = mix(vec3(0.92, 0.95, 1.0) * slit * 2.4, col, open);
        col *= open;

        gl_FragColor = vec4(col * uBright, 1.0);
      }`
  });

  /* ---------------------------------------------------------- */
  /* LOAD                                                        */
  /* ---------------------------------------------------------- */
  let screenMesh = null;
  const buttons = {};                 // role -> { mesh, home, axis, t }
  const pressable = [];
  let modelReady = false;
  const shellMats = [];

  /* Let the shell invert on demand without touching the screen or the lights.
     A uniform flips the sampled diffuse colour inside the standard material,
     so the black casing goes white while the emissive screen and the bloom are
     left exactly as they are. */
  function tintable(m) {
    m.userData.uInv = { value: 0 };
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uInv = m.userData.uInv;
      shader.fragmentShader = 'uniform float uInv;\n' + shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0) - diffuseColor.rgb, uInv);'
      );
    };
    return m;
  }

  /* Light recipes, one per polarity. The dark one is set dressing around a
     screen that supplies most of the light; the light one has to make a WHITE
     object read as white plastic against white paper, which is a different
     problem and needs different lights — not the same lights turned down. */
  const HEMI_SKY_DARK  = new THREE.Color(0x2a3a4d);
  const HEMI_GND_DARK  = new THREE.Color(0x05070a);
  const HEMI_SKY_LIGHT = new THREE.Color(0xf4f6fa);
  const HEMI_GND_LIGHT = new THREE.Color(0x98a2ae);

  let shellInverted = false;
  RR.setShellInvert = function (on) {
    shellInverted = !!on;
    shellMats.forEach((m) => { if (m.userData.uInv) m.userData.uInv.value = on ? 1 : 0; });

    /* This used to switch every directional off and crank the SAME hemisphere
       to 3.1. Two things went wrong with that:

         · that hemisphere is strongly blue (0x2a3a4d). Dim, behind a bright
           screen, it reads as cool ambient. Made the only light source, it
           tints everything — the inverted shell came out flat navy on white
           paper rather than white.
         · with no directional at all there is no specular and no falloff, so
           the casing lost every edge and seam it had and went to a single flat
           tone.

       So invert gets a NEUTRAL hemisphere and keeps a soft white key for form.
       Only the two rim lights go, because rimming a pale object against pale
       paper does nothing except muddy its outline. */
    hemi.color.copy(on ? HEMI_SKY_LIGHT : HEMI_SKY_DARK);
    hemi.groundColor.copy(on ? HEMI_GND_LIGHT : HEMI_GND_DARK);
    hemi.intensity = on ? 1.7 : 0.55;

    keyLight.visible = true;
    keyLight.color.set(on ? 0xffffff : 0xbcd4e8);
    keyLight.intensity = on ? 1.0 : 0.85;

    rimIce.visible = rimHot.visible = !on;

    /* not zero: the screen is still emissive and should still bloom, just far
       less, because bloom over white paper smears rather than glows */
    bloom.strength = on ? 0.14 : 0.42;
  };
  if (document.body.classList.contains('is-invert')) {
    /* the shell mats do not exist yet; setup() re-applies once they do */
  }

  new GLTFLoader().load(
    'assets/models/psp.glb',
    (gltf) => { setup(gltf.scene); },
    undefined,
    (err) => {
      console.error('[psp] model failed', err);
      if (loadingEl) loadingEl.textContent = 'HARDWARE UNAVAILABLE';
      RR.fireReady();
    }
  );

  function setup(src) {
    model.add(src);
    src.updateWorldMatrix(true, true);

    /* --- collect the parts we care about ------------------- */
    const parts = {};
    const bin = [];
    src.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const n = o.name.toLowerCase();
      /* the export ships a 46-unit ground plane. Hiding it is not enough —
         Box3.setFromObject still measures invisible meshes, which throws off
         both the scale normalisation and the camera fit. Cut it out. */
      if (n.indexOf('ground') === 0) { bin.push(o); return; }
      if (n.indexOf('screen') === 0) screenMesh = o;
      const m = n.match(/^button(\d+)/);
      if (m) parts['b' + m[1]] = o;
      if (o.material) {
        o.material = o.material.clone();
        shellMats.push(tintable(o.material));
        o.material.envMapIntensity = 1.25;
        if (o.material.metalness !== undefined) {
          o.material.metalness = Math.min(1, (o.material.metalness ?? 0.5) * 0.9 + 0.18);
          o.material.roughness = Math.max(0.12, (o.material.roughness ?? 0.5) * 0.82);
        }
      }
    });

    bin.forEach((o) => { o.parent && o.parent.remove(o); });

    if (!screenMesh) { console.warn('[psp] no screen mesh'); RR.fireReady(); return; }

    /* --- work out the screen plane in world space -----------
       The screen is a thin box, so averaging vertex normals cancels out to
       noise. Take the single largest triangle instead: it is always on the
       glass, and its normal is the plane normal. */
    const nrm = largestFaceNormal(screenMesh);

    const centreOf = (o) => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    const centre  = centreOf(src);
    const sCentre = centreOf(screenMesh);
    if (nrm.dot(sCentre.clone().sub(centre)) < 0) nrm.negate();   // must face outward

    /* "Down" is wherever the HOME / VOL / SELECT / START row sits — that strip
       runs along the bottom edge of the face on every PSP. Deriving it from the
       real geometry beats assuming which axis the exporter tilted. */
    const rowKeys = ['b9', 'b10', 'b11', 'b12', 'b13', 'b14', 'b15'];
    const row = new THREE.Vector3();
    let rowN = 0;
    rowKeys.forEach((k) => { if (parts[k]) { row.add(centreOf(parts[k])); rowN++; } });

    let up;
    if (rowN) {
      row.divideScalar(rowN);
      const down = row.sub(sCentre).projectOnPlane(nrm).normalize();
      up = down.negate();
    } else {
      up = new THREE.Vector3(0, 1, 0).projectOnPlane(nrm).normalize();
    }
    const right = new THREE.Vector3().crossVectors(up, nrm).normalize();
    up.crossVectors(nrm, right).normalize();                      // re-orthogonalise

    /* rotate so the screen looks straight down +Z, level and square on */
    const basis = new THREE.Matrix4().makeBasis(right, up, nrm);
    model.quaternion.setFromRotationMatrix(basis).invert();
    model.updateWorldMatrix(true, true);

    /* scale, then centre on the origin by moving the group itself —
       no inverse-quaternion gymnastics, no residual offset */
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    model.scale.setScalar(10 / Math.max(size.x, size.y, size.z));
    model.updateWorldMatrix(true, true);
    model.position.sub(new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()));
    model.updateWorldMatrix(true, true);
    fitToView();

    /* --- build the screen's own UVs from the plane ----------
       Recomputed here, AFTER the orientation correction, not reused from
       above: those vectors were measured in the model's original frame and the
       mesh has since been rotated out of it. World +X/+Y are only sign hints. */
    const sNrm = largestFaceNormal(screenMesh);
    if (sNrm.z < 0) sNrm.negate();
    buildScreenUVs(screenMesh, sNrm,
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
    screenMesh.material = crtMat;
    screenMesh.renderOrder = 2;

    /* --- name the buttons by where they sit ---------------- */
    mapButton('up', parts.b1);
    mapButton('right', parts.b2);
    mapButton('down', parts.b3);
    mapButton('left', parts.b4);
    mapButton('triangle', parts.b5);
    mapButton('circle', parts.b6);
    mapButton('cross', parts.b7);
    mapButton('square', parts.b8);
    mapButton('home', parts.b9);
    mapButton('select', parts.b14);
    mapButton('start', parts.b15);
    ['b10', 'b11', 'b12', 'b13'].forEach((k2, i) => mapButton('aux' + i, parts[k2]));

    /* world +Z is "out of the screen"; convert it into each button's own
       parent space so a press travels straight into the shell whatever the
       exporter did with the hierarchy. */
    function mapButton(role, mesh) {
      if (!mesh) return;
      const parent = mesh.parent || model;
      const pq = new THREE.Quaternion(); parent.getWorldQuaternion(pq);
      const ps = new THREE.Vector3();    parent.getWorldScale(ps);
      const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(pq.invert());
      axis.set(axis.x / (ps.x || 1), axis.y / (ps.y || 1), axis.z / (ps.z || 1));
      buttons[role] = { role, mesh, home: mesh.position.clone(), axis, t: 0 };
      if (['up', 'right', 'down', 'left', 'cross', 'circle', 'triangle', 'square', 'start', 'select', 'home'].indexOf(role) > -1) {
        mesh.userData.role = role;
        pressable.push(mesh);
      }
    }

    /* --- park the spill lights just in front of the glass --- */
    const sb  = new THREE.Box3().setFromObject(screenMesh);
    const sc2 = sb.getCenter(new THREE.Vector3());
    const halfW = (sb.max.x - sb.min.x) / 2;
    spillA.position.set(sc2.x, sc2.y, sc2.z + 2.2);
    spillB.position.set(sc2.x - halfW * 1.5, sc2.y, sc2.z + 1.5);
    spillC.position.set(sc2.x + halfW * 1.5, sc2.y, sc2.z + 1.5);

    screenMesh.userData.role = 'screen';
    pressable.push(screenMesh);

    modelReady = true;
    if (loadingEl) loadingEl.classList.add('is-off');
    /* the shell materials only exist now, so an invert chosen before load
       has to be re-applied here rather than at module scope */
    if (document.body.classList.contains('is-invert')) RR.setShellInvert(true);
    RR.fireReady();
    select(0, true);
    setTimeout(() => powerOn(), reduce ? 0 : 260);
  }

  /* the biggest triangle in a thin box is always on its face */
  function largestFaceNormal(mesh) {
    const geo = mesh.geometry;
    const pos = geo.getAttribute('position');
    const idx = geo.getIndex();
    const count = idx ? idx.count : pos.count;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), cr = new THREE.Vector3();
    let best = -1;
    const out = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < count; i += 3) {
      const i0 = idx ? idx.getX(i)     : i;
      const i1 = idx ? idx.getX(i + 1) : i + 1;
      const i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0);
      b.fromBufferAttribute(pos, i1);
      c.fromBufferAttribute(pos, i2);
      ab.subVectors(b, a); ac.subVectors(c, a);
      cr.crossVectors(ab, ac);
      const area = cr.lengthSq();
      if (area > best) { best = area; out.copy(cr).normalize(); }
    }
    return out.applyMatrix3(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize();
  }

  /* Build 0..1 uv by projecting every screen vertex onto THE SCREEN'S OWN
     in-plane axes.

     Bounding the vertices on world X/Y instead would quietly weld the picture
     to the world rather than to the glass: whatever residual tilt the machine
     carries, the image would stay bolt upright and sit crooked in its own
     bezel. The axes are recovered by PCA over the vertices projected into the
     screen plane — for a 16:9 rectangle the major axis IS the horizontal — and
     `right`/`up` settle only the two sign ambiguities, never the angle,
     because they are the part that was approximate to begin with. */
  function buildScreenUVs(mesh, nrm, right, up) {
    const geo = mesh.geometry;
    const p = geo.getAttribute('position');
    const mw = mesh.matrixWorld;
    const wp = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(mw);
      wp.push(v.clone());
    }

    const e1 = right.clone().projectOnPlane(nrm).normalize();
    const e2 = new THREE.Vector3().crossVectors(nrm, e1).normalize();

    const a = [], b = [];
    let ma = 0, mb = 0;
    for (let i = 0; i < wp.length; i++) {
      const x = wp[i].dot(e1), y = wp[i].dot(e2);
      a.push(x); b.push(y); ma += x; mb += y;
    }
    ma /= a.length; mb /= b.length;

    let Saa = 0, Sbb = 0, Sab = 0;
    for (let i = 0; i < a.length; i++) {
      const da = a[i] - ma, db = b[i] - mb;
      Saa += da * da; Sbb += db * db; Sab += da * db;
    }
    /* principal axis of the point cloud = the long edge of the rectangle */
    const th = 0.5 * Math.atan2(2 * Sab, Saa - Sbb);
    const cs = Math.cos(th), sn = Math.sin(th);

    const U = e1.clone().multiplyScalar(cs).addScaledVector(e2, sn).normalize();
    const V = e1.clone().multiplyScalar(-sn).addScaledVector(e2, cs).normalize();
    if (U.dot(right) < 0) U.negate();
    if (V.dot(up) < 0) V.negate();

    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    const us = [], vs = [];
    for (let i = 0; i < wp.length; i++) {
      const u = wp[i].dot(U), w = wp[i].dot(V);
      us.push(u); vs.push(w);
      if (u < minU) minU = u; if (u > maxU) maxU = u;
      if (w < minV) minV = w; if (w > maxV) maxV = w;
    }
    const du = (maxU - minU) || 1, dv = (maxV - minV) || 1;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2]     = (us[i] - minU) / du;
      uv[i * 2 + 1] = (vs[i] - minV) / dv;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  /* ---------------------------------------------------------- */
  /* SCREEN CONTENT                                              */
  /* ---------------------------------------------------------- */
  const cache = new Map();
  function getImage(src) {
    if (cache.has(src)) return cache.get(src);
    const p = new Promise((res) => {
      const im = new Image();
      im.onload  = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
    cache.set(src, p);
    return p;
  }

  /* Clips. Nothing is fetched until a slot is actually selected — the poster
     JPG is on the glass from the first frame, and the clip swaps in behind it
     when it arrives, so first paint never waits on video. */
  const vcache = new Map();
  function getVideo(src) {
    if (!src) return Promise.resolve(null);
    if (vcache.has(src)) return vcache.get(src);
    const p = new Promise((res) => {
      const v = document.createElement('video');
      v.src = src;
      v.muted = true; v.defaultMuted = true; v.volume = 0;
      v.loop = true; v.playsInline = true; v.autoplay = false;
      v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      /* deliberately NO crossOrigin: the clips ship with the site, so they are
         same-origin and never taint the canvas the spill readback samples.
         Setting it would demand CORS headers a plain static host may not send. */
      let done = false;
      const ok = () => { if (done) return; done = true; res(v); };
      v.addEventListener('canplaythrough', ok, { once: true });
      v.addEventListener('canplay', ok, { once: true });
      v.addEventListener('error', () => { if (!done) { done = true; res(null); } }, { once: true });
      v.load();
    });
    vcache.set(src, p);
    return p;
  }

  let current = 0;
  let powerT = 0, powerTarget = 0, warpT = 0;
  let live = null;              // the clip currently on the glass, if any

  const srcW = (s) => (s && (s.videoWidth  || s.width))  || 0;
  const srcH = (s) => (s && (s.videoHeight || s.height)) || 0;

  /* With the picture running edge to edge there is no letterbox margin for the
     HUD to sit in, and white VCR type over a blown-out headlight is
     unreadable — so a short gradient is laid under each strip of text. Only
     where the text is, never over the whole frame.

     Built once, not per call: drawFrame runs every frame while a clip is
     playing, and both gradients are fixed for a fixed-size screen canvas. */
  const SCRIM_TOP = (() => {
    const g = sctx.createLinearGradient(0, 0, 0, 92);
    g.addColorStop(0, 'rgba(0,0,0,.62)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    return g;
  })();
  const SCRIM_BOT = (() => {
    const g = sctx.createLinearGradient(0, SH - 76, 0, SH);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.62)');
    return g;
  })();

  function drawFrame(work, img) {
    sctx.save();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    /* only ever seen if a source fails to load — cover fills the glass */
    sctx.fillStyle = '#050505';
    sctx.fillRect(0, 0, SW, SH);

    if (img && srcW(img)) {
      /* COVER, edge to edge: the picture fills the whole screen and is
         cropped to do it, rather than being letterboxed onto a blurred bed.

         It costs almost nothing here. The PSP's panel is 480x272 — 1.765 —
         and every clip in the archive is 16:9 at 1.778, so the crop is under
         a percent off the sides. The blurred bed the original used is gone
         with it, and so is the 34px full-screen blur it needed. */
      const sw = srcW(img), sh = srcH(img);
      const scale = Math.max(SW / sw, SH / sh);
      const dw = sw * scale, dh = sh * scale;
      sctx.drawImage(img, (SW - dw) / 2, (SH - dh) / 2, dw, dh);
    }

    /* Scrims — see SCRIM_TOP/SCRIM_BOT above. */
    sctx.fillStyle = SCRIM_TOP;
    sctx.fillRect(0, 0, SW, 92);
    sctx.fillStyle = SCRIM_BOT;
    sctx.fillRect(0, SH - 76, SW, 76);

    /* The HUD. Where you are, and what you are looking at — set in VCR so the
       glass matches the OSD burnt into the rest of the page. */
    sctx.textBaseline = 'middle';
    sctx.font = '30px "VCR", monospace';
    sctx.fillStyle = 'rgba(255,255,255,.94)';
    sctx.fillText(String(current + 1).padStart(2, '0'), 26, 34);
    sctx.font = '20px "VCR", monospace';
    sctx.fillStyle = 'rgba(255,255,255,.5)';
    sctx.fillText('/ ' + String(WORKS.length).padStart(2, '0'), 70, 36);

    if (work && work.title) {
      sctx.font = '22px "VCR", monospace';
      sctx.fillStyle = 'rgba(255,255,255,.9)';
      const tw = sctx.measureText(work.title).width;
      sctx.fillText(work.title, SW - tw - 26, 34);
    }

    /* position pips along the bottom edge */
    const px0 = SW - 26;
    for (let i = 0; i < WORKS.length; i++) {
      const on = i === current;
      const w = on ? 20 : 7;
      const x = px0 - (WORKS.length - i) * 24;
      sctx.fillStyle = on ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.34)';
      sctx.fillRect(x, SH - 30, w, 3);
    }

    sctx.restore();
    screenTex.needsUpdate = true;
  }

  /* the spill readback is a GPU->CPU stall, so it runs at ~6Hz, not per frame */
  let spillDue = 0;
  function updateSpillThrottled(t) {
    if (t < spillDue) return;
    spillDue = t + 0.16;
    updateSpill();
  }

  function updateSpill() {
    avctx.drawImage(sc, 0, 0, av.width, av.height);
    let r = 0, g = 0, b = 0;
    try {
      const d = avctx.getImageData(0, 0, av.width, av.height).data;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      r /= n * 255; g /= n * 255; b /= n * 255;
    } catch (e) { r = g = b = 0.6; }

    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const mx = Math.max(r, g, b) || 1;
    const col = new THREE.Color(
      Math.min(1, 0.30 + (r / mx) * 0.70),
      Math.min(1, 0.30 + (g / mx) * 0.70),
      Math.min(1, 0.30 + (b / mx) * 0.70)
    );
    spillTargetColor.copy(col);
    spillTargetIntensity = 16 + lum * 46;
  }

  const spillTargetColor = new THREE.Color(0.8, 0.85, 0.95);
  let spillTargetIntensity = 0;

  let selectToken = 0;

  async function select(i, instant) {
    current = ((i % WORKS.length) + WORKS.length) % WORKS.length;
    const w = WORKS[current];

    if (railIdx) railIdx.textContent = String(current + 1).padStart(2, '0');
    if (railTot) railTot.textContent = '/' + String(WORKS.length).padStart(2, '0');
    if (railTitle) railTitle.textContent = w.sub ? w.title + ' — ' + w.sub : w.title;
    if (railOpen && w.link) railOpen.href = w.link;
    if (railEl && !instant && !reduce) {
      railEl.classList.remove('is-swap');
      void railEl.offsetWidth;
      railEl.classList.add('is-swap');
    }
    if (!instant && !reduce) warpT = 1;

    /* stop whatever was running before we touch the glass */
    if (live) { try { live.pause(); } catch (e) {} live = null; }

    const token = ++selectToken;
    const img = await getImage(w.img);
    if (token !== selectToken) return;
    drawFrame(w, img);
    updateSpill();

    if (!w.vid || reduce) { prefetchNeighbours(); return; }

    const v = await getVideo(w.vid);
    if (token !== selectToken || !v) { prefetchNeighbours(); return; }
    try { v.currentTime = 0; } catch (e) {}
    const play = v.play();
    if (play && play.catch) play.catch(() => {});   // a refused autoplay leaves the still
    live = v;
    prefetchNeighbours();
  }

  /* warm the two slots either side once the machine is idle, so a d-pad press
     lands on a clip that is already buffered */
  let prefetched = false;
  function prefetchNeighbours() {
    const run = () => {
      [current + 1, current - 1].forEach((i) => {
        const w = WORKS[((i % WORKS.length) + WORKS.length) % WORKS.length];
        if (w && w.vid) getVideo(w.vid);
      });
    };
    if (prefetched) { run(); return; }
    prefetched = true;
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 1200);
  }

  function powerOn() { powerTarget = 1; }

  function open() {
    const w = WORKS[current];
    if (!w || !w.link) return;
    window.open(w.link, '_blank', 'noopener');
  }

  /* ---------------------------------------------------------- */
  /* BUTTON PRESSES                                              */
  /* ---------------------------------------------------------- */
  const PRESS_DEPTH = 0.17;   // world units

  function press(role) {
    const b = buttons[role];
    if (b) {
      b.t = 1;
      const wp = new THREE.Box3().setFromObject(b.mesh).getCenter(new THREE.Vector3());
      pressLight.position.copy(wp).add(new THREE.Vector3(0, 0, 1.4));
      pressLight.color.set(0xffffff);
      pressLightLife = 1;
    }
    if (role === 'left') select(current - 1);
    else if (role === 'right') select(current + 1);
    else if (role === 'up') select(0);
    else if (role === 'down') select(WORKS.length - 1);
    else if (role === 'cross' || role === 'start' || role === 'screen') open();
    else if (role === 'circle') select(current - 1);
    else if (role === 'triangle') select(current + 1);
    else if (role === 'square' || role === 'select' || role === 'home') {
      const a = document.getElementById('about');
      a && a.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    }
  }

  /* ---------------------------------------------------------- */
  /* INPUT                                                       */
  /* ---------------------------------------------------------- */
  /* A phone is not a small desktop. The d-pad and face buttons are a few
     millimetres across at phone scale, so raycasting onto them is a game of
     darts — and the desktop mapping (tap the screen = open Instagram) means a
     stray tap navigates the visitor off the site entirely.

     So on a coarse pointer the whole canvas becomes the control: a tap
     advances the channel, a horizontal swipe steps either way, and Instagram
     moves to the ↗ in the rail, which is a real 34px target. Fine pointers
     keep every bit of the original behaviour. */
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let hovered = null;
  let dragging = false, dragged = false, lastX = 0, lastY = 0;
  let spinY = 0, spinX = 0, spinVY = 0, spinVX = 0;
  /* total travel for the whole gesture, so a swipe can be distinguished from a
     rotate on release — the per-move deltas above are consumed by the spin */
  let travelX = 0, travelY = 0;
  const SWIPE_MIN = 42;          // px before a drag counts as a swipe

  function toNDC(e) {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    ptr.x =  ((t.clientX - r.left) / r.width)  * 2 - 1;
    ptr.y = -((t.clientY - r.top)  / r.height) * 2 + 1;
  }

  function pick() {
    if (!modelReady) return null;
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(pressable, false)[0];
    return hit ? hit.object : null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    toNDC(e);
    dragging = true; dragged = false;
    travelX = travelY = 0;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    toNDC(e);
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      travelX += dx; travelY += dy;
      if (Math.abs(dx) + Math.abs(dy) > 4) dragged = true;
      spinVY += dx * 0.00042;
      spinVX += dy * 0.00030;
      lastX = e.clientX; lastY = e.clientY;
      return;
    }
    const o = pick();
    if (o !== hovered) {
      hovered = o;
      canvas.style.cursor = o ? 'pointer' : 'grab';
    }
  });

  function endDrag() { dragging = false; }
  canvas.addEventListener('pointerup', (e) => {
    if (coarse) {
      const horiz = Math.abs(travelX) > Math.abs(travelY);
      if (dragged && horiz && Math.abs(travelX) > SWIPE_MIN) {
        /* swipe: drag left to go forward, the way a carousel reads */
        press(travelX < 0 ? 'right' : 'left');
      } else if (!dragged) {
        /* a tap anywhere steps forward — but a tap that landed on a real
           button still does that button's job, so the d-pad keeps working
           for anyone who does hit it */
        toNDC(e);
        const o = pick();
        const role = o && o.userData.role;
        if (role && role !== 'screen' && role !== 'cross' && role !== 'start') press(role);
        else press('right');
      }
    } else if (!dragged) {
      toNDC(e);
      const o = pick();
      if (o && o.userData.role) press(o.userData.role);
    }
    endDrag();
  });
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { endDrag(); hovered = null; canvas.style.cursor = 'grab'; });
  canvas.style.cursor = 'grab';

  window.addEventListener('keydown', (e) => {
    if (!inView) return;
    const k = e.key;
    if      (k === 'ArrowLeft')  { press('left');     e.preventDefault(); }
    else if (k === 'ArrowRight') { press('right');    e.preventDefault(); }
    else if (k === 'ArrowUp')    { press('triangle'); e.preventDefault(); }
    else if (k === 'ArrowDown')  { press('square');   e.preventDefault(); }
    else if (k === 'Enter' || k === 'x' || k === 'X') { press('cross'); }
  });

  /* ---------------------------------------------------------- */
  /* SIZE + SCROLL                                               */
  /* ---------------------------------------------------------- */
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  /* Both, not just clearAlpha: RenderPass only applies clearAlpha when
     clearColor is also set, so setting the alpha alone silently does nothing
     and the buffer comes back opaque. */
  renderPass.clearColor = new THREE.Color(0x000000);
  renderPass.clearAlpha = 0;
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.45, 0.55);
  /* three's separable blur shader ends `gl_FragColor = vec4(sum, 1.0)` — alpha
     is hardcoded — and the bloom is then composited with plain AdditiveBlending,
     which adds that 1.0 into the alpha channel across the whole frame and
     silently re-opaques the canvas.

     Found by scanning rather than by name: the property was `materialCopy` in
     older three and is `blendMaterial` in r160, and hard-coding either one
     throws (or worse, quietly stops working) on the next version bump. */
  Object.keys(bloom).forEach((k) => {
    const m = bloom[k];
    if (!m || !m.isMaterial || m.blending !== THREE.AdditiveBlending) return;
    m.blending = THREE.CustomBlending;
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneFactor;
    m.blendEquationAlpha = THREE.AddEquation;
    m.blendSrcAlpha = THREE.ZeroFactor;    // keep the destination alpha
    m.blendDstAlpha = THREE.OneFactor;
  });
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* pull the camera to whatever distance makes the machine fill the frame */
  function fitToView() {
    const b = modelBox();
    if (!b) return;
    const size = b.getSize(new THREE.Vector3());
    /* How much of the frame the machine takes.

       A portrait phone fits on WIDTH — distW dominates below, because the
       aspect divides into it — so the machine was leaving most of the screen
       empty above and below and reading as a thumbnail of itself.

       Note the `+ size.z` on the next line: it pushes the camera back far
       enough to clear the model's own depth, and it is added AFTER the fill
       division, so it quietly eats most of a small fill increase. Going from
       0.94 to 1.06 barely moved. 1.2 actually overfills the width by about a
       tenth, cropping the outer grips, which is what makes it read as the
       object you came for rather than a picture of one. */
    const fill = window.innerWidth < 720 ? 1.2 : 0.72;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const distH = (size.y / 2) / Math.tan(vFov / 2);
    const distW = (size.x / 2) / (Math.tan(vFov / 2) * camera.aspect);
    camera.position.set(0, 0, Math.max(distH, distW) / fill + size.z);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  function modelBox() {
    if (!modelReady && !model.children.length) return null;
    return new THREE.Box3().setFromObject(model);
  }

  function resize() {
    if (!stage) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;               // never size to zero — it kills the context
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
    camera.aspect = w / h;
    camera.fov = w < 720 ? 42 : 32;
    camera.updateProjectionMatrix();
    if (modelReady) fitToView();
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  let inView = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      inView = es[0].isIntersecting;
      /* a clip nobody can see should not be decoding */
      if (live) { if (inView) { const p = live.play(); if (p && p.catch) p.catch(() => {}); } else live.pause(); }
    }, { threshold: 0.01 }).observe(section || canvas);
  }
  document.addEventListener('visibilitychange', () => {
    if (!live) return;
    if (document.hidden) live.pause();
    else if (inView) { const p = live.play(); if (p && p.catch) p.catch(() => {}); }
  });

  /* ---------------------------------------------------------- */
  /* LOOP                                                        */
  /* ---------------------------------------------------------- */
  const clock = new THREE.Clock();

  function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;

    if (!inView) return;

    /* No entrance animation. The machine is centred and square-on from the
       first frame; the only rotation that ever exists is the user's own drag,
       which springs back to dead-front. */
    spinVY *= 0.90; spinVX *= 0.90;
    spinY += spinVY; spinX += spinVX;
    spinX = Math.max(-0.55, Math.min(0.55, spinX));
    if (!dragging) {
      spinY += (0 - spinY) * Math.min(1, dt * 3.2);
      spinX += (0 - spinX) * Math.min(1, dt * 3.2);
      if (Math.abs(spinY) < 0.0008) spinY = 0;
      if (Math.abs(spinX) < 0.0008) spinX = 0;
    }

    root.rotation.y = spinY;
    root.rotation.x = spinX;

    /* power + tear */
    powerT += (powerTarget - powerT) * Math.min(1, dt * 2.4);
    crtMat.uniforms.uPower.value = powerT;
    warpT *= Math.pow(0.0025, dt);
    if (warpT < 0.001) warpT = 0;
    crtMat.uniforms.uWarp.value = warpT;
    crtMat.uniforms.uTime.value = t;

    /* screen spill */
    const on = powerT;
    spillA.color.lerp(spillTargetColor, 0.12);
    spillB.color.copy(spillA.color);
    spillC.color.copy(spillA.color);
    spillA.intensity += ((shellInverted ? 0 : spillTargetIntensity * on) - spillA.intensity) * 0.14;
    spillB.intensity = spillA.intensity * 0.42;
    spillC.intensity = spillA.intensity * 0.42;

    /* press animation — exponential settle, no bounce */
    for (const k in buttons) {
      const b = buttons[k];
      if (b.t <= 0.0005 && b.mesh.position.equals(b.home)) continue;
      b.t *= Math.pow(0.004, dt);
      if (b.t < 0.0005) b.t = 0;
      const d = b.axis.clone().multiplyScalar(-PRESS_DEPTH * b.t);
      b.mesh.position.copy(b.home).add(d);
    }

    if (pressLightLife > 0) {
      pressLightLife -= dt * 3.4;
      pressLight.intensity = Math.max(0, pressLightLife) * 26;
    } else pressLight.intensity = 0;

    /* the clip, if one is running — the only thing that repaints the glass
       every frame; everything else on screen only changes on selection */
    if (live && !live.paused && !live.ended && live.readyState >= 2) {
      drawFrame(WORKS[current], live);
      updateSpillThrottled(t);
    }

    composer.render();
  }
  tick();

  /* redraw once VCR has actually arrived, so the HUD is never measured with
     a fallback face and left mispositioned */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { if (modelReady) select(current, true); });
  }
}
