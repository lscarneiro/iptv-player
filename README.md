# IPTV Player - Refactored Architecture

This directory contains the refactored IPTV Player application with a modular architecture following separation of concerns and best practices.

## Directory Structure

```
src/
├── js/
│   ├── app.js                    # Main application orchestrator
│   ├── services/
│   │   ├── apiService.js         # API communication service
│   │   └── storageService.js     # IndexedDB and localStorage management
│   ├── components/
│   │   ├── categoryList.js        # Category list UI component
│   │   ├── streamList.js         # Stream list UI component
│   │   ├── videoPlayer.js         # Video player component
│   │   ├── userInfo.js           # User information display component
│   │   └── settingsPanel.js      # Settings panel component
│   └── utils/
│       ├── debounce.js           # Debounce utility
│       └── domHelpers.js          # DOM manipulation utilities
├── index.html                     # Main HTML file
└── index.css                      # Styles
```

## Architecture Overview

### Services Layer
- **apiService.js**: Handles all API calls to the IPTV server
  - Builds API URLs with credentials
  - Fetches user info, categories, and streams
  - Gets stream playlist URLs
  
- **storageService.js**: Manages data persistence
  - IndexedDB for caching categories, streams, and user info
  - localStorage for credentials and settings
  - Provides async/await interface for all storage operations

### Components Layer
- **categoryList.js**: Displays and manages categories
  - Groups categories by prefix
  - Handles category selection
  - Provides search/filter functionality
  
- **streamList.js**: Displays and manages streams
  - Lazy loading with pagination
  - Stream search and filtering
  - Marks currently playing stream
  - Click handlers for stream selection
  
- **videoPlayer.js**: Handles video playback
  - HLS.js integration
  - Video panel management
  - Error handling and fallback links
  - M3U8 tag logging for debugging ad-breaks and stream issues
  
- **userInfo.js**: Displays user account information
  - Account details
  - Server information
  - Connection status
  
- **settingsPanel.js**: Manages settings UI
  - Settings panel toggle
  - Login form handling
  - Credentials management

### Utilities
- **debounce.js**: Utility for debouncing function calls
- **domHelpers.js**: DOM manipulation utilities (escapeHtml, toggleClearButton, etc.)

### Main Application (app.js)
The main `IPTVApp` class:
- Initializes all services and components
- Sets up event listeners and component callbacks
- Orchestrates data flow between components
- Handles authentication and login
- Manages category and stream loading

## Key Benefits

1. **Separation of Concerns**: Each module has a single responsibility
2. **Maintainability**: Easy to locate and modify specific functionality
3. **Testability**: Components can be tested independently
4. **Reusability**: Components and services can be reused across the application
5. **Scalability**: Easy to add new features or components

## Usage

The application loads automatically when `index.html` is opened in a browser. It uses ES6 modules, so ensure you're serving from a local web server (not opening the file directly).

## M3U8 Debug Logging

The application includes an optional M3U8 tag logging feature for debugging stream issues, especially during ad-breaks:

### How to Use
1. Open the Settings panel (gear icon in top-right)
2. Check "Enable M3U8 tag logging to console"
3. Start playing a stream
4. Open browser Developer Tools (F12) → Console tab
5. View detailed M3U8 tag information in real-time

### What Gets Logged
- **Raw M3U8 manifest content**: Complete playlist files with all tags
- **Fragment details**: Information about each video segment, including special properties
- **Ad-break indicators**: Discontinuity markers and program date-time changes
- **Quality switches**: Level changes that might occur during ads
- **Audio/subtitle track changes**: Track switches that could indicate ad insertion

### Console Output Examples
```
📄 Raw M3U8 Content from https://example.com/playlist.m3u8
🏷️ Found 6 M3U8 tags:
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:12345
#EXT-X-DISCONTINUITY
#EXT-X-PROGRAM-DATE-TIME:2023-10-29T12:00:00.000Z

🎬 Fragment 123 loaded with special properties
📋 Tags:
  #EXT-X-DISCONTINUITY
  #EXT-X-PROGRAM-DATE-TIME:2023-10-29T12:00:00.000Z
⚠️ Discontinuity detected (possible ad-break)
🕐 Program Date Time: 2023-10-29T12:00:00.000Z
```

This feature is particularly useful for:
- Debugging ad-break issues
- Understanding stream structure
- Identifying unsupported M3U8 tags
- Troubleshooting playback problems

**Note**: This feature can generate verbose console output. Disable it when not needed for debugging.

## Migration Notes

The original monolithic `index.js` (1202 lines) has been split into 11 focused modules. The functionality remains identical, but the code is now:
- More organized
- Easier to understand
- Better structured for future enhancements
- Following modern JavaScript best practices

