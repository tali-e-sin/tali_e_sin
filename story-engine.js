// ============================================================================
// ТРИШАРОВИЙ РУШІЙ ВІЗУАЛІЗАЦІЇ ТА 3D-МАКЕТА СЮЖЕТУ (tali_e_sin)
// ============================================================================

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

const StoryGraphModel = {
  DRAFT_KEY: 'taliesin_story_3d_drafts_v1',

  getAllDrafts() {
    try { return JSON.parse(localStorage.getItem(this.DRAFT_KEY) || '{}'); } catch { return {}; }
  },

  saveDraft(universeKey, graphData) {
    const all = this.getAllDrafts();
    all[universeKey] = graphData;
    localStorage.setItem(this.DRAFT_KEY, JSON.stringify(all));
  },

  getGraphForUniverse(universeKey) {
    const drafts = this.getAllDrafts();
    if (drafts[universeKey]) return drafts[universeKey];

    const entries = (state?.codexEntries || []).filter(e =>
      !e.is_system_primitive &&
      e.discipline_id === 'dramaturgy' &&
      (universeKey === 'all' || parseUniverseTags(e.universe).some(t => t.toLowerCase() === universeKey.toLowerCase()))
    );

    const nodes = entries.map((e, idx) => ({
      id: e.id,
      title: e.title,
      stepX: Number(e.attributes?.step_x) || (idx + 1),
      lineY: Number(e.attributes?.plot_line) || 1,
      zValue: Number(e.attributes?.default_z) || 0,
      branchKind: e.attributes?.branch_kind || 'canon',
      shapeCode: e.attributes?.recommended_shape || 'rect_box',
      color: e.visual_style?.color || ''
    }));

    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = (state?.codexRelations || [])
      .filter(r => nodeIds.has(r.source_id) && nodeIds.has(r.target_id))
      .map(r => ({ from: r.source_id, to: r.target_id }));

    return {
      universe: universeKey,
      plotLines: ['Основна лінія', 'Побічна лінія', 'Тіньова інтрига', 'Лінія спогадів'],
      nodes,
      edges
    };
  }
};

const StoryProjections = {
  mode: '2d_split',
  zMetric: 'time',
  yaw: -0.55,
  pitch: 0.38,
  zoom: 1.0,
  activeUniverse: 'all',
  selectedNodeId: null,

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

  renderWorkspace(containerId = 'story3DWorkspaceArea') {
    const root = document.getElementById(containerId);
    if (!root) return;

    const graph = StoryGraphModel.getGraphForUniverse(this.activeUniverse);
    const universes = deduplicateList(
      (state?.codexEntries || []).flatMap(e => parseUniverseTags(e.universe))
    );

    const selNode = graph.nodes.find(n => n.id === this.selectedNodeId) || null;

    const headerHtml = `
      <div class="tree-controls-bar" style="margin-bottom:0.85rem;">
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
            ${this.zMetric === 'time' ? '⏳ Вісь Z: Час' : '🔥 Вісь Z: Накал'}
          </button>
        </div>
      </div>

      ${selNode ? `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; padding:0.6rem 0.85rem; margin-bottom:0.9rem; background:var(--accent-soft); border:1px solid var(--accent); border-radius:12px;">
          <div>
            <strong>🎯 Обрана сцена: «${escapeHtml(selNode.title)}»</strong>
            <small class="subtitle" style="margin-left:0.4rem;">Крок X: ${selNode.stepX} · Лінія Y: ${selNode.lineY} · Висота Z: ${selNode.zValue}</small>
          </div>
          <div style="display:flex; gap:0.3rem; flex-wrap:wrap;">
            <button type="button" class="btn" style="padding:0.22rem 0.55rem; font-size:0.78rem;" onclick="StoryProjections.nudgeNode('${selNode.id}', { dz: 20 })" title="Підняти вгору по осі Z (майбутнє / вищий накал)">▲ +Z</button>
            <button type="button" class="btn" style="padding:0.22rem 0.55rem; font-size:0.78rem;" onclick="StoryProjections.nudgeNode('${selNode.id}', { dz: -20 })" title="Опустити вниз по осі Z (минуле / спогад)">▼ −Z</button>
            <button type="button" class="btn" style="padding:0.22rem 0.55rem; font-size:0.78rem;" onclick="StoryProjections.nudgeNode('${selNode.id}', { dy: -1 })" title="Перемістити на лінію вище">↑ Лінія</button>
            <button type="button" class="btn" style="padding:0.22rem 0.55rem; font-size:0.78rem;" onclick="StoryProjections.nudgeNode('${selNode.id}', { dy: 1 })" title="Перемістити на лінію нижче">↓ Лінія</button>
            <button type="button" class="btn" style="padding:0.22rem 0.55rem; font-size:0.78rem;" onclick="StoryProjections.nudgeNode('${selNode.id}', { dx: -1 })">← Крок</button>
            <button type="button" class="btn" style="padding:0.22rem 0.55rem; font-size:0.78rem;" onclick="StoryProjections.nudgeNode('${selNode.id}', { dx: 1 })">Крок →</button>
            <button type="button" class="btn btn-primary" style="padding:0.22rem 0.6rem; font-size:0.78rem;" onclick="StoryProjections.openAddSceneModal('${selNode.id}')">+ Нащадок</button>
            <button type="button" class="btn" style="padding:0.22rem 0.6rem; font-size:0.78rem;" onclick="StoryProjections.openEditSceneModal('${selNode.id}')">✏️</button>
            <button type="button" class="btn btn-danger" style="padding:0.22rem 0.6rem; font-size:0.78rem;" onclick="StoryProjections.deleteNode('${selNode.id}')">✕</button>
          </div>
        </div>
      ` : ''}
    `;

    let bodyHtml = '';
    if (this.mode === '1d') bodyHtml = this.render1DScenario(graph);
    else if (this.mode === '2d_split') bodyHtml = this.render2DSplitScenes(graph);
    else bodyHtml = this.render3DScene(graph);

    root.innerHTML = `${headerHtml}${bodyHtml}`;

    document.getElementById('storyUniverseSelect')?.addEventListener('change', (e) => {
      this.activeUniverse = e.target.value;
      this.selectedNodeId = null;
      this.renderWorkspace(containerId);
    });

    if (this.mode === '2d_split') this.bind2DDragEvents(containerId);
    if (this.mode === '3d') this.bind3DDragEvents(containerId);
  },

  setMode(m) { this.mode = m; this.renderWorkspace('story3DWorkspaceArea'); },
  toggleZMetric() { this.zMetric = this.zMetric === 'time' ? 'tension' : 'time'; this.renderWorkspace('story3DWorkspaceArea'); },
  selectNode(id) { this.selectedNodeId = id; this.renderWorkspace('story3DWorkspaceArea'); },

  nudgeNode(nodeId, { dx = 0, dy = 0, dz = 0 }) {
    const graph = StoryGraphModel.getGraphForUniverse(this.activeUniverse);
    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.stepX = Math.max(1, (Number(node.stepX) || 1) + dx);
    node.lineY = Math.max(1, Math.min(8, (Number(node.lineY) || 1) + dy));
    node.zValue = Math.max(-100, Math.min(100, (Number(node.zValue) || 0) + dz));
    StoryGraphModel.saveDraft(this.activeUniverse, graph);
    this.renderWorkspace('story3DWorkspaceArea');
  },

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
            ? `⏪ Спогад (Z: ${n.zValue})`
            : (n.zValue > 0 ? `⏩ Прогноз / Пік (Z: +${n.zValue})` : '⏺ Теперішнє (Z: 0)');
          const shapeSpec = CodexPrimitives.getShapeSpec(n.shapeCode);

          return `
            <div class="timeline-step" style="border-left: 4px solid ${col}; cursor:pointer;" onclick="StoryProjections.selectNode('${n.id}')">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.4rem;">
                <div>
                  <span class="badge">Крок ${n.stepX}</span>
                  <span class="badge" style="color:${col};">${escapeHtml(lineName)}</span>
                  <span class="badge">${zLabel}</span>
                  <small class="subtitle">[${escapeHtml(shapeSpec.formula1D)}]</small>
                </div>
                <div style="display:flex; gap:0.3rem;">
                  <button type="button" class="btn" style="padding:0.15rem 0.5rem; font-size:0.78rem;" onclick="event.stopPropagation(); StoryProjections.openEditSceneModal('${n.id}')">✏️</button>
                  <button type="button" class="btn btn-danger" style="padding:0.15rem 0.5rem; font-size:0.78rem;" onclick="event.stopPropagation(); StoryProjections.deleteNode('${n.id}')">✕</button>
                </div>
              </div>
              <strong style="display:block; font-size:1.02rem; margin-top:0.35rem;">${escapeHtml(n.title)}</strong>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  render2DSplitScenes(graph) {
    const nodes = graph.nodes;
    if (!nodes.length) {
      return `<p class="subtitle">Додайте першу сцену, щоб побачити вигляд зверху (сюжетні лінії) та вигляд збоку (часові стрибки/накал) і рухати фігури вгору/вниз.</p>`;
    }

    const maxStep = Math.max(5, ...nodes.map(n => n.stepX));
    const maxLine = Math.max(3, graph.plotLines.length, ...nodes.map(n => n.lineY));
    const stepW = 160;
    const svgW = Math.max(680, maxStep * stepW + 100);

    // 1. Вигляд зверху (X × Y)
    const topH = maxLine * 74 + 40;
    const topPos = new Map();
    nodes.forEach(n => {
      topPos.set(n.id, { x: n.stepX * stepW - 40, y: (n.lineY - 1) * 74 + 46 });
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
      const isSel = n.id === this.selectedNodeId;
      const col = n.color || this.LINE_COLORS[((n.lineY || 1) - 1) % this.LINE_COLORS.length];
      const shape = CodexPrimitives.renderSvgNodeShape({
        shapeCode: n.shapeCode, cx: p.x, cy: p.y, w: 126, h: 40,
        stroke: col, strokeWidth: isSel ? 3.5 : 2.2, dashed: n.branchKind === 'forecast'
      });
      return `
        <g class="story-draggable-node" data-axis="top" data-node-id="${n.id}" style="cursor:grab;">
          ${shape}
          <text x="${p.x}" y="${p.y + 4}" text-anchor="middle" fill="var(--text-main)" font-size="11.5" font-weight="600" style="pointer-events:none;">
            ${escapeHtml(n.title.slice(0, 16))}
          </text>
        </g>
      `;
    }).join('');

    // 2. Вигляд збоку (X × Z)
    const sideH = 260;
    const zeroZ_Y = 130;
    const sidePos = new Map();
    nodes.forEach(n => {
      const clampedZ = Math.max(-100, Math.min(100, Number(n.zValue) || 0));
      sidePos.set(n.id, { x: n.stepX * stepW - 40, y: Math.round(zeroZ_Y - clampedZ * 0.95) });
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
      const isSel = n.id === this.selectedNodeId;
      const col = n.zValue < 0 ? '#3b82f6' : (n.zValue > 0 ? '#f59e0b' : 'var(--accent)');
      const shape = CodexPrimitives.renderSvgNodeShape({
        shapeCode: n.shapeCode, cx: p.x, cy: p.y, w: 122, h: 36,
        stroke: col, strokeWidth: isSel ? 3.5 : 2.2, dashed: n.branchKind === 'forecast'
      });
      return `
        <g class="story-draggable-node" data-axis="side" data-node-id="${n.id}" style="cursor:ns-resize;">
          ${shape}
          <text x="${p.x}" y="${p.y + 4}" text-anchor="middle" fill="var(--text-main)" font-size="11" font-weight="600" style="pointer-events:none;">
            ${escapeHtml(n.title.slice(0, 15))}
          </text>
        </g>
      `;
    }).join('');

    return `
      <div style="display:flex; flex-direction:column; gap:1rem;">
        <div class="tree-2d-viewport">
          <div style="padding:0.25rem 0.5rem; font-size:0.82rem; font-weight:700; color:var(--accent);">
            🛸 Вигляд зверху (X × Y) — Перетягуйте фігури між сюжетними лініями або клікайте для редагування
          </div>
          <svg id="storyTopSvg" width="${svgW}" height="${topH}" viewBox="0 0 ${svgW} ${topH}">
            ${topLinesBg}
            ${topEdges}
            ${topNodes}
          </svg>
        </div>

        <div class="tree-2d-viewport">
          <div style="padding:0.25rem 0.5rem; font-size:0.82rem; font-weight:700; color:var(--accent);">
            📈 Вигляд збоку (X × Z) — Потягніть фігуру вгору (майбутнє/прогноз/накал) або вниз (спогад минулого)
          </div>
          <svg id="storySideSvg" width="${svgW}" height="${sideH}" viewBox="0 0 ${svgW} ${sideH}">
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

  bind2DDragEvents(containerId) {
    let dragState = null;

    document.querySelectorAll('.story-draggable-node').forEach(el => {
      el.onmousedown = (e) => {
        e.stopPropagation();
        const nodeId = el.dataset.nodeId;
        const axis = el.dataset.axis;
        this.selectedNodeId = nodeId;
        dragState = { nodeId, axis, startX: e.clientX, startY: e.clientY, moved: false };
      };
    });

    window.onmousemove = (e) => {
      if (!dragState) return;
      const dxPx = e.clientX - dragState.startX;
      const dyPx = e.clientY - dragState.startY;
      if (Math.abs(dxPx) > 4 || Math.abs(dyPx) > 4) dragState.moved = true;
    };

    window.onmouseup = (e) => {
      if (!dragState) return;
      const { nodeId, axis, startX, startY, moved } = dragState;
      dragState = null;

      if (!moved) {
        this.renderWorkspace(containerId);
        return;
      }

      const graph = StoryGraphModel.getGraphForUniverse(this.activeUniverse);
      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) return;

      const stepDelta = Math.round((e.clientX - startX) / 140);
      node.stepX = Math.max(1, (Number(node.stepX) || 1) + stepDelta);

      if (axis === 'top') {
        const lineDelta = Math.round((e.clientY - startY) / 65);
        node.lineY = Math.max(1, Math.min(8, (Number(node.lineY) || 1) + lineDelta));
      } else {
        const zDelta = -Math.round((e.clientY - startY) / 0.95);
        node.zValue = Math.max(-100, Math.min(100, (Number(node.zValue) || 0) + zDelta));
      }

      StoryGraphModel.saveDraft(this.activeUniverse, graph);
      this.renderWorkspace(containerId);
    };
  },

  render3DScene(graph) {
    const nodes = graph.nodes;
    if (!nodes.length) return `<p class="subtitle">Додайте сцени, щоб оглянути тривимірний макет сюжету.</p>`;

    const avgStep = nodes.reduce((s, n) => s + n.stepX, 0) / nodes.length;
    const projected = nodes.map(n => {
      const wx = (n.stepX - avgStep) * 110;
      const wy = ((n.lineY || 1) - 2) * 85;
      const wz = -(Number(n.zValue) || 0) * 1.4;
      const p = this.project3D(wx, wy, wz);
      return { node: n, ...p };
    });

    const posById = new Map(projected.map(p => [p.node.id, p]));
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

    const sortedByDepth = [...projected].sort((a, b) => b.depth - a.depth);
    const nodesSvg = sortedByDepth.map(item => {
      const n = item.node;
      const col = n.color || this.LINE_COLORS[((n.lineY || 1) - 1) % this.LINE_COLORS.length];
      const w = Math.round(124 * item.scale);
      const h = Math.round(38 * item.scale);
      const fontSize = Math.max(9, Math.round(11.5 * item.scale));
      const shape = CodexPrimitives.renderSvgNodeShape({
        shapeCode: n.shapeCode, cx: item.sx, cy: item.sy, w, h, stroke: col, dashed: n.branchKind === 'forecast'
      });

      return `
        <g style="cursor:pointer;" onclick="StoryProjections.selectNode('${n.id}')">
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
          <small class="subtitle">🖱️ Потягніть мишею, щоб обертати 3D-макет · Клік по сцені виділяє її</small>
          <div style="display:flex; gap:0.35rem;">
            <button type="button" class="btn" style="padding:0.2rem 0.6rem; font-size:0.78rem;" onclick="StoryProjections.zoom = Math.min(1.8, StoryProjections.zoom + 0.15); StoryProjections.renderWorkspace('story3DWorkspaceArea');">🔍 +</button>
            <button type="button" class="btn" style="padding:0.2rem 0.6rem; font-size:0.78rem;" onclick="StoryProjections.zoom = Math.max(0.5, StoryProjections.zoom - 0.15); StoryProjections.renderWorkspace('story3DWorkspaceArea');">🔍 −</button>
            <button type="button" class="btn" style="padding:0.2rem 0.6rem; font-size:0.78rem;" onclick="StoryProjections.yaw = -0.55; StoryProjections.pitch = 0.38; StoryProjections.zoom = 1; StoryProjections.renderWorkspace('story3DWorkspaceArea');">↺ Скинути</button>
          </div>
        </div>

        <svg id="story3DSvgCanvas" width="720" height="430" viewBox="0 0 720 430" style="width:100%; height:430px; cursor:grab; display:block;">
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

    svg.onmousedown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; svg.style.cursor = 'grabbing'; };
    window.onmousemove = (e) => {
      if (!dragging) return;
      this.yaw += (e.clientX - lastX) * 0.008;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + (e.clientY - lastY) * 0.008));
      lastX = e.clientX;
      lastY = e.clientY;
      this.renderWorkspace(containerId);
    };
    window.onmouseup = () => { dragging = false; svg.style.cursor = 'grab'; };
  },

  openAddSceneModal(defaultParentId = '') {
    const graph = StoryGraphModel.getGraphForUniverse(this.activeUniverse);
    const parentNode = graph.nodes.find(n => n.id === defaultParentId) || null;
    const archetypes = CodexPrimitives.getArchetypes();
    const shapes = CodexPrimitives.getSystemPrimitives().filter(p => p.discipline_id === 'geometry');
    const nextStep = parentNode ? (parentNode.stepX + 1) : (graph.nodes.length ? Math.max(...graph.nodes.map(n => n.stepX)) + 1 : 1);

    openModal(`
      <span class="badge">🎬 Нова сцена у 3D-макеті</span>
      <h2 style="margin-top:0.5rem;">${parentNode ? `Продовження від: «${escapeHtml(parentNode.title)}»` : `Всесвіт: ${this.activeUniverse === 'all' ? 'Загальний' : `#${escapeHtml(this.activeUniverse)}`}`}</h2>

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
            <small class="subtitle">Сюжетна лінія (Y)</small>
            <input type="number" id="s3dLineY" class="input" value="${parentNode ? parentNode.lineY : 1}" min="1" max="8" required />
          </div>
          <div style="flex:1;">
            <small class="subtitle">Вісь Z (-100..+100)</small>
            <input type="number" id="s3dZVal" class="input" value="0" min="-100" max="100" required />
          </div>
        </div>

        <select id="s3dFromNode" class="input">
          <option value="">-- Продовжити від попередньої сцени (необов'язково) --</option>
          ${graph.nodes.map(n => `<option value="${n.id}" ${n.id === defaultParentId ? 'selected' : ''}>Крок ${n.stepX}: ${escapeHtml(n.title)}</option>`).join('')}
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
      const fromId = document.getElementById('s3dFromNode').value;
      if (fromId && fromId !== newNode.id) {
        graph.edges.push({ from: fromId, to: newNode.id });
      }

      this.selectedNodeId = newNode.id;
      StoryGraphModel.saveDraft(this.activeUniverse, graph);
      closeModal();
      this.renderWorkspace('story3DWorkspaceArea');
    };
  },

  openEditSceneModal(nodeId) {
    const graph = StoryGraphModel.getGraphForUniverse(this.activeUniverse);
    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const shapes = CodexPrimitives.getSystemPrimitives().filter(p => p.discipline_id === 'geometry');

    openModal(`
      <span class="badge">✏️ Редагування сцени сюжету</span>
      <h2 style="margin-top:0.5rem;">${escapeHtml(node.title)}</h2>
      <form id="edit3DSceneForm" class="stack-form" style="margin-top:1rem;">
        <input type="text" id="e3dTitle" class="input" required />
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
          <select id="e3dShape" class="input" style="flex:1;">
            ${shapes.length
              ? shapes.map(s => `<option value="${escapeHtml(s.attributes?.primitive_code || 'rect_box')}">${escapeHtml(s.title)}</option>`).join('')
              : `<option value="rect_box">Прямокутник</option><option value="oval_capsule">Овал / Капсула</option><option value="diamond_octahedron">Ромб / Октаедр</option><option value="circle_sphere">Коло / Куля</option>`}
          </select>
          <select id="e3dBranch" class="input" style="flex:1;">
            <option value="canon">Канонічний хід подій</option>
            <option value="flashback">Спогад минулого (Flashback)</option>
            <option value="forecast">Прогноз / Варіант майбутнього</option>
          </select>
        </div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
          <input type="number" id="e3dStepX" class="input" style="flex:1;" min="1" required />
          <input type="number" id="e3dLineY" class="input" style="flex:1;" min="1" max="8" required />
          <input type="number" id="e3dZVal" class="input" style="flex:1;" min="-100" max="100" required />
        </div>
        <button type="submit" class="btn btn-primary">Зберегти сцену</button>
      </form>
    `);

    document.getElementById('e3dTitle').value = node.title;
    document.getElementById('e3dShape').value = node.shapeCode || 'rect_box';
    document.getElementById('e3dBranch').value = node.branchKind || 'canon';
    document.getElementById('e3dStepX').value = node.stepX;
    document.getElementById('e3dLineY').value = node.lineY;
    document.getElementById('e3dZVal').value = node.zValue;

    document.getElementById('edit3DSceneForm').onsubmit = (e) => {
      e.preventDefault();
      node.title = document.getElementById('e3dTitle').value.trim();
      node.shapeCode = document.getElementById('e3dShape').value;
      node.branchKind = document.getElementById('e3dBranch').value;
      node.stepX = Number(document.getElementById('e3dStepX').value) || 1;
      node.lineY = Number(document.getElementById('e3dLineY').value) || 1;
      node.zValue = Number(document.getElementById('e3dZVal').value) || 0;
      StoryGraphModel.saveDraft(this.activeUniverse, graph);
      closeModal();
      this.renderWorkspace('story3DWorkspaceArea');
    };
  },

  deleteNode(nodeId) {
    const graph = StoryGraphModel.getGraphForUniverse(this.activeUniverse);
    graph.nodes = graph.nodes.filter(n => n.id !== nodeId);
    graph.edges = graph.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
    if (this.selectedNodeId === nodeId) this.selectedNodeId = null;
    StoryGraphModel.saveDraft(this.activeUniverse, graph);
    this.renderWorkspace('story3DWorkspaceArea');
  },

  async publishDraftToCodex() {
    if (!getCurrentUser()) return openAuthModal();
    const graph = StoryGraphModel.getGraphForUniverse(this.activeUniverse);
    if (!graph.nodes.length) return alert('Немає сцен для публікації.');

    try {
      const idMap = new Map();
      for (const n of graph.nodes) {
        if (String(n.id).startsWith('sc_')) {
          const created = await TaliesinAPI.createCodexEntry({
            title: n.title,
            category: 'Драматургія та Архетипи сцен',
            disciplineId: 'dramaturgy',
            universe: this.activeUniverse === 'all' ? '' : this.activeUniverse,
            description: `Сюжетна сцена (Крок ${n.stepX}, Лінія ${n.lineY}, Z: ${n.zValue})`,
            attributes: {
              step_x: String(n.stepX),
              default_z: String(n.zValue),
              branch_kind: n.branchKind,
              recommended_shape: n.shapeCode,
              plot_line: String(n.lineY)
            },
            isShared: true
          });
          idMap.set(n.id, created.id);
          n.id = created.id;
        } else {
          idMap.set(n.id, n.id);
        }
      }

      for (const edge of graph.edges) {
        const realFrom = idMap.get(edge.from);
        const realTo = idMap.get(edge.to);
        if (realFrom && realTo) {
          edge.from = realFrom;
          edge.to = realTo;
          await TaliesinAPI.createCodexRelation({
            sourceId: realFrom,
            targetId: realTo,
            diagramType: 'tree',
            roleLabel: 'Сюжетний перехід'
          });
        }
      }

      StoryGraphModel.saveDraft(this.activeUniverse, graph);
      await refresh();
      this.renderWorkspace('story3DWorkspaceArea');
      alert('Сюжетні сцени та зв’язки між ними успішно опубліковано в Кодекс!');
    } catch (err) {
      alert(err.message);
    }
  }
};

// ============================================================================
// УНІВЕРСАЛЬНИЙ ПРОЕКТОР 1D / 2D / 3D ДЛЯ ДІАГРАМ КОДЕКСУ, КНИГ ТА СТАТЕЙ
// ============================================================================
const UniversalProjectionEngine = {
  yaw: -0.45,
  pitch: 0.32,
  zoom: 1.0,

  projectPoint(x, y, z, cx = 360, cy = 215) {
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
      sx: Math.round(cx + x1 * scale),
      sy: Math.round(cy + y2 * scale),
      scale,
      depth: z2
    };
  },

  // Побудова 3D-графа для будь-якої сутності Кодексу (дерево, кільця, хронологія, мережа)
  buildCodexEntityGraph3D(rootId, diagramType = 'tree') {
    const entries = state?.codexEntries || [];
    const relations = state?.codexRelations || [];
    const root = entries.find(e => e.id === rootId);
    if (!root) return { nodes: [], edges: [] };

    const nodes = [];
    const edges = [];
    const added = new Set();

    const pushNode = (entry, x, y, z, shapeCode = 'rect_box', color = '') => {
      if (!entry || added.has(entry.id)) return;
      added.add(entry.id);
      nodes.push({
        id: entry.id,
        title: entry.title,
        subtitle: getDisciplineTitle(entry),
        x, y, z,
        shapeCode: entry.visual_style?.shape || shapeCode,
        color: entry.visual_style?.color || color
      });
    };

    if (diagramType === 'rings') {
      pushNode(root, 0, 0, 0, 'circle_sphere', '#c5962c');
      const orgRels = relations.filter(r => r.source_id === rootId && r.diagram_type === 'rings');
      const byLvl = {};
      orgRels.forEach(r => {
        const l = Number(r.tier_level) || 1;
        if (!byLvl[l]) byLvl[l] = [];
        byLvl[l].push(r);
      });
      Object.entries(byLvl).forEach(([lvlStr, rels]) => {
        const lvl = Number(lvlStr);
        const radius = 95 + (lvl - 1) * 75;
        const zLevel = (lvl - 1) * 45;
        rels.forEach((rel, idx) => {
          const member = entries.find(e => e.id === rel.target_id);
          if (!member) return;
          const angle = ((2 * Math.PI) / rels.length) * idx;
          pushNode(
            member,
            Math.round(radius * Math.cos(angle)),
            Math.round(radius * Math.sin(angle)),
            zLevel,
            'oval_capsule',
            StoryProjections.LINE_COLORS[lvl % StoryProjections.LINE_COLORS.length]
          );
          edges.push({ from: root.id, to: member.id, label: rel.role_label || `Рівень ${lvl}` });
        });
      });
    } else if (diagramType === 'timeline') {
      pushNode(root, -160, 0, 0, 'diamond_octahedron', '#c5962c');
      const timeRels = relations
        .filter(r => r.source_id === rootId && r.diagram_type === 'timeline')
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      timeRels.forEach((rel, idx) => {
        const holder = entries.find(e => e.id === rel.target_id);
        if (!holder) return;
        pushNode(holder, -40 + idx * 125, (idx % 2 === 0 ? -35 : 35), idx * 35, 'oval_capsule', '#2b6cb0');
        edges.push({ from: idx === 0 ? root.id : timeRels[idx - 1].target_id, to: holder.id, label: rel.period_label || '' });
      });
    } else {
      // Дерево або мережа зв'язків Web 360°
      pushNode(root, 0, 0, 0, 'circle_sphere', '#c5962c');
      const related = relations.filter(r => r.source_id === rootId || r.target_id === rootId);
      related.forEach((rel, idx) => {
        const isOut = rel.source_id === rootId;
        const otherId = isOut ? rel.target_id : rel.source_id;
        const other = entries.find(e => e.id === otherId);
        if (!other) return;
        const angle = ((2 * Math.PI) / Math.max(1, related.length)) * idx;
        const radius = 155;
        pushNode(
          other,
          Math.round(radius * Math.cos(angle)),
          Math.round(radius * Math.sin(angle)),
          isOut ? 55 : -55,
          isOut ? 'rect_box' : 'oval_capsule',
          isOut ? '#2e8b57' : '#805ad5'
        );
        edges.push({
          from: isOut ? root.id : other.id,
          to: isOut ? other.id : root.id,
          label: rel.role_label || ''
        });
      });
    }

    return { nodes, edges };
  },

  renderInteractive3D({ container, graph, svgId = 'univ3DSvg', onNodeClickFn = 'openCodexNodePreview', rerenderCall = '' }) {
    if (!container) return;
    if (!graph.nodes.length) {
      container.innerHTML = '<p class="subtitle">Недостатньо вузлів для побудови 3D-проекції.</p>';
      return;
    }

    const projected = graph.nodes.map(n => ({
      node: n,
      ...this.projectPoint(n.x, n.y, n.z)
    }));
    const posById = new Map(projected.map(p => [p.node.id, p]));

    const edgesSvg = graph.edges.map(e => {
      const p1 = posById.get(e.from);
      const p2 = posById.get(e.to);
      if (!p1 || !p2) return '';
      const col = p2.node.color || 'var(--accent)';
      return CodexPrimitives.renderSvgEdge({ x1: p1.sx, y1: p1.sy, x2: p2.sx, y2: p2.sy, color: col });
    }).join('');

    const sortedByDepth = [...projected].sort((a, b) => b.depth - a.depth);
    const nodesSvg = sortedByDepth.map(item => {
      const n = item.node;
      const col = n.color || 'var(--accent)';
      const w = Math.round(128 * item.scale);
      const h = Math.round(40 * item.scale);
      const fontSize = Math.max(9, Math.round(11.5 * item.scale));
      const shape = CodexPrimitives.renderSvgNodeShape({
        shapeCode: n.shapeCode || 'rect_box',
        cx: item.sx,
        cy: item.sy,
        w,
        h,
        stroke: col
      });

      const clickAttr = n.clickable !== false && onNodeClickFn
        ? `style="cursor:pointer;" onclick="${onNodeClickFn}('${escapeHtml(n.id)}')"`
        : '';

      return `
        <g ${clickAttr}>
          ${shape}
          <text x="${item.sx}" y="${item.sy + 4}" text-anchor="middle" fill="var(--text-main)" font-size="${fontSize}" font-weight="700">
            ${escapeHtml(n.title.slice(0, 17))}
          </text>
        </g>
      `;
    }).join('');

    container.innerHTML = `
      <div class="tree-2d-viewport" style="user-select:none;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; padding:0.3rem 0.5rem;">
          <small class="subtitle">🖱️ Потягніть мишею, щоб обертати 3D-граф · Клік по вузлу відкриває картку</small>
          <div style="display:flex; gap:0.35rem;">
            <button type="button" class="btn" style="padding:0.2rem 0.6rem; font-size:0.78rem;" onclick="UniversalProjectionEngine.zoom = Math.min(1.8, UniversalProjectionEngine.zoom + 0.15); ${rerenderCall}">🔍 +</button>
            <button type="button" class="btn" style="padding:0.2rem 0.6rem; font-size:0.78rem;" onclick="UniversalProjectionEngine.zoom = Math.max(0.5, UniversalProjectionEngine.zoom - 0.15); ${rerenderCall}">🔍 −</button>
            <button type="button" class="btn" style="padding:0.2rem 0.6rem; font-size:0.78rem;" onclick="UniversalProjectionEngine.yaw = -0.45; UniversalProjectionEngine.pitch = 0.32; UniversalProjectionEngine.zoom = 1; ${rerenderCall}">↺ Скинути</button>
          </div>
        </div>
        <svg id="${svgId}" width="720" height="430" viewBox="0 0 720 430" style="width:100%; height:430px; cursor:grab; display:block;">
          ${edgesSvg}
          ${nodesSvg}
        </svg>
      </div>
    `;

    const svg = document.getElementById(svgId);
    if (!svg) return;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    svg.onmousedown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; svg.style.cursor = 'grabbing'; };
    window.onmousemove = (e) => {
      if (!dragging) return;
      this.yaw += (e.clientX - lastX) * 0.008;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + (e.clientY - lastY) * 0.008));
      lastX = e.clientX;
      lastY = e.clientY;
      if (rerenderCall) eval(rerenderCall);
    };
    window.onmouseup = () => { dragging = false; svg.style.cursor = 'grab'; };
  },

  // Модальне вікно 1D / 2D / 3D карти для будь-якої Книги або Статті
  openWorkMapModal(workType, workId, viewMode = '3d') {
    const isBook = workType === 'book';
    const work = isBook
      ? (state.books || []).find(b => b.id === workId)
      : (state.articles || []).find(a => a.id === workId);
    if (!work) return;

    const user = getCurrentUser();
    const canEdit = isBook ? canEditBook(work, user) : canEditArticle(work, user);
    const linkedCodex = isBook ? getBookCodexEntries(work) : getArticleCodexEntries(work);
    const chapters = isBook ? (work.chapters || []) : [];

    const nodes = [
      { id: work.id, title: work.title, x: 0, y: 0, z: 0, shapeCode: 'diamond_octahedron', color: '#c5962c', clickable: false }
    ];
    const edges = [];

    chapters.forEach((ch, idx) => {
      const angle = ((2 * Math.PI) / Math.max(1, chapters.length)) * idx;
      nodes.push({
        id: ch.id,
        title: ch.title,
        x: Math.round(145 * Math.cos(angle)),
        y: Math.round(145 * Math.sin(angle)),
        z: -50,
        shapeCode: 'rect_box',
        color: '#2b6cb0',
        clickable: false
      });
      edges.push({ from: work.id, to: ch.id, label: `Глава ${idx + 1}` });
    });

    linkedCodex.forEach((entry, idx) => {
      const angle = ((2 * Math.PI) / Math.max(1, linkedCodex.length)) * idx + 0.35;
      nodes.push({
        id: entry.id,
        title: entry.title,
        x: Math.round(165 * Math.cos(angle)),
        y: Math.round(165 * Math.sin(angle)),
        z: 65,
        shapeCode: entry.visual_style?.shape || 'oval_capsule',
        color: entry.visual_style?.color || '#2e8b57',
        clickable: true
      });
      edges.push({ from: work.id, to: entry.id, label: getDisciplineTitle(entry) });
    });

    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; padding-right:2rem;">
        <span class="badge">${isBook ? '📚 Атлас книги' : '📜 Атлас статті'}</span>
        <div class="tabs" style="margin:0;">
          <button type="button" class="tab-btn ${viewMode === '1d' ? 'active' : ''}" onclick="UniversalProjectionEngine.openWorkMapModal('${workType}', '${workId}', '1d')">📜 1D Текст</button>
          <button type="button" class="tab-btn ${viewMode === '2d' ? 'active' : ''}" onclick="UniversalProjectionEngine.openWorkMapModal('${workType}', '${workId}', '2d')">📐 2D Схема</button>
          <button type="button" class="tab-btn ${viewMode === '3d' ? 'active' : ''}" onclick="UniversalProjectionEngine.openWorkMapModal('${workType}', '${workId}', '3d')">🧊 3D Атлас</button>
        </div>
      </div>
      <h2 style="margin-top:0.5rem;">${escapeHtml(work.title)}</h2>
      <p class="subtitle">Центр: твір · Нижній рівень (-Z): глави (${chapters.length}) · Верхній рівень (+Z): терміни Кодексу (${linkedCodex.length})</p>

      <div id="workMapCanvasBox" style="margin-top:1rem;"></div>

      ${canEdit ? `
        <hr style="margin:1.1rem 0; border-color:var(--border);" />
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <small class="subtitle">Редагування зв'язків твору з Кодексом:</small>
          <button type="button" class="btn" style="font-size:0.82rem;" onclick="${isBook ? `openBookEditorModal('${work.id}')` : `openEditArticleModal('${work.id}')`}">✏️ Керувати термінами та главами</button>
        </div>
      ` : ''}
    `);

    const box = document.getElementById('workMapCanvasBox');
    if (viewMode === '1d') {
      box.innerHTML = `
        <div class="timeline-track">
          ${chapters.map((ch, idx) => `<div class="timeline-step"><strong>📖 Глава ${idx + 1}:</strong> ${escapeHtml(ch.title)}</div>`).join('')}
          ${linkedCodex.map(e => `
            <div class="timeline-step" style="border-left-color:#2e8b57; cursor:pointer;" onclick="openCodexNodePreview('${e.id}')">
              <strong>🏛️ Термін Кодексу:</strong> ${escapeHtml(e.title)} <small class="subtitle">(${escapeHtml(getDisciplineTitle(e))})</small>
            </div>
          `).join('')}
          ${!chapters.length && !linkedCodex.length ? '<p class="subtitle">Поки немає глав чи прив’язаних термінів Кодексу.</p>' : ''}
        </div>
      `;
    } else if (viewMode === '2d') {
      const w = 660;
      const h = 380;
      const cx = 330;
      const cy = 190;
      const svgNodes = nodes.map(n => {
        const px = cx + n.x;
        const py = cy + n.y;
        const shape = CodexPrimitives.renderSvgNodeShape({ shapeCode: n.shapeCode, cx: px, cy: py, w: 120, h: 36, stroke: n.color });
        return `
          <g ${n.clickable ? `style="cursor:pointer;" onclick="openCodexNodePreview('${n.id}')"` : ''}>
            ${shape}
            <text x="${px}" y="${py + 4}" text-anchor="middle" fill="var(--text-main)" font-size="11" font-weight="600">${escapeHtml(n.title.slice(0, 15))}</text>
          </g>
        `;
      }).join('');
      const svgEdges = edges.map(e => {
        const n1 = nodes.find(x => x.id === e.from);
        const n2 = nodes.find(x => x.id === e.to);
        if (!n1 || !n2) return '';
        return CodexPrimitives.renderSvgEdge({ x1: cx + n1.x, y1: cy + n1.y, x2: cx + n2.x, y2: cy + n2.y, color: n2.color });
      }).join('');

      box.innerHTML = `
        <div class="tree-2d-viewport">
          <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block; margin:0 auto;">
            ${svgEdges}
            ${svgNodes}
          </svg>
        </div>
      `;
    } else {
      this.renderInteractive3D({
        container: box,
        graph: { nodes, edges },
        svgId: 'workMap3DSvg',
        onNodeClickFn: 'openCodexNodePreview',
        rerenderCall: `UniversalProjectionEngine.openWorkMapModal('${workType}', '${workId}', '3d')`
      });
    }
  }
};
