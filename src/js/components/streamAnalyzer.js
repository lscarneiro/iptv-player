// Stream Analyzer - Analyzes stream patterns and detects stream states
export class StreamAnalyzer {
    static isBlackTsUrl(url) {
        return url && url.includes('black.ts');
    }

    static isStreamEndedPlaylist(manifestData) {
        try {
            // Check multiple possible data structures from HLS.js
            const manifest = manifestData.details || manifestData.level || manifestData;
            
            // Look for the classic "stream ended" pattern:
            // 1. Has EXT-X-ENDLIST (indicates stream has ended)
            // 2. Contains only black.ts segments  
            // 3. Usually has very few segments (often just 1)
            
            // Check if this is a non-live playlist (has ENDLIST)
            if (manifest && (manifest.live === false || manifest.endlist === true)) {
                const segments = manifest.segments || manifest.details?.segments || [];
                
                if (segments.length === 0) {
                    return false; // Empty playlist, not necessarily ended
                }
                
                // Check if all segments are black.ts (definitive stream ended pattern)
                const blackSegments = segments.filter(segment => 
                    segment && segment.url && StreamAnalyzer.isBlackTsUrl(segment.url)
                );
                
                if (blackSegments.length === segments.length && segments.length > 0) {
                    console.log(`Detected playlist with ${segments.length} black.ts segments and ENDLIST - stream has definitely ended`);
                    return true;
                }
                
                // Check for mixed playlist with majority black.ts segments (likely stream ended)
                if (blackSegments.length > 0 && segments.length <= 5) {
                    const blackRatio = blackSegments.length / segments.length;
                    if (blackRatio >= 0.5) { // 50% or more are black.ts
                        console.log(`Detected short playlist (${segments.length} segments) with ${blackSegments.length} black.ts segments and ENDLIST - likely stream ended`);
                        return true;
                    }
                }
                
                // Special case: single segment playlist with black.ts
                if (segments.length === 1 && blackSegments.length === 1) {
                    console.log('Detected single black.ts segment with ENDLIST - stream ended');
                    return true;
                }
            }
            
            // Also check the manifest URL itself
            const manifestUrl = manifestData.url || '';
            if (StreamAnalyzer.isBlackTsUrl(manifestUrl)) {
                console.log('Manifest URL contains black.ts - stream ended');
                return true;
            }
            
            // Check if the manifest content indicates stream end
            if (manifestData.networkDetails && manifestData.networkDetails.responseText) {
                const manifestText = manifestData.networkDetails.responseText;
                if (manifestText.includes('#EXT-X-ENDLIST') && manifestText.includes('black.ts')) {
                    console.log('Manifest content contains ENDLIST and black.ts - stream ended');
                    return true;
                }
            }
            
        } catch (error) {
            console.warn('Error analyzing manifest for stream end pattern:', error);
        }
        
        return false;
    }

    static analyzeNetworkError(details, data) {
        const response = data.response || {};
        const url = data.url || 'unknown';
        
        const errorMap = {
            'manifestLoadError': {
                description: `Failed to load stream manifest from ${url}`,
                causes: 'Server is unreachable, stream is offline, or network connectivity issues',
                solutions: 'Check your internet connection, verify the stream is online, or try the direct link'
            },
            'manifestLoadTimeOut': {
                description: 'Stream manifest request timed out',
                causes: 'Slow network connection, server overload, or network congestion',
                solutions: 'Check your network speed, try again later, or use a different network'
            },
            'fragLoadError': {
                description: `Failed to load video fragment (HTTP ${response.code || 'unknown'})`,
                causes: 'Network interruption, server issues, or stream ended unexpectedly',
                solutions: 'Reload the stream, check network stability, or try the direct link'
            },
            'fragLoadTimeOut': {
                description: 'Video fragment loading timed out',
                causes: 'Network congestion, slow connection, or server performance issues',
                solutions: 'Check network speed, try reloading, or switch to a better network'
            },
            'keyLoadError': {
                description: 'Failed to load decryption key for encrypted stream',
                causes: 'Authentication issues, DRM problems, or server configuration errors',
                solutions: 'Check if you have proper access rights or contact the stream provider'
            }
        };

        return errorMap[details] || {
            description: `Network error: ${details} (${response.code || 'no response code'})`,
            causes: 'Various network or server-related issues',
            solutions: 'Try reloading the stream, check your connection, or use the direct link'
        };
    }

    static getAutoplayFailureReason(error) {
        if (error.name === 'NotAllowedError') {
            return 'Browser autoplay policy prevents automatic playback';
        } else if (error.name === 'AbortError') {
            return 'Playback was interrupted (possibly by another stream starting)';
        } else if (error.name === 'NotSupportedError') {
            return 'Video format or codec not supported';
        } else if (error.message.includes('user activation')) {
            return 'User interaction required by browser policy';
        }
        return 'Unknown autoplay failure reason';
    }
}