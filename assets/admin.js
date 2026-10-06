(function () {
  'use strict';

  const form = document.getElementById('lesson-form');
  const fileInput = document.getElementById('lesson-file');
  const titleInput = document.getElementById('lesson-title');
  const status = document.getElementById('prepare-status');
  const output = document.getElementById('prepared-output');
  const prepareButton = document.getElementById('prepare-button');
  const downloadButton = document.getElementById('download-button');
  const uploadLink = document.getElementById('upload-link');
  const pathLabel = document.getElementById('prepared-path');
  const maxFileSize = 45 * 1024 * 1024;
  let prepared = null;
  let revision = 0;

  function setStatus(message, state) {
    status.textContent = message;
    status.dataset.state = state || 'success';
  }

  function clearPrepared() {
    revision += 1;
    if (prepared) URL.revokeObjectURL(prepared.url);
    prepared = null;
    output.hidden = true;
    pathLabel.textContent = '';
    uploadLink.removeAttribute('href');
    uploadLink.setAttribute('aria-disabled', 'true');
    uploadLink.setAttribute('tabindex', '-1');
    setStatus('');
  }

  function slugify(value) {
    return value
      .replace(/[ıİ]/g, 'i')
      .replace(/ş/gi, 's').replace(/ğ/gi, 'g')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 100).replace(/-+$/g, '');
  }

  function catalogEntries() {
    const catalog = window.LESSON_CATALOG || window.LESSONS || window.CATALOG || [];
    if (Array.isArray(catalog)) return catalog;
    if (Array.isArray(catalog.lessons)) return catalog.lessons;
    if (catalog.levels) return Object.values(catalog.levels).flatMap(function (level) {
      return Array.isArray(level) ? level : (level.lessons || []);
    });
    return Object.values(catalog).flatMap(function (level) {
      return Array.isArray(level) ? level : [];
    });
  }

  function duplicatePath(path) {
    const target = path.toLowerCase();
    return catalogEntries().some(function (lesson) {
      const raw = lesson.path || lesson.url || lesson.href || '';
      let normalized;
      try { normalized = decodeURIComponent(String(raw)); } catch (_) { normalized = String(raw); }
      normalized = normalized.split(/[?#]/)[0].replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
      return normalized === target || normalized.endsWith('/' + target);
    });
  }

  function readMetadata() {
    const numberText = form.elements.number.value.trim();
    const number = numberText ? Number(numberText) : null;
    return {
      title: titleInput.value.trim(),
      description: form.elements.description.value.trim(),
      number: number,
      order: number === null ? 9999 : number,
      date: form.elements.date.value,
      duration: form.elements.duration.value.trim(),
      tags: form.elements.tags.value.split(',').map(function (tag) { return tag.trim(); }).filter(Boolean).slice(0, 12)
    };
  }

  function addLessonInformation(source, metadata, level) {
    const json = JSON.stringify(metadata).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    const script = '<script id="lesson-meta" type="application/json">' + json + '</script>';
    const existingMetadata = /<script\b(?=[^>]*\bid\s*=\s*(?:"lesson-meta"|'lesson-meta'|lesson-meta(?=[\s>])))[^>]*>[\s\S]*?<\/script\s*>/gi;
    let result = source.replace(existingMetadata, '');
    const headOpen = /<head\b[^>]*>/i;
    if (headOpen.test(result)) {
      const head = result.match(/<head\b[^>]*>[\s\S]*?<\/head\s*>/i);
      const charsetPattern = /<meta\b(?=[^>]*\bcharset\s*=)[^>]*>/i;
      if (head && charsetPattern.test(head[0])) {
        result = result.replace(head[0], function (content) {
          return content.replace(charsetPattern, function (charset) { return charset + '\n' + script; });
        });
      } else {
        result = result.replace(headOpen, function (headTag) { return headTag + '\n<meta charset="utf-8">\n' + script; });
      }
    } else {
      result = result.replace(/<html\b[^>]*>/i, function (html) { return html + '\n<head>\n<meta charset="utf-8">\n' + script + '\n</head>'; });
    }
    const idLinkPattern = /<a\b(?=[^>]*\bid\s*=\s*(?:"lesson-panel-link"|'lesson-panel-link'|lesson-panel-link(?=[\s>])))[^>]*>/i;
    const classLinkPattern = /<a\b(?=[^>]*\bclass\s*=\s*(?:"[^"]*\blesson-panel-return\b[^"]*"|'[^']*\blesson-panel-return\b[^']*'))[^>]*>/i;
    const linkPattern = idLinkPattern.test(result) ? idLinkPattern : classLinkPattern;
    const href = '../../index.html#' + level;
    if (linkPattern.test(result)) {
      result = result.replace(linkPattern, function (link) {
        const withoutHref = link.replace(/\s+href\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, '');
        return withoutHref.replace(/>$/, ' href="' + href + '">');
      });
    } else {
      result = result.replace(script, function (metadataScript) {
        return metadataScript + '\n<style id="lesson-panel-link-style">@media print{#lesson-panel-link{display:none!important}}</style>';
      });
      const link = '\n<a id="lesson-panel-link" href="' + href + '" aria-label="Ders paneline dön" style="position:fixed;left:14px;bottom:calc(var(--bar,72px) + 16px);z-index:100;display:inline-flex;align-items:center;gap:6px;padding:10px 14px;border:1px solid #ccd6cc;border-radius:999px;background:#fffef7;color:#17645a;font:600 13px/1.4 system-ui,sans-serif;text-decoration:none;box-shadow:0 3px 16px #0001">← Ders paneli</a>\n';
      if (/<\/body\s*>/i.test(result)) result = result.replace(/<\/body\s*>/i, function (body) { return link + body; });
      else result = result.replace(/<\/html\s*>/i, function (html) { return link + html; });
    }
    return result;
  }

  form.addEventListener('input', clearPrepared);
  form.addEventListener('change', clearPrepared);
  const preferredLevel = new URLSearchParams(window.location.search).get('level');
  if (['A1', 'A2', 'B1'].includes(preferredLevel)) {
    form.querySelector('input[name="level"][value="' + preferredLevel + '"]').checked = true;
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearPrepared();
    if (!form.reportValidity()) return;
    const metadata = readMetadata();
    if (!metadata.title) {
      setStatus('Ders adını yazın.', 'error');
      titleInput.focus();
      return;
    }
    const oversizedTag = form.elements.tags.value.split(',').some(function (tag) { return tag.trim().length > 80; });
    if (oversizedTag) {
      setStatus('Her konu etiketi en fazla 80 karakter olabilir. Uzun etiketi kısaltıp tekrar deneyin.', 'error');
      form.elements.tags.focus();
      return;
    }
    const slug = slugify(metadata.title);
    if (!slug) {
      setStatus('Dosya adı oluşturabilmek için ders adında en az bir harf veya rakam kullanın.', 'error');
      return;
    }
    const file = fileInput.files[0];
    if (!file || !/\.html?$/i.test(file.name)) {
      setStatus('Bir .html veya .htm ders dosyası seçin.', 'error');
      return;
    }
    if (file.size > maxFileSize) {
      setStatus('Dosya 45 MB sınırını aşıyor. Daha küçük bir HTML dosyası seçin.', 'error');
      return;
    }
    if (file.size === 0) {
      setStatus('Seçilen dosya boş. Ders içeriği bulunan bir HTML dosyası seçin.', 'error');
      return;
    }
    const level = form.elements.level.value;
    const path = 'lessons/' + level.toLowerCase() + '/' + slug + '.html';
    if (duplicatePath(path)) {
      setStatus('Bu seviyede aynı dosya adına sahip bir ders var. Yeni ders için farklı bir ders adı kullanın.', 'error');
      return;
    }
    const currentRevision = revision;
    prepareButton.disabled = true;
    setStatus('Ders dosyası hazırlanıyor…');
    try {
      const source = await file.text();
      if (revision !== currentRevision) return;
      const body = source.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
      if (!/<html(?:\s|>)/i.test(source) || !body || !body[1].replace(/<!--[\s\S]*?-->/g, '').trim() || !/<\/html\s*>/i.test(source)) {
        setStatus('Dosya tam bir HTML belgesi içermiyor. Tam ders dosyasını seçin.', 'error');
        return;
      }
      const html = addLessonInformation(source, metadata, level);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      prepared = { url: URL.createObjectURL(blob), name: slug + '.html' };
      pathLabel.textContent = path;
      const config = window.SITE_CONFIG || {};
      if (config.owner && config.repo && config.branch) {
        uploadLink.href = 'https://github.com/' + encodeURIComponent(config.owner) + '/' + encodeURIComponent(config.repo) + '/upload/' + encodeURIComponent(config.branch) + '/lessons/' + level.toLowerCase();
        uploadLink.removeAttribute('aria-disabled');
        uploadLink.removeAttribute('tabindex');
      }
      output.hidden = false;
      setStatus('Dosya hazır. Önce indirin, ardından GitHub’a yükleyip “Commit changes” ile kaydedin.');
    } catch (error) {
      if (revision === currentRevision) setStatus('Dosya okunamadı. Dosyayı yeniden seçip tekrar deneyin.', 'error');
    } finally {
      prepareButton.disabled = false;
    }
  });

  downloadButton.addEventListener('click', function () {
    if (!prepared) return;
    const link = document.createElement('a');
    link.href = prepared.url;
    link.download = prepared.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  uploadLink.addEventListener('click', function (event) {
    if (!prepared || uploadLink.getAttribute('aria-disabled') === 'true') event.preventDefault();
  });

  window.addEventListener('beforeunload', function () {
    if (prepared) URL.revokeObjectURL(prepared.url);
  });
})();
