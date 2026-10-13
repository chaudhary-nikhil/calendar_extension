import { parseEventWithEngine, resolveRelativeDate } from './eventEngine.js';

// Background service worker for Chrome extension
const CLIENT_ID = '1066746635630-c911ajthbvktpij42c1ej0rimcp6nar0.apps.googleusercontent.com';
const API_KEY = 'AIzaSyCXTAZqHk6RYJH6jquN1-dHmJZJysig27U';

// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: 'addToCalendar',
            title: 'Add to Google Calendar',
            contexts: ['selection']
        });
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'addToCalendar') return;
    const selectedText = info.selectionText;

    try {
        const parsed = promoteDateOnly(await parseEventWithEngine(selectedText, {
            fallback: parseEventText
        })) || {};

        chrome.storage.local.set({
            eventData: {
                text: selectedText,
                title: parsed.title,
                date: parsed.date,
                time: parsed.time,
                allDay: !!parsed.allDay,
                fullDateTime: parsed.fullDateTime ? parsed.fullDateTime.toISOString() : null,
                endDateTime: parsed.endDateTime ? parsed.endDateTime.toISOString() : null
            }
        });

        if (!parsed.fullDateTime) {
            showCursorNotice(tab, info, false, 'No date found');
            notify('Calendar Quick Add', 'No date or time found. Click the extension icon to finish the event.');
            return;
        }

        const token = await getAccessToken();
        await createCalendarEvent({
            title: parsed.title,
            fullDateTime: parsed.fullDateTime,
            endDateTime: parsed.endDateTime || null,
            allDay: !!parsed.allDay
        }, token);
        showCursorNotice(tab, info, true, 'Added');
        notify('Event Added', `"${parsed.title}" added to Google Calendar`);
    } catch (error) {
        console.error('Failed to create event:', error);
        showCursorNotice(tab, info, false, 'Not added');
        notify('Calendar Quick Add', 'Click the extension icon to add event to calendar');
    }
});

function notify(title, message) {
    chrome.notifications.create({
        type: 'basic',
        title,
        message
    }, () => {
        void chrome.runtime.lastError;
    });
}

function showCursorNotice(tab, info, ok, text) {
    if (!tab || tab.id == null) return;
    const target = { tabId: tab.id };
    if (Number.isInteger(info && info.frameId)) target.frameIds = [info.frameId];
    chrome.scripting.executeScript({
        target,
        func: paintCalendarNotice,
        args: [{ ok: !!ok, text }]
    }, () => {
        void chrome.runtime.lastError;
    });
}

function paintCalendarNotice(notice) {
    const previous = document.getElementById('calendar-quick-add-check');
    if (previous) previous.remove();

    const pointer = globalThis.__calendarPointer;
    let x = 28;
    let y = 28;
    if (pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y)) {
        x = pointer.x;
        y = pointer.y;
    } else {
        const selection = window.getSelection && window.getSelection();
        if (selection && selection.rangeCount) {
            const rect = selection.getRangeAt(0).getBoundingClientRect();
            if (rect && (rect.width || rect.height)) {
                x = rect.right;
                y = rect.top;
            }
        }
    }

    if (!document.getElementById('calendar-quick-add-style')) {
        const style = document.createElement('style');
        style.id = 'calendar-quick-add-style';
        style.textContent = '@keyframes calendarQuickAddIn{from{transform:translateY(4px);opacity:0}to{transform:translateY(0);opacity:1}}';
        document.documentElement.appendChild(style);
    }

    const host = document.createElement('div');
    host.id = 'calendar-quick-add-check';
    host.setAttribute('role', 'status');
    host.style.cssText = [
        'all:initial',
        'position:fixed',
        'z-index:2147483647',
        'pointer-events:none',
        'display:flex',
        'align-items:center',
        'gap:8px',
        'padding:7px 12px 7px 8px',
        'background:#f4f1ea',
        'color:#1a1a1a',
        'border:1px solid #1a1a1a',
        'font-family:Georgia,Palatino,serif',
        'font-size:15px',
        'line-height:1',
        'white-space:nowrap',
        'box-sizing:border-box',
        'animation:calendarQuickAddIn .16s ease-out'
    ].join(';');

    const mark = document.createElement('span');
    mark.textContent = notice && notice.ok ? '✓' : '×';
    mark.style.cssText = 'all:initial;box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:16px;height:16px;border:1px solid #1a1a1a;color:#1a1a1a;font-family:Georgia,Palatino,serif;font-size:12px;line-height:1;';

    const label = document.createElement('span');
    label.textContent = (notice && notice.text) || (notice && notice.ok ? 'Added' : 'Not added');
    label.style.cssText = 'all:initial;color:#1a1a1a;font-family:Georgia,Palatino,serif;font-size:15px;line-height:1;';

    host.appendChild(mark);
    host.appendChild(label);
    (document.documentElement || document.body).appendChild(host);

    host.style.left = Math.max(8, x + 14) + 'px';
    host.style.top = Math.max(8, y - 40) + 'px';
    const placed = host.getBoundingClientRect();
    if (placed.right > window.innerWidth - 8) {
        host.style.left = Math.max(8, window.innerWidth - placed.width - 8) + 'px';
    }
    if (placed.bottom > window.innerHeight - 8) {
        host.style.top = Math.max(8, window.innerHeight - placed.height - 8) + 'px';
    }
    setTimeout(() => host.remove(), 2600);
}

function promoteDateOnly(parsed) {
    if (!parsed || parsed.allDay || parsed.fullDateTime || parsed.time || !parsed.date) {
        return parsed;
    }
    const parsedDate = parseDate(parsed.date);
    if (!parsedDate || isNaN(parsedDate.getTime())) return parsed;
    const local = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
    parsed.allDay = true;
    parsed.fullDateTime = local;
    parsed.date = formatLocalDate(local);
    return parsed;
}

function formatLocalDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

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
    const relative = resolveRelativeDate(dateStr);
    if (relative) {
        return new Date(relative.year, relative.month, relative.day);
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
        const exclusiveEnd = new Date(startDateTime.getFullYear(), startDateTime.getMonth(), startDateTime.getDate());
        exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
        event.start = { date: formatLocalDate(startDateTime) };
        event.end = { date: formatLocalDate(exclusiveEnd) };
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

