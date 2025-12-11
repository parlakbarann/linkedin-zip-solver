/**
 * LinkedIn Zip Solver - Content Script
 * @description LinkedIn Zip oyununu otomatik olarak çözen Chrome eklentisi
 * @version 1.0.0
 */

// ============================================================================
// CONSTANTS
// ============================================================================

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
    // LinkedIn'in kullandığı escaped format: \\"solution\\":[...]
    SOLUTION: /\\"solution\\":\[(.*?)\]/s
  },
  NOTIFICATION_TYPES: {
    success: { color: '#10b981', icon: '✅' },
    error: { color: '#ef4444', icon: '❌' },
    info: { color: '#3b82f6', icon: 'ℹ️' },
    warning: { color: '#f59e0b', icon: '⚠️' }
  }
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

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

// ============================================================================
// GAME SOLVING LOGIC
// ============================================================================

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
    solutionMatch = scriptContent.match(/"solution":\[([^\]]+)\]/);
  }
  
  // Eğer hala bulamazsa, daha genel pattern dene
  if (!solutionMatch) {
    solutionMatch = scriptContent.match(/solution.*?\[([^\]]+)\]/);
  }
  
  if (!solutionMatch || !solutionMatch[1]) {
    throw new Error('Çözüm verisi bulunamadı. LinkedIn oyun yapısı değişmiş olabilir.');
  }
  
  // Güvenli JSON parsing
  try {
    let solutionData = solutionMatch[1];
    
    // undefined veya boş string kontrolü
    if (!solutionData || solutionData === 'undefined' || solutionData.trim() === '') {
      throw new Error('Çözüm verisi boş veya geçersiz');
    }
    
    // Fazla whitespace'leri temizle
    solutionData = solutionData.trim();
    
    // Parse et - artık direkt sayılar olduğu için [ ] ekleyerek
    const solution = JSON.parse('[' + solutionData + ']');
    
    // Validation
    if (!Array.isArray(solution)) {
      throw new Error('Çözüm geçerli bir dizi değil');
    }
    
    if (solution.some(cell => typeof cell !== 'number' || cell < 0)) {
      throw new Error('Çözüm geçersiz hücre numaraları içeriyor');
    }
    
    return solution;
    
  } catch (parseError) {
    throw new Error(`Çözüm parse edilemedi: ${parseError.message}`);
  }
}

/**
 * Çözümü uygular (hücrelere tıklar)
 * @param {number[]} solution - Tıklanacak hücre numaraları
 * @returns {Promise<void>}
 */
async function applySolution(solution) {
  return new Promise((resolve, reject) => {
    let completedClicks = 0;
    let failedClicks = 0;
    
    solution.forEach((cellNumber, index) => {
      addTimeout(() => {
        const success = clickCell(cellNumber);
        
        if (success) {
          completedClicks++;
        } else {
          failedClicks++;
        }
        
        // Son hamle
        if (index === solution.length - 1) {
          addTimeout(() => {
            console.log(`🎉 Oyun çözüldü! (${completedClicks} başarılı, ${failedClicks} başarısız)`);
            
            if (failedClicks > 0) {
              showNotification(
                `Oyun çözüldü! (${failedClicks} hata ile)`,
                'warning'
              );
            } else {
              showNotification('Oyun başarıyla çözüldü! 🎉', 'success');
            }
            
            resolve();
          }, CONFIG.CLICK_DELAY_MS);
        }
      }, index * CONFIG.CLICK_DELAY_MS);
    });
  });
}

/**
 * Belirtilen hücreye tıklar
 * @param {number} cellNumber - Hücre numarası
 * @returns {boolean} Başarılı olursa true
 */
function clickCell(cellNumber) {
  const cell = document.querySelector(CONFIG.SELECTORS.CELL(cellNumber));
  
  if (!cell) {
    console.warn(`⚠️ Hücre bulunamadı: ${cellNumber}`);
    return false;
  }
  
  try {
    // Farklı event türleri ile tıklama simülasyonu
    // (LinkedIn'in farklı event listener'larını tetiklemek için)
    
    // Standard click
    cell.click();
    
    // Mouse events
    const mouseEvents = [
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }),
      new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }),
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
    ];
    
    mouseEvents.forEach(event => cell.dispatchEvent(event));
    
    // Pointer events (modern API)
    const pointerEvents = [
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }),
      new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window })
    ];
    
    pointerEvents.forEach(event => cell.dispatchEvent(event));
    
    console.log(`✓ Hücre tıklandı: ${cellNumber}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Hücre tıklanamadı (${cellNumber}):`, error);
    return false;
  }
}

// ============================================================================
// NOTIFICATION SYSTEM
// ============================================================================

/**
 * Kullanıcıya bildirim gösterir
 * @param {string} message - Gösterilecek mesaj
 * @param {string} type - Bildirim tipi (success, error, info, warning)
 */
function showNotification(message, type = 'info') {
  // Input validation
  if (!message || typeof message !== 'string') {
    console.warn('Geçersiz bildirim mesajı');
    return;
  }
  
  // Type validation
  if (typeof type !== 'string') {
    console.warn('Geçersiz bildirim tipi, info kullanılıyor');
    type = 'info';
  }
  
  // Animasyon stilini sadece bir kez ekle (performans optimizasyonu)
  if (!animationStyleInjected) {
    injectAnimationStyles();
    animationStyleInjected = true;
  }
  
  // Varolan bildirimi kaldır
  removeExistingNotification();
  
  // Yeni bildirim oluştur
  const notification = createNotificationElement(message, type);
  
  // DOM'a ekle
  if (document.body) {
    document.body.appendChild(notification);
    
    // Otomatik kaldırma
    addTimeout(() => {
      hideNotification(notification);
    }, CONFIG.NOTIFICATION_DURATION_MS);
  } else {
    console.warn('document.body bulunamadı, bildirim gösterilemedi');
  }
}

/**
 * Varolan bildirimi DOM'dan kaldırır
 */
function removeExistingNotification() {
  const existingNotification = document.getElementById(CONFIG.SELECTORS.NOTIFICATION);
  if (existingNotification) {
    existingNotification.remove();
  }
}

/**
 * Bildirim elementi oluşturur
 * @param {string} message - Mesaj
 * @param {string} type - Tip
 * @returns {HTMLDivElement}
 */
function createNotificationElement(message, type) {
  const notification = document.createElement('div');
  notification.id = CONFIG.SELECTORS.NOTIFICATION;
  
  // Güvenlik: XSS koruması için textContent kullan
  // Type validation ve safe lowercase
  const safeType = (type && typeof type === 'string') ? type.toLowerCase() : 'info';
  const notificationConfig = CONFIG.NOTIFICATION_TYPES[safeType] || CONFIG.NOTIFICATION_TYPES.info;
  const icon = notificationConfig?.icon || 'ℹ️';
  notification.textContent = `${icon} ${message}`;
  
  // Stil uygula
  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    backgroundColor: notificationConfig.color,
    color: 'white',
    padding: '16px 24px',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1), 0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    zIndex: '2147483647', // Maximum z-index
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    maxWidth: '300px',
    wordWrap: 'break-word',
    animation: 'zipSolverSlideIn 0.3s ease-out',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'transform 0.2s ease, opacity 0.2s ease'
  });
  
  // Tıklayınca kapat
  notification.addEventListener('click', () => {
    hideNotification(notification);
  });
  
  // Hover efekti
  notification.addEventListener('mouseenter', () => {
    notification.style.transform = 'translateY(-2px)';
    notification.style.boxShadow = '0 6px 8px rgba(0, 0, 0, 0.15), 0 12px 20px -3px rgba(0, 0, 0, 0.15)';
  });
  
  notification.addEventListener('mouseleave', () => {
    notification.style.transform = 'translateY(0)';
    notification.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1), 0 10px 15px -3px rgba(0, 0, 0, 0.1)';
  });
  
  return notification;
}

/**
 * Bildirimi gizler ve kaldırır
 * @param {HTMLElement} notification - Bildirim elementi
 */
function hideNotification(notification) {
  if (!notification || !notification.parentNode) return;
  
  notification.style.animation = `zipSolverSlideOut ${CONFIG.NOTIFICATION_ANIMATION_MS}ms ease-out forwards`;
  
  addTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, CONFIG.NOTIFICATION_ANIMATION_MS);
}

/**
 * Animasyon stillerini sayfaya ekler (bir kez)
 */
function injectAnimationStyles() {
  // Zaten eklenmişse tekrar ekleme
  if (document.getElementById(CONFIG.SELECTORS.ANIMATION_STYLE)) {
    return;
  }
  
  const style = document.createElement('style');
  style.id = CONFIG.SELECTORS.ANIMATION_STYLE;
  style.textContent = `
    @keyframes zipSolverSlideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes zipSolverSlideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  
  document.head.appendChild(style);
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

/**
 * Sayfanın oyun çözmeye hazır olup olmadığını kontrol eder
 * @returns {boolean} Hazırsa true
 */
function isPageReady() {
  const scriptElement = document.getElementById('rehydrate-data');
  return !!(scriptElement && scriptElement.textContent && scriptElement.textContent.length > 100);
}

/**
 * Background script'ten gelen mesajları dinler
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkReady') {
    // Sayfanın hazır olup olmadığını kontrol et
    const ready = isPageReady();
    console.log(ready ? '✅ Sayfa hazır!' : '⏳ Sayfa henüz hazır değil...');
    sendResponse({ ready: ready });
    return false; // Senkron yanıt
  }
  
  if (request.action === 'solvePuzzle') {
    // Asenkron işlem olduğu için Promise kullan
    solveZipGame()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    
    // Asenkron yanıt için true döndür
    return true;
  }
  
  return false;
});

// ============================================================================
// CLEANUP ON UNLOAD
// ============================================================================

/**
 * Sayfa kapatılırken temizlik yap
 */
window.addEventListener('beforeunload', () => {
  clearAllTimeouts();
});

// ============================================================================
// INITIALIZATION
// ============================================================================

console.log('🔧 LinkedIn Zip Solver eklentisi yüklendi ve hazır!');
console.log('📌 Kullanım: Eklenti ikonuna tıklayın veya console\'da solveZipGame() çalıştırın');

// Global scope'a ekle (debugging için)
window.solveZipGame = solveZipGame;
