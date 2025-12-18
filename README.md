# 🎮 LinkedIn Zip Solver - Chrome Extension

Chrome extension that automatically solves the LinkedIn Zip game.

## ⚠️ Warning

This project is for educational and experimental purposes only. It should not be used to violate LinkedIn's terms of service.

## 🚀 Installation

### 1. Download or Clone the Extension
Download this project to your computer.

### 2. Add Icons (Optional)
Add PNG icons in the following sizes to the `icons` folder:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

*Note: The extension works without icons as well.*

### 3. Load into Chrome

1. Go to `chrome://extensions/` in Chrome
2. Enable **"Developer mode"** in the top right corner
3. Click the **"Load unpacked"** button
4. Select the folder where this project is located

## 📖 Usage

1. Go to the Zip game on LinkedIn: `https://www.linkedin.com/games/zip/`
2. After the game loads, click the extension icon in the Chrome toolbar
3. The extension will automatically solve the game! 🎉

## ✨ Features

- ✅ No popup required - works directly
- ✅ Automatic solution finding
- ✅ Visual notifications
- ✅ Error handling
- ✅ Detailed logs in the Console

## 🛠️ Technical Details

### File Structure
```
zipmaster/
├── manifest.json       # Extension configuration
├── background.js       # Service worker (icon click management)
├── content.js          # Interaction with page content
├── icons/              # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md           # This file
```

### How It Works

1. Reads the game data from the `rehydrate-data` element on the LinkedIn Zip game page
2. Parses the solution from the embedded JSON data
3. Clicks the cell numbers in the solution in sequence (with 100ms intervals)
4. Simulates real user interaction by simulating mouse and pointer events

## 🐛 Troubleshooting

### The extension is not working
- Refresh the page (F5)
- Make sure you are on the LinkedIn Zip game page
- Open the Chrome DevTools Console (F12) and check for error messages

### "Game data not found" error
- Make sure the game is fully loaded
- Refresh the page and try again

### Icon is not visible
- Add the PNG files to the `icons` folder
- or remove the `icons` section from `manifest.json`

### Chrome Manifest V3
This extension uses the Chrome Manifest V3 standard.

## 📄 License

For educational purposes. Use at your own risk.

---

**Note:** This extension is an experimental project and can be blocked by LinkedIn at any time. 😅