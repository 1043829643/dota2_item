
// ---- MATERIALS SUB-NAV: tap-to-open submenu on touch devices ----
// On hover-capable devices (mouse) the .nav-submenu opens on hover — fine. On
// touch devices the group trigger is an <a href=...> so the first tap fires
// navigation immediately, and the submenu never gets a chance to appear (only
// long-press emulates :hover, which the user shouldn't have to know about).
// Fix: on tap-only devices, the FIRST tap on a group trigger opens its
// submenu instead of navigating; a SECOND tap on the same trigger (or on
// anywhere outside) lets the navigation happen normally. Active item picks
// continue to navigate on first tap (so users CAN reach the group's own page
// — by tapping it twice). Touch detection uses the `(hover: none)` media
// query so plain laptops aren't affected.
(function() {
  const mq = window.matchMedia && window.matchMedia('(hover: none)');
  if (!mq || !mq.matches) return;
  const groups = document.querySelectorAll('.materials-subnav .nav-subgroup');
  if (!groups.length) return;
  let openGroup = null;
  function closeOpen() {
    if (openGroup) {
      openGroup.classList.remove('is-open');
      openGroup = null;
    }
  }
  groups.forEach(group => {
    const trigger = group.querySelector(':scope > .nav-subtab-group, :scope > .nav-subitem-parent');
    if (!trigger) return;
    trigger.addEventListener('click', (e) => {
      if (group === openGroup) {
        // Second tap on the same group — let the link follow through.
        return;
      }
      // First tap — open the submenu instead of navigating.
      e.preventDefault();
      closeOpen();
      group.classList.add('is-open');
      openGroup = group;
    });
  });
  // Tap outside any group closes the open one.
  document.addEventListener('click', (e) => {
    if (openGroup && !openGroup.contains(e.target)) closeOpen();
  });
})();

(function() {
  // ---- BACK-FROM-CALENDAR / BACK-FROM-PATCH ----
  // The back arrow normally points to the calendar (rendered in HTML).
  // Two trigger paths:
  //   ?from=calendar           → show arrow, default href is fine
  //   ?from=<patch-version>    → user navigated here from another patch via
  //                              the dynamics widget; rewrite the arrow's
  //                              href + label to point back to that patch.
  const params = new URLSearchParams(window.location.search);
  const back = document.querySelector('.nav-back-arrow');
  const fromParam = params.get('from');
  if (back && fromParam === 'calendar') {
    back.classList.add('visible');
  } else if (back && (fromParam === 'heroes_dyn' || fromParam === 'items_dyn')) {
    // Arrived from a Dynamics matrix (root page) via a dyn-cell. Point the back
    // arrow at it. Same fixed bottom-left button + styling as the calendar/patch
    // back-arrow; patch pages live under /patches/ so ../.
    const label = fromParam === 'items_dyn' ? 'Item Dynamics' : 'Hero Dynamics';
    back.href = '../' + fromParam + '.html';
    back.title = 'Back to ' + label;
    back.setAttribute('aria-label', 'Back to ' + label);
    back.classList.add('visible');
  } else if (back && fromParam && /^\d+\.\d+[a-z]?$/.test(fromParam)) {
    // Came from another patch via the dynamics widget. The dyn-cell href
    // also carries an entity anchor (#dyn-hero-...) so the destination page
    // scrolls to that entity — the SAME entity was visible on the origin
    // page, so reusing the current hash on the back-link restores the
    // user's scroll position on return.
    back.href = fromParam + '.html' + (window.location.hash || '');
    back.title = 'Back to ' + fromParam;
    back.setAttribute('aria-label', 'Back to patch ' + fromParam);
    back.classList.add('visible');
  }
  // The back arrow is a fixed button in the BOTTOM-LEFT corner (CSS), so it no
  // longer needs JS to vertically align it on the toolbar (that inline top:
  // override was what made it overlap the tag block).
})();

(function() {
  // ---- RE-ANCHOR after load (patch pages) ----
  // Arriving with a #dyn-hero-… hash (from the Hero Dynamics matrix or another
  // patch's dynamics widget), the browser anchors immediately — but lazy hero/
  // item icons ABOVE the target then load and shift layout, leaving the target
  // scrolled off-screen. Re-scroll once everything has settled, offsetting for
  // the sticky nav so the heading isn't hidden behind it. Table pages run their
  // own centerHash(), so skip them.
  if (window.location.hash && !document.querySelector('.creeps-scroll')) {
    const reanchor = () => {
      const el = document.getElementById(
        decodeURIComponent(window.location.hash.slice(1)));
      if (!el) return;
      const navH = parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--site-nav-h')) || 70;
      const toolbarEl = document.querySelector('.toolbar');
      const toolbarH = toolbarEl ? toolbarEl.getBoundingClientRect().height : 0;
      const y = el.getBoundingClientRect().top + window.scrollY - navH - toolbarH - 8;
      window.scrollTo(0, Math.max(0, y));
    };
    // Several passes: the browser re-applies its own (nav-ignoring) hash scroll
    // around the load event, and late images shift layout — re-run after each so
    // the final position wins and accounts for the sticky nav.
    window.addEventListener('load', () => {
      reanchor();
      setTimeout(reanchor, 80);
      setTimeout(reanchor, 300);
    });
  }

  // ---- BACK TO TOP visibility ----
  // Guard for pages without the button (e.g. creeps.html). Without this
  // null-guard, updateBtt() throws at load and halts the whole script —
  // which silently broke the creep-icon copy handler below.
  const btt = document.querySelector('.back-to-top');
  if (btt) {
    const updateBtt = () => btt.classList.toggle('visible', window.scrollY > 400);
    window.addEventListener('scroll', updateBtt, { passive: true });
    updateBtt();
  }

  // ---- VERSION DROPDOWN toggle ----
  const dropdownBtn = document.querySelector('.version-dropdown .version');
  const dropdownMenu = document.querySelector('.version-dropdown .version-menu');
  if (dropdownBtn && dropdownMenu) {
    dropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = dropdownMenu.classList.toggle('open');
      dropdownBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        const cur = dropdownMenu.querySelector('.version-item.current');
        if (cur) cur.scrollIntoView({ block: 'nearest' });
      }
    });
    document.addEventListener('click', (e) => {
      if (!dropdownMenu.contains(e.target) && !dropdownBtn.contains(e.target)) {
        dropdownMenu.classList.remove('open');
        dropdownBtn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        dropdownMenu.classList.remove('open');
        dropdownBtn.setAttribute('aria-expanded', 'false');
      }
    });
    // Prevent scroll propagation to the page on Safari (overscroll-behavior
    // alone isn't enough on older WebKit builds).
    dropdownMenu.addEventListener('touchmove', (e) => { e.stopPropagation(); }, { passive: true });
  }

  // ---- HIDE ABSENT TAGS from toolbar ----
  // The .legend-tags container is set to visibility: hidden by default in
  // styles.css so the user doesn't see all 7 buttons appear and then watch
  // the absent one(s) (e.g. QoL on a patch without QoL rows) disappear on
  // Ctrl+F5. We compute presence, hide the absent buttons, THEN flip the
  // container to visible — a single resolved render, no flash.
  const presentTags = new Set();
  document.querySelectorAll('[data-tag]').forEach(el => {
    (el.dataset.tag || '').split(' ').filter(Boolean).forEach(t => presentTags.add(t));
  });
  // Recipe-changed items count as REWORK even if none of their explicit rows
  // carry t("REWORK") — keep the filter button discoverable on those pages.
  if (document.querySelector('.entity-block.is-changed')) presentTags.add('rework');
  document.querySelectorAll('.filter-btn').forEach(btn => {
    if (!presentTags.has(btn.dataset.filter)) {
      btn.style.display = 'none';
    }
  });
  document.querySelectorAll('.legend-tags').forEach(bar => {
    bar.style.visibility = 'visible';
  });

  // ---- BOLD NUMBERS AND VERSION IN PATCH-AGE ----
  const ageEl = document.querySelector('.patch-age');
  if (ageEl) {
    const text = ageEl.textContent;
    const html = text
      .replace(/\b(\d+\.\d+[a-z]?)\b/g, '<strong>$1</strong>')   // version like 7.41b
      .replace(/\b(\d+)\b(?=\s+days?)/g, '<strong>$1</strong>')   // numbers before "days"
      .replace(/·/g, '<span class="age-sep">·</span>');
    ageEl.innerHTML = html;
  }

  // ---- TAG FILTERING (multi-select, OR semantics) ----
  const buttons = document.querySelectorAll('.filter-btn');
  const activeFilters = new Set();
  function elementVisible(el) {
    return !!el && !el.classList.contains('f-hide') && !el.classList.contains('cat-hide');
  }
  function refreshPatchFilterLayout() {
    document.querySelectorAll('ul.changes').forEach(ul => {
      const hasVisible = Array.from(ul.children).some(elementVisible);
      ul.classList.toggle('f-hide', !hasVisible);
    });
    document.querySelectorAll('h4.ability-title').forEach(h => {
      let nx = h.nextElementSibling;
      while (nx && nx.tagName !== 'UL') nx = nx.nextElementSibling;
      h.classList.toggle('f-hide', !elementVisible(nx));
    });
    document.querySelectorAll('.ability-block').forEach(block => {
      const ul = block.querySelector('ul.changes');
      block.classList.toggle('f-hide', !elementVisible(ul));
    });
    // Component/stat panels (.properties-change, .components-change, etc.) only
    // belong to the REWORK filter. Hide them under any other active filter so
    // items with recipe changes don't bleed through QoL/BUFF/etc. filters.
    const reworkOnly = activeFilters.size > 0 && !activeFilters.has('rework');
    document.querySelectorAll('.components-box, .components-change, .provides-box, .properties-change').forEach(el => {
      if (reworkOnly) el.classList.add('f-hide');
    });
    document.querySelectorAll('.entity-block').forEach(block => {
      const visibleLi = block.querySelectorAll('ul.changes > li:not(.f-hide):not(.cat-hide)').length;
      const visibleSwaps = block.querySelectorAll('.ability-change:not(.f-hide):not(.cat-hide)').length;
      const visiblePanels = !reworkOnly && Array.from(block.children).some(child =>
        child.matches('.components-box, .components-change, .provides-box, .properties-change') &&
        elementVisible(child)
      );
      block.classList.toggle('f-hide', !visibleLi && !visibleSwaps && !visiblePanels);
    });
    document.querySelectorAll('h4.subgroup').forEach(h => {
      let nx = h.nextElementSibling;
      let hasVisibleContent = false;
      while (nx && !nx.matches('h4.subgroup')) {
        if (elementVisible(nx)) {
          hasVisibleContent = true;
          break;
        }
        nx = nx.nextElementSibling;
      }
      h.classList.toggle('f-hide', !hasVisibleContent);
    });
    // Collapse a whole category section (section.cat-panel, incl. its h2.section
    // header + slab) when every entity inside it was filtered out — otherwise an
    // emptied section leaves a bare slab strip between two visible sections.
    // Runs AFTER the entity-block pass above so each block's f-hide is settled.
    document.querySelectorAll('section.cat-panel').forEach(panel => {
      const hasVisible = panel.querySelector('.entity-block:not(.f-hide):not(.cat-hide)');
      panel.classList.toggle('f-hide', !hasVisible);
    });
    // The entity-block top hairline is suppressed on the section's FIRST block
    // (`h2.section + .entity-block`), but once filtering hides earlier blocks the
    // first SURVIVING block isn't that one anymore → an orphan line appears under
    // the category header. Re-mark the first visible block per section so CSS can
    // drop its top border.
    document.querySelectorAll('.entity-block.first-visible')
      .forEach(b => b.classList.remove('first-visible'));
    document.querySelectorAll('section.cat-panel:not(.f-hide)').forEach(panel => {
      const first = panel.querySelector('.entity-block:not(.f-hide):not(.cat-hide)');
      if (first) first.classList.add('first-visible');
    });
    drawBrewlingConnectors();
  }
  function applyFilter() {
    const isActive = activeFilters.size > 0;
    document.body.classList.toggle('filter-active', isActive);
    document.querySelectorAll('.f-hide').forEach(el => el.classList.remove('f-hide'));
    if (!isActive) {
      refreshPatchFilterLayout();
      return;
    }
    document.querySelectorAll('ul.changes > li').forEach(li => {
      const tags = (li.dataset.tag || '').split(' ').filter(Boolean);
      // Items whose recipe changed (entity-block.is-changed) count as REWORK
      // so the REWORK filter keeps their rows visible too.
      if (li.closest('.entity-block.is-changed')) tags.push('rework');
      const matches = tags.some(t => activeFilters.has(t));
      if (!matches) li.classList.add('f-hide');
    });
    // Block-level swap visuals (ability_change) carry their own data-tag and
    // sit outside ul.changes — hide them when none of their tags is active.
    document.querySelectorAll('.ability-change[data-tag]').forEach(block => {
      const tags = (block.dataset.tag || '').split(' ').filter(Boolean);
      if (!tags.some(t => activeFilters.has(t))) block.classList.add('f-hide');
    });
    refreshPatchFilterLayout();
  }
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.filter;
      if (activeFilters.has(tag)) {
        activeFilters.delete(tag);
        btn.classList.remove('active');
      } else {
        activeFilters.add(tag);
        btn.classList.add('active');
      }
      applyFilter();
    });
  });

  // ---- CATEGORIES FILTER ----
  // Tag every element between adjacent <h2 class="section"> headers with the
  // preceding section's slug so the buttons can hide non-matching siblings.
  (function indexSections() {
    const headers = document.querySelectorAll('h2.section[data-section]');
    headers.forEach(h => {
      const slug = h.dataset.section;
      let nx = h.nextElementSibling;
      while (nx && !(nx.tagName === 'H2' && nx.classList.contains('section'))) {
        if (!nx.dataset.section) nx.dataset.section = slug;
        nx = nx.nextElementSibling;
      }
    });
  })();
  const catButtons = document.querySelectorAll('.cat-filter-btn');
  const activeCats = new Set();
  function applyCatFilter() {
    const on = activeCats.size > 0;
    document.body.classList.toggle('cat-filter-active', on);
    document.querySelectorAll('[data-section]').forEach(el => {
      el.classList.remove('cat-hide');
      if (on && !activeCats.has(el.dataset.section)) el.classList.add('cat-hide');
    });
    refreshPatchFilterLayout();
  }
  catButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.category;
      if (activeCats.has(cat)) { activeCats.delete(cat); btn.classList.remove('active'); }
      else { activeCats.add(cat); btn.classList.add('active'); }
      applyCatFilter();
    });
  });

  // ---- FORMULA TABLES (click pill to toggle table) ----
  document.querySelectorAll('.formula-trigger').forEach(trig => {
    trig.addEventListener('click', () => {
      const id = trig.dataset.formula;
      const table = document.getElementById(id);
      if (!table) return;
      const wasHidden = table.hasAttribute('hidden');
      if (wasHidden) {
        table.removeAttribute('hidden');
        trig.classList.add('active');
      } else {
        table.setAttribute('hidden', '');
        trig.classList.remove('active');
      }
      requestAnimationFrame(drawBrewlingConnectors);
    });
  });

  // ---- ENTITY SEARCH ----
  // Guard: pages without the search box (e.g. creeps.html) skip this whole
  // block. Without the guard, searchInput.addEventListener below throws on
  // null and halts the script — which silently broke later handlers.
  const searchInput = document.getElementById('entity-search');
  const resultsBox = document.getElementById('search-results');
  if (searchInput && resultsBox) {
  const entities = [];
  document.querySelectorAll('.entity').forEach(entity => {
    const nameEl = entity.querySelector('.entity-name');
    const imgEl = entity.querySelector('.entity-icon img');
    if (!nameEl) return;
    // Strip the "New X Item" / "Returning Tier N Artifact" / "Recipe changed"
    // labels so the search index uses just the entity name itself.
    const nameClone = nameEl.cloneNode(true);
    nameClone.querySelectorAll('.entity-new-type, .entity-changed-type').forEach(n => n.remove());
    let kind = 'mechanic';
    if (entity.classList.contains('hero-entity')) kind = 'hero';
    else if (entity.classList.contains('unit-entity')) kind = 'creep';
    else if (entity.classList.contains('item-entity')) kind = 'item';
    if (entity.dataset && entity.dataset.kind) kind = entity.dataset.kind;
    entities.push({
      name: nameClone.textContent.trim().replace(/\s+/g, ' '),
      element: entity,
      icon: imgEl ? imgEl.src : null,
      kind: kind
    });
  });
  // Also index ability titles (h4.ability-title) — pull icon from the .ability-block
  // wrapper so search results show the same picture as the ability heading.
  // Innate abilities that have their own icon (e.g. Invoker's Invoke =
  // invoker_invoke.png + small innate marker overlay) should still use that
  // icon in search results; only fall back to the generic innate marker when
  // Valve doesn't expose a dedicated icon on the React CDN.
  document.querySelectorAll('h4.ability-title').forEach(h => {
    const block = h.closest('.ability-block');
    const imgEl = block ? block.querySelector('.ability-icon-img') : null;
    const isInnate = block ? block.classList.contains('is-innate') : false;
    const innateUrl = '../icons/misc/innate_icon.png';
    const realIcon = imgEl ? imgEl.src : null;
    entities.push({
      name: h.textContent.trim(),
      element: h,
      icon: realIcon || (isInnate ? innateUrl : null),
      kind: 'ability'
    });
  });

  function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function highlight(name, q) {
    const idx = name.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return escapeHtml(name);
    return escapeHtml(name.slice(0, idx)) +
           '<mark>' + escapeHtml(name.slice(idx, idx + q.length)) + '</mark>' +
           escapeHtml(name.slice(idx + q.length));
  }

  let activeIdx = -1;

  function render(query) {
    if (!query) {
      resultsBox.classList.remove('show');
      resultsBox.innerHTML = '';
      activeIdx = -1;
      return;
    }
    const q = query.toLowerCase();
    const matches = entities.filter(e => e.name.toLowerCase().includes(q)).slice(0, 12);
    if (matches.length === 0) {
      resultsBox.innerHTML = '<div class="empty">no matches</div>';
      resultsBox.classList.add('show');
      activeIdx = -1;
      return;
    }
    resultsBox.innerHTML = matches.map((m, i) =>
      `<div class="result-item" data-idx="${i}">${
        m.icon
          ? `<img src="${m.icon}" alt="" onerror="this.onerror=null;this.src='../icons/misc/missing.svg';">`
          : '<span style="width:32px;display:inline-block"></span>'
      }<span>${highlight(m.name, query)}</span><span class="kind">${m.kind}</span></div>`
    ).join('');
    resultsBox.classList.add('show');
    activeIdx = -1;

    resultsBox.querySelectorAll('.result-item').forEach((el, i) => {
      el.addEventListener('mouseenter', () => { setActive(i); });
      el.addEventListener('click', () => { jumpTo(matches[i]); });
    });
    window._currentMatches = matches;
  }

  function setActive(i) {
    activeIdx = i;
    resultsBox.querySelectorAll('.result-item').forEach((el, idx) => {
      el.classList.toggle('active', idx === i);
    });
  }

  function jumpTo(target) {
    if (!target) return;
    // If active filters are hiding the target, reset them so it becomes visible.
    if (target.element.closest('.f-hide, .cat-hide')) {
      activeFilters.clear();
      buttons.forEach(b => b.classList.remove('active'));
      activeCats.clear();
      catButtons.forEach(b => b.classList.remove('active'));
      applyFilter();
      applyCatFilter();
    }
    // Offset for the sticky nav so the heading lands just BELOW it. Plain
    // scrollIntoView({block:'start'}) parks the heading at viewport top, hidden
    // behind the nav — so you see the rows under it and it reads as "jumped
    // past / below the result". Mirror the re-anchor offset used on load.
    const navH = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--site-nav-h')) || 70;
    const toolbarEl = document.querySelector('.toolbar');
    const toolbarH = toolbarEl ? toolbarEl.getBoundingClientRect().height : 0;
    const y = target.element.getBoundingClientRect().top + window.scrollY - navH - toolbarH - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    target.element.style.transition = 'box-shadow 0.4s';
    target.element.style.boxShadow = '0 0 0 2px #58a6ff';
    setTimeout(() => target.element.style.boxShadow = '', 1400);
    searchInput.value = '';
    resultsBox.classList.remove('show');
    resultsBox.innerHTML = '';
  }

  searchInput.addEventListener('input', () => render(searchInput.value));
  searchInput.addEventListener('keydown', (e) => {
    const items = resultsBox.querySelectorAll('.result-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((activeIdx + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((activeIdx - 1 + items.length) % items.length); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = activeIdx >= 0 ? activeIdx : 0;
      if (window._currentMatches && window._currentMatches[idx]) jumpTo(window._currentMatches[idx]);
    }
    else if (e.key === 'Escape') {
      searchInput.value = '';
      render('');
    }
  });
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !resultsBox.contains(e.target)) {
      resultsBox.classList.remove('show');
    }
  });
  // Prevent scroll propagation to the page on Safari.
  if (resultsBox) {
    resultsBox.addEventListener('touchmove', (e) => { e.stopPropagation(); }, { passive: true });
  }
  } // end if (searchInput && resultsBox)

  // ---- ABILITY-CHANGE CONNECTOR ----
  // Draws a thin dashed curve from each ability-change-block's icon
  // bottom-center down-right to the centre of the LEFT BORDER of the OLD
  // pane. Recomputed on load and on resize so the line tracks the actual
  // layout (icon position, pane geometry).
  function drawAbilityChangeConnectors() {
    const blocks = document.querySelectorAll('.ability-change-block');
    blocks.forEach((block) => {
      const svg = block.querySelector(':scope > .ability-change-connector');
      const path = svg && svg.querySelector('path');
      const icon = block.querySelector(':scope > .ability-icon-wrap');
      const oldPane = block.querySelector(
        ':scope > .ability-change > .ability-change-pane.ability-change-old'
      );
      if (!svg || !path || !icon || !oldPane) return;
      const blockRect = block.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const paneRect = oldPane.getBoundingClientRect();
      if (!blockRect.width || !paneRect.width) return;
      // Cover the whole block so we have a global coordinate system for
      // the path; absolute positioning relative to block (which is
      // position: relative).
      svg.setAttribute('width', blockRect.width);
      svg.setAttribute('height', blockRect.height);
      svg.setAttribute('viewBox', '0 0 ' + blockRect.width + ' ' + blockRect.height);
      svg.style.left = '0px';
      svg.style.top = '0px';
      svg.style.width = blockRect.width + 'px';
      svg.style.height = blockRect.height + 'px';
      // Start: bottom-center of icon
      const x1 = iconRect.left - blockRect.left + iconRect.width / 2;
      const y1 = iconRect.bottom - blockRect.top;
      // End: centre of left border of old pane
      const x2 = paneRect.left - blockRect.left;
      const y2 = paneRect.top - blockRect.top + paneRect.height / 2;
      // L-shape with a right-angle elbow: vertical segment down from the
      // icon, then horizontal segment right to the pane's left edge.
      const d = 'M ' + x1 + ' ' + y1 + ' L ' + x1 + ' ' + y2 + ' L ' + x2 + ' ' + y2;
      path.setAttribute('d', d);
    });
  }
  drawAbilityChangeConnectors();
  window.addEventListener('resize', drawAbilityChangeConnectors);
  // Also re-run after fonts/images settle so the layout has its final
  // dimensions (icon images may load late and shift the icon position).
  window.addEventListener('load', drawAbilityChangeConnectors);
  // Re-run when an inline formula table toggles open/closed inside an
  // ability_change block — the block's height changes, so the SVG canvas
  // dimensions (which cover blockRect.height) must be recalculated.
  document.addEventListener('toggle', (e) => {
    if (e.target && e.target.closest && e.target.closest('.ability-change-block')) {
      drawAbilityChangeConnectors();
    }
  }, true);

  // ---------------------------------------------------------------------
  // Brewling connector — dashed lines from Primal Split icon down to each
  // of the four brewling ability blocks (Earth / Storm / Fire / Void).
  // Same dashed style as the ability_change-connector (.ability-change-
  // connector path), but a single SVG attached to <body> overlays multiple
  // ability blocks via document-level coordinates.
  // ---------------------------------------------------------------------
  // Ability-tree groups: a parent ability icon dashed-linked down to its
  // child blocks. Used for Brewmaster's Primal Split → brewlings and
  // Drunken Brawler → stances (same visual concept).
  const ABILITY_TREES = [
    {
      parent: 'brewmaster_primal_split',
      children: [
        'brewmaster_earth_unit',
        'brewmaster_storm_unit',
        'brewmaster_fire_unit',
        'brewmaster_void_unit',
      ],
    },
    {
      parent: 'brewmaster_drunken_brawler',
      children: [
        'brewmaster_drunken_brawler_earth',
        'brewmaster_drunken_brawler_fire',
        'brewmaster_drunken_brawler_void',
      ],
    },
    {
      parent: 'invoker_quas_focus',
      children: [
        'invoker_quas',
        'invoker_cold_snap',
        'invoker_ice_wall',
        'invoker_ghost_walk',
      ],
    },
    {
      parent: 'invoker_wex_focus',
      children: [
        'invoker_wex',
        'invoker_alacrity',
        'invoker_tornado',
      ],
    },
    {
      parent: 'invoker_exort_focus',
      children: [
        'invoker_exort',
        'invoker_chaos_meteor',
        'invoker_sun_strike',
      ],
    },
    {
      parent: 'ringmaster_sideshow_secrets',
      children: [
        'ringmaster_crystal_ball',
        'ringmaster_summon_unicycle',
        'ringmaster_weighted_pie',
      ],
    },
  ];

  function drawBrewlingConnectors() {
    // Remove any existing SVGs so we can redraw fresh on each call.
    document.querySelectorAll('svg.brewling-connector').forEach((s) => s.remove());
    ABILITY_TREES.forEach((tree) => drawAbilityTree(tree.parent, tree.children));
  }

  // Resolve the anchor element for connector lines: always use the
  // .ability-icon-wrap (48×48 column) rather than the img itself, so
  // ability_change children (which have 128×128 icons in a different layout)
  // are anchored at the same position as regular ability blocks.
  function resolveAnchor(img) {
    const wrap = img.closest('.ability-icon-wrap, .facet-icon-wrap');
    return wrap || img;
  }

  function drawAbilityTree(parentSlug, childSlugs) {
    const parentImg = document.querySelector('img[data-slug="' + parentSlug + '"]');
    if (!parentImg) return;
    if (parentImg.closest('.f-hide, .cat-hide')) return;
    const childImgs = childSlugs
      .map((s) => document.querySelector('img[data-slug="' + s + '"]'))
      .filter(Boolean)
      .filter(img => !img.closest('.f-hide, .cat-hide'));
    if (!childImgs.length) return;

    // Use document-level coordinates so the SVG can span multiple
    // ability-blocks regardless of their containing scrollable parents.
    const docY = (rect) => rect.top + window.scrollY;
    const docX = (rect) => rect.left + window.scrollX;
    const parentRect = resolveAnchor(parentImg).getBoundingClientRect();
    const childRects = childImgs.map((i) => resolveAnchor(i).getBoundingClientRect());

    // Trunk: vertical line in the left gutter just outside the parent icon's
    // left edge — visually "comes out" of the Primal Split icon.
    // Trunk runs in the left gutter; parent connects from its left-center.
    const parentLeftX = docX(parentRect);
    const parentMidY  = docY(parentRect) + parentRect.height / 2;
    const trunkX = parentLeftX - 12;
    const lastChild = childRects[childRects.length - 1];
    const endY = docY(lastChild) + lastChild.height / 2;
    const minX = Math.min(trunkX, ...childRects.map(docX));
    const maxX = Math.max(parentLeftX, ...childRects.map((r) => docX(r) + r.width));

    const top    = Math.min(parentMidY, ...childRects.map(docY));
    const bottom = endY + 4;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'brewling-connector');
    svg.style.left = minX - 4 + 'px';
    svg.style.top  = top + 'px';
    svg.style.width  = (maxX - minX + 8) + 'px';
    svg.style.height = (bottom - top + 4) + 'px';
    svg.setAttribute('viewBox',
      '0 0 ' + (maxX - minX + 8) + ' ' + (bottom - top + 4));

    // Coordinate transform: subtract SVG origin from each point.
    const tx = (x) => x - (minX - 4);
    const ty = (y) => y - top;

    // Left-center of parent → horizontal stub to trunk → down to last child.
    let d = 'M ' + tx(parentLeftX) + ' ' + ty(parentMidY)
          + ' L ' + tx(trunkX)     + ' ' + ty(parentMidY)
          + ' L ' + tx(trunkX)     + ' ' + ty(endY);
    // Branch from trunk to each brewling icon's left-center.
    for (const r of childRects) {
      const cy = docY(r) + r.height / 2;
      const cx = docX(r);
      d += ' M ' + tx(trunkX) + ' ' + ty(cy)
         + ' L ' + tx(cx) + ' ' + ty(cy);
    }
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    document.body.appendChild(svg);
  }
  drawBrewlingConnectors();
  window.addEventListener('resize', drawBrewlingConnectors);
  window.addEventListener('load', drawBrewlingConnectors);

  // ---------------------------------------------------------------------
  // PATCH DYNAMICS WIDGET
  // ---------------------------------------------------------------------
  // For every .entity on the page, fetch _dynamics.json once, derive the
  // entity's (kind, slug) from its DOM id ("dyn-<kind>-<slug>"), and append
  // a row of diamond pills — one per recent patch. Each pill shows a
  // proportional gradient of tag colors; untouched pills are dark/glassy.
  // Click on a touched pill navigates to that patch HTML, scrolling to the
  // same entity anchor when present.
  // Tag colors rendered with alpha so the fluid layer reads as translucent
  // liquid sitting inside a recessed glass diamond rather than a solid pill.
  // Hues chosen so adjacent bands in DYN_TAG_ORDER below contrast — NEW
  // moves to gold (matching the .badge.new page color) so it stops getting
  // visually swallowed when it sits next to BUFF (green).
  // Stored as RGB tuples; alpha is computed at render time per band so
  // bands with more hits look more saturated (see dynColorFor).
  const DYN_TAG_RGB = {
    buff:   [93, 177, 78],   // green
    new:    [220, 175, 95],  // gold
    rework: [164, 114, 207], // purple
    misc:   [139, 144, 153], // grey
    qol:    [108, 171, 240], // blue
    del:    [177, 78, 107],  // pink
    nerf:   [209, 75, 75],   // red
  };
  // Map a tag's count → rgba alpha. Single-hit bands sit near the old
  // baseline (~0.50), heavy bands push toward fully-saturated 0.90 so
  // the visual difference between "1 buff" and "8 buffs" is obvious at
  // a glance. Wider range than before for a more expressive ramp.
  const DYN_ALPHA_BASE = 0.50;
  const DYN_ALPHA_STEP = 0.08;
  const DYN_ALPHA_MAX  = 0.90;
  function dynColorFor(tag, count) {
    const rgb = DYN_TAG_RGB[tag];
    // count=1 → BASE, then each additional hit adds STEP, clamped at MAX.
    const alpha = Math.min(
      DYN_ALPHA_MAX,
      DYN_ALPHA_BASE + Math.max(0, count - 1) * DYN_ALPHA_STEP
    );
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(2)})`;
  }
  const DYN_TAG_LABEL = {
    buff:'BUFF', nerf:'NERF', new:'NEW', del:'DEL',
    rework:'REWORK', misc:'MISC', qol:'QoL',
  };
  // Tag id → page-badge css class. Matches the styles in styles.css so
  // tooltip badges look identical to the row badges everywhere else.
  const DYN_TAG_BADGE_CLASS = {
    buff:'buff-text', nerf:'nerf-text', new:'new', del:'del',
    rework:'rework', misc:'misc', qol:'qol',
  };
  // Order is also the visual top→bottom band stack inside each pill, AND
  // the row order in the tooltip grid. Sequenced so neighbouring bands
  // change hue family (green → gold → purple → grey → blue → pink → red).
  const DYN_TAG_ORDER = ['buff','new','rework','misc','qol','del','nerf'];
  // Tags kept OUT of the dyn-cell colored gradient. Now EMPTY — MISC (grey)
  // and QoL (blue) are coloured bands like every other tag (user request), so
  // they contribute to the diamond's fill on both patch pages and heroes_dyn.
  // The "misc-only" dimmed-fallback path below is now effectively dead (kept
  // harmless: with no neutral tags, coloredTotal === total whenever total > 0).
  const DYN_NEUTRAL_TAGS = [];
  const DYN_MAX_PATCHES = 12;

  function dynBuildPill(patch, counts, entityId, isCurrent, fromVersion, filePrefix, bnOnly, removed, debut) {
    // "Remove" tag filter (toolbar chips): zero out user-removed tags for the
    // CELL colouring. The hover tooltip below still uses the ORIGINAL counts, so
    // a removed tag stays visible on hover — it's only dropped from the diamond.
    const eff = (removed && removed.size)
      ? DYN_TAG_ORDER.reduce((o, t) => { o[t] = removed.has(t) ? 0 : (counts[t] || 0); return o; }, {})
      : counts;
    const origTotal = DYN_TAG_ORDER.reduce((s, t) => s + (counts[t] || 0), 0);
    const total = DYN_TAG_ORDER.reduce((s, t) => s + (eff[t] || 0), 0);   // effective → drives fill/empty
    const clickable = origTotal > 0 && patch.filename && !isCurrent;
    // Gradient source (over EFFECTIVE counts). Default = non-neutral tags vs the
    // full effective total (MISC/QoL leave a gap — patch-page look). "Buff/nerf
    // only" (bnOnly) collapses to TWO bands: buff+NEW (green), nerf+DEL (red).
    // `debut` = the item's introduction cell (data-debut): its NEW rows mean
    // "item now exists", so they must NOT fold into buff (items_dyn only).
    const gradCounts = bnOnly
      ? { buff: (eff.buff || 0) + (debut ? 0 : (eff.new || 0)),
          nerf: (eff.nerf || 0) + (eff.del || 0) }
      : eff;
    const gradTagSet = bnOnly
      ? ['buff', 'nerf']
      : DYN_TAG_ORDER.filter(t => !DYN_NEUTRAL_TAGS.includes(t));
    const coloredTotal = gradTagSet.reduce((s, t) => s + (gradCounts[t] || 0), 0);
    const denom = bnOnly ? coloredTotal : total;   // fill vs proportional-to-total
    // Dim "misc/qol-only" fallback only in the DEFAULT view (not bnOnly).
    const miscOnly = total > 0 && coloredTotal === 0 && !bnOnly;
    const wrap = document.createElement(clickable ? 'a' : 'span');
    let wcls = 'dyn-cell-wrap';
    if (!origTotal) wcls += ' empty';
    if (isCurrent) wcls += ' current';
    if (origTotal && !patch.filename) wcls += ' no-page';
    if (miscOnly) wcls += ' misc-only';
    // No colour left to show — bnOnly with no buff/nerf, OR every colour tag
    // removed via the toolbar chips. Render as a plain EMPTY cell (not a dark
    // glassy pill); it stays clickable + keeps its hover tooltip.
    if (origTotal > 0 && coloredTotal === 0 && !miscOnly) wcls += ' bn-empty';
    wrap.className = wcls;
    const cell = document.createElement('span');
    cell.className = 'dyn-cell';
    wrap.appendChild(cell);
    if (total) {
      // Build a vertical gradient where each tag occupies a band proportional
      // to its share. Instead of hard color-stops at the band boundaries we
      // leave a `bleed` zone on each side so adjacent colors interpolate
      // across it — this produces the soft "liquid floating at different
      // densities" look rather than crisp horizontal stripes. The bleed is
      // capped to half the band width to stay within the segment.
      //
      // MISC and QoL are intentionally EXCLUDED from the gradient — these
      // neutral bands dilute the pill's color signal without adding meaning.
      // The tags still surface in the tooltip grid below.
      const tags = gradTagSet.filter(t => gradCounts[t] > 0);
      // Bleed: % half-width of the soft transition zone between adjacent
      // bands. Zero = hard cuts between bands — no phantom mid-tones.
      const bleed = 0;
      let acc = 0;
      const stops = [];
      for (let i = 0; i < tags.length; i++) {
        const t = tags[i];
        const c = gradCounts[t];
        const start = (acc / denom) * 100;
        acc += c;
        const end = (acc / denom) * 100;
        const halfBand = (end - start) / 2;
        const localBleed = Math.min(bleed, halfBand);
        const solidStart = i === 0 ? start : start + localBleed;
        const solidEnd = i === tags.length - 1 ? end : end - localBleed;
        const color = dynColorFor(t, c);
        stops.push(`${color} ${solidStart.toFixed(1)}%`);
        stops.push(`${color} ${solidEnd.toFixed(1)}%`);
      }
      // If every tag was neutral (misc/qol), the colored-tags `stops` array
      // is empty; fall back to a solid dimmed fill so the cell still reads as
      // "this patch touched the entity, just with no buff/nerf/etc." The CSS
      // .misc-only class drops the cell to 50% opacity so it's visibly
      // dimmed vs. a fully-colored cell.
      if (stops.length) {
        cell.style.setProperty('--dyn-bg', `linear-gradient(to bottom, ${stops.join(', ')})`);
      } else if (miscOnly) {
        // Flat-gradient wrapper instead of a raw color so the value always
        // parses as `background-image` — keeps the bg-color slot free for
        // the hover-time opaque backdrop layer. Alpha is halved here to
        // preserve the dimmed-out neutral-only look. Uses EFFECTIVE counts so a
        // removed neutral tag doesn't pick the fill colour.
        const domNeutral = DYN_NEUTRAL_TAGS
          .reduce((a, b) => ((eff[b] || 0) > (eff[a] || 0) ? b : a));
        const m = dynColorFor(domNeutral, eff[domNeutral] || 1)
          .replace(/, ([\d.]+)\)$/, (_, a) => `, ${(parseFloat(a) * 0.5).toFixed(2)})`);
        cell.style.setProperty('--dyn-bg', `linear-gradient(${m}, ${m})`);
      }
    }
    if (clickable) {
      // ?from=<version> lets the destination patch page show a back-arrow here.
      const qs = fromVersion ? '?from=' + fromVersion : '';
      wrap.href = (filePrefix || '') + patch.filename + qs + (entityId ? '#' + entityId : '');
    }
    // Lazy tooltip (built on first hover). Uses the ORIGINAL counts so removed/
    // filtered tags still list on hover even when dropped from the diamond.
    wrap._dynTipParams = origTotal
      ? [patch, counts, patch.filename ? null : '(no patch page yet)']
      : [patch, null, null];
    return wrap;
  }

  // Tooltip popup — a real DOM sibling of .dyn-cell (not a pseudo) so it
  // escapes the diamond's clip-path. Content:
  //   - Header: version + date.
  //   - Body: 2-column grid of tag badges (page-style) each followed by
  //           a small count chip, ordered by DYN_TAG_ORDER. When counts is
  //           null (empty cell) the body holds a single `note` line.
  function dynBuildTip(patch, counts, note) {
    const tip = document.createElement('span');
    tip.className = 'dyn-tip';
    const header = document.createElement('span');
    header.className = 'dyn-tip-header';
    header.textContent = `${patch.version}`;
    tip.appendChild(header);
    if (counts) {
      const grid = document.createElement('span');
      grid.className = 'dyn-tip-grid';
      for (const t of DYN_TAG_ORDER) {
        const c = counts[t] || 0;
        if (!c) continue;
        const row = document.createElement('span');
        row.className = 'dyn-tip-row';
        const badge = document.createElement('span');
        badge.className = `badge ${DYN_TAG_BADGE_CLASS[t]}`;
        badge.textContent = DYN_TAG_LABEL[t];
        const count = document.createElement('span');
        count.className = 'dyn-tip-count';
        count.textContent = '×' + c;
        row.appendChild(badge);
        row.appendChild(count);
        grid.appendChild(row);
      }
      tip.appendChild(grid);
    }
    if (note) {
      const noteEl = document.createElement('span');
      noteEl.className = 'dyn-tip-note';
      noteEl.textContent = note;
      tip.appendChild(noteEl);
    }
    return tip;
  }

  // Read current patch version from the version-picker button in the top nav.
  // Falls back to the document title ("Dota Patch Notes - 7.41a") if needed.
  function dynCurrentVersion() {
    const btn = document.querySelector('.version-picker .version');
    if (btn) {
      const m = btn.textContent.match(/(\d+\.\d+[a-z]?)/);
      if (m) return m[1];
    }
    const t = document.title.match(/(\d+\.\d+[a-z]?)\s*$/);
    return t ? t[1] : null;
  }

  // Known entity kinds — must match the strings emitted by _register_entity()
  // in build_patch.py. Ordered longest-first so "creep-hero" wins over "creep".
  const DYN_KINDS = ['creep-hero', 'hero', 'item', 'unit', 'plain', 'enchant'];

  function dynWindow(manifest, offset) {
    // manifest.patches is newest-first → slice from offset, reverse so the
    // oldest of the window is on the left in the rendered row.
    return manifest.patches.slice(offset, offset + 12).reverse();
  }

  function dynRenderRow(entityDiv, manifest, windowed, currentVersion, offset) {
    const id = entityDiv.id || '';
    if (!id.startsWith('dyn-')) return;
    const rest = id.slice(4);
    const kind = DYN_KINDS.find(k => rest === k || rest.startsWith(k + '-'));
    if (!kind) return;
    const slug = rest.slice(kind.length + 1);
    const key = kind + '|' + slug;
    const rec = manifest.entities[key];
    const perPatch = (rec && rec.patches) || {};
    const wrap = document.createElement('div');
    wrap.className = 'dyn-row-wrap';
    const canLeft  = offset + 12 < manifest.patches.length;
    const canRight = offset > 0;
    if (canLeft) {
      const btn = document.createElement('button');
      btn.className = 'dyn-nav-arrow dyn-nav-left';
      btn.setAttribute('aria-label', 'Show older patches');
      wrap.appendChild(btn);
    }
    const row = document.createElement('div');
    row.className = 'patch-dynamics';
    for (const p of windowed) {
      const counts = perPatch[p.version] || {};
      row.appendChild(dynBuildPill(p, counts, id, p.version === currentVersion, currentVersion));
    }
    wrap.appendChild(row);
    if (canRight) {
      const btn = document.createElement('button');
      btn.className = 'dyn-nav-arrow dyn-nav-right';
      btn.setAttribute('aria-label', 'Show newer patches');
      wrap.appendChild(btn);
    }
    entityDiv.appendChild(wrap);
  }

  // Fill / refill the heroes_dyn matrix's data cells with one pill each. Only
  // cells the builder marked with data-ver/data-hkey (the hero actually changed
  // that patch) are filled — untouched cells stay as the CSS empty diamond, so
  // runtime work scales with real data, not the full N×M grid. Re-runnable: it
  // clears any existing pill first, so the "Buff vs nerf" toggle can rebuild.
  function dynFillMatrix(table, manifest, bnOnly, removed) {
    const byVer = {};
    manifest.patches.forEach(p => { byVer[p.version] = p; });
    // Back-arrow token: 'heroes_dyn' or 'items_dyn' (set on <body data-dyn-from>),
    // so the destination patch page returns to the right matrix.
    const fromTok = (document.body && document.body.dataset.dynFrom) || 'heroes_dyn';
    table.querySelectorAll('td.hd-cell[data-ver]').forEach(td => {
      const prev = td.querySelector('.dyn-cell-wrap');
      if (prev) prev.remove();
      const patch = byVer[td.dataset.ver];
      if (!patch) return;
      const rec = manifest.entities[td.dataset.hkey];
      const counts = (rec && rec.patches && rec.patches[td.dataset.ver]) || {};
      if (!Object.keys(counts).length) return;
      // entityId anchors the click to the entity on the patch page; fromTok makes
      // that page show a back-arrow returning here; filePrefix 'patches/' because
      // the matrix lives at site root, patch pages under /patches.
      const debut = td.dataset.debut === '1';
      td.appendChild(dynBuildPill(patch, counts, td.dataset.eid, false, fromTok, 'patches/', bnOnly, removed, debut));
    });
  }

  // Single <style> whose rule hides the oldest patch columns. Editing one rule
  // is far cheaper than toggling display on thousands of cells (115 cols × 127
  // rows) every resize.
  let _dynFitStyle = null;
  function dynFitStyleEl() {
    if (!_dynFitStyle) {
      _dynFitStyle = document.createElement('style');
      document.head.appendChild(_dynFitStyle);
    }
    return _dynFitStyle;
  }

  // Lay out the matrix so the LATEST patch sits flush at the right edge.
  //  - Hero column auto-sizes to the longest name (+ icon + gap + zoom clearance).
  //  - "Hide old" ON (fit mode): show only the most-recent patches that fit the
  //    box width, sized to fill it exactly (latest flush right); hide the rest.
  //  - "Hide old" OFF: show every patch at the base column width and scroll, with
  //    the box scrolled to the right so the latest still ends at the right edge.
  const HD_MIN_COL = 40;            // base/min patch-column width (px) — fits the 12px version label
  // Right gutter kept clear of the last column so its 2.5× hover-pop isn't cut
  // off by the box edge / vertical scrollbar (the pop grows ~18px past the cell).
  const HD_RIGHT_GUTTER = 24;
  function dynLayoutMatrix(table, fit) {
    const scroller = table.closest('.creeps-scroll');
    if (!scroller) return;
    // Hero column width = longest name + icon + gap + padding. The names never
    // change, so measuring all ~170 rows' scrollWidth on EVERY layout (toggle /
    // resize) forced a costly reflow each time → lag. Measure once and cache on
    // the table; the `load` handler clears it once so fonts/icons settle first.
    let heroW = table._hdHeroW;
    if (heroW == null) {
      let maxName = 0;
      table.querySelectorAll('tbody td.hd-hero .hd-hero-name').forEach(s => {
        maxName = Math.max(maxName, s.scrollWidth);
      });
      heroW = Math.ceil(maxName) + 40 /*icon*/ + 22 /*gap*/ + 18 /*padding 6+12*/;
      table._hdHeroW = heroW;
    }
    table.style.setProperty('--hd-hero-w', heroW + 'px');

    const patchThs = table.querySelectorAll('thead th.hd-patch');
    const total = patchThs.length;
    const csPad = parseFloat(getComputedStyle(scroller).paddingLeft) || 0;
    const avail = scroller.clientWidth - csPad - heroW - HD_RIGHT_GUTTER;
    const style = dynFitStyleEl();
    if (fit && avail > HD_MIN_COL) {
      const n = Math.min(total, Math.max(1, Math.floor(avail / HD_MIN_COL)));
      const colW = avail / n;                 // fill exactly → latest flush right
      table.style.setProperty('--hd-col-w', colW.toFixed(2) + 'px');
      const hide = total - n;                 // hide the oldest `hide` columns
      // Patch columns are table children 2..(total+1); hero is child 1.
      style.textContent = hide > 0
        ? `.heroes-dyn-table thead .col-row th.hd-patch:nth-child(-n+${hide + 1}):nth-child(n+2),`
          // he / ha are short aliases for `.hd-cell.hd-empty` / `.hd-cell.hd-absent`
          // (see builders/dyn_matrix_common.py + the corresponding CSS block).
          // Match all three so Hide-old collapses placeholder columns too.
          + `.heroes-dyn-table tbody td.hd-cell:nth-child(-n+${hide + 1}):nth-child(n+2),`
          + `.heroes-dyn-table tbody td.he:nth-child(-n+${hide + 1}):nth-child(n+2),`
          + `.heroes-dyn-table tbody td.ha:nth-child(-n+${hide + 1}):nth-child(n+2)`
          + `{display:none}`
        : '';
      scroller.scrollLeft = 0;
    } else {
      table.style.setProperty('--hd-col-w', HD_MIN_COL + 'px');
      style.textContent = '';
      // Show-all: park the scroll near the right (latest in view) but SNAP to a
      // whole-column multiple so the left edge shows a FULL column, never a
      // clipped "..2c" sliver of the column hidden behind the sticky hero col.
      const maxS = scroller.scrollWidth - scroller.clientWidth;
      scroller.scrollLeft = Math.max(0, Math.floor(maxS / HD_MIN_COL) * HD_MIN_COL);
    }
    dynRecomputeSupercats(table);
  }

  // Super-category row (base version spanning its lettered variants). After the
  // fit-to-width hide, re-size each base header to the count of its VISIBLE leaf
  // columns; hide a base header whose columns are all hidden. Mirrors the
  // Neutral-Creeps recomputeCatColspans pattern.
  function dynRecomputeSupercats(table) {
    table.querySelectorAll('thead .hd-supercat[data-base]').forEach(head => {
      const base = head.dataset.base;
      let span = 0;
      table.querySelectorAll('thead .col-row th.hd-patch').forEach(th => {
        if (th.dataset.base === base && th.offsetParent !== null) span++;
      });
      if (span > 0) { head.colSpan = span; head.style.display = ''; }
      else { head.style.display = 'none'; }
    });
  }

  // Wire the heroes_dyn toolbar: Hide old (fit-to-width), Buff vs nerf,
  // the "Remove" tag chips, and the hero search box.
  // Multi-select dropdown controls (.hd-dd): a flat button opens a checkbox popover.
  // The popover is PORTALED to <body> (so .creeps-scroll's contain:paint doesn't clip
  // it and an empty table can't push a scrollbar) and positioned fixed under the
  // button. A top "All" checkbox toggles every option; the gold badge shows "all" when
  // all are selected, else the count. `onChange` re-runs the row filter.
  function initHdDropdowns(scope, onChange) {
    const dds = [...scope.querySelectorAll('.hd-dd')];
    if (!dds.length) return;
    const closeAll = (except) => dds.forEach(dd => {
      if (dd === except) return;
      if (dd._menu) dd._menu.hidden = true;
      dd.querySelector('.hd-dd-btn').setAttribute('aria-expanded', 'false');
    });
    dds.forEach(dd => {
      const btn = dd.querySelector('.hd-dd-btn');
      const menu = dd.querySelector('.hd-dd-menu');
      const badge = dd.querySelector('.hd-dd-badge');
      const allBox = menu.querySelector('input[data-dd-all]');
      const boxes = [...menu.querySelectorAll('input[type="checkbox"]')]
        .filter(b => b !== allBox);
      dd._menu = menu;
      // Portal the menu out to <body> once (escapes the scroll box's paint clip).
      document.body.appendChild(menu);
      menu.style.position = 'fixed';
      const place = () => {
        const r = btn.getBoundingClientRect();
        menu.style.top = (r.bottom + 6) + 'px';
        menu.style.left = r.left + 'px';
      };
      const sync = () => {
        const n = boxes.filter(b => b.checked).length;
        if (badge) badge.textContent = (n === boxes.length) ? 'all' : String(n);
        if (allBox) {
          allBox.checked = (n === boxes.length);
          allBox.indeterminate = (n > 0 && n < boxes.length);
        }
      };
      sync();
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = menu.hidden;
        closeAll(dd);
        if (willOpen) place();
        menu.hidden = !willOpen;
        btn.setAttribute('aria-expanded', String(willOpen));
      });
      menu.addEventListener('click', (e) => e.stopPropagation());
      if (allBox) allBox.addEventListener('change', () => {
        boxes.forEach(b => { b.checked = allBox.checked; });
        sync(); onChange();
      });
      boxes.forEach(b => b.addEventListener('change', () => { sync(); onChange(); }));
    });
    document.addEventListener('click', () => closeAll(null));
    // Button moves with the page but a fixed menu doesn't — close on scroll/resize.
    window.addEventListener('scroll', () => closeAll(null), true);
    window.addEventListener('resize', () => closeAll(null));
  }

  function dynSetupMatrix(table, manifest) {
    const elOld = document.getElementById('hd-hide-old');
    const elBn = document.getElementById('hd-bn-only');
    const removed = new Set();                 // tags the user toggled off (Remove chips)
    const chips = [...table.closest('.creeps-page').querySelectorAll('.hd-tag[data-tag]')];
    const layout = () => {
      dynLayoutMatrix(table, !elOld || elOld.checked);
      // Column widths + horizontal overflow just changed → tell the sticky-frame
      // divider (a separate IIFE) to re-anchor after this layout pass.
      window.dispatchEvent(new CustomEvent('mr:filter-changed'));
    };
    const refill = () => dynFillMatrix(table, manifest, !!(elBn && elBn.checked), removed);
    refill();
    layout();
    if (elOld) elOld.addEventListener('change', layout);

    // "Buff vs nerf": collapse each cell to two bands — buff + NEW (green) vs
    // nerf + DEL (red); rework/misc/qol drop out of the colour (the hover tooltip
    // still lists every tag). dynBuildPill does the buff←NEW / nerf←DEL fold, so
    // this switch ONLY flips the bnOnly flag — the Remove chips stay an entirely
    // INDEPENDENT control (no longer auto-toggled by this switch).
    if (elBn) elBn.addEventListener('change', refill);

    // "Remove" tag chips — clicking toggles a tag off (sunken + grey) and drops
    // it from every dyn-cell's colouring (hover tooltip still lists it).
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const tag = chip.dataset.tag;
        if (removed.has(tag)) { removed.delete(tag); chip.classList.remove('removed'); }
        else { removed.add(tag); chip.classList.add('removed'); }
        refill();
      });
    });

    // Row filters — name search + (items_dyn only) item-class chips + "Show
    // deleted" toggle, all combined into ONE visibility pass so they don't fight
    // over tr.style.display. Search: comma-separated, partial ("anci,aba,brood").
    // Class chips / deleted toggle are absent on heroes_dyn → their predicates
    // are no-ops there. Row display only (never re-measures the hero width).
    const search = document.getElementById('hd-hero-search');
    const page = table.closest('.creeps-page');
    const delToggle = document.getElementById('hd-show-deleted');
    const attackBtns = [...document.querySelectorAll('.hs-attack-filter')];
    const attrBtns = [...document.querySelectorAll('.hs-attr-filter')];
    const priceMin = document.getElementById('hd-price-min');
    const priceMax = document.getElementById('hd-price-max');
    const priceClear = document.getElementById('hd-price-clear');
    const rows = [...table.querySelectorAll('tbody tr')];
    let attackFilter = '';
    let attrFilter = '';
    const applyRowFilters = () => {
      const terms = search
        ? search.value.toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
        : [];
      // Multi-select dropdowns (Type=class, Category): a row must satisfy EVERY
      // active dropdown — its data-<dd> value among that dropdown's checked options.
      // Menus are portaled to <body>, so find each by its data-dd (not by containment).
      const ddFilters = page
        ? [...page.querySelectorAll('.hd-dd[data-dd]')].map(dd => {
            const key = dd.dataset.dd;
            const menu = document.querySelector('.hd-dd-menu[data-dd="' + key + '"]');
            const checked = new Set(menu
              ? [...menu.querySelectorAll('input[data-' + key + ']:checked')]
                  .map(i => i.dataset[key])
              : []);
            return { key, checked };
          })
        : [];
      const showDeleted = !!(delToggle && delToggle.checked);
      const lo = priceMin ? parseFloat(priceMin.value) : NaN;
      const hi = priceMax ? parseFloat(priceMax.value) : NaN;
      const hasLo = !isNaN(lo), hasHi = !isNaN(hi);
      // Clear-X visible only when a bound is set.
      if (priceClear) priceClear.hidden = !(hasLo || hasHi);
      rows.forEach(tr => {
        const cell = tr.querySelector('td.hd-hero');
        const name = (cell?.dataset.sort || '').toLowerCase();
        // data-alias = abbreviations + acronym (aghs→Aghanim's Scepter, bkb→вЂ¦).
        const alias = (cell?.dataset.alias || '').toLowerCase();
        // data-slug = engine slug (e.g. "wisp" for Io, "furion" for Nature's Prophet).
        const slug = (cell?.dataset.slug || '').toLowerCase();
        const okSearch = !terms.length
          || terms.some(t => name.includes(t) || alias.includes(t) || slug.includes(t));
        // A row with no data-<dd> value is EXEMPT from that dropdown (e.g. neutrals/
        // enchants have no shop category → the Category filter never hides them).
        const okDd = ddFilters.every(f => {
          const v = tr.dataset[f.key];
          return v === undefined || f.checked.has(v);
        });
        // data-current="0" = removed from the game → shown only when "Show deleted".
        const okDel = showDeleted || tr.dataset.current !== '0';
        const okAttack = !attackFilter || tr.dataset.attackType === attackFilter;
        const okAttr = !attrFilter || tr.dataset.attrType === attrFilter;
        // Price: items without data-price (neutrals/enchants = free) are EXEMPT.
        let okPrice = true;
        const p = tr.dataset.price;
        if ((hasLo || hasHi) && p !== undefined) {
          const v = parseFloat(p);
          if (hasLo && v < lo) okPrice = false;
          if (hasHi && v > hi) okPrice = false;
        }
        tr.style.display = (okSearch && okDd && okDel && okAttack && okAttr && okPrice) ? '' : 'none';
      });
      attackBtns.forEach(btn => {
        const active = btn.dataset.attackFilter === attackFilter;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      attrBtns.forEach(btn => {
        const active = btn.dataset.attrFilter === attrFilter;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    };
    if (search) search.addEventListener('input', applyRowFilters);
    if (page) initHdDropdowns(page, applyRowFilters);
    if (delToggle) delToggle.addEventListener('change', applyRowFilters);
    attackBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.attackFilter || '';
        attackFilter = attackFilter === next ? '' : next;
        applyRowFilters();
      });
    });
    attrBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.attrFilter || '';
        attrFilter = attrFilter === next ? '' : next;
        applyRowFilters();
      });
    });
    if (priceMin) priceMin.addEventListener('input', applyRowFilters);
    if (priceMax) priceMax.addEventListener('input', applyRowFilters);
    if (priceClear) priceClear.addEventListener('click', () => {
      if (priceMin) priceMin.value = '';
      if (priceMax) priceMax.value = '';
      applyRowFilters();
    });
    applyRowFilters();   // initial pass (deleted hidden + only Items class by default)

    window.addEventListener('resize', layout, { passive: true });
    // On load, ONLY re-fit the columns to the (settled) box width — reuse the
    // cached identity-column width from setup. Do NOT re-measure it here: setup
    // measured it over ALL rows (before the default class/Deleted filters hid
    // some), so it's already complete + correct. Re-measuring now would see only
    // the VISIBLE rows (shorter names) → a smaller heroW → the column fit
    // (computed from it) would mismatch the real heroW and overflow the box with a
    // horizontal scrollbar (the items_dyn bug — heroes_dyn has no default filter so
    // it never showed). Names use the system font (no web-font reflow), so the
    // setup measure needs no font-settle correction.
    window.addEventListener('load', layout);
  }

  function dynInit() {
    const entities = document.querySelectorAll('.entity[id^="dyn-"]');
    const matrix = document.querySelector('.heroes-dyn-table');
    if (!entities.length && !matrix) return;
    const currentVersion = dynCurrentVersion();
    // Path differs by page location: patch pages sit under /patches/ (so ../),
    // root pages (heroes_dyn) read it directly. Builder sets data-dyn-path.
    const dynPath = (document.body && document.body.dataset.dynPath) || '../_dynamics.json';
    fetch(dynPath, { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : null)
      .then(manifest => {
        if (!manifest) return;
        if (entities.length) {
          const buildRow = (e) => {
            if (e.dataset.dynBuilt) return;
            e.dataset.dynBuilt = '1';
            const off = parseInt(e.dataset.dynOffset || '0', 10);
            dynRenderRow(e, manifest, dynWindow(manifest, off), currentVersion, off);
          };
          // Arrow navigation: per-entity offset stored in data-dyn-offset.
          // Each row navigates independently — clicking an arrow only rebuilds
          // the entity whose dyn-row-wrap contains that arrow.
          document.addEventListener('click', (ev) => {
            const arrow = ev.target.closest('.dyn-nav-arrow');
            if (!arrow) return;
            const entityDiv = arrow.closest('.entity[id^="dyn-"]');
            if (!entityDiv) return;
            const delta = arrow.classList.contains('dyn-nav-left') ? 1 : -1;
            const cur = parseInt(entityDiv.dataset.dynOffset || '0', 10);
            const newOff = cur + delta;
            if (newOff < 0 || newOff + 12 > manifest.patches.length) return;
            entityDiv.dataset.dynOffset = String(newOff);
            const cv = dynCurrentVersion();
            const old = entityDiv.querySelector('.dyn-row-wrap');
            if (old) old.remove();
            dynRenderRow(entityDiv, manifest, dynWindow(manifest, newOff), cv, newOff);
          });
          // Build each entity's cell row LAZILY as it nears the viewport — on a
          // 1800-change patch that's ~3200 gradient cells; creating them all on
          // load is the page's biggest cost. IntersectionObserver builds only
          // what's near view, then unobserves. Identical look, far less work.
          if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver((obsEntries, obs) => {
              obsEntries.forEach(en => {
                if (en.isIntersecting) { buildRow(en.target); obs.unobserve(en.target); }
              });
            }, { rootMargin: '120% 0px' });   // ~1.2 screen-heights of lead, scales with resolution
            entities.forEach(e => io.observe(e));
          } else {
            entities.forEach(buildRow);
          }
          // A #hash target must have its row built before we re-anchor (rows add
          // ~28px height). Force-build the target immediately, then re-anchor
          // (the getBoundingClientRect read forces layout first). Offset for nav.
          if (window.location.hash) {
            const _tgt = document.getElementById(
              decodeURIComponent(window.location.hash.slice(1)));
            if (_tgt && _tgt.matches('.entity[id^="dyn-"]')) buildRow(_tgt);
            const el = document.getElementById(
              decodeURIComponent(window.location.hash.slice(1)));
            if (el) {
              const navH = parseFloat(getComputedStyle(document.documentElement)
                .getPropertyValue('--site-nav-h')) || 70;
              const toolbarEl = document.querySelector('.toolbar');
              const toolbarH = toolbarEl ? toolbarEl.getBoundingClientRect().height : 0;
              const y = el.getBoundingClientRect().top + window.scrollY - navH - toolbarH - 8;
              window.scrollTo(0, Math.max(0, y));
            }
          }
        }
        if (matrix) dynSetupMatrix(matrix, manifest);
        dynAttachTooltipDelegation();
      })
      .catch(() => { /* silently fail — widget is an enhancement */ });
  }

  // Single shared tooltip lives on document.body (NOT inside any .dyn-cell-
  // wrap). Two reasons:
  //   1. Lazy: we only build the tooltip DOM once, then re-populate it on
  //      each hover. With 3000+ cells on big patches, per-cell pre-built
  //      tooltips were adding ~50k DOM nodes upfront.
  //   2. content-visibility:auto on .entity-block implies `contain: paint`
  //      which CLIPS any descendant — including tooltips that overflow
  //      above the block. Living on body escapes that clip.
  function dynAttachTooltipDelegation() {
    const shared = document.createElement('span');
    shared.className = 'dyn-tip dyn-tip-shared';
    document.body.appendChild(shared);
    let currentWrap = null;

    function show(wrap) {
      const params = wrap._dynTipParams;
      if (!params) return;
      // Rebuild children: clear previous and populate via the same helper.
      while (shared.firstChild) shared.removeChild(shared.firstChild);
      const built = dynBuildTip(params[0], params[1], params[2]);
      while (built.firstChild) shared.appendChild(built.firstChild);
      // Position-fix above the wrap. We avoid layout reads inside scroll
      // listeners; reading getBoundingClientRect once on hover is cheap.
      const r = wrap.getBoundingClientRect();
      // Show first (to measure tooltip height), then place.
      shared.style.left = '0px';
      shared.style.top = '0px';
      shared.classList.add('is-visible');
      const tipRect = shared.getBoundingClientRect();
      let left = r.left + r.width / 2 - tipRect.width / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
      // Cell scales to 2.5× on hover from its centre, so it grows ~18px
      // upward beyond the wrap's static bounding rect. Push the tooltip
      // 24px above r.top (18 expansion + 6 clearance) so it never sits on
      // the inflated cell.
      const top = r.top - tipRect.height - 24;
      shared.style.left = left + 'px';
      shared.style.top = top + 'px';
    }
    function hide() {
      shared.classList.remove('is-visible');
      currentWrap = null;
    }
    document.addEventListener('mouseover', (e) => {
      const wrap = e.target.closest && e.target.closest('.dyn-cell-wrap');
      if (wrap === currentWrap) return;
      if (wrap) { currentWrap = wrap; show(wrap); }
      else { hide(); }
    }, { capture: true, passive: true });
    document.addEventListener('mouseout', (e) => {
      // Only hide if the pointer left the wrap region entirely.
      const wrap = e.target.closest && e.target.closest('.dyn-cell-wrap');
      if (!wrap) return;
      const to = e.relatedTarget;
      if (!to || !wrap.contains(to)) hide();
    }, { capture: true, passive: true });
    window.addEventListener('scroll', hide, { passive: true });
  }

  dynInit();
})();

// ---- CREEPS TABLE: click icon → copy "-createhero <name> neutral" ----
(function() {
  const icons = document.querySelectorAll('.creep-copy[data-cmd]');
  if (!icons.length) return;

  // One reusable toast element appended to body.
  let toast = null;
  let hideTimer = null;
  function showToast(x, y) {
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'copy-toast';
      toast.textContent = 'Copied';
      document.body.appendChild(toast);
    }
    toast.style.left = x + 'px';
    toast.style.top = y + 'px';
    // restart the fade animation
    toast.classList.remove('is-visible');
    void toast.offsetWidth; // force reflow so re-adding the class re-triggers
    toast.classList.add('is-visible');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => toast.classList.remove('is-visible'), 900);
  }

  async function copyCmd(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Fallback for non-secure contexts (file://, http on some browsers)
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
      return ok;
    }
  }

  icons.forEach(img => {
    img.style.cursor = 'pointer';
    img.addEventListener('click', async (e) => {
      const cmd = img.getAttribute('data-cmd');
      if (!cmd) return;
      const ok = await copyCmd(cmd);
      if (ok) {
        const r = img.getBoundingClientRect();
        showToast(r.left + r.width / 2, r.top - 6);
      }
    });
  });
})();

// ---- CREEPS TABLE: sortable columns ----
(function() {
  const table = document.querySelector('.creeps-table');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  const headers = [...table.querySelectorAll('thead th.sortable')];
  if (!tbody || !headers.length) return;

  // Map column key → body-cell index. data-idx is authored server-side so
  // it stays correct despite the colspan=2 on the Юнит header (which makes
  // DOM th position diverge from cell index).
  const colIndex = {};
  headers.forEach(th => {
    if (th.dataset.col) colIndex[th.dataset.col] = parseInt(th.dataset.idx, 10);
  });

  // Sort value for a cell: prefer the numeric data-lvl on the level
  // column (its text gets blanked by collapseLevels), else parse the
  // first number out of the text (handles "240", "+0,5", "3-5",
  // "1400/800", "0%", "Ближняя (100)"), else fall back to lowercased
  // text. Empty cells return null and always sink to the bottom.
  function cellVal(tr, idx) {
    const td = tr.children[idx];
    if (!td) return null;
    if (td.dataset.lvl !== undefined && td.dataset.lvl !== '') {
      return parseFloat(td.dataset.lvl);
    }
    // Icon-only columns carry a data-sort value: a number (rank) for flag
    // columns (dash 0 < No 1 < Yes 2), or a string (e.g. the Unit name).
    if (td.dataset.sort !== undefined) {
      const s = td.dataset.sort;
      const n = parseFloat(s);
      return isNaN(n) ? s.toLowerCase() : n;
    }
    const t = td.textContent.trim();
    if (!t || t === ' ') return null;
    if (t === '-') return 0;   // explicit "no mana" — sorts as the minimum, not last
    const m = t.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : t.toLowerCase();
  }

  // Show the level number once per consecutive run; blank the repeats and
  // draw the group divider (tier-break) at each run start. Works in any
  // row order, so the grouped look survives sorting by level. Visibility-
  // aware: rows hidden by filter (mr-attack-out / mr-filtered-out /
  // mr-search-out → display:none) don't participate in run tracking — else
  // a hidden "first of group" row would leave the next visible row blank
  // (the bug behind the ranged filter losing all level labels).
  function collapseLevels(rows) {
    let prev = null;
    rows.forEach(tr => {
      const cell = tr.querySelector('.lvl-cell');
      if (!cell) return;
      if (tr.classList.contains('mr-attack-out')
          || tr.classList.contains('mr-filtered-out')
          || tr.classList.contains('mr-search-out')) return;
      const lvl = cell.dataset.lvl;
      if (lvl !== prev) { cell.textContent = lvl; tr.classList.add('tier-break'); }
      else { cell.textContent = ''; tr.classList.remove('tier-break'); }
      prev = lvl;
    });
  }

  // Unit Abilities: group consecutive rows of the SAME unit — show the Lvl +
  // Unit icon only on the first row of each run, hide on the rest (cells stay
  // for alignment). Recomputed after every sort so it works in any order.
  const isUA = table.classList.contains('unit-abilities-table');
  function groupByUnit(rows) {
    let prevUnit = null, prevLvl = null;
    rows.forEach(tr => {
      const u = tr.dataset.unit;
      const lvlCell = tr.querySelector('.ua-lvl');
      const lvl = lvlCell ? lvlCell.dataset.lvl : null;
      // Level grouping — show the number once per level run + the horizontal
      // tier divider at each level change (mirrors the Neutral Creeps table).
      if (lvl !== prevLvl) {
        if (lvlCell) lvlCell.textContent = lvl;
        tr.classList.add('tier-break');
      } else {
        if (lvlCell) lvlCell.textContent = '';
        tr.classList.remove('tier-break');
      }
      // Unit-icon dedup — show the icon only on the first row of each unit run.
      if (u !== prevUnit) tr.classList.remove('ua-dup');
      else tr.classList.add('ua-dup');
      prevUnit = u; prevLvl = lvl;
    });
  }
  const groupRows = isUA ? groupByUnit : collapseLevels;
  // Expose to the attack-type filter (lives in a sibling IIFE) so it can
  // re-run grouping after hiding rows — else hidden "first of run" rows
  // leave the next visible row with a blank lvl cell.
  table._groupRows = groupRows;

  // Merge consecutive identical ability cells into one rowspanned cell (only
  // in the default order — sorting reads cells by column index, so we un-merge
  // first). Process columns right-to-left so removals don't shift earlier idx.
  let abilMerges = [];
  function unmergeAbilityRuns() {
    for (let i = abilMerges.length - 1; i >= 0; i--) {
      abilMerges[i].tr.insertBefore(abilMerges[i].td, abilMerges[i].next);
    }
    abilMerges = [];
    tbody.querySelectorAll('td').forEach(td => {
      if (td.rowSpan > 1 && /\bcol-ability/.test(td.className)) td.rowSpan = 1;
    });
  }
  function mergeAbilityRuns(rows) {
    ['ability3', 'ability2', 'ability1'].forEach(col => {
      const idx = colIndex[col];
      if (idx == null) return;
      let i = 0;
      while (i < rows.length) {
        const td = rows[i].children[idx];
        const name = td && td.dataset.name;
        if (!name) { i++; continue; }
        // Shared auras stay per-unit: each frog keeps its own cell so a row
        // click highlights it (merging would rowspan 4 frogs into one block).
        if (name === 'Riverborn Aura') { i++; continue; }
        let j = i + 1;
        while (j < rows.length && rows[j].children[idx] &&
               rows[j].children[idx].dataset.name === name) j++;
        if (j - i > 1) {
          td.rowSpan = j - i;
          for (let k = i + 1; k < j; k++) {
            const rm = rows[k].children[idx];
            abilMerges.push({ tr: rows[k], td: rm, next: rm.nextSibling });
            rm.remove();
          }
        }
        i = j;
      }
    });
  }

  let sortCol = null, sortState = 0;  // 0 = neutral, 1 = descending, 2 = ascending
  const originalOrder = [...tbody.querySelectorAll('tr')];

  // Moving rows in the DOM resets CSS animations to t=0. Snapshot currentTime
  // for every animated element before the move, restore it after so the
  // autocast-snake comet continues without restarting.
  function snapAnims(rows) {
    const map = new Map();
    rows.forEach(tr => {
      tr.querySelectorAll('[style*="animation"], .autocast-snake rect').forEach(el => {
        const anims = el.getAnimations();
        if (anims.length) map.set(el, anims.map(a => a.currentTime));
      });
    });
    return map;
  }
  function restoreAnims(map) {
    map.forEach((times, el) => {
      el.getAnimations().forEach((a, i) => { if (times[i] != null) a.currentTime = times[i]; });
    });
  }

  function applySort(col, dir) {
    unmergeAbilityRuns();             // restore full cells before index-based sort
    const idx = colIndex[col];
    const rows = [...tbody.querySelectorAll('tr')];
    rows.sort((a, b) => {
      const va = cellVal(a, idx), vb = cellVal(b, idx);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;          // empties always last
      if (vb === null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    const snap = snapAnims(rows);
    rows.forEach(tr => tbody.appendChild(tr));
    restoreAnims(snap);
    groupRows(rows);
  }

  headers.forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      // 3-state cycle: neutral → descending → ascending → neutral.
      if (sortCol === col) sortState = (sortState + 1) % 3;
      else { sortCol = col; sortState = 1; }     // first click = descending (largest first)
      headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
      if (sortState === 0) {
        // Back to neutral: restore the default level-grouped order, dim ↕ returns.
        sortCol = null;
        unmergeAbilityRuns();
        const snap0 = snapAnims(originalOrder);
        originalOrder.forEach(tr => tbody.appendChild(tr));
        restoreAnims(snap0);
        groupRows(originalOrder);
        mergeAbilityRuns(originalOrder);   // re-merge in default order
      } else {
        const dir = sortState === 1 ? -1 : 1;
        th.classList.add(dir === 1 ? 'sort-asc' : 'sort-desc');
        applySort(col, dir);
      }
    });
  });

  // Initial pass: collapse/group the default order + merge ability runs.
  groupRows([...tbody.querySelectorAll('tr')]);
  mergeAbilityRuns([...tbody.querySelectorAll('tr')]);

  // Unit Abilities VIEW filter (Standard | Only Auras). Toggles a class on
  // the table; CSS hides non-aura rows. Also reorders columns: in "Only Auras"
  // the visible order is Lvl/Unit/Ability | Radius/Duration | Aura Stack/Through
  // BKB/AS Effect/MS Effect | Effect 1-3 — grouped so the category header (kept
  // in Auras view too) spans contiguous columns.
  const uaView = document.getElementById('ua-view-mode');
  if (uaView) {
    const STD_ORDER = ['lvl', 'unit', 'ability', 'type', 'damage',
      'manacost', 'cooldown', 'duration', 'cast_range', 'aoe', 'stackable',
      'dispel', 'through_bkb', 'as_effect', 'ms_effect',
      'effect', 'effect2', 'effect3'];
    // Auras view: VISIBLE columns first, grouped by category (Basic | Essentials
    // = Radius,Duration | Extra | Effects), then the hidden-by-CSS columns
    // (type/damage/manacost/cooldown/cast_range/dispel) at the end so the DOM
    // child count stays in sync.
    const AURA_ORDER = ['lvl', 'unit', 'ability', 'aoe', 'duration',
      'stackable', 'through_bkb', 'as_effect', 'ms_effect',
      'effect', 'effect2', 'effect3',
      'type', 'damage', 'manacost', 'cooldown', 'cast_range', 'dispel'];
    const headRow = table.querySelector('thead .col-row')
      || table.querySelector('thead tr');
    // Resize each category cell to its currently-visible leaf columns (Auras
    // hides some), so the category header lines up in both views.
    function recomputeUaCats() {
      table.querySelectorAll('thead tr.cat-row th.cat-head[data-cat]').forEach(head => {
        let span = 0;
        table.querySelectorAll('thead tr.col-row th[data-cat="' + head.dataset.cat + '"]')
          .forEach(th => { if (th.offsetParent !== null) span += th.colSpan || 1; });
        head.colSpan = span || 1;
      });
    }

    function reorderCells(order) {
      const reorderOne = (parent) => {
        order.forEach(k => {
          const cell = [...parent.children].find(c => c.dataset.col === k);
          if (cell) parent.appendChild(cell);
        });
      };
      if (headRow) reorderOne(headRow);
      tbody.querySelectorAll('tr').forEach(reorderOne);
      // Refresh colIndex (used by cellVal) for the new column positions.
      Object.keys(colIndex).forEach(k => delete colIndex[k]);
      if (headRow) {
        [...headRow.children].forEach((th, i) => {
          if (th.dataset.col) colIndex[th.dataset.col] = i;
        });
      }
    }

    // Vertical category dividers: left border on the first VISIBLE column of each
    // category (after the first), on the header col-row AND every body cell so the
    // line runs the full height. Driven by data-cat so it tracks the Auras reorder.
    // AURA_HIDDEN mirrors the columns hidden by .filter-auras in styles.css.
    const AURA_HIDDEN = new Set(['type', 'damage', 'manacost', 'cooldown', 'cast_range', 'dispel']);
    function markCatEdges(auras) {
      const hidden = auras ? AURA_HIDDEN : null;
      const rows = [headRow, ...tbody.querySelectorAll('tr')];
      rows.forEach(row => {
        if (!row) return;
        let prevCat = null;
        [...row.children].forEach(cell => {
          cell.classList.remove('cat-edge');
          const col = cell.dataset.col, cat = cell.dataset.cat;
          if (!col || (hidden && hidden.has(col))) return;   // skip hidden columns
          if (prevCat !== null && cat && cat !== prevCat) cell.classList.add('cat-edge');
          if (cat) prevCat = cat;
        });
      });
    }

    const applyUaView = () => {
      const auras = uaView.value === 'auras';
      table.classList.toggle('filter-auras', auras);
      reorderCells(auras ? AURA_ORDER : STD_ORDER);
      recomputeUaCats();          // category header spans the now-visible columns
      markCatEdges(auras);        // category dividers track the visible columns
      groupRows(auras
        ? [...tbody.querySelectorAll('tr.ua-row-aura')]
        : [...tbody.querySelectorAll('tr')]);
    };
    uaView.addEventListener('change', applyUaView);
    markCatEdges(false);          // initial Standard-view dividers
  }

  // Upgrades — binary switch. Toggles `.show-upgrades` on the UA table;
  // CSS draws a soft rounded outline + faint fill on every `td.leveled`.
  const uaUpg = document.getElementById('ua-upgrades-mode');
  if (uaUpg && table) {
    const apply = () => table.classList.toggle('show-upgrades', uaUpg.checked);
    uaUpg.addEventListener('change', apply);
    apply();
  }
})();

// ---- UNIT ABILITIES: collapsed upgrade cells ("40…26") expand on click into a
// floating popover with the full per-tier list. Fixed-positioned, clamped to the
// viewport, so the column width never changes. ----
(function() {
  const table = document.querySelector('.unit-abilities-table');
  if (!table) return;
  let pop = null, openBtn = null;
  function ensurePop() {
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'lvl-popover';
      pop.setAttribute('aria-hidden', 'true');
      document.body.appendChild(pop);
    }
    return pop;
  }
  function close() {
    if (pop) pop.classList.remove('show');
    if (openBtn) { openBtn.setAttribute('aria-expanded', 'false'); openBtn = null; }
  }
  function open(btn) {
    const p = ensurePop();
    p.textContent = btn.dataset.full || btn.textContent;
    p.classList.add('show');
    const r = btn.getBoundingClientRect();
    const pr = p.getBoundingClientRect();
    let left = r.left + r.width / 2 - pr.width / 2;
    left = Math.max(6, Math.min(left, window.innerWidth - pr.width - 6));
    let top = r.top - pr.height - 6;            // prefer above
    if (top < 6) top = r.bottom + 6;            // flip below if no room
    p.style.left = left + 'px';
    p.style.top = top + 'px';
    btn.setAttribute('aria-expanded', 'true');
    openBtn = btn;
  }
  table.addEventListener('click', (e) => {
    const btn = e.target.closest('.lvl-toggle');
    if (!btn) return;
    e.preventDefault();
    if (openBtn === btn) close(); else { close(); open(btn); }
  });
  document.addEventListener('click', (e) => {
    if (openBtn && !e.target.closest('.lvl-toggle')) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  // The table scrolls inside its own box → close on any scroll so the popover
  // never detaches from its cell.
  window.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);
})();

// ---- CREEPS TABLE: per-stat changelog tooltip (HP / Armor / Mana / Magres) ----
(function() {
  const cells = document.querySelectorAll('td[data-hist], td[data-name]');
  if (!cells.length) return;

  let tip = null;
  function ensureTip() {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'stat-hist-tip';
      document.body.appendChild(tip);
    }
    return tip;
  }

  // "23.02.2022" -> "23.02.22"
  function shortDate(d) {
    const p = (d || '').split('.');
    if (p.length === 3 && p[2].length === 4) p[2] = p[2].slice(2);
    return p.join('.');
  }
  // Mean of a slash/space value ("40/36/32/26" -> 33.5, "12.0" -> 12).
  function meanOf(s) {
    const nums = String(s).split(/[\/\s]+/)
      .map(x => parseFloat(x.replace(',', '.'))).filter(isFinite);
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : NaN;
  }
  // Colour reflects buff/nerf, not raw direction: for lower-is-better stats
  // (cooldown, mana, BAT) a DROP is the buff (green). The % keeps its real sign.
  function pctHtml(ov, nv, lowerBetter) {
    const o = meanOf(ov), n = meanOf(nv);
    if (!isFinite(o) || !isFinite(n) || o === 0) return '';
    // Divide by |o| so a negative baseline keeps the real direction:
    // armor -1 → 0 is a +100% gain (a buff), not -100%.
    const pct = (n - o) / Math.abs(o) * 100;
    const good = lowerBetter ? pct < 0 : pct > 0;
    const cls = pct === 0 ? 'flat' : (good ? 'up' : 'down');
    const sign = pct > 0 ? '+' : '';
    let num = pct.toFixed(1);
    if (num.endsWith('.0')) num = num.slice(0, -2);  // 50.0 → 50, 1900.0 → 1900
    return ' <span class="stat-pct ' + cls + '">' + sign + num + '%</span>';
  }
  function chgHead(patch, date) {
    return '<div class="stat-chg-head"><span class="chg-patch">' + patch
         + '</span><span class="chg-date">' + shortDate(date) + '</span></div>';
  }
  // One history entry → its old/new values (display + numeric) + polarity, or
  // null for non-value markers (A added / R removed / P replaced) which carry
  // no comparable value. 'C' computed cells carry pretty display (p3/p4) AND
  // raw numerics (p5/p6) so the % isn't skewed by thousands formatting.
  function valEntry(p) {
    const k = p[2];
    if (k === 'V') return { dispOld: p[3], dispNew: p[4], numOld: p[3], numNew: p[4], lb: p[5] === 'lo' };
    if (k === 'F') return { dispOld: p[4], dispNew: p[5], numOld: p[4], numNew: p[5], lb: p[6] === 'lo' };
    if (k === 'C') return { dispOld: p[3], dispNew: p[4], numOld: p[5], numNew: p[6], lb: p[7] === 'lo' };
    if (k === 'N') return { dispOld: p[3], dispNew: p[4], numOld: p[3], numNew: p[4], lb: false };
    return null;
  }
  // Overall first-observed → today summary, shown at the TOP of the tooltip
  // (above the newest patch) with a divider below. Needs >1 value change;
  // scans past A/R/P markers to the first & last real value entries.
  function netSummary(entries) {
    const vals = entries.map(e => valEntry(e.split('|'))).filter(Boolean);
    if (vals.length < 2) return '';
    const first = vals[0], last = vals[vals.length - 1];
    const o = meanOf(first.numOld), n = meanOf(last.numNew);
    if (!isFinite(o) || !isFinite(n) || o === 0) return '';
    const pct = (n - o) / Math.abs(o) * 100;
    // Net 0% (value drifted then returned to its start) is still shown — flat.
    const cls = pct === 0 ? 'flat' : ((last.lb ? pct < 0 : pct > 0) ? 'up' : 'down');
    const sign = pct > 0 ? '+' : '';
    let num = pct.toFixed(1);
    if (num.endsWith('.0')) num = num.slice(0, -2);
    return '<div class="stat-net"><span class="stat-net-label">overall</span>'
         + first.dispOld + ' → ' + last.dispNew
         + ' <span class="stat-pct ' + cls + '">' + sign + num + '%</span></div>';
  }
  // Parse one entry → { patch, date, line }. Format: patch|date|kind|...parts
  //   V old new pol          stat value change
  //   F label old new pol    ability value change
  //   A name / R name / P old new  ability added / removed / replaced
  function entryParts(e) {
    const p = e.split('|');
    const patch = p[0], date = p[1], kind = p[2];
    let line;
    if (kind === 'A') {
      line = p[3] + ' <span class="chg-tag added">ADDED</span>';
    } else if (kind === 'R') {
      line = p[3] + ' <span class="chg-tag removed">REMOVED</span>';
    } else if (kind === 'P') {
      line = p[3] + ' <span class="chg-cycle">⇄</span> ' + p[4]
           + ' <span class="chg-tag replaced">REPLACED</span>';
    } else if (kind === 'F') {
      line = '<span class="chg-label">' + p[3] + ':</span> ' + p[4] + ' → '
           + p[5] + pctHtml(p[4], p[5], p[6] === 'lo');
    } else if (kind === 'N') {
      // No-percentage value change (computed columns): show old → new only.
      line = p[3] + ' → ' + p[4];
    } else if (kind === 'C') {
      // Computed column: pretty short display (p3→p4) with a % delta derived
      // from the raw values (p5, p6) so scaling never skews it. p7 = polarity.
      line = p[3] + ' → ' + p[4] + pctHtml(p[5], p[6], p[7] === 'lo');
    } else {
      // 'V' stat value (patch|date|V|old|new|pol), or legacy patch|date|old|new
      const isV = kind === 'V';
      const ov = isV ? p[3] : p[2];
      const nv = isV ? p[4] : p[3];
      line = ov + ' → ' + nv + pctHtml(ov, nv, isV && p[5] === 'lo');
    }
    return { patch: patch, date: date, line: line };
  }

  function show(td) {
    const entries = (td.dataset.hist || '').split(';').filter(Boolean);
    const name = td.dataset.name || '';
    if (!entries.length && !name) return;
    const el = ensureTip();
    // Group changes from the same patch under one header.
    const groups = [];
    entries.forEach(e => {
      const ep = entryParts(e);
      const g = groups[groups.length - 1];
      if (g && g.patch === ep.patch) g.lines.push(ep.line);
      else groups.push({ patch: ep.patch, date: ep.date, lines: [ep.line] });
    });
    groups.reverse();  // newest patch on top, oldest at the bottom
    // Ability name as a centered header above the changelog (if any).
    const nameHtml = name ? '<div class="abil-tip-name">' + name + '</div>' : '';
    // Net first→today summary at the very top (gold test: cells flagged data-net).
    const netHtml = (td.dataset.net !== undefined) ? netSummary(entries) : '';
    el.innerHTML = nameHtml + netHtml + groups.map(g =>
      '<div class="stat-chg">' + chgHead(g.patch, g.date)
      + g.lines.map(l => '<div class="stat-chg-line">' + l + '</div>').join('')
      + '</div>'
    ).join('');
    el.classList.add('is-visible');
    const r = td.getBoundingClientRect();
    const tr = el.getBoundingClientRect();
    let left = r.left + r.width / 2 - tr.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
    el.style.left = left + 'px';
    // Vertical placement: prefer above the cell, flip below if it would clip
    // the top. For tall tooltips (taller than the space on either side —
    // e.g. Guardian Greaves' long changelog) clamp into the viewport so the
    // box never runs off-screen; the CSS max-height + overflow lets the
    // overflow scroll. Always keep an 8px margin top and bottom.
    const margin = 8;
    const spaceAbove = r.top - margin;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    let top;
    if (tr.height <= spaceAbove) {
      top = r.top - tr.height - margin;            // fits above
    } else if (tr.height <= spaceBelow) {
      top = r.bottom + margin;                     // fits below
    } else {
      // Doesn't fit either side — pin to whichever side has more room and
      // let it clamp to the viewport edge (CSS caps its height).
      top = spaceAbove >= spaceBelow ? margin : (r.bottom + margin);
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - tr.height - margin));
    if (top < margin) top = margin;                // last-resort clamp
    el.style.top = top + 'px';
  }
  function hide() { if (tip) tip.classList.remove('is-visible'); }

  // Event delegation (not per-cell binding): cells can be removed/re-inserted
  // by the ability-merge logic, so listeners bound at load would be lost on
  // the restored cells. Delegation on the table covers any current cell.
  const SEL = 'td[data-hist], td[data-name], .mr-const[data-hist]';
  // Bind to every table OR standalone history-chip that may carry data-hist:
  // creeps-table (neutral creeps), mr-table (mana items), and the constants
  // chips in the page blurb.
  const targets = [
    ...document.querySelectorAll('.creeps-table, .mr-table'),
    ...document.querySelectorAll('.mr-const[data-hist]'),
  ];
  let curTd = null;
  targets.forEach(tbl => {
    tbl.addEventListener('mouseover', e => {
      // A `?` qhint badge inside a history cell has its own tooltip — let it
      // win and suppress the cell's changelog popup while hovering it.
      if (e.target.closest('.qhint')) { if (curTd) { curTd = null; hide(); } return; }
      const td = e.target.closest(SEL);
      if (td && td !== curTd) { curTd = td; show(td); }
    });
    tbl.addEventListener('mouseout', e => {
      const td = e.target.closest(SEL);
      if (!td) return;
      const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(SEL);
      if (to !== td) { curTd = null; hide(); }
    });
  });
  window.addEventListener('scroll', hide, { passive: true });
})();

// ---- CREEPS / UNIT ABILITIES: size the scroll box to fit the viewport ----
// The table lives in a height-capped .creeps-scroll box (the page is locked so
// only this box scrolls — one scrollbar). CSS sets the box max-height; this only
// measures the category row's rendered height into --cat-row-h, which the
// two-row sticky header offset (col-row top: calc(--cat-row-h - 2px)) needs —
// CSS calc can't read it.
(function() {
  const box = document.querySelector('.creeps-page .creeps-scroll');
  if (!box) return;
  const catRow = box.querySelector('table thead tr.cat-row');
  function size() {
    // CSS handles the box's max-height now: `calc(100vh - var(--site-nav-h)
    // - 12px)` keeps it sized to fit the viewport regardless of scroll
    // position, in concert with `position: sticky; top: var(--site-nav-h)`
    // on the box itself. JS only updates --cat-row-h (which CSS calc can't
    // measure — it depends on the rendered text height of the category row).
    //
    // Two-row sticky header (Neutral Creeps): pin the column row exactly
    // under the category row. Use the fractional rect height (rounded) for an
    // accurate offset; the col-row CSS also pulls up 1px to mask any seam.
    // Unit Abilities has no .cat-row → 0 so its single header row pins flush.
    // Math.floor (not round): pairs with the col-row's -2px pull-up so the
    // col-row always starts at least 2px BEFORE the cat-row's true bottom,
    // guaranteeing the two sticky rows overlap regardless of fractional
    // heights — kills the scroll-time gap where body cells showed through.
    document.documentElement.style.setProperty(
      '--cat-row-h',
      (catRow ? Math.floor(catRow.getBoundingClientRect().height) : 0) + 'px');
  }
  size();
  window.addEventListener('resize', size, { passive: true });
  // Recompute after images (the helmet logo grows the nav) finish loading —
  // an early measurement underestimates the nav height and lets the box run
  // past the viewport, which makes the page scroll and the toolbar drift.
  window.addEventListener('load', size);
  const logo = document.querySelector('.nav-brand-logo');
  if (logo && !logo.complete) logo.addEventListener('load', size);
})();

// ---- CREEPS TABLE: pin identity columns on horizontal scroll ----
(function() {
  const table = document.querySelector('.creeps-table');
  if (!table) return;
  const firstRow = table.querySelector('tbody tr');
  if (!firstRow) return;

  // Pin sticky-column widths to their FULL-roster initial measurement so the
  // attack-type filter (display:none on hidden rows) can't reshape the lvl /
  // icon / name columns when the visible roster changes. With table-layout:
  // auto, min-width alone only sets a floor — the browser can still GROW
  // pinned columns when other (non-sticky) columns shrink and the table's
  // `min-width:100%` forces it back to container width. Pin min + max + width
  // on the col-row sticky <th>s, AND pin icon col individually via every
  // body row's .creep-icon-cell (the Юнит th's colspan=2 only pins the
  // icon+name SUM, not their internal ratio). Run once on init, before any
  // filter has a chance to fire.
  (function pinStickyCols() {
    if (table.classList.contains('heroes-dyn-table')) return;
    const tds = [...firstRow.children];
    if (tds.length < 3) return;
    const wLvl  = Math.ceil(tds[0].getBoundingClientRect().width);
    const wIcon = Math.ceil(tds[1].getBoundingClientRect().width);
    const wName = Math.ceil(tds[2].getBoundingClientRect().width);
    const pin = (el, w) => {
      el.style.minWidth = w + 'px';
      el.style.maxWidth = w + 'px';
      el.style.width    = w + 'px';
    };
    const headStickies = table.querySelectorAll('thead tr.col-row th.sticky-col');
    // Two head shapes share this IIFE:
    //   • Neutral Stats (.creeps-table.mode-standard): 2 sticky <th>s — lvl
    //     and "Юнит" (colspan=2 over icon+name). Second th gets wIcon+wName.
    //   • Unit Abilities (.unit-abilities-table): 3 sticky <th>s — lvl, unit,
    //     ability, all individual. Each th gets its own body-cell width.
    // Differentiator = sticky-th count, not table class — keeps the code
    // ready for any future creeps-table variant.
    if (headStickies.length === 2) {
      pin(headStickies[0], wLvl);
      pin(headStickies[1], wIcon + wName);   // colspan'd Юнит
    } else if (headStickies.length >= 3) {
      pin(headStickies[0], wLvl);
      pin(headStickies[1], wIcon);
      pin(headStickies[2], wName);
    }
    // Pin icon AND name cols individually on every body row. The Юнит th's
    // colspan=2 only pins the icon+name SUM — max-width on a colspan'd cell
    // doesn't enforce per-column limits in auto layout, so the name col can
    // still grow/shrink with its widest visible content (Forest Troll
    // Berserker disappearing on melee filter was the trigger). Pinning both
    // body cols freezes the internal split. Covers both tables — the
    // selectors match Neutral Stats (.col-name) and UA (.ua-ability) cells.
    table.querySelectorAll('tbody tr > td.creep-icon-cell.sticky-col')
      .forEach(td => pin(td, wIcon));
    table.querySelectorAll('tbody tr > td.col-name.sticky-col, tbody tr > td.ua-ability.sticky-col')
      .forEach(td => pin(td, wName));
  })();

  // Body identity cells are the first three: lvl(0), icon(1), name(2).
  // The header has only two cells over them: lvl th(0) + Юнит th(1,
  // colspan=2). Compute cumulative left offsets from the body widths and
  // apply them to both the body sticky cells and the header sticky cells.
  function applyLeftOffsets() {
    // Use the first VISIBLE row — once attack-type filter is applied, the
    // cached firstRow may be display:none, making its getBoundingClientRect
    // collapse to zero and breaking sticky lefts.
    const measureRow = [...table.querySelectorAll('tbody tr')]
      .find(tr => tr.offsetParent !== null) || firstRow;
    const tds = [...measureRow.children];
    if (tds.length < 3) return;
    const wLvl  = tds[0].getBoundingClientRect().width;
    const wIcon = tds[1].getBoundingClientRect().width;
    const lefts = [0, wLvl, wLvl + wIcon];           // lvl, icon, name

    // Body rows. Most rows have all 3 sticky identity cells (lvl, icon, name).
    // On the Unit Abilities page, a multi-ability unit rowspans its lvl+icon
    // cells, so continuation rows carry ONLY the ability sticky cell — which
    // belongs at the 3rd offset. Assign by how many sticky cells the row has.
    table.querySelectorAll('tbody tr').forEach(tr => {
      const sc = [...tr.children].filter(c => c.classList.contains('sticky-col'));
      // Creeps: 3 sticky cells (lvl, icon, name). Unit Abilities: 2 (lvl, unit).
      // UA continuation rows (rowspanned lvl+unit) have 0 → nothing to pin.
      sc.forEach((cell, i) => { cell.style.left = lefts[i] + 'px'; });
    });
    // Header sticky cells. heroes_dyn has ONE frozen column (hero) but TWO
    // header rows over it (super-category + version), so BOTH header sticky
    // cells pin at left:0 — not the creeps lvl(0)+unit(wLvl) two-column layout.
    const headStickies = table.querySelectorAll('thead th.sticky-col');
    if (table.classList.contains('heroes-dyn-table')) {
      headStickies.forEach(th => { th.style.left = '0px'; });
    } else {
      if (headStickies[0]) headStickies[0].style.left = '0px';
      if (headStickies[1]) headStickies[1].style.left = wLvl + 'px';
    }
  }

  applyLeftOffsets();
  window.addEventListener('resize', applyLeftOffsets, { passive: true });

  // Click a cell to mark its row (single-select, no animation). Clicking
  // another row moves the mark; clicking the marked row again clears it.
  // Matches the simpler highlight behaviour used by the Mana Items table —
  // multi-select + fade-flash earlier here was hard to read once a few
  // rows were marked.
  const tbody = table.querySelector('tbody');
  if (tbody) {
    tbody.addEventListener('click', e => {
      if (e.target.closest('a, img')) return;
      const tr = e.target.closest('tr');
      if (!tr) return;
      const was = tr.classList.contains('row-marked');
      tbody.querySelectorAll('tr.row-marked').forEach(r =>
        r.classList.remove('row-marked', 'row-flash'));
      if (!was) tr.classList.add('row-marked');
    });
  }

  // Overlay frame around the pinned identity block, shown while scrolled.
  // It lives in .creeps-page (non-scrolling), so its border + shadow keep
  // repainting during scroll — unlike box-shadow on the sticky cells,
  // which Chrome drops mid-scroll.
  const scroller = table.closest('.creeps-scroll');
  const page = table.closest('.creeps-page');
  const frame = page && page.querySelector('.sticky-frame');       // vertical

  function positionFrames() {
    if (!scroller || !page) return;
    const firstTds = [...firstRow.children];
    if (firstTds.length < 3) return;
    const pageR  = page.getBoundingClientRect();
    const scrR   = scroller.getBoundingClientRect();
    const tableR = table.getBoundingClientRect();
    // Right edge of the frozen identity block = right edge of the LAST sticky
    // column in the row. Creeps/UA pin 2-3 columns; the heroes_dyn matrix pins
    // just one (the hero name) — measuring the last sticky cell keeps the
    // divider correct for any number of frozen columns (hardcoding firstTds[2]
    // put the divider 2 columns too far right on the single-column matrix).
    const stickyCells = firstRow.querySelectorAll('.sticky-col');
    const lastSticky = table.classList.contains('heroes-dyn-table')
      ? (table.querySelector('thead th.hd-hero.sticky-col')
          || table.querySelector('thead th.hd-hero')
          || stickyCells[stickyCells.length - 1]
          || firstTds[2])
      : (stickyCells[stickyCells.length - 1] || firstTds[2]);
    const nameR  = lastSticky.getBoundingClientRect();  // right edge of pinned block
    // Anchor the divider's top to the VISIBLE (pinned) header bottom. The
    // <thead> element itself is position:static — only its <th> cells are
    // position:sticky — so once the box scrolls down, the thead's own rect
    // scrolls up (its bottom goes negative) while the column headers stay
    // pinned at the box top. Measuring table.tHead therefore made the divider's
    // top climb ABOVE the visible header (the bright line poked past the
    // category header on vertical+horizontal scroll). Anchor instead to a
    // PINNED header cell (the col-row's sticky-col <th>): its bottom tracks the
    // real visible header bottom both at rest (natural position below the blurb)
    // and once pinned under the nav.
    const headCell = table.querySelector('thead tr.col-row th.sticky-col')
      || table.querySelector('thead tr.col-row th')
      || table.tHead;
    const headBottom = headCell
      ? headCell.getBoundingClientRect().bottom
      : scrR.top;
    // Vertical divider: at the right edge of the frozen lvl/unit columns,
    // starting BELOW the sticky column header and spanning the rest of height.
    if (frame) {
      const bottom = Math.min(scrR.bottom, tableR.bottom);
      frame.style.left   = (nameR.right - pageR.left) + 'px';
      frame.style.top    = (headBottom - pageR.top) + 'px';
      frame.style.height = Math.max(0, bottom - headBottom) + 'px';
      frame.style.width  = '0px';
    }
  }

  if (scroller) {
    const syncFrameVisibility = () => {
      const hasOverflowX = scroller.scrollWidth - scroller.clientWidth > 1;
      const sx = hasOverflowX && scroller.scrollLeft > 0;
      scroller.classList.toggle('scrolled', sx);
      if (frame) frame.classList.toggle('visible', sx);
    };
    // The frozen-pane divider's geometry depends on layout, not on the scroll
    // position inside the box: sticky columns and sticky headers keep the same
    // screen-space edges while the tbody scrolls underneath. Re-reading layout
    // on every scroll frame was wasted work on the widest tables.
    let ticking = false;
    const positionFramesRaf = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        try {
          positionFrames();
          syncFrameVisibility();
        } finally { ticking = false; }
      });
    };
    // The page body is locked — vertical + horizontal scrolling both happen
    // INSIDE .creeps-scroll, not on the window. The sticky header pins to the
    // box top while the tbody scrolls under it, and the table's bounding rect
    // (used to clamp the divider's bottom) moves as the content scrolls — so the
    // divider's top/height must be RE-COMPUTED on every box-scroll frame, not
    // just its visibility. raf-throttled, so it's cheap even on the wide matrix.
    scroller.addEventListener('scroll', positionFramesRaf, { passive: true });
    window.addEventListener('resize', positionFramesRaf, { passive: true });
    // Layout-changing toggles (hide-old / filters) broadcast this so the divider
    // re-anchors to the new column widths + table height.
    window.addEventListener('mr:filter-changed', positionFramesRaf);

    // Super-category header colspans must equal the number of CURRENTLY
    // visible leaf columns in each category — otherwise the static (Expanded)
    // colspans misalign with the collapsed columns in Standard view.
    function recomputeCatColspans() {
      document.querySelectorAll('.cat-head[data-cat]').forEach(head => {
        let span = 0;
        document.querySelectorAll('.col-row th[data-cat="' + head.dataset.cat + '"]')
          .forEach(th => { if (th.offsetParent !== null) span += th.colSpan || 1; });
        head.colSpan = span || 1;
      });
    }

    // View toggle (Standard / Expanded) via the calendar-style select.
    const viewSel = document.getElementById('view-mode');
    if (viewSel) {
      const applyView = () => {
        const expanded = viewSel.value === 'expanded';
        table.classList.toggle('mode-standard', !expanded);
        table.classList.toggle('mode-expanded', expanded);
        recomputeCatColspans();
        applyLeftOffsets();   // column widths changed → recompute pinned offsets
        positionFramesRaf();
      };
      viewSel.addEventListener('change', applyView);
      applyView();            // initial pass (Standard)
    } else {
      recomputeCatColspans();
    }

    // Attack-type filters on Neutral Stats. Uses the same toolbar button
    // markup/style as Hero Stats, but operates on the creeps-table rows.
    const attackBtns = [...document.querySelectorAll('.hs-attack-filter')];
    if (attackBtns.length && table.querySelector('tbody tr[data-attack-type]')) {
      let attackFilter = '';
      const applyAttackFilter = () => {
        table.querySelectorAll('tbody tr[data-attack-type]').forEach(tr => {
          tr.classList.toggle(
            'mr-attack-out',
            !!attackFilter && tr.dataset.attackType !== attackFilter
          );
        });
        attackBtns.forEach(btn => {
          const active = btn.dataset.attackFilter === attackFilter;
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        // Re-collapse level labels over the now-visible row subset (else
        // hidden "first of group" rows blank the next visible row's lvl).
        if (table._groupRows) {
          table._groupRows([...table.querySelectorAll('tbody tr')]);
        }
        applyLeftOffsets();
      };
      attackBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const next = btn.dataset.attackFilter || '';
          attackFilter = attackFilter === next ? '' : next;
          applyAttackFilter();
        });
      });
      applyAttackFilter();
    }
    positionFramesRaf();
  }
})();


// ---- Body-level tooltip for `.qhint` badges ----
// CSS `::after` tooltips are clipped by .creeps-scroll's overflow:auto and by
// the sticky header. Render a single shared <div> at <body> level, positioned
// via fixed coordinates relative to the hovered badge.
(function() {
  const tip = document.createElement('div');
  tip.className = 'qhint-tip';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);

  function show(target) {
    const text = target.getAttribute('data-tooltip') || '';
    if (!text) return;
    // Tooltip content is author-written (UA_HEAD_HINTS / ABIL_MANUAL) — using
    // innerHTML lets header tooltips include coloured legend spans.
    // Wrap %placeholder% variables (Valve description macros — values aren't
    // resolved here) in a styled span so they read as "this is a variable
    // name" rather than mystery raw text.
    tip.innerHTML = text.replace(
      /%([A-Za-z0-9_]+)%/g,
      '<span class="abil-var">$1</span>');
    tip.classList.add('is-visible');
    // Position above the badge; flip below if it would overflow the viewport top.
    const r = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = r.left + r.width / 2 - tipRect.width / 2;
    left = Math.max(6, Math.min(left, window.innerWidth - tipRect.width - 6));
    let top = r.top - tipRect.height - 8;
    if (top < 6) top = r.bottom + 8;            // not enough room above → drop below
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function hide() { tip.classList.remove('is-visible'); }

  // Selector matches the original `?` badge plus any element that just opts
  // into the body-level tooltip via `.abil-ico-hint` (currently used on
  // ability icons in the Unit Abilities table).
  const TIP_SEL = '.qhint, .abil-ico-hint, .hd-patch[data-tooltip]';
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest(TIP_SEL);
    if (t) show(t);
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest(TIP_SEL)) hide();
  });
  document.addEventListener('focusin', (e) => {
    const t = e.target.closest(TIP_SEL);
    if (t) show(t);
  });
  document.addEventListener('focusout', (e) => {
    if (e.target.closest(TIP_SEL)) hide();
  });
  // Hide on any scroll (the badge's absolute coords change).
  window.addEventListener('scroll', hide, true);
})();

// ---- Body-level tooltip for `.info-tip` "?" badges (patch pages) ----
// CSS-driven `.info-pop` (position:absolute) overflows the viewport when the
// badge is near a screen edge. A single body-level div is positioned via JS
// so it stays clamped inside the viewport on both axes.
(function() {
  const tip = document.createElement('div');
  tip.className = 'info-pop-body';
  document.body.appendChild(tip);

  function show(target) {
    const pop = target.querySelector('.info-pop');
    if (!pop) return;
    tip.innerHTML = pop.innerHTML;
    tip.classList.add('is-visible');
    const r = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = r.left + r.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    let top = r.top - tipRect.height - 8;
    if (top < 8) top = r.bottom + 8;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function hide() { tip.classList.remove('is-visible'); }

  document.addEventListener('mouseover', e => {
    const t = e.target.closest('.info-tip');
    if (t) show(t);
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest('.info-tip')) hide();
  });
  document.addEventListener('focusin', e => {
    const t = e.target.closest('.info-tip');
    if (t) show(t);
  });
  document.addEventListener('focusout', e => {
    if (e.target.closest('.info-tip')) hide();
  });
  window.addEventListener('scroll', hide, true);
})();

// ---- Centre the row jumped to via #anchor (cross-page or same-page) ----
// The Tables pages have an inner `.creeps-scroll` overflow box AND the page
// itself scrolls — `el.scrollIntoView({block:'center'})` only centres within
// the immediate scroll parent (usually the inner box), leaving the row near
// the top of the viewport. Manually centre on BOTH axes: scroll the inner
// container so the row is mid-box, then scroll the window so the box's
// mid-point aligns with the viewport centre.
(function() {
  function centerHash() {
    const h = location.hash.slice(1);
    if (!h) return;
    const el = document.getElementById(decodeURIComponent(h));
    if (!el) return;
    // Give the jumped-to row the SAME selected style as a manual row click
    // (gold frame), replacing the old yellow :target flash. Single-select:
    // clear any previously marked row in the same table first.
    if (el.tagName === 'TR') {
      const tb = el.closest('tbody');
      if (tb) tb.querySelectorAll('tr.row-marked').forEach(r =>
        r.classList.remove('row-marked', 'row-flash'));
      el.classList.add('row-marked');
    }
    // Double rAF: lets table layout, sticky header, and any view-toggle
    // reorderings settle before measuring rects.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const inner = el.closest('.creeps-scroll');
      if (inner) {
        const ir = inner.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        // Account for the sticky <thead> overlapping the inner box's top —
        // subtract its height so the row centres in the VISIBLE area below
        // the frozen header, not in the raw box.
        const thead = inner.querySelector('thead');
        const headH = thead ? thead.getBoundingClientRect().height : 0;
        const visibleTop = ir.top + headH;
        const visibleCenter = visibleTop + (ir.bottom - visibleTop) / 2;
        const elCenter = er.top + er.height / 2;
        inner.scrollTop += (elCenter - visibleCenter);
      }
      // Now align the row with the window viewport centre (page-level scroll).
      const er2 = el.getBoundingClientRect();
      const targetY = er2.top + er2.height / 2;
      window.scrollBy({
        top: targetY - window.innerHeight / 2,
        behavior: 'smooth',
      });
    }));
  }
  window.addEventListener('hashchange', centerHash);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', centerHash);
  } else {
    centerHash();
  }

  // ---- CROSS-HIGHLIGHT FOR ALL <table> ELEMENTS ----
  // On hover of any <td>, light up the entire row + the entire column the
  // cell sits in (visual "+" through the table, like Liquipedia crosstable).
  // Attaches to every <table> on the page after DOM ready.
  function wireCrossHover(table) {
    if (table.dataset.crossWired === '1') return;
    // Dynamics matrices can be 350 rows x 116 patch columns. Column cross-hover
    // mutates one cell per row on every mouse move, which is cheap for normal
    // tables but makes items_dyn heavy when "Hide old" is off. Row click,
    // dyn-cell hover tooltips, sorting and filters stay intact without it.
    if (table.classList.contains('heroes-dyn-table')) return;
    table.dataset.crossWired = '1';
    let activeRow = null;
    const colCells = [];
    const clear = () => {
      if (activeRow) {
        activeRow.classList.remove('cross-row');
        activeRow = null;
      }
      colCells.forEach(c => c.classList.remove('cross-col'));
      colCells.length = 0;
    };
    table.addEventListener('mouseover', e => {
      // Only TD cells trigger / receive the cross-highlight. Hovering a TH
      // (header) shouldn't sweep the row beneath it and shouldn't paint
      // the column band — the heatmap on data cells is the only visual
      // intent there.
      const cell = e.target.closest('td');
      if (!cell || !table.contains(cell)) return;
      const row = cell.parentElement;
      if (row.tagName !== 'TR') return;
      const idx = cell.cellIndex;
      if (row === activeRow &&
          colCells.length && colCells[0].cellIndex === idx) return;
      clear();
      activeRow = row;
      row.classList.add('cross-row');
      // Walk only TBODY rows — TH cells in thead never get cross-col.
      table.querySelectorAll('tbody tr').forEach(tr => {
        const c = tr.cells && tr.cells[idx];
        if (c) {
          c.classList.add('cross-col');
          colCells.push(c);
        }
      });
    });
    table.addEventListener('mouseleave', clear);
  }
  function wireAllTables() {
    document.querySelectorAll('table').forEach(wireCrossHover);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireAllTables);
  } else {
    wireAllTables();
  }
})();

// ---- SITE NAV HEIGHT → CSS variable (used by every sticky layer below) ----
// The toolbar / view / blurb on table pages all scroll away with the page;
// only the site nav + table category headers stay pinned. The thead pins
// directly under the nav, so all we need to publish is its live height.
(function() {
  const nav = document.querySelector('nav.top-nav');
  if (!nav) return;
  function recalc() {
    const navH = nav.getBoundingClientRect().height;
    const root = document.documentElement.style;
    root.setProperty('--site-nav-h', navH + 'px');
    root.setProperty('--mr-thead-top', navH + 'px');
  }
  recalc();
  window.addEventListener('resize', recalc, { passive: true });
  window.addEventListener('load', recalc);
})();

// ---- MANA REGEN TABLE: simple sortable ----
// Plain sort by data-sort attribute on each <td>. No row grouping / level
// collapse / ability merging — the table is flat, so the existing creeps
// sort would over-engineer it.
(function() {
  const tables = document.querySelectorAll('.mr-table');
  tables.forEach(table => {
    const tbody = table.querySelector('tbody');
    const headers = [...table.querySelectorAll('thead th.sortable')];
    if (!tbody || !headers.length) return;

    function cellVal(tr, colIdx) {
      const td = tr.children[colIdx];
      if (!td) return null;
      if (td.dataset.sort !== undefined && td.dataset.sort !== '') {
        const n = parseFloat(td.dataset.sort);
        return isNaN(n) ? td.dataset.sort.toLowerCase() : n;
      }
      const t = td.textContent.trim();
      if (!t) return null;
      const m = t.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
      return m ? parseFloat(m[0]) : t.toLowerCase();
    }

    // Snapshot the server-rendered order so the neutral state can restore it.
    const originalOrder = [...tbody.querySelectorAll('tr')];
    // The default-sorted column is marked .sort-desc in the markup, so the
    // 3-state cycle starts already on that column at "descending".
    let sortCol = headers.findIndex(th =>
      th.classList.contains('sort-asc') || th.classList.contains('sort-desc'));
    if (sortCol === -1) sortCol = null;
    // sortState: 0 = neutral, 1 = descending, 2 = ascending.
    let sortState = sortCol !== null
      ? (headers[sortCol].classList.contains('sort-asc') ? 2 : 1)
      : 0;

    function sortBy(colIdx, dir) {
      const rows = [...tbody.querySelectorAll('tr')];
      rows.sort((a, b) => {
        const va = cellVal(a, colIdx);
        const vb = cellVal(b, colIdx);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;          // empties sink
        if (vb == null) return -1;
        if (typeof va === 'number' && typeof vb === 'number') {
          return dir === 'asc' ? va - vb : vb - va;
        }
        const sa = String(va), sb = String(vb);
        return dir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
      });
      rows.forEach(r => tbody.appendChild(r));
    }

    headers.forEach((th, i) => {
      th.addEventListener('click', () => {
        // 3-state cycle per header: neutral → descending → ascending → neutral.
        if (sortCol === i) sortState = (sortState + 1) % 3;
        else { sortCol = i; sortState = 1; }   // first click = descending
        headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
        if (sortState === 0) {
          // Neutral — restore the original server-rendered order.
          sortCol = null;
          originalOrder.forEach(r => tbody.appendChild(r));
        } else {
          const dir = sortState === 1 ? 'desc' : 'asc';
          th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');
          sortBy(i, dir);
        }
        // Heatmap follows the new row order / visible set.
        window.dispatchEvent(new CustomEvent('mr:filter-changed'));
      });
    });
  });
})();

// ---- MANA ITEMS: "Hide active" toggle ----
// Hides every <tr.mr-active-row> when checked. Heatmap recomputes via the
// shared `mr:filter-changed` channel so column gradients reflect the
// currently-visible row set.
(function() {
  const toggle = document.getElementById('mr-hide-active');
  if (!toggle) return;
  const apply = () => {
    document.querySelectorAll('.mr-active-row').forEach(tr => {
      tr.classList.toggle('mr-hide-active', toggle.checked);
    });
    window.dispatchEvent(new CustomEvent('mr:filter-changed'));
  };
  toggle.addEventListener('change', apply);
})();

// ---- MANA ITEMS: per-column conditional formatting ----
// For every column whose <th data-direction> is set, scan all visible cells
// and paint a faint pastel gradient — green at the "good" end, red at the
// "bad" end. Pure visual aid; doesn't alter values or sort order.
(function() {
  const table = document.querySelector('.mr-table');
  if (!table) return;
  const headRow = table.querySelector('thead tr.col-row') || table.querySelector('thead tr');
  const headers = headRow ? [...headRow.querySelectorAll('th')] : [];

  function applyHeatmap() {
    // Respect the on-page Heatmap switch — when off, all cells stay flat.
    // (The toggle IIFE separately strips any inline backgrounds we set.)
    const toggle = document.getElementById('mr-heatmap-toggle');
    if (toggle && !toggle.checked) return;
    const rows = [...table.querySelectorAll('tbody tr')];
    headers.forEach((th, colIdx) => {
      const direction = th.dataset.direction;
      if (!direction) return;
      // Gather numeric data-sort values for visible non-dash cells. Rows
      // hidden by the price filter (.mr-filtered-out) are also excluded so
      // colours always reflect the current visible set.
      const cells = [];
      rows.forEach(tr => {
        if (tr.hasAttribute('hidden')) return;
        if (tr.classList.contains('mr-filtered-out')) return;
        if (tr.classList.contains('mr-search-out')) return;
        if (tr.classList.contains('mr-attack-out')) return;
        if (tr.classList.contains('mr-hide-active')) return;
        const td = tr.children[colIdx];
        if (!td) return;
        td.style.backgroundColor = '';        // reset previous paint
        if (td.querySelector('.ua-dash')) return;
        const v = parseFloat(td.dataset.sort);
        if (isNaN(v) || v === 0) return;
        cells.push({ td, v });
      });
      if (cells.length < 2) return;
      // Rank-percentile mapping: each cell's colour is decided by its rank
      // within the column, not its raw value. Eliminates the previous problem
      // where a single outlier (Dagon 5's 25.5k cost-per-regen) compressed
      // every other value into the same green band — now mid-tier rows get
      // mid-tier colours regardless of how far the worst outlier sits.
      // Rank over UNIQUE values so ties share one colour — otherwise a
      // column of identical numbers (hero Vision: 1800 everywhere) painted
      // a meaningless green→red gradient purely by row order.
      const uniq = [...new Set(cells.map(c => c.v))].sort((a, b) => a - b);
      if (uniq.length < 2) {
        cells.forEach(c => { c.td.style.backgroundColor = ''; });
        return;
      }
      const rankMap = new Map(uniq.map((v, i) => [v, i]));
      const last = uniq.length - 1;
      cells.forEach(c => {
        let t = rankMap.get(c.v) / last;   // [0, 1] by unique-value rank
        if (direction === 'lower') t = 1 - t;
        // 0 → red, 60 → amber, 120 → green. Keep saturation + alpha
        // moderate so cross-hover darkening still reads on top.
        const hue = Math.round(t * 120);
        c.td.style.backgroundColor =
          `hsla(${hue}, 60%, 50%, 0.22)`;
      });
    });
  }
  applyHeatmap();
  // Filter / sort events from sibling IIFEs trigger a recompute.
  window.addEventListener('mr:filter-changed', applyHeatmap);
})();

// ---- MANA ITEMS: click row to highlight (yellow). Click again to deselect. ----
(function() {
  const table = document.querySelector('.mr-table');
  if (!table) return;
  table.addEventListener('click', e => {
    const tr = e.target.closest('tbody tr');
    if (!tr || !table.contains(tr)) return;
    const was = tr.classList.contains('mr-row-selected');
    table.querySelectorAll('tr.mr-row-selected').forEach(r =>
      r.classList.remove('mr-row-selected'));
    if (!was) tr.classList.add('mr-row-selected');
  });
})();

// ---- MANA ITEMS: Price min/max filter ----
(function() {
  const table = document.querySelector('.mr-table');
  if (!table) return;
  const minIn = document.getElementById('mr-price-min');
  const maxIn = document.getElementById('mr-price-max');
  const clear = document.getElementById('mr-price-clear');
  if (!minIn || !maxIn) return;
  // Find the Price column index from the header (data-col="cost").
  const headers = [...table.querySelectorAll('thead th')];
  const priceIdx = headers.findIndex(th => th.dataset.col === 'cost');
  if (priceIdx < 0) return;

  function applyFilter() {
    const lo = parseFloat(minIn.value);
    const hi = parseFloat(maxIn.value);
    const hasLo = !isNaN(lo);
    const hasHi = !isNaN(hi);
    // Show the X only when at least one bound is set — otherwise the
    // combo widget reads as a simple "Price from–to" placeholder pair.
    clear.hidden = !(hasLo || hasHi);
    table.querySelectorAll('tbody tr').forEach(tr => {
      const td = tr.children[priceIdx];
      const v = td ? parseFloat(td.dataset.sort) : NaN;
      let keep = true;
      if (!isNaN(v)) {
        if (hasLo && v < lo) keep = false;
        if (hasHi && v > hi) keep = false;
      }
      tr.classList.toggle('mr-filtered-out', !keep);
    });
    // Heatmap re-applies over the new visible set.
    window.dispatchEvent(new CustomEvent('mr:filter-changed'));
  }
  minIn.addEventListener('input', applyFilter);
  maxIn.addEventListener('input', applyFilter);
  clear.addEventListener('click', () => {
    minIn.value = '';
    maxIn.value = '';
    applyFilter();
  });
})();

// ---- MANA ITEMS: name search ----
// Independent of the price/hide-active filters (each uses its own display:none
// class, so any one hiding a row wins). Comma-separated, partial, like the
// dynamics search. Re-fires mr:filter-changed so the heatmap recomputes.
(function() {
  const table = document.querySelector('.mr-table');
  const search = document.getElementById('mr-search');
  if (!table || !search) return;
  const rows = [...table.querySelectorAll('tbody tr')];
  const apply = () => {
    const terms = search.value.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    rows.forEach(tr => {
      const name = (tr.querySelector('.mr-name-text')?.textContent || '').toLowerCase();
      const slug = (tr.dataset.slug || '').toLowerCase();
      const hit = !terms.length || terms.some(t => name.includes(t) || slug.includes(t));
      tr.classList.toggle('mr-search-out', !hit);
    });
    window.dispatchEvent(new CustomEvent('mr:filter-changed'));
  };
  search.addEventListener('input', apply);
})();

// ---- HERO STATS (heroes_stats.html): Base / Starting / Expanded view ----
// Reuses the mr-table front-end (sort / heatmap / search / stat-hist tooltips).
// Three modes via the View dropdown (mirrors Neutral Creeps):
//   base     — bare values from the game files
//   starting — DEFAULT, level-1 values with attribute bonuses
//   expanded — Starting + extra columns (.hs-extra)
// Some columns (HP, MP, regens, armor, magic resist, damage, attack speed)
// have DIFFERENT values per mode. The build emits the Starting value as the
// default cell content; cells that differ from Base carry data-base-sort /
// data-base-html / data-base-hist. We stash the Starting values on first
// load, then swap on every mode change. data-hist drives the hover tooltip
// (existing stat-hist code reads it live), data-sort drives sorting.
(function() {
  const viewSel = document.getElementById('hs-view-mode');
  if (!viewSel) return;
  const table = document.querySelector('.mr-table');
  if (!table) return;
  const levelInput = document.getElementById('hs-level-input');
  const plus2Toggle = document.getElementById('hs-plus2-toggle');
  const innatesToggle = document.getElementById('hs-innates-toggle');
  const _innateRulesEl = document.getElementById('hs-innate-rules');
  const _innateRules = _innateRulesEl ? JSON.parse(_innateRulesEl.textContent) : {};
  const attackBtns = [...document.querySelectorAll('.hs-attack-filter')];
  const attrBtns = [...document.querySelectorAll('.hs-attr-filter')];
  const cells = [...table.querySelectorAll('tbody td[data-col]')];
  let attackFilter = '';
  let attrFilter = '';
  const PLUS2_LEVELS = [15, 16, 17, 19, 20, 21, 22];

  const clampLevel = () => {
    if (!levelInput) return 1;
    const raw = parseInt(levelInput.value, 10);
    const next = Math.max(1, Math.min(30, Number.isFinite(raw) ? raw : 1));
    if (String(next) !== levelInput.value) levelInput.value = String(next);
    return next;
  };

  const num = v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const g = v => {
    const s = Number(v).toFixed(2).replace(/\.?0+$/, '');
    return s || '0';
  };
  const g1 = v => {
    const s = Number(v).toFixed(1).replace(/\.?0+$/, '');
    return s || '0';
  };
  const g0 = v => String(Math.round(Number(v) || 0));
  const pct = v => g(v) + '%';
  const pct1 = v => g1(v) + '%';
  const regen = v => Math.abs(Number(v) || 0) < 1e-9 ? '0' : Number(v).toFixed(2);
  const armorFactor = a => (0.06 * a) / (1 + 0.06 * Math.abs(a));
  const armorPct = a => Math.round(armorFactor(a) * 100);
  const ehpPhys = (hp, armor) => Math.round(hp / Math.max(0.01, 1 - armorFactor(armor)));
  const ehpMag = (hp, mr) => Math.round(hp / Math.max(0.01, 1 - mr / 100));
  const plus2CountAt = level => PLUS2_LEVELS.filter(l => l <= level).length;
  const techiesPoolPctAt = level => {
    const lvl = Math.max(1, Number(level) || 1);
    return 0.001 + lvl * 0.0001;
  };
  const attrsAt = (s, level, includePlus2) => {
    const bonus = includePlus2 ? plus2CountAt(level) * 2 : 0;
    // Ogre Magi has 0 base Intelligence and cannot gain Int from levels OR from
    // the +2-all-stats level-ups (his innate replaces Int scaling with Strength-
    // based mana) — so the +2 bonus only feeds his Str and Agi, never Int.
    const intBonus = s.slug === 'ogre_magi' ? 0 : bonus;
    return {
      str: num(s.str) + (level - 1) * num(s.strGain) + bonus,
      agi: num(s.agi) + (level - 1) * num(s.agiGain) + bonus,
      int: num(s.int) + (level - 1) * num(s.intGain) + intBonus,
    };
  };
  const wholeAttrs = a => ({
    str: Math.floor(a.str),
    agi: Math.floor(a.agi),
    int: Math.floor(a.int),
  });
  const rowStats = tr => {
    if (!tr._hsStats) {
      try { tr._hsStats = JSON.parse(tr.dataset.hsStats || '{}'); }
      catch { tr._hsStats = {}; }
    }
    return tr._hsStats;
  };
  // Returns the active history entry for an effect at the given patch string.
  // Mirrors Python _active_entry() in builders/heroes_stats.py.
  const _activeEntry = (eff, patch) => {
    if (!eff.history) {
      const s = eff.since, u = eff.until;
      if (s && !patchGe(patch, s)) return null;
      if (u && !patchGe(u, patch)) return null;
      return eff;
    }
    for (let i = eff.history.length - 1; i >= 0; i--) {
      const e = eff.history[i];
      if (patchGe(patch, e.since || '7.00')) {
        if (e.until == null || patchGe(e.until, patch)) return e;
      }
    }
    return null;
  };
  // secondary_attr_factor constants: derived-stat-per-attr unit rates.
  const _SEC = {
    'hpr:str': 0.1, 'mpr:int': 0.05, 'aspd:agi': 1.0, 'armor:agi': 0.16667, 'mr:int': 0.1,
  };
  // Generic innate stat bonus dispatcher. Reads from embedded hero_stat_innates.json.
  // startHp is only needed for hp_pct formula (Ursa dmg).
  const innate = (key, s, a, level, startHp) => {
    if (!innatesToggle?.checked) return 0;
    const rules = _innateRules[s.slug];
    if (!rules) return 0;
    let total = 0;
    for (const eff of (rules.effects || [])) {
      if (eff.target !== key) continue;
      const entry = _activeEntry(eff, hsTablePatch);
      if (!entry) continue;
      const f = eff.formula;
      if (f === 'attr_factor') {
        total += a[eff.source] * entry.factor;
      } else if (f === 'base_plus_level') {
        total += entry.base + entry.per_level * (level || 1);
      } else if (f === 'flat_per_level') {
        total += entry.per_level * (level || 1);
      } else if (f === 'attr_pct_per_level') {
        total += a[eff.source] * (entry.base_pct + entry.per_level_pct * (level || 1));
      } else if (f === 'hp_pct') {
        total += (startHp || 0) * entry.factor / 100;
      } else if (f === 'secondary_attr_factor') {
        total += a[eff.source] * (_SEC[`${key}:${eff.source}`] || 0) * entry.factor;
      }
      // ms_multiplier → dpWitchcraftMsMult; dmg_universal_bonus_pct/attr_substitution → dedicated callers
    }
    return total;
  };
  // Death Prophet — Witchcraft: multiplicative MS bonus. Returns multiplier (1 + pct/100).
  const dpWitchcraftMsMult = (s, level) => {
    if (!innatesToggle?.checked || s.slug !== 'death_prophet') return 1;
    const rules = _innateRules['death_prophet'];
    const eff = rules?.effects?.find(e => e.target === 'ms' && e.formula === 'ms_multiplier');
    if (!eff) return 1;
    const entry = _activeEntry(eff, hsTablePatch);
    if (!entry) return 1;
    return 1 + (entry.base_pct + entry.per_level_pct * (level || 1)) / 100;
  };
  // Axe — One Man Army: bonus STR = (base_armor + agi/6) * 0.5.
  // Self-referential via armor formula; computed before wa to feed HP/armor derivations.
  const axeStrBonus = (s, a) => {
    if (!innatesToggle?.checked || s.slug !== 'axe') return 0;
    const rules = _innateRules['axe'];
    const eff = rules?.effects?.find(e => e.target === 'str' && e.formula === 'armor_factor');
    if (!eff) return 0;
    const entry = _activeEntry(eff, hsTablePatch);
    if (!entry) return 0;
    return (num(s.armor) + a.agi * 0.16667) * entry.factor;
  };
  // Drow — Trueshot: self-referential AGI bonus, folded into agi before all derived stats.
  const drowAgiBonus = (s, rawA, level) => {
    if (!innatesToggle?.checked || s.slug !== 'drow_ranger') return 0;
    const rules = _innateRules['drow_ranger'];
    const eff = rules?.effects?.find(e => e.target === 'agi' && e.formula === 'self_attr_pct_per_level');
    if (!eff) return 0;
    const entry = _activeEntry(eff, hsTablePatch);
    if (!entry) return 0;
    return rawA.agi * (entry.base_pct + entry.per_level_pct * (level || 1));
  };
  // Medusa — Mana Shield. The ability absorbs 98% of incoming damage BEFORE
  // armor / magic resistance, at `damage_per_mana` damage per mana point. Since
  // it soaks raw pre-mitigation damage, every mana point adds a FLAT, armor/
  // resist-independent 0.98·dpm to BOTH physical and magical EHP.
  //
  // dpm has changed across patches (values taken from KV files, see
  // data/stats/<patch>/heroes/npc_dota_hero_medusa.txt):
  //   ≤ 7.36c — leveled ability: 2/2.4/2.8/3.2/3.6 (assumes max rank at L30+)
  //   7.37    — 2.4   (became innate with 7.36 hero-rework cycle)
  //   7.38..7.39d — 2.2
  //   7.39e..7.40c — 2.0
  //   7.41a+  — 2 + 0.1·level   (current; Liquipedia EHP: 2.058/mp L1 → 4.9/mp L30)
  // We compare patch strings via the helpers below (same as `_ge` in the
  // Python side). absorption_pct = 98 across every version checked.
  const hsTablePatch = (table.dataset.patch || '7.41d');
  const patchKey = v => {
    const m = String(v || '').match(/^7\.(\d+)([a-z]?)/);
    if (!m) return [0, 0];
    return [parseInt(m[1], 10), m[2] ? m[2].charCodeAt(0) - 96 : 0];
  };
  const patchGe = (a, b) => {
    const [x1, y1] = patchKey(a), [x2, y2] = patchKey(b);
    return x1 !== x2 ? x1 > x2 : y1 >= y2;
  };
  const medusaDpm = (level) => {
    const v = hsTablePatch;
    if (patchGe(v, '7.41a')) return 2 + 0.1 * level;
    if (patchGe(v, '7.39e')) return 2.0;
    if (patchGe(v, '7.38'))  return 2.2;
    if (patchGe(v, '7.37'))  return 2.4;
    // ≤7.36c: skill with ranks 1-4 → assume max-ranked at hero level ≥ 7.
    const ranks = [2, 2, 2.4, 2.8, 3.2, 3.6];
    return ranks[Math.min(5, Math.max(0, Math.floor((level + 1) / 2)))];
  };
  const manaShieldEhp = (s, mana, level) => {
    if (!innatesToggle?.checked || s.slug !== 'medusa') return 0;
    return mana * 0.98 * medusaDpm(level);
  };
  const primaryDmg = (s, a) => {
    if (s.attr === 'str') return Math.floor(a.str);
    if (s.attr === 'agi') return Math.floor(a.agi);
    if (s.attr === 'int') return Math.floor(a.int);
    const mult = s.slug === 'void_spirit' ? 0.45 * 1.15 : 0.45;
    return Math.floor((a.str + a.agi + a.int) * mult);
  };
  const valueFor = (s, col, mode, level) => {
    const effectiveLevel = mode === 'base' ? 1 : level;
    const usePlus2 = mode !== 'base' && !!plus2Toggle?.checked;
    const rawAttrs = attrsAt(s, effectiveLevel, usePlus2);
    const a = mode === 'base' ? rawAttrs : {
      str: rawAttrs.str + axeStrBonus(s, rawAttrs),
      agi: rawAttrs.agi + drowAgiBonus(s, rawAttrs, effectiveLevel),
      int: rawAttrs.int,
    };
    const wa = wholeAttrs(a);
    const baseAs = num(s.bas);
    const startAs = baseAs + a.agi + innate('aspd', s, a, effectiveLevel);
    const startArmor = num(s.armor) + a.agi / 6 + innate('armor', s, a, effectiveLevel);
    const startMr = num(s.mr) + a.int * 0.1;
    const rawHp = num(s.hp);
    const startHp = Math.round(rawHp + wa.str * 22);
    // bonusDmg references startHp (Ursa Maul = % of current HP), so compute it
    // AFTER startHp. primaryDmg = the universal attribute-to-damage; innateDmg
    // adds Sven/Luna/Ursa on top.
    const bonusDmg = primaryDmg(s, wa) + innate('dmg', s, wa, effectiveLevel, startHp);
    const rawMana = s.slug === 'huskar' ? 0 : num(s.mp);
    const rawManaRegen = s.slug === 'huskar' ? 0 : num(s.mpr);
    const startMana = (() => {
      if (s.slug === 'huskar') return 0;
      if (s.slug === 'ogre_magi') return Math.round(num(s.mp) + wa.str * 6 + wa.int * 12);
      return Math.round(num(s.mp) + wa.int * 12);
    })();
    const startManaRegen = (() => {
      if (s.slug === 'huskar') return 0;
      const techiesPoolPct = techiesPoolPctAt(effectiveLevel); // 0.10% + 0.01% per level
      const techiesPoolRegen = (innatesToggle?.checked && s.slug === 'techies')
        ? startMana * techiesPoolPct
        : 0;
      if (s.slug === 'ogre_magi') return num(s.mpr) + a.str * 0.02 + a.int * 0.05;
      return num(s.mpr) + wa.int * 0.05 + innate('mpr', s, a, effectiveLevel) + techiesPoolRegen;
    })();
    const start = mode !== 'base';
    switch (col) {
      case 'hp': return [start ? startHp : rawHp, g0];
      case 'ehp_phys': {
        const shield = start ? manaShieldEhp(s, startMana, effectiveLevel) : 0;
        return [ehpPhys(start ? startHp : rawHp, start ? startArmor : num(s.armor)) + shield, g0];
      }
      case 'ehp_mag': {
        const shield = start ? manaShieldEhp(s, startMana, effectiveLevel) : 0;
        return [ehpMag(start ? startHp : rawHp, start ? startMr : num(s.mr)) + shield, g0];
      }
      case 'hpr': return [start ? num(s.hpr) + wa.str * 0.1 + innate('hpr', s, a, effectiveLevel) : num(s.hpr), regen];
      case 'mp': return [start ? startMana : rawMana, g0];
      case 'mpr': return [start ? startManaRegen : rawManaRegen, regen];
      case 'str': return [a.str, g];
      case 'str_gain': return [num(s.strGain), g];
      case 'agi': return [a.agi, g];
      case 'agi_gain': return [num(s.agiGain), g];
      case 'int': return [a.int, g];
      case 'int_gain': return [num(s.intGain), g];
      case 'gper': return [num(s.strGain) + num(s.agiGain) + num(s.intGain), g1];
      case 'armor': return [start ? startArmor : num(s.armor), g1];
      case 'armor_pct': return [armorPct(start ? startArmor : num(s.armor)), pct];
      case 'mr': return [start ? startMr : num(s.mr), pct1];
      case 'dmg': {
        // Main Damage column = single AVERAGE value (min/max live in Expanded).
        const min = num(s.dmin) + (start ? bonusDmg : 0);
        const max = num(s.dmax) + (start ? bonusDmg : 0);
        return [(min + max) / 2, g0];
      }
      case 'dmin': return [num(s.dmin) + (start ? bonusDmg : 0), g0];
      case 'dmax': return [num(s.dmax) + (start ? bonusDmg : 0), g0];
      case 'aspd': return [start ? startAs : baseAs, g0];
      case 't_per_attack': {
        const ats = start ? startAs : baseAs || 100;
        return [ats ? num(s.bat) * 100 / ats : num(s.bat), g];
      }
      case 'bat': return [num(s.bat), g];
      case 'range': return [start ? num(s.range) + innate('range', s, a, effectiveLevel) : num(s.range), g0];
      case 'proj': return [num(s.proj), g0];
      case 'dvision': return [num(s.dvision), g0];
      case 'nvision': return [start ? num(s.nvision) + innate('nvision', s, a, effectiveLevel) : num(s.nvision), g0];
      case 'ms': {
        if (!start) return [num(s.ms), g0];
        // Death Prophet Witchcraft applies a multiplicative % bonus to MS;
        // Razor / KotL add flat bonuses via innate(). Apply mult LAST so the
        // mult scales the full base+flat-innate stack.
        const flat = num(s.ms) + innate('ms', s, a, effectiveLevel);
        return [flat * dpWitchcraftMsMult(s, effectiveLevel), g0];
      }
      case 'turn': return [num(s.turn), g];
      case 'collision': return [num(s.collision), g0];
      case 'bound': return [num(s.bound), g0];
      default: return [parseFloat(s[col]) || 0, g];
    }
  };

  // Stash Starting values once — those are the cell's INITIAL data.
  cells.forEach(td => {
    if (!td.dataset.startSort) td.dataset.startSort = td.dataset.sort;
    if (!td.dataset.startHist) td.dataset.startHist = td.dataset.hist || '';
    if (!td.dataset.startHtml) td.dataset.startHtml = td.innerHTML;
  });
  function recomputeCats() {
    table.querySelectorAll('thead tr.cat-row th.cat-head[data-cat]').forEach(head => {
      let span = 0;
      table.querySelectorAll('thead tr.col-row th[data-cat="' + head.dataset.cat + '"]')
        .forEach(th => { if (th.offsetParent !== null) span += th.colSpan || 1; });
      head.colSpan = span || 1;
      head.style.display = span ? '' : 'none';
    });
  }
  const apply = () => {
    const mode = viewSel.value;
    const level = clampLevel();
    if (levelInput) {
      const baseMode = mode === 'base';
      levelInput.disabled = baseMode;
      levelInput.title = baseMode
        ? 'Base view uses raw level-1 game-file values'
        : 'Hero level';
    }
    table.classList.remove('hs-mode-base', 'hs-mode-starting', 'hs-mode-expanded');
    table.classList.add('hs-mode-' + mode);
    cells.forEach(td => {
      const tr = td.closest('tr[data-hs-stats]');
      const col = td.dataset.col;
      const stats = tr ? rowStats(tr) : {};
      const [sortVal, formatter] = valueFor(stats, col, mode, level);
      const attackType = tr?.dataset.attackType || '';
      const html = col === 'range' && attackType
        ? `<span class="atk-num">${formatter(sortVal)}</span>` +
          `<span class="atk-badge atk-${attackType}" title="${attackType === 'ranged' ? 'Ranged' : 'Melee'}">` +
          `<img src="icons/ui/atk_${attackType}.png" alt="${attackType === 'ranged' ? 'Ranged' : 'Melee'}" ` +
          `title="${attackType === 'ranged' ? 'Ranged' : 'Melee'}" loading="lazy"></span>`
        : formatter(sortVal);
      if (mode === 'base') {
        td.dataset.sort = sortVal;
        td.dataset.hist = td.dataset.baseHist;
        td.innerHTML = html;
      } else {
        td.dataset.sort = sortVal;
        td.dataset.hist = td.dataset.startHist;
        td.innerHTML = html;
      }
      if (col === 'hpr' || col === 'mpr') {
        td.classList.toggle('regen-zero', Math.abs(Number(sortVal) || 0) < 1e-9);
      }
      td.classList.toggle('has-history', !!td.dataset.hist);
    });
    table.querySelectorAll('tbody tr[data-hs-stats]').forEach(tr => {
      const stats = rowStats(tr);
      const icon = tr.querySelector('.hs-innate-mini');
      if (!icon) return;
      const show = !!innatesToggle?.checked && !!stats.hasStatInnate && mode !== 'base';
      icon.classList.toggle('is-hidden', !show);
    });
    recomputeCats();
    window.dispatchEvent(new CustomEvent('mr:filter-changed'));  // heatmap re-scan
  };

  const applyHeroFilters = () => {
    table.querySelectorAll('tbody tr[data-hs-stats]').forEach(tr => {
      const hideAttack = !!attackFilter && tr.dataset.attackType !== attackFilter;
      const hideAttr = !!attrFilter && tr.dataset.attrType !== attrFilter;
      tr.classList.toggle('mr-attack-out', hideAttack || hideAttr);
    });
    attackBtns.forEach(btn => {
      const active = btn.dataset.attackFilter === attackFilter;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    attrBtns.forEach(btn => {
      const active = btn.dataset.attrFilter === attrFilter;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    window.dispatchEvent(new CustomEvent('mr:filter-changed'));
  };

  viewSel.addEventListener('change', apply);
  if (levelInput) {
    levelInput.addEventListener('input', apply);
    levelInput.addEventListener('change', apply);
  }
  if (plus2Toggle) plus2Toggle.addEventListener('change', apply);
  if (innatesToggle) innatesToggle.addEventListener('change', apply);
  attackBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.attackFilter || '';
      attackFilter = attackFilter === next ? '' : next;
      applyHeroFilters();
    });
  });
  attrBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.attrFilter || '';
      attrFilter = attrFilter === next ? '' : next;
      applyHeroFilters();
    });
  });
  window.addEventListener('resize', recomputeCats, { passive: true });
  apply();
  applyHeroFilters();
})();

// ---- HERO LAB: two-side hero + item calculator ----
(function() {
  const root = document.querySelector('.hero-lab');
  const dataEl = document.getElementById('hero-lab-data');
  if (!root || !dataEl) return;
  let data;
  try { data = JSON.parse(dataEl.textContent || '{}'); }
  catch { return; }
  const heroes = data.heroes || [];
  const items = data.items || [];
  const innateRules = data.innateRules || {};
  if (!heroes.length) return;

  const PLUS2_LEVELS = [15, 16, 17, 19, 20, 21, 22];
  const ATTR_META = {
    str: { label: 'Strength', short: 'STR', icon: 'icons/strength.webp', color: '#cf6d5e' },
    agi: { label: 'Agility', short: 'AGI', icon: 'icons/agility.webp', color: '#63c774' },
    int: { label: 'Intelligence', short: 'INT', icon: 'icons/intelligence.webp', color: '#63b8e6' },
    uni: { label: 'Universal', short: 'UNI', icon: 'icons/universal.webp', color: '#e1b85b' },
  };
  const BASIC_SECTIONS = ['Consumables', 'Attributes', 'Equipment', 'Miscellaneous', 'Secret Shop'];
  const UPGRADE_SECTIONS = ['Accessories', 'Support', 'Magical', 'Armor', 'Weapons', 'Armaments'];
  var SHOP_ORDER = {
    Consumables: ['clarity','tango','flask','bottle','enchanted_mango','faerie_fire','smoke_of_deceit','ward_sentry','dust','infused_raindrop','blood_grenade'],
    Attributes: ['branches','gauntlets','slippers','mantle','circlet','crown','boots_of_elves','belt_of_strength','ogre_axe','blade_of_alacrity','staff_of_wizardry','robe','ghost','diadem'],
    Equipment: ['blades_of_attack','broadsword','claymore','javelin','mithril_hammer','orb_of_venom','blight_stone','orb_of_frost','quelling_blade','ring_of_protection','splintmill','chainmail','helm_of_iron_will','blitz_knuckles','gloves','splintmail'],
    Miscellaneous: ['magic_stick','wind_lace','ring_of_regen','sobi_mask','boots','cloak','fluffy_hat','gem','blink','shadow_amulet','lifesteal','shawl','voodoo_mask','wizard_hat','chasm_stone'],
    'Secret Shop': ['ring_of_health','void_stone','energy_booster','vitality_booster','point_booster','platemail','talisman_of_evasion','hyperstone','ultimate_orb','demon_edge','mystic_staff','reaver','eagle','relic','tiara_of_selemene','ring_of_tarrasque'],
    Accessories: ['magic_wand','null_talisman','wraith_band','bracer','soul_ring','orb_of_corrosion','falcon_blade','power_treads','phase_boots','oblivion_staff','pers','mask_of_madness','hand_of_midas','travel_boots','moon_shard','soul_booster'],
    Support: ['ring_of_basilius','headdress','buckler','urn_of_shadows','tranquil_boots','arcane_boots','pavise','mekansm','spirit_vessel','ancient_janggo','glimmer_cape','holy_locket','solar_crest','pipe','guardian_greaves','boots_of_bearing','essence_distiller'],
    Magical: ['veil_of_discord','aether_lens','force_staff','rod_of_atos','cyclone','meteor_hammer','ultimate_scepter','orchid','dagon','phylactery','ethereal_blade','octarine_core','refresher','sheepstick','gungir','wind_waker','bloodstone','bloodthorn','angels_demise','crellas_crozier'],
    Armor: ['buckler','blade_mail','vanguard','helm_of_the_dominator','vladmir','armlet','crimson_guard','black_king_bar','consecrated_wraps','lotus_orb','aeon_disk','shivas_guard','assault','heart','helm_of_the_overlord','sphere'],
    Weapons: ['lesser_crit','maelstrom','invis_sword','desolator','basher','mage_slayer','bfury','monkey_king_bar','manta','heavens_halberd','radiance','greater_crit','butterfly','silver_edge','satanic','abyssal_blade','mjollnir','rapier','revenants_brooch','nullifier'],
    Armaments: ['sange','yasha','kaya','witch_blade','diffusal_blade','dragon_lance','echo_sabre','devastator','sange_and_yasha','kaya_and_sange','yasha_and_kaya','harpoon','hurricane_pike','disperser','specialists_array','hydras_breath','skadi','arcane_blink','swift_blink','overwhelming_blink'],
  };
  const C = {
    hpStr: 22, hprStr: 0.1, mpInt: 12, mprInt: 0.05,
    armorAgi: 1 / 6, mrInt: 0.1, asAgi: 1, uniDmg: 0.45,
  };
  const METRICS = [
    ['hp', 'HP'], ['mp', 'MP'], ['hpr', 'HP/sec'], ['mpr', 'MP/sec'],
    ['str', 'Strength'], ['agi', 'Agility'], ['int', 'Intelligence'],
    ['armor', 'Armor'], ['armorPct', 'Armor %'], ['mr', 'Mag. resist'],
    ['statusRes', 'Status resist'], ['slowRes', 'Slow resist'], ['spellAmp', 'Spell amp'],
    ['evasion', 'Evasion'], ['dmg', 'Damage'], ['aspd', 'Attack speed'], ['tHit', 'Attack Interval'],
    ['lifesteal', 'Lifesteal'], ['spellLifesteal', 'Spell Lifesteal'],
    ['ms', 'Movespeed'], ['range', 'Attack range'],
    ['dvision', 'Day Vision'], ['nvision', 'Night Vision'], ['castRange', 'Cast Range'],
    ['dps', 'Dummy DPS'],
    ['ehpPhys', 'EHP phys'], ['ehpMag', 'EHP mag'],
    ['itemCdr', 'Item CDR'],
  ];
  const CUSTOM = [
    ['hp', 'HP'], ['mp', 'MP'], ['hpr', 'HP/sec'], ['mpr', 'MP/sec'],
    ['armor', 'Armor'], ['mr', 'Magic resist'], ['evasion', 'Evasion'],
  ];
  const byHero = new Map(heroes.map(h => [h.id, h]));
  const byItem = new Map(items.map(i => [i.id, i]));
  const heroGroups = {
    str: heroes.filter(h => h.stats?.attr === 'str'),
    agi: heroes.filter(h => h.stats?.attr === 'agi'),
    int: heroes.filter(h => h.stats?.attr === 'int'),
    uni: heroes.filter(h => h.stats?.attr === 'uni'),
  };
  function shopSort(list, cat) {
    var order = SHOP_ORDER[cat];
    if (!order) return list;
    return list.slice().sort(function(a, b) {
      var ai = order.indexOf(a.slug), bi = order.indexOf(b.slug);
      if (ai === -1) ai = 9999;
      if (bi === -1) bi = 9999;
      return ai - bi;
    });
  }
  const itemGroups = {
    basics: BASIC_SECTIONS.map(name => [name, shopSort(items.filter(i => i.class === 'regular' && i.category === name && i.id !== 'item_tpscroll' && i.slug !== 'aghanims_shard'), name)]),
    upgrades: UPGRADE_SECTIONS.map(name => [name, shopSort(items.filter(i => i.class === 'regular' && i.category === name && i.id !== 'item_tpscroll'), name)]),
    neutrals: {
      tiers: [0, 1, 2, 3, 4].map(tier => [tier, items.filter(i => i.class === 'neutral' && i.tier === tier)]),
      enchants: items.filter(i => i.class === 'enchant'),
    },
  };
  const allEnchants = itemGroups.neutrals.enchants.slice().sort((a, b) => (a.tierSort || 99) - (b.tierSort || 99));
  function filteredEnchants(heroAttr) {
    if (!heroAttr) return allEnchants;
    return allEnchants.filter(function(item) {
      var ea = item.enchantAttr;
      if (!ea) return true;
      return ea.indexOf('all') >= 0 || ea.indexOf(heroAttr) >= 0;
    });
  }
  const overlay = document.createElement('div');
  overlay.className = 'hl-overlay';
  overlay.hidden = true;
  document.body.appendChild(overlay);
  let activePicker = null;
  let dragState = null;
  let suppressSlotClickUntil = 0;

  const fmt = (v, d = 0) => {
    const n = Number(v) || 0;
    return d ? n.toFixed(d).replace(/\.?0+$/, '') : String(Math.round(n));
  };
  const fmtMetric = (key, v) => {
    if (key === 'hpr' || key === 'mpr' || key === 'tHit') return Number(v || 0).toFixed(2);
    if (key === 'dps') return Number(v || 0).toFixed(1);
    if (key === 'armor') return fmt(v, 1);
    if (key === 'mr' || key === 'evasion' || key === 'armorPct' || key === 'statusRes' || key === 'slowRes' || key === 'spellAmp' || key === 'lifesteal' || key === 'spellLifesteal' || key === 'itemCdr') return fmt(v, 1) + '%';
    return fmt(v);
  };
  const fmtDiffMetric = (key, v) => {
    const n = Number(v) || 0;
    const abs = Math.abs(n);
    const sign = n > 0 ? '+' : n < 0 ? '-' : '';
    if (key === 'hpr' || key === 'mpr') return sign + abs.toFixed(2);
    if (key === 'tHit') return sign + abs.toFixed(2) + 's';
    if (key === 'dps') return sign + abs.toFixed(1);
    if (key === 'armor') return sign + fmt(abs, 1);
    if (key === 'mr' || key === 'evasion' || key === 'armorPct' || key === 'statusRes' || key === 'slowRes' || key === 'spellAmp' || key === 'lifesteal' || key === 'spellLifesteal' || key === 'itemCdr') return sign + fmt(abs, 1) + '%';
    return sign + fmt(abs);
  };
  const armorFactor = a => (0.06 * a) / (1 + 0.06 * Math.abs(a));
  const plus2At = lvl => PLUS2_LEVELS.filter(x => x <= lvl).length * 2;
  const combinePct = vals => (1 - vals.reduce((acc, v) => acc * (1 - Math.max(0, v) / 100), 1)) * 100;
  const iconHtml = (src, name, cls) => `<img class="${cls}" src="${src}" alt="${name}" loading="lazy">`;
  const quickFmt = v => Number(v || 0).toFixed(2).replace(/\.00$/, '');
  var TIER_TIMES = ['0:00+', '15:00+', '25:00+', '35:00+', '60:00+'];
  const tierLabel = tier => `Tier ${Number(tier) + 1}`;
  const tierHead = tier => `<span class="hl-tier-label">Tier ${Number(tier) + 1} <span class="hl-tier-time">${TIER_TIMES[tier] || ''}</span></span>`;
  const patchKey = v => {
    const m = String(v || '').match(/^7\.(\d+)([a-z]?)/);
    if (!m) return [0, 0];
    return [parseInt(m[1], 10), m[2] ? m[2].charCodeAt(0) - 96 : 0];
  };
  const patchGe = (a, b) => {
    const [x1, y1] = patchKey(a), [x2, y2] = patchKey(b);
    return x1 !== x2 ? x1 > x2 : y1 >= y2;
  };
  const currentPatch = data.patch || root.dataset.patch || '7.41d';
  const _SEC = {
    'hpr:str': 0.1, 'mpr:int': 0.05, 'aspd:agi': 1.0, 'armor:agi': 0.16667, 'mr:int': 0.1,
  };

  function heroLabInnatesOn() {
    const innateToggle = document.querySelector('[data-innates-toggle]');
    return innateToggle ? innateToggle.checked : true;
  }

  function heroLabMergePositiveOn() {
    const toggle = document.querySelector('[data-hl-merge-positive-toggle]');
    return toggle ? toggle.checked : false;
  }

  function heroLabDiffPercentOn() {
    const toggle = document.querySelector('[data-hl-diff-percent-toggle]');
    return toggle ? toggle.checked : false;
  }

  function activeEntry(eff, patch) {
    if (!eff.history) {
      const s = eff.since, u = eff.until;
      if (s && !patchGe(patch, s)) return null;
      if (u && !patchGe(u, patch)) return null;
      return eff;
    }
    for (let i = eff.history.length - 1; i >= 0; i--) {
      const e = eff.history[i];
      if (patchGe(patch, e.since || '7.00')) {
        if (e.until == null || patchGe(e.until, patch)) return e;
      }
    }
    return null;
  }

  function heroLabInnate(key, s, a, level, startHp, includeInnates) {
    if (!includeInnates) return 0;
    const rules = innateRules[s.slug];
    if (!rules) return 0;
    let total = 0;
    for (const eff of (rules.effects || [])) {
      if (eff.target !== key) continue;
      const entry = activeEntry(eff, currentPatch);
      if (!entry) continue;
      const f = eff.formula;
      if (f === 'attr_factor') {
        total += a[eff.source] * entry.factor;
      } else if (f === 'base_plus_level') {
        total += entry.base + entry.per_level * (level || 1);
      } else if (f === 'flat_per_level') {
        total += entry.per_level * (level || 1);
      } else if (f === 'attr_pct_per_level') {
        total += a[eff.source] * (entry.base_pct + entry.per_level_pct * (level || 1));
      } else if (f === 'hp_pct') {
        total += (startHp || 0) * entry.factor / 100;
      } else if (f === 'secondary_attr_factor') {
        total += a[eff.source] * (_SEC[`${key}:${eff.source}`] || 0) * entry.factor;
      } else if (f === 'mana_pool_pct_per_level') {
        const manaPool = a && a._manaPool ? a._manaPool : 0;
        total += manaPool * (entry.base_pct + entry.per_level_pct * (level || 1));
      } else if (f === 'attr_floor_capped') {
        total += Math.min(Math.floor(a[eff.source] / (eff.divisor || 1)), eff.cap || 100);
      }
    }
    return total;
  }

  function dpWitchcraftMsMult(s, level, includeInnates) {
    if (!includeInnates || s.slug !== 'death_prophet') return 1;
    const rules = innateRules.death_prophet;
    const eff = rules?.effects?.find(e => e.target === 'ms' && e.formula === 'ms_multiplier');
    if (!eff) return 1;
    const entry = activeEntry(eff, currentPatch);
    if (!entry) return 1;
    return 1 + (entry.base_pct + entry.per_level_pct * (level || 1)) / 100;
  }

  function axeStrBonus(s, a, includeInnates) {
    if (!includeInnates || s.slug !== 'axe') return 0;
    const rules = innateRules.axe;
    const eff = rules?.effects?.find(e => e.target === 'str' && e.formula === 'armor_factor');
    if (!eff) return 0;
    const entry = activeEntry(eff, currentPatch);
    if (!entry) return 0;
    return ((Number(s.armor) || 0) + a.agi * 0.16667) * entry.factor;
  }

  function drowAgiBonus(s, rawA, level, includeInnates) {
    if (!includeInnates || s.slug !== 'drow_ranger') return 0;
    const rules = innateRules.drow_ranger;
    const eff = rules?.effects?.find(e => e.target === 'agi' && e.formula === 'self_attr_pct_per_level');
    if (!eff) return 0;
    const entry = activeEntry(eff, currentPatch);
    if (!entry) return 0;
    return rawA.agi * (entry.base_pct + entry.per_level_pct * (level || 1));
  }

  function medusaDpm(level) {
    const v = currentPatch;
    if (patchGe(v, '7.41a')) return 2 + 0.1 * level;
    if (patchGe(v, '7.39e')) return 2.0;
    if (patchGe(v, '7.38')) return 2.2;
    if (patchGe(v, '7.37')) return 2.4;
    const ranks = [2, 2, 2.4, 2.8, 3.2, 3.6];
    return ranks[Math.min(5, Math.max(0, Math.floor((level + 1) / 2)))];
  }

  function manaShieldEhp(s, mana, level, includeInnates) {
    if (!includeInnates || s.slug !== 'medusa') return 0;
    return mana * 0.98 * medusaDpm(level);
  }

  function primaryDmg(s, a, includeInnates) {
    if (s.attr === 'str') return Math.floor(a.str);
    if (s.attr === 'agi') return Math.floor(a.agi);
    if (s.attr === 'int') return Math.floor(a.int);
    const mult = includeInnates && s.slug === 'void_spirit' ? 0.45 * 1.15 : 0.45;
    return Math.floor((a.str + a.agi + a.int) * mult);
  }

  function renderPanel(panel, side, heroId) {
    const hero = byHero.get(heroId) || heroes[0];
    panel.innerHTML = `
      <div class="hl-hud">
        <div class="hl-identity">
          <div class="hl-portrait-row">
            <div class="hl-portrait-wrap">
              <button type="button" class="hl-hero-trigger" data-open-hero-picker aria-label="Choose hero">
                ${iconHtml(hero.icon, hero.name, 'hl-hero-icon')}
              </button>
              <button type="button" class="hl-innate-chip is-hidden" data-innate-chip aria-label="Innate tooltip" tabindex="-1">
                <img class="hl-innate-chip-icon" data-innate-icon alt="" loading="lazy">
              </button>
              <span class="hl-level-corner">
                <svg class="hl-level-ring" viewBox="0 0 44 44" aria-hidden="true">
                  <circle class="hl-level-ring-bg" cx="22" cy="22" r="18"/>
                  <circle class="hl-level-ring-fg" cx="22" cy="22" r="18" data-ring/>
                </svg>
                <input class="hl-level-input" type="text" inputmode="numeric" maxlength="2" value="1" data-field="level" aria-label="Hero level" autocomplete="off">
              </span>
            </div>
            <div class="hl-quickstats">
              <div class="hl-qs-cell">
                <span class="hl-qs-label">DUMMY DPS</span>
                <span class="hl-qs-value" data-dps-value></span>
              </div>
              <div class="hl-qs-cell">
                <span class="hl-qs-label">DMG GOLD</span>
                <span class="hl-qs-value" data-dmggold-value></span>
              </div>
              <div class="hl-qs-cell">
                <span class="hl-qs-label">pEHP</span>
                <span class="hl-qs-value" data-pehp-value></span>
              </div>
              <div class="hl-qs-cell">
                <span class="hl-qs-label">mEHP</span>
                <span class="hl-qs-value" data-mehp-value></span>
              </div>
            </div>
          </div>
          <div class="hl-identity-main"></div>
          <span class="hl-cost-badge" data-cost-badge>
            <img class="hl-cost-icon" src="icons/misc/gold.png" alt="" loading="lazy">
            <span class="hl-cost-value" data-cost-value></span>
          </span>
        </div>
        <div class="hl-inventory">
          <div class="hl-inv-grid">
            ${Array.from({ length: 6 }, (_, i) => `
              <button type="button" class="hl-inv-slot is-empty" data-open-item-picker data-slot="${i}" aria-label="Choose item slot ${i + 1}">
                <span class="hl-slot-bevel"></span>
                <span class="hl-slot-glow"></span>
              </button>`).join('')}
          </div>
          <div class="hl-neutral-stack">
            <button type="button" class="hl-inv-slot hl-enchant-slot is-empty" data-open-item-picker data-slot="enchant" aria-label="Choose enchantment">
              <span class="hl-enchant-mark">E</span>
              <span class="hl-slot-bevel"></span>
              <span class="hl-slot-glow"></span>
            </button>
            <div class="hl-bauble-connector"></div>
            <div class="hl-bauble-wrap">
              <button type="button" class="hl-bauble-slot" data-slot="bauble" aria-label="Enchanter's Bauble">
                <img src="icons/items/enchanters_bauble.png" alt="Enchanter's Bauble" loading="lazy">
                <span class="hl-slot-bevel"></span>
                <span class="hl-slot-glow"></span>
              </button>
              <input type="number" class="hl-bauble-level" data-field="bauble-level" min="0" max="100" value="0" placeholder="0">
            </div>
          </div>
        </div>
      </div>
      <div class="hl-bars">
        <div class="hl-bar hl-bar-hp">
          <div class="hl-bar-fill"></div>
          <span class="hl-bar-value" data-bar-value="hp"></span>
          <span class="hl-bar-regen" data-bar-regen="hpr"></span>
        </div>
        <div class="hl-bar hl-bar-mp">
          <div class="hl-bar-fill"></div>
          <span class="hl-bar-value" data-bar-value="mp"></span>
          <span class="hl-bar-regen" data-bar-regen="mpr"></span>
        </div>
      </div>
      <div class="hl-total-list" data-total-list></div>
    `;
    panel.dataset.hero = hero.id;
    panel.dataset.side = side;
    panel.dataset.items = JSON.stringify(['', '', '', '', '', '']);
    panel.dataset.itemModes = JSON.stringify({});

    panel.dataset.enchantItem = '';
  }

  function safeJsonParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function state(panel) {
    const heroId = panel.dataset.hero || heroes[0].id;
    let level = parseInt(panel.querySelector('[data-field="level"]')?.value || '1', 10);
    level = Math.max(1, Math.min(30, Number.isFinite(level) ? level : 1));
    panel.querySelector('[data-field="level"]').value = String(level);
    const itemModes = safeJsonParse(panel.dataset.itemModes, {});
    const itemEntries = safeJsonParse(panel.dataset.items, ["","","","","",""])
      .map((id, idx) => id ? { id, mode: itemModes[String(idx)] || null, slot: idx } : null)
      .filter(Boolean);
    const enchantItem = panel.dataset.enchantItem || '';
    if (enchantItem) itemEntries.push({ id: enchantItem, mode: itemModes.enchant || null, slot: 'enchant' });
    const baubleLevel = Math.max(0, Math.min(100, parseInt(panel.querySelector('[data-field="bauble-level"]')?.value || '0', 10) || 0));
    const custom = { hp: null, mp: null, hpr: null, mpr: null, armor: null, mr: null, evasion: null };
    panel.querySelectorAll('[data-custom]').forEach(inp => {
      custom[inp.dataset.custom] = inp.value === '' ? null : (Number(inp.value) || 0);
    });
    return { hero: byHero.get(heroId) || heroes[0], level, itemEntries, baubleLevel, custom };
  }

  function slotAcceptsItem(slot, item) {
    if (!item) return true;
    if (slot === 'enchant') return item.class === 'enchant';
    return item.class === 'regular';
  }

  function getSlotState(panel, slot) {
    const items = safeJsonParse(panel.dataset.items, ["","","","","",""]);
    const itemModes = safeJsonParse(panel.dataset.itemModes, {});
    if (slot === 'enchant') {
      return { id: panel.dataset.enchantItem || '', mode: itemModes.enchant || null };
    }
    const idx = Number(slot);
    return { id: items[idx] || '', mode: itemModes[String(slot)] || null };
  }

  function setSlotState(panel, slot, next) {
    const items = safeJsonParse(panel.dataset.items, ["","","","","",""]);
    const itemModes = safeJsonParse(panel.dataset.itemModes, {});
    const id = next && next.id ? next.id : '';
    const mode = next && next.mode ? next.mode : null;
    if (slot === 'enchant') {
      panel.dataset.enchantItem = id;
      if (mode) itemModes.enchant = mode;
      else delete itemModes.enchant;
    } else {
      const idx = Number(slot);
      items[idx] = id;
      panel.dataset.items = JSON.stringify(items);
      if (mode) itemModes[String(slot)] = mode;
      else delete itemModes[String(slot)];
    }
    if (slot === 'enchant') {
      panel.dataset.itemModes = JSON.stringify(itemModes);
      return;
    }
    panel.dataset.itemModes = JSON.stringify(itemModes);
  }

  function swapSlots(srcPanel, srcSlot, dstPanel, dstSlot) {
    const src = getSlotState(srcPanel, srcSlot);
    const dst = getSlotState(dstPanel, dstSlot);
    const srcItem = src.id ? byItem.get(src.id) : null;
    const dstItem = dst.id ? byItem.get(dst.id) : null;
    if (!srcItem) return false;
    if (!slotAcceptsItem(dstSlot, srcItem)) return false;
    if (dstItem && !slotAcceptsItem(srcSlot, dstItem)) return false;
    setSlotState(srcPanel, srcSlot, dst);
    setSlotState(dstPanel, dstSlot, src);
    return true;
  }

  function syncEnchantMode(panel) {
    const enchId = panel.dataset.enchantItem || '';
    if (!enchId) return;
    const enchItem = byItem.get(enchId);
    if (!enchItem || !enchItem.tiersAvailable) return;
    const tiers = enchItem.tiersAvailable;
    const best = tiers[tiers.length - 1];
    const itemModes = safeJsonParse(panel.dataset.itemModes, {});
    itemModes.enchant = 't' + best;
    panel.dataset.itemModes = JSON.stringify(itemModes);
  }

  function activeItemMode(item, modeKey) {
    if (!item || !item.modes) return null;
    const key = modeKey || item.modes.default || null;
    return key ? (item.modes[key] || null) : null;
  }

  function itemModeBadge(item, modeKey) {
    if (!item || !item.modes) return '';
    if (item.id === 'item_rapier') return modeKey === 'spell' ? 'AMP' : 'DMG';
    if (item.id === 'item_dagon') {
      const mode = activeItemMode(item, modeKey);
      return 'L' + String((mode && mode.level) || 1);
    }
    if (item.id === 'item_power_treads') return (modeKey || 'str').toUpperCase();
    if (item.id === 'item_desolator') return (modeKey && modeKey !== 'none') ? '+' + modeKey : '0';
    if (item.id === 'item_tranquil_boots') return modeKey === 'broken' ? 'OFF' : 'ON';
    if (item.tiersAvailable && modeKey && modeKey.startsWith('t')) return '';
    return 'ALT';
  }

  function itemModeAccent(item, modeKey) {
    if (!item || !item.modes) return '';
    if (item.id === 'item_rapier') return modeKey === 'spell' ? 'arcane' : 'damage';
    if (item.id === 'item_dagon') return 'damage';
    if (item.id === 'item_power_treads') return modeKey || 'str';
    return '';
  }

  function itemVisual(item, modeKey) {
    const mode = activeItemMode(item, modeKey);
    return {
      icon: (mode && mode.icon) || item.icon,
      cost: mode && mode.costOverride != null ? mode.costOverride : item.cost,
      mode,
    };
  }

  function itemTotals(entries, attackType, baubleLevel) {
    const isRanged = String(attackType || '').toLowerCase() === 'ranged';
    const baubleScale = baubleLevel > 0 ? (0.7 + baubleLevel * 0.4) : 1;
    const out = { str: 0, agi: 0, int: 0, hp: 0, mp: 0, hpr: 0, mpr: 0, mprAmp: 0, _mprAmpVals: [], armor: 0, _rangeUniqueAllVals: [], _rangeUniqueRangedVals: [], _msBootVals: [], _cdrUniqVals: [], _cdrStackVals: [], projSpeed: 0, mrVals: [], evVals: [], statusResVals: [], slowResVals: [], spellAmp: 0, damage: 0, damagePct: 0, aspd: 0, ms: 0, range: 0, dvision: 0, nvision: 0, cost: 0, hprPct: 0, missingHprPct: 0, mpPct: 0, lifesteal: 0, spellLifesteal: 0, castRange: 0, primaryStat: 0, primaryStatUni: 0, batReduce: 0, healthRestoration: 0, cooldownReduction: 0, debuffAmp: 0, hpPct: 0, msPct: 0, _msPctVals: [], knockbackResist: 0, maxHpRegen: 0, incomingDamage: 0, magicDamage: 0, castSpeed: 0, visionReduce: 0, manacostIncrease: 0, intelligencePct: 0, hpRegenReduce: 0, manacostReduction: 0, gpm: 0, xpm: 0, aspdPct: 0, manaReductionPct: 0 };
    const visionSeen = new Set();
    entries.forEach(entry => {
      const id = typeof entry === 'string' ? entry : entry.id;
      const mode = typeof entry === 'string' ? null : entry.mode;
      const it = byItem.get(id);
      if (!it) return;
      // Enchanter's Bauble only amplifies Tier 5 enchants. The item picker dims
      // non-T5 enchants when a bauble is active, so in normal use this branch is
      // never reached. If it is (e.g. bauble added after enchant selection),
      // we skip the enchant rather than showing unscaled T<5 stats.
      if (it.class === 'enchant' && baubleLevel > 0 && mode !== 't5') return;
      const _entryScale = (it.class === 'enchant' && baubleScale !== 1 && mode === 't5') ? baubleScale : 1;
      // CDR is excluded from linear scaling — it gets two separate multiplicative stacks below.
      const _bs = _entryScale !== 1 ? Object.fromEntries(Object.entries(it.bonus || {}).map(([k,v]) => [k, typeof v === 'number' && k !== 'cooldownReduction' && k !== 'cdrUnique' ? v * _entryScale : v])) : (it.bonus || {});
      const b = _bs;
      // "All Attributes" feeds every stat; per-attribute bonuses stack on top.
      const allAttr = Number(b.all) || 0;
      out.str += (Number(b.str) || 0) + allAttr;
      out.agi += (Number(b.agi) || 0) + allAttr;
      out.int += (Number(b.int) || 0) + allAttr;
      out.hp += Number(b.hp) || 0;
      out.mp += Number(b.mp) || 0;
      out.hpr += Number(b.hpr) || 0;
      out.mpr += Number(b.mpr) || 0;
      if (b.mprAmp) out._mprAmpVals.push(Number(b.mprAmp) || 0);
      if (b.msPct) out._msPctVals.push(Number(b.msPct) || 0);
      out.hprPct += Number(b.hprPct) || 0;
      out.missingHprPct += Number(b.missingHprPct) || 0;
      out.mpPct += Number(b.mpPct) || 0;
      out.armor += Number(b.armor) || 0;
      if (b.mr) out.mrVals.push(Number(b.mr) || 0);
      if (b.evasion) out.evVals.push(Number(b.evasion) || 0);
      if (b.statusRes) out.statusResVals.push(Number(b.statusRes) || 0);
      if (b.slowRes) out.slowResVals.push(Number(b.slowRes) || 0);
      out.spellAmp += Number(b.spellAmp) || 0;
      out.damage += (Number(b.damage) || 0) + (isRanged ? (Number(b.damageRanged) || 0) : (Number(b.damageMelee) || 0));
      out.damagePct += Number(b.damagePct) || 0;
      out.lifesteal += Number(b.lifesteal) || 0;
      out.spellLifesteal += Number(b.spellLifesteal) || 0;
      out.castRange += Number(b.castRange) || 0;
      out.primaryStat += Number(b.primaryStat) || 0;
      out.primaryStatUni += Number(b.primaryStatUni) || 0;
      out.batReduce += Number(b.batReduce) || 0;
      out.healthRestoration += Number(b.healthRestoration) || 0;
      if (b.cdrUnique) out._cdrUniqVals.push(Number(b.cdrUnique));
      else if (b.cooldownReduction) {
        out._cdrStackVals.push(Number(b.cooldownReduction));
        if (_entryScale !== 1) { const _cb = Number(b.cooldownReduction) * (_entryScale - 1); if (_cb > 0.001) out._cdrStackVals.push(_cb); }
      }
      out.debuffAmp += Number(b.debuffAmp) || 0;
      out.hpPct += Number(b.hpPct) || 0;

      out.knockbackResist += Number(b.knockbackResist) || 0;
      out.maxHpRegen += Number(b.maxHpRegen) || 0;
      out.incomingDamage += Number(b.incomingDamage) || 0;
      out.magicDamage += Number(b.magicDamage) || 0;
      out.castSpeed += Number(b.castSpeed) || 0;
      out.visionReduce += Number(b.visionReduce) || 0;
      out.manacostIncrease += Number(b.manacostIncrease) || 0;
      out.intelligencePct += Number(b.intelligencePct) || 0;
      out.hpRegenReduce += Number(b.hpRegenReduce) || 0;
      out.manacostReduction += Number(b.manacostReduction) || 0;
      out.gpm += Number(b.gpm) || 0;
      out.xpm += Number(b.xpm) || 0;
      out.aspdPct += Number(b.aspdPct) || 0;
      out.manaReductionPct += Number(b.manaReductionPct) || 0;
      out.aspd += Number(b.aspd) || 0;
      { const _bms = (Number(b.ms) || 0) + (isRanged ? (Number(b.msRanged) || 0) : (Number(b.msMelee) || 0));
        if (it.isBoot) { if (_bms) out._msBootVals.push(_bms); } else out.ms += _bms; }
      out.range += Number(b.range) || 0;
      if (b.rangeUniqueAll) out._rangeUniqueAllVals.push(Number(b.rangeUniqueAll));
      if (b.rangeUniqueRanged) out._rangeUniqueRangedVals.push(Number(b.rangeUniqueRanged));
      if (isRanged) out.projSpeed += Number(b.projSpeed) || 0;
      if (!visionSeen.has(id)) { out.dvision += Number(b.dvision) || 0; out.nvision += Number(b.nvision) || 0; }
      if (it.modes) {
        const activeMode = mode || it.modes.default || 'damage';
        const _rawMb = it.modes[activeMode] || {};
        const mb = _entryScale !== 1 ? Object.fromEntries(Object.entries(_rawMb).map(([k,v]) => [k, typeof v === 'number' && k !== 'cooldownReduction' && k !== 'cdrUnique' ? v * _entryScale : v])) : _rawMb;
        const allAttrMode = Number(mb.all) || 0;
        out.str += (Number(mb.str) || 0) + allAttrMode;
        out.agi += (Number(mb.agi) || 0) + allAttrMode;
        out.int += (Number(mb.int) || 0) + allAttrMode;
        out.hp += Number(mb.hp) || 0;
        out.mp += Number(mb.mp) || 0;
        out.hpr += Number(mb.hpr) || 0;
        out.mpr += Number(mb.mpr) || 0;
        out.armor += Number(mb.armor) || 0;
        if (mb.mr) out.mrVals.push(Number(mb.mr) || 0);
        if (mb.evasion) out.evVals.push(Number(mb.evasion) || 0);
        if (mb.statusRes) out.statusResVals.push(Number(mb.statusRes) || 0);
        if (mb.slowRes) out.slowResVals.push(Number(mb.slowRes) || 0);
        out.spellAmp += Number(mb.spellAmp) || 0;
        out.damagePct += Number(mb.damagePct) || 0;
        if (mb.mprAmp) out._mprAmpVals.push(Number(mb.mprAmp) || 0);
        if (mb.msPct) out._msPctVals.push(Number(mb.msPct) || 0);
        out.hprPct += Number(mb.hprPct) || 0;
        out.missingHprPct += Number(mb.missingHprPct) || 0;
        out.damage += (Number(mb.damage) || 0) + (isRanged ? (Number(mb.damageRanged) || 0) : (Number(mb.damageMelee) || 0));
        out.aspd += Number(mb.aspd) || 0;
        { const _mms = (Number(mb.ms) || 0) + (isRanged ? (Number(mb.msRanged) || 0) : (Number(mb.msMelee) || 0));
          if (it.isBoot) { if (_mms) out._msBootVals.push(_mms); } else out.ms += _mms; }
        out.range += Number(mb.range) || 0;
        if (mb.rangeUniqueAll) out._rangeUniqueAllVals.push(Number(mb.rangeUniqueAll));
        if (mb.rangeUniqueRanged) out._rangeUniqueRangedVals.push(Number(mb.rangeUniqueRanged));
        if (isRanged) out.projSpeed += Number(mb.projSpeed) || 0;
        if (!visionSeen.has(id)) { out.dvision += Number(mb.dvision) || 0; out.nvision += Number(mb.nvision) || 0; }
        out.lifesteal += Number(mb.lifesteal) || 0;
        out.spellLifesteal += Number(mb.spellLifesteal) || 0;
        out.castRange += Number(mb.castRange) || 0;
        out.mpPct += Number(mb.mpPct) || 0;
        out.primaryStat += Number(mb.primaryStat) || 0;
        out.primaryStatUni += Number(mb.primaryStatUni) || 0;
        out.batReduce += Number(mb.batReduce) || 0;
        out.healthRestoration += Number(mb.healthRestoration) || 0;
        if (mb.cdrUnique) out._cdrUniqVals.push(Number(mb.cdrUnique));
        else if (mb.cooldownReduction) {
          out._cdrStackVals.push(Number(mb.cooldownReduction));
          if (_entryScale !== 1) { const _cb = Number(mb.cooldownReduction) * (_entryScale - 1); if (_cb > 0.001) out._cdrStackVals.push(_cb); }
        }
        out.debuffAmp += Number(mb.debuffAmp) || 0;
        out.hpPct += Number(mb.hpPct) || 0;
        out.knockbackResist += Number(mb.knockbackResist) || 0;
        out.maxHpRegen += Number(mb.maxHpRegen) || 0;
        out.incomingDamage += Number(mb.incomingDamage) || 0;
        out.magicDamage += Number(mb.magicDamage) || 0;
        out.castSpeed += Number(mb.castSpeed) || 0;
        out.visionReduce += Number(mb.visionReduce) || 0;
        out.manacostIncrease += Number(mb.manacostIncrease) || 0;
        out.intelligencePct += Number(mb.intelligencePct) || 0;
        out.hpRegenReduce += Number(mb.hpRegenReduce) || 0;
        out.manacostReduction += Number(mb.manacostReduction) || 0;
        out.gpm += Number(mb.gpm) || 0;
        out.xpm += Number(mb.xpm) || 0;
        out.aspdPct += Number(mb.aspdPct) || 0;
        out.manaReductionPct += Number(mb.manaReductionPct) || 0;
        out.cost += Number(mb.costOverride != null ? mb.costOverride : it.cost) || 0;
      } else {
        out.cost += Number(it.cost) || 0;
      }
      visionSeen.add(id);
    });
    out.mprAmp = out._mprAmpVals.length ? Math.max(...out._mprAmpVals) : 0;
    out.msPct = out._msPctVals.length ? Math.max(...out._msPctVals) : 0;
    out.ms += out._msBootVals.length ? Math.max(...out._msBootVals) : 0;
    { const _uniq = Math.min(out._cdrUniqVals.length ? Math.max(...out._cdrUniqVals) : 0, 99.9);
      let _mult = 1; for (const v of out._cdrStackVals) _mult *= (1 - v / 100);
      out.cooldownReduction = Math.min(Math.round((1 - (1 - _uniq / 100) * _mult) * 1000) / 10, 99.9); }
    const _allMax = out._rangeUniqueAllVals.length ? Math.max(...out._rangeUniqueAllVals) : 0;
    const _rangedMax = out._rangeUniqueRangedVals.length ? Math.max(...out._rangeUniqueRangedVals) : 0;
    out.range += isRanged ? Math.max(_allMax, _rangedMax) : _allMax;
    return out;
  }

  function calc(st, opts) {
    opts = opts || {};
    const s = st.hero.stats || {};
    const lvl = st.level;
    const plus = plus2At(lvl);
    const includeInnates = opts.includeInnates == null ? heroLabInnatesOn() : !!opts.includeInnates;
    const itemsTotal = itemTotals(st.itemEntries, st.hero.attackType, st.baubleLevel);
    const attr = s.attr;
    if (attr === 'uni') {
      const psu = itemsTotal.primaryStatUni;
      itemsTotal.str += psu; itemsTotal.agi += psu; itemsTotal.int += psu;
    } else {
      const ps = itemsTotal.primaryStat;
      if (attr === 'str') itemsTotal.str += ps;
      else if (attr === 'agi') itemsTotal.agi += ps;
      else if (attr === 'int') itemsTotal.int += ps;
    }
    const rawStr = (Number(s.str) || 0) + (lvl - 1) * (Number(s.strGain) || 0) + plus + itemsTotal.str;
    const rawAgi = (Number(s.agi) || 0) + (lvl - 1) * (Number(s.agiGain) || 0) + plus + itemsTotal.agi;
    const rawInt = st.hero.id === 'ogre_magi'
      ? 0
      : ((Number(s.int) || 0) + (lvl - 1) * (Number(s.intGain) || 0) + plus + itemsTotal.int) * (1 + itemsTotal.intelligencePct / 100);
    const rawAttrs = { str: rawStr, agi: rawAgi, int: rawInt };
    const liveAttrs = includeInnates ? {
      str: rawAttrs.str + axeStrBonus(s, rawAttrs, includeInnates),
      agi: rawAttrs.agi + drowAgiBonus(s, rawAttrs, lvl, includeInnates),
      int: rawAttrs.int,
    } : rawAttrs;
    const str = Math.floor(liveAttrs.str), agi = Math.floor(liveAttrs.agi), int = Math.floor(liveAttrs.int);
    const a = { str: liveAttrs.str, agi: liveAttrs.agi, int: liveAttrs.int };
    const isOgre = st.hero.id === 'ogre_magi';
    const isHuskar = st.hero.id === 'huskar';
    const mpFromAttr = isHuskar ? 0 : (isOgre ? str * 6 : int * C.mpInt);
    const mprFromAttr = isHuskar ? 0 : (isOgre ? str * 0.02 : int * C.mprInt);
    const baseMr = (Number(s.mr) || 25) + int * C.mrInt + heroLabInnate('mr', s, a, lvl, 0, includeInnates);
    let mr = Math.min(combinePct([baseMr, ...itemsTotal.mrVals]), 99.9);
    let evasion = Math.min(combinePct([heroLabInnate('evasion', s, a, lvl, 0, includeInnates), ...itemsTotal.evVals]), 99.9);
    const spellAmp = itemsTotal.spellAmp;
    let armor = (Number(s.armor) || 0) + agi * C.armorAgi + heroLabInnate('armor', s, a, lvl, 0, includeInnates) + itemsTotal.armor;
    let hp = Math.round(((Number(s.hp) || 120) + str * C.hpStr + itemsTotal.hp) * (1 + itemsTotal.hpPct / 100));
    let mp = isHuskar ? 0 : Math.round(((Number(s.mp) || 75) + mpFromAttr + itemsTotal.mp) * (1 + itemsTotal.mpPct / 100) * (1 - itemsTotal.manaReductionPct / 100));
    a._manaPool = mp;
    const statusRes = Math.min(combinePct([...itemsTotal.statusResVals, heroLabInnate('statusRes', s, a, lvl, hp, includeInnates)]), 99.9);
    const slowRes = Math.min(combinePct([...itemsTotal.slowResVals, heroLabInnate('slowRes', s, a, lvl, hp, includeInnates)]), 99.9);
    // missingHprPct (e.g. Heart of Tarrasque) requires knowing current HP at
    // runtime and is intentionally excluded from the static calc display.
    // It is shown as a separate stat row ("Missing HP Regen") instead.
    let hpr = ((Number(s.hpr) || 0) + str * C.hprStr + heroLabInnate('hpr', s, a, lvl, hp, includeInnates) + itemsTotal.hpr - itemsTotal.hpRegenReduce) * (1 + itemsTotal.healthRestoration / 100)
      + hp * (itemsTotal.hprPct + itemsTotal.maxHpRegen) / 100;
    let mpr = isHuskar ? 0 : ((Number(s.mpr) || 0) + mprFromAttr + heroLabInnate('mpr', s, a, lvl, hp, includeInnates) + itemsTotal.mpr) * (1 + itemsTotal.mprAmp / 100);
    if (st.custom.hp !== null) hp = Math.round(st.custom.hp);
    if (st.custom.mp !== null && !isHuskar) mp = Math.round(st.custom.mp);
    if (st.custom.hpr !== null) hpr = st.custom.hpr;
    if (st.custom.mpr !== null && !isHuskar) mpr = st.custom.mpr;
    if (st.custom.armor !== null) armor = st.custom.armor;
    if (st.custom.mr !== null) mr = st.custom.mr;
    if (st.custom.evasion !== null) evasion = st.custom.evasion;
    const primary = primaryDmg(s, { str, agi, int }, includeInnates);
    const dmgInnate = heroLabInnate('dmg', s, { str, agi, int }, lvl, hp, includeInnates);
    const whiteDmin = (Number(s.dmin) || 0) + primary + dmgInnate;
    const whiteDmax = (Number(s.dmax) || 0) + primary + dmgInnate;
    const dmin = whiteDmin + Math.floor(whiteDmin * itemsTotal.damagePct / 100) + itemsTotal.damage;
    const dmax = whiteDmax + Math.floor(whiteDmax * itemsTotal.damagePct / 100) + itemsTotal.damage;
    const dmg = (dmin + dmax) / 2;
    const aspdRaw = (Number(s.bas) || 100) + agi * C.asAgi + heroLabInnate('aspd', s, a, lvl, hp, includeInnates) + itemsTotal.aspd;
    const aspd = Math.min(Math.max(aspdRaw * (1 + itemsTotal.aspdPct / 100), 20), 700);
    const batBase = Number(s.bat) || 1.7;
    const bat = batBase * (1 - itemsTotal.batReduce / 100);
    const tHit = bat * 100 / Math.max(1, aspd);
    const msFlat = (Number(s.ms) || 0) + heroLabInnate('ms', s, a, lvl, hp, includeInnates);
    const msMax = s.slug === 'windrunner' ? 600 : 550;
    const ms = Math.min(Math.round((msFlat * dpWitchcraftMsMult(s, lvl, includeInnates) + itemsTotal.ms) * (1 + itemsTotal.msPct / 100)), msMax);
    const range = (Number(s.range) || 0) + heroLabInnate('range', s, a, lvl, hp, includeInnates) + itemsTotal.range;
    const proj = (Number(s.proj) || 0) + itemsTotal.projSpeed;
    const dvision = Math.round(((Number(s.dvision) || 0) + itemsTotal.dvision) * (1 - itemsTotal.visionReduce / 100));
    const nvision = Math.round(((Number(s.nvision) || 0) + itemsTotal.nvision + heroLabInnate('nvision', s, a, lvl, hp, includeInnates)) * (1 - itemsTotal.visionReduce / 100));
    const armorPct = armorFactor(armor) * 100;
    const manaShield = manaShieldEhp(s, mp, lvl, includeInnates);
    const ehpPhys = hp / Math.max(0.01, 1 - armorFactor(armor)) + manaShield;
    const ehpMag = hp / Math.max(0.01, 1 - mr / 100) + manaShield;
    const lifesteal = itemsTotal.lifesteal;
    const spellLifesteal = itemsTotal.spellLifesteal;
    const castRange = itemsTotal.castRange;
    const cooldownReduction = itemsTotal.cooldownReduction || 0;
    const innateItemCdr = heroLabInnate('itemCdr', s, { str, agi, int }, lvl, hp, includeInnates);
    const itemCdr = innateItemCdr > 0
      ? Math.min(Math.round((1 - (1 - innateItemCdr / 100) * (1 - cooldownReduction / 100)) * 1000) / 10, 99.9)
      : 0;
    const dps = tHit > 0 ? dmg / tHit : 0;
    const healthRestoration = itemsTotal.healthRestoration;
    return { hp, mp, hpr, mpr, str, agi, int, armor, armorPct, mr, evasion, statusRes, slowRes, spellAmp, dmg, dmin, dmax, whiteDmin, whiteDmax, aspd, tHit, ms, range, proj, dvision, nvision, ehpPhys, ehpMag, lifesteal, spellLifesteal, castRange, cooldownReduction, itemCdr, healthRestoration, dps, cost: itemsTotal.cost };
  }

  function renderHeroHud(panel, st, vals) {
    const hero = st.hero;
    const portrait = panel.querySelector('.hl-hero-icon');
    const innateChip = panel.querySelector('[data-innate-chip]');
    const innateIcon = panel.querySelector('[data-innate-icon]');
    const hpValue = panel.querySelector('[data-bar-value="hp"]');
    const hpRegen = panel.querySelector('[data-bar-regen="hpr"]');
    const mpValue = panel.querySelector('[data-bar-value="mp"]');
    const mpRegen = panel.querySelector('[data-bar-regen="mpr"]');
    const dpsEl = panel.querySelector('[data-dps-value]');
    const pehpEl = panel.querySelector('[data-pehp-value]');
    const mehpEl = panel.querySelector('[data-mehp-value]');
    const dmgGoldEl = panel.querySelector('[data-dmggold-value]');
    if (portrait) { portrait.src = hero.icon; portrait.alt = hero.name; }
    const innateToggle = document.querySelector('[data-innates-toggle]');
    const innatesOn = innateToggle ? innateToggle.checked : true;
    const statInnate = hero.statInnate || null;
    const showInnate = !!(innatesOn && statInnate && statInnate.icon && statInnate.name);
    if (innateChip && innateIcon) {
      innateChip.classList.toggle('is-hidden', !showInnate);
      innateChip.tabIndex = showInnate ? 0 : -1;
      if (showInnate) {
        innateIcon.src = 'icons/misc/innate_icon.png';
        innateIcon.alt = statInnate.name;
      } else {
      }
    }
    const stBase = { hero: hero || { stats: {}, id: '' }, level: st ? st.level : 1, itemEntries: [], custom: { hp: null, mp: null, hpr: null, mpr: null, armor: null, mr: null, evasion: null } };
    const base = calc(stBase, { includeInnates: false });
    const hpBonus = vals.hp - base.hp;
    const mpBonus = vals.mp - base.mp;
    if (hpValue) hpValue.textContent = hpBonus > 0 ? `${fmt(vals.hp)} (+${fmt(hpBonus)})` : `${fmt(vals.hp)}`;
    if (hpRegen) hpRegen.textContent = `${vals.hpr >= 0 ? '+' : ''}${quickFmt(vals.hpr)}`;
    if (mpValue) mpValue.textContent = mpBonus > 0 ? `${fmt(vals.mp)} (+${fmt(mpBonus)})` : `${fmt(vals.mp)}`;
    if (mpRegen) mpRegen.textContent = `${vals.mpr >= 0 ? '+' : ''}${quickFmt(vals.mpr)}`;
    if (dpsEl) dpsEl.textContent = vals.dps.toFixed(1);
    if (pehpEl) pehpEl.textContent = fmt(Math.round(vals.ehpPhys));
    if (mehpEl) mehpEl.textContent = fmt(Math.round(vals.ehpMag));
    const bonusDps = vals.dps - base.dps;
    if (dmgGoldEl) dmgGoldEl.textContent = bonusDps > 0.01 ? fmt(Math.round(vals.cost / bonusDps)) : '—';
    var costBadge = panel.querySelector('[data-cost-badge]');
    var costValue = panel.querySelector('[data-cost-value]');
    if (costBadge && costValue) {
      var hasCost = !!vals.cost;
      costBadge.classList.toggle('is-empty', !hasCost);
      costValue.textContent = hasCost ? fmt(vals.cost) : '0';
    }

    const slots = safeJsonParse(panel.dataset.items, ["","","","","",""]);
    const itemModes = safeJsonParse(panel.dataset.itemModes, {});
    panel.querySelectorAll('.hl-inv-slot').forEach((slotEl, idx) => {
      const isEnchant = slotEl.dataset.slot === 'enchant';
      const itemId = isEnchant
        ? (panel.dataset.enchantItem || '')
        : (slots[idx] || '');
      const item = byItem.get(itemId);
      const modeKey = item && item.modes ? (itemModes[String(slotEl.dataset.slot)] || item.modes.default || 'damage') : '';
      const visual = item ? itemVisual(item, modeKey) : null;
      slotEl.dataset.itemId = itemId;
      slotEl.classList.toggle('is-empty', !item);
      slotEl.draggable = !!item;
      if (item && item.modes) {
        slotEl.dataset.itemMode = modeKey;
        const accent = itemModeAccent(item, modeKey);
        if (accent) slotEl.dataset.modeAccent = accent;
        else delete slotEl.dataset.modeAccent;
      } else {
        delete slotEl.dataset.itemMode;
        delete slotEl.dataset.modeAccent;
      }
      slotEl.innerHTML = item
        ? `<img src="${visual.icon}" alt="${item.name}" loading="lazy"><span class="hl-slot-bevel"></span><span class="hl-slot-glow"></span>${item && item.modes && !item.tiersAvailable ? `<button type="button" class="hl-slot-mode" data-cycle-item-mode aria-label="Cycle item mode">${itemModeBadge(item, slotEl.dataset.itemMode)}</button>` : ''}<button type="button" class="hl-slot-clear" data-clear-slot aria-label="Remove item">x</button>`
        : `${isEnchant ? '<span class="hl-enchant-mark">E</span>' : ''}<span class="hl-slot-bevel"></span><span class="hl-slot-glow"></span>`;
      slotEl.removeAttribute('title');
      slotEl.classList.remove('hl-slot-drop-target');
    });
  }

  function renderTotals(panel, vals, st) {
    const list = panel.querySelector('[data-total-list]');
    if (!list) return;
    const hero = st ? st.hero : null;
    const s = (hero && hero.stats) ? hero.stats : {};
    // Compute base (no items, no custom overrides) for bonus display
    const stBase = { hero: hero || { stats: {}, id: '' }, level: st ? st.level : 1, itemEntries: [], custom: { hp: null, mp: null, hpr: null, mpr: null, armor: null, mr: null, evasion: null } };
    const base = calc(stBase, { includeInnates: false });
    const attr = s.attr || 'str';
    const strGain = Number(s.strGain) || 0;
    const agiGain = Number(s.agiGain) || 0;
    const intGain = Number(s.intGain) || 0;
    const ATTR_ICONS = {
      str: 'icons/attributes/strength.png',
      agi: 'icons/attributes/agility.png',
      int: 'icons/attributes/intelligence.png',
      uni: 'icons/attributes/universal.png',
    };
    const ATTR_COLORS = {
      str: '#ec3d06',
      agi: '#3ed038',
      int: '#00d9ec',
      uni: '#d9ec00',
    };
    const ATTR_BG = {
      str: 'linear-gradient(to right, #380f01, #000)',
      agi: 'linear-gradient(to right, #09360b, #000)',
      int: 'linear-gradient(to right, #003237, #000)',
      uni: 'linear-gradient(to right, #323700, #000)',
    };
    const fmtStat = v => {
      const n = Number(v) || 0;
      if (Number.isInteger(n)) return String(n);
      return n.toFixed(1).replace(/\.0$/, '');
    };
    const fmtGain = v => {
      const n = Number(v) || 0;
      if (Number.isInteger(n)) return String(n);
      return n.toFixed(2).replace(/\.?0+$/, '');
    };
    const fmtPct = v => (Number(v) || 0).toFixed(1) + '%';
    const mergePositive = heroLabMergePositiveOn();

    // Build bonus HTML: green +N or red −N; returns '' for zero bonus
    const bonusHtml = (delta, fmtFn) => {
      const n = Number(delta) || 0;
      if (Math.abs(n) < 0.0001) return '';
      const sign = n > 0 ? '+' : '−'; // + or −
      const cls = n > 0 ? 'hl-ds-bon-pos' : 'hl-ds-bon-neg';
      return `<span class="${cls}">${sign}${fmtFn(Math.abs(n))}</span>`;
    };
    const bonusInt = delta => bonusHtml(delta, v => String(Math.round(v)));
    const bonusDec1 = delta => bonusHtml(delta, v => v.toFixed(1));
    const bonusDec2 = delta => bonusHtml(delta, v => v.toFixed(2));
    const bonusPct1 = delta => bonusHtml(delta, v => v.toFixed(1) + '%');
    const mergeDisplay = (baseVal, finalVal, delta, fmtBase, isBenefitPositive = true) => {
      const beneficial = isBenefitPositive ? delta > 0.0001 : delta < -0.0001;
      return mergePositive && beneficial ? fmtBase(finalVal) : fmtBase(baseVal);
    };

    const statRow = (label, baseStr, bonStr) => {
      const bon = bonStr || '';
      return `<div class="hl-ds-row"><span class="hl-ds-name">${label}</span><span class="hl-ds-val">${baseStr}${bon ? ' ' + bon : ''}</span></div>`;
    };

    // ATTACK panel rows (base + bonus)
    const aspdBonus = bonusInt(vals.aspd - base.aspd);
    const tHitBase = Number(base.tHit || 0).toFixed(2);
    const tHitFinal = Number(vals.tHit || 0).toFixed(2);
    const tHitDiff = vals.tHit - base.tHit;
    const tHitBon = Math.abs(tHitDiff) >= 0.005
      ? `<span class="${tHitDiff < 0 ? 'hl-ds-bon-pos' : 'hl-ds-bon-neg'}">${tHitDiff < 0 ? '-' : '+'}${Math.abs(tHitDiff).toFixed(2)}s</span>`
      : '';
    const dmgBonusAmt = attr === 'uni'
      ? vals.dmin - vals.whiteDmin
      : vals.dmin - base.dmin;
    const dmgBonus = bonusInt(dmgBonusAmt);
    const rangeBonus = bonusInt(vals.range - base.range);
    const msBonus = bonusInt(vals.ms - base.ms);
    const mprBonus = bonusDec2(vals.mpr - base.mpr);
    const spellAmpBonus = bonusPct1(vals.spellAmp - base.spellAmp);

    const lifestealBonus = bonusPct1(vals.lifesteal - base.lifesteal);
    const spellLifestealBonus = bonusPct1(vals.spellLifesteal - base.spellLifesteal);
    const attackRows = [
      statRow('Damage', `${mergeDisplay(attr === 'uni' ? vals.whiteDmin : base.dmin, vals.dmin, dmgBonusAmt, fmt)} - ${mergeDisplay(attr === 'uni' ? vals.whiteDmax : base.dmax, vals.dmax, dmgBonusAmt, fmt)}`, mergePositive && dmgBonusAmt > 0 ? '' : dmgBonus),
      statRow('Attack Speed', mergeDisplay(base.aspd, vals.aspd, vals.aspd - base.aspd, fmt), mergePositive && (vals.aspd - base.aspd) > 0 ? '' : aspdBonus),
      statRow('Attack Interval', `${mergeDisplay(base.tHit, vals.tHit, tHitDiff, v => Number(v || 0).toFixed(2) + 's', false)}`, mergePositive && tHitDiff < 0 ? '' : tHitBon),
      statRow('Attack Range', mergeDisplay(base.range, vals.range, vals.range - base.range, fmt), mergePositive && (vals.range - base.range) > 0 ? '' : rangeBonus),
      statRow('Projectile', mergeDisplay(base.proj || 0, vals.proj || 0, (vals.proj || 0) - (base.proj || 0), fmt), mergePositive && ((vals.proj || 0) - (base.proj || 0)) > 0 ? '' : bonusInt((vals.proj || 0) - (base.proj || 0))),
      statRow('Cast Range', mergeDisplay(base.castRange || 0, vals.castRange || 0, (vals.castRange || 0) - (base.castRange || 0), fmt), mergePositive && ((vals.castRange || 0) - (base.castRange || 0)) > 0 ? '' : bonusInt(vals.castRange - base.castRange)),
      statRow('Move Speed', mergeDisplay(base.ms, vals.ms, vals.ms - base.ms, fmt), mergePositive && (vals.ms - base.ms) > 0 ? '' : msBonus),
      statRow('Spell Amp', mergeDisplay(base.spellAmp, vals.spellAmp, vals.spellAmp - base.spellAmp, fmtPct), mergePositive && (vals.spellAmp - base.spellAmp) > 0 ? '' : spellAmpBonus),
      statRow('Lifesteal', mergeDisplay(base.lifesteal, vals.lifesteal, vals.lifesteal - base.lifesteal, fmtPct), mergePositive && (vals.lifesteal - base.lifesteal) > 0 ? '' : lifestealBonus),
      statRow('Spell Lifesteal', mergeDisplay(base.spellLifesteal, vals.spellLifesteal, vals.spellLifesteal - base.spellLifesteal, fmtPct), mergePositive && (vals.spellLifesteal - base.spellLifesteal) > 0 ? '' : spellLifestealBonus),
      statRow('Mana Regen', mergeDisplay(base.mpr, vals.mpr, vals.mpr - base.mpr, v => Number(v || 0).toFixed(2)), mergePositive && (vals.mpr - base.mpr) > 0 ? '' : mprBonus),
    ].join('');

    // DEFENSE panel rows (base + bonus)
    const armorBonus = bonusDec1(vals.armor - base.armor);
    const armorPctBonus = bonusPct1(vals.armorPct - base.armorPct);
    const mrBonus = bonusPct1(vals.mr - base.mr);
    const evasionBonus = bonusPct1(vals.evasion - base.evasion);
    const hprBonus = bonusDec2(vals.hpr - base.hpr);
    const statusResBonus = bonusPct1(vals.statusRes - base.statusRes);
    const slowResBonus = bonusPct1(vals.slowRes - base.slowRes);

    const defenseRows = [
      statRow('Armor', mergeDisplay(base.armor, vals.armor, vals.armor - base.armor, fmtStat), mergePositive && (vals.armor - base.armor) > 0 ? '' : armorBonus),
      statRow('Physical Resist', mergeDisplay(base.armorPct, vals.armorPct, vals.armorPct - base.armorPct, fmtPct), mergePositive && (vals.armorPct - base.armorPct) > 0 ? '' : armorPctBonus),
      statRow('Magic Resist', mergeDisplay(base.mr, vals.mr, vals.mr - base.mr, fmtPct), mergePositive && (vals.mr - base.mr) > 0 ? '' : mrBonus),
      statRow('Status Resist', mergeDisplay(base.statusRes, vals.statusRes, vals.statusRes - base.statusRes, fmtPct), mergePositive && (vals.statusRes - base.statusRes) > 0 ? '' : statusResBonus),
      statRow('Slow Resist', mergeDisplay(base.slowRes, vals.slowRes, vals.slowRes - base.slowRes, fmtPct), mergePositive && (vals.slowRes - base.slowRes) > 0 ? '' : slowResBonus),
      statRow('Evasion', mergeDisplay(base.evasion, vals.evasion, vals.evasion - base.evasion, fmtPct), mergePositive && (vals.evasion - base.evasion) > 0 ? '' : evasionBonus),
      statRow('Health Regen', mergeDisplay(base.hpr, vals.hpr, vals.hpr - base.hpr, v => Number(v || 0).toFixed(2)), mergePositive && (vals.hpr - base.hpr) > 0 ? '' : hprBonus),
      statRow('Health Restoration', mergeDisplay(base.healthRestoration || 0, vals.healthRestoration || 0, (vals.healthRestoration || 0) - (base.healthRestoration || 0), fmtPct), mergePositive && ((vals.healthRestoration || 0) - (base.healthRestoration || 0)) > 0 ? '' : bonusPct1((vals.healthRestoration || 0) - (base.healthRestoration || 0))),
      statRow('Day Vision', mergeDisplay(base.dvision || 0, vals.dvision || 0, (vals.dvision || 0) - (base.dvision || 0), fmt), mergePositive && ((vals.dvision || 0) - (base.dvision || 0)) > 0 ? '' : bonusInt(vals.dvision - base.dvision)),
      statRow('Night Vision', mergeDisplay(base.nvision || 0, vals.nvision || 0, (vals.nvision || 0) - (base.nvision || 0), fmt), mergePositive && ((vals.nvision || 0) - (base.nvision || 0)) > 0 ? '' : bonusInt(vals.nvision - base.nvision)),
      statRow('Cooldown Reduction', mergeDisplay(base.cooldownReduction || 0, vals.cooldownReduction || 0, (vals.cooldownReduction || 0) - (base.cooldownReduction || 0), fmtPct), mergePositive && ((vals.cooldownReduction || 0) - (base.cooldownReduction || 0)) > 0 ? '' : bonusPct1((vals.cooldownReduction || 0) - (base.cooldownReduction || 0))),
      (vals.itemCdr || base.itemCdr) ? statRow('Item CDR', mergeDisplay(base.itemCdr || 0, vals.itemCdr || 0, (vals.itemCdr || 0) - (base.itemCdr || 0), fmtPct), mergePositive && ((vals.itemCdr || 0) - (base.itemCdr || 0)) > 0 ? '' : bonusPct1((vals.itemCdr || 0) - (base.itemCdr || 0))) : '',
    ].join('');

    // Attribute rows builder — shows base attr + item bonus on the number
    const attrRow = (key, baseAttr, totalAttr, gainVal, bonusLine, detailLine, isPrimary) => {
      const icon = ATTR_ICONS[key] || ATTR_ICONS.str;
      const color = ATTR_COLORS[key];
      const bg = isPrimary ? `style="background:${ATTR_BG[key]};margin-left:0"` : '';
      const attrDelta = totalAttr - baseAttr;
      const attrBon = mergePositive && attrDelta > 0 ? '' : bonusInt(attrDelta);
      const shownBase = mergePositive && attrDelta > 0 ? totalAttr : baseAttr;
      const primaryBonus = isPrimary
        ? `<div class="hl-da-primary" style="color:${color}">${bonusLine}</div>`
        : '';
      return `
        <div class="hl-da-row${isPrimary ? ' hl-da-primary-row' : ''}" ${bg}>
          <img class="hl-da-icon" src="${icon}" alt="${key}" loading="lazy">
          <div class="hl-da-details">
            <div class="hl-da-top">
              <span class="hl-da-base">${fmt(shownBase)}${attrBon ? ' ' + attrBon : ''}</span>
              <span class="hl-da-gain">(Gains ${fmtGain(gainVal)} per lvl)</span>
            </div>
            ${primaryBonus}
            <div class="hl-da-breakdown">${detailLine}</div>
          </div>
        </div>`;
    };

    // Compute primary damage bonus text (using final vals for display)
    let primaryDmgStr, primaryDmgAgi, primaryDmgInt, primaryDmgUni;
    if (attr === 'str') {
      primaryDmgStr = `= ${fmt(vals.str)} Damage (Primary Role Bonus)`;
    } else if (attr === 'agi') {
      primaryDmgAgi = `= ${fmt(vals.agi)} Damage (Primary Role Bonus)`;
    } else if (attr === 'int') {
      primaryDmgInt = `= ${fmt(vals.int)} Damage (Primary Role Bonus)`;
    } else if (attr === 'uni') {
      const uniTotal = vals.str + vals.agi + vals.int;
      primaryDmgUni = `= ${fmt(Math.floor(uniTotal * C.uniDmg))} Damage (Primary Role Bonus)`;
    }

    const strDetail = `= ${fmt(vals.str * C.hpStr)} HP and ${Number(vals.str * C.hprStr).toFixed(2)} HP Regen`;
    const agiDetail = `= ${Number(vals.agi * C.armorAgi).toFixed(2)} Armor and ${fmt(vals.agi * C.asAgi)} Attack Speed`;
    const mrFromInt = Number(vals.int * C.mrInt).toFixed(1);
    const intDetail = `= ${fmt(vals.int * C.mpInt)} Mana, ${Number(vals.int * C.mprInt).toFixed(2)} Mana Regen and ${mrFromInt}% Base Magic Resistance`;

    const plus2 = plus2At(st.level);
    const strRow = attrRow('str', base.str - plus2, vals.str, strGain, primaryDmgStr, strDetail, attr === 'str');
    const agiRow = attrRow('agi', base.agi - plus2, vals.agi, agiGain, primaryDmgAgi, agiDetail, attr === 'agi');
    const intRow = attrRow('int', base.int - plus2, vals.int, intGain, primaryDmgInt, intDetail, attr === 'int');
    let uniRow = '';
    if (attr === 'uni') {
      const uniBase = base.str + base.agi + base.int;
      const uniTotal = vals.str + vals.agi + vals.int;
      const uniDelta = uniTotal - uniBase;
      const uniBon = mergePositive && uniDelta > 0 ? '' : bonusInt(uniDelta);
      const uniShown = mergePositive && uniDelta > 0 ? uniTotal : uniBase;
      let uniDmgGain = (strGain + agiGain + intGain) * C.uniDmg;
      const innateToggle = document.querySelector('[data-innates-toggle]');
      const hlInnatesOn = innateToggle ? innateToggle.checked : true;
      if (s.slug === 'void_spirit' && hlInnatesOn) uniDmgGain *= 1.15;
      const uniGainStr = uniDmgGain.toFixed(1).replace(/\.0$/, '');
      uniRow = `
        <div class="hl-da-row hl-da-primary-row" style="background:${ATTR_BG.uni};margin-left:0">
          <img class="hl-da-icon" src="${ATTR_ICONS.uni}" alt="uni" loading="lazy">
          <div class="hl-da-details">
            <div class="hl-da-top">
              <span class="hl-da-base">${fmt(uniShown)}${uniBon ? ' ' + uniBon : ''}</span>
              <span class="hl-da-gain">(Gains ${uniGainStr} damage per lvl)</span>
            </div>
            <div class="hl-da-primary" style="color:${ATTR_COLORS.uni}">${primaryDmgUni}</div>
          </div>
        </div>`;
    }

    list.innerHTML = `
      <div class="hl-dota-stats">
        <div class="hl-dota-combat">
          <section class="hl-dota-stat-panel hl-dota-attack">
            <h3 class="hl-ds-head">ATTACK</h3>
            ${attackRows}
          </section>
          <section class="hl-dota-stat-panel hl-dota-defense">
            <h3 class="hl-ds-head">DEFENSE</h3>
            ${defenseRows}
          </section>
        </div>
        <div class="hl-dota-attributes">
          ${strRow}
          ${agiRow}
          ${intRow}
          ${uniRow}
        </div>
      </div>
    `;
  }

  function heroPickerMarkup(selectedId) {
    return `
      <div class="hl-picker-card hl-hero-picker-card" role="dialog" aria-modal="true" aria-label="Choose hero">
        <div class="hl-picker-head">
          <strong>Choose Hero</strong>
          <button type="button" class="hl-picker-close" data-picker-close aria-label="Close">x</button>
        </div>
        <div class="hl-picker-searchbar">
          <input type="text" class="hl-picker-search" data-hero-search placeholder="Search hero..." aria-label="Search hero" autocomplete="off">
        </div>
        <div class="hl-hero-grid-wrap">
          ${['str', 'agi', 'int', 'uni'].map(key => `
            <section class="hl-hero-group hl-hero-group-${key}">
              <header>
                ${iconHtml(ATTR_META[key].icon, ATTR_META[key].label, 'hl-hero-group-icon')}
                <span>${ATTR_META[key].label}</span>
              </header>
              <div class="hl-hero-grid">
                ${heroGroups[key].map(hero => `
                  <button type="button" class="hl-hero-tile${hero.id === selectedId ? ' is-selected' : ''}" data-hero-id="${hero.id}" aria-label="${hero.name}">
                    <img src="${hero.icon}" alt="${hero.name}" loading="lazy">
                  </button>`).join('')}
              </div>
            </section>`).join('')}
        </div>
      </div>
    `;
  }

  function itemSectionMarkup(title, list, selectedId) {
    if (!list.length) return '';
    return `
      <section class="hl-item-section">
        <header>${title}</header>
        <div class="hl-item-grid">
          ${list.map(item => `
            <button type="button" class="hl-item-tile${item.id === selectedId ? ' is-selected' : ''}" data-item-id="${item.id}" aria-label="${item.name}">
              <img src="${item.icon}" alt="${item.name}" loading="lazy">
            </button>`).join('')}
        </div>
      </section>
    `;
  }

  function neutralSectionMarkup(tier, list, selectedId) {
    if (!list.length) return '';
    return `
      <section class="hl-item-section hl-tier-section">
        <header>${tierHead(tier)}</header>
        <div class="hl-item-grid">
          ${list.map(item => `
            <button type="button" class="hl-item-tile${item.id === selectedId ? ' is-selected' : ''}" data-item-id="${item.id}" aria-label="${item.name}">
              <img src="${item.icon}" alt="${item.name}" loading="lazy">
            </button>`).join('')}
        </div>
      </section>
    `;
  }

  function itemPickerMarkup(selectedId, tab, mode, heroAttr, baubleActive) {
    const enchantOnly = mode === 'enchant';
    if (enchantOnly) {
      return `
        <div class="hl-picker-card hl-item-picker-card hl-enchant-picker" role="dialog" aria-modal="true" aria-label="Choose enchantment">
          <div class="hl-picker-head">
            <strong>Enchantments</strong>
            <div class="hl-picker-actions">
              <button type="button" class="hl-picker-close" data-picker-close aria-label="Close"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
            </div>
          </div>
          <div class="hl-shop-body hl-enchant-body">
            <div class="hl-item-grid">
              ${filteredEnchants(heroAttr).map(item => {
                var isT5 = item.tiersAvailable && item.tiersAvailable.indexOf(5) >= 0;
                var dimmed = baubleActive && !isT5;
                return `<button type="button" class="hl-item-tile${item.id === selectedId ? ' is-selected' : ''}${dimmed ? ' hl-enchant-bauble-dim' : ''}" data-item-id="${item.id}" aria-label="${item.name}"${dimmed ? ' title="Enchanter\'s Bauble only works with Tier 5 enchants"' : ''}>
                  <img src="${item.icon}" alt="${item.name}" loading="lazy">
                </button>`;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }
    var curTab = tab || 'basics';
    return `
      <div class="hl-picker-card hl-item-picker-card" role="dialog" aria-modal="true" aria-label="Choose item">
        <div class="hl-picker-head">
          <strong>Shop</strong>
          <div class="hl-picker-actions">
            <button type="button" class="hl-picker-close" data-picker-close aria-label="Close"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
          </div>
        </div>
        <div class="hl-shop-body hl-shop-4col">
          <div class="hl-shop-col">
            ${['Consumables','Equipment','Secret Shop'].map(function(n){ var p=itemGroups.basics.find(function(x){return x[0]===n}); return p?itemSectionMarkup(p[0],p[1],selectedId):''; }).join('')}
          </div>
          <div class="hl-shop-col">
            ${['Attributes','Miscellaneous'].map(function(n){ var p=itemGroups.basics.find(function(x){return x[0]===n}); return p?itemSectionMarkup(p[0],p[1],selectedId):''; }).join('')}
          </div>
          <div class="hl-shop-col">
            ${['Accessories','Magical','Weapons'].map(function(n){ var p=itemGroups.upgrades.find(function(x){return x[0]===n}); return p?itemSectionMarkup(p[0],p[1],selectedId):''; }).join('')}
          </div>
          <div class="hl-shop-col">
            ${['Support','Armor','Armaments'].map(function(n){ var p=itemGroups.upgrades.find(function(x){return x[0]===n}); return p?itemSectionMarkup(p[0],p[1],selectedId):''; }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function closePicker() {
    activePicker = null;
    overlay.hidden = true;
    overlay.classList.remove('is-open');
    hideTooltip();
  }

  function openHeroPicker(panel) {
    activePicker = { kind: 'hero', panel };
    _itemPickerCacheKey = null;
    overlay.innerHTML = heroPickerMarkup(panel.dataset.hero || heroes[0].id);
    overlay.hidden = false;
    overlay.classList.add('is-open');
    const input = overlay.querySelector('[data-hero-search]');
    if (input) input.focus();
  }

  function showEnchantTierPicker(panel, item) {
    hideTooltip();
    const tiers = item.tiersAvailable;
    const bonusLines = tiers.map(t => {
      const mode = item.modes ? item.modes['t' + t] : null;
      if (!mode) return '';
      return Object.entries(mode).filter(([k,v]) => k !== 'level' && Math.abs(v) > 0.001)
        .map(([k,v]) => `${BONUS_LABELS[k] || k}: ${BONUS_PCT.has(k) ? fmtNum(v) + '%' : fmtNum(v)}`).join(', ');
    });
    _itemPickerCacheKey = null;
    overlay.innerHTML = `
      <div class="hl-picker-card hl-tier-picker" role="dialog" aria-modal="true">
        <div class="hl-picker-head">
          <button type="button" class="hl-picker-back" data-picker-back aria-label="Back"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><polyline points="9,2 4,7 9,12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <img src="${item.icon}" style="width:28px;height:28px;border-radius:3px;margin-right:6px">
          <strong>${item.name}</strong>
          <div class="hl-picker-actions">
            <button type="button" class="hl-picker-close" data-picker-close aria-label="Close"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
          </div>
        </div>
        <div class="hl-tier-list">
          ${tiers.map((t, i) => `<button type="button" class="hl-tier-option" data-item-id="${item.id}" data-enchant-tier="${t}">
            <span class="hl-tier-label">Tier ${t}</span>
            <span class="hl-tier-stats">${bonusLines[i] || '—'}</span>
          </button>`).join('')}
        </div>
      </div>`;
  }

  var _itemPickerCacheKey = null;

  function openItemPicker(panel, slot) {
    const itemsState = safeJsonParse(panel.dataset.items, ["","","","","",""]);
    const mode = slot === 'enchant' ? 'enchant' : 'normal';
    const heroId = panel.dataset.hero || '';
    const heroObj = byHero.get(heroId);
    const heroAttr = heroObj ? (heroObj.stats || {}).attr : null;
    const bl = Math.max(0, Math.min(100, parseInt((panel.querySelector('[data-field="bauble-level"]') || {}).value || '0', 10) || 0));
    const baubleActive = bl > 0;
    activePicker = { kind: 'item', panel, slot, mode, tab: 'basics', heroAttr, baubleActive };
    const selectedId = mode === 'enchant'
      ? (panel.dataset.enchantItem || '')
      : (itemsState[slot] || '');
    const cacheKey = mode + '|' + heroAttr + '|' + baubleActive;
    if (_itemPickerCacheKey !== cacheKey) {
      overlay.innerHTML = itemPickerMarkup(selectedId, null, mode, heroAttr, baubleActive);
      _itemPickerCacheKey = cacheKey;
    } else {
      overlay.querySelectorAll('.hl-item-slot.is-selected').forEach(el => el.classList.remove('is-selected'));
      if (selectedId) {
        const sel = overlay.querySelector(`.hl-item-slot[data-id="${selectedId}"]`);
        if (sel) sel.classList.add('is-selected');
      }
    }
    overlay.hidden = false;
    overlay.classList.add('is-open');
  }



  function update() {
    const panels = [...root.querySelectorAll('.hl-panel')];
    panels.forEach(p => updateLevelRing(p));
    const aState = state(panels[0]);
    const bState = state(panels[1]);
    const a = calc(aState);
    const b = calc(bState);
    panels[0].dataset.cdr = String(a.cooldownReduction || 0);
    panels[1].dataset.cdr = String(b.cooldownReduction || 0);
    panels.forEach(panel => {
      var _modes = {};
      _modes = safeJsonParse(panel.dataset.itemModes, {});
      var _enchantMode = _modes.enchant || null;
      var _enchantId = panel.dataset.enchantItem || '';
      var _bl = Math.max(0, Math.min(100, parseInt((panel.querySelector('[data-field="bauble-level"]') || {}).value || '0', 10) || 0));
      var _baubleActive = _bl > 0;
      var _enchantIsT5 = _enchantMode === 't5';
      var _enchantSlot = panel.querySelector('[data-slot="enchant"]');
      // Enchant slot: dimmed when bauble>0 and enchant equipped but not t5
      if (_enchantSlot) _enchantSlot.classList.toggle('hl-enchant-bauble-mismatch', _baubleActive && !!_enchantId && !_enchantIsT5);
      // Bauble slot: never disabled by itself — remove old class if present
      var _bSlot = panel.querySelector('.hl-bauble-slot');
      if (_bSlot) _bSlot.classList.remove('hl-bauble-disabled');
    });
    renderHeroHud(panels[0], aState, a);
    renderHeroHud(panels[1], bState, b);
    renderTotals(panels[0], a, aState);
    renderTotals(panels[1], b, bState);
    const diff = document.getElementById('hl-diff-list');
    const diffPctOn = heroLabDiffPercentOn();
    diff.innerHTML = METRICS.map(([key, label]) => {
      const leftVal = Number(a[key] || 0);
      const rightVal = Number(b[key] || 0);
      const rawDelta = leftVal - rightVal;
      const delta = key === 'tHit' ? -rawDelta : rawDelta;
      const avgMag = (Math.abs(leftVal) + Math.abs(rightVal)) / 2;
      const pctAbs = avgMag < 0.0001 ? (Math.abs(leftVal - rightVal) < 0.0001 ? 0 : 200) : (Math.abs(leftVal - rightVal) / avgMag) * 100;
      const diffValue = diffPctOn ? (delta === 0 ? 0 : (delta > 0 ? pctAbs : -pctAbs)) : delta;
      const cls = delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'zero';
      const side = delta > 0 ? 'left' : delta < 0 ? 'right' : 'none';
      return `<div class="hl-diff-row ${cls}" data-adv="${side}" data-diff-key="${key}"
        <strong class="hl-diff-side hl-diff-left">${fmtMetric(key, leftVal)}</strong>
        <span class="hl-diff-center">
          <span class="hl-diff-label">${label}</span>
          <strong class="hl-diff-mid ${cls}">${diffPctOn ? fmt(diffValue, 1) + '%' : fmtDiffMetric(key, diffValue)}</strong>
        </span>
        <strong class="hl-diff-side hl-diff-right">${fmtMetric(key, rightVal)}</strong>
      </div>`;
    }).join('');
    applyDiffCatFilter();
  }
  function applyDiffCatFilter() {
    const menu = document.querySelector('.hd-dd-menu[data-dd="diffstat"]');
    if (!menu) return;
    const checked = new Set([...menu.querySelectorAll('input[data-diffstat]:checked')].map(i => i.dataset.diffstat));
    document.querySelectorAll('#hl-diff-list .hl-diff-row').forEach(row => {
      row.classList.toggle('diff-cat-hidden', !checked.has(row.dataset.diffKey));
    });
  }

  const panels = [...root.querySelectorAll('.hl-panel')];
  const presetParams = new URLSearchParams(window.location.search);
  const presetHero = presetParams.get('hero') || '';
  renderPanel(panels[0], 'a', byHero.has(presetHero) ? presetHero : heroes[0].id);
  renderPanel(panels[1], 'b', heroes[Math.min(1, heroes.length - 1)].id);
  const presetItems = String(presetParams.get('items') || '').split(',').filter(id => byItem.has(id)).slice(0, 6);
  if (presetItems.length) {
    const slots = ['', '', '', '', '', ''];
    presetItems.forEach((id, idx) => { slots[idx] = id; });
    panels[0].dataset.items = JSON.stringify(slots);
  }
  const presetLevel = Math.max(1, Math.min(30, parseInt(presetParams.get('level') || '1', 10) || 1));
  const presetLevelInput = panels[0].querySelector('[data-field="level"]');
  if (presetLevelInput) presetLevelInput.value = String(presetLevel);
  panels.forEach(p => updateLevelRing(p));
  (function() {
    const dd = document.querySelector('.hero-lab-toolbar .hd-dd[data-dd="diffstat"]');
    if (!dd) return;
    const btn = dd.querySelector('.hd-dd-btn');
    const menu = dd.querySelector('.hd-dd-menu');
    const badge = dd.querySelector('.hd-dd-badge');
    menu.innerHTML =
      '<label class="hd-dd-opt hd-dd-all"><input type="checkbox" data-dd-all><span>All</span></label>' +
      '<div class="hd-dd-sep" aria-hidden="true"></div>' +
      METRICS.map(([key, label]) =>
        `<label class="hd-dd-opt"><input type="checkbox" data-diffstat="${key}" checked><span>${label}</span></label>`
      ).join('');
    const allBox = menu.querySelector('input[data-dd-all]');
    const boxes = [...menu.querySelectorAll('input[data-diffstat]')];
    document.body.appendChild(menu);
    menu.style.position = 'fixed';
    const place = () => { const r = btn.getBoundingClientRect(); menu.style.top = (r.bottom + 6) + 'px'; menu.style.left = r.left + 'px'; };
    const sync = () => {
      const n = boxes.filter(b => b.checked).length;
      if (badge) badge.textContent = n === boxes.length ? 'all' : String(n);
      if (allBox) { allBox.checked = n === boxes.length; allBox.indeterminate = n > 0 && n < boxes.length; }
    };
    sync();
    btn.addEventListener('click', (e) => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); if (open) place(); });
    menu.addEventListener('click', (e) => e.stopPropagation());
    if (allBox) allBox.addEventListener('change', () => { boxes.forEach(b => { b.checked = allBox.checked; }); sync(); applyDiffCatFilter(); });
    boxes.forEach(b => b.addEventListener('change', () => { sync(); applyDiffCatFilter(); }));
    document.addEventListener('click', () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); });
    window.addEventListener('scroll', (e) => { if (!menu.contains(e.target)) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } }, true);
  })();
  function updateLevelRing(panel) {
    const lvl = Math.max(1, Math.min(30, parseInt(panel.querySelector('[data-field="level"]')?.value || '1', 10) || 1));
    const ring = panel.querySelector('[data-ring]');
    if (!ring) return;
    const circ = 2 * Math.PI * 18;
    const fill = (lvl / 30) * circ;
    ring.style.strokeDasharray = fill + ' ' + circ;
    ring.style.stroke = lvl >= 30 ? '#ffcc44' : '#E7D291';
  }

  root.addEventListener('input', (e) => {
    if (e.target.matches('[data-field="level"]')) {
      const clean = String(e.target.value || '').replace(/[^\d]/g, '').slice(0, 2);
      e.target.value = clean || '';
      const panel = e.target.closest('.hl-panel');
      if (panel) updateLevelRing(panel);
      update();
      return;
    }
    if (e.target.matches('[data-field="bauble-level"]')) {
      const raw = parseInt(e.target.value || '0', 10) || 0;
      const clamped = Math.max(0, Math.min(100, raw));
      if (raw !== clamped) e.target.value = clamped || '';
      update();
      const panel = e.target.closest('.hl-panel');
      if (panel) {
        const slot = panel.querySelector('.hl-bauble-slot');
        if (slot) slot.classList.toggle('is-active', clamped > 0);
      }
      return;
    }
    if (e.target.matches('[data-custom]')) update();
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-innates-toggle], [data-hl-merge-positive-toggle], [data-hl-diff-percent-toggle]')) {
      update();
    }
  });
  root.addEventListener('focusin', (e) => {
    if (e.target.matches('[data-field="level"]')) {
      requestAnimationFrame(() => e.target.select());
    }
  });
  root.addEventListener('mouseup', (e) => {
    if (e.target.matches('[data-field="level"]')) {
      e.target.select();
    }
  });
  root.addEventListener('dragstart', (e) => {
    const slotEl = e.target.closest('.hl-inv-slot');
    if (!slotEl || slotEl.classList.contains('is-empty') || !slotEl.dataset.itemId) {
      e.preventDefault();
      return;
    }
    const panel = slotEl.closest('.hl-panel');
    if (!panel) {
      e.preventDefault();
      return;
    }
    dragState = { panel, slot: slotEl.dataset.slot };
    suppressSlotClickUntil = Date.now() + 250;
    slotEl.classList.add('hl-slot-dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `${panel.dataset.side}:${slotEl.dataset.slot}`);
    }
  });
  root.addEventListener('dragover', (e) => {
    const slotEl = e.target.closest('.hl-inv-slot');
    if (!slotEl || !dragState) return;
    const panel = slotEl.closest('.hl-panel');
    if (!panel) return;
    const srcPanel = dragState.panel;
    const srcSlot = dragState.slot;
    const dstSlot = slotEl.dataset.slot;
    const src = getSlotState(srcPanel, srcSlot);
    const dst = getSlotState(panel, dstSlot);
    const srcItem = src.id ? byItem.get(src.id) : null;
    const dstItem = dst.id ? byItem.get(dst.id) : null;
    const valid = !!srcItem && slotAcceptsItem(dstSlot, srcItem) && (!dstItem || slotAcceptsItem(srcSlot, dstItem));
    if (!valid) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    root.querySelectorAll('.hl-slot-drop-target').forEach(el => el.classList.remove('hl-slot-drop-target'));
    slotEl.classList.add('hl-slot-drop-target');
  });
  root.addEventListener('drop', (e) => {
    const slotEl = e.target.closest('.hl-inv-slot');
    if (!slotEl || !dragState) return;
    const panel = slotEl.closest('.hl-panel');
    if (!panel) return;
    e.preventDefault();
    const ok = swapSlots(dragState.panel, dragState.slot, panel, slotEl.dataset.slot);
    root.querySelectorAll('.hl-slot-drop-target').forEach(el => el.classList.remove('hl-slot-drop-target'));
    root.querySelectorAll('.hl-slot-dragging').forEach(el => el.classList.remove('hl-slot-dragging'));
    dragState = null;
    if (ok) update();
  });
  root.addEventListener('dragend', () => {
    root.querySelectorAll('.hl-slot-drop-target').forEach(el => el.classList.remove('hl-slot-drop-target'));
    root.querySelectorAll('.hl-slot-dragging').forEach(el => el.classList.remove('hl-slot-dragging'));
    dragState = null;
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('.hl-level-corner')) return;
    const heroBtn = e.target.closest('[data-open-hero-picker]');
    if (heroBtn) {
      openHeroPicker(heroBtn.closest('.hl-panel'));
      return;
    }
    const modeBtn = e.target.closest('[data-cycle-item-mode]');
    if (modeBtn) {
      e.stopPropagation();
      const slotEl = modeBtn.closest('.hl-inv-slot');
      const panel = modeBtn.closest('.hl-panel');
      if (slotEl && panel) {
        const item = byItem.get(slotEl.dataset.itemId || '');
        if (item && item.modes) {
          const modes = Object.keys(item.modes).filter(k => k !== 'default' && k !== 'base');
          const modeKey = String(slotEl.dataset.slot);
          const itemModes = safeJsonParse(panel.dataset.itemModes, {});
          const current = itemModes[modeKey] || item.modes.default || modes[0] || 'damage';
          const idx = Math.max(0, modes.indexOf(current));
          itemModes[modeKey] = modes[(idx + 1) % modes.length] || current;
          panel.dataset.itemModes = JSON.stringify(itemModes);
          update();
        }
      }
      return;
    }
    const clearBtn = e.target.closest('[data-clear-slot]');
    if (clearBtn) {
      e.stopPropagation();
      var slotEl = clearBtn.closest('.hl-inv-slot');
      var panel = clearBtn.closest('.hl-panel');
      if (slotEl && panel) {
        var sl = slotEl.dataset.slot;
        var itemModes = safeJsonParse(panel.dataset.itemModes, {});
        if (sl === 'enchant') { panel.dataset.enchantItem = ''; }
        else { var its = safeJsonParse(panel.dataset.items, ["","","","","",""]); its[Number(sl)] = ''; panel.dataset.items = JSON.stringify(its); }
        delete itemModes[String(sl)];
        panel.dataset.itemModes = JSON.stringify(itemModes);
        update();
      }
      return;
    }
    const itemBtn = e.target.closest('[data-open-item-picker]');
    if (itemBtn) {
      if (Date.now() < suppressSlotClickUntil) return;
      if (itemBtn.dataset.slot === 'enchant') {
        openItemPicker(itemBtn.closest('.hl-panel'), 'enchant');
        return;
      }
      openItemPicker(itemBtn.closest('.hl-panel'), Number(itemBtn.dataset.slot || 0));
      return;
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-picker-close]')) {
      closePicker();
      return;
    }
    if (e.target.closest('[data-picker-back]')) {
      if (activePicker && activePicker.panel) openItemPicker(activePicker.panel, 'enchant');
      return;
    }
    const heroTile = e.target.closest('[data-hero-id]');
    if (heroTile && activePicker?.kind === 'hero') {
      activePicker.panel.dataset.hero = heroTile.dataset.heroId;
      closePicker();
      update();
      return;
    }
    const tierBtn = e.target.closest('[data-enchant-tier]');
    if (tierBtn && activePicker?.kind === 'item' && activePicker.slot === 'enchant') {
      const item = byItem.get(tierBtn.dataset.itemId || '');
      const itemModes = JSON.parse(activePicker.panel.dataset.itemModes || '{}');
      activePicker.panel.dataset.enchantItem = tierBtn.dataset.itemId || '';
      itemModes.enchant = 't' + tierBtn.dataset.enchantTier;
      Object.keys(itemModes).forEach(key => itemModes[key] === undefined && delete itemModes[key]);
      activePicker.panel.dataset.itemModes = JSON.stringify(itemModes);
      closePicker();
      update();
      return;
    }
    const itemTile = e.target.closest('[data-item-id]');
    if (itemTile && activePicker?.kind === 'item') {
      const item = byItem.get(itemTile.dataset.itemId || '');
      const itemModes = JSON.parse(activePicker.panel.dataset.itemModes || '{}');
      if (activePicker.slot === 'enchant') {
        if (item && item.tiersAvailable && item.tiersAvailable.length > 1) {
          showEnchantTierPicker(activePicker.panel, item);
          return;
        }
        activePicker.panel.dataset.enchantItem = itemTile.dataset.itemId || '';
        itemModes.enchant = item?.tiersAvailable?.length ? 't' + item.tiersAvailable[0] : (item?.modes ? (Object.keys(item.modes)[0] || 'damage') : 'damage');
      } else {

        const slots = JSON.parse(activePicker.panel.dataset.items || '["","","","","",""]');
        slots[activePicker.slot] = itemTile.dataset.itemId || '';
        activePicker.panel.dataset.items = JSON.stringify(slots);
        let initialMode = item && item.modes ? (item.modes.default || 'damage') : undefined;
        if (item && item.id === 'item_power_treads') {
          const panelHero = byHero.get(activePicker.panel.dataset.hero || '') || heroes[0];
          const pAttr = panelHero && panelHero.stats && panelHero.stats.attr;
          initialMode = (pAttr === 'agi' || pAttr === 'int') ? pAttr : 'str';
        }
        itemModes[String(activePicker.slot)] = initialMode;
      }
      Object.keys(itemModes).forEach(key => itemModes[key] === undefined && delete itemModes[key]);
      activePicker.panel.dataset.itemModes = JSON.stringify(itemModes);
      if (activePicker.slot === 'enchant') {
        syncEnchantMode(activePicker.panel);
      }
      closePicker();
      update();
    }
  });
  overlay.addEventListener('input', (e) => {
    const input = e.target.closest('[data-hero-search]');
    if (!input) return;
    const q = String(input.value || '').trim().toLowerCase();
    overlay.querySelectorAll('.hl-hero-tile').forEach(tile => {
      const name = String(tile.getAttribute('aria-label') || '').toLowerCase();
      tile.classList.toggle('is-hidden', !!q && !name.includes(q));
    });
    overlay.querySelectorAll('.hl-hero-group').forEach(group => {
      const anyVisible = [...group.querySelectorAll('.hl-hero-tile')].some(tile => !tile.classList.contains('is-hidden'));
      group.classList.toggle('is-hidden', !anyVisible);
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) closePicker();
  });

  // ---- Item tooltip ----
  const BONUS_LABELS = {
    all: 'All Attributes',
    str: 'Strength', agi: 'Agility', int: 'Intelligence',
    hp: 'Health', mp: 'Mana', hpr: 'Health Regeneration', mpr: 'Mana Regeneration',
    armor: 'Armor', mr: 'Magic Resistance', evasion: 'Evasion',
    damage: 'Damage', damageMelee: 'Damage (Melee)', damageRanged: 'Damage (Ranged)',
    aspd: 'Attack Speed', ms: 'Movement Speed', msMelee: 'Movement Speed (Melee)',
    msRanged: 'Movement Speed (Ranged)', range: 'Attack Range',
    dvision: 'Day Vision', nvision: 'Night Vision',
    spellAmp: 'Spell Amplification', statusRes: 'Status Resistance', slowRes: 'Slow Resistance',
    mprAmp: 'Mana Regen Amplification',
    hprPct: 'HP Regen %', missingHprPct: 'Missing HP Regen', mpPct: 'Max Mana %',
    lifesteal: 'Lifesteal', spellLifesteal: 'Spell Lifesteal', castRange: 'Cast Range',
    primaryStat: 'Primary Attribute', primaryStatUni: 'Primary Attribute (Universal)',
    damagePct: 'Damage %',
    batReduce: 'BAT Reduction', healthRestoration: 'Health Restoration',
    cooldownReduction: 'Cooldown Reduction', debuffAmp: 'Debuff Amplification',
    hpPct: 'Max Health %', msPct: 'Movement Speed %', knockbackResist: 'Knockback Resistance',
    incomingDamage: 'Incoming Damage', magicDamage: 'Magic Damage',
    castSpeed: 'Cast Speed', visionReduce: 'Vision',
    manacostIncrease: 'Manacost / Mana Loss Increase', intelligencePct: 'Intelligence %',
    maxHpRegen: 'Max Health Regen', hpRegenReduce: 'Health Regeneration',
    manacostReduction: 'Manacost Reduction',
    gpm: 'Gold Per Minute', xpm: 'XP Per Minute',
    aspdPct: 'Attack Speed',
    manaReductionPct: 'Max Mana',
  };
  const BONUS_PCT = new Set(['mr', 'evasion', 'spellAmp', 'statusRes', 'slowRes', 'mprAmp', 'hprPct', 'mpPct', 'lifesteal', 'spellLifesteal', 'damagePct', 'batReduce', 'cooldownReduction', 'debuffAmp', 'hpPct', 'msPct', 'knockbackResist', 'incomingDamage', 'castSpeed', 'visionReduce', 'manacostIncrease', 'intelligencePct', 'manacostReduction', 'maxHpRegen', 'aspdPct', 'manaReductionPct', 'healthRestoration', 'itemCdr']);
  function fmtNum(v) { var n = Math.abs(v); return n === Math.floor(n) ? String(n) : n % 1 === 0 ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''); }
  function fmtBonusVal(k, v, flip) { var dv = flip ? -v : v; var av = fmtNum(dv); var sign = dv >= 0 ? '+' : '-'; return BONUS_PCT.has(k) ? sign + av + '%' : sign + av; }
  const BONUS_FLIP_NEG = new Set(['hpRegenReduce', 'manaReductionPct', 'visionReduce']);
  const BONUS_RED_POS = new Set(['incomingDamage', 'manacostIncrease']);

  var tipEl = document.createElement('div');
  tipEl.className = 'hl-tooltip';
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  var tipCurrentTile = null;
  var innateTipEl = document.createElement('div');
  innateTipEl.className = 'hl-tooltip hl-innate-tooltip';
  innateTipEl.hidden = true;
  document.body.appendChild(innateTipEl);
  var innateTipCurrent = null;

  function cleanDesc(html) {
    return html
      .replace(/\\n/g, '<br>')
      .replace(/\n/g, '<br>')
      .replace(/<br\s*\/?>\s*<br\s*\/?>/g, '<br>');
  }

  function dagonProgressionRow(levels, key, label, suffix) {
    suffix = suffix || '';
    return levels.map(l => String(l[key]).replace(/\.0$/, '') + suffix).join(' / ') + ' ' + label;
  }

  function buildTooltip(item, modeKey, showSeries, showEnchantSeries, baubleScale, heroCdr) {
    baubleScale = baubleScale || 1;
    heroCdr = heroCdr || 0;
    var tip = item.tip || {};
    var b = item.bonus || {};
    var visual = itemVisual(item, modeKey);
    var mode = visual.mode || null;
    var lines = [];
    // Header
    lines.push('<div class="hlt-head">');
    lines.push('<img class="hlt-icon" src="' + visual.icon + '" alt="">');
    lines.push('<div class="hlt-title">');
    lines.push('<span class="hlt-name">' + item.name + '</span>');
    if (visual.cost > 0) {
      var costText = item.id === 'item_dagon' && showSeries && tip.levels
        ? tip.levels.map(function(l) { return String(l.cost); }).join(' / ')
        : String(visual.cost);
      lines.push('<span class="hlt-cost"><img class="hlt-gold-icon" src="icons/misc/gold.png" alt=""> ' + costText + '</span>');
    }
    lines.push('</div></div>');
    // Ability info line
    var infoLine = [];
    if (tip.target) infoLine.push('ABILITY: ' + tip.target);
    if (tip.affects) infoLine.push('AFFECTS: ' + tip.affects);
    if (tip.disp) { const _d = tip.disp; infoLine.push('DISPELLABLE: ' + (/strong/i.test(_d) ? `<span style="color:#e05050">${_d}</span>` : _d)); }
    if (infoLine.length) lines.push('<div class="hlt-info">' + infoLine.join('<br>') + '</div>');
    var stats = [];
    // Neutral artifacts do not grant direct hero stats. Their AbilityValues
    // describe the item's active/passive mechanic and belong in its ability
    // description, not in the green attribute list. Enchantments still render
    // their actual stat rows below.
    if (item.id === 'item_dagon' && tip.levels && tip.levels.length) {
      if (showSeries) {
        stats.push('<span class="hlt-stat"><b>' + tip.levels.map(function(l){ return String(l.all).replace(/\.0$/, ''); }).join(' / ') + '</b> All Attributes</span>');
        stats.push('<span class="hlt-stat"><b>' + tip.levels.map(function(l){ return String(l.hp).replace(/\.0$/, ''); }).join(' / ') + '</b> Health</span>');
        stats.push('<span class="hlt-stat"><b>' + tip.levels.map(function(l){ return String(l.mp).replace(/\.0$/, ''); }).join(' / ') + '</b> Mana</span>');
        stats.push('<span class="hlt-stat"><b>' + tip.levels.map(function(l){ return String(l.cr).replace(/\.0$/, ''); }).join(' / ') + '</b> Cast Range</span>');
      } else if (mode) {
        stats.push('<span class="hlt-stat"><b>+' + String(mode.all).replace(/\.0$/, '') + '</b> All Attributes</span>');
        stats.push('<span class="hlt-stat"><b>+' + String(mode.hp).replace(/\.0$/, '') + '</b> Health</span>');
        stats.push('<span class="hlt-stat"><b>+' + String(mode.mp).replace(/\.0$/, '') + '</b> Mana</span>');
        stats.push('<span class="hlt-stat"><b>+' + String(mode.cr).replace(/\.0$/, '') + '</b> Cast Range</span>');
      }
    } else if (showEnchantSeries && item.modes && item.tiersAvailable) {
      var tierKeys = item.tiersAvailable.map(function(t) { return 't' + t; });
      var allKeys = {};
      tierKeys.forEach(function(tk) {
        var m = item.modes[tk];
        if (m) Object.keys(m).forEach(function(k) { if (k !== 'level' && Math.abs(m[k]) > 0.001) allKeys[k] = true; });
      });
      var bonusRows = [], penaltyRows = [];
      Object.keys(allKeys).forEach(function(k) {
        var label = BONUS_LABELS[k] || k;
        var flip = BONUS_FLIP_NEG.has(k);
        var vals = tierKeys.map(function(tk) {
          var m = item.modes[tk];
          var v = m ? (m[k] || 0) : 0;
          return fmtBonusVal(k, v, flip);
        });
        var isPenalty = flip
          ? tierKeys.some(function(tk) { var m = item.modes[tk]; return m && (m[k] || 0) > 0; })
          : BONUS_RED_POS.has(k)
            ? tierKeys.some(function(tk) { var m = item.modes[tk]; return m && (m[k] || 0) > 0; })
            : tierKeys.some(function(tk) { var m = item.modes[tk]; return m && (m[k] || 0) < 0; });
        var row = '<span class="hlt-stat' + (isPenalty ? ' hlt-penalty' : '') + '"><b>' + vals.join(' / ') + '</b> ' + label + '</span>';
        if (isPenalty) penaltyRows.push(row); else bonusRows.push(row);
      });
      stats.push.apply(stats, bonusRows.concat(penaltyRows));
    } else if (item.tiersAvailable && mode && !showEnchantSeries) {
      var tierNum = modeKey ? modeKey.replace('t', '') : '';
      var bonusRows = [], penaltyRows = [];
      for (var k in BONUS_LABELS) {
        var v = mode[k];
        if (v && Math.abs(v) > 0.001) {
          var sv = (item['class'] === 'enchant' && baubleScale !== 1)
            ? ((k === 'cooldownReduction' || k === 'cdrUnique')
                ? 100 * (1 - (1 - v/100) * (1 - v*(baubleScale-1)/100))
                : v * baubleScale)
            : v;
          var flip = BONUS_FLIP_NEG.has(k);
          var formatted = fmtBonusVal(k, sv, flip);
          var pen = flip ? sv > 0 : (BONUS_RED_POS.has(k) ? sv > 0 : sv < 0);
          var row = '<span class="hlt-stat' + (pen ? ' hlt-penalty' : '') + '"><b>' + formatted + '</b> ' + BONUS_LABELS[k] + '</span>';
          if (pen) penaltyRows.push(row); else bonusRows.push(row);
        }
      }
      stats.push.apply(stats, bonusRows.concat(penaltyRows));
    } else if (item['class'] === 'enchant' && b) {
      var bonusRows = [], penaltyRows = [];
      for (var k in BONUS_LABELS) {
        var v = b[k];
        if (v && Math.abs(v) > 0.001) {
          var sv = baubleScale !== 1
            ? ((k === 'cooldownReduction' || k === 'cdrUnique')
                ? (function(){ var _s1 = Math.min(v, 99.9), _s2 = Math.min(v*(baubleScale-1), 99.9); return Math.min(Math.round((1-(1-_s1/100)*(1-_s2/100))*1000)/10, 99.9); })()
                : v * baubleScale)
            : v;
          var flip = BONUS_FLIP_NEG.has(k);
          var formatted = fmtBonusVal(k, sv, flip);
          var pen = flip ? sv > 0 : (BONUS_RED_POS.has(k) ? sv > 0 : sv < 0);
          var row = '<span class="hlt-stat' + (pen ? ' hlt-penalty' : '') + '"><b>' + formatted + '</b> ' + BONUS_LABELS[k] + '</span>';
          if (pen) penaltyRows.push(row); else bonusRows.push(row);
        }
      }
      stats.push.apply(stats, bonusRows.concat(penaltyRows));
    } else if (item['class'] !== 'neutral' && tip.attribs && tip.attribs.length) {
      tip.attribs.forEach(function(a) {
        var m = a.match(/^([+\-]?\s*[\d.]+%?)\s+(.*)/);
        if (m) stats.push('<span class="hlt-stat"><b>' + m[1] + '</b> ' + m[2] + '</span>');
        else stats.push('<span class="hlt-stat">' + a + '</span>');
      });
    } else if (item['class'] !== 'neutral') {
      for (var k in BONUS_LABELS) {
        var v = b[k];
        if (v && Math.abs(v) > 0.001) {
          var formatted = BONUS_PCT.has(k) ? (v > 0 ? '+ ' : '') + v + '%' : (v > 0 ? '+ ' : '') + (v === Math.floor(v) ? v : v.toFixed(1));
          stats.push('<span class="hlt-stat"><b>' + formatted + '</b> ' + BONUS_LABELS[k] + '</span>');
        }
      }
    }
    if (stats.length) lines.push('<div class="hlt-stats">' + stats.join('') + '</div>');
    // Active/Passive bar + cost icons
    var costBar = [];
    var castRangeVal = mode && mode.cr != null ? mode.cr : tip.cr;
    var manaCostVal = mode && mode.mc != null ? mode.mc : tip.mc;
    var cooldownVal = mode && mode.cd != null ? mode.cd : tip.cd;
    if (castRangeVal) costBar.push('<span class="hlt-cost-icon hlt-cast-range" title="Cast Range">' + castRangeVal + '</span>');
    if (manaCostVal) costBar.push('<span class="hlt-cost-icon hlt-mana-cost" title="Mana Cost">' + manaCostVal + '</span>');
    if (cooldownVal) {
      var cdNum = parseFloat(cooldownVal);
      if (heroCdr > 0 && !isNaN(cdNum)) {
        var cdReduced = +(cdNum * (1 - heroCdr / 100)).toFixed(1);
        costBar.push('<span class="hlt-cost-icon hlt-cooldown" title="Cooldown (with ' + heroCdr + '% CDR)">' + cdReduced + ' <s style="opacity:.45;font-size:.85em">' + cooldownVal + '</s></span>');
      } else {
        costBar.push('<span class="hlt-cost-icon hlt-cooldown" title="Cooldown">' + cooldownVal + '</span>');
      }
    }
    // Description
    if (tip.desc) {
      var desc = cleanDesc(tip.desc);
      if (item.id === 'item_dagon' && mode) {
        var dmgVal = String(mode.dagonDamage != null ? mode.dagonDamage : 400).replace(/\.0$/, '');
        var manaVal = String(mode.mc != null ? mode.mc : (tip.mc || '')).replace(/\.0$/, '');
        desc = desc
          .replace(/(Damage:\s*<span class="GameplayVariable">)([^<]+)(<\/span>)/i, '$1' + dmgVal + '$3')
          .replace(/(Mana Cost:\s*<span class="GameplayVariable">)([^<]+)(<\/span>)/i, '$1' + manaVal + '$3');
      }
      // Extract <h1> headers — there can be multiple (Active + Passive sections)
      var sections = [];
      var remaining = desc;
      var hRe = /<h1>(.*?)<\/h1>/g;
      var lastIdx = 0;
      var match;
      while ((match = hRe.exec(desc)) !== null) {
        var before = desc.substring(lastIdx, match.index).trim();
        if (before && sections.length > 0) {
          sections[sections.length - 1].body = before;
        }
        sections.push({ header: match[1], body: '' });
        lastIdx = match.index + match[0].length;
      }
      var tail = desc.substring(lastIdx).trim();
      if (sections.length > 0) {
        sections[sections.length - 1].body = tail;
      }
      if (sections.length > 0) {
        var first = true;
        sections.forEach(function(sec) {
          var h = sec.header.toLowerCase();
          var isActive = h.startsWith('active') || h.startsWith('use');
          // Consumables (Tango/Salve) use the green "Use" header in-game.
          var barType = (item.consumable && isActive) ? 'is-use' : (isActive ? 'is-active' : 'is-passive');
          lines.push('<div class="hlt-ability-bar ' + barType + '">' +
            '<span class="hlt-ability-name">' + sec.header + '</span>' +
            (first && costBar.length ? '<span class="hlt-ability-costs">' + costBar.join('') + '</span>' : '') +
            '</div>');
          if (sec.body) lines.push('<div class="hlt-desc ' + barType + '">' + sec.body + '</div>');
          first = false;
        });
      } else {
        if (costBar.length) {
          lines.push('<div class="hlt-ability-bar is-passive"><span class="hlt-ability-costs">' + costBar.join('') + '</span></div>');
        }
        lines.push('<div class="hlt-desc">' + remaining + '</div>');
      }
    } else if (tip.short && !stats.length) {
      if (costBar.length) {
        lines.push('<div class="hlt-ability-bar is-passive"><span class="hlt-ability-costs">' + costBar.join('') + '</span></div>');
      }
      lines.push('<div class="hlt-desc">' + tip.short + '</div>');
    }
    if (tip.notes && tip.notes.length) {
      lines.push('<div class="hlt-notes">' + tip.notes.map(function(note) {
        return '<div class="hlt-note">' + cleanDesc(note) + '</div>';
      }).join('') + '</div>');
    }
    return lines.join('');
  }

  function showTooltip(tileEl) {
    var itemId = tileEl.dataset.itemId;
    var item = byItem.get(itemId);
    if (!item) return;
    var modeKey = tileEl.dataset.itemMode || '';
    var inPicker = !tileEl.closest('.hl-panel');
    var showSeries = item.id === 'item_dagon' && inPicker;
    var showEnchantSeries = item.tiersAvailable && item.tiersAvailable.length > 1 && inPicker;
    var baubleScale = 1;
    var heroCdr = 0;
    var _panel = tileEl.closest('.hl-panel');
    if (_panel) {
      if (item['class'] === 'enchant') {
        var _bl = parseInt((_panel.querySelector('[data-field="bauble-level"]') || {}).value || '0', 10) || 0;
        if (_bl > 0) {
          var _modes = {};
          try { _modes = JSON.parse(_panel.dataset.itemModes || '{}'); } catch(e) {}
          if ((_modes.enchant || null) === 't5') baubleScale = 0.7 + _bl * 0.4;
        }
      }
      heroCdr = parseFloat(_panel.dataset.cdr || '0') || 0;
    }
    var cls = 'hl-tooltip';
    if (item['class'] === 'neutral' && item.tier != null) {
      cls += ' neutral-tier-' + (item.tier + 1);
    }
    tipEl.className = cls;
    tipEl.innerHTML = buildTooltip(item, modeKey, showSeries, showEnchantSeries, baubleScale, heroCdr);
    tipEl.hidden = false;
    positionTooltip(tileEl);
  }

  function positionTooltip(anchor) {
    var r = anchor.getBoundingClientRect();
    var tw = tipEl.offsetWidth;
    var th = tipEl.offsetHeight;
    var left = r.right + 10;
    var top = r.top;
    if (left + tw > window.innerWidth - 8) left = r.left - tw - 10;
    if (top + th > window.innerHeight - 8) top = window.innerHeight - 8 - th;
    if (top < 8) top = 8;
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  }

  function hideTooltip() { tipEl.hidden = true; tipCurrentTile = null; }
  function hideInnateTooltip() { innateTipEl.hidden = true; innateTipCurrent = null; }

  function buildInnateTooltip(hero) {
    var statInnate = hero && hero.statInnate ? hero.statInnate : null;
    if (!statInnate) return '';
    var lines = [];
    lines.push('<div class="hlt-head">');
    lines.push('<img class="hlt-icon" src="icons/misc/innate_icon.png" alt="">');
    lines.push('<div class="hlt-title">');
    lines.push('<span class="hlt-name">' + statInnate.name + '</span>');
    lines.push('</div></div>');
    if (statInnate.desc) {
      lines.push('<div class="hlt-desc">' + cleanDesc(statInnate.desc) + '</div>');
    }
    return lines.join('');
  }

  function showInnateTooltip(chipEl) {
    var panel = chipEl.closest('.hl-panel');
    if (!panel) return;
    var hero = byHero.get(panel.dataset.hero || heroes[0].id) || heroes[0];
    if (!hero.statInnate) return;
    innateTipEl.className = 'hl-tooltip hl-innate-tooltip';
    innateTipEl.innerHTML = buildInnateTooltip(hero);
    innateTipEl.hidden = false;
    var r = chipEl.getBoundingClientRect();
    var tw = innateTipEl.offsetWidth;
    var th = innateTipEl.offsetHeight;
    var left = r.right + 10;
    var top = r.top - 4;
    if (left + tw > window.innerWidth - 8) left = r.left - tw - 10;
    if (top + th > window.innerHeight - 8) top = window.innerHeight - 8 - th;
    if (top < 8) top = 8;
    innateTipEl.style.left = left + 'px';
    innateTipEl.style.top = top + 'px';
    innateTipCurrent = chipEl;
  }

  overlay.addEventListener('pointerover', function(e) {
    var tile = e.target.closest('.hl-item-tile');
    if (!tile) return;
    if (tile !== tipCurrentTile) {
      tipCurrentTile = tile;
      showTooltip(tile);
    }
  }, true);
  overlay.addEventListener('pointerout', function(e) {
    var tile = e.target.closest('.hl-item-tile');
    if (!tile) return;
    var related = e.relatedTarget;
    if (related && tile.contains(related)) return;
    hideTooltip();
  }, true);

  root.addEventListener('pointerover', function(e) {
    var slot = e.target.closest('.hl-inv-slot');
    if (!slot || slot.classList.contains('is-empty') || !slot.dataset.itemId) return;
    if (slot !== tipCurrentTile) {
      tipCurrentTile = slot;
      showTooltip(slot);
    }
  }, true);
  root.addEventListener('pointerout', function(e) {
    var slot = e.target.closest('.hl-inv-slot');
    if (!slot) return;
    var related = e.relatedTarget;
    if (related && (slot.contains(related) || tipEl.contains(related))) return;
    hideTooltip();
  }, true);

  root.addEventListener('pointerover', function(e) {
    var bslot = e.target.closest('.hl-bauble-slot');
    if (bslot && bslot !== tipCurrentTile) {
      tipCurrentTile = bslot;
      var panel = bslot.closest('.hl-panel');
      var bl = panel ? (parseInt((panel.querySelector('[data-field="bauble-level"]') || {}).value || '0', 10) || 0) : 0;
      var bonusPct = bl > 0 ? '+' + (bl * 40 - 30) + '%' : '—';
      tipEl.className = 'hl-tooltip';
      tipEl.innerHTML = '<div class="hlt-head"><img class="hlt-icon" src="icons/items/enchanters_bauble.png" alt=""><div class="hlt-title"><span class="hlt-name">Enchanter\'s Bauble</span></div></div>'
        + (bl > 0 ? '<div class="hlt-stats"><span class="hlt-stat"><b>' + bonusPct + '</b> Enchantment Bonus</span></div>' : '')
        + '<div class="hlt-info">ABILITY: Passive</div>'
        + '<div class="hlt-desc">Increases the bonuses of the item\'s Neutral Enchantment by <span style="color:#9cf">10%</span>. Every time this item is crafted again the bonus is increased by <span style="color:#9cf">40%</span>.</div>';
      tipEl.hidden = false;
      positionTooltip(bslot);
    }
  }, true);
  root.addEventListener('pointerout', function(e) {
    var bslot = e.target.closest('.hl-bauble-slot');
    if (!bslot) return;
    var related = e.relatedTarget;
    if (related && bslot.contains(related)) return;
    hideTooltip();
  }, true);
  root.addEventListener('pointerover', function(e) {
    var chip = e.target.closest('[data-innate-chip]');
    if (!chip || chip.classList.contains('is-hidden')) return;
    if (chip !== innateTipCurrent) showInnateTooltip(chip);
  }, true);
  root.addEventListener('pointerout', function(e) {
    var chip = e.target.closest('[data-innate-chip]');
    if (!chip) return;
    var related = e.relatedTarget;
    if (related && (chip.contains(related) || innateTipEl.contains(related))) return;
    hideInnateTooltip();
  }, true);
  innateTipEl.addEventListener('pointerleave', function() {
    hideInnateTooltip();
  });

  update();
})();

// ---- ITEM DATA: standalone hero-first equipment intelligence ----
(function() {
  const page = document.querySelector('.item-data-page');
  const configEl = document.getElementById('item-data-config');
  if (!page || !configEl) return;

  let config;
  try { config = JSON.parse(configEl.textContent || '{}'); } catch { return; }
  const heroes = config.heroes || {}, items = config.items || {};
  const comboMinCost = Number(config.comboMinCost || 1020);
  const itemRulesByPatch = config.itemRulesByPatch || {};
  const patchTimeline = config.patchTimeline || {};
  const controls = {
    hero: document.getElementById('id-hero-search'), role: document.getElementById('id-role'),
    cohort: document.getElementById('id-public-cohort'),
    patch: document.getElementById('id-patch'), from: document.getElementById('id-date-from'),
    to: document.getElementById('id-date-to'), scope: document.getElementById('id-item-scope'),
    min: document.getElementById('id-min-sample'), search: document.getElementById('id-result-search'),
  };
  const status = document.getElementById('id-load-status');
  const generate = document.getElementById('id-generate');
  const results = document.getElementById('id-results');
  const params = new URLSearchParams(location.search);
  const PUBLIC_COHORTS = {
    pure_immortal: {
      label: '纯冠绝',
      detail: '10人均为冠绝',
    },
    immortal_divine: {
      label: '冠绝＋超凡',
      detail: '同时含冠绝与超凡',
    },
  };
  const sourceConfig = {
    pro: {
      label: '职业比赛', url: config.dataUrl || 'data/pro_builds.json', role: true,
      ready: meta => `${Number(meta.matches || 0).toLocaleString()}场职业比赛`,
    },
    public: {
      label: '高端公开局', url: config.publicDataUrl || 'data/opendota_public_items.json', role: false,
      ready: meta => {
        const matches = Number(meta.matches || 0), target = Number(meta.target_matches || 0);
        const pure = Number(meta.cohorts?.pure_immortal?.matches || 0);
        const mixed = Number(meta.cohorts?.immortal_divine?.matches || 0);
        const progress = target ? ` / 目标${target.toLocaleString()}场` : '';
        return `${matches.toLocaleString()}场高端公开局（纯冠绝${pure.toLocaleString()} / 混合${mixed.toLocaleString()}）${progress}`;
      },
    },
  };
  const state = {
    rows: [], scopeRows: [], filtered: [], meta: {}, selectedHero: '', activeTab: params.get('tab') || 'overview',
    activeSource: sourceConfig[params.get('source')] ? params.get('source') : 'pro',
    datasets: new Map(), loadingSource: '', initialLoad: true,
    publicManifest: null, publicHeroRows: new Map(), loadedPublicHero: '', loadingHero: '',
    sorts: {
      single: ['count', 'desc'], pairs: ['count', 'desc'], trios: ['count', 'desc'],
      fours: ['count', 'desc'], fives: ['count', 'desc'], sixes: ['count', 'desc'],
    },
    analysis: null,
  };
  const completedCategories = new Set(['Accessories', 'Support', 'Magical', 'Armor', 'Weapons', 'Armaments']);
  const routeNodeClasses = new Set(['upgradeable_completed', 'terminal_completed', 'independent_functional']);
  const finalItemAliases = new Map([
    ['item_dagon_2', 'item_dagon'], ['item_dagon_3', 'item_dagon'],
    ['item_dagon_4', 'item_dagon'], ['item_dagon_5', 'item_dagon'],
    ['item_travel_boots_2', 'item_travel_boots'],
    ['item_caster_rapier', 'item_rapier'],
  ]);
  const coreAllow = new Set([
    'item_magic_wand', 'item_bracer', 'item_wraith_band', 'item_null_talisman',
    'item_bottle', 'item_soul_ring', 'item_urn_of_shadows', 'item_orb_of_corrosion',
    'item_falcon_blade', 'item_blink', 'item_boots', 'item_travel_boots', 'item_travel_boots_2',
  ]);

  const esc = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const pct = (n, d, signed) => {
    if (!d && d !== 1) return '—';
    const value = n * 100 / d;
    return `${signed && value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  };
  const median = values => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  };
  const mean = values => {
    const valid = values.filter(Number.isFinite);
    return valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null;
  };
  const timeText = seconds => Number.isFinite(seconds)
    ? `${Math.floor(seconds / 60)}:${String(Math.max(0, Math.round(seconds % 60))).padStart(2, '0')}` : '—';
  const wilson = (wins, games) => {
    if (!games) return [0, 0];
    const z = 1.96, p = wins / games, divisor = 1 + z * z / games;
    const center = (p + z * z / (2 * games)) / divisor;
    const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * games)) / games) / divisor;
    return [Math.max(0, center - margin), Math.min(1, center + margin)];
  };
  const normalize = value => String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  const itemName = id => items[id]?.name || String(id || '').replace(/^item_/, '').replaceAll('_', ' ');
  const canonicalFinalItemId = id => finalItemAliases.get(id) || id;
  const heroName = id => heroes[id]?.name || String(id || '').replaceAll('_', ' ');
  const roleName = value => value ? `${value}号位` : '全部位置';
  const sourceName = () => sourceConfig[state.activeSource]?.label || '当前数据源';
  const publicCohortName = cohort => PUBLIC_COHORTS[cohort]?.label || '未知段位组';
  const selectedPublicCohortName = () => publicCohortName(controls.cohort.value);
  const publicCohortSummary = summary => {
    const cohort = controls.cohort.value;
    const current = summary?.cohorts?.[cohort];
    if (current) return current;
    // Backward compatibility for the previous pure-only v2 manifest.
    if (cohort === 'pure_immortal' && summary && !summary.cohorts) return summary;
    return { matches: 0, records: 0 };
  };
  const basePatch = value => String(value || '').match(/^\d+\.\d+/)?.[0] || '';
  const hasPatchSuffix = value => /^\d+\.\d+[a-z]$/i.test(String(value || ''));
  function effectivePatch(row) {
    const raw = String(row?.p || '');
    if (hasPatchSuffix(raw) && itemRulesByPatch[raw]) return raw;
    const timeline = patchTimeline[basePatch(raw)] || [];
    if (timeline.length) {
      const date = String(row?.d || '');
      const active = date
        ? timeline.filter(entry => String(entry?.[0] || '') <= date).at(-1)
        : timeline.at(-1);
      const version = active?.[1] || timeline[0]?.[1];
      if (version && itemRulesByPatch[version]) return version;
    }
    if (itemRulesByPatch[raw]) return raw;
    return itemRulesByPatch[config.theoryPatch] ? config.theoryPatch : (Object.keys(itemRulesByPatch).at(-1) || raw);
  }
  function itemRuleForPatch(id, patch) {
    const canonical = canonicalFinalItemId(id);
    const rawRule = itemRulesByPatch[patch]?.[id];
    const canonicalRule = itemRulesByPatch[patch]?.[canonical];
    const fallback = items[id] || items[canonical] || {};
    return rawRule || canonicalRule
      ? {
          cost: Number(rawRule?.[0] ?? canonicalRule?.[0] ?? 0),
          completed: Boolean(rawRule?.[1] || canonicalRule?.[1]),
        }
      : { cost: Number(fallback.cost || 0), completed: Boolean(fallback.completed) };
  }
  const itemRule = (id, row) => itemRuleForPatch(id, effectivePatch(row));
  function effectivePatchesForMeta(meta) {
    const rawPatches = Array.isArray(meta?.patches)
      ? meta.patches
      : Object.keys(meta?.patches || {});
    const minimum = String(meta?.date_min || ''), maximum = String(meta?.date_max || '');
    const found = new Set();
    rawPatches.forEach(rawValue => {
      const raw = String(rawValue || '');
      if (hasPatchSuffix(raw) && itemRulesByPatch[raw]) {
        found.add(raw);
        return;
      }
      const timeline = patchTimeline[basePatch(raw)] || [];
      timeline.forEach((entry, index) => {
        const start = String(entry?.[0] || ''), end = String(timeline[index + 1]?.[0] || '');
        if ((!maximum || start <= maximum) && (!minimum || !end || end > minimum)) found.add(entry[1]);
      });
      if (!timeline.length && itemRulesByPatch[raw]) found.add(raw);
    });
    return [...found];
  }
  const itemIcon = (id, compact) => {
    const item = items[id] || {}, name = itemName(id);
    return `<span class="id-item ${compact ? 'is-compact' : ''}" title="${esc(name)}">${item.icon ? `<img src="${esc(item.icon)}" alt="${esc(name)}" loading="lazy">` : '<i>?</i>'}${compact ? '' : `<b>${esc(name)}</b>`}</span>`;
  };
  const emptyRow = (colspan, text) => `<tr><td colspan="${colspan}"><div class="id-empty">${esc(text)}</div></td></tr>`;

  function decodeCorePayload(payload) {
    if (!['pro-builds-core-v2', 'pro-builds-core-v3', 'pro-builds-core-v4'].includes(payload?.schema)) return payload?.records || [];
    const dictionaries = payload.dictionaries || {};
    const value = (field, index) => dictionaries[field]?.[index] ?? '';
    return (payload.records || []).map(row => {
      const purchaseValues = row[19] || [], useValues = Array.isArray(row[21]) ? row[21] : null;
      const finalValues = Array.isArray(row[23]) ? row[23] : null;
      const purchases = [], uses = useValues ? [] : null;
      for (let index = 0; index < purchaseValues.length; index += 2) purchases.push([value('item', purchaseValues[index]), purchaseValues[index + 1]]);
      if (useValues) for (let index = 0; index < useValues.length; index += 2) uses.push([value('item', useValues[index]), useValues[index + 1]]);
      const finalInventory = finalValues ? finalValues.map(index => value('item', index)).filter(Boolean) : null;
      return {
        m: row[0], d: value('d', row[1]), p: value('p', row[2]), li: row[3],
        l: value('l', row[4]), t: value('t', row[5]), s: value('s', row[6]),
        n: value('n', row[7]), h: value('h', row[8]), hi: row[9], sl: row[10],
        tm: row[11], r: row[12], rm: value('rm', row[13]), rc: row[14], w: row[15],
        lv: row[16], nw: row[17], du: row[18], i: purchases, g: row[20], u: uses, x: row[22] || null,
        f: finalInventory, b: [], fi: finalInventory,
        rawMain: finalInventory ? [...finalInventory.slice(0, 6), ...Array(6).fill('')].slice(0, 6) : null,
        rawBackpack: finalInventory ? Array(3).fill('') : null,
        ft: row[24] == null ? null : row[24],
      };
    });
  }

  function isPublicManifest(payload) {
    return ['opendota-public-items-manifest-v2', 'opendota-public-items-manifest-v3', 'opendota-public-items-manifest-v4'].includes(payload?.schema);
  }

  function decodePublicHeroPayload(payload) {
    if (!['opendota-public-hero-v2', 'opendota-public-hero-v3', 'opendota-public-hero-v4'].includes(payload?.schema)) return decodeCorePayload(payload);
    const dictionaries = payload.dictionaries || {}, hero = payload.hero || '';
    const value = (field, index) => index == null || index < 0 ? '' : (dictionaries[field]?.[index] ?? '');
    return (payload.records || []).map(row => {
      const slot = Number(row[3]), radiant = slot < 128;
      const v4 = payload.schema === 'opendota-public-hero-v4';
      const decodeSlots = (encoded, size) => Array.from(
        { length: size },
        (_, index) => value('item', Array.isArray(encoded) ? encoded[index] : -1),
      );
      const rawMain = v4
        ? decodeSlots(row[9], 6)
        : [...(Array.isArray(row[9]) ? row[9].map(index => value('item', index)).filter(Boolean) : []), ...Array(6).fill('')].slice(0, 6);
      const rawBackpack = v4 ? decodeSlots(row[10], 3) : Array(3).fill('');
      const cohortCode = v4 ? row[11] : row[10];
      const cohort = cohortCode === 0
        ? 'pure_immortal'
        : cohortCode === 1 ? 'immortal_divine' : (row.length < 11 ? 'pure_immortal' : '');
      const main = rawMain.filter(Boolean), backpack = rawBackpack.filter(Boolean);
      return {
        m: row[0], d: value('d', row[1]), p: value('p', row[2]),
        l: `OpenDota ${publicCohortName(cohort)}天梯`, t: radiant ? '天辉' : '夜魇',
        s: '', n: '匿名公开局玩家', h: hero, hi: payload.hero_id,
        sl: slot, tm: radiant ? 2 : 3, r: null, rm: '公开局未判位',
        w: row[4], lv: row[5], nw: row[6], du: row[7], i: [], u: null,
        x: { rank: row[8] },
        f: main, b: backpack, fi: [...main, ...backpack], rawMain, rawBackpack,
        ft: row[7], src: 'opendota', c: cohort, inventoryVersion: v4 ? 2 : 1,
      };
    });
  }

  const finalInventory = row => Array.isArray(row?.fi) ? row.fi : (Array.isArray(row?.f) ? row.f : null);

  function includeItem(id, scope, row) {
    const canonical = canonicalFinalItemId(id), item = items[id] || items[canonical] || {};
    const rule = itemRule(id, row);
    if ((item.class && item.class !== 'regular') || item.consumable || id.startsWith('item_recipe')) return false;
    if (scope === 'regular') return true;
    if (scope === 'completed') return rule.completed || coreAllow.has(canonical) || rule.cost >= 900;
    return rule.completed || routeNodeClasses.has(item.routeClass) || coreAllow.has(canonical)
      || (!item.routeClass && completedCategories.has(item.category));
  }

  function finalItems(row, scope) {
    const inventory = finalInventory(row);
    if (!Array.isArray(inventory)) return [];
    const ids = inventory.filter(id => includeItem(id, scope, row)).map(canonicalFinalItemId);
    return [...new Set(ids)].sort((a, b) =>
      itemRule(b, row).cost - itemRule(a, row).cost || a.localeCompare(b));
  }

  function comboEligible(id, row) {
    const canonical = canonicalFinalItemId(id), item = items[id] || items[canonical] || {};
    const rule = itemRule(id, row);
    return Boolean(rule.completed && (!item.class || item.class === 'regular') && !item.consumable
      && !id.startsWith('item_recipe') && rule.cost > comboMinCost);
  }

  function comboItems(row) {
    const inventory = finalInventory(row);
    if (!Array.isArray(inventory)) return [];
    return inventory.filter(id => comboEligible(id, row)).map(canonicalFinalItemId).sort((a, b) =>
      itemRule(b, row).cost - itemRule(a, row).cost || a.localeCompare(b));
  }

  function renderCostCatalog() {
    const selectedPatch = controls.patch.value;
    const optionPatches = [...controls.patch.options].map(option => option.value).filter(Boolean);
    const patches = selectedPatch ? [selectedPatch] : (optionPatches.length ? optionPatches : Object.keys(itemRulesByPatch));
    const candidates = new Set(Object.keys(items));
    patches.forEach(patch => Object.keys(itemRulesByPatch[patch] || {}).forEach(id => candidates.add(id)));
    const eligible = [...candidates].map(id => {
      const canonical = canonicalFinalItemId(id), item = items[id] || items[canonical] || {};
      const costs = patches.map(patch => itemRuleForPatch(id, patch))
        .filter(rule => rule.completed && rule.cost > comboMinCost && (!item.class || item.class === 'regular') && !item.consumable)
        .map(rule => rule.cost);
      return costs.length ? { id: canonical, costs } : null;
    }).filter(Boolean);
    const unique = [...new Map(eligible.map(entry => [entry.id, entry])).values()].sort((a, b) =>
      Math.min(...a.costs) - Math.min(...b.costs) || itemName(a.id).localeCompare(itemName(b.id)));
    const patchText = selectedPatch || (patches.length === 1 ? patches[0] : `跨${patches.length}个版本`);
    document.getElementById('id-cost-catalog-count').textContent = `${unique.length}件成装 · ${patchText}`;
    document.getElementById('id-cost-catalog-list').innerHTML = unique.map(entry => {
      const minimum = Math.min(...entry.costs), maximum = Math.max(...entry.costs);
      const costText = minimum === maximum ? minimum.toLocaleString() : `${minimum.toLocaleString()}–${maximum.toLocaleString()}`;
      return `<span>${itemIcon(entry.id, true)}<b>${esc(itemName(entry.id))}</b><small>${costText} 金币</small></span>`;
    }).join('');
  }

  function createStat(ids) {
    return { ids, count: 0, wins: 0, durations: [] };
  }

  function addCombo(map, ids, row) {
    const key = [...ids].sort().join('|');
    const stat = map.get(key) || createStat([...ids].sort());
    stat.count += 1; stat.wins += Number(row.w || 0);
    if (Number.isFinite(Number(row.du))) stat.durations.push(Number(row.du));
    map.set(key, stat);
  }

  function addCombinations(map, ids, size, row) {
    const selected = [], seen = new Set();
    const visit = start => {
      if (selected.length === size) {
        const key = [...selected].sort().join('|');
        if (!seen.has(key)) {
          seen.add(key);
          addCombo(map, selected, row);
        }
        return;
      }
      const needed = size - selected.length;
      for (let index = start; index <= ids.length - needed; index += 1) {
        selected.push(ids[index]);
        visit(index + 1);
        selected.pop();
      }
    };
    visit(0);
  }

  function finalize(stat, totalRows, totalWins) {
    const otherGames = totalRows - stat.count, otherWins = totalWins - stat.wins;
    const winRate = stat.count ? stat.wins / stat.count : 0;
    const otherRate = otherGames ? otherWins / otherGames : null;
    const interval = wilson(stat.wins, stat.count);
    return {
      ...stat, rate: totalRows ? stat.count / totalRows : 0, winRate,
      delta: otherRate == null ? null : winRate - otherRate,
      duration: median(stat.durations), interval,
    };
  }

  function analyze(rows) {
    const singleMap = new Map();
    const comboMaps = {
      pairs: new Map(), trios: new Map(), fours: new Map(),
      fives: new Map(), sixes: new Map(),
    };
    const comboSizes = { pairs: 2, trios: 3, fours: 4, fives: 5, sixes: 6 };
    const totalWins = rows.reduce((sum, row) => sum + Number(row.w || 0), 0);
    let sixEligibleRows = 0;
    rows.forEach(row => {
      const singleIds = finalItems(row, controls.scope.value || 'core');
      const comboIds = comboItems(row);
      if (comboIds.length >= 6) sixEligibleRows += 1;
      singleIds.forEach(id => {
        const stat = singleMap.get(id) || createStat([id]);
        stat.count += 1; stat.wins += Number(row.w || 0);
        if (Number.isFinite(Number(row.du))) stat.durations.push(Number(row.du));
        singleMap.set(id, stat);
      });
      Object.entries(comboSizes).forEach(([kind, size]) => {
        if (comboIds.length >= size) addCombinations(comboMaps[kind], comboIds, size, row);
      });
    });
    const finish = map => [...map.values()].map(stat => finalize(stat, rows.length, totalWins));
    return {
      singles: finish(singleMap),
      ...Object.fromEntries(Object.entries(comboMaps).map(([kind, map]) => [kind, finish(map)])),
      totalWins, sixEligibleRows,
    };
  }

  function visibleStats(values, kind) {
    const minimum = Number(controls.min.value || 5), query = normalize(controls.search.value);
    const filtered = values.filter(stat => stat.count >= minimum && (!query || stat.ids.some(id => normalize(itemName(id)).includes(query))));
    const [property, direction] = state.sorts[kind] || ['count', 'desc'];
    return filtered.sort((a, b) => {
      const av = property === 'name' ? itemName(a.ids[0]) : a[property];
      const bv = property === 'name' ? itemName(b.ids[0]) : b[property];
      if (typeof av === 'string') return (direction === 'asc' ? 1 : -1) * av.localeCompare(bv);
      const left = Number.isFinite(av) ? av : -Infinity, right = Number.isFinite(bv) ? bv : -Infinity;
      return (direction === 'asc' ? 1 : -1) * (left - right) || b.count - a.count;
    });
  }

  function deltaHtml(value) {
    if (!Number.isFinite(value)) return '<span class="id-delta is-neutral">—</span>';
    const cls = value >= .025 ? 'is-positive' : value <= -.025 ? 'is-negative' : 'is-neutral';
    return `<span class="id-delta ${cls}">${pct(value, 1, true)}</span>`;
  }

  function renderKpis(allRows, rows, analysis) {
    const matches = new Set(rows.map(row => row.m)).size;
    document.getElementById('id-kpi-games').textContent = rows.length.toLocaleString();
    document.getElementById('id-kpi-matches').textContent = matches.toLocaleString();
    document.getElementById('id-kpi-winrate').textContent = pct(analysis.totalWins, rows.length);
    document.getElementById('id-kpi-coverage').textContent = pct(rows.length, allRows.length);
    document.getElementById('id-kpi-sixes').textContent = pct(analysis.sixEligibleRows, rows.length);
  }

  function renderConclusions(analysis) {
    const minimum = Number(controls.min.value || 5);
    const singles = analysis.singles.filter(row => row.count >= minimum).sort((a, b) => b.count - a.count);
    const reliable = singles.filter(row => row.count >= Math.max(minimum, Math.ceil(state.filtered.length * .03)) && Number.isFinite(row.delta)).sort((a, b) => b.delta - a.delta);
    const pair = analysis.pairs.filter(row => row.count >= minimum).sort((a, b) => b.count - a.count)[0];
    const trio = analysis.trios.filter(row => row.count >= minimum).sort((a, b) => b.count - a.count)[0];
    const four = analysis.fours.filter(row => row.count >= minimum).sort((a, b) => b.count - a.count)[0];
    const five = analysis.fives.filter(row => row.count >= minimum).sort((a, b) => b.count - a.count)[0];
    const six = analysis.sixes.filter(row => row.count >= minimum).sort((a, b) => b.count - a.count)[0];
    const cards = [
      { code: 'MOST HELD', title: '最常见最终单件', stat: singles[0], text: stat => `${stat.count}局 · ${pct(stat.rate, 1)}终局持有 · ${timeText(stat.duration)}中位时长` },
      { code: 'RELATIVE SIGNAL', title: '稳定正向关联', stat: reliable[0], text: stat => `${stat.count}局 · ${pct(stat.winRate, 1)}胜率 · 相对未持有${pct(stat.delta, 1, true)}` },
      { code: 'FINAL PAIR', title: '最常见最终两件套', stat: pair, text: stat => `${stat.count}局 · ${pct(stat.rate, 1)}终局组合率 · ${timeText(stat.duration)}中位时长` },
      { code: 'FINAL THREE', title: '最常见最终三件套', stat: trio, text: stat => `${stat.count}局 · ${pct(stat.winRate, 1)}胜率 · ${timeText(stat.duration)}中位时长` },
      { code: 'FINAL FOUR', title: '最常见最终四件套', stat: four, text: stat => `${stat.count}局 · ${pct(stat.rate, 1)}终局组合率 · ${timeText(stat.duration)}中位时长` },
      { code: 'FINAL FIVE', title: '最常见最终五件套', stat: five, text: stat => `${stat.count}局 · ${pct(stat.winRate, 1)}胜率 · ${timeText(stat.duration)}中位时长` },
      { code: 'FINAL SIX', title: '最常见最终六件套', stat: six, text: stat => `${stat.count}局 · ${pct(stat.winRate, 1)}胜率 · ${timeText(stat.duration)}中位时长` },
    ];
    document.getElementById('id-conclusions').innerHTML = cards.map(card => card.stat ? `<article><span>${card.code}</span><h3>${esc(card.title)}</h3><div>${card.stat.ids.map(id => itemIcon(id, card.stat.ids.length > 1)).join('')}</div><p>${esc(card.text(card.stat))}</p></article>` : `<article class="is-empty"><span>${card.code}</span><h3>${esc(card.title)}</h3><p>当前最低样本下暂无结论</p></article>`).join('');
    const top = singles.slice(0, 10), maximum = Math.max(1, ...top.map(row => row.rate));
    document.getElementById('id-overview-items').innerHTML = top.length ? top.map(row => `<button type="button" data-id-open-single="${esc(row.ids[0])}"><span>${itemIcon(row.ids[0], false)}</span><i><b style="width:${Math.max(3, row.rate * 100 / maximum)}%"></b></i><em>${pct(row.rate, 1)}</em>${deltaHtml(row.delta)}<small>${row.count}局</small></button>`).join('') : '<div class="id-empty">当前样本下没有达到门槛的装备</div>';
  }

  function renderSingleTable(analysis) {
    const rows = visibleStats(analysis.singles, 'single').slice(0, 120);
    document.getElementById('id-single-body').innerHTML = rows.length ? rows.map(row => `<tr><td>${itemIcon(row.ids[0], false)}</td><td>${pct(row.rate, 1)}</td><td>${row.count}</td><td class="${row.winRate >= .5 ? 'is-win' : 'is-loss'}">${pct(row.winRate, 1)}</td><td>${deltaHtml(row.delta)}</td><td>${pct(row.interval[0], 1)}–${pct(row.interval[1], 1)}</td><td>${timeText(row.duration)}</td></tr>`).join('') : emptyRow(7, '没有达到当前最低样本的最终装备');
  }

  function renderComboTable(analysis, kind) {
    const bodies = {
      pairs: 'id-pair-body', trios: 'id-trio-body', fours: 'id-four-body',
      fives: 'id-five-body', sixes: 'id-six-body',
    };
    const values = analysis[kind] || [];
    const rows = visibleStats(values, kind).slice(0, 100);
    const target = document.getElementById(bodies[kind]);
    target.innerHTML = rows.length ? rows.map(row => `<tr><td><span class="id-combo">${row.ids.map(id => itemIcon(id, true)).join('<i>+</i>')}</span></td><td>${pct(row.rate, 1)}</td><td>${row.count}</td><td class="${row.winRate >= .5 ? 'is-win' : 'is-loss'}">${pct(row.winRate, 1)}</td><td>${deltaHtml(row.delta)}</td><td>${pct(row.interval[0], 1)}–${pct(row.interval[1], 1)}</td><td>${timeText(row.duration)}</td></tr>`).join('') : emptyRow(7, '没有达到当前最低样本的最终装备组合');
  }

  function renderEvidence(rows) {
    const html = [...rows].sort((a, b) => String(b.d).localeCompare(String(a.d)) || Number(b.m) - Number(a.m)).slice(0, 60).map(row => {
      const query = new URLSearchParams({ mode: 'hero', hero: row.h, from: row.d, to: row.d, tab: 'matches' });
      const isPublic = row.src === 'opendota' || state.activeSource === 'public';
      const identity = isPublic ? '匿名公开局玩家' : (row.n || row.s || '未知选手');
      const team = isPublic ? (row.t || '公开匹配') : (row.t || '未知战队');
      const scopeCell = isPublic
        ? `${publicCohortName(row.c)}<small>十人段位复核</small>`
        : `${row.r ? `${row.r}号位` : '未判位'}<small>${esc(row.rm || '未知方法')}</small>`;
      const action = isPublic
        ? `<a href="https://www.opendota.com/matches/${encodeURIComponent(row.m)}" target="_blank" rel="noopener">OpenDota</a>`
        : `<a href="pro_builds.html?${query.toString()}">继续复盘</a>`;
      const slot = (id, index) => id
        ? `<span class="id-inventory-slot" data-slot="${index + 1}">${itemIcon(id, true)}</span>`
        : `<span class="id-inventory-slot is-empty" data-slot="${index + 1}" aria-label="空槽"><i>—</i></span>`;
      const publicInventory = `<div class="id-inventory-slots"><div class="id-inventory-main"><b>主栏6</b><span>${(row.rawMain || Array(6).fill('')).map(slot).join('')}</span></div><div class="id-inventory-backpack"><b>背包3${row.inventoryVersion === 1 ? '（旧缓存未采集）' : ''}</b><span>${(row.rawBackpack || Array(3).fill('')).map(slot).join('')}</span></div></div>`;
      const proInventory = finalItems(row, controls.scope.value || 'core');
      const inventoryHtml = isPublic
        ? publicInventory
        : `<span class="id-route">${proInventory.length ? proInventory.map(id => `<span>${itemIcon(id, true)}</span>`).join('') : '<em>终局六格内没有当前范围装备</em>'}</span>`;
      const timing = isPublic
        ? `九格终局快照 · 比赛 ${timeText(Number(row.du))}`
        : (Number.isFinite(Number(row.ft)) ? `终局 ${timeText(Number(row.ft))} · 比赛 ${timeText(Number(row.du))}` : `比赛 ${timeText(Number(row.du))}`);
      return `<tr><td><b>${esc(row.m)}</b><small>${esc(row.d)} · ${esc(effectivePatch(row))} · ${esc(row.l || (isPublic ? 'OpenDota公开局' : '未知赛事'))}</small></td><td><b>${esc(identity)}</b><small>${esc(team)}</small></td><td>${scopeCell}</td><td>${inventoryHtml}<small>${timing}</small></td><td class="${row.w ? 'is-win' : 'is-loss'}">${row.w ? '胜利' : '失败'}</td><td>${action}</td></tr>`;
    }).join('');
    document.getElementById('id-evidence-body').innerHTML = html || emptyRow(6, '当前范围没有真实比赛样本');
  }

  function renderAll() {
    if (!state.filtered.length) return;
    state.analysis = analyze(state.filtered);
    renderKpis(state.scopeRows, state.filtered, state.analysis);
    renderConclusions(state.analysis);
    renderSingleTable(state.analysis);
    renderComboTable(state.analysis, 'pairs');
    renderComboTable(state.analysis, 'trios');
    renderComboTable(state.analysis, 'fours');
    renderComboTable(state.analysis, 'fives');
    renderComboTable(state.analysis, 'sixes');
    renderEvidence(state.filtered);
  }

  function applyTab(name, updateUrl) {
    const valid = ['overview', 'single', 'pairs', 'trios', 'fours', 'fives', 'sixes', 'evidence'];
    state.activeTab = valid.includes(name) ? name : 'overview';
    document.querySelectorAll('[data-id-tab]').forEach(button => {
      const active = button.dataset.idTab === state.activeTab;
      button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-id-panel]').forEach(panel => {
      const active = panel.dataset.idPanel === state.activeTab;
      panel.classList.toggle('is-active', active); panel.hidden = !active;
    });
    if (updateUrl && state.selectedHero) {
      const url = new URL(location.href); url.searchParams.set('tab', state.activeTab);
      history.replaceState(null, '', url);
    }
  }

  function updateGenerateState() {
    const entry = Object.entries(heroes).find(([id, hero]) => normalize(hero.name) === normalize(controls.hero.value) || normalize(id) === normalize(controls.hero.value));
    state.selectedHero = entry?.[0] || '';
    const heroSummary = state.publicManifest?.heroes?.[state.selectedHero];
    const sourceReady = state.publicManifest
      ? Number(publicCohortSummary(heroSummary).records || 0) > 0
      : Boolean(state.rows.length);
    const scopeName = state.activeSource === 'public'
      ? selectedPublicCohortName()
      : roleName(controls.role.value);
    const unavailable = state.selectedHero && !sourceReady ? ' · 当前段位组暂无样本' : '';
    generate.disabled = !state.selectedHero || !sourceReady || Boolean(state.loadingSource) || Boolean(state.loadingHero);
    document.getElementById('id-generate-summary').innerHTML = state.selectedHero
      ? `<b>${esc(heroName(state.selectedHero))}</b><span>${esc(sourceName())} · ${esc(scopeName)} · ${esc(controls.patch.value || '全部版本')} · ${esc(controls.from.value || '最早')}至${esc(controls.to.value || '最新')}${esc(unavailable)}</span>`
      : '先选择一名英雄';
  }

  function loadPublicHero(hero, scroll) {
    if (!state.publicManifest || state.loadingHero) return;
    const cached = state.publicHeroRows.get(hero);
    if (cached) {
      state.rows = cached; state.loadedPublicHero = hero;
      runStudy(scroll);
      return;
    }
    const summary = state.publicManifest.heroes?.[hero];
    if (!summary?.url) {
      status.className = 'id-load-status is-error';
      status.textContent = `当前高端公开局缓存没有 ${heroName(hero)} 的分片。`;
      return;
    }
    state.loadingHero = hero; generate.disabled = true;
    status.className = 'id-load-status';
    status.textContent = `正在按需载入 ${heroName(hero)} 的高端公开局终局九格…`;
    fetch(summary.url, { cache: 'no-cache' })
      .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then(payload => {
        const rows = decodePublicHeroPayload(payload);
        if (state.publicHeroRows.size >= 3) state.publicHeroRows.delete(state.publicHeroRows.keys().next().value);
        state.publicHeroRows.set(hero, rows);
        state.loadingHero = '';
        if (state.activeSource !== 'public' || state.selectedHero !== hero) {
          updateGenerateState();
          return;
        }
        state.rows = rows; state.loadedPublicHero = hero;
        updateGenerateState(); runStudy(scroll);
      })
      .catch(error => {
        state.loadingHero = ''; updateGenerateState();
        status.className = 'id-load-status is-error';
        status.textContent = `${heroName(hero)} 高端公开局分片载入失败：${error.message}`;
      });
  }

  function runStudy(scroll) {
    updateGenerateState();
    if (!state.selectedHero) { controls.hero.focus(); return; }
    if (state.publicManifest && state.loadedPublicHero !== state.selectedHero) {
      loadPublicHero(state.selectedHero, scroll);
      return;
    }
    const from = controls.from.value, to = controls.to.value;
    const rows = state.rows.filter(row => row.h === state.selectedHero
      && (!sourceConfig[state.activeSource].role || !controls.role.value || String(row.r || '') === controls.role.value)
      && (state.activeSource !== 'public' || row.c === controls.cohort.value)
      && (!controls.patch.value || effectivePatch(row) === controls.patch.value)
      && (!from || row.d >= from) && (!to || row.d <= to));
    if (!rows.length) {
      status.className = 'id-load-status is-error';
      const rankHint = state.activeSource === 'public' ? `的${selectedPublicCohortName()}` : '';
      status.textContent = `当前条件没有${sourceName()}${rankHint}样本，请扩大日期${sourceConfig[state.activeSource].role ? '或取消位置限制' : ''}。`;
      return;
    }
    const inventoryRows = rows.filter(row => Array.isArray(finalInventory(row)));
    if (!inventoryRows.length) {
      status.className = 'id-load-status is-error';
      status.textContent = '当前条件有比赛，但没有可验证的终局背包快照；本页不会用购买日志冒充最终装备。';
      return;
    }
    state.scopeRows = rows;
    state.filtered = inventoryRows;
    const hero = heroes[state.selectedHero] || {};
    document.getElementById('id-context-icon').src = hero.icon || '';
    document.getElementById('id-context-icon').alt = hero.name || state.selectedHero;
    document.getElementById('id-context-title').textContent = hero.name || state.selectedHero;
    const roleScope = state.activeSource === 'public' ? selectedPublicCohortName() : roleName(controls.role.value);
    document.getElementById('id-context-scope').textContent = `${sourceName()} · ${roleScope} · ${controls.patch.value || '全部版本'} · ${from || state.meta.date_min} — ${to || state.meta.date_max}`;
    document.getElementById('id-context-count').textContent = `${inventoryRows.length.toLocaleString()}个终局装备快照 / ${rows.length.toLocaleString()}个选手英雄局`;
    results.hidden = false; page.classList.remove('is-unselected');
    status.className = 'id-load-status is-ready';
    status.textContent = `已生成 ${hero.name || state.selectedHero} 的${sourceName()}${state.activeSource === 'public' ? `（${selectedPublicCohortName()}）` : ''}最终装备组合研究；所有口径使用独立分母。`;
    renderAll(); applyTab(state.activeTab, false);
    const url = new URL(location.href);
    [['source', state.activeSource], ['hero', state.selectedHero], ['role', sourceConfig[state.activeSource].role ? controls.role.value : ''], ['cohort', state.activeSource === 'public' ? controls.cohort.value : ''], ['patch', controls.patch.value], ['from', from], ['to', to], ['tab', state.activeTab], ['run', '1']].forEach(([key, value]) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key));
    history.replaceState(null, '', url);
    if (scroll) results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderHotHeroes() {
    let hot;
    if (state.publicManifest) {
      hot = Object.entries(state.publicManifest.heroes || {})
        .map(([id, summary]) => [id, Number(publicCohortSummary(summary).records || 0)])
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]).slice(0, 10);
    } else {
      const latest = state.meta.date_max || '', from = latest ? new Date(`${latest}T00:00:00Z`) : null;
      if (from) from.setUTCDate(from.getUTCDate() - 29);
      const minDate = from ? from.toISOString().slice(0, 10) : '';
      const counts = new Map();
      state.rows.forEach(row => { if (!minDate || row.d >= minDate) counts.set(row.h, (counts.get(row.h) || 0) + 1); });
      hot = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    }
    document.getElementById('id-hot-label').textContent = state.publicManifest
      ? `${selectedPublicCohortName()}热门`
      : '近期职业热门';
    document.getElementById('id-hot-heroes').innerHTML = hot.length ? hot.map(([id, count]) => {
      const hero = heroes[id] || {};
      return `<button type="button" data-id-hero="${esc(id)}" title="选择 ${esc(hero.name || id)}；不会立即生成"><img src="${esc(hero.icon || '')}" alt=""><span><b>${esc(hero.name || id)}</b><small>${count}局</small></span></button>`;
    }).join('') : '<i>当前段位组暂无英雄样本</i>';
  }

  function fillInitialControls(useParams) {
    const heroEntries = Object.entries(heroes).sort((a, b) => String(a[1].name).localeCompare(String(b[1].name)));
    document.getElementById('id-hero-list').innerHTML = heroEntries.map(([, hero]) => `<option value="${esc(hero.name)}"></option>`).join('');
    const patchSource = state.publicManifest
      ? effectivePatchesForMeta(state.meta)
      : state.rows.map(effectivePatch);
    const patches = [...new Set(patchSource.filter(Boolean))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    controls.patch.innerHTML = '<option value="">全部版本</option>' + patches.map(patch => `<option value="${esc(patch)}">${esc(patch)}</option>`).join('');
    const maxDate = state.meta.date_max || state.rows.reduce((max, row) => row.d > max ? row.d : max, '');
    const minDate = state.meta.date_min || state.rows.reduce((min, row) => !min || row.d < min ? row.d : min, '');
    const isPublic = state.activeSource === 'public';
    document.getElementById('id-role-wrap').hidden = isPublic;
    document.getElementById('id-public-cohort-wrap').hidden = !isPublic;
    controls.role.disabled = isPublic;
    controls.cohort.disabled = !isPublic;
    document.getElementById('id-role-label').textContent = '职责位置';
    if (isPublic) controls.role.value = '';
    const requestedCohort = useParams ? (params.get('cohort') || '') : '';
    controls.cohort.value = PUBLIC_COHORTS[requestedCohort] ? requestedCohort : 'pure_immortal';
    if (!maxDate || !minDate) {
      controls.from.value = controls.to.value = '';
      controls.from.removeAttribute('min'); controls.from.removeAttribute('max');
      controls.to.removeAttribute('min'); controls.to.removeAttribute('max');
      renderSourceChrome(); renderHotHeroes(); renderCostCatalog(); updateGenerateState();
      return;
    }
    controls.from.min = controls.to.min = minDate; controls.from.max = controls.to.max = maxDate;
    controls.to.value = useParams ? (params.get('to') || maxDate) : maxDate;
    const recent = new Date(`${maxDate}T00:00:00Z`); recent.setUTCDate(recent.getUTCDate() - 29);
    controls.from.value = useParams && params.get('from') ? params.get('from') : (recent.toISOString().slice(0, 10) < minDate ? minDate : recent.toISOString().slice(0, 10));
    controls.role.value = sourceConfig[state.activeSource].role && useParams ? (params.get('role') || '') : '';
    const requestedPatch = useParams ? (params.get('patch') || '') : '';
    controls.patch.value = patches.includes(requestedPatch) ? requestedPatch : '';
    const requestedHero = useParams ? (params.get('hero') || '') : state.selectedHero;
    if (requestedHero && heroes[requestedHero]) controls.hero.value = heroName(requestedHero);
    renderSourceChrome(); renderHotHeroes(); renderCostCatalog(); updateGenerateState();
  }

  function renderFreshness() {
    const host = document.getElementById('id-freshness'), latest = state.meta.date_max || '';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(latest) ? new Date(`${latest}T00:00:00Z`) : null;
    const today = new Date(), age = date ? Math.max(0, Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - date.getTime()) / 86400000)) : null;
    const level = age == null ? 'bad' : age <= 2 ? 'good' : age <= 7 ? 'warn' : 'bad';
    host.className = `is-${level}`;
    const sample = sourceConfig[state.activeSource].ready(state.meta);
    host.innerHTML = `<span></span><div><strong>${age == null ? '数据日期未知' : age === 0 ? '数据截至今天' : `数据落后 ${age} 天`}</strong><small>${esc(sample)} · 最新 ${esc(latest || '未知')}</small></div>`;
  }

  function renderSourceChrome() {
    document.querySelectorAll('[data-id-source]').forEach(button => {
      const active = button.dataset.idSource === state.activeSource;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
      button.disabled = state.loadingSource === button.dataset.idSource;
    });
    const isPublic = state.activeSource === 'public';
    document.getElementById('id-source-note').textContent = isPublic
      ? `当前选择“${selectedPublicCohortName()}”：${PUBLIC_COHORTS[controls.cohort.value]?.detail || ''}。两组互斥并分别统计，主栏6格与背包3格合并为九格装备池。`
      : '当前统计职业比赛，不与公开局共用分母。';
    document.getElementById('id-evidence-note').textContent = isPublic
      ? `最多展示最近60个${selectedPublicCohortName()}匿名公开局；按原槽位分开显示主栏6格与背包3格`
      : '最多展示最近60个有终局快照的选手英雄局，可进入职业出装页继续复盘';
    document.getElementById('id-evidence-role-head').textContent = isPublic ? '段位组' : '位置';
    document.getElementById('id-evidence-inventory-head').textContent = isPublic ? '主栏6＋背包3' : '最终装备';
  }

  function applyDataset(name, payload, useParams) {
    state.activeSource = name;
    state.meta = payload.meta || {};
    state.publicManifest = name === 'public' && isPublicManifest(payload) ? payload : null;
    state.rows = state.publicManifest ? [] : decodeCorePayload(payload);
    state.loadedPublicHero = '';
    state.scopeRows = []; state.filtered = []; state.analysis = null;
    results.hidden = true; page.classList.add('is-unselected');
    fillInitialControls(useParams); renderFreshness();
    const count = document.getElementById(`id-source-${name}-count`);
    const readyText = sourceConfig[name].ready(state.meta);
    if (count) count.textContent = readyText;
    const available = state.publicManifest
      ? Number(state.meta.cohorts?.[controls.cohort.value]?.matches
          ?? (controls.cohort.value === 'pure_immortal' ? state.meta.matches : 0)) > 0
        && Object.keys(state.publicManifest.heroes || {}).length > 0
      : state.rows.length > 0;
    status.className = available ? 'id-load-status is-ready' : 'id-load-status is-error';
    status.textContent = available
      ? (state.publicManifest
        ? `${readyText} · 清单已就绪，选择英雄后按需载入分片`
        : `${readyText} · ${state.rows.length.toLocaleString()}个英雄终局快照已就绪`)
      : `${sourceName()}暂时没有可用样本，请先运行公开局采集脚本。`;
    const url = new URL(location.href);
    if (name === 'pro') url.searchParams.delete('source'); else url.searchParams.set('source', name);
    if (name === 'public') url.searchParams.set('cohort', controls.cohort.value);
    else url.searchParams.delete('cohort');
    ['run', 'role', 'patch', 'from', 'to'].forEach(key => { if (!useParams) url.searchParams.delete(key); });
    history.replaceState(null, '', url);
    if (useParams && params.get('run') === '1' && state.selectedHero) runStudy(false);
    else applyTab(state.activeTab, false);
  }

  function loadSource(name, useParams) {
    if (!sourceConfig[name] || state.loadingSource) return;
    const cached = state.datasets.get(name);
    if (cached) { applyDataset(name, cached, useParams); return; }
    state.loadingSource = name; generate.disabled = true;
    const count = document.getElementById(`id-source-${name}-count`);
    if (count) count.textContent = '正在载入…';
    status.className = 'id-load-status'; status.textContent = `正在载入${sourceConfig[name].label}缓存…`;
    renderSourceChrome();
    fetch(sourceConfig[name].url, { cache: 'no-cache' })
      .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then(payload => {
        state.datasets.set(name, payload); state.loadingSource = '';
        applyDataset(name, payload, useParams);
      })
      .catch(error => {
        state.loadingSource = '';
        if (count) count.textContent = '载入失败';
        renderSourceChrome();
        status.className = 'id-load-status is-error';
        status.textContent = `${sourceConfig[name].label}载入失败：${error.message}`;
        if (!state.rows.length) document.getElementById('id-freshness').innerHTML = '<span></span><div><strong>数据不可用</strong><small>请稍后刷新页面</small></div>';
      });
  }

  function setPreset(value) {
    const min = state.meta.date_min || controls.from.min, max = state.meta.date_max || controls.to.max;
    controls.to.value = max;
    if (value === 'all') controls.from.value = min;
    else {
      const date = new Date(`${max}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - Number(value) + 1);
      controls.from.value = date.toISOString().slice(0, 10) < min ? min : date.toISOString().slice(0, 10);
    }
    updateGenerateState();
  }

  function bindEvents() {
    document.getElementById('id-source-switch').addEventListener('click', event => {
      const button = event.target.closest('[data-id-source]');
      if (!button || button.dataset.idSource === state.activeSource) return;
      loadSource(button.dataset.idSource, false);
    });
    controls.hero.addEventListener('input', updateGenerateState);
    [controls.role, controls.from, controls.to].forEach(control => control.addEventListener('change', updateGenerateState));
    controls.patch.addEventListener('change', () => { renderCostCatalog(); updateGenerateState(); });
    controls.cohort.addEventListener('change', () => {
      if (state.activeSource !== 'public') return;
      state.scopeRows = []; state.filtered = []; state.analysis = null;
      results.hidden = true; page.classList.add('is-unselected');
      renderSourceChrome(); renderHotHeroes(); updateGenerateState(); renderFreshness();
      const cohortMatches = Number(state.meta.cohorts?.[controls.cohort.value]?.matches || 0);
      status.className = cohortMatches ? 'id-load-status is-ready' : 'id-load-status is-error';
      status.textContent = cohortMatches
        ? `已切换到${selectedPublicCohortName()}：${cohortMatches.toLocaleString()}场比赛；请选择英雄并重新生成。`
        : `${selectedPublicCohortName()}样本仍在回填，当前还没有可分析比赛。`;
      const url = new URL(location.href);
      url.searchParams.set('cohort', controls.cohort.value);
      url.searchParams.delete('run');
      history.replaceState(null, '', url);
    });
    document.getElementById('id-hot-heroes').addEventListener('click', event => {
      const button = event.target.closest('[data-id-hero]'); if (!button) return;
      controls.hero.value = heroName(button.dataset.idHero); updateGenerateState();
      controls.hero.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    document.querySelectorAll('[data-id-days]').forEach(button => button.addEventListener('click', () => setPreset(button.dataset.idDays)));
    generate.addEventListener('click', () => runStudy(true));
    document.getElementById('id-change-study').addEventListener('click', () => {
      document.getElementById('id-setup').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => controls.hero.focus(), 350);
    });
    document.getElementById('id-tabs').addEventListener('click', event => {
      const button = event.target.closest('[data-id-tab]'); if (button) applyTab(button.dataset.idTab, true);
    });
    [controls.scope, controls.min].forEach(control => control.addEventListener('change', renderAll));
    controls.search.addEventListener('input', () => {
      if (!state.analysis) return;
      renderSingleTable(state.analysis);
      ['pairs', 'trios', 'fours', 'fives', 'sixes'].forEach(kind => renderComboTable(state.analysis, kind));
    });
    document.getElementById('id-overview-items').addEventListener('click', event => {
      const button = event.target.closest('[data-id-open-single]'); if (!button) return;
      controls.search.value = itemName(button.dataset.idOpenSingle); renderSingleTable(state.analysis); applyTab('single', true);
      document.querySelector('[data-id-panel="single"]').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const tableKinds = {
      single: 'single', pair: 'pairs', trio: 'trios',
      four: 'fours', five: 'fives', six: 'sixes',
    };
    Object.entries(tableKinds).forEach(([tableKind, stateKey]) => {
      const table = document.getElementById(`id-${tableKind}-table`); if (!table) return;
      table.querySelectorAll('[data-id-sort]').forEach(header => header.addEventListener('click', () => {
        const current = state.sorts[stateKey], property = header.dataset.idSort;
        state.sorts[stateKey] = [property, current?.[0] === property && current[1] === 'desc' ? 'asc' : 'desc'];
        if (stateKey === 'single') renderSingleTable(state.analysis); else renderComboTable(state.analysis, stateKey);
      }));
    });
  }

  bindEvents(); renderCostCatalog(); renderSourceChrome();
  loadSource(state.activeSource, true);
})();

// ---- PRO BUILDS: professional item timing + Hero Lab theory ----
(function() {
  const page = document.querySelector('.pro-builds-page');
  const configEl = document.getElementById('pro-builds-config');
  if (!page || !configEl) return;
  let config;
  try { config = JSON.parse(configEl.textContent || '{}'); } catch { return; }
  const items = config.items || {};
  const heroes = config.heroes || {};
  const abilityNames = config.abilityNames || {};
  const abilityIcons = config.abilityIcons || {};
  const heroAbilities = config.heroAbilities || {};
  const heroTalents = config.heroTalents || {};
  const loading = document.getElementById('pb-loading');
  const dashboard = document.getElementById('pb-dashboard');
  const note = document.getElementById('pb-data-note');
  const controls = {
    patch: document.getElementById('pb-patch'),
    from: document.getElementById('pb-date-from'),
    to: document.getElementById('pb-date-to'),
    league: document.getElementById('pb-league'),
    team: document.getElementById('pb-team'),
    player: document.getElementById('pb-player'),
    hero: document.getElementById('pb-hero-select'),
    role: document.getElementById('pb-role'),
    result: document.getElementById('pb-result'),
    situation: document.getElementById('pb-situation'),
    opponent: document.getElementById('pb-opponent'),
    method: document.getElementById('pb-role-method'),
    scope: document.getElementById('pb-scope'),
  };
  const coreFilters = document.getElementById('pb-core-filters');
  const advancedFilters = document.getElementById('pb-advanced-grid');
  const advancedPanel = document.getElementById('pb-advanced-filters');
  const researchDrawer = document.getElementById('pb-research-drawer');
  const matchDrawer = document.getElementById('pb-match-drawer');
  const filterFields = new Map([...page.querySelectorAll('[data-pb-field]')].map(field => [field.dataset.pbField, field]));
  const FILTER_ORDER = ['hero', 'player', 'team', 'opponent', 'patch', 'from', 'to', 'role', 'league', 'situation', 'result', 'method', 'scope'];
  const MODE_CONFIG = {
    hero: {
      title: '设定英雄与比赛范围', description: '先选英雄和时间，直接查看职业比赛中的完整出装路线。',
      core: ['hero', 'role', 'from', 'to', 'patch'], tab: 'routes', action: '查看英雄出装路线',
    },
    player: {
      title: '设定选手与观察范围', description: '先选职业选手，可继续限定英雄，观察他的完整路线与个人偏好。',
      core: ['player', 'hero', 'role', 'from', 'to'], tab: 'people', action: '查看选手英雄研究',
    },
    scout: {
      title: '设定目标与比赛情境', description: '先选战队或选手，再从下方常用英雄中确认研究对象，最后手动生成赛前分析。',
      core: ['team', 'player', 'hero', 'opponent', 'from', 'to'], tab: 'situations', action: '生成赛前准备分析',
    },
  };
  const TAB_META = {
    routes: ['职业路线', '主线、关键时间点、装备速查与真实样本'],
    people: ['选手样本', '谁在使用、战队分布与个人路线风格'],
    situations: ['局势应对', '顺逆风、对手阵容与版本变化下的出装差异'],
    matches: ['比赛复盘', '逐局路线、技能、经济与地图活动证据'],
    quality: ['数据可信度', '来源覆盖、缺失边界与更新状态'],
  };
  const SEARCH_CONTROLS = {
    hero: { input: document.getElementById('pb-hero-search'), list: document.getElementById('pb-hero-options') },
    player: { input: document.getElementById('pb-player-search'), list: document.getElementById('pb-player-options') },
    team: { input: document.getElementById('pb-team-search'), list: document.getElementById('pb-team-options') },
    opponent: { input: document.getElementById('pb-opponent-search'), list: document.getElementById('pb-opponent-options') },
  };
  let allRows = [];
  let dataMeta = {};
  let detailData = { players: {}, drafts: {}, events: {} };
  let dynamicsData = null;
  let dynamicsPromise = null;
  let detailManifest = null;
  let detailManifestPromise = null;
  const loadedDetailBuckets = new Set();
  const pendingDetailBuckets = new Map();
  let matchTeams = new Map();
  let matchRowsById = new Map();
  let currentRows = [];
  let selectedMatchKey = '';
  const initialResearchParams = new URLSearchParams(window.location.search);
  let researchMode = MODE_CONFIG[initialResearchParams.get('mode')] ? initialResearchParams.get('mode') : initialResearchParams.has('player') ? 'player' : (initialResearchParams.has('team') || initialResearchParams.has('opponent')) ? 'scout' : 'hero';
  let scoutAnalysisSubmitted = researchMode === 'scout' && initialResearchParams.get('run') === '1';
  let activeTab = 'routes';
  let matchDrawerOpen = false;
  let lastRouteClusters = [];
  let selectedRouteClusterId = '';
  let routeTrendGrain = 'week';
  let heatmapRequested = false;
  const ROUTE_CLUSTER_VERSION = 'route-cluster-v2';
  const SAVED_VIEW_KEY = 'sloppy-pro-build-views-v1';
  let selectedItem = '';
  let matchNeutralCompanion = '';
  let matchNeutralTier = '';
  let lastItemStats = [];
  let matchSearch = '';
  let matchResult = '';
  let matchState = '';
  let matchSide = '';
  let matchPickPhase = '';
  let matchItem = '';
  let matchComebackOnly = false;
  let matchRouteOnly = false;
  let matchSortKey = 'date';
  let matchSortDir = 'desc';
  let matchVisibleLimit = 50;
  const matchColumns = new Set(['match', 'player', 'hero', 'route', 'role', 'lane10', 'nw20', 'ppi', 'draft', 'result']);
  const MATCH_COLUMN_LABELS = {
    match: '比赛 / 日期', player: '选手', team: '战队', league: '赛事', hero: '英雄',
    route: '核心出装时间线', role: '位置', side: '阵营', pick: '选人阶段',
    state: '15m局势', lane10: '10m对位经济差', nw10: '10m经济', nw15: '15m团队经济差',
    nw20: '20m经济', cs10: '10m补刀', cs20: '20m补刀', denies10: '10m反补',
    kda15: '15m KDA', lh15: '15m补刀', gpm: 'GPM', xpm: 'XPM', damage: '英雄伤害',
    towerDamage: '建筑伤害', tfp: '参战率', ppi: '职业表现指数', draft: '阵容先验',
    duration: '时长', networth: '终局经济', result: '结果',
  };
  let matchupSearch = '';
  let matchupMin = 5;
  let matchupRole = '';
  let matchupKind = 'enemy';
  let matchupMetaOnly = true;
  const performanceCohorts = new Map();
  let draftPriorScores = new Map();

  const mainFlow = page.querySelector('.pb-main');
  if (mainFlow && researchDrawer) mainFlow.prepend(researchDrawer);
  const profileInsightsSection = document.getElementById('pb-profile-insights');
  const proBriefSection = document.getElementById('pb-pro-brief');
  if (profileInsightsSection && proBriefSection) profileInsightsSection.before(proBriefSection);

  const esc = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const pct = (n, d) => d ? (n * 100 / d).toFixed(1) + '%' : '—';
  const median = values => {
    const a = values.filter(v => Number.isFinite(v)).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
  };
  const mean = values => {
    const a = values.filter(v => Number.isFinite(v));
    return a.length ? Math.round(a.reduce((sum, value) => sum + value, 0) / a.length) : null;
  };
  const timeText = seconds => {
    if (!Number.isFinite(seconds)) return '未知';
    const m = Math.floor(seconds / 60), s = Math.max(0, seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  const intervalText = seconds => Number.isFinite(seconds) ? `+${timeText(Math.max(0, Math.round(seconds)))}` : '—';
  const abilityLabel = slug => (abilityNames[slug] || String(slug || '').replace(/^.*?_/, '').replaceAll('_', ' '))
    .replace(/\{s:[^}]+\}\s*/g, '').replace(/\s{2,}/g, ' ').trim();
  const abilityStep = (slug, index, compact) => {
    const name = abilityLabel(slug), src = abilityIcons[slug];
    return `<span class="pb-ability-step ${compact ? 'is-compact' : ''}" title="第${index + 1}次加点 · ${esc(name)}"><span class="pb-ability-art">${src ? `<img src="${esc(src)}" alt="${esc(name)}" loading="lazy">` : `<b>${esc(name.slice(0, 1) || '?')}</b>`}<i>${index + 1}</i></span>${compact ? '' : `<small>${esc(name)}</small>`}</span>`;
  };
  const situation = r => !r.g || !Number.isFinite(Number(r.g[6])) ? 'unknown'
    : Number(r.g[6]) >= 1500 ? 'ahead' : Number(r.g[6]) <= -1500 ? 'behind' : 'even';
  const situationName = value => ({ ahead: '优势', even: '均势', behind: '劣势', unknown: '未知' }[value] || value);
  const rowKey = r => `${r.m}:${r.sl == null ? r.s : r.sl}`;

  function decodeCorePayload(payload) {
    if (!['pro-builds-core-v2', 'pro-builds-core-v3', 'pro-builds-core-v4'].includes(payload?.schema)) return payload?.records || [];
    const d = payload.dictionaries || {}, value = (field, index) => d[field]?.[index] ?? '';
    return (payload.records || []).map(row => {
      const itemValues = row[19] || [], decodedItems = [], hasUseData = Array.isArray(row[21]);
      const useValues = hasUseData ? row[21] : [], decodedUses = [];
      const finalValues = Array.isArray(row[23]) ? row[23] : null;
      for (let index = 0; index < itemValues.length; index += 2) decodedItems.push([value('item', itemValues[index]), itemValues[index + 1]]);
      for (let index = 0; index < useValues.length; index += 2) decodedUses.push([value('item', useValues[index]), useValues[index + 1]]);
      return {
        m: row[0], d: value('d', row[1]), p: value('p', row[2]), li: row[3],
        l: value('l', row[4]), t: value('t', row[5]), s: value('s', row[6]),
        n: value('n', row[7]), h: value('h', row[8]), hi: row[9], sl: row[10],
        tm: row[11], r: row[12], rm: value('rm', row[13]), rc: row[14],
        w: row[15], lv: row[16], nw: row[17], du: row[18], i: decodedItems,
        g: row[20], u: hasUseData ? decodedUses : null, x: row[22] || null,
        f: finalValues ? finalValues.map(index => value('item', index)).filter(Boolean) : null,
        ft: row[24] == null ? null : row[24],
      };
    });
  }

  function loadDynamics() {
    if (dynamicsData) return Promise.resolve(dynamicsData);
    if (dynamicsPromise) return dynamicsPromise;
    dynamicsPromise = fetch(config.dynamicsUrl || '_dynamics.json', { cache: 'no-cache' })
      .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then(payload => { dynamicsData = payload; return payload; });
    return dynamicsPromise;
  }

  function detailMonths(rows) {
    return [...new Set(rows.map(r => String(r.d || '').slice(0, 7)).filter(Boolean))].filter(month => detailManifest?.buckets?.[month]);
  }

  function updateDetailStatus(text) {
    const status = document.getElementById('pb-detail-status');
    if (status) status.textContent = text;
  }

  function renderFreshness(meta) {
    const host = document.getElementById('pb-freshness'); if (!host) return;
    const latest = String(meta.date_max || ''), update = meta.update_status || meta.update || {};
    const latestDate = /^\d{4}-\d{2}-\d{2}$/.test(latest) ? new Date(`${latest}T00:00:00Z`) : null;
    const today = new Date(), todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const age = latestDate && !Number.isNaN(latestDate.getTime()) ? Math.max(0, Math.floor((todayUtc - latestDate.getTime()) / 86400000)) : null;
    const failed = update.status === 'failed' || update.status === 'invalid', running = update.status === 'running';
    const level = failed ? 'bad' : running ? 'running' : age == null ? 'bad' : age <= 2 ? 'good' : age <= 7 ? 'warn' : 'bad';
    const label = failed ? '最近更新失败' : running ? '正在更新' : age == null ? '日期未知' : age === 0 ? '数据截至今天' : `数据落后 ${age} 天`;
    const completed = update.completed_at || update.failed_at || meta.generated_at || '未知';
    const changed = Number(update.new_matches || 0), refreshed = Number(update.refreshed_matches || 0);
    host.className = `pb-freshness is-${level}`;
    host.innerHTML = `<span class="pb-freshness-dot"></span><div><strong>${esc(label)}</strong><small>最新比赛 ${esc(latest || '未知')} · 更新 ${esc(completed)}${changed || refreshed ? ` · 新增${changed} / 刷新${refreshed}` : ''}</small></div>`;
  }

  function loadDetailManifest() {
    if (detailManifestPromise) return detailManifestPromise;
    detailManifestPromise = fetch(config.detailManifestUrl, { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(payload => { detailManifest = payload; updateDetailStatus(`${Object.keys(payload.buckets || {}).length}个月明细 · 按需加载`); if (activeTab === 'quality') renderDataQuality(); return payload; })
      .catch(err => { updateDetailStatus(`明细索引不可用：${err.message}`); throw err; });
    return detailManifestPromise;
  }

  async function ensureDetailRows(rows) {
    await loadDetailManifest();
    const months = detailMonths(rows);
    const missing = months.filter(month => !loadedDetailBuckets.has(month));
    if (!missing.length) return;
    const bytes = missing.reduce((sum, month) => sum + Number(detailManifest.buckets[month]?.bytes || 0), 0);
    updateDetailStatus(`正在加载 ${missing.length}个月明细 · ${(bytes / 1048576).toFixed(1)}MB`);
    await Promise.all(missing.map(month => {
      if (pendingDetailBuckets.has(month)) return pendingDetailBuckets.get(month);
      const url = detailManifest.buckets[month].url;
      const promise = fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(payload => {
        Object.assign(detailData.players, payload.players || {});
        Object.assign(detailData.drafts, payload.drafts || {});
        Object.assign(detailData.events, payload.events || {});
        loadedDetailBuckets.add(month);
      }).finally(() => pendingDetailBuckets.delete(month));
      pendingDetailBuckets.set(month, promise);
      return promise;
    }));
    updateDetailStatus(`${loadedDetailBuckets.size}个月已加载 · ${Object.keys(detailData.players).length.toLocaleString()}个选手局`);
  }

  function detailRowsReady(rows) {
    return Boolean(detailManifest) && detailMonths(rows).every(month => loadedDetailBuckets.has(month));
  }
  const wilson = (wins, games) => {
    if (!games) return [0, 0];
    const z = 1.96, p = wins / games, d = 1 + z * z / games;
    const center = (p + z * z / (2 * games)) / d;
    const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * games)) / games) / d;
    return [Math.max(0, center - margin), Math.min(1, center + margin)];
  };
  const icon = (src, name, cls) => `<img class="${cls || 'pb-item-icon'}" src="${esc(src)}" alt="${esc(name)}" loading="lazy">`;
  const option = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;
  const uniq = (rows, getter) => [...new Set(rows.map(getter).filter(Boolean))];
  const coreAllow = new Set([
    'item_magic_wand', 'item_bracer', 'item_wraith_band', 'item_null_talisman',
    'item_bottle', 'item_soul_ring', 'item_urn_of_shadows', 'item_orb_of_corrosion',
    'item_falcon_blade', 'item_blink',
  ]);
  const routeFallbackAllow = new Set([
    ...coreAllow, 'item_magic_stick', 'item_boots', 'item_wind_lace',
    'item_ring_of_basilius',
  ]);
  const teamStyleItems = new Set(['item_pipe','item_crimson_guard','item_guardian_greaves','item_lotus_orb','item_vladmir','item_spirit_vessel','item_force_staff','item_glimmer_cape','item_pavise','item_solar_crest','item_mekansm','item_boots_of_bearing']);
  const aggressionStyleItems = new Set(['item_blink','item_black_king_bar','item_desolator','item_bloodthorn','item_daedalus','item_monkey_king_bar','item_nullifier','item_sheepstick','item_orchid','item_diffusal_blade','item_basher','item_abyssal_blade']);
  const completedCategories = new Set(['Accessories', 'Support', 'Magical', 'Armor', 'Weapons', 'Armaments']);

  function includeItem(id) {
    const item = items[id];
    if (!item) return false;
    const scope = controls.scope.value || 'core';
    if (scope === 'all') return true;
    if (item.class !== 'regular' || item.consumable) return false;
    if (scope === 'regular') return true;
    return completedCategories.has(item.category) || coreAllow.has(id);
  }

  function fillSelect(select, entries) {
    const first = select.options[0] ? select.options[0].outerHTML : '<option value="">全部</option>';
    select.innerHTML = first + entries.join('');
  }

  function cleanOptionLabel(text) {
    return String(text || '').replace(/\s+\(\d+(?:场|局)?\)$/, '').trim();
  }

  function rebuildSearchControls() {
    Object.entries(SEARCH_CONTROLS).forEach(([key, binding]) => {
      const select = controls[key]; if (!select || !binding.input || !binding.list) return;
      binding.entries = [...select.options].filter(opt => opt.value).map(opt => ({ value: opt.value, label: cleanOptionLabel(opt.textContent) }));
      binding.list.innerHTML = binding.entries.map(entry => `<option value="${esc(entry.label)}"></option>`).join('');
    });
    syncSearchInputs();
  }

  function syncSearchInputs() {
    Object.entries(SEARCH_CONTROLS).forEach(([key, binding]) => {
      const select = controls[key]; if (!select || !binding.input) return;
      const entry = (binding.entries || []).find(row => row.value === select.value);
      binding.input.value = entry?.label || '';
      binding.input.setCustomValidity('');
    });
  }

  function commitSearchControl(key) {
    const binding = SEARCH_CONTROLS[key], select = controls[key]; if (!binding?.input || !select) return false;
    const typed = binding.input.value.trim();
    if (!typed) { select.value = ''; binding.input.setCustomValidity(''); return true; }
    const exact = (binding.entries || []).filter(row => row.label.toLocaleLowerCase() === typed.toLocaleLowerCase());
    const prefix = exact.length ? exact : (binding.entries || []).filter(row => row.label.toLocaleLowerCase().startsWith(typed.toLocaleLowerCase()));
    if (prefix.length === 1) {
      select.value = prefix[0].value; binding.input.value = prefix[0].label; binding.input.setCustomValidity(''); return true;
    }
    binding.input.setCustomValidity('请从搜索建议中选择一个明确结果');
    binding.input.reportValidity();
    return false;
  }

  function layoutModeFilters() {
    const mode = MODE_CONFIG[researchMode] || MODE_CONFIG.hero;
    mode.core.forEach(key => { const field = filterFields.get(key); if (field) coreFilters.appendChild(field); });
    FILTER_ORDER.filter(key => !mode.core.includes(key)).forEach(key => { const field = filterFields.get(key); if (field) advancedFilters.appendChild(field); });
    document.getElementById('pb-mode-title').textContent = mode.title;
    document.getElementById('pb-mode-description').textContent = mode.description;
    document.getElementById('pb-run-analysis').textContent = mode.action;
    const pickerTitle = page.querySelector('.pb-research-picker>header>span');
    const pickerNote = page.querySelector('.pb-research-picker>header>small');
    if (pickerTitle) pickerTitle.textContent = researchMode === 'scout' ? '按步骤完成赛前准备' : '第一步：选择研究对象';
    if (pickerNote) pickerNote.textContent = researchMode === 'scout'
      ? '选择目标和热门英雄时保持在当前页，点击生成后才进入分析'
      : '默认从英雄开始；选中后自动进入职责位置与赛前结论';
    page.querySelectorAll('[data-pb-mode]').forEach(button => {
      const selected = button.dataset.pbMode === researchMode;
      button.classList.toggle('is-active', selected); button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    refreshHeroShortcuts();
    updateResearchFlowState();
  }

  function setResearchMode(modeName, switchTab) {
    const previousMode = researchMode;
    researchMode = MODE_CONFIG[modeName] ? modeName : 'hero';
    if (researchMode === 'scout' && previousMode !== 'scout') {
      scoutAnalysisSubmitted = false;
      controls.hero.value = '';
      syncSearchInputs();
    }
    layoutModeFilters();
    if (switchTab) setActiveTab(MODE_CONFIG[researchMode].tab, false);
    if (allRows.length) render(); else syncUrl();
  }

  function controlLabel(key) {
    const select = controls[key];
    if (!select?.value) return '';
    if (SEARCH_CONTROLS[key]?.input?.value) return SEARCH_CONTROLS[key].input.value;
    return cleanOptionLabel(select.selectedOptions?.[0]?.textContent || select.value);
  }

  function primarySelectionReady() {
    if (researchMode === 'player') return Boolean(controls.player.value);
    if (researchMode === 'scout') return Boolean((controls.team.value || controls.player.value) && controls.hero.value);
    return Boolean(controls.hero.value);
  }

  function primarySelectionLabel() {
    if (researchMode === 'player') return controlLabel('player') || '职业选手';
    if (researchMode === 'scout') return controlLabel('team') || controlLabel('player') || '战队或选手';
    return controlLabel('hero') || '英雄';
  }

  function updateResearchFlowState() {
    const selectionReady = primarySelectionReady();
    const ready = selectionReady && (researchMode !== 'scout' || scoutAnalysisSubmitted);
    page.classList.toggle('is-pb-unselected', !ready);
    ['hero', 'player', 'scout'].forEach(mode => page.classList.toggle(`is-pb-mode-${mode}`, researchMode === mode));
    const step = document.getElementById('pb-research-step');
    const summary = document.getElementById('pb-research-summary');
    const summaryNote = document.getElementById('pb-research-summary-note');
    if (researchMode === 'scout') {
      const targetReady = Boolean(controls.team.value || controls.player.value);
      const target = primarySelectionLabel();
      const hero = controlLabel('hero') || '热门英雄';
      if (step) step.textContent = ready ? 'STEP 03 / ANALYSIS' : !targetReady ? 'STEP 01 / TARGET' : !controls.hero.value ? 'STEP 02 / HERO' : 'STEP 03 / READY';
      if (summary) summary.textContent = ready
        ? `${target} / ${hero} · 调整赛前准备条件`
        : !targetReady ? '选择战队或选手开始赛前准备'
          : !controls.hero.value ? `${target} · 选择热门英雄`
            : `${target} / ${hero} · 准备生成分析`;
      if (summaryNote) summaryNote.textContent = ready
        ? '目标、英雄和时间可以随时重新设定'
        : !targetReady ? '选择目标后会在下方出现该目标的热门英雄'
          : !controls.hero.value ? '选择一个热门英雄，或使用英雄搜索框'
            : '确认英雄后，点击“生成赛前准备分析”进入结果';
    } else {
      if (step) step.textContent = ready ? 'STEP 01 / SELECTED' : 'STEP 01 / START';
      if (summary) summary.textContent = ready
        ? `${primarySelectionLabel()} · 调整研究条件`
        : researchMode === 'player' ? '选择职业选手开始研究' : '选择英雄开始职业出装研究';
      if (summaryNote) summaryNote.textContent = ready
        ? '职责、时间和版本可以随时调整'
        : researchMode === 'hero' ? '英雄是默认入口，也可以切换到选手或战队' : '先选择研究对象，其余条件之后再细化';
    }
    if (!ready && researchDrawer) researchDrawer.open = true;
    return ready;
  }

  function renderContext(rows) {
    const chips = document.getElementById('pb-context-chips'), count = document.getElementById('pb-context-count');
    if (!chips || !count) return;
    const mode = MODE_CONFIG[researchMode] || MODE_CONFIG.hero;
    const parts = [`<span class="pb-context-mode">${esc(mode.title)}</span>`];
    ['hero', 'player', 'team', 'opponent', 'patch', 'role', 'league', 'situation', 'result'].forEach(key => {
      const label = controlLabel(key); if (!label) return;
      parts.push(`<button type="button" data-pb-clear="${key}" title="移除${esc(label)}">${esc(label)} <i>×</i></button>`);
    });
    const dateText = controls.from.value && controls.to.value ? `${controls.from.value} — ${controls.to.value}` : '';
    const customDate = controls.from.value !== controls.from.min || controls.to.value !== controls.to.max;
    if (dateText) parts.push(customDate ? `<button type="button" data-pb-clear="dates" title="恢复完整时间范围">${esc(dateText)} <i>×</i></button>` : `<span>${esc(dateText)}</span>`);
    chips.innerHTML = parts.join('');
    const matches = new Set(rows.map(row => row.m)).size;
    count.textContent = `${matches.toLocaleString()} 场 · ${rows.length.toLocaleString()} 个选手英雄局`;
  }

  function renderHeroProfile(rows) {
    const heroId = controls.hero.value;
    const hero = heroId ? heroes[heroId] : null;
    const portrait = document.getElementById('pb-profile-portrait');
    const placeholder = document.getElementById('pb-profile-placeholder');
    const name = document.getElementById('pb-profile-name');
    const patch = document.getElementById('pb-profile-patch');
    const summary = document.getElementById('pb-profile-summary');
    if (portrait && placeholder) {
      if (hero?.icon) {
        portrait.src = hero.icon; portrait.alt = hero.name || heroId; portrait.hidden = false; placeholder.hidden = true;
      } else {
        portrait.removeAttribute('src'); portrait.alt = ''; portrait.hidden = true; placeholder.hidden = false;
      }
    }
    if (name) name.textContent = hero?.name || (researchMode === 'player' ? '职业选手英雄研究' : researchMode === 'scout' ? '赛前出装准备' : '职业选手出装分析');
    if (patch) patch.textContent = controls.patch.value ? `版本 ${controls.patch.value}` : '全部版本';
    if (summary) {
      const role = controls.role.value ? `${controls.role.value}号位` : '全部职责位置';
      summary.textContent = hero
        ? `${role} · ${controls.from.value || '最早'} — ${controls.to.value || '最新'} · ${rows.length.toLocaleString()} 个职业选手英雄局`
        : '选择英雄后，用职业比赛样本查看职责位置、完整出装路线、购买时点与真实比赛。';
    }

    const roleRows = filteredRows(false, new Set(['role']));
    const roleStats = new Map(['', '1', '2', '3', '4', '5'].map(role => [role, role ? roleRows.filter(row => String(row.r || '') === role) : roleRows]));
    const mostPlayedRole = ['1', '2', '3', '4', '5'].sort((a, b) => roleStats.get(b).length - roleStats.get(a).length)[0];
    const assignedRoleRows = ['1', '2', '3', '4', '5'].reduce((sum, role) => sum + roleStats.get(role).length, 0);
    const roleCoverage = page.querySelector('.pb-role-overview>header p');
    if (roleCoverage) roleCoverage.textContent = assignedRoleRows !== roleRows.length
      ? `位置来自联赛内分路与补刀聚合；已判位覆盖 ${assignedRoleRows.toLocaleString()}/${roleRows.length.toLocaleString()} 局，${(roleRows.length - assignedRoleRows).toLocaleString()}局未判位不纳入1–5号位卡。`
      : '位置来自联赛内分路与补刀聚合；点击卡片直接筛选，slot 不参与判位。';
    page.querySelectorAll('[data-pb-role-card]').forEach(button => {
      const role = button.dataset.pbRoleCard || '';
      const sample = roleStats.get(role) || [];
      const selected = role === controls.role.value;
      button.classList.toggle('is-active', selected);
      button.classList.toggle('is-most-played', Boolean(role && role === mostPlayedRole && sample.length));
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      const games = button.querySelector('[data-pb-role-games]');
      const winrate = button.querySelector('[data-pb-role-winrate]');
      if (games) games.textContent = `${sample.length.toLocaleString()} 局`;
      if (winrate) winrate.textContent = pct(sample.reduce((sum, row) => sum + Number(row.w || 0), 0), sample.length);
      button.disabled = Boolean(role && !sample.length);
    });
  }

  function renderProfileInsights(rows) {
    const host = document.getElementById('pb-profile-insights'); if (!host) return;
    const wins = sample => sample.reduce((sum, row) => sum + Number(row.w || 0), 0);
    const currentRate = rows.length ? wins(rows) / rows.length : null;
    const from = controls.from.value ? new Date(`${controls.from.value}T00:00:00Z`) : null;
    const to = controls.to.value ? new Date(`${controls.to.value}T00:00:00Z`) : null;
    let previous = [];
    if (from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      const days = Math.max(1, Math.round((to - from) / 86400000) + 1);
      const previousTo = new Date(from.getTime() - 86400000);
      const previousFrom = new Date(from.getTime() - days * 86400000);
      const previousFromText = previousFrom.toISOString().slice(0, 10), previousToText = previousTo.toISOString().slice(0, 10);
      previous = filteredRows(true).filter(row => row.d >= previousFromText && row.d <= previousToText);
    }
    const previousRate = previous.length ? wins(previous) / previous.length : null;
    const delta = currentRate != null && previousRate != null ? currentRate - previousRate : null;
    const trendValue = delta == null ? (currentRate == null ? '—' : pct(currentRate, 1)) : `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}pp`;
    const trendDetail = previous.length ? `当前 ${pct(currentRate, 1)} · 前窗 ${pct(previousRate, 1)} · ${previous.length}局` : `当前 ${currentRate == null ? '—' : pct(currentRate, 1)} · 前一等长窗口无样本`;

    const durationRows = rows.filter(row => {
      const seconds = Number(row.du);
      return Number.isFinite(seconds) && seconds > 0;
    });
    const durationBands = [
      ['≤35m', durationRows.filter(row => Number(row.du) <= 2100)],
      ['35–50m', durationRows.filter(row => Number(row.du) > 2100 && Number(row.du) <= 3000)],
      ['50m+', durationRows.filter(row => Number(row.du) > 3000)],
    ];
    const situationRows = rows.filter(row => situation(row) !== 'unknown');
    const situationBands = [
      ['优势', situationRows.filter(row => situation(row) === 'ahead')],
      ['均势', situationRows.filter(row => situation(row) === 'even')],
      ['劣势', situationRows.filter(row => situation(row) === 'behind')],
    ];
    const splitHtml = (bands, coverage) => `<div class="pb-insight-splits">${bands.map(([label, sample]) => `<span><b>${label}</b><i>${pct(wins(sample), sample.length)}</i><small>${sample.length}局</small></span>`).join('')}</div>${coverage ? `<small>${coverage}</small>` : ''}`;
    const sourceRows = rows.filter(row => Array.isArray(row.u));
    const recognizedRows = sourceRows.filter(row => row.u.length);
    host.innerHTML = `<article class="${delta == null ? '' : delta >= 0 ? 'is-positive' : 'is-negative'}"><span>胜率趋势</span><strong>${trendValue}</strong><small>${trendDetail}</small></article>
      <article><span>比赛时长胜率</span>${splitHtml(durationBands, `有效时长 ${durationRows.length.toLocaleString()}/${rows.length.toLocaleString()}局`)}</article>
      <article><span>15分钟局势</span>${splitHtml(situationBands, `快照覆盖 ${situationRows.length.toLocaleString()}/${rows.length.toLocaleString()}局`)}</article>
      <article><span>首用日志覆盖</span><strong>${pct(sourceRows.length, rows.length)}</strong><small>${sourceRows.length.toLocaleString()}局有日志 · ${recognizedRows.length.toLocaleString()}局识别到装备首用</small></article>`;
  }

  function renderSampleGuidance(rows) {
    const host = document.getElementById('pb-sample-guidance'); if (!host) return;
    let title = '', detail = '', actions = '';
    if (researchMode === 'hero' && !controls.hero.value) {
      title = '先搜索一个英雄'; detail = '选择英雄后会直接出现完整出装路线、购买时点与版本演化。';
    } else if (researchMode === 'player' && !controls.player.value) {
      title = '先搜索一位职业选手'; detail = '选中后可以继续限定英雄，查看这名选手真正采用的完整路线。';
    } else if (researchMode === 'scout' && !controls.team.value && !controls.player.value) {
      title = '先选择需要研究的战队或选手'; detail = '赛前准备会把他们的英雄选择、局势应对与真实比赛串起来。';
    } else if (!rows.length) {
      title = '当前条件没有比赛'; detail = '可以扩大时间范围，或移除一个限制条件。';
      const buttons = [];
      if (controls.from.value !== controls.from.min || controls.to.value !== controls.to.max) buttons.push('<button type="button" data-pb-guidance="90">扩大到90天</button><button type="button" data-pb-guidance="all">查看全部时间</button>');
      if (researchMode !== 'hero' && controls.hero.value) buttons.push('<button type="button" data-pb-guidance="clear-hero">移除英雄限制</button>');
      if (researchMode !== 'player' && controls.player.value) buttons.push('<button type="button" data-pb-guidance="clear-player">移除选手限制</button>');
      if (controls.opponent.value) buttons.push('<button type="button" data-pb-guidance="clear-opponent">移除对手英雄</button>');
      actions = buttons.join('');
    } else if (rows.length < 10) {
      title = `当前只有 ${rows.length} 个选手英雄局`; detail = '小样本路线容易被单场比赛放大，建议扩大范围后再判断。';
      actions = '<button type="button" data-pb-guidance="30">最近30天</button><button type="button" data-pb-guidance="90">最近90天</button><button type="button" data-pb-guidance="all">全部时间</button>';
    }
    if (!title) { host.hidden = true; host.innerHTML = ''; return; }
    host.hidden = false;
    host.innerHTML = `<div><strong>${esc(title)}</strong><span>${esc(detail)}</span></div><div>${actions}</div>`;
  }

  function refreshHeroShortcuts() {
    const host = document.getElementById('pb-hero-shortcuts');
    if (!host) return;
    const scoutTargetReady = Boolean(controls.team.value || controls.player.value);
    const visible = researchMode === 'hero' || (researchMode === 'scout' && scoutTargetReady);
    host.hidden = !visible;
    host.classList.toggle('is-scout-shortcuts', researchMode === 'scout');
    if (!visible) return;
    let rows = allRows.filter(row => (!controls.from.value || row.d >= controls.from.value) && (!controls.to.value || row.d <= controls.to.value));
    let label = '最近30天热门英雄';
    if (researchMode === 'scout') {
      if (controls.team.value) rows = rows.filter(row => row.t === controls.team.value);
      if (controls.player.value) rows = rows.filter(row => String(row.s) === String(controls.player.value));
      label = `${primarySelectionLabel()} · 常用英雄（选择后再生成分析）`;
    }
    renderHeroShortcuts(rows, label);
  }

  function renderHeroShortcuts(rows, label) {
    const host = document.getElementById('pb-hero-shortcuts');
    if (!host) return;
    const counts = new Map();
    rows.forEach(row => { if (row.h) counts.set(row.h, (counts.get(row.h) || 0) + 1); });
    const top = [...counts].sort((a, b) => b[1] - a[1] || (heroes[a[0]]?.name || a[0]).localeCompare(heroes[b[0]]?.name || b[0])).slice(0, 6);
    host.innerHTML = `<span>${esc(label || '热门英雄')}</span>${top.length ? `<div>${top.map(([id, games]) => {
      const hero = heroes[id] || {}, name = hero.name || id;
      const selected = id === controls.hero.value;
      return `<button type="button" data-pb-select-hero="${esc(id)}" class="${selected ? 'is-selected' : ''}" aria-pressed="${selected ? 'true' : 'false'}" title="研究 ${esc(name)}">${hero.icon ? `<img src="${esc(hero.icon)}" alt="">` : ''}<b>${esc(name)}</b><small>${games.toLocaleString()}局</small></button>`;
    }).join('')}</div>` : '<p class="pb-shortcut-empty">当前时间范围内没有可展示的英雄样本，请扩大日期范围。</p>'}`;
  }

  function populateFilters(rows, meta) {
    fillSelect(controls.patch, uniq(rows, r => r.p).sort().map(v => option(v, v)));
    fillSelect(controls.league, uniq(rows, r => r.l).sort((a, b) => a.localeCompare(b)).map(v => option(v, v)));
    const teamCounts = new Map();
    rows.forEach(r => { if (r.t) teamCounts.set(r.t, (teamCounts.get(r.t) || 0) + 1); });
    fillSelect(controls.team, [...teamCounts]
      .filter(([name, count]) => count >= 20 && !/^\d+$/.test(name) && name !== 'UNKNOWN')
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => option(name, `${name} (${Math.round(count / 10)}场)`)));
    const playerMap = new Map();
    rows.forEach(r => {
      if (!r.s || !String(r.n || '').trim()) return;
      const old = playerMap.get(r.s) || { name: r.n || r.s, games: 0 };
      old.games++;
      playerMap.set(r.s, old);
    });
    fillSelect(controls.player, [...playerMap]
      .filter(([, p]) => p.games >= 5)
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([id, p]) => option(id, `${p.name} · ${String(id).slice(-6)} (${p.games}局)`)));
    const usedHeroes = new Set(rows.map(r => r.h));
    fillSelect(controls.hero, [...usedHeroes].sort((a, b) => (heroes[a]?.name || a).localeCompare(heroes[b]?.name || b))
      .map(id => option(id, heroes[id]?.name || id)));
    fillSelect(controls.opponent, [...usedHeroes].sort((a, b) => (heroes[a]?.name || a).localeCompare(heroes[b]?.name || b))
      .map(id => option(id, heroes[id]?.name || id)));
    controls.from.min = meta.date_min || '';
    controls.to.max = meta.date_max || '';
    controls.to.value = meta.date_max || '';
    if (meta.date_max) {
      const end = new Date(`${meta.date_max}T00:00:00Z`);
      const latestThirtyDays = new Date(end - 29 * 86400000).toISOString().slice(0, 10);
      controls.from.value = meta.date_min && latestThirtyDays < meta.date_min ? meta.date_min : latestThirtyDays;
    } else controls.from.value = meta.date_min || '';
    rebuildSearchControls();
    refreshHeroShortcuts();
  }

  function applyUrlFilters() {
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get('mode');
    researchMode = MODE_CONFIG[requestedMode] ? requestedMode : params.has('player') ? 'player' : (params.has('team') || params.has('opponent')) ? 'scout' : 'hero';
    const requestedTab = params.get('tab') === 'overview' ? 'routes' : params.get('tab');
    if (requestedTab && document.querySelector(`[data-pb-tab="${requestedTab}"]`)) activeTab = requestedTab;
    else activeTab = MODE_CONFIG[researchMode].tab;
    selectedRouteClusterId = params.get('cluster') || '';
    selectedMatchKey = params.get('match') || '';
    matchDrawerOpen = Boolean(selectedMatchKey);
    if (['week', 'month', 'patch'].includes(params.get('grain'))) routeTrendGrain = params.get('grain');
    const keys = ['patch', 'league', 'team', 'player', 'hero', 'role', 'result', 'situation', 'opponent', 'method', 'scope'];
    keys.forEach(key => {
      const value = params.get(key);
      const control = controls[key];
      if (!value || !control) return;
      const exists = [...control.options].some(opt => opt.value === value);
      if (exists) control.value = value;
    });
    const from = params.get('from'), to = params.get('to');
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) controls.from.value = from;
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) controls.to.value = to;
    syncSearchInputs();
  }

  function syncUrl() {
    const params = new URLSearchParams();
    params.set('mode', researchMode);
    ['patch', 'league', 'team', 'player', 'hero', 'role', 'result', 'situation', 'opponent', 'method'].forEach(key => {
      if (controls[key]?.value) params.set(key, controls[key].value);
    });
    if (controls.from.value && controls.from.value !== controls.from.min) params.set('from', controls.from.value);
    if (controls.to.value && controls.to.value !== controls.to.max) params.set('to', controls.to.value);
    if (controls.scope.value && controls.scope.value !== 'core') params.set('scope', controls.scope.value);
    const defaultTab = MODE_CONFIG[researchMode]?.tab || 'routes';
    if (activeTab !== defaultTab) params.set('tab', activeTab);
    if (researchMode === 'scout' && scoutAnalysisSubmitted) params.set('run', '1');
    if (selectedRouteClusterId) params.set('cluster', selectedRouteClusterId);
    if (routeTrendGrain !== 'week') params.set('grain', routeTrendGrain);
    if ((activeTab === 'matches' || matchDrawerOpen) && selectedMatchKey) params.set('match', selectedMatchKey);
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${query ? '?' + query : ''}`);
  }

  function setActiveTab(tabName, updateUrl) {
    if (!document.querySelector(`[data-pb-tab="${tabName}"]`)) tabName = 'routes';
    activeTab = tabName;
    page.querySelectorAll('[data-pb-tab]').forEach(button => {
      const selected = button.dataset.pbTab === activeTab;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    page.querySelectorAll('[data-pb-panel]').forEach(panel => panel.classList.toggle('is-tab-active', panel.dataset.pbPanel === activeTab));
    const meta = TAB_META[activeTab] || TAB_META.routes;
    const title = document.getElementById('pb-workspace-title'), description = document.getElementById('pb-workspace-description');
    if (title) title.textContent = meta[0];
    if (description) description.textContent = meta[1];
    if (updateUrl) syncUrl();
  }

  function readSavedViews() {
    try { const value = JSON.parse(localStorage.getItem(SAVED_VIEW_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
  }

  function writeSavedViews(views) {
    try { localStorage.setItem(SAVED_VIEW_KEY, JSON.stringify(views.slice(-30))); return true; } catch { return false; }
  }

  function refreshSavedViews(selectedId) {
    const select = document.getElementById('pb-saved-view'); if (!select) return;
    const views = readSavedViews(); select.innerHTML = '<option value="">已保存的分析视图</option>' + views.map(view => option(view.id, view.name)).join('');
    if (selectedId && views.some(view => view.id === selectedId)) select.value = selectedId;
  }

  function setViewStatus(text) {
    const status = document.getElementById('pb-view-status'); if (status) status.textContent = text;
  }

  function currentViewState() {
    const filterState = {}; Object.entries(controls).forEach(([key, control]) => { if (control) filterState[key] = control.value; });
    return { filters: filterState, researchMode, activeTab, selectedItem, selectedRouteClusterId, routeTrendGrain, duel: { kind: document.getElementById('pb-duel-kind')?.value || 'player', a: document.getElementById('pb-duel-a')?.value || '', b: document.getElementById('pb-duel-b')?.value || '' }, stylePlayer: document.getElementById('pb-style-player')?.value || '' };
  }

  function saveCurrentView() {
    const input = document.getElementById('pb-view-name'), custom = String(input?.value || '').trim();
    const heroName = heroes[controls.hero.value]?.name || '全部英雄', autoName = `${heroName} · ${controls.patch.value || '全版本'} · ${activeTab}`;
    const view = { id: `view-${Date.now().toString(36)}`, name: custom || autoName, savedAt: new Date().toISOString(), state: currentViewState() };
    const views = readSavedViews(); views.push(view);
    if (!writeSavedViews(views)) { setViewStatus('浏览器禁止本地保存'); return; }
    refreshSavedViews(view.id); if (input) input.value = ''; setViewStatus(`已保存：${view.name}`);
  }

  function loadSavedView() {
    const id = document.getElementById('pb-saved-view')?.value, view = readSavedViews().find(row => row.id === id); if (!view) { setViewStatus('请选择一个已保存视图'); return; }
    Object.entries(view.state?.filters || {}).forEach(([key, value]) => {
      const control = controls[key]; if (!control) return;
      if (control.tagName === 'SELECT' && ![...control.options].some(opt => opt.value === value)) control.value = ''; else control.value = value;
    });
    researchMode = MODE_CONFIG[view.state?.researchMode] ? view.state.researchMode : 'hero';
    layoutModeFilters(); syncSearchInputs();
    activeTab = view.state?.activeTab || MODE_CONFIG[researchMode].tab; selectedItem = view.state?.selectedItem || ''; selectedRouteClusterId = view.state?.selectedRouteClusterId || ''; routeTrendGrain = ['week', 'month', 'patch'].includes(view.state?.routeTrendGrain) ? view.state.routeTrendGrain : 'week';
    setActiveTab(activeTab, false);
    const kind = document.getElementById('pb-duel-kind'); if (kind) kind.value = view.state?.duel?.kind || 'player'; populateDuelSelectors(true);
    const duelA = document.getElementById('pb-duel-a'), duelB = document.getElementById('pb-duel-b'); if (duelA && [...duelA.options].some(opt => opt.value === view.state?.duel?.a)) duelA.value = view.state.duel.a; if (duelB && [...duelB.options].some(opt => opt.value === view.state?.duel?.b)) duelB.value = view.state.duel.b;
    heatmapRequested = false; render();
    const style = document.getElementById('pb-style-player'); if (style && [...style.options].some(opt => opt.value === view.state?.stylePlayer)) { style.value = view.state.stylePlayer; renderPlayerStyle(currentRows); }
    setViewStatus(`已加载：${view.name}`);
  }

  function deleteSavedView() {
    const select = document.getElementById('pb-saved-view'), id = select?.value; if (!id) { setViewStatus('请选择要删除的视图'); return; }
    const views = readSavedViews(), target = views.find(row => row.id === id); writeSavedViews(views.filter(row => row.id !== id)); refreshSavedViews(); setViewStatus(target ? `已删除：${target.name}` : '已删除');
  }

  function enemyHeroes(r) {
    const sides = matchTeams.get(String(r.m));
    if (!sides) return [];
    const enemies = new Set();
    sides.forEach((heroSet, teamName) => { if (teamName !== r.t) heroSet.forEach(hero => enemies.add(hero)); });
    return [...enemies];
  }

  function opposingRows(r) {
    return (matchRowsById.get(String(r.m)) || []).filter(other => Number(other.tm) !== Number(r.tm));
  }

  function sameRoleOpponent(r) {
    if (!r.r) return null;
    return opposingRows(r).find(other => Number(other.r) === Number(r.r)) || null;
  }

  function detailFor(row) {
    return detailData.players?.[rowKey(row)] || null;
  }

  function snapshotAt(row, seconds) {
    return (detailFor(row)?.q || []).find(snapshot => Number(snapshot[0]) === Number(seconds)) || null;
  }

  function laneDeltaAt(row, seconds) {
    const opponent = sameRoleOpponent(row), own = snapshotAt(row, seconds);
    const other = opponent ? snapshotAt(opponent, seconds) : null;
    return own && other && Number.isFinite(Number(own[2])) && Number.isFinite(Number(other[2]))
      ? Number(own[2]) - Number(other[2]) : null;
  }

  function laneResult(row) {
    const delta = laneDeltaAt(row, 600);
    return !Number.isFinite(delta) ? 'unknown' : delta >= 500 ? 'won' : delta <= -500 ? 'lost' : 'drawn';
  }

  function draftPickPhase(row) {
    const picks = (detailData.drafts?.[String(row.m)]?.p || [])
      .filter(pick => Number(pick[1]) === Number(row.tm))
      .sort((a, b) => Number(a[0]) - Number(b[0]));
    const index = picks.findIndex(pick => String(pick[3] || '') === String(row.h));
    if (index < 0) return 'unknown';
    if (index <= 1) return 'early';
    if (index <= 3) return 'middle';
    return 'last';
  }

  function metricRates(row) {
    const durationMinutes = Math.max(1, Number(row.du || 0) / 60);
    const metrics = row.x || [];
    const grossGold = Number(metrics[0]), xp = Number(metrics[1]);
    return {
      gpm: Number.isFinite(grossGold) && grossGold > 0 ? Math.round(grossGold / durationMinutes) : null,
      xpm: Number.isFinite(xp) && xp > 0 ? Math.round(xp / durationMinutes) : null,
      nwpm: Number.isFinite(Number(row.nw)) ? Math.round(Number(row.nw) / durationMinutes) : null,
      tfp: Number.isFinite(Number(metrics[3])) ? Number(metrics[3]) : null,
      heroDamage: Number.isFinite(Number(metrics[11])) ? Number(metrics[11]) : null,
      towerDamage: Number.isFinite(Number(metrics[12])) ? Number(metrics[12]) : null,
    };
  }

  function percentile(value, sorted) {
    if (!Number.isFinite(value) || !sorted.length) return null;
    let below = 0;
    while (below < sorted.length && sorted[below] < value) below++;
    let equal = below;
    while (equal < sorted.length && sorted[equal] === value) equal++;
    return (below + (equal - below) / 2) / sorted.length;
  }

  function performanceScore(row) {
    const cohortKey = `${row.h}:${row.r || 0}`;
    if (!performanceCohorts.has(cohortKey)) {
      const cohort = allRows.filter(other => other.h === row.h && Number(other.r || 0) === Number(row.r || 0));
      const collect = getter => cohort.map(getter).filter(Number.isFinite).sort((a, b) => a - b);
      performanceCohorts.set(cohortKey, {
        nwpm: collect(other => metricRates(other).nwpm),
        nw15: collect(other => Number(other.g?.[1])),
        kda: collect(other => other.g ? (Number(other.g[3] || 0) + Number(other.g[5] || 0)) / Math.max(1, Number(other.g[4] || 0)) : null),
        level: collect(other => Number(other.lv)),
      });
    }
    const cohort = performanceCohorts.get(cohortKey), rates = metricRates(row);
    const values = [
      [rates.nwpm, cohort.nwpm, .35],
      [Number(row.g?.[1]), cohort.nw15, .3],
      [row.g ? (Number(row.g[3] || 0) + Number(row.g[5] || 0)) / Math.max(1, Number(row.g[4] || 0)) : null, cohort.kda, .25],
      [Number(row.lv), cohort.level, .1],
    ];
    const available = values.map(([value, sorted, weight]) => [percentile(value, sorted), weight]).filter(([value]) => value != null);
    const weights = available.reduce((sum, value) => sum + value[1], 0);
    return weights ? Math.round(available.reduce((sum, value) => sum + value[0] * value[1], 0) / weights * 100) : null;
  }

  function buildDraftPrior(rows) {
    const result = new Map();
    const overall = rows.length ? rows.reduce((sum, row) => sum + Number(row.w || 0), 0) / rows.length : .5;
    const ally = new Map(), enemy = new Map();
    const add = (map, hero, row) => {
      const stat = map.get(hero) || { games: 0, wins: 0 };
      stat.games++; stat.wins += Number(row.w || 0); map.set(hero, stat);
    };
    rows.forEach(row => (matchRowsById.get(String(row.m)) || []).forEach(other => {
      if (rowKey(other) === rowKey(row)) return;
      add(Number(other.tm) === Number(row.tm) ? ally : enemy, other.h, row);
    }));
    rows.forEach(row => {
      const effects = [];
      (matchRowsById.get(String(row.m)) || []).forEach(other => {
        if (rowKey(other) === rowKey(row)) return;
        const stat = (Number(other.tm) === Number(row.tm) ? ally : enemy).get(other.h);
        if (!stat) return;
        const shrink = stat.games / (stat.games + 15);
        effects.push((stat.wins / stat.games - overall) * shrink);
      });
      const score = effects.length ? overall + effects.reduce((sum, value) => sum + value, 0) / effects.length : overall;
      result.set(rowKey(row), Math.max(.05, Math.min(.95, score)));
    });
    return result;
  }

  function filteredRows(ignoreDates, ignoredControls) {
    const ignored = ignoredControls || new Set();
    return allRows.filter(r => {
      if (!ignored.has('patch') && controls.patch.value && r.p !== controls.patch.value) return false;
      if (!ignoreDates && controls.from.value && r.d < controls.from.value) return false;
      if (!ignoreDates && controls.to.value && r.d > controls.to.value) return false;
      if (controls.league.value && r.l !== controls.league.value) return false;
      if (controls.team.value && r.t !== controls.team.value) return false;
      if (!ignored.has('player') && controls.player.value && r.s !== controls.player.value) return false;
      if (controls.hero.value && r.h !== controls.hero.value) return false;
      if (!ignored.has('role') && controls.role.value && String(r.r || '') !== controls.role.value) return false;
      if (controls.result.value !== '' && String(r.w) !== controls.result.value) return false;
      if (controls.situation.value && situation(r) !== controls.situation.value) return false;
      if (controls.opponent.value && !enemyHeroes(r).includes(controls.opponent.value)) return false;
      if (controls.method.value && r.rm !== controls.method.value) return false;
      return true;
    });
  }

  function itemStats(rows) {
    const strata = new Map();
    rows.forEach(r => {
      const key = `${r.r || 0}:${situation(r)}:${Math.floor(Number(r.du || 0) / 600)}`;
      const st = strata.get(key) || { games: 0, wins: 0 };
      st.games++; st.wins += Number(r.w || 0); strata.set(key, st);
    });
    const map = new Map();
    rows.forEach(r => {
      const firstUses = new Map(r.u || []);
      (r.i || []).forEach(pair => {
        const id = pair[0], seconds = pair[1];
        if (!includeItem(id)) return;
        let stat = map.get(id);
        if (!stat) stat = { id, games: 0, wins: 0, times: [], useDelays: [], useSourceGames: 0, expected: 0 };
        stat.games++;
        stat.wins += Number(r.w || 0);
        const key = `${r.r || 0}:${situation(r)}:${Math.floor(Number(r.du || 0) / 600)}`;
        const base = strata.get(key);
        stat.expected += base?.games ? base.wins / base.games : 0;
        if (Number.isFinite(seconds)) stat.times.push(seconds);
        if (Array.isArray(r.u)) stat.useSourceGames++;
        const firstUse = firstUses.get(id);
        if (Number.isFinite(seconds) && Number.isFinite(firstUse) && firstUse >= seconds) stat.useDelays.push(firstUse - seconds);
        map.set(id, stat);
      });
    });
    const overall = rows.length ? rows.reduce((sum, r) => sum + Number(r.w || 0), 0) / rows.length : 0;
    return [...map.values()].map(s => ({
      ...s,
      median: median(s.times),
      averageFirstUseDelay: mean(s.useDelays),
      adjusted: Math.max(0, Math.min(1, overall + s.wins / s.games - s.expected / s.games)),
      ci: wilson(s.wins, s.games),
    }))
      .sort((a, b) => b.games - a.games || b.wins - a.wins);
  }

  function renderItems(rows, stats) {
    const body = document.getElementById('pb-items-body');
    body.innerHTML = stats.slice(0, 30).map(s => {
      const item = items[s.id] || { name: s.id, icon: '' };
      return `<tr data-pb-item="${esc(s.id)}" class="${s.id === selectedItem ? 'is-selected' : ''}">
        <td><span class="pb-item-name">${icon(item.icon, item.name)}<span>${esc(item.name)}</span></span></td>
        <td><strong>${pct(s.games, rows.length)}</strong></td><td>${s.games}</td>
        <td class="${s.wins / s.games >= .5 ? 'pb-up' : 'pb-down'}">${pct(s.wins, s.games)}</td>
        <td>${pct(s.adjusted, 1)}</td><td>${pct(s.ci[0], 1)}–${pct(s.ci[1], 1)}</td>
        <td>${timeText(s.median)}</td><td title="${s.useDelays.length ? `${s.useDelays.length}局可计算购买后第一次可识别使用；${s.useSourceGames}局有可用日志` : s.useSourceGames ? `${s.useSourceGames}局有可用日志，但未找到该装备的可识别使用` : '对应比赛没有可用的使用日志'}"><strong class="pb-first-use-value">${intervalText(s.averageFirstUseDelay)}</strong>${s.useDelays.length ? `<small>${s.useDelays.length}局</small>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="pb-no-data">当前筛选没有成装数据</td></tr>';
  }

  const bonusLabels = {
    all: '全属性', str: '力量', agi: '敏捷', int: '智力', hp: '生命值', mp: '魔法值',
    hpr: '生命恢复', mpr: '魔法恢复', armor: '护甲', mr: '魔抗', evasion: '闪避',
    damage: '攻击力', damageMelee: '近战攻击力', damageRanged: '远程攻击力',
    aspd: '攻击速度', ms: '移动速度', msPct: '移动速度', range: '攻击距离',
    spellAmp: '技能增强', statusRes: '状态抗性', slowRes: '减速抗性',
    lifesteal: '吸血', spellLifesteal: '技能吸血', castRange: '施法距离',
    cooldownReduction: '冷却缩减', healthRestoration: '治疗增强', hpPct: '最大生命',
  };
  const pctKeys = new Set(['mr','evasion','msPct','spellAmp','statusRes','slowRes','lifesteal','spellLifesteal','cooldownReduction','healthRestoration','hpPct']);

  function renderTheory(rows, stat) {
    const box = document.getElementById('pb-theory');
    if (!stat || !items[stat.id]) {
      box.innerHTML = `<header><div><span class="pb-card-kicker">HERO LAB</span><h2>理论属性</h2></div><small id="pb-theory-patch">理论数据 ${esc(config.theoryPatch)}</small></header><div class="pb-empty">当前筛选没有可展示物品</div>`;
      return;
    }
    const item = items[stat.id];
    const bonuses = Object.entries(item.bonus || {}).filter(([, v]) => Math.abs(Number(v) || 0) > .0001);
    const heroId = controls.hero.value || '';
    const levels = rows.map(r => Number(r.lv)).filter(Number.isFinite);
    const level = median(levels) || 15;
    const common = lastItemStats.slice(0, 5).map(s => s.id);
    if (!common.includes(stat.id)) common.unshift(stat.id);
    const packageBonus = {};
    common.slice(0, 6).forEach(id => Object.entries(items[id]?.bonus || {}).forEach(([key, value]) => { packageBonus[key] = (packageBonus[key] || 0) + Number(value || 0); }));
    const packageHighlights = Object.entries(packageBonus).filter(([, value]) => Math.abs(value) > .001).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
    const labUrl = `hero_lab.html?hero=${encodeURIComponent(heroId)}&level=${level}&items=${encodeURIComponent(common.slice(0, 6).join(','))}`;
    box.innerHTML = `<header><div><span class="pb-card-kicker">HERO LAB</span><h2>理论属性</h2></div><small id="pb-theory-patch">理论数据 ${esc(config.theoryPatch)}</small></header>
      <div class="pb-theory-head">${icon(item.icon, item.name, 'pb-theory-icon')}<div><h3>${esc(item.name)}</h3><span>${Number(item.cost || 0).toLocaleString()} 金币 · ${esc(item.category || item.class || '')}</span></div></div>
      <div class="pb-theory-real"><div><span>实战采用率</span><strong>${pct(stat.games, rows.length)}</strong></div><div><span>样本胜率</span><strong>${pct(stat.wins, stat.games)}</strong></div><div><span>中位时点</span><strong>${timeText(stat.median)}</strong></div></div>
      <div class="pb-bonus-list">${bonuses.map(([key, value]) => `<div><span>${esc(bonusLabels[key] || key)}</span><strong>${Number(value) > 0 ? '+' : ''}${Number(value)}${pctKeys.has(key) ? '%' : ''}</strong></div>`).join('') || '<div class="pb-no-data">该物品主要收益来自主动/被动技能，不能仅用静态属性表达。</div>'}</div>
      <div class="pb-package-delta"><span>当前常见套装静态增量</span>${packageHighlights.map(([key, value]) => `<b>${esc(bonusLabels[key] || key)} ${value > 0 ? '+' : ''}${Number(value.toFixed(2))}${pctKeys.has(key) ? '%' : ''}</b>`).join('')}</div>
      <p class="pb-theory-note">实战数据使用所选版本；理论属性来自当前 Hero Lab 快照。DPS、EHP 与 DMG GOLD 会随英雄和等级变化。</p>
      <a class="pb-lab-link" href="${labUrl}">在 Hero Lab 中查看精确穿装前后 DPS / EHP / 性价比 →</a>`;
  }

  function renderTiming(stats) {
    const chart = document.getElementById('pb-timing-chart');
    const thresholds = [600, 1200, 1800, 2400];
    chart.innerHTML = stats.slice(0, 7).map(s => {
      const item = items[s.id] || { name: s.id, icon: '' };
      const vals = thresholds.map(t => s.times.length ? s.times.filter(v => v <= t).length * 100 / s.times.length : 0);
      return `<div class="pb-time-row"><div class="pb-time-item">${icon(item.icon, item.name)}<span>${esc(item.name)}</span></div><div class="pb-time-bars">${vals.map((v, idx) => `<div title="${thresholds[idx] / 60}分钟前完成 ${v.toFixed(1)}%"><span style="width:${Math.max(2, v)}%"></span><b>${thresholds[idx] / 60}m ${v.toFixed(0)}%</b></div>`).join('')}</div></div>`;
    }).join('') || '<div class="pb-no-data">没有购买时点数据</div>';
  }

  function coreRoutePairs(r, limit) {
    const floor = Number(r.r) >= 4 ? 700 : 1200;
    const timed = (r.i || []).filter(([id, seconds]) => {
      if (!includeItem(id) || !Number.isFinite(seconds)) return false;
      const cost = Number(items[id]?.cost || 0);
      return cost >= floor || /boots|blink|spirit_vessel|urn_of_shadows/.test(id);
    }).sort((a, b) => a[1] - b[1]);
    if (timed.length >= 2) return timed.slice(0, limit || 5);
    // Very short matches can end before a second expensive node. Preserve the
    // real small-item sequence instead of labelling an observed route missing.
    const shortGame = (r.i || []).filter(([id, seconds]) => {
      const item = items[id];
      return Number.isFinite(seconds) && item?.class === 'regular' && !item.consumable
        && routeFallbackAllow.has(id);
    }).sort((a, b) => a[1] - b[1]);
    const seen = new Set();
    return [...timed, ...shortGame]
      .sort((a, b) => a[1] - b[1])
      .filter(([id]) => !seen.has(id) && seen.add(id))
      .slice(0, limit || 5);
  }

  function observedItemBreakdown(rows, predicate) {
    const map = new Map();
    rows.forEach(row => {
      const seen = new Set();
      (row.i || []).forEach(([id, seconds]) => {
        if (seen.has(id) || !items[id] || !predicate(id, seconds, items[id], row)) return;
        seen.add(id);
        const stat = map.get(id) || { id, games: 0, wins: 0, times: [] };
        stat.games++; stat.wins += Number(row.w || 0);
        if (Number.isFinite(seconds)) stat.times.push(seconds);
        map.set(id, stat);
      });
    });
    return [...map.values()].sort((a, b) => b.games - a.games || b.wins - a.wins);
  }

  function compactItemChoice(stat, total) {
    const item = items[stat.id] || { name: stat.id, icon: '' };
    return `<span class="pb-complete-item" title="${esc(item.name)} · ${stat.games}局 · 样本胜率 ${pct(stat.wins, stat.games)}">${icon(item.icon, item.name)}<b>${esc(item.name)}</b><small>${pct(stat.games, total)} · ${Number.isFinite(median(stat.times)) ? timeText(median(stat.times)) : '终局记录'}</small></span>`;
  }

  function neutralChoices(row) {
    return (detailFor(row)?.ni || []).filter(entry => Array.isArray(entry) && entry.length >= 4);
  }

  function rowHasObservedItem(row, itemId) {
    if (!itemId) return true;
    if ((row.i || []).some(pair => pair[0] === itemId)) return true;
    return neutralChoices(row).some(choice => choice[2] === itemId || choice[3] === itemId);
  }

  function rowHasNeutralSelection(row, tier, primaryId, companionId) {
    const choice = neutralChoices(row).find(entry => Number(entry[0]) === Number(tier));
    if (!choice || (choice[2] !== primaryId && choice[3] !== primaryId)) return false;
    return !companionId || choice[2] === primaryId && choice[3] === companionId;
  }

  function neutralTierStats(rows, tier) {
    const itemMap = new Map(), enchantMap = new Map(), pairMap = new Map();
    let itemCoverage = 0, enchantCoverage = 0;
    rows.forEach(row => {
      const choice = neutralChoices(row).find(entry => Number(entry[0]) === Number(tier));
      if (!choice || !choice[2]) return;
      const seconds = Number(choice[1]), itemId = choice[2], enchantId = choice[3] || '';
      itemCoverage++;
      const add = (map, key, values) => {
        const stat = map.get(key) || { ...values, games: 0, wins: 0, times: [] };
        stat.games++; stat.wins += Number(row.w || 0);
        if (Number.isFinite(seconds)) stat.times.push(seconds);
        map.set(key, stat);
      };
      add(itemMap, itemId, { id: itemId });
      if (enchantId) {
        enchantCoverage++;
        add(enchantMap, enchantId, { id: enchantId });
        add(pairMap, `${itemId}>${enchantId}`, { itemId, enchantId });
      }
    });
    const ranked = map => [...map.values()].sort((a, b) => b.games - a.games || b.wins - a.wins);
    return {
      itemCoverage, enchantCoverage,
      items: ranked(itemMap), enchantments: ranked(enchantMap), pairs: ranked(pairMap),
    };
  }

  function neutralStatChoice(stat, total, tier, kind) {
    const item = items[stat.id] || { name: stat.id, icon: '' };
    return `<button type="button" class="pb-neutral-choice" data-pb-neutral-filter data-pb-neutral-tier="${tier}" data-pb-neutral-${kind}="${esc(stat.id)}" title="筛选采用 ${esc(item.name)} 的真实比赛">
      ${icon(item.icon, item.name)}<span><b>${esc(item.name)}</b><small>采用 ${pct(stat.games, total)} · ${stat.games}局</small></span><i class="${stat.wins / stat.games >= .5 ? 'pb-up' : 'pb-down'}">${pct(stat.wins, stat.games)}</i><em>${timeText(median(stat.times))}</em></button>`;
  }

  function neutralPairChoice(stat, total, tier) {
    const neutral = items[stat.itemId] || { name: stat.itemId, icon: '' };
    const enchant = items[stat.enchantId] || { name: stat.enchantId, icon: '' };
    return `<button type="button" class="pb-neutral-pair" data-pb-neutral-filter data-pb-neutral-tier="${tier}" data-pb-neutral-item="${esc(stat.itemId)}" data-pb-neutral-enchant="${esc(stat.enchantId)}" title="筛选这组中立装备与附魔的真实比赛">
      <span>${icon(neutral.icon, neutral.name)}<i>+</i>${icon(enchant.icon, enchant.name)}</span><b>${esc(neutral.name)} + ${esc(enchant.name)}</b><small>${pct(stat.games, total)} · ${stat.games}局 · 胜率 ${pct(stat.wins, stat.games)}</small></button>`;
  }

  function renderNeutralAnalysis(rows) {
    if (!detailRowsReady(rows)) return '<div class="pb-no-data">正在读取 OpenDota 中立物品与附魔历史…</div>';
    const anyCoverage = rows.filter(row => neutralChoices(row).length).length;
    const tiers = [0, 1, 2, 3, 4].map(tier => {
      const stats = neutralTierStats(rows, tier);
      const pairTotal = stats.enchantCoverage;
      return `<article class="pb-neutral-analysis-tier">
        <header><div><span>Tier ${tier + 1}</span><b>${stats.itemCoverage}局有选择</b></div><small>附魔配对 ${stats.enchantCoverage}/${rows.length}局</small></header>
        <div class="pb-neutral-columns"><section><h4>中立物品</h4>${stats.items.slice(0, 5).map(stat => neutralStatChoice(stat, stats.itemCoverage, tier, 'item')).join('') || '<p>当前范围没有该 Tier 记录</p>'}</section><section><h4>附魔</h4>${stats.enchantments.slice(0, 5).map(stat => neutralStatChoice(stat, stats.enchantCoverage, tier, 'enchant')).join('') || '<p>当前范围没有可识别附魔</p>'}</section></div>
        <section class="pb-neutral-pairs"><h4>常见组合</h4><div>${stats.pairs.slice(0, 4).map(stat => neutralPairChoice(stat, pairTotal, tier)).join('') || '<p>当前范围没有完整组合</p>'}</div></section>
      </article>`;
    }).join('');
    return `<div class="pb-neutral-coverage"><strong>OpenDota 精确历史覆盖 ${anyCoverage}/${rows.length}局</strong><span>每个选手局、每个 Tier 只统计最后一次有效组合；采用率分母是该 Tier 有记录的比赛，不把缺失算作未采用。</span></div>${tiers}`;
  }

  function renderCompleteBuild(rows) {
    const host = document.getElementById('pb-complete-build');
    const status = document.getElementById('pb-complete-build-status');
    if (!host || !status) return;
    if (!controls.hero.value) {
      status.textContent = '选择英雄后生成完整卡片';
      host.innerHTML = '<div class="pb-empty">先选择一个英雄；这里不会把不同英雄的技能和装备混在一起。</div>';
      return;
    }
    if (!rows.length) {
      status.textContent = '当前条件没有比赛样本';
      host.innerHTML = '<div class="pb-empty">请扩大比赛日期或清除部分筛选条件。</div>';
      return;
    }

    const openings = new Map();
    rows.forEach(row => {
      const pairs = (row.i || []).filter(([id, seconds]) => {
        const item = items[id];
        return item?.class === 'regular' && Number.isFinite(seconds) && seconds >= 0 && seconds <= 180
          && (item.consumable || Number(item.cost || 0) <= 700);
      }).sort((a, b) => a[1] - b[1]);
      const unique = [], seen = new Set();
      pairs.forEach(([id]) => { if (!seen.has(id) && unique.length < 6) { seen.add(id); unique.push(id); } });
      if (!unique.length) return;
      const key = unique.join('>'), stat = openings.get(key) || { ids: unique, games: 0, wins: 0 };
      stat.games++; stat.wins += Number(row.w || 0); openings.set(key, stat);
    });
    const openingList = [...openings.values()].sort((a, b) => b.games - a.games || b.wins - a.wins).slice(0, 3);
    const openingHtml = openingList.map((entry, index) => `<article class="pb-opening-route"><span>#${index + 1} · ${entry.games}局</span><div>${entry.ids.map(id => { const item = items[id] || { name: id, icon: '' }; return `<span title="${esc(item.name)}">${icon(item.icon, item.name)}<b>${esc(item.name)}</b></span>`; }).join('<i>›</i>')}</div><small>采用 ${pct(entry.games, rows.length)} · 样本胜率 ${pct(entry.wins, entry.games)}</small></article>`).join('') || '<div class="pb-no-data">当前样本没有可确认的0–3分钟购买记录</div>';

    const inventoryGroups = target => {
      const groups = new Map();
      rows.forEach(row => {
        const snapshot = (detailFor(row)?.iv || []).find(entry => Number(entry[0]) === target);
        const ids = (snapshot?.[2] || []).filter(id => items[id]);
        if (!ids.length) return;
        const key = ids.join('>'), stat = groups.get(key) || { ids, games: 0, wins: 0, observed: [] };
        stat.games++; stat.wins += Number(row.w || 0); stat.observed.push(Number(snapshot[1])); groups.set(key, stat);
      });
      return [...groups.values()].sort((a, b) => b.games - a.games || b.wins - a.wins);
    };
    const inventoryRoute = (entry, total, index) => `<article class="pb-inventory-route"><span>#${index + 1} · ${entry.games}局</span><div>${entry.ids.map(id => { const item = items[id] || { name: id, icon: '' }; return `<span title="${esc(item.name)}">${icon(item.icon, item.name)}<b>${esc(item.name)}</b></span>`; }).join('')}</div><small>采用 ${pct(entry.games, total)} · 胜率 ${pct(entry.wins, entry.games)}</small></article>`;
    let exactOpeningHtml = '<div class="pb-no-data">正在读取出生时可观察库存…</div>';
    let concurrentInventoryHtml = '<div class="pb-no-data">正在读取控制时点完整背包…</div>';
    if (detailRowsReady(rows)) {
      const exact = inventoryGroups(0), exactCoverage = rows.filter(row => (detailFor(row)?.iv || []).some(entry => Number(entry[0]) === 0)).length;
      exactOpeningHtml = exact.length
        ? `<div class="pb-inventory-routes">${exact.slice(0, 3).map((entry, index) => inventoryRoute(entry, exactCoverage, index)).join('')}</div><small class="pb-evidence-note">出生库存覆盖 ${exactCoverage}/${rows.length}局；取0–90秒内最早可观察快照。</small>`
        : '<div class="pb-no-data">当前缓存尚未包含出生库存快照；下方0–3分钟购买日志仍可使用。</div>';
      const checkpoints = [[1200, '20分钟'], [2100, '35分钟'], [3300, '55分钟']];
      concurrentInventoryHtml = checkpoints.map(([target, label]) => {
        const groups = inventoryGroups(target), coverage = rows.filter(row => (detailFor(row)?.iv || []).some(entry => Number(entry[0]) === target)).length;
        return `<article class="pb-inventory-checkpoint"><header><b>${label}完整背包</b><small>${coverage}/${rows.length}局有快照</small></header>${groups.slice(0, 2).map((entry, index) => inventoryRoute(entry, coverage, index)).join('') || '<div class="pb-no-data">当前范围没有该时点背包快照</div>'}</article>`;
      }).join('');
    }

    const stages = [
      ['0–6分钟', 0, 360], ['6–15分钟', 361, 900], ['15–30分钟', 901, 1800], ['30分钟后', 1801, Number.MAX_SAFE_INTEGER],
    ];
    const stageHtml = stages.map(([label, from, to]) => {
      const choices = observedItemBreakdown(rows, (id, seconds, item) => item.class === 'regular' && !item.consumable && Number.isFinite(seconds) && seconds >= from && seconds <= to).slice(0, 4);
      return `<article class="pb-build-stage"><header><span>${label}</span><small>${choices.length ? '该阶段常见购买节点' : '没有可靠购买时点'}</small></header><div>${choices.map(stat => compactItemChoice(stat, rows.length)).join('') || '<span class="pb-no-data">—</span>'}</div></article>`;
    }).join('');

    let skillHtml = '<div class="pb-no-data">正在按比赛月份加载逐局技能加点日志…</div>';
    let talentHtml = '<div class="pb-no-data">正在按比赛月份加载逐局天赋选择日志…</div>';
    let skillCoverage = 0, skillStarRocks = 0, skillOpenDota = 0;
    if (detailRowsReady(rows)) {
      const skillRoutes = new Map(), talents = new Map();
      const configuredTalents = heroTalents[controls.hero.value] || [];
      const talentLevelBySlug = new Map(configuredTalents.map((slug, index) => [slug, [10, 15, 20, 25][Math.floor(index / 2)] || 25]));
      rows.forEach(row => {
        const abilityDetail = detailData.players?.[rowKey(row)] || {};
        const abilityRows = abilityDetail.a || [];
        const kit = new Set(heroAbilities[row.h] || []);
        const skills = abilityRows.filter(entry => !String(entry[1]).startsWith('special_bonus_') && (!kit.size || kit.has(entry[1]))).slice(0, 10).map(entry => entry[1]);
        if (skills.length) {
          skillCoverage++;
          if (abilityDetail.a_src === 'opendota') skillOpenDota++; else skillStarRocks++;
          const key = skills.join('>'), stat = skillRoutes.get(key) || { abilities: skills, games: 0, wins: 0 };
          stat.games++; stat.wins += Number(row.w || 0); skillRoutes.set(key, stat);
        }
        const rowTalents = abilityRows.filter(entry => String(entry[1]).startsWith('special_bonus_') && entry[1] !== 'special_bonus_attributes');
        rowTalents.forEach((entry, index) => {
          const level = talentLevelBySlug.get(entry[1]) || [10, 15, 20, 25][index] || 25, key = `${level}:${entry[1]}`;
          const stat = talents.get(key) || { level, slug: entry[1], games: 0, wins: 0 };
          stat.games++; stat.wins += Number(row.w || 0); talents.set(key, stat);
        });
      });
      const routes = [...skillRoutes.values()].sort((a, b) => b.games - a.games || b.wins - a.wins);
      const common = routes[0];
      const winning = routes.filter(route => route.games >= Math.max(2, Math.ceil(skillCoverage * .03))).sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games)[0];
      const skillRoute = (route, label) => route ? `<article><span>${label}</span><div class="pb-ability-route">${route.abilities.map((slug, index) => abilityStep(slug, index, false)).join('')}</div><small>${route.games}局 · ${pct(route.wins, route.games)} 样本胜率</small></article>` : '';
      skillHtml = skillRoute(common, '最常见前10次加点') + (winning && winning !== common ? skillRoute(winning, '较高胜率前10次加点') : '') || '<div class="pb-no-data">StarRocks 与 OpenDota 当前都没有可识别的技能加点记录；这不表示该英雄没有技能路线。</div>';
      const byLevel = new Map();
      [...talents.values()].forEach(stat => { if (!byLevel.has(stat.level)) byLevel.set(stat.level, []); byLevel.get(stat.level).push(stat); });
      talentHtml = [25, 20, 15, 10].map(level => {
        const observed = (byLevel.get(level) || []).sort((a, b) => b.games - a.games);
        const configured = configuredTalents.slice(([10, 15, 20, 25].indexOf(level)) * 2, ([10, 15, 20, 25].indexOf(level)) * 2 + 2);
        const slugs = (configured.length ? configured : observed.map(stat => stat.slug)).slice(0, 2);
        while (slugs.length < 2) slugs.push('');
        const total = observed.reduce((sum, stat) => sum + stat.games, 0);
        const cell = slug => {
          if (!slug) return '<div class="pb-talent-choice is-missing"><b>当前版本无可用天赋</b><small>—</small></div>';
          const stat = observed.find(row => row.slug === slug) || { games: 0, wins: 0 };
          return `<div class="pb-talent-choice ${stat.games ? '' : 'is-missing'}" title="${esc(slug)}"><b>${esc(abilityLabel(slug))}</b><small>采用 ${stat.games ? pct(stat.games, total) : '—'} · ${stat.games}局 · 胜率 ${stat.games ? pct(stat.wins, stat.games) : '—'}</small></div>`;
        };
        return `<article>${cell(slugs[0])}<span>${level}</span>${cell(slugs[1])}</article>`;
      }).join('') + '<small class="pb-talent-note">当前版本真实左右槽位 · 采用率分母为该等级有天赋记录的选手局</small>';
    } else {
      ensureDetailRows(rows).then(() => { if (activeTab === 'routes' && controls.hero.value) renderCompleteBuild(currentRows); }).catch(err => {
        if (activeTab === 'routes') { const target = document.getElementById('pb-complete-build-status'); if (target) target.textContent = `技能明细加载失败：${err.message}`; }
      });
    }

    const reconstructable = rows.filter(row => coreRoutePairs(row, 5).length >= 2).length;
    status.textContent = `${rows.length}局 · 路线可还原 ${pct(reconstructable, rows.length)} · 技能覆盖 ${pct(skillCoverage, rows.length)}`;
    host.innerHTML = `<section class="pb-complete-opening" id="pb-complete-opening"><header><div><span>01 / OPENING</span><h3>精确出生装与首轮补给</h3></div><small>库存快照与购买日志分开统计</small></header><div class="pb-opening-block"><h4>出生时可观察库存</h4>${exactOpeningHtml}</div><div class="pb-opening-block"><h4>0–3分钟购买记录</h4><div class="pb-opening-routes">${openingHtml}</div></div></section>
      <section class="pb-complete-stages" id="pb-complete-stages"><header><div><span>02 / ITEM PLAN</span><h3>阶段选择与同时持有装备</h3></div><small>每个阶段独立统计，不能连读为唯一固定路线；完整背包单独呈现</small></header><div>${stageHtml}</div><div class="pb-inventory-checkpoints">${concurrentInventoryHtml}</div></section>
      <section class="pb-complete-skills" id="pb-complete-skills"><header><div><span>03 / ABILITIES</span><h3>技能与天赋</h3></div><small>${skillCoverage ? `${skillCoverage}/${rows.length}局 · StarRocks ${skillStarRocks} · OpenDota兜底 ${skillOpenDota}` : '逐局明细按需加载'}</small></header><div class="pb-complete-skill-grid"><div>${skillHtml}</div><div class="pb-talent-tree">${talentHtml}</div></div></section>
      <section class="pb-complete-special" id="pb-complete-special"><header><div><span>04 / NEUTRALS</span><h3>中立物品与附魔</h3></div><small>OpenDota 精确选择历史 · 按 Tier 统计最终组合</small></header><div class="pb-neutral-analysis">${renderNeutralAnalysis(rows)}</div></section>
      <footer><strong>阅读边界</strong><span>这张卡描述职业样本中的常见选择；低样本胜率、阶段先后与装备效果都不能单独解释胜负。</span></footer>`;
  }

  function routeSimilarity(a, b) {
    if (!a.length || !b.length) return 0;
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
    return dp[a.length][b.length] / Math.min(a.length, b.length);
  }

  function stableRouteId(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return `rc-${(hash >>> 0).toString(36)}`;
  }

  function clusteredRoutes(rows) {
    const exact = new Map();
    rows.forEach(r => {
      const pairs = coreRoutePairs(r, 5), ids = pairs.map(x => x[0]);
      if (ids.length < 2) return;
      const key = ids.join('>'), variant = exact.get(key) || { key, ids, games: 0, wins: 0, rows: [], times: new Map() };
      variant.games++; variant.wins += Number(r.w || 0); variant.rows.push(r);
      pairs.forEach(([id, seconds]) => { if (!variant.times.has(id)) variant.times.set(id, []); variant.times.get(id).push(seconds); });
      exact.set(key, variant);
    });
    const variants = [...exact.values()].sort((a, b) => b.games - a.games || a.key.localeCompare(b.key));
    const clusters = [];
    variants.forEach(variant => {
      const candidates = clusters.map(cluster => ({ cluster, score: routeSimilarity(variant.ids, cluster.representative) }))
        .filter(row => row.score >= .6).sort((a, b) => b.score - a.score || a.cluster.stableId.localeCompare(b.cluster.stableId));
      let cluster = candidates[0]?.cluster;
      const score = candidates[0]?.score || 1;
      if (!cluster) {
        cluster = {
          stableId: stableRouteId(`${ROUTE_CLUSTER_VERSION}:${variant.key}`),
          representative: variant.ids.slice(), games: 0, wins: 0,
          variants: new Map(), times: new Map(), rows: [], similarityTotal: 0,
        };
        clusters.push(cluster);
      }
      cluster.games += variant.games; cluster.wins += variant.wins;
      cluster.variants.set(variant.key, variant); cluster.rows.push(...variant.rows);
      cluster.similarityTotal += score * variant.games;
      variant.times.forEach((values, id) => { if (!cluster.times.has(id)) cluster.times.set(id, []); cluster.times.get(id).push(...values); });
    });
    clusters.forEach(cluster => { cluster.avgSimilarity = cluster.games ? cluster.similarityTotal / cluster.games : 0; });
    return clusters.sort((a, b) => b.games - a.games || b.wins - a.wins);
  }

  function renderProBrief(rows, stats) {
    const confidence = document.getElementById('pb-brief-confidence');
    const routeHost = document.getElementById('pb-brief-route');
    const timingHost = document.getElementById('pb-brief-timings');
    const pivotHost = document.getElementById('pb-brief-pivots');
    const matchHost = document.getElementById('pb-brief-matches');
    if (!confidence || !routeHost || !timingHost || !pivotHost || !matchHost) return;

    const heroId = controls.hero.value;
    const timedRows = rows.filter(row => coreRoutePairs(row, 5).length >= 2);
    const routeCoverage = rows.length ? timedRows.length / rows.length : 0;
    const confidenceLevel = timedRows.length >= 20 && routeCoverage >= .35 ? '较强'
      : timedRows.length >= 8 && routeCoverage >= .15 ? '中等'
        : timedRows.length ? '有限' : '不可判定';
    confidence.innerHTML = `<span>路线可信度</span><strong>${confidenceLevel}</strong><small title="可还原=至少两件核心装备有真实购买时点">${timedRows.length}/${rows.length} 局带时点路线 · ${pct(timedRows.length, rows.length)} 覆盖</small>`;

    if (!heroId) {
      routeHost.innerHTML = '<div class="pb-empty">先选择一个英雄，简报才会比较同一英雄的职业路线。</div>';
      timingHost.innerHTML = '<div class="pb-empty">等待英雄样本</div>';
      pivotHost.innerHTML = '<div class="pb-empty">等待英雄与15分钟局势样本</div>';
      matchHost.innerHTML = '<div class="pb-empty">等待可复盘比赛</div>';
      return;
    }

    const clusters = clusteredRoutes(rows);
    const topRoute = clusters[0];
    if (topRoute) {
      const playerCount = new Set(topRoute.rows.map(row => row.s)).size;
      const steps = topRoute.representative.map((id, index) => {
        const item = items[id] || { name: id, icon: '' };
        const med = median(topRoute.times.get(id) || []);
        const useDelays = [];
        topRoute.rows.forEach(row => {
          const purchase = (row.i || []).find(pair => pair[0] === id)?.[1];
          const firstUse = new Map(row.u || []).get(id);
          if (Number.isFinite(purchase) && Number.isFinite(firstUse) && firstUse >= purchase) useDelays.push(firstUse - purchase);
        });
        const averageUse = mean(useDelays);
        return `${index ? '<span class="pb-brief-route-arrow">›</span>' : ''}<span class="pb-brief-route-step" title="${esc(item.name)} · 购买 ${timeText(med)} · 首用 ${intervalText(averageUse)}">${icon(item.icon, item.name)}<b>${esc(item.name)}</b><small>${timeText(med)}</small>${Number.isFinite(averageUse) ? `<i>首用 ${intervalText(averageUse)}</i>` : ''}</span>`;
      }).join('');
      routeHost.innerHTML = `<div class="pb-brief-route-steps">${steps}</div><div class="pb-brief-route-meta"><span><b>${topRoute.games}</b> 局路线样本</span><span><b>${pct(topRoute.games, timedRows.length)}</b> 可还原样本采用</span><span><b>${pct(topRoute.wins, topRoute.games)}</b> 样本胜率</span><span><b>${playerCount}</b> 位选手</span></div><p>这是当前筛选下最常见的可还原路线，不代表所有 ${rows.length} 局都按此路线出装。</p>`;
    } else {
      routeHost.innerHTML = `<div class="pb-empty">${rows.length ? `当前 ${rows.length} 局里没有至少两个可靠购买时点，不能拼出职业路线。` : '当前条件没有比赛样本。'}</div>`;
    }

    const keyTimings = stats.filter(stat => Number.isFinite(stat.median) && stat.games >= Math.max(1, Math.ceil(rows.length * .05)))
      .slice(0, 12).sort((a, b) => a.median - b.median || b.games - a.games).slice(0, 4);
    timingHost.innerHTML = keyTimings.map(stat => {
      const item = items[stat.id] || { name: stat.id, icon: '' };
      return `<div class="pb-brief-list-row">${icon(item.icon, item.name)}<span><b>${esc(item.name)}</b><small>${pct(stat.games, rows.length)} 采用 · ${stat.games} 局</small></span><strong>${timeText(stat.median)}${Number.isFinite(stat.averageFirstUseDelay) ? `<i>首用 ${intervalText(stat.averageFirstUseDelay)}</i>` : ''}</strong></div>`;
    }).join('') || '<div class="pb-empty">没有足够的可靠购买时点</div>';

    const overallRates = new Map(stats.map(stat => [stat.id, stat.games / Math.max(1, rows.length)]));
    const pivotFor = (sampleRows, label) => {
      if (sampleRows.length < 3) return `<div class="pb-brief-pivot is-missing"><span>${label}</span><strong>样本不足</strong><small>${sampleRows.length} 局，暂不概括</small></div>`;
      const candidates = itemStats(sampleRows).filter(stat => stat.games >= 2).map(stat => ({
        ...stat,
        lift: stat.games / sampleRows.length - (overallRates.get(stat.id) || 0),
      })).filter(stat => stat.lift > 0).sort((a, b) => b.lift - a.lift || b.games - a.games);
      const best = candidates[0];
      if (!best) return `<div class="pb-brief-pivot is-missing"><span>${label}</span><strong>没有明显变化</strong><small>${sampleRows.length} 局样本</small></div>`;
      const item = items[best.id] || { name: best.id, icon: '' };
      return `<div class="pb-brief-pivot"><span>${label}更常见</span>${icon(item.icon, item.name)}<strong>${esc(item.name)}</strong><small>采用率比总体高 ${pct(best.lift, 1)} · ${best.games}/${sampleRows.length} 局</small></div>`;
    };
    pivotHost.innerHTML = pivotFor(rows.filter(row => situation(row) === 'ahead'), '优势局')
      + pivotFor(rows.filter(row => situation(row) === 'behind'), '劣势局')
      + '<p>仅描述样本差异，不把胜负或经济领先解释为装备造成。</p>';

    const reviewRows = rows.slice().sort((a, b) => {
      const routeDelta = Number(coreRoutePairs(b, 5).length >= 2) - Number(coreRoutePairs(a, 5).length >= 2);
      return routeDelta || String(b.d || '').localeCompare(String(a.d || '')) || Number(b.w || 0) - Number(a.w || 0);
    }).slice(0, 3);
    matchHost.innerHTML = reviewRows.map(row => `<button type="button" data-pb-brief-match="${esc(rowKey(row))}"><span><b>${esc(row.n || row.s)}</b><small>${esc(row.t || '未知战队')} · ${esc(row.d || '')} · ${row.w ? '胜' : '负'}</small></span>${matchItemTimeline(row, true)}<i>复盘 ›</i></button>`).join('') || '<div class="pb-empty">当前条件没有可复盘比赛</div>';
  }

  function renderSequences(rows) {
    const context = document.getElementById('pb-route-context');
    const heroId = controls.hero.value;
    const heroName = heroId ? (heroes[heroId]?.name || heroId) : '';
    const timedRows = rows.filter(row => coreRoutePairs(row, 5).length >= 2);
    if (context) context.textContent = heroId
      ? `${heroName} · ${controls.from.value || '最早'} — ${controls.to.value || '最新'} · ${rows.length}局中 ${timedRows.length}局可还原路线`
      : '请先在筛选器中选择一个英雄';
    if (!heroId) {
      document.getElementById('pb-sequences').innerHTML = '<div class="pb-route-prompt">选择 Axe 等英雄后，这里会显示该英雄在指定比赛日期范围内的常见出装路线和每一步中位购买时间。</div>';
      return;
    }
    lastRouteClusters = clusteredRoutes(rows);
    const top = lastRouteClusters.slice(0, 10);
    if (selectedRouteClusterId && !lastRouteClusters.some(cluster => cluster.stableId === selectedRouteClusterId)) selectedRouteClusterId = '';
    const coverage = `<div class="pb-route-coverage-note"><strong>路线还原覆盖 ${timedRows.length.toLocaleString()}/${rows.length.toLocaleString()} 局（${pct(timedRows.length, rows.length)}）</strong><span>路线采用率仅以至少有两个可确认购买时点的比赛为分母；其余比赛不会被补造为路线。</span></div>`;
    const routeCards = top.map((entry, clusterIndex) => {
      const ids = entry.representative;
      const playerCount = new Set(entry.rows.map(row => row.s)).size;
      return `<article class="pb-sequence ${entry.stableId === selectedRouteClusterId ? 'is-selected' : ''}" data-pb-cluster="${entry.stableId}"><header><div><span>BUILD</span><b class="pb-cluster-id">#${clusterIndex + 1}</b></div><div><strong>${entry.games} 局</strong><small>${pct(entry.wins, entry.games)} 胜率</small></div></header><div class="pb-seq-items">${ids.map((id, idx) => {
        const item = items[id] || { name: id, icon: '' };
        const med = median(entry.times.get(id) || []);
        const useDelays = [];
        entry.rows.forEach(row => {
          const purchase = (row.i || []).find(pair => pair[0] === id)?.[1];
          const firstUse = new Map(row.u || []).get(id);
          if (Number.isFinite(purchase) && Number.isFinite(firstUse) && firstUse >= purchase) useDelays.push(firstUse - purchase);
        });
        const averageUse = mean(useDelays);
        return `${idx ? '<span class="pb-seq-arrow">›</span>' : ''}<span class="pb-seq-step" title="${esc(item.name)} · 购买 ${timeText(med)} · 首用 ${intervalText(averageUse)}${useDelays.length ? `（${useDelays.length}局）` : ''}">${icon(item.icon, item.name)}<small>买 ${timeText(med)}</small><i class="pb-first-use-gap ${Number.isFinite(averageUse) ? '' : 'is-missing'}">首用 ${intervalText(averageUse)}</i></span>`;
      }).join('')}</div><footer><span><b>${pct(entry.games, timedRows.length)}</b> 采用率</span><span><b>${playerCount}</b> 位选手</span><span><b>${entry.variants.size}</b> 种真实变体</span><span><b>${pct(entry.avgSimilarity, 1)}</b> 路线相似度</span></footer></article>`;
    }).join('');
    document.getElementById('pb-sequences').innerHTML = coverage + (routeCards || '<div class="pb-no-data">当前英雄和日期范围不足以形成稳定出装路线</div>');
    document.getElementById('pb-route-cluster-version').textContent = `${ROUTE_CLUSTER_VERSION} · LCS阈值60% · 确定性种子`;
    renderRouteDrilldown(rows);
  }

  function renderRouteDrilldown(rows) {
    const host = document.getElementById('pb-route-detail');
    if (!host) return;
    const cluster = lastRouteClusters.find(row => row.stableId === selectedRouteClusterId);
    if (!cluster) { host.innerHTML = '<div class="pb-empty">点击上方任一聚类路线，查看它由哪些真实对局构成</div>'; return; }
    const counts = getter => {
      const map = new Map(); cluster.rows.forEach(r => { const key = getter(r); if (key) map.set(key, (map.get(key) || 0) + 1); }); return [...map].sort((a, b) => b[1] - a[1]);
    };
    const players = counts(r => r.n).slice(0, 8), teams = counts(r => r.t).slice(0, 6), states = counts(r => situationName(situation(r)));
    const opponents = new Map(); cluster.rows.forEach(r => enemyHeroes(r).forEach(hero => opponents.set(hero, (opponents.get(hero) || 0) + 1)));
    const topOpponents = [...opponents].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const variants = [...cluster.variants.values()].sort((a, b) => b.games - a.games || a.key.localeCompare(b.key)).slice(0, 8);
    const routeHtml = ids => ids.map((id, idx) => { const item = items[id] || { name: id, icon: '' }; return `${idx ? '<span class="pb-seq-arrow">›</span>' : ''}${icon(item.icon, item.name)}`; }).join('');
    const matches = cluster.rows.slice().sort((a, b) => b.d.localeCompare(a.d) || b.m - a.m).slice(0, 30);
    const clusterKeys = new Set(cluster.rows.map(rowKey)), restRows = rows.filter(r => !clusterKeys.has(rowKey(r)));
    const metrics = sample => {
      const first = sample.map(r => coreRoutePairs(r, 1)[0]?.[1]).filter(Number.isFinite);
      const gpm = sample.map(r => Number(r.nw || 0) / Math.max(1, Number(r.du || 0) / 60)).filter(Number.isFinite);
      return { games: sample.length, wins: sample.reduce((sum, r) => sum + Number(r.w || 0), 0), first: median(first), duration: median(sample.map(r => Number(r.du)).filter(Number.isFinite)), gpm: median(gpm), ahead: sample.filter(r => situation(r) === 'ahead').length };
    };
    const cm = metrics(cluster.rows), rm = metrics(restRows);
    const deltaPct = (a, ad, b, bd) => (ad && bd) ? (a / ad - b / bd) : 0;
    const benchmarkCards = [
      ['胜率差', deltaPct(cm.wins, cm.games, rm.wins, rm.games), 'pct'],
      ['优势局占比差', deltaPct(cm.ahead, cm.games, rm.ahead, rm.games), 'pct'],
      ['核心首件时间差', Number(cm.first) - Number(rm.first), 'time'],
      ['比赛时长差', Number(cm.duration) - Number(rm.duration), 'time'],
      ['终局经济效率差', Number(cm.gpm) - Number(rm.gpm), 'number'],
    ];
    const clusterItems = new Map(itemStats(cluster.rows).map(s => [s.id, s])), restItems = new Map(itemStats(restRows).map(s => [s.id, s]));
    const itemDeltas = [...clusterItems.values()].map(stat => ({ id: stat.id, rate: stat.games / Math.max(1, cluster.rows.length), rest: (restItems.get(stat.id)?.games || 0) / Math.max(1, restRows.length) }))
      .map(row => ({ ...row, delta: row.rate - row.rest })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8);
    const benchmarkHtml = `<div class="pb-route-benchmark"><div class="pb-benchmark-cards">${benchmarkCards.map(([label, value, type]) => {
      const positive = Number(value) >= 0, display = type === 'pct' ? `${positive ? '+' : ''}${pct(Number(value), 1)}` : type === 'time' ? `${positive ? '+' : '−'}${timeText(Math.abs(Number(value)))}` : `${positive ? '+' : ''}${Math.round(Number(value) || 0)}`;
      return `<article><span>${label}</span><strong class="${positive ? 'pb-up' : 'pb-down'}">${display}</strong><small>路线簇 vs 其他路线</small></article>`;
    }).join('')}</div><div class="pb-benchmark-items"><h4>路线最显著的装备偏好</h4>${itemDeltas.map(row => { const item = items[row.id] || { name: row.id, icon: '' }; return `<div><span class="pb-item-name">${icon(item.icon, item.name)}${esc(item.name)}</span><b>${pct(row.rate, 1)} vs ${pct(row.rest, 1)}</b><strong class="${row.delta >= 0 ? 'pb-up' : 'pb-down'}">${row.delta >= 0 ? '+' : ''}${pct(row.delta, 1)}</strong></div>`; }).join('')}</div><p>以上为当前筛选内的描述性基线差异，不代表该路线导致胜率变化。</p></div>`;
    host.innerHTML = `<div class="pb-route-detail-head"><div><span>稳定簇ID</span><strong>${cluster.stableId}</strong><small>${ROUTE_CLUSTER_VERSION} · 平均相似度 ${pct(cluster.avgSimilarity, 1)}</small></div><div class="pb-mini-route">${routeHtml(cluster.representative)}</div><div><span>样本</span><strong>${cluster.games}局</strong><small>胜率 ${pct(cluster.wins, cluster.games)} · ${cluster.variants.size}种真实变体</small></div></div>
      <div class="pb-route-breakdown"><article><h4>主要选手</h4>${players.map(([name, count]) => `<span>${esc(name)}<b>${count}</b></span>`).join('')}</article><article><h4>主要战队</h4>${teams.map(([name, count]) => `<span>${esc(name)}<b>${count}</b></span>`).join('')}</article><article><h4>15分钟局势</h4>${states.map(([name, count]) => `<span>${esc(name)}<b>${count} · ${pct(count, cluster.games)}</b></span>`).join('')}</article><article><h4>常见对手</h4>${topOpponents.map(([id, count]) => `<span>${esc(heroes[id]?.name || id)}<b>${count}</b></span>`).join('')}</article></div>
      <h4 class="pb-route-detail-title">相对其他路线的基线差异</h4>${benchmarkHtml}
      <h4 class="pb-route-detail-title">真实路线变体</h4><div class="pb-route-variants">${variants.map(variant => `<div><span class="pb-mini-route">${routeHtml(variant.ids)}</span><strong>${variant.games}局</strong><small>${pct(variant.wins, variant.games)}</small></div>`).join('')}</div>
      <h4 class="pb-route-detail-title">对应比赛（点击进入单局复盘）</h4><div class="pb-table-wrap"><table class="pb-table"><thead><tr><th>日期 / 比赛</th><th>选手</th><th>战队</th><th>位置</th><th>局势</th><th>结果</th></tr></thead><tbody>${matches.map(r => `<tr data-pb-cluster-match="${esc(rowKey(r))}"><td>${r.d}<br><small>${r.m}</small></td><td>${esc(r.n)}</td><td>${esc(r.t)}</td><td>${r.r || '—'}</td><td>${situationName(situation(r))}</td><td>${r.w ? '胜' : '负'}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function routeTrendBucket(row, grain) {
    if (grain === 'patch') return { key: `patch:${row.p || 'unknown'}`, label: row.p || '未知版本', date: row.d || '' };
    if (grain === 'month') return { key: `month:${String(row.d || '').slice(0, 7)}`, label: String(row.d || '').slice(0, 7), date: row.d || '' };
    const date = new Date(`${row.d}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return { key: 'week:unknown', label: '未知日期', date: '' };
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const start = date.toISOString().slice(0, 10);
    return { key: `week:${start}`, label: `${start.slice(5)}周`, date: start };
  }

  function renderRouteTrends(rows) {
    const host = document.getElementById('pb-route-trends'), select = document.getElementById('pb-route-trend-grain'), context = document.getElementById('pb-route-trend-context');
    if (!host || !select) return;
    select.value = routeTrendGrain;
    if (!controls.hero.value) { host.innerHTML = '<div class="pb-route-prompt">选择英雄后，这里会展示完整出装路线随时间或版本的采用率变化。</div>'; return; }
    const timedRows = rows.filter(row => coreRoutePairs(row, 5).length >= 2);
    const coverageText = `可还原 ${timedRows.length.toLocaleString()}/${rows.length.toLocaleString()}局（${pct(timedRows.length, rows.length)}）`;
    if (context) context.textContent = coverageText;
    const membership = new Map();
    lastRouteClusters.forEach(cluster => cluster.rows.forEach(row => membership.set(rowKey(row), cluster.stableId)));
    const bucketMap = new Map();
    timedRows.forEach(row => {
      const info = routeTrendBucket(row, routeTrendGrain);
      if (!bucketMap.has(info.key)) bucketMap.set(info.key, { ...info, total: 0, routes: new Map() });
      const bucket = bucketMap.get(info.key); bucket.total++;
      const clusterId = membership.get(rowKey(row));
      if (clusterId) bucket.routes.set(clusterId, (bucket.routes.get(clusterId) || 0) + 1);
      if (!bucket.date || row.d < bucket.date) bucket.date = row.d;
    });
    const allBuckets = [...bucketMap.values()].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
    const buckets = allBuckets.slice(-16);
    const candidates = lastRouteClusters.filter(cluster => cluster.games >= 3).slice(0, 6);
    if (!buckets.length || !candidates.length) { host.innerHTML = '<div class="pb-no-data">当前筛选不足以形成可追踪的路线趋势（每条路线至少3局）。</div>'; return; }
    const aggregateRate = (clusterId, sample) => {
      const total = sample.reduce((sum, bucket) => sum + bucket.total, 0);
      const count = sample.reduce((sum, bucket) => sum + (bucket.routes.get(clusterId) || 0), 0);
      return total ? count / total : 0;
    };
    const spark = values => {
      const width = 190, height = 46, max = Math.max(.01, ...values), denom = Math.max(1, values.length - 1);
      const points = values.map((value, index) => `${(index * width / denom).toFixed(1)},${(height - 4 - value / max * (height - 8)).toFixed(1)}`).join(' ');
      return `<svg class="pb-route-spark" viewBox="0 0 ${width} ${height}" role="img" aria-label="路线采用率趋势"><line x1="0" y1="42" x2="190" y2="42"></line><polyline points="${points}"></polyline>${values.map((value, index) => `<circle cx="${(index * width / denom).toFixed(1)}" cy="${(height - 4 - value / max * (height - 8)).toFixed(1)}" r="2"><title>${buckets[index].label}：${pct(value, 1)}</title></circle>`).join('')}</svg>`;
    };
    const recentCount = Math.min(2, buckets.length), recentBuckets = buckets.slice(-recentCount), priorBuckets = buckets.length > recentCount ? buckets.slice(Math.max(0, buckets.length - recentCount * 2), -recentCount) : buckets.slice(0, 1);
    const routeHtml = ids => ids.map((id, index) => { const item = items[id] || { name: id, icon: '' }; return `${index ? '<span class="pb-seq-arrow">›</span>' : ''}${icon(item.icon, item.name)}`; }).join('');
    const rowsHtml = candidates.map((cluster, index) => {
      const values = buckets.map(bucket => (bucket.routes.get(cluster.stableId) || 0) / Math.max(1, bucket.total));
      const prior = aggregateRate(cluster.stableId, priorBuckets), recent = aggregateRate(cluster.stableId, recentBuckets), delta = recent - prior;
      const activeDates = cluster.rows.map(row => row.d).sort(), ci = wilson(cluster.wins, cluster.games);
      const confidence = cluster.games >= 30 ? '较高' : cluster.games >= 10 ? '中等' : '探索';
      return `<tr><td><div class="pb-trend-route"><b>#${index + 1}</b><span class="pb-mini-route">${routeHtml(cluster.representative)}</span><small>${cluster.stableId}</small></div></td><td>${cluster.games}<br><small>${confidence}样本</small></td><td>${spark(values)}<small>${buckets[0].label} → ${buckets.at(-1).label}</small></td><td>${pct(prior, 1)}</td><td>${pct(recent, 1)}</td><td><strong class="${delta >= 0 ? 'pb-up' : 'pb-down'}">${delta >= 0 ? '+' : ''}${pct(delta, 1)}</strong></td><td>${pct(cluster.wins, cluster.games)}<br><small>95% ${pct(ci[0], 1)}–${pct(ci[1], 1)}</small></td><td>${activeDates[0] || '—'}<br><small>最近 ${activeDates.at(-1) || '—'}</small></td></tr>`;
    }).join('');
    const hidden = Math.max(0, allBuckets.length - buckets.length);
    context.textContent = `${routeTrendGrain === 'week' ? '按周' : routeTrendGrain === 'month' ? '按月' : '按版本'} · ${coverageText} · 最近${buckets.length}个时间桶${hidden ? `（隐藏更早${hidden}个）` : ''}`;
    host.innerHTML = `<table class="pb-table pb-route-trend-table"><thead><tr><th>完整路线簇</th><th>样本</th><th>采用率走势</th><th>前段采用</th><th>最近采用</th><th>变化</th><th>样本胜率</th><th>生命周期</th></tr></thead><tbody>${rowsHtml}</tbody></table><p class="pb-route-trend-note">各时间桶的采用率分母仅包含可还原路线的比赛；当前${coverageText}。前段与最近均优先使用相邻两个时间桶；胜率为描述性结果，采用率变化不表示路线造成胜负变化。</p>`;
  }

  function renderBranchTree(rows) {
    const host = document.getElementById('pb-branch-tree');
    if (!controls.hero.value) { host.innerHTML = '<div class="pb-route-prompt">选择英雄后，这里会按核心装备节点展示路线分叉。</div>'; return; }
    const root = { children: new Map() };
    rows.forEach(r => {
      let cursor = root;
      coreRoutePairs(r, 4).forEach(([id, seconds]) => {
        if (!cursor.children.has(id)) cursor.children.set(id, { id, games: 0, wins: 0, times: [], children: new Map() });
        const node = cursor.children.get(id); node.games++; node.wins += Number(r.w || 0); node.times.push(seconds); cursor = node;
      });
    });
    const renderLevel = (children, depth) => {
      const nodes = [...children.values()].filter(n => n.games >= (depth ? 2 : 3)).sort((a, b) => b.games - a.games).slice(0, depth ? 5 : 8);
      if (!nodes.length) return '';
      return `<ul class="${depth ? 'pb-tree-children' : ''}">${nodes.map(node => {
        const item = items[node.id] || { name: node.id, icon: '' }, nested = depth < 3 ? renderLevel(node.children, depth + 1) : '';
        return `<li><div class="pb-tree-node"><span class="pb-tree-item">${icon(item.icon, item.name)}<b>${esc(item.name)}</b></span><strong>${node.games}局</strong><small>${pct(node.wins, node.games)}</small><small>中位 ${timeText(median(node.times))}</small></div>${nested}</li>`;
      }).join('')}</ul>`;
    };
    host.innerHTML = renderLevel(root.children, 0) || '<div class="pb-no-data">当前条件不足以形成稳定分支</div>';
  }

  function renderPlayers(rows) {
    const groups = new Map();
    rows.forEach(r => {
      const key = r.s || r.n;
      let g = groups.get(key);
      if (!g) g = { name: r.n || key, games: 0, wins: 0, scores: [], teams: new Map(), routes: new Map(), finalBuilds: new Map() };
      g.games++; g.wins += Number(r.w || 0); g.teams.set(r.t, (g.teams.get(r.t) || 0) + 1);
      const score = performanceScore(r); if (Number.isFinite(score)) g.scores.push(score);
      const firstUses = new Map(r.u || []);
      const routeCostFloor = Number(r.r) >= 4 ? 700 : 1200;
      const sequence = (r.i || []).filter(([id, seconds]) => {
        if (!includeItem(id) || !Number.isFinite(seconds)) return false;
        const cost = Number(items[id]?.cost || 0);
        return cost >= routeCostFloor || /boots|blink|spirit_vessel|urn_of_shadows/.test(id);
      }).sort((a, b) => a[1] - b[1]).slice(0, 4);
      if (sequence.length >= 2) {
        const routeKey = `${r.h}|${sequence.map(pair => pair[0]).join('>')}`;
        const route = g.routes.get(routeKey) || { hero: r.h, games: 0, wins: 0, times: sequence.map(() => []), useDelays: sequence.map(() => []) };
        route.games++; route.wins += Number(r.w || 0);
        sequence.forEach(([id, purchaseTime], idx) => {
          route.times[idx].push(purchaseTime);
          const firstUse = firstUses.get(id);
          if (Number.isFinite(firstUse) && firstUse >= purchaseTime) route.useDelays[idx].push(firstUse - purchaseTime);
        });
        g.routes.set(routeKey, route);
      }
      const finalIds = [...new Set((r.i || []).map(pair => pair[0]).filter(id => {
        if (!includeItem(id)) return false;
        const cost = Number(items[id]?.cost || 0);
        return cost >= routeCostFloor || /boots|blink|spirit_vessel|urn_of_shadows/.test(id);
      }))].sort();
      if (finalIds.length >= 2) {
        const buildKey = `${r.h}|${finalIds.join('>')}`;
        const build = g.finalBuilds.get(buildKey) || { hero: r.h, games: 0, wins: 0 };
        build.games++; build.wins += Number(r.w || 0);
        g.finalBuilds.set(buildKey, build);
      }
      groups.set(key, g);
    });
    const top = [...groups.values()].sort((a, b) => b.games - a.games || b.wins - a.wins).slice(0, 25);
    document.getElementById('pb-players-body').innerHTML = top.map(g => {
      const team = [...g.teams].sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
      const routeEntry = [...g.routes].sort((a, b) => b[1].games - a[1].games || b[1].wins - a[1].wins)[0];
      let routeHtml = '—', routeRate = '—', routeWinRate = '—';
      if (routeEntry) {
        const [routeKey, route] = routeEntry;
        const hero = heroes[route.hero] || { name: route.hero, icon: '' };
        const ids = routeKey.split('|')[1].split('>');
        routeHtml = `<div class="pb-player-route"><span class="pb-route-hero">${icon(hero.icon, hero.name)}<b>${esc(hero.name)}</b></span><span class="pb-seq-items">${ids.map((id, idx) => {
          const item = items[id] || { name: id, icon: '' }, med = median(route.times[idx] || []);
          const useDelays = route.useDelays[idx] || [], averageUseDelay = mean(useDelays);
          return `${idx ? '<span class="pb-seq-arrow">›</span>' : ''}<span class="pb-seq-step" title="${esc(item.name)} · 购买中位 ${timeText(med)} · 平均首用 ${intervalText(averageUseDelay)}${useDelays.length ? `（${useDelays.length}局）` : ''}">${icon(item.icon, item.name)}<small>买 ${timeText(med)}</small><em class="pb-first-use-gap ${useDelays.length ? '' : 'is-missing'}">首用 ${intervalText(averageUseDelay)}</em></span>`;
        }).join('')}</span></div>`;
        routeRate = `${pct(route.games, g.games)} (${route.games}局)`;
        routeWinRate = pct(route.wins, route.games);
      } else {
        const buildEntry = [...g.finalBuilds].sort((a, b) => b[1].games - a[1].games || b[1].wins - a[1].wins)[0];
        if (buildEntry) {
          const [buildKey, build] = buildEntry;
          const hero = heroes[build.hero] || { name: build.hero, icon: '' };
          const ids = buildKey.split('|')[1].split('>');
          routeHtml = `<div class="pb-player-route pb-player-build-fallback" title="这些物品来自终局背包；缺少购买时点，因此不表示先后顺序"><span class="pb-route-hero">${icon(hero.icon, hero.name)}<b>${esc(hero.name)}</b></span><span class="pb-seq-items">${ids.map(id => { const item = items[id] || { name: id, icon: '' }; return `<span class="pb-seq-step">${icon(item.icon, item.name)}</span>`; }).join('')}</span><small>终局成装组合 · 顺序待还原</small></div>`;
          routeRate = `成装覆盖 ${pct(build.games, g.games)} (${build.games}局)`;
          routeWinRate = '路线胜率待还原';
        }
      }
      const score = mean(g.scores);
      return `<tr><td><strong>${esc(g.name)}</strong></td><td>${esc(team)}</td><td>${g.games}</td><td class="${g.wins / g.games >= .5 ? 'pb-up' : 'pb-down'}">${pct(g.wins, g.games)}</td><td><strong class="${Number(score) >= 60 ? 'pb-up' : Number(score) < 40 ? 'pb-down' : ''}">${Number.isFinite(score) ? score : '—'}</strong></td><td>${routeHtml}</td><td>${routeRate}</td><td>${routeWinRate}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="pb-no-data">没有选手路线数据</td></tr>';
  }

  function playerStyleProfiles(rows) {
    const groups = new Map();
    rows.forEach(r => {
      if (!r.s) return;
      const g = groups.get(r.s) || { id: r.s, name: r.n || r.s, games: 0, wins: 0, teams: new Map(), first: [], gpm: [], teamGames: 0, aggressionGames: 0, routes: new Map() };
      g.games++; g.wins += Number(r.w || 0); g.teams.set(r.t, (g.teams.get(r.t) || 0) + 1);
      const core = coreRoutePairs(r, 4), first = core[0]?.[1]; if (Number.isFinite(first)) g.first.push(first);
      if (Number(r.du) > 0 && Number(r.nw) > 0) g.gpm.push(Number(r.nw) / (Number(r.du) / 60));
      const ids = new Set((r.i || []).map(x => x[0]));
      if ([...teamStyleItems].some(id => ids.has(id))) g.teamGames++;
      if ([...aggressionStyleItems].some(id => ids.has(id))) g.aggressionGames++;
      if (core.length >= 2) { const key = core.map(x => x[0]).join('>'); g.routes.set(key, (g.routes.get(key) || 0) + 1); }
      groups.set(r.s, g);
    });
    const profiles = [...groups.values()].filter(g => g.games >= 3).map(g => {
      const validRoutes = [...g.routes.values()].reduce((sum, count) => sum + count, 0), topRoute = [...g.routes].sort((a, b) => b[1] - a[1])[0];
      return { ...g, raw: { tempo: median(g.first), team: g.teamGames / g.games, aggression: g.aggressionGames / g.games, stability: validRoutes ? (topRoute?.[1] || 0) / validRoutes : 0, economy: median(g.gpm), diversity: validRoutes ? g.routes.size / validRoutes : 0 }, topRoute };
    });
    const keys = ['tempo','team','aggression','stability','economy','diversity'];
    keys.forEach(key => {
      const values = profiles.map(p => Number(p.raw[key])).filter(Number.isFinite), min = Math.min(...values), max = Math.max(...values);
      profiles.forEach(p => { let value = Number(p.raw[key]); let score = Number.isFinite(value) && max > min ? (value - min) * 100 / (max - min) : 50; if (key === 'tempo') score = 100 - score; p.scores = { ...(p.scores || {}), [key]: Math.max(0, Math.min(100, score)) }; });
    });
    return profiles.sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
  }

  function renderPlayerStyle(rows) {
    const select = document.getElementById('pb-style-player'), radar = document.getElementById('pb-style-radar'), summary = document.getElementById('pb-style-summary'), similar = document.getElementById('pb-style-similar');
    if (!select || !radar || !summary || !similar) return;
    const profiles = playerStyleProfiles(rows), old = select.value;
    select.innerHTML = profiles.map(p => option(p.id, `${p.name} (${p.games}局)`)).join('');
    select.value = profiles.some(p => p.id === old) ? old : (profiles[0]?.id || '');
    const profile = profiles.find(p => p.id === select.value);
    if (!profile) { radar.innerHTML = '<div class="pb-no-data">至少需要3局样本</div>'; summary.innerHTML = ''; similar.innerHTML = ''; return; }
    const axes = [['tempo','成装速度'],['team','团队装'],['aggression','进攻装'],['stability','路线稳定'],['economy','经济效率'],['diversity','路线多样']];
    const cx = 180, cy = 145, radius = 100, point = (index, scale) => { const angle = -Math.PI / 2 + index * Math.PI * 2 / axes.length; return [cx + Math.cos(angle) * radius * scale, cy + Math.sin(angle) * radius * scale]; };
    const rings = [.25,.5,.75,1].map(scale => `<polygon points="${axes.map((_, i) => point(i, scale).join(',')).join(' ')}"/>`).join('');
    const axisLines = axes.map(([, label], i) => { const [x, y] = point(i, 1), [lx, ly] = point(i, 1.22); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/><text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${label}</text>`; }).join('');
    const valuePoints = axes.map(([key], i) => point(i, profile.scores[key] / 100).join(',')).join(' ');
    radar.innerHTML = `<svg viewBox="0 0 360 290" role="img" aria-label="${esc(profile.name)}风格雷达图"><g class="pb-radar-grid">${rings}${axisLines}</g><polygon class="pb-radar-value" points="${valuePoints}"/>${axes.map(([key], i) => { const [x, y] = point(i, profile.scores[key] / 100); return `<circle cx="${x}" cy="${y}" r="4"><title>${axes[i][1]} ${profile.scores[key].toFixed(0)}</title></circle>`; }).join('')}</svg>`;
    const team = [...profile.teams].sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    const rawCards = [['成装速度',timeText(profile.raw.tempo)],['团队装局率',pct(profile.teamGames,profile.games)],['进攻装局率',pct(profile.aggressionGames,profile.games)],['路线稳定度',pct(profile.raw.stability,1)],['终局经济效率',`${Math.round(profile.raw.economy || 0)} /分钟`],['路线多样度',pct(profile.raw.diversity,1)]];
    summary.innerHTML = `<h3>${esc(profile.name)}</h3><p>${esc(team)} · ${profile.games}局 · 胜率${pct(profile.wins,profile.games)}</p><div>${rawCards.map(([label,value],i)=>`<article><span>${label}</span><strong>${value}</strong><small>样本标准分 ${profile.scores[axes[i][0]].toFixed(0)}</small></article>`).join('')}</div>`;
    const distances = profiles.filter(p => p.id !== profile.id).map(p => {
      const distance = Math.sqrt(axes.reduce((sum,[key]) => sum + Math.pow(profile.scores[key]-p.scores[key],2),0)); return { p, similarity: Math.max(0,100-distance/Math.sqrt(axes.length)) };
    }).sort((a,b)=>b.similarity-a.similarity).slice(0,10);
    similar.innerHTML = `<table class="pb-table"><thead><tr><th>相似选手</th><th>战队</th><th>局数</th><th>风格相似度</th><th>代表核心路线</th></tr></thead><tbody>${distances.map(({p,similarity}) => { const pTeam=[...p.teams].sort((a,b)=>b[1]-a[1])[0]?.[0]||'—', route=p.topRoute?.[0]?.split('>')||[]; return `<tr><td><strong>${esc(p.name)}</strong></td><td>${esc(pTeam)}</td><td>${p.games}</td><td>${similarity.toFixed(1)}</td><td><span class="pb-mini-route">${route.map(id=>{const it=items[id]||{name:id,icon:''};return icon(it.icon,it.name)}).join('')}</span></td></tr>`; }).join('')}</tbody></table>`;
  }

  function routeSequences(rows, limit) {
    const counts = new Map();
    rows.forEach(r => {
      const seq = coreRoutePairs(r, limit || 6);
      if (seq.length < 2) return;
      const key = seq.map(x => x[0]).join('>');
      const entry = counts.get(key) || { count: 0, wins: 0, times: seq.map(() => []) };
      entry.count++; entry.wins += Number(r.w || 0);
      seq.forEach((pair, idx) => entry.times[idx].push(pair[1]));
      counts.set(key, entry);
    });
    return [...counts].sort((a, b) => b[1].count - a[1].count);
  }

  function renderRouteFlow(rows) {
    const host = document.getElementById('pb-route-flow');
    const routes = routeSequences(rows, 6).slice(0, 18);
    if (!controls.hero.value || !routes.length) {
      host.innerHTML = '<div class="pb-route-prompt">选择英雄后生成路线流向图；节点是第 N 件常见物品，连线宽度代表共同出现次数。</div>';
      return;
    }
    const nodes = new Map(), edges = new Map();
    routes.forEach(([key, stat]) => {
      const ids = key.split('>');
      ids.forEach((id, step) => nodes.set(`${step}|${id}`, (nodes.get(`${step}|${id}`) || 0) + stat.count));
      ids.slice(0, -1).forEach((id, step) => {
        const edge = `${step}|${id}|${ids[step + 1]}`;
        edges.set(edge, (edges.get(edge) || 0) + stat.count);
      });
    });
    const byStep = new Map();
    [...nodes].forEach(([key, count]) => {
      const [step, id] = key.split('|');
      if (!byStep.has(step)) byStep.set(step, []);
      byStep.get(step).push({ id, count });
    });
    byStep.forEach(list => list.sort((a, b) => b.count - a.count).splice(6));
    const pos = new Map();
    let maxStep = 0, maxRows = 1;
    byStep.forEach((list, stepText) => {
      const step = Number(stepText); maxStep = Math.max(maxStep, step); maxRows = Math.max(maxRows, list.length);
      list.forEach((node, idx) => pos.set(`${step}|${node.id}`, { x: 34 + step * 150, y: 34 + idx * 62, ...node }));
    });
    const width = Math.max(640, 105 + maxStep * 150), height = Math.max(160, 44 + maxRows * 62);
    const maxEdge = Math.max(1, ...edges.values());
    const edgeSvg = [...edges].map(([key, count]) => {
      const [step, from, to] = key.split('|'), a = pos.get(`${step}|${from}`), b = pos.get(`${Number(step) + 1}|${to}`);
      if (!a || !b) return '';
      return `<path d="M${a.x + 42},${a.y + 17} C${a.x + 85},${a.y + 17} ${b.x - 42},${b.y + 17} ${b.x},${b.y + 17}" stroke="rgba(196,163,82,.65)" stroke-width="${Math.max(1.5, count * 10 / maxEdge)}" fill="none"><title>${count} 局</title></path>`;
    }).join('');
    const nodeSvg = [...pos].map(([key, p]) => {
      const item = items[p.id] || { name: p.id, icon: '' }, step = Number(key.split('|')[0]) + 1;
      return `<g><rect x="${p.x}" y="${p.y}" width="84" height="36" rx="3" fill="#11181d" stroke="#596149"/><image href="${esc(item.icon)}" x="${p.x + 4}" y="${p.y + 5}" width="34" height="25"/><text x="${p.x + 43}" y="${p.y + 15}" fill="#e4e9ed" font-size="9">${esc(item.name).slice(0, 9)}</text><text x="${p.x + 43}" y="${p.y + 27}" fill="#9b8750" font-size="8">第${step}件 · ${p.count}局</text></g>`;
    }).join('');
    host.innerHTML = `<svg id="pb-route-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="出装路线流向图">${edgeSvg}${nodeSvg}</svg>`;
  }

  function renderRecommendation(rows, stats) {
    const host = document.getElementById('pb-recommendation');
    const eligible = stats.filter(s => s.games >= Math.max(3, Math.ceil(rows.length * .03)));
    const scored = eligible.map(s => ({ ...s, score: (s.games / Math.max(1, rows.length)) * .45 + s.adjusted * .4 + (s.median ? Math.max(0, 1 - s.median / 3600) : 0) * .15 }))
      .sort((a, b) => b.score - a.score).slice(0, 5);
    const route = controls.hero.value ? clusteredRoutes(rows)[0] : null;
    const routeHtml = route ? route.representative.map(id => {
      const it = items[id] || { name: id, icon: '' }; return icon(it.icon, it.name);
    }).join('<span class="pb-seq-arrow">›</span>') : '样本不足';
    host.innerHTML = `<article><span>推荐核心路线簇</span><div class="pb-mini-route">${routeHtml}</div><small>${route ? `${route.games}局 · ${route.variants.size}种近似变体 · 胜率 ${pct(route.wins, route.games)}` : '请选择英雄并扩大日期范围'}</small></article>
      ${scored.map((s, idx) => { const it = items[s.id] || { name: s.id, icon: '' }; return `<article><span>#${idx + 1} 综合候选</span><strong>${icon(it.icon, it.name)} ${esc(it.name)}</strong><small>采用 ${pct(s.games, rows.length)} · 校正胜率 ${pct(s.adjusted, 1)} · ${timeText(s.median)}</small></article>`; }).join('') || '<div class="pb-no-data">当前条件没有达到最低样本量的推荐</div>'}`;
  }

  function renderComparison(rows) {
    const host = document.getElementById('pb-comparison');
    const from = new Date(`${controls.from.value}T00:00:00Z`), to = new Date(`${controls.to.value}T00:00:00Z`);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from) { host.innerHTML = '<div class="pb-no-data">请选择有效日期范围</div>'; return; }
    const days = Math.round((to - from) / 86400000) + 1;
    const prevTo = new Date(from.getTime() - 86400000), prevFrom = new Date(prevTo.getTime() - (days - 1) * 86400000);
    const iso = d => d.toISOString().slice(0, 10);
    const base = filteredRows(true), previous = base.filter(r => r.d >= iso(prevFrom) && r.d <= iso(prevTo));
    const curMap = new Map(itemStats(rows).map(s => [s.id, s])), prevMap = new Map(itemStats(previous).map(s => [s.id, s]));
    const candidates = [...curMap.values()].sort((a, b) => b.games - a.games).slice(0, 15);
    document.getElementById('pb-compare-context').textContent = `${controls.from.value}—${controls.to.value} vs ${iso(prevFrom)}—${iso(prevTo)}`;
    host.innerHTML = `<table class="pb-table"><thead><tr><th>物品</th><th>当前采用</th><th>前窗采用</th><th>变化</th><th>胜率变化</th></tr></thead><tbody>${candidates.map(s => {
      const old = prevMap.get(s.id), nowRate = s.games / Math.max(1, rows.length), oldRate = (old?.games || 0) / Math.max(1, previous.length), delta = nowRate - oldRate;
      const item = items[s.id] || { name: s.id, icon: '' }, wrDelta = s.wins / s.games - (old?.games ? old.wins / old.games : 0);
      return `<tr><td><span class="pb-item-name">${icon(item.icon, item.name)}${esc(item.name)}</span></td><td>${pct(s.games, rows.length)}</td><td>${pct(old?.games || 0, previous.length)}</td><td class="${delta >= 0 ? 'pb-up' : 'pb-down'}">${delta >= 0 ? '+' : ''}${pct(delta, 1)}</td><td>${old ? `${wrDelta >= 0 ? '+' : ''}${pct(wrDelta, 1)}` : '新出现'}</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  function renderSituations(rows) {
    const host = document.getElementById('pb-situations');
    host.innerHTML = ['ahead', 'even', 'behind'].map(state => {
      const subset = rows.filter(r => situation(r) === state), top = itemStats(subset).slice(0, 4);
      return `<article><span>${situationName(state)} · ${subset.length}局</span>${top.map(s => { const it = items[s.id] || { name: s.id, icon: '' }; return `<div class="pb-ranked-item">${icon(it.icon, it.name)}<b>${esc(it.name)}</b><small>${pct(s.games, subset.length)} · ${timeText(s.median)}</small></div>`; }).join('') || '<small>没有15分钟快照</small>'}</article>`;
    }).join('');
  }

  function renderPerformance(rows) {
    const summary = document.getElementById('pb-performance-summary');
    const economyHost = document.getElementById('pb-economy-curve');
    const damageHost = document.getElementById('pb-damage-curve');
    const levelHost = document.getElementById('pb-level-performance');
    const status = document.getElementById('pb-performance-status');
    if (!summary || !economyHost || !damageHost || !levelHost) return;
    if (!detailRowsReady(rows)) {
      summary.innerHTML = '<div class="pb-no-data">正在按月份加载10/20分钟快照、BP与伤害明细…</div>';
      economyHost.innerHTML = damageHost.innerHTML = levelHost.innerHTML = '';
      ensureDetailRows(rows).then(() => { if (activeTab === 'situations') { renderPerformance(currentRows); renderMatchups(currentRows); } }).catch(err => {
        summary.innerHTML = `<div class="pb-no-data">表现明细加载失败：${esc(err.message)}</div>`;
      });
      return;
    }
    const wins = sample => sample.reduce((sum, row) => sum + Number(row.w || 0), 0);
    const snapshotValues = (seconds, index) => rows.map(row => Number(snapshotAt(row, seconds)?.[index])).filter(Number.isFinite);
    const nw10 = snapshotValues(600, 2), nw15 = snapshotValues(900, 2), nw20 = snapshotValues(1200, 2);
    const cs10 = snapshotValues(600, 3), cs20 = snapshotValues(1200, 3);
    const denies10 = snapshotValues(600, 10);
    const rateRows = rows.map(metricRates);
    const gpms = rateRows.map(row => row.gpm).filter(Number.isFinite), xpms = rateRows.map(row => row.xpm).filter(Number.isFinite);
    const tfps = rateRows.map(row => row.tfp).filter(Number.isFinite);
    const card = (label, value, note) => `<article><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
    summary.innerHTML = card('平均经济 @10 / 15 / 20', `${mean(nw10)?.toLocaleString() || '—'} / ${mean(nw15)?.toLocaleString() || '—'} / ${mean(nw20)?.toLocaleString() || '—'}`, `${nw20.length}/${rows.length}局有20分钟快照`)
      + card('平均补刀 @10 / 20', `${mean(cs10)?.toLocaleString() || '—'} / ${mean(cs20)?.toLocaleString() || '—'}`, `10分钟平均反补 ${mean(denies10)?.toLocaleString() || '—'}`)
      + card('平均 GPM / XPM', `${mean(gpms)?.toLocaleString() || '—'} / ${mean(xpms)?.toLocaleString() || '—'}`, gpms.length ? `${gpms.length}局有累计金钱与经验` : '旧缓存暂未保存累计金钱与经验')
      + card('平均参战率', tfps.length ? pct(tfps.reduce((sum, value) => sum + value, 0) / tfps.length, 1) : '—', tfps.length ? `${tfps.length}局有终局指标` : '等待新采集字段')
      + [['won', '赢线'], ['drawn', '平线'], ['lost', '输线']].map(([key, label]) => {
        const sample = rows.filter(row => laneResult(row) === key);
        return card(label, pct(wins(sample), sample.length), `${sample.length}局 · 以10分钟同位置经济差±500划分`);
      }).join('')
      + [[2, '天辉'], [3, '夜魇']].map(([team, label]) => {
        const sample = rows.filter(row => Number(row.tm) === team);
        return card(label, pct(wins(sample), sample.length), `${sample.length}局`);
      }).join('')
      + [['early', '前段选出'], ['middle', '中段选出'], ['last', '后段 / 最后手']].map(([phase, label]) => {
        const sample = rows.filter(row => draftPickPhase(row) === phase);
        return card(label, pct(wins(sample), sample.length), `${sample.length}局有BP顺序`);
      }).join('');

    const economyPoints = [300, 600, 900, 1200, 1500, 1800, 2400, 3000].map(seconds => ({
      seconds, values: snapshotValues(seconds, 2), cs: snapshotValues(seconds, 3),
    })).filter(point => point.values.length);
    const maxEconomy = Math.max(1, ...economyPoints.map(point => mean(point.values) || 0));
    economyHost.innerHTML = `<header><div><span>ECONOMY CURVE</span><h3>经济与补刀成长</h3></div><small>控制时点均值</small></header><div class="pb-curve-bars">${economyPoints.map(point => `<span title="${timeText(point.seconds)} · ${mean(point.values)?.toLocaleString()}经济 · ${mean(point.cs)?.toLocaleString()}补刀"><i style="height:${Math.max(4, (mean(point.values) || 0) / maxEconomy * 100)}%"></i><b>${timeText(point.seconds)}</b><small>${mean(point.values)?.toLocaleString()}</small></span>`).join('')}</div>`;

    const damageBuckets = new Map();
    rows.forEach(row => (detailFor(row)?.dm || []).forEach(entry => {
      const bucket = Number(entry[0]), stat = damageBuckets.get(bucket) || { damage: 0, tower: 0, games: new Set() };
      stat.damage += Number(entry[1] || 0); stat.tower += Number(entry[2] || 0); stat.games.add(rowKey(row)); damageBuckets.set(bucket, stat);
    }));
    const damagePoints = [...damageBuckets].sort((a, b) => a[0] - b[0]).map(([seconds, stat]) => ({ seconds, damage: Math.round(stat.damage / Math.max(1, stat.games.size)), tower: Math.round(stat.tower / Math.max(1, stat.games.size)) }));
    const maxDamage = Math.max(1, ...damagePoints.map(point => point.damage));
    damageHost.innerHTML = `<header><div><span>DAMAGE OVER TIME</span><h3>每5分钟英雄伤害</h3></div><small>每局分桶均值</small></header>${damagePoints.length ? `<div class="pb-curve-bars is-damage">${damagePoints.map(point => `<span title="${timeText(point.seconds)}–${timeText(point.seconds + 299)} · 英雄伤害 ${point.damage.toLocaleString()} · 建筑 ${point.tower.toLocaleString()}"><i style="height:${Math.max(4, point.damage / maxDamage * 100)}%"></i><b>${timeText(point.seconds)}</b><small>${point.damage.toLocaleString()}</small></span>`).join('')}</div>` : '<div class="pb-no-data">旧缓存没有分时伤害；下次有界增量会写入每5分钟英雄与建筑伤害。</div>'}`;

    const levels = new Map();
    rows.forEach(row => { const level = Number(row.lv); if (!Number.isFinite(level)) return; const stat = levels.get(level) || { games: 0, wins: 0 }; stat.games++; stat.wins += Number(row.w || 0); levels.set(level, stat); });
    levelHost.innerHTML = `<table class="pb-table"><thead><tr><th>终局等级</th><th>比赛</th><th>胜率</th><th>分布</th></tr></thead><tbody>${[...levels].sort((a, b) => a[0] - b[0]).map(([level, stat]) => `<tr><td><strong>Lv ${level}</strong></td><td>${stat.games}</td><td>${pct(stat.wins, stat.games)}</td><td><span class="pb-inline-meter"><i style="width:${pct(stat.games, rows.length)}"></i></span></td></tr>`).join('')}</tbody></table>`;
    if (status) status.textContent = `快照覆盖 ${nw10.length}/${rows.length}局 · BP ${rows.filter(row => draftPickPhase(row) !== 'unknown').length}局 · 伤害 ${damagePoints.length ? '已加载' : '等待新缓存'}`;
  }

  function renderMatchups(rows) {
    const groups = new Map(), wantAllies = matchupKind === 'ally';
    const overall = rows.length ? rows.reduce((sum, row) => sum + Number(row.w || 0), 0) / rows.length : 0;
    rows.forEach(row => {
      const related = (matchRowsById.get(String(row.m)) || []).filter(other => rowKey(other) !== rowKey(row) && (Number(other.tm) === Number(row.tm)) === wantAllies);
      const seen = new Set();
      related.forEach(other => {
        if (matchupRole && String(other.r || '') !== matchupRole) return;
        if (seen.has(other.h)) return; seen.add(other.h);
        const g = groups.get(other.h) || { games: 0, wins: 0, items: new Map(), laneDeltas: [], routes: new Map(), roles: new Map() };
        g.games++; g.wins += Number(row.w || 0); g.roles.set(other.r || 0, (g.roles.get(other.r || 0) || 0) + 1);
        (row.i || []).forEach(([id]) => { if (includeItem(id)) g.items.set(id, (g.items.get(id) || 0) + 1); });
        if (!wantAllies && Number(other.r) === Number(row.r)) {
          const delta = laneDeltaAt(row, 600); if (Number.isFinite(delta)) g.laneDeltas.push(delta);
        }
        const route = coreRoutePairs(row, 4).map(pair => pair[0]);
        if (route.length >= 2) { const key = route.join('>'); g.routes.set(key, (g.routes.get(key) || 0) + 1); }
        groups.set(other.h, g);
      });
    });
    const commonFloor = matchupMetaOnly ? Math.max(matchupMin, Math.ceil(rows.length * .015)) : matchupMin;
    const query = matchupSearch.trim().toLowerCase();
    const list = [...groups].map(([hero, stat]) => ({ hero, ...stat, laneDelta: mean(stat.laneDeltas), lift: stat.games ? stat.wins / stat.games - overall : 0 }))
      .filter(stat => stat.games >= commonFloor && (!query || String(heroes[stat.hero]?.name || stat.hero).toLowerCase().includes(query)))
      .sort((a, b) => b.games - a.games || b.lift - a.lift);

    const plot = document.getElementById('pb-matchup-plot');
    if (plot) {
      const points = list.filter(stat => wantAllies || Number.isFinite(stat.laneDelta)).slice(0, 40);
      const xValues = points.map(stat => wantAllies ? stat.games / Math.max(1, rows.length) : stat.laneDelta);
      const xAbs = Math.max(1, ...xValues.map(Math.abs)), yAbs = Math.max(.05, ...points.map(stat => Math.abs(stat.lift)));
      const px = stat => wantAllies ? 60 + (stat.games / Math.max(1, rows.length)) / Math.max(.01, xAbs) * 650 : 380 + stat.laneDelta / xAbs * 315;
      const py = stat => 145 - stat.lift / yAbs * 110;
      plot.innerHTML = points.length ? `<svg viewBox="0 0 760 300" role="img" aria-label="${wantAllies ? '协同采用率与胜率差' : '10分钟对位经济差与最终胜率差'}"><line x1="60" y1="145" x2="710" y2="145"/><line x1="${wantAllies ? 60 : 380}" y1="25" x2="${wantAllies ? 60 : 380}" y2="260"/><text x="60" y="286">${wantAllies ? '同队出现率 →' : '← 对线劣势　10分钟经济差　对线优势 →'}</text><text x="8" y="22">胜率差</text>${points.map(stat => { const hero = heroes[stat.hero] || { name: stat.hero }; const x = px(stat), y = py(stat); return `<g class="${stat.lift >= 0 ? 'is-positive' : 'is-negative'}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.max(4, Math.min(11, Math.sqrt(stat.games)))}"><title>${esc(hero.name)} · ${stat.games}局 · 胜率差 ${stat.lift >= 0 ? '+' : ''}${pct(stat.lift, 1)}${!wantAllies ? ` · 对位经济 ${stat.laneDelta >= 0 ? '+' : ''}${stat.laneDelta}` : ''}</title></circle><text x="${(x + 7).toFixed(1)}" y="${(y - 7).toFixed(1)}">${esc(hero.name)}</text></g>`; }).join('')}</svg>` : '<div class="pb-no-data">当前筛选下没有达到样本门槛的可绘制英雄</div>';
    }
    const host = document.getElementById('pb-matchups');
    host.innerHTML = `<table class="pb-table"><thead><tr><th>${wantAllies ? '协同英雄' : '对手英雄'}</th><th>样本</th><th>胜率</th><th>相对总体</th><th>${wantAllies ? '常见位置' : '10m同位置经济差'}</th><th>代表物品</th><th>常见路线</th></tr></thead><tbody>${list.slice(0, 40).map(g => {
      const itemId = [...g.items].sort((a, b) => b[1] - a[1])[0]?.[0], it = items[itemId], h = heroes[g.hero] || { name: g.hero, icon: '' };
      const routeKey = [...g.routes].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      const routeHtml = routeKey ? routeKey.split('>').map(id => { const item = items[id] || { name: id, icon: '' }; return icon(item.icon, item.name); }).join('<span class="pb-seq-arrow">›</span>') : '—';
      const commonRole = [...g.roles].sort((a, b) => b[1] - a[1])[0]?.[0];
      return `<tr><td><span class="pb-item-name">${icon(h.icon, h.name)}${esc(h.name)}</span></td><td>${g.games}</td><td>${pct(g.wins, g.games)}</td><td class="${g.lift >= 0 ? 'pb-up' : 'pb-down'}">${g.lift >= 0 ? '+' : ''}${pct(g.lift, 1)}</td><td class="${Number(g.laneDelta) >= 0 ? 'pb-up' : 'pb-down'}">${wantAllies ? (commonRole ? `${commonRole}号位` : '—') : Number.isFinite(g.laneDelta) ? `${g.laneDelta >= 0 ? '+' : ''}${g.laneDelta.toLocaleString()} (${g.laneDeltas.length}局)` : '—'}</td><td>${it ? `<span class="pb-item-name">${icon(it.icon, it.name)}${esc(it.name)}</span>` : '—'}</td><td><span class="pb-mini-route">${routeHtml}</span></td></tr>`;
    }).join('') || '<tr><td colspan="7" class="pb-no-data">没有符合搜索、位置与样本门槛的英雄</td></tr>'}</tbody></table>`;
  }

  function renderLineupDecisions(rows) {
    const host = document.getElementById('pb-lineup-decisions');
    if (!host) return;
    if (!controls.hero.value) {
      host.innerHTML = '<div class="pb-empty">先选择一个英雄；分路决策必须围绕同一英雄的职业样本。</div>';
      return;
    }
    const laneGroups = new Map(), allyGroups = new Map(), opponentGroups = new Map();
    rows.forEach(row => {
      const laneOpponent = sameRoleOpponent(row);
      if (laneOpponent) {
        const stat = laneGroups.get(laneOpponent.h) || { hero: laneOpponent.h, games: 0, wins: 0, deltas: [] };
        stat.games++; stat.wins += Number(row.w || 0);
        if (Number.isFinite(Number(row.g?.[1])) && Number.isFinite(Number(laneOpponent.g?.[1]))) stat.deltas.push(Number(row.g[1]) - Number(laneOpponent.g[1]));
        laneGroups.set(laneOpponent.h, stat);
      }
      (matchRowsById.get(String(row.m)) || []).forEach(other => {
        if (rowKey(other) === rowKey(row)) return;
        const target = Number(other.tm) === Number(row.tm) ? allyGroups : opponentGroups;
        const stat = target.get(other.h) || { hero: other.h, games: 0, wins: 0 };
        stat.games++; stat.wins += Number(row.w || 0); target.set(other.h, stat);
      });
    });
    const overall = rows.length ? rows.reduce((sum, row) => sum + Number(row.w || 0), 0) / rows.length : 0;
    const lanes = [...laneGroups.values()].map(stat => ({ ...stat, delta: mean(stat.deltas) }))
      .filter(stat => stat.games >= 1 && Number.isFinite(stat.delta));
    const laneList = (list, empty) => list.slice(0, 4).map(stat => {
      const hero = heroes[stat.hero] || { name: stat.hero, icon: '' };
      return `<article>${icon(hero.icon, hero.name)}<span><b>${esc(hero.name)}</b><small>${stat.games}局 · ${pct(stat.wins, stat.games)} 样本胜率</small></span><strong class="${stat.delta >= 0 ? 'pb-up' : 'pb-down'}">${stat.delta >= 0 ? '+' : ''}${stat.delta.toLocaleString()}<small>15m同位置经济差</small></strong></article>`;
    }).join('') || `<div class="pb-no-data">${empty}</div>`;
    const allyList = [...allyGroups.values()].filter(stat => stat.games >= 2).map(stat => ({ ...stat, lift: stat.wins / stat.games - overall })).sort((a, b) => b.lift - a.lift || b.games - a.games).slice(0, 5);
    const opponentList = [...opponentGroups.values()].filter(stat => stat.games >= 2).sort((a, b) => a.wins / a.games - b.wins / b.games || b.games - a.games).slice(0, 5);
    const heroRows = (list, metric) => list.map(stat => {
      const hero = heroes[stat.hero] || { name: stat.hero, icon: '' };
      const value = metric === 'lift' ? `${stat.lift >= 0 ? '+' : ''}${pct(stat.lift, 1)} 胜率差` : `${pct(stat.wins, stat.games)} 样本胜率`;
      return `<article>${icon(hero.icon, hero.name)}<span><b>${esc(hero.name)}</b><small>${stat.games}局</small></span><strong class="${metric === 'lift' ? (stat.lift >= 0 ? 'pb-up' : 'pb-down') : (stat.wins / stat.games >= overall ? 'pb-up' : 'pb-down')}">${value}</strong></article>`;
    }).join('') || '<div class="pb-no-data">样本不足</div>';
    const roleText = controls.role.value ? `${controls.role.value}号位` : '各自判定职责位置';
    host.innerHTML = `<div class="pb-lineup-note"><strong>${esc(heroes[controls.hero.value]?.name || controls.hero.value)} · ${roleText}</strong><span>同位置经济差比较双方该局判定为相同1–5号位的选手；缺少快照或未判位的比赛不进入该指标。</span></div>
      <section><header><span>较难同位置对手</span><small>平均经济差最低</small></header>${laneList(lanes.slice().sort((a, b) => a.delta - b.delta), '没有同位置经济快照')}</section>
      <section><header><span>较优同位置对手</span><small>平均经济差最高</small></header>${laneList(lanes.slice().sort((a, b) => b.delta - a.delta), '没有同位置经济快照')}</section>
      <section><header><span>常见有利队友</span><small>相对当前样本总体胜率</small></header>${heroRows(allyList, 'lift')}</section>
      <section><header><span>重点准备的敌方英雄</span><small>交手样本胜率较低</small></header>${heroRows(opponentList, 'winrate')}</section>
      <footer>所有结果都是当前筛选样本的描述性比较；阵容、选手水平、版本和比赛阶段仍会共同影响结果。</footer>`;
  }

  function renderSkills(rows) {
    const host = document.getElementById('pb-skills');
    if (!detailRowsReady(rows)) {
      host.innerHTML = '<div class="pb-no-data">正在按当前日期范围加载技能明细…</div>';
      ensureDetailRows(rows).then(() => { if (activeTab === 'situations') renderSkills(currentRows); }).catch(err => { host.innerHTML = `<div class="pb-no-data">技能明细加载失败：${esc(err.message)}</div>`; });
      return;
    }
    const seqs = new Map();
    rows.forEach(r => {
      const abilityRows = detailData.players?.[rowKey(r)]?.a || [];
      const kit = new Set(heroAbilities[r.h] || []);
      const seq = abilityRows.filter(a => !String(a[1]).startsWith('special_bonus_') && (!kit.size || kit.has(a[1]))).slice(0, 8).map(a => a[1]);
      if (!seq.length) return; const key = seq.join('>'); const st = seqs.get(key) || { games: 0, wins: 0 }; st.games++; st.wins += Number(r.w || 0); seqs.set(key, st);
    });
    host.innerHTML = [...seqs].sort((a, b) => b[1].games - a[1].games).slice(0, 6).map(([key, st], idx) => `<article><span>技能路线 #${idx + 1}</span><div class="pb-ability-route is-compact">${key.split('>').map((slug, index) => abilityStep(slug, index, true)).join('')}</div><small>${st.games}局 · 胜率 ${pct(st.wins, st.games)} · 与当前装备筛选联动</small></article>`).join('') || '<div class="pb-no-data">当前样本没有技能加点事件</div>';
  }

  function renderPatchMeta(rows) {
    const host = document.getElementById('pb-patch-meta'); if (!host) return;
    if (!controls.hero.value) { host.innerHTML = '<div class="pb-empty">先选择英雄，再把补丁改动与职业路线响应放在一起。</div>'; return; }
    if (!dynamicsData) {
      host.innerHTML = '<div class="pb-no-data">正在加载英雄补丁历史…</div>';
      loadDynamics().then(() => { if (activeTab === 'situations') renderPatchMeta(currentRows); }).catch(err => { host.innerHTML = `<div class="pb-no-data">补丁历史加载失败：${esc(err.message)}</div>`; });
      return;
    }
    const hero = heroes[controls.hero.value] || { name: controls.hero.value };
    const entityEntry = Object.entries(dynamicsData.entities || {}).find(([key, entity]) => entity.kind === 'hero' && (entity.icon === controls.hero.value || entity.name === hero.name || key === `hero|${String(controls.hero.value).replaceAll('_', '-')}`));
    const entity = entityEntry?.[1], patchByVersion = new Map((dynamicsData.patches || []).map(patch => [patch.version, patch]));
    const badgeLabel = { buff: '增强', nerf: '削弱', rework: '重做', new: '新增', del: '移除', misc: '杂项', qol: '体验' };
    const patchRows = [...new Set(rows.map(row => row.p))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    const routeForPatch = version => {
      const map = new Map();
      rows.filter(row => row.p === version).forEach(row => { const ids = coreRoutePairs(row, 4).map(pair => pair[0]); if (ids.length < 2) return; const key = ids.join('>'), stat = map.get(key) || { ids, games: 0, wins: 0 }; stat.games++; stat.wins += Number(row.w || 0); map.set(key, stat); });
      return [...map.values()].sort((a, b) => b.games - a.games || b.wins - a.wins)[0] || null;
    };
    const versions = [...new Set([...(entity ? Object.keys(entity.patches || {}) : []), ...patchRows])].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).slice(0, 10);
    host.innerHTML = versions.map(version => {
      const changes = entity?.patches?.[version] || {}, patch = patchByVersion.get(version), route = routeForPatch(version), sample = rows.filter(row => row.p === version), wins = sample.reduce((sum, row) => sum + Number(row.w || 0), 0);
      const badges = Object.entries(changes).map(([kind, count]) => `<b class="is-${kind}">${badgeLabel[kind] || kind} ×${count}</b>`).join('') || '<i>本地补丁页未记录该英雄改动</i>';
      const routeHtml = route ? route.ids.map(id => { const item = items[id] || { name: id, icon: '' }; return icon(item.icon, item.name); }).join('<span>›</span>') : '—';
      const content = `<article><div><span>版本 ${esc(version)}</span><small>${esc(patch?.date || '日期未知')}</small></div><div class="pb-patch-badges">${badges}</div><div><span>职业样本</span><strong>${sample.length}局 · ${pct(wins, sample.length)}</strong></div><div><span>该版本主路线</span><span class="pb-mini-route">${routeHtml}</span>${route ? `<small>${route.games}局</small>` : ''}</div></article>`;
      return patch?.filename ? `<a href="patches/${esc(patch.filename)}#${esc(String(entityEntry?.[0] || '').split('|')[1] || '')}" title="打开 ${esc(version)} 补丁中的英雄改动">${content}</a>` : content;
    }).join('') || '<div class="pb-no-data">当前英雄没有可关联的补丁与路线样本</div>';
  }

  function renderOffMeta(rows) {
    const host = document.getElementById('pb-off-meta'); if (!host) return;
    const reconstructable = rows.filter(row => coreRoutePairs(row, 5).length >= 2);
    const clusters = clusteredRoutes(rows).filter(cluster => cluster.games >= 2 && cluster.games / Math.max(1, reconstructable.length) < .12);
    const latestDate = rows.reduce((latest, row) => row.d > latest ? row.d : latest, '');
    const recentFrom = latestDate ? new Date(new Date(`${latestDate}T00:00:00Z`).getTime() - 29 * 86400000).toISOString().slice(0, 10) : '';
    const candidates = clusters.map(cluster => {
      const recent = cluster.rows.filter(row => !recentFrom || row.d >= recentFrom).length;
      return { ...cluster, recent, emerging: cluster.games ? recent / cluster.games : 0 };
    }).sort((a, b) => b.emerging - a.emerging || b.wins / b.games - a.wins / a.games || b.games - a.games).slice(0, 6);
    host.innerHTML = candidates.map((cluster, index) => `<article><span>${index === 0 && cluster.emerging >= .5 ? '近期出现' : '低采用路线'} · ${cluster.games}局</span><div class="pb-mini-route">${cluster.representative.map(id => { const item = items[id] || { name: id, icon: '' }; return icon(item.icon, item.name); }).join('<span>›</span>')}</div><strong>${pct(cluster.wins, cluster.games)} 样本胜率</strong><small>可还原样本采用 ${pct(cluster.games, reconstructable.length)} · 最近30天占该路线 ${pct(cluster.recent, cluster.games)} · ${cluster.variants.size}种变体</small><button type="button" data-pb-offmeta-cluster="${esc(cluster.stableId)}">查看真实比赛组成</button></article>`).join('') || '<div class="pb-no-data">当前范围没有至少2局的低采用完整路线；扩大日期后再观察。</div>';
  }

  function renderSubstitutions(rows, selectedStat) {
    const host = document.getElementById('pb-substitutions');
    if (!selectedStat) { host.innerHTML = '<div class="pb-no-data">先点击一个物品</div>'; return; }
    const selectedRows = new Set(rows.filter(r => (r.i || []).some(([id]) => id === selectedStat.id)).map(r => `${r.m}:${r.s}`));
    const target = items[selectedStat.id] || {}, alternatives = new Map();
    rows.forEach(r => {
      if (selectedRows.has(`${r.m}:${r.s}`)) return;
      (r.i || []).forEach(([id, seconds]) => {
        const it = items[id]; if (!includeItem(id) || !it || id === selectedStat.id) return;
        const costRatio = Number(it.cost || 0) / Math.max(1, Number(target.cost || 1));
        if (it.category !== target.category && (costRatio < .55 || costRatio > 1.65)) return;
        const st = alternatives.get(id) || { games: 0, wins: 0, times: [] }; st.games++; st.wins += Number(r.w || 0); if (Number.isFinite(seconds)) st.times.push(seconds); alternatives.set(id, st);
      });
    });
    const times = selectedStat.times.slice().sort((a, b) => a - b), med = selectedStat.median;
    const faster = times.filter(t => t <= med).length, timingScore = times.length ? Math.round(faster * 100 / times.length) : 0;
    host.innerHTML = `<article><span>${esc(target.name || selectedStat.id)} 时机评分</span><strong>${timingScore} / 100</strong><small>中位 ${timeText(med)}；分数表示该时点在样本中的完成百分位</small></article>${[...alternatives].sort((a, b) => b[1].games - a[1].games).slice(0, 5).map(([id, st]) => { const it = items[id] || { name: id, icon: '' }; return `<article><span>替代候选</span><strong>${icon(it.icon, it.name)} ${esc(it.name)}</strong><small>${st.games}局 · 胜率 ${pct(st.wins, st.games)} · 中位 ${timeText(median(st.times))}</small></article>`; }).join('')}`;
  }

  function renderConfidence(rows, selectedStat) {
    const assigned = rows.filter(r => r.r).length, lane = rows.filter(r => r.rm === 'lanes').length, openDotaLane = rows.filter(r => r.rm === 'lanes_opendota').length, fallback = rows.filter(r => r.rm === 'hits').length;
    const avgConfidence = rows.filter(r => Number.isFinite(Number(r.rc))).reduce((s, r) => s + Number(r.rc), 0) / Math.max(1, rows.filter(r => Number.isFinite(Number(r.rc))).length);
    const ci = selectedStat?.ci || [0, 0], warning = !selectedStat ? '未选择物品' : selectedStat.games < 10 ? '极小样本，仅供探索' : selectedStat.games < 30 ? '样本偏小，区间较宽' : '样本量可用于描述性比较';
    document.getElementById('pb-confidence').innerHTML = `<article><span>职责位置覆盖</span><strong>${pct(assigned, rows.length)}</strong><small>DWD主分路 ${lane}局 · OpenDota补分路 ${openDotaLane}局 · 纯补刀最终兜底 ${fallback}局</small></article><article><span>平均判位可信度</span><strong>${pct(avgConfidence, 1)}</strong><small>整届联赛分路众数 + 同路补刀；优先DWD 5分钟，缺失才用10分钟</small></article><article><span>所选物品胜率区间</span><strong>${pct(ci[0], 1)} – ${pct(ci[1], 1)}</strong><small>Wilson 95% · ${esc(warning)}</small></article><article><span>校正说明</span><strong>职责 × 局势 × 时长</strong><small>情境校正不是因果推断，不消除英雄克制与阵容选择偏差</small></article>`;
  }

  function renderDataQuality() {
    const summary = document.getElementById('pb-quality-summary'), table = document.getElementById('pb-quality-table'), source = document.getElementById('pb-quality-source');
    if (!summary || !table || !source) return;
    const games = Number(dataMeta.player_games || allRows.length), matches = Number(dataMeta.matches || 0), advanced = dataMeta.advanced || {}, positions = dataMeta.positions || {};
    const card = (label, numerator, denominator, note) => {
      const rate = denominator ? numerator / denominator : 0, state = rate >= .98 ? 'good' : rate >= .9 ? 'warn' : 'bad';
      return `<article class="pb-quality-${state}"><span>${esc(label)}</span><strong>${pct(numerator, denominator)}</strong><small>${Number(numerator).toLocaleString()} / ${Number(denominator).toLocaleString()} · ${esc(note)}</small></article>`;
    };
    summary.innerHTML = card('职责位置', Number(positions.assigned_player_games || 0), games, '整届联赛分路 + 补刀；OpenDota缺失兜底')
      + card('15分钟快照', Number(advanced.snapshot_player_games || 0), games, '经济、等级、KDA与坐标')
      + card('技能加点', Number(advanced.ability_player_games || 0), games, `StarRocks优先 · OpenDota兜底 ${Number(advanced.opendota_ability_player_games || 0)}局`)
      + card('购买时点', Number(advanced.timed_item_player_games || 0), games, 'dota2_analysis 购买日志；精确比赛ID有界读取')
      + card('首用日志覆盖', Number(advanced.item_use_source_player_games || 0), games, 'ODS主动使用或明确触发')
      + card('已识别首用', Number(advanced.item_use_player_games || 0), games, '至少一件装备可计算；纯被动不强制命中')
      + card('单局选手明细', Number(advanced.detail_player_games || 0), games, '按月份延迟加载')
      + card('控制时点背包', Number(advanced.inventory_snapshot_player_games || 0), games, '出生 / 20 / 35 / 55分钟')
      + card('BP覆盖', Number(advanced.draft_matches || 0), matches, 'match_picks_bans')
      + card('事件时间线', Number(advanced.event_matches || 0), matches, '英雄死亡、买活与建筑')
      + `<article class="${Number(advanced.damage_bucket_player_rows || 0) ? 'pb-quality-good' : 'pb-quality-warn'}"><span>分时伤害桶</span><strong>${Number(advanced.damage_bucket_player_rows || 0).toLocaleString()}</strong><small>5分钟英雄 / 建筑伤害聚合行</small></article>`
      + `<article class="${Number(dataMeta.unresolved_inventory_names || 0) ? 'pb-quality-warn' : 'pb-quality-good'}"><span>未识别库存名</span><strong>${Number(dataMeta.unresolved_inventory_names || 0).toLocaleString()}</strong><small>需要补充物品映射；不等于选手未购买</small></article>`;
    const months = new Map();
    allRows.forEach(r => {
      const month = String(r.d || '').slice(0, 7), m = months.get(month) || { games: 0, roles: 0, snapshots: 0, matches: new Set() };
      m.games++; if (r.r) m.roles++; if (r.g) m.snapshots++; m.matches.add(r.m); months.set(month, m);
    });
    table.innerHTML = `<table class="pb-table"><thead><tr><th>月份</th><th>比赛</th><th>选手局</th><th>位置覆盖</th><th>快照覆盖</th><th>明细分片</th><th>BP</th><th>事件</th></tr></thead><tbody>${[...months].sort((a, b) => b[0].localeCompare(a[0])).map(([month, m]) => {
      const shard = detailManifest?.buckets?.[month];
      return `<tr><td><strong>${month}</strong></td><td>${m.matches.size}</td><td>${m.games}</td><td>${pct(m.roles, m.games)}</td><td>${pct(m.snapshots, m.games)}</td><td>${shard ? `${(Number(shard.bytes || 0) / 1048576).toFixed(1)}MB` : '索引加载中'}</td><td>${shard ? `${shard.draft_matches}/${shard.matches}` : '—'}</td><td>${shard ? `${shard.event_matches}/${shard.matches}` : '—'}</td></tr>`;
    }).join('')}</tbody></table>`;
    const scope = dataMeta.query_scope || {}, sourceStats = positions.source_stats || {}, dwdPosition = sourceStats.dwd || {}, positionFallback = sourceStats.fallback || {}, openDotaPosition = sourceStats.opendota || {}, update = dataMeta.update_status || dataMeta.update || {};
    const odsPurchases = Number(advanced.combatlog_purchase_matches_latest_increment ?? advanced.combatlog_purchase_matches ?? advanced.combatlog_purchase_fallback_matches_latest_increment ?? advanced.combatlog_purchase_fallback_matches ?? 0), openDotaPurchases = Number(advanced.opendota_purchase_player_games_latest_increment ?? advanced.opendota_purchase_player_games ?? 0), backfill = advanced.bounded_route_backfill || {}, useBackfill = advanced.item_use_backfill || {};
    const backfillHtml = backfill.completed_at ? `<div><span>限定路线回填</span><strong>${esc(backfill.hero || '—')} ${Number(backfill.complete_player_games ?? backfill.complete_matches ?? 0)}/${Number(backfill.player_games || 0)}个选手局 · ODS ${Number(backfill.ods_player_games ?? backfill.ods_matches ?? 0)} · OpenDota ${Number(backfill.opendota_player_games ?? backfill.opendota_matches ?? 0)}</strong></div>` : '';
    const useBackfillHtml = useBackfill.completed_at ? `<div><span>首次使用回填</span><strong>ODS ${Number(useBackfill.source_matches || 0)}/${Number(useBackfill.selected_matches || 0)}场 · ${Number(useBackfill.item_use_records || 0).toLocaleString()}条</strong></div>` : '';
    source.innerHTML = `<div><span>缓存生成</span><strong>${esc(dataMeta.generated_at || '未知')}</strong></div><div><span>最近更新</span><strong>${esc(update.status || 'baseline')} · ${esc(update.completed_at || update.failed_at || '未知')}</strong></div><div><span>查询范围</span><strong>${esc(scope.date_from || '?')} — ${esc(scope.date_to || '?')}</strong></div><div><span>分区策略</span><strong>${esc(scope.partition_filter || '未知')}</strong></div><div><span>去重策略</span><strong>${esc(scope.dedup || '未知')}</strong></div><div><span>增量结果</span><strong>新增 ${Number(update.new_matches || 0)} · 刷新 ${Number(update.refreshed_matches || 0)}</strong></div><div><span>DWD判位主源</span><strong>${Number(dwdPosition.player_rows || 0)}条逐场选手 · 5分钟补刀 ${Number(dwdPosition.hits_5m_rows || 0)}条</strong></div><div><span>10分钟补刀兜底</span><strong>${Number(positionFallback.ten_minute_hits_recovered || 0)}条</strong></div><div><span>OpenDota补分路</span><strong>${Number(openDotaPosition.matched_matches || 0)}场 · 恢复212阵型 ${Number(openDotaPosition.recovered_212_teams || 0)}队</strong></div><div><span>OpenDota补技能</span><strong>${Number(advanced.opendota_ability_player_games || 0)}个选手局</strong></div><div><span>本次购买时点</span><strong>ODS ${odsPurchases}场 · OpenDota兜底 ${openDotaPurchases}个选手局</strong></div>${backfillHtml}${useBackfillHtml}<p><b>来源披露：</b>比赛、选手和局内明细以 <code>dota2_analysis</code> 为权威执行来源；职责判位按本次明确授权使用派生表 <code>dwd_dota2.dwd_match_player_positions</code> 的逐场 <code>lane_role</code> 与5分钟 <code>hits_5m</code>。DWD可能存在滞后或误差；只有缺少选手或补刀时才读取有限比赛ID下的 <code>players</code>/<code>player_intervals2</code> 十分钟补刀，只有DWD分路不能组成严格2-1-2且OpenDota能够恢复2-1-2时才采用精确比赛的 <code>lane_role</code>。所有Dota表均显式选择最小字段，取回后按各自语义键独立去重，再连接与汇总；<code>slot</code> 只作局内连接键，从不参与1–5号位判定。技能加点以 <code>hero_ability_level</code> 为主，选手局完全缺失时读取 OpenDota <code>ability_upgrades_arr</code>，保留真实顺序但不伪造升级秒数。购买时点以 <code>combat_logs.DOTA_COMBATLOG_PURCHASE</code> 为主，单个选手局不足两件时才用同一 <code>match_id</code> 的 OpenDota <code>purchase_log</code> 兜底，重叠物品仍保留 ODS 时点。首次使用只来自 <code>combat_logs.DOTA_COMBATLOG_ITEM</code>；OpenDota 没有使用时点时不伪造首用间隔。出生装取0–90秒内最早可观察库存，20/35/55分钟背包取目标前120秒内最后快照，终局背包在解析时长附近的有界窗口内选择。伤害事件先去重，再在应用层按5分钟聚合并排除幻象。</p>`;
    if (!/post-fetch|应用层/.test(String(scope.dedup || ''))) source.insertAdjacentHTML('afterbegin', `<p class="pb-data-warning"><b>缓存迁移提示：</b>当前完整历史缓存仍包含旧查询规范生成的区间；新抓取器和后续增量已切换到应用层语义去重。完成全历史重建前，请以这里显示的“去重策略”判断当前筛选区间的契约版本。</p>`);
    source.innerHTML += `<p><b>统计边界：</b>职业表现指数是同英雄同位置的样本内百分位；阵容先验是经15局收缩的描述性估计，两者都不是因果或机器学习胜率。</p>`;
  }

  function renderTeams(rows) {
    const groups = new Map();
    rows.forEach(r => { const g = groups.get(r.t) || { games: 0, wins: 0, times: [], routes: new Set(), items: new Map() }; g.games++; g.wins += Number(r.w || 0); const seq = (r.i || []).filter(x => includeItem(x[0])).sort((a, b) => (a[1] || 1e9) - (b[1] || 1e9)); if (seq.length) { g.routes.add(seq.slice(0, 4).map(x => x[0]).join('>')); seq.forEach(([id, t]) => { g.items.set(id, (g.items.get(id) || 0) + 1); if (Number.isFinite(t)) g.times.push(t); }); } groups.set(r.t, g); });
    document.getElementById('pb-teams').innerHTML = `<table class="pb-table"><thead><tr><th>战队</th><th>局数</th><th>胜率</th><th>首件中位</th><th>路线变体</th><th>代表物品</th></tr></thead><tbody>${[...groups].sort((a, b) => b[1].games - a[1].games).slice(0, 25).map(([name, g]) => { const id = [...g.items].sort((a, b) => b[1] - a[1])[0]?.[0], it = items[id]; return `<tr><td><strong>${esc(name)}</strong></td><td>${g.games}</td><td>${pct(g.wins, g.games)}</td><td>${timeText(median(g.times))}</td><td>${g.routes.size}</td><td>${it ? `<span class="pb-item-name">${icon(it.icon, it.name)}${esc(it.name)}</span>` : '—'}</td></tr>`; }).join('')}</tbody></table>`;
  }

  function populateDuelSelectors(force) {
    const kind = document.getElementById('pb-duel-kind')?.value || 'player';
    const a = document.getElementById('pb-duel-a'), b = document.getElementById('pb-duel-b');
    if (!a || !b) return;
    const oldA = force ? '' : a.value, oldB = force ? '' : b.value;
    const contextRows = allRows.length ? filteredRows(false, new Set([kind])) : [];
    let choices = [];
    if (kind === 'patch') {
      choices = uniq(contextRows, r => r.p).sort().map(value => [value, value]);
    } else {
      const players = new Map();
      contextRows.forEach(r => { if (!r.s) return; const p = players.get(r.s) || { name: r.n || r.s, games: 0 }; p.games++; players.set(r.s, p); });
      choices = [...players].filter(([, p]) => p.games >= 2).sort((x, y) => y[1].games - x[1].games || x[1].name.localeCompare(y[1].name)).map(([id, p]) => [id, `${p.name} (${p.games}局)`]);
    }
    const html = choices.map(([value, label]) => option(value, label)).join(''); a.innerHTML = html; b.innerHTML = html;
    const values = new Set(choices.map(x => x[0]));
    a.value = values.has(oldA) ? oldA : (choices[0]?.[0] || '');
    b.value = values.has(oldB) && oldB !== a.value ? oldB : (choices.find(x => x[0] !== a.value)?.[0] || a.value);
  }

  function renderDuel() {
    const kind = document.getElementById('pb-duel-kind')?.value || 'player';
    const aValue = document.getElementById('pb-duel-a')?.value || '', bValue = document.getElementById('pb-duel-b')?.value || '';
    const summary = document.getElementById('pb-duel-summary'), table = document.getElementById('pb-duel-items');
    if (!summary || !table) return;
    if (!aValue || !bValue || aValue === bValue) { summary.innerHTML = '<div class="pb-no-data">请选择两个不同样本</div>'; table.innerHTML = ''; return; }
    const base = filteredRows(false, new Set([kind]));
    const subset = value => base.filter(r => kind === 'patch' ? r.p === value : r.s === value);
    const aRows = subset(aValue), bRows = subset(bValue);
    const playerName = value => allRows.find(r => r.s === value)?.n || value;
    const label = value => kind === 'patch' ? `版本 ${value}` : playerName(value);
    const side = (value, rows) => {
      const clusters = clusteredRoutes(rows), route = clusters[0], firstTimes = rows.map(r => coreRoutePairs(r, 1)[0]?.[1]).filter(Number.isFinite);
      const routeHtml = route ? route.representative.map((id, idx) => { const it = items[id] || { name: id, icon: '' }; return `${idx ? '<span class="pb-seq-arrow">›</span>' : ''}${icon(it.icon, it.name)}`; }).join('') : '<small>路线样本不足</small>';
      return `<article class="pb-duel-side"><h3>${esc(label(value))}</h3><div class="pb-duel-metrics"><div><span>局数</span><strong>${rows.length}</strong></div><div><span>胜率</span><strong>${pct(rows.reduce((s, r) => s + Number(r.w || 0), 0), rows.length)}</strong></div><div><span>核心首件</span><strong>${timeText(median(firstTimes))}</strong></div><div><span>路线簇</span><strong>${clusters.length}</strong></div></div><div class="pb-duel-route">${routeHtml}<small>${route ? `${route.games}局 · ${route.variants.size}种变体` : ''}</small></div></article>`;
    };
    summary.innerHTML = side(aValue, aRows) + side(bValue, bRows);
    const aStats = new Map(itemStats(aRows).map(s => [s.id, s])), bStats = new Map(itemStats(bRows).map(s => [s.id, s]));
    const ids = [...new Set([...aStats.keys(), ...bStats.keys()])].map(id => {
      const ar = (aStats.get(id)?.games || 0) / Math.max(1, aRows.length), br = (bStats.get(id)?.games || 0) / Math.max(1, bRows.length); return { id, ar, br, delta: ar - br };
    }).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || y.ar + y.br - x.ar - x.br).slice(0, 18);
    table.innerHTML = `<table class="pb-table"><thead><tr><th>物品</th><th>${esc(label(aValue))}</th><th>${esc(label(bValue))}</th><th>采用率差</th><th>购买时间差</th></tr></thead><tbody>${ids.map(row => {
      const it = items[row.id] || { name: row.id, icon: '' }, as = aStats.get(row.id), bs = bStats.get(row.id), timeDelta = Number(as?.median) - Number(bs?.median);
      return `<tr><td><span class="pb-item-name">${icon(it.icon, it.name)}${esc(it.name)}</span></td><td>${pct(as?.games || 0, aRows.length)}</td><td>${pct(bs?.games || 0, bRows.length)}</td><td class="${row.delta >= 0 ? 'pb-up' : 'pb-down'}">${row.delta >= 0 ? '+' : ''}${pct(row.delta, 1)}</td><td>${Number.isFinite(timeDelta) ? `${timeDelta >= 0 ? '+' : '−'}${timeText(Math.abs(timeDelta))}` : '—'}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="pb-no-data">当前筛选没有可比较物品</td></tr>'}</tbody></table>`;
  }

  function renderAlerts() {
    const base = filteredRows(true), maxDate = base.map(r => r.d).sort().at(-1);
    if (!maxDate) { document.getElementById('pb-alerts').innerHTML = '<div class="pb-no-data">没有数据</div>'; return; }
    const end = new Date(`${maxDate}T00:00:00Z`), curFrom = new Date(end - 29 * 86400000), prevFrom = new Date(end - 59 * 86400000), prevTo = new Date(end - 30 * 86400000), iso = d => d.toISOString().slice(0, 10);
    const cur = base.filter(r => r.d >= iso(curFrom)), old = base.filter(r => r.d >= iso(prevFrom) && r.d <= iso(prevTo));
    const cm = new Map(itemStats(cur).map(s => [s.id, s])), om = new Map(itemStats(old).map(s => [s.id, s]));
    const movers = [...cm.values()].map(s => ({ ...s, delta: s.games / Math.max(1, cur.length) - (om.get(s.id)?.games || 0) / Math.max(1, old.length) })).filter(s => s.games >= 5).sort((a, b) => b.delta - a.delta).slice(0, 6);
    document.getElementById('pb-alerts').innerHTML = `<article><span>数据新鲜度</span><strong>${maxDate}</strong><small>${Math.floor((Date.now() - end) / 86400000)} 天前；超过7天应重新抽取数据库</small></article>${movers.map(s => { const it = items[s.id] || { name: s.id, icon: '' }; return `<article><span>采用率上升</span><strong>${icon(it.icon, it.name)} ${esc(it.name)}</strong><small>最近30天 ${pct(s.games, cur.length)} · 环比 ${s.delta >= 0 ? '+' : ''}${pct(s.delta, 1)}</small></article>`; }).join('')}`;
  }

  function matchItemTimeline(row, compact) {
    const firstUses = new Map(row.u || []);
    const allPairs = (row.i || []).filter(([id]) => includeItem(id)).sort((a, b) => {
      const at = Number.isFinite(a[1]) ? a[1] : Number.MAX_SAFE_INTEGER;
      const bt = Number.isFinite(b[1]) ? b[1] : Number.MAX_SAFE_INTEGER;
      return at - bt;
    });
    let pairs = compact ? coreRoutePairs(row, 5) : allPairs.slice(0, 18);
    if (compact && !pairs.length) pairs = allPairs.slice(0, 5);
    if (!pairs.length) return '<span class="pb-match-route-empty">该局没有可展示的装备记录</span>';
    return `<div class="pb-match-route ${compact ? 'is-compact' : ''}">${pairs.map(([id, seconds], index) => {
      const item = items[id] || { name: id, icon: '' };
      const firstUse = firstUses.get(id);
      const delay = Number.isFinite(seconds) && Number.isFinite(firstUse) && firstUse >= seconds ? firstUse - seconds : null;
      const timing = Number.isFinite(seconds) ? timeText(seconds) : '终局出现 / 无购买时点';
      return `${index ? '<span class="pb-match-route-arrow">›</span>' : ''}<span class="pb-match-route-step" title="${esc(item.name)} · ${timing}${Number.isFinite(delay) ? ` · 首用 ${intervalText(delay)}` : ''}">${icon(item.icon, item.name)}<small>${timing}</small>${compact ? '' : `<i class="${Number.isFinite(delay) ? '' : 'is-missing'}">首用 ${intervalText(delay)}</i>`}</span>`;
    }).join('')}</div>`;
  }

  function matchNeutralTimeline(row) {
    const choices = neutralChoices(row).slice().sort((a, b) => Number(a[0]) - Number(b[0]));
    if (!choices.length) return '<span class="pb-match-route-empty">该局没有 OpenDota 中立物品历史；不代表选手没有选择中立物品。</span>';
    return `<div class="pb-match-neutrals">${choices.map(choice => {
      const neutral = items[choice[2]] || { name: choice[2], icon: '' };
      const enchant = choice[3] ? (items[choice[3]] || { name: choice[3], icon: '' }) : null;
      return `<article><span>Tier ${Number(choice[0]) + 1}</span><div>${icon(neutral.icon, neutral.name)}<b>${esc(neutral.name)}</b>${enchant ? `<i>+</i>${icon(enchant.icon, enchant.name)}<b>${esc(enchant.name)}</b>` : '<i>附魔未记录</i>'}</div><small>最后一次有效选择 ${timeText(Number(choice[1]))} · OpenDota</small></article>`;
    }).join('')}</div>`;
  }

  function renderMatches(rows) {
    const body = document.getElementById('pb-matches-body'), head = document.getElementById('pb-matches-head');
    const summary = document.getElementById('pb-match-summary'), itemSelect = document.getElementById('pb-match-item');
    const more = document.getElementById('pb-matches-more'), columnOptions = document.getElementById('pb-match-column-options');
    if (!body || !head || !summary) return;
    if (!detailRowsReady(rows)) {
      ensureDetailRows(rows).then(() => { if (activeTab === 'matches') renderMatches(currentRows); }).catch(() => {});
    }

    if (itemSelect) {
      const counts = new Map();
      rows.forEach(row => {
        const observed = new Set((row.i || []).map(pair => pair[0]));
        neutralChoices(row).forEach(choice => { if (choice[2]) observed.add(choice[2]); if (choice[3]) observed.add(choice[3]); });
        observed.forEach(id => { if (items[id]) counts.set(id, (counts.get(id) || 0) + 1); });
      });
      const choices = [...counts].sort((a, b) => b[1] - a[1] || (items[a[0]]?.name || a[0]).localeCompare(items[b[0]]?.name || b[0]));
      itemSelect.innerHTML = '<option value="">全部装备</option>' + choices.map(([id, count]) => option(id, `${items[id]?.name || id} (${count})`)).join('');
      itemSelect.value = choices.some(([id]) => id === matchItem) ? matchItem : '';
      if (!itemSelect.value) { matchItem = ''; matchNeutralCompanion = ''; matchNeutralTier = ''; }
    }
    if (columnOptions) columnOptions.innerHTML = Object.entries(MATCH_COLUMN_LABELS).map(([key, label]) => `<label><input type="checkbox" data-pb-match-column="${key}" ${matchColumns.has(key) ? 'checked' : ''} ${key === 'match' ? 'disabled' : ''}> ${esc(label)}</label>`).join('');

    const query = matchSearch.trim().toLowerCase();
    const filtered = rows.filter(row => {
      if (matchResult !== '' && String(row.w) !== matchResult) return false;
      if (matchState && situation(row) !== matchState) return false;
      if (matchSide && String(row.tm) !== matchSide) return false;
      if (matchPickPhase && draftPickPhase(row) !== matchPickPhase) return false;
      if (matchNeutralTier !== '' && matchItem && !rowHasNeutralSelection(row, matchNeutralTier, matchItem, matchNeutralCompanion)) return false;
      if (matchNeutralTier === '' && matchItem && !rowHasObservedItem(row, matchItem)) return false;
      if (matchComebackOnly && !(situation(row) === 'behind' && Number(row.w) === 1)) return false;
      if (matchRouteOnly && coreRoutePairs(row, 5).length < 2) return false;
      if (query) {
        const haystack = [row.m, row.d, row.n, row.s, row.t, row.l, heroes[row.h]?.name || row.h]
          .concat((row.i || []).map(pair => items[pair[0]]?.name || pair[0]))
          .concat(neutralChoices(row).flatMap(choice => [choice[2], choice[3]].filter(Boolean).map(id => items[id]?.name || id))).join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
    draftPriorScores = buildDraftPrior(filtered);
    const valueForSort = (row, key) => ({
      date: `${row.d || ''}:${String(row.m || '').padStart(12, '0')}`,
      match: Number(row.m || 0), player: row.n || '', team: row.t || '', league: row.l || '', hero: heroes[row.h]?.name || row.h || '',
      role: Number(row.r || 0), state: Number(row.g?.[6]), nw15: Number(row.g?.[6]), kda15: Number(row.g?.[3] || 0) + Number(row.g?.[5] || 0) - Number(row.g?.[4] || 0),
      lane10: laneDeltaAt(row, 600), nw10: Number(snapshotAt(row, 600)?.[2]), nw20: Number(snapshotAt(row, 1200)?.[2]),
      cs10: Number(snapshotAt(row, 600)?.[3]), cs20: Number(snapshotAt(row, 1200)?.[3]), denies10: Number(snapshotAt(row, 600)?.[10]),
      lh15: Number(row.g?.[2]), gpm: metricRates(row).gpm, xpm: metricRates(row).xpm,
      damage: metricRates(row).heroDamage, towerDamage: metricRates(row).towerDamage, tfp: metricRates(row).tfp,
      ppi: performanceScore(row), draft: draftPriorScores.get(rowKey(row)),
      duration: Number(row.du), networth: Number(row.nw), result: Number(row.w),
    }[key]);
    filtered.sort((a, b) => {
      const av = valueForSort(a, matchSortKey), bv = valueForSort(b, matchSortKey);
      const missingA = Number.isNaN(av) || av == null, missingB = Number.isNaN(bv) || bv == null;
      if (missingA !== missingB) return missingA ? 1 : -1;
      const delta = typeof av === 'string' ? av.localeCompare(String(bv)) : av - bv;
      return (matchSortDir === 'asc' ? delta : -delta) || String(b.d || '').localeCompare(String(a.d || ''));
    });
    const wins = filtered.reduce((sum, row) => sum + Number(row.w || 0), 0);
    const nw15Values = filtered.map(row => Number(row.g?.[6])).filter(Number.isFinite);
    const kdaValues = filtered.filter(row => row.g && [3, 4, 5].every(index => Number.isFinite(Number(row.g[index])))).map(row => (Number(row.g[3]) + Number(row.g[5])) / Math.max(1, Number(row.g[4])));
    const durations = filtered.map(row => Number(row.du)).filter(value => Number.isFinite(value) && value > 0);
    const reconstructable = filtered.filter(row => coreRoutePairs(row, 5).length >= 2).length;
    const ppiValues = filtered.map(performanceScore).filter(Number.isFinite), draftValues = filtered.map(row => draftPriorScores.get(rowKey(row))).filter(Number.isFinite);
    const itemFilterLabel = `${matchNeutralTier !== '' ? `Tier ${Number(matchNeutralTier) + 1} · ` : ''}${[matchItem, matchNeutralCompanion].filter(Boolean).map(id => items[id]?.name || id).join(' + ')}`;
    summary.innerHTML = `${itemFilterLabel ? `<article class="is-filter"><span>装备条件</span><strong>${esc(itemFilterLabel)}</strong></article>` : ''}<article><span>筛选比赛</span><strong>${filtered.length.toLocaleString()}</strong></article><article><span>样本胜率</span><strong>${pct(wins, filtered.length)}</strong></article><article><span>平均15m团队经济差</span><strong>${nw15Values.length ? `${mean(nw15Values) >= 0 ? '+' : ''}${mean(nw15Values).toLocaleString()}` : '—'}</strong></article><article><span>平均15m KDA</span><strong>${kdaValues.length ? (kdaValues.reduce((sum, value) => sum + value, 0) / kdaValues.length).toFixed(2) : '—'}</strong></article><article><span>平均职业表现指数</span><strong>${mean(ppiValues) ?? '—'}</strong></article><article><span>平均阵容先验</span><strong>${draftValues.length ? pct(draftValues.reduce((sum, value) => sum + value, 0) / draftValues.length, 1) : '—'}</strong></article><article><span>中位时长</span><strong>${timeText(median(durations))}</strong></article><article><span>路线覆盖</span><strong>${pct(reconstructable, filtered.length)}</strong></article>`;

    const columns = Object.keys(MATCH_COLUMN_LABELS).filter(key => matchColumns.has(key));
    const sortable = new Set(['match', 'player', 'team', 'league', 'hero', 'role', 'state', 'lane10', 'nw10', 'nw15', 'nw20', 'cs10', 'cs20', 'denies10', 'kda15', 'lh15', 'gpm', 'xpm', 'damage', 'towerDamage', 'tfp', 'ppi', 'draft', 'duration', 'networth', 'result']);
    head.innerHTML = `<tr>${columns.map(key => `<th class="pb-match-col-${key}" ${sortable.has(key) ? `data-pb-match-sort="${key === 'match' ? 'date' : key}" tabindex="0" role="button"` : ''}>${esc(MATCH_COLUMN_LABELS[key])}${matchSortKey === (key === 'match' ? 'date' : key) ? `<i class="pb-sort-arrow">${matchSortDir === 'asc' ? '↑' : '↓'}</i>` : ''}</th>`).join('')}</tr>`;
    const cell = (row, key) => {
      const state = situation(row), teamDiff = Number(row.g?.[6]);
      if (key === 'match') return `<td><strong>${row.m}</strong><br><small>${esc(row.d)}</small></td>`;
      if (key === 'player') return `<td><strong>${esc(row.n || row.s)}</strong></td>`;
      if (key === 'team') return `<td>${esc(row.t || '—')}</td>`;
      if (key === 'league') return `<td>${esc(row.l || '—')}</td>`;
      if (key === 'hero') { const hero = heroes[row.h] || { name: row.h, icon: '' }; return `<td><span class="pb-item-name">${icon(hero.icon, hero.name)}${esc(hero.name)}</span></td>`; }
      if (key === 'route') return `<td class="pb-match-route-cell">${matchItemTimeline(row, true)}</td>`;
      if (key === 'role') return `<td>${row.r ? `${row.r}号位` : '—'}</td>`;
      if (key === 'side') return `<td>${Number(row.tm) === 2 ? '天辉' : Number(row.tm) === 3 ? '夜魇' : '—'}</td>`;
      if (key === 'pick') return `<td>${({ early: '前段', middle: '中段', last: '后段 / 最后手', unknown: '—' })[draftPickPhase(row)]}</td>`;
      if (key === 'state') return `<td>${situationName(state)}</td>`;
      if (key === 'lane10') { const value = laneDeltaAt(row, 600); return `<td class="${Number(value) >= 0 ? 'pb-up' : 'pb-down'}">${Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toLocaleString()}` : '—'}</td>`; }
      if (key === 'nw10' || key === 'nw20') { const value = Number(snapshotAt(row, key === 'nw10' ? 600 : 1200)?.[2]); return `<td>${Number.isFinite(value) ? value.toLocaleString() : '—'}</td>`; }
      if (key === 'cs10' || key === 'cs20') { const value = Number(snapshotAt(row, key === 'cs10' ? 600 : 1200)?.[3]); return `<td>${Number.isFinite(value) ? value.toLocaleString() : '—'}</td>`; }
      if (key === 'denies10') { const value = Number(snapshotAt(row, 600)?.[10]); return `<td>${Number.isFinite(value) ? value.toLocaleString() : '—'}</td>`; }
      if (key === 'nw15') return `<td class="${teamDiff >= 0 ? 'pb-up' : 'pb-down'}">${Number.isFinite(teamDiff) ? `${teamDiff >= 0 ? '+' : ''}${teamDiff.toLocaleString()}` : '—'}</td>`;
      if (key === 'kda15') return `<td>${row.g ? `${Number(row.g[3] || 0)}/${Number(row.g[4] || 0)}/${Number(row.g[5] || 0)}` : '—'}</td>`;
      if (key === 'lh15') return `<td>${Number.isFinite(Number(row.g?.[2])) ? Number(row.g[2]).toLocaleString() : '—'}</td>`;
      if (key === 'gpm' || key === 'xpm') { const value = metricRates(row)[key]; return `<td>${Number.isFinite(value) ? value.toLocaleString() : '—'}</td>`; }
      if (key === 'damage' || key === 'towerDamage') { const value = metricRates(row)[key === 'damage' ? 'heroDamage' : 'towerDamage']; return `<td>${Number.isFinite(value) ? value.toLocaleString() : '—'}</td>`; }
      if (key === 'tfp') { const value = metricRates(row).tfp; return `<td>${Number.isFinite(value) ? pct(value, 1) : '—'}</td>`; }
      if (key === 'ppi') { const value = performanceScore(row); return `<td><strong class="${Number(value) >= 60 ? 'pb-up' : Number(value) < 40 ? 'pb-down' : ''}" title="同英雄、同位置职业样本内的经济节奏、15分钟表现、KDA和等级百分位综合">${Number.isFinite(value) ? value : '—'}</strong></td>`; }
      if (key === 'draft') { const value = draftPriorScores.get(rowKey(row)); return `<td><strong title="基于当前筛选中同队与敌方英雄的历史胜率差，并做15局贝叶斯收缩；不是机器学习预测">${Number.isFinite(value) ? pct(value, 1) : '—'}</strong></td>`; }
      if (key === 'duration') return `<td>${timeText(Number(row.du))}</td>`;
      if (key === 'networth') return `<td>${Number.isFinite(Number(row.nw)) ? Number(row.nw).toLocaleString() : '—'}</td>`;
      if (key === 'result') return `<td><b class="${row.w ? 'pb-up' : 'pb-down'}">${row.w ? '胜' : '负'}</b></td>`;
      return '<td>—</td>';
    };
    const list = filtered.slice(0, matchVisibleLimit);
    body.innerHTML = list.map(row => `<tr data-pb-match="${esc(rowKey(row))}" class="${selectedMatchKey === rowKey(row) ? 'is-selected' : ''}">${columns.map(key => cell(row, key)).join('')}</tr>`).join('') || `<tr><td colspan="${columns.length}" class="pb-no-data">没有符合局内筛选条件的比赛</td></tr>`;
    if (more) { more.hidden = filtered.length <= matchVisibleLimit; more.textContent = `加载更多比赛（已显示 ${Math.min(filtered.length, matchVisibleLimit)} / ${filtered.length}）`; }
  }

  function setMatchDetailHtml(html) {
    const inline = document.getElementById('pb-match-detail'); if (inline) inline.innerHTML = html;
    const drawer = document.getElementById('pb-match-drawer-detail'); if (drawer && matchDrawerOpen) drawer.innerHTML = html;
  }

  function updateMatchDrawerVisibility() {
    if (!matchDrawer) return;
    matchDrawer.hidden = !matchDrawerOpen;
    document.documentElement.classList.toggle('pb-match-open', matchDrawerOpen);
  }

  function openMatchDrawer(key) {
    selectedMatchKey = key || '';
    matchDrawerOpen = Boolean(selectedMatchKey);
    updateMatchDrawerVisibility();
    if (selectedMatchKey) renderMatchDetail(selectedMatchKey);
    syncUrl();
  }

  function closeMatchDrawer() {
    matchDrawerOpen = false;
    selectedMatchKey = '';
    updateMatchDrawerVisibility();
    syncUrl();
    if (activeTab === 'matches') renderMatches(currentRows);
  }

  function renderMatchDetail(key) {
    const r = allRows.find(row => rowKey(row) === key);
    if (!r) return;
    const itemTimeline = matchItemTimeline(r, false);
    updateMatchDrawerVisibility();
    if (!detailRowsReady([r])) {
      setMatchDetailHtml(`<h3>${esc(r.n)} · ${esc(heroes[r.h]?.name || r.h)}</h3><p>${r.d} · ${esc(r.l)} · ${esc(r.t)}</p><h4>出装时间线</h4>${itemTimeline}<div class="pb-no-data">正在加载 ${r.d.slice(0, 7)} 单局明细…</div>`);
      ensureDetailRows([r]).then(() => { if (selectedMatchKey === key) renderMatchDetail(key); }).catch(err => { if (selectedMatchKey === key) setMatchDetailHtml(`<div class="pb-no-data">加载失败：${esc(err.message)}</div>`); });
      return;
    }
    const detail = detailData.players?.[key] || { q: [], a: [], iv: [], dm: [] }, draft = detailData.drafts?.[String(r.m)] || { p: [], b: [] }, events = detailData.events?.[String(r.m)] || [];
    const allied = draft.p.filter(p => p[1] === r.tm), enemies = draft.p.filter(p => p[1] !== r.tm);
    const heroChip = p => { const h = Object.values(heroes).find(x => x.name === p[3]) || heroes[p[3]] || { name: p[3], icon: '' }; return `<span>${icon(h.icon, h.name)}${esc(h.name)}</span>`; };
    const rates = metricRates(r), ppi = performanceScore(r), draftScore = buildDraftPrior(currentRows).get(rowKey(r));
    const inventoryHtml = (detail.iv || []).map(entry => `<article><span>${Number(entry[0]) === 0 ? '出生库存' : `${Math.round(Number(entry[0]) / 60)}分钟背包`}</span><div>${(entry[2] || []).map(id => { const item = items[id] || { name: id, icon: '' }; return `<b title="${esc(item.name)}">${icon(item.icon, item.name)}</b>`; }).join('') || '—'}</div><small>实际快照 ${timeText(Number(entry[1]))}</small></article>`).join('');
    const damageHtml = (detail.dm || []).map(entry => `<span><b>${timeText(Number(entry[0]))}–${timeText(Number(entry[0]) + 299)}</b>英雄 ${Number(entry[1] || 0).toLocaleString()} · 建筑 ${Number(entry[2] || 0).toLocaleString()}</span>`).join('');
    setMatchDetailHtml(`<h3>${esc(r.n)} · ${esc(heroes[r.h]?.name || r.h)}</h3><p>${r.d} · ${esc(r.l)} · ${esc(r.t)} · ${Number(r.tm) === 2 ? '天辉' : '夜魇'} · ${r.w ? '胜利' : '失败'}</p><div class="pb-match-scorecards"><article><span>职业表现指数</span><strong>${Number.isFinite(ppi) ? ppi : '—'}</strong><small>同英雄同位置百分位</small></article><article><span>阵容先验</span><strong>${Number.isFinite(draftScore) ? pct(draftScore, 1) : '—'}</strong><small>描述性收缩估计，非ML预测</small></article><article><span>GPM / XPM</span><strong>${rates.gpm || '—'} / ${rates.xpm || '—'}</strong><small>终局累计值 / 比赛分钟</small></article><article><span>伤害 / 参战</span><strong>${Number.isFinite(rates.heroDamage) ? rates.heroDamage.toLocaleString() : '—'} / ${Number.isFinite(rates.tfp) ? pct(rates.tfp, 1) : '—'}</strong><small>新采集字段</small></article></div><h4>出装时间线</h4>${itemTimeline}<h4>中立物品与附魔选择</h4>${matchNeutralTimeline(r)}<h4>控制时点完整背包</h4><div class="pb-match-inventories">${inventoryHtml || '<span>旧缓存没有出生与控制时点背包</span>'}</div><h4>双方选人 · ${({ early: '前段选出', middle: '中段选出', last: '后段 / 最后手', unknown: '阶段未知' })[draftPickPhase(r)]}</h4><div class="pb-draft"><div>${allied.map(heroChip).join('') || '<span>没有可靠阵容明细</span>'}</div><div>${enemies.map(heroChip).join('')}</div></div><h4>经济 / KDA 快照</h4><div class="pb-snapshot-list">${detail.q.map(q => `<span><b>${timeText(q[0])}</b> Lv${q[1]} · ${q[2].toLocaleString()}经济 · ${q[3].toLocaleString()}补刀${Number.isFinite(Number(q[10])) ? ` / ${Number(q[10])}反补` : ''} · ${q[4]}/${q[5]}/${q[6]} · 团队差 ${q[9] >= 0 ? '+' : ''}${q[9].toLocaleString()}</span>`).join('') || '<span>该局没有可靠经济快照</span>'}</div><h4>分时伤害</h4><div class="pb-event-list">${damageHtml || '<span>旧缓存没有分时伤害；新增量会自动写入</span>'}</div><h4>技能加点</h4><div class="pb-skill-seq">${detail.a.slice(0, 18).map((a, i) => `<b>${i + 1}. ${esc(String(a[1]).replaceAll('_', ' '))}</b>`).join('') || '<span>该局没有可靠技能加点明细</span>'}</div><h4>关键事件</h4><div class="pb-event-list">${events.slice(0, 80).map(e => `<span><b>${timeText(e[0])}</b> ${e[1] === 'd' ? '击杀/死亡' : e[1] === 'bb' ? '买活' : '建筑'} · ${esc(e[2])} → ${esc(e[3])}</span>`).join('') || '<span>没有事件</span>'}</div>`);
  }

  function renderHeatmap(rows) {
    const canvas = document.getElementById('pb-heatmap'); if (!canvas) return;
    if (!heatmapRequested) {
      const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#091015'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      document.getElementById('pb-heatmap-legend').innerHTML = `<button type="button" class="pb-load-detail" data-pb-load-heatmap>加载当前范围热力图</button><p>地图快照体积较大，仅在你明确打开时按月份加载。</p>`;
      return;
    }
    if (!detailRowsReady(rows)) {
      const legend = document.getElementById('pb-heatmap-legend'); if (legend) legend.textContent = '正在按当前日期范围加载地图快照…';
      ensureDetailRows(rows).then(() => { if (activeTab === 'matches') renderHeatmap(currentRows); }).catch(err => { if (legend) legend.textContent = `地图快照加载失败：${err.message}`; });
      return;
    }
    const ctx = canvas.getContext('2d'), patch = controls.patch.value || rows[0]?.p || config.theoryPatch;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#091015'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const points = [];
    rows.forEach(r => (detailData.players?.[rowKey(r)]?.q || []).forEach(q => { if (Number.isFinite(q[7]) && Number.isFinite(q[8])) points.push(q); }));
    const draw = () => { const stride = Math.max(1, Math.ceil(points.length / 8000)); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < points.length; i += stride) { const q = points[i], x = q[7] / 256 * canvas.width, y = canvas.height - q[8] / 256 * canvas.height; const grd = ctx.createRadialGradient(x, y, 1, x, y, 20); grd.addColorStop(0, 'rgba(255,195,64,.18)'); grd.addColorStop(1, 'rgba(255,70,30,0)'); ctx.fillStyle = grd; ctx.fillRect(x - 20, y - 20, 40, 40); } ctx.globalCompositeOperation = 'source-over'; document.getElementById('pb-heatmap-legend').textContent = `${points.length.toLocaleString()} 个5分钟位置快照 · 亮区表示职业选手更常出现的位置`; };
    const img = new Image(); img.onload = () => { ctx.globalAlpha = .62; ctx.drawImage(img, 0, 0, canvas.width, canvas.height); ctx.globalAlpha = 1; draw(); }; img.onerror = draw; img.src = `icons/maps/map_${patch}.webp`;
  }

  function render() {
    const rows = filteredRows();
    currentRows = rows;
    refreshHeroShortcuts();
    const ready = updateResearchFlowState();
    syncUrl();
    renderContext(rows);
    renderSampleGuidance(rows);
    if (!ready) {
      dashboard.hidden = true;
      updateMatchDrawerVisibility();
      return;
    }
    dashboard.hidden = false;
    const matches = new Set(rows.map(r => r.m));
    document.getElementById('pb-kpi-matches').textContent = matches.size.toLocaleString();
    document.getElementById('pb-kpi-games').textContent = rows.length.toLocaleString();
    document.getElementById('pb-kpi-winrate').textContent = pct(rows.reduce((s, r) => s + Number(r.w || 0), 0), rows.length);
    document.getElementById('pb-kpi-players').textContent = new Set(rows.map(r => r.s)).size.toLocaleString();
    document.getElementById('pb-kpi-heroes').textContent = new Set(rows.map(r => r.h)).size.toLocaleString();
    renderHeroProfile(rows);
    renderProfileInsights(rows);
    lastItemStats = itemStats(rows);
    if (!selectedItem || !lastItemStats.some(s => s.id === selectedItem)) selectedItem = lastItemStats[0]?.id || '';
    const selectedStat = lastItemStats.find(s => s.id === selectedItem);
    renderProBrief(rows, lastItemStats);
    if (activeTab === 'routes') {
      renderCompleteBuild(rows);
      renderItems(rows, lastItemStats); renderTheory(rows, selectedStat);
      renderTiming(lastItemStats); renderRecommendation(rows, lastItemStats);
      renderSequences(rows); renderRouteTrends(rows); renderBranchTree(rows); renderRouteFlow(rows);
      renderSubstitutions(rows, selectedStat);
    } else if (activeTab === 'people') {
      renderPlayers(rows); renderTeams(rows); renderPlayerStyle(rows); populateDuelSelectors(false); renderDuel();
    } else if (activeTab === 'situations') {
      renderComparison(rows); renderSituations(rows); renderPerformance(rows); renderMatchups(rows);
      renderLineupDecisions(rows); renderSkills(rows); renderPatchMeta(rows); renderOffMeta(rows);
    } else if (activeTab === 'quality') {
      renderDataQuality(); renderConfidence(rows, selectedStat); renderAlerts();
    } else if (activeTab === 'matches') {
      renderMatches(rows); renderHeatmap(rows);
    }
    updateMatchDrawerVisibility();
    if (selectedMatchKey) renderMatchDetail(selectedMatchKey);
  }

  page.addEventListener('click', e => {
    const modeButton = e.target.closest('[data-pb-mode]');
    if (modeButton) {
      setResearchMode(modeButton.dataset.pbMode || 'hero', true);
      return;
    }
    const quickHero = e.target.closest('[data-pb-select-hero]');
    if (quickHero) {
      controls.hero.value = quickHero.dataset.pbSelectHero || '';
      syncSearchInputs();
      if (researchMode === 'scout') {
        scoutAnalysisSubmitted = false;
        heatmapRequested = false;
        render();
        return;
      }
      researchMode = 'hero';
      layoutModeFilters();
      setActiveTab('routes', true);
      heatmapRequested = false;
      if (researchDrawer) researchDrawer.open = false;
      render();
      document.getElementById('pb-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const roleCard = e.target.closest('[data-pb-role-card]');
    if (roleCard) {
      controls.role.value = roleCard.getAttribute('data-pb-role-card') || '';
      heatmapRequested = false;
      render();
      return;
    }
    const briefJump = e.target.closest('[data-pb-tab-jump]');
    if (briefJump) {
      setActiveTab(briefJump.dataset.pbTabJump || 'routes', true);
      render();
      document.getElementById('pb-workspace-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const completeJump = e.target.closest('[data-pb-complete-jump]');
    if (completeJump) {
      document.getElementById(completeJump.dataset.pbCompleteJump || '')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const offMetaCluster = e.target.closest('[data-pb-offmeta-cluster]');
    if (offMetaCluster) {
      selectedRouteClusterId = offMetaCluster.dataset.pbOffmetaCluster || '';
      setActiveTab('routes', true); render();
      document.getElementById('pb-route-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const briefMatch = e.target.closest('[data-pb-brief-match]');
    if (briefMatch) {
      setActiveTab('matches', true);
      render();
      openMatchDrawer(briefMatch.dataset.pbBriefMatch || '');
      renderMatches(currentRows);
      return;
    }
    if (e.target.closest('#pb-open-research')) {
      if (researchDrawer) researchDrawer.open = true;
      researchDrawer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (e.target.closest('#pb-jump-matches')) {
      setActiveTab('matches', true);
      render();
      document.getElementById('pb-workspace-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (e.target.closest('[data-pb-close-match]')) { closeMatchDrawer(); return; }
    const clearChip = e.target.closest('[data-pb-clear]');
    if (clearChip) {
      const key = clearChip.dataset.pbClear;
      if (key === 'dates') { controls.from.value = controls.from.min || ''; controls.to.value = controls.to.max || ''; }
      else if (controls[key]) controls[key].value = key === 'scope' ? 'core' : '';
      syncSearchInputs(); heatmapRequested = false; render(); return;
    }
    const guidance = e.target.closest('[data-pb-guidance]');
    if (guidance) {
      const range = guidance.dataset.pbGuidance;
      if (String(range).startsWith('clear-')) {
        const key = String(range).slice(6); if (controls[key]) controls[key].value = '';
        syncSearchInputs();
      } else if (range === 'all') { controls.from.value = controls.from.min || ''; controls.to.value = controls.to.max || ''; }
      else {
        const days = Number(range), max = controls.to.max || controls.to.value;
        if (max && Number.isFinite(days)) { const end = new Date(`${max}T00:00:00Z`), start = new Date(end - (days - 1) * 86400000); controls.from.value = start.toISOString().slice(0, 10); controls.to.value = max; }
      }
      render(); return;
    }
    const tabButton = e.target.closest('[data-pb-tab]');
    if (tabButton) {
      setActiveTab(tabButton.dataset.pbTab || 'routes', true);
      render();
      return;
    }
    const clusterRow = e.target.closest('[data-pb-cluster]');
    if (clusterRow) {
      selectedRouteClusterId = clusterRow.dataset.pbCluster || '';
      syncUrl(); renderSequences(currentRows); return;
    }
    const clusterMatch = e.target.closest('[data-pb-cluster-match]');
    if (clusterMatch) {
      openMatchDrawer(clusterMatch.dataset.pbClusterMatch || ''); return;
    }
    if (e.target.closest('[data-pb-load-heatmap]')) { heatmapRequested = true; renderHeatmap(currentRows); return; }
    const matchSort = e.target.closest('[data-pb-match-sort]');
    if (matchSort) {
      const key = matchSort.dataset.pbMatchSort || 'date';
      if (matchSortKey === key) matchSortDir = matchSortDir === 'asc' ? 'desc' : 'asc';
      else { matchSortKey = key; matchSortDir = key === 'player' || key === 'team' || key === 'league' || key === 'hero' ? 'asc' : 'desc'; }
      matchVisibleLimit = 50; renderMatches(currentRows); return;
    }
    const matchRow = e.target.closest('[data-pb-match]');
    if (matchRow) {
      openMatchDrawer(matchRow.dataset.pbMatch || '');
      renderMatches(currentRows);
      return;
    }
    const neutralFilter = e.target.closest('[data-pb-neutral-filter]');
    if (neutralFilter) {
      const neutralItem = neutralFilter.dataset.pbNeutralItem || '';
      const enchantment = neutralFilter.dataset.pbNeutralEnchant || '';
      matchItem = neutralItem || enchantment;
      matchNeutralCompanion = neutralItem && enchantment ? enchantment : '';
      matchNeutralTier = neutralFilter.dataset.pbNeutralTier || '';
      matchVisibleLimit = 50;
      setActiveTab('matches', true);
      render();
      document.getElementById('pb-workspace-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const row = e.target.closest('[data-pb-item]');
    if (!row) return;
    selectedItem = row.dataset.pbItem || '';
    render();
  });
  page.querySelectorAll('[data-pb-range]').forEach(button => button.addEventListener('click', () => {
    const days = Number(button.dataset.pbRange || 30), max = controls.to.max || controls.to.value;
    if (!max) return; const end = new Date(`${max}T00:00:00Z`), start = new Date(end - (days - 1) * 86400000);
    controls.from.value = start.toISOString().slice(0, 10); controls.to.value = max;
    if (researchMode === 'scout') scoutAnalysisSubmitted = false;
    render();
  }));

  const refreshMatchExplorer = () => { matchVisibleLimit = 50; if (activeTab === 'matches') renderMatches(currentRows); };
  document.getElementById('pb-match-search')?.addEventListener('input', event => { matchSearch = event.target.value || ''; refreshMatchExplorer(); });
  document.getElementById('pb-match-result')?.addEventListener('change', event => { matchResult = event.target.value || ''; refreshMatchExplorer(); });
  document.getElementById('pb-match-state')?.addEventListener('change', event => { matchState = event.target.value || ''; refreshMatchExplorer(); });
  document.getElementById('pb-match-side')?.addEventListener('change', event => { matchSide = event.target.value || ''; refreshMatchExplorer(); });
  document.getElementById('pb-match-pick-phase')?.addEventListener('change', event => { matchPickPhase = event.target.value || ''; refreshMatchExplorer(); });
  document.getElementById('pb-match-item')?.addEventListener('change', event => { matchItem = event.target.value || ''; matchNeutralCompanion = ''; matchNeutralTier = ''; refreshMatchExplorer(); });
  document.getElementById('pb-match-comeback')?.addEventListener('change', event => { matchComebackOnly = Boolean(event.target.checked); refreshMatchExplorer(); });
  document.getElementById('pb-match-route-only')?.addEventListener('change', event => { matchRouteOnly = Boolean(event.target.checked); refreshMatchExplorer(); });
  document.getElementById('pb-match-sort')?.addEventListener('change', event => {
    const [key, direction] = String(event.target.value || 'date:desc').split(':');
    matchSortKey = key || 'date'; matchSortDir = direction === 'asc' ? 'asc' : 'desc'; refreshMatchExplorer();
  });
  document.getElementById('pb-match-column-options')?.addEventListener('change', event => {
    const input = event.target.closest('[data-pb-match-column]'); if (!input) return;
    if (input.checked) matchColumns.add(input.dataset.pbMatchColumn); else matchColumns.delete(input.dataset.pbMatchColumn);
    matchColumns.add('match'); renderMatches(currentRows);
  });
  document.getElementById('pb-matchup-search')?.addEventListener('input', event => { matchupSearch = event.target.value || ''; if (activeTab === 'situations') renderMatchups(currentRows); });
  document.getElementById('pb-matchup-min')?.addEventListener('input', event => { matchupMin = Number(event.target.value || 5); const output = document.getElementById('pb-matchup-min-value'); if (output) output.value = `${matchupMin}局`; if (activeTab === 'situations') renderMatchups(currentRows); });
  document.getElementById('pb-matchup-role')?.addEventListener('change', event => { matchupRole = event.target.value || ''; if (activeTab === 'situations') renderMatchups(currentRows); });
  document.getElementById('pb-matchup-kind')?.addEventListener('change', event => { matchupKind = event.target.value || 'enemy'; if (activeTab === 'situations') renderMatchups(currentRows); });
  document.getElementById('pb-matchup-meta-only')?.addEventListener('change', event => { matchupMetaOnly = Boolean(event.target.checked); if (activeTab === 'situations') renderMatchups(currentRows); });
  document.getElementById('pb-matches-more')?.addEventListener('click', () => { matchVisibleLimit += 50; renderMatches(currentRows); });
  page.addEventListener('keydown', event => {
    const header = event.target.closest('[data-pb-match-sort]');
    if (header && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); header.click(); }
  });

  function download(name, body, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  document.getElementById('pb-export-csv')?.addEventListener('click', () => {
    const head = ['match_id','date','patch','league','team','steamid','player','hero','position','position_method','position_confidence','result','level','networth','duration','networth_diff_15m','items','first_item_uses'];
    const quote = v => `"${String(v == null ? '' : v).replaceAll('"', '""')}"`;
    const lines = currentRows.map(r => [r.m,r.d,r.p,r.l,r.t,r.s,r.n,r.h,r.r,r.rm,r.rc,r.w,r.lv,r.nw,r.du,r.g?.[6],(r.i || []).map(x => `${x[0]}@${x[1] ?? ''}`).join('|'),(r.u || []).map(x => `${x[0]}@${x[1] ?? ''}`).join('|')].map(quote).join(','));
    download(`pro-builds-${controls.from.value}-${controls.to.value}.csv`, '\ufeff' + head.join(',') + '\n' + lines.join('\n'), 'text/csv;charset=utf-8');
  });
  document.getElementById('pb-export-route')?.addEventListener('click', () => {
    const svg = document.getElementById('pb-route-svg'); if (!svg) return;
    download(`build-route-${controls.hero.value || 'all'}.svg`, new XMLSerializer().serializeToString(svg), 'image/svg+xml');
  });
  document.getElementById('pb-export-report')?.addEventListener('click', () => {
    const title = `${heroes[controls.hero.value]?.name || controls.hero.value || '全部英雄'}职业出装分析`;
    const top = lastItemStats.slice(0, 12).map(s => `<tr><td>${esc(items[s.id]?.name || s.id)}</td><td>${pct(s.games, currentRows.length)}</td><td>${pct(s.wins, s.games)}</td><td>${pct(s.adjusted, 1)}</td><td>${timeText(s.median)}</td><td>${intervalText(s.averageFirstUseDelay)}</td></tr>`).join('');
    const html = `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px system-ui;max-width:1000px;margin:40px auto;color:#222}h1{margin-bottom:4px}small{color:#666}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:8px;border:1px solid #ccc;text-align:right}th:first-child,td:first-child{text-align:left}</style><h1>${esc(title)}</h1><small>${esc(controls.from.value)}—${esc(controls.to.value)} · ${currentRows.length}个选手-英雄局 · 生成于 ${new Date().toLocaleString()}</small><p>职责位置来自联赛内 lane_role 与补刀聚合，slot 不参与。校正胜率按职责、15分钟局势与比赛时长分层，仅用于描述性比较。首用间隔为首次购买到第一次可识别主动使用或明确触发的平均时长。</p><table><thead><tr><th>物品</th><th>采用率</th><th>样本胜率</th><th>情境校正</th><th>中位时点</th><th>平均第一次使用间隔</th></tr></thead><tbody>${top}</tbody></table>`;
    download(`pro-build-report-${controls.hero.value || 'all'}.html`, html, 'text/html;charset=utf-8');
  });
  document.getElementById('pb-save-view')?.addEventListener('click', saveCurrentView);
  document.getElementById('pb-load-view')?.addEventListener('click', loadSavedView);
  document.getElementById('pb-delete-view')?.addEventListener('click', deleteSavedView);
  document.getElementById('pb-duel-kind')?.addEventListener('change', () => { populateDuelSelectors(true); renderDuel(); });
  document.getElementById('pb-duel-a')?.addEventListener('change', renderDuel);
  document.getElementById('pb-duel-b')?.addEventListener('change', renderDuel);
  document.getElementById('pb-style-player')?.addEventListener('change', () => renderPlayerStyle(currentRows));
  document.getElementById('pb-route-trend-grain')?.addEventListener('change', event => { routeTrendGrain = event.target.value; syncUrl(); renderRouteTrends(currentRows); });
  document.getElementById('pb-advanced-toggle')?.addEventListener('click', event => {
    const expanded = advancedPanel.hidden;
    advancedPanel.hidden = !expanded;
    event.currentTarget.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    event.currentTarget.textContent = expanded ? '收起高级筛选' : '高级筛选与工具';
  });
  page.querySelectorAll('[data-pb-close-match]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    closeMatchDrawer();
  }));
  function validatePrimarySelection() {
    if (researchMode === 'scout' && !controls.team.value && !controls.player.value) {
      SEARCH_CONTROLS.team.input?.setCustomValidity('请先选择一个战队或职业选手');
      SEARCH_CONTROLS.team.input?.reportValidity();
      return false;
    }
    if (researchMode === 'scout' && !controls.hero.value) {
      SEARCH_CONTROLS.hero.input?.setCustomValidity('请从该目标的热门英雄中选择一个英雄');
      SEARCH_CONTROLS.hero.input?.reportValidity();
      return false;
    }
    return primarySelectionReady();
  }
  document.getElementById('pb-run-analysis')?.addEventListener('click', () => {
    const requiredSearch = researchMode === 'hero' ? 'hero' : researchMode === 'player' ? 'player'
      : SEARCH_CONTROLS.team.input?.value ? 'team' : 'player';
    if (SEARCH_CONTROLS[requiredSearch]?.input?.value && !commitSearchControl(requiredSearch)) return;
    if (researchMode === 'scout' && SEARCH_CONTROLS.hero.input?.value && !controls.hero.value && !commitSearchControl('hero')) return;
    if (!validatePrimarySelection()) { updateResearchFlowState(); return; }
    if (researchMode === 'scout') scoutAnalysisSubmitted = true;
    setActiveTab(MODE_CONFIG[researchMode].tab, true);
    render();
    if (researchDrawer) researchDrawer.open = false;
    document.getElementById('pb-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  function runCommittedSearch(key) {
    if (!commitSearchControl(key)) return;
    if (researchMode === 'scout') {
      scoutAnalysisSubmitted = false;
      if (key === 'team' || key === 'player') {
        controls.hero.value = '';
        if (SEARCH_CONTROLS.hero.input) {
          SEARCH_CONTROLS.hero.input.value = '';
          SEARCH_CONTROLS.hero.input.setCustomValidity('');
        }
      }
    }
    heatmapRequested = false;
    render();
    const isPrimary = (researchMode === 'hero' && key === 'hero')
      || (researchMode === 'player' && key === 'player');
    if (isPrimary && primarySelectionReady()) {
      if (researchDrawer) researchDrawer.open = false;
      document.getElementById('pb-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  Object.entries(SEARCH_CONTROLS).forEach(([key, binding]) => {
    binding.input?.addEventListener('change', () => runCommittedSearch(key));
    binding.input?.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      runCommittedSearch(key);
    });
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && matchDrawerOpen) closeMatchDrawer(); });
  layoutModeFilters();
  refreshSavedViews();
  Object.values(controls).forEach(el => el && el.addEventListener('change', () => {
    if (researchMode === 'scout') scoutAnalysisSubmitted = false;
    heatmapRequested = false;
    render();
  }));
  document.getElementById('pb-reset')?.addEventListener('click', () => {
    Object.entries(controls).forEach(([key, el]) => {
      if (!el) return;
      if (key === 'scope') el.value = 'core';
      else if (key === 'from') {
        const max = controls.to.max || '';
        el.value = max ? new Date(new Date(`${max}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10) : (el.min || '');
      }
      else if (key === 'to') el.value = el.max || '';
      else el.value = '';
    });
    selectedItem = '';
    routeTrendGrain = 'week';
    scoutAnalysisSubmitted = false;
    syncSearchInputs();
    render();
  });

  let coreTransport = 'JSON';
  async function loadCorePayload() {
    if (config.dataGzipUrl && typeof DecompressionStream === 'function') {
      try {
        const compressed = await fetch(config.dataGzipUrl, { cache: 'no-cache' });
        if (!compressed.ok || !compressed.body) throw new Error(`HTTP ${compressed.status}`);
        const stream = compressed.body.pipeThrough(new DecompressionStream('gzip'));
        const payload = await new Response(stream).json();
        coreTransport = 'GZIP';
        return payload;
      } catch (_) {
        // Older browsers and unusual static hosts fall back to plain JSON.
      }
    }
    const response = await fetch(config.dataUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  const coreLoadStarted = Date.now();
  loadCorePayload()
    .then(payload => {
      allRows = decodeCorePayload(payload);
      matchTeams = new Map();
      matchRowsById = new Map();
      allRows.forEach(r => {
        const match = String(r.m); if (!matchTeams.has(match)) matchTeams.set(match, new Map());
        if (!matchTeams.get(match).has(r.t)) matchTeams.get(match).set(r.t, new Set());
        matchTeams.get(match).get(r.t).add(r.h);
        if (!matchRowsById.has(match)) matchRowsById.set(match, []);
        matchRowsById.get(match).push(r);
      });
      const meta = payload.meta || {};
      dataMeta = meta;
      renderFreshness(meta);
      populateFilters(allRows, meta);
      populateDuelSelectors(true);
      applyUrlFilters();
      if (researchDrawer) researchDrawer.open = !primarySelectionReady();
      layoutModeFilters();
      setActiveTab(activeTab, false);
      const assigned = Number(meta.positions?.assigned_player_games || 0);
      const coverage = Number(meta.player_games || 0) ? (assigned * 100 / Number(meta.player_games)).toFixed(1) : '0.0';
      note.textContent = `${Number(meta.matches || 0).toLocaleString()} 场职业比赛 · ${Number(meta.player_games || 0).toLocaleString()} 个选手-英雄局 · 职责位置覆盖 ${coverage}% · ${meta.date_min || '?'} — ${meta.date_max || '?'} · 紧凑缓存 ${coreTransport} ${(Date.now() - coreLoadStarted) / 1000 < 10 ? ((Date.now() - coreLoadStarted) / 1000).toFixed(1) + '秒' : '已加载'}`;
      const startDataNote = document.getElementById('pb-start-data-note');
      if (startDataNote) startDataNote.textContent = `${Number(meta.matches || 0).toLocaleString()} 场职业比赛 · ${meta.date_min || '?'} — ${meta.date_max || '?'} · 默认最近30天`;
      loading.hidden = true;
      render();
      loadDetailManifest().catch(() => {});
    })
    .catch(err => {
      loading.textContent = `职业比赛数据加载失败：${err.message}`;
      loading.classList.add('is-error');
      note.textContent = '请先运行职业数据抽取脚本并重新构建';
      const startDataNote = document.getElementById('pb-start-data-note');
      if (startDataNote) startDataNote.textContent = '职业比赛数据加载失败，请检查数据缓存';
    });
})();

// ---- HERO STATS: vertical frozen-pane divider after the pinned Hero column ----
// The hs-table is mr-table-based (not creeps-table), so it doesn't get the
// creeps sticky-frame overlay. This positions a thin vertical line at the
// right edge of the sticky Hero column, drawn in the non-scrolling
// .creeps-page so it keeps repainting during horizontal scroll, shown only
// once the box is scrolled sideways (same convention as Neutral Creeps).
(function() {
  const table = document.querySelector('.hs-table');
  if (!table) return;
  const scroller = table.closest('.creeps-scroll');
  const page = table.closest('.creeps-page');
  const frame = page && page.querySelector('.hs-sticky-frame');
  if (!scroller || !page || !frame) return;

  function position() {
    const nameCell = table.querySelector('thead th.hs-name')
      || table.querySelector('tbody td.hs-name');
    if (!nameCell) return;
    const pageR = page.getBoundingClientRect();
    const scrR = scroller.getBoundingClientRect();
    const tableR = table.getBoundingClientRect();
    const nameR = nameCell.getBoundingClientRect();
    // Anchor the divider top to the pinned header's bottom (thead th is
    // sticky:top, so its rect tracks the visible pinned position).
    const headCell = table.querySelector('thead th.hs-name') || nameCell;
    const headBottom = headCell.getBoundingClientRect().bottom;
    const bottom = Math.min(scrR.bottom, tableR.bottom);
    frame.style.left = (nameR.right - pageR.left) + 'px';
    frame.style.top = (headBottom - pageR.top) + 'px';
    frame.style.height = Math.max(0, bottom - headBottom) + 'px';
    frame.style.width = '0px';
  }

  let posTicking = false;
  const positionRaf = () => {
    if (posTicking) return;
    posTicking = true;
    requestAnimationFrame(() => {
      position();
      frame.classList.toggle('visible', scroller.scrollLeft > 0);
      posTicking = false;
    });
  };
  // Scrolling happens INSIDE .creeps-scroll (the page body is locked), so the
  // divider must be repositioned on the BOX scroll — both vertical (the table's
  // bounding bottom that clamps the divider height moves as content scrolls) and
  // horizontal (visibility). Window scroll never fires here; resize + filter
  // changes also re-anchor (left/height from new column widths + row count).
  scroller.addEventListener('scroll', positionRaf, { passive: true });
  window.addEventListener('resize', positionRaf, { passive: true });
  window.addEventListener('mr:filter-changed', positionRaf);
  position();
})();

// ---- MANA ITEMS: Heatmap on/off toggle + recompute on filter change ----
(function() {
  const table = document.querySelector('.mr-table');
  const toggle = document.getElementById('mr-heatmap-toggle');
  if (!table || !toggle) return;
  function applyOrClear() {
    if (toggle.checked) {
      // Recompute by dispatching a synthetic event the heatmap IIFE
      // listens to. (The heatmap IIFE re-runs its applyHeatmap each
      // time a filter/sort changes — we route through it here too.)
      window.dispatchEvent(new CustomEvent('mr:filter-changed'));
    } else {
      // Strip all backgroundColor inline styles set by the heatmap.
      table.querySelectorAll('tbody td').forEach(td => {
        td.style.backgroundColor = '';
      });
    }
  }
  toggle.addEventListener('change', applyOrClear);
})();


/* ---- STAR SKY + WALL OF SIGNATURES (index) ----
   A few dim, lightly/independently twinkling pixel "stars" form the backdrop.
   The member names start HIDDEN (nothing painted at load → light first paint);
   a gold laser from the Premium star reveals them ONE per shot and they stay
   lit, so the wall fills up over time. Stars and names are laid out so they
   never overlap (they may sit very close). Re-runs on resize. Index-only. */
(function () {
  const layer = document.querySelector('.inv-signatures');
  if (!layer) return;
  // A name is "blank" if it has no visible char (only whitespace / zero-width),
  // so a beam never flies to an empty-looking name (blank names can still have a
  // nonzero render width, which is why offsetWidth alone doesn't catch them).
  function hasVisible(s) {
    const t = s.textContent;
    for (let i = 0; i < t.length; i++) {
      if (t[i].trim() === '') continue;                       // whitespace
      const c = t.charCodeAt(i);
      // zero-width chars + blank "filler" letters used as empty usernames:
      // Hangul fillers (115F/1160/3164/FFA0), Braille blank (2800), Mongolian sep.
      if (c === 0x200B || c === 0x200C || c === 0x200D || c === 0x2060 || c === 0xFEFF ||
          c === 0x115F || c === 0x1160 || c === 0x3164 || c === 0xFFA0 ||
          c === 0x2800 || c === 0x180E || c === 0x3000) continue;
      return true;
    }
    return false;
  }
  const sigs = [...layer.querySelectorAll('.inv-sig')].filter(hasVisible);
  if (!sigs.length) return;

  const overlap = (a, b) => !(a.r <= b.l || a.l >= b.r || a.b <= b.t || a.t >= b.b);

  // Dedicated star-sky layer behind everything.
  let sky = document.querySelector('.star-sky');
  if (!sky) {
    sky = document.createElement('div');
    sky.className = 'star-sky';
    sky.setAttribute('aria-hidden', 'true');
    document.body.appendChild(sky);
  }

  let pos = [];          // computed name positions {x,y,cx,cy,rot} (null if dropped)
  let starRects = [];    // star bounding rects, so names avoid them

  function forbiddenZones(W, H, M) {
    const zones = [];
    const book = document.querySelector('.inv-book');
    if (book) {
      const br = book.getBoundingClientRect();
      zones.push({ l: br.left - M, t: br.top - M, r: br.right + M, b: br.bottom + M });
    }
    const nav = document.querySelector('nav.top-nav');
    if (nav) {
      const nr = nav.getBoundingClientRect();
      zones.push({ l: 0, t: 0, r: W, b: nr.bottom + M });
    }
    return zones;
  }

  // A handful of dim pixel stars, avoiding the book/nav and each other.
  function placeStars(W, H) {
    sky.textContent = '';
    starRects = [];
    const forbidden = forbiddenZones(W, H, 4);
    const COUNT = Math.round(Math.min(92, Math.max(46, (W * H) / 13000)));  // +15% more (incl. smaller ones)
    const SM = 3;                                  // min gap between stars
    const twinkleCenters = [];                     // keep twinkling stars spread apart
    for (let i = 0; i < COUNT; i++) {
      for (let tryN = 0; tryN < 40; tryN++) {
        const sr = Math.random();
        const sz = sr < 0.12 ? 1 : sr < 0.30 ? 2 : sr < 0.78 ? 3 : 4;   // ~30% small (1–2px), rest 3–4px
        const x = 5 + Math.random() * (W - 10);
        const y = 5 + Math.random() * (H - 10);
        const r = { l: x - SM, t: y - SM, r: x + sz + SM, b: y + sz + SM };
        if (forbidden.some(f => overlap(r, f))) continue;
        if (starRects.some(s => overlap(r, s))) continue;
        const star = document.createElement('i');
        star.className = 'star';
        star.style.left = x.toFixed(1) + 'px';
        star.style.top = y.toFixed(1) + 'px';
        star.style.width = star.style.height = sz + 'px';
        // Three brightness tiers: most dim, ~22% bright, ~10% extra-bright (brighter still).
        const roll = Math.random();
        let lo, hi, staticOp;
        // Wide low→high swing so the twinkle is clearly visible (dims to nearly
        // nothing, then brightens to a clear peak).
        if (roll < 0.10) {
          lo = 0.35; hi = 1.0; staticOp = 0.78;
          star.style.boxShadow = '0 0 4px rgba(236,228,205,0.78)';
        } else if (roll < 0.32) {
          lo = 0.2; hi = 0.9; staticOp = 0.52;
          star.style.boxShadow = '0 0 3px rgba(232,224,200,0.5)';
        } else {
          lo = 0.08; hi = 0.5; staticOp = 0.3;
        }
        // Only ~22% twinkle (extra-bright lean toward it), and never too close to
        // another twinkling star — so few flicker at once and they stay spread out.
        const cx = x + sz / 2, cy = y + sz / 2;
        const spaced = !twinkleCenters.some(c => Math.hypot(c.x - cx, c.y - cy) < 55);
        const wantTwinkle = roll < 0.10 ? Math.random() < 0.6 : Math.random() < 0.22;
        if (wantTwinkle && spaced) {
          star.style.setProperty('--lo', lo);
          star.style.setProperty('--hi', hi);
          star.style.opacity = lo;
          const durN = 3 + Math.random() * 3.5;               // faster cadence → more noticeable
          // NEGATIVE delay = start already partway through the cycle, at a random
          // phase, so stars never twinkle in sync (positive delays would just
          // stagger the start but keep them aligned early on).
          const del = (-Math.random() * durN).toFixed(2);
          star.style.animation = 'starTwinkle ' + durN.toFixed(1) + 's ease-in-out ' + del + 's infinite';
          twinkleCenters.push({ x: cx, y: cy });
        } else {
          star.style.opacity = staticOp;
        }
        sky.appendChild(star);
        starRects.push(r);
        break;
      }
    }
  }

  // Place every name (avoiding book/nav, stars, and each other) but keep them
  // HIDDEN — they reveal only when a beam reaches them. Strict read/write phases
  // so the browser lays out ~twice (no per-name reflow). is-lit is preserved
  // across re-layout so already-revealed names stay visible.
  function placeNames(W, H) {
    const M = Math.max(2, Math.round(11 - sigs.length * 0.05));
    const FONT_MIN = 11, FONT_MAX = 22;
    const crowd = Math.max(0, Math.min(1, (sigs.length - 120) / 240));
    const fontTop = Math.round(FONT_MAX - (FONT_MAX - FONT_MIN) * crowd);
    const fontBot = Math.max(FONT_MIN, fontTop - 6);
    const EDGE = 6;
    const forbidden = forbiddenZones(W, H, M).concat(starRects);   // also dodge stars
    const n = sigs.length;
    // (1) write font sizes
    for (let i = 0; i < n; i++) {
      sigs[i].style.display = '';
      sigs[i].style.fontSize = (fontBot + Math.floor(Math.random() * (fontTop - fontBot + 1))) + 'px';
    }
    // (2) measure once
    const ws = new Array(n), hs = new Array(n);
    for (let i = 0; i < n; i++) { ws[i] = sigs[i].offsetWidth; hs[i] = sigs[i].offsetHeight; }
    // (3) pure-JS placement
    const placed = [];
    pos = new Array(n);
    for (let i = 0; i < n; i++) {
      const w0 = ws[i], h0 = hs[i];
      if (!w0 || !h0) { pos[i] = null; continue; }
      const rot = Math.random() * 14 - 7;
      const rad = Math.abs(rot) * Math.PI / 180;
      const bw = w0 * Math.cos(rad) + h0 * Math.sin(rad);
      const bh = w0 * Math.sin(rad) + h0 * Math.cos(rad);
      const cxMin = EDGE + bw / 2, cxMax = W - EDGE - bw / 2;
      const cyMin = EDGE + bh / 2, cyMax = H - EDGE - bh / 2;
      if (cxMax <= cxMin || cyMax <= cyMin) { pos[i] = null; continue; }
      let done = false;
      for (let k = 0; k < 60 && !done; k++) {
        const cx = cxMin + Math.random() * (cxMax - cxMin);
        const cy = cyMin + Math.random() * (cyMax - cyMin);
        const r = { l: cx - bw / 2 - M, t: cy - bh / 2 - M, r: cx + bw / 2 + M, b: cy + bh / 2 + M };
        let bad = false;
        for (let f = 0; f < forbidden.length; f++) { if (overlap(r, forbidden[f])) { bad = true; break; } }
        if (bad) continue;
        for (let p = 0; p < placed.length; p++) { if (overlap(r, placed[p])) { bad = true; break; } }
        if (bad) continue;
        pos[i] = { x: cx - w0 / 2, y: cy - h0 / 2, cx: cx, cy: cy, rot: rot };
        placed.push(r);
        done = true;
      }
      if (!done) pos[i] = null;
    }
    // (4) write transforms; do NOT reveal — names stay hidden until a beam hits.
    for (let i = 0; i < n; i++) {
      const s = sigs[i], p = pos[i];
      if (!p) { s.style.display = 'none'; continue; }
      s.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) rotate(' + p.rot.toFixed(1) + 'deg)';
    }
    layer.style.opacity = '1';     // layer is up; individual names hidden via CSS
  }

  function layout() {
    const W = document.documentElement.clientWidth;
    const H = document.documentElement.clientHeight;
    placeStars(W, H);
    placeNames(W, H);
  }

  function run() {
    // Wait for the wall font (Handjet) so widths measure right, capped at 300ms.
    const fontReady = (document.fonts && document.fonts.load)
      ? document.fonts.load('20px "Handjet"').catch(() => {})
      : Promise.resolve();
    Promise.race([
      Promise.resolve(fontReady),
      new Promise(r => setTimeout(r, 300)),
    ]).then(() => requestAnimationFrame(layout));   // defer off the first paint
  }
  if (document.readyState !== 'loading') run();
  else document.addEventListener('DOMContentLoaded', run);
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(layout, 200); }, { passive: true });

  // Premium-star laser: reveals one not-yet-lit name per shot; it then stays lit.
  const star = document.querySelector('.inv-cell-star .inv-icon')
            || document.querySelector('.inv-cell-star');
  let fx = null;                       // shared overlay for beams + dust
  function fxLayer() {
    if (!fx) {
      fx = document.createElement('div');
      fx.className = 'sig-beam-layer';
      fx.setAttribute('aria-hidden', 'true');
      document.body.appendChild(fx);
    }
    return fx;
  }
  function shootBeam(ox, oy, tx, ty) {
    if (!star) return;
    const beamLayer = fxLayer();
    const dx = tx - ox, dy = ty - oy;
    const dist = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    const beam = document.createElement('div');
    beam.className = 'sig-beam';
    beam.style.left = ox + 'px';
    beam.style.top = oy + 'px';
    beam.style.width = dist + 'px';
    const tr = 'rotate(' + ang + 'deg)';
    const anim = beam.animate([
      { transform: tr + ' scaleX(0)', opacity: 0 },
      { transform: tr + ' scaleX(1)', opacity: 0.6, offset: 0.4 },
      { transform: tr + ' scaleX(1)', opacity: 0 },
    ], { duration: 600, easing: 'ease-out', fill: 'forwards' });
    beamLayer.appendChild(beam);
    anim.onfinish = () => beam.remove();
  }
  // VIP-name forge sparks: a small azure burst when a beam lights a VIP name,
  // as if it were just struck on an anvil. Specks shoot up + out, then gravity
  // arcs them down past the start and they fade. Same azure as .inv-sig-vip.
  function forgeSparks(sig) {
    const r = sig.getBoundingClientRect();
    const fxl = fxLayer();
    const N = 10 + Math.floor(Math.random() * 5);     // 10–14 sparks
    for (let k = 0; k < N; k++) {
      const p = document.createElement('i');
      p.className = 'sig-spark';
      const sz = Math.random() < 0.6 ? 2 : 3;
      p.style.width = p.style.height = sz + 'px';
      p.style.left = (r.left + Math.random() * r.width).toFixed(1) + 'px';
      p.style.top = (r.top + r.height * (0.3 + Math.random() * 0.5)).toFixed(1) + 'px';
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;   // fan around "up"
      const rad = 14 + Math.random() * 26;
      const dx = Math.cos(ang) * rad;
      const up = Math.sin(ang) * rad;                  // negative = upward
      const fall = 10 + Math.random() * 18;
      const a = p.animate([
        { transform: 'translate(0,0)', opacity: 1, offset: 0 },
        { transform: 'translate(' + (dx * 0.6).toFixed(1) + 'px,' + up.toFixed(1) + 'px)', opacity: 1, offset: 0.45 },
        { transform: 'translate(' + dx.toFixed(1) + 'px,' + (up + fall).toFixed(1) + 'px)', opacity: 0, offset: 1 },
      ], { duration: 600 + Math.random() * 500, easing: 'cubic-bezier(0.25,0.6,0.4,1)', fill: 'forwards' });
      fxl.appendChild(p);
      a.onfinish = () => p.remove();
    }
  }
  function lightUp(s) {
    s.classList.add('is-lit');
    if (s.classList.contains('inv-sig-vip')) forgeSparks(s);
  }
  function fireBeam(i) {
    const s = sigs[i];
    if (star) {
      const sr = star.getBoundingClientRect();
      shootBeam(sr.left + sr.width / 2, sr.top + sr.height / 2, pos[i].cx, pos[i].cy);
      setTimeout(() => lightUp(s), 220);   // light as the beam lands
    } else {
      lightUp(s);
    }
  }
  function spotlightOnce() {
    if (document.hidden || !pos.length) return;
    const pool = [];
    for (let i = 0; i < sigs.length; i++) {
      if (pos[i] && !sigs[i].classList.contains('is-lit')) pool.push(i);
    }
    if (!pool.length) { clearInterval(beamInterval); return; }
    // Usually one beam, but sometimes a volley: 20% chance of 2 beams at once,
    // 10% chance of 3 (each lights a different name).
    const roll = Math.random();
    let count = roll < 0.10 ? 3 : roll < 0.30 ? 2 : 1;
    count = Math.min(count, pool.length);
    for (let k = 0; k < count; k++) {
      const j = Math.floor(Math.random() * pool.length);
      fireBeam(pool.splice(j, 1)[0]);          // distinct name each beam
    }
  }
  setTimeout(spotlightOnce, 5000);              // first beam ~5s after load
  const beamInterval = setInterval(spotlightOnce, 2500);

  document.addEventListener('visibilitychange', () => {
    sky.classList.toggle('paused', document.hidden);
  });

  // Click a lit name → it "disintegrates" into pixel gold dust and returns to the
  // unlit pool, so a later beam can re-light it.
  function disintegrate(sig) {
    const r = sig.getBoundingClientRect();
    const fxl = fxLayer();
    const N = 16 + Math.floor(Math.random() * 10);   // 16–25 specks
    // Per-click randomisation so no two bursts disperse the same way.
    const spreadF = 0.8 + Math.random() * 0.7;       // this cloud's overall size
    const durBase = 3300 + Math.random() * 1800;     // this cloud's tempo (slow)
    const drift = Math.random() * Math.PI * 2;       // slight directional lean
    const driftAmt = Math.random() * 12;
    const vip = sig.classList.contains('inv-sig-vip');
    for (let k = 0; k < N; k++) {
      const p = document.createElement('i');
      p.className = vip ? 'sig-dust sig-dust-vip' : 'sig-dust';
      const sz = Math.random() < 0.5 ? 2 : 3;        // clear little squares (2–3px)
      p.style.width = p.style.height = sz + 'px';
      p.style.left = (r.left + Math.random() * r.width).toFixed(1) + 'px';
      p.style.top = (r.top + Math.random() * r.height).toFixed(1) + 'px';
      // Puff outward in all directions, spread wide so specks end up further apart,
      // + a gentle downward settle and this burst's directional lean.
      const ang = Math.random() * Math.PI * 2;
      const rad = (26 + Math.random() * 50) * spreadF;
      const dx = Math.cos(ang) * rad + Math.cos(drift) * driftAmt;
      const dy = Math.sin(ang) * rad * 0.6 + Math.sin(drift) * driftAmt + (5 + Math.random() * 16);
      const a = p.animate([
        { transform: 'translate(0,0)', opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.5 },                 // linger visible longer before fading
        { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)', opacity: 0, offset: 1 },
      ], { duration: durBase + Math.random() * 1400,  // ~10% slower dispersal, longer-lived
           easing: 'cubic-bezier(0.14,0.7,0.28,1)', fill: 'forwards' });
      fxl.appendChild(p);
      a.onfinish = () => p.remove();
    }
    sig.classList.remove('is-lit');                // fades out; rejoins the unlit pool
  }
  layer.addEventListener('click', (e) => {
    const sig = e.target.closest && e.target.closest('.inv-sig');
    if (sig && sig.classList.contains('is-lit')) disintegrate(sig);
  });
})();

// ---- INVENTORY SUB-PANELS: a tile with [data-panel-open="<name>"] opens its
// sub-panel ([data-panel="<name>"]) IN PLACE of the inventory grid instead of
// redirecting (Support → Telegram/Donation; Dynamics → Heroes/Items). The back
// arrow (or Escape) returns to the grid. Generic over any number of panels. ----
(function () {
  const book = document.querySelector('.inv-book');
  if (!book) return;
  const openers = [...book.querySelectorAll('[data-panel-open]')];
  const panels = [...book.querySelectorAll('[data-panel]')];
  if (!openers.length || !panels.length) return;
  const names = panels.map(p => p.dataset.panel);
  let lastOpener = null;
  const setOpen = (name) => {
    names.forEach(n => book.classList.toggle(n + '-open', n === name));
    panels.forEach(p => p.setAttribute('aria-hidden', p.dataset.panel === name ? 'false' : 'true'));
    openers.forEach(o => o.setAttribute('aria-expanded', o.dataset.panelOpen === name ? 'true' : 'false'));
    if (name) {
      const back = book.querySelector('.support-back');
      if (back) back.focus();
    } else if (lastOpener) {
      lastOpener.focus();
    }
  };
  openers.forEach(o => o.addEventListener('click', (e) => {
    e.preventDefault();
    lastOpener = o;
    setOpen(o.dataset.panelOpen);
  }));
  book.querySelectorAll('[data-panel-close]').forEach(
    (b) => b.addEventListener('click', () => setOpen(null)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && names.some(n => book.classList.contains(n + '-open'))) {
      setOpen(null);
    }
  });
})();

// ---- CALENDAR tile: hover burns the date page (gold pixel fire) and loops 1→31.
// JS src-swap (not CSS content:url) with a one-time cache-bust, because the
// calendar GIF filename predates the other tile GIFs and browsers/CDN cached the
// old number-cycle version — the `?v=` forces the new burning GIF to load.
(function () {
  const tile = document.querySelector('.inv-cell-calendar');
  if (!tile) return;
  const img = tile.querySelector('.inv-icon');
  if (!img) return;
  const PNG = img.getAttribute('src');
  const GIF = 'icons/ui/gothic/icon_calendar.gif?v=' + Date.now();
  tile.addEventListener('mouseenter', () => { img.src = GIF; });
  tile.addEventListener('mouseleave', () => { img.src = PNG; });
})();

// ---- ITEMS tile: hover plays a one-shot chest-OPEN intro (key flies in → lid
// opens → gold beam + treasure), then LOOPS the open chest with the beam + gold
// glints twinkling for as long as it's hovered. Two APNGs swapped via JS (a
// single animation can't play an intro once then loop only its tail — same
// pattern as the mana fill+wave). The ?v= cache-bust forces each to restart
// from frame 0. Reverts to the closed PNG on mouse-out. Skipped under
// prefers-reduced-motion (stays closed). INTRO_MS must match the generator's
// printed intro duration (scripts/gen_chest_icon.py).
(function () {
  const tile = document.querySelector('.inv-cell-items');
  if (!tile) return;
  const img = tile.querySelector('.inv-icon');
  if (!img) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const PNG = img.getAttribute('src');
  const OPEN = 'icons/ui/gothic/icon_chest_open.png';   // intro, plays once
  const LOOP = 'icons/ui/gothic/icon_chest_loop.png';   // open + glints, loops
  const INTRO_MS = 1044;
  // Preload + decode both APNGs so swapping src mid-hover is instant — without
  // this the browser fetches the loop on first swap and the beam visibly stalls.
  [OPEN, LOOP].forEach(s => { const p = new Image(); p.src = s; });
  let timer = null;
  tile.addEventListener('mouseenter', () => {
    clearTimeout(timer);
    img.src = ''; img.src = OPEN;
    timer = setTimeout(() => { img.src = ''; img.src = LOOP; }, INTRO_MS);
  });
  tile.addEventListener('mouseleave', () => {
    clearTimeout(timer);
    img.src = PNG;
  });
})();

// ---- MANA ITEMS tile: hover plays a one-shot FILL (empty→half), then loops the
// wave at that level. Two GIFs swapped via JS — a single GIF can't play an intro
// once and then loop only its tail. Reverts to the static bottle on mouse-out.
(function () {
  // The mana icon now lives on the "Mana" button inside the Items sub-panel
  // (it used to be a top-level tile). querySelectorAll keeps this robust no
  // matter where `.inv-cell-mana` sits.
  const FILL = 'icons/ui/gothic/icon_mana_fill.gif';
  const WAVE = 'icons/ui/gothic/icon_mana.gif';
  const FILL_MS = 11 * 150;            // fill GIF: 11 frames × 150ms
  document.querySelectorAll('.inv-cell-mana').forEach((tile) => {
    const img = tile.querySelector('.inv-icon');
    if (!img) return;
    const PNG = img.getAttribute('src');
    let timer = null;
    tile.addEventListener('mouseenter', () => {
      clearTimeout(timer);
      img.src = FILL + '?' + Date.now();  // cache-bust forces the fill to replay
      timer = setTimeout(() => { img.src = WAVE; }, FILL_MS);
    });
    tile.addEventListener('mouseleave', () => {
      clearTimeout(timer);
      img.src = PNG;
    });
  });
})();

// ---- Ko-Fi gold stack: hover plays the sparkle APNG, reverts on mouse-out.
//      Skipped under prefers-reduced-motion.
(function () {
  const btn = document.querySelector('.support-kofi');
  if (!btn) return;
  const img = btn.querySelector('.inv-icon');
  if (!img) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const PNG      = img.getAttribute('src');
  const SPARKLE  = 'icons/ui/gothic/gold_stack_sparkle.png';
  btn.addEventListener('mouseenter', () => { img.src = SPARKLE + '?' + Date.now(); });
  btn.addEventListener('mouseleave', () => { img.src = PNG; });
})();


/* ---- Formula calculator (formula_change) ----
   Each `.formula-change[data-fx-old]` has a number input; on change we re-evaluate
   both formulas for every example row (the `fixed` variable = the input value,
   the `vary` variable = the row's data-h) and refresh the gold cell + Δ% badge.
   Patch pages only; mirrors b()/gradient_class colouring. */
(function () {
  const blocks = document.querySelectorAll('.formula-change[data-fx-old]');
  if (!blocks.length) return;
  const fmt = (x) => (Math.round(x * 10) / 10).toString();
  function gradClass(mag, isBuff) {
    const p = isBuff ? 'buff' : 'nerf';
    if (mag <= 5) return p + '1';
    if (mag <= 10) return p + '2';
    if (mag <= 15) return p + '3';
    if (mag <= 20) return p + '4';
    if (mag <= 25) return p + '5';
    if (mag <= 33) return p + '6';
    if (mag <= 45) return p + '7';
    if (mag <= 60) return p + '8';
    if (mag <= 80) return p + '9';
    return p + '10';
  }
  function pctBadge(o, n, lower) {
    let inner;
    if (o === 0 || n === o) {
      inner = '<span class="badge neutral">0%</span>';
    } else {
      const raw = (n - o) / o * 100;
      const isBuff = lower ? (n < o) : (n > o);
      const disp = (n > o ? '+' : '-') + fmt(Math.abs(raw)) + '%';
      inner = '<span class="badge ' + gradClass(Math.abs(raw), isBuff) + '">' + disp + '</span>';
    }
    return '<span class="badge-group">' + inner + '</span>';   // plain text, no pill box
  }
  blocks.forEach((block) => {
    const input = block.querySelector('.formula-input');
    if (!input) return;
    const invar = block.dataset.fxInvar;
    const varyvar = block.dataset.fxVaryvar;
    const def = parseFloat(block.dataset.fxDefault);
    const lower = block.dataset.fxLower === '1';
    let fOld, fNew;
    // `^` = exponentiation (Valve writes x^2), not JS bitwise xor.
    const toJs = (e) => e.replace(/\^/g, '**');
    try {
      // Formulas are author-authored (data attributes we emit), so Function() is safe here.
      fOld = new Function(invar, varyvar, 'return (' + toJs(block.dataset.fxOld) + ');');
      fNew = new Function(invar, varyvar, 'return (' + toJs(block.dataset.fxNew) + ');');
    } catch (e) { return; }
    const rows = [...block.querySelectorAll('tr[data-h]')];
    function recalc() {
      let nv = parseFloat(input.value);
      if (!isFinite(nv)) nv = def;
      rows.forEach((tr) => {
        const h = parseFloat(tr.dataset.h);
        let o, n;
        try { o = fOld(nv, h); n = fNew(nv, h); } catch (e) { return; }
        const isOld = tr.closest('.formula-pane-old');
        const gold = tr.querySelector('.fx-gold');
        if (gold) gold.textContent = fmt(isOld ? o : n);
        const pc = tr.querySelector('.fx-pct');
        if (pc && !isOld) pc.innerHTML = pctBadge(o, n, lower);   // Δ% only in NEW pane
      });
    }
    input.addEventListener('input', recalc);
  });
})();

(function() {
  // ---- TERRAIN COMPARE (terrain.html) — swipe slider + Loupe magnifier ----
  //  - Divider moves ONLY by dragging the handle (or arrow keys).
  //  - Trees / Camps top-bar checkboxes toggle the SVG overlay layers.
  //  - "Loupe" is a MODE (top-bar button). When on, hovering the MAP (not the
  //    handle or top-bar) shows a gold magnifier following the cursor; click
  //    pins it, then sweeping the handle compares that spot old↔new inside the
  //    circle (the toggled tree/camp markers are cloned into the lens too).
  function initTerrainCompare() {
    // One slider per map pair (e.g. 7.41 and 7.40 panes both exist; hidden ones
    // are still wired so switching the picker shows a working slider).
    document.querySelectorAll('.terrain-compare').forEach(initOneTerrainCompare);
  }
  function initOneTerrainCompare(root) {
    if (!root) return;
    const stage = root.querySelector('.tc-stage');
    const handle = root.querySelector('.tc-handle');
    if (!stage || !handle) return;

    const ZOOM = parseFloat(root.dataset.zoom) || 1.9;
    const lens = root.querySelector('.tc-lens');
    const lensOld = root.querySelector('.tc-lens-old');
    const lensNew = root.querySelector('.tc-lens-new');
    const lensRim = root.querySelector('.tc-lens-rim');
    const markerSvgs = stage.querySelectorAll('.tc-markers');
    const lensOk = !!(lens && lensOld && lensNew);
    const LENS_PX = parseFloat(root.dataset.lens) || 184;
    if (root.dataset.lens) stage.style.setProperty('--lens', root.dataset.lens + 'px');

    let pos = parseFloat(root.dataset.pos);
    if (!isFinite(pos)) pos = 50;

    function apply(p) {
      pos = Math.max(0, Math.min(100, p));
      stage.style.setProperty('--pos', pos + '%');
      handle.setAttribute('aria-valuenow', Math.round(pos));
    }
    apply(pos);

    // ---- divider drag: HANDLE ONLY (pointer capture isolates it) ----
    let dragging = false;
    let dragRect = null;      // stage rect cached at pointerdown — avoids
    let dragHalfW = 22;       // getBoundingClientRect() on every pointermove
    let sliderRaf = null;
    let pendingX = 0;

    function posFromX(clientX) {
      const r = dragRect || stage.getBoundingClientRect();
      if (r.width <= 0) return pos;
      return ((clientX - r.left) / r.width) * 100;
    }
    // During drag, position the handle via transform (compositor) so the
    // browser never triggers layout for the handle's left property.
    handle.addEventListener('pointerdown', function(e) {
      dragging = true;
      dragRect = stage.getBoundingClientRect();
      stage.classList.add('is-dragging');
      if (e.pointerId != null && handle.setPointerCapture) {
        try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      }
      e.preventDefault();
      e.stopPropagation();
    });
    handle.addEventListener('pointermove', function(e) {
      if (!dragging) return;
      pendingX = e.clientX;
      if (sliderRaf !== null) return;
      sliderRaf = requestAnimationFrame(function() {
        sliderRaf = null;
        apply(posFromX(pendingX));
      });
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      dragRect = null;
      stage.classList.remove('is-dragging');
    }
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
    handle.addEventListener('keydown', function(e) {
      let step = 0;
      switch (e.key) {
        case 'ArrowLeft': case 'ArrowDown': step = -2; break;
        case 'ArrowRight': case 'ArrowUp': step = 2; break;
        case 'PageDown': step = -10; break;
        case 'PageUp': step = 10; break;
        case 'Home': apply(0); e.preventDefault(); return;
        case 'End': apply(100); e.preventDefault(); return;
        default: return;
      }
      apply(pos + step);
      e.preventDefault();
    });

    // ---- magnifier lens (Zoom mode) ----
    let loupeMode = false;
    let pinned = false;
    let lensMarkers = [];          // cloned marker SVGs (trees-old/new, camps)
    let lensR = LENS_PX / 2;       // lens radius — derived from data-lens attr,
                                   // never read from DOM to avoid layout reflow
    let rafId = null;              // RAF handle for move throttling
    let pendingCx = 0, pendingCy = 0;
    function buildLensMarkers() {
      if (!lensOk || lensMarkers.length || !markerSvgs.length) return;
      markerSvgs.forEach(function(svg) {
        const clone = svg.cloneNode(true);   // keeps its clip + toggle classes
        clone.classList.add('tc-lens-markers');
        clone.removeAttribute('aria-hidden');
        lens.insertBefore(clone, lensRim || null);
        lensMarkers.push(clone);
      });
    }
    function sizeLens() {
      if (!lensOk) return;
      const w = stage.getBoundingClientRect().width * ZOOM;
      [lensOld, lensNew].concat(lensMarkers).forEach(function(el) {
        if (el) { el.style.width = w + 'px'; el.style.height = w + 'px'; }
      });
      // lensR is fixed (derived from data-lens); no DOM read needed here.
    }
    function placeLens(cx, cy) {
      if (!lensOk) return;
      lens.style.transform = 'translate(' + (cx - lensR) + 'px,' + (cy - lensR) + 'px)';
      const tf = 'translate(' + (lensR - cx * ZOOM) + 'px,' + (lensR - cy * ZOOM) + 'px)';
      lensOld.style.transform = tf;
      lensNew.style.transform = tf;
      lensMarkers.forEach(function(el) { el.style.transform = tf; });
    }
    // RAF-throttled wrapper: coalesces rapid pointermove events to one
    // placeLens call per animation frame, preventing layout thrashing.
    function schedulePlaceLens(cx, cy) {
      pendingCx = cx; pendingCy = cy;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(function() {
        rafId = null;
        placeLens(pendingCx, pendingCy);
      });
    }
    function localXY(e) {
      const r = stage.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }
    // Over the handle → no lens (so you can grab it with a normal cursor). The
    // layer toggles now live ABOVE the stage, so they never overlap the map.
    function overControls(e) {
      return !!(e.target.closest && e.target.closest('.tc-handle'));
    }
    function hideLens() { if (lensOk) lens.classList.remove('visible'); }

    if (lensOk) {
      stage.addEventListener('pointermove', function(e) {
        if (!loupeMode || pinned || dragging || e.pointerType === 'touch') return;
        if (overControls(e)) { hideLens(); return; }
        const xy = localXY(e);
        lens.classList.add('visible');
        schedulePlaceLens(xy[0], xy[1]);
      });
      stage.addEventListener('pointerleave', function() { if (!pinned) hideLens(); });
      stage.addEventListener('click', function(e) {
        if (!loupeMode || dragging || overControls(e)) return;
        const xy = localXY(e);
        pinned = !pinned;
        stage.classList.toggle('lens-pinned', pinned);
        lens.classList.add('visible');
        placeLens(xy[0], xy[1]);
      });
      window.addEventListener('resize', sizeLens);
    }

    // ---- top-bar toggle buttons (aria-pressed) ----
    function pressed(btn) { return btn.getAttribute('aria-pressed') === 'true'; }
    function setPressed(btn, on) { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); }

    // Zoom (magnifier mode)
    const zoomBtn = root.querySelector('.tc-btn-zoom');
    if (zoomBtn && lensOk) {
      zoomBtn.addEventListener('click', function() {
        loupeMode = !loupeMode;
        root.classList.toggle('loupe-on', loupeMode);
        setPressed(zoomBtn, loupeMode);
        if (loupeMode) {
          buildLensMarkers();
          sizeLens();
        } else {
          pinned = false;
          stage.classList.remove('lens-pinned');
          hideLens();
        }
      });
    }

    // ---- POWER RUNE cycling: a power-rune spot can roll any of the 7 runes, so
    // while the Power layer is ON its map markers cycle through tc_rune_0..6
    // every 3s. The toolbar button shows a random rune on load. ----
    const RUNE_BASE = 'icons/ui/gothic/tc_rune_';
    const RUNE_COUNT = 7;
    let powerTimer = null, powerIdx = 0;
    function setRune(i) {
      const src = RUNE_BASE + i + '.png';
      root.querySelectorAll('.tm-layer-power image').forEach(function(im) {
        im.setAttribute('href', src);
        im.setAttribute('xlink:href', src);   // older SVG href
      });
    }
    function togglePowerCycle(on) {
      if (powerTimer) { clearInterval(powerTimer); powerTimer = null; }
      if (!on) return;
      setRune(powerIdx);
      powerTimer = setInterval(function() {
        powerIdx = (powerIdx + 1) % RUNE_COUNT;
        setRune(powerIdx);
      }, 3000);
    }
    const powerBtnImg = root.querySelector('.tc-layer-btn[data-layer="power"] img');
    if (powerBtnImg) powerBtnImg.src = RUNE_BASE + Math.floor(Math.random() * RUNE_COUNT) + '.png';

    // Layer toggles — both in .tc-controls-bar and .tc-fs-bar; keep in sync.
    root.querySelectorAll('.tc-layer-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const on = !pressed(btn);
        root.querySelectorAll('.tc-layer-btn[data-layer="' + btn.dataset.layer + '"]')
          .forEach(function(b) { setPressed(b, on); });
        root.classList.toggle('show-' + btn.dataset.layer, on);
        if (btn.dataset.layer === 'power') togglePowerCycle(on);
      });
    });

    // ---- Fullscreen: pan (right-drag) + zoom (wheel) ----
    // Zoom changes stage CSS width (aspect-ratio 1:1 sets height) so the
    // browser rasterises at full res — no blurry GPU scale().
    // Pan uses absolute left/top on the stage.
    var fsBtn = root.querySelector('.tc-btn-fs');
    var fsExitBtn = root.querySelector('.tc-btn-fs-exit');
    var fsCanvas = root.querySelector('.tc-fs-canvas');
    var pane = root.closest('.terrain-map-pane');
    var fsActive = false;
    var fsPanning = false, fsPanStartX = 0, fsPanStartY = 0;
    var fsPanBaseL = 0, fsPanBaseT = 0;
    var fsBaseW = 0;
    var fsRaf = null;

    function fsGetL() { return parseFloat(stage.style.left) || 0; }
    function fsGetT() { return parseFloat(stage.style.top)  || 0; }

    function fsEnter() {
      if (!pane) return;
      var req = pane.requestFullscreen || pane.webkitRequestFullscreen;
      if (req) req.call(pane);
    }
    function fsExit() {
      var ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) ex.call(document);
    }
    function onFullscreenChange() {
      var el = document.fullscreenElement || document.webkitFullscreenElement;
      if (el === pane) {
        if (loupeMode && zoomBtn) {
          loupeMode = false;
          root.classList.remove('loupe-on');
          setPressed(zoomBtn, false);
          pinned = false;
          stage.classList.remove('lens-pinned');
          hideLens();
        }
        pane.classList.add('tc-fs-active');
        fsActive = true;
        stage.style.transform = '';
        setTimeout(function() {
          var cr = fsCanvas.getBoundingClientRect();
          fsBaseW = cr.width;
          stage.style.width = fsBaseW + 'px';
          stage.style.left = '0px';
          stage.style.top = ((cr.height - fsBaseW) / 2) + 'px';
        }, 60);
      } else if (fsActive) {
        pane.classList.remove('tc-fs-active');
        stage.style.width = '';
        stage.style.left = '';
        stage.style.top = '';
        stage.style.transform = '';
        fsActive = false;
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    if (fsBtn) fsBtn.addEventListener('click', fsEnter);
    if (fsExitBtn) fsExitBtn.addEventListener('click', fsExit);

    if (fsCanvas) {
      fsCanvas.addEventListener('contextmenu', function(e) {
        if (fsActive) e.preventDefault();
      });
      fsCanvas.addEventListener('mousedown', function(e) {
        if (e.button !== 2 || !fsActive) return;
        fsPanning = true;
        fsPanStartX = e.clientX; fsPanStartY = e.clientY;
        fsPanBaseL = fsGetL(); fsPanBaseT = fsGetT();
        fsCanvas.classList.add('is-panning');
        e.preventDefault();
      });
      window.addEventListener('mousemove', function(e) {
        if (!fsPanning) return;
        var nl = fsPanBaseL + (e.clientX - fsPanStartX);
        var nt = fsPanBaseT + (e.clientY - fsPanStartY);
        if (fsRaf) return;
        fsRaf = requestAnimationFrame(function() {
          fsRaf = null;
          stage.style.left = nl + 'px';
          stage.style.top  = nt + 'px';
        });
      });
      window.addEventListener('mouseup', function(e) {
        if (e.button === 2 && fsPanning) {
          fsPanning = false;
          fsCanvas.classList.remove('is-panning');
        }
      });
      fsCanvas.addEventListener('wheel', function(e) {
        if (!fsActive) return;
        e.preventDefault();
        var curW = parseFloat(stage.style.width) || fsBaseW;
        var factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        var newW = Math.max(fsBaseW * 0.5, Math.min(fsBaseW * 8, curW * factor));
        var ratio = newW / curW;
        var cr = fsCanvas.getBoundingClientRect();
        var mx = e.clientX - cr.left;
        var my = e.clientY - cr.top;
        var oldL = fsGetL(), oldT = fsGetT();
        stage.style.width = newW + 'px';
        stage.style.left = (mx - ratio * (mx - oldL)) + 'px';
        stage.style.top  = (my - ratio * (my - oldT)) + 'px';
      }, { passive: false });
    }
  }

  function initSubpatchPicker() {
    document.querySelectorAll('.terrain-list-pane').forEach(function(pane) {
      var ul = pane.querySelector('.terrain-list');
      if (!ul) return;
      var items = [].slice.call(ul.children);
      var topHead = pane.querySelector('.terrain-subpatch-top');
      if (!topHead) return;
      var topVer = topHead.textContent.trim();
      var groups = [];
      var cur = { ver: topVer, items: [] };
      items.forEach(function(li) {
        if (li.classList.contains('terrain-subpatch-head') && !li.classList.contains('terrain-subpatch-top')) {
          groups.push(cur);
          cur = { ver: li.textContent.trim(), items: [] };
          li.classList.add('tsp-hidden');
        } else if (!li.classList.contains('terrain-subpatch-top')) {
          cur.items.push(li);
        }
      });
      groups.push(cur);
      var idx = 0;
      var nav = document.createElement('div');
      nav.className = 'terrain-subpatch-nav';
      var btnL = document.createElement('button');
      btnL.className = 'tsp-arrow tsp-arrow-left';
      btnL.setAttribute('aria-label', 'Newer subpatch');
      var label = document.createElement('span');
      label.className = 'tsp-label';
      label.textContent = topVer;
      var btnR = document.createElement('button');
      btnR.className = 'tsp-arrow tsp-arrow-right';
      btnR.setAttribute('aria-label', 'Older subpatch');
      nav.appendChild(btnL);
      nav.appendChild(label);
      nav.appendChild(btnR);
      topHead.replaceWith(nav);
      function show(i) {
        idx = i;
        groups.forEach(function(g, gi) {
          var vis = (gi === i);
          g.items.forEach(function(li) {
            if (vis) li.classList.remove('tsp-hidden');
            else li.classList.add('tsp-hidden');
          });
        });
        label.textContent = groups[i].ver;
        btnL.disabled = (i === 0);
        btnR.disabled = (i === groups.length - 1);
      }
      show(0);
      btnL.addEventListener('click', function() { if (idx > 0) show(idx - 1); });
      btnR.addEventListener('click', function() { if (idx < groups.length - 1) show(idx + 1); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initTerrainCompare();
      initSubpatchPicker();
    });
  } else {
    initTerrainCompare();
    initSubpatchPicker();
  }
})();

// ---------------------------------------------------------------------
// Info-tip (i) popup positioning — keep the bubble inside the viewport.
// CSS centers it above the (i); this nudges it horizontally so it never
// runs off-screen, and flips it below when there isn't room above.
// Event-delegated so it covers every (i) without per-element listeners.
// ---------------------------------------------------------------------
(function () {
  var MARGIN = 8;
  function place(tip) {
    var pop = tip.querySelector('.info-pop');
    if (!pop) return;
    // Reset so we measure the natural size, then position explicitly.
    pop.style.left = '0';
    pop.style.right = 'auto';
    pop.style.transform = 'none';
    var tr = tip.getBoundingClientRect();
    var pw = pop.offsetWidth;
    var ph = pop.offsetHeight;
    var vw = document.documentElement.clientWidth;
    // Horizontal: center over the (i), then clamp into the viewport.
    var vpLeft = tr.left + tr.width / 2 - pw / 2;
    vpLeft = Math.max(MARGIN, Math.min(vpLeft, vw - pw - MARGIN));
    pop.style.left = (vpLeft - tr.left) + 'px';
    // Vertical: prefer above; flip below if it would clip the top.
    if (tr.top - ph - 10 < MARGIN) {
      pop.style.top = 'calc(100% + 8px)';
      pop.style.bottom = 'auto';
    } else {
      pop.style.bottom = 'calc(100% + 8px)';
      pop.style.top = 'auto';
    }
  }
  function handler(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var tip = t.closest('.info-tip');
    if (tip) place(tip);
  }
  document.addEventListener('mouseover', handler, true);
  document.addEventListener('focusin', handler, true);
})();

// ---- WHAT'S NEW badge (index.html) ----
(function() {
  const btn = document.querySelector('.version-beta-wrap');
  const popup = document.querySelector('.whatsnew-popup');
  if (!btn || !popup) return;
  const sig = popup.dataset.wnSig || 'v1';
  const LS_KEY = 'wn_seen_' + sig;
  if (localStorage.getItem(LS_KEY)) btn.classList.add('wn-seen');

  function place() {
    // measure with display:block to get real dimensions
    const wasHidden = !popup.classList.contains('wn-open');
    if (wasHidden) { popup.style.visibility = 'hidden'; popup.style.display = 'block'; }
    const pr = popup.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    if (wasHidden) { popup.style.display = ''; popup.style.visibility = ''; }
    const gap = 10, vw = window.innerWidth, vh = window.innerHeight;
    let top = br.top - pr.height - gap;
    if (top < gap) top = br.bottom + gap;
    top = Math.max(gap, Math.min(top, vh - pr.height - gap));
    let left = br.right - pr.width;
    left = Math.max(gap, Math.min(left, vw - pr.width - gap));
    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
  }

  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (popup.classList.contains('wn-open')) {
      popup.classList.remove('wn-open');
    } else {
      place();
      popup.classList.add('wn-open');
      if (!btn.classList.contains('wn-seen')) {
        btn.classList.add('wn-seen');
        try { localStorage.setItem(LS_KEY, '1'); } catch(_) {}
      }
    }
  });
  document.addEventListener('click', function(e) {
    if (!popup.contains(e.target) && e.target !== btn)
      popup.classList.remove('wn-open');
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') popup.classList.remove('wn-open');
  });
  window.addEventListener('resize', function() {
    if (popup.classList.contains('wn-open')) place();
  });
})();

// ---- AOE INCREASE (aoe_increase.html): item + upgrade filter recompute ----
// Each .aoe-line carries data-base / data-talent / data-scepter / data-shard
// (per-level radius + upgrade deltas). Upgrade toggles add their deltas (and
// reveal gated radii whose base is 0); an AoE item then scales the result:
//   radius  = base + (talent? + scepter? + shard?)         [if its toggle is on]
//   shown   = (radius + flat) * (1 + pct/100)               [if an item is on]
// e.g. base 400 + Chasm Stone (+40) + Dezun (+20%) = (440)*1.2 = 528.
(function () {
  const table = document.querySelector('.aoe-table');
  if (!table) return;
  const itemBtns = [...document.querySelectorAll('.aoe-item-btn')];
  const upBtns = [...document.querySelectorAll('.aoe-up-btn')];
  if (!itemBtns.length && !upBtns.length) return;
  const rows = [...table.querySelectorAll('tbody tr')];

  const nums = s => { const t = (s || '').trim(); return t ? t.split(/\s+/).map(Number).filter(n => !isNaN(n)) : []; };
  // Per-value (not per-line) so a line can hold two radii (AA Ice Blast min/max).
  const vals = [...table.querySelectorAll('.aoe-val')].map(el => ({
    el,
    line: el.closest('.aoe-line'),
    base: nums(el.dataset.base),
    talent: nums(el.dataset.talent),
    scepter: nums(el.dataset.scepter),
    shard: nums(el.dataset.shard),
    talentGlobal: nums(el.dataset.talentGlobal),
    // Absolute overrides ("=800") — when the upgrade is on, REPLACE base.
    talentSet: nums(el.dataset.talentSet),
    scepterSet: nums(el.dataset.scepterSet),
    shardSet: nums(el.dataset.shardSet),
  }));
  const linesSet = [...table.querySelectorAll('.aoe-line')].map(line => ({
    line,
    vals: [...line.querySelectorAll('.aoe-val')],
  }));
  const abilities = [...table.querySelectorAll('.aoe-ability')].map(ab => ({
    ab,
    cell: ab.closest('td.aoe-cell'),
    dash: ab.closest('td.aoe-cell')?.querySelector('.aoe-cell-dash') || null,
    lines: [...ab.querySelectorAll('.aoe-line')],
    marks: {
      talent: ab.querySelector('.aoe-mark-talent'),
      scepter: ab.querySelector('.aoe-mark-scepter'),
      shard: ab.querySelector('.aoe-mark-shard'),
    },
  }));

  let flat = 0, pct = 0;
  const up = { talent: false, scepter: false, shard: false };

  // base[] + delta[] elementwise (delta broadcasts a single value over levels).
  function add(arr, delta) {
    if (!delta.length) return arr;
    if (delta.length === 1) return arr.map(b => b + delta[0]);
    const n = Math.max(arr.length, delta.length);
    const out = [];
    for (let i = 0; i < n; i++) out.push((arr[i] ?? arr[arr.length - 1]) + (delta[i] ?? delta[delta.length - 1]));
    return out;
  }
  function fmt(levels) {
    let r = levels.map(n => Math.round(n));
    // Strip leading zeros (e.g. DK Dragon Form splash 0/275/275/350 → 275/275/350).
    const first = r.findIndex(n => n !== 0);
    if (first > 0) r = r.slice(first);
    return r.every(n => n === r[0]) ? String(r[0]) : r.join('/');
  }

  function markVisibleEdgeRows() {
    rows.forEach(tr => {
      tr.classList.remove('aoe-visible-first', 'aoe-visible-last');
    });
    const visible = rows.filter(tr => !tr.classList.contains('mr-search-out'));
    if (!visible.length) return;
    visible[0].classList.add('aoe-visible-first');
    visible[visible.length - 1].classList.add('aoe-visible-last');
  }

  function recompute(opts = {}) {
    vals.forEach(V => {
      if (!V.base.length) return;
      // An upgrade with an absolute override ("=N") REPLACES the radius;
      // otherwise its delta is added. Talent / Scepter / Shard apply in turn.
      let radius = V.base;
      if (up.talent)  radius = V.talentSet.length  ? V.talentSet  : add(radius, V.talent);
      if (up.scepter) radius = V.scepterSet.length ? V.scepterSet : add(radius, V.scepter);
      if (up.shard)   radius = V.shardSet.length   ? V.shardSet   : add(radius, V.shard);
      const visible = Math.max(...radius) > 0;
      // Generic +AoE talents (special_bonus_spell_aoe_N) affect every real
      // AoE radius, but they must not reveal zero-base upgrade-only modes.
      if (visible && up.talent && V.talentGlobal.length) radius = add(radius, V.talentGlobal);
      V.el.hidden = !visible;
      if (!visible) return;
      const shown = (flat || pct) ? radius.map(r => (r + flat) * (1 + pct / 100)) : radius;
      V.el.textContent = fmt(shown);
      // Gold means a visible value changed. A zero-base line revealed by a
      // Talent/Scepter/Shard is a newly enabled AoE mode, not a changed value.
      const baseVisible = Math.max(...V.base) > 0;
      const upgradedUp = baseVisible && (
        (up.talent  && (V.talent.some(n => n)  || V.talentSet.length || V.talentGlobal.length))  ||
        (up.scepter && (V.scepter.some(n => n) || V.scepterSet.length)) ||
        (up.shard   && (V.shard.some(n => n)   || V.shardSet.length))
      );
      V.el.classList.toggle('aoe-val-up', !!(flat || pct || upgradedUp));
    });
    // Hide a line whose every value is hidden, then an ability with no visible
    // line; surface the active-upgrade mini-markers the ability carries.
    linesSet.forEach(L => {
      const anyVal = L.vals.some(v => !v.hidden);
      L.line.hidden = !anyVal;
    });
    abilities.forEach(A => {
      const ab = A.ab;
      const cell = A.cell;
      const dash = A.dash;
      const granted = ab.dataset.grantedBy;
      const grantedHidden = granted && !up[granted];
      const anyVisible = !grantedHidden && A.lines.some(l => !l.hidden);
      if (cell && !opts.measure) cell.classList.toggle('aoe-cell-placeholder', !anyVisible);
      if (dash) dash.hidden = anyVisible;
      ['talent', 'scepter', 'shard'].forEach(t => {
        const mark = A.marks[t];
        if (mark) mark.hidden = !(up[t] && ab.dataset['has' + t[0].toUpperCase() + t.slice(1)] === '1' && anyVisible);
      });
    });
    // Hero rows are always visible — empty/filter-hidden slots show dashes.

    // After show/hide, force Chrome to repaint sticky cell borders at new position.
    // translateZ(0) promotes the cell to a GPU compositing layer for one frame,
    // then the rAF clears it — this is cheaper than explicit height sync and avoids
    // the height-mismatch bug it caused.
    if (!opts.measure) requestAnimationFrame(() => {
      table.querySelectorAll('td.aoe-name').forEach(td => {
        td.style.transform = 'translateZ(0)';
      });
      requestAnimationFrame(() => {
        table.querySelectorAll('td.aoe-name').forEach(td => {
          td.style.transform = '';
        });
      });
    });
    if (!opts.measure) markVisibleEdgeRows();
  }

  itemBtns.forEach(btn => btn.addEventListener('click', () => {
    const kind = btn.dataset.aoeKind;
    const amount = Number(btn.dataset.aoeAmount) || 0;
    const on = btn.getAttribute('aria-pressed') === 'true';
    if (kind === 'flat') {
      itemBtns.filter(b => b.dataset.aoeKind === 'flat')
        .forEach(b => b.setAttribute('aria-pressed', 'false'));
      flat = on ? 0 : amount;
      if (!on) btn.setAttribute('aria-pressed', 'true');
    } else {
      pct = on ? 0 : amount;
      btn.setAttribute('aria-pressed', on ? 'false' : 'true');
    }
    recompute();
  }));

  upBtns.forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.aoeUpgrade;
    const on = btn.getAttribute('aria-pressed') === 'true';
    up[key] = !on;
    btn.setAttribute('aria-pressed', on ? 'false' : 'true');
    recompute();
  }));

  recompute();   // initial render: upgrades OFF by default
  window.addEventListener('mr:filter-changed', markVisibleEdgeRows);
  // Freeze column widths after first render so ability cells appearing/disappearing
  // (shard/scepter/talent toggle) cannot cause horizontal layout shift.
  requestAnimationFrame(() => {
    let total = 0;
    table.querySelectorAll('thead th').forEach(th => {
      const w = th.offsetWidth;
      total += w;
      th.style.width = w + 'px';
      th.style.minWidth = w + 'px';
      th.style.maxWidth = w + 'px';
    });
    table.style.width = total + 'px';
    table.style.tableLayout = 'fixed';
  });

  // Pin the filter toolbar at the top of the scroll box and drop the table
  // header just below it (exception to the usual "toolbar scrolls away" rule).
  const toolbar = document.querySelector('.aoe-toolbar');
  if (toolbar) {
    const heads = [...table.querySelectorAll('thead th')];
    const offsetHead = () => {
      const h = Math.round(toolbar.getBoundingClientRect().height);
      heads.forEach(th => { th.style.top = h + 'px'; });
    };
    offsetHead();
    window.addEventListener('resize', offsetHead, { passive: true });
  }
})();
