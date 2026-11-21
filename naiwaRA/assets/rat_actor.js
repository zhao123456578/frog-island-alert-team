// RatActor — 游戏内老鼠角色：随机游荡 / 见人逃跑 / 程序化四足步态
// 依赖: THREE, GLTFLoader, window.RAT_PACK_B64（assets/rat_pack_data.js）
// 用法:
//   await RatActor.ready;
//   const rat = RatActor.create({ variant: 0, length: 0.75 });
//   scene.add(rat.root);
//   rat.update(dt, { player: camera.position, bounds: {minX:-8,maxX:8,minZ:-8,maxZ:8} });
(function (global) {
  "use strict";
  var THREE = global.THREE;
  var template = null; // [{geometry, material}, ...] 三种花色
  var REST = null;     // 基准顶点（所有变体几何相同，共用一份）
  var serial = 0;

  // GLB 局部坐标: x 宽(-0.36~0.36), y 高(0~1), z 长(-1.24 头 ~ +1.24 尾)
  var LEG = [
    { x: -0.294, z: -0.637, phase: 0 },          // 前左
    { x:  0.294, z: -0.637, phase: Math.PI },    // 前右
    { x: -0.285, z:  0.127, phase: Math.PI },    // 后左
    { x:  0.285, z:  0.127, phase: 0 }           // 后右
  ];
  var LEG_RX = 0.22, LEG_RZ = 0.26;              // 腿部顶点筛选半径（镜像后网格更宽）
  var BODY_LEN = 2.4888;

  var ready = new Promise(function (resolve, reject) {
    if (!THREE || !global.GLTFLoader || !global.RAT_PACK_B64) {
      reject(new Error("RatActor: 缺少 THREE / GLTFLoader / RAT_PACK_B64"));
      return;
    }
    try {
      var text = atob(global.RAT_PACK_B64), bytes = new Uint8Array(text.length);
      for (var i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
      new global.GLTFLoader().parse(bytes.buffer, "", function (gltf) {
        try {
          var found = [];
          gltf.scene.traverse(function (node) {
            if (node.isMesh) found.push(node);
          });
          found.sort(function (a, b) { return a.name.localeCompare(b.name); });
          if (!found.length) throw new Error("RatActor: GLB 中没有网格");
          template = found.map(function (mesh) {
            var src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            var mat = new THREE.MeshBasicMaterial({
              color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
              map: src.map || null,
              side: src.side || THREE.FrontSide,
              transparent: !!src.transparent,
              alphaTest: src.alphaTest || 0,
              fog: true
            });
            if (mat.map) {
              mat.map.magFilter = THREE.NearestFilter;
              mat.map.minFilter = THREE.NearestFilter;
              mat.map.generateMipmaps = false;
            }
            // 低模定向光：靠法线打明暗，不用场景灯光，保持 PS1 观感
            mat.onBeforeCompile = function (shader) {
              shader.vertexShader = "varying float vRatLight;\n" + shader.vertexShader.replace(
                "#include <project_vertex>",
                "#include <project_vertex>\nvRatLight = 0.44 + 0.56 * max(dot(normalize(normalMatrix * normal), normalize(vec3(-0.35, 0.85, 0.40))), 0.0);"
              );
              shader.fragmentShader = "varying float vRatLight;\n" + shader.fragmentShader.replace(
                "#include <color_fragment>",
                "#include <color_fragment>\ndiffuseColor.rgb *= vRatLight;"
              );
            };
            mat.customProgramCacheKey = function () { return "rat-basic-light-v1"; };
            mat.name = src.name || "RatPalette";
            return { geometry: mesh.geometry, material: mat };
          });
          REST = Float32Array.from(template[0].geometry.attributes.position.array);
          resolve(template);
        } catch (err) { template = null; reject(err); }
      }, reject);
    } catch (err) { reject(err); }
  });
  ready.catch(function () { /* 交给调用方处理 */ });

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function create(opt) {
    if (!template || !REST) throw new Error("RatActor.create: 请先 await RatActor.ready");
    opt = opt || {};
    var variant = ((opt.variant === undefined ? serial : opt.variant) % template.length + template.length) % template.length;
    serial++;
    var base = template[variant];
    var geo = base.geometry.clone();
    var pos = geo.attributes.position;
    var arr = pos.array;
    var lengths = typeof opt.length === "number" && opt.length > 0 ? opt.length : 0.72;
    var scale = lengths / BODY_LEN;

    var root = new THREE.Group();
    root.name = opt.name || ("RatActor-" + variant + "-" + serial);
    var mesh = new THREE.Mesh(geo, base.material);
    mesh.name = "RatBody";
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.scale.setScalar(scale);
    root.add(mesh);

    // 动画与 AI 的私有状态
    var st = "wander";           // wander | alert | flee | calm
    var stTime = 0;
    var phase = rand(0, Math.PI * 2);
    var walk = 0;                // 0~1 步态强度，平滑过渡
    var target = null;
    var pause = rand(0.3, 1.6);
    var heading = typeof opt.heading === "number" ? opt.heading : rand(-Math.PI, Math.PI);
    var vel = new THREE.Vector3();
    var pos3 = new THREE.Vector3();
    var alertBias = 0;
    var lastSeen = -99;
    var zig = rand(0, Math.PI * 2);
    var api;

    root.rotation.y = heading;
    if (opt.position) root.position.set(opt.position.x || 0, opt.position.y || 0, opt.position.z || 0);

    function pickTarget(bounds) {
      if (!bounds) { target = new THREE.Vector3(rand(-5, 5), 0, rand(-5, 5)); return; }
      target = new THREE.Vector3(
        rand(bounds.minX + 0.5, bounds.maxX - 0.5), 0,
        rand(bounds.minZ + 0.5, bounds.maxZ - 0.5)
      );
    }

    // 逐顶点伪骨骼：四足交替摆动 + 抬脚 + 尾巴甩 + 头部点动 + 身体起伏
    function pose(dt, speed01) {
      phase += dt * (2.4 + speed01 * 14.0);
      walk += (speed01 - walk) * Math.min(1, dt * 7);
      var alertLift = alertBias * 0.045;
      var bob = Math.abs(Math.sin(phase)) * 0.035 * walk;
      var w = walk;
      for (var i = 0; i < REST.length; i += 3) {
        var x = REST[i], y = REST[i + 1], z = REST[i + 2];
        var dx = 0, dy = bob, dz = 0;
        // 四足：离腿根越近权重越小，脚端最大
        if (y < 0.30) {
          for (var k = 0; k < 4; k++) {
            var L = LEG[k];
            var ddx = x - L.x, ddz = z - L.z;
            if (Math.abs(ddx) > LEG_RX || Math.abs(ddz) > LEG_RZ) continue;
            var radial = Math.max(0, 1 - Math.hypot(ddx / LEG_RX, ddz / LEG_RZ));
            var vert = clamp((0.26 - y) / 0.26, 0, 1);
            var ww = radial * vert;
            if (ww <= 0) continue;
            var s = Math.sin(phase + L.phase);
            dz += s * 0.20 * ww * w;
            dy += Math.max(0, -s) * 0.075 * ww * w;   // 抬脚
          }
        }
        // 尾巴：越靠尾尖摆幅越大，警觉时上翘
        if (z > 0.42) {
          var tw = clamp((z - 0.42) / 0.82, 0, 1);
          dx += Math.sin(phase * 0.62 + z * 2.2) * 0.16 * tw * (0.35 + w * 0.65);
          dy += (tw * tw) * (0.045 + alertLift * 1.4);
        }
        // 头/吻部：警觉抬头，游荡时轻微嗅探
        if (z < -0.78) {
          var hw = clamp((-z - 0.78) / 0.46, 0, 1);
          dy += hw * (alertLift + (1 - w) * Math.sin(phase * 0.55) * 0.018);
        }
        arr[i] = x + dx;
        arr[i + 1] = Math.max(0, y + dy);
        arr[i + 2] = z + dz;
      }
      pos.needsUpdate = true;
    }

    function moveToward(dx, dz, speed, dt) {
      var len = Math.hypot(dx, dz);
      if (len < 1e-4) return 0;
      dx /= len; dz /= len;
      // 模型正面朝 -Z：heading = atan2(-dx, -dz)
      var want = Math.atan2(-dx, -dz);
      var diff = wrapAngle(want - heading);
      heading += clamp(diff, -dt * 5.5, dt * 5.5);
      var forward = Math.max(0, 1 - Math.abs(diff) / 1.2);
      var sp = speed * forward;
      // 局部前方 = (-sin(h), 0, -cos(h))
      vel.set(-Math.sin(heading) * sp, 0, -Math.cos(heading) * sp);
      return sp;
    }

    function avoid(ctx, x, z) {
      var ax = 0, az = 0;
      var obs = ctx && ctx.obstacles;
      if (obs) for (var i = 0; i < obs.length; i++) {
        var o = obs[i], ox = x - o.x, oz = z - o.z, d = Math.hypot(ox, oz), r = (o.r || 0.5) + 0.35;
        if (d > 1e-3 && d < r) { ax += ox / d * (r - d); az += oz / d * (r - d); }
      }
      var b = ctx && ctx.bounds;
      if (b) {
        if (x < b.minX + 0.6) ax += (b.minX + 0.6 - x) * 2;
        if (x > b.maxX - 0.6) ax -= (x - (b.maxX - 0.6)) * 2;
        if (z < b.minZ + 0.6) az += (b.minZ + 0.6 - z) * 2;
        if (z > b.maxZ - 0.6) az -= (z - (b.maxZ - 0.6)) * 2;
      }
      return [ax, az];
    }

    api = {
      root: root,
      mesh: mesh,
      variant: variant,
      state: st,
      speed: 0,
      get position() { return root.position; },
      setPosition: function (x, y, z) { root.position.set(x, y || 0, z); },
      setVariant: function (v) {
        v = ((v % template.length) + template.length) % template.length;
        if (v === variant) return;
        variant = v; base = template[variant]; mesh.material = base.material;
      },
      update: function (dt, ctx) {
        ctx = ctx || {};
        dt = clamp(dt || 0.016, 0.0001, 0.1);
        stTime += dt;
        var p = root.position;
        var player = ctx.player || null;
        var dist = player ? Math.hypot(p.x - player.x, p.z - player.z) : 1e9;
        var detect = ctx._detect !== undefined ? ctx._detect : (opt.detectRadius || 2.8);
        var safe = ctx._safe !== undefined ? ctx._safe : (opt.safeRadius || 5.2);
        var visible = ctx.playerVisible !== false;

        // ---- 状态转移 ----
        if (player && visible && dist < detect && st !== "flee") {
          if (st !== "alert") { st = "alert"; stTime = 0; }
          lastSeen = ctx.time !== undefined ? ctx.time : lastSeen + dt;
        }
        if (st === "alert" && stTime > 0.28) { st = "flee"; stTime = 0; zig = rand(-1, 1); }
        if (st === "flee") {
          if ((!player || !visible || dist > safe) && stTime > 0.7) { st = "calm"; stTime = 0; pause = rand(0.5, 1.3); }
        }
        if (st === "calm" && stTime > pause) { st = "wander"; stTime = 0; target = null; }
        alertBias += (((st === "alert" || st === "flee") ? 1 : 0) - alertBias) * Math.min(1, dt * 6);
        api.state = st;

        var speed01 = 0;
        var dx = 0, dz = 0;
        if (st === "flee") {
          dx = p.x - player.x; dz = p.z - player.z;
          var dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
          // 逃跑带轻微之字，别直线跑得像机器
          dz += Math.sin(ctx.time * 4.0 + zig) * 0.28;
          var av = avoid(ctx, p.x, p.z);
          dx += av[0]; dz += av[1];
          var fs = ctx._flee !== undefined ? ctx._flee : (opt.fleeSpeed || 2.15);
          speed01 = moveToward(dx, dz, fs, dt) / fs;
        } else if (st === "alert") {
          if (player) {
            var adx = player.x - p.x, adz = player.z - p.z;
            var want = Math.atan2(-adx, -adz);
            heading += clamp(wrapAngle(want - heading), -dt * 8, dt * 8);
          }
          speed01 = 0;
        } else if (st === "wander") {
          if (!target) pickTarget(ctx.bounds);
          var tdx = target.x - p.x, tdz = target.z - p.z;
          if (Math.hypot(tdx, tdz) < 0.28 || stTime > 9) { target = null; st = "calm"; stTime = 0; pause = rand(0.35, 1.4); }
          else {
            var av2 = avoid(ctx, p.x, p.z);
            speed01 = moveToward(tdx + av2[0], tdz + av2[1], opt.wanderSpeed || 0.62, dt) / (opt.wanderSpeed || 0.62);
          }
        }

        // ---- 位移与地面约束 ----
        p.x += vel.x * dt; p.z += vel.z * dt;
        if (ctx.floorY !== undefined) p.y = ctx.floorY;
        if (ctx.bounds) {
          p.x = clamp(p.x, ctx.bounds.minX, ctx.bounds.maxX);
          p.z = clamp(p.z, ctx.bounds.minZ, ctx.bounds.maxZ);
        }
        root.rotation.y = heading;
        api.speed = Math.hypot(vel.x, vel.z);
        pose(dt, speed01);
      },
      dispose: function () {
        geo.dispose();
        if (root.parent) root.parent.remove(root);
      }
    };
    pose(0, 0);
    return api;
  }

  global.RatActor = {
    ready: ready,
    create: create,
    get count() { return template ? template.length : 0; },
    BODY_LEN: BODY_LEN
  };
})(window);
