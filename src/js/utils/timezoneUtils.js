// Timezone Utilities - handles timezone detection and EPG timestamp conversion

export class TimezoneUtils {
    static getDetectedTimezone() {
        try {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (timezone) {
                return timezone;
            }
        } catch (error) {
            console.warn('Failed to detect timezone:', error);
        }
        return 'America/Toronto'; // Default fallback
    }

    static getTimezone() {
        const saved = localStorage.getItem('epg_timezone');
        if (saved) {
            return saved;
        }
        const detected = this.getDetectedTimezone();
        this.setTimezone(detected);
        return detected;
    }

    static setTimezone(timezone) {
        localStorage.setItem('epg_timezone', timezone);
    }

    static parseEPGTimestamp(timestampString) {
        // Format: "20251024181000 +0200"
        // Extract: YYYYMMDDHHmmss and timezone offset
        const match = timestampString.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s+([+-]\d{4})$/);
        if (!match) {
            throw new Error(`Invalid EPG timestamp format: ${timestampString}`);
        }

        const [, year, month, day, hour, minute, second, offset] = match;
        
        // Create date string in ISO format
        const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
        
        // Parse offset (e.g., "+0200" -> hours: 2, minutes: 0)
        const offsetSign = offset[0] === '+' ? 1 : -1;
        const offsetHours = parseInt(offset.slice(1, 3), 10);
        const offsetMinutes = parseInt(offset.slice(3, 5), 10);
        const offsetMs = offsetSign * (offsetHours * 60 + offsetMinutes) * 60 * 1000;
        
        // Create date object assuming the timestamp is in the specified timezone
        const date = new Date(Date.parse(dateStr) - offsetMs);
        
        return date;
    }

    static convertToLocalTime(timestampString) {
        // Parse the EPG timestamp and return as Date object in local timezone
        return this.parseEPGTimestamp(timestampString);
    }

    static formatTime(date, options = {}) {
        const defaultOptions = {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        };
        
        const formatOptions = { ...defaultOptions, ...options };
        
        try {
            return new Intl.DateTimeFormat('en-US', formatOptions).format(date);
        } catch (error) {
            console.warn('Failed to format date:', error);
            // Fallback formatting
            const month = date.toLocaleString('en-US', { month: 'short' });
            const day = date.getDate();
            const hour = date.getHours();
            const minute = date.getMinutes().toString().padStart(2, '0');
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const hour12 = hour % 12 || 12;
            return `${month} ${day}, ${hour12}:${minute} ${ampm}`;
        }
    }

    static formatTimeShort(date) {
        return this.formatTime(date, {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }

    static formatDateShort(date) {
        return this.formatTime(date, {
            month: 'short',
            day: 'numeric'
        });
    }

    static getTimezoneList() {
        // Common timezones for North America and Europe
        return [
            { value: 'America/Toronto', label: 'Eastern Time (Toronto)' },
            { value: 'America/New_York', label: 'Eastern Time (New York)' },
            { value: 'America/Chicago', label: 'Central Time (Chicago)' },
            { value: 'America/Denver', label: 'Mountain Time (Denver)' },
            { value: 'America/Los_Angeles', label: 'Pacific Time (Los Angeles)' },
            { value: 'America/Vancouver', label: 'Pacific Time (Vancouver)' },
            { value: 'America/Halifax', label: 'Atlantic Time (Halifax)' },
            { value: 'America/St_Johns', label: 'Newfoundland Time (St. John\'s)' },
            { value: 'Europe/London', label: 'GMT (London)' },
            { value: 'Europe/Paris', label: 'CET (Paris)' },
            { value: 'Europe/Berlin', label: 'CET (Berlin)' },
            { value: 'Europe/Rome', label: 'CET (Rome)' },
            { value: 'Europe/Madrid', label: 'CET (Madrid)' },
            { value: 'Europe/Moscow', label: 'MSK (Moscow)' },
            { value: 'Asia/Tokyo', label: 'JST (Tokyo)' },
            { value: 'Asia/Hong_Kong', label: 'HKT (Hong Kong)' },
            { value: 'Australia/Sydney', label: 'AEDT (Sydney)' },
            { value: 'UTC', label: 'UTC' }
        ];
    }
}

