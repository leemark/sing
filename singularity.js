const VERT = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_confidence;
uniform int u_verdict;
uniform vec2 u_pointer;
uniform float u_scroll;

out vec4 outColor;

const float HORIZON = 1.15;
const float DISC_IN = 2.4;
const float DISC_OUT = 5.0;
const float BEND_STR = 0.6;

float hash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i);
  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  mat3 rot = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.02 + 1.7;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;

  float chaos = u_verdict == 2 ? 1.0 : (u_verdict == 1 ? 0.45 : 0.0);
  float turb = 0.5 + 0.5 * u_confidence + chaos * 0.4;

  vec3 ro = vec3(0.0, 1.8 + u_pointer.y * 0.35, 7.0 - u_scroll * 2.2);
  float yaw = u_pointer.x * 0.55;
  float pitch = -u_pointer.y * 0.25;
  ro = vec3(cos(yaw) * ro.x - sin(yaw) * ro.z, ro.y, sin(yaw) * ro.x + cos(yaw) * ro.z);
  ro = vec3(ro.x, cos(pitch) * ro.y - sin(pitch) * ro.z, sin(pitch) * ro.y + cos(pitch) * ro.z);
  vec3 rd = normalize(vec3(uv.x, uv.y - 0.35, -1.55));

  vec3 p = ro;
  vec3 dir = rd;
  vec3 prevP = ro;
  float t = 0.0;
  float minR = 1e5;
  bool captured = false;
  bool diskHit = false;
  vec3 diskQ = vec3(0.0);

  for (int i = 0; i < 72; i++) {
    float r2 = dot(p, p);
    minR = min(minR, sqrt(r2));
    if (r2 < HORIZON * HORIZON) {
      captured = true;
      break;
    }
    float inv = min(1.0 / r2, 0.25);
    vec3 def = normalize(p) * (BEND_STR * inv);
    dir = normalize(dir - def);
    float step = clamp(sqrt(r2) * 0.22, 0.015, 0.5);
    p += dir * step;
    t += step;
    if (!diskHit && prevP.y > 0.0 && p.y <= 0.0) {
      float f = prevP.y / (prevP.y - p.y);
      vec3 q = mix(prevP, p, f);
      float qr = length(q.xz);
      if (qr > DISC_IN && qr < DISC_OUT) {
        diskHit = true;
        diskQ = q;
      }
    }
    prevP = p;
    if (t > 18.0) break;
  }

  vec3 col = vec3(0.0);

  if (captured) {
    col = vec3(0.0);
  } else {
    if (diskHit) {
      vec3 q = diskQ;
      float qr = length(q.xz);
      float inner = smoothstep(DISC_IN, DISC_IN + 0.35, qr);
      float outer = smoothstep(DISC_OUT, DISC_OUT - 0.35, qr);
      float edge = inner * outer;
      if (edge > 0.001) {
        float a = atan(q.z, q.x);
        float omega = 1.6 * pow(DISC_IN / qr, 1.5);
        float as = a + u_time * omega * (0.5 + turb * 0.9);
        float n = fbm(vec3(cos(as) * 3.0, sin(as) * 3.0, qr * 0.7 - u_time * (0.2 + 0.5 * turb)));
        float heat = pow(DISC_IN / qr, 1.9);
        float doppler = 1.0 + 0.4 * sin(a - u_time * omega * 1.4);
        float streaks = 0.5 + 0.5 * fbm(vec3(cos(as) * 6.0, sin(as) * 6.0, qr * 1.6 - u_time * 1.5));

        vec3 pal;
        if (u_verdict == 0) {
          pal = mix(vec3(0.02, 0.12, 0.14), vec3(0.0, 0.75, 0.7), n) + vec3(0.2, 0.4, 0.9) * pow(n, 6.0) * 0.7;
        } else if (u_verdict == 2) {
          pal = mix(vec3(0.3, 0.02, 0.03), vec3(1.0, 0.3, 0.22), n) + vec3(1.0, 0.9, 0.85) * pow(n, 6.0) * 0.8;
        } else {
          pal = mix(vec3(0.18, 0.05, 0.28), vec3(0.68, 0.4, 1.0), n) + vec3(1.0, 0.75, 0.35) * pow(n, 6.0) * 0.75;
        }

        float disk = edge * heat * (0.35 + 0.65 * streaks) * (doppler * 0.5 + 0.7);
        col += pal * disk * (0.9 + 0.6 * turb);
        col += pal * 0.08 * pow(heat, 2.0);
      }
    }

    vec3 toHole = normalize(-ro);
    float ang = acos(clamp(dot(dir, toHole), -1.0, 1.0));
    col += vec3(0.35, 0.3, 0.4) * exp(-ang * ang * 220.0) * (0.12 + 0.2 * turb);
    col += vec3(1.0, 0.8, 0.6) * exp(-pow((ang - 0.16), 2.0) * 9000.0) * 0.08;

    float ring = exp(-(minR - HORIZON) * 30.0);
    col += vec3(1.0, 0.75, 0.55) * ring * 0.9;

    vec2 cell = floor(dir.xy * 90.0);
    float star = pow(hash(vec3(cell, floor(dir.z * 90.0))), 24.0);
    col += star * vec3(0.9, 0.95, 1.0) * 1.1;
    col += vec3(0.02, 0.035, 0.06) * (0.4 + 0.6 * fbm(dir * 2.5 + u_time * 0.03));
  }

  col = 1.0 - exp(-col * 1.1);
  col = pow(col, vec3(0.4545));
  float vig = 1.0 - smoothstep(0.35, 1.5, length(uv));
  col *= mix(0.55, 1.0, vig);
  col += (hash(vec3(gl_FragCoord.xy, u_time * 20.0)) - 0.5) * 0.05;
  col += vec3(0.01, 0.015, 0.03);

  outColor = vec4(col, 1.0);
}
`;

export function createSingularity(canvas, opts = {}) {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });

  if (!gl) {
    if (typeof opts.onUnsupported === "function") opts.onUnsupported();
    return null;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const quality = coarse ? 0.6 : 1.0;

  let program = null;
  let vao = null;
  let uResolution = null;
  let uTime = null;
  let uConfidence = null;
  let uVerdict = null;
  let uPointer = null;
  let uScroll = null;

  const state = {
    time: 0,
    confidence: 0.8,
    verdict: 1,
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
  };

  function compile(type, source) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error("shader compile failed: " + info);
    }
    return sh;
  }

  function build() {
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("program link failed: " + gl.getProgramInfoLog(program));
    }

    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    uResolution = gl.getUniformLocation(program, "u_resolution");
    uTime = gl.getUniformLocation(program, "u_time");
    uConfidence = gl.getUniformLocation(program, "u_confidence");
    uVerdict = gl.getUniformLocation(program, "u_verdict");
    uPointer = gl.getUniformLocation(program, "u_pointer");
    uScroll = gl.getUniformLocation(program, "u_scroll");

    gl.useProgram(program);
    gl.bindVertexArray(vao);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * quality;
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function frame(now) {
    if (!state.running) return;
    const dt = Math.min(0.05, state.last ? (now - state.last) / 1000 : 0.016);
    state.last = now;
    state.time += dt;

    if (!reduceMotion) {
      state.px += (state.tx - state.px) * 0.06;
      state.py += (state.ty - state.py) * 0.06;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform1f(uTime, state.time);
    gl.uniform1f(uConfidence, state.confidence);
    gl.uniform1i(uVerdict, state.verdict);
    gl.uniform2f(uPointer, state.px, state.py);
    gl.uniform1f(uScroll, state.scroll);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (typeof opts.onFrame === "function") opts.onFrame();

    state.raf = requestAnimationFrame(frame);
  }

  function start() {
    if (state.running || !state.visible || !state.inView) return;
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

  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 100);
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

  function onLost(e) {
    e.preventDefault();
    stop();
  }

  function onRestored() {
    try {
      build();
      resize();
      start();
    } catch (err) {
      if (typeof opts.onUnsupported === "function") opts.onUnsupported();
    }
  }

  function init() {
    try {
      build();
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
    document.addEventListener("visibilitychange", onVisibility);
    observer.observe(canvas);
    start();
    return true;
  }

  if (!init()) return null;

  return {
    setVerdict(v) {
      const map = { no: 0, not_yet: 1, yes: 2 };
      state.verdict = map[v] ?? 1;
    },
    setConfidence(c) {
      state.confidence = Math.min(1, Math.max(0, Number(c) || 0) / 100);
    },
    setScroll(s) {
      state.scroll = Math.min(1, Math.max(0, s));
    },
    destroy() {
      stop();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    },
  };
}
