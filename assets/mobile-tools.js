(() => {
  'use strict';
  if (window.__englishMobileTools || typeof window.matchMedia !== 'function' || !document.body) return;
  const rail = document.querySelector('.top-actions');
  if (!rail) return;
  let media;
  try { media = window.matchMedia('(max-width:760px)'); } catch (_) { return; }
  if (!media || typeof media.matches !== 'boolean') return;
  window.__englishMobileTools = true;
  const origins = new Map();
  const selectors = ['.lesson-panel-return', '.ewl-launcher'];

  function place(parent, node, before) {
    if (node === before) return;
    // Modern browsers can move a connected control without losing its focus,
    // animation or popover state. Older browsers retain the same DOM node.
    if (typeof parent.moveBefore === 'function' && parent.isConnected && node.isConnected) parent.moveBefore(node, before);
    else parent.insertBefore(node, before);
  }
  function update() {
    if (media.matches) {
      const tools = selectors.map(selector => document.querySelector(selector)).filter(Boolean);
      for (const node of tools) {
        if (origins.has(node) || rail.contains(node) || !node.parentNode) continue;
        const marker = document.createComment('english-mobile-tool-origin');
        node.parentNode.insertBefore(marker, node);
        origins.set(node, marker);
      }
      let before = rail.firstChild;
      for (const node of tools) {
        if (!origins.has(node)) continue;
        place(rail, node, before);
        before = node.nextSibling;
      }
    } else {
      for (const [node, marker] of origins) {
        if (!marker.parentNode) continue;
        place(marker.parentNode, node, marker);
        marker.remove();
        origins.delete(node);
      }
    }
    document.body.classList.toggle('mobile-tools-docked', media.matches && origins.size > 0);
  }
  update();
  window.addEventListener('load', update, {once:true});
  if (typeof media.addEventListener === 'function') media.addEventListener('change', update);
  else if (typeof media.addListener === 'function') media.addListener(update);
})();
