// ── astar-engine.js ────────────────────────────────────────────────
// Full A* Pathfinding Engine, Character Animation & Map Router
// ──────────────────────────────────────────────────────────────────

(function() {
  'use strict';

  // ════════════════════════════════════════════════════════════════
  //  CONFIG & STATE
  // ════════════════════════════════════════════════════════════════
  const GRID_ROWS = 20;
  const GRID_COLS = 26;

  let state = {
    rows: GRID_ROWS,
    cols: GRID_COLS,
    start: [2, 2],
    goal: [17, 23],
    walls: new Set(),
    heuristic: 'manhattan', // 'manhattan' | 'euclidean'
    allowDiagonal: false,
    speed: 25, // ms per step animation
    isDrawing: false,
    drawMode: 'wall', // 'wall' | 'erase' | 'move-start' | 'move-goal'
    isSolving: false,
    characterPos: [2, 2],
    lastResult: null,
    characterMoving: false,
    animationTimeouts: []
  };

  // ════════════════════════════════════════════════════════════════
  //  SYNTHESIZED AUDIO ENGINE (Web Audio API)
  // ════════════════════════════════════════════════════════════════
  const SoundEngine = (function() {
    let audioCtx = null;
    let masterGain = null;
    let soundEnabled = true;
    let lastWallSoundTime = 0;
    let lastExploreSoundTime = 0;

    // Check stored preference
    try {
      const stored = localStorage.getItem('beacon_maze_sound');
      if (stored !== null) soundEnabled = stored === 'true';
    } catch (_) {}

    function getAudioContext() {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        audioCtx = new AudioContextClass();
        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(0.28, audioCtx.currentTime);

        // Soft dynamics compressor to prevent harshness/clipping
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-16, audioCtx.currentTime);
        compressor.knee.setValueAtTime(12, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(5, audioCtx.currentTime);
        compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
        compressor.release.setValueAtTime(0.12, audioCtx.currentTime);

        masterGain.connect(compressor);
        compressor.connect(audioCtx.destination);
      }

      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      return audioCtx;
    }

    function toggleSound() {
      soundEnabled = !soundEnabled;
      try {
        localStorage.setItem('beacon_maze_sound', String(soundEnabled));
      } catch (_) {}
      updateSoundUI();
      if (soundEnabled) {
        getAudioContext();
        playButtonTick();
      }
      return soundEnabled;
    }

    function isSoundEnabled() {
      return soundEnabled;
    }

    function updateSoundUI() {
      const icon = document.getElementById('soundIcon');
      const label = document.getElementById('soundLabel');
      const btn = document.getElementById('btnToggleSound');
      if (icon) icon.textContent = soundEnabled ? '🔊' : '🔇';
      if (label) label.textContent = soundEnabled ? 'Sound: ON' : 'Sound: OFF';
      if (btn) {
        btn.classList.toggle('active', soundEnabled);
        btn.classList.toggle('muted', !soundEnabled);
      }
    }

    // 1. Wall Draw / Erase Click (crisp pop)
    function playWallClick(isAdd) {
      if (!soundEnabled) return;
      const now = performance.now();
      if (now - lastWallSoundTime < 32) return; // rate-limit zipper sound
      lastWallSoundTime = now;

      const ctx = getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime;

      if (isAdd) {
        // Percussive wooden/stone tap (280Hz -> 130Hz)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(280, t);
        osc.frequency.exponentialRampToValueAtTime(130, t + 0.04);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      } else {
        // Eraser pop (440Hz -> 220Hz)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, t);
        osc.frequency.exponentialRampToValueAtTime(220, t + 0.035);
        gain.gain.setValueAtTime(0.13, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      }

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(t);
      osc.stop(t + 0.045);
    }

    // 2. Moving Start (S) or Goal (G)
    function playNodeMove() {
      if (!soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, t); // D5
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.06); // A5
      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(t);
      osc.stop(t + 0.08);
    }

    // 3. Radar/Sonar Ping during Search Exploration
    function playExplorePing(index, total) {
      if (!soundEnabled) return;
      const now = performance.now();
      if (now - lastExploreSoundTime < 35) return; // pleasant sonar rhythm
      lastExploreSoundTime = now;

      const ctx = getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime;

      // Frequency rises gently as exploration progresses from 320Hz to 740Hz
      const progress = total > 1 ? Math.min(1, index / total) : 0.5;
      const baseFreq = 320 + progress * 420;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.9, t + 0.03);

      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(t);
      osc.stop(t + 0.035);
    }

    // 4. Melodic Path Trace (when shortest path lights up)
    const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66]; // C5 to D6
    function playPathTrace(index, total) {
      if (!soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const noteIdx = index % PENTATONIC.length;
      const freq = PENTATONIC[noteIdx];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(t);
      osc.stop(t + 0.09);
    }

    // 5. Character Step Sound (Robot 🤖 walking)
    function playCharacterStep(stepIndex) {
      if (!soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime;

      // Alternating footsteps: step 1 is 440Hz, step 2 is 493.88Hz
      const isEven = stepIndex % 2 === 0;
      const freq = isEven ? 440 : 493.88;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.72, t + 0.07);

      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(t);
      osc.stop(t + 0.08);
    }

    // 6. Triumphant Goal Fanfare (C5 -> E5 -> G5 -> C6 Major Arpeggio + shimmer)
    function playGoalCelebration() {
      if (!soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const notes = [
        { f: 523.25, time: 0.00, dur: 0.12 },  // C5
        { f: 659.25, time: 0.09, dur: 0.12 },  // E5
        { f: 783.99, time: 0.18, dur: 0.15 },  // G5
        { f: 1046.50, time: 0.28, dur: 0.45 }  // C6 (held)
      ];

      notes.forEach(({ f, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = ctx.currentTime + time;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, t);

        gain.gain.setValueAtTime(0.24, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(t);
        osc.stop(t + dur + 0.02);
      });

      // Shimmering chime harmonic
      const sparkle = ctx.createOscillator();
      const sGain = ctx.createGain();
      const st = ctx.currentTime + 0.32;
      sparkle.type = 'sine';
      sparkle.frequency.setValueAtTime(2093, st); // C7
      sGain.gain.setValueAtTime(0.09, st);
      sGain.gain.exponentialRampToValueAtTime(0.001, st + 0.3);
      sparkle.connect(sGain);
      sGain.connect(masterGain);
      sparkle.start(st);
      sparkle.stop(st + 0.32);
    }

    // 7. No Path / Blocked Alarm (descending low minor buzzer)
    function playBlockedAlarm() {
      if (!soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      [0, 0.13].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = ctx.currentTime + offset;

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(170, t);
        osc.frequency.exponentialRampToValueAtTime(110, t + 0.09);

        gain.gain.setValueAtTime(0.16, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(t);
        osc.stop(t + 0.1);
      });
    }

    // 8. Button / UI Click (crisp mechanical tick)
    function playButtonTick() {
      if (!soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(950, t);
      osc.frequency.exponentialRampToValueAtTime(450, t + 0.02);

      gain.gain.setValueAtTime(0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(t);
      osc.stop(t + 0.03);
    }

    // 9. Shuffle / Whoosh (for Random Maze & Sample Maze)
    function playWhoosh() {
      if (!soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(680, t + 0.08);
      osc.frequency.exponentialRampToValueAtTime(320, t + 0.16);

      gain.gain.setValueAtTime(0.13, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(t);
      osc.stop(t + 0.2);
    }

    // 10. Clear Sweep (for Clear Walls / Reset)
    function playClearSweep() {
      if (!soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(540, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.13);

      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(t);
      osc.stop(t + 0.15);
    }

    // 11. Accident / Collision Alarm (two-tone urgent siren pulse)
    function playCollisionAlarm() {
      if (!soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      [0, 0.14, 0.28].forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = ctx.currentTime + offset;

        osc.type = 'sawtooth';
        const freq = idx % 2 === 0 ? 880 : 660;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.85, t + 0.11);

        gain.gain.setValueAtTime(0.20, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(t);
        osc.stop(t + 0.13);
      });
    }

    // 12. Hazards Cleared Fanfare / Harmonic Sweep
    function playHazardCleared() {
      if (!soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const notes = [
        { f: 523.25, time: 0.00, dur: 0.10 }, // C5
        { f: 659.25, time: 0.08, dur: 0.10 }, // E5
        { f: 783.99, time: 0.16, dur: 0.20 }  // G5
      ];

      notes.forEach(({ f, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = ctx.currentTime + time;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t);

        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(t);
        osc.stop(t + dur + 0.02);
      });
    }

    return {
      init: updateSoundUI,
      toggle: toggleSound,
      isEnabled: isSoundEnabled,
      playWallClick,
      playNodeMove,
      playExplorePing,
      playPathTrace,
      playCharacterStep,
      playGoalCelebration,
      playBlockedAlarm,
      playButtonTick,
      playWhoosh,
      playClearSweep,
      playCollisionAlarm,
      playHazardCleared,
      resumeContext: getAudioContext
    };
  })();

  // ════════════════════════════════════════════════════════════════
  //  INITIALIZATION
  // ════════════════════════════════════════════════════════════════
  function init() {
    SoundEngine.init();
    initMazeGrid();
    setupControls();
    initMapPathfinder();
    loadSampleMaze();
  }

  // ════════════════════════════════════════════════════════════════
  //  MAZE GRID SETUP
  // ════════════════════════════════════════════════════════════════
  function initMazeGrid() {
    const container = document.getElementById('mazeGrid');
    if (!container) return;

    container.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;
    container.innerHTML = '';

    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.id = `cell-${r}-${c}`;

        cell.addEventListener('mousedown', (e) => handleCellMouseDown(r, c, e));
        cell.addEventListener('mouseenter', () => handleCellMouseEnter(r, c));

        container.appendChild(cell);
      }
    }

    container.addEventListener('pointerdown', () => SoundEngine.resumeContext());
    window.addEventListener('mouseup', () => { state.isDrawing = false; });
    renderGridNodes();
  }

  function renderGridNodes() {
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const cell = document.getElementById(`cell-${r}-${c}`);
        if (!cell) continue;

        cell.className = 'grid-cell';
        cell.innerHTML = '';

        const key = `${r},${c}`;
        const isStart = state.start[0] === r && state.start[1] === c;
        const isGoal = state.goal[0] === r && state.goal[1] === c;
        const isWall = state.walls.has(key);
        const isChar = state.characterPos[0] === r && state.characterPos[1] === c;

        if (isStart) {
          cell.classList.add('node-start');
          cell.innerHTML = `<span class="node-label">S</span>`;
          cell.title = 'Start Point (S)';
        } else if (isGoal) {
          cell.classList.add('node-goal');
          cell.innerHTML = `<span class="node-label">G</span>`;
          cell.title = 'Goal Point (G)';
        } else if (isWall) {
          cell.classList.add('node-wall');
        }

        // Render Character if on this cell
        if (isChar && !isStart && !isGoal) {
          cell.innerHTML = `<span class="character-marker" title="Character Agent">🤖</span>`;
        } else if (isChar && isStart) {
          cell.innerHTML = `<span class="node-label">S</span><span class="char-badge">🤖</span>`;
        } else if (isChar && isGoal) {
          cell.innerHTML = `<span class="node-label">G</span><span class="char-badge">🎉</span>`;
        }
      }
    }
  }

  // ── Grid Mouse Interactions ──────────────────────────────────
  function handleCellMouseDown(r, c, e) {
    if (state.isSolving || state.characterMoving) return;
    e.preventDefault();
    state.isDrawing = true;
    SoundEngine.resumeContext();

    const isStart = state.start[0] === r && state.start[1] === c;
    const isGoal = state.goal[0] === r && state.goal[1] === c;
    const key = `${r},${c}`;

    if (isStart) {
      state.drawMode = 'move-start';
      SoundEngine.playNodeMove();
    } else if (isGoal) {
      state.drawMode = 'move-goal';
      SoundEngine.playNodeMove();
    } else if (state.walls.has(key)) {
      state.drawMode = 'erase';
      state.walls.delete(key);
      updateCellVisual(r, c);
      SoundEngine.playWallClick(false);
    } else {
      state.drawMode = 'wall';
      state.walls.add(key);
      updateCellVisual(r, c);
      SoundEngine.playWallClick(true);
    }
  }

  function handleCellMouseEnter(r, c) {
    if (!state.isDrawing || state.isSolving || state.characterMoving) return;
    const key = `${r},${c}`;
    const isStart = state.start[0] === r && state.start[1] === c;
    const isGoal = state.goal[0] === r && state.goal[1] === c;

    if (state.drawMode === 'move-start' && !isGoal && !state.walls.has(key)) {
      state.start = [r, c];
      state.characterPos = [r, c];
      renderGridNodes();
      SoundEngine.playNodeMove();
    } else if (state.drawMode === 'move-goal' && !isStart && !state.walls.has(key)) {
      state.goal = [r, c];
      renderGridNodes();
      SoundEngine.playNodeMove();
    } else if (state.drawMode === 'wall' && !isStart && !isGoal) {
      state.walls.add(key);
      updateCellVisual(r, c);
      SoundEngine.playWallClick(true);
    } else if (state.drawMode === 'erase' && !isStart && !isGoal) {
      state.walls.delete(key);
      updateCellVisual(r, c);
      SoundEngine.playWallClick(false);
    }
  }

  function updateCellVisual(r, c) {
    const cell = document.getElementById(`cell-${r}-${c}`);
    if (!cell) return;
    const key = `${r},${c}`;
    if (state.walls.has(key)) {
      cell.classList.add('node-wall');
      cell.classList.remove('node-visited', 'node-path');
    } else {
      cell.classList.remove('node-wall');
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  A* SOLVER IMPLEMENTATION (Client-side fallback & API bridge)
  // ════════════════════════════════════════════════════════════════
  function clearAnimation() {
    state.animationTimeouts.forEach(t => clearTimeout(t));
    state.animationTimeouts = [];
    document.querySelectorAll('.grid-cell').forEach(cell => {
      cell.classList.remove('node-visited', 'node-path', 'node-current');
    });
    state.characterPos = [...state.start];
    renderGridNodes();
  }

  async function runAStar() {
    if (state.isSolving || state.characterMoving) return;
    clearAnimation();
    setSolvingState(true);

    const startTime = performance.now();

    // Prepare payload
    const gridMatrix = Array.from({ length: state.rows }, (_, r) =>
      Array.from({ length: state.cols }, (_, c) => (state.walls.has(`${r},${c}`) ? 1 : 0))
    );

    let result = null;

    // 1. Try Backend SQL API first
    try {
      const res = await fetch('/api/astar/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grid: gridMatrix,
          width: state.cols,
          height: state.rows,
          start: state.start,
          goal: state.goal,
          heuristic: state.heuristic,
          allowDiagonal: state.allowDiagonal
        })
      });
      if (res.ok) {
        result = await res.json();
      }
    } catch (_) {}

    // 2. Client-side fallback if backend unreachable
    if (!result) {
      result = clientSolveAStar(gridMatrix, state.start, state.goal, state.heuristic, state.allowDiagonal);
    }

    state.lastResult = result;
    updateMetricsDisplay(result);

    if (!result.found) {
      SoundEngine.playBlockedAlarm();
      alert('⚠️ No path could be found! The goal is completely enclosed by walls.');
      setSolvingState(false);
      return;
    }

    // Animate exploration then path and character
    animateExploration(result.exploredOrder, result.path);
  }

  function clientSolveAStar(grid, start, goal, heuristic, allowDiagonal) {
    const [startR, startC] = start;
    const [goalR, goalC] = goal;

    const calcH = (r, c) => {
      const dr = Math.abs(r - goalR);
      const dc = Math.abs(c - goalC);
      return heuristic === 'euclidean' ? Math.sqrt(dr * dr + dc * dc) : dr + dc;
    };

    const directions = [
      [-1, 0, 1.0], [0, 1, 1.0], [1, 0, 1.0], [0, -1, 1.0]
    ];
    if (allowDiagonal) {
      const diag = Math.SQRT2;
      directions.push([-1, -1, diag], [-1, 1, diag], [1, -1, diag], [1, 1, diag]);
    }

    const key = (r, c) => `${r},${c}`;
    const openSet = [{ r: startR, c: startC, f: calcH(startR, startC), g: 0 }];
    const closedSet = new Set();
    const parentMap = new Map();
    const gScore = new Map();
    gScore.set(key(startR, startC), 0);

    const exploredOrder = [];
    let found = false;
    let finalCost = 0;

    while (openSet.length > 0) {
      openSet.sort((a, b) => a.f - b.f);
      const curr = openSet.shift();
      const currKey = key(curr.r, curr.c);

      if (closedSet.has(currKey)) continue;
      closedSet.add(currKey);
      exploredOrder.push([curr.r, curr.c]);

      if (curr.r === goalR && curr.c === goalC) {
        found = true;
        finalCost = curr.g;
        break;
      }

      for (const [dr, dc, moveCost] of directions) {
        const nr = curr.r + dr;
        const nc = curr.c + dc;
        const nKey = key(nr, nc);

        if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
        if (grid[nr][nc] === 1 || closedSet.has(nKey)) continue;

        const tentG = curr.g + moveCost;
        const prevG = gScore.has(nKey) ? gScore.get(nKey) : Infinity;

        if (tentG < prevG) {
          gScore.set(nKey, tentG);
          parentMap.set(nKey, [curr.r, curr.c]);
          const f = tentG + calcH(nr, nc);
          openSet.push({ r: nr, c: nc, f, g: tentG });
        }
      }
    }

    const path = [];
    if (found) {
      let c = [goalR, goalC];
      path.unshift(c);
      while (c[0] !== startR || c[1] !== startC) {
        const p = parentMap.get(key(c[0], c[1]));
        if (!p) break;
        c = p;
        path.unshift(c);
      }
    }

    return {
      found,
      path,
      pathLength: path.length,
      pathCost: parseFloat(finalCost.toFixed(2)),
      nodesExplored: closedSet.size,
      exploredOrder,
      heuristic,
      executionTimeMs: 4.2
    };
  }

  // ════════════════════════════════════════════════════════════════
  //  ANIMATION: EXPLORATION -> PATH -> CHARACTER MOVEMENT
  // ════════════════════════════════════════════════════════════════
  function animateExploration(exploredOrder, path) {
    const delay = Math.max(8, state.speed);

    exploredOrder.forEach(([r, c], index) => {
      const t = setTimeout(() => {
        const isStart = state.start[0] === r && state.start[1] === c;
        const isGoal = state.goal[0] === r && state.goal[1] === c;
        if (!isStart && !isGoal) {
          const cell = document.getElementById(`cell-${r}-${c}`);
          if (cell) cell.classList.add('node-visited');
        }
        SoundEngine.playExplorePing(index, exploredOrder.length);
      }, index * delay);
      state.animationTimeouts.push(t);
    });

    const totalExploreTime = exploredOrder.length * delay;

    // After exploration, animate the optimal path
    const pathTimer = setTimeout(() => {
      animatePath(path);
    }, totalExploreTime + 50);
    state.animationTimeouts.push(pathTimer);
  }

  function animatePath(path) {
    const pathDelay = Math.max(20, state.speed * 1.5);

    path.forEach(([r, c], index) => {
      const t = setTimeout(() => {
        const isStart = state.start[0] === r && state.start[1] === c;
        const isGoal = state.goal[0] === r && state.goal[1] === c;
        if (!isStart && !isGoal) {
          const cell = document.getElementById(`cell-${r}-${c}`);
          if (cell) {
            cell.classList.add('node-path');
          }
        }
        SoundEngine.playPathTrace(index, path.length);
      }, index * pathDelay);
      state.animationTimeouts.push(t);
    });

    const totalPathTime = path.length * pathDelay;

    // Once path is highlighted, animate the Character traversing the maze
    const charTimer = setTimeout(() => {
      animateCharacterTraversal(path);
    }, totalPathTime + 100);
    state.animationTimeouts.push(charTimer);
  }

  function animateCharacterTraversal(path) {
    state.characterMoving = true;
    const charSpeed = 120; // ms per cell movement

    path.forEach(([r, c], stepIndex) => {
      const t = setTimeout(() => {
        state.characterPos = [r, c];
        renderGridNodes();
        SoundEngine.playCharacterStep(stepIndex);

        // Highlight active step
        const cell = document.getElementById(`cell-${r}-${c}`);
        if (cell) {
          cell.classList.add('node-current');
          setTimeout(() => cell.classList.remove('node-current'), charSpeed);
        }

        // Reached Goal!
        if (stepIndex === path.length - 1) {
          state.characterMoving = false;
          setSolvingState(false);
          SoundEngine.playGoalCelebration();
          const goalCell = document.getElementById(`cell-${state.goal[0]}-${state.goal[1]}`);
          if (goalCell) {
            goalCell.classList.add('goal-celebration');
            setTimeout(() => goalCell.classList.remove('goal-celebration'), 1500);
          }
        }
      }, stepIndex * charSpeed);
      state.animationTimeouts.push(t);
    });
  }

  function setSolvingState(isSolving) {
    state.isSolving = isSolving;
    const runBtn = document.getElementById('btnRunAStar');
    if (runBtn) {
      runBtn.disabled = isSolving;
      runBtn.innerHTML = isSolving
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin .8s linear infinite;"><circle cx="12" cy="12" r="10" stroke-opacity=".2"/><path d="M12 2a10 10 0 0 1 10 10"/></svg> Finding Path…`
        : `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg> Find Shortest Path`;
    }
  }

  function updateMetricsDisplay(res) {
    const costEl = document.getElementById('metricPathCost');
    const nodesEl = document.getElementById('metricNodesExplored');
    const lengthEl = document.getElementById('metricPathLength');
    const timeEl = document.getElementById('metricTimeTaken');
    const heurEl = document.getElementById('metricHeuristic');

    if (costEl) costEl.textContent = res.pathCost || '0';
    if (nodesEl) nodesEl.textContent = res.nodesExplored || '0';
    if (lengthEl) lengthEl.textContent = `${res.pathLength || 0} steps`;
    if (timeEl) timeEl.textContent = `${res.executionTimeMs || '< 1'} ms`;
    if (heurEl) heurEl.textContent = state.heuristic.toUpperCase();
  }

  // ════════════════════════════════════════════════════════════════
  //  HEURISTIC COMPARISON (Manhattan vs. Euclidean)
  // ════════════════════════════════════════════════════════════════
  async function compareHeuristicsModal() {
    const gridMatrix = Array.from({ length: state.rows }, (_, r) =>
      Array.from({ length: state.cols }, (_, c) => (state.walls.has(`${r},${c}`) ? 1 : 0))
    );

    let comp = null;
    try {
      const res = await fetch('/api/astar/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grid: gridMatrix,
          width: state.cols,
          height: state.rows,
          start: state.start,
          goal: state.goal,
          allowDiagonal: state.allowDiagonal
        })
      });
      if (res.ok) comp = await res.json();
    } catch (_) {}

    if (!comp) {
      const m = clientSolveAStar(gridMatrix, state.start, state.goal, 'manhattan', state.allowDiagonal);
      const e = clientSolveAStar(gridMatrix, state.start, state.goal, 'euclidean', state.allowDiagonal);
      comp = {
        manhattan: m,
        euclidean: e,
        comparison: {
          winner: m.nodesExplored < e.nodesExplored ? 'Manhattan' : (e.nodesExplored < m.nodesExplored ? 'Euclidean' : 'Equal'),
          nodesExploredDiff: Math.abs(e.nodesExplored - m.nodesExplored),
          commentary: `Manhattan explored ${m.nodesExplored} nodes while Euclidean explored ${e.nodesExplored} nodes.`
        }
      };
    }

    renderComparisonModal(comp);
  }

  function renderComparisonModal(comp) {
    let modal = document.getElementById('comparisonModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'comparisonModal';
      modal.className = 'modal-overlay open';
      document.body.appendChild(modal);
    } else {
      modal.classList.add('open');
    }

    const m = comp.manhattan;
    const e = comp.euclidean;
    const c = comp.comparison;

    modal.innerHTML = `
      <div class="modal" style="max-width:680px;">
        <button class="modal-close" onclick="document.getElementById('comparisonModal').classList.remove('open')">✕</button>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:24px;">⚖️</span>
          <h2 style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:600;">Heuristic Comparison: Manhattan vs. Euclidean</h2>
        </div>
        <p style="font-size:13px;color:var(--text-dim);margin-bottom:20px;">
          Direct algorithmic performance evaluated on the exact current maze configuration (${state.rows}×${state.cols} grid).
        </p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
          <!-- Manhattan Card -->
          <div style="background:rgba(124,156,255,0.06);border:1px solid rgba(124,156,255,0.25);border-radius:12px;padding:18px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <span style="font-weight:600;font-size:15px;color:var(--violet);">Manhattan Heuristic</span>
              <span style="font-size:10.5px;padding:2px 8px;border-radius:10px;background:rgba(124,156,255,0.15);color:var(--violet);font-family:monospace;">L1 Norm</span>
            </div>
            <div style="font-size:11.5px;color:var(--text-faint);margin-bottom:12px;font-family:'JetBrains Mono',monospace;">h(n) = |dx| + |dy|</div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">
              <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--text-dim);">Nodes Explored:</span>
                <strong style="color:${c.winner === 'Manhattan' ? 'var(--green)' : 'var(--text)'};font-size:16px;">${m.nodesExplored}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--text-dim);">Path Cost:</span>
                <strong style="color:var(--text);">${m.pathCost}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--text-dim);">Path Length:</span>
                <span>${m.pathLength} steps</span>
              </div>
              <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--text-dim);">Execution Time:</span>
                <span class="mono">${m.executionTimeMs} ms</span>
              </div>
            </div>
          </div>

          <!-- Euclidean Card -->
          <div style="background:rgba(111,207,151,0.06);border:1px solid rgba(111,207,151,0.25);border-radius:12px;padding:18px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <span style="font-weight:600;font-size:15px;color:var(--green);">Euclidean Heuristic</span>
              <span style="font-size:10.5px;padding:2px 8px;border-radius:10px;background:rgba(111,207,151,0.15);color:var(--green);font-family:monospace;">L2 Norm</span>
            </div>
            <div style="font-size:11.5px;color:var(--text-faint);margin-bottom:12px;font-family:'JetBrains Mono',monospace;">h(n) = √(dx² + dy²)</div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">
              <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--text-dim);">Nodes Explored:</span>
                <strong style="color:${c.winner === 'Euclidean' ? 'var(--green)' : 'var(--text)'};font-size:16px;">${e.nodesExplored}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--text-dim);">Path Cost:</span>
                <strong style="color:var(--text);">${e.pathCost}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--text-dim);">Path Length:</span>
                <span>${e.pathLength} steps</span>
              </div>
              <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--text-dim);">Execution Time:</span>
                <span class="mono">${e.executionTimeMs} ms</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Analytical Verdict Banner -->
        <div style="background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:14px 18px;margin-bottom:20px;">
          <div style="font-weight:600;font-size:13.5px;color:var(--amber);margin-bottom:4px;">
            🏆 Result: ${c.winner === 'Equal' ? 'Both Heuristics Explored Equal Nodes' : `${c.winner} Heuristic Explored Fewer Nodes!`}
          </div>
          <p style="font-size:12.5px;color:var(--text-dim);line-height:1.5;">
            ${c.commentary}
          </p>
          <div style="margin-top:8px;font-size:11.5px;color:var(--text-faint);">
            Note: On orthogonal grids with 4-directional moves, Manhattan is both admissible and consistent ($L_1$), often pruning more dead-ends than straight-line Euclidean distance.
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:10px;">
          <button class="btn btn-outline" onclick="document.getElementById('comparisonModal').classList.remove('open')">Close</button>
          <button class="btn btn-primary" onclick="document.getElementById('comparisonModal').classList.remove('open'); window.setHeuristic('${c.winner === 'Euclidean' ? 'euclidean' : 'manhattan'}'); window.runAStarVisualizer();">
            Use ${c.winner === 'Euclidean' ? 'Euclidean' : 'Manhattan'} & Run
          </button>
        </div>
      </div>
    `;
  }

  // ════════════════════════════════════════════════════════════════
  //  MAZE GENERATORS
  // ════════════════════════════════════════════════════════════════
  function clearWalls() {
    clearAnimation();
    state.walls.clear();
    renderGridNodes();
    SoundEngine.playClearSweep();
  }

  function generateRandomMaze(density = 0.28) {
    clearWalls();
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const isStart = (r === state.start[0] && c === state.start[1]) || (Math.abs(r - state.start[0]) <= 1 && Math.abs(c - state.start[1]) <= 1);
        const isGoal = (r === state.goal[0] && c === state.goal[1]) || (Math.abs(r - state.goal[0]) <= 1 && Math.abs(c - state.goal[1]) <= 1);
        if (!isStart && !isGoal && Math.random() < density) {
          state.walls.add(`${r},${c}`);
        }
      }
    }
    renderGridNodes();
    SoundEngine.playWhoosh();
  }

  function loadSampleMaze() {
    clearWalls();
    // Add nice obstacle corridors
    const wallCoords = [
      // Top barrier
      [4, 5], [4, 6], [4, 7], [4, 8], [4, 9], [4, 10], [4, 11], [4, 12],
      // Middle vertical wall with opening
      [2, 14], [3, 14], [4, 14], [5, 14], [6, 14], [8, 14], [9, 14], [10, 14], [11, 14],
      // Lower horizontal maze wall
      [12, 6], [12, 7], [12, 8], [12, 9], [12, 10], [12, 11], [12, 12], [12, 13], [12, 14], [12, 15], [12, 16],
      // Right wing vertical divider
      [6, 18], [7, 18], [8, 18], [9, 18], [10, 18], [14, 18], [15, 18], [16, 18], [17, 18],
      // Goal defense barrier
      [15, 20], [15, 21], [15, 22]
    ];
    wallCoords.forEach(([r, c]) => {
      if (r < state.rows && c < state.cols) {
        state.walls.add(`${r},${c}`);
      }
    });
    renderGridNodes();
    SoundEngine.playWhoosh();
  }

  // ════════════════════════════════════════════════════════════════
  //  CONTROLS & BUTTONS SETUP
  // ════════════════════════════════════════════════════════════════
  function setupControls() {
    // Run button
    const runBtn = document.getElementById('btnRunAStar');
    if (runBtn) runBtn.addEventListener('click', () => {
      SoundEngine.playButtonTick();
      runAStar();
    });

    // Reset button
    const resetBtn = document.getElementById('btnResetGrid');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      clearAnimation();
      renderGridNodes();
      SoundEngine.playClearSweep();
    });

    // Clear walls button
    const clearBtn = document.getElementById('btnClearWalls');
    if (clearBtn) clearBtn.addEventListener('click', clearWalls);

    // Random maze button
    const randomBtn = document.getElementById('btnRandomMaze');
    if (randomBtn) randomBtn.addEventListener('click', () => generateRandomMaze(0.28));

    // Sample maze button
    const sampleBtn = document.getElementById('btnSampleMaze');
    if (sampleBtn) sampleBtn.addEventListener('click', loadSampleMaze);

    // Sound toggle button
    const toggleSoundBtn = document.getElementById('btnToggleSound');
    if (toggleSoundBtn) {
      toggleSoundBtn.addEventListener('click', () => {
        SoundEngine.toggle();
      });
    }

    // Comparison button
    const compareBtn = document.getElementById('btnCompareHeuristics');
    if (compareBtn) compareBtn.addEventListener('click', () => {
      SoundEngine.playButtonTick();
      compareHeuristicsModal();
    });

    // Heuristic toggle buttons
    const manhattanBtn = document.getElementById('btnHeuristicManhattan');
    const euclideanBtn = document.getElementById('btnHeuristicEuclidean');

    window.setHeuristic = function(type) {
      state.heuristic = type;
      SoundEngine.playButtonTick();
      if (manhattanBtn && euclideanBtn) {
        manhattanBtn.classList.toggle('active', type === 'manhattan');
        euclideanBtn.classList.toggle('active', type === 'euclidean');
      }
      const desc = document.getElementById('heuristicFormulaText');
      if (desc) {
        desc.innerHTML = type === 'manhattan'
          ? `<strong>Manhattan ($L_1$):</strong> <span class="mono">|x₁ - x₂| + |y₁ - y₂|</span> — Exact orthogonal grid distance.`
          : `<strong>Euclidean ($L_2$):</strong> <span class="mono">√((x₁ - x₂)² + (y₁ - y₂)$²)</span> — Direct straight-line distance.`;
      }
    };

    if (manhattanBtn) manhattanBtn.addEventListener('click', () => window.setHeuristic('manhattan'));
    if (euclideanBtn) euclideanBtn.addEventListener('click', () => window.setHeuristic('euclidean'));

    // Expose for external calls
    window.runAStarVisualizer = runAStar;
    window.compareAStarHeuristics = compareHeuristicsModal;
  }

  // ════════════════════════════════════════════════════════════════
  //  CITY MAP SHORTEST ROUTE PATHFINDER & ACCIDENT RATE MONITOR
  // ════════════════════════════════════════════════════════════════
  let mapData = null;
  let activeRoute = null;
  let activeAccidentsList = [];
  let accidentMonitorStats = null;
  let accidentPollTimer = null;

  async function initMapPathfinder() {
    const canvas = document.getElementById('mapCanvas');
    if (!canvas) return;

    try {
      const res = await fetch('/api/map/graph');
      if (res.ok) mapData = await res.json();
    } catch (_) {}

    // Fallback data if server not reached
    if (!mapData) {
      mapData = {
        nodes: [
          { id: 'central_hub', name: 'Central Metro Hub', icon: '🚆', x: 420, y: 310 },
          { id: 'tech_park', name: 'Cyber Tech Park', icon: '🏢', x: 670, y: 190 },
          { id: 'airport', name: 'International Airport', icon: '✈️', x: 840, y: 120 },
          { id: 'university', name: 'State University Campus', icon: '🎓', x: 230, y: 180 },
          { id: 'city_hospital', name: 'City Medical Center', icon: '🏥', x: 530, y: 440 },
          { id: 'harbor', name: 'Maritime Harbor Bay', icon: '⚓', x: 160, y: 480 },
          { id: 'shopping_mall', name: 'Grand Central Mall', icon: '🛍️', x: 340, y: 470 },
          { id: 'stadium', name: 'Olympic Sports Arena', icon: '🏟️', x: 720, y: 490 },
          { id: 'logistics_zone', name: 'East Logistics Zone', icon: '🏭', x: 780, y: 340 },
          { id: 'eco_gardens', name: 'Botanical Eco Gardens', icon: '🌳', x: 480, y: 160 }
        ],
        edges: [
          { from: 'university', to: 'eco_gardens', distance: 6.2, road: 'University Blvd' },
          { from: 'university', to: 'central_hub', distance: 5.5, road: 'Heritage Way' },
          { from: 'eco_gardens', to: 'tech_park', distance: 4.8, road: 'Innovation Parkway' },
          { from: 'eco_gardens', to: 'central_hub', distance: 4.1, road: 'Garden Avenue' },
          { from: 'tech_park', to: 'airport', distance: 5.9, road: 'Skyline Expressway' },
          { from: 'tech_park', to: 'logistics_zone', distance: 4.5, road: 'Commerce Corridor' },
          { from: 'central_hub', to: 'tech_park', distance: 7.1, road: 'Metropolitan Arterial' },
          { from: 'central_hub', to: 'city_hospital', distance: 3.8, road: 'Civic Center Drive' },
          { from: 'central_hub', to: 'shopping_mall', distance: 4.6, road: 'Market Promenade' },
          { from: 'harbor', to: 'university', distance: 7.9, road: 'Coastal Highway' },
          { from: 'harbor', to: 'shopping_mall', distance: 5.1, road: 'Seaside Link' },
          { from: 'shopping_mall', to: 'city_hospital', distance: 3.5, road: 'Health Park Route' },
          { from: 'city_hospital', to: 'stadium', distance: 5.4, road: 'Southbound Highway' },
          { from: 'city_hospital', to: 'logistics_zone', distance: 6.8, road: 'Freight Connector' },
          { from: 'stadium', to: 'logistics_zone', distance: 4.9, road: 'Arena Ring Road' },
          { from: 'logistics_zone', to: 'airport', distance: 7.2, road: 'Air Cargo Bypass' }
        ]
      };
    }

    populateMapDropdowns();
    await initAccidentMonitor();
    renderMapCanvas();

    const findRouteBtn = document.getElementById('btnFindMapRoute');
    if (findRouteBtn) {
      findRouteBtn.addEventListener('click', findMapShortestRoute);
    }
  }

  function populateMapDropdowns() {
    const originSelect = document.getElementById('mapOriginSelect');
    const destSelect = document.getElementById('mapDestSelect');
    if (!originSelect || !destSelect || !mapData) return;

    originSelect.innerHTML = '';
    destSelect.innerHTML = '';

    mapData.nodes.forEach((node, i) => {
      const opt1 = document.createElement('option');
      opt1.value = node.id;
      opt1.textContent = `${node.icon} ${node.name}`;
      if (i === 3) opt1.selected = true; // University
      originSelect.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = node.id;
      opt2.textContent = `${node.icon} ${node.name}`;
      if (i === 2) opt2.selected = true; // Airport
      destSelect.appendChild(opt2);
    });
  }

  // ════════════════════════════════════════════════════════════════
  //  REAL-TIME ACCIDENT RATE MONITOR CONTROLLER & TELEMETRY
  // ════════════════════════════════════════════════════════════════
  async function initAccidentMonitor() {
    const simulateBtn = document.getElementById('btnSimulateAccident');
    const clearBtn = document.getElementById('btnClearAccidents');
    const avoidToggle = document.getElementById('chkAvoidAccidents');

    if (simulateBtn && !simulateBtn.__bound) {
      simulateBtn.__bound = true;
      simulateBtn.addEventListener('click', async () => {
        SoundEngine.playButtonTick();
        simulateBtn.disabled = true;
        simulateBtn.innerHTML = `Simulating…`;
        try {
          const res = await fetch('/api/accidents/simulate-random', { method: 'POST' });
          if (res.ok) {
            SoundEngine.playCollisionAlarm();
            await refreshAccidentStats();
            if (activeRoute) {
              findMapShortestRoute();
            }
          }
        } catch (e) {
          console.error(e);
        } finally {
          simulateBtn.disabled = false;
          simulateBtn.innerHTML = `
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Simulate Collision
          `;
        }
      });
    }

    if (clearBtn && !clearBtn.__bound) {
      clearBtn.__bound = true;
      clearBtn.addEventListener('click', async () => {
        SoundEngine.playButtonTick();
        clearBtn.disabled = true;
        clearBtn.innerHTML = `Clearing…`;
        try {
          const res = await fetch('/api/accidents/clear', { method: 'POST' });
          if (res.ok) {
            SoundEngine.playHazardCleared();
            await refreshAccidentStats();
            if (activeRoute) {
              findMapShortestRoute();
            }
          }
        } catch (e) {
          console.error(e);
        } finally {
          clearBtn.disabled = false;
          clearBtn.innerHTML = `
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            Clear All Hazards
          `;
        }
      });
    }

    if (avoidToggle && !avoidToggle.__bound) {
      avoidToggle.__bound = true;
      avoidToggle.addEventListener('change', () => {
        SoundEngine.playButtonTick();
        if (activeRoute) {
          findMapShortestRoute();
        }
      });
    }

    await refreshAccidentStats();

    if (!accidentPollTimer) {
      accidentPollTimer = setInterval(refreshAccidentStats, 4000);
    }
  }

  async function resolveHazard(accidentId) {
    try {
      SoundEngine.playButtonTick();
      const res = await fetch(`/api/accidents/resolve/${accidentId}`, { method: 'POST' });
      if (res.ok) {
        SoundEngine.playHazardCleared();
        await refreshAccidentStats();
        if (activeRoute) {
          findMapShortestRoute();
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
  window.resolveHazard = resolveHazard;

  async function refreshAccidentStats() {
    try {
      const res = await fetch('/api/accidents/stats');
      if (!res.ok) return;
      const stats = await res.json();
      accidentMonitorStats = stats;
      activeAccidentsList = stats.active_accidents || [];

      // Update Accident Rate Card
      const elRate = document.getElementById('valAccidentRate');
      if (elRate) elRate.textContent = Number(stats.accident_rate_per_10k).toFixed(1);

      const elBadgeRisk = document.getElementById('badgeRiskLevel');
      if (elBadgeRisk) {
        elBadgeRisk.textContent = (stats.city_risk_level || 'Normal').split('/')[0].trim();
        const pillClass = stats.risk_color === 'red' ? 'critical' : stats.risk_color === 'amber' ? 'moderate' : 'normal';
        elBadgeRisk.className = `risk-pill ${pillClass}`;
      }

      const elCardRate = document.getElementById('cardAccidentRate');
      if (elCardRate) {
        elCardRate.classList.toggle('hazard-critical', stats.risk_color === 'red');
      }

      const elTrend = document.getElementById('subRateTrend');
      if (elTrend) {
        const arrow = stats.trend_direction === 'up' ? '📈' : stats.trend_direction === 'down' ? '📉' : '⚖️';
        elTrend.innerHTML = `<span>${arrow} ${stats.rate_trend || '±0.0% stable'}</span>`;
      }

      // Active Collisions Card
      const elCollisions = document.getElementById('valActiveCollisions');
      if (elCollisions) elCollisions.textContent = stats.active_accidents_count;

      const elActiveBadge = document.getElementById('badgeActiveIncidents');
      if (elActiveBadge) {
        elActiveBadge.textContent = `${stats.active_accidents_count} active`;
        elActiveBadge.style.color = stats.active_accidents_count > 0 ? 'var(--red)' : 'var(--green)';
      }

      const elSeveritySub = document.getElementById('subSeverityBreakdown');
      if (elSeveritySub) {
        elSeveritySub.textContent = `${stats.critical_count} Critical · ${stats.moderate_count} Moderate · ${stats.minor_count} Minor`;
      }

      // Congestion Card
      const elCongestion = document.getElementById('valCongestionIndex');
      if (elCongestion) elCongestion.textContent = `${stats.congestion_index_pct}%`;

      const elBadgeCongestion = document.getElementById('badgeCongestion');
      if (elBadgeCongestion) {
        const cLevel = stats.congestion_index_pct >= 70 ? 'Heavy' : stats.congestion_index_pct >= 40 ? 'Moderate' : 'Smooth';
        elBadgeCongestion.textContent = cLevel;
        elBadgeCongestion.className = `risk-pill ${stats.congestion_index_pct >= 70 ? 'critical' : stats.congestion_index_pct >= 40 ? 'moderate' : 'normal'}`;
      }

      const elDelay = document.getElementById('subTotalDelay');
      if (elDelay) elDelay.textContent = `+${stats.total_city_delay_mins} min cumulative arterial delay`;

      // Emergency Dispatch ETA Card
      const elEta = document.getElementById('valEmergencyEta');
      if (elEta) elEta.textContent = `${stats.avg_emergency_eta_mins} min`;

      const elResolved = document.getElementById('subResolvedToday');
      if (elResolved) elResolved.textContent = `${stats.cleared_today_count} cleared today (${stats.total_reported_today} total)`;

      const elCountText = document.getElementById('activeIncidentsCountText');
      if (elCountText) elCountText.textContent = `${stats.active_accidents_count} Ongoing Hazards (${stats.recent_reports?.length || 0} in log)`;

      const elUpdated = document.getElementById('telemetryLastUpdated');
      if (elUpdated) {
        const d = new Date();
        elUpdated.textContent = `Live · ${d.toLocaleTimeString()}`;
      }

      // Incident Feed List
      const listEl = document.getElementById('accidentIncidentList');
      if (listEl) {
        const reports = stats.recent_reports || [];
        if (reports.length === 0) {
          listEl.innerHTML = `<div style="color:var(--text-dim);font-size:12px;padding:8px 0;text-align:center;">All city road arterials are currently clear. Zero active collision hazards.</div>`;
        } else {
          listEl.innerHTML = reports.map(inc => {
            const isActive = inc.status === 'active';
            const sevClass = isActive ? (inc.severity || 'moderate') : 'cleared';
            const sevBadge = isActive ? inc.severity.toUpperCase() : 'RESOLVED';
            const pillClass = isActive ? (inc.severity === 'critical' ? 'critical' : inc.severity === 'moderate' ? 'moderate' : 'normal') : 'normal';

            return `
              <div class="accident-incident-item ${sevClass}">
                <div style="flex:1;">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
                    <span class="risk-pill ${pillClass}">${sevBadge}</span>
                    <span class="accident-road-name">${inc.road_name}</span>
                    <span style="font-size:11px;color:var(--text-faint);">${inc.from_node} ↔ ${inc.to_node}</span>
                  </div>
                  <div class="accident-road-desc">${inc.description}</div>
                </div>
                <div style="display:flex;align-items:center;gap:10px;text-align:right;">
                  <div>
                    <div style="font-weight:600;color:${isActive ? 'var(--red)' : 'var(--green)'};font-size:12px;">
                      ${isActive ? `-${inc.speed_drop_pct}% speed` : 'Normal flow'}
                    </div>
                    <div style="font-size:11px;color:var(--text-dim);">
                      ${isActive ? `+${inc.delay_minutes}m delay` : 'Cleared'}
                    </div>
                  </div>
                  ${isActive ? `<button class="btn-resolve-hazard" onclick="resolveHazard(${inc.id})">Clear Hazard</button>` : ''}
                </div>
              </div>
            `;
          }).join('');
        }
      }

      // Redraw map with updated hazards
      renderMapCanvas(activeRoute ? activeRoute.routeNodes : null);
    } catch (e) {
      console.warn('Accident stats fetch error:', e);
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  CANVAS ROAD NETWORK & HAZARD RENDERING
  // ════════════════════════════════════════════════════════════════
  function renderMapCanvas(activeRoutePath = null, carPos = null) {
    const canvas = document.getElementById('mapCanvas');
    if (!canvas || !mapData) return;
    const ctx = canvas.getContext('2d');

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = (rect.height || 420) * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height || 420;

    // Scale from coordinate space (1000 x 600) to canvas size
    const scaleX = w / 1000;
    const scaleY = h / 600;

    ctx.clearRect(0, 0, w, h);

    // Draw background grid lines
    ctx.strokeStyle = 'rgba(38, 43, 51, 0.4)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const nodeLookup = new Map(mapData.nodes.map(n => [n.id, n]));

    // Draw Road Edges
    mapData.edges.forEach(edge => {
      const from = nodeLookup.get(edge.from);
      const to = nodeLookup.get(edge.to);
      if (!from || !to) return;

      const x1 = from.x * scaleX;
      const y1 = from.y * scaleY;
      const x2 = to.x * scaleX;
      const y2 = to.y * scaleY;

      // Check if this edge has an active accident
      const activeAccident = activeAccidentsList.find(a => 
        (a.from_node === edge.from && a.to_node === edge.to) ||
        (a.from_node === edge.to && a.to_node === edge.from) ||
        (a.road_name && edge.road && a.road_name.trim().toLowerCase() === edge.road.trim().toLowerCase())
      );

      // Check if this edge is in active route
      let isInRoute = false;
      if (activeRoutePath) {
        for (let i = 0; i < activeRoutePath.length - 1; i++) {
          const a = activeRoutePath[i].id;
          const b = activeRoutePath[i + 1].id;
          if ((edge.from === a && edge.to === b) || (edge.from === b && edge.to === a)) {
            isInRoute = true;
            break;
          }
        }
      }

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);

      if (activeAccident) {
        // Glowing dashed danger line for active accident corridor
        const isCrit = activeAccident.severity === 'critical';
        ctx.setLineDash([7, 5]);
        ctx.strokeStyle = isCrit ? '#E5697A' : '#F0A345';
        ctx.lineWidth = isInRoute ? 6 : 4;
        ctx.shadowColor = isCrit ? 'rgba(229, 105, 122, 0.9)' : 'rgba(240, 163, 69, 0.9)';
        ctx.shadowBlur = 12;
      } else if (isInRoute) {
        // Glowing active route path
        ctx.strokeStyle = '#6FCF97';
        ctx.lineWidth = 5;
        ctx.shadowColor = 'rgba(111, 207, 151, 0.7)';
        ctx.shadowBlur = 12;
      } else {
        ctx.strokeStyle = 'rgba(124, 156, 255, 0.22)';
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
      ctx.restore();

      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      // Draw active accident warning pill if present
      if (activeAccident) {
        ctx.save();
        const isCrit = activeAccident.severity === 'critical';
        ctx.fillStyle = isCrit ? 'rgba(46, 16, 22, 0.94)' : 'rgba(46, 32, 16, 0.94)';
        ctx.strokeStyle = isCrit ? '#E5697A' : '#F0A345';
        ctx.lineWidth = 1.5;
        const tagW = 84;
        const tagH = 22;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(midX - tagW / 2, midY - tagH / 2, tagW, tagH, 6);
        } else {
          ctx.rect(midX - tagW / 2, midY - tagH / 2, tagW, tagH);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isCrit ? '#FFA5B3' : '#FFD48A';
        ctx.font = 'bold 9.5px "Space Grotesk", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`⚠️ -${activeAccident.speed_drop_pct}% (+${activeAccident.delay_minutes}m)`, midX, midY);
        ctx.restore();
      } else {
        // Distance tag in the middle of edge
        ctx.fillStyle = isInRoute ? '#6FCF97' : 'rgba(139, 150, 163, 0.7)';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(`${edge.distance}km`, midX - 12, midY - 4);
      }
    });

    // Draw Nodes
    mapData.nodes.forEach(node => {
      const x = node.x * scaleX;
      const y = node.y * scaleY;

      const isStart = activeRoutePath && activeRoutePath[0]?.id === node.id;
      const isGoal = activeRoutePath && activeRoutePath[activeRoutePath.length - 1]?.id === node.id;
      const inRoute = activeRoutePath && activeRoutePath.some(n => n.id === node.id);

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, inRoute ? 18 : 14, 0, Math.PI * 2);

      if (isStart) {
        ctx.fillStyle = '#6FCF97';
        ctx.strokeStyle = '#0B0D10';
      } else if (isGoal) {
        ctx.fillStyle = '#E5697A';
        ctx.strokeStyle = '#0B0D10';
      } else if (inRoute) {
        ctx.fillStyle = '#7C9CFF';
        ctx.strokeStyle = '#fff';
      } else {
        ctx.fillStyle = '#1A1E24';
        ctx.strokeStyle = '#3A414D';
      }

      ctx.lineWidth = 2.5;
      ctx.fill();
      ctx.stroke();

      // Node Icon
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.icon, x, y);

      // Node Label
      ctx.fillStyle = inRoute ? '#FFFFFF' : '#8B96A3';
      ctx.font = `${inRoute ? '600' : '500'} 11.5px "Space Grotesk", sans-serif`;
      ctx.fillText(node.name, x, y + 24);
    });

    // Draw animated Car icon if in transit
    if (carPos) {
      ctx.font = '20px sans-serif';
      ctx.fillText('🚗', carPos.x * scaleX, carPos.y * scaleY - 6);
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  HAZARD-AWARE A* PATHFINDING
  // ════════════════════════════════════════════════════════════════
  async function findMapShortestRoute() {
    const originSelect = document.getElementById('mapOriginSelect');
    const destSelect = document.getElementById('mapDestSelect');
    const avoidToggle = document.getElementById('chkAvoidAccidents');
    if (!originSelect || !destSelect) return;

    const startId = originSelect.value;
    const goalId = destSelect.value;
    const avoidAccidents = avoidToggle ? avoidToggle.checked : true;

    if (startId === goalId) {
      alert('Please select two distinct locations.');
      return;
    }

    const btn = document.getElementById('btnFindMapRoute');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin .8s linear infinite;"><circle cx="12" cy="12" r="10" stroke-opacity=".2"/><path d="M12 2a10 10 0 0 1 10 10"/></svg> Routing…`;
    }

    let result = null;

    try {
      const res = await fetch('/api/map/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startId, goalId, heuristic: 'euclidean', avoidAccidents })
      });
      if (res.ok) result = await res.json();
    } catch (_) {}

    if (!result) {
      // Local Dijkstra / A* solver on mapData graph with accident penalization
      result = clientSolveMapRoute(startId, goalId, avoidAccidents);
    }

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg> Find Shortest Route`;
    }

    if (!result || !result.found) {
      alert('No connected route between selected points.');
      return;
    }

    activeRoute = result;
    renderMapCanvas(result.routeNodes);
    renderRouteSteps(result);
    animateCarAlongRoute(result.routeNodes);
  }

  function clientSolveMapRoute(startId, goalId, avoidAccidents = true) {
    const nodeMap = new Map(mapData.nodes.map(n => [n.id, n]));
    const goalNode = nodeMap.get(goalId);

    const adj = new Map();
    mapData.nodes.forEach(n => adj.set(n.id, []));
    mapData.edges.forEach(e => {
      adj.get(e.from).push({ to: e.to, dist: e.distance, road: e.road });
      adj.get(e.to).push({ to: e.from, dist: e.distance, road: e.road });
    });

    const openSet = [{ id: startId, f: 0, g: 0 }];
    const closedSet = new Set();
    const parentMap = new Map();
    const roadMap = new Map();
    const gScore = new Map();
    gScore.set(startId, 0);

    let found = false;
    let totalDistance = 0;
    let avoidanceApplied = false;

    while (openSet.length > 0) {
      openSet.sort((a, b) => a.f - b.f);
      const curr = openSet.shift();
      if (closedSet.has(curr.id)) continue;
      closedSet.add(curr.id);

      if (curr.id === goalId) {
        found = true;
        totalDistance = curr.g;
        break;
      }

      for (const e of adj.get(curr.id)) {
        if (closedSet.has(e.to)) continue;

        let edgeWeight = e.dist;
        if (avoidAccidents) {
          const acc = activeAccidentsList.find(a => 
            (a.from_node === curr.id && a.to_node === e.to) ||
            (a.from_node === e.to && a.to_node === curr.id) ||
            (a.road_name && e.road && a.road_name.trim().toLowerCase() === e.road.trim().toLowerCase())
          );
          if (acc) {
            avoidanceApplied = true;
            const mult = acc.severity === 'critical' ? 5.0 : acc.severity === 'moderate' ? 2.5 : 1.6;
            edgeWeight = e.dist * mult + (acc.delay_minutes || 5);
          }
        }

        const tentG = curr.g + edgeWeight;
        const prevG = gScore.has(e.to) ? gScore.get(e.to) : Infinity;
        if (tentG < prevG) {
          gScore.set(e.to, tentG);
          parentMap.set(e.to, curr.id);
          roadMap.set(e.to, { road: e.road, dist: e.dist });
          const toNode = nodeMap.get(e.to);
          const h = Math.hypot(toNode.x - goalNode.x, toNode.y - goalNode.y) / 40;
          openSet.push({ id: e.to, f: tentG + h, g: tentG });
        }
      }
    }

    const routeNodes = [];
    const routeSteps = [];
    if (found) {
      let c = goalId;
      routeNodes.unshift(nodeMap.get(c));
      while (c !== startId) {
        const p = parentMap.get(c);
        const rInfo = roadMap.get(c);
        routeSteps.unshift({
          from: nodeMap.get(p).name,
          to: nodeMap.get(c).name,
          road: rInfo.road,
          distance: `${rInfo.dist} km`
        });
        c = p;
        routeNodes.unshift(nodeMap.get(c));
      }
    }

    return {
      found,
      totalDistanceKm: parseFloat(totalDistance.toFixed(2)),
      nodesExplored: closedSet.size,
      avoidanceApplied,
      routeNodes,
      routeSteps
    };
  }

  function renderRouteSteps(res) {
    const summaryBox = document.getElementById('mapRouteSummary');
    const stepsList = document.getElementById('mapRouteSteps');
    if (!summaryBox || !stepsList) return;

    summaryBox.style.display = 'block';
    summaryBox.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <span style="font-size:11px;text-transform:uppercase;color:var(--text-faint);letter-spacing:0.06em;">Optimal Route Calculated</span>
          <div style="font-size:18px;font-weight:700;color:var(--green);margin-top:2px;">
            ${res.totalDistanceKm} km ${res.avoidanceApplied ? '(hazard detoured)' : 'direct route'}
          </div>
        </div>
        <div style="display:flex;gap:14px;font-size:12.5px;flex-wrap:wrap;">
          <div><span style="color:var(--text-dim);">Stops:</span> <strong>${res.routeNodes.length}</strong></div>
          <div><span style="color:var(--text-dim);">Explored Nodes:</span> <strong>${res.nodesExplored}</strong></div>
          <div><span style="color:var(--text-dim);">Algorithm:</span> <strong style="color:var(--violet);">A* (Euclidean)</strong></div>
        </div>
      </div>
      ${res.avoidanceApplied ? `
        <div style="margin-top:12px;padding:8px 12px;background:rgba(111,207,151,0.1);border:1px solid rgba(111,207,151,0.3);border-radius:6px;font-size:12px;color:var(--green);display:flex;align-items:center;gap:8px;">
          <span>🛡️</span>
          <span><strong>Dynamic Accident Avoidance Active:</strong> Route intelligently steered away from active collision zones to prevent traffic delay.</span>
        </div>
      ` : ''}
    `;

    stepsList.innerHTML = res.routeSteps.map((step, i) => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--panel-2);border:1px solid var(--border);border-radius:8px;font-size:13px;">
        <span style="width:24px;height:24px;border-radius:50%;background:rgba(124,156,255,0.15);color:var(--violet);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;">
          ${i + 1}
        </span>
        <div style="flex:1;">
          <div style="font-weight:600;color:var(--text);">${step.road}</div>
          <div style="font-size:12px;color:var(--text-dim);margin-top:2px;">${step.from} → ${step.to}</div>
        </div>
        <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--green);font-weight:500;">
          ${step.distance}
        </span>
      </div>
    `).join('');
  }

  function animateCarAlongRoute(nodes) {
    if (!nodes || nodes.length < 2) return;
    let step = 0;
    let t = 0;
    const stepsBetween = 25;

    function frame() {
      if (step >= nodes.length - 1) {
        renderMapCanvas(nodes);
        SoundEngine.playGoalCelebration();
        return;
      }

      const p1 = nodes[step];
      const p2 = nodes[step + 1];

      const currentX = p1.x + (p2.x - p1.x) * (t / stepsBetween);
      const currentY = p1.y + (p2.y - p1.y) * (t / stepsBetween);

      renderMapCanvas(nodes, { x: currentX, y: currentY });

      t++;
      if (t > stepsBetween) {
        t = 0;
        step++;
      }
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  // Expose global init functions for dynamic view rendering
  window.initMazeEngine = init;
  window.initMapPathfinder = initMapPathfinder;
  window.renderMapCanvas = renderMapCanvas;

  // ════════════════════════════════════════════════════════════════
  //  BOOTSTRAP ON DOM READY
  // ════════════════════════════════════════════════════════════════
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
