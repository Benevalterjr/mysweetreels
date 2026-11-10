import { fetchReelsFromFirestore } from './firebase-config.js';

let allReels = [];
let currentCategory = 'ALL';
let currentCreator = 'ALL';
let currentTag = 'ALL';
let currentSearch = '';
let currentSort = 'recent';

// =========================================================================
// OFUSCAÇÃO & PROTEÇÃO CONTRA INSPEÇÃO EM DEVTOOLS (Nível Prático)
// =========================================================================
const SALT_KEY = 0x73;

function obscureString(str) {
  if (!str) return '';
  const bytes = new TextEncoder().encode(str);
  const obfuscated = Array.from(bytes, b => b ^ SALT_KEY);
  return btoa(String.fromCharCode(...obfuscated));
}

function revealString(token) {
  if (!token) return '';
  try {
    const raw = atob(token);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i) ^ SALT_KEY;
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

// Tokens ativos (mantidos fora do DOM)
let activeReelToken = '';
let activeAuthorToken = '';
let activeReelId = null;

// =========================================================================
// UTILITÁRIOS: escape de HTML, armazenamento local, toast e wake lock
// =========================================================================

// Escapa texto vindo do banco/IA antes de injetar via innerHTML
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Argumento seguro para handlers inline (onclick="fn(${jsArg(x)})")
function jsArg(value) {
  return escapeHtml(JSON.stringify(String(value ?? '')));
}

function normalizeText(str) {
  return String(str ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function formatDuration(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (!s) return '';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* modo privado */ }
  }
};

// Favoritos ("Salvos") persistidos no navegador
const FAV_KEY = 'sweetreels:favs';
const FAV_FILTER = '__FAVS__';
let favorites = new Set(store.get(FAV_KEY, []));

function isFavorite(id) { return favorites.has(id); }

function toggleFavorite(id, ev) {
  if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
  const targetId = id || activeReelId;
  if (!targetId) return;
  if (favorites.has(targetId)) {
    favorites.delete(targetId);
    showToast('Removido dos salvos');
  } else {
    favorites.add(targetId);
    showToast('❤️ Salvo! Veja na aba "Salvos"');
  }
  store.set(FAV_KEY, [...favorites]);

  renderCategoryPills();
  applyFiltersAndRender(currentCategory === FAV_FILTER);
  if (activeReelId === targetId) updateModalFavButton(targetId);
}

function updateModalFavButton(id) {
  const btn = document.getElementById('modalFavBtn');
  if (!btn) return;
  const fav = isFavorite(id);
  btn.innerHTML = fav ? '❤️ <span class="hidden sm:inline">Salvo</span>' : '🤍 <span class="hidden sm:inline">Salvar</span>';
  btn.setAttribute('aria-pressed', String(fav));
}

// Progresso do checklist persistido por Reel
function checksKey(id) { return `sweetreels:checks:${id}`; }

function onCheckChange(reelId, idx, checked) {
  const done = new Set(store.get(checksKey(reelId), []));
  if (checked) done.add(idx); else done.delete(idx);
  store.set(checksKey(reelId), [...done]);

  const label = document.getElementById(`checkLabel_${idx}`);
  if (label) label.classList.toggle('line-through', checked);
  if (label) label.classList.toggle('text-stone-400', checked);
  updateChecklistProgress(reelId);
}

function updateChecklistProgress(reelId) {
  const el = document.getElementById('modalChecklistProgress');
  const reel = allReels.find(r => r.id === reelId);
  if (!el || !reel) return;
  const total = cleanAndDeduplicate(reel.checklist_items).length;
  const done = store.get(checksKey(reelId), []).filter(i => i < total).length;
  el.textContent = done === 0 ? 'Toque para marcar' : `${done}/${total} ✓`;
  el.className = done === total && total > 0
    ? 'text-[10px] font-extrabold text-emerald-600'
    : 'text-[10px] text-stone-400';
}

function resetChecklist() {
  if (!activeReelId) return;
  store.set(checksKey(activeReelId), []);
  document.querySelectorAll('#modalChecklistItems input[type="checkbox"]').forEach(cb => { cb.checked = false; });
  document.querySelectorAll('#modalChecklistItems [id^="checkLabel_"]').forEach(l => l.classList.remove('line-through', 'text-stone-400'));
  updateChecklistProgress(activeReelId);
}

async function copyChecklist() {
  const reel = allReels.find(r => r.id === activeReelId);
  if (!reel) return;
  const items = cleanAndDeduplicate(reel.checklist_items);
  const text = `🛒 ${reel.title}\n\n${items.map(i => `• ${i}`).join('\n')}\n\n${getBaseUrl()}/?reel=${reel.id}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast('📋 Lista copiada! Cole no WhatsApp ou notas');
  } catch {
    showToast('Não foi possível copiar');
  }
}

async function shareReel() {
  const reel = allReels.find(r => r.id === activeReelId);
  if (!reel) return;
  const url = `${getBaseUrl()}/?reel=${reel.id}`;
  if (navigator.share) {
    try { await navigator.share({ title: reel.title, text: reel.summary, url }); } catch { /* cancelado */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('🔗 Link copiado!');
  } catch {
    showToast(url);
  }
}

let toastTimer;
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
  }, 2400);
}

// Modo cozinha: mantém a tela acesa enquanto o Reel está aberto
let wakeLock = null;
async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* não suportado ou negado */ }
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && activeReelId) acquireWakeLock();
});

export function openOriginalSource() {
  if (!activeReelToken) return;
  const url = revealString(activeReelToken);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

export function openAuthorProfile() {
  if (!activeAuthorToken) return;
  const url = revealString(activeAuthorToken);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

// Pagination state
const PAGE_SIZE = 8;
let displayedCount = PAGE_SIZE;
let scrollObserver = null;

// SEO & Meta defaults
const DEFAULT_SEO = {
  title: 'SweetReels - O Pinterest dos Melhores Reels',
  description: 'Descubra receitas, treinos e tutoriais do Instagram Reels com áudio transcrito por IA e ingredientes sem repetições.',
  image: 'https://mysweetreels.netlify.app/thumbnails/DdJu3g0OAql.jpg',
  url: 'https://mysweetreels.netlify.app/'
};

// Load reels data (Prioriza Firestore com fallback transparente para reels.json)
async function loadReels() {
  try {
    let rawReels = [];
    let loadedFromFirestore = false;
    try {
      const fbReels = await fetchReelsFromFirestore();
      if (fbReels && fbReels.length > 0) {
        rawReels = fbReels;
        loadedFromFirestore = true;
        console.log(`[SweetReels] ⚡ ${rawReels.length} posts sincronizados em tempo real via Firebase Firestore!`);
      }
    } catch (fbErr) {
      console.warn('[SweetReels] Firestore inacessível ou aguardando publicação de regras. Usando cache local:', fbErr.message);
    }

    if (!loadedFromFirestore) {
      const res = await fetch('/data/reels.json');
      if (!res.ok) throw new Error('Não foi possível carregar os dados locais');
      rawReels = await res.json();
      console.log(`[SweetReels] 📁 ${rawReels.length} posts carregados do fallback local (reels.json).`);
    }

    // Higienização e Proteção: Remove URLs explícitas da memória do feed
    allReels = rawReels.map(r => {
      const realUrl = r.url || (r.id ? `https://www.instagram.com/reel/${r.id}/` : '');
      const realAuthorUrl = r.author?.profile_url || (r.author?.username ? `https://www.instagram.com/${r.author.username}/` : '');
      const cleanReel = { ...r };
      cleanReel._tk = obscureString(realUrl);
      cleanReel._atk = obscureString(realAuthorUrl);
      delete cleanReel.url;
      if (cleanReel.author) {
        cleanReel.author = { ...cleanReel.author };
        delete cleanReel.author.profile_url;
      }
      return cleanReel;
    });
    
    // Busca via URL (?q=bolo) — compatível com o SearchAction do Schema.org
    const initialQuery = new URLSearchParams(window.location.search).get('q');
    if (initialQuery) {
      currentSearch = initialQuery.trim();
      document.getElementById('searchInput').value = currentSearch;
      document.getElementById('clearSearchBtn').classList.remove('hidden');
    }

    renderCategoryPills();
    populateCreatorsDropdown();
    renderPopularTags();
    setupInfiniteScroll();
    applyFiltersAndRender(true);
    updateTotalBadge();
    updateSiteJsonLd();
    checkUrlForReelParam();
    checkShareTargetAndParams();
    setTimeout(checkClipboardForReels, 1200);
  } catch (err) {
    console.error('Erro ao carregar dados:', err);
    const grid = document.getElementById('reelsGrid');
    if (grid) grid.innerHTML = `
      <div class="col-span-full text-center py-16 text-sm text-stone-500">
        😕 Não foi possível carregar os Reels agora.
        <button onclick="location.reload()" class="block mx-auto mt-3 px-4 py-1.5 rounded-full bg-stone-900 text-white text-xs font-bold">Tentar novamente</button>
      </div>`;
  }
}

function updateTotalBadge() {
  const lbl = document.getElementById('totalReelsLabel');
  if (lbl) {
    lbl.textContent = `${allReels.length} ${allReels.length === 1 ? 'Post' : 'Posts'}`;
  }
}

// Category Pills
const PILL_ACTIVE = 'cat-pill active px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs font-bold transition-all bg-stone-900 text-white shadow-sm flex-shrink-0';
const PILL_IDLE = 'cat-pill px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs font-bold transition-all bg-stone-100 text-stone-600 hover:bg-stone-200 flex-shrink-0';

function renderCategoryPills() {
  const container = document.getElementById('categoryFilters');
  const categories = Array.from(new Set(allReels.map(r => r.category).filter(Boolean)));
  const favCount = allReels.filter(r => favorites.has(r.id)).length;

  // Se o filtro de salvos ficou vazio, volta para "Todos"
  if (currentCategory === FAV_FILTER && favCount === 0) currentCategory = 'ALL';

  const pill = (value, label) => `
    <button class="${currentCategory === value ? PILL_ACTIVE : PILL_IDLE}" data-category="${escapeHtml(value)}" onclick="setCategory(${jsArg(value)})">
      ${label}
    </button>`;

  let html = pill('ALL', '🔥 Todos');
  if (favCount > 0) html += pill(FAV_FILTER, `❤️ Salvos (${favCount})`);
  categories.forEach(cat => { html += pill(cat, `${getCategoryIcon(cat)} ${escapeHtml(cat)}`); });

  container.innerHTML = html;
}

function getCategoryIcon(cat) {
  const c = (cat || '').toLowerCase();
  if (c.includes('receita') || c.includes('culin')) return '🍳';
  if (c.includes('treino') || c.includes('fitness')) return '💪';
  if (c.includes('viagem') || c.includes('lugar')) return '✈️';
  if (c.includes('moda') || c.includes('beleza')) return '👗';
  if (c.includes('dica') || c.includes('tutorial')) return '💡';
  if (c.includes('casa') || c.includes('decor')) return '🏡';
  if (c.includes('finan') || c.includes('negoc')) return '💼';
  return '📌';
}

function setCategory(cat) {
  currentCategory = cat;
  document.querySelectorAll('.cat-pill').forEach(btn => {
    btn.className = btn.dataset.category === cat ? PILL_ACTIVE : PILL_IDLE;
  });
  applyFiltersAndRender(true);
}

// Populate Creator Dropdown dynamically
function populateCreatorsDropdown() {
  const select = document.getElementById('creatorSelect');
  if (!select) return;
  
  const creators = Array.from(new Set(allReels.map(r => r.author?.username).filter(Boolean)));
  select.innerHTML = '<option value="ALL">👤 Todos Criadores</option>' + 
    creators.map(c => `<option value="${escapeHtml(c)}">@${escapeHtml(c)}</option>`).join('');
}

function onCreatorChange(val) {
  currentCreator = val;
  applyFiltersAndRender(true);
}

// Popular tags
function renderPopularTags() {
  const bar = document.getElementById('popularTagsBar');
  if (!bar) return;

  const tagCounts = {};
  allReels.forEach(r => {
    (r.tags || []).forEach(t => {
      const clean = t.trim().toLowerCase();
      tagCounts[clean] = (tagCounts[clean] || 0) + 1;
    });
  });

  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(e => e[0]);

  if (sortedTags.length === 0) {
    bar.innerHTML = '';
    return;
  }

  bar.innerHTML = '<span class="text-[10px] font-bold text-stone-400 uppercase tracking-wider mr-1 flex-shrink-0">Tags:</span>' +
    sortedTags.map(tag => `
      <button onclick="toggleTagFilter(${jsArg(tag)})" class="tag-pill px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition-all flex-shrink-0 ${currentTag === tag ? 'bg-rose-500 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}">
        #${escapeHtml(tag)}
      </button>
    `).join('');
}

function toggleTagFilter(tag) {
  currentTag = (currentTag === tag) ? 'ALL' : tag;
  renderPopularTags();
  applyFiltersAndRender(true);
}

// Sorting
function onSortChange(val) {
  currentSort = val;
  applyFiltersAndRender(true);
}

// Core Filtering & Sorting Logic
function getFilteredAndSortedReels() {
  let list = allReels.filter(r => {
    const matchCat = currentCategory === 'ALL' ||
      (currentCategory === FAV_FILTER ? favorites.has(r.id) : r.category === currentCategory);
    const matchCreator = currentCreator === 'ALL' || (r.author?.username === currentCreator);
    const matchTag = currentTag === 'ALL' || (r.tags && r.tags.some(t => t.toLowerCase() === currentTag.toLowerCase()));
    
    const query = normalizeText(currentSearch);
    const has = (s) => normalizeText(s).includes(query);
    const matchSearch = !query ||
      has(r.title) || has(r.summary) || has(r.transcript) ||
      has(r.author?.name) || has(r.author?.username) ||
      (r.tags && r.tags.some(has)) ||
      (r.checklist_items && r.checklist_items.some(has));

    return matchCat && matchCreator && matchTag && matchSearch;
  });

  // Sort
  if (currentSort === 'recent') {
    list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  } else if (currentSort === 'oldest') {
    list.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  } else if (currentSort === 'duration') {
    list.sort((a, b) => (a.duration || 999) - (b.duration || 999));
  } else if (currentSort === 'az') {
    list.sort((a, b) => a.title.localeCompare(b.title));
  }

  return list;
}

// Apply Filters and Render Page
function applyFiltersAndRender(resetPage = false) {
  if (resetPage) {
    displayedCount = PAGE_SIZE;
  }

  const filtered = getFilteredAndSortedReels();
  const visible = filtered.slice(0, displayedCount);

  // Update counter & active chips
  updateFilterBarUI(filtered.length);

  const grid = document.getElementById('reelsGrid');
  const emptyState = document.getElementById('emptyState');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  const endOfFeedMsg = document.getElementById('endOfFeedMsg');

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    loadMoreBtn.classList.add('hidden');
    endOfFeedMsg.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  // Render cards
  grid.innerHTML = visible.map(r => {
    const title = escapeHtml(r.title);
    const category = r.category || 'Reels';
    const cCount = cleanAndDeduplicate(r.checklist_items).length;
    const duration = formatDuration(r.duration);
    const fav = isFavorite(r.id);
    return `
    <div class="masonry-item bg-white rounded-2xl sm:rounded-3xl overflow-hidden border border-stone-200/80 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group flex flex-col" onclick="openModal(${jsArg(r.id)})" role="button" tabindex="0" aria-label="${title}" onkeydown="if(event.key==='Enter')openModal(${jsArg(r.id)})">
      
      <!-- Capa vertical -->
      <div class="relative bg-stone-100 aspect-[9/14] sm:aspect-[9/13] overflow-hidden flex items-center justify-center">
        ${r.thumbnail ? `
          <img src="${escapeHtml(r.thumbnail)}" alt="${title}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
        ` : `
          <div class="w-full h-full bg-gradient-to-br from-rose-500/80 to-amber-500/80 flex items-center justify-center p-4 text-center text-white">
            <span class="text-xs font-bold">${escapeHtml(category)}</span>
          </div>
        `}
        
        <!-- Categoria -->
        <div class="absolute top-2 left-2 sm:top-2.5 sm:left-2.5 bg-white/95 backdrop-blur-md px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-extrabold text-stone-800 shadow-xs">
          ${getCategoryIcon(category)} ${escapeHtml(category.split('&')[0].trim())}
        </div>

        <!-- Salvar -->
        <button onclick="toggleFavorite(${jsArg(r.id)}, event)" aria-label="${fav ? 'Remover dos salvos' : 'Salvar'}" aria-pressed="${fav}"
          class="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 z-10 w-8 h-8 rounded-full bg-white/95 backdrop-blur-md shadow-xs flex items-center justify-center text-sm hover:scale-110 transition-transform">
          ${fav ? '❤️' : '🤍'}
        </button>

        <!-- Play -->
        <div class="absolute inset-0 bg-black/15 group-hover:bg-black/30 flex items-center justify-center transition-colors">
          <div class="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/95 text-rose-600 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
            <svg class="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>

        <!-- Rodapé da capa: itens + duração -->
        <div class="absolute bottom-2 inset-x-2 sm:bottom-2.5 sm:inset-x-2.5 flex items-center justify-between gap-1">
          ${cCount > 0 ? `<span class="bg-black/75 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold text-white">📋 ${cCount} itens</span>` : '<span></span>'}
          ${duration ? `<span class="bg-black/75 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold text-white">▶ ${duration}</span>` : ''}
        </div>
      </div>

      <!-- Conteúdo -->
      <div class="p-2.5 sm:p-4 flex flex-col flex-1">
        <h3 class="mb-2 text-xs sm:text-sm font-extrabold text-stone-900 group-hover:text-rose-600 transition-colors leading-tight line-clamp-2">
          ${title}
        </h3>
        <div class="mt-auto pt-2 border-t border-stone-100 flex items-center justify-between text-[10px] sm:text-xs text-stone-400">
          <span class="font-bold text-stone-700 truncate max-w-[100px] sm:max-w-[140px]">@${escapeHtml(r.author?.username || 'criador')}</span>
          <span class="text-rose-600 font-extrabold">Ver →</span>
        </div>
      </div>

    </div>`;
  }).join('');

  // Pagination Controls
  if (visible.length < filtered.length) {
    loadMoreBtn.classList.remove('hidden');
    endOfFeedMsg.classList.add('hidden');
  } else {
    loadMoreBtn.classList.add('hidden');
    if (filtered.length > 0) {
      endOfFeedMsg.classList.remove('hidden');
    } else {
      endOfFeedMsg.classList.add('hidden');
    }
  }
}

function loadMoreItems() {
  displayedCount += PAGE_SIZE;
  applyFiltersAndRender(false);
}

// Setup Infinite Scroll via IntersectionObserver
function setupInfiniteScroll() {
  const sentinel = document.getElementById('scrollSentinel');
  if (!sentinel) return;

  if (scrollObserver) scrollObserver.disconnect();

  scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const filtered = getFilteredAndSortedReels();
        if (displayedCount < filtered.length) {
          loadMoreItems();
        }
      }
    });
  }, { rootMargin: '300px' });

  scrollObserver.observe(sentinel);
}

// Update Active Filters Chips & Reset Button
function updateFilterBarUI(totalFiltered) {
  const counter = document.getElementById('resultsCountText');
  const chipsContainer = document.getElementById('activeFiltersContainer');
  const resetBtn = document.getElementById('resetFiltersBtn');

  if (counter) {
    counter.textContent = `${totalFiltered} ${totalFiltered === 1 ? 'Reel' : 'Reels'}`;
  }

  let hasActiveFilter = (currentCategory !== 'ALL' || currentCreator !== 'ALL' || currentTag !== 'ALL' || currentSearch !== '');
  
  if (resetBtn) {
    if (hasActiveFilter) {
      resetBtn.classList.remove('hidden');
    } else {
      resetBtn.classList.add('hidden');
    }
  }

  if (chipsContainer) {
    let chipsHtml = '';
    if (currentCreator !== 'ALL') {
      chipsHtml += `<span class="inline-flex items-center gap-1 bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full text-[11px] font-bold">@${escapeHtml(currentCreator)} <button onclick="onCreatorChange('ALL'); document.getElementById('creatorSelect').value='ALL'" class="text-stone-400 hover:text-stone-600" aria-label="Remover filtro">✕</button></span>`;
    }
    if (currentTag !== 'ALL') {
      chipsHtml += `<span class="inline-flex items-center gap-1 bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full text-[11px] font-bold">#${escapeHtml(currentTag)} <button onclick="toggleTagFilter(${jsArg(currentTag)})" class="text-rose-400 hover:text-rose-600" aria-label="Remover filtro">✕</button></span>`;
    }
    chipsContainer.innerHTML = chipsHtml;
  }
}

function resetAllFilters() {
  currentCategory = 'ALL';
  currentCreator = 'ALL';
  currentTag = 'ALL';
  currentSearch = '';
  currentSort = 'recent';

  document.getElementById('searchInput').value = '';
  document.getElementById('creatorSelect').value = 'ALL';
  document.getElementById('sortSelect').value = 'recent';
  document.getElementById('clearSearchBtn').classList.add('hidden');

  renderCategoryPills();
  renderPopularTags();
  applyFiltersAndRender(true);
}

function clearSearch() {
  currentSearch = '';
  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearchBtn').classList.add('hidden');
  applyFiltersAndRender(true);
}

// Search with Debounce
let searchTimeout;
document.getElementById('searchInput').addEventListener('input', e => {
  clearTimeout(searchTimeout);
  const val = e.target.value.trim();
  const clearBtn = document.getElementById('clearSearchBtn');
  
  if (clearBtn) {
    if (val) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }

  searchTimeout = setTimeout(() => {
    currentSearch = val;
    applyFiltersAndRender(true);
  }, 250);
});

function cleanAndDeduplicate(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const cleaned = [];

  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== 'string') continue;
    let clean = rawItem.trim();

    // Filtra cabeçalhos de markdown que começam com **Para ...** ou terminam com :
    if (/^\*{1,3}(Para|Massa|Recheio|Cobertura|Geleia)[^*]*\*{1,3}:?$/i.test(clean) || 
        clean.toLowerCase().startsWith('**para ') || 
        clean.endsWith(':**') || 
        clean.endsWith(':') && clean.length < 35) {
      continue;
    }

    clean = clean.replace(/^\*\*([^*]+)\*\*$/, '$1').trim();
    const key = clean.toLowerCase().replace(/[.,;:()]/g, '').replace(/\s+/g, ' ').trim();

    if (!seen.has(key)) {
      seen.add(key);
      cleaned.push(clean);
    }
  }

  return cleaned;
}

// Modal Viewer
function openModal(id) {
  const reel = allReels.find(r => r.id === id);
  if (!reel) return;

  // Carrega tokens protegidos fora do DOM
  activeReelToken = reel._tk || '';
  activeAuthorToken = reel._atk || '';

  document.getElementById('modalCategory').textContent = `${getCategoryIcon(reel.category)} ${reel.category}`;
  document.getElementById('modalTitle').textContent = reel.title;
  
  const authorBtn = document.getElementById('modalAuthorLink');
  authorBtn.textContent = `@${reel.author?.username || 'instagram'}`;

  document.getElementById('modalSummary').textContent = reel.summary;

  // Toca o vídeo: prioriza o CDN do Cloudinary (100% nativo e sem barras pretas) ou fallback para o embed oficial
  if (reel.video_file && typeof reel.video_file === 'string' && reel.video_file.startsWith('http')) {
    loadCloudinaryVideoPlayer(reel.video_file, reel.thumbnail);
  } else {
    loadInstagramEmbed(reel.id);
  }

  activeReelId = reel.id;
  updateModalFavButton(reel.id);

  // Checklist interativo com progresso salvo no navegador
  document.getElementById('modalChecklistTitle').textContent = `📋 ${reel.checklist_title || 'Componentes / Ingredientes'}`;
  const checklistList = document.getElementById('modalChecklistItems');
  const cleanItems = cleanAndDeduplicate(reel.checklist_items);
  const doneSet = new Set(store.get(checksKey(reel.id), []));
  if (cleanItems && cleanItems.length > 0) {
    checklistList.innerHTML = cleanItems.map((item, idx) => {
      const done = doneSet.has(idx);
      return `
      <li>
        <label class="flex items-start gap-2 p-1 rounded-lg hover:bg-stone-100/70 cursor-pointer select-none min-w-0 w-full">
          <input type="checkbox" ${done ? 'checked' : ''} onchange="onCheckChange(${jsArg(reel.id)}, ${idx}, this.checked)" class="mt-0.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer accent-rose-600 flex-shrink-0">
          <span id="checkLabel_${idx}" class="leading-tight break-words flex-1 min-w-0 ${done ? 'line-through text-stone-400' : ''}">${escapeHtml(item)}</span>
        </label>
      </li>`;
    }).join('');
    checklistList.closest('[data-section]').classList.remove('hidden');
    updateChecklistProgress(reel.id);
  } else {
    checklistList.closest('[data-section]').classList.add('hidden');
  }

  // Steps
  const stepsList = document.getElementById('modalSteps');
  if (reel.steps_or_tips && reel.steps_or_tips.length > 0) {
    stepsList.innerHTML = reel.steps_or_tips.map((step, idx) => `
      <li class="flex items-start gap-2.5 min-w-0 w-full">
        <span class="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-rose-100 text-rose-700 text-[10px] sm:text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">${idx + 1}</span>
        <span class="text-stone-700 leading-tight break-words flex-1 min-w-0">${escapeHtml(step)}</span>
      </li>
    `).join('');
    stepsList.parentElement.classList.remove('hidden');
  } else {
    stepsList.parentElement.classList.add('hidden');
  }

  // Transcript
  document.getElementById('modalTranscript').textContent = `"${reel.transcript || ''}"`;

  // Tags
  const tagsContainer = document.getElementById('modalTags');
  if (reel.tags && reel.tags.length > 0) {
    tagsContainer.innerHTML = reel.tags.map(t => `
      <button onclick="closeModal(); toggleTagFilter(${jsArg(t.trim().toLowerCase())})" class="px-2 py-0.5 rounded-md bg-stone-100 hover:bg-rose-50 hover:text-rose-600 text-stone-600 text-[11px] font-semibold transition-colors">
        #${escapeHtml(t)}
      </button>
    `).join('');
  } else {
    tagsContainer.innerHTML = '';
  }

  // Open modal
  const modal = document.getElementById('detailModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = 'hidden';
  modal.querySelector('.custom-scroll')?.scrollTo(0, 0);

  // Inicializa o radar de preços de ingredientes InfoPrice
  initIngredientsMarket(reel);

  acquireWakeLock();

  // Dynamic SEO & JSON-LD
  updateReelSeo(reel);
}

// Navega para o Reel anterior/próximo dentro da lista filtrada atual
function navigateReel(direction) {
  if (!activeReelId) return;
  const list = getFilteredAndSortedReels();
  const idx = list.findIndex(r => r.id === activeReelId);
  if (idx === -1) return;
  const next = list[idx + direction];
  if (next) openModal(next.id);
}

function loadCloudinaryVideoPlayer(videoUrl, poster) {
  const container = document.getElementById('modalEmbedContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="relative w-full max-w-full h-[460px] sm:h-[560px] bg-stone-900 rounded-2xl overflow-hidden flex items-center justify-center shadow-inner">
      <video 
        id="modalVideoPlayer"
        src="${escapeHtml(videoUrl)}" 
        ${poster ? `poster="${escapeHtml(poster)}"` : ''}
        controls 
        autoplay 
        playsinline 
        loop 
        preload="metadata"
        class="w-full max-w-full h-full object-contain rounded-2xl bg-stone-950"
      ></video>
    </div>
  `;

  const video = document.getElementById('modalVideoPlayer');
  if (video) {
    video.play().catch(() => {});
  }
}

function loadInstagramEmbed(reelId) {
  const container = document.getElementById('modalEmbedContainer');
  if (!container) return;

  // Iframe limpo e responsivo oficial do Instagram (streaming direto dos servidores da Meta)
  container.innerHTML = `
    <iframe 
      src="https://www.instagram.com/reel/${reelId}/embed/" 
      class="w-full max-w-full h-[460px] sm:h-[560px] border-0 rounded-2xl bg-white shadow-none block"
      scrolling="no"
      frameborder="0"
      allowtransparency="true"
      allow="encrypted-media"
    ></iframe>
  `;

  // Garante que o script oficial do Instagram processe caso necessário
  if (!document.querySelector('script[src="https://www.instagram.com/embed.js"]')) {
    const s = document.createElement('script');
    s.src = 'https://www.instagram.com/embed.js';
    s.async = true;
    document.body.appendChild(s);
  } else if (window.instgrm && window.instgrm.Embeds) {
    try { window.instgrm.Embeds.process(); } catch (e) {}
  }
}

function closeModal(updateHistory = true) {
  const modal = document.getElementById('detailModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.style.overflow = '';
  
  // Limpa o container do embed para parar o áudio/vídeo imediatamente
  const embedContainer = document.getElementById('modalEmbedContainer');
  if (embedContainer) embedContainer.innerHTML = '';

  activeReelToken = '';
  activeAuthorToken = '';
  activeReelId = null;
  releaseWakeLock();

  resetSeo(updateHistory);
}

// =========================================================================
// SEO, GEO & SCHEMA.ORG JSON-LD GENERATION (Pronto para Motores de Busca e IAs)
// =========================================================================

function getBaseUrl() {
  return window.location.origin.includes('localhost') ? 'https://mysweetreels.netlify.app' : window.location.origin;
}

function updateSiteJsonLd() {
  const scriptEl = document.getElementById('siteJsonLd');
  if (!scriptEl) return;
  
  const origin = getBaseUrl();

  const graph = [
    {
      "@type": "WebSite",
      "@id": `${origin}/#website`,
      "url": `${origin}/`,
      "name": "SweetReels",
      "description": "O Pinterest dos Melhores Reels com transcrições, passos práticos e listas de ingredientes.",
      "inLanguage": "pt-BR",
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": `${origin}/?q={search_term_string}`
        },
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@type": "Organization",
      "@id": `${origin}/#organization`,
      "name": "SweetReels",
      "url": `${origin}/`
    },
    {
      "@type": "ItemList",
      "@id": `${origin}/#reels-list`,
      "name": "Catálogo dos Melhores Reels Selecionados",
      "description": "Feed curado de Reels com transcrições fiéis por IA, checklists de ingredientes sem repetições e passos de execução.",
      "numberOfItems": allReels.length,
      "itemListElement": allReels.map((r, idx) => ({
        "@type": "ListItem",
        "position": idx + 1,
        "item": {
          "@type": (r.category && r.category.includes('Receita')) ? "Recipe" : "VideoObject",
          "name": r.title,
          "description": r.summary,
          "url": `${origin}/?reel=${r.id}`,
          "image": `${origin}${r.thumbnail}`,
          "author": {
            "@type": "Person",
            "name": r.author?.name || r.author?.username,
            "url": r.author?.profile_url || r.url
          }
        }
      }))
    }
  ];

  scriptEl.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
}

function updateReelSeo(reel) {
  const origin = getBaseUrl();
  const canonicalUrl = `${origin}/?reel=${reel.id}`;
  const fullThumbnail = `${origin}${reel.thumbnail}`;
  const fullVideo = /^https?:\/\//.test(reel.video_file || '') ? reel.video_file : (reel.video_file ? `${origin}${reel.video_file}` : undefined);

  // Update Page Title
  document.title = `${reel.title} - SweetReels`;
  
  const setMeta = (selector, attr, val) => {
    const el = document.querySelector(selector);
    if (el) el.setAttribute(attr, val);
  };

  setMeta('meta[name="description"]', 'content', reel.summary || DEFAULT_SEO.description);
  setMeta('meta[property="og:title"]', 'content', `${reel.title} - SweetReels`);
  setMeta('meta[property="og:description"]', 'content', reel.summary);
  setMeta('meta[property="og:image"]', 'content', fullThumbnail);
  setMeta('meta[property="og:url"]', 'content', canonicalUrl);
  setMeta('meta[property="og:type"]', 'content', 'video.other');

  setMeta('meta[name="twitter:title"]', 'content', `${reel.title} - SweetReels`);
  setMeta('meta[name="twitter:description"]', 'content', reel.summary);
  setMeta('meta[name="twitter:image"]', 'content', fullThumbnail);

  const canonicalLink = document.querySelector('link[rel="canonical"]');
  if (canonicalLink) canonicalLink.setAttribute('href', canonicalUrl);

  // Deep Link in URL Bar without reloading
  window.history.replaceState({ reelId: reel.id }, reel.title, `?reel=${reel.id}`);

  // Dynamic Schema.org JSON-LD (Polymorphic: Recipe or VideoObject/HowTo)
  const dynamicScript = document.getElementById('reelDynamicJsonLd');
  if (!dynamicScript) return;

  const isRecipe = (reel.category || '').toLowerCase().includes('receita');
  const cleanItems = cleanAndDeduplicate(reel.checklist_items);

  let schemaData = {};

  if (isRecipe) {
    schemaData = {
      "@context": "https://schema.org",
      "@type": "Recipe",
      "@id": canonicalUrl,
      "name": reel.title,
      "description": reel.summary,
      "image": [fullThumbnail],
      "author": {
        "@type": "Person",
        "name": reel.author?.name || reel.author?.username,
        "url": reel.author?.profile_url || reel.url
      },
      "datePublished": reel.created_at,
      "recipeCategory": "Culinária & Confeitaria",
      "keywords": (reel.tags || []).join(', '),
      "recipeIngredient": cleanItems,
      "recipeInstructions": (reel.steps_or_tips || []).map((step, idx) => ({
        "@type": "HowToStep",
        "position": idx + 1,
        "text": step
      })),
      "video": {
        "@type": "VideoObject",
        "name": reel.title,
        "description": reel.summary,
        "thumbnailUrl": [fullThumbnail],
        "contentUrl": fullVideo,
        "uploadDate": reel.created_at,
        "duration": reel.duration ? `PT${Math.round(reel.duration)}S` : undefined,
        "transcript": reel.transcript
      }
    };
  } else {
    schemaData = {
      "@context": "https://schema.org",
      "@type": ["VideoObject", "HowTo"],
      "@id": canonicalUrl,
      "name": reel.title,
      "description": reel.summary,
      "thumbnailUrl": [fullThumbnail],
      "contentUrl": fullVideo,
      "uploadDate": reel.created_at,
      "duration": reel.duration ? `PT${Math.round(reel.duration)}S` : undefined,
      "transcript": reel.transcript,
      "author": {
        "@type": "Person",
        "name": reel.author?.name || reel.author?.username,
        "url": reel.author?.profile_url || reel.url
      },
      "step": (reel.steps_or_tips || []).map((step, idx) => ({
        "@type": "HowToStep",
        "position": idx + 1,
        "text": step
      }))
    };
  }

  dynamicScript.textContent = JSON.stringify(schemaData, null, 2);
}

function resetSeo(updateHistory = true) {
  document.title = DEFAULT_SEO.title;

  const setMeta = (selector, attr, val) => {
    const el = document.querySelector(selector);
    if (el) el.setAttribute(attr, val);
  };

  setMeta('meta[name="description"]', 'content', DEFAULT_SEO.description);
  setMeta('meta[property="og:title"]', 'content', DEFAULT_SEO.title);
  setMeta('meta[property="og:description"]', 'content', DEFAULT_SEO.description);
  setMeta('meta[property="og:image"]', 'content', DEFAULT_SEO.image);
  setMeta('meta[property="og:url"]', 'content', DEFAULT_SEO.url);
  setMeta('meta[property="og:type"]', 'content', 'website');

  setMeta('meta[name="twitter:title"]', 'content', DEFAULT_SEO.title);
  setMeta('meta[name="twitter:description"]', 'content', DEFAULT_SEO.description);
  setMeta('meta[name="twitter:image"]', 'content', DEFAULT_SEO.image);

  const canonicalLink = document.querySelector('link[rel="canonical"]');
  if (canonicalLink) canonicalLink.setAttribute('href', DEFAULT_SEO.url);

  const dynamicScript = document.getElementById('reelDynamicJsonLd');
  if (dynamicScript) dynamicScript.textContent = '{}';

  if (updateHistory) {
    window.history.replaceState({}, DEFAULT_SEO.title, window.location.pathname);
  }
}

// =========================================================================
// INFOPRICE: RADAR DE PREÇOS E SUPERMERCADOS PRÓXIMOS
// =========================================================================
const USER_CEP_KEY = 'sweetreels:user_cep';
const USER_RADIUS_KEY = 'sweetreels:user_radius';

function formatCurrency(val) {
  const num = Number(val) || 0;
  return `R$ ${num.toFixed(2).replace('.', ',')}`;
}

function formatCep(val) {
  const clean = String(val || '').replace(/\D/g, '').slice(0, 8);
  if (clean.length > 5) {
    return `${clean.slice(0, 5)}-${clean.slice(5)}`;
  }
  return clean;
}

function getStoredCep() {
  return store.get(USER_CEP_KEY, '04025010');
}

function setStoredCep(cep) {
  const clean = String(cep || '').replace(/\D/g, '');
  if (clean.length === 8) store.set(USER_CEP_KEY, clean);
}

function initIngredientsMarket(reel) {
  const section = document.getElementById('modalIngredientsMarketSection');
  const input = document.getElementById('ingredientCepInput');
  const select = document.getElementById('ingredientRadiusSelect');
  const resultsContainer = document.getElementById('ingredientPricesResults');

  if (!section || !input || !resultsContainer) return;

  const cleanItems = cleanAndDeduplicate(reel.checklist_items);
  if (!cleanItems || cleanItems.length === 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');

  const savedCep = getStoredCep();
  input.value = formatCep(savedCep);

  const savedRadius = store.get(USER_RADIUS_KEY, '5');
  if (select) select.value = savedRadius;

  // Configura máscara e Enter no input se ainda não configurado
  if (!input.dataset.bound) {
    input.dataset.bound = 'true';
    input.addEventListener('input', (e) => {
      e.target.value = formatCep(e.target.value);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') searchIngredientPrices();
    });
  }

  // Convite amigável
  resultsContainer.innerHTML = `
    <div class="text-[11px] text-stone-600 bg-white/80 border border-stone-200/70 rounded-xl p-3 flex items-center justify-between gap-2 shadow-2xs">
      <div>
        <span>📍 CEP configurado: <strong>${formatCep(savedCep)}</strong>. Toque em <strong>Buscar Preços</strong> para cotar a receita nos mercados mais próximos.</span>
      </div>
      <button onclick="searchIngredientPrices()" class="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-extrabold text-[10px] transition-colors flex-shrink-0 cursor-pointer">
        Cotar agora
      </button>
    </div>
  `;
}

export function setQuickCep(cep) {
  const input = document.getElementById('ingredientCepInput');
  if (input) {
    input.value = formatCep(cep);
    setStoredCep(cep);
    searchIngredientPrices();
  }
}

let isSearchingPrices = false;

export async function searchIngredientPrices() {
  if (isSearchingPrices) return;

  const reel = allReels.find(r => r.id === activeReelId);
  if (!reel) return;

  const cleanItems = cleanAndDeduplicate(reel.checklist_items);
  if (!cleanItems || cleanItems.length === 0) {
    showToast('Esta receita não possui ingredientes cadastrados');
    return;
  }

  const input = document.getElementById('ingredientCepInput');
  const select = document.getElementById('ingredientRadiusSelect');
  const resultsContainer = document.getElementById('ingredientPricesResults');
  const btn = document.getElementById('btnFetchIngredientPrices');
  const btnIcon = document.getElementById('btnFetchPricesIcon');

  const rawCep = input ? input.value : '';
  const cleanCep = String(rawCep).replace(/\D/g, '');

  if (cleanCep.length !== 8) {
    showToast('Informe um CEP válido com 8 dígitos');
    if (input) input.focus();
    return;
  }

  const raio = select ? Number(select.value) || 5 : 5;
  setStoredCep(cleanCep);
  store.set(USER_RADIUS_KEY, String(raio));

  isSearchingPrices = true;
  if (btn) btn.classList.add('opacity-75', 'pointer-events-none');
  if (btnIcon) btnIcon.innerHTML = '<span class="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>';

  resultsContainer.innerHTML = `
    <div class="p-4 bg-white/90 rounded-2xl border border-rose-100 text-center space-y-2 shadow-2xs">
      <div class="inline-block w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-xs font-bold text-stone-800">Cotando ingredientes na InfoPrice...</p>
      <p class="text-[10px] text-stone-500">Mapeando preços e estoques nos mercados num raio de ${raio}km do CEP ${formatCep(cleanCep)}</p>
    </div>
  `;

  try {
    const response = await fetch('/api/ingredients-pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cep: cleanCep,
        raio,
        items: cleanItems
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Erro HTTP ${response.status}`);
    }

    const data = await response.json();
    renderIngredientPricesResults(data, cleanItems);
  } catch (err) {
    console.error('[InfoPrice Search Error]:', err);
    resultsContainer.innerHTML = `
      <div class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-center text-xs text-rose-800 space-y-1">
        <p class="font-bold">Não foi possível consultar os preços no momento</p>
        <p class="text-[11px] text-rose-600">${escapeHtml(err.message)}</p>
        <button onclick="searchIngredientPrices()" class="mt-1 px-3 py-1 bg-white border border-rose-300 rounded-lg text-rose-700 font-bold text-xs hover:bg-rose-100 transition-colors">
          Tentar novamente
        </button>
      </div>
    `;
  } finally {
    isSearchingPrices = false;
    if (btn) btn.classList.remove('opacity-75', 'pointer-events-none');
    if (btnIcon) btnIcon.textContent = '🔍';
  }
}

function renderIngredientPricesResults(data, originalItems) {
  const container = document.getElementById('ingredientPricesResults');
  if (!container) return;

  const stores = data.stores || [];
  const details = data.ingredientDetails || [];
  const summary = data.basketSummary;

  if (stores.length === 0 && (!summary || summary.itemsFound === 0)) {
    container.innerHTML = `
      <div class="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-2xl text-center space-y-1.5">
        <span class="text-lg">🏪</span>
        <h5 class="text-xs font-bold text-amber-900">Nenhuma oferta recente encontrada no raio de ${data.raio}km</h5>
        <p class="text-[11px] text-stone-600 leading-relaxed">
          Os mercados próximos ao CEP <strong>${formatCep(data.cep)}</strong> ainda não reportaram dados de gôndola recentes para esses ingredientes específicos.
        </p>
        <p class="text-[11px] text-stone-500">
          💡 Tente aumentar o raio para <strong>10km</strong> ou <strong>15km</strong> ou teste com os CEPs de exemplo acima.
        </p>
      </div>
    `;
    return;
  }

  // 1. Resumo da Cesta (Total Estimado e Economia)
  let summaryHtml = '';
  if (summary) {
    const economia = summary.maxTotal > summary.minTotal ? (summary.maxTotal - summary.minTotal) : 0;
    summaryHtml = `
      <div class="bg-gradient-to-r from-amber-500 to-rose-500 rounded-2xl p-3 sm:p-3.5 text-white shadow-sm space-y-2 w-full max-w-full overflow-hidden">
        <div class="flex items-center justify-between text-xs flex-wrap gap-1">
          <span class="font-black uppercase tracking-wider text-[10px] text-amber-100 flex items-center gap-1">
            <span>✨</span> Estimativa da Cesta Completa
          </span>
          <span class="bg-white/20 backdrop-blur-xs px-2 py-0.5 rounded-full text-[10px] font-extrabold whitespace-nowrap">
            ${summary.itemsFound} de ${summary.itemsTotal} ingredientes
          </span>
        </div>

        <div class="flex items-baseline justify-between gap-2 flex-wrap">
          <div>
            <span class="text-[11px] text-amber-100 block">Melhor preço somado:</span>
            <span class="text-xl sm:text-2xl font-black tracking-tight">${formatCurrency(summary.minTotal)}</span>
          </div>
          <div class="text-right">
            <span class="text-[11px] text-amber-100 block">Preço médio:</span>
            <span class="text-sm font-bold opacity-90">${formatCurrency(summary.avgTotal)}</span>
          </div>
        </div>

        ${economia > 0 ? `
          <div class="pt-1.5 border-t border-white/20 text-[11px] text-amber-100 flex items-center gap-1 flex-wrap">
            <span>💡</span>
            <span>Você pode economizar até <strong>${formatCurrency(economia)}</strong> escolhendo o mercado certo!</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  // 2. Lojas Mais Próximas & Baratas
  let storesHtml = '';
  if (stores.length > 0) {
    storesHtml = `
      <div class="space-y-2 w-full max-w-full">
        <div class="flex items-center justify-between text-xs">
          <h5 class="font-extrabold text-stone-900 flex items-center gap-1.5">
            <span>🏪</span> Supermercados Próximos
          </h5>
          <span class="text-[10px] text-stone-400 font-semibold">${stores.length} lojas encontradas</span>
        </div>

        <div class="space-y-2 max-h-[300px] overflow-y-auto overflow-x-hidden custom-scroll pr-1 w-full max-w-full">
          ${stores.map((s, idx) => `
            <div class="bg-white rounded-xl p-3 border border-stone-200/80 hover:border-rose-300 transition-all shadow-2xs space-y-2 w-full max-w-full overflow-hidden">
              <div class="flex items-start justify-between gap-2 min-w-0">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="w-4 h-4 rounded-full bg-stone-900 text-white text-[9px] font-black flex items-center justify-center flex-shrink-0">${idx + 1}</span>
                    <h6 class="text-xs font-black text-stone-900 truncate max-w-[150px] xs:max-w-[200px] sm:max-w-none" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</h6>
                    <span class="px-1.5 py-0.2 rounded-md text-[9px] font-bold flex-shrink-0 ${s.itemsFound === s.itemsTotal ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'}">
                      ${s.itemsFound}/${s.itemsTotal} itens
                    </span>
                  </div>
                  <p class="text-[10px] text-stone-500 mt-0.5 truncate" title="${escapeHtml(s.address)}">
                    📍 ${escapeHtml(s.bairro ? `${s.bairro}, ${s.cidade}` : s.address)}
                  </p>
                </div>

                <div class="text-right flex-shrink-0">
                  <span class="text-[10px] text-stone-400 block">Cesta na loja:</span>
                  <span class="text-xs sm:text-sm font-black text-rose-600 whitespace-nowrap">${formatCurrency(s.basketPrice)}</span>
                </div>
              </div>

              <!-- Lista compacta dos itens na loja -->
              <div class="bg-stone-50/80 rounded-lg p-2 text-[10px] text-stone-600 space-y-1 w-full max-w-full overflow-hidden">
                ${s.items.map(it => `
                  <div class="flex items-center justify-between gap-2 min-w-0 w-full">
                    <span class="truncate min-w-0 flex-1" title="${escapeHtml(it.productName || it.ingredient)}">• ${escapeHtml(it.productName || it.ingredient)}</span>
                    <strong class="text-stone-800 flex-shrink-0 whitespace-nowrap ml-1">${formatCurrency(it.price)}</strong>
                  </div>
                `).join('')}
              </div>

              <!-- Ação: Abrir no Google Maps -->
              <div class="flex items-center justify-end pt-0.5">
                <a 
                  href="${escapeHtml(s.mapsUrl)}" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-[10px] font-extrabold transition-colors"
                >
                  <span>🗺️ Ver rota no Google Maps</span>
                  <span>↗</span>
                </a>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // 3. Detalhamento por Ingrediente com Fotos da InfoPrice
  let detailsHtml = '';
  const validDetails = details.filter(d => d.availableNearby);
  if (validDetails.length > 0) {
    detailsHtml = `
      <div class="space-y-1.5 pt-1 w-full max-w-full">
        <details class="group bg-white rounded-xl border border-stone-200/80 p-2.5 w-full max-w-full overflow-hidden">
          <summary class="cursor-pointer text-xs font-extrabold text-stone-800 hover:text-stone-900 flex items-center justify-between select-none">
            <span class="flex items-center gap-1.5 truncate pr-2">
              <span>🏷️</span>
              <span class="truncate">Comparativo de Marcas & Menor Preço (${validDetails.length} itens)</span>
            </span>
            <span class="group-open:rotate-180 transition-transform text-stone-400 text-xs flex-shrink-0">▼</span>
          </summary>

          <div class="pt-2.5 space-y-2 w-full max-w-full">
            ${validDetails.map(it => {
              const best = it.bestOffer || {};
              return `
              <div class="flex items-center gap-2.5 p-2 rounded-lg bg-stone-50 border border-stone-100 min-w-0 w-full overflow-hidden">
                ${best.photo ? `
                  <img src="${escapeHtml(best.photo)}" alt="${escapeHtml(it.query)}" class="w-10 h-10 object-contain rounded-md bg-white border border-stone-200 flex-shrink-0" onerror="this.style.display='none'">
                ` : `
                  <div class="w-10 h-10 rounded-md bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs flex-shrink-0">🥣</div>
                `}
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-1 min-w-0">
                    <span class="text-xs font-extrabold text-stone-900 capitalize truncate min-w-0 flex-1">${escapeHtml(it.query)}</span>
                    <span class="text-xs font-black text-emerald-700 flex-shrink-0 ml-1 whitespace-nowrap">${formatCurrency(it.minPrice)}</span>
                  </div>
                  <p class="text-[10px] text-stone-500 truncate mt-0.5" title="${escapeHtml(best.productName || it.query)}">${escapeHtml(best.productName || it.query)}</p>
                  <p class="text-[9px] text-stone-400 mt-0.5 truncate">Mais barato em: <strong>${escapeHtml(best.storeName || 'Mercado local')}</strong> • Média: ${formatCurrency(it.avgPrice)}</p>
                </div>
              </div>`;
            }).join('')}
          </div>
        </details>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="space-y-3 pt-1">
      ${summaryHtml}
      ${storesHtml}
      ${detailsHtml}
    </div>
  `;
}

function checkUrlForReelParam() {
  const urlParams = new URLSearchParams(window.location.search);
  const reelId = urlParams.get('reel') || window.location.hash.replace('#', '');
  if (reelId) {
    const found = allReels.find(r => r.id === reelId);
    if (found) {
      openModal(found.id);
    }
  }
}

// ==========================================
// PWA & Extração de Reels (Clipboard / Share Target)
// ==========================================

export function extractInstagramUrl(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i);
  return match ? `https://www.instagram.com/reel/${match[1]}/` : null;
}

let pendingClipboardUrl = null;
let lastCheckedClipboard = '';

export function openExtractModal(initialUrl = '') {
  const modal = document.getElementById('extractModal');
  const input = document.getElementById('extractUrlInput');
  resetExtractForm();
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (initialUrl && input) {
      input.value = initialUrl;
    }
  }
}

export function closeExtractModal() {
  const modal = document.getElementById('extractModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

export function resetExtractForm() {
  const form = document.getElementById('extractForm');
  const progress = document.getElementById('extractProgress');
  const errorBox = document.getElementById('extractError');
  const btn = document.getElementById('btnStartExtract');
  if (form) form.classList.remove('hidden');
  if (progress) progress.classList.add('hidden');
  if (errorBox) errorBox.classList.add('hidden');
  if (btn) btn.disabled = false;
}

export async function pasteFromClipboard() {
  const input = document.getElementById('extractUrlInput');
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    showToast('Acesso à área de transferência não suportado ou bloqueado.');
    return;
  }
  try {
    const text = await navigator.clipboard.readText();
    const cleanUrl = extractInstagramUrl(text) || text.trim();
    if (input) {
      input.value = cleanUrl;
      input.focus();
    }
    showToast('Link colado com sucesso!');
  } catch (err) {
    showToast('Permissão para colar foi negada pelo navegador.');
  }
}

export async function startReelExtraction(overrideUrl = null) {
  const input = document.getElementById('extractUrlInput');
  const rawUrl = overrideUrl || (input ? input.value : '');
  const cleanUrl = extractInstagramUrl(rawUrl);

  if (!cleanUrl) {
    showToast('Por favor, informe um link válido de Reels do Instagram.');
    return;
  }

  const form = document.getElementById('extractForm');
  const progress = document.getElementById('extractProgress');
  const errorBox = document.getElementById('extractError');
  const errorMsg = document.getElementById('extractErrorMsg');
  const titleElem = document.getElementById('extractStatusTitle');
  const subElem = document.getElementById('extractStatusSubtitle');

  const stepDownload = document.getElementById('stepDownload');
  const stepGemini = document.getElementById('stepGemini');
  const stepInfoPrice = document.getElementById('stepInfoPrice');

  if (form) form.classList.add('hidden');
  if (errorBox) errorBox.classList.add('hidden');
  if (progress) progress.classList.remove('hidden');

  function updateStep(step) {
    if (step === 1) {
      if (titleElem) titleElem.textContent = 'Baixando vídeo do Instagram...';
      if (subElem) subElem.textContent = 'Obtendo áudio em alta qualidade e metadados';
      if (stepDownload) stepDownload.className = 'flex items-center gap-2 text-rose-600 font-bold';
      if (stepGemini) stepGemini.className = 'flex items-center gap-2 text-stone-400';
      if (stepInfoPrice) stepInfoPrice.className = 'flex items-center gap-2 text-stone-400';
    } else if (step === 2) {
      if (titleElem) titleElem.textContent = 'Analisando receita com Gemini IA...';
      if (subElem) subElem.textContent = 'Transcrevendo áudio e identificando ingredientes sem repetições';
      if (stepDownload) stepDownload.className = 'flex items-center gap-2 text-emerald-600 font-medium';
      if (stepGemini) stepGemini.className = 'flex items-center gap-2 text-rose-600 font-bold';
      if (stepInfoPrice) stepInfoPrice.className = 'flex items-center gap-2 text-stone-400';
    } else if (step === 3) {
      if (titleElem) titleElem.textContent = 'Quase pronto! Organizando receita...';
      if (subElem) subElem.textContent = 'Integrando radar de preços nos supermercados próximos';
      if (stepDownload) stepDownload.className = 'flex items-center gap-2 text-emerald-600 font-medium';
      if (stepGemini) stepGemini.className = 'flex items-center gap-2 text-emerald-600 font-medium';
      if (stepInfoPrice) stepInfoPrice.className = 'flex items-center gap-2 text-rose-600 font-bold';
    }
  }

  updateStep(1);
  const timer1 = setTimeout(() => updateStep(2), 3500);
  const timer2 = setTimeout(() => updateStep(3), 9000);

  try {
    const response = await fetch('/api/extract-reel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cleanUrl })
    });

    clearTimeout(timer1);
    clearTimeout(timer2);

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Falha ao processar o Reels.');
    }

    const newReel = data.reel;
    showToast('🎉 Receita extraída com sucesso!');

    // Higieniza e protege o novo reels
    const realUrl = newReel.url || (newReel.id ? `https://www.instagram.com/reel/${newReel.id}/` : '');
    const realAuthorUrl = newReel.author?.profile_url || (newReel.author?.username ? `https://www.instagram.com/${newReel.author.username}/` : '');
    const cleanReel = { ...newReel };
    cleanReel._tk = obscureString(realUrl);
    cleanReel._atk = obscureString(realAuthorUrl);
    delete cleanReel.url;
    if (cleanReel.author) {
      cleanReel.author = { ...cleanReel.author };
      delete cleanReel.author.profile_url;
    }

    allReels = [cleanReel, ...allReels.filter(r => r.id !== cleanReel.id)];
    applyFiltersAndRender(true);
    populateCreatorsDropdown();
    updateTotalBadge();

    // Fecha o modal de extração e abre os detalhes da nova receita
    closeExtractModal();
    openModal(cleanReel.id);

  } catch (err) {
    clearTimeout(timer1);
    clearTimeout(timer2);
    console.error('[Extract Error]:', err);
    if (progress) progress.classList.add('hidden');
    if (errorBox) {
      errorBox.classList.remove('hidden');
      let msg = err.message || 'Erro ao processar o link. Verifique se o post é público.';
      try {
        const parsed = JSON.parse(msg);
        if (parsed.error?.message) {
          msg = parsed.error.message;
        } else if (parsed.message) {
          msg = parsed.message;
        }
      } catch (e) {}
      if (errorMsg) errorMsg.textContent = msg;
    }
  }
}

export function showClipboardBanner(url) {
  pendingClipboardUrl = url;
  const banner = document.getElementById('clipboardBanner');
  const preview = document.getElementById('clipboardPreviewText');
  if (banner) {
    if (preview) preview.textContent = url;
    banner.classList.remove('hidden');
  }
}

export function dismissClipboardBanner() {
  const banner = document.getElementById('clipboardBanner');
  if (banner) banner.classList.add('hidden');
  if (pendingClipboardUrl) {
    sessionStorage.setItem('dismissed_clip_' + pendingClipboardUrl, '1');
  }
  pendingClipboardUrl = null;
}

export function extractFromClipboardBanner() {
  const url = pendingClipboardUrl;
  dismissClipboardBanner();
  if (url) {
    openExtractModal(url);
    startReelExtraction(url);
  }
}

export async function checkClipboardForReels() {
  if (!navigator.clipboard || !navigator.clipboard.readText) return;
  if (document.visibilityState !== 'visible') return;

  try {
    const text = await navigator.clipboard.readText();
    if (!text || text === lastCheckedClipboard) return;

    const igUrl = extractInstagramUrl(text);
    if (igUrl) {
      lastCheckedClipboard = text;
      if (sessionStorage.getItem('dismissed_clip_' + igUrl)) return;
      showClipboardBanner(igUrl);
    }
  } catch (err) {
    // Permissão não concedida no momento
  }
}

function checkShareTargetAndParams() {
  const params = new URLSearchParams(window.location.search);
  const sharedText = params.get('url') || params.get('text');
  if (sharedText) {
    const igUrl = extractInstagramUrl(sharedText);
    if (igUrl) {
      window.history.replaceState({}, '', '/');
      openExtractModal(igUrl);
      startReelExtraction(igUrl);
    }
  }
}

// Registro do Service Worker PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('[PWA] Service Worker não registrado:', err);
    });
  });
}

// Eventos de detecção automática da prancheta
window.addEventListener('focus', checkClipboardForReels);
document.addEventListener('visibilitychange', checkClipboardForReels);

// Popstate listener (botão voltar/avançar do navegador)
window.addEventListener('popstate', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const reelId = urlParams.get('reel');
  if (reelId) {
    openModal(reelId);
  } else {
    closeModal(false);
  }
});

// Window listeners
window.addEventListener('click', e => {
  const modal = document.getElementById('detailModal');
  if (e.target === modal) closeModal();
});
window.addEventListener('keydown', e => {
  if (!activeReelId) return;
  if (e.key === 'Escape') closeModal();
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === 'ArrowRight') navigateReel(1);
  if (e.key === 'ArrowLeft') navigateReel(-1);
});

// Expor funções globais para eventos inline do DOM (módulos ES isolam escopo)
window.openModal = openModal;
window.closeModal = closeModal;
window.setCategory = setCategory;
window.onCreatorChange = onCreatorChange;
window.onSortChange = onSortChange;
window.resetAllFilters = resetAllFilters;
window.clearSearch = clearSearch;
window.toggleTagFilter = toggleTagFilter;
window.loadMoreItems = loadMoreItems;
window.onCheckChange = onCheckChange;
window.resetChecklist = resetChecklist;
window.copyChecklist = copyChecklist;
window.shareReel = shareReel;
window.toggleFavorite = toggleFavorite;
window.navigateReel = navigateReel;
window.openOriginalSource = openOriginalSource;
window.openAuthorProfile = openAuthorProfile;
window.searchIngredientPrices = searchIngredientPrices;
window.setQuickCep = setQuickCep;

// Hero / Tela de Entrada Actions
export async function pasteHeroInput() {
  try {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      showToast('Seu navegador não permite colar automaticamente');
      return;
    }
    const text = await navigator.clipboard.readText();
    const clean = (text || '').trim();
    const heroInput = document.getElementById('heroUrlInput');
    if (heroInput && clean) {
      heroInput.value = clean;
      showToast('📋 Link colado!');
      if (clean.includes('instagram.com/')) {
        handleHeroExtract();
      }
    } else {
      showToast('Área de transferência vazia');
    }
  } catch (err) {
    showToast('Toque e segure no campo para colar');
  }
}

export function handleHeroExtract() {
  const heroInput = document.getElementById('heroUrlInput');
  const url = (heroInput ? heroInput.value : '').trim();
  if (!url) {
    openExtractModal();
    return;
  }
  if (!url.includes('instagram.com/')) {
    showToast('Por favor, insira um link válido do Instagram Reels');
    return;
  }
  openExtractModal(url);
  startReelExtraction(url);
}

export function applyHeroQuickSearch(term) {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = term;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) clearBtn.classList.remove('hidden');

  const filterBar = document.querySelector('section.max-w-7xl');
  if (filterBar) {
    filterBar.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// PWA & Extração de novos Reels
window.openExtractModal = openExtractModal;
window.closeExtractModal = closeExtractModal;
window.resetExtractForm = resetExtractForm;
window.pasteFromClipboard = pasteFromClipboard;
window.startReelExtraction = startReelExtraction;
window.dismissClipboardBanner = dismissClipboardBanner;
window.extractFromClipboardBanner = extractFromClipboardBanner;
window.pasteHeroInput = pasteHeroInput;
window.handleHeroExtract = handleHeroExtract;
window.applyHeroQuickSearch = applyHeroQuickSearch;

// Run
loadReels();
