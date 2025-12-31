// Background service worker for Chrome extension
const CLIENT_ID = '1066746635630-c911ajthbvktpij42c1ej0rimcp6nar0.apps.googleusercontent.com';
const API_KEY = 'AIzaSyCXTAZqHk6RYJH6jquN1-dHmJZJysig27U';

// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'addToCalendar',
        title: 'Add to Google Calendar',
        contexts: ['selection']
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'addToCalendar') {
        const selectedText = info.selectionText;
        
        // Parse the selected text for date/time and title
        const parsed = parseEventText(selectedText);
        
        // Store parsed data for popup (in case user wants to edit)
        chrome.storage.local.set({
            eventData: {
                text: selectedText,
                title: parsed.title,
                date: parsed.date,
                time: parsed.time,
                fullDateTime: parsed.fullDateTime ? parsed.fullDateTime.toISOString() : null,
                endDateTime: parsed.endDateTime ? parsed.endDateTime.toISOString() : null
            }
        });
        
        // Try to create event directly
        try {
            const token = await getAccessToken();
            const eventData = {
                title: parsed.title,
                fullDateTime: parsed.fullDateTime || new Date(),
                endDateTime: parsed.endDateTime || null
            };
            const event = await createCalendarEvent(eventData, token);
            
            // Show notification
            const notificationOptions = {
                type: 'basic',
                title: 'Event Added',
                message: `"${parsed.title}" added to Google Calendar`
            };
            chrome.notifications.create(notificationOptions, (id) => {
                if (chrome.runtime.lastError) {
                    // Notification failed, but event was created
                    console.log('Notification failed:', chrome.runtime.lastError);
                }
            });
        } catch (error) {
            // If direct creation fails (e.g., user cancelled auth), 
            // stored data will be available in popup
            console.error('Failed to create event:', error);
            
            // Show notification to open popup
            const notificationOptions = {
                type: 'basic',
                title: 'Calendar Quick Add',
                message: 'Click the extension icon to add event to calendar'
            };
            chrome.notifications.create(notificationOptions, (id) => {
                if (chrome.runtime.lastError) {
                    console.log('Notification failed:', chrome.runtime.lastError);
                }
            });
        }
    }
});

// Parse text to extract date, time, and title
function parseEventText(text) {
    const result = {
        title: text,
        date: null,
        time: null,
        fullDateTime: null,
        endDateTime: null
    };
    
    // Common date/time patterns
    const datePatterns = [
        // MM/DD/YYYY, MM-DD-YYYY
        /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g,
        // YYYY-MM-DD
        /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/g,
        // Day Month Year (e.g., "January 15, 2024", "Jan 15 2024")
        /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}[,\s]+\d{4}/gi,
        // Tomorrow, Today, Next Monday, etc.
        /(today|tomorrow|next\s+\w+day)/gi,
        // Relative dates (e.g., "in 3 days", "next week")
        /(in\s+\d+\s+days?|next\s+week|next\s+month)/gi
    ];
    
    // Time range patterns (check for ranges first)
    const timeRangePatterns = [
        // "4 to 8pm", "4 PM to 8 PM", "4pm to 8pm"
        /(\d{1,2}(?::\d{2})?\s*(AM|PM|am|pm)?)\s+to\s+(\d{1,2}(?::\d{2})?\s*(AM|PM|am|pm))/gi,
        // "4-8pm", "4pm-8pm", "4:00 PM-8:00 PM"
        /(\d{1,2}(?::\d{2})?\s*(AM|PM|am|pm)?)\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*(AM|PM|am|pm))/gi,
        // "4 until 8pm", "4pm until 8pm"
        /(\d{1,2}(?::\d{2})?\s*(AM|PM|am|pm)?)\s+until\s+(\d{1,2}(?::\d{2})?\s*(AM|PM|am|pm))/gi
    ];
    
    // Single time patterns
    const timePatterns = [
        // 12-hour format (e.g., "3:00 PM", "10:30am")
        /(\d{1,2}:\d{2}\s*(AM|PM|am|pm))/gi,
        // 24-hour format (e.g., "15:00", "09:30")
        /\b(\d{1,2}:\d{2})\b/g,
        // Simple hour with am/pm (e.g., "4pm", "10am")
        /(\d{1,2}\s*(AM|PM|am|pm))\b/gi
    ];
    
    // Find dates first
    let baseDate = null;
    for (const pattern of datePatterns) {
        const matches = text.match(pattern);
        if (matches) {
            result.date = matches[0];
            const parsedDate = parseDate(matches[0]);
            if (parsedDate) {
                // Create a new date set to midnight to avoid time component issues
                baseDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
            }
            break;
        }
    }
    
    // If no date found, use today at midnight
    if (!baseDate) {
        const today = new Date();
        baseDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    }
    
    // Check for time ranges first
    let timeRangeFound = false;
    for (const pattern of timeRangePatterns) {
        // Use exec to get captured groups (reset regex lastIndex for global patterns)
        pattern.lastIndex = 0;
        const match = pattern.exec(text);
        if (match && match.length >= 4) {
            const fullMatch = match[0];
            result.time = fullMatch;
            
            // Extract start and end times from captured groups
            let startTimeStr = match[1].trim();
            let endTimeStr = match[3].trim();
            
            // If end time doesn't have AM/PM but start time does, infer it from context
            // Common pattern: "4 to 8pm" or "4pm to 8"
            const startHasAMPM = /(AM|PM|am|pm)/i.test(startTimeStr);
            const endHasAMPM = /(AM|PM|am|pm)/i.test(endTimeStr);
            
            // If start has AM/PM but end doesn't, infer AM/PM for end time
            if (startHasAMPM && !endHasAMPM) {
                const startHourMatch = startTimeStr.match(/(\d{1,2})/);
                const endHourMatch = endTimeStr.match(/(\d{1,2})/);
                if (startHourMatch && endHourMatch) {
                    const startHour = parseInt(startHourMatch[1]);
                    const endHour = parseInt(endHourMatch[1]);
                    const isStartPM = /pm/i.test(startTimeStr);
                    
                    // Common case: "4pm to 8" means "4pm to 8pm"
                    // If start is PM, end is likely also PM (unless end < start, then it might be next day)
                    // For ranges like "4pm to 8", assume same period (PM)
                    if (isStartPM) {
                        endTimeStr += ' PM';
                    } else {
                        // Start is AM, end without AM/PM could be AM or PM
                        // If end hour < start hour, it's likely PM (e.g., "9am to 2" = "9am to 2pm")
                        if (endHour < startHour) {
                            endTimeStr += ' PM';
                        } else {
                            endTimeStr += ' AM';
                        }
                    }
                }
            }
            
            const startTime = parseTime(startTimeStr);
            const endTime = parseTime(endTimeStr);
            
            if (startTime && endTime) {
                // Create start datetime - ensure we use a fresh date to avoid timezone issues
                const startDate = new Date(baseDate.getTime());
                startDate.setHours(startTime.hours, startTime.minutes, 0, 0);
                result.fullDateTime = startDate;
                
                // Create end datetime - ensure we use a fresh date
                const endDate = new Date(baseDate.getTime());
                endDate.setHours(endTime.hours, endTime.minutes, 0, 0);
                
                // If end time is before start time, assume it's the next day
                if (endDate.getTime() <= startDate.getTime()) {
                    endDate.setDate(endDate.getDate() + 1);
                }
                
                result.endDateTime = endDate;
                timeRangeFound = true;
                
                // Debug logging (can be removed in production)
                console.log('Time range parsed:', {
                    startTime: startTimeStr,
                    endTime: endTimeStr,
                    startDateTime: startDate.toISOString(),
                    endDateTime: endDate.toISOString(),
                    durationHours: (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)
                });
                
                break;
            }
        }
    }
    
    // If no time range found, check for single time
    if (!timeRangeFound) {
        for (const pattern of timePatterns) {
            const matches = text.match(pattern);
            if (matches) {
                result.time = matches[0];
                const time = parseTime(matches[0]);
                if (time) {
                    const dateWithTime = new Date(baseDate);
                    dateWithTime.setHours(time.hours, time.minutes, 0, 0);
                    result.fullDateTime = dateWithTime;
                }
                break;
            }
        }
    }
    
    // Extract title (remove date/time from text)
    let title = text;
    if (result.date) {
        title = title.replace(result.date, '').trim();
    }
    if (result.time) {
        title = title.replace(result.time, '').trim();
    }
    // Clean up extra spaces and common separators
    title = title.replace(/[,\-–—]\s*$/, '').trim();
    if (title.length > 0) {
        result.title = title;
    }
    
    return result;
}

// Parse date string to Date object
function parseDate(dateStr) {
    // Handle relative dates
    const lower = dateStr.toLowerCase();
    if (lower === 'today') {
        return new Date();
    } else if (lower === 'tomorrow') {
        const date = new Date();
        date.setDate(date.getDate() + 1);
        return date;
    }
    
    // Try parsing standard date formats
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
        return date;
    }
    
    // Try parsing MM/DD/YYYY or MM-DD-YYYY
    const parts = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (parts) {
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        const year = parseInt(parts[3].length === 2 ? '20' + parts[3] : parts[3]);
        return new Date(year, month, day);
    }
    
    return null;
}

// Parse time string to hours and minutes
function parseTime(timeStr) {
    const lower = timeStr.toLowerCase().trim();
    const isPM = lower.includes('pm');
    const isAM = lower.includes('am');
    
    // Extract hours and minutes (handle both "4:30pm" and "4pm" formats)
    const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?/);
    if (!match) return null;
    
    let hours = parseInt(match[1]);
    const minutes = match[2] ? parseInt(match[2]) : 0;
    
    // Convert to 24-hour format
    if (isPM && hours !== 12) {
        hours += 12;
    } else if (isAM && hours === 12) {
        hours = 0;
    }
    
    // If no AM/PM specified and hour is 1-11, assume PM (common in time ranges like "4-8")
    // But if we have context of an end time after a start time, we can infer it
    if (!isAM && !isPM && hours >= 1 && hours <= 11) {
        // For time ranges, we'll handle this in the calling code
        // For now, assume PM for hours 1-11 without AM/PM
        // This can be adjusted based on context
    }
    
    return { hours, minutes };
}

// Function to get access token using Chrome identity API
async function getAccessToken() {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(token);
            }
        });
    });
}

// Function to create calendar event
async function createCalendarEvent(eventData, accessToken) {
    let startDateTime;
    if (eventData.fullDateTime instanceof Date) {
        startDateTime = eventData.fullDateTime;
    } else if (typeof eventData.fullDateTime === 'string') {
        startDateTime = new Date(eventData.fullDateTime);
    } else {
        startDateTime = new Date();
    }
    
    // Use provided endDateTime if available, otherwise default to 1 hour later
    let endDateTime;
    if (eventData.endDateTime) {
        if (eventData.endDateTime instanceof Date) {
            endDateTime = eventData.endDateTime;
        } else if (typeof eventData.endDateTime === 'string') {
            endDateTime = new Date(eventData.endDateTime);
        } else {
            endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
        }
    } else {
        endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // Default 1 hour duration
    }
    
    // Build event object
    let event = {
        summary: eventData.title
    };
    
    // Handle all-day events vs timed events
    if (eventData.allDay) {
        // All-day events use date format (YYYY-MM-DD)
        event.start = { date: startDateTime.toISOString().split('T')[0] };
        // For all-day events, end date should be the day after (exclusive)
        const endDate = new Date(endDateTime);
        endDate.setDate(endDate.getDate() + 1);
        event.end = { date: endDate.toISOString().split('T')[0] };
    } else {
        // Timed events use dateTime format
        event.start = {
            dateTime: startDateTime.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
        event.end = {
            dateTime: endDateTime.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
    }
    
    // Add optional fields
    if (eventData.description) {
        event.description = eventData.description;
    }
    
    if (eventData.location) {
        event.location = eventData.location;
    }
    
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create event');
    }
    
    return await response.json();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'createEvent') {
        (async () => {
            try {
                const token = await getAccessToken();
                const event = await createCalendarEvent(request.eventData, token);
                sendResponse({ success: true, event });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true; // Required for async sendResponse
    }
    
    if (request.action === 'getAccessToken') {
        getAccessToken()
            .then(token => sendResponse({ success: true, token }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

