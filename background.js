/**
 * LinkedIn Zip Solver - Background Service Worker
 * @description Triggers the content script when the extension icon is clicked
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
  PAGE_LOAD_DELAY_MS: 500,      // Initial attempt delay (reduced)
  RETRY_DELAY_MS: 200,           // Retry delay
  MAX_RETRIES: 10,               // Maximum number of retries (10 x 200ms = 2 seconds)
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
 * Checks if the URL is a LinkedIn Zip game page
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isLinkedInZipPage(url) {
  return url && url.includes(CONFIG.LINKEDIN_ZIP_URL_PATTERN);
}

/**
 * Sends a message to the content script
 * @param {number} tabId - Tab ID
 * @param {Object} message - Message to send
 * @returns {Promise<Object>} Response
 */
async function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Message timed out'));
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
 * Injects the content script into the page
 * @param {number} tabId - Tab ID
 * @returns {Promise<void>}
 */
async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: [CONFIG.FILES.CONTENT_SCRIPT]
    });
    
    console.log(`✅ Content script injected successfully (Tab ID: ${tabId})`);
  } catch (error) {
    console.error('❌ Failed to inject content script:', error);
    throw new Error(`Script injection error: ${error.message}`);
  }
}

/**
 * Sends a message to the content script, injecting it if necessary
 * @param {number} tabId - Tab ID
 * @param {Object} message - Message
 * @returns {Promise<Object>} Response
 */
async function sendMessageWithInjection(tabId, message) {
  try {
    // Try sending a message first
    const response = await sendMessageToTab(tabId, message);
    return response;
    
  } catch (error) {
    console.log('ℹ️ Content script not loaded, injecting...');
    
    try {
      // Inject the content script
      await injectContentScript(tabId);
      
      // Wait a short time for the script to load
      await new Promise(resolve => setTimeout(resolve, CONFIG.SCRIPT_INJECTION_DELAY_MS));
      
      // Send message again
      const response = await sendMessageToTab(tabId, message);
      return response;
      
    } catch (injectError) {
      console.error('❌ Script injection and message sending failed:', injectError);
      throw injectError;
    }
  }
}

// ============================================================================
// STATE TRACKING
// ============================================================================

let pendingSolveTabId = null; // Tab waiting for automatic solving

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Runs when the extension icon is clicked
 * @param {chrome.tabs.Tab} tab - Active tab
 */
async function handleActionClick(tab) {
  console.log('🎯 Extension icon clicked');
  
  // Input validation
  if (!tab || !tab.id) {
    console.error('❌ Invalid tab information');
    return;
  }
  
  // URL check - if not on the LinkedIn Zip page, go there
  if (!isLinkedInZipPage(tab.url)) {
    console.log('📍 Redirecting to the LinkedIn Zip page...');
    
    try {
      // Show badge
      await chrome.action.setBadgeText({ 
        text: '⟳', 
        tabId: tab.id 
      });
      await chrome.action.setBadgeBackgroundColor({ 
        color: '#3b82f6', 
        tabId: tab.id 
      });
      
      // Mark this tab for automatic solving
      pendingSolveTabId = tab.id;
      
      // Redirect to the LinkedIn Zip page
      await chrome.tabs.update(tab.id, { 
        url: CONFIG.LINKEDIN_ZIP_URL
      });
      
      console.log('✅ Page redirection started');
      
    } catch (error) {
      console.error('❌ Redirect error:', error);
      pendingSolveTabId = null;
    }
    
    return;
  }
  
  // If already on the LinkedIn Zip page, solve directly
  console.log(`✅ LinkedIn Zip page detected (Tab ID: ${tab.id})`);
  await solvePuzzleInTab(tab.id, CONFIG.MAX_RETRIES);
}

/**
 * Solves the puzzle in the specified tab (with smart retry)
 * @param {number} tabId - Tab ID
 * @param {number} retryCount - Remaining number of retries
 */
async function solvePuzzleInTab(tabId, retryCount = CONFIG.MAX_RETRIES) {
  try {
    // Clear the badge
    await chrome.action.setBadgeText({ text: '', tabId: tabId });
    
    // First, check if the page is ready
    let isReady = false;
    try {
      const readyResponse = await sendMessageToTab(tabId, {
        action: CONFIG.MESSAGES.CHECK_READY
      });
      isReady = readyResponse && readyResponse.ready;
    } catch (error) {
      // Content script not loaded, inject it
      console.log('ℹ️ Content script not loaded, injecting...');
      await injectContentScript(tabId);
      await new Promise(resolve => setTimeout(resolve, CONFIG.SCRIPT_INJECTION_DELAY_MS));
    }
    
    // If not ready and there are retries left, wait and try again
    if (!isReady && retryCount > 0) {
      console.log(`⏳ Page not ready yet, retrying... (${CONFIG.MAX_RETRIES - retryCount + 1}/${CONFIG.MAX_RETRIES})`);
      
      setTimeout(async () => {
        await solvePuzzleInTab(tabId, retryCount - 1);
      }, CONFIG.RETRY_DELAY_MS);
      
      return;
    }
    
    // If all retries are used but it's still not ready
    if (!isReady && retryCount === 0) {
      console.warn('⚠️ Page not ready, trying anyway...');
    }
    
    // Send solve message to content script
    const response = await sendMessageWithInjection(tabId, {
      action: CONFIG.MESSAGES.SOLVE_PUZZLE
    });
    
    if (response && response.success) {
      console.log('🎉 Game solving process started');
    } else if (response && response.error) {
      console.error('❌ Game solving error:', response.error);
    }
    
  } catch (error) {
    console.error('❌ Operation failed:', error);
    
    // Show error badge to user
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
          // Tab may have been closed
        }
      }, 3000);
      
    } catch (badgeError) {
      console.error('Could not set error badge:', badgeError);
    }
  }
}

/**
 * Runs when a tab is updated (page load tracking)
 * @param {number} tabId - Tab ID
 * @param {Object} changeInfo - Change info
 * @param {chrome.tabs.Tab} tab - Tab info
 */
async function handleTabUpdate(tabId, changeInfo, tab) {
  // Only if there is a pending solve and the page is fully loaded
  if (pendingSolveTabId === tabId && changeInfo.status === 'complete') {
    console.log('✅ LinkedIn Zip page loaded, starting smart solve...');
    
    // Clear pending state
    pendingSolveTabId = null;
    
    // Make sure it's on the LinkedIn Zip page
    if (isLinkedInZipPage(tab.url)) {
      // A short initial delay (for the DOM to start)
      setTimeout(async () => {
        await solvePuzzleInTabWithRetry(tabId);
      }, CONFIG.PAGE_LOAD_DELAY_MS);
    } else {
      console.warn('⚠️ Unexpected URL:', tab.url);
    }
  }
}

/**
 * Solves the puzzle in the tab with smart retry
 * @param {number} tabId - Tab ID
 */
async function solvePuzzleInTabWithRetry(tabId) {
  console.log('🔄 Smart retry mechanism started');
  await solvePuzzleInTab(tabId, CONFIG.MAX_RETRIES);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

// Extension icon click
chrome.action.onClicked.addListener(handleActionClick);

// When a tab is updated (page load tracking)
chrome.tabs.onUpdated.addListener(handleTabUpdate);

// When the service worker starts
console.log('🚀 LinkedIn Zip Solver service worker started');

// ============================================================================
// INSTALLATION & UPDATES
// ============================================================================

/**
 * Runs when the extension is installed or updated
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('📦 Extension status:', details.reason);
  
  if (details.reason === 'install') {
    console.log('🎉 LinkedIn Zip Solver installed for the first time!');
    console.log('ℹ️ Usage: Click the extension icon on the LinkedIn Zip game page');
  } else if (details.reason === 'update') {
    console.log(`🔄 Extension updated: ${details.previousVersion} -> ${chrome.runtime.getManifest().version}`);
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Global error catcher
 */
self.addEventListener('error', (event) => {
  console.error('🔴 Service worker error:', event.error);
});

/**
 * Promise rejection catcher
 */
self.addEventListener('unhandledrejection', (event) => {
  console.error('🔴 Unhandled promise rejection:', event.reason);
});
