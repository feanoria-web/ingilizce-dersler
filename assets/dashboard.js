(() => {
  'use strict';
  const access = window.EnglishAccess;
  if (!access || document.body.dataset.accessPage !== 'admin') return;
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const format = new Intl.NumberFormat('tr-TR');
  const number = value => Number.isFinite(Number(value)) && value !== null && value !== '' ? format.format(Number(value)) : '—';
  const datetime = value => {
    if (!value) return '—';
    const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('tr-TR', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(date);
  };
  const duration = value => {
    if (!Number.isFinite(Number(value)) || value == null) return '—';
    const seconds = Math.max(0, Math.floor(Number(value))); const minutes = Math.floor(seconds / 60);
    return minutes >= 60 ? `${Math.floor(minutes/60)} sa ${minutes%60} dk` : minutes ? `${minutes} dk` : `${seconds} sn`;
  };
  const eventNames = {login:'Giriş yaptı',logout:'Çıkış yaptı',site_enter:'Ders panelini açtı',page_view:'Sayfayı açtı',lesson_open:'Dersi açtı',lesson_view:'Dersi açtı',activity_open:'Etkinliği açtı',activity_view:'Etkinliği görüntüledi',activity_complete:'Etkinliği tamamladı',activity:'Etkinlikle çalıştı',answer_submit:'Yanıtını gönderdi',answer_check:'Yanıtlarını kontrol etti',answer_reveal:'Yanıtı görüntüledi',quiz_check:'Yanıtlarını kontrol etti',audio_play:'Dinleme sesini başlattı',audio_pause:'Dinlemeyi duraklattı',audio_end:'Dinlemeyi tamamladı',heartbeat:'Aktif çalışma kaydı',level_select:'Seviye seçti',vocab_reveal:'Kelime anlamını açtı',vocabulary_reveal:'Kelime anlamını açtı',navigate:'Ders içinde ilerledi'};
  let selectedTab = 'overview';
  let sequence = 0;
  let detailSequence = 0;
  let records = [];
  let ready = false;
  let debounce;
  function message(value) { $('dashboard-status').textContent = value; }
  function filters() {
    const from = $('filter-from').value, to = $('filter-to').value;
    if (from && to && from > to) throw new Error('Başlangıç tarihi bitiş tarihinden sonra olamaz.');
    const params = new URLSearchParams();
    [['q',$('filter-search').value.trim()],['group',$('filter-group').value],['visit',$('filter-visit').value],['from',from],['to',to]].forEach(([key,value]) => {if(value) params.set(key,value);});
    return `?${params.toString()}`;
  }
  function selectTab(tab) {
    if (!['overview','students','settings'].includes(tab)) return;
    selectedTab = tab;
    document.querySelectorAll('[data-admin-tab]').forEach(button => {if(button.dataset.adminTab === tab) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');});
    document.querySelectorAll('[data-admin-panel]').forEach(panel => panel.hidden = panel.dataset.adminPanel !== tab);
    $('shared-filters').hidden = tab === 'settings';
    $('refresh-data').hidden = tab === 'settings';
    const titles = {overview:['Genel bakış','Kim katıldı, hangi dersler çalışıldı?'],students:['Öğrenciler','Girişleri, çalışmaları ve son etkinlikleri takip edin.'],settings:['Ayarlar','Yönetici hesabınızı güvenle yönetin.']};
    $('dashboard-title').textContent = titles[tab][0]; $('dashboard-subtitle').textContent = titles[tab][1];
  }
  function renderStats(stats) {
    const cards = [
      ['Toplam öğrenci',number(stats.total),'Seçili öğrenci listesi'],
      ['Giriş yapan',number(stats.visited),'Seçili dönem içinde'],
      ['Hiç giriş yapmayan',number(stats.never),'Tüm kayıt geçmişinde'],
      ['Bugün aktif',number(stats.activeToday),'İstanbul saatine göre'],
      ['Toplam giriş',number(stats.loginCount),'Seçili dönem içinde'],
      ['Aktif çalışma',duration(stats.activeSeconds),'Yaklaşık toplam süre']
    ];
    $('stat-cards').innerHTML = cards.map(([label,value,note]) => `<article class="stat-card"><span class="stat-label">${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(note)}</small></article>`).join('');
  }
  function renderLessons(lessons) {
    $('lesson-table').innerHTML = lessons.length ? lessons.map(lesson => `<tr><td><strong>${escape(lesson.title || lesson.path || 'Ders')}</strong>${lesson.title && lesson.path ? `<small>${escape(lesson.path)}</small>` : ''}</td><td>${escape(number(lesson.visitors))}</td><td>${escape(number(lesson.eventCount))}</td><td>${escape(duration(lesson.activeSeconds))}</td></tr>`).join('') : '<tr><td colspan="4" class="table-empty">Bu filtrelerde henüz ders etkinliği bulunmuyor.</td></tr>';
  }
  function renderStudents(students) {
    records = students;
    $('student-count').textContent = `${number(students.length)} öğrenci · ayrıntılar için “İncele”yi seçin.`;
    $('student-table').innerHTML = students.length ? students.map(student => {
      const visited = Boolean(student.everVisited); const disabled = student.enabled === false;
      const label = !visited ? 'Hiç giriş yapmadı' : student.periodVisited === false ? 'Dönemde giriş yok' : 'Giriş yaptı';
      return `<tr><td><strong>${escape(student.name)}</strong><small>${escape(student.group || 'Grupsuz')}${disabled ? ' · Erişim kapalı' : ''}</small></td><td><span class="state-pill ${!visited || student.periodVisited === false ? 'never' : ''}">${escape(label)}</span></td><td>${escape(datetime(student.firstLogin))}</td><td>${escape(datetime(student.lastLogin))}</td><td>${escape(number(student.loginCount))}</td><td>${escape(duration(student.activeSeconds))}</td><td>${escape(number(student.lessonCount))}</td><td><div class="row-actions"><button type="button" data-student-detail="${escape(student.id)}">İncele ↗</button><button type="button" data-student-toggle="${escape(student.id)}" aria-label="${escape(student.name)} için ${disabled ? 'erişimi aç' : 'erişimi kapat'}">${disabled ? 'Erişimi aç' : 'Erişimi kapat'}</button></div></td></tr>`;
    }).join('') : '<tr><td colspan="8" class="table-empty">Bu filtrelerle eşleşen öğrenci bulunmuyor.</td></tr>';
  }
  function renderGroups(groups) {
    const old = $('filter-group').value;
    $('filter-group').innerHTML = '<option value="">Tüm gruplar</option>' + groups.map(group => `<option value="${escape(group)}">${escape(group)}</option>`).join('');
    if (groups.includes(old)) $('filter-group').value = old;
  }
  async function load() {
    if (!ready) return;
    const seq = ++sequence;
    let query;
    try { query = filters(); } catch (error) {$('refresh-data').disabled=false; message(error.message); return;}
    $('refresh-data').disabled = true; message('Kayıtlar yükleniyor…');
    try {
      const data = await access.request('/api/admin/overview' + query);
      if (seq !== sequence || !access.session()) return;
      if (!data || !data.stats || !Array.isArray(data.students) || !Array.isArray(data.lessons)) throw new Error('Kayıt yanıtı doğrulanamadı. Lütfen hizmet kurulumunu kontrol edin.');
      renderStats(data.stats); renderLessons(data.lessons); renderStudents(data.students); renderGroups(Array.isArray(data.groups) ? data.groups : []);
      $('updated-at').textContent = 'Güncellendi · ' + new Intl.DateTimeFormat('tr-TR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date());
      message('');
    } catch (error) { if(seq === sequence) message(error.message + (records.length ? ' Son alınan kayıtlar gösteriliyor.' : '')); }
    finally { if(seq === sequence) $('refresh-data').disabled = false; }
  }
  async function showDetail(id) {
    const student = records.find(value => String(value.id) === id);
    if (!student) return;
    const seq = ++detailSequence;
    $('detail-title').textContent = student.name; $('detail-group').textContent = student.group || 'Öğrenci'; $('detail-summary').textContent = ''; $('detail-events').replaceChildren(); $('detail-status').textContent = 'Etkinlik kayıtları yükleniyor…';
    if (!$('student-detail').open) $('student-detail').showModal();
    try {
      const data = await access.request(`/api/admin/students/${encodeURIComponent(id)}` + filters());
      if (seq !== detailSequence || !$('student-detail').open) return;
      if(!data || !Array.isArray(data.events)) throw new Error('Etkinlik yanıtı doğrulanamadı.');
      const metrics = data.metrics || {};
      $('detail-summary').textContent = [metrics.loginCount != null ? `${number(metrics.loginCount)} giriş` : '',metrics.lessonCount != null ? `${number(metrics.lessonCount)} ders` : '',metrics.activeSeconds != null ? `${duration(metrics.activeSeconds)} aktif çalışma` : '', 'Seçili dönem'].filter(Boolean).join(' · ');
      $('detail-status').textContent = '';
      $('detail-events').innerHTML = data.events.length ? `<ol class="event-list">${data.events.map(event => {
        const lesson = typeof event.lesson === 'object' ? event.lesson?.title || event.lesson?.path || '' : event.lesson || '';
        const activity = typeof event.activity === 'object' ? event.activity?.title || event.activity?.id || '' : event.activity || '';
        return `<li><time>${escape(datetime(event.createdAt))}</time><div><strong>${escape(eventNames[event.type] || event.type || 'Etkinlik')}</strong>${lesson ? `<small>${escape(lesson)}</small>` : ''}${activity ? `<small>Etkinlik: ${escape(activity)}</small>` : ''}${Number(event.activeSeconds) > 0 ? `<small>${escape(duration(event.activeSeconds))} aktif çalışma</small>` : ''}</div></li>`;
      }).join('')}</ol>` : '<div class="empty-state">Seçili dönemde bu öğrenci için etkinlik kaydı bulunmuyor.</div>';
    } catch(error) {if(seq === detailSequence) $('detail-status').textContent = error.message;}
  }
  document.querySelectorAll('[data-admin-tab]').forEach(button => button.addEventListener('click',() => selectTab(button.dataset.adminTab)));
  $('refresh-data').addEventListener('click',load);
  ['filter-group','filter-visit','filter-from','filter-to'].forEach(id => $(id).addEventListener('change',load));
  $('filter-search').addEventListener('input',() => {clearTimeout(debounce); debounce = setTimeout(load,300);});
  $('clear-filters').addEventListener('click',() => {['filter-search','filter-group','filter-from','filter-to'].forEach(id => $(id).value=''); $('filter-visit').value='all'; load();});
  $('student-table').addEventListener('click',async event => {
    const detail = event.target.closest('[data-student-detail]'); if(detail) {showDetail(detail.dataset.studentDetail); return;}
    const button = event.target.closest('[data-student-toggle]'); if(!button) return;
    const student = records.find(value => String(value.id) === button.dataset.studentToggle); if(!student) return;
    button.disabled = true;
    try {await access.request(`/api/admin/students/${encodeURIComponent(student.id)}`,{method:'POST',body:{enabled:student.enabled === false}}); await load();}
    catch(error) {message(error.message); button.disabled=false;}
  });
  $('close-detail').addEventListener('click',() => {++detailSequence; $('student-detail').close();});
  $('student-detail').addEventListener('close',() => {++detailSequence;});
  $('export-csv').addEventListener('click',async () => {
    const button = $('export-csv'); button.disabled=true;
    try {
      const csv = await access.request('/api/admin/export.csv' + filters());
      if(typeof csv !== 'string') throw new Error('CSV dosyası oluşturulamadı.');
      const blob = new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='english-ogrenci-katilimi.csv'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
    } catch(error) {message(error.message);} finally {button.disabled=false;}
  });
  $('change-password').addEventListener('submit',async event => {
    event.preventDefault(); const current = $('current-password'), next = $('new-password'), repeat = $('repeat-password'), status = $('password-status'); status.classList.remove('is-success');
    if(!current.value) {status.textContent='Mevcut şifrenizi yazın.'; current.focus(); return;}
    if(next.value.length < 12) {status.textContent='Yeni şifreniz en az 12 karakter olmalıdır.'; next.focus(); return;}
    if(next.value !== repeat.value) {status.textContent='Yeni şifreler birbiriyle aynı değil.'; repeat.focus(); return;}
    if(next.value === current.value) {status.textContent='Mevcut şifrenizden farklı bir şifre seçin.'; next.focus(); return;}
    const button = event.target.querySelector('[type=submit]'); button.disabled=true; status.textContent='Şifre güncelleniyor…';
    try {await access.request('/api/admin/password',{method:'POST',body:{currentPassword:current.value,newPassword:next.value}}); event.target.reset(); status.classList.add('is-success'); status.textContent='Yönetici şifreniz güncellendi.';}
    catch(error) {status.textContent=error.message; current.value=''; next.value=''; repeat.value='';}
    finally {button.disabled=false;}
  });
  window.addEventListener('english:session-expired',() => {ready=false; ++sequence; records=[]; ['student-table','lesson-table','stat-cards','detail-events'].forEach(id => $(id).replaceChildren()); if($('student-detail').open) $('student-detail').close();});
  access.ready.then(session => {if(session?.role !== 'admin') return; ready=true; selectTab('overview'); load();});
})();
