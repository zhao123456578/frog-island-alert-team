(function (global) {
  "use strict";
  if (global.MFAudio) return;

  const Context = global.AudioContext || global.webkitAudioContext;
  const busLevels = { ambience: 0.78, effects: 0.9, voice: 0.86, music: 0.72 };
  const elements = new Set();
  let ctx = null, master = null, compressor = null, buses = null, nodes = new WeakMap();
  let muted = false, masterVolume = 0.82;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function init() {
    if (ctx && ctx.state !== "closed") return ctx;
    if (!Context) return null;
    ctx = new Context();
    master = ctx.createGain();
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 12;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    master.gain.value = muted ? 0 : masterVolume;
    master.connect(compressor);
    compressor.connect(ctx.destination);
    buses = {};
    Object.keys(busLevels).forEach(name => {
      const gain = ctx.createGain();
      gain.gain.value = busLevels[name];
      gain.connect(master);
      buses[name] = gain;
    });
    nodes = new WeakMap();
    elements.clear();
    return ctx;
  }

  function input(name) {
    init();
    return buses && buses[name] ? buses[name] : master;
  }

  function attach(a, bus, pan, filter) {
    if (!a) return null;
    init();
    if (!ctx || nodes.has(a)) return nodes.get(a) || null;
    try {
      const source = ctx.createMediaElementSource(a);
      const gain = ctx.createGain();
      const filterNode = filter ? ctx.createBiquadFilter() : null;
      if (filterNode) {
        filterNode.type = filter.type || "lowpass";
        filterNode.frequency.value = filter.frequency || 800;
        filterNode.Q.value = filter.Q || 0.7;
        source.connect(filterNode); filterNode.connect(gain);
      } else source.connect(gain);
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (panner) {
        panner.pan.value = clamp(pan || 0, -1, 1);
        gain.connect(panner);
        panner.connect(input(bus || "effects"));
      } else gain.connect(input(bus || "effects"));
      const record = { source, gain, pan: panner, filter: filterNode, bus: bus || "effects" };
      nodes.set(a, record);
      elements.add(a);
      return record;
    } catch (_) { return null; }
  }

  function release(a) {
    if (!a) return;
    const n = nodes.get(a);
    if (n && n.timer) { clearTimeout(n.timer); n.timer = null; }
    if (n) n.stopped = true;
    elements.delete(a);
    if (n) {
      try { n.source.disconnect(); } catch (_) {}
      try { n.gain.disconnect(); } catch (_) {}
      try { if (n.pan) n.pan.disconnect(); } catch (_) {}
      try { if (n.filter) n.filter.disconnect(); } catch (_) {}
    }
    try { a.dispatchEvent(new Event("mf-audio-release")); } catch (_) {}
  }

  function startAudio(a, options) {
    const offset = Math.max(0, Number(options.offset) || 0);
    const duration = Math.max(0, Number(options.duration) || 0);
    const start = () => {
      const n = nodes.get(a);
      if (n && n.stopped) return;
      if (offset) { try { a.currentTime = offset; } catch (_) {} }
      const result = a.play();
      if (result && result.catch) result.catch(() => {});
      if (duration) {
        const record = nodes.get(a);
        if (record) record.timer = setTimeout(() => { try { a.pause(); } catch (_) {} release(a); }, duration * 1000);
      }
    };
    a.addEventListener("ended", () => release(a), { once: true });
    if (a.readyState >= 1) start();
    else a.addEventListener("loadedmetadata", start, { once: true });
  }

  function play(src, options) {
    if (!src) return null;
    const opt = options || {};
    const a = new Audio(src);
    a.preload = "auto";
    attach(a, opt.bus || "effects", opt.pan || 0, opt.filter || null);
    elements.add(a);
    a.loop = !!opt.loop;
    a.volume = clamp(opt.volume === undefined ? 0.5 : opt.volume, 0, 1);
    if (opt.rate) a.playbackRate = opt.rate;
    a.preservesPitch = false;
    a.webkitPreservesPitch = false;
    a.muted = muted;
    startAudio(a, opt);
    return a;
  }

  function loop(src, options) {
    return play(src, Object.assign({}, options, { loop: true, duration: 0 }));
  }

  function setGain(a, value) {
    const n = a && nodes.get(a);
    if (n && ctx) n.gain.gain.setTargetAtTime(clamp(value, 0, 2), ctx.currentTime, 0.02);
  }

  function setPan(a, value) {
    const n = a && nodes.get(a);
    if (n && n.pan && ctx) n.pan.pan.setTargetAtTime(clamp(value, -1, 1), ctx.currentTime, 0.03);
  }

  function panAt(x, z, listener) {
    if (!listener || !listener.position) return 0;
    let fx = 0, fz = -1;
    if (listener.matrixWorld) {
      const e = listener.matrixWorld.elements;
      fx = -e[8]; fz = -e[10];
    } else if (listener.rotation) {
      fx = -Math.sin(listener.rotation.y); fz = -Math.cos(listener.rotation.y);
    }
    const len = Math.hypot(fx, fz) || 1;
    const dx = x - listener.position.x, dz = z - listener.position.z;
    return clamp((dx * -fz + dz * fx) / (len * (Math.hypot(dx, dz) || 1)), -0.9, 0.9);
  }

  function spatial(a, x, z, listener, volume, maxDistance) {
    const d = Math.hypot(x - listener.position.x, z - listener.position.z);
    const max = maxDistance || 18;
    const falloff = 1 / (1 + Math.pow(d / (max * 0.32), 2));
    const edge = 1 - clamp((d - max * 0.72) / (max * 0.28), 0, 1);
    const value = clamp(volume * falloff * edge, 0, 1);
    if (a) { a.volume = value; setPan(a, panAt(x, z, listener)); }
    return value;
  }

  function setMaster(value) {
    masterVolume = clamp(value, 0, 1);
    if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : masterVolume, ctx.currentTime, 0.03);
  }

  function setBus(name, value) {
    if (!ctx || !buses || !buses[name]) return;
    buses[name].gain.setTargetAtTime(clamp(value, 0, 2), ctx.currentTime, 0.03);
  }

  function setMuted(value) {
    muted = !!value;
    elements.forEach(a => { try { a.muted = muted; } catch (_) {} });
    if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : masterVolume, ctx.currentTime, 0.02);
  }

  function resume() { if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {}); }
  function suspend() { if (ctx && ctx.state === "running") ctx.suspend().catch(() => {}); }

  function stopAll() {
    Array.from(elements).forEach(a => { try { a.pause(); } catch (_) {} release(a); });
  }

  function shutdown() {
    stopAll();
    elements.clear();
    if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    ctx = null; master = null; compressor = null; buses = null; nodes = new WeakMap();
  }

  global.MFAudio = {
    init, input, attach, play, loop, setGain, setPan, panAt, spatial, release,
    setMaster, setBus, setMuted, resume, suspend, stopAll, shutdown,
    context: () => ctx,
    status: () => ({ ready: !!ctx, state: ctx ? ctx.state : "uninitialized", muted,
      masterVolume, buses: buses ? Object.keys(buses).reduce((o, k) => (o[k] = buses[k].gain.value, o), {}) : {},
      elements: elements.size, compressor: !!compressor })
  };
})(window);
