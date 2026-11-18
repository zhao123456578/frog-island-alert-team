import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const PLAYER_R = 0.42;
export const WALK = 4.5;
export const RUN = 7.6;
const TURN = 12;

/**
 * 竖直方向交给 jump / land 动画自己的 root.position.y，不再叠一层重力——
 * 动画里已经带了下蹲蓄力和腾空拉长，自己再算抛物线会跳成两倍高。
 */
export class Player {
  constructor(gltf, scene) {
    this.root = gltf.scene;
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const c of gltf.animations) this.actions[c.name] = this.mixer.clipAction(c);
    this.bones = {};
    this.root.traverse((o) => { if (o.name) this.bones[o.name] = o; });
    this.mesh = null;
    this.root.traverse((o) => { if (o.isSkinnedMesh && !this.mesh) this.mesh = o; });

    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.groundY = 0;
    this.airborne = false;
    this.jumpT = 0;
    this.speed = 0;
    this.current = 'idle';

    scene.add(this.root);
    this.play('idle');
  }

  static load(url) {
    return new Promise((resolve, reject) =>
      new GLTFLoader().load(url, (g) => resolve(g), undefined, reject));
  }

  play(name) {
    if (name === this.current) return;
    const next = this.actions[name];
    if (!next) return;
    const prev = this.actions[this.current];
    if (prev) {
      if (this.current === 'jump' || this.current === 'land') prev.stop();
      else prev.fadeOut(0.18);
    }
    next.reset();
    if (name === 'jump' || name === 'land') {
      next.loop = THREE.LoopOnce;
      next.clampWhenFinished = false;
    } else {
      next.loop = THREE.LoopRepeat;
    }
    next.fadeIn(0.18).play();
    this.current = name;
  }

  /** 输入是 {fwd, side, run, jump}，世界坐标位移写进 this.pos。 */
  update(dt, input, colliders) {
    this.mixer.update(dt);

    const dir = new THREE.Vector3(input.side, 0, -input.fwd);
    const mag = Math.min(1, dir.length());
    const target = (input.run ? RUN : WALK) * mag;
    this.speed += (target - this.speed) * Math.min(1, dt * 10);

    if (mag > 0.02) {
      dir.normalize();
      // 模型脸朝 +Z：绕 Y 转 θ 后正面落在 (sin θ, cos θ)，所以朝向角直接按位移向量取
      const want = Math.atan2(dir.x, dir.z);
      let delta = want - this.yaw;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.yaw += delta * Math.min(1, dt * TURN);
    }

    const step = this.speed * dt;
    // rotation.y = yaw 把模型的 +Z（脸）转到 (sin yaw, cos yaw)，位移沿同一个方向走。
    // 拆成两轴分别试探，撞墙时才能贴着墙滑而不是整个停下。
    this.tryMove(Math.sin(this.yaw) * step, 0, colliders);
    this.tryMove(0, Math.cos(this.yaw) * step, colliders);

    const support = groundAt(colliders, this.pos.x, this.pos.z);
    if (this.airborne) {
      // 整条抛物线（含落地那下 0.78 的压缩）都在 jump clip 的 root 骨位移里，
      // 蒙皮已经把人抬起来了。这里再把位移加到 pos.y 就是文档警告过的两倍高。
      this.pos.y = this.groundY;
      this.jumpT += dt;
      if (this.jumpT >= 1.1) {
        this.airborne = false;
        this.groundY = support;
        this.current = '';
        this.play('idle');
      }
    } else {
      this.groundY += (support - this.groundY) * Math.min(1, dt * 12);
      this.pos.y = this.groundY;
    }

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;

    if (!this.airborne) {
      if (this.speed > 6.4) this.play('run');
      else if (this.speed > 0.4) this.play('walk');
      else this.play('idle');
    }
    return this.speed;
  }

  jump() {
    if (this.airborne) return false;
    this.airborne = true;
    this.jumpT = 0;
    this.current = '';
    this.play('jump');
    return true;
  }

  tryMove(dx, dz, colliders) {
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    const feet = this.pos.y;
    for (const c of colliders) {
      if (c.y1 <= feet + 0.45) continue;
      if (c.y0 >= feet + 1.4) continue;
      if (Math.abs(nx - c.x) < c.ex + PLAYER_R && Math.abs(nz - c.z) < c.ez + PLAYER_R) return false;
    }
    this.pos.x = nx;
    this.pos.z = nz;
    return true;
  }
}

/** 脚下能站到的最高台面；高于踏步极限的实体不算地面。 */
export function groundAt(colliders, x, z) {
  let top = 0;
  for (const c of colliders) {
    if (Math.abs(x - c.x) > c.ex + PLAYER_R * 0.6) continue;
    if (Math.abs(z - c.z) > c.ez + PLAYER_R * 0.6) continue;
    if (c.y1 <= 0.45 && c.y1 > top) top = c.y1;
  }
  return top;
}
