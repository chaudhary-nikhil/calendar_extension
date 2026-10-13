// .ics (iCalendar) file parser
function parseICSFile(content) {
    const events = [];
    const lines = content.split(/\r?\n/);
    
    let currentEvent = null;
    let inEvent = false;
    let currentProperty = null;
    let currentValue = '';
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        // Handle line folding (lines starting with space/tab continue previous line)
        if (line.match(/^[ \t]/)) {
            if (currentProperty) {
                currentValue += line.substring(1);
            }
            continue;
        }
        
        // Process previous property if exists
        if (currentProperty && currentValue) {
            processProperty(currentEvent, currentProperty, currentValue);
            currentProperty = null;
            currentValue = '';
        }
        
        // Skip empty lines
        if (!line.trim()) continue;
        
        // Parse property line (FORMAT: PROPERTY;PARAMS:VALUE)
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;
        
        const propertyPart = line.substring(0, colonIndex);
        const valuePart = line.substring(colonIndex + 1);
        
        const semicolonIndex = propertyPart.indexOf(';');
        const property = semicolonIndex !== -1 ? propertyPart.substring(0, semicolonIndex) : propertyPart;
        const params = semicolonIndex !== -1 ? propertyPart.substring(semicolonIndex + 1) : '';
        
        // Handle BEGIN/END
        if (property === 'BEGIN') {
            if (valuePart === 'VEVENT') {
                inEvent = true;
                currentEvent = {
                    summary: '',
                    description: '',
                    location: '',
                    start: null,
                    end: null,
                    allDay: false
                };
            }
        } else if (property === 'END') {
            if (valuePart === 'VEVENT' && currentEvent) {
                events.push(currentEvent);
                currentEvent = null;
                inEvent = false;
            }
        } else if (inEvent && currentEvent) {
            // Store property for processing (handles line folding)
            currentProperty = property;
            currentValue = valuePart;
        }
    }
    
    // Process last property
    if (currentProperty && currentValue && currentEvent) {
        processProperty(currentEvent, currentProperty, currentValue);
    }
    
    // Add last event if exists
    if (currentEvent && inEvent) {
        events.push(currentEvent);
    }
    
    return events;
}

function processProperty(event, property, value) {
    switch (property) {
        case 'SUMMARY':
            event.summary = unescapeICS(value);
            break;
        case 'DESCRIPTION':
            event.description = unescapeICS(value);
            break;
        case 'LOCATION':
            event.location = unescapeICS(value);
            break;
        case 'DTSTART':
            event.start = parseICSDate(value);
            // Check if it's an all-day event (DATE format vs DATE-TIME)
            event.allDay = !value.includes('T');
            break;
        case 'DTEND':
        case 'DTEND;VALUE=DATE':
            event.end = parseICSDate(value);
            break;
        case 'DURATION':
            if (event.start && !event.end) {
                event.end = parseDuration(event.start, value);
            }
            break;
    }
}

function parseICSDate(value) {
    // Handle format: 20240115T100000 or 20240115T100000Z
    // Also handle DATE format: 20240115
    let dateStr = value;
    
    // Remove timezone indicator (Z or timezone offset)
    dateStr = dateStr.replace(/Z$/, '');
    dateStr = dateStr.replace(/[+-]\d{4}$/, '');
    
    if (dateStr.includes('T')) {
        // DATE-TIME format: YYYYMMDDTHHMMSS
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1; // Month is 0-indexed
        const day = parseInt(dateStr.substring(6, 8));
        const hour = parseInt(dateStr.substring(9, 11) || 0);
        const minute = parseInt(dateStr.substring(11, 13) || 0);
        const second = parseInt(dateStr.substring(13, 15) || 0);
        
        return new Date(year, month, day, hour, minute, second);
    } else {
        // DATE format: YYYYMMDD (all-day event)
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        
        return new Date(year, month, day);
    }
}

function parseDuration(startDate, durationStr) {
    // Parse ISO 8601 duration format: PT1H30M (1 hour 30 minutes)
    // or P1D (1 day)
    const duration = durationStr.replace(/^P/, '');
    const endDate = new Date(startDate);
    
    if (duration.includes('D')) {
        const days = parseInt(duration.match(/(\d+)D/)?.[1] || 0);
        endDate.setDate(endDate.getDate() + days);
    }
    
    if (duration.includes('T')) {
        const timePart = duration.split('T')[1];
        const hours = parseInt(timePart.match(/(\d+)H/)?.[1] || 0);
        const minutes = parseInt(timePart.match(/(\d+)M/)?.[1] || 0);
        const seconds = parseInt(timePart.match(/(\d+)S/)?.[1] || 0);
        
        endDate.setHours(endDate.getHours() + hours);
        endDate.setMinutes(endDate.getMinutes() + minutes);
        endDate.setSeconds(endDate.getSeconds() + seconds);
    }
    
    return endDate;
}

function unescapeICS(value) {
    // Unescape iCalendar text
    return value
        .replace(/\\n/g, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\');
}


