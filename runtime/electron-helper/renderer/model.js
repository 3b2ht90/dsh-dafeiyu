        (function() {
            const CONFIG = {
                SWEPT_SLICES: 60,
                SWEPT_RINGS: 48,
                // 尾鳍（V形分叉 · 参照 deepseek logo · 水平展开）
                TAIL_FORK_SCALE: 0.177,
                TAIL_THICKNESS: 0.06,
                TAIL_OPEN_ANGLE_DEG: 76.95,
                TAIL_NOTCH_DX: 0.3,
                TAIL_NOTCH_DY: 0.5,
                TAIL_TILT_DEG: 50,
                // 背鳍（参照 deepseek logo 背部凸起轮廓）
                DORSAL_START_FRAC: 0.331,
                DORSAL_END_FRAC: 0.559,
                DORSAL_SAMPLES: 40,
                DORSAL_THICKNESS: 0.06,
                DORSAL_HEIGHT_SCALE: 0.3186,      // 保持不变
                DORSAL_SINK: 0.0,
                // 胸鳍（一对，参照 logo 腹部凸起轮廓）
                // 放大10%：0.84 -> 0.924，0.30 -> 0.33；已嵌入身体
                PEC_START_FRAC: 0.38,
                PEC_END_FRAC: 0.48,
                PEC_SPAN: 0.924,                  // 0.84 * 1.1
                PEC_SWEEP: 0.33,                  // 0.30 * 1.1
                PEC_THICKNESS: 0.05,
                PEC_ANGLE_DEG: 30,
                PEC_RADIAN: 130,
                PEC_SINK: 0.0,
                PEC_OUTWARD_OFFSET: -0.025,        // 嵌入身体半个厚度，根部贴合表面
                PEC_BACKWARD_OFFSET: 0.0,         // 保持不变
                BODY_TARGET_HEIGHT: 3.5,
                MODEL_SCALE: 0.5,                 // 宠物整体缩小到原尺寸 50%（原模型为网页观看做得太大）
                // 眼斑与眼球偏移（向前移动10，向上移动10）
                BROW_SCALE: 0.65,
                BROW_OFFSET_X: -35.4,
                BROW_OFFSET_Y: 6.0,
                BROW_LIFT: 0.9,
                EYE_OFFSET_Y: 10.5,
                EYE_RADIUS: 2.8,
                EYE_CIRCLE_SEGMENTS: 32,
                AUTO_ROTATE_SPEED: 1.6,
                FLOAT_AMPLITUDE: 0.06,
                FLOAT_SPEED: 1.2,
                COLOR_BODY_BLUE: 0x4D6BFE,
                COLOR_WHITE: 0xffffff,
            };
            // 虎鲸整体下移量(世界坐标 Y,负值向下):避开顶部状态卡片
            const WHALE_OFFSET_Y = -1.0;

            const PATH = 'M 144.00 80.00 C 144.67 84.83, 143.00 95.34, 141.00 102.00 C 139.00 108.66, 136.50 113.84, 132.00 120.00 C 127.50 126.16, 119.66 134.34, 114.00 139.00 C 108.34 143.66, 103.49 146.17, 98.00 148.00 C 92.51 149.83, 87.83 150.83, 81.00 150.00 C 74.17 149.17, 63.83 146.66, 57.00 143.00 C 50.17 139.34, 44.50 134.16, 40.00 128.00 C 35.50 121.84, 31.83 113.16, 30.00 106.00 C 28.17 98.84, 28.17 90.99, 29.00 85.00 C 29.83 79.01, 32.17 74.50, 35.00 70.00 C 37.83 65.50, 41.67 61.00, 46.00 58.00 C 50.33 55.00, 56.01 53.00, 61.00 52.00 C 66.00 51.00, 70.51 51.00, 76.00 52.00 C 81.49 53.00, 85.34 52.34, 94.00 58.00 C 102.66 63.66, 120.84 83.50, 128.00 86.00 C 135.16 88.50, 134.34 74.00, 137.00 73.00 C 139.66 72.00, 143.33 75.17, 144.00 80.00 Z';

            function samplePathDense(d, stepsPerSegment = 50, totalResample = 800) {
                const toks = d.match(/[MLCZ]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi);
                let i = 0, x = 0, y = 0;
                const rawPts = [];
                const num = () => parseFloat(toks[i++]);
                const bez = (t, p0, p1, p2, p3) => {
                    const mt = 1 - t;
                    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
                };
                while (i < toks.length) {
                    const c = toks[i++].toUpperCase();
                    if (c === 'M' || c === 'L') {
                        x = num(); y = num(); rawPts.push({ x, y });
                    } else if (c === 'C') {
                        const c1x = num(), c1y = num(), c2x = num(), c2y = num(), ex = num(), ey = num();
                        for (let s = 1; s <= stepsPerSegment; s++) {
                            const t = s / stepsPerSegment;
                            rawPts.push({ x: bez(t, x, c1x, c2x, ex), y: bez(t, y, c1y, c2y, ey) });
                        }
                        x = ex; y = ey;
                    }
                }
                return catmullRomResample(rawPts, totalResample, true);
            }

            function catmullRomResample(points, targetCount, closed = true) {
                if (points.length < 2) return points;
                const n = points.length;
                const src = closed ? [...points, points[0], points[1], points[2]] : points;
                const len = closed ? n : n - 1;
                const arcLen = [0];
                for (let i = 1; i < src.length; i++) {
                    const dx = src[i].x - src[i - 1].x, dy = src[i].y - src[i - 1].y;
                    arcLen.push(arcLen[i - 1] + Math.sqrt(dx * dx + dy * dy));
                }
                const totalLen = arcLen[arcLen.length - 1];
                const result = [];
                for (let k = 0; k < targetCount; k++) {
                    const t = (k / targetCount) * totalLen;
                    let seg = 0;
                    while (seg < arcLen.length - 2 && arcLen[seg + 1] < t) seg++;
                    const segStart = arcLen[seg], segEnd = arcLen[seg + 1];
                    const localT = (segEnd - segStart) > 0 ? (t - segStart) / (segEnd - segStart) : 0;
                    const p0 = src[Math.max(0, seg - 1)], p1 = src[seg], p2 = src[seg + 1], p3 = src[Math.min(src.length - 1, seg + 2)];
                    const tt = localT, tt2 = tt * tt, tt3 = tt2 * tt;
                    const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * tt + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * tt3);
                    const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * tt + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * tt3);
                    result.push({ x, y });
                }
                return result;
            }

            const rawContour = samplePathDense(PATH, 50, 800);
            let cx = 0, cy = 0;
            rawContour.forEach(p => { cx += p.x; cy += p.y; });
            cx /= rawContour.length; cy /= rawContour.length;
            const pts = rawContour.map(p => ({ x: (p.x - cx) * 1.1, y: -(p.y - cy) }));
            if (THREE.ShapeUtils.isClockWise(pts.map(p => new THREE.Vector2(p.x, p.y)))) pts.reverse();

            function buildSwept(poly, nSlices = CONFIG.SWEPT_SLICES, nRings = CONFIG.SWEPT_RINGS) {
                let minX = 1e9, maxX = -1e9;
                let polyMinY = Infinity, polyMaxY = -Infinity;
                for (const p of poly) {
                    minX = Math.min(minX, p.x);
                    maxX = Math.max(maxX, p.x);
                    polyMinY = Math.min(polyMinY, p.y);
                    polyMaxY = Math.max(polyMaxY, p.y);
                }
                const totalX = maxX - minX, step = totalX / nSlices;
                const polyHeight = polyMaxY - polyMinY;
                const tailLiftAmount = 0.1 * polyHeight;
                const xs = [], midRaw = [], radRaw = [];
                let lastM = 0;
                for (let s = 0; s <= nSlices; s++) {
                    const x = minX + s * step;
                    let top = -Infinity, bot = Infinity;
                    for (let i = 0; i < poly.length; i++) {
                        const a = poly[i], b = poly[(i + 1) % poly.length];
                        if (Math.abs(a.x - b.x) < 1e-9) continue;
                        if ((a.x - x) * (b.x - x) > 0) continue;
                        const y = a.y + (x - a.x) / (b.x - a.x) * (b.y - a.y);
                        if (y > top) top = y;
                        if (y < bot) bot = y;
                    }
                    let m, r;
                    if (isFinite(top) && isFinite(bot)) { m = (top + bot) / 2; r = (top - bot) / 2; if (r < 0) r = 0; lastM = m; }
                    else { m = lastM; r = 0; }
                    xs.push(x); midRaw.push(m); radRaw.push(Math.max(0, r));
                }
                function smoothGaussian(arr, sigma, iterations) {
                    const len = arr.length, half = Math.ceil(sigma * 3), kernel = [];
                    let sumK = 0;
                    for (let j = -half; j <= half; j++) { const val = Math.exp(-0.5 * (j / sigma) * (j / sigma)); kernel.push(val); sumK += val; }
                    for (let i = 0; i < kernel.length; i++) kernel[i] /= sumK;
                    let work = [...arr];
                    for (let iter = 0; iter < iterations; iter++) {
                        const temp = [...work];
                        for (let i = 0; i < len; i++) { let sum = 0; for (let j = -half; j <= half; j++) { const idx = Math.min(len - 1, Math.max(0, i + j)); sum += temp[idx] * kernel[j + half]; } work[i] = sum; }
                    }
                    return work;
                }
                function removeDents(arr, window = 10) {
                    const res = [...arr];
                    for (let i = 1; i < res.length - 1; i++) {
                        const left = Math.max(0, i - window), right = Math.min(res.length - 1, i + window);
                        let minNeighbor = Infinity;
                        for (let j = left; j <= right; j++) { if (j === i) continue; if (res[j] < minNeighbor) minNeighbor = res[j]; }
                        if (res[i] < minNeighbor) res[i] = minNeighbor;
                    }
                    return res;
                }
                function smoothstep(edge0, edge1, x) {
                    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
                    return t * t * (3 - 2 * t);
                }

                let radSmooth = smoothGaussian(radRaw, 3.0, 2);
                let midSmooth = smoothGaussian(midRaw, 2.0, 1);
                radSmooth = removeDents(radSmooth, 8);
                radSmooth = smoothGaussian(radSmooth, 1.5, 1);
                let maxIdx = 0, maxVal = 0;
                for (let i = 0; i < radSmooth.length; i++) { if (radSmooth[i] > maxVal) { maxVal = radSmooth[i]; maxIdx = i; } }
                for (let i = maxIdx - 1; i >= 0; i--) { if (radSmooth[i] > radSmooth[i + 1]) radSmooth[i] = radSmooth[i + 1]; }
                for (let i = maxIdx + 1; i < radSmooth.length; i++) { if (radSmooth[i] > radSmooth[i - 1]) radSmooth[i] = radSmooth[i - 1]; }
                const tailRatio = 0.14, headRatio = 0.11;
                const tailLen = totalX * tailRatio, headLen = totalX * headRatio;
                const tailEnd = xs.findIndex(x => x >= minX + tailLen);
                if (tailEnd > 2) { const rBody = radSmooth[tailEnd]; for (let i = 0; i <= tailEnd; i++) { const t = (xs[i] - minX) / tailLen; const ease = 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3); radSmooth[i] = Math.min(radSmooth[i], rBody * ease); } }
                const headStart = xs.findIndex(x => x >= maxX - headLen);
                if (headStart < nSlices - 2) { const rBody = radSmooth[headStart]; for (let i = headStart; i <= nSlices; i++) { const t = (maxX - xs[i]) / headLen; const ease = 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3); radSmooth[i] = Math.min(radSmooth[i], rBody * ease); } }
                radSmooth[0] = 0; radSmooth[nSlices] = 0;
                radSmooth = smoothGaussian(radSmooth, 1.2, 1); radSmooth[0] = 0; radSmooth[nSlices] = 0;

                const tailLiftStartFrac = 0.75;
                for (let i = 0; i <= nSlices; i++) {
                    const t = (xs[i] - minX) / totalX;
                    if (t > tailLiftStartFrac) {
                        const liftT = smoothstep(tailLiftStartFrac, 1.0, t);
                        midSmooth[i] += tailLiftAmount * liftT;
                    }
                }

                const pos = [];
                for (let s = 0; s <= nSlices; s++) { for (let k = 0; k < nRings; k++) { const th = (k / nRings) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th); pos.push(xs[s], midSmooth[s] + radSmooth[s] * c, radSmooth[s] * sn); } }
                const idx = [];
                for (let s = 0; s < nSlices; s++) { for (let k = 0; k < nRings; k++) { const k2 = (k + 1) % nRings; const a = s * nRings + k, b = s * nRings + k2, c2 = (s + 1) * nRings + k, d = (s + 1) * nRings + k2; idx.push(a, d, c2, a, b, d); } }
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                geo.setIndex(idx);
                geo.userData.swept = { xs, mid: midSmooth, rad: radSmooth };
                return geo;
            }

            const geo = buildSwept(pts);
            geo.computeVertexNormals(); geo.computeBoundingBox();
            const b = geo.boundingBox, size = b.getSize(new THREE.Vector3()), scale = CONFIG.BODY_TARGET_HEIGHT / size.y;
            geo.scale(scale, scale, scale);

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
            camera.position.set(3.6, 2.3, 5.4);
            const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setSize(innerWidth, innerHeight);
            renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
            renderer.shadowMap.enabled = false;
            renderer.setClearColor(0x000000, 0);
            renderer.toneMapping = THREE.NoToneMapping;
            document.getElementById('app').appendChild(renderer.domElement);

            // 鼠标旋转:右键拖动旋转视角(左键保留给窗口拖动,中键禁用)
            const controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.08;
            controls.autoRotate = false;
            controls.enableZoom = false;      // 锁死缩放：尺寸固定
            controls.enablePan = false;       // 禁用平移，避免虎鲸跑出视野
            controls.maxPolarAngle = Math.PI * 0.62;
            controls.minPolarAngle = Math.PI * 0.28;
            controls.mouseButtons.LEFT = null;   // 左键：窗口拖动
            controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE; // 右键：旋转
            controls.mouseButtons.MIDDLE = null;
            // 旋转中心保持在原点(虎鲸下移后仍绕它转,视角旋转不受影响)
            controls.target.set(0, 0, 0);
            window.__petResetView = function () { controls.reset(); };
            window.__petCam = camera; // 调试/测试用

            geo.computeBoundingBox();
            const bb = geo.boundingBox, sw = geo.userData.swept, nSw = sw.mid.length;
            const mrData = new Uint16Array(nSw * 2);
            for (let i = 0; i < nSw; i++) { mrData[i * 2] = THREE.DataUtils.toHalfFloat(sw.mid[i] * scale); mrData[i * 2 + 1] = THREE.DataUtils.toHalfFloat(sw.rad[i] * scale); }
            const mrTex = new THREE.DataTexture(mrData, nSw, 1, THREE.RGFormat, THREE.HalfFloatType);
            mrTex.minFilter = mrTex.magFilter = THREE.LinearFilter;
            mrTex.needsUpdate = true;

            // ==================== 皮肤系统 ====================
            const SKINS = {
                classic: { dark: 0x4D6BFE, white: 0xFFFFFF }, // 深寻蓝
                night:   { dark: 0x271F19, white: 0xFFF5E3 }, // 虎鲸黑
                pink:    { dark: 0xE85A8A, white: 0xFFE8F0 }, // 草莓粉
                green:   { dark: 0x2E9E6B, white: 0xE8FFF2 }, // 薄荷绿
                gold:    { dark: 0xC78B20, white: 0xFFF4D6 }, // 土豪金
            };
            let currentSkinName = 'classic';
            let currentSkin = { dark: CONFIG.COLOR_BODY_BLUE, white: CONFIG.COLOR_WHITE };
            (function () {
                try { currentSkinName = localStorage.getItem('pet_skin') || 'classic'; } catch (e) {}
                if (!SKINS[currentSkinName]) currentSkinName = 'classic';
                currentSkin = { ...SKINS[currentSkinName] };
            })();

            const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
            material.extensions = { derivatives: true };
            let bodyUniforms = null; // 皮肤切换用：身体 shader 的 uDark/uWhite
            material.onBeforeCompile = (sh) => {
                sh.uniforms.uMR = { value: mrTex };
                sh.uniforms.uMin = { value: bb.min.x };
                sh.uniforms.uMax = { value: bb.max.x };
                sh.uniforms.uDark = { value: new THREE.Color(currentSkin.dark) };
                sh.uniforms.uWhite = { value: new THREE.Color(currentSkin.white) };
                bodyUniforms = sh.uniforms;
                sh.vertexShader = sh.vertexShader
                    .replace('#include <common>', '#include <common>\nvarying vec3 vPos;')
                    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPos = position;');
                sh.fragmentShader = sh.fragmentShader
                    .replace('#include <common>', '#include <common>\nvarying vec3 vPos;\nuniform sampler2D uMR;\nuniform float uMin, uMax;\nuniform vec3 uDark;\nuniform vec3 uWhite;')
                    .replace('#include <color_fragment>', `#include <color_fragment>
                    {
                        float u = clamp((vPos.x - uMin) / (uMax - uMin), 0.0, 1.0);
                        float midY = texture2D(uMR, vec2(u, 0.5)).r;
                        float ang = 3.14159265 - abs(atan(vPos.z, vPos.y - midY));
                        float baseScale = 0.77 * 1.1;
                        float uCenter = 0.28, uHalf = 0.245 * baseScale, angMax = 0.84 * baseScale;
                        float headFactor = 1.0 - smoothstep(0.18, 0.52, u);
                        float angMaxAdjusted = angMax * (1.0 + 0.7 * headFactor);
                        float uu = (0.16 + 0.49 * u - uCenter) / uHalf;
                        float nn = ang / angMaxAdjusted;
                        float rr = uu * uu + nn * nn;
                        float tailZone = smoothstep(0.40, 0.58, u) * (1.0 - smoothstep(0.80, 0.86, u));
                        float peak = 0.78, bumpWidth = 0.11, bumpStrength = 1.0;
                        float d = nn - peak;
                        float bump = tailZone * bumpStrength * exp(-d*d / (bumpWidth*bumpWidth));
                        float threshold = 1.0 + bump;
                        float aa = fwidth(rr) * 1.2 + 2e-4;
                        float a = 1.0 - smoothstep(threshold - aa, threshold + aa, rr);
                        diffuseColor.rgb = mix(uDark, uWhite, a);
                    }`);
            };
            const model = new THREE.Mesh(geo, material);
            // 整体缩小到 50%（作为桌宠不需要网页那么大的尺寸）；父分组缩放不影响 model 自身的浮动/旋转/呼吸
            const petGroup = new THREE.Group();
            petGroup.scale.setScalar(CONFIG.MODEL_SCALE);
            petGroup.position.y = WHALE_OFFSET_Y; // 虎鲸下移,避开顶部状态卡片
            petGroup.add(model);
            scene.add(petGroup);

            // ==================== 眼斑与眼球（已调整偏移） ====================
            const BROW_PATH = 'M 146.00 127.00 C 144.34 128.00, 138.50 129.50, 136.00 129.00 C 133.50 128.50, 131.83 126.33, 131.00 124.00 C 130.17 121.67, 131.67 117.16, 131.00 115.00 C 130.33 112.84, 128.33 111.67, 127.00 111.00 C 125.67 110.33, 124.00 111.33, 123.00 111.00 C 122.00 110.67, 121.17 109.83, 121.00 109.00 C 120.83 108.17, 120.50 106.67, 122.00 106.00 C 123.50 105.33, 127.84 104.67, 130.00 105.00 C 132.16 105.33, 133.00 106.17, 135.00 108.00 C 137.00 109.83, 140.17 113.50, 142.00 116.00 C 143.83 118.50, 145.33 121.17, 146.00 123.00 C 146.67 124.83, 147.66 126.00, 146.00 127.00 Z';
            function sampleBrowPath(d, steps = 40) { 
                const toks = d.match(/[MLCZ]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi);
                let i = 0, x = 0, y = 0; const pts = [];
                const num = () => parseFloat(toks[i++]);
                const bez = (t, p0, p1, p2, p3) => { const mt = 1 - t; return mt*mt*mt*p0 + 3*mt*mt*t*p1 + 3*mt*t*t*p2 + t*t*t*p3; };
                while (i < toks.length) { const c = toks[i++].toUpperCase(); if (c==='M'||c==='L') { x=num(); y=num(); pts.push({x,y}); } else if (c==='C') { const c1x=num(),c1y=num(),c2x=num(),c2y=num(),ex=num(),ey=num(); for (let s=1;s<=steps;s++) { const t=s/steps; pts.push({x:bez(t,x,c1x,c2x,ex), y:bez(t,y,c1y,c2y,ey)}); } x=ex; y=ey; } }
                return pts;
            }
            const browSvg = sampleBrowPath(BROW_PATH, 40);
            function mapBrowToSurface(p, body) { 
                const xsArr=body.xs, midArr=body.mid, radArr=body.rad;
                const px = (p.x-cx)*CONFIG.BROW_SCALE+CONFIG.BROW_OFFSET_X;
                const py = -(p.y-cy)*CONFIG.BROW_SCALE+CONFIG.BROW_OFFSET_Y;
                const n=xsArr.length; let s;
                if(px<=xsArr[0]) s=0; else if(px>=xsArr[n-1]) s=n-1;
                else { let i=0; while(i<n-1&&xsArr[i+1]<px) i++; s=i+(px-xsArr[i])/Math.max(1e-9, xsArr[i+1]-xsArr[i]); }
                const i0=Math.min(Math.floor(s),n-1), i1=Math.min(i0+1,n-1);
                const t=s-i0;
                const m=midArr[i0]*(1-t)+midArr[i1]*t;
                const r=Math.max(0,radArr[i0]*(1-t)+radArr[i1]*t);
                const cosTh=r>1e-6?Math.max(-1,Math.min(1,(py-m)/r)):1;
                const sinTh=Math.sqrt(Math.max(0,1-cosTh*cosTh));
                const dx=Math.max(1e-9,xsArr[i1]-xsArr[i0]);
                const dr=(radArr[i1]-radArr[i0])/dx, dm=(midArr[i1]-midArr[i0])/dx;
                const nx=-(dr+dm*cosTh), ny=cosTh, nz=sinTh;
                const len=Math.hypot(nx,ny,nz)||1;
                return { x:px+nx/len*CONFIG.BROW_LIFT, y:m+r*cosTh+ny/len*CONFIG.BROW_LIFT, z:r*sinTh+nz/len*CONFIG.BROW_LIFT };
            }
            function buildBrowMesh(flip) { 
                const contour = browSvg.map(p=>new THREE.Vector2((p.x-cx)*CONFIG.BROW_SCALE+CONFIG.BROW_OFFSET_X, -(p.y-cy)*CONFIG.BROW_SCALE+CONFIG.BROW_OFFSET_Y));
                const tri = THREE.ShapeUtils.triangulateShape(contour, []);
                const pos=[], idx=[];
                const swept=geo.userData.swept;
                for(const p of browSvg) { const sp=mapBrowToSurface(p,swept); pos.push(sp.x,sp.y,sp.z); }
                for(const t of tri) idx.push(t[0],t[1],t[2]);
                const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setIndex(idx);
                if(flip) { const arr=g.attributes.position.array; for(let i=2;i<arr.length;i+=3) arr[i]=-arr[i]; }
                g.scale(scale,scale,scale); return g;
            }
            const browMat = new THREE.MeshBasicMaterial({ color:CONFIG.COLOR_WHITE, side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 });
            const browGroup = new THREE.Group();
            browGroup.add(new THREE.Mesh(buildBrowMesh(false), browMat));
            browGroup.add(new THREE.Mesh(buildBrowMesh(true), browMat));
            model.add(browGroup);

            // 眼球
            const dentPoint = browSvg.reduce((prev,curr)=>(curr.y<prev.y?curr:prev), browSvg[0]);
            const eyeCenterX = dentPoint.x-2, eyeCenterY = dentPoint.y+CONFIG.EYE_OFFSET_Y;
            const circlePoints = [];
            for(let i=0;i<CONFIG.EYE_CIRCLE_SEGMENTS;i++) { const angle=(i/CONFIG.EYE_CIRCLE_SEGMENTS)*Math.PI*2; circlePoints.push({x:eyeCenterX+CONFIG.EYE_RADIUS*Math.cos(angle), y:eyeCenterY+CONFIG.EYE_RADIUS*Math.sin(angle)}); }
            function buildEyeMesh(flip) {
                const swept = geo.userData.swept;
                const raw = circlePoints.map(p => mapBrowToSurface(p, swept));
                const contour = circlePoints.map(p => new THREE.Vector2((p.x - cx) * CONFIG.BROW_SCALE + CONFIG.BROW_OFFSET_X, -(p.y - cy) * CONFIG.BROW_SCALE + CONFIG.BROW_OFFSET_Y));
                const tri = THREE.ShapeUtils.triangulateShape(contour, []);
                const verts = raw.map(v => new THREE.Vector3(v.x * scale, v.y * scale, v.z * scale));
                if (flip) for (const v of verts) v.z = -v.z;
                let cx0 = 0, cy0 = 0, cz0 = 0;
                for (const v of verts) { cx0 += v.x; cy0 += v.y; cz0 += v.z; }
                cx0 /= verts.length; cy0 /= verts.length; cz0 /= verts.length;
                const pos = [], idx = [];
                for (const v of verts) pos.push(v.x - cx0, v.y - cy0, v.z - cz0);
                for (const t of tri) idx.push(t[0], t[1], t[2]);
                const g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                g.setIndex(idx);
                return { geom: g, center: new THREE.Vector3(cx0, cy0, cz0) };
            }
            const eyeMat = new THREE.MeshBasicMaterial({ color:CONFIG.COLOR_WHITE, side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-3 });
            const eyeGroup = new THREE.Group();
            const eyePivots = [];
            for (const flip of [false, true]) {
                const { geom, center } = buildEyeMesh(flip);
                const pivot = new THREE.Group();
                pivot.position.copy(center);
                pivot.add(new THREE.Mesh(geom, eyeMat));
                eyeGroup.add(pivot);
                eyePivots.push(pivot);
            }
            model.add(eyeGroup);

            // ==================== 尾鳍（保持不变） ====================
            const TAIL_PATH = "M 17.902 4.103 L 22.379 9.998 C 22.435 9.614, 22.507 9.073, 22.499 8.762 C 22.494 8.572, 22.538 8.499, 22.755 8.477 C 23.354 8.408, 23.935 8.244, 24.469 7.950 C 26.019 7.104, 26.644 5.713, 26.791 4.047 C 26.813 3.792, 26.787 3.529, 26.517 3.395 C 26.235 3.257, 26.114 3.520, 25.949 3.653 C 25.892 3.697, 25.845 3.753, 25.797 3.805 C 25.385 4.245, 24.903 4.534, 24.274 4.500 C 23.354 4.448, 22.568 4.737, 21.873 5.441 C 21.726 4.573, 21.235 4.055, 20.489 3.723 C 20.099 3.551, 19.703 3.377, 19.430 3.002 C 19.239 2.735, 19.186 2.437, 19.091 2.143 C 19.030 1.966, 18.970 1.785, 18.766 1.754 C 18.544 1.720, 18.457 1.905, 18.370 2.061 C 18.023 2.695, 17.889 3.395, 17.902 4.103 Z";
            const TAIL_NOTCH = { x: 21.873, y: 5.441 };
            function sampleTailPath(d, samples=80) { 
                const toks = d.match(/[MLCZ]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi);
                let i=0,x=0,y=0; const pts=[];
                const num=()=>parseFloat(toks[i++]);
                const bez=(t,p0,p1,p2,p3)=>{const mt=1-t; return mt*mt*mt*p0+3*mt*mt*t*p1+3*mt*t*t*p2+t*t*t*p3;};
                while(i<toks.length){const c=toks[i++].toUpperCase(); if(c==='M'||c==='L'){x=num();y=num();pts.push({x,y});}else if(c==='C'){const c1x=num(),c1y=num(),c2x=num(),c2y=num(),ex=num(),ey=num(); for(let s=1;s<=samples;s++){const t=s/samples; pts.push({x:bez(t,x,c1x,c2x,ex), y:bez(t,y,c1y,c2y,ey)});} x=ex; y=ey;}}
                if(pts.length>0) pts.push({x:pts[0].x, y:pts[0].y});
                return pts;
            }
            const tailSvgPts = sampleTailPath(TAIL_PATH, 60);
            const bodySwept = geo.userData.swept;
            const bodyTipX = bodySwept.xs[bodySwept.xs.length-1]*scale;
            const bodyTipY = bodySwept.mid[bodySwept.mid.length-1]*scale;
            const openAng = CONFIG.TAIL_OPEN_ANGLE_DEG * Math.PI / 180;
            const oc = Math.cos(openAng), os = Math.sin(openAng);
            const finPts = tailSvgPts.map(p => {
                const lx = (p.x - TAIL_NOTCH.x) * CONFIG.TAIL_FORK_SCALE;
                const ly = -(p.y - TAIL_NOTCH.y) * CONFIG.TAIL_FORK_SCALE;
                return { x: lx * oc + ly * os, z: -lx * os + ly * oc };
            });

            function extractLeftHalf(pts) {
                const n = pts.length;
                const crossings = [];
                for (let i = 0; i < n; i++) {
                    const a = pts[i], b = pts[(i+1)%n];
                    if ((a.z < 0 && b.z >= 0) || (a.z >= 0 && b.z < 0)) {
                        const t = a.z / (a.z - b.z);
                        const x = a.x + t * (b.x - a.x);
                        crossings.push({ index: i, point: { x, z: 0 } });
                    }
                }
                if (crossings.length < 2) return null;
                const c1 = crossings[0], c2 = crossings[1];
                const startIdx = c1.index, endIdx = c2.index;
                const half = [c1.point];
                if (endIdx >= startIdx) {
                    for (let i = startIdx + 1; i <= endIdx; i++) half.push(pts[i % n]);
                } else {
                    for (let i = startIdx + 1; i < n; i++) half.push(pts[i]);
                    for (let i = 0; i <= endIdx; i++) half.push(pts[i]);
                }
                half.push(c2.point);
                let avgZ = 0; for (const p of half) avgZ += p.z; avgZ /= half.length;
                if (avgZ > 0) {
                    half.length = 0;
                    half.push(c2.point);
                    if (endIdx + 1 < startIdx) {
                        for (let i = endIdx + 1; i <= startIdx; i++) half.push(pts[i % n]);
                    } else {
                        for (let i = endIdx + 1; i < n; i++) half.push(pts[i]);
                        for (let i = 0; i <= startIdx; i++) half.push(pts[i]);
                    }
                    half.push(c1.point);
                }
                return half;
            }

            function buildLeafGeometry(contour2D, thickness) {
                const N = contour2D.length;
                const h = thickness / 2;
                const shapePts = contour2D.map(p => new THREE.Vector2(p.x, p.z));
                const tri = THREE.ShapeUtils.triangulateShape(shapePts, []);
                const pos = [];
                for (const p of contour2D) pos.push(p.x, h, p.z);
                for (const p of contour2D) pos.push(p.x, -h, p.z);
                const idx = [];
                for (const t of tri) idx.push(t[0], t[1], t[2]);
                for (const t of tri) idx.push(N + t[0], N + t[2], N + t[1]);
                for (let i = 0; i < N; i++) {
                    const a = i, b = (i + 1) % N;
                    idx.push(a, b, N + b, a, N + b, N + a);
                }
                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                geom.setIndex(idx);
                geom.computeVertexNormals();
                return geom;
            }

            const tailMat = new THREE.MeshBasicMaterial({ color: CONFIG.COLOR_BODY_BLUE, side: THREE.DoubleSide });
            const tailGroup = new THREE.Group();
            const leftHalf = extractLeftHalf(finPts);
            if (leftHalf && leftHalf.length > 2) {
                const closedLeft = [...leftHalf, { x: leftHalf[0].x, z: leftHalf[0].z }];
                const leftGeom = buildLeafGeometry(closedLeft, CONFIG.TAIL_THICKNESS);
                tailGroup.add(new THREE.Mesh(leftGeom, tailMat));
                const rightMesh = new THREE.Mesh(leftGeom.clone(), tailMat);
                rightMesh.scale.z = -1;
                tailGroup.add(rightMesh);
            } else {
                console.warn('尾鳍半边提取失败，使用原始轮廓');
                const shapePts = finPts.map(p => new THREE.Vector2(p.x, p.z));
                const tri = THREE.ShapeUtils.triangulateShape(shapePts, []);
                const N = finPts.length;
                const h = CONFIG.TAIL_THICKNESS / 2;
                const pos = [];
                for (const p of finPts) pos.push(p.x, h, p.z);
                for (const p of finPts) pos.push(p.x, -h, p.z);
                const idx = [];
                for (const t of tri) idx.push(t[0], t[1], t[2]);
                for (const t of tri) idx.push(N + t[0], N + t[2], N + t[1]);
                for (let i = 0; i < N; i++) {
                    const a = i, b = (i + 1) % N;
                    idx.push(a, b, N + b, a, N + b, N + a);
                }
                const fallbackGeom = new THREE.BufferGeometry();
                fallbackGeom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                fallbackGeom.setIndex(idx);
                fallbackGeom.computeVertexNormals();
                tailGroup.add(new THREE.Mesh(fallbackGeom, tailMat));
            }

            model.add(tailGroup);
            tailGroup.position.set(bodyTipX + CONFIG.TAIL_NOTCH_DX, bodyTipY + CONFIG.TAIL_NOTCH_DY, 0);
            tailGroup.rotation.z = CONFIG.TAIL_TILT_DEG * Math.PI / 180;

            // ==================== 背鳍（参照 deepseek logo） + 胸鳍（一对） ====================
            function sampleSvgPath(d, samples = 40) {
                const toks = d.match(/[MLCZ]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi);
                let i = 0, x = 0, y = 0; const pts = [];
                const num = () => parseFloat(toks[i++]);
                const bez = (t, p0, p1, p2, p3) => { const mt = 1 - t; return mt*mt*mt*p0 + 3*mt*mt*t*p1 + 3*mt*t*t*p2 + t*t*t*p3; };
                while (i < toks.length) { const c = toks[i++].toUpperCase(); if (c === 'M' || c === 'L') { x = num(); y = num(); pts.push({x,y}); } else if (c === 'C') { const c1x=num(),c1y=num(),c2x=num(),c2y=num(),ex=num(),ey=num(); for (let s=1;s<=samples;s++) { const t=s/samples; pts.push({x:bez(t,x,c1x,c2x,ex), y:bez(t,y,c1y,c2y,ey)}); } x=ex; y=ey; } }
                if (pts.length > 0) pts.push({ x: pts[0].x, y: pts[0].y });
                return pts;
            }
            function extrudePolygon3D(points2D, thickness, origin, axisX, axisY) {
                const N = points2D.length, h = thickness / 2;
                const axisZ = new THREE.Vector3().crossVectors(axisX, axisY).normalize();
                const tri = THREE.ShapeUtils.triangulateShape(points2D.map(p => new THREE.Vector2(p.x, p.y)), []);
                const pos = [];
                for (const p of points2D) { const v = new THREE.Vector3().copy(origin).addScaledVector(axisX, p.x).addScaledVector(axisY, p.y).addScaledVector(axisZ, h); pos.push(v.x, v.y, v.z); }
                for (const p of points2D) { const v = new THREE.Vector3().copy(origin).addScaledVector(axisX, p.x).addScaledVector(axisY, p.y).addScaledVector(axisZ, -h); pos.push(v.x, v.y, v.z); }
                const idx = [];
                for (const t of tri) idx.push(t[0], t[1], t[2]);
                for (const t of tri) idx.push(N + t[0], N + t[2], N + t[1]);
                for (let i = 0; i < N; i++) { const j = (i + 1) % N; idx.push(i, j, N + j, i, N + j, N + i); }
                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                geom.setIndex(idx);
                geom.computeVertexNormals();
                return geom;
            }
            function backSurfaceAt(frac) {
                const xsArr = bodySwept.xs, midArr = bodySwept.mid, radArr = bodySwept.rad;
                const totalX = xsArr[xsArr.length - 1] - xsArr[0];
                const x = xsArr[0] + totalX * frac;
                let idx = 0; while (idx < xsArr.length - 1 && xsArr[idx + 1] < x) idx++;
                const t = (x - xsArr[idx]) / (xsArr[idx + 1] - xsArr[idx] || 1);
                const mid = midArr[idx] * (1 - t) + midArr[idx + 1] * t;
                const rad = radArr[idx] * (1 - t) + radArr[idx + 1] * t;
                return { x: x * scale, top: (mid + rad) * scale, mid: mid * scale, rad: rad * scale };
            }

            // —— 背鳍：logo 背部凸起的精确轮廓 ——
            const DORSAL_PATH = "M 10.436 2.993 L 13.852 4.746 C 12.758 3.684, 13.995 2.812, 14.282 2.708 C 14.581 2.600, 14.386 2.229, 13.418 2.233 C 12.450 2.237, 11.565 2.562, 10.436 2.993 Z";
            const DORSAL_BL = 10.436, DORSAL_BR = 13.852;
            const dorsalSvg = sampleSvgPath(DORSAL_PATH, CONFIG.DORSAL_SAMPLES);
            const by0 = backSurfaceAt(CONFIG.DORSAL_START_FRAC).top, by1 = backSurfaceAt(CONFIG.DORSAL_END_FRAC).top;
            const dorsalPts = dorsalSvg.map(p => {
                const u = (p.x - DORSAL_BL) / (DORSAL_BR - DORSAL_BL);
                const baseY = 2.993 + u * (4.746 - 2.993);
                const h = Math.max(0, (baseY - p.y) * CONFIG.DORSAL_HEIGHT_SCALE);
                const frac = CONFIG.DORSAL_START_FRAC + u * (CONFIG.DORSAL_END_FRAC - CONFIG.DORSAL_START_FRAC);
                const xsArr = bodySwept.xs;
                const px = (xsArr[0] + (xsArr[xsArr.length - 1] - xsArr[0]) * frac) * scale;
                const py = by0 + u * (by1 - by0) - CONFIG.DORSAL_SINK + h;
                return { x: px, y: py };
            });
            const dorsalMat = new THREE.MeshBasicMaterial({ color: CONFIG.COLOR_BODY_BLUE, side: THREE.DoubleSide });
            const dorsalFin = new THREE.Mesh(extrudePolygon3D(dorsalPts, CONFIG.DORSAL_THICKNESS, new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)), dorsalMat);
            model.add(dorsalFin);

            // —— 胸鳍：logo 腹部凸起的轮廓，左右对称各一（包在 pivot 中以便摆动） ——
            const PEC_PATH = "M 16.747 19.267 L 20.614 19.565 C 20.093 19.673, 19.421 19.772, 18.722 19.707 C 17.815 19.630, 17.268 19.526, 16.747 19.267 Z";
            const PEC_BL = 16.747, PEC_BR = 20.614, PEC_DROP = 0.288;
            const pecSvg = sampleSvgPath(PEC_PATH, 30);
            const pecMat = new THREE.MeshBasicMaterial({ color: CONFIG.COLOR_BODY_BLUE, side: THREE.DoubleSide });
            const pecAngle = CONFIG.PEC_RADIAN * Math.PI / 180;
            const pecFins = [];
            for (const side of [1, -1]) {
                const s0 = backSurfaceAt(CONFIG.PEC_START_FRAC), s1 = backSurfaceAt(CONFIG.PEC_END_FRAC);
                const r0 = s0.rad - CONFIG.PEC_SINK, r1 = s1.rad - CONFIG.PEC_SINK;
                // 应用向外偏移（无向后偏移，由分数定位）
                const Rh = new THREE.Vector3(
                    s0.x + CONFIG.PEC_BACKWARD_OFFSET,
                    s0.mid + r0 * Math.cos(pecAngle),
                    side * (r0 * Math.sin(pecAngle) + CONFIG.PEC_OUTWARD_OFFSET)
                );
                const Rt = new THREE.Vector3(
                    s1.x + CONFIG.PEC_BACKWARD_OFFSET,
                    s1.mid + r1 * Math.cos(pecAngle),
                    side * (r1 * Math.sin(pecAngle) + CONFIG.PEC_OUTWARD_OFFSET)
                );
                const rootLen = Rh.distanceTo(Rt);
                const axisX = new THREE.Vector3().subVectors(Rt, Rh).normalize();
                const outRaw = new THREE.Vector3(0, -Math.sin(CONFIG.PEC_ANGLE_DEG * Math.PI / 180), side * Math.cos(CONFIG.PEC_ANGLE_DEG * Math.PI / 180));
                const axisY = outRaw.clone().addScaledVector(axisX, -outRaw.dot(axisX)).normalize();
                const pec2D = pecSvg.map(p => {
                    const u = (p.x - PEC_BL) / (PEC_BR - PEC_BL);
                    const baseY = 19.267 + u * (19.565 - 19.267);
                    const w = Math.max(0, (p.y - baseY) / PEC_DROP);
                    return { x: u * rootLen + w * CONFIG.PEC_SWEEP, y: w * CONFIG.PEC_SPAN };
                });
                // 几何体直接用 axisX/axisY 定向（原点置于根部）；pivot 只做平移，保持单位旋转，
                // 这样 pivot.rotation.x 是绕身体纵轴（世界 X 轴）的上下划水，而非绕根-梢轴拧转（参考 wave.html）
                const finMesh = new THREE.Mesh(extrudePolygon3D(pec2D, CONFIG.PEC_THICKNESS, new THREE.Vector3(0, 0, 0), axisX, axisY), pecMat);
                const pivot = new THREE.Group();
                pivot.position.copy(Rh);
                pivot.add(finMesh);
                model.add(pivot);
                pecFins.push(pivot);
            }

            console.log('胸鳍已放大10%并接入身体，现包在 pivot 中支持摆动。');

            // 收集鳍/眼材质，按颜色分深色/浅色两组；身体 shader 由 bodyUniforms 单独处理
            const darkMats = [], whiteMats = [];
            model.traverse(m => {
                if (!m.isMesh || !m.material || m.material === material) return;
                const c = m.material.color;
                if (!c) return;
                if (c.getHex() === 0xffffff) whiteMats.push(m.material);
                else darkMats.push(m.material);
            });
            function applySkin(dark, white) {
                currentSkin = { dark, white };
                if (bodyUniforms) {
                    bodyUniforms.uDark.value.set(dark);
                    bodyUniforms.uWhite.value.set(white);
                }
                darkMats.forEach(m => m.color.set(dark));
                whiteMats.forEach(m => m.color.set(white));
            }
            function setSkin(name) {
                if (name === 'custom') {
                    currentSkinName = 'custom';
                    let c = null;
                    try { c = JSON.parse(localStorage.getItem('pet_skin_custom') || 'null'); } catch (e) {}
                    if (c && typeof c.dark === 'number' && typeof c.white === 'number') applySkin(c.dark, c.white);
                    else applySkin(SKINS.classic.dark, SKINS.classic.white);
                } else {
                    if (!SKINS[name]) name = 'classic';
                    currentSkinName = name;
                    applySkin(SKINS[name].dark, SKINS[name].white);
                }
                try { localStorage.setItem('pet_skin', currentSkinName); } catch (e) {}
            }
            function setCustomSkin(darkHex, whiteHex) {
                const d = new THREE.Color(darkHex), w = new THREE.Color(whiteHex);
                currentSkinName = 'custom';
                applySkin(d.getHex(), w.getHex());
                try {
                    localStorage.setItem('pet_skin', 'custom');
                    localStorage.setItem('pet_skin_custom', JSON.stringify({ dark: currentSkin.dark, white: currentSkin.white }));
                } catch (e) {}
            }
            setSkin(currentSkinName); // 启动时应用已保存的皮肤
            window.__petSetSkin = setSkin;
            window.__petSetCustomSkin = setCustomSkin;

            window.addEventListener('resize', () => {
                camera.aspect = innerWidth / innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(innerWidth, innerHeight);
            });
            // ==================== 情绪系统 ====================
            // 摆动幅度（身体 roll/yaw/pitch、尾鳍 yaw/pitch、胸鳍）分开调，尾鳍幅度刻意做小以防穿模
            const MOODS = {
                idle:          { speed: 1.6, floatAmp: 0.06, floatSpeed: 1.2, breath: 0.02, bodySway: 0.035, bodyYaw: 0.030, bodyPitch: 0.015, tailYaw: 0.080, tailPitch: 0.045, pecFlap: 0.18 },
                working:       { speed: 3.4, floatAmp: 0.10, floatSpeed: 2.4, breath: 0.05, bodySway: 0.060, bodyYaw: 0.055, bodyPitch: 0.028, tailYaw: 0.150, tailPitch: 0.085, pecFlap: 0.28 },
                'needs-input': { speed: 0.8, floatAmp: 0.03, floatSpeed: 0.6, breath: 0.01, bodySway: 0.018, bodyYaw: 0.015, bodyPitch: 0.008, tailYaw: 0.040, tailPitch: 0.022, pecFlap: 0.10 },
                ready:         { speed: 2.6, floatAmp: 0.14, floatSpeed: 3.0, breath: 0.06, bodySway: 0.045, bodyYaw: 0.040, bodyPitch: 0.020, tailYaw: 0.120, tailPitch: 0.070, pecFlap: 0.24 },
                blocked:       { speed: 0.5, floatAmp: 0.04, floatSpeed: 0.8, breath: 0.015, bodySway: 0.010, bodyYaw: 0.008, bodyPitch: 0.005, tailYaw: 0.020, tailPitch: 0.012, pecFlap: 0.06 },
            };
            let currentMood = 'idle';
            let moodTarget = MOODS.idle;
            const moodState = { speed: 1.6, floatAmp: 0.06, floatSpeed: 1.2, breath: 0.02, bodySway: 0.035, bodyYaw: 0.030, bodyPitch: 0.015, tailYaw: 0.080, tailPitch: 0.045, pecFlap: 0.18 };
            const TAIL_BASE_Z = CONFIG.TAIL_TILT_DEG * Math.PI / 180;
            const BASE_SWIM_HZ = 0.9; // 基础游动频率（参考 wave.html，温和游动）
            function setMood(name) {
                if (MOODS[name]) { currentMood = name; moodTarget = MOODS[name]; }
            }

            // ==================== 互动加速：悬停 / 单击 → 用力游 ====================
            let hoverActive = false, clickBoost = 0, danceLevel = 0; // danceLevel: 音乐频谱驱动（温和）
            let beatPulse = 0, spinRemaining = 0, spinAngle = 0; // 节拍脉冲 / 转圈角度
            let danceFreq = 0.7; // 用户设定的跳舞强度 0-1（0=关闭，1=最强）
            (function () { try { const v = parseFloat(localStorage.getItem('pet_dance_freq')); if (isFinite(v)) danceFreq = Math.max(0, Math.min(1, v)); } catch (e) {} })();
            let isSleeping = false; // 睡眠状态（闭眼 + 动作减幅）
            document.documentElement.addEventListener('mouseenter', () => { hoverActive = true; });
            document.documentElement.addEventListener('mouseleave', () => { hoverActive = false; });
            window.addEventListener('click', () => { clickBoost = 1; });

            // 眨眼曲线：快速闭合（短促线性），缓慢睁开（缓入）
            function blinkCurve(p) {
                const c = 0.10, o = 0.42;
                if (p < c) { const u = p / c; return 1 - u; }
                if (p < c + o) { const u = (p - c) / o; return u * u; }
                return 1;
            }

            const clock = new THREE.Clock();
            let blinkPhase = Math.random();
            let prevT = 0;

            // 跳舞音符粒子（从头顶冒出，CSS 动画上飘淡出）
            function spawnNote() {
                const chars = ['♪', '♫', '♩', '♬'];
                const note = document.createElement('div');
                note.className = 'pet-note';
                note.textContent = chars[Math.floor(Math.random() * chars.length)];
                note.style.setProperty('--dx', ((Math.random() - 0.5) * 56).toFixed(0) + 'px');
                const app = document.getElementById('app');
                if (app) app.appendChild(note);
                note.addEventListener('animationend', () => { note.remove(); });
            }
            function animate() {
                requestAnimationFrame(animate);
                const t = clock.getElapsedTime();
                const dt = Math.min(t - prevT, 0.1); prevT = t;
                const rate = 0.04;
                moodState.speed += (moodTarget.speed - moodState.speed) * rate;
                moodState.floatAmp += (moodTarget.floatAmp - moodState.floatAmp) * rate;
                moodState.floatSpeed += (moodTarget.floatSpeed - moodState.floatSpeed) * rate;
                moodState.breath += (moodTarget.breath - moodState.breath) * rate;
                moodState.bodySway += (moodTarget.bodySway - moodState.bodySway) * rate;
                moodState.bodyYaw += (moodTarget.bodyYaw - moodState.bodyYaw) * rate;
                moodState.bodyPitch += (moodTarget.bodyPitch - moodState.bodyPitch) * rate;
                moodState.tailYaw += (moodTarget.tailYaw - moodState.tailYaw) * rate;
                moodState.tailPitch += (moodTarget.tailPitch - moodState.tailPitch) * rate;
                moodState.pecFlap += (moodTarget.pecFlap - moodState.pecFlap) * rate;
                clickBoost += (0 - clickBoost) * 0.02;
                danceLevel += (0 - danceLevel) * 0.06; // 音乐能量平滑
                beatPulse += (0 - beatPulse) * 0.12;   // 节拍脉冲快速衰减

                // 悬停/单击的 boost；音乐不再放大游动，只做小幅叠加偏移（参考 F:\works）
                const boost = Math.max(hoverActive ? 0.25 : 0, clickBoost);
                const d = danceLevel * danceFreq; // 有效跳舞强度（含用户频率设置）
                const sleepF = isSleeping ? 0.2 : 1; // 睡眠时动作减幅
                const fMul = 1 + 0.4 * boost;
                const aMul = 1 + 0.45 * boost;
                const w = BASE_SWIM_HZ * fMul * Math.PI * 2;

                // 转圈：节拍触发，偶尔整圈旋转
                if (spinRemaining > 0) {
                    const step = 9 * dt;
                    spinAngle += step;
                    spinRemaining -= step;
                    if (spinRemaining <= 0) {
                        spinAngle = Math.round(spinAngle / (Math.PI * 2)) * (Math.PI * 2);
                        spinRemaining = 0;
                    }
                }

                // 节拍包络（0→1→0），用于打拍子的弹跳/甩尾/扑腾
                const beatEnv = Math.sin(Math.min(1, beatPulse) * Math.PI);

                // —— 身体：roll(z) + yaw(y) + pitch(x)，yaw 叠加转圈 + 音乐小幅偏移 ——
                const roll = moodState.bodySway * aMul * sleepF;
                model.rotation.z = roll * (Math.sin(t * w) + 0.4 * Math.sin(t * w * 2 + 1.3)) + d * 0.05 * Math.sin(t * w * 2 + 1.0);
                const yaw = moodState.bodyYaw * aMul * sleepF;
                model.rotation.y = yaw * (Math.sin(t * w + 0.5) + 0.4 * Math.sin(t * w * 2 + 2.4)) + spinAngle + d * 0.04 * Math.sin(t * w * 1.5 + 0.5);
                const pitch = moodState.bodyPitch * aMul * sleepF;
                model.rotation.x = pitch * (Math.sin(t * w + 0.8) + 0.4 * Math.sin(t * w * 2 + 0.3));

                // —— 漂浮 + 呼吸 + 节拍弹跳（音乐小幅上浮） ——
                model.position.y = Math.sin(t * moodState.floatSpeed) * moodState.floatAmp * (1 + 0.3 * boost) * (isSleeping ? 0.5 : 1)
                    + beatEnv * 0.12 * beatPulse * danceFreq + d * 0.06;
                const s = 1 + Math.sin(t * moodState.floatSpeed * 1.6) * moodState.breath;
                model.scale.set(s, s, s);

                // —— 尾鳍：基准倾角固定 Z + 左右/上下摆 + 节拍甩尾 ——
                tailGroup.rotation.z = TAIL_BASE_Z;
                const ty = moodState.tailYaw * aMul * sleepF;
                tailGroup.rotation.y = ty * (Math.sin(t * w + 0.7) + 0.5 * Math.sin(t * w * 2 + 1.9))
                    + beatEnv * 0.06 * beatPulse * danceFreq;
                const tp = moodState.tailPitch * aMul * sleepF;
                tailGroup.rotation.x = tp * (Math.sin(t * w + 1.2) + 0.5 * Math.sin(t * w * 2 + 0.5));

                // —— 胸鳍：划水 + 节拍扑腾 ——
                const pf = moodState.pecFlap * aMul * sleepF;
                const pecVal = pf * (Math.sin(t * w + 0.6) + 0.5 * Math.sin(t * w * 2 + 1.8))
                    + beatEnv * 0.15 * beatPulse * danceFreq + d * 0.12 * sleepF;
                for (const piv of pecFins) piv.rotation.x = pecVal;

                // —— 眨眼 / 睡眠闭眼 ——
                if (isSleeping) {
                    for (const piv of eyePivots) piv.scale.y = 0.10;
                } else {
                    const blinkPeriod = 4.3 / (1 + 0.25 * boost);
                    const bp = ((t + blinkPhase) % blinkPeriod) / blinkPeriod;
                    const eyeOpen = 0.06 + 0.94 * blinkCurve(bp);
                    for (const piv of eyePivots) piv.scale.y = eyeOpen;
                }

                controls.update();
                renderer.render(scene, camera);
            }
            animate();
            window.__petSetMood = setMood;
            window.__petMood = function () { return currentMood; };
            window.__petSetDance = function (lvl) { danceLevel = Math.max(0, Math.min(1, Number(lvl) || 0)); };
            window.__petSetDanceFreq = function (v) {
                danceFreq = Math.max(0, Math.min(1, Number(v) || 0));
                try { localStorage.setItem('pet_dance_freq', danceFreq); } catch (e) {}
            };
            window.__petOnBeat = function () {
                if (danceFreq <= 0) return;
                beatPulse = 1;
                spawnNote();
                if (spinRemaining <= 0 && Math.random() < 0.2) spinRemaining = Math.PI * 2; // 约 20% 概率转圈
            };
            window.__petSetSleeping = function (on) { isSleeping = !!on; };
            window.__petHappy = function () { beatPulse = 1; }; // 投喂/爱心触发一次欢快扑腾
        })();
