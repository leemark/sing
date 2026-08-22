const FADE_VERT = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FADE_FRAG = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  outColor = u_color;
}
`;

const PT_VERT = `#version 300 es
in vec2 a_offset;
in vec2 a_center;
in float a_size;
in vec4 a_color;
uniform vec2 u_res;
out vec4 v_color;
out vec2 v_uv;
void main() {
  vec2 px = a_center + a_offset * a_size;
  vec2 ndc = vec2(px.x / u_res.x * 2.0 - 1.0, 1.0 - px.y / u_res.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_color = a_color;
  v_uv = a_offset;
}
`;

const PT_FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
in vec2 v_uv;
out vec4 outColor;
void main() {
  float d = length(v_uv);
  float a = smoothstep(1.0, 0.1, d);
  a *= a;
  outColor = vec4(v_color.rgb, v_color.a * a);
}
`;

const R_OUT = 6.0;
const R_IN = 1.2;
const R_PHOTON = 1.6;
const SPIRAL = 0.14;

const PALETTES = {
  no: { accent: [0.0, 0.85, 0.75], accent2: [0.3, 0.55, 1.0], chaos: 0.0 },
  not_yet: { accent: [0.72, 0.45, 1.0], accent2: [1.0, 0.72, 0.35], chaos: 0.45 },
  yes: { accent: [1.0, 0.3, 0.25], accent2: [1.0, 0.95, 0.9], chaos: 1.0 },
};

export function createSingularity(canvas, opts = {}) {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "default",
  });

  if (!gl) {
    if (typeof opts.onUnsupported === "function") opts.onUnsupported();
    return null;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const N_DISK = 1700;
  const N_RING = 240;
  const N_CORE = 14;
  const TOTAL = N_DISK + N_RING + N_CORE;
  const STRIDE = 7;

  let program = null;
  let fadeProgram = null;
  let vao = null;
  let fadeVao = null;
  let buffer = null;
  let fadeBuffer = null;
  let uRes = null;
  let quadBuffer = null;

  const state = {
    time: 0,
    confidence: 0.8,
    verdict: "not_yet",
    scroll: 0,
    tx: 0,
    ty: 0,
    px: 0,
    py: 0,
    raf: 0,
    last: 0,
    running: false,
    visible: true,
    inView: true,
    nearTop: true,
    reduce: reduceMotion,
    scale: 1,
    ema: 0.016,
    adjust: 0,
    pulse: 0,
  };

  const palette = () => PALETTES[state.verdict] || PALETTES.not_yet;

  const world = [];
  for (let i = 0; i < N_DISK; i++) {
    const r = R_IN + Math.random() * (R_OUT - R_IN);
    world.push({
      r,
      a: Math.random() * Math.PI * 2,
      seed: Math.random(),
      y: (Math.random() - 0.5) * 0.22,
    });
  }
  for (let i = 0; i < N_RING; i++) {
    world.push({
      r: R_PHOTON + (Math.random() - 0.5) * 0.14,
      a: Math.random() * Math.PI * 2,
      seed: Math.random(),
      y: (Math.random() - 0.5) * 0.06,
      ring: true,
    });
  }
  for (let i = 0; i < N_CORE; i++) {
    world.push({ r: 0, a: 0, seed: Math.random(), y: (Math.random() - 0.5) * 0.05, core: true });
  }

  const data = new Float32Array(TOTAL * STRIDE);

  function compile(type, source) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error("shader compile failed: " + gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  function buildProgram(vsSrc, fsSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("program link failed: " + gl.getProgramInfoLog(p));
    }
    return p;
  }

  function setupParticleProgram() {
    program = buildProgram(PT_VERT, PT_FRAG);
    buffer = gl.createBuffer();
    quadBuffer = gl.createBuffer();
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    const offsetLoc = gl.getAttribLocation(program, "a_offset");
    gl.enableVertexAttribArray(offsetLoc);
    gl.vertexAttribPointer(offsetLoc, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(offsetLoc, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    const centerLoc = gl.getAttribLocation(program, "a_center");
    const sizeLoc = gl.getAttribLocation(program, "a_size");
    const colorLoc = gl.getAttribLocation(program, "a_color");
    gl.enableVertexAttribArray(centerLoc);
    gl.enableVertexAttribArray(sizeLoc);
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(centerLoc, 2, gl.FLOAT, false, STRIDE * 4, 0);
    gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, STRIDE * 4, 8);
    gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, STRIDE * 4, 12);
    gl.vertexAttribDivisor(centerLoc, 1);
    gl.vertexAttribDivisor(sizeLoc, 1);
    gl.vertexAttribDivisor(colorLoc, 1);

    uRes = gl.getUniformLocation(program, "u_res");
  }

  function setupFadeProgram() {
    fadeProgram = buildProgram(FADE_VERT, FADE_FRAG);
    fadeBuffer = gl.createBuffer();
    fadeVao = gl.createVertexArray();
    gl.bindVertexArray(fadeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, fadeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(fadeProgram, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  let width = 0;
  let height = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * state.scale;
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (w !== width || h !== height) {
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      resetTrails();
    }
  }

  function adjustQuality() {
    state.adjust += 1;
    if (state.adjust < 40) return;
    state.adjust = 0;
    if (state.ema > 0.034 && state.scale > 0.5) {
      state.scale = Math.max(0.5, +(state.scale - 0.15).toFixed(2));
      resize();
    } else if (state.ema < 0.018 && state.scale < 1) {
      state.scale = Math.min(1, +(state.scale + 0.15).toFixed(2));
      resize();
    }
  }

  function resetTrails() {
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function project(x, y, z, zoom) {
    const tilt = 0.36;
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);
    const yp = y * cosT - z * sinT;
    const zp = y * sinT + z * cosT;
    const depth = 11.5 - zp;
    const scale = Math.min(3.2, 6.5 / Math.max(0.6, depth));
    return {
      sx: width / 2 + x * zoom * scale + state.px * width * 0.045,
      sy: height / 2 - yp * zoom * scale + state.py * height * 0.045,
      sc: scale,
    };
  }

  function step(dt) {
    const pal = palette();
    const chaos = Math.min(1, pal.chaos + 0.3 * state.pulse);
    const speed = 0.75 + 0.85 * state.confidence;
    const bright = (0.75 + 0.75 * state.confidence) * (1 + 0.55 * state.pulse);
    const zoom = height * 0.21 * (1 - state.scroll * 0.4);
    const t = state.time;
    let o = 0;

    for (let i = 0; i < N_DISK; i++) {
      const p = world[i];
      const omega = 0.5 * Math.pow(R_OUT / Math.max(p.r, 0.4), 1.5) * speed;
      p.a += omega * dt * (1 + chaos * 0.35 * Math.sin(t * 0.4 + p.seed * 6.283));
      p.r -= SPIRAL * dt * (0.6 + 0.5 * chaos);
      if (p.r < R_IN) {
        p.r = R_OUT;
        p.a = Math.random() * Math.PI * 2;
        p.y = (Math.random() - 0.5) * 0.22;
      }

      const tw = chaos * 0.4 * Math.sin(t * 1.2 + p.seed * 6.283) * (0.3 + 0.7 * (1 - p.r / R_OUT));
      const x = p.r * Math.cos(p.a);
      const z = p.r * Math.sin(p.a);
      const y = p.y + tw;
      const pr = project(x, y, z, zoom);

      const heat = 0.35 + 1.6 * (1 - (p.r - R_IN) / (R_OUT - R_IN));
      const doppler = 1 + 0.55 * Math.sin(p.a - t * omega * 1.6);
      const mixW = Math.min(0.82, heat * heat * 0.3);
      const wob = 0.6 + 0.4 * Math.sin(p.seed * 6.283);
      const r = pal.accent[0] + (pal.accent2[0] - pal.accent[0]) * wob;
      const g = pal.accent[1] + (pal.accent2[1] - pal.accent[1]) * wob;
      const b = pal.accent[2] + (pal.accent2[2] - pal.accent[2]) * wob;
      const cr = r + (1 - r) * mixW;
      const cg = g + (1 - g) * mixW;
      const cb = b + (1 - b) * mixW;
      const lum = heat * doppler * bright * (0.7 + 0.3 * wob) * 0.9;

      data[o++] = pr.sx;
      data[o++] = pr.sy;
      data[o++] = Math.min(64, (1.3 + 1.3 * heat) * pr.sc);
      data[o++] = cr;
      data[o++] = cg;
      data[o++] = cb;
      data[o++] = Math.min(1, lum);
    }

    for (let i = 0; i < N_RING; i++) {
      const p = world[N_DISK + i];
      const omega = 2.4 * speed;
      p.a += omega * dt;
      const x = p.r * Math.cos(p.a);
      const z = p.r * Math.sin(p.a);
      const pr = project(x, p.y, z, zoom);
      const flicker = 0.75 + 0.25 * Math.sin(t * 3 + p.seed * 6.283);
      const wr = pal.accent[0] * 0.25 + 0.75;
      const wg = pal.accent[1] * 0.25 + 0.75;
      const wb = pal.accent[2] * 0.25 + 0.75;

      data[o++] = pr.sx;
      data[o++] = pr.sy;
      data[o++] = Math.min(64, 2.4 * pr.sc);
      data[o++] = wr;
      data[o++] = wg;
      data[o++] = wb;
      data[o++] = Math.min(1, 0.9 * flicker * bright);
    }

    for (let i = 0; i < N_CORE; i++) {
      const p = world[N_DISK + N_RING + i];
      const x = p.y * Math.cos(t * 0.7 + p.seed * 6.283) * 0.3;
      const z = p.y * Math.sin(t * 0.7 + p.seed * 6.283) * 0.3;
      const pr = project(x, 0, z, zoom);
      const size = (14 + 22 * Math.sin(p.seed * 6.283)) * (0.75 + 0.35 * state.confidence);
      const cr = 1 - (1 - pal.accent[0]) * 0.55;
      const cg = 1 - (1 - pal.accent[1]) * 0.55;
      const cb = 1 - (1 - pal.accent[2]) * 0.55;

      data[o++] = pr.sx;
      data[o++] = pr.sy;
      data[o++] = Math.min(64, size);
      data[o++] = cr;
      data[o++] = cg;
      data[o++] = cb;
      data[o++] = 0.2;
    }
  }

  function draw() {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(fadeProgram);
    gl.bindVertexArray(fadeVao);
    gl.uniform4f(gl.getUniformLocation(fadeProgram, "u_color"), 0, 0, 0, 0.16);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.uniform2f(uRes, width, height);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, TOTAL);
  }

  function frame(now) {
    if (!state.running) return;
    const dt = Math.min(0.05, state.last ? (now - state.last) / 1000 : 0.016);
    state.last = now;
    state.time += dt;
    state.ema = state.ema * 0.95 + dt * 0.05;
    state.pulse = Math.max(0, state.pulse - dt * 1.2);
    adjustQuality();

    if (!state.reduce) {
      state.px += (state.tx - state.px) * 0.07;
      state.py += (state.ty - state.py) * 0.07;
    }

    step(dt);
    draw();
    state.raf = requestAnimationFrame(frame);
  }

  function start() {
    if (state.running || !state.visible || !state.inView || !state.nearTop) return;
    state.running = true;
    state.last = 0;
    state.raf = requestAnimationFrame(frame);
  }

  function stop() {
    state.running = false;
    if (state.raf) cancelAnimationFrame(state.raf);
  }

  function onPointer(e) {
    const rect = canvas.getBoundingClientRect();
    state.tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    state.ty = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }

  let scrollTimer = 0;
  function onScroll() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      state.nearTop = window.scrollY < window.innerHeight * 1.1;
      if (state.nearTop) start();
      else stop();
    }, 120);
  }

  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  }

  function onVisibility() {
    state.visible = !document.hidden;
    if (state.visible) start();
    else stop();
  }

  const observer = new IntersectionObserver(
    (entries) => {
      state.inView = entries[0].isIntersecting;
      if (state.inView) start();
      else stop();
    },
    { threshold: 0.02 },
  );

  function init() {
    try {
      setupParticleProgram();
      setupFadeProgram();
      resize();
    } catch (err) {
      console.error(err);
      if (typeof opts.onUnsupported === "function") opts.onUnsupported();
      return false;
    }
    canvas.addEventListener("webglcontextlost", onLost, false);
    canvas.addEventListener("webglcontextrestored", onRestored, false);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    observer.observe(canvas);

    if (!state.reduce) {
      start();
    } else {
      step(0);
      draw();
    }
    return true;
  }

  function onLost(e) {
    e.preventDefault();
    stop();
  }

  function onRestored() {
    try {
      setupParticleProgram();
      setupFadeProgram();
      resize();
      if (state.reduce) {
        step(0);
        draw();
      } else {
        start();
      }
    } catch (err) {
      if (typeof opts.onUnsupported === "function") opts.onUnsupported();
    }
  }

  if (!init()) return null;

  return {
    setVerdict(v) {
      state.verdict = PALETTES[v] ? v : "not_yet";
      state.pulse = 1;
      resetTrails();
      if (state.reduce) {
        step(0);
        draw();
      }
    },
    setConfidence(c) {
      state.confidence = Math.min(1, Math.max(0, Number(c) || 0) / 100);
      if (state.reduce) {
        step(0);
        draw();
      }
    },
    setScroll(s) {
      state.scroll = Math.min(1, Math.max(0, s));
    },
    destroy() {
      stop();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    },
  };
}
