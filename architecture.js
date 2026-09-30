// SAVS meistars r14: an architectural drawing becomes a carefully lit building maquette.
// Original schematic reconstruction of the building in assets/fasade.webp (no code copied from references).
// Units are relative: the central block is 7.4 units high. They are not surveyed dimensions.
// Visible facades were measured from the photo's two vanishing points. The rear wall line and every
// depth behind the visible corners are assumptions.
(() => {
  'use strict';

  const host = document.getElementById('architecture');
  const canvas = document.getElementById('building-canvas');
  const stage = host && host.querySelector('.architecture-stage');
  if (!host || !canvas || !stage) return;

  const REVEAL_MS = 8000;   // one unhurried reveal (slowed at the client's request), then the finished model holds
  const START_RATIO = 0.4;  // the reveal starts as the enlarged hero model enters the first screen
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let teardown = () => {};

  function showPhotograph(state, error) {
    teardown();
    teardown = () => {};
    host.classList.remove('model-ready', 'is-complete');
    host.classList.add('is-static');
    host.dataset.state = state;
    host.dataset.reveal = 'static';
    if (error) console.warn('Architecture model unavailable; showing the building photograph.', error);
  }

  function webglAvailable() {
    try {
      const probe = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (probe.getContext('webgl2') || probe.getContext('webgl')));
    } catch {
      return false;
    }
  }

  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'assets/vendor/three.classic.min.js';
      script.async = true;
      script.onload = () => (window.THREE ? resolve(window.THREE) : reject(new Error('Three.js did not initialize.')));
      script.onerror = () => reject(new Error('Three.js could not be loaded.'));
      document.head.append(script);
    });
  }

  function fontsReady() {
    if (!document.fonts) return Promise.resolve();
    return Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1500))]);
  }

  async function init() {
    host.dataset.state = 'loading';
    if (!webglAvailable()) return showPhotograph('unavailable');
    try {
      const [T] = await Promise.all([loadThree(), fontsReady()]);
      teardown = createScene(T);
    } catch (error) {
      showPhotograph('unavailable', error);
    }
  }

  const clamp01 = value => Math.min(1, Math.max(0, value));
  const span = (p, start, end) => clamp01((p - start) / (end - start));
  const smooth = t => t * t * (3 - 2 * t);
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const lerp = (a, b, t) => a + (b - a) * t;
  const divide = (a, b, parts) => Array.from({ length: parts - 1 }, (_, i) => a + ((b - a) * (i + 1)) / parts);

  function createScene(T) {
    const small = stage.clientWidth < 700;
    const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    const scene = new T.Scene();
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 1, 400);
    const target = new T.Vector3(-1.5, 2, -3.5);

    // Neutral drafting light gives way to low, warm sunlight and a cooler open sky.
    const hemi = new T.HemisphereLight(0xffffff, 0xb9ad96, Math.PI);
    const skyWhite = new T.Color(0xffffff);
    const skyWarm = new T.Color(0xd8e5ef);
    const sun = new T.DirectionalLight(0xffe2b4, 0);
    sun.position.set(-11, 21, 21); // grazes the panel joints; the recessed entrances remain legible
    sun.target.position.set(-2, 0, -4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(small ? 1024 : 1536, small ? 1024 : 1536);
    Object.assign(sun.shadow.camera, { left: -23, right: 23, top: 23, bottom: -23, near: 1, far: 80 });
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.028;
    const fill = new T.DirectionalLight(0xdbe8f5, 0);
    fill.position.set(24, 12, 2);
    scene.add(hemi, sun, sun.target, fill);

    const disposables = [];
    const own = item => (disposables.push(item), item);

    // Materials start as drawing paper and finish as the photographed materials.
    const PAPER = '#fbfaf5';
    const fades = [];
    function material(drawing, final, options = {}) {
      const m = own(new T.MeshStandardMaterial({ color: drawing, roughness: 0.84, metalness: 0, envMapIntensity: 0.16, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, ...options }));
      fades.push({ m, from: new T.Color(drawing), to: new T.Color(final) });
      return m;
    }
    function texture(width, height, paint, repeat) {
      const surface = document.createElement('canvas');
      surface.width = width;
      surface.height = height;
      paint(surface.getContext('2d'), width, height);
      const map = own(new T.CanvasTexture(surface));
      map.colorSpace = T.SRGBColorSpace;
      map.anisotropy = 4;
      if (repeat) {
        map.wrapS = map.wrapT = T.RepeatWrapping;
        map.repeat.set(repeat[0], repeat[1]);
      }
      return map;
    }
    // An abstract local environment, generated in memory: no remote assets or invented rooms.
    const environmentMap = texture(512, 256, (ctx, w, h) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#647e9b');
      sky.addColorStop(0.36, '#c4d8e7');
      sky.addColorStop(0.5, '#f5eee0');
      sky.addColorStop(0.56, '#b8b4a0');
      sky.addColorStop(1, '#766859');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      const daylight = ctx.createRadialGradient(w * 0.73, h * 0.32, 2, w * 0.73, h * 0.32, 85);
      daylight.addColorStop(0, 'rgba(255, 250, 235, 0.95)');
      daylight.addColorStop(1, 'rgba(255, 250, 235, 0)');
      ctx.fillStyle = daylight;
      ctx.fillRect(0, 0, w, h);
    });
    environmentMap.mapping = T.EquirectangularReflectionMapping;
    const environmentGenerator = new T.PMREMGenerator(renderer);
    const environmentTarget = own(environmentGenerator.fromEquirectangular(environmentMap));
    environmentGenerator.dispose();
    scene.environment = environmentTarget.texture;

    // Cool sky above a quiet warm interior suggestion. Window geometry supplies the real mullions.
    function glassTexture(top, middle, horizon, bottom, entrance = false) {
      return texture(192, 256, (ctx, w, h) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, top);
        gradient.addColorStop(0.36, middle);
        gradient.addColorStop(0.56, horizon);
        gradient.addColorStop(1, bottom);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        // These are only light and reflections, never a claim about the building's floor plan.
        ctx.globalAlpha = entrance ? 0.2 : 0.11;
        ctx.fillStyle = '#f8e1a9';
        for (let i = 0; i < 5; i++) ctx.fillRect(i * w / 5 + 3, h * 0.51, w / 8, h * 0.28);
        ctx.globalAlpha = 0.19;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(w * 0.22, 0);
        ctx.lineTo(w * 0.42, 0);
        ctx.lineTo(w * 0.87, h);
        ctx.lineTo(w * 0.7, h);
        ctx.fill();
        ctx.globalAlpha = 0.14;
        ctx.fillRect(0, h * 0.33, w, 3);
      });
    }
    // The drawing shows plain glass. The reflection texture blends in with the materials.
    const glassMix = { value: 0 };
    function glassMaterial(drawing, map) {
      const m = material(drawing, '#d7e0e3', { map, roughness: 0.2, metalness: 0.22, envMapIntensity: 0 });
      m.onBeforeCompile = shader => {
        shader.uniforms.uMapMix = glassMix;
        shader.fragmentShader = 'uniform float uMapMix;\n' + shader.fragmentShader.replace('#include <map_fragment>', [
          '#ifdef USE_MAP',
          '  vec4 sampledDiffuseColor = texture2D( map, vMapUv );',
          '  diffuseColor *= mix( vec4( 1.0 ), sampledDiffuseColor, uMapMix );',
          '#endif',
        ].join('\n'));
      };
      m.customProgramCacheKey = () => 'savs-glass';
      return m;
    }

    const M = {
      orange: material(PAPER, '#c45125', { roughness: 0.67, envMapIntensity: 0.12 }),
      brown: material(PAPER, '#514338', { roughness: 0.64, envMapIntensity: 0.14 }),
      trim: material(PAPER, '#e0e0d7', { roughness: 0.38, metalness: 0.22, envMapIntensity: 0.2 }),
      flashing: material(PAPER, '#c7cecc', { roughness: 0.32, metalness: 0.42, envMapIntensity: 0.32 }),
      dark: material('#d3d4cd', '#2b302f', { roughness: 0.6, envMapIntensity: 0.12 }),
      garage: material('#efede6', '#3d3730', { roughness: 0.73, envMapIntensity: 0.1 }),
      concrete: material(PAPER, '#c8c3b5'),
      floor: material('#f8f7f2', '#d6d0c3'),
      glassUpper: glassMaterial('#e0e8e7', glassTexture('#7197b0', '#acc4cf', '#b7bcb3', '#77634f')),
      glassLower: glassMaterial('#e0e8e7', glassTexture('#7895a5', '#a8b4b7', '#977c54', '#4f4439', true)),
    };
    const L = {
      ink: own(new T.LineBasicMaterial({ color: '#34372f', transparent: true, opacity: 0.9 })),
      seam: own(new T.LineBasicMaterial({ color: '#8d9087', transparent: true, opacity: 0.55 })),
      rod: own(new T.LineBasicMaterial({ color: '#4b4d47', transparent: true, opacity: 0.9 })),
      red: own(new T.LineBasicMaterial({ color: '#b82d28', transparent: true, opacity: 1 })),
      site: own(new T.LineBasicMaterial({ color: '#6c7066', transparent: true, opacity: 0.5 })),
      hatch: own(new T.LineBasicMaterial({ color: '#b3b6ad', transparent: true, opacity: 0.55 })),
      grid: own(new T.LineDashedMaterial({ color: '#8c9185', dashSize: 0.45, gapSize: 0.3, transparent: true, opacity: 0.75 })),
    };
    const seamDrawing = new T.Color('#8d9087');
    const seamFinal = new T.Color('#6f3417');

    // Batches merge many boxes and lines per material into single draw calls.
    function mergeGeometries(list) {
      const parts = list.map(geometry => (geometry.index ? geometry.toNonIndexed() : geometry));
      const merged = new T.BufferGeometry();
      for (const name of Object.keys(parts[0].attributes)) {
        const itemSize = parts[0].attributes[name].itemSize;
        const array = new Float32Array(parts.reduce((total, part) => total + part.attributes[name].array.length, 0));
        let offset = 0;
        for (const part of parts) {
          array.set(part.attributes[name].array, offset);
          offset += part.attributes[name].array.length;
        }
        merged.setAttribute(name, new T.BufferAttribute(array, itemSize));
      }
      for (const geometry of new Set([...list, ...parts])) geometry.dispose();
      return merged;
    }
    function batch(group) {
      const meshes = new Map();
      const lines = new Map();
      const add = (map, key, geometry) => (map.get(key) || map.set(key, []).get(key)).push(geometry);
      return {
        group,
        box(x0, x1, y0, y1, z0, z1, mat, edge = L.ink) {
          const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
          if (w < 1e-4 || h < 1e-4 || d < 1e-4) return;
          const geometry = new T.BoxGeometry(w, h, d).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
          add(meshes, mat, geometry);
          if (edge) add(lines, edge, new T.EdgesGeometry(geometry));
        },
        segment(a, b, mat) {
          add(lines, mat, new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute([...a, ...b], 3)));
        },
        build({ cast = true } = {}) {
          for (const [mat, list] of meshes) {
            const mesh = new T.Mesh(mergeGeometries(list), mat);
            mesh.castShadow = cast;
            mesh.receiveShadow = true;
            group.add(mesh);
          }
          for (const [mat, list] of lines) {
            const line = new T.LineSegments(mergeGeometries(list), mat);
            if (mat.isLineDashedMaterial) line.computeLineDistances();
            group.add(line);
          }
        },
      };
    }
    // Facade coordinates: a runs along the facade, y is height, n points out of the wall.
    function face(b, map) {
      const box = (a0, a1, y0, y1, n0, n1, mat, edge) => {
        const p = map(a0, y0, n0), q = map(a1, y1, n1);
        b.box(Math.min(p[0], q[0]), Math.max(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[1], q[1]), Math.min(p[2], q[2]), Math.max(p[2], q[2]), mat, edge);
      };
      return {
        box,
        line: (a0, y0, a1, y1, n, mat) => b.segment(map(a0, y0, n), map(a1, y1, n), mat),
        seg: (a0, y0, n0, a1, y1, n1, mat) => b.segment(map(a0, y0, n0), map(a1, y1, n1), mat),
      };
    }
    const local = (a, y, n) => [a, y, n];
    const eastFace = (x, zFront) => (a, y, n) => [x + n, y, zFront - a];

    function windowUnit(f, a0, a1, y0, y1, panes, glass, openings) {
      const frame = 0.075;
      f.box(a0, a1, y0, y1, 0, 0.035, glass);
      // Thin dark seals set the glazing back inside the pale aluminium frames.
      f.box(a0, a1, y0, y0 + 0.025, 0.036, 0.045, M.dark, null);
      f.box(a0, a1, y1 - 0.025, y1, 0.036, 0.045, M.dark, null);
      f.box(a0, a0 + 0.025, y0, y1, 0.036, 0.045, M.dark, null);
      f.box(a1 - 0.025, a1, y0, y1, 0.036, 0.045, M.dark, null);
      f.box(a0 - frame, a1 + frame, y1, y1 + frame, 0, 0.1, M.trim, null);
      f.box(a0 - frame, a1 + frame, y0 - frame, y0, 0, 0.1, M.trim, null);
      f.box(a0 - frame, a0, y0, y1, 0, 0.1, M.trim, null);
      f.box(a1, a1 + frame, y0, y1, 0, 0.1, M.trim, null);
      for (const a of divide(a0, a1, panes)) f.box(a - 0.035, a + 0.035, y0, y1, 0, 0.09, M.trim, null);
      f.box(a0 - frame - 0.05, a1 + frame + 0.05, y0 - frame - 0.07, y0 - frame, 0, 0.18, M.flashing);
      openings.push({ a0: a0 - frame - 0.05, a1: a1 + frame + 0.05, y0: y0 - frame - 0.07, y1: y1 + frame });
    }
    function curtainWall(f, a0, a1, y0, y1, n, mullions, transom, glass) {
      f.box(a0, a1, y0, y1, n - 0.03, n, glass);
      for (const a of [a0, ...mullions, a1]) f.box(a - 0.05, a + 0.05, y0, y1, n, n + 0.08, M.trim, null);
      f.box(a0, a1, y1 - 0.09, y1, n, n + 0.08, M.trim, null);
      f.box(a0, a1, y0, y0 + 0.09, n, n + 0.08, M.trim, null);
      f.box(a0, a1, transom - 0.04, transom + 0.04, n, n + 0.07, M.trim, null);
    }
    function door(f, a0, a1, top, openings) {
      const frame = 0.07;
      f.box(a0, a1, 0, top, 0, 0.03, M.glassLower);
      f.box(a0 - frame, a1 + frame, top, top + frame, 0, 0.09, M.trim, null);
      f.box(a0 - frame, a0, 0, top, 0, 0.09, M.trim, null);
      f.box(a1, a1 + frame, 0, top, 0, 0.09, M.trim, null);
      f.box(a1 - 0.22, a1 - 0.17, 0.95, 1.3, 0.03, 0.12, M.dark, null);
      openings.push({ a0: a0 - frame, a1: a1 + frame, y0: 0, y1: top + frame });
    }
    function fixture(f, a, y) {
      f.box(a - 0.08, a + 0.08, y - 0.13, y + 0.13, 0, 0.12, M.dark, null);
      f.box(a - 0.058, a + 0.058, y - 0.06, y + 0.06, 0.12, 0.135, M.flashing, null);
    }
    function groundLine(f, width) {
      f.line(-0.3, 0, width + 0.3, 0, 0.01, L.ink);
    }
    // Panel joints stop at openings, as on the real cladding.
    function seams(f, a0, a1, y0, y1, columns, rows, openings) {
      const cut = (segments, c0, c1) => segments.flatMap(([s, e]) => (c1 <= s || c0 >= e ? [[s, e]] : [[s, Math.max(s, c0)], [Math.min(e, c1), e]].filter(([u, v]) => v - u > 0.05)));
      for (const a of columns) {
        let segments = [[y0, y1]];
        for (const o of openings) if (a > o.a0 && a < o.a1) segments = cut(segments, o.y0, o.y1);
        for (const [s, e] of segments) f.line(a, s, a, e, 0.014, L.seam);
      }
      for (const y of rows) {
        let segments = [[a0, a1]];
        for (const o of openings) if (y > o.y0 && y < o.y1) segments = cut(segments, o.a0, o.a1);
        for (const [s, e] of segments) f.line(s, y, e, y, 0.014, L.seam);
      }
    }

    // Plan data. x runs along the main facades (left to right in the photo), z points to the viewer, y is up.
    const H = 7.4;
    const WALL = 0.25;
    const BACK = -14.9;                                              // assumed common rear wall, not visible in the photo
    const WING = { x0: -13.75, x1: -6.65, front: 5.5, h: 5.0 };      // low garage wing, furthest forward
    const CORE = { x0: -6.65, x1: 0, front: 0, h: H };               // taller orange block
    const UPPER = { x0: 0, x1: 7.8, front: -6.6, y0: 2.5, h: H };    // brown upper wing, cantilevered
    const BASE = { x0: 0, x1: 6.9, front: -7.1, h: 2.5 };            // glazed ground floor under the brown wing
    const STALLS = [-3.88, -1.53, 0.82, 4.15, 6.5, 8.85];            // parking lines in front of the entrance

    // Each volume has rising side walls, one hinged front elevation and a roof.
    // The front elevation lies flat on its own footprint in the drawing and stands up on its base line.
    const volumes = [];
    function volume(x, z, lift) {
      const groups = { walls: new T.Group(), front: new T.Group(), roof: new T.Group(), soffit: new T.Group() };
      groups.front.position.set(x, lift, z);
      groups.front.rotation.x = -Math.PI / 2;
      scene.add(groups.walls, groups.front, groups.roof, groups.soffit);
      const v = { groups, lift, walls: batch(groups.walls), front: batch(groups.front), roof: batch(groups.roof), soffit: batch(groups.soffit), roofMaterials: [] };
      v.roofLine = own(new T.LineBasicMaterial({ color: '#34372f', transparent: true, opacity: 0 }));
      volumes.push(v);
      return v;
    }
    const roofSurface = texture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#939b96';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 5000; i++) {
        const x = (i * 73 + (i % 7) * 13) % w, y = (i * 47 + Math.floor(i / 11) * 17) % h;
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.065)' : 'rgba(24,35,32,.05)';
        ctx.fillRect(x, y, 1, 1);
      }
      ctx.strokeStyle = 'rgba(43, 55, 49, .15)';
      ctx.lineWidth = 1;
      for (let y = 0.5; y < h; y += 64) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
    }, [2, 4]);
    function roof(v, x0, x1, z0, z1, top) {
      const membrane = material(PAPER, '#aeb5af', { map: roofSurface, transparent: true, opacity: 0, roughness: 0.96, envMapIntensity: 0.04 });
      const edge = material(PAPER, '#c5cecb', { transparent: true, opacity: 0, metalness: 0.32, roughness: 0.4, envMapIntensity: 0.3 });
      const inner = material(PAPER, '#4f5652', { transparent: true, opacity: 0, roughness: 0.94 });
      v.roofMaterials.push(membrane, edge, inner);
      const r = v.roof, o = 0.04, t = WALL + 0.05, up = 0.16;
      r.box(x0 + 0.02, x1 - 0.02, top - 0.2, top - 0.02, z0 + 0.02, z1 - 0.02, membrane, null);
      r.box(x0 - o, x1 + o, top - 0.02, top + up, z1 - t, z1 + o, edge, v.roofLine);
      r.box(x0 - o, x1 + o, top - 0.02, top + up, z0 - o, z0 + t, edge, v.roofLine);
      r.box(x0 - o, x0 + t, top - 0.02, top + up, z0 + t, z1 - t, edge, v.roofLine);
      r.box(x1 - t, x1 + o, top - 0.02, top + up, z0 + t, z1 - t, edge, v.roofLine);
      // A fine return beneath the cap gives the flat roof a tactile edge in the grazing light.
      r.box(x0 + t, x1 - t, top - 0.02, top + 0.085, z1 - t - 0.035, z1 - t, inner, null);
      r.box(x0 + t, x1 - t, top - 0.02, top + 0.085, z0 + t, z0 + t + 0.035, inner, null);
      r.box(x0 + t, x0 + t + 0.035, top - 0.02, top + 0.085, z0 + t, z1 - t, inner, null);
      r.box(x1 - t - 0.035, x1 - t, top - 0.02, top + 0.085, z0 + t, z1 - t, inner, null);
    }

    { // Low orange wing with two recessed garage bays.
      const { x0, x1, front, h } = WING, t = WALL, w = x1 - x0;
      const v = volume(x0, front, 1.2);
      v.walls.box(x0, x0 + t, 0, h, BACK, front - t, M.orange);
      v.walls.box(x0 + t, x1, 0, h, BACK, BACK + t, M.orange);
      v.walls.box(x1 - t, x1, 0, h, CORE.front, front - t, M.orange);
      const side = face(v.walls, eastFace(x1, front));
      seams(side, t, front - CORE.front, 0, h, [1.35, 2.45, 3.55, 4.65], [2.6], []);
      fixture(side, 2.9, 3.3);
      const f = face(v.front, local), openings = [];
      f.box(0, w, 2.8, h, -t, 0, M.orange);
      for (const [a0, a1] of [[0, 0.55], [2.4, 3.5], [5.35, w]]) f.box(a0, a1, 0, 2.8, -t, 0, M.orange);
      for (const [a0, a1] of [[0.55, 2.4], [3.5, 5.35]]) {
        f.box(a0, a0 + 0.06, 0, 2.8, -1.05, -t, M.orange, null);
        f.box(a1 - 0.06, a1, 0, 2.8, -1.05, -t, M.orange, null);
        f.box(a0, a1, 2.74, 2.8, -1.05, -t, M.orange, null);
        f.box(a0 + 0.06, a1 - 0.06, 0, 2.74, -1.06, -1.0, M.garage);
        for (let y = 0.55; y < 2.7; y += 0.55) f.line(a0 + 0.06, y, a1 - 0.06, y, -0.995, L.seam);
        fixture(f, (a0 + a1) / 2, 3.2);
        openings.push({ a0, a1, y0: 0, y1: 2.8 });
      }
      seams(f, 0, w, 0, h, divide(0, w, 8), [], openings);
      groundLine(f, w);
      roof(v, x0, x1, BACK, front, h);
    }

    { // Two-storey orange block with a side door, canopy and asymmetric windows.
      const { x0, x1, front, h } = CORE, t = WALL, w = x1 - x0;
      const v = volume(x0, front, 0.45);
      v.walls.box(x0, x0 + t, 0, h, BACK, front - t, M.orange);
      v.walls.box(x1 - t, x1, 0, h, BACK, front - t, M.orange);
      v.walls.box(x0 + t, x1 - t, 0, h, BACK, BACK + t, M.orange);
      const side = face(v.walls, eastFace(x1, front)), sideOpenings = [];
      windowUnit(side, 0.75, 1.46, 3.8, 6.24, 1, M.glassUpper, sideOpenings);
      windowUnit(side, 2.0, 2.43, 3.86, 6.24, 1, M.glassUpper, sideOpenings);
      windowUnit(side, 5.41, 6.07, 3.88, 6.34, 1, M.glassUpper, sideOpenings);
      windowUnit(side, 2.72, 5.15, 1.9, 2.68, 3, M.glassUpper, sideOpenings);
      windowUnit(side, 5.7, 6.15, 1.9, 2.68, 1, M.glassUpper, sideOpenings);
      fixture(side, 4.1, 3.05);
      seams(side, 0, front - UPPER.front, 0, h, divide(0, front - UPPER.front, 7), divide(0, h, 8), sideOpenings);
      const f = face(v.front, local), openings = [];
      f.box(0, w, 0, h, -t, 0, M.orange);
      door(f, 0.65, 1.55, 2.25, openings);
      f.box(0.25, 1.95, 2.7, 2.75, 0, 0.9, M.flashing);
      for (const a of [0.55, 1.65]) f.seg(a, 3.55, 0.02, a, 2.75, 0.85, L.rod);
      openings.push({ a0: 0.25, a1: 1.95, y0: 2.6, y1: 3.6 });
      windowUnit(f, 2.25, 3.35, 1.0, 2.3, 1, M.glassUpper, openings);
      windowUnit(f, 2.0, 2.6, 5.0, 6.2, 1, M.glassUpper, openings);
      windowUnit(f, 4.95, 5.95, 3.8, 6.2, 1, M.glassUpper, openings);
      fixture(f, 3.86, 2.95);
      seams(f, 0, w, 0, h, divide(0, w, 7), divide(0, h, 8), openings);
      groundLine(f, w);
      roof(v, x0, x1, BACK, front, h);
    }

    { // Brown upper wing with ribbon glazing, over the glazed entrance floor.
      const t = WALL, w = UPPER.x1 - UPPER.x0, depth = UPPER.front - BACK, baseDepth = BASE.front - BACK;
      const v = volume(UPPER.x0, UPPER.front, 0.95);
      v.walls.box(UPPER.x1 - t, UPPER.x1, UPPER.y0, UPPER.h, BACK, UPPER.front - t, M.brown);
      v.walls.box(UPPER.x0, UPPER.x1 - t, UPPER.y0, UPPER.h, BACK, BACK + t, M.brown);
      v.walls.box(BASE.x1 - t, BASE.x1, 0, BASE.h, BACK, BASE.front - 2.4, M.orange);
      v.walls.box(BASE.x0, BASE.x1 - t, 0, BASE.h, BACK, BACK + t, M.orange);
      const upperSide = face(v.walls, eastFace(UPPER.x1, UPPER.front)), upperOpenings = [];
      windowUnit(upperSide, 0.87, 7.6, 3.9, 6.4, 8, M.glassUpper, upperOpenings);
      seams(upperSide, 0, depth, UPPER.y0, UPPER.h, divide(0, depth, 7), [3.2, 6.9], upperOpenings);
      fixture(upperSide, 0.35, 7.0);
      fixture(upperSide, 0.35, 2.85);
      const baseSide = face(v.walls, eastFace(BASE.x1, BASE.front));
      curtainWall(baseSide, 0.25, 2.4, 0, BASE.h, 0, [0.97, 1.69], 2.2, M.glassLower);
      seams(baseSide, 2.4, baseDepth, 0, BASE.h, [3.5, 4.6, 5.7, 6.8], [1.25], []);
      const f = face(v.front, local), openings = [], recess = BASE.front - UPPER.front;
      f.box(0, w, UPPER.y0, UPPER.h, -t, 0, M.brown);
      windowUnit(f, 1.0, 7.4, 3.9, 6.4, 7, M.glassUpper, openings);
      seams(f, 0, w, UPPER.y0, UPPER.h, divide(0, w, 7), [3.2, 6.9], openings);
      for (const a of [0.35, w - 0.35]) {
        fixture(f, a, 7.0);
        fixture(f, a, 2.85);
      }
      f.box(0, 0.3, 0, BASE.h, recess - t, recess, M.orange);
      f.box(6.3, BASE.x1, 0, BASE.h, recess - t, recess, M.orange);
      curtainWall(f, 0.3, 6.3, 0, BASE.h, recess, [1.05, 1.8, 2.475, 3.15, 4.0, 4.8, 5.57], 2.2, M.glassLower);
      for (const a of [2.4, 2.55]) f.box(a - 0.02, a + 0.02, 0.85, 1.55, recess, recess + 0.1, M.dark, null);
      f.box(1.6, 3.35, 0, 0.05, recess, 0.45, M.concrete);
      groundLine(f, w);
      roof(v, UPPER.x0, UPPER.x1, BACK, UPPER.front, UPPER.h);
      const soffitMaterial = material(PAPER, '#56463a', { transparent: true, opacity: 0 });
      v.roofMaterials.push(soffitMaterial);
      v.soffit.box(UPPER.x0, UPPER.x1 - t, UPPER.y0 - 0.12, UPPER.y0, BACK + t, UPPER.front - t, soffitMaterial, null);
    }
    for (const v of volumes) for (const key of ['walls', 'front', 'roof', 'soffit']) v[key].build();

    // Floor plan fills, always present under the model.
    const floors = new T.Group();
    scene.add(floors);
    const floorBatch = batch(floors);
    floorBatch.box(WING.x0, WING.x1, 0, 0.012, BACK, WING.front, M.floor, null);
    floorBatch.box(CORE.x0, CORE.x1, 0, 0.012, BACK, CORE.front, M.floor, null);
    floorBatch.box(BASE.x0, BASE.x1, 0, 0.012, BACK, BASE.front, M.floor, null);
    floorBatch.build({ cast: false });

    // Drawing annotations: structural grid with lettered axes, entrance arrows and forecourt lines.
    const drawing = new T.Group();
    scene.add(drawing);
    const drawingBatch = batch(drawing);
    const labelMaterials = [];
    const bubbleZ = BACK - 2.3, bubbleX = WING.x0 - 2.3, radius = 0.72;
    function bubble(label, x, z) {
      const points = Array.from({ length: 41 }, (_, i) => [x + Math.cos((i / 40) * Math.PI * 2) * radius, 0.03, z + Math.sin((i / 40) * Math.PI * 2) * radius]);
      for (let i = 0; i < 40; i++) drawingBatch.segment(points[i], points[i + 1], L.red);
      const map = texture(128, 128, ctx => {
        ctx.fillStyle = '#b82d28';
        ctx.font = '700 72px Manrope, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 64, 68);
      });
      const labelMaterial = own(new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false }));
      labelMaterials.push(labelMaterial);
      const plane = new T.Mesh(own(new T.PlaneGeometry(1.15, 1.15)), labelMaterial);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(x, 0.04, z);
      drawing.add(plane);
    }
    for (const [label, x] of [['A', WING.x0], ['B', CORE.x0], ['C', CORE.x1], ['D', UPPER.x1]]) {
      drawingBatch.segment([x, 0.03, bubbleZ + radius], [x, 0.03, 7.4], L.grid);
      bubble(label, x, bubbleZ);
    }
    for (const [label, z] of [['1', WING.front], ['2', CORE.front], ['3', UPPER.front], ['4', BACK]]) {
      drawingBatch.segment([bubbleX + radius, 0.03, z], [UPPER.x1 + 2, 0.03, z], L.grid);
      bubble(label, bubbleX, z);
    }
    // Light 45 degree hatch marks the building footprints; the unfolded elevations cover part of it.
    for (const [x0, x1, z0, z1] of [[WING.x0, WING.x1, BACK, WING.front], [CORE.x0, CORE.x1, BACK, CORE.front], [UPPER.x0, UPPER.x1, BACK, UPPER.front]]) {
      for (let c = x0 - z1 + 0.85; c < x1 - z0; c += 0.85) {
        const start = Math.max(x0, z0 + c), end = Math.min(x1, z1 + c);
        if (end - start > 0.05) drawingBatch.segment([start, 0.02, start - c], [end, 0.02, end - c], L.hatch);
      }
    }
    drawingBatch.build({ cast: false });
    const arrowMaterial = own(new T.MeshBasicMaterial({ color: '#b82d28', transparent: true, depthWrite: false }));
    const arrowShape = new T.Shape([new T.Vector2(0, 0.55), new T.Vector2(-0.34, -0.2), new T.Vector2(0.34, -0.2)]);
    const arrowGeometry = own(new T.ShapeGeometry(arrowShape));
    for (const [x, z] of [[2.475, UPPER.front + 1.3], [CORE.x0 + 1.1, CORE.front + 1.3]]) {
      const arrow = new T.Mesh(arrowGeometry, arrowMaterial);
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.set(x, 0.035, z);
      drawing.add(arrow);
    }

    // A single red trace follows the exact footprint before those same edges rise into walls.
    const perimeter = [
      [WING.x0, WING.front], [WING.x1, WING.front], [CORE.x0, CORE.front],
      [CORE.x1, CORE.front], [UPPER.x0, UPPER.front], [UPPER.x1, UPPER.front],
      [UPPER.x1, BACK], [WING.x0, BACK], [WING.x0, WING.front],
    ];
    const tracePoints = [];
    for (let i = 0; i < perimeter.length - 1; i++) {
      const [x0, z0] = perimeter[i], [x1, z1] = perimeter[i + 1];
      const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) * 10));
      for (let k = 0; k < steps; k++) tracePoints.push(new T.Vector3(lerp(x0, x1, k / steps), 0.065, lerp(z0, z1, k / steps)));
    }
    tracePoints.push(tracePoints[0].clone());
    const traceGeometry = own(new T.BufferGeometry().setFromPoints(tracePoints));
    const traceMaterial = own(new T.LineBasicMaterial({ color: '#df4237', transparent: true, opacity: 0, toneMapped: false }));
    drawing.add(new T.Line(traceGeometry, traceMaterial));

    // On wide paper the companion elevation is drawn from the very same facade geometry.
    // This fills the sheet naturally without stretching the plan or inventing interior dimensions.
    const elevationDrawing = new T.Group();
    scene.add(elevationDrawing);
    const elevationInk = own(new T.LineBasicMaterial({ color: '#41473f', transparent: true, opacity: 0.8, toneMapped: false }));
    const elevationFine = own(new T.LineBasicMaterial({ color: '#7e857c', transparent: true, opacity: 0.4, toneMapped: false }));
    const ELEVATION = { x: 14.5, z: -3.4, width: UPPER.x1 - WING.x0 };
    for (const v of volumes) {
      for (const child of v.groups.front.children) {
        if (!child.isLineSegments) continue;
        const geometry = own(child.geometry.clone());
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const a = positions.getX(i), height = positions.getY(i);
          positions.setXYZ(i, ELEVATION.x + v.groups.front.position.x - WING.x0 + a, 0.045, ELEVATION.z - height);
        }
        positions.needsUpdate = true;
        elevationDrawing.add(new T.LineSegments(geometry, child.material === L.ink ? elevationInk : elevationFine));
      }
    }
    const elevationBase = own(new T.BufferGeometry().setFromPoints([
      new T.Vector3(ELEVATION.x - 0.5, 0.045, ELEVATION.z),
      new T.Vector3(ELEVATION.x + ELEVATION.width + 0.5, 0.045, ELEVATION.z),
    ]));
    elevationDrawing.add(new T.Line(elevationBase, elevationInk));
    const captionMaterials = [];
    function paperCaption(label, x, z, width, group = elevationDrawing, color = '#555e53') {
      const map = texture(1024, 80, ctx => {
        ctx.fillStyle = color;
        ctx.font = '500 38px Manrope, Arial, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 4, 40);
      });
      const m = own(new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }));
      captionMaterials.push(m);
      const plane = new T.Mesh(own(new T.PlaneGeometry(width, width * 80 / 1024)), m);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(x + width / 2, 0.05, z);
      group.add(plane);
    }
    paperCaption('02 / FASĀDES STUDIJA', ELEVATION.x, -13.9, 16.8, elevationDrawing, '#b7382e');
    paperCaption('Trīs apjomi. Viena ēka.', ELEVATION.x, -1.1, 17.5);
    paperCaption('No līnijas līdz detaļai.', ELEVATION.x, 0.1, 17.5);
    paperCaption('01 / ĒKAS PLĀNS', WING.x0, 8.3, 15.2, drawing, '#b7382e');

    // Forecourt: model base, herringbone paving, lawn strip, curbs and parking lines.
    const site = new T.Group();
    scene.add(site);
    const siteMaterials = [];
    function siteMaterial(color, options = {}) {
      const m = own(new T.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity: 0, ...options }));
      siteMaterials.push(m);
      return m;
    }
    function siteMesh(geometry, mat, order, position, flat = false) {
      const mesh = new T.Mesh(own(geometry), mat);
      if (flat) mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(...position);
      mesh.renderOrder = order;
      mesh.receiveShadow = true;
      site.add(mesh);
      return mesh;
    }
    // Model base extents: the forecourt reaches past the parking lines and the lawn strip east of the building.
    const BASE_PLATE = { x0: -15.8, x1: 12.3, z0: -16.9, z1: 10.4 };
    const plate = { w: BASE_PLATE.x1 - BASE_PLATE.x0, d: BASE_PLATE.z1 - BASE_PLATE.z0, x: (BASE_PLATE.x0 + BASE_PLATE.x1) / 2, z: (BASE_PLATE.z0 + BASE_PLATE.z1) / 2 };
    const paving = texture(256, 256, (ctx, w) => {
      ctx.fillStyle = '#d8cbb0';
      ctx.fillRect(0, 0, w, w);
      const cell = w / 16;
      ctx.strokeStyle = 'rgba(118, 92, 58, 0.2)';
      ctx.lineWidth = 1;
      for (let k = -6; k < 6; k++) {
        for (let n = -3; n < 18; n++) {
          const x = (4 * k + n) * cell;
          ctx.strokeRect(x + 0.5, n * cell + 0.5, cell * 2, cell);
          ctx.strokeRect(x + 0.5, (n + 1) * cell + 0.5, cell, cell * 2);
        }
      }
    }, [plate.w / 3.5, plate.d / 3.5]);
    const lawnX = 9.3, curbZ = 4.2;
    siteMesh(new T.BoxGeometry(plate.w, 0.38, plate.d), siteMaterial('#d6cfc0'), 1, [plate.x, -0.23, plate.z]);
    siteMesh(new T.PlaneGeometry(plate.w, plate.d), siteMaterial('#ffffff', { map: paving }), 2, [plate.x, -0.035, plate.z], true);
    siteMesh(new T.PlaneGeometry(BASE_PLATE.x1 - lawnX, curbZ - BASE_PLATE.z0), siteMaterial('#b3a883'), 3, [(lawnX + BASE_PLATE.x1) / 2, -0.03, (curbZ + BASE_PLATE.z0) / 2], true);
    const curb = siteMaterial('#d3cdc1');
    siteMesh(new T.BoxGeometry(BASE_PLATE.x1 - 4.1, 0.12, 0.18), curb, 4, [(4.1 + BASE_PLATE.x1) / 2, 0.02, curbZ + 0.01]);
    siteMesh(new T.BoxGeometry(0.18, 0.12, curbZ - BASE_PLATE.z0), curb, 4, [lawnX, 0.02, (curbZ + BASE_PLATE.z0) / 2]);
    const paint = siteMaterial('#f5f3ec');
    for (const x of STALLS) siteMesh(new T.BoxGeometry(0.12, 0.012, 4.9), paint, 4, [x, -0.025, 6.75]);
    const contactExtent = { x0: -16, x1: 10, z0: -16.5, z1: 7.5 };
    const contactMap = texture(256, 256, (ctx, size) => {
      const sx = size / (contactExtent.x1 - contactExtent.x0), sz = size / (contactExtent.z1 - contactExtent.z0);
      ctx.fillStyle = '#000';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 18;
      for (const [x0, x1, z0, z1] of [[WING.x0, WING.x1, BACK, WING.front], [CORE.x0, CORE.x1, BACK, CORE.front], [BASE.x0, BASE.x1, BACK, BASE.front]]) {
        ctx.fillRect((x0 - contactExtent.x0) * sx, (z0 - contactExtent.z0) * sz, (x1 - x0) * sx, (z1 - z0) * sz);
      }
    });
    const contactMaterial = own(new T.MeshBasicMaterial({ map: contactMap, transparent: true, opacity: 0, depthWrite: false }));
    const contact = new T.Mesh(own(new T.PlaneGeometry(contactExtent.x1 - contactExtent.x0, contactExtent.z1 - contactExtent.z0)), contactMaterial);
    contact.rotation.x = -Math.PI / 2;
    contact.position.set((contactExtent.x0 + contactExtent.x1) / 2, -0.028, (contactExtent.z0 + contactExtent.z1) / 2);
    contact.renderOrder = 5;
    site.add(contact);

    let finite = true;
    scene.traverse(object => {
      const positions = object.geometry && object.geometry.attributes.position;
      if (positions) for (const value of positions.array) if (!Number.isFinite(value)) finite = false;
      if (object.geometry) own(object.geometry);
    });
    host.dataset.geometryFinite = String(finite);
    if (!finite) throw new Error('Non-finite model geometry.');

    // Framing: the camera frustum fits the drawing, then the finished model, inside the stage safe area.
    const corners = (x0, x1, y0, y1, z0, z1) => [x0, x1].flatMap(x => [y0, y1].flatMap(y => [z0, z1].map(z => new T.Vector3(x, y, z))));
    const drawingPoints = corners(bubbleX - radius - 0.2, UPPER.x1 + 2.2, 0, 1, bubbleZ - radius - 0.2, 9.4);
    const sheetPoints = [...drawingPoints, ...corners(ELEVATION.x - 1, ELEVATION.x + ELEVATION.width + 1, 0, 1, -15, 2)];
    const modelPoints = [...corners(BASE_PLATE.x0, BASE_PLATE.x1, -0.42, 0, BASE_PLATE.z0, BASE_PLATE.z1),...corners(WING.x0, WING.x1, 0, WING.h + 0.2, BACK, WING.front), ...corners(CORE.x0, UPPER.x1, 0, H + 0.2, BACK, CORE.front)];
    // Portrait stages frame the building and the forecourt in front of it; the model base may crop at the sides.
    const compactPoints = [...corners(WING.x0, WING.x1, 0, WING.h + 0.2, BACK, WING.front), ...corners(CORE.x0, UPPER.x1, 0, H + 0.2, BACK, CORE.front), ...corners(-8, 10, -0.42, 0, -8, BASE_PLATE.z1)];
    const scratch = new T.Vector3();
    let view = { w: 1, h: 1, top: 64, right: 32, bottom: 88, left: 32 };
    function frustum(points, zoomOut = 1) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const point of points) {
        scratch.copy(point).applyMatrix4(camera.matrixWorldInverse);
        x0 = Math.min(x0, scratch.x); x1 = Math.max(x1, scratch.x);
        y0 = Math.min(y0, scratch.y); y1 = Math.max(y1, scratch.y);
      }
      const width = view.w - view.left - view.right, height = view.h - view.top - view.bottom;
      const scale = Math.max((x1 - x0) / width, (y1 - y0) / height) * 1.04 * zoomOut;
      const left = (x0 + x1) / 2 - (view.left + width / 2) * scale;
      const top = (y0 + y1) / 2 + (view.top + height / 2) * scale;
      return [left, left + view.w * scale, top, top - view.h * scale];
    }

    let renders = 0;
    let dirty = true;
    function draw(p) {
      dirty = false;
      const tilt = easeInOut(span(p, 0.23, 0.9));
      const turn = easeInOut(span(p, 0.23, 0.84));
      const elevation = T.MathUtils.degToRad(lerp(89.9, 23, tilt));
      const azimuth = T.MathUtils.degToRad(36 * turn);
      camera.position.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).multiplyScalar(120).add(target);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      const portrait = clamp01((1.3 - view.w / view.h) / 0.4);
      const whole = frustum(modelPoints), compact = portrait > 0 ? frustum(compactPoints) : whole;
      const settle = 1 + 0.07 * (1 - smooth(span(p, 0, 0.3))); // slow push-in keeps the held drawing alive
      const wideSheet = view.w >= 1000 && view.w / view.h > 1.6;
      const a = frustum(wideSheet ? sheetPoints : drawingPoints, settle), b = whole.map((value, i) => lerp(value, compact[i], portrait)), fit = smooth(span(p, 0.2, 0.92));
      [camera.left, camera.right, camera.top, camera.bottom] = a.map((value, i) => lerp(value, b[i], fit));
      camera.updateProjectionMatrix();

      const inkOpacity = lerp(0.9, 0.13, smooth(span(p, 0.46, 0.86)));
      volumes.forEach((v, i) => {
        const angle = easeInOut(span(p, 0.29 + i * 0.05, 0.62 + i * 0.05)) * (Math.PI / 2);
        v.groups.walls.scale.y = Math.max(0.001, Math.sin(angle));
        v.groups.front.rotation.x = angle - Math.PI / 2;
        v.groups.front.position.y = v.lift * Math.cos(angle);
        const r = easeOut(span(p, 0.6 + i * 0.05, 0.76 + i * 0.05));
        v.groups.roof.visible = v.groups.soffit.visible = r > 0;
        v.groups.roof.position.y = (1 - r) * 1.6;
        for (const m of v.roofMaterials) m.opacity = r;
        v.roofLine.opacity = r * inkOpacity;
      });

      const finish = smooth(span(p, 0.44, 0.82));
      for (const { m, from, to } of fades) m.color.copy(from).lerp(to, finish);
      glassMix.value = finish;
      const light = smooth(span(p, 0.4, 0.9));
      hemi.intensity = lerp(Math.PI, 2.35, light);
      hemi.color.copy(skyWhite).lerp(skyWarm, light);
      sun.intensity = 2.0 * light;
      L.ink.opacity = inkOpacity;
      L.seam.color.copy(seamDrawing).lerp(seamFinal, finish);
      L.seam.opacity = lerp(0.55, 0.4, finish);
      const annotation = 1 - smooth(span(p, 0.26, 0.56));
      const elevationFade = 1 - smooth(span(p, 0.2, 0.46));
      elevationDrawing.visible = wideSheet && elevationFade > 0;
      elevationInk.opacity = 0.8 * elevationFade;
      elevationFine.opacity = 0.4 * elevationFade;
      for (const m of captionMaterials) m.opacity = annotation;
      traceMaterial.opacity = 0.7 * annotation;
      traceGeometry.setDrawRange(0, Math.max(2, Math.floor(tracePoints.length * smooth(span(p, 0, 0.23)))));
      L.red.opacity = annotation;
      L.grid.opacity = 0.75 * annotation;
      L.hatch.opacity = 0.55 * annotation;
      arrowMaterial.opacity = annotation;
      for (const m of labelMaterials) m.opacity = annotation;
      L.site.opacity = 0.5 * (1 - smooth(span(p, 0.5, 0.8)));
      drawing.visible = annotation > 0 || L.site.opacity > 0;
      const ground = smooth(span(p, 0.34, 0.72));
      for (const m of siteMaterials) m.opacity = ground;
      contactMaterial.opacity = 0.55 * smooth(span(p, 0.72, 1));
      site.visible = ground > 0;

      renderer.render(scene, camera);
      renders += 1;
      host.dataset.renderCount = String(renders);
      host.dataset.progress = p.toFixed(4);
      host.dataset.phase = p < 0.23 ? 'drawing' : p < 0.8 ? 'build' : 'complete';
      host.style.setProperty('--build-progress', p.toFixed(4));
    }

    function readView() {
      const style = getComputedStyle(stage);
      const read = (name, fallback) => {
        const value = parseFloat(style.getPropertyValue(name));
        return Number.isFinite(value) && value >= 0 ? value : fallback;
      };
      const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
      const next = { w, h, top: read('--scene-inset-top', 64), right: read('--scene-inset-right', 32), bottom: read('--scene-inset-bottom', 88), left: read('--scene-inset-left', 32) };
      // Keep at least half of the stage available to the model.
      const horizontal = Math.min(1, (w * 0.5) / Math.max(1, next.left + next.right));
      const vertical = Math.min(1, (h * 0.5) / Math.max(1, next.top + next.bottom));
      next.left *= horizontal; next.right *= horizontal;
      next.top *= vertical; next.bottom *= vertical;
      return next;
    }
    function resize() {
      view = readView();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, view.w < 700 ? 1.5 : 1.75));
      renderer.setSize(view.w, view.h, false);
      dirty = true;
    }

    // Reveal controller: starts once the stage is in view, pauses offscreen or in a hidden tab, then stops.
    let progress = reducedMotion.matches ? 1 : 0;
    let elapsed = progress * REVEAL_MS;
    let reveal = '';
    let visible = false, seeking = false, frame = 0, last = 0, startedAt = 0;
    const setReveal = state => {
      if (reveal === state) return;
      reveal = state;
      host.dataset.reveal = state;
    };
    const unfinished = () => reveal === 'playing' || reveal === 'paused';
    function schedule() {
      if (!frame) frame = requestAnimationFrame(tick);
    }
    function update() {
      if (unfinished() && !seeking) setReveal(visible && !document.hidden ? 'playing' : 'paused');
      if (!visible || document.hidden) return;
      if ((reveal === 'playing' && !seeking) || dirty) schedule();
    }
    function tick(now) {
      frame = 0;
      if (!visible || document.hidden) {
        last = 0;
        return;
      }
      if (reveal === 'playing' && !seeking) {
        const step = last ? Math.min(250, now - last) : 0;
        last = now;
        elapsed = Math.min(REVEAL_MS, elapsed + step);
        progress = elapsed / REVEAL_MS;
        draw(progress);
        if (elapsed >= REVEAL_MS) complete();
        else schedule();
      } else if (dirty) {
        draw(progress);
      }
    }
    function start() {
      if (reveal !== 'waiting' || seeking) return;
      startedAt = performance.now();
      last = 0;
      setReveal('playing');
    }
    function complete() {
      last = 0;
      host.dataset.revealMs = String(Math.round(performance.now() - startedAt));
      host.classList.add('is-complete');
      setReveal('done');
    }
    function showFinished() {
      cancelAnimationFrame(frame);
      frame = 0;
      elapsed = REVEAL_MS;
      progress = 1;
      host.classList.add('is-complete');
      setReveal('static');
      dirty = true;
      update();
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      const viewport = (entry.rootBounds && entry.rootBounds.height) || window.innerHeight;
      if (visible && (entry.intersectionRatio >= START_RATIO || entry.intersectionRect.height >= viewport * 0.75)) start();
      update();
    }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
    const resizeObserver = new ResizeObserver(() => {
      resize();
      update();
    });
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
      }
      update();
    };
    const onMotion = () => {
      if (reducedMotion.matches && reveal !== 'done') showFinished();
    };
    const onContextLost = event => {
      event.preventDefault();
      showPhotograph('context-lost');
    };

    resize();
    // Warm-up: one unseen render with every group visible uploads all programs, buffers and textures now,
    // so no part of the reveal stalls when it first appears. The scene is always fully framed, so culling is off.
    scene.traverse(object => { object.frustumCulled = false; });
    for (const group of [site, drawing, ...volumes.flatMap(v => [v.groups.roof, v.groups.soffit])]) group.visible = true;
    sun.intensity = 1;
    renderer.render(scene, camera);
    draw(progress);
    host.classList.add('model-ready');
    host.classList.remove('is-static');
    host.dataset.state = 'ready';
    if (reducedMotion.matches) showFinished();
    else setReveal('waiting');
    observer.observe(stage);
    resizeObserver.observe(stage);
    document.addEventListener('visibilitychange', onVisibility);
    reducedMotion.addEventListener('change', onMotion);
    canvas.addEventListener('webglcontextlost', onContextLost);

    // Verification hook: renders one exact progress value and stops the automatic reveal.
    window.savsArchitecture = Object.freeze({
      seek(value) {
        const p = clamp01(Number(value) || 0);
        seeking = true;
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
        setReveal('paused');
        host.classList.toggle('is-complete', p >= 1);
        progress = p;
        elapsed = p * REVEAL_MS;
        draw(p);
        return p;
      },
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener('change', onMotion);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      delete window.savsArchitecture;
      for (const item of new Set(disposables)) item.dispose();
      renderer.dispose();
    };
  }

  init();
})();
