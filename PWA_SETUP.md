# PWA Setup Instructions

Your IPTV Player is now configured as a Progressive Web App (PWA)! It can be installed on devices and used like a native app.

## PNG Favicon Files

The app includes an SVG favicon (`favicon.svg`), and PNG versions are included in the manifest. If you need to regenerate or update the PNG files, use one of the methods below.

**Note**: The PNG files (`favicon-192x192.png` and `favicon-512x512.png`) are already included in the repository, but you can regenerate them if needed.

### Option 1: Use the Generator (Recommended)

1. Open `generate-icons.html` from the project root in your browser
2. Click "Generate 192x192" and save the file as `favicon-192x192.png` in the `src/` directory
3. Click "Generate 512x512" and save the file as `favicon-512x512.png` in the `src/` directory

### Option 2: Use ImageMagick

If you have ImageMagick installed:

```bash
cd src
magick favicon.svg -resize 192x192 favicon-192x192.png
magick favicon.svg -resize 512x512 favicon-512x512.png
```

### Option 3: Online Converter

Use an online SVG to PNG converter like:
- https://convertio.co/svg-png/
- https://cloudconvert.com/svg-to-png

Convert `favicon.svg` to PNG at 192x192 and 512x512 sizes.

## What's Included

- ✅ `manifest.json` - Web app manifest defining app metadata
- ✅ `service-worker.js` - Service worker for offline support and caching
- ✅ `favicon.svg` - SVG favicon (TV-themed icon)
- ✅ Updated `index.html` with manifest and service worker registration

## Installing as a PWA

Once deployed, users can install the app by:

1. **Desktop (Chrome/Edge):** Click the install icon in the address bar
2. **Mobile (Chrome):** Tap the menu (⋮) and select "Add to Home Screen" or "Install App"
3. **Mobile (Safari iOS):** Tap Share button → "Add to Home Screen"

## Testing Locally

To test the PWA locally, you need to serve the files over HTTP (not file://). You can:

1. Use a simple HTTP server:
   ```bash
   cd src
   python -m http.server 8000
   ```
   Then visit http://localhost:8000

2. Or use any static file server like Live Server in VS Code

## Features

- 📱 Standalone app experience (no browser UI)
- 🔄 Offline support via service worker caching
- 🎯 Install prompt on supported browsers
- 📱 Add to home screen functionality
- 🎨 TV-themed icon
