// ========== STATE ==========
const state = {
  pages: [], // { id, originalImg, editedImg, rotation, enhanced, grayscale }
  editingIndex: -1,
};

// ========== DOM ==========
const $ = id => document.getElementById(id);
const emptyState = $('emptyState');
const pagesContainer = $('pagesContainer');
const pagesGrid = $('pagesGrid');
const bottomBar = $('bottomBar');
const pageCount = $('pageCount');
const editorModal = $('editorModal');
const editorCanvas = $('editorCanvas');
const pdfModal = $('pdfModal');
const loadingOverlay = $('loadingOverlay');
const loadingText = $('loadingText');
const toast = $('toast');
const cameraInput = $('cameraInput');
const galleryInput = $('galleryInput');

// ========== INIT ==========
function init() {
  // Buttons
  $('btnCamera').addEventListener('click', () => cameraInput.click());
  $('btnGallery').addEventListener('click', () => galleryInput.click());
  $('btnAddMore').addEventListener('click', () => galleryInput.click());
  $('btnClearAll').addEventListener('click', clearAll);
  $('btnExportPDF').addEventListener('click', () => pdfModal.style.display = 'flex');

  // File inputs
  cameraInput.addEventListener('change', handleFiles);
  galleryInput.addEventListener('change', handleFiles);

  // Editor
  $('btnCloseEditor').addEventListener('click', closeEditor);
  $('btnCancelEdit').addEventListener('click', closeEditor);
  $('btnSaveEdit').addEventListener('click', saveEdit);
  $('btnRotateLeft').addEventListener('click', () => rotate(-90));
  $('btnRotateRight').addEventListener('click', () => rotate(90));
  $('btnEnhance').addEventListener('click', enhance);
  $('btnGrayscale').addEventListener('click', grayscale);

  // PDF modal
  $('btnClosePdf').addEventListener('click', () => pdfModal.style.display = 'none');
  $('btnCancelPdf').addEventListener('click', () => pdfModal.style.display = 'none');
  $('btnGeneratePdf').addEventListener('click', generatePDF);

  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ========== FILE HANDLING ==========
function handleFiles(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  showLoading('Memproses gambar...');
  let loaded = 0;

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        // Auto resize large image first to optimize memory and speed
        const optimizedImg = resizeImage(img, 1280);
        
        state.pages.push({
          id: Date.now() + Math.random(),
          originalImg: optimizedImg,
          editedImg: null,
          rotation: 0,
          enhanced: false,
          grayscale: false,
        });
        loaded++;
        if (loaded === files.length) {
          hideLoading();
          renderPages();
          showToast(`${files.length} halaman ditambahkan!`);
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  e.target.value = '';
}

// Helper: Resize image to max dimension
function resizeImage(img, maxDim) {
  if (img.width <= maxDim && img.height <= maxDim) return img;

  const canvas = document.createElement('canvas');
  let w = img.width;
  let h = img.height;

  if (w > h) {
    if (w > maxDim) {
      h *= maxDim / w;
      w = maxDim;
    }
  } else {
    if (h > maxDim) {
      w *= maxDim / h;
      h = maxDim;
    }
  }

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const resizedImg = new Image();
  resizedImg.src = canvas.toDataURL('image/jpeg', 0.85);
  return resizedImg;
}

// ========== RENDER ==========
function renderPages() {
  const count = state.pages.length;
  pageCount.textContent = `${count} halaman`;

  if (count === 0) {
    emptyState.style.display = 'flex';
    pagesContainer.style.display = 'none';
    bottomBar.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  pagesContainer.style.display = 'block';
  bottomBar.style.display = 'flex';

  pagesGrid.innerHTML = '';
  state.pages.forEach((page, i) => {
    const card = document.createElement('div');
    card.className = 'page-card';
    card.draggable = true;
    card.dataset.index = i;

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.className = 'page-thumb';
    drawThumb(thumbCanvas, page);

    const info = document.createElement('div');
    info.className = 'page-info';
    info.innerHTML = `
      <span class="page-number">#${i + 1}</span>
      <div class="page-actions">
        <button onclick="editPage(${i})" title="Edit">✏️</button>
        <button onclick="deletePage(${i})" title="Hapus">🗑️</button>
      </div>
    `;

    card.appendChild(thumbCanvas);
    card.appendChild(info);

    // Drag & drop
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('drop', handleDrop);
    card.addEventListener('dragend', handleDragEnd);

    // Touch drag
    card.addEventListener('touchstart', handleTouchStart, { passive: true });
    card.addEventListener('touchmove', handleTouchMove, { passive: false });
    card.addEventListener('touchend', handleTouchEnd);

    pagesGrid.appendChild(card);
  });
}

function drawThumb(canvas, page) {
  const img = page.editedImg || page.originalImg;
  const rot = page.rotation;
  const isRotated = rot === 90 || rot === 270;
  const w = isRotated ? img.height : img.width;
  const h = isRotated ? img.width : img.height;

  // Thumbnail size
  const maxW = 300;
  const scale = maxW / w;
  canvas.width = maxW;
  canvas.height = h * scale;

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);

  const drawW = rot === 90 || rot === 270 ? canvas.height : canvas.width;
  const drawH = rot === 90 || rot === 270 ? canvas.width : canvas.height;
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

// ========== DRAG & DROP ==========
let dragIndex = -1;

function handleDragStart(e) {
  dragIndex = parseInt(e.currentTarget.dataset.index);
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  const dropIndex = parseInt(e.currentTarget.dataset.index);
  e.currentTarget.classList.remove('drag-over');

  if (dragIndex !== dropIndex) {
    const item = state.pages.splice(dragIndex, 1)[0];
    state.pages.splice(dropIndex, 0, item);
    renderPages();
    showToast('Halaman dipindahkan!');
  }
}

function handleDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

// Touch drag support
let touchStartY = 0;
let touchIndex = -1;

function handleTouchStart(e) {
  touchIndex = parseInt(e.currentTarget.dataset.index);
  touchStartY = e.touches[0].clientY;
}

function handleTouchMove(e) {
  // Prevent scroll when dragging
  if (touchIndex >= 0) e.preventDefault();
}

function handleTouchEnd(e) {
  touchIndex = -1;
}

// ========== PAGE ACTIONS ==========
function editPage(index) {
  state.editingIndex = index;
  const page = state.pages[index];
  drawEditor(page);
  editorModal.style.display = 'flex';
}

function deletePage(index) {
  state.pages.splice(index, 1);
  renderPages();
  showToast('Halaman dihapus');
}

function clearAll() {
  if (state.pages.length === 0) return;
  if (confirm('Hapus semua halaman?')) {
    state.pages = [];
    renderPages();
    showToast('Semua halaman dihapus');
  }
}

// ========== EDITOR ==========
function drawEditor(page) {
  const img = page.editedImg || page.originalImg;
  const rot = page.rotation;
  const isRotated = rot === 90 || rot === 270;
  const w = isRotated ? img.height : img.width;
  const h = isRotated ? img.width : img.height;

  // Scale to fit
  const maxW = 460;
  const maxH = window.innerHeight * 0.45;
  const scale = Math.min(maxW / w, maxH / h, 1);

  editorCanvas.width = w * scale;
  editorCanvas.height = h * scale;

  const ctx = editorCanvas.getContext('2d');
  ctx.save();
  ctx.translate(editorCanvas.width / 2, editorCanvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);

  const drawW = isRotated ? editorCanvas.height : editorCanvas.width;
  const drawH = isRotated ? editorCanvas.width : editorCanvas.height;
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

function rotate(deg) {
  const page = state.pages[state.editingIndex];
  page.rotation = (page.rotation + deg + 360) % 360;
  drawEditor(page);
}

function enhance() {
  const page = state.pages[state.editingIndex];
  const img = page.editedImg || page.originalImg;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = img.width;
  tempCanvas.height = img.height;
  const ctx = tempCanvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const data = imageData.data;

  // Increase contrast & brightness
  const contrast = 1.4;
  const brightness = 10;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(contrast * (data[i] - 128) + 128 + brightness);
    data[i + 1] = clamp(contrast * (data[i + 1] - 128) + 128 + brightness);
    data[i + 2] = clamp(contrast * (data[i + 2] - 128) + 128 + brightness);
  }

  ctx.putImageData(imageData, 0, 0);

  const newImg = new Image();
  newImg.onload = () => {
    page.editedImg = newImg;
    page.enhanced = true;
    drawEditor(page);
    showToast('Enhanced! ✨');
  };
  newImg.src = tempCanvas.toDataURL('image/jpeg', 0.95);
}

function grayscale() {
  const page = state.pages[state.editingIndex];
  const img = page.editedImg || page.originalImg;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = img.width;
  tempCanvas.height = img.height;
  const ctx = tempCanvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = gray;
  }

  ctx.putImageData(imageData, 0, 0);

  const newImg = new Image();
  newImg.onload = () => {
    page.editedImg = newImg;
    page.grayscale = true;
    drawEditor(page);
    showToast('Grayscale! 🔲');
  };
  newImg.src = tempCanvas.toDataURL('image/jpeg', 0.95);
}

function saveEdit() {
  renderPages();
  closeEditor();
  showToast('Halaman disimpan! 💾');
}

function closeEditor() {
  editorModal.style.display = 'none';
  state.editingIndex = -1;
}

function clamp(val) {
  return Math.max(0, Math.min(255, val));
}

// ========== PDF GENERATION ==========
async function generatePDF() {
  if (state.pages.length === 0) return;

  pdfModal.style.display = 'none';
  showLoading('Membuat PDF...');

  const { jsPDF } = window.jspdf;

  const paperSizes = {
    a4: [210, 297],
    letter: [215.9, 279.4],
    legal: [215.9, 355.6],
    f4: [215, 330],
  };

  const paperSize = $('paperSize').value;
  const orientation = $('orientation').value;
  const quality = parseFloat($('quality').value);
  const fileName = $('fileName').value || 'scan';
  const margin = parseInt($('margin').value);

  const [pw, ph] = paperSizes[paperSize];
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: [pw, ph],
  });

  const pageW = orientation === 'landscape' ? ph : pw;
  const pageH = orientation === 'landscape' ? pw : ph;
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin * 2;

  for (let i = 0; i < state.pages.length; i++) {
    loadingText.textContent = `Memproses halaman ${i + 1}/${state.pages.length}...`;

    if (i > 0) doc.addPage();

    const page = state.pages[i];
    const img = page.editedImg || page.originalImg;
    const rot = page.rotation;

    // Draw to temp canvas with rotation
    const isRotated = rot === 90 || rot === 270;
    const srcW = isRotated ? img.height : img.width;
    const srcH = isRotated ? img.width : img.height;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = srcW;
    tempCanvas.height = srcH;
    const ctx = tempCanvas.getContext('2d');

    ctx.save();
    ctx.translate(srcW / 2, srcH / 2);
    ctx.rotate((rot * Math.PI) / 180);
    const drawW = isRotated ? srcH : srcW;
    const drawH = isRotated ? srcW : srcH;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // Fit to page
    const imgRatio = srcW / srcH;
    const pageRatio = contentW / contentH;
    let finalW, finalH;

    if (imgRatio > pageRatio) {
      finalW = contentW;
      finalH = contentW / imgRatio;
    } else {
      finalH = contentH;
      finalW = contentH * imgRatio;
    }

    const x = margin + (contentW - finalW) / 2;
    const y = margin + (contentH - finalH) / 2;

    const imgData = tempCanvas.toDataURL('image/jpeg', quality);
    doc.addImage(imgData, 'JPEG', x, y, finalW, finalH);
  }

  loadingText.textContent = 'Menyimpan PDF...';
  await new Promise(r => setTimeout(r, 100));

  doc.save(`${fileName}.pdf`);
  hideLoading();
  showToast('PDF berhasil dibuat! 🎉');
}

// ========== UTILS ==========
function showLoading(text) {
  loadingText.textContent = text || 'Loading...';
  loadingOverlay.style.display = 'flex';
}

function hideLoading() {
  loadingOverlay.style.display = 'none';
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ========== START ==========
init();
