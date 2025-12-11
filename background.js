/**
 * LinkedIn Zip Solver - Background Service Worker
 * @description Eklenti ikonuna tıklandığında content script'i tetikler
 * @version 1.0.0
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const CONFIG = {
  LINKEDIN_ZIP_URL: 'https://www.linkedin.com/games/zip/',
  LINKEDIN_ZIP_URL_PATTERN: 'linkedin.com/games/zip',
  SCRIPT_INJECTION_DELAY_MS: 100,
  MESSAGE_TIMEOUT_MS: 5000,
  PAGE_LOAD_DELAY_MS: 500,      // İlk deneme gecikmesi (azaltıldı)
  RETRY_DELAY_MS: 200,           // Tekrar deneme gecikmesi
  MAX_RETRIES: 10,               // Maksimum deneme sayısı (10 x 200ms = 2 saniye)
  FILES: {
    CONTENT_SCRIPT: 'content.js'
  },
  MESSAGES: {
    SOLVE_PUZZLE: 'solvePuzzle',
    CHECK_READY: 'checkReady'
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * URL'nin LinkedIn Zip oyun sayfası olup olmadığını kontrol eder
 * @param {string} url - Kontrol edilecek URL
 * @returns {boolean}
 */
function isLinkedInZipPage(url) {
  return url && url.includes(CONFIG.LINKEDIN_ZIP_URL_PATTERN);
}

/**
 * Content script'e mesaj gönderir
 * @param {number} tabId - Tab ID
 * @param {Object} message - Gönderilecek mesaj
 * @returns {Promise<Object>} Yanıt
 */
async function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Mesaj zaman aşımına uğradı'));
    }, CONFIG.MESSAGE_TIMEOUT_MS);
    
    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timeout);
      
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Content script'i sayfaya inject eder
 * @param {number} tabId - Tab ID
 * @returns {Promise<void>}
 */
async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: [CONFIG.FILES.CONTENT_SCRIPT]
    });
    
    console.log(`✅ Content script başarıyla inject edildi (Tab ID: ${tabId})`);
  } catch (error) {
    console.error('❌ Content script inject edilemedi:', error);
    throw new Error(`Script inject hatası: ${error.message}`);
  }
}

/**
 * Content script'e mesaj gönderir, gerekirse inject eder
 * @param {number} tabId - Tab ID
 * @param {Object} message - Mesaj
 * @returns {Promise<Object>} Yanıt
 */
async function sendMessageWithInjection(tabId, message) {
  try {
    // Önce mesaj göndermeyi dene
    const response = await sendMessageToTab(tabId, message);
    return response;
    
  } catch (error) {
    console.log('ℹ️ Content script yüklü değil, inject ediliyor...');
    
    try {
      // Content script'i inject et
      await injectContentScript(tabId);
      
      // Script'in yüklenmesi için kısa bir süre bekle
      await new Promise(resolve => setTimeout(resolve, CONFIG.SCRIPT_INJECTION_DELAY_MS));
      
      // Tekrar mesaj gönder
      const response = await sendMessageToTab(tabId, message);
      return response;
      
    } catch (injectError) {
      console.error('❌ Script inject ve mesaj gönderme başarısız:', injectError);
      throw injectError;
    }
  }
}

// ============================================================================
// STATE TRACKING
// ============================================================================

let pendingSolveTabId = null; // Otomatik çözme bekleyen tab

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Eklenti ikonuna tıklandığında çalışır
 * @param {chrome.tabs.Tab} tab - Aktif tab
 */
async function handleActionClick(tab) {
  console.log('🎯 Eklenti ikonuna tıklandı');
  
  // Input validation
  if (!tab || !tab.id) {
    console.error('❌ Geçersiz tab bilgisi');
    return;
  }
  
  // URL kontrolü - LinkedIn Zip sayfasında değilse oraya git
  if (!isLinkedInZipPage(tab.url)) {
    console.log('📍 LinkedIn Zip sayfasına yönlendiriliyor...');
    
    try {
      // Badge göster
      await chrome.action.setBadgeText({ 
        text: '⟳', 
        tabId: tab.id 
      });
      await chrome.action.setBadgeBackgroundColor({ 
        color: '#3b82f6', 
        tabId: tab.id 
      });
      
      // Bu tab'ı otomatik çözme için işaretle
      pendingSolveTabId = tab.id;
      
      // LinkedIn Zip sayfasına yönlendir
      await chrome.tabs.update(tab.id, { 
        url: CONFIG.LINKEDIN_ZIP_URL
      });
      
      console.log('✅ Sayfa yönlendirmesi başlatıldı');
      
    } catch (error) {
      console.error('❌ Yönlendirme hatası:', error);
      pendingSolveTabId = null;
    }
    
    return;
  }
  
  // Zaten LinkedIn Zip sayfasındaysa direkt çöz
  console.log(`✅ LinkedIn Zip sayfası tespit edildi (Tab ID: ${tab.id})`);
  await solvePuzzleInTab(tab.id, CONFIG.MAX_RETRIES);
}

/**
 * Belirtilen tab'da puzzle'ı çözer (akıllı retry ile)
 * @param {number} tabId - Tab ID
 * @param {number} retryCount - Kalan deneme sayısı
 */
async function solvePuzzleInTab(tabId, retryCount = CONFIG.MAX_RETRIES) {
  try {
    // Badge'i temizle
    await chrome.action.setBadgeText({ text: '', tabId: tabId });
    
    // Önce sayfanın hazır olup olmadığını kontrol et
    let isReady = false;
    try {
      const readyResponse = await sendMessageToTab(tabId, {
        action: CONFIG.MESSAGES.CHECK_READY
      });
      isReady = readyResponse && readyResponse.ready;
    } catch (error) {
      // Content script yüklü değil, inject et
      console.log('ℹ️ Content script inject ediliyor...');
      await injectContentScript(tabId);
      await new Promise(resolve => setTimeout(resolve, CONFIG.SCRIPT_INJECTION_DELAY_MS));
    }
    
    // Eğer hazır değilse ve deneme hakkı varsa, bekle ve tekrar dene
    if (!isReady && retryCount > 0) {
      console.log(`⏳ Sayfa henüz hazır değil, tekrar deneniyor... (${CONFIG.MAX_RETRIES - retryCount + 1}/${CONFIG.MAX_RETRIES})`);
      
      setTimeout(async () => {
        await solvePuzzleInTab(tabId, retryCount - 1);
      }, CONFIG.RETRY_DELAY_MS);
      
      return;
    }
    
    // Eğer tüm denemeler tükendiyse ama hala hazır değilse
    if (!isReady && retryCount === 0) {
      console.warn('⚠️ Sayfa hazır değil, yine de deneniyor...');
    }
    
    // Content script'e çözüm mesajı gönder
    const response = await sendMessageWithInjection(tabId, {
      action: CONFIG.MESSAGES.SOLVE_PUZZLE
    });
    
    if (response && response.success) {
      console.log('🎉 Oyun çözme işlemi başlatıldı');
    } else if (response && response.error) {
      console.error('❌ Oyun çözme hatası:', response.error);
    }
    
  } catch (error) {
    console.error('❌ İşlem başarısız:', error);
    
    // Kullanıcıya hata badge'i göster
    try {
      await chrome.action.setBadgeText({ 
        text: '✗', 
        tabId: tabId 
      });
      await chrome.action.setBadgeBackgroundColor({ 
        color: '#ef4444', 
        tabId: tabId 
      });
      
      setTimeout(async () => {
        try {
          await chrome.action.setBadgeText({ text: '', tabId: tabId });
        } catch (e) {
          // Tab kapanmış olabilir
        }
      }, 3000);
      
    } catch (badgeError) {
      console.error('Hata badge\'i ayarlanamadı:', badgeError);
    }
  }
}

/**
 * Tab güncellendiğinde çalışır (sayfa yükleme takibi)
 * @param {number} tabId - Tab ID
 * @param {Object} changeInfo - Değişiklik bilgisi
 * @param {chrome.tabs.Tab} tab - Tab bilgisi
 */
async function handleTabUpdate(tabId, changeInfo, tab) {
  // Sadece pending solve varsa ve sayfa tamamen yüklendiyse
  if (pendingSolveTabId === tabId && changeInfo.status === 'complete') {
    console.log('✅ LinkedIn Zip sayfası yüklendi, akıllı çözüm başlatılıyor...');
    
    // Pending state'i temizle
    pendingSolveTabId = null;
    
    // LinkedIn Zip sayfasında olduğundan emin ol
    if (isLinkedInZipPage(tab.url)) {
      // Kısa bir başlangıç gecikmesi (DOM'un başlaması için)
      setTimeout(async () => {
        await solvePuzzleInTabWithRetry(tabId);
      }, CONFIG.PAGE_LOAD_DELAY_MS);
    } else {
      console.warn('⚠️ Beklenmedik URL:', tab.url);
    }
  }
}

/**
 * Tab'da puzzle'ı akıllı retry ile çözer
 * @param {number} tabId - Tab ID
 */
async function solvePuzzleInTabWithRetry(tabId) {
  console.log('🔄 Akıllı retry mekanizması başlatıldı');
  await solvePuzzleInTab(tabId, CONFIG.MAX_RETRIES);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

// Eklenti ikonuna tıklama
chrome.action.onClicked.addListener(handleActionClick);

// Tab güncellendiğinde (sayfa yükleme takibi)
chrome.tabs.onUpdated.addListener(handleTabUpdate);

// Service worker başlatıldığında
console.log('🚀 LinkedIn Zip Solver service worker başlatıldı');

// ============================================================================
// INSTALLATION & UPDATES
// ============================================================================

/**
 * Eklenti yüklendiğinde veya güncellendiğinde çalışır
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('📦 Eklenti durumu:', details.reason);
  
  if (details.reason === 'install') {
    console.log('🎉 LinkedIn Zip Solver ilk kez yüklendi!');
    console.log('ℹ️ Kullanım: LinkedIn Zip oyun sayfasında eklenti ikonuna tıklayın');
  } else if (details.reason === 'update') {
    console.log(`🔄 Eklenti güncellendi: ${details.previousVersion} -> ${chrome.runtime.getManifest().version}`);
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Global hata yakalayıcı
 */
self.addEventListener('error', (event) => {
  console.error('🔴 Service worker hatası:', event.error);
});

/**
 * Promise rejection yakalayıcı
 */
self.addEventListener('unhandledrejection', (event) => {
  console.error('🔴 Yakalanmamış promise hatası:', event.reason);
});
