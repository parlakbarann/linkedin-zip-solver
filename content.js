/**
 * LinkedIn Zip Solver - Content Script
 * @description LinkedIn Zip oyununu otomatik olarak çözen Chrome eklentisi
 * @version 1.0.0
 */

// ============================================================================// CONSTANTS// ============================================================================

const CONFIG = {
  CLICK_DELAY_MS: 100,           // Hücreler arası tıklama gecikmesi
  NOTIFICATION_DURATION_MS: 3000, // Bildirim gösterim süresi
  NOTIFICATION_ANIMATION_MS: 300, // Bildirim animasyon süresi
  SELECTORS: {
    REHYDRATE_DATA: 'rehydrate-data',
    CELL: (idx) => `[data-cell-idx="${idx}"]`,
    NOTIFICATION: 'zip-solver-notification',
    ANIMATION_STYLE: 'zip-solver-animation-style'
  },
  REGEX: {
    // LinkedIn'in kullandığı escaped format: \"solution\":[...]
    SOLUTION: /\\\"solution\\\":\[(.*?)(\s*)\]/s
  },
  NOTIFICATION_TYPES: {
    success: { color: '#10b981', icon: '✅' },
    error: { color: '#ef4444', icon: '❌' },
    info: { color: '#3b82f6', icon: 'ℹ️' },
    warning: { color: '#f59e0b', icon: '⚠️' }
  }
};

// ============================================================================// STATE MANAGEMENT// ============================================================================

let activeTimeouts = [];
let animationStyleInjected = false;

/**
 * Tüm aktif timeout'ları temizler (memory leak önleme)
 */
function clearAllTimeouts() {
  activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
  activeTimeouts = [];
}

/**
 * Timeout ekler ve referansını saklar
 * @param {Function} callback - Çalıştırılacak fonksiyon
 * @param {number} delay - Gecikme süresi (ms)
 * @returns {number} Timeout ID
 */
function addTimeout(callback, delay) {
  const timeoutId = setTimeout(() => {
    callback();
    // Timeout tamamlandıktan sonra listeden çıkar
    activeTimeouts = activeTimeouts.filter(id => id !== timeoutId);
  }, delay);
  activeTimeouts.push(timeoutId);
  return timeoutId;
}

// ============================================================================// GAME SOLVING LOGIC// ============================================================================ 

/**
 * LinkedIn Zip oyununu çözen ana fonksiyon
 * @returns {Promise<void>}
 */
async function solveZipGame() {
  try {
    console.log('🎮 Zip oyunu çözülüyor...');
    
    // Önceki çözüm işlemlerini temizle
    clearAllTimeouts();
    
    // Oyun verilerini al
    const solution = await extractSolution();
    
    if (!solution || solution.length === 0) {
      throw new Error('Çözüm boş veya geçersiz');
    }
    
    console.log('✅ Çözüm bulundu:', solution);
    showNotification('Oyun çözülüyor...', 'info');
    
    // Çözümü uygula
    await applySolution(solution);
    
  } catch (error) {
    console.error('❌ Hata oluştu:', error);
    showNotification(`Hata: ${error.message}`, 'error');
  }
}

/**
 * Sayfadan oyun çözümünü çıkarır
 * @returns {Promise<number[]>} Çözüm dizisi
 * @throws {Error} Çözüm bulunamazsa
 */
async function extractSolution() {
  // Rehydrate data elementini bul
  const scriptElement = document.getElementById(CONFIG.SELECTORS.REHYDRATE_DATA);
  
  if (!scriptElement) {
    throw new Error('Oyun verileri bulunamadı. Sayfanın tamamen yüklendiğinden emin olun.');
  }
  
  const scriptContent = scriptElement.textContent;
  
  if (!scriptContent || scriptContent.trim().length === 0) {
    throw new Error('Oyun verileri boş');
  }
  
  // Çözümü bul ve parse et (multiple regex patterns dene)
  let solutionMatch = scriptContent.match(CONFIG.REGEX.SOLUTION);
  
  // Eğer bulamazsa, alternatif pattern dene (normal quotes)
  if (!solutionMatch) {
    solutionMatch = scriptContent.match(/