/**
 * LinkedIn Zip Solver - Content Script
 * @description Chrome extension that automatically solves the LinkedIn Zip game
 * @version 1.1.1
 */

// ============================================================================ 
// CONSTANTS
// ============================================================================ 

const CONFIG = {
  CLICK_DELAY_MS: 100,           // Click delay between cells
  NOTIFICATION_DURATION_MS: 3000, // Notification display duration
  NOTIFICATION_ANIMATION_MS: 300, // Notification animation duration
  SELECTORS: {
    REHYDRATE_DATA: 'rehydrate-data',
    CELL: (idx) => `[data-cell-idx="${idx}"]`,
    NOTIFICATION: 'zip-solver-notification',
    ANIMATION_STYLE: 'zip-solver-animation-style'
  },
  REGEX: {
    // LinkedIn's escaped format: \"solution\":[...]
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
 * Clears all active timeouts (prevents memory leaks)
 */
function clearAllTimeouts() {
  activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
  activeTimeouts = [];
}

/**
 * Adds a timeout and stores its reference
 * @param {Function} callback - Function to execute
 * @param {number} delay - Delay (ms)
 * @returns {number} Timeout ID
 */
function addTimeout(callback, delay) {
  const timeoutId = setTimeout(() => {
    callback();
    // Removes from the list after the timeout is complete
    activeTimeouts = activeTimeouts.filter(id => id !== timeoutId);
  }, delay);
  activeTimeouts.push(timeoutId);
  return timeoutId;
}

// ============================================================================ 
// GAME SOLVING LOGIC
// ============================================================================ 

/**
 * Main function that solves the LinkedIn Zip game
 * @returns {Promise<void>}
 */
async function solveZipGame() {
  try {
    console.log('🎮 Solving Zip game...');
    
    // Clear previous solving processes
    clearAllTimeouts();
    
    // Get game data
    const solution = await extractSolution();
    
    if (!solution || solution.length === 0) {
      throw new Error('Solution is empty or invalid');
    }
    
    console.log('✅ Solution found:', solution);
    showNotification('Solving game...', 'info');
    
    // Apply the solution
    await applySolution(solution);
    
  } catch (error) {
    console.error('❌ Error occurred:', error);
    showNotification(`Error: ${error.message}`, 'error');
  }
}

/**
 * Extracts the game solution from the page
 * @returns {Promise<number[]>} Solution array
 * @throws {Error} If the solution cannot be found
 */
async function extractSolution() {
  // Find rehydrate data element
  const scriptElement = document.getElementById(CONFIG.SELECTORS.REHYDRATE_DATA);
  
  if (!scriptElement) {
    throw new Error('Game data not found. Make sure the page is fully loaded.');
  }
  
  const scriptContent = scriptElement.textContent;
  
  if (!scriptContent || scriptContent.trim().length === 0) {
    throw new Error('Game data is empty');
  }
  
  // Find and parse the solution (try multiple regex patterns)
  let solutionMatch = scriptContent.match(CONFIG.REGEX.SOLUTION);
  
  // If not found, try alternative pattern (normal quotes)
  if (!solutionMatch) {
    solutionMatch = scriptContent.match(/"solution":\[([^\]]+)\]/);
  }
  
  // If still not found, try a more general pattern
  if (!solutionMatch) {
    solutionMatch = scriptContent.match(/solution.*?([^\]]+)\]/);
  }
  
  if (!solutionMatch || !solutionMatch[1]) {
    throw new Error('Solution data not found. LinkedIn game structure may have changed.');
  }
  
  // Safe JSON parsing
  try {
    let solutionData = solutionMatch[1];
    
    // check for undefined or empty string
    if (!solutionData || solutionData === 'undefined' || solutionData.trim() === '') {
      throw new Error('Solution data is empty or invalid');
    }
    
    // Trim excess whitespace
    solutionData = solutionData.trim();
    
    // Parse it
    const solution = JSON.parse('[' + solutionData + ']');
    
    // Validation
    if (!Array.isArray(solution)) {
      throw new Error('Solution is not a valid array');
    }
    
    if (solution.some(cell => typeof cell !== 'number' || cell < 0)) {
      throw new Error('Solution contains invalid cell numbers');
    }
    
    return solution;
    
  } catch (parseError) {
    throw new Error(`Could not parse solution: ${parseError.message}`);
  }
}

/**
 * Applies the solution (clicks on cells)
 * @param {number[]} solution - Cell numbers to click
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
        
        // Last move
        if (index === solution.length - 1) {
          addTimeout(() => {
            console.log(`🎉 Game solved! (${completedClicks} successful, ${failedClicks} failed)`);
            
            if (failedClicks > 0) {
              showNotification(
                `Game solved! (with ${failedClicks} errors)`,
                'warning'
              );
            } else {
              showNotification('Game successfully solved! 🎉', 'success');
            }
            
            resolve();
          }, CONFIG.CLICK_DELAY_MS);
        }
      }, index * CONFIG.CLICK_DELAY_MS);
    });
  });
}

/**
 * Clicks on the specified cell
 * @param {number} cellNumber - Cell number
 * @returns {boolean} True if successful
 */
function clickCell(cellNumber) {
  const cell = document.querySelector(CONFIG.SELECTORS.CELL(cellNumber));
  
  if (!cell) {
    console.warn(`⚠️ Cell not found: ${cellNumber}`);
    return false;
  }
  
  try {
    // Simulate clicks with different event types
    // (to trigger LinkedIn's different event listeners)
    
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
    
    console.log(`✓ Cell clicked: ${cellNumber}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Could not click on cell (${cellNumber}):`, error);
    return false;
  }
}

// ============================================================================ 
// NOTIFICATION SYSTEM
// ============================================================================ 

/**
 * Shows a notification to the user
 * @param {string} message - Message to display
 * @param {string} type - Notification type (success, error, info, warning)
 */
function showNotification(message, type = 'info') {
  // Input validation
  if (!message || typeof message !== 'string') {
    console.warn('Invalid notification message');
    return;
  }
  
  if (typeof type !== 'string') {
    console.warn('Invalid notification type, using info');
    type = 'info';
  }
  
  // Inject animation styles only once (performance optimization)
  if (!animationStyleInjected) {
    injectAnimationStyles();
    animationStyleInjected = true;
  }
  
  // Remove existing notification
  removeExistingNotification();
  
  // Create new notification
  const notification = createNotificationElement(message, type);
  
  // Add to DOM
  if (document.body) {
    document.body.appendChild(notification);
    
    // Auto-remove
    addTimeout(() => {
      hideNotification(notification);
    }, CONFIG.NOTIFICATION_DURATION_MS);
  } else {
    console.warn('document.body not found, notification could not be shown');
  }
}

/**
 * Removes the existing notification from the DOM
 */
function removeExistingNotification() {
  const existingNotification = document.getElementById(CONFIG.SELECTORS.NOTIFICATION);
  if (existingNotification) {
    existingNotification.remove();
  }
}

/**
 * Creates the notification element
 * @param {string} message - Message
 * @param {string} type - Type
 * @returns {HTMLDivElement}
 */
function createNotificationElement(message, type) {
  const notification = document.createElement('div');
  notification.id = CONFIG.SELECTORS.NOTIFICATION;
  
  // Security: Use textContent for XSS protection
  const safeType = (type && typeof type === 'string') ? type.toLowerCase() : 'info';
  const notificationConfig = CONFIG.NOTIFICATION_TYPES[safeType] || CONFIG.NOTIFICATION_TYPES.info;
  const icon = notificationConfig?.icon || 'ℹ️';
  notification.textContent = `${icon} ${message}`;
  
  // Apply style
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
  
  // Close on click
  notification.addEventListener('click', () => {
    hideNotification(notification);
  });
  
  // Hover effect
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
 * Hides and removes the notification
 * @param {HTMLElement} notification - Notification element
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
 * Injects animation styles into the page (once)
 */
function injectAnimationStyles() {
  // Don't inject again if already injected
  if (document.getElementById(CONFIG.SELECTORS.ANIMATION_STYLE)) {
    return;
  }
  
  const style = document.createElement('style');
  style.id = CONFIG.SELECTORS.ANIMATION_STYLE;
  style.textContent = "\n    @keyframes zipSolverSlideIn {\n      from {\n        transform: translateX(400px);\n        opacity: 0;\n      }\n      to {\n        transform: translateX(0);\n        opacity: 1;\n      }\n    }\n    \n    @keyframes zipSolverSlideOut {\n      from {\n        transform: translateX(0);\n        opacity: 1;\n      }\n      to {\n        transform: translateX(400px);\n        opacity: 0;\n      }\n    }\n  ";
  
  document.head.appendChild(style);
}

// ============================================================================ 
// MESSAGE HANDLING
// ============================================================================ 

/**
 * Checks if the page is ready to solve the game
 * @returns {boolean} True if ready
 */
function isPageReady() {
  const scriptElement = document.getElementById('rehydrate-data');
  return !!(scriptElement && scriptElement.textContent && scriptElement.textContent.length > 100);
}

/**
 * Listens for messages from the background script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkReady') {
    // Check if the page is ready
    const ready = isPageReady();
    console.log(ready ? '✅ Page is ready!' : '⏳ Page is not ready yet...');
    sendResponse({ ready: ready });
    return false; // Synchronous response
  }
  
  if (request.action === 'solvePuzzle') {
    // Use a Promise because this is an asynchronous operation
    solveZipGame()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true for asynchronous response
    return true;
  }
  
  return false;
});

// ============================================================================ 
// CLEANUP ON UNLOAD
// ============================================================================ 

/**
 * Clean up when the page is closed
 */
window.addEventListener('beforeunload', () => {
  clearAllTimeouts();
});

// ============================================================================ 
// INITIALIZATION
// ============================================================================ 

console.log('🔧 LinkedIn Zip Solver extension loaded and ready!');
console.log('📌 Usage: Click the extension icon or run solveZipGame() in the console');

// Add to global scope (for debugging)
window.solveZipGame = solveZipGame;