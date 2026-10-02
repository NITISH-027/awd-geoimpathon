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
  let currentLang = 'ta';

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
      dom.soilStateBadge.textContent = currentLang === 'ta' ? 'மேற்பரப்பில் நீர் தேக்கம்' : 'SURFACE FLOODED (ANAEROBIC)';
      dom.soilStateBadge.className = 'state-badge state-badge--flooded';
    } else if (waterCm > -14.5) {
      dom.soilStateBadge.textContent = currentLang === 'ta' ? 'மேற்பரப்பு உலர்தல் // வேர் மண்டலத்தில் நல் ஈரப்பதம்' : 'SURFACE CRACKED // ROOTS HYDRATED';
      dom.soilStateBadge.className = 'state-badge state-badge--aerated';
    } else {
      dom.soilStateBadge.textContent = currentLang === 'ta' ? '-15 செ.மீ எட்டியது // மறுபாசனம் செய்யும் நேரம்' : '-15cm REACHED // RE-FLOOD TRIGGER';
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
      dom.awdAdvisoryPill.textContent = currentLang === 'ta' ? 'கவனம் // பூக்கும் பருவப் பாதுகாப்பு' : 'CRITICAL // ANTHESIS PROTECTION';
      dom.awdMethaneStatus.textContent = currentLang === 'ta' ? 'பூக்கும் மற்றும் பால் பிடிக்கும் பருவம்' : 'SENSITIVE FLOWERING WINDOW';
      dom.awdAdvisoryText.textContent = currentLang === 'ta'
        ? 'கவனம்: பூக்கும் & பால் பிடிக்கும் முக்கிய பருவம். தானியங்கள் பதராவதைத் தவிர்க்க வயலில் 2 முதல் 5 செ.மீ வரை நீர் தொடர்ந்து தேங்கி நிற்க வேண்டும்.'
        : 'CRITICAL: Anthesis window. Maintain continuous 2-5cm standing water to prevent spikelet sterility.';
      return;
    }

    // 2. If Vegetative & depth > -15cm -> GREEN badge
    if (stage === 'vegetative' && depth > -15) {
      dom.awdAdvisoryBox.className = 'advisory-banner advisory-banner--green';
      dom.awdAdvisoryPill.className = 'advisory-pill advisory-pill--green';
      dom.awdAdvisoryPill.textContent = currentLang === 'ta' ? 'பாதுகாப்பான ஈரப்பதம் // நீர் பாய்ச்ச வேண்டாம்' : 'SAFE // HOLD IRRIGATION';
      dom.awdMethaneStatus.textContent = currentLang === 'ta'
        ? (depth <= 0 ? 'மீத்தேன் வாயு உமிழ்வு கட்டுப்படுத்தப்பட்டது (-48%)' : 'நீர் வடியும் நிலை // இயற்கையாக வடிய விடவும்')
        : (depth <= 0 ? 'CH₄ FLUX: SUPPRESSED (-48%)' : 'PONDED // ALLOW NATURAL RECESSION');
      dom.awdAdvisoryText.textContent = currentLang === 'ta'
        ? 'பாதுகாப்பான நிலை: வேர் மண்டலத்தில் போதுமான ஈரப்பதம் உள்ளது. இப்போது பாசனம் செய்யத் தேவையில்லை; நீரும் மின்சாரமும் சேமிக்கப்படுகிறது.'
        : 'SAFE: Roots hydrated. Hold irrigation, save water.';
      return;
    }

    // 3. If Vegetative & depth <= -15cm -> AMBER badge
    if (stage === 'vegetative' && depth <= -15) {
      dom.awdAdvisoryBox.className = 'advisory-banner advisory-banner--amber';
      dom.awdAdvisoryPill.className = 'advisory-pill advisory-pill--amber';
      dom.awdAdvisoryPill.textContent = currentLang === 'ta' ? 'மறுபாசனம் செய்க // பாசன எல்லை எட்டியது' : 'ACTION // IRRIGATION THRESHOLD';
      dom.awdMethaneStatus.textContent = currentLang === 'ta' ? 'வேர் காற்றோட்டம் பெற்றது // மறுபாசனம் தேவை' : 'SOIL AERATED // RE-FLOOD NOW';
      dom.awdAdvisoryText.textContent = currentLang === 'ta'
        ? 'மறுபாசனம் செய்க: பாணி குழாய் நீர் மட்டம் -15 செ.மீ ஆழத்தை எட்டியது. உடனடியாக வயலுக்கு +5 செ.மீ வரை நீர் பாய்ச்சவும்.'
        : 'ACTION: Water reached -15cm threshold. Re-flood field to +5cm depth.';
      return;
    }

    // 4. Ripening Stage handling
    if (stage === 'ripening') {
      if (depth > -15) {
        dom.awdAdvisoryBox.className = 'advisory-banner advisory-banner--green';
        dom.awdAdvisoryPill.className = 'advisory-pill advisory-pill--green';
        dom.awdAdvisoryPill.textContent = currentLang === 'ta' ? 'பாதுகாப்பான நிலை // கதிர் முதிர்ச்சி மற்றும் வடித்தல்' : 'SAFE // GRAIN FILLING & DRAINAGE';
        dom.awdMethaneStatus.textContent = currentLang === 'ta' ? 'மீத்தேன் வாயு உமிழ்வு குறைவு' : 'CH₄ FLUX: MINIMAL';
        dom.awdAdvisoryText.textContent = currentLang === 'ta'
          ? 'பாதுகாப்பான நிலை: வேர் பகுதியில் போதிய ஈரப்பதம் உள்ளது. அறுவடைக்கு 14 நாட்களுக்கு முன்னதாக வயல் நீரை முழுமையாக வடிக்கவும்.'
          : 'SAFE: Roots hydrated. Hold irrigation, save water. Drain field 14 days before harvest.';
      } else {
        dom.awdAdvisoryBox.className = 'advisory-banner advisory-banner--amber';
        dom.awdAdvisoryPill.className = 'advisory-pill advisory-pill--amber';
        dom.awdAdvisoryPill.textContent = currentLang === 'ta' ? 'கள ஆய்வு // ஈரப்பதம் சரிபார்ப்பு' : 'ACTION // MOISTURE CHECK';
        dom.awdMethaneStatus.textContent = currentLang === 'ta' ? 'அறுவடைக்கு முந்தைய முதிர்ச்சிப் பருவம்' : 'LATE RIPENING STAGE';
        dom.awdAdvisoryText.textContent = currentLang === 'ta'
          ? 'கள ஆய்வு: நீர் மட்டம் -15 செ.மீ எட்டியது. அறுவடைக்கு 14 நாட்களுக்கு மேல் இருப்பின் லேசாக நீர் பாய்ச்சவும்; இல்லையேல் நிலத்தை முழுமையாக உலர விடவும்.'
          : 'ACTION: Water reached -15cm threshold. Apply light wetting if >14 days to harvest, else maintain terminal dry-down.';
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
  const FIELD_PROTOCOL_EN = [
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

  const FIELD_PROTOCOL_TA = [
    'காய்ச்சலும் பாய்ச்சலும் (AWD) கள நெறிமுறை - காவிரி டெல்டா',
    '====================================================================',
    '1. ₹50 துளையிடப்பட்ட பாணி குழாயை நடுதல் (நடவு செய்த 15-ம் நாள்):',
    '   30 செ.மீ நீளமும் 15 செ.மீ விட்டமும் கொண்ட பிவிசி பாணி குழாயை, நடவு நட்ட 15-ம் நாளில் 20 செ.மீ ஆழத்திற்கு வேர் மண்டலத்தில் புதைத்து, 10 செ.மீ பகுதி தரைக்கு மேல் தெரியுமாறு பொருத்தவும்.',
    '',
    '2. -15 செ.மீ நீர்மட்டத்தில் மறுபாசனம் (+5 செ.மீ வரை):',
    '   வயல் நீர் வடியத் துவங்கி, குழாயினுள் நீர் மட்டம் -15 செ.மீ வரை குறையும் வரை காத்திருக்கவும். அதன் பின் மீண்டும் +5 செ.மீ வரை நீர் பாய்ச்சவும்.',
    '',
    '3. பூக்கும் தருணத்தில் தொடர் நீர் தேக்குதல்:',
    '   பயிர் பூக்கும் பருவம் மற்றும் பால் பிடிக்கும் தருணத்தில் தொடர்ந்து 2–5 செ.மீ வரை நீர் தேக்கி வைக்கவும். அறுவடைக்கு 14 நாட்களுக்கு முன் நீரை முழுமையாக வடிக்கவும்.',
    '',
    'நிரூபிக்கப்பட்ட நன்மைகள்: 30% பாசன நீர் சேமிப்பு | 48% மீத்தேன் வாயு குறைப்பு | 100% முழு மகசூல் உறுதி.',
    'நீரை அளந்து பாய்ச்சுவோம்! பயிரையும் வளத்தையும் காப்போம்!',
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
      const textToCopy = currentLang === 'ta' ? FIELD_PROTOCOL_TA : FIELD_PROTOCOL_EN;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(textToCopy);
        } else {
          const tempArea = document.createElement('textarea');
          tempArea.value = textToCopy;
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
        dom.copyBtnLabel.textContent = currentLang === 'ta' ? 'நெறிமுறை நகலெடுக்கப்பட்டது ✓' : 'Copied to Clipboard ✓';
        setTimeout(() => {
          dom.copyBtnLabel.textContent = currentLang === 'ta' ? 'கள நெறிமுறையை நகலெடு' : 'Copy Field Protocol';
        }, 2500);
      }
      showToast();
    });
  }

  /* --------------------------------------------------------------------------
   * 11. DUAL-LANGUAGE I18N ENGINE (TAMIL PRIMARY / ENGLISH SECONDARY)
   * -------------------------------------------------------------------------- */
  const I18N = {
    en: {
      hudTitle: 'Cauvery Delta Agro-Hydrology',
      nav1: '01. The Lie',
      nav2: '02. ₹50 Pipe',
      nav3: '03. AWD Engine',
      nav4: '04. Satellite GIS',
      nav5: '05. Protocol',

      // Scene 1 Late
      scene1Alert: 'BIO-GEOCHEMICAL ALERT // CH₄ FLUX',
      scene1Gwp: 'GWP-20: 80x CO₂',
      scene1LateTitle: 'Beneath the Mirror Surface',
      scene1LateBody: 'A flooded paddy drowns its roots and brews methane (CH<sub>4</sub>) — a greenhouse gas <strong>80x worse than CO<sub>2</sub></strong> over 20 years. Flooding is weed management, not crop biology.',
      statRootO2: 'Root Zone O₂',
      statRootO2Val: 'Hypoxic (<0.5 mg/L)',
      statMethane: 'Methanogenesis',
      statMethaneVal: 'Active Anaerobic',
      statWaterNeed: 'True Water Need',
      statWaterNeedVal: 'Soil Moisture Only',

      // Scene 3
      scene3Title: 'The ₹50 Truth-Teller',
      scene3Quote: '“The surface lies. The tube doesn\'t.”',
      scene3Desc: 'A simple <strong>30 cm PVC Pani Pipe</strong>—with 10 cm protruding above the mud and 20 cm perforated inside the root zone—reveals the actual perched water table long after the surface dries and cracks.',
      liveWaterTable: 'LIVE TUBE WATER TABLE',
      badgeFlooded: 'SURFACE FLOODED',
      paniLabelPonded: '+5 cm (Ponded)',
      paniLabelSurface: '0 cm (Surface)',
      paniLabelAwd: '-15 cm (AWD Trigger)',
      specPipeLength: 'Total Pipe Length',
      specPipeLengthVal: '30 cm PVC (Ø 15 cm)',
      specAboveGround: 'Above Ground',
      specAboveGroundVal: '10 cm Collar',
      specRootPerforation: 'Root Zone Perforation',
      specRootPerforationVal: '20 cm (0.5 cm holes)',
      scrubLabel: 'Scroll page or drag to inspect water table drop:',

      // Scene 4
      scene4Title: 'Proof It Works: Safe AWD Simulator',
      scene4Desc: 'Test how crop growth stage and Pani pipe depth govern irrigation scheduling under International Rice Research Institute (IRRI) Safe-AWD guidelines.',
      decisionStatus: 'INTERACTIVE FIELD ADVISORY ENGINE',
      replayCycle: '↻ Replay Drying Cycle',
      selectStage: '1. Select Crop Phenology Stage',
      stageVeg: 'Vegetative Stage',
      stageFlowering: 'Flowering Window',
      stagePreHarvest: 'Ripening Stage',
      inspectDepth: '2. Pani Pipe Water Depth Reading',
      benchmarkTag: 'EMPIRICAL BENCHMARK // CONTINUOUS FLOODING VS SAFE AWD',
      validatedTitle: 'Validated Field Performance',
      metricWater: 'Water Saved',
      metricWaterNote: 'Reduces irrigation pump hours & canal drawdowns without root stress.',
      metricMethane: 'Methane Cut',
      metricMethaneNote: 'Periodic soil aeration halts methanogenic archaea activity in the rhizosphere.',
      metricYield: 'Yield Delta',
      metricYieldNote: 'Maintains 100% grain yield parity; oxygenating roots boosts productive tillering.',

      // Scene 5
      scene5Title: 'Irrigated vs. Rain-Fed Agriculture Classifier',
      scene5Desc: 'Interactive multi-temporal remote sensing map isolating canal-irrigated command zones (AWD deployment targets) from drought-vulnerable rain-fed tracts across the Cauvery Delta, Tamil Nadu.',
      satelliteBase: '[Satellite Base]',
      ndviView: '[Sentinel-2 NDVI View]',
      classificationOverlay: '[Agri-Classification Overlay]',
      gisLegendTitle: 'SPECTRAL CANOPY CLASSIFICATION',
      irrigatedZoneTitle: 'Irrigated Command Zone',
      irrigatedZoneSub: 'Thanjavur, Tiruvarur, Mayiladuthurai (AWD Ready — 30% Water Savings)',
      rainfedZoneTitle: 'Rain-Fed Uplands',
      rainfedZoneSub: 'Pudukkottai Southern Border (Vulnerable to Drought Stress)',
      gisHint: 'Click any polygon on the map to inspect spectral & hydrological telemetry.',
      methodologyTag: 'REMOTE SENSING METHODOLOGY // EARTH OBSERVATION PIPELINE',
      methodologyDesc: 'Remote Sensing Methodology: Multi-temporal Sentinel-2 NDVI/NDMI dry-season persistence (Jan-April) combined with CHIRPS rainfall deficit isolates canal-fed command zones from rain-fed tracts across Tamil Nadu\'s 21.58 lakh hectares.',

      // Scene 6
      scene6EarlyPill: 'The Proven Harvest',
      scene6EarlyTitle: 'From ₹50 Pipe to a<br /><span class="text-emerald-glow">Flourishing Delta</span>',
      scene6EarlySub: '30% less water extracted. 48% methane eliminated. 100% harvest yield preserved.',
      scene6ProtocolPill: 'Practical Field Protocol',
      scene6ProtocolTitle: 'Take Safe-AWD to the <span class="text-emerald-glow">Field</span>',
      scene6ProtocolSub: 'Three simple rules for Cauvery Delta cultivators to cut water use by 30% while protecting harvest yields.',
      step1Num: '01',
      step1Title: 'Install ₹50 Pani Pipe',
      step1Desc: 'Sink a 30 cm perforated PVC pipe 20 cm deep into root zone at 15 DAT, leaving 10 cm above mud.',
      step2Num: '02',
      step2Title: 'Re-Flood at -15 cm Depth',
      step2Desc: 'Let ponded water recede until tube reads <strong>-15 cm</strong>, then re-irrigate to <strong>+5 cm</strong>.',
      step3Num: '03',
      step3Title: 'Hold Water at Flowering',
      step3Desc: 'Maintain <strong>2–5 cm standing water</strong> during anthesis to protect grain set; drain 14 days before harvest.',
      scene6Quote: '“Measure the water. Protect the harvest.”',
      copyBtn: 'Copy Field Protocol',
      toastTitle: 'Field Protocol Copied to Clipboard',
      toastBody: 'Ready to share via WhatsApp, SMS, or extension dispatch.'
    },

    ta: {
      hudTitle: 'காவிரி டெல்டா நீர் மேலாண்மை',
      nav1: '01. நீரின் மாயை',
      nav2: '02. ₹50 பாணி குழாய்',
      nav3: '03. காய்ச்சலும் பாய்ச்சலும்',
      nav4: '04. செயற்கைக்கோள் வரைபடம்',
      nav5: '05. கள நெறிமுறை',

      // Scene 1 Late
      scene1Alert: 'சுற்றுச்சூழல் எச்சரிக்கை // மீத்தேன் வாயு உமிழ்வு',
      scene1Gwp: 'GWP-20: CO₂-வை விட 80 மடங்கு தீவிர வெப்பம்',
      scene1LateTitle: 'தேங்கிய நீர்ப்பரப்பிற்கு அடியில்...',
      scene1LateBody: 'வயலில் தொடர்ந்து நீர் தேங்கி நிற்பதால் வேர் மண்டலத்திற்குப் பிராணவாயு (ஆக்சிஜன்) கிடைக்காமல் வேர்கள் அழுகுகின்றன. மேலும், கரியமில வாயுவை விட <strong>80 மடங்கு தீவிர வெப்பத்தை உருவாக்கும் மீத்தேன் (CH₄) வாயு</strong> காற்றில்லாச் சூழலில் உற்பத்தியாகிறது. வயலில் நீர் தேக்குவது களைகளைக் கட்டுப்படுத்தவே அன்றி, பயிரின் தொடர் வளர்ச்சிக்கு எப்போதும் நீர் தேங்கி நிற்கத் தேவையில்லை.',
      statRootO2: 'வேர் மண்டல ஆக்சிஜன்',
      statRootO2Val: 'மிகக் குறைவு (<0.5 மிகி/லி)',
      statMethane: 'மீத்தேன் உற்பத்தி',
      statMethaneVal: 'தீவிர காற்றில்லா நிலை',
      statWaterNeed: 'உண்மையான நீர்த் தேவை',
      statWaterNeedVal: 'மண் ஈரம் மட்டுமே',

      // Scene 3
      scene3Title: 'உண்மையை உரைக்கும் ₹50 பாணி குழாய்',
      scene3Quote: '“நிலத்தின் மேற்பரப்பு ஏமாற்றும்; பாணி குழாய் வேரின் உண்மையை உணர்த்தும்.”',
      scene3Desc: '30 செ.மீ நீளமுள்ள எளிய <strong>பிவிசி பாணி குழாய் (வயல் நீர்மானி)</strong>—மண் மட்டத்திற்கு மேல் 10 செ.மீ நீட்டியபடியும், வேர் மண்டலத்தில் 20 செ.மீ ஆழத்தில் துளையிடப்பட்டும் நிறுவப்படுகிறது. நிலத்தின் மேற்பகுதி காய்ந்து வெடித்தாலும், வேர் பகுதியில் உள்ள உண்மையான ஈரப்பதத்தை இது துல்லியமாகக் காட்டும்.',
      liveWaterTable: 'குழாயினுள் நேரடி நீர் மட்டம்',
      badgeFlooded: 'மேற்பரப்பில் நீர் தேக்கம்',
      paniLabelPonded: '+5 செ.மீ (மண் மட்டத்திற்கு மேல் தேங்கிய நீர்)',
      paniLabelSurface: '0 செ.மீ (மண் மட்டம் / தரை மட்டம்)',
      paniLabelAwd: '-15 செ.மீ (மறுபாசன எல்லை - காய்ச்சலும் பாய்ச்சலும்)',
      specPipeLength: 'மொத்தக் குழாய் நீளம்',
      specPipeLengthVal: '30 செ.மீ PVC (விட்டம் 15 செ.மீ)',
      specAboveGround: 'தரைக்கு மேல் நீளம்',
      specAboveGroundVal: '10 செ.மீ பகுதி',
      specRootPerforation: 'வேர் மண்டலத் துளைகள்',
      specRootPerforationVal: '20 செ.மீ ஆழத்தில் (0.5 செ.மீ துளைகள்)',
      scrubLabel: 'நீர் மட்டம் மாறுவதைக் காண உருட்டவும் அல்லது இழுக்கவும்:',

      // Scene 4
      scene4Title: 'அறிவியல் பூர்வமான முறை: காய்ச்சலும் பாய்ச்சலும் மாதிரி இயக்கி',
      scene4Desc: 'சர்வதேச நெல் ஆராய்ச்சி நிறுவனம் (IRRI) மற்றும் தமிழ்நாடு வேளாண்மைப் பல்கலைக்கழக (TNAU) வழிகாட்டுதலின்படி, பயிர் பருவத்திற்கும் பாணி குழாய் நீர் மட்டத்திற்கும் ஏற்ப பாசனத்தை எவ்வாறு நிர்வகிப்பது என்பதைப் பரிசோதிக்கவும்.',
      decisionStatus: 'களப் பாசன வழிகாட்டுதல்',
      replayCycle: '↻ நீர் வடிதல் சுழற்சியை மீண்டும் இயக்கு',
      selectStage: '1. பயிர் வளர்ச்சிப் பருவம்',
      stageVeg: 'தூர்கட்டும் பருவம் (நடவு 15–40 நாள்)',
      stageFlowering: 'பூக்கும் பருவம் (40–75 நாள்)',
      stagePreHarvest: 'முதிர்ச்சிப் பருவம் (75–100+ நாள்)',
      inspectDepth: '2. பாணி குழாய் நீர் மட்டம்',
      benchmarkTag: 'ஆராய்ச்சி ஒப்பீடு // தொடர் நீர் தேக்கம் vs காய்ச்சலும் பாய்ச்சலும் (AWD)',
      validatedTitle: 'களத்தில் நிரூபிக்கப்பட்ட நன்மைகள்',
      metricWater: 'பாசன நீர் சேமிப்பு',
      metricWaterNote: 'பயிரின் வேர்களுக்குப் பாதிப்பின்றி, கிணற்று நீர் மற்றும் மின்சாரத் தேவையை 30% வரை குறைக்கிறது.',
      metricMethane: 'மீத்தேன் வாயு குறைப்பு',
      metricMethaneNote: 'மண்ணில் அவ்வப்போது காற்று புகுந்து காய்வதால் தீவிர வெப்பத்தை உண்டாக்கும் மீத்தேன் வாயு 48% வரை தடுக்கப்படுகிறது.',
      metricYield: 'முழு மகசூல் உறுதி',
      metricYieldNote: '100% மகசூல் முழுமையாகப் பாதுகாக்கப்படுகிறது; வேர்களுக்குக் காற்று கிடைப்பதால் தூர் எண்ணிக்கை கூடுகிறது.',

      // Scene 5
      scene5Title: 'காவிரி டெல்டா: பாசன vs மானாவாரி நெல் வகைப்பாடு',
      scene5Desc: 'காவிரி டெல்டாவில் தொடர் பாசனம் பெறும் வாய்க்கால் பாசன வயல்களையும், மழையை மட்டுமே நம்பியுள்ள மானாவாரி வயல்களையும் செயற்கைக்கோள் வழி வகைப்படுத்தும் புவிசார் தளம்.',
      satelliteBase: '[செயற்கைக்கோள் நிலப்பரப்பு]',
      ndviView: '[சென்டினல்-2 NDVI பயிர் பசுமை சுட்டெண்]',
      classificationOverlay: '[பாசன வகைப்பாடு அடுக்கு]',
      gisLegendTitle: 'செயற்கைக்கோள் பயிர் வகைப்பாடு',
      irrigatedZoneTitle: 'வாய்க்கால் பாசனப் பரப்பு',
      irrigatedZoneSub: 'தஞ்சாவூர், திருவாரூர், மயிலாடுதுறை (காய்ச்சலும் பாய்ச்சலும் முறைக்கு மிகவும் உகந்தது — 30% நீர் சேமிப்பு)',
      rainfedZoneTitle: 'மானாவாரி மெட்டு நிலங்கள்',
      rainfedZoneSub: 'புதுக்கோட்டை தெற்கு எல்லைப் பகுதி (வறட்சி அபாயம் கொண்டது)',
      gisHint: 'விவரங்களைக் காண வரைபடத்தில் உள்ள வட்டங்களைக் கிளிக் செய்யவும்.',
      methodologyTag: 'தொலை உணர்வு வழிமுறை // புவி கண்காணிப்பு கட்டமைப்பு',
      methodologyDesc: 'சென்டினல்-2 செயற்கைக்கோள் மற்றும் CHIRPS மழைப்பொழிவு தரவுகள் மூலம், காவிரி டெல்டாவின் 21.58 லட்சம் ஹெக்டேர் பரப்பில் வாய்க்கால் பாசன வயல்களையும் மானாவாரிப் பகுதிகளையும் துல்லியமாகப் பிரிக்கிறது.',

      // Scene 6
      scene6EarlyPill: 'நிரூபிக்கப்பட்ட நன்மைகள்',
      scene6EarlyTitle: '₹50 பாணி குழாயால்<br /><span class="text-emerald-glow">செழிக்கும் காவிரி டெல்டா</span>',
      scene6EarlySub: '30% பாசன நீர் சேமிப்பு • 48% மீத்தேன் குறைப்பு • 100% முழு மகசூல்',
      scene6ProtocolPill: 'விவசாயிகளுக்கான கள நெறிமுறை',
      scene6ProtocolTitle: 'வயலில் கடைப்பிடிக்க வேண்டிய <span class="text-emerald-glow">3 எளிய விதிகள்</span>',
      scene6ProtocolSub: 'காவிரி டெல்டா விவசாயிகள் மகசூல் குறையாமல் 30% நீரைச் சேமிக்க TNAU மற்றும் IRRI பரிந்துரைக்கும் எளிய வழிகாட்டி.',
      step1Num: '01',
      step1Title: '₹50 பாணி குழாய் நடுதல்',
      step1Desc: 'நடவு நட்ட 15-ம் நாளில் 30 செ.மீ துளையிடப்பட்ட பிவிசி குழாயை 20 செ.மீ ஆழத்தில் வேர் மண்டலத்தில் புதைத்து, 10 செ.மீ பகுதி தரைக்கு மேலே தெரியுமாறு வைக்கவும்.',
      step2Num: '02',
      step2Title: '-15 செ.மீ நீர்மட்டத்தில் மறுபாசனம்',
      step2Desc: 'குழாயினுள் நீர் மட்டம் <strong>-15 செ.மீ</strong> ஆழத்தை எட்டும் வரை காத்திருந்து, பின்னர் <strong>+5 செ.மீ</strong> அளவிற்கு மீண்டும் நீர் பாய்ச்சவும்.',
      step3Num: '03',
      step3Title: 'பூக்கும் பருவத்தில் தொடர் நீர் தேக்குதல்',
      step3Desc: 'பயிர் பூக்கும் மற்றும் பால் பிடிக்கும் தருணத்தில் மட்டும் <strong>2–5 செ.மீ நீர் தேக்கி</strong> வைக்கவும்; அறுவடைக்கு 14 நாட்களுக்கு முன் நீரை முழுமையாக வடிக்கவும்.',
      scene6Quote: '“நீரை அளந்து பாய்ச்சுவோம்! பயிரையும் வளத்தையும் காப்போம்!”',
      copyBtn: 'கள நெறிமுறையை நகலெடு',
      toastTitle: 'கள நெறிமுறை நினைவகத்தில் நகலெடுக்கப்பட்டது',
      toastBody: 'விவசாயிகளுக்கு வாட்ஸ்அப் அல்லது குறுஞ்செய்தி வழி பகிரத் தயார்.'
    }
  };

  function initLanguageToggle() {
    const langBtns = document.querySelectorAll('.lang-btn');
    if (!langBtns.length) return;

    function applyLanguage(lang) {
      currentLang = lang;
      document.documentElement.setAttribute('data-lang', lang);
      try {
        localStorage.setItem('awd_pref_lang', lang);
      } catch (_) {}

      langBtns.forEach((btn) => {
        const isActive = btn.dataset.lang === lang;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      // Update text nodes
      document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (I18N[lang] && I18N[lang][key] !== undefined) {
          el.textContent = I18N[lang][key];
        }
      });

      // Update HTML nodes
      document.querySelectorAll('[data-i18n-html]').forEach((el) => {
        const key = el.getAttribute('data-i18n-html');
        if (I18N[lang] && I18N[lang][key] !== undefined) {
          el.innerHTML = I18N[lang][key];
        }
      });

      // Trigger dynamic readouts update
      renderSoilCrossSection(scrubberState.soilProgressCurrent);
      evaluateAwdDecision();
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
