/**
 * LAZY-LOADED 3D GARAGE — HERO IMPULSE & KAWASAKI KLX 230R
 * - Renders both procedural voxel motorcycles spinning on illuminated turntables
 *   inside ONE shared WebGLRenderer (using setScissorTest) to minimize GPU memory on phones.
 * - Mobile-adaptive voxel resolution (~65% fewer instances on phones), fast 6-neighbor AO on mobile,
 *   async staged build so scrolling never freezes, and automatic pause when scrolled off-screen.
 */
(function () {
  'use strict';

  function createContactShadowTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.58)');
    g.addColorStop(0.55, 'rgba(0, 0, 0, 0.24)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function createGarageEnvironment(renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x0e131d);

    // Overhead cool-white garage LED light bar
    const topBar = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 5),
      new THREE.MeshBasicMaterial({ color: 0xd8e2f0, side: THREE.DoubleSide })
    );
    topBar.position.set(0, 6.8, 0);
    topBar.rotation.x = Math.PI / 2;
    envScene.add(topBar);

    // Warm key bounce card
    const rightCard = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 5),
      new THREE.MeshBasicMaterial({ color: 0xe6d2ba, side: THREE.DoubleSide })
    );
    rightCard.position.set(4.5, 3.0, 6.5);
    rightCard.lookAt(0, 0.8, 0);
    envScene.add(rightCard);

    // Glacier Cyan garage rim accent strip
    const cyanCard = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 3.5),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4, side: THREE.DoubleSide })
    );
    cyanCard.position.set(-4.5, 2.6, -6.0);
    cyanCard.lookAt(0, 0.8, 0);
    envScene.add(cyanCard);

    const envRT = pmrem.fromScene(envScene, 0.04);
    pmrem.dispose();
    return envRT.texture;
  }

  /**
   * Compute exact world-space minimum Y across all InstancedMesh voxel instances.
   * (Three.js r128 Box3.setFromObject ignores instance matrices and uses base 1x1x1 BoxGeometry min.y = -0.5.)
   */
  function computeInstancedMinY(root) {
    root.updateMatrixWorld(true);
    const instMat = new THREE.Matrix4();
    const worldMat = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    let minY = Infinity;

    root.traverse((obj) => {
      if (obj.isInstancedMesh && obj.count > 0) {
        for (let i = 0; i < obj.count; i++) {
          obj.getMatrixAt(i, instMat);
          worldMat.multiplyMatrices(obj.matrixWorld, instMat);
          worldMat.decompose(pos, quat, scl);
          const bottomY = pos.y - Math.abs(scl.y) * 0.5;
          if (bottomY < minY) minY = bottomY;
        }
      }
    });
    return isFinite(minY) ? minY : 0;
  }

  // =========================================================================
  // BIKE 1: HERO IMPULSE PROCEDURAL VOXEL BUILDER
  // =========================================================================
  function buildHeroImpulseModel(sharedBoxGeo, envMap, isMobile) {
    const scaleStep = isMobile ? 1.48 : 1.08;
    const V = 0.0125 * scaleStep;
    const VF = V * 0.54;

    const BIKE = {
      rearAxleX: -0.665,
      rearAxleY: 0.322,
      rearTireR: 0.322,
      rearRimR: 0.232,
      frontAxleX: 0.695,
      frontAxleY: 0.338,
      frontTireR: 0.338,
      frontRimR: 0.258,
      forkRakeRad: 27.5 * Math.PI / 180,
      forkHalfWidth: 0.094,
      pivotX: -0.175,
      pivotY: 0.415,
      leanAngleRad: -0.045
    };

    const COLORS = {
      orangeTank:     0xf2551b,
      blueFender:     0x1c4ea0,
      blueFenderDark: 0x153b7a,
      silverShroud:   0xc9cfd6,
      silverAlloy:    0xb8bfc7,
      silverRim:      0xc4c9cf,
      chrome:         0xe4e8ec,
      enginePewter:   0x969da5,
      frameBlack:     0x1b1d20,
      tireRubber:     0x1c1e21,
      tireKnob:       0x24272b,
      seatBlack:      0x1d1f23,
      gaiterBlack:    0x17191c,
      sidePanelBlack: 0x1e2024,
      redGuard:       0xe03219,
      redGuardDark:   0xb82410,
      exhaustBronze:  0x5a4132,
      exhaustDark:    0x332823,
      maskWhite:      0xd9d8d1,
      decalWhite:     0xebeef2,
      decalBlack:     0x141619,
      reflectorAmber: 0xde6a14,
      strapBrown:     0x6e4a35,
      chainSteel:     0x45494e,
      shockRed:       0xc4281b
    };

    function packKey(ix, iy, iz) {
      return (ix + 512) + (iy + 512) * 1024 + (iz + 512) * 1048576;
    }

    function voxelHash(ix, iy, iz) {
      let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 2147483647);
      n = (n ^ (n >>> 13)) * 1274126177;
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    }

    class ImpulseBuilder {
      constructor() {
        this.byMat = new Map();
        this.coarseGrid = new Map();
        this.fineGrid = new Set();
      }
      setMacro(matKey, ix, iy, iz, hexColor, overwrite = false) {
        const key = packKey(ix, iy, iz);
        const existing = this.coarseGrid.get(key);
        if (existing) {
          if (!overwrite) return;
          existing.dead = true;
        }
        const rec = {
          x: ix * V, y: iy * V, z: iz * V,
          size: V * 0.988, color: hexColor,
          ix, iy, iz, isFine: false, dead: false
        };
        this.coarseGrid.set(key, rec);
        this._push(matKey, rec);
      }
      setMacroWorld(matKey, wx, wy, wz, hexColor, overwrite = false) {
        this.setMacro(matKey, Math.round(wx / V), Math.round(wy / V), Math.round(wz / V), hexColor, overwrite);
      }
      setFineWorld(matKey, wx, wy, wz, hexColor, scaleMult = 1.0) {
        const fx = Math.round(wx / VF);
        const fy = Math.round(wy / VF);
        const fz = Math.round(wz / VF);
        const fKey = packKey(fx, fy, fz);
        if (this.fineGrid.has(fKey)) return;
        this.fineGrid.add(fKey);
        this._push(matKey, {
          x: fx * VF, y: fy * VF, z: fz * VF,
          size: VF * scaleMult, color: hexColor,
          ix: Math.round(fx * 0.54), iy: Math.round(fy * 0.54), iz: Math.round(fz * 0.54),
          isFine: true, dead: false
        });
      }
      _push(matKey, rec) {
        let arr = this.byMat.get(matKey);
        if (!arr) { arr = []; this.byMat.set(matKey, arr); }
        arr.push(rec);
      }
      fillSegment(mat, p1, p2, r1, r2, hexColor, fine = false, overwrite = false) {
        const step = fine ? VF : V;
        const rMax = Math.max(r1, r2) + step;
        const minX = Math.floor((Math.min(p1.x, p2.x) - rMax) / step);
        const maxX = Math.ceil((Math.max(p1.x, p2.x) + rMax) / step);
        const minY = Math.floor((Math.min(p1.y, p2.y) - rMax) / step);
        const maxY = Math.ceil((Math.max(p1.y, p2.y) + rMax) / step);
        const minZ = Math.floor((Math.min(p1.z, p2.z) - rMax) / step);
        const maxZ = Math.ceil((Math.max(p1.z, p2.z) + rMax) / step);
        const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
        const lenSq = dx * dx + dy * dy + dz * dz || 1e-6;
        for (let ix = minX; ix <= maxX; ix++) {
          const wx = ix * step;
          for (let iy = minY; iy <= maxY; iy++) {
            const wy = iy * step;
            for (let iz = minZ; iz <= maxZ; iz++) {
              const wz = iz * step;
              const t = ((wx - p1.x) * dx + (wy - p1.y) * dy + (wz - p1.z) * dz) / lenSq;
              if (t < 0 || t > 1) continue;
              const px = p1.x + dx * t, py = p1.y + dy * t, pz = p1.z + dz * t;
              const r = r1 + (r2 - r1) * t;
              if ((wx - px) ** 2 + (wy - py) ** 2 + (wz - pz) ** 2 <= r * r) {
                if (fine) this.setFineWorld(mat, wx, wy, wz, hexColor);
                else this.setMacro(mat, ix, iy, iz, hexColor, overwrite);
              }
            }
          }
        }
      }
      fillTube(mat, points, radius, hexColor, options = {}) {
        const {
          fine = false, overwrite = false, ribAmp = 0, ribFreq = 0,
          ribColorAlt = null, strapSpacing = 0, strapColor = COLORS.frameBlack,
          hollow = false, innerRadius = 0
        } = options;
        const step = fine ? VF : V;
        const cumLen = [0];
        for (let i = 1; i < points.length; i++) cumLen.push(cumLen[i - 1] + points[i].distanceTo(points[i - 1]));
        const totalLen = cumLen[cumLen.length - 1] || 1e-5;
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i], p2 = points[i + 1];
          const segLen = cumLen[i + 1] - cumLen[i];
          const maxR = radius + Math.abs(ribAmp) + step;
          const minX = Math.floor((Math.min(p1.x, p2.x) - maxR) / step);
          const maxX = Math.ceil((Math.max(p1.x, p2.x) + maxR) / step);
          const minY = Math.floor((Math.min(p1.y, p2.y) - maxR) / step);
          const maxY = Math.ceil((Math.max(p1.y, p2.y) + maxR) / step);
          const minZ = Math.floor((Math.min(p1.z, p2.z) - maxR) / step);
          const maxZ = Math.ceil((Math.max(p1.z, p2.z) + maxR) / step);
          const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
          const lenSq = dx * dx + dy * dy + dz * dz || 1e-6;
          for (let ix = minX; ix <= maxX; ix++) {
            const wx = ix * step;
            for (let iy = minY; iy <= maxY; iy++) {
              const wy = iy * step;
              for (let iz = minZ; iz <= maxZ; iz++) {
                const wz = iz * step;
                const t = Math.max(0, Math.min(1, ((wx - p1.x) * dx + (wy - p1.y) * dy + (wz - p1.z) * dz) / lenSq));
                const px = p1.x + dx * t, py = p1.y + dy * t, pz = p1.z + dz * t;
                const dist = Math.hypot(wx - px, wy - py, wz - pz);
                const arcS = cumLen[i] + segLen * t;
                let effR = radius, col = hexColor, useMat = mat;
                if (ribAmp > 0 && ribFreq > 0) {
                  const wave = Math.sin((arcS / totalLen) * ribFreq * Math.PI * 2);
                  effR += wave > -0.15 ? ribAmp : -ribAmp * 0.45;
                  if (wave <= -0.15 && ribColorAlt !== null) col = ribColorAlt;
                }
                if (strapSpacing > 0 && (arcS % strapSpacing) < 0.011 && arcS > 0.025 && arcS < totalLen - 0.025) {
                  effR += 0.004; col = strapColor; useMat = 'darkMetal';
                }
                if (dist <= effR && (!hollow || dist >= innerRadius)) {
                  if (fine) this.setFineWorld(useMat, wx, wy, wz, col);
                  else this.setMacro(useMat, ix, iy, iz, col, overwrite);
                }
              }
            }
          }
        }
      }
      computeAO(ix, iy, iz) {
        if (isMobile) {
          // Fast 6-neighbor AO on mobile
          let occ = 0;
          if (this.coarseGrid.has(packKey(ix + 1, iy, iz))) occ += 0.9;
          if (this.coarseGrid.has(packKey(ix - 1, iy, iz))) occ += 0.9;
          if (this.coarseGrid.has(packKey(ix, iy + 1, iz))) occ += 1.4;
          if (this.coarseGrid.has(packKey(ix, iy - 1, iz))) occ += 0.5;
          if (this.coarseGrid.has(packKey(ix, iy, iz + 1))) occ += 0.9;
          if (this.coarseGrid.has(packKey(ix, iy, iz - 1))) occ += 0.9;
          return 1.0 - Math.min(0.38, occ * 0.072);
        }
        let occ = 0;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
              if (dx === 0 && dy === 0 && dz === 0) continue;
              if (this.coarseGrid.has(packKey(ix + dx, iy + dy, iz + dz))) {
                occ += (dy > 0) ? 1.15 : (dy === 0 ? 0.85 : 0.45);
              }
            }
          }
        }
        return 1.0 - Math.min(0.42, (occ / 22) * 0.48);
      }
      compile(materials) {
        const root = new THREE.Group();
        const dummy = new THREE.Object3D();
        const tmpColor = new THREE.Color();
        for (const [matKey, list] of this.byMat.entries()) {
          const active = list.filter(v => !v.dead);
          if (!active.length) continue;
          const inst = new THREE.InstancedMesh(sharedBoxGeo, materials[matKey] || materials.darkMetal, active.length);
          inst.castShadow = !isMobile;
          inst.receiveShadow = !isMobile;
          for (let i = 0; i < active.length; i++) {
            const v = active[i];
            dummy.position.set(v.x, v.y, v.z);
            dummy.scale.set(v.size, v.size, v.size);
            dummy.updateMatrix();
            inst.setMatrixAt(i, dummy.matrix);
            const ao = this.computeAO(v.ix, v.iy, v.iz);
            const grain = 0.985 + voxelHash(v.ix, v.iy, v.iz) * 0.03;
            tmpColor.setHex(v.color).convertSRGBToLinear().multiplyScalar(ao * grain);
            inst.setColorAt(i, tmpColor);
          }
          inst.instanceMatrix.needsUpdate = true;
          if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
          root.add(inst);
        }
        return root;
      }
    }

    const mk = (roughness, metalness, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({
      color: 0xffffff, roughness, metalness, envMap, envMapIntensity: 0.45
    }, extra));

    const materials = {
      glossyPaint:    mk(0.26, 0.06, { envMapIntensity: 0.42 }),
      metallicSilver: mk(0.28, 0.80, { envMapIntensity: 0.90 }),
      chrome:         mk(0.14, 0.92, { envMapIntensity: 1.05 }),
      engineAlloy:    mk(0.42, 0.62, { envMapIntensity: 0.65 }),
      rubberMatte:    mk(0.90, 0.02, { envMapIntensity: 0.12 }),
      siliconeRed:    mk(0.44, 0.04, { envMapIntensity: 0.28 }),
      darkMetal:      mk(0.50, 0.42, { envMapIntensity: 0.35 }),
      exhaustBronze:  mk(0.44, 0.66, { envMapIntensity: 0.65 }),
      leatherBrown:   mk(0.86, 0.02, { envMapIntensity: 0.14 }),
      reflectorAmber: mk(0.18, 0.08, { emissive: new THREE.Color(0x2e1100).convertSRGBToLinear(), envMapIntensity: 0.65 })
    };

    const builder = new ImpulseBuilder();

    function buildWheel(cfg) {
      const { cx, cy, outerR, rimR, halfTireW, hubR, hubHalfW, spokeCount, isFront } = cfg;
      const innerTireR = rimR + 0.008;
      const knobBaseR = outerR - 0.022;
      const rimInnerR = rimR - 0.018;
      const rimHalfW = halfTireW * 0.68;
      const minX = Math.floor((cx - outerR - V) / V), maxX = Math.ceil((cx + outerR + V) / V);
      const minY = Math.floor((cy - outerR - V) / V), maxY = Math.ceil((cy + outerR + V) / V);
      const maxZ = Math.ceil((halfTireW + 0.014) / V);
      const knobPitchCount = isFront ? 26 : 24;

      for (let ix = minX; ix <= maxX; ix++) {
        const dx = ix * V - cx;
        for (let iy = minY; iy <= maxY; iy++) {
          const dy = iy * V - cy;
          const r = Math.hypot(dx, dy);
          if (r < rimInnerR || r > outerR + 0.004) continue;
          const angle = Math.atan2(dy, dx);
          for (let iz = -maxZ; iz <= maxZ; iz++) {
            const az = Math.abs(iz * V);
            if (r >= rimInnerR && r <= rimR && az <= rimHalfW) {
              if ((r > rimR - 0.009) || (az > rimHalfW - 0.011) || r < rimInnerR + 0.012) {
                builder.setMacro('metallicSilver', ix, iy, iz, COLORS.silverRim);
              }
              continue;
            }
            if (r >= innerTireR && r <= knobBaseR) {
              const tR = (r - innerTireR) / (knobBaseR - innerTireR);
              const profileW = halfTireW * (0.72 + 0.28 * Math.sin(tR * Math.PI * 0.85));
              if (az <= profileW && (az > profileW - V * 1.6 || tR > 0.72 || tR < 0.22)) {
                builder.setMacro('rubberMatte', ix, iy, iz, COLORS.tireRubber);
              }
              continue;
            }
            if (r > knobBaseR && r <= outerR) {
              const normAng = ((angle + Math.PI) / (Math.PI * 2)) * knobPitchCount;
              const cellFrac = normAng - Math.floor(normAng);
              const inCenter = (az < halfTireW * 0.36) && (cellFrac > 0.16 && cellFrac < 0.62);
              const sPhase = (normAng + 0.5) % 1.0;
              const inShoulder = (az >= halfTireW * 0.42 && az <= halfTireW * 1.04) && (sPhase > 0.14 && sPhase < 0.58);
              if (inCenter || inShoulder) builder.setMacro('rubberMatte', ix, iy, iz, COLORS.tireKnob);
            }
          }
        }
      }
      builder.fillSegment('engineAlloy', new THREE.Vector3(cx, cy, -hubHalfW), new THREE.Vector3(cx, cy, hubHalfW), hubR, hubR, COLORS.enginePewter, false);
      const sCount = isMobile ? 20 : spokeCount;
      const sSteps = isMobile ? 16 : 26;
      for (let i = 0; i < sCount; i++) {
        const aRim = (i / sCount) * Math.PI * 2;
        const side = (i % 2 === 0) ? 1 : -1;
        const crossDir = ((i >> 1) % 2 === 0) ? 1 : -1;
        const aHub = aRim + crossDir * 0.44;
        const hx = cx + Math.cos(aHub) * (hubR * 0.82), hy = cy + Math.sin(aHub) * (hubR * 0.82), hz = side * (hubHalfW * 0.78);
        const rx = cx + Math.cos(aRim) * (rimInnerR + 0.004), ry = cy + Math.sin(aRim) * (rimInnerR + 0.004), rz = side * (rimHalfW * 0.25);
        for (let s = 0; s <= sSteps; s++) {
          const t = s / sSteps;
          builder.setFineWorld('chrome', hx + (rx - hx) * t, hy + (ry - hy) * t, hz + (rz - hz) * t, COLORS.silverRim, 0.85);
        }
      }
      if (isFront) {
        const discZ = hubHalfW + 0.014;
        const dMinX = Math.floor((cx - 0.126) / VF), dMaxX = Math.ceil((cx + 0.126) / VF);
        const dMinY = Math.floor((cy - 0.126) / VF), dMaxY = Math.ceil((cy + 0.126) / VF);
        for (let fx = dMinX; fx <= dMaxX; fx++) {
          const wx = fx * VF, dx = wx - cx;
          for (let fy = dMinY; fy <= dMaxY; fy++) {
            const wy = fy * VF, dy = wy - cy;
            const r = Math.hypot(dx, dy);
            if (r >= 0.068 && r <= 0.126) builder.setFineWorld('chrome', wx, wy, discZ, COLORS.silverAlloy, 0.95);
          }
        }
      } else {
        builder.fillSegment('engineAlloy', new THREE.Vector3(cx, cy, hubHalfW - 0.01), new THREE.Vector3(cx, cy, hubHalfW + 0.022), 0.082, 0.076, COLORS.enginePewter, false);
      }
    }

    buildWheel({ cx: BIKE.rearAxleX, cy: BIKE.rearAxleY, outerR: BIKE.rearTireR, rimR: BIKE.rearRimR, halfTireW: 0.062, hubR: 0.068, hubHalfW: 0.068, spokeCount: 32, isFront: false });
    buildWheel({ cx: BIKE.frontAxleX, cy: BIKE.frontAxleY, outerR: BIKE.frontTireR, rimR: BIKE.frontRimR, halfTireW: 0.048, hubR: 0.052, hubHalfW: 0.056, spokeCount: 32, isFront: true });

    // Front Forks & Cockpit
    const sinR = Math.sin(BIKE.forkRakeRad), cosR = Math.cos(BIKE.forkRakeRad);
    const forkPt = (d, z, off = 0) => new THREE.Vector3(BIKE.frontAxleX - d * sinR + off * cosR, BIKE.frontAxleY + d * cosR + off * sinR, z);
    for (const side of [-1, 1]) {
      const z = side * BIKE.forkHalfWidth;
      builder.fillSegment('metallicSilver', forkPt(-0.025, z), forkPt(0.405, z), 0.024, 0.027, COLORS.silverAlloy, false);
      for (let d = 0.145; d <= 0.205; d += VF) {
        const p = forkPt(d, z + side * 0.028, 0);
        builder.setFineWorld('reflectorAmber', p.x, p.y, p.z, COLORS.reflectorAmber, 1.15);
      }
      builder.fillTube('rubberMatte', [forkPt(0.405, z), forkPt(0.655, z)], 0.028, COLORS.gaiterBlack, { ribAmp: 0.007, ribFreq: 12, ribColorAlt: 0x101214 });
      builder.fillSegment('chrome', forkPt(0.655, z), forkPt(0.855, z), 0.019, 0.019, COLORS.chrome, false);
    }
    builder.fillSegment('darkMetal', forkPt(0.665, -0.104), forkPt(0.665, 0.104), 0.024, 0.024, COLORS.frameBlack, false);
    builder.fillSegment('metallicSilver', forkPt(0.84, -0.104), forkPt(0.84, 0.104), 0.020, 0.020, COLORS.silverAlloy, false);
    for (let d = 0.64; d <= 0.90; d += VF) {
      const t = (d - 0.64) / 0.26;
      const halfW = 0.115 * (1.0 - 0.28 * t * t) * (0.85 + 0.15 * Math.sin(t * Math.PI));
      for (let z = -halfW; z <= halfW; z += VF) {
        const arch = Math.cos((z / (halfW + 0.01)) * Math.PI * 0.45) * 0.032;
        const p = forkPt(d, z, 0.034 + arch);
        const isEdge = Math.abs(z) > halfW - VF * 1.6 || t < 0.06 || t > 0.94;
        builder.setFineWorld(isEdge ? 'darkMetal' : 'glossyPaint', p.x, p.y, p.z, isEdge ? COLORS.frameBlack : COLORS.maskWhite, 1.1);
      }
    }
    for (const side of [-1, 1]) {
      const base = forkPt(0.85, side * 0.048, -0.015);
      const top = new THREE.Vector3(base.x - 0.01, base.y + 0.055, side * 0.052);
      const p1 = new THREE.Vector3(top.x - 0.015, top.y + 0.055, side * 0.145);
      const p2 = new THREE.Vector3(top.x - 0.042, top.y + 0.072, side * 0.255);
      const p3 = new THREE.Vector3(top.x - 0.065, top.y + 0.064, side * 0.385);
      builder.fillTube('darkMetal', [base, top, p1, p2], 0.013, COLORS.frameBlack, { fine: true });
      builder.fillTube('rubberMatte', [p2, p3], 0.017, COLORS.gaiterBlack, { fine: true });
    }

    // Blue MX Fenders
    for (let x = 0.34; x <= 0.875; x += VF) {
      const t = (x - 0.34) / 0.535;
      const centerY = t < 0.22 ? 0.805 + 0.075 * Math.sin((t / 0.22) * Math.PI * 0.5) : 0.880 + 0.006 * Math.sin(((t - 0.22) / 0.78) * Math.PI) - 0.135 * Math.pow((t - 0.22) / 0.78, 1.85);
      const halfW = t < 0.22 ? 0.078 : 0.080 * (1.0 - 0.36 * Math.pow((t - 0.22) / 0.78, 1.4));
      for (let z = -halfW; z <= halfW; z += VF) {
        const zn = z / (halfW + 0.001);
        builder.setFineWorld('glossyPaint', x, centerY - 0.022 * zn * zn, z, COLORS.blueFender, 1.18);
      }
    }
    for (let x = -1.035; x <= -0.49; x += VF) {
      const t = (x + 0.49) / -0.545;
      const centerY = 0.865 + 0.068 * t - 0.012 * t * t;
      const halfW = 0.088 * (1.0 - 0.44 * Math.pow(t, 1.25));
      for (let z = -halfW; z <= halfW; z += VF) {
        const zn = z / (halfW + 0.001);
        builder.setFineWorld('glossyPaint', x, centerY - 0.026 * zn * zn * (1.0 - 0.4 * t), z, COLORS.blueFender, 1.18);
      }
    }

    // Orange Fuel Tank & Two-Tone Shrouds
    for (let x = -0.03; x <= 0.35; x += V * 0.9) {
      const t = (x + 0.03) / 0.38;
      const topY = 0.825 + 0.220 * Math.sin(Math.pow(t, 0.72) * Math.PI * 0.88);
      const botY = 0.725 + 0.08 * t;
      const halfW = 0.082 + 0.072 * Math.sin(Math.pow(t, 0.85) * Math.PI * 0.78);
      for (let y = botY; y <= topY; y += V * 0.9) {
        const ty = (y - botY) / (topY - botY + 0.001);
        const localW = halfW * Math.sqrt(Math.max(0.05, 1.0 - Math.pow(Math.max(0, ty - 0.45) / 0.55, 2.1)));
        for (let z = -localW; z <= localW; z += V * 0.9) {
          if (Math.abs(z) < localW - V * 1.6 && y < topY - V * 1.4 && y > botY + V && x > -0.01 && x < 0.33) continue;
          const isCap = ty > 0.90 && Math.hypot(x - 0.20, z) < 0.034;
          builder.setMacroWorld(isCap ? 'darkMetal' : 'glossyPaint', x, y + (isCap ? 0.004 : 0), z, isCap ? COLORS.frameBlack : COLORS.orangeTank, isCap);
        }
      }
    }
    for (const side of [-1, 1]) {
      for (let x = 0.04; x <= 0.435; x += VF) {
        const tx = (x - 0.04) / 0.395;
        const yTop = tx < 0.35 ? 0.995 - 0.02 * (tx / 0.35) : 0.975 - 0.105 * Math.pow((tx - 0.35) / 0.65, 1.1);
        const yBot = tx < 0.55 ? 0.725 - 0.045 * Math.sin((tx / 0.55) * Math.PI) : 0.705 + 0.145 * Math.pow((tx - 0.55) / 0.45, 1.05);
        if (yTop <= yBot + 0.01) continue;
        for (let y = yBot; y <= yTop; y += VF) {
          const ty = (y - yBot) / (yTop - yBot);
          const z = side * (0.118 + 0.052 * Math.sin(tx * Math.PI * 0.92) * (0.75 + 0.25 * Math.sin(ty * Math.PI)));
          const splitY = 0.745 + 0.34 * (x - 0.06);
          let col = COLORS.orangeTank, mat = 'glossyPaint';
          if (y < splitY) {
            col = COLORS.silverShroud; mat = 'metallicSilver';
            const wedgeY = 0.775 + 0.26 * (x - 0.14);
            if (x > 0.18 && x < 0.35 && y > wedgeY - 0.026 && y < wedgeY + 0.004) { col = COLORS.decalBlack; mat = 'darkMetal'; }
          } else {
            const stripeLine = 0.955 - 0.22 * (x - 0.10);
            if (x > 0.12 && x < 0.39 && Math.abs(y - (stripeLine + 0.022)) < 0.008) col = COLORS.decalWhite;
            else if (x > 0.14 && x < 0.40 && Math.abs(y - (stripeLine - 0.005)) < 0.011 && Math.sin((x - 0.14) * 145) > -0.2) col = COLORS.decalBlack;
          }
          builder.setFineWorld(mat, x, y, z, col, 1.12);
        }
      }
    }

    // Seat & Side Panels
    for (let x = -0.73; x <= 0.08; x += VF) {
      const t = (x + 0.73) / 0.81;
      const topY = t < 0.62 ? 0.935 - 0.128 * Math.sin((t / 0.62) * Math.PI * 0.56) : 0.809 + 0.135 * Math.pow((t - 0.62) / 0.38, 1.35);
      const thick = 0.072 * (1.0 - 0.45 * Math.max(0, (t - 0.72) / 0.28));
      const botY = topY - thick;
      const halfW = 0.088 * (0.82 + 0.25 * Math.sin(t * Math.PI * 0.85)) * (1.0 - 0.28 * Math.pow(t, 2.2));
      const isStrap = Math.abs(x - (-0.435 + (topY - 0.84) * 0.45)) < 0.015;
      for (let y = botY; y <= topY; y += VF) {
        const ty = (y - botY) / (thick + 0.001);
        const localW = halfW * Math.sqrt(Math.max(0.12, 1.0 - Math.pow(Math.max(0, ty - 0.52) / 0.48, 2.0)));
        for (let z = -localW; z <= localW; z += VF) {
          if (Math.abs(z) < localW - VF * 1.4 && y < topY - VF * 1.4 && y > botY + VF * 1.4 && x > -0.71) continue;
          if (isStrap && ty > 0.15) builder.setFineWorld('leatherBrown', x, y + 0.003, z, COLORS.strapBrown, 1.15);
          else builder.setFineWorld('rubberMatte', x, y, z, COLORS.seatBlack, 1.12);
        }
      }
    }
    for (const side of [-1, 1]) {
      for (let x = -0.57; x <= 0.07; x += VF) {
        const t = (x + 0.57) / 0.64;
        const yTop = 0.855 - 0.072 * Math.sin(t * Math.PI * 0.88);
        const yBot = 0.805 - 0.165 * Math.pow(t, 0.75);
        for (let y = yBot; y <= yTop; y += VF) {
          const ty = (y - yBot) / (yTop - yBot + 0.001);
          const z = side * (0.092 + 0.036 * Math.sin(t * Math.PI * 0.78) * (0.65 + 0.35 * ty));
          const isSlash = x > -0.34 && x < -0.10 && ty > 0.12 && ty < 0.65 && (Math.sin((x + y * 0.85) * 115) > 0.45 || ty < 0.22);
          builder.setFineWorld(isSlash ? 'darkMetal' : 'glossyPaint', x, y, z, isSlash ? COLORS.decalBlack : COLORS.orangeTank, 1.12);
        }
      }
      for (let x = -0.43; x <= 0.05; x += V) {
        const t = (x + 0.43) / 0.48;
        for (let y = 0.56 - 0.11 * Math.sin(t * Math.PI * 0.75); y <= 0.76 - 0.07 * t; y += V) {
          builder.setMacroWorld('rubberMatte', x, y, side * (0.088 + 0.028 * Math.sin(t * Math.PI)), COLORS.sidePanelBlack);
        }
      }
    }

    // Frame, Engine, Swingarm, Exhaust
    builder.fillTube('darkMetal', [new THREE.Vector3(0.32, 0.96, 0), new THREE.Vector3(-0.08, 0.76, 0), new THREE.Vector3(-0.18, 0.65, 0)], 0.022, COLORS.frameBlack);
    builder.fillTube('darkMetal', [new THREE.Vector3(0.35, 0.83, 0), new THREE.Vector3(0.28, 0.54, 0), new THREE.Vector3(0.24, 0.28, 0)], 0.020, COLORS.frameBlack);
    for (const side of [-1, 1]) {
      builder.fillTube('darkMetal', [
        new THREE.Vector3(0.23, 0.29, side * 0.048), new THREE.Vector3(0.14, 0.245, side * 0.078),
        new THREE.Vector3(-0.14, 0.265, side * 0.078), new THREE.Vector3(BIKE.pivotX, BIKE.pivotY, side * 0.09),
        new THREE.Vector3(-0.16, 0.64, side * 0.074)
      ], 0.015, COLORS.frameBlack);
      builder.fillTube('darkMetal', [
        new THREE.Vector3(-0.16, 0.68, side * 0.074), new THREE.Vector3(-0.52, 0.80, side * 0.066), new THREE.Vector3(-0.74, 0.86, side * 0.055)
      ], 0.013, COLORS.frameBlack);
      builder.fillSegment('metallicSilver', new THREE.Vector3(BIKE.pivotX, BIKE.pivotY, side * 0.104), new THREE.Vector3(BIKE.rearAxleX - 0.02, BIKE.rearAxleY, side * 0.104), 0.026, 0.022, COLORS.silverAlloy, false);
    }
    // Engine block & cylinder
    for (let x = -0.12; x <= 0.16; x += V) {
      for (let y = 0.275; y <= 0.465; y += V) {
        if (((x - 0.025) / 0.145) ** 2 + ((y - 0.365) / 0.105) ** 2 > 1.05) continue;
        for (let z = -0.095; z <= 0.095; z += V) {
          const isOuter = Math.abs(z) > 0.07;
          builder.setMacroWorld(isOuter ? 'engineAlloy' : 'darkMetal', x, y, z, isOuter ? COLORS.enginePewter : 0x35393f);
        }
      }
    }
    for (let h = 0; h <= 0.215; h += VF) {
      const cx = 0.065 + h * 0.18, cy = 0.465 + h;
      const isFin = h > 0.015 && h < 0.185 && ((h * 72) % 1.0) < 0.42;
      const rx = isFin ? 0.076 : 0.058, rz = isFin ? 0.082 : 0.062;
      for (let dx = -rx; dx <= rx; dx += VF) {
        for (let dz = -rz; dz <= rz; dz += VF) {
          if ((dx * dx) / (rx * rx) + (dz * dz) / (rz * rz) > 1.05) continue;
          builder.setFineWorld(h >= 0.185 ? 'engineAlloy' : 'darkMetal', cx + dx, cy, dz, h >= 0.185 ? 0x3b4046 : (isFin ? 0x26292e : 0x191b1e), 1.05);
        }
      }
    }
    // Red monoshock spring
    const shockBot = new THREE.Vector3(-0.275, 0.395, 0), shockTop = new THREE.Vector3(-0.215, 0.675, 0);
    builder.fillSegment('darkMetal', shockBot, shockTop, 0.018, 0.018, COLORS.frameBlack, true);
    for (let i = 0; i <= 90; i++) {
      const t = i / 90, ang = t * 7 * Math.PI * 2;
      builder.setFineWorld('glossyPaint', shockBot.x + (shockTop.x - shockBot.x) * (0.14 + 0.72 * t) + Math.cos(ang) * 0.032, shockBot.y + (shockTop.y - shockBot.y) * (0.14 + 0.72 * t), Math.sin(ang) * 0.032, COLORS.shockRed, 1.3);
    }
    // Red-wrapped high-mount exhaust
    builder.fillTube('siliconeRed', [
      new THREE.Vector3(0.242, 0.515, 0.112), new THREE.Vector3(0.225, 0.478, 0.132),
      new THREE.Vector3(0.155, 0.472, 0.138), new THREE.Vector3(0.035, 0.495, 0.118)
    ], 0.025, COLORS.redGuard, { fine: true, ribAmp: 0.007, ribFreq: 7, ribColorAlt: COLORS.redGuardDark });
    builder.fillTube('exhaustBronze', [
      new THREE.Vector3(0.035, 0.495, 0.115), new THREE.Vector3(-0.22, 0.465, 0.112), new THREE.Vector3(-0.44, 0.625, 0.145)
    ], 0.021, COLORS.exhaustBronze, { fine: true });
    const mufStart = new THREE.Vector3(-0.445, 0.630, 0.152), mufEnd = new THREE.Vector3(-0.775, 0.785, 0.165);
    builder.fillTube('siliconeRed', [mufStart, mufEnd], 0.056, COLORS.redGuard, {
      fine: false, overwrite: true, ribAmp: 0.014, ribFreq: 10, ribColorAlt: COLORS.redGuardDark, strapSpacing: 0.115
    });
    const capDir = new THREE.Vector3().subVectors(mufEnd, mufStart).normalize();
    const capEnd = mufEnd.clone().addScaledVector(capDir, 0.024);
    builder.fillSegment('darkMetal', mufEnd, capEnd, 0.044, 0.034, COLORS.exhaustDark, true);
    builder.fillTube('chrome', [capEnd, capEnd.clone().addScaledVector(capDir, 0.058)], 0.019, COLORS.chrome, { fine: true });
    // Kickstand
    builder.fillTube('darkMetal', [new THREE.Vector3(-0.185, 0.31, -0.095), new THREE.Vector3(-0.172, 0.015, -0.195)], 0.012, COLORS.frameBlack, { fine: true });

    const group = builder.compile(materials);
    group.rotation.x = BIKE.leanAngleRad;
    const minY = computeInstancedMinY(group);
    group.position.y -= (minY + 0.004);
    return group;
  }

  // =========================================================================
  // BIKE 2: KAWASAKI KLX 230R PROCEDURAL VOXEL BUILDER
  // =========================================================================
  function buildKLX230Model(sharedBoxGeo, envMap, isMobile) {
    const scaleStep = isMobile ? 1.48 : 1.08;
    const S_MAIN = 0.0125 * scaleStep;
    const S_MED  = 0.0095 * scaleStep;
    const S_FINE = 0.0064 * scaleStep;

    const MATERIAL_SPECS = {
      limeGreen:      { color: 0x45c814, roughness: 0.24, metalness: 0.05 },
      limeGreenDark:  { color: 0x35a80d, roughness: 0.28, metalness: 0.05 },
      seatBlack:      { color: 0x222427, roughness: 0.82, metalness: 0.02 },
      tankBlack:      { color: 0x1b1d20, roughness: 0.36, metalness: 0.06 },
      decalBlack:     { color: 0x15171a, roughness: 0.26, metalness: 0.06 },
      decalWhite:     { color: 0xedf1f4, roughness: 0.24, metalness: 0.12 },
      frameWhite:     { color: 0xdce0e4, roughness: 0.36, metalness: 0.24 },
      frameGuard:     { color: 0x393c41, roughness: 0.56, metalness: 0.06 },
      tireRubber:     { color: 0x2d2f31, roughness: 0.90, metalness: 0.02 },
      tireDust:       { color: 0x45443f, roughness: 0.94, metalness: 0.01 },
      rimBlack:       { color: 0x16181c, roughness: 0.25, metalness: 0.78 },
      aluminum:       { color: 0xc5cacf, roughness: 0.30, metalness: 0.84 },
      aluminumCast:   { color: 0xa1a6ab, roughness: 0.44, metalness: 0.70 },
      chrome:         { color: 0xe3e8ed, roughness: 0.11, metalness: 0.96 },
      spokeSteel:     { color: 0xd0d5da, roughness: 0.22, metalness: 0.90 },
      cylinderOxide:  { color: 0x766c60, roughness: 0.62, metalness: 0.46 },
      exhaustHeader:  { color: 0x765540, roughness: 0.56, metalness: 0.54 },
      mufflerSteel:   { color: 0xd0d4d8, roughness: 0.24, metalness: 0.88 },
      mufflerCap:     { color: 0x3a3d41, roughness: 0.54, metalness: 0.48 },
      gaiterRubber:   { color: 0x38322a, roughness: 0.86, metalness: 0.02 },
      gripTan:        { color: 0xba9b6e, roughness: 0.82, metalness: 0.02 },
      darkSteel:      { color: 0x2c2f34, roughness: 0.40, metalness: 0.74 },
      strapBlack:     { color: 0x1c1e21, roughness: 0.88, metalness: 0.02 }
    };

    const materials = {};
    for (const [k, s] of Object.entries(MATERIAL_SPECS)) {
      const envInt = s.metalness > 0.6 ? 0.95 : (s.roughness > 0.7 ? 0.12 : 0.40);
      materials[k] = new THREE.MeshStandardMaterial({
        color: new THREE.Color(s.color).convertSRGBToLinear(),
        roughness: s.roughness,
        metalness: s.metalness,
        envMap,
        envMapIntensity: envInt
      });
    }

    class VoxelLayer {
      constructor(size) {
        this.size = size;
        this.voxels = new Map();
      }
      set(x, y, z, mat, tint = 1.0) {
        const ix = Math.round(x / this.size), iy = Math.round(y / this.size), iz = Math.round(z / this.size);
        this.voxels.set(ix + ',' + iy + ',' + iz, { ix, iy, iz, mat, tint });
      }
      addTube(ax, ay, az, bx, by, bz, radius, mat, tint = 1.0) {
        const s = this.size;
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const lenSq = dx * dx + dy * dy + dz * dz;
        const pad = radius + s;
        const minX = Math.floor((Math.min(ax, bx) - pad) / s), maxX = Math.ceil((Math.max(ax, bx) + pad) / s);
        const minY = Math.floor((Math.min(ay, by) - pad) / s), maxY = Math.ceil((Math.max(ay, by) + pad) / s);
        const minZ = Math.floor((Math.min(az, bz) - pad) / s), maxZ = Math.ceil((Math.max(az, bz) + pad) / s);
        const rSq = radius * radius;
        for (let ix = minX; ix <= maxX; ix++) {
          const px = ix * s;
          for (let iy = minY; iy <= maxY; iy++) {
            const py = iy * s;
            for (let iz = minZ; iz <= maxZ; iz++) {
              const pz = iz * s;
              let t = lenSq > 1e-8 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / lenSq : 0;
              if (t < 0) t = 0; else if (t > 1) t = 1;
              if ((ax + t * dx - px) ** 2 + (ay + t * dy - py) ** 2 + (az + t * dz - pz) ** 2 <= rSq) {
                this.voxels.set(ix + ',' + iy + ',' + iz, { ix, iy, iz, mat, tint });
              }
            }
          }
        }
      }
      addTaperedTube(ax, ay, az, bx, by, bz, rA, rB, mat) {
        const s = this.size;
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const lenSq = dx * dx + dy * dy + dz * dz;
        const pad = Math.max(rA, rB) + s;
        const minX = Math.floor((Math.min(ax, bx) - pad) / s), maxX = Math.ceil((Math.max(ax, bx) + pad) / s);
        const minY = Math.floor((Math.min(ay, by) - pad) / s), maxY = Math.ceil((Math.max(ay, by) + pad) / s);
        const minZ = Math.floor((Math.min(az, bz) - pad) / s), maxZ = Math.ceil((Math.max(az, bz) + pad) / s);
        for (let ix = minX; ix <= maxX; ix++) {
          const px = ix * s;
          for (let iy = minY; iy <= maxY; iy++) {
            const py = iy * s;
            for (let iz = minZ; iz <= maxZ; iz++) {
              const pz = iz * s;
              let t = lenSq > 1e-8 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / lenSq : 0;
              if (t < 0) t = 0; else if (t > 1) t = 1;
              const r = rA + (rB - rA) * t;
              if ((ax + t * dx - px) ** 2 + (ay + t * dy - py) ** 2 + (az + t * dz - pz) ** 2 <= r * r) {
                this.voxels.set(ix + ',' + iy + ',' + iz, { ix, iy, iz, mat, tint: 1.0 });
              }
            }
          }
        }
      }
      addPolyline(pts, r, mat) {
        for (let i = 0; i < pts.length - 1; i++) {
          this.addTube(pts[i][0], pts[i][1], pts[i][2], pts[i + 1][0], pts[i + 1][1], pts[i + 1][2], r, mat);
        }
      }
      addBox(x0, y0, z0, x1, y1, z1, mat) {
        const s = this.size;
        for (let ix = Math.round(Math.min(x0, x1) / s); ix <= Math.round(Math.max(x0, x1) / s); ix++) {
          for (let iy = Math.round(Math.min(y0, y1) / s); iy <= Math.round(Math.max(y0, y1) / s); iy++) {
            for (let iz = Math.round(Math.min(z0, z1) / s); iz <= Math.round(Math.max(z0, z1) / s); iz++) {
              this.voxels.set(ix + ',' + iy + ',' + iz, { ix, iy, iz, mat, tint: 1.0 });
            }
          }
        }
      }
      addEllipsoid(cx, cy, cz, rx, ry, rz, mat) {
        const s = this.size;
        for (let ix = Math.floor((cx - rx) / s); ix <= Math.ceil((cx + rx) / s); ix++) {
          const nx2 = ((ix * s - cx) / rx) ** 2; if (nx2 > 1) continue;
          for (let iy = Math.floor((cy - ry) / s); iy <= Math.ceil((cy + ry) / s); iy++) {
            const ny2 = nx2 + ((iy * s - cy) / ry) ** 2; if (ny2 > 1) continue;
            for (let iz = Math.floor((cz - rz) / s); iz <= Math.ceil((cz + rz) / s); iz++) {
              if (ny2 + ((iz * s - cz) / rz) ** 2 <= 1) {
                this.voxels.set(ix + ',' + iy + ',' + iz, { ix, iy, iz, mat, tint: 1.0 });
              }
            }
          }
        }
      }
      build(targetGroup) {
        const byMat = new Map();
        const map = this.voxels;
        for (const [, v] of map) {
          const { ix, iy, iz } = v;
          const nXP = map.has((ix + 1) + ',' + iy + ',' + iz);
          const nXM = map.has((ix - 1) + ',' + iy + ',' + iz);
          const nYP = map.has(ix + ',' + (iy + 1) + ',' + iz);
          const nYM = map.has(ix + ',' + (iy - 1) + ',' + iz);
          const nZP = map.has(ix + ',' + iy + ',' + (iz + 1));
          const nZM = map.has(ix + ',' + iy + ',' + (iz - 1));
          if (nXP && nXM && nYP && nYM && nZP && nZM) continue;
          const occ6 = (nXP ? 1 : 0) + (nXM ? 1 : 0) + (nYP ? 1.4 : 0) + (nYM ? 0.5 : 0) + (nZP ? 1 : 0) + (nZM ? 1 : 0);
          const ao = Math.max(0.68, 1.03 - occ6 * 0.055);
          const shade = Math.max(0.5, Math.min(1.1, ao * v.tint));
          let arr = byMat.get(v.mat);
          if (!arr) { arr = []; byMat.set(v.mat, arr); }
          arr.push({ x: ix * this.size, y: iy * this.size, z: iz * this.size, shade });
        }
        const dummy = new THREE.Object3D();
        const tmpColor = new THREE.Color();
        const cubeScale = this.size * 0.986;
        for (const [matKey, list] of byMat) {
          const inst = new THREE.InstancedMesh(sharedBoxGeo, materials[matKey], list.length);
          inst.castShadow = !isMobile;
          inst.receiveShadow = !isMobile;
          for (let i = 0; i < list.length; i++) {
            const it = list[i];
            dummy.position.set(it.x, it.y, it.z);
            dummy.scale.set(cubeScale, cubeScale, cubeScale);
            dummy.updateMatrix();
            inst.setMatrixAt(i, dummy.matrix);
            tmpColor.setRGB(it.shade, it.shade, it.shade);
            inst.setColorAt(i, tmpColor);
          }
          inst.instanceMatrix.needsUpdate = true;
          if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
          targetGroup.add(inst);
        }
      }
    }

    function buildKLXWheel(group, cfg) {
      const main = new VoxelLayer(S_MAIN), med = new VoxelLayer(S_MED), fine = new VoxelLayer(S_FINE);
      const { outerR, tireInnerR, rimInnerR, tireWidth, rimWidth, hubR, hubWidth, knobPitches, discSide, discR } = cfg;
      const carcassR = outerR - 0.023, halfTireW = tireWidth * 0.5, halfRimW = rimWidth * 0.5;
      const tireCenterR = (carcassR + tireInnerR) * 0.5, tireTubeR = (carcassR - tireInnerR) * 0.5;
      const minI = Math.floor(-carcassR / S_MAIN), maxI = Math.ceil(carcassR / S_MAIN), maxZ = Math.ceil(halfTireW / S_MAIN);
      for (let ix = minI; ix <= maxI; ix++) {
        const x = ix * S_MAIN;
        for (let iy = minI; iy <= maxI; iy++) {
          const y = iy * S_MAIN, r = Math.hypot(x, y);
          if (r < tireInnerR - S_MAIN || r > carcassR + S_MAIN) continue;
          const dr = (r - tireCenterR) / tireTubeR;
          for (let iz = -maxZ; iz <= maxZ; iz++) {
            const z = iz * S_MAIN, dz = z / halfTireW;
            if (dr * dr * 0.92 + dz * dz <= 1.0 && r >= tireInnerR) main.set(x, y, z, 'tireRubber', r > carcassR - 0.018 ? 1.05 : 0.95);
          }
        }
      }
      const kp = isMobile ? Math.round(knobPitches * 0.72) : knobPitches;
      for (let i = 0; i < kp; i++) {
        const ang = (i / kp) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
        const r = carcassR + 0.008;
        med.set(ca * r, sa * r, 0, 'tireDust', 1.04);
        med.set(ca * r, sa * r, halfTireW * 0.65, 'tireRubber', 0.96);
        med.set(ca * r, sa * r, -halfTireW * 0.65, 'tireRubber', 0.96);
      }
      const rimOuterR = tireInnerR + 0.006, rMin = Math.floor(-rimOuterR / S_MED), rMax = Math.ceil(rimOuterR / S_MED), rimZMax = Math.ceil(halfRimW / S_MED);
      for (let ix = rMin; ix <= rMax; ix++) {
        const x = ix * S_MED;
        for (let iy = rMin; iy <= rMax; iy++) {
          const y = iy * S_MED, r = Math.hypot(x, y);
          if (r >= rimInnerR && r <= rimOuterR) {
            for (let iz = -rimZMax; iz <= rimZMax; iz++) med.set(x, y, iz * S_MED, 'rimBlack', 1.0);
          }
        }
      }
      med.addTube(0, 0, -hubWidth * 0.5, 0, 0, hubWidth * 0.5, hubR * 0.7, 'aluminum');
      const sCount = isMobile ? 20 : 32;
      const sSteps = isMobile ? 14 : 24;
      for (let i = 0; i < sCount; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const hubAng = (i / sCount) * Math.PI * 2, rimAng = hubAng + (Math.floor(i / 2) % 2 === 0 ? 0.28 : -0.28);
        const hx = Math.cos(hubAng) * hubR * 0.85, hy = Math.sin(hubAng) * hubR * 0.85, hz = side * hubWidth * 0.36;
        const rx = Math.cos(rimAng) * (rimInnerR + 0.004), ry = Math.sin(rimAng) * (rimInnerR + 0.004);
        for (let k = 0; k <= sSteps; k++) {
          const t = k / sSteps;
          fine.set(hx + (rx - hx) * t, hy + (ry - hy) * t, hz * (1 - t), 'spokeSteel', 1.02);
        }
      }
      const discZ = discSide * (hubWidth * 0.5 + 0.012);
      const dMax = Math.ceil(discR / S_FINE);
      for (let ix = -dMax; ix <= dMax; ix++) {
        for (let iy = -dMax; iy <= dMax; iy++) {
          const r = Math.hypot(ix * S_FINE, iy * S_FINE);
          if (r >= discR * 0.72 && r <= discR) fine.set(ix * S_FINE, iy * S_FINE, discZ, 'spokeSteel', 1.04);
        }
      }
      main.build(group); med.build(group); fine.build(group);
    }

    const root = new THREE.Group();
    root.rotation.x = -0.075;

    const rearWheelGroup = new THREE.Group();
    rearWheelGroup.position.set(-0.670, 0.345, 0);
    buildKLXWheel(rearWheelGroup, { outerR: 0.345, tireInnerR: 0.232, rimInnerR: 0.208, tireWidth: 0.118, rimWidth: 0.068, hubR: 0.052, hubWidth: 0.128, knobPitches: 26, discSide: 1, discR: 0.118 });
    root.add(rearWheelGroup);

    const steeringPivot = new THREE.Group();
    steeringPivot.position.set(0.355, 0.975, 0);
    steeringPivot.rotation.z = 0.46;
    const frontGroup = new THREE.Group();
    frontGroup.rotation.y = 0.09;
    steeringPivot.add(frontGroup);

    const frontWheelGroup = new THREE.Group();
    frontWheelGroup.position.set(0.032, -0.674, 0);
    buildKLXWheel(frontWheelGroup, { outerR: 0.385, tireInnerR: 0.278, rimInnerR: 0.254, tireWidth: 0.088, rimWidth: 0.054, hubR: 0.044, hubWidth: 0.112, knobPitches: 30, discSide: -1, discR: 0.132 });
    frontGroup.add(frontWheelGroup);

    // Front Forks, Handlebars, Lime Front Plate & High Fender
    const fMain = new VoxelLayer(S_MAIN), fMed = new VoxelLayer(S_MED), fFine = new VoxelLayer(S_FINE);
    const fx = 0.032, forkZ = 0.095, axleY = -0.674;
    for (const side of [-1, 1]) {
      const z = side * forkZ;
      fMed.addTube(fx, 0.055, z, fx, -0.165, z, 0.019, 'chrome');
      fMed.addTube(fx, -0.168, z, fx, -0.395, z, 0.029, 'gaiterRubber');
      fMed.addTube(fx, -0.395, z, fx, axleY - 0.03, z, 0.025, 'aluminum');
      fMed.addPolyline([[0, 0.095, 0], [0, 0.098, side * 0.085], [-0.018, 0.158, side * 0.165], [-0.052, 0.172, side * 0.275]], 0.012, 'darkSteel');
      fMed.addTube(-0.052, 0.172, side * 0.268, -0.084, 0.178, side * 0.392, 0.017, 'gripTan');
    }
    fMed.addBox(-0.015, 0.028, -0.11, fx + 0.025, 0.052, 0.11, 'aluminum');
    fMed.addBox(-0.018, -0.168, -0.11, fx + 0.026, -0.136, 0.11, 'aluminum');
    for (let y = -0.125; y <= 0.125; y += S_MED * 0.9) {
      const ty = (y + 0.125) / 0.25, halfW = 0.072 + Math.sin(ty * Math.PI * 0.85) * 0.036;
      for (let z = -halfW; z <= halfW; z += S_MED * 0.9) {
        const zn = z / halfW;
        const x = fx + 0.056 + (1 - zn * zn) * 0.022 - ty * 0.008;
        fMed.set(x, y, z, (ty > 0.86 && Math.abs(zn) < 0.42) ? 'tankBlack' : 'limeGreen');
      }
    }
    const cr = Math.cos(0.46), sr = Math.sin(0.46);
    for (let sDist = -0.095; sDist <= 0.565; sDist += S_MAIN * 0.8) {
      const t = (sDist + 0.095) / 0.66;
      const worldDy = -0.145 * Math.pow(Math.max(0, t - 0.22), 1.85);
      const lxBase = fx + 0.025 + sDist * cr + worldDy * sr;
      const lyBase = -0.168 - sDist * sr + worldDy * cr;
      const halfW = sDist < 0 ? 0.07 : 0.078 * (1 - 0.56 * Math.pow(t, 1.35));
      for (let z = -halfW; z <= halfW; z += S_MAIN * 0.85) {
        const zn = z / Math.max(0.01, halfW), drop = -zn * zn * 0.022;
        fMain.set(lxBase + drop * sr, lyBase + drop * cr, z, 'limeGreen');
      }
    }
    fMain.build(frontGroup); fMed.build(frontGroup); fFine.build(frontGroup);
    root.add(steeringPivot);

    // Frame, Engine, Exhaust, Swingarm, Bodywork, Seat
    const bMain = new VoxelLayer(S_MAIN), bMed = new VoxelLayer(S_MED), bFine = new VoxelLayer(S_FINE);
    bMed.addTube(0.320, 1.005, 0, 0.395, 0.840, 0, 0.026, 'frameWhite');
    bMed.addPolyline([[0.370, 0.875, 0], [0.295, 0.640, 0], [0.240, 0.380, 0]], 0.019, 'frameWhite');
    for (const side of [-1, 1]) {
      bMed.addPolyline([[0.335, 0.950, side * 0.025], [0.240, 0.865, side * 0.088], [0.060, 0.735, side * 0.105], [-0.215, 0.430, side * 0.115], [-0.220, 0.345, side * 0.105]], 0.017, 'frameWhite');
      bMed.addPolyline([[0.235, 0.375, side * 0.032], [0.195, 0.305, side * 0.072], [-0.165, 0.308, side * 0.095], [-0.218, 0.348, side * 0.104]], 0.014, 'frameWhite');
      bMed.addPolyline([[-0.115, 0.760, side * 0.082], [-0.360, 0.815, side * 0.090], [-0.660, 0.895, side * 0.076]], 0.013, 'aluminumCast');
      bMed.addTube(-0.220, 0.395, side * 0.104, -0.670, 0.345, side * 0.108, 0.026, 'aluminum');
    }
    bMed.addTube(-0.205, 0.320, -0.108, -0.145, 0.024, -0.255, 0.011, 'aluminumCast');

    // Engine & Exhaust
    bMed.addEllipsoid(-0.02, 0.425, 0, 0.170, 0.108, 0.092, 'aluminumCast');
    bMed.addEllipsoid(-0.015, 0.415, 0.098, 0.078, 0.078, 0.024, 'aluminum');
    bMed.addEllipsoid(-0.020, 0.415, -0.095, 0.086, 0.074, 0.022, 'aluminum');
    for (let h = 0; h <= 0.23; h += S_FINE * 1.1) {
      const cx = 0.065 + h * 0.225, cy = 0.505 + h;
      const isFin = Math.sin(h * 320) > 0;
      const rx = (h > 0.145 ? 0.064 : 0.054) + (isFin ? 0.02 : 0);
      const rz = (h > 0.145 ? 0.072 : 0.058) + (isFin ? 0.02 : 0);
      for (let dx = -rx; dx <= rx; dx += S_FINE * 1.1) {
        for (let dz = -rz; dz <= rz; dz += S_FINE * 1.1) {
          if ((dx / rx) ** 2 + (dz / rz) ** 2 <= 1.05) bFine.set(cx + dx, cy, dz, h > 0.195 ? 'aluminumCast' : 'cylinderOxide', isFin ? 1.06 : 0.86);
        }
      }
    }
    bMed.addPolyline([[0.165, 0.625, 0.025], [0.228, 0.495, 0.095], [0.165, 0.465, 0.128], [-0.140, 0.560, 0.132], [-0.530, 0.675, 0.148]], 0.019, 'exhaustHeader');
    bMain.addTaperedTube(-0.515, 0.672, 0.152, -0.790, 0.822, 0.148, 0.052, 0.058, 'mufflerSteel');
    bMed.addTaperedTube(-0.790, 0.822, 0.148, -0.858, 0.858, 0.146, 0.056, 0.032, 'mufflerCap');

    // Black Tank, Lime Shrouds, Side Plates, Rear Fender, Black Seat
    bMain.addBox(0.02, 0.79, -0.095, 0.27, 0.955, 0.095, 'tankBlack');
    bMain.addBox(-0.34, 0.61, -0.085, -0.10, 0.78, 0.085, 'tankBlack');
    for (const side of [-1, 1]) {
      for (let x = -0.055; x <= 0.445; x += S_MED * 0.92) {
        const tx = (x + 0.055) / 0.50;
        const yTop = tx < 0.58 ? 0.855 + Math.sin((tx / 0.58) * Math.PI * 0.55) * 0.105 : 0.958 - ((tx - 0.58) / 0.42) * 0.122;
        let yBot = tx < 0.58 ? 0.755 - (tx / 0.58) * 0.025 : (x < 0.335 ? 0.730 - ((x - 0.235) / 0.10) * 0.095 : 0.635 + ((x - 0.335) / 0.11) * 0.195);
        for (let y = yBot; y <= yTop; y += S_MED * 0.92) {
          const ty = (y - yBot) / Math.max(0.01, yTop - yBot);
          const zOut = side * (0.092 + Math.sin(Math.min(1, tx * 1.15) * Math.PI * 0.72) * 0.088 - Math.abs(ty - 0.55) * 0.028);
          const stripeY = 0.768 - (x - 0.26) * 0.42;
          let mat = 'limeGreen';
          if (x > 0.195 && x < 0.395 && Math.abs(y - stripeY) < 0.032) mat = 'decalBlack';
          else if (x > 0.12 && x < 0.32 && Math.abs(y - (0.905 - (x - 0.18) * 0.26)) < 0.022) mat = 'decalWhite';
          bMed.set(x, y, zOut, mat);
        }
      }
      const extraBulge = side > 0 ? 0.026 : 0;
      for (let x = -0.735; x <= -0.095; x += S_MAIN * 0.85) {
        const tx = (x + 0.735) / 0.64;
        const yTop = 0.945 - Math.pow(tx, 1.35) * 0.105;
        const yBot = tx < 0.45 ? 0.860 - Math.sin((tx / 0.45) * Math.PI * 0.5) * 0.215 : 0.645 + Math.pow((tx - 0.45) / 0.55, 1.45) * 0.085;
        for (let y = yBot; y <= yTop; y += S_MAIN * 0.85) {
          const ty = (y - yBot) / Math.max(0.01, yTop - yBot);
          const zOut = side * (0.112 + Math.sin(tx * Math.PI * 0.88) * 0.056 + Math.sin(ty * Math.PI) * 0.022 + extraBulge * (1 - tx * 0.6));
          bMain.set(x, y, zOut, 'limeGreen');
        }
      }
    }
    for (let x = -1.035; x <= -0.555; x += S_MAIN * 0.8) {
      const t = (x + 1.035) / 0.48, yCenter = 1.035 - Math.pow(t, 1.15) * 0.085, halfW = 0.026 + Math.pow(t, 0.75) * 0.068;
      for (let z = -halfW; z <= halfW; z += S_MAIN * 0.85) {
        const zn = z / Math.max(0.01, halfW);
        bMain.set(x, yCenter - zn * zn * 0.018, z, 'limeGreen');
      }
    }
    for (let x = -0.585; x <= 0.115; x += S_MAIN * 0.85) {
      const t = (x + 0.585) / 0.70;
      const yTop = t < 0.62 ? 0.962 - Math.sin((t / 0.62) * Math.PI * 0.5) * 0.098 : 0.864 + Math.pow((t - 0.62) / 0.38, 1.55) * 0.096;
      const yBot = yTop - 0.065;
      const halfW = 0.082 * (1 - 0.32 * Math.pow(t, 1.3));
      for (let z = -halfW; z <= halfW; z += S_MAIN * 0.85) {
        const zn = z / Math.max(0.01, halfW), localTop = yTop + (1 - zn * zn) * 0.022;
        for (let y = yBot; y <= localTop; y += S_MAIN * 0.85) bMain.set(x, y, z, 'seatBlack');
      }
    }
    bMain.build(root); bMed.build(root); bFine.build(root);

    const minY = computeInstancedMinY(root);
    root.position.y -= (minY + 0.004);
    return root;
  }

  // =========================================================================
  // VOXEL-STYLE 3D GARAGE BACKDROP & TURNTABLE PLINTH BUILDERS
  // =========================================================================
  function createGarageVoxelBatcher(sharedBoxGeo, envMap, isMobile) {
    const buckets = new Map();

    const mkStd = (roughness, metalness, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({
      color: 0xffffff,
      roughness,
      metalness,
      envMap,
      envMapIntensity: 0.45
    }, extra));

    const materials = {
      matteDark:     mkStd(0.88, 0.06, { envMapIntensity: 0.20 }),
      concrete:      mkStd(0.92, 0.03, { envMapIntensity: 0.16 }),
      metalDark:     mkStd(0.46, 0.72, { envMapIntensity: 0.78 }),
      metalBright:   mkStd(0.28, 0.86, { envMapIntensity: 0.95 }),
      paintGloss:    mkStd(0.28, 0.08, { envMapIntensity: 0.45 }),
      rubberMatte:   mkStd(0.94, 0.02, { envMapIntensity: 0.10 }),
      emissiveWhite: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      emissiveCyan:  new THREE.MeshBasicMaterial({ color: 0xffffff }),
      emissiveLime:  new THREE.MeshBasicMaterial({ color: 0xffffff })
    };

    function addBox(matKey, x, y, z, sx, sy, sz, hexColor) {
      let arr = buckets.get(matKey);
      if (!arr) {
        arr = [];
        buckets.set(matKey, arr);
      }
      arr.push({ x, y, z, sx, sy, sz, color: hexColor });
    }

    function compile(castShadow = false, receiveShadow = true) {
      const group = new THREE.Group();
      const dummy = new THREE.Object3D();
      const tmpColor = new THREE.Color();

      for (const [matKey, list] of buckets.entries()) {
        if (!list.length) continue;
        const mat = materials[matKey] || materials.matteDark;
        const inst = new THREE.InstancedMesh(sharedBoxGeo, mat, list.length);
        const isEmissive = matKey.startsWith('emissive');
        inst.castShadow = !isMobile && castShadow && !isEmissive;
        inst.receiveShadow = !isMobile && receiveShadow && !isEmissive;

        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          dummy.position.set(b.x, b.y, b.z);
          dummy.scale.set(b.sx, b.sy, b.sz);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
          tmpColor.setHex(b.color);
          if (!isEmissive) tmpColor.convertSRGBToLinear();
          inst.setColorAt(i, tmpColor);
        }
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        group.add(inst);
      }
      return group;
    }

    return { addBox, compile };
  }

  function buildVoxelTurntablePad(sharedBoxGeo, envMap, isMobile, accentHex) {
    const batch = createGarageVoxelBatcher(sharedBoxGeo, envMap, isMobile);
    const step = 0.095;
    const outerR = 0.90;
    const innerR = 0.78;
    const padH = 0.052;
    const maxI = Math.ceil(outerR / step);

    for (let ix = -maxI; ix <= maxI; ix++) {
      const x = ix * step;
      for (let iz = -maxI; iz <= maxI; iz++) {
        const z = iz * step;
        const r = Math.hypot(x, z);
        if (r > outerR) continue;
        const isRim = r >= innerR;
        const isCardinalAccent = isRim && (
          (Math.abs(ix) <= 1 && Math.abs(iz) >= maxI - 1) ||
          (Math.abs(iz) <= 1 && Math.abs(ix) >= maxI - 1)
        );
        if (isCardinalAccent) {
          batch.addBox('emissiveLime', x, -padH * 0.5 + 0.002, z, step * 0.92, padH * 1.04, step * 0.92, accentHex);
        } else if (isRim) {
          batch.addBox('metalDark', x, -padH * 0.5, z, step * 0.94, padH, step * 0.94, ((ix + iz) & 1) ? 0x222834 : 0x1a1f29);
        } else {
          const check = ((ix + iz) & 1) === 0;
          batch.addBox('matteDark', x, -padH * 0.5 - 0.003, z, step * 0.95, padH * 0.92, step * 0.95, check ? 0x11151d : 0x0d1016);
        }
      }
    }

    const padGroup = batch.compile(false, true);
    // Soft contact shadow decal right on top of the voxel stand so tires look firmly planted
    const shadowDecal = new THREE.Mesh(
      new THREE.PlaneGeometry(1.56, 0.72),
      new THREE.MeshBasicMaterial({
        map: createContactShadowTexture(),
        transparent: true,
        opacity: 0.75,
        depthWrite: false
      })
    );
    shadowDecal.rotation.x = -Math.PI / 2;
    shadowDecal.position.y = 0.003;
    padGroup.add(shadowDecal);
    return padGroup;
  }

  function buildVoxelGarageBackdrop(sharedBoxGeo, envMap, isMobile) {
    const batch = createGarageVoxelBatcher(sharedBoxGeo, envMap, isMobile);
    const floorY = -0.055;
    const wallZ = -2.75;

    function hash2(a, b) {
      let n = Math.imul(a, 374761393) + Math.imul(b, 668265263);
      n = (n ^ (n >>> 13)) * 1274126177;
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    }

    // 1. Interlocking Voxel Workshop Floor Tiles
    const tileStep = isMobile ? 0.44 : 0.36;
    const tileGap = tileStep * 0.955;
    const xTiles = Math.ceil(5.2 / tileStep);
    const zMin = Math.floor(-2.7 / tileStep);
    const zMax = Math.ceil(3.0 / tileStep);

    for (let ix = -xTiles; ix <= xTiles; ix++) {
      const wx = ix * tileStep;
      for (let iz = zMin; iz <= zMax; iz++) {
        const wz = iz * tileStep;
        const checker = ((ix + iz) & 1) === 0;
        const h = hash2(ix, iz);
        let col = checker ? 0x141821 : 0x0f131a;
        if (h > 0.84) col = checker ? 0x191f2a : 0x12161f;

        // Subtle pit-lane bay border stripe near back wall
        const isPitStripe = (wz > -2.18 && wz < -1.82 && Math.abs(wx) < 4.5);
        if (isPitStripe && (Math.abs(ix) % 2 === 0)) {
          batch.addBox('matteDark', wx, floorY - 0.028, wz, tileGap, 0.058, tileGap, 0x1e2532);
        } else {
          batch.addBox('concrete', wx, floorY - 0.03, wz, tileGap, 0.056, tileGap, col);
        }
      }
    }

    // Corner window geometry (cut right through the back wall so the live 3D garden shines through)
    const winX = -3.28;
    const winY = 2.02;
    const winZ = wallZ + 0.11;
    const winW = 1.66;
    const winH = 1.04;

    // 2. Staggered Voxel Cinder-Block Back Wall (with real architectural cutout for the corner window)
    const brickW = isMobile ? 0.48 : 0.38;
    const brickH = 0.22;
    const brickD = 0.16;
    const rows = 15;
    const wallHalfW = 5.4;

    for (let r = 0; r < rows; r++) {
      const wy = floorY + brickH * 0.5 + r * brickH;
      const offset = (r % 2 === 0) ? 0 : brickW * 0.5;
      for (let wx = -wallHalfW + offset; wx <= wallHalfW; wx += brickW) {
        // Skip bricks overlapping the window glass opening so the cutout stays 100% open
        if (
          Math.abs(wx - winX) < (winW * 0.5 + brickW * 0.44) &&
          Math.abs(wy - winY) < (winH * 0.5 + brickH * 0.44)
        ) {
          continue;
        }
        const h = hash2(Math.round(wx * 10), r);
        const zJitter = (h - 0.5) * 0.014;
        let col = r < 2 ? 0x0d1016 : (h < 0.33 ? 0x131720 : (h < 0.68 ? 0x171c27 : 0x1c222f));
        const matKey = r < 2 ? 'metalDark' : 'concrete';
        batch.addBox(matKey, wx, wy, wallZ + zJitter, brickW * 0.96, brickH * 0.94, brickD, col);
      }
    }

    // Horizontal wainscot accent trim rail across back wall
    for (let wx = -5.2; wx <= 5.2; wx += 0.42) {
      batch.addBox('metalDark', wx, floorY + 0.46, wallZ + 0.095, 0.40, 0.055, 0.05, 0x262e3d);
    }

    // 3. Structural Vertical Steel Voxel I-Beam Columns & Overhead Truss
    const pillarXs = [-4.35, -1.78, 1.78, 4.35];
    pillarXs.forEach((px) => {
      for (let py = floorY + 0.11; py <= 3.22; py += 0.22) {
        batch.addBox('metalDark', px, py, wallZ + 0.15, 0.20, 0.21, 0.22, 0x1d232e);
      }
      // Foot baseplate
      batch.addBox('metalBright', px, floorY + 0.03, wallZ + 0.18, 0.32, 0.06, 0.30, 0x3b4454);
    });

    // Overhead horizontal steel voxel beam + truss blocks
    for (let bx = -5.0; bx <= 5.0; bx += 0.34) {
      batch.addBox('metalDark', bx, 3.16, wallZ + 0.18, 0.32, 0.18, 0.24, 0x191f2a);
      batch.addBox('metalDark', bx, 3.24, -0.35, 0.32, 0.14, 0.18, 0x151a24);
    }

    // 4. Overhead Hanging Voxel LED Shop Light Bars
    [-2.55, 0, 2.55].forEach((lx) => {
      // Fixture housing
      batch.addBox('metalDark', lx, 3.06, -0.35, 1.44, 0.07, 0.16, 0x1e2430);
      // Hanger rods
      batch.addBox('metalDark', lx - 0.56, 3.15, -0.35, 0.04, 0.14, 0.04, 0x2e3646);
      batch.addBox('metalDark', lx + 0.56, 3.15, -0.35, 0.04, 0.14, 0.04, 0x2e3646);
      // Glowing LED voxel segments
      for (let seg = -5; seg <= 5; seg++) {
        const isEnd = Math.abs(seg) === 5;
        batch.addBox(
          isEnd ? 'emissiveCyan' : 'emissiveWhite',
          lx + seg * 0.12,
          3.01,
          -0.35,
          0.105,
          0.038,
          0.085,
          isEnd ? 0x06b6d4 : 0xdceeff
        );
      }
    });

    // 5. TOP-LEFT CORNER 4-PANE VOXEL GARDEN WINDOW (Real 3D Cutout — Camera Pulls Back From Here)
    // Deep industrial steel outer frame bridging cleanly into the surrounding cinder blocks
    const frameThick = 0.26;
    batch.addBox('metalDark', winX, winY + winH * 0.5 + frameThick * 0.5, winZ, winW + frameThick * 2, frameThick, 0.28, 0x1e2533);
    batch.addBox('metalDark', winX, winY - winH * 0.5 - frameThick * 0.5, winZ + 0.04, winW + frameThick * 2 + 0.10, frameThick, 0.34, 0x262f40); // Deep sill
    batch.addBox('metalDark', winX - winW * 0.5 - frameThick * 0.5, winY, winZ, frameThick, winH + 0.02, 0.28, 0x1e2533);
    batch.addBox('metalDark', winX + winW * 0.5 + frameThick * 0.5, winY, winZ, frameThick, winH + 0.02, 0.28, 0x1e2533);
    // Inner crisp steel trim lip
    batch.addBox('metalBright', winX, winY - winH * 0.5 - 0.02, winZ + 0.16, winW + 0.12, 0.04, 0.06, 0x3b4558);

    // 5b. Wide DirtShack.in Back-Wall Wallpaper Zone (Spans Center-Right Upper Back Wall)
    const wpCenterX = 0.92;
    const wpCenterY = 1.98;
    const wpZ = wallZ + 0.11;
    const wpW = 5.60;
    const wpH = 0.86;
    // Subtle neon-lime voxel accent rails framing the wide wall wallpaper
    for (let i = 0; i < 24; i++) {
      const rx = (wpCenterX - wpW * 0.5) + (i / 23) * wpW;
      const isAccent = i <= 2 || i >= 21 || (i % 5 === 0);
      batch.addBox(isAccent ? 'emissiveLime' : 'metalDark', rx, wpCenterY + wpH * 0.5 + 0.09, wpZ + 0.01, 0.20, 0.032, 0.035, isAccent ? 0xb8ff00 : 0x242c3a);
      batch.addBox(isAccent ? 'emissiveLime' : 'metalDark', rx, wpCenterY - wpH * 0.5 - 0.09, wpZ + 0.01, 0.20, 0.032, 0.035, isAccent ? 0xb8ff00 : 0x242c3a);
    }

    // 6. LEFT BAY VOXEL PROPS (Red Tool Chest Under Window, Jerrycan, Spare Tires)
    const tcX = -3.32;
    const tcZ = -2.18;
    [[-0.36, -0.20], [0.36, -0.20], [-0.36, 0.20], [0.36, 0.20]].forEach(([ox, oz]) => {
      batch.addBox('rubberMatte', tcX + ox, floorY + 0.05, tcZ + oz, 0.09, 0.10, 0.09, 0x16181c);
    });
    batch.addBox('paintGloss', tcX, floorY + 0.54, tcZ, 0.88, 0.88, 0.50, 0xc81e1e);
    for (let d = 0; d < 5; d++) {
      const dy = floorY + 0.20 + d * 0.165;
      batch.addBox('paintGloss', tcX, dy, tcZ + 0.26, 0.78, 0.13, 0.04, 0xdc2626);
      batch.addBox('metalBright', tcX, dy + 0.03, tcZ + 0.29, 0.56, 0.028, 0.03, 0xd1d5db);
    }
    batch.addBox('rubberMatte', tcX, floorY + 0.995, tcZ, 0.90, 0.03, 0.52, 0x16191f);
    batch.addBox('metalBright', tcX - 0.18, floorY + 1.03, tcZ + 0.04, 0.24, 0.03, 0.05, 0xcbd5e1);
    batch.addBox('paintGloss', tcX + 0.20, floorY + 1.035, tcZ - 0.04, 0.18, 0.04, 0.14, 0x0284c7);

    // Orange Moto Fuel Jerrycan (x = -2.38, z = -2.24)
    const jcX = -2.38;
    const jcZ = -2.24;
    batch.addBox('paintGloss', jcX, floorY + 0.22, jcZ, 0.28, 0.44, 0.18, 0xea580c);
    batch.addBox('paintGloss', jcX - 0.04, floorY + 0.48, jcZ, 0.16, 0.08, 0.07, 0xd9480f);
    batch.addBox('rubberMatte', jcX + 0.08, floorY + 0.48, jcZ, 0.07, 0.10, 0.07, 0x17191d);

    // Stacked Voxel Spare Knobby Tires
    function addVoxelTireStack(cx, cz, count) {
      const tireR = 0.31;
      const segs = 12;
      for (let t = 0; t < count; t++) {
        const ty = floorY + 0.095 + t * 0.185;
        for (let s = 0; s < segs; s++) {
          const ang = (s / segs) * Math.PI * 2;
          const tx = cx + Math.cos(ang) * tireR;
          const tz = cz + Math.sin(ang) * tireR;
          batch.addBox('rubberMatte', tx, ty, tz, 0.14, 0.16, 0.14, (s & 1) ? 0x1b1e23 : 0x24282f);
        }
      }
    }
    addVoxelTireStack(-4.18, -1.18, 2);

    // 7. RIGHT BAY VOXEL PROPS (Steel Shelving Rack, Oil Jugs, MX Helmet, Paddock Stand, Spare Tire)
    const shX = 3.32;
    const shZ = -2.20;
    // 4 steel uprights
    [[-0.52, -0.22], [0.52, -0.22], [-0.52, 0.22], [0.52, 0.22]].forEach(([ox, oz]) => {
      batch.addBox('metalDark', shX + ox, floorY + 0.96, shZ + oz, 0.06, 1.92, 0.06, 0x252c39);
    });
    // 3 shelves
    [0.42, 1.04, 1.66].forEach((sy) => {
      batch.addBox('metalDark', shX, floorY + sy, shZ, 1.12, 0.05, 0.48, 0x2e3748);
    });
    // Bottom shelf: Dark parts crate
    batch.addBox('matteDark', shX - 0.16, floorY + 0.60, shZ, 0.52, 0.30, 0.36, 0x1f2530);
    batch.addBox('metalBright', shX - 0.16, floorY + 0.64, shZ + 0.19, 0.20, 0.05, 0.03, 0x94a3b8);
    // Middle shelf: Moto oil & chain lube bottles (Kawasaki lime, orange, cyan)
    batch.addBox('paintGloss', shX - 0.34, floorY + 1.22, shZ + 0.02, 0.14, 0.30, 0.12, 0x65a30d);
    batch.addBox('paintGloss', shX - 0.14, floorY + 1.20, shZ - 0.02, 0.14, 0.26, 0.12, 0xea580c);
    batch.addBox('paintGloss', shX + 0.06, floorY + 1.21, shZ + 0.03, 0.12, 0.28, 0.12, 0x06b6d4);
    batch.addBox('metalBright', shX + 0.28, floorY + 1.18, shZ, 0.10, 0.22, 0.10, 0xcbd5e1);
    // Top shelf: Voxel MX Dirt Bike Helmet (Lime & Black with peak visor!)
    const hY = floorY + 1.84;
    batch.addBox('paintGloss', shX - 0.10, hY, shZ, 0.28, 0.26, 0.28, 0x45c814);
    batch.addBox('matteDark', shX - 0.10, hY - 0.02, shZ + 0.15, 0.22, 0.12, 0.06, 0x111318);
    batch.addBox('paintGloss', shX - 0.10, hY + 0.11, shZ + 0.18, 0.24, 0.04, 0.14, 0x45c814);
    batch.addBox('emissiveCyan', shX - 0.10, hY + 0.02, shZ + 0.17, 0.16, 0.05, 0.03, 0x06b6d4);

    // Voxel Moto Paddock Lift Stand (x = 2.38, z = -2.26)
    const psX = 2.38;
    const psZ = -2.26;
    batch.addBox('metalDark', psX, floorY + 0.20, psZ, 0.34, 0.40, 0.34, 0x222834);
    batch.addBox('paintGloss', psX, floorY + 0.42, psZ, 0.36, 0.04, 0.36, 0x65a30d);

    // Spare knobby tire on right side
    addVoxelTireStack(4.18, -1.18, 1);

    const backdropGroup = batch.compile(true, true);

    // Opaque black surround occluders behind the back wall so ONLY the window opening is transparent
    const maskMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const maskZ = wallZ - 0.10;
    const wLeft = winX - winW * 0.5;
    const wRight = winX + winW * 0.5;
    const wTop = winY + winH * 0.5;
    const wBottom = winY - winH * 0.5;
    const addMaskPlane = (x0, x1, y0, y1) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), maskMat);
      m.position.set((x0 + x1) * 0.5, (y0 + y1) * 0.5, maskZ);
      backdropGroup.add(m);
    };
    addMaskPlane(-32, 32, wTop, 26);         // Above window
    addMaskPlane(-32, 32, -20, wBottom);     // Below window
    addMaskPlane(-32, wLeft, wBottom, wTop); // Left of window
    addMaskPlane(wRight, 32, wBottom, wTop); // Right of window

    // Fadeable 4-pane center voxel mullions (fade in smoothly as camera backs away from the window)
    const mullionMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1b212d).convertSRGBToLinear(),
      roughness: 0.46,
      metalness: 0.72,
      envMap,
      envMapIntensity: 0.75,
      transparent: true,
      opacity: 0
    });
    const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.055, winH, 0.09), mullionMat);
    mullionV.position.set(winX, winY, winZ + 0.04);
    const mullionH = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.055, 0.09), mullionMat);
    mullionH.position.set(winX, winY, winZ + 0.04);
    backdropGroup.add(mullionV, mullionH);

    // Subtle diagonal glass reflection sheen over the transparent window opening
    const glassCanvas = document.createElement('canvas');
    glassCanvas.width = 128;
    glassCanvas.height = 128;
    const gCtx = glassCanvas.getContext('2d');
    const gGrad = gCtx.createLinearGradient(0, 0, 128, 128);
    gGrad.addColorStop(0.0, 'rgba(186, 230, 253, 0.35)');
    gGrad.addColorStop(0.32, 'rgba(186, 230, 253, 0.04)');
    gGrad.addColorStop(0.60, 'rgba(255, 255, 255, 0.18)');
    gGrad.addColorStop(1.0, 'rgba(14, 24, 38, 0.08)');
    gCtx.fillStyle = gGrad;
    gCtx.fillRect(0, 0, 128, 128);
    const glassTex = new THREE.CanvasTexture(glassCanvas);
    const glassMat = new THREE.MeshBasicMaterial({
      map: glassTex,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const winGlassMesh = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), glassMat);
    winGlassMesh.position.set(winX, winY, winZ + 0.02);
    backdropGroup.add(winGlassMesh);

    // Invisible raycast hit plane across the wide DirtShack wallpaper zone
    const signHitMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(wpW, wpH + 0.16),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    signHitMesh.position.set(wpCenterX, wpCenterY, wpZ + 0.05);
    backdropGroup.add(signHitMesh);

    return {
      group: backdropGroup,
      signHitMesh,
      mullionMat,
      glassMat,
      windowCenter: new THREE.Vector3(winX, winY, winZ),
      windowSize: { w: winW, h: winH },
      signAnchor: {
        center: new THREE.Vector3(wpCenterX, wpCenterY, wpZ + 0.05),
        left: new THREE.Vector3(wpCenterX - wpW * 0.48, wpCenterY, wpZ + 0.05),
        right: new THREE.Vector3(wpCenterX + wpW * 0.48, wpCenterY, wpZ + 0.05),
        top: new THREE.Vector3(wpCenterX, wpCenterY + wpH * 0.48, wpZ + 0.05),
        bottom: new THREE.Vector3(wpCenterX, wpCenterY - wpH * 0.48, wpZ + 0.05)
      },
      windowAnchor: {
        topLeft: new THREE.Vector3(winX - winW * 0.5, winY + winH * 0.5, winZ + 0.05),
        bottomRight: new THREE.Vector3(winX + winW * 0.5, winY - winH * 0.5, winZ + 0.05)
      }
    };
  }

  // =========================================================================
  // UNIFIED VOXEL GARAGE ROOM (BOTH BIKES IN ONE SCENE)
  // =========================================================================
  function createBayScene(sharedBoxGeo, envMap, isMobile) {
    const scene = new THREE.Scene();
    scene.background = null;
    scene.fog = new THREE.FogExp2(0x000000, 0.055);
    scene.environment = envMap;

    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x11151e, 0.46);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff6eb, 1.44);
    key.position.set(2.8, 6.0, 4.2);
    if (!isMobile) {
      key.castShadow = true;
      key.shadow.mapSize.width = 1024;
      key.shadow.mapSize.height = 1024;
      key.shadow.camera.near = 1.0;
      key.shadow.camera.far = 16.0;
      key.shadow.camera.left = -4.2;
      key.shadow.camera.right = 4.2;
      key.shadow.camera.top = 3.6;
      key.shadow.camera.bottom = -3.4;
      key.shadow.bias = -0.0005;
    }
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xe0f2fe, 0.52);
    rim.position.set(-3.6, 2.8, -3.5);
    scene.add(rim);

    const fill = new THREE.DirectionalLight(0xcbd5e1, 0.34);
    fill.position.set(-2.5, 2.2, 3.2);
    scene.add(fill);

    // Subtle neon-lime accent glow above the DirtShack wall signboard
    const signGlow = new THREE.PointLight(0xb8ff00, 0.65, 4.6, 2);
    signGlow.position.set(0, 2.35, -2.15);
    scene.add(signGlow);

    // Subtle overhead shop light pool
    const overheadFill = new THREE.PointLight(0xdbeafe, 0.55, 8.5, 2);
    overheadFill.position.set(0, 2.85, 0.25);
    scene.add(overheadFill);

    // Build voxel garage architecture & props
    const backdrop = buildVoxelGarageBackdrop(sharedBoxGeo, envMap, isMobile);
    scene.add(backdrop.group);

    return { scene, backdrop };
  }

  window.initGarageBikes3D = function initGarageBikes3D(sectionEl, canvasWrapEl, loadingEl) {
    if (!sectionEl || !canvasWrapEl || typeof THREE === 'undefined') return;

    const isMobile = window.innerWidth < 768 || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    const dirtshackSignEl = sectionEl.querySelector('#garage-dirtshack-sign');
    const garageHudEls = sectionEl.querySelectorAll('.garage-hud-fade');

    const renderer = new THREE.WebGLRenderer({
      antialias: !isMobile,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.75));
    renderer.setSize(canvasWrapEl.clientWidth, canvasWrapEl.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    renderer.shadowMap.enabled = !isMobile;
    if (!isMobile) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasWrapEl.appendChild(renderer.domElement);

    const envMap = createGarageEnvironment(renderer);
    const sharedBoxGeo = new THREE.BoxGeometry(1, 1, 1);

    // Single unified voxel garage room containing BOTH bikes
    const { scene, backdrop } = createBayScene(sharedBoxGeo, envMap, isMobile);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 45);

    // Mirror-synced opposite-direction rotation state (shared phase locks both bikes in sync)
    const BASE_ANGLE = -0.58;
    const SYNC_SPIN_SPEED = 0.42;
    let syncPhase = 0;
    let syncDragVel = 0;

    const bikes = [
      { id: 'impulse', pivot: new THREE.Group() },
      { id: 'klx230',  pivot: new THREE.Group() }
    ];

    // Add a low-profile voxel turntable pad to each bike pivot so it spins in sync with its bike
    bikes[0].pivot.add(buildVoxelTurntablePad(sharedBoxGeo, envMap, isMobile, 0xf2551b));
    bikes[1].pivot.add(buildVoxelTurntablePad(sharedBoxGeo, envMap, isMobile, 0xb8ff00));
    bikes.forEach((b) => scene.add(b.pivot));

    // Staged async model construction so scrolling into the garage stays smooth
    requestAnimationFrame(() => {
      const impulseModel = buildHeroImpulseModel(sharedBoxGeo, envMap, isMobile);
      bikes[0].pivot.add(impulseModel);

      setTimeout(() => {
        const klxModel = buildKLX230Model(sharedBoxGeo, envMap, isMobile);
        bikes[1].pivot.add(klxModel);
        if (loadingEl) {
          loadingEl.style.opacity = '0';
          setTimeout(() => { loadingEl.style.display = 'none'; }, 350);
        }
      }, 24);
    });

    // Prevent clicking the DirtShack HTML sign from triggering drag-to-spin
    if (dirtshackSignEl) {
      dirtshackSignEl.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
      });
    }

    // Interactive horizontal drag-to-spin (both bikes mirror-spin in opposite directions in sync)
    // Also supports raycast click on the 3D voxel sign frame around the DirtShack logo
    let activeDragSign = 0;
    let lastClientX = 0;
    let downClientX = 0;
    let downClientY = 0;
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    function getBikeIndexAtPoint(clientX, clientY) {
      const rect = canvasWrapEl.getBoundingClientRect();
      const stacked = rect.width < 768;
      if (stacked) {
        return (clientY - rect.top) < rect.height * 0.5 ? 1 : 0;
      }
      return (clientX - rect.left) < rect.width * 0.5 ? 0 : 1;
    }

    canvasWrapEl.addEventListener('pointerdown', (e) => {
      const idx = getBikeIndexAtPoint(e.clientX, e.clientY);
      activeDragSign = idx === 0 ? 1 : -1;
      lastClientX = e.clientX;
      downClientX = e.clientX;
      downClientY = e.clientY;
    });
    window.addEventListener('pointermove', (e) => {
      if (activeDragSign === 0) return;
      const dx = e.clientX - lastClientX;
      lastClientX = e.clientX;
      syncPhase += dx * 0.011 * activeDragSign;
      syncDragVel = dx * 0.045 * activeDragSign;
    }, { passive: true });
    window.addEventListener('pointerup', (e) => {
      if (activeDragSign !== 0) {
        const moved = Math.hypot(e.clientX - downClientX, e.clientY - downClientY);
        if (moved < 6 && backdrop.signHitMesh) {
          const rect = canvasWrapEl.getBoundingClientRect();
          pointerNdc.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
          pointerNdc.y = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
          raycaster.setFromCamera(pointerNdc, camera);
          if (raycaster.intersectObject(backdrop.signHitMesh, false).length > 0) {
            window.open('https://dirtshack.in', '_blank', 'noopener,noreferrer');
          }
        }
      }
      activeDragSign = 0;
    });
    window.addEventListener('pointercancel', () => { activeDragSign = 0; });

    function updateLayoutAndCameras() {
      const w = canvasWrapEl.clientWidth;
      const h = Math.max(1, canvasWrapEl.clientHeight);
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', updateLayoutAndCameras);

    // Pause render loop completely when Garage is off-screen, hidden, or gated by scroll phase
    let isInView = true;
    let isStageRevealed = true;
    let rafId = null;
    let lastTime = performance.now();

    window.setGarageRenderActive = function (active) {
      isStageRevealed = !!active;
      if (isStageRevealed && isInView && !document.hidden && rafId === null) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(renderGarage);
      }
    };

    const observer = new IntersectionObserver((entries) => {
      isInView = entries[0].isIntersecting;
      if (isInView && isStageRevealed && !document.hidden && rafId === null) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(renderGarage);
      }
    }, { rootMargin: '160px 0px' });
    observer.observe(sectionEl);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && isInView && isStageRevealed && rafId === null) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(renderGarage);
      }
    });

    const projCenter = new THREE.Vector3();
    const projLeft = new THREE.Vector3();
    const projRight = new THREE.Vector3();
    const projTop = new THREE.Vector3();
    const projBottom = new THREE.Vector3();
    const projWinTL = new THREE.Vector3();
    const projWinBR = new THREE.Vector3();

    // Exact screen-space rectangle of the 3D garage's top-left corner voxel window
    let latestWindowRect = { left: 48, top: 96, width: 220, height: 140, visible: false };
    window.getGarageWindowRect = function () { return latestWindowRect; };

    function projectCornerWindowRect(w, h) {
      if (!backdrop.windowAnchor) return;
      projWinTL.copy(backdrop.windowAnchor.topLeft).project(camera);
      projWinBR.copy(backdrop.windowAnchor.bottomRight).project(camera);
      if (projWinTL.z > 1 || projWinBR.z > 1) {
        latestWindowRect.visible = false;
        return;
      }
      const x1 = (projWinTL.x * 0.5 + 0.5) * w;
      const y1 = (-projWinTL.y * 0.5 + 0.5) * h;
      const x2 = (projWinBR.x * 0.5 + 0.5) * w;
      const y2 = (-projWinBR.y * 0.5 + 0.5) * h;
      const rawW = Math.abs(x2 - x1);
      const rawH = Math.abs(y2 - y1);
      if (w < 768 && (Math.min(x1, x2) + rawW < 24 || rawW < 40)) {
        latestWindowRect = { left: 18, top: 76, width: Math.min(180, w * 0.42), height: Math.min(114, h * 0.16), visible: true };
        return;
      }
      latestWindowRect = {
        left: Math.min(x1, x2),
        top: Math.min(y1, y2),
        width: Math.max(40, rawW),
        height: Math.max(28, rawH),
        visible: true
      };
    }

    // Smooth 3D camera pullback progress (0 = right at the corner window, 1 = full wide garage shot)
    let targetPullback = 0;
    let currentPullback = 0;
    const winCamPos = new THREE.Vector3();
    const winCamLook = new THREE.Vector3();
    const wideCamPos = new THREE.Vector3();
    const wideCamLook = new THREE.Vector3();
    const curCamLook = new THREE.Vector3();

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    window.setGaragePullbackProgress = function (t) {
      targetPullback = Math.max(0, Math.min(1, t));
    };
    window.getGaragePullbackCurrent = function () {
      return currentPullback;
    };

    const LOGO_ASPECT = 1371 / 200;

    function projectDirtShackSign(w, h) {
      if (!dirtshackSignEl || !backdrop.signAnchor) return;
      const signReveal = Math.max(0, Math.min(1, (currentPullback - 0.30) / 0.48));
      if (signReveal <= 0.01) {
        dirtshackSignEl.classList.remove('is-ready');
        dirtshackSignEl.style.opacity = '0';
        dirtshackSignEl.style.pointerEvents = 'none';
        return;
      }
      const a = backdrop.signAnchor;
      const portrait = w < 768;

      if (portrait) {
        const signW = Math.min(w * 0.88, 440);
        const signH = signW / LOGO_ASPECT;
        dirtshackSignEl.style.left = `${(w * 0.5).toFixed(1)}px`;
        dirtshackSignEl.style.top = `${Math.max(108, h * 0.17).toFixed(1)}px`;
        dirtshackSignEl.style.width = `${signW.toFixed(1)}px`;
        dirtshackSignEl.style.height = `${signH.toFixed(1)}px`;
        dirtshackSignEl.style.opacity = signReveal >= 0.99 ? '' : (signReveal * 0.92).toFixed(3);
        dirtshackSignEl.style.pointerEvents = signReveal > 0.65 ? 'auto' : 'none';
        dirtshackSignEl.classList.add('is-ready');
        return;
      }

      projCenter.copy(a.center).project(camera);
      if (projCenter.z > 1) {
        dirtshackSignEl.classList.remove('is-ready');
        dirtshackSignEl.style.opacity = '0';
        return;
      }
      projLeft.copy(a.left).project(camera);
      projRight.copy(a.right).project(camera);
      projTop.copy(a.top).project(camera);
      projBottom.copy(a.bottom).project(camera);

      const cx = (projCenter.x * 0.5 + 0.5) * w;
      const cy = (-projCenter.y * 0.5 + 0.5) * h;
      const rawW = Math.abs(projRight.x - projLeft.x) * 0.5 * w;

      const signW = Math.max(260, Math.min(w * 0.64, rawW));
      const signH = signW / LOGO_ASPECT;
      const minTop = 86 + signH * 0.5;
      const clampedY = Math.max(minTop, Math.min(h * 0.40, cy));
      const clampedX = Math.max(signW * 0.5 + 16, Math.min(w - signW * 0.5 - 16, cx));

      dirtshackSignEl.style.left = `${clampedX.toFixed(1)}px`;
      dirtshackSignEl.style.top = `${clampedY.toFixed(1)}px`;
      dirtshackSignEl.style.width = `${signW.toFixed(1)}px`;
      dirtshackSignEl.style.height = `${signH.toFixed(1)}px`;
      dirtshackSignEl.style.opacity = signReveal >= 0.99 ? '' : (signReveal * 0.92).toFixed(3);
      dirtshackSignEl.style.pointerEvents = signReveal > 0.65 ? 'auto' : 'none';
      dirtshackSignEl.classList.add('is-ready');
    }

    function updateCameraAndProjections(dt) {
      const w = canvasWrapEl.clientWidth || window.innerWidth;
      const h = Math.max(1, canvasWrapEl.clientHeight || window.innerHeight);
      const aspect = w / h;
      const portrait = w < 768;

      if (Math.abs(camera.aspect - aspect) > 0.001) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }

      // Smoothly damp pullback so mouse-wheel scroll ticks become a silky 60fps camera dolly
      if (dt > 0) {
        currentPullback = THREE.MathUtils.damp(currentPullback, targetPullback, 6.2, dt);
        if (Math.abs(currentPullback - targetPullback) < 0.0004) currentPullback = targetPullback;
      } else {
        currentPullback = targetPullback;
      }

      const vFovRad = camera.fov * Math.PI / 180;
      const tanHalfV = Math.tan(vFovRad * 0.5);
      const hFovRad = 2 * Math.atan(tanHalfV * aspect);

      if (portrait) {
        bikes[0].pivot.position.set(0, 0, 1.12);
        bikes[1].pivot.position.set(0, 0, -1.12);
        const distH = 1.44 / Math.tan(hFovRad * 0.5);
        const radius = Math.max(distH, 5.1);
        wideCamPos.set(0, radius * 0.54, radius);
        wideCamLook.set(0, 0.45, -0.25);
      } else {
        bikes[0].pivot.position.set(-1.38, 0, 0.05);
        bikes[1].pivot.position.set(1.38, 0, 0.05);
        const distH = 2.75 / Math.tan(hFovRad * 0.5);
        const distV = 1.25 / tanHalfV;
        const radius = Math.max(distH, distV, 4.75);
        wideCamPos.set(0, radius * 0.24 + 0.58, radius);
        wideCamLook.set(0, 0.72, -0.35);
      }

      // Start position: right up against the corner window so the transparent opening fills the screen
      const wc = backdrop.windowCenter;
      const ws = backdrop.windowSize;
      const dzV = (ws.h * 0.5) / tanHalfV;
      const dzH = (ws.w * 0.5) / (tanHalfV * aspect);
      const dzStart = Math.min(dzV, dzH) * 0.88;
      winCamPos.set(wc.x, wc.y, wc.z + dzStart);
      winCamLook.set(wc.x, wc.y, wc.z - 4.0);

      // Dolly straight backwards away from the window first, then arc smoothly into the wide bay view
      const t = easeInOutCubic(currentPullback);
      const tZ = Math.pow(t, 0.76);
      const tXY = Math.pow(t, 1.18);
      camera.position.set(
        winCamPos.x + (wideCamPos.x - winCamPos.x) * tXY,
        winCamPos.y + (wideCamPos.y - winCamPos.y) * tXY,
        winCamPos.z + (wideCamPos.z - winCamPos.z) * tZ
      );
      curCamLook.set(
        winCamLook.x + (wideCamLook.x - winCamLook.x) * t,
        winCamLook.y + (wideCamLook.y - winCamLook.y) * t,
        winCamLook.z + (wideCamLook.z - winCamLook.z) * t
      );
      camera.lookAt(curCamLook);
      camera.updateMatrixWorld();

      // Fade center 4-pane mullions & subtle glass sheen in as we back away from the window
      if (backdrop.mullionMat) {
        backdrop.mullionMat.opacity = Math.max(0, Math.min(1, (currentPullback - 0.05) / 0.22));
      }
      if (backdrop.glassMat) {
        backdrop.glassMat.opacity = Math.max(0, Math.min(1, (currentPullback - 0.08) / 0.28)) * 0.14;
      }

      // Fade Garage header & bike cards smoothly in once the bikes enter frame
      if (garageHudEls && garageHudEls.length) {
        const hudAlpha = Math.max(0, Math.min(1, (currentPullback - 0.48) / 0.38));
        for (let i = 0; i < garageHudEls.length; i++) {
          garageHudEls[i].style.opacity = hudAlpha.toFixed(3);
        }
      }

      projectCornerWindowRect(w, h);
      projectDirtShackSign(w, h);
    }

    function renderGarage(now) {
      if (!isInView || !isStageRevealed || document.hidden) {
        rafId = null;
        return;
      }
      rafId = requestAnimationFrame(renderGarage);

      const dt = Math.min((now - lastTime) * 0.001, 0.05);
      lastTime = now;

      updateCameraAndProjections(dt);

      // Advance shared rotation phase when not dragging; apply exact opposite-direction mirror sync
      if (activeDragSign === 0) {
        syncPhase += SYNC_SPIN_SPEED * dt + syncDragVel * dt;
        syncDragVel *= 0.92;
      }
      bikes[0].pivot.rotation.y = BASE_ANGLE + syncPhase;
      bikes[1].pivot.rotation.y = (Math.PI - BASE_ANGLE) - syncPhase;

      renderer.render(scene, camera);
    }

    // Compute initial window & wallpaper projections immediately on boot
    updateCameraAndProjections(0);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(renderGarage);
  };
})();
