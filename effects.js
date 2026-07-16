function submitContact(e) {
  e.preventDefault();
  var btn = e.target.querySelector('button[type="submit"]');
  btn.textContent = 'Sent ✓';
  btn.disabled = true;
  btn.style.opacity = '0.6';
  setTimeout(function() {
    btn.textContent = 'Send Message';
    btn.disabled = false;
    btn.style.opacity = '';
    e.target.reset();
  }, 3000);
}

/* ===== 3D / MOTION ENGINE =====
   Everything below computes its own transforms every animation frame in
   JavaScript (rotation matrices + backface-culled, lit perspective
   projection for the canvas scene; requestAnimationFrame-driven transform
   strings for the DOM elements; a real character-by-character typewriter
   for the terminal panel). CSS only holds static layout. */
(function () {
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isFinePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  var docHidden = false;
  document.addEventListener('visibilitychange', function () { docHidden = document.hidden; });

  var mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, nx: 0, ny: 0 };
  window.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.nx = (e.clientX / window.innerWidth) * 2 - 1;   // -1 .. 1
    mouse.ny = (e.clientY / window.innerHeight) * 2 - 1;  // -1 .. 1
  });

  /* ---------- tiny 3D math ---------- */
  function rotateXYZ(p, ax, ay, az) {
    var y1 = p.y * Math.cos(ax) - p.z * Math.sin(ax);
    var z1 = p.y * Math.sin(ax) + p.z * Math.cos(ax);
    var x1 = p.x;
    var x2 = x1 * Math.cos(ay) + z1 * Math.sin(ay);
    var z2 = -x1 * Math.sin(ay) + z1 * Math.cos(ay);
    var x3 = x2 * Math.cos(az) - y1 * Math.sin(az);
    var y3 = x2 * Math.sin(az) + y1 * Math.cos(az);
    return { x: x3, y: y3, z: z2 };
  }
  function project(p, focal, cx, cy) {
    var denom = focal + p.z;
    var scale = focal / (denom <= 1 ? 1 : denom);
    return { x: cx + p.x * scale, y: cy + p.y * scale, s: scale };
  }

  /* ---------- canvas scene: soft, lit glass blocks drifting past camera + a faint dot grid ---------- */
  function initScene() {
    var canvas = document.getElementById('warpCanvas');
    if (!canvas || reduceMotion) return;
    var ctx = canvas.getContext('2d');
    var W, H, DPR, CX, CY;
    var FOCAL = 380;
    var gridCanvas = document.createElement('canvas');
    var gridCtx = gridCanvas.getContext('2d');
    var GRID_PAD = 60;

    function buildGrid() {
      gridCanvas.width = (W + GRID_PAD * 2) * DPR;
      gridCanvas.height = (H + GRID_PAD * 2) * DPR;
      gridCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
      gridCtx.clearRect(0, 0, W + GRID_PAD * 2, H + GRID_PAD * 2);
      gridCtx.fillStyle = 'rgba(255,255,255,0.045)';
      var spacing = 46;
      for (var gx = 0; gx <= W + GRID_PAD * 2; gx += spacing) {
        for (var gy = 0; gy <= H + GRID_PAD * 2; gy += spacing) {
          gridCtx.beginPath();
          gridCtx.arc(gx, gy, 1.1, 0, Math.PI * 2);
          gridCtx.fill();
        }
      }
    }

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      CX = W / 2;
      CY = H * 0.34;
      buildGrid();
    }

    /* a small handful of translucent "item box" blocks, tumbling slowly */
    var LOCAL_NORMALS = {
      front: { x: 0, y: 0, z: 1 }, back: { x: 0, y: 0, z: -1 },
      right: { x: 1, y: 0, z: 0 }, left: { x: -1, y: 0, z: 0 },
      top: { x: 0, y: -1, z: 0 }, bottom: { x: 0, y: 1, z: 0 }
    };
    var FACE_KEYS = ['front', 'back', 'right', 'left', 'top', 'bottom'];

    function makeCube(z, size, speed, rgb) {
      var h = size / 2;
      var verts = [
        { x: -h, y: -h, z: -h }, { x: h, y: -h, z: -h }, { x: h, y: h, z: -h }, { x: -h, y: h, z: -h },
        { x: -h, y: -h, z: h }, { x: h, y: -h, z: h }, { x: h, y: h, z: h }, { x: -h, y: h, z: h }
      ];
      return {
        z: z, size: size, rgb: rgb,
        rx: Math.random() * Math.PI, ry: Math.random() * Math.PI, rz: Math.random() * 0.4,
        spin: speed, glowPhase: Math.random() * Math.PI * 2,
        driftX: (Math.random() - 0.5) * 480,
        driftY: (Math.random() - 0.5) * 200 - 30,
        verts: verts,
        faces: {
          front: [4, 5, 6, 7], back: [1, 0, 3, 2],
          right: [5, 1, 2, 6], left: [0, 4, 7, 3],
          top: [0, 1, 5, 4], bottom: [3, 7, 6, 2]
        }
      };
    }
    var cubes = [
      makeCube(1400, 92, 0.006, '136,146,248'),
      makeCube(2300, 118, -0.0045, '124,214,255'),
      makeCube(3100, 76, 0.008, '199,150,255')
    ];

    var raf = null;

    function frame(ts) {
      if (docHidden) { raf = requestAnimationFrame(frame); return; }
      ctx.clearRect(0, 0, W, H);
      ctx.shadowBlur = 0;

      var camYaw = mouse.nx * 0.08;
      var camPitch = mouse.ny * 0.04;
      var parX = -mouse.nx * 14;
      var parY = -mouse.ny * 10;
      ctx.drawImage(gridCanvas, -GRID_PAD + parX * 0.4, -GRID_PAD + parY * 0.4, W + GRID_PAD * 2, H + GRID_PAD * 2);

      for (var c = 0; c < cubes.length; c++) {
        var cube = cubes[c];
        cube.z -= 3.4;
        if (cube.z < -100) cube.z += 3600;
        cube.rx += cube.spin;
        cube.ry += cube.spin * 1.4;

        var world = [];
        var ok = true;
        for (var v = 0; v < cube.verts.length; v++) {
          var wp = rotateXYZ(cube.verts[v], cube.rx, cube.ry, cube.rz);
          wp = { x: wp.x + cube.driftX, y: wp.y + cube.driftY, z: wp.z + cube.z };
          wp = rotateXYZ(wp, camPitch, camYaw, 0);
          world.push(wp);
        }
        var proj = [];
        for (var p = 0; p < world.length; p++) {
          var pp = project(world[p], FOCAL, CX, CY);
          if (pp.s <= 0) { ok = false; break; }
          proj.push(pp);
        }
        if (!ok) continue;

        var depthFade = Math.max(0.1, Math.min(1, 1 - cube.z / 3300));
        var pulse = 0.7 + 0.3 * Math.sin((ts || 0) * 0.0012 + cube.glowPhase);

        /* build visible faces with simple directional lighting, then paint back-to-front */
        var drawList = [];
        for (var f = 0; f < FACE_KEYS.length; f++) {
          var key = FACE_KEYS[f];
          var n = LOCAL_NORMALS[key];
          var rn = rotateXYZ(n, cube.rx, cube.ry, cube.rz);
          rn = rotateXYZ(rn, camPitch, camYaw, 0);
          if (rn.z > -0.05) continue; // backface cull: only faces pointing toward the camera
          var brightness = Math.max(0.12, Math.min(1, -rn.z));
          var idx = cube.faces[key];
          var avgZ = (world[idx[0]].z + world[idx[1]].z + world[idx[2]].z + world[idx[3]].z) / 4;
          drawList.push({ idx: idx, brightness: brightness, avgZ: avgZ });
        }
        drawList.sort(function (a, b) { return b.avgZ - a.avgZ; }); // paint far faces first

        var brightest = null;
        for (var d = 0; d < drawList.length; d++) {
          var face = drawList[d];
          var fillA = (0.06 + face.brightness * 0.16) * depthFade;
          var edgeA = (0.22 + face.brightness * 0.4) * depthFade * pulse;
          ctx.beginPath();
          for (var q = 0; q < face.idx.length; q++) {
            var pt = proj[face.idx[q]];
            if (q === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(' + cube.rgb + ',' + fillA.toFixed(3) + ')';
          ctx.fill();
          ctx.shadowColor = 'rgba(' + cube.rgb + ',' + (0.5 * face.brightness * depthFade * pulse).toFixed(3) + ')';
          ctx.shadowBlur = 10 * face.brightness * pulse;
          ctx.strokeStyle = 'rgba(255,255,255,' + edgeA.toFixed(3) + ')';
          ctx.lineWidth = 1.1;
          ctx.stroke();
          ctx.shadowBlur = 0;
          if (!brightest || face.brightness > brightest.brightness) brightest = face;
        }

        /* a soft specular glint on the face facing the camera most directly */
        if (brightest && brightest.brightness > 0.5) {
          var gp = proj[brightest.idx[0]];
          var gc = proj[brightest.idx[2]];
          var hx = gp.x * 0.65 + gc.x * 0.35;
          var hy = gp.y * 0.65 + gc.y * 0.35;
          var glintR = Math.max(10, cube.size * 0.4 * (gp.s || 1));
          var glintA = 0.4 * (brightest.brightness - 0.5) * 2 * depthFade * pulse;
          var grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, glintR);
          grad.addColorStop(0, 'rgba(255,255,255,' + glintA.toFixed(3) + ')');
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(hx, hy, glintR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(frame);
  }

  /* ---------- soft cursor glow trailing the pointer ---------- */
  function initCursorGlow() {
    var glow = document.getElementById('cursorGlow');
    if (!glow || reduceMotion || !isFinePointer) return;
    var cx = mouse.x, cy = mouse.y;
    window.addEventListener('mousemove', function () { glow.style.opacity = '1'; });
    document.addEventListener('mouseleave', function () { glow.style.opacity = '0'; });
    (function loop() {
      cx += (mouse.x - cx) * 0.14;
      cy += (mouse.y - cy) * 0.14;
      glow.style.transform = 'translate(' + cx + 'px,' + cy + 'px) translate(-50%,-50%)';
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- continuous JS-driven drift + mouse parallax for real DOM elements ---------- */
  function initElementMotion() {
    if (reduceMotion) return;
    var targets = [];

    var stage = document.querySelector('.preview-stage');
    if (stage) {
      var d = stage.querySelector('.preview-desktop');
      var m = stage.querySelector('.preview-mobile');
      if (d) targets.push({ el: d, ampX: 6, ampY: 3.5, freq: 0.6, phase: 0, parX: 5, parY: 5, z: 0 });
      if (m) targets.push({ el: m, ampX: 8, ampY: 5, freq: 0.8, phase: 1.4, parX: 8, parY: 8, z: 34 });
    }
    var term = document.querySelector('.terminal-window');
    if (term) targets.push({ el: term, ampX: 1.6, ampY: 1, freq: 0.35, phase: 2.2, parX: 3, parY: 2, z: 0 });

    document.querySelectorAll('.feature').forEach(function (card, idx) {
      targets.push({ el: card, ampX: 2.4, ampY: 0, freq: 0.5 + idx * 0.07, phase: idx * 1.1, parX: 4, parY: 4, z: 0, bobPx: 4 });
    });

    if (!targets.length) return;

    var start = performance.now();
    function loop(now) {
      var t = (now - start) / 1000;
      for (var i = 0; i < targets.length; i++) {
        var tg = targets[i];
        var idleY = Math.sin(t * tg.freq + tg.phase) * tg.ampY;
        var idleX = Math.cos(t * tg.freq * 0.8 + tg.phase) * tg.ampX;
        var parY = isFinePointer ? mouse.ny * tg.parY : 0;
        var parX = isFinePointer ? mouse.nx * tg.parX : 0;
        var rotX = idleY * 0.4 - parY;
        var rotY = idleX * 0.4 + parX;
        var bob = tg.bobPx ? Math.sin(t * tg.freq * 1.3 + tg.phase) * tg.bobPx : 0;
        var z = tg.z || 0;
        tg.el.style.transform =
          'translateY(' + bob.toFixed(2) + 'px) translateZ(' + z + 'px) ' +
          'rotateX(' + rotX.toFixed(2) + 'deg) rotateY(' + rotY.toFixed(2) + 'deg)';
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  /* ---------- terminal panel: real character-by-character typewriter, looping ---------- */
  function initTerminal() {
    var lineEls = [
      document.getElementById('termLine0'),
      document.getElementById('termLine1'),
      document.getElementById('termLine2'),
      document.getElementById('termLine3')
    ];
    if (!lineEls[0]) return;

    var script = [
      { text: '$ ./connect --server mkwii-channel', cls: 'term-prompt' },
      { text: '\u2713 ctgp-r system: true', cls: 'term-ok' },
      { text: '\u2713 ctgp-r custom tracks loaded: 800+', cls: 'term-ok' },
      { text: '$ status: live_', cls: 'term-prompt' }
    ];

    function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }

    function renderInstant() {
      for (var i = 0; i < script.length; i++) {
        lineEls[i].className = 'terminal-line ' + script[i].cls;
        lineEls[i].textContent = script[i].text;
      }
    }

    if (reduceMotion) { renderInstant(); return; }

    async function typeLine(el, entry) {
      el.className = 'terminal-line ' + entry.cls;
      el.textContent = '';
      for (var i = 0; i < entry.text.length; i++) {
        el.textContent += entry.text.charAt(i);
        await wait(16 + Math.random() * 18);
      }
    }

    async function clearAll() {
      for (var i = 0; i < lineEls.length; i++) {
        lineEls[i].textContent = '';
        lineEls[i].className = 'terminal-line';
      }
    }

    async function runOnce() {
      for (var i = 0; i < script.length; i++) {
        await typeLine(lineEls[i], script[i]);
        await wait(i === script.length - 1 ? 0 : 220);
      }
      var cursor = document.createElement('span');
      cursor.className = 'term-cursor';
      cursor.textContent = '\u258c';
      lineEls[script.length - 1].appendChild(cursor);
    }

    async function loop() {
      while (true) {
        await runOnce();
        await wait(5200);
        await clearAll();
        await wait(400);
      }
    }
    loop();
  }

  /* ---------- button press ripple ---------- */
  function initRipples() {
    document.querySelectorAll('.cta-btn, .hero-cta').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        var r = document.createElement('span');
        r.classList.add('ripple');
        var rect = this.getBoundingClientRect();
        var size = Math.max(rect.width, rect.height);
        r.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + (e.clientX - rect.left - size / 2) +
          'px;top:' + (e.clientY - rect.top - size / 2) +
          'px;position:absolute;border-radius:50%;background:rgba(255,255,255,0.15);transform:scale(0);animation:ripple .5s linear;pointer-events:none;';
        this.appendChild(r);
        setTimeout(function () { r.remove(); }, 600);
      });
    });
  }

  function boot() {
    initScene();
    initCursorGlow();
    initElementMotion();
    initTerminal();
    initRipples();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
