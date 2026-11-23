// ============================================================================
// ТРИШАРОВИЙ РУШІЙ ВІЗУАЛІЗАЦІЇ ТА 3D-МАКЕТА СЮЖЕТУ (tali_e_sin)
// Шар 1: CodexPrimitives (фігури, лінії, текстові блоки з Кодексу)
// Шар 2: StoryGraphModel (топологія вузлів P(x, y, z) та локальні чернетки)
// Шар 3: StoryProjections (1D Текст, 2D Зверху+Збоку, 3D Інтерактивна сцена)
// ============================================================================

// --- ШАР 1: ПРИМІТИВИ ТА ГЕОМЕТРІЯ (читає офіційні фігури з Кодексу) ---
const CodexPrimitives = {
  getSystemPrimitives() {
    return (state?.codexEntries || []).filter(e => e.is_system_primitive);
  },

  getShapeSpec(shapeCode) {
    const prims = this.getSystemPrimitives();
    const found = prims.find(p => p.attributes?.primitive_code === shapeCode);
    return {
      code: shapeCode || 'rect_box',
      title: found?.title || 'Блок',
      formula1D: found?.attributes?.formula_1d || 'max(|x/a|, |y/b|) = 1',
      svg2D: found?.attributes?.svg_2d_shape || 'rect',
      mesh3D: found?.attributes?.mesh_3d_type || 'box'
    };
  },

  getArchetypes() {
    const list = (state?.codexEntries || []).filter(
      e => e.discipline_id === 'dramaturgy' && e.is_system_primitive
    );
    return list.length ? list : [
      { title: 'Експозиція / Теперішнє', attributes: { scene_code: 'exposition', default_z: '0', branch_kind: 'canon', recommended_shape: 'rect_box' } },
      { title: 'Зав’язка', attributes: { scene_code: 'inciting_incident', default_z: '25', branch_kind: 'canon', recommended_shape: 'oval_capsule' } },
      { title: 'Кульмінація', attributes: { scene_code: 'climax', default_z: '100', branch_kind: 'canon', recommended_shape: 'diamond_octahedron' } },
      { title: 'Занурення у минуле (Flashback)', attributes: { scene_code: 'flashback', default_z: '-65', branch_kind: 'flashback', recommended_shape: 'oval_capsule' } },
      { title: 'Прогноз / Гіпотеза (Forecast)', attributes: { scene_code: 'forecast', default_z: '65', branch_kind: 'forecast', recommended_shape: 'diamond_octahedron' } }
    ];
  },

  // Малює SVG-оболонку фігури в заданих координатах (cx, cy) з урахуванням масштабу
  renderSvgNodeShape({ shapeCode, cx, cy, w = 136, h = 48, fill = 'var(--bg-surface)', stroke = 'var(--accent)', strokeWidth = 2.2, dashed = false }) {
    const spec = this.getShapeSpec(shapeCode);
    const dashAttr = dashed ? 'stroke-dasharray="5 4"' : '';
    const hw = w / 2;
    const hh = h / 2;

    if (spec.svg2D === 'circle') {
      const r = Math.max(26, Math.min(hw, hh + 8));
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${dashAttr} />`;
    }
    if (spec.svg2D === 'ellipse') {
      return `<ellipse cx="${cx}" cy="${cy}" rx="${hw}" ry="${hh}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${dashAttr} />`;
    }
    if (spec.svg2D === 'polygon') {
      // Ромб / проекція октаедра
      const pts = `${cx},${cy - hh - 4} ${cx + hw + 6},${cy} ${cx},${cy + hh + 4} ${cx - hw - 6},${cy}`;
      return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${dashAttr} />`;
    }
    return `<rect x="${cx - hw}" y="${cy - hh}" width="${w}" height="${h}" rx="11" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${dashAttr} />`;
  },

  renderSvgEdge({ x1, y1, x2, y2, color = 'var(--accent)', branchKind = 'canon' }) {
    const midX = Math.round((x1 + x2) / 2);
    const dash = branchKind === 'forecast' ? 'stroke-dasharray="6 4"' : (branchKind === 'flashback' ? 'stroke-dasharray="2 3"' : '');
    return `<path d="M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="2.2" ${dash} />`;
  }
};

// --- ШАР 2: ТОПОЛОГІЯ ГРАФА СЮЖЕТУ ТА ЛОКАЛЬНІ ЧЕРНЕТКИ ---
const StoryGraphModel = {
  DRAFT_KEY: 'taliesin_story_3d_drafts_v1',

  getAllDrafts() {
    try {
      return JSON.parse(localStorage.getItem(this.DRAFT_KEY) || '{}');
    } catch {
      return {};
    }
  },

  saveDraft(universeKey, graphData) {
    const all = this.getAllDrafts();
    all[universeKey] = graphData;
    localStorage.setItem(this.DRAFT_KEY, JSON.stringify(all));
  },

  getGraphForUniverse(universeKey) {
    const drafts = this.getAllDrafts();
    if (drafts[universeKey]) return drafts[universeKey];

    // Якщо локальної чернетки ще немає — збираємо сцени з Кодексу для цього всесвіту
    const entries = (state?.codexEntries || []).filter(e =>
      !e.is_system_primitive &&
      (universeKey === 'all' || parseUniverseTags(e.universe).some(t => t.toLowerCase() === universeKey.toLowerCase()))
    );

    const nodes = entries.slice(0, 12).map((e, idx) => ({
      id: e.id,
      title: e.title,
      stepX: idx + 1,
      lineY: Number(e.attributes?.plot_line) || 1,
      zValue: Number(e.attributes?.default_z) || 0,
      branchKind: e.attributes?.branch_kind || 'canon',
      shapeCode: e.attributes?.recommended_shape || 'rect_box',
      color: e.visual_style?.color || ''
    }));

    const edges = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
    }

    return {
      universe: universeKey,
      plotLines: ['Основна лінія', 'Побічна лінія', 'Тіньова інтрига'],
      nodes,
      edges
    };
  }
};

// --- ШАР 3: ПРОЕКЦІЇ (1D Сценарій, 2D Зверху + Збоку, 3D Інтерактивна сцена) ---
const StoryProjections = {
  mode: '2d_split', // '1d' | '2d_split' | '3d'
  zMetric: 'time',    // 'time' (Минуле/Майбутнє) | 'tension' (Накал емоцій)
  yaw: -0.55,
  pitch: 0.38,
  zoom: 1.0,
  activeUniverse: 'all',

  LINE_COLORS: ['#c5962c', '#2e8b57', '#2b6cb0', '#805ad5', '#c53030', '#0d9488'],

  project3D(x, y, z) {
    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);
    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);

    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;
    const y2 = y * cosP - z1 * sinP;
    const z2 = y * sinP + z1 * cosP;

    const fov = 560;
    const scale = (fov / (fov + z2 + 240)) * this.zoom;
    return {
      sx: Math.round(360 + x1 * scale),
      sy: Math.round(215 + y2 * scale),
      scale,
      depth: z2
    };
  },

  renderWorkspace(containerId) {
    const root = document.getElementById(containerId);
    if (!root) return;

    const graph = StoryGraphModel.getGraphForUniverse(this.activeUniverse);
    const universes = deduplicateList(
      (state?.codexEntries || []).flatMap(e => parseUniverseTags(e.universe))
    );

    const headerHtml = `
      <div class="tree-controls-bar" style="margin-bottom:1rem;">
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
          <select id="storyUniverseSelect" class="input" style="min-width:190px;">
            <option value="all">🌌 Усі всесвіти (Загальний макет)</option>
            ${universes.map(u => `<option value="${escapeHtml(u)}" ${this.activeUniverse === u ? 'selected' : ''}>#${escapeHtml(u)}</option>`).join('')}
          </select>
          <button type="button" class="btn btn-primary" onclick="StoryProjections.openAddSceneModal()">+ Додати сцену</button>
          <button type="button" class="btn" onclick="StoryProjections.publishDraftToCodex()" title="Зберегти чернетку у хмару Supabase">☁️ Опублікувати</button>
        </div>

        <div class="tree-toggles">
          <div class="tabs" style="margin:0;">
            <button type="button" class="tab-btn ${this.mode === '1d' ? 'active' : ''}" onclick="StoryProjections.setMode('1d')">📜 1D Текст</button>
            <button type="button" class="tab-btn ${this.mode === '2d_split' ? 'active' : ''}" onclick="StoryProjections.setMode('2d_split')">📐 2D (Зверху + Збоку)</button>
            <button type="button" class="tab-btn ${this.mode === '3d' ? 'active' : ''}" onclick="StoryProjections.setMode('3d')">🧊 3D Сцена</button>
          </div>
          <button type="button" class="btn" style="padding:0.32rem 0.7rem; font-size:0.78rem;" onclick="StoryProjections.toggleZMetric()">
            ${this.zMetric === 'time' ? '⏳ Вісь Z: Час (Минуле/Прогноз)' : '🔥 Вісь Z: Накал емоцій'}
          </button>
        </div>
      </div>
    `;

    let bodyHtml = '';
    if (this.mode === '1d') {
      bodyHtml = this.render1DScenario(graph);
    } else if (this.mode === '2d_split') {
      bodyHtml = this.render2DSplitScenes(graph);
    } else {
      bodyHtml = this.render3DScene(graph);
    }

    root.innerHTML = `${headerHtml}${bodyHtml}`;

    document.getElementById('storyUniverseSelect')?.addEventListener('change', (e) => {
      this.activeUniverse = e.target.value;
      this.renderWorkspace(containerId);
    });

    if (this.mode === '3d') {
      this.bind3DDragEvents(containerId);
    }
  },

  setMode(m) { this.mode = m; this.renderWorkspace('story3DWorkspaceArea'); },
  toggleZMetric() { this.zMetric = this.zMetric === 'time' ? 'tension' : 'time'; this.renderWorkspace('story3DWorkspaceArea'); },

  // --- ПРОЕКЦІЯ 1D: Лінійний текст оповіді ---
  render1DScenario(graph) {
    const sorted = [...graph.nodes].sort((a, b) => a.stepX - b.stepX);
    if (!sorted.length) {
      return `<p class="subtitle">У цьому всесвіті ще немає сцен. Натисніть <strong>«+ Додати сцену»</strong>, щоб побудувати сюжет.</p>`;
    }

    return `
      <div class="timeline-track">
        ${sorted.map(n => {
          const lineName = graph.plotLines[(n.lineY || 1) - 1] || `Лінія ${n.lineY}`;
          const col = n.color || this.LINE_COLORS[(n.lineY - 1) % this.LINE_COLORS.length];
          const zLabel = n.zValue < 0
            ? `⏪ Спогад / Минуле (Z: ${n.zValue})`
            : (n.zValue > 0 ? `⏩ Прогноз / Пік (Z: +${n.zValue})` : '⏺ Теперішнє (Z: 0)');
          const shapeSpec = CodexPrimitives.getShapeSpec(n.shapeCode);

          return `
            <div class="timeline-step" style="border-left: 4px solid ${col};">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.4rem;">
                <div>
                  <span class="badge">Крок ${n.stepX}</span>
                  <span class="badge" style="color:${col};">${escapeHtml(lineName)}</span>
                  <span class="badge">${zLabel}</span>
                  <small class="subtitle" title="Формула примітиву">[${escapeHtml(shapeSpec.formula1D)}]</small>
                </div>
                <button type="button" class="btn btn-danger" style="padding:0.15rem 0.5rem; font-size:0.78rem;" onclick="StoryProjections.deleteNode('${n.id}')">✕</button>
              </div>
              <strong style="display:block; font-size:1.02rem; margin-top:0.35rem;">${escapeHtml(n.title)}</strong>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  // --- ПРОЕКЦІЯ 2D: Дві синхронні сцени (Вигляд зверху X-Y + Вигляд збоку X-Z) ---
  render2DSplitScenes(graph) {
    const nodes = graph.nodes;
    if (!nodes.length) {
      return `<p class="subtitle">Додайте першу сцену, щоб побачити одночасно переплетення сюжетних ліній (вигляд зверху) та часові стрибки/напругу (вигляд збоку).</p>`;
    }

    const maxStep = Math.max(4, ...nodes.map(n => n.stepX));
    const maxLine = Math.max(3, graph.plotLines.length, ...nodes.map(n => n.lineY));
    const stepW = 155;
    const svgW = Math.max(660, maxStep * stepW + 100);

    // 1. СЦЕНА А: ВИГЛЯД ЗВЕРХУ (X — хід оповіді, Y — сюжетні лінії та їх переплетення)
    const topH = maxLine * 74 + 40;
    const topPos = new Map();
    nodes.forEach(n => {
      topPos.set(n.id, {
        x: n.stepX * stepW - 40,
        y: (n.lineY - 1) * 74 + 46
      });
    });

    const topLinesBg = Array.from({ length: maxLine }, (_, i) => {
      const y = i * 74 + 46;
      const lbl = graph.plotLines[i] || `Лінія ${i + 1}`;
      return `
        <line x1="0" y1="${y}" x2="${svgW}" y2="${y}" stroke="var(--border)" stroke-dasharray="4 4" />
        <text x="10" y="${y - 10}" fill="var(--text-muted)" font-size="11" font-weight="600">${escapeHtml(lbl)}</text>
      `;
    }).join('');

    const topEdges = graph.edges.map(e => {
      const p1 = topPos.get(e.from);
      const p2 = topPos.get(e.to);
      const targetNode = nodes.find(n => n.id === e.to);
      if (!p1 || !p2) return '';
      const col = targetNode?.color || this.LINE_COLORS[((targetNode?.lineY || 1) - 1) % this.LINE_COLORS.length];
      return CodexPrimitives.renderSvgEdge({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, color: col, branchKind: targetNode?.branchKind });
    }).join('');

    const topNodes = nodes.map(n => {
      const p = topPos.get(n.id);
      const col = n.color || this.LINE_COLORS[((n.lineY || 1) - 1) % this.LINE_COLORS.length];
      const shape = CodexPrimitives.renderSvgNodeShape({
        shapeCode: n.shapeCode,
        cx: p.x,
        cy: p.y,
        w: 126,
        h: 40,
        stroke: col,
        dashed: n.branchKind === 'forecast'
      });
      return `
        <g style="cursor:pointer;" onclick="StoryProjections.deleteNode('${n.id}')">
          ${shape}
          <text x="${p.x}" y="${p.y + 4}" text-anchor="middle" fill="var(--text-main)" font-size="11.5" font-weight="600">
            ${escapeHtml(n.title.slice(0, 16))}
          </text>
        </g>
      `;
    }).join('');

    // 2. СЦЕНА Б: ВИГЛЯД ЗБОКУ (X — хід оповіді, Z — вгору: майбутнє/накал, вниз: спогади минулого)
    const sideH = 260;
    const zeroZ_Y = 130;
    const sidePos = new Map();
    nodes.forEach(n => {
      const clampedZ = Math.max(-100, Math.min(100, Number(n.zValue) || 0));
      sidePos.set(n.id, {
        x: n.stepX * stepW - 40,
        y: Math.round(zeroZ_Y - clampedZ * 0.95)
      });
    });

    const sideEdges = graph.edges.map(e => {
      const p1 = sidePos.get(e.from);
      const p2 = sidePos.get(e.to);
      const targetNode = nodes.find(n => n.id === e.to);
      if (!p1 || !p2) return '';
      const col = targetNode?.zValue < 0 ? '#3b82f6' : (targetNode?.zValue > 0 ? '#f59e0b' : 'var(--accent)');
      return CodexPrimitives.renderSvgEdge({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, color: col, branchKind: targetNode?.branchKind });
    }).join('');

    const sideNodes = nodes.map(n => {
      const p = sidePos.get(n.id);
      const col = n.zValue < 0 ? '#3b82f6' : (n.zValue > 0 ? '#f59e0b' : 'var(--accent)');
      const shape = CodexPrimitives.renderSvgNodeShape({
        shapeCode: n.shapeCode,
        cx: p.x,
        cy: p.y,
        w: 122,
        h: 36,
        stroke: col,
        dashed: n.branchKind === 'forecast'
      });
      return `
        <g>
          ${shape}
          <text x="${p.x}" y="${p.y + 4}" text-anchor="middle" fill="var(--text-main)" font-size="11" font-weight="600">
            ${escapeHtml(n.title.slice(0, 15))}
          </text>
        </g>
      `;
    }).join('');

    return `
      <div style="display:flex; flex-direction:column; gap:1rem;">
        <div class="tree-2d-viewport">
          <div style="padding:0.25rem 0.5rem; font-size:0.82rem; font-weight:700; color:var(--accent);">
            🛸 Вигляд зверху (X × Y) — Переплетення сюжетних ліній
          </div>
          <svg width="${svgW}" height="${topH}" viewBox="0 0 ${svgW} ${topH}">
            ${topLinesBg}
            ${topEdges}
            ${topNodes}
          </svg>
        </div>

        <div class="tree-2d-viewport">
          <div style="padding:0.25rem 0.5rem; font-size:0.82rem; font-weight:700; color:var(--accent);">
            📈 Вигляд збоку (X × Z) — ${this.zMetric === 'time' ? 'Вгору: Прогнози / Майбутнє · Вниз: Спогади минулого' : 'Крива емоційного накалу та кульмінацій'}
          </div>
          <svg width="${svgW}" height="${sideH}" viewBox="0 0 ${svgW} ${sideH}">
            <rect x="0" y="0" width="${svgW}" height="${zeroZ_Y}" fill="rgba(245, 158, 11, 0.05)" />
            <rect x="0" y="${zeroZ_Y}" width="${svgW}" height="${sideH - zeroZ_Y}" fill="rgba(59, 130, 246, 0.05)" />
            <line x1="0" y1="${zeroZ_Y}" x2="${svgW}" y2="${zeroZ_Y}" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="6 4" />
            <text x="10" y="18" fill="#d97706" font-size="11" font-weight="700">▲ ${this.zMetric === 'time' ? 'МАЙБУТНЄ / ПРОГНОЗИ (+Z)' : 'ПІК НАКАЛУ (+Z)'}</text>
            <text x="10" y="${zeroZ_Y - 6}" fill="var(--text-muted)" font-size="10">● БАЗОВА ЛІНІЯ (Z = 0)</text>
            <text x="10" y="${sideH - 10}" fill="#2563eb" font-size="11" font-weight="700">▼ ${this.zMetric === 'time' ? 'СПОГАДИ / МИНУЛЕ (-Z)' : 'СПАД НАПРУГИ (-Z)'}</text>
            ${sideEdges}
            ${sideNodes}
          </svg>
        </div>
      </div>
    `;
  },

  // --- ПРОЕКЦІЯ 3D: Інтерактивна просторова сцена ---
  render3DScene(graph) {
    const nodes = graph.nodes;
    if (!nodes.length) {
      return `<p class="subtitle">Додайте сцени, щоб оглянути тривимірний макет сюжету.</p>`;
    }

    const avgStep = nodes.reduce((s, n) => s + n.stepX, 0) / nodes.length;
    const projected = nodes.map(n => {
      const wx = (n.stepX - avgStep) * 110;
      const wy = ((n.lineY || 1) - 2) * 85;
      const wz = -(Number(n.zValue) || 0) * 1.4;
      const p = this.project3D(wx, wy, wz);
      return { node: n, ...p };
    });

    const posById = new Map(projected.map(p => [p.node.id, p]));

    // Осі координат у 3D
    const origin = this.project3D(0, 0, 0);
    const axisX = this.project3D(180, 0, 0);
    const axisY = this.project3D(0, 140, 0);
    const axisZ = this.project3D(0, 0, -140);

    const edgesSvg = graph.edges.map(e => {
      const p1 = posById.get(e.from);
      const p2 = posById.get(e.to);
      if (!p1 || !p2) return '';
      const col = p2.node.color || this.LINE_COLORS[((p2.node.lineY || 1) - 1) % this.LINE_COLORS.length];
      return CodexPrimitives.renderSvgEdge({ x1: p1.sx, y1: p1.sy, x2: p2.sx, y2: p2.sy, color: col, branchKind: p2.node.branchKind });
    }).join('');

    // Сортуємо вузли за глибиною (дальші малюються першими — алгоритм художника)
    const sortedByDepth = [...projected].sort((a, b) => b.depth - a.depth);

    const nodesSvg = sortedByDepth.map(item => {
      const n = item.node;
      const col = n.color || this.LINE_COLORS[((n.lineY || 1) - 1) % this.LINE_COLORS.length];
      const w = Math.round(124 * item.scale);
      const h = Math.round(38 * item.scale);
      const fontSize = Math.max(9, Math.round(11.5 * item.scale));
      const shape = CodexPrimitives.renderSvgNodeShape({
        shapeCode: n.shapeCode,
        cx: item.sx,
        cy: item.sy,
        w,
        h,
        stroke: col,
        dashed: n.branchKind === 'forecast'
      });

      return `
        <g>
          ${shape}
          <text x="${item.sx}" y="${item.sy + 4}" text-anchor="middle" fill="var(--text-main)" font-size="${fontSize}" font-weight="700">
            ${escapeHtml(n.title.slice(0, 16))}
          </text>
        </g>
      `;
    }).join('');

    return `
      <div class="tree-2d-viewport" style="user-select:none;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; padding:0.3rem 0.5rem;">
          <small class="subtitle">🖱️ Потягніть мишею або пальцем, щоб обертати 3D-макет у просторі</small>
          <div style="display:flex; gap:0.35rem;">
            <button type="button" class="btn" style="padding:0.2rem 0.6rem; font-size:0.78rem;" onclick="StoryProjections.zoom = Math.min(1.8, StoryProjections.zoom + 0.15); StoryProjections.renderWorkspace('story3DWorkspaceArea');">🔍 +</button>
            <button type="button" class="btn" style="padding:0.2rem 0.6rem; font-size:0.78rem;" onclick="StoryProjections.zoom = Math.max(0.5, StoryProjections.zoom - 0.15); StoryProjections.renderWorkspace('story3DWorkspaceArea');">🔍 −</button>
            <button type="button" class="btn" style="padding:0.2rem 0.6rem; font-size:0.78rem;" onclick="StoryProjections.yaw = -0.55; StoryProjections.pitch = 0.38; StoryProjections.zoom = 1; StoryProjections.renderWorkspace('story3DWorkspaceArea');">↺ Скинути ракурс</button>
          </div>
        </div>

        <svg id="story3DSvgCanvas" width="720" height="430" viewBox="0 0 720 430" style="width:100%; height:430px; cursor:grab; display:block;">
          <!-- Осі X, Y, Z -->
          <line x1="${origin.sx}" y1="${origin.sy}" x2="${axisX.sx}" y2="${axisX.sy}" stroke="var(--text-muted)" stroke-dasharray="3 3" />
          <text x="${axisX.sx + 6}" y="${axisX.sy}" fill="var(--text-muted)" font-size="11">X (Сюжет)</text>

          <line x1="${origin.sx}" y1="${origin.sy}" x2="${axisY.sx}" y2="${axisY.sy}" stroke="var(--text-muted)" stroke-dasharray="3 3" />
          <text x="${axisY.sx + 6}" y="${axisY.sy}" fill="var(--text-muted)" font-size="11">Y (Лінії)</text>

          <line x1="${origin.sx}" y1="${origin.sy}" x2="${axisZ.sx}" y2="${axisZ.sy}" stroke="var(--accent)" stroke-dasharray="3 3" />
          <text x="${axisZ.sx + 6}" y="${axisZ.sy}" fill="var(--accent)" font-size="11">Z (Час / Накал)</text>

          ${edgesSvg}
          ${nodesSvg}
        </svg>
      </div>
    `;
  },

  bind3DDragEvents(containerId) {
    const svg = document.getElementById('story3DSvgCanvas');
    if (!svg) return;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onDown = (x, y) => { dragging = true; lastX = x; lastY = y; svg.style.cursor = 'grabbing'; };
    const onMove = (x, y) => {
      if (!dragging) return;
      this.yaw += (x - lastX) * 0.008;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + (y - lastY) * 0.008));
      lastX = x;
      lastY = y;
      this.renderWorkspace(containerId);
    };
    const onUp = () => { dragging = false; svg.style.cursor = 'grab'; };

    svg.onmousedown = (e) => onDown(e.clientX, e.clientY);
    window.onmousemove = (e) => onMove(e.clientX, e.clientY);
    window.onmouseup = onUp;
  },

  openAddSceneModal() {
    const graph = StoryGraphModel.getGraphForUniverse(this.activeUniverse);
    const archetypes = CodexPrimitives.getArchetypes();
    const shapes = CodexPrimitives.getSystemPrimitives().filter(p => p.discipline_id === 'geometry');
    const nextStep = graph.nodes.length ? Math.max(...graph.nodes.map(n => n.stepX)) + 1 : 1;

    openModal(`
      <span class="badge">🎬 Нова сцена у 3D-макеті</span>
      <h2 style="margin-top:0.5rem;">Всесвіт: ${this.activeUniverse === 'all' ? 'Загальний' : `#${escapeHtml(this.activeUniverse)}`}</h2>

      <form id="add3DSceneForm" class="stack-form" style="margin-top:1rem;">
        <input type="text" id="s3dTitle" class="input" placeholder="Назва сцени / події (напр., Клятва у святилищі)" required />

        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
          <select id="s3dArchetype" class="input" style="flex:1;">
            ${archetypes.map((a, idx) => `<option value="${idx}">${escapeHtml(a.title)}</option>`).join('')}
          </select>
          <select id="s3dShape" class="input" style="flex:1;">
            ${shapes.length
              ? shapes.map(s => `<option value="${escapeHtml(s.attributes?.primitive_code || 'rect_box')}">${escapeHtml(s.title)}</option>`).join('')
              : `<option value="rect_box">Прямокутник</option><option value="oval_capsule">Овал / Капсула</option><option value="diamond_octahedron">Ромб / Октаедр</option><option value="circle_sphere">Коло / Куля</option>`}
          </select>
        </div>

        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
          <div style="flex:1;">
            <small class="subtitle">Крок оповіді (X)</small>
            <input type="number" id="s3dStepX" class="input" value="${nextStep}" min="1" required />
          </div>
          <div style="flex:1;">
            <small class="subtitle">Сюжетна лінія (Y: 1, 2, 3...)</small>
            <input type="number" id="s3dLineY" class="input" value="1" min="1" max="10" required />
          </div>
          <div style="flex:1;">
            <small class="subtitle">Вісь Z (-100 минуле .. +100 прогноз/накал)</small>
            <input type="number" id="s3dZVal" class="input" value="0" min="-100" max="100" required />
          </div>
        </div>

        <select id="s3dFromNode" class="input">
          <option value="">-- Продовжити від попередньої сцени (необов'язково) --</option>
          ${graph.nodes.map(n => `<option value="${n.id}">Крок ${n.stepX}: ${escapeHtml(n.title)}</option>`).join('')}
        </select>

        <button type="submit" class="btn btn-primary">Додати сцену в чернетку</button>
      </form>
    `);

    const archSelect = document.getElementById('s3dArchetype');
    archSelect.onchange = () => {
      const arch = archetypes[Number(archSelect.value)];
      if (arch?.attributes) {
        document.getElementById('s3dZVal').value = arch.attributes.default_z || 0;
        if (arch.attributes.recommended_shape && document.getElementById('s3dShape')) {
          document.getElementById('s3dShape').value = arch.attributes.recommended_shape;
        }
      }
    };

    document.getElementById('add3DSceneForm').onsubmit = (e) => {
      e.preventDefault();
      const arch = archetypes[Number(archSelect.value)];
      const newNode = {
        id: 'sc_' + Date.now(),
        title: document.getElementById('s3dTitle').value.trim(),
        stepX: Number(document.getElementById('s3dStepX').value) || 1,
        lineY: Number(document.getElementById('s3dLineY').value) || 1,
        zValue: Number(document.getElementById('s3dZVal').value) || 0,
        branchKind: arch?.attributes?.branch_kind || 'canon',
        shapeCode: document.getElementById('s3dShape').value || 'rect_box',
        color: ''
      };

      graph.nodes.push(newNode);
      const fromId = document.getElementById('s3dFromNode').value || (graph.nodes.length > 1 ? graph.nodes[graph.nodes.length - 2].id : '');
      if (fromId && fromId !== newNode.id) {
        graph.edges.push({ from: fromId, to: newNode.id });
      }

      StoryGraphModel.saveDraft(this.activeUniverse, graph);
      closeModal();
      this.renderWorkspace('story3DWorkspaceArea');
    };
  },

  deleteNode(nodeId) {
    const graph = StoryGraphModel.getGraphForUniverse(this.activeUniverse);
    graph.nodes = graph.nodes.filter(n => n.id !== nodeId);
    graph.edges = graph.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
    StoryGraphModel.saveDraft(this.activeUniverse, graph);
    this.renderWorkspace('story3DWorkspaceArea');
  },

  async publishDraftToCodex() {
    if (!getCurrentUser()) return openAuthModal();
    const graph = StoryGraphModel.getGraphForUniverse(this.activeUniverse);
    if (!graph.nodes.length) return alert('Немає сцен для публікації.');

    try {
      for (const n of graph.nodes) {
        if (String(n.id).startsWith('sc_')) {
          await TaliesinAPI.createCodexEntry({
            title: n.title,
            category: 'Драматургія та Архетипи сцен',
            disciplineId: 'dramaturgy',
            universe: this.activeUniverse === 'all' ? '' : this.activeUniverse,
            description: `Сюжетна сцена (Крок ${n.stepX}, Лінія ${n.lineY}, Z: ${n.zValue})`,
            attributes: {
              default_z: String(n.zValue),
              branch_kind: n.branchKind,
              recommended_shape: n.shapeCode,
              plot_line: String(n.lineY)
            },
            isShared: true
          });
        }
      }
      await refresh();
      alert('Сюжетні сцени успішно опубліковано в Кодекс всесвіту!');
    } catch (err) {
      alert(err.message);
    }
  }
};