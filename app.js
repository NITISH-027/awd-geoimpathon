/**
 * ============================================================================
 * HYDROSAFE AWD — APPLICATION ENGINE (app.js)
 * Irrigated vs. Rain-Fed Agriculture Mapping & Safe-AWD Scrollytelling Engine
 * ============================================================================
 */

(function () {
  'use strict';

  /* --------------------------------------------------------------------------
   * 1. CONFIGURATION & FRAME SPECIFICATIONS
   * -------------------------------------------------------------------------- */
  const CONFIG = {
    scene1Count: 115,
    scene6Count: 160,
    lerpFactor: 0.08,
    mapCenter: [10.7870, 79.1378],
    mapZoom: 9,
  };

  const totalFramesToLoad = CONFIG.scene1Count;
  const scene1Images = new Array(CONFIG.scene1Count);
  const scene6Images = new Array(CONFIG.scene6Count);

  let loadedCount = 0;
  let preloaderDismissed = false;
  let scene6LoadingStarted = false;

  // Scrubber state (1-indexed frame numbers in float for lerp)
  const scrubberState = {
    scene1Target: 0,
    scene1Current: 0,
    scene6Target: 0,
    scene6Current: 0,
    soilProgressTarget: 0,
    soilProgressCurrent: 0,
    manualSoilOverride: false,
  };

  /* --------------------------------------------------------------------------
   * 2. DOM REFERENCES
   * -------------------------------------------------------------------------- */
  const dom = {
    preloader: document.getElementById('preloader'),
    preloaderPercent: document.getElementById('preloader-percent'),
    preloaderBar: document.getElementById('preloader-bar'),
    preloaderDetail: document.getElementById('preloader-detail'),

    scene1Section: document.getElementById('scene-1'),
    canvasScene1: document.getElementById('canvas-scene1'),
    scene1FrameReadout: document.getElementById('scene1-frame-readout'),
    scene1OverlayEarly: document.getElementById('scene1-overlay-early'),
    scene1OverlayLate: document.getElementById('scene1-overlay-late'),
    scrollHint: document.getElementById('scroll-hint'),

    scene3Section: document.getElementById('scene-3'),
    soilWaterReadout: document.getElementById('soil-water-readout'),
    soilStateBadge: document.getElementById('soil-state-badge'),
    soilProgressBar: document.getElementById('soil-progress-bar'),
    paniManualScrub: document.getElementById('pani-manual-scrub'),
    paniScrubPct: document.getElementById('pani-scrub-pct'),
    svgSoilWaterRect: document.getElementById('svg-soil-water-rect'),
    svgSoilWaterLine: document.getElementById('svg-soil-water-line'),
    svgTubeWaterRect: document.getElementById('svg-tube-water-rect'),
    svgTubeMeniscus: document.getElementById('svg-tube-meniscus'),
    svgSurfaceCracks: document.getElementById('svg-surface-cracks'),
    svgWaterPointer: document.getElementById('svg-water-pointer'),
    svgPointerText: document.getElementById('svg-pointer-text'),

    stageButtons: document.querySelectorAll('.stage-btn'),
    awdDepthSlider: document.getElementById('awd-depth-slider'),
    awdDepthOutput: document.getElementById('awd-depth-output'),
    awdAdvisoryBox: document.getElementById('awd-advisory-box'),
    awdAdvisoryPill: document.getElementById('awd-advisory-pill'),
    awdMethaneStatus: document.getElementById('awd-methane-status'),
    awdAdvisoryText: document.getElementById('awd-advisory-text'),
    awdReplayBtn: document.getElementById('awd-replay-btn'),

    mapContainer: document.getElementById('ps34-map'),
    toggleSatellite: document.getElementById('toggle-satellite'),
    toggleNdvi: document.getElementById('toggle-ndvi'),
    toggleClassification: document.getElementById('toggle-classification'),
    ndviHud: document.getElementById('ndvi-spectral-hud'),

    scene6Section: document.getElementById('scene-6'),
    canvasScene6: document.getElementById('canvas-scene6'),
    scene6EndFade: document.getElementById('scene6-end-fade'),
    scene6FrameReadout: document.getElementById('scene6-frame-readout'),
    scene6OverlayEarly: document.getElementById('scene6-overlay-early'),
    protocolCard: document.getElementById('protocol-card'),
    copyProtocolBtn: document.getElementById('copy-protocol-btn'),
    copyBtnLabel: document.getElementById('copy-btn-label'),
    toast: document.getElementById('toast-notification'),
    hudNavLinks: document.querySelectorAll('.hud-nav-link'),
  };

  const ctx1 = dom.canvasScene1.getContext('2d');
  const ctx6 = dom.canvasScene6.getContext('2d');

  /* --------------------------------------------------------------------------
   * 3. MATH HELPERS & CANVAS COVER-FIT ENGINE
   * -------------------------------------------------------------------------- */
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function lerp(start, end, amt) {
    return start + (end - start) * amt;
  }

  function getScene1FramePath(i) {
    return 'assets/scene1/ezgif-frame-' + String(i).padStart(3, '0') + '.jpg';
  }

  function getScene6FramePath(i) {
    return 'assets/scene6/ezgif-frame-' + String(i).padStart(3, '0') + '.jpg';
  }

  function resizeCanvases() {
    // Keep desktop retina fidelity up to 2x; optimize mobile viewports at 1.25x for 3x fill-rate savings
    const isMobile = window.innerWidth <= 768;
    const maxDpr = isMobile ? 1.25 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const width = window.innerWidth;
    const height = window.innerHeight;

    [dom.canvasScene1, dom.canvasScene6].forEach((canvas) => {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    });

    // Redraw current frames immediately on resize
    drawFrameCover(ctx1, dom.canvasScene1, scene1Images[Math.round(scrubberState.scene1Current)], Math.round(scrubberState.scene1Current), 1);
    drawFrameCover(ctx6, dom.canvasScene6, scene6Images[Math.round(scrubberState.scene6Current)], Math.round(scrubberState.scene6Current), 6);
  }

  /**
   * Draws an Image onto a fullscreen <canvas> using CSS background-size: cover math.
   * Includes a procedural fallback renderer if an image is still loading or broken.
   */
  function drawFrameCover(ctx, canvas, img, frameIdx, sceneNum) {
    const cw = canvas.width;
    const ch = canvas.height;

    if (img && img.complete && img.naturalWidth > 0) {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const scale = Math.max(cw / iw, ch / ih);
      const sw = iw * scale;
      const sh = ih * scale;
      const dx = (cw - sw) * 0.5;
      const dy = (ch - sh) * 0.5;

      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, dx, dy, sw, sh);
    } else {
      // Procedural agricultural fallback backdrop if frame is unavailable
      const grad = ctx.createLinearGradient(0, 0, 0, ch);
      if (sceneNum === 1) {
        grad.addColorStop(0, '#07150f');
        grad.addColorStop(0.5, '#0b2419');
        grad.addColorStop(1, '#050b08');
      } else {
        grad.addColorStop(0, '#0a2216');
        grad.addColorStop(0.6, '#113824');
        grad.addColorStop(1, '#060d09');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cw, ch);
    }
  }

  /* --------------------------------------------------------------------------
   * 4. FRAME PRELOADER & BACKGROUND STREAM ENGINE
   * -------------------------------------------------------------------------- */
  function onFrameSettled() {
    loadedCount++;
    const pct = Math.min(100, Math.round((loadedCount / totalFramesToLoad) * 100));

    if (dom.preloaderPercent) {
      dom.preloaderPercent.textContent = String(pct);
    }
    if (dom.preloaderBar) {
      dom.preloaderBar.style.width = pct + '%';
    }
    if (dom.preloaderDetail) {
      dom.preloaderDetail.textContent =
        'Calibrating optical & hydrological frame sequences (' + loadedCount + ' / ' + totalFramesToLoad + ')';
    }

    // Draw first frames as soon as frame 1 arrives
    if (loadedCount === 1 || scene1Images[0]?.complete) {
      drawFrameCover(ctx1, dom.canvasScene1, scene1Images[0], 0, 1);
    }

    if (loadedCount >= totalFramesToLoad && !preloaderDismissed) {
      dismissPreloader();
    }
  }

  function preloadScene6InBackground() {
    if (scene6LoadingStarted) return;
    scene6LoadingStarted = true;

    // Stream Scene 6 frames in gentle idle batches of 10 so CPU/network remain completely free
    let idx = 1;
    function loadBatch() {
      const batchSize = 10;
      const end = Math.min(idx + batchSize, CONFIG.scene6Count + 1);
      for (let i = idx; i < end; i++) {
        const img = new Image();
        img.decoding = 'async';
        img.src = getScene6FramePath(i);
        scene6Images[i - 1] = img;
      }
      idx = end;
      if (idx <= CONFIG.scene6Count) {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(loadBatch);
        } else {
          setTimeout(loadBatch, 50);
        }
      } else {
        if (scene6Images[0]?.complete) {
          drawFrameCover(ctx6, dom.canvasScene6, scene6Images[0], 0, 6);
        }
      }
    }
    loadBatch();
  }

  function dismissPreloader() {
    if (preloaderDismissed) return;
    preloaderDismissed = true;

    drawFrameCover(ctx1, dom.canvasScene1, scene1Images[0], 0, 1);

    setTimeout(() => {
      dom.preloader.classList.add('is-loaded');
      // Quietly stream Scene 6 in the background during idle time
      setTimeout(preloadScene6InBackground, 300);
    }, 220);
  }

  function preloadAllFrames() {
    // Safety timeout in case of slow network so user is never blocked
    const safetyTimer = setTimeout(() => {
      if (!preloaderDismissed) {
        dismissPreloader();
      }
    }, 6000);

    // Preload Scene 1 frames (fast initial startup)
    for (let i = 1; i <= CONFIG.scene1Count; i++) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        onFrameSettled();
        if (loadedCount >= totalFramesToLoad) clearTimeout(safetyTimer);
      };
      img.onerror = onFrameSettled;
      img.src = getScene1FramePath(i);
      scene1Images[i - 1] = img;
    }
  }

  /* --------------------------------------------------------------------------
   * 5. SCROLL PROGRESS & LERP ANIMATION ENGINE
   * -------------------------------------------------------------------------- */
  function getSectionScrollProgress(sectionEl) {
    if (!sectionEl) return 0;
    const rect = sectionEl.getBoundingClientRect();
    const scrollableDistance = rect.height - window.innerHeight;
    if (scrollableDistance <= 0) {
      // Fallback when section isn't taller than viewport (e.g., mobile layout)
      const viewportProgress = (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
      return clamp(viewportProgress, 0, 1);
    }
    return clamp(-rect.top / scrollableDistance, 0, 1);
  }

  function handleScroll() {
    // 1. Scene 1 & 2 Progress (0 - 250vh)
    const progress1 = getSectionScrollProgress(dom.scene1Section);
    scrubberState.scene1Target = progress1 * (CONFIG.scene1Count - 1);

    // 0 - 35% scroll: Centered typography overlay: "This looks healthy. It isn't."
    if (progress1 >= 0 && progress1 <= 0.35) {
      dom.scene1OverlayEarly.classList.add('is-visible');
    } else {
      dom.scene1OverlayEarly.classList.remove('is-visible');
    }

    // 55 - 90% scroll: Frosted glass card overlay
    if (progress1 >= 0.55 && progress1 <= 0.90) {
      dom.scene1OverlayLate.classList.add('is-visible');
    } else {
      dom.scene1OverlayLate.classList.remove('is-visible');
    }

    // Fade scroll hint after 8% scroll
    if (dom.scrollHint) {
      dom.scrollHint.style.opacity = progress1 > 0.08 ? '0' : '1';
    }

    // 2. Scene 3 Progress (Interactive Soil Cross-Section: +5cm to -15cm)
    if (!scrubberState.manualSoilOverride) {
      const progress3 = getSectionScrollProgress(dom.scene3Section);
      scrubberState.soilProgressTarget = progress3;
    }

    // 3. Scene 6 Progress (Flourishing field 160 frames)
    const progress6 = getSectionScrollProgress(dom.scene6Section);
    scrubberState.scene6Target = progress6 * (CONFIG.scene6Count - 1);

    // Scene 6 Part 1: Clean Cinematic Headline (0% to 42% scroll)
    if (dom.scene6OverlayEarly) {
      if (progress6 >= 0.04 && progress6 <= 0.42) {
        dom.scene6OverlayEarly.classList.add('is-visible');
      } else {
        dom.scene6OverlayEarly.classList.remove('is-visible');
      }
    }

    // Scene 6 Part 2: Grand Finale Protocol Card (55% to 100% scroll climax)
    if (dom.protocolCard) {
      if (progress6 >= 0.55) {
        dom.protocolCard.classList.add('is-visible');
      } else {
        dom.protocolCard.classList.remove('is-visible');
      }
    }

    // 4. Update active top HUD navigation link
    updateActiveHudNav();

    // Trigger RAF tick on scroll
    requestTick();
  }

  function updateActiveHudNav() {
    const scrollMid = window.scrollY + window.innerHeight * 0.38;
    const sections = [
      { id: '1', el: dom.scene1Section },
      { id: '3', el: dom.scene3Section },
      { id: '4', el: document.getElementById('scene-4') },
      { id: '5', el: document.getElementById('scene-5') },
      { id: '6', el: dom.scene6Section },
    ];

    let currentId = '1';
    for (const s of sections) {
      if (s.el && scrollMid >= s.el.offsetTop) {
        currentId = s.id;
      }
    }

    dom.hudNavLinks.forEach((link) => {
      if (link.dataset.scene === currentId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  /* --------------------------------------------------------------------------
   * 6. SCENE 3: INTERACTIVE SOIL CROSS-SECTION & PANI PIPE RENDERER
   * -------------------------------------------------------------------------- */
  let lastRenderedWaterCm = -999;
  function renderSoilCrossSection(progress) {
    // Progress 0.0 -> +5.0 cm (y = 160)
    // Progress 0.25 -> 0.0 cm surface (y = 210)
    // Progress 1.0 -> -15.0 cm AWD threshold (y = 360)
    const waterCm = 5 - progress * 20; // +5.0 down to -15.0
    if (Math.abs(waterCm - lastRenderedWaterCm) < 0.04) return;
    lastRenderedWaterCm = waterCm;

    const waterY = 210 - waterCm * 10; // 1cm = 10px, 0cm is at y=210
    const formattedCm = (waterCm >= 0 ? '+' : '') + waterCm.toFixed(1) + ' cm';

    // Update SVG surrounding soil water table
    const soilRectHeight = Math.max(0, 480 - waterY);
    dom.svgSoilWaterRect.setAttribute('y', waterY.toFixed(1));
    dom.svgSoilWaterRect.setAttribute('height', soilRectHeight.toFixed(1));
    dom.svgSoilWaterLine.setAttribute('y1', waterY.toFixed(1));
    dom.svgSoilWaterLine.setAttribute('y2', waterY.toFixed(1));

    // Update water column clearly visible inside the perforated Pani tube
    const tubeWaterHeight = Math.max(10, 410 - waterY);
    dom.svgTubeWaterRect.setAttribute('y', waterY.toFixed(1));
    dom.svgTubeWaterRect.setAttribute('height', tubeWaterHeight.toFixed(1));
    dom.svgTubeMeniscus.setAttribute('cy', waterY.toFixed(1));

    // Move floating callout pointer with the tube meniscus
    dom.svgWaterPointer.setAttribute('transform', 'translate(0, ' + waterY.toFixed(1) + ')');
    dom.svgPointerText.textContent = 'TUBE LEVEL: ' + formattedCm;

    // Topsoil cracks & dry crust appear as water drops below 0 cm (progress > 0.25)
    const crackOpacity = clamp((progress - 0.25) / 0.45, 0, 1);
    dom.svgSurfaceCracks.setAttribute('opacity', crackOpacity.toFixed(2));

    // Telemetry card readouts
    dom.soilWaterReadout.textContent = formattedCm;
    dom.soilProgressBar.style.width = Math.round(progress * 100) + '%';

    if (!scrubberState.manualSoilOverride && dom.paniManualScrub) {
      dom.paniManualScrub.value = String(Math.round(progress * 100));
    }
    if (dom.paniScrubPct) {
      dom.paniScrubPct.textContent = Math.round(progress * 100) + '%';
    }

    // State badge updates
    if (waterCm > 0.2) {
      dom.soilStateBadge.textContent = 'SURFACE FLOODED (ANAEROBIC)';
      dom.soilStateBadge.className = 'state-badge state-badge--flooded';
    } else if (waterCm > -14.5) {
      dom.soilStateBadge.textContent = 'SURFACE CRACKED // ROOTS HYDRATED';
      dom.soilStateBadge.className = 'state-badge state-badge--aerated';
    } else {
      dom.soilStateBadge.textContent = '-15cm REACHED // RE-FLOOD TRIGGER';
      dom.soilStateBadge.className = 'state-badge state-badge--trigger';
    }
  }

  function initScene3Controls() {
    if (!dom.paniManualScrub) return;

    dom.paniManualScrub.addEventListener('input', (e) => {
      scrubberState.manualSoilOverride = true;
      const val = parseFloat(e.target.value) / 100;
      scrubberState.soilProgressTarget = clamp(val, 0, 1);
      requestTick();
    });

    // Release manual override if user scrolls significantly
    window.addEventListener(
      'wheel',
      () => {
        scrubberState.manualSoilOverride = false;
        requestTick();
      },
      { passive: true }
    );
  }

  /* --------------------------------------------------------------------------
   * 7. MAIN REQUESTANIMATIONFRAME LOOP (LERP 0.08 & IDLE SLEEP ENGINE)
   * -------------------------------------------------------------------------- */
  let lastDrawnFrame1 = -1;
  let lastDrawnFrame6 = -1;
  let isRafRunning = false;
  let isScene1Visible = true;
  let isScene6Visible = false;

  function requestTick() {
    if (!isRafRunning) {
      isRafRunning = true;
      requestAnimationFrame(tick);
    }
  }

  function initVisibilityObservers() {
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === dom.scene1Section) {
            isScene1Visible = entry.isIntersecting;
            if (isScene1Visible) requestTick();
          }
          if (entry.target === dom.scene6Section) {
            isScene6Visible = entry.isIntersecting;
            if (isScene6Visible) requestTick();
          }
        });
      },
      { threshold: 0.01 }
    );

    if (dom.scene1Section) observer.observe(dom.scene1Section);
    if (dom.scene6Section) observer.observe(dom.scene6Section);
  }

  function tick() {
    // Lerp Scene 1 frame
    scrubberState.scene1Current = lerp(
      scrubberState.scene1Current,
      scrubberState.scene1Target,
      CONFIG.lerpFactor
    );
    const frameIndex1 = clamp(Math.round(scrubberState.scene1Current), 0, CONFIG.scene1Count - 1);

    if (isScene1Visible && frameIndex1 !== lastDrawnFrame1) {
      drawFrameCover(ctx1, dom.canvasScene1, scene1Images[frameIndex1], frameIndex1, 1);
      if (dom.scene1FrameReadout) {
        dom.scene1FrameReadout.textContent =
          'FRAME ' + String(frameIndex1 + 1).padStart(3, '0') + ' / ' + CONFIG.scene1Count;
      }
      lastDrawnFrame1 = frameIndex1;
    }

    // Lerp Scene 6 frame
    scrubberState.scene6Current = lerp(
      scrubberState.scene6Current,
      scrubberState.scene6Target,
      CONFIG.lerpFactor
    );
    const frameIndex6 = clamp(Math.round(scrubberState.scene6Current), 0, CONFIG.scene6Count - 1);

    if (isScene6Visible && frameIndex6 !== lastDrawnFrame6) {
      drawFrameCover(ctx6, dom.canvasScene6, scene6Images[frameIndex6], frameIndex6, 6);
      if (dom.scene6FrameReadout) {
        dom.scene6FrameReadout.textContent =
          'FRAME ' + String(frameIndex6 + 1).padStart(3, '0') + ' / ' + CONFIG.scene6Count;
      }
      lastDrawnFrame6 = frameIndex6;
    }

    // Smooth cinematic fade over the end frames of Scene 6 (emerges alongside protocol card)
    if (dom.scene6EndFade && isScene6Visible) {
      const normalizedScene6 = scrubberState.scene6Current / (CONFIG.scene6Count - 1);
      const endFadeAlpha = clamp((normalizedScene6 - 0.48) / 0.42, 0, 0.90);
      dom.scene6EndFade.style.opacity = endFadeAlpha.toFixed(3);
    }

    // Lerp Scene 3 Soil Cross-Section water level
    scrubberState.soilProgressCurrent = lerp(
      scrubberState.soilProgressCurrent,
      scrubberState.soilProgressTarget,
      CONFIG.lerpFactor
    );
    renderSoilCrossSection(scrubberState.soilProgressCurrent);

    // Dynamic sleep: Pause RAF loop when motion settles to save CPU and battery
    const delta1 = Math.abs(scrubberState.scene1Current - scrubberState.scene1Target);
    const delta6 = Math.abs(scrubberState.scene6Current - scrubberState.scene6Target);
    const deltaSoil = Math.abs(scrubberState.soilProgressCurrent - scrubberState.soilProgressTarget);

    if (delta1 < 0.015 && delta6 < 0.015 && deltaSoil < 0.001) {
      scrubberState.scene1Current = scrubberState.scene1Target;
      scrubberState.scene6Current = scrubberState.scene6Target;
      scrubberState.soilProgressCurrent = scrubberState.soilProgressTarget;
      isRafRunning = false;
      return; // Sleep until user scrolls or touches controls
    }

    requestAnimationFrame(tick);
  }

  /* --------------------------------------------------------------------------
   * 8. SCENE 4: AWD DECISION ENGINE & REPLAY CONTROLLER
   * -------------------------------------------------------------------------- */
  const awdState = {
    stage: 'vegetative', // 'vegetative' | 'flowering' | 'ripening'
    depth: 2, // +5 down to -20 cm
    replayTimer: null,
  };

  function evaluateAwdDecision() {
    const { stage, depth } = awdState;
    const formattedDepth = (depth > 0 ? '+' : '') + depth + ' cm';
    dom.awdDepthOutput.textContent = formattedDepth;

    // Decision Rules per specification:
    // 1. If Flowering -> RED badge
    if (stage === 'flowering') {
      dom.awdAdvisoryBox.className = 'advisory-banner advisory-banner--red';
      dom.awdAdvisoryPill.className = 'advisory-pill advisory-pill--red';
      dom.awdAdvisoryPill.textContent = 'CRITICAL // ANTHESIS PROTECTION';
      dom.awdMethaneStatus.textContent = 'SENSITIVE FLOWERING WINDOW';
      dom.awdAdvisoryText.textContent =
        'CRITICAL: Anthesis window. Maintain continuous 2-5cm standing water to prevent spikelet sterility.';
      return;
    }

    // 2. If Vegetative & depth > -15cm -> GREEN badge
    if (stage === 'vegetative' && depth > -15) {
      dom.awdAdvisoryBox.className = 'advisory-banner advisory-banner--green';
      dom.awdAdvisoryPill.className = 'advisory-pill advisory-pill--green';
      dom.awdAdvisoryPill.textContent = 'SAFE // HOLD IRRIGATION';
      dom.awdMethaneStatus.textContent =
        depth <= 0 ? 'CH₄ FLUX: SUPPRESSED (-48%)' : 'PONDED // ALLOW NATURAL RECESSION';
      dom.awdAdvisoryText.textContent =
        'SAFE: Roots hydrated. Hold irrigation, save water.';
      return;
    }

    // 3. If Vegetative & depth <= -15cm -> AMBER badge
    if (stage === 'vegetative' && depth <= -15) {
      dom.awdAdvisoryBox.className = 'advisory-banner advisory-banner--amber';
      dom.awdAdvisoryPill.className = 'advisory-pill advisory-pill--amber';
      dom.awdAdvisoryPill.textContent = 'ACTION // IRRIGATION THRESHOLD';
      dom.awdMethaneStatus.textContent = 'SOIL AERATED // RE-FLOOD NOW';
      dom.awdAdvisoryText.textContent =
        'ACTION: Water reached -15cm threshold. Re-flood field to +5cm depth.';
      return;
    }

    // 4. Ripening Stage handling
    if (stage === 'ripening') {
      if (depth > -15) {
        dom.awdAdvisoryBox.className = 'advisory-banner advisory-banner--green';
        dom.awdAdvisoryPill.className = 'advisory-pill advisory-pill--green';
        dom.awdAdvisoryPill.textContent = 'SAFE // GRAIN FILLING & DRAINAGE';
        dom.awdMethaneStatus.textContent = 'CH₄ FLUX: MINIMAL';
        dom.awdAdvisoryText.textContent =
          'SAFE: Roots hydrated. Hold irrigation, save water. Drain field 14 days before harvest.';
      } else {
        dom.awdAdvisoryBox.className = 'advisory-banner advisory-banner--amber';
        dom.awdAdvisoryPill.className = 'advisory-pill advisory-pill--amber';
        dom.awdAdvisoryPill.textContent = 'ACTION // MOISTURE CHECK';
        dom.awdMethaneStatus.textContent = 'LATE RIPENING STAGE';
        dom.awdAdvisoryText.textContent =
          'ACTION: Water reached -15cm threshold. Apply light wetting if >14 days to harvest, else maintain terminal dry-down.';
      }
    }
  }

  function initScene4Engine() {
    // Stage selector buttons
    dom.stageButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        stopAwdReplay();
        dom.stageButtons.forEach((b) => {
          b.classList.remove('active');
          b.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-checked', 'true');
        awdState.stage = btn.dataset.stage;
        evaluateAwdDecision();
      });
    });

    // Water depth slider
    dom.awdDepthSlider.addEventListener('input', (e) => {
      stopAwdReplay();
      awdState.depth = parseInt(e.target.value, 10);
      evaluateAwdDecision();
    });

    // Replay Drying Cycle button
    dom.awdReplayBtn.addEventListener('click', () => {
      if (awdState.replayTimer) {
        stopAwdReplay();
        return;
      }

      // Switch to Vegetative stage to demonstrate full +5cm -> -16cm -> +5cm cycle
      dom.stageButtons.forEach((b) => {
        const isVeg = b.dataset.stage === 'vegetative';
        b.classList.toggle('active', isVeg);
        b.setAttribute('aria-checked', isVeg ? 'true' : 'false');
      });
      awdState.stage = 'vegetative';
      awdState.depth = 5;
      dom.awdDepthSlider.value = '5';
      evaluateAwdDecision();

      dom.awdReplayBtn.innerHTML = '<span class="replay-icon">■</span> Stop Replay';

      let direction = -1;
      awdState.replayTimer = setInterval(() => {
        awdState.depth += direction;
        if (awdState.depth <= -17) {
          direction = 5; // Rapid re-flood jump
        } else if (awdState.depth >= 5) {
          awdState.depth = 5;
          dom.awdDepthSlider.value = String(awdState.depth);
          evaluateAwdDecision();
          stopAwdReplay();
          return;
        }
        dom.awdDepthSlider.value = String(awdState.depth);
        evaluateAwdDecision();
      }, 240);
    });

    evaluateAwdDecision();
  }

  function stopAwdReplay() {
    if (awdState.replayTimer) {
      clearInterval(awdState.replayTimer);
      awdState.replayTimer = null;
      dom.awdReplayBtn.innerHTML = '<span class="replay-icon">↻</span> Replay Drying Cycle';
    }
  }

  /* --------------------------------------------------------------------------
   * 9. SCENE 5: GEOSPATIAL CLASSIFIER — PS 3.4 (LEAFLET.JS ENGINE)
   * -------------------------------------------------------------------------- */
  function initGeospatialClassifier() {
    if (typeof L === 'undefined' || !dom.mapContainer) return;

    const map = L.map('ps34-map', {
      center: CONFIG.mapCenter,
      zoom: CONFIG.mapZoom,
      scrollWheelZoom: false,
      zoomControl: true,
    });

    // Enable scroll wheel zoom only after user clicks inside map so page scrollytelling isn't hijacked
    map.on('click', () => {
      map.scrollWheelZoom.enable();
    });
    map.on('mouseout', () => {
      map.scrollWheelZoom.disable();
    });

    // High-Resolution Esri World Imagery Satellite Basemap
    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, Sentinel-2 L2A &amp; HydroSafe AWD',
        maxZoom: 17,
      }
    ).addTo(map);

    // Place names & reference boundaries overlay
    const labelsLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 17,
        opacity: 0.78,
      }
    ).addTo(map);

    // GeoJSON Vector Polygons for Problem Statement 3.4
    const ps34GeoJSON = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            zoneType: 'irrigated',
            tag: 'Canal-Irrigated Command (AWD Ready — 30% Water Savings Potential)',
            region: 'Grand Anicut / Vennar-Vettar Canal Command (Thanjavur, Tiruvarur, Mayiladuthurai)',
            ndviDrySeason: '0.74 (High Dry-Season Persistence)',
            ndmiMoisture: '+0.31 (Canal-Fed Subsoil Saturation)',
            chirpsDeficit: '-42% Rainfall Anomaly (Buffered by Mettur Release)',
            areaHa: '4.82 Lakh Hectares',
            fillColor: '#10b981',
            borderColor: '#34d399',
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [78.82, 10.88],
                [79.12, 11.06],
                [79.48, 11.18],
                [79.83, 11.14],
                [79.85, 10.76],
                [79.78, 10.38],
                [79.35, 10.36],
                [79.05, 10.62],
                [78.82, 10.88],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: {
            zoneType: 'rainfed',
            tag: 'Rain-Fed Agriculture (Vulnerable to Drought Stress)',
            region: 'Pudukkottai Uplands & Southern Dry Tracts (Aranthangi - Gandarvakottai Belt)',
            ndviDrySeason: '0.21 (Rapid Post-Monsoon Senescence)',
            ndmiMoisture: '-0.18 (Root-Zone Moisture Deficit)',
            chirpsDeficit: 'High Sensitivity to NE Monsoon Failure',
            areaHa: '1.94 Lakh Hectares',
            fillColor: '#f59e0b',
            borderColor: '#fbbf24',
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [78.58, 10.55],
                [79.02, 10.60],
                [79.28, 10.34],
                [79.18, 10.02],
                [78.72, 10.06],
                [78.52, 10.30],
                [78.58, 10.55],
              ],
            ],
          },
        },
      ],
    };

    const classificationLayer = L.geoJSON(ps34GeoJSON, {
      style: (feature) => ({
        color: feature.properties.borderColor,
        weight: 2.5,
        opacity: 0.95,
        fillColor: feature.properties.fillColor,
        fillOpacity: 0.34,
      }),
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        const badgeClass =
          p.zoneType === 'irrigated' ? 'popup-tag--irrigated' : 'popup-tag--rainfed';

        const popupHtml = `
          <div>
            <span class="popup-tag ${badgeClass}">${p.tag}</span>
            <h4 style="margin: 4px 0 6px; font-size: 0.95rem; color: #f0fdf4;">${p.region}</h4>
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.74rem; color: #a7f3d0; display: grid; gap: 3px;">
              <div><strong>Jan–Apr NDVI:</strong> ${p.ndviDrySeason}</div>
              <div><strong>NDMI Index:</strong> ${p.ndmiMoisture}</div>
              <div><strong>CHIRPS Signal:</strong> ${p.chirpsDeficit}</div>
              <div><strong>Mapped Extent:</strong> ${p.areaHa}</div>
            </div>
          </div>
        `;

        layer.bindPopup(popupHtml, { maxWidth: 320 });

        layer.on('mouseover', function () {
          this.setStyle({ weight: 4, fillOpacity: 0.52 });
        });
        layer.on('mouseout', function () {
          classificationLayer.resetStyle(this);
        });
      },
    }).addTo(map);

    // Open the Canal-Irrigated Command popup initially so the user immediately sees the PS 3.4 classification
    const allLayers = classificationLayer.getLayers();
    if (allLayers.length > 0) {
      allLayers[0].openPopup();
    }

    // Layer Toggle Controls: [Satellite Base], [Sentinel-2 NDVI View], [PS 3.4 Classification Overlay]
    let overlayVisible = true;

    dom.toggleSatellite.addEventListener('click', () => {
      dom.mapContainer.classList.remove('ndvi-mode-active');
      dom.toggleSatellite.classList.add('active');
      dom.toggleNdvi.classList.remove('active');
      if (dom.ndviHud) dom.ndviHud.hidden = true;
      if (!map.hasLayer(satelliteLayer)) {
        satelliteLayer.addTo(map);
      }
    });

    dom.toggleNdvi.addEventListener('click', () => {
      dom.mapContainer.classList.add('ndvi-mode-active');
      dom.toggleNdvi.classList.add('active');
      dom.toggleSatellite.classList.remove('active');
      if (dom.ndviHud) dom.ndviHud.hidden = false;
    });

    dom.toggleClassification.addEventListener('click', () => {
      overlayVisible = !overlayVisible;
      dom.toggleClassification.classList.toggle('active', overlayVisible);
      if (overlayVisible) {
        classificationLayer.addTo(map);
      } else {
        map.removeLayer(classificationLayer);
      }
    });

    // Ensure proper Leaflet sizing when scrolled into view
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            map.invalidateSize();
          }
        });
      },
      { threshold: 0.15 }
    );
    observer.observe(dom.mapContainer);

    window.addEventListener(
      'resize',
      () => {
        map.invalidateSize();
      },
      { passive: true }
    );
  }

  /* --------------------------------------------------------------------------
   * 10. SCENE 6: COPY FIELD PROTOCOL & TOAST NOTIFICATION
   * -------------------------------------------------------------------------- */
  const FIELD_PROTOCOL_TEXT = [
    'CLIMATE-SMART SAFE-AWD FIELD PROTOCOL (CAUVERY DELTA AGRO-ECOSYSTEM)',
    '====================================================================',
    '1. INSTALL THE ₹50 PERFORATED PANI PIPE (15 DAT):',
    '   Sink a 30cm PVC pipe (15cm diameter) 20cm deep into the paddy plot 15 days after transplanting, leaving 10cm above ground. Drill 0.5cm holes spaced 2cm apart across the bottom 20cm root zone.',
    '',
    '2. MONITOR THE -15cm THRESHOLD & RE-FLOOD TO +5cm:',
    '   Allow standing water to naturally recede until the water table visible inside the pipe drops to -15cm below the soil surface. Re-irrigate to +5cm standing depth and repeat throughout vegetative growth.',
    '',
    '3. HOLD CONTINUOUS STANDING WATER AT FLOWERING:',
    '   Maintain continuous 2-5cm standing water from 7 days before to 7 days after peak flowering (anthesis) to prevent spikelet sterility. Drain the field 14 days prior to harvest.',
    '',
    'VALIDATED IMPACT: Up to 30% Water Saved (IRRI) | 48% Methane Cut (IPCC) | 0% Yield Loss.',
    'Measure the water. Protect the harvest.',
  ].join('\n');

  let toastTimer = null;

  function showToast() {
    if (!dom.toast) return;
    dom.toast.classList.add('is-visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.toast.classList.remove('is-visible');
    }, 3600);
  }

  function initProtocolCopy() {
    if (!dom.copyProtocolBtn) return;

    dom.copyProtocolBtn.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(FIELD_PROTOCOL_TEXT);
        } else {
          const tempArea = document.createElement('textarea');
          tempArea.value = FIELD_PROTOCOL_TEXT;
          tempArea.style.position = 'fixed';
          tempArea.style.opacity = '0';
          document.body.appendChild(tempArea);
          tempArea.select();
          document.execCommand('copy');
          document.body.removeChild(tempArea);
        }
      } catch (_) {
        // Fallback succeeded or handled gracefully
      }

      if (dom.copyBtnLabel) {
        dom.copyBtnLabel.textContent = 'Copied to Clipboard ✓';
        setTimeout(() => {
          dom.copyBtnLabel.textContent = 'Copy Field Protocol';
        }, 2500);
      }
      showToast();
    });
  }

  /* --------------------------------------------------------------------------
   * 11. DUAL-LANGUAGE TOGGLE (TAMIL PRIMARY / ENGLISH SECONDARY)
   * -------------------------------------------------------------------------- */
  function initLanguageToggle() {
    const langBtns = document.querySelectorAll('.lang-btn');
    if (!langBtns.length) return;

    function applyLanguage(lang) {
      document.documentElement.setAttribute('data-lang', lang);
      try {
        localStorage.setItem('awd_pref_lang', lang);
      } catch (_) {}

      langBtns.forEach((btn) => {
        const isActive = btn.dataset.lang === lang;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }

    langBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        applyLanguage(btn.dataset.lang);
      });
    });

    // Default to Tamil (or load existing user preference)
    let savedLang = 'ta';
    try {
      savedLang = localStorage.getItem('awd_pref_lang') || 'ta';
    } catch (_) {}
    applyLanguage(savedLang);
  }

  /* --------------------------------------------------------------------------
   * 12. BOOTSTRAP APPLICATION
   * -------------------------------------------------------------------------- */
  function init() {
    resizeCanvases();
    window.addEventListener('resize', () => {
      resizeCanvases();
      requestTick();
    }, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });

    initLanguageToggle();
    initVisibilityObservers();
    preloadAllFrames();
    initScene3Controls();
    initScene4Engine();
    initGeospatialClassifier();
    initProtocolCopy();

    handleScroll();
    requestTick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
