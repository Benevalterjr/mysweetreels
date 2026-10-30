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

// Tokens ativos e estado do player Blob (mantidos fora do DOM)
let activeReelToken = '';
let activeAuthorToken = '';
let currentBlobUrl = null;
let currentFetchController = null;

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

// Reproduz o vídeo através de um Blob URL privado na memória RAM da aba
async function playVideoSecurely(videoPath) {
  const videoPlayer = document.getElementById('modalVideoPlayer');
  
  // Limpa qualquer Blob URL antigo para evitar acúmulo de memória
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
  if (currentFetchController) {
    currentFetchController.abort();
    currentFetchController = null;
  }

  videoPlayer.pause();
  videoPlayer.removeAttribute('src');

  try {
    currentFetchController = new AbortController();
    const response = await fetch(videoPath, { signal: currentFetchController.signal });
    if (!response.ok) throw new Error('Falha no stream');
    const videoBlob = await response.blob();
    currentBlobUrl = URL.createObjectURL(videoBlob);
    videoPlayer.src = currentBlobUrl;
    videoPlayer.play().catch(() => {});
  } catch (err) {
    if (err.name === 'AbortError') return;
    // Fallback gracioso
    videoPlayer.src = videoPath;
    videoPlayer.play().catch(() => {});
  }
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
    
    renderCategoryPills();
    populateCreatorsDropdown();
    renderPopularTags();
    setupInfiniteScroll();
    applyFiltersAndRender(true);
    updateTotalBadge();
    updateSiteJsonLd();
    checkUrlForReelParam();
  } catch (err) {
    console.error('Erro ao carregar dados:', err);
  }
}

function updateTotalBadge() {
  const lbl = document.getElementById('totalReelsLabel');
  if (lbl) {
    lbl.textContent = `${allReels.length} ${allReels.length === 1 ? 'Post' : 'Posts'}`;
  }
}

// Category Pills
function renderCategoryPills() {
  const container = document.getElementById('categoryFilters');
  const categories = Array.from(new Set(allReels.map(r => r.category).filter(Boolean)));
  
  let html = `
    <button class="cat-pill active px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs font-bold transition-all bg-stone-900 text-white shadow-sm flex-shrink-0" data-category="ALL" onclick="setCategory('ALL')">
      🔥 Todos
    </button>
  `;

  categories.forEach(cat => {
    html += `
      <button class="cat-pill px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs font-bold transition-all bg-stone-100 text-stone-600 hover:bg-stone-200 flex-shrink-0" data-category="${cat}" onclick="setCategory('${cat}')">
        ${getCategoryIcon(cat)} ${cat}
      </button>
    `;
  });

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
    if (btn.dataset.category === cat) {
      btn.className = 'cat-pill active px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs font-bold transition-all bg-stone-900 text-white shadow-sm flex-shrink-0';
    } else {
      btn.className = 'cat-pill px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs font-bold transition-all bg-stone-100 text-stone-600 hover:bg-stone-200 flex-shrink-0';
    }
  });
  applyFiltersAndRender(true);
}

// Populate Creator Dropdown dynamically
function populateCreatorsDropdown() {
  const select = document.getElementById('creatorSelect');
  if (!select) return;
  
  const creators = Array.from(new Set(allReels.map(r => r.author?.username).filter(Boolean)));
  select.innerHTML = '<option value="ALL">👤 Todos Criadores</option>' + 
    creators.map(c => `<option value="${c}">@${c}</option>`).join('');
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
      <button onclick="toggleTagFilter('${tag}')" class="tag-pill px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition-all flex-shrink-0 ${currentTag === tag ? 'bg-rose-500 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}">
        #${tag}
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
    const matchCat = currentCategory === 'ALL' || r.category === currentCategory;
    const matchCreator = currentCreator === 'ALL' || (r.author?.username === currentCreator);
    const matchTag = currentTag === 'ALL' || (r.tags && r.tags.some(t => t.toLowerCase() === currentTag.toLowerCase()));
    
    const query = currentSearch.toLowerCase();
    const matchSearch = !query || 
      (r.title && r.title.toLowerCase().includes(query)) ||
      (r.summary && r.summary.toLowerCase().includes(query)) ||
      (r.transcript && r.transcript.toLowerCase().includes(query)) ||
      (r.author?.name && r.author.name.toLowerCase().includes(query)) ||
      (r.author?.username && r.author.username.toLowerCase().includes(query)) ||
      (r.tags && r.tags.some(t => t.toLowerCase().includes(query))) ||
      (r.checklist_items && r.checklist_items.some(i => i.toLowerCase().includes(query)));

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
  grid.innerHTML = visible.map(r => `
    <div class="masonry-item bg-white rounded-2xl sm:rounded-3xl overflow-hidden border border-stone-200/80 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group flex flex-col" onclick="openModal('${r.id}')">
      
      <!-- Video / Facade Cover (Vertical 9:16) -->
      <div class="relative bg-stone-100 aspect-[9/14] sm:aspect-[9/13] overflow-hidden flex items-center justify-center">
        ${r.thumbnail ? `
          <img src="${r.thumbnail}" alt="${r.title}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
        ` : `
          <div class="w-full h-full bg-gradient-to-br from-rose-500/80 to-amber-500/80 flex items-center justify-center p-4 text-center text-white">
            <span class="text-xs font-bold">${r.category}</span>
          </div>
        `}
        
        <!-- Category Pill Badge -->
        <div class="absolute top-2 left-2 sm:top-2.5 sm:left-2.5 bg-white/95 backdrop-blur-md px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-extrabold text-stone-800 shadow-xs">
          ${getCategoryIcon(r.category)} ${r.category.split('&')[0].trim()}
        </div>

        <!-- Play overlay button -->
        <div class="absolute inset-0 bg-black/15 group-hover:bg-black/30 flex items-center justify-center transition-colors">
          <div class="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/95 text-rose-600 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
            <svg class="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>

        <!-- Checklist count tag -->
        ${(() => {
          const cCount = cleanAndDeduplicate(r.checklist_items).length;
          return cCount > 0 ? `
            <div class="absolute bottom-2 left-2 sm:bottom-2.5 sm:left-2.5 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold text-white flex items-center gap-1">
              <span>📋 ${cCount} itens</span>
            </div>
          ` : '';
        })()}
      </div>

      <!-- Card Content -->
      <div class="p-2.5 sm:p-4 flex flex-col flex-1">
        <h3 class="text-xs sm:text-sm font-extrabold text-stone-900 group-hover:text-rose-600 transition-colors leading-tight line-clamp-2">
          ${r.title}
        </h3>

        <div class="mt-2 pt-2 border-t border-stone-100 flex items-center justify-between text-[10px] sm:text-xs text-stone-400">
          <span class="font-bold text-stone-700 truncate max-w-[100px] sm:max-w-[140px]">
            @${r.author?.username || 'criador'}
          </span>
          <span class="text-rose-600 font-extrabold">
            Ver →
          </span>
        </div>
      </div>

    </div>
  `).join('');

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
    counter.textContent = `${totalFiltered} ${totalFiltered === 1 ? 'Reels' : 'Reels'}`;
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
      chipsHtml += `<span class="inline-flex items-center gap-1 bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full text-[11px] font-bold">@${currentCreator} <button onclick="onCreatorChange('ALL')" class="text-stone-400 hover:text-stone-600">✕</button></span>`;
    }
    if (currentTag !== 'ALL') {
      chipsHtml += `<span class="inline-flex items-center gap-1 bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full text-[11px] font-bold">#${currentTag} <button onclick="toggleTagFilter('${currentTag}')" class="text-rose-400 hover:text-rose-600">✕</button></span>`;
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
    loadCloudinaryVideoPlayer(reel.video_file);
  } else {
    loadInstagramEmbed(reel.id);
  }

  // Interactive Checklist
  document.getElementById('modalChecklistTitle').textContent = `📋 ${reel.checklist_title || 'Componentes / Ingredientes'}`;
  const checklistList = document.getElementById('modalChecklistItems');
  const cleanItems = cleanAndDeduplicate(reel.checklist_items);
  if (cleanItems && cleanItems.length > 0) {
    checklistList.innerHTML = cleanItems.map((item, idx) => `
      <li class="flex items-start gap-2 p-1 rounded-lg hover:bg-stone-100/70 cursor-pointer select-none" onclick="toggleCheck('${reel.id}_${idx}')">
        <input type="checkbox" id="check_${reel.id}_${idx}" class="mt-0.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer">
        <label for="check_${reel.id}_${idx}" class="cursor-pointer leading-tight">${item}</label>
      </li>
    `).join('');
    checklistList.parentElement.classList.remove('hidden');
  } else {
    checklistList.parentElement.classList.add('hidden');
  }

  // Steps
  const stepsList = document.getElementById('modalSteps');
  if (reel.steps_or_tips && reel.steps_or_tips.length > 0) {
    stepsList.innerHTML = reel.steps_or_tips.map((step, idx) => `
      <li class="flex items-start gap-2.5">
        <span class="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-rose-100 text-rose-700 text-[10px] sm:text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">${idx + 1}</span>
        <span class="text-stone-700 leading-tight">${step}</span>
      </li>
    `).join('');
    stepsList.parentElement.classList.remove('hidden');
  } else {
    stepsList.parentElement.classList.add('hidden');
  }

  // Transcript
  document.getElementById('modalTranscript').textContent = `"${reel.transcript}"`;

  // Tags
  const tagsContainer = document.getElementById('modalTags');
  if (reel.tags && reel.tags.length > 0) {
    tagsContainer.innerHTML = reel.tags.map(t => `
      <button onclick="closeModal(); toggleTagFilter('${t}')" class="px-2 py-0.5 rounded-md bg-stone-100 hover:bg-rose-50 hover:text-rose-600 text-stone-600 text-[11px] font-semibold transition-colors">
        #${t}
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

  // Dynamic SEO & JSON-LD
  updateReelSeo(reel);
}

function toggleCheck(id) {
  const cb = document.getElementById(`check_${id}`);
  if (cb) cb.checked = !cb.checked;
}

function loadCloudinaryVideoPlayer(videoUrl) {
  const container = document.getElementById('modalEmbedContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="relative w-full h-[500px] sm:h-[560px] bg-stone-900 rounded-2xl overflow-hidden flex items-center justify-center shadow-inner">
      <video 
        id="modalVideoPlayer"
        src="${videoUrl}" 
        controls 
        autoplay 
        playsinline 
        loop 
        preload="metadata"
        class="w-full h-full object-contain rounded-2xl bg-stone-950"
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
      class="w-full h-[500px] sm:h-[560px] border-0 rounded-2xl bg-white shadow-none block"
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
  const fullVideo = `${origin}${reel.video_file || ''}`;

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
  if (e.key === 'Escape') closeModal();
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
window.toggleCheck = toggleCheck;
window.openOriginalSource = openOriginalSource;
window.openAuthorProfile = openAuthorProfile;

// Run
loadReels();
