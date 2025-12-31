// Popup script for calendar extension
document.addEventListener('DOMContentLoaded', async () => {
    const titleInput = document.getElementById('eventTitle');
    const dateInput = document.getElementById('eventDate');
    const timeInput = document.getElementById('eventTime');
    const addEventBtn = document.getElementById('addEventBtn');
    const signOutBtn = document.getElementById('signOutBtn');
    const statusDiv = document.getElementById('status');
    const dropZone = document.getElementById('dropZone');
    const icsFileInput = document.getElementById('icsFileInput');
    
    // Load stored event data from content script or context menu
    chrome.storage.local.get(['eventData'], (result) => {
        if (result.eventData) {
            titleInput.value = result.eventData.title || '';
            
            if (result.eventData.fullDateTime) {
                const date = new Date(result.eventData.fullDateTime);
                if (!isNaN(date.getTime())) {
                    dateInput.value = date.toISOString().split('T')[0];
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    timeInput.value = `${hours}:${minutes}`;
                } else {
                    setDefaultDateTime();
                }
            } else {
                setDefaultDateTime();
            }
            
            // Clear stored data after loading
            chrome.storage.local.remove(['eventData']);
        } else {
            setDefaultDateTime();
        }
    });
    
    function setDefaultDateTime() {
        // Set default to today and current time + 1 hour
        const now = new Date();
        dateInput.value = now.toISOString().split('T')[0];
        const futureTime = new Date(now.getTime() + 60 * 60 * 1000);
        const hours = String(futureTime.getHours()).padStart(2, '0');
        const minutes = String(futureTime.getMinutes()).padStart(2, '0');
        timeInput.value = `${hours}:${minutes}`;
    }
    
    // Handle add event button
    addEventBtn.addEventListener('click', async () => {
        const title = titleInput.value.trim();
        if (!title) {
            showStatus('Please enter an event title', 'error');
            return;
        }
        
        const dateStr = dateInput.value;
        const timeStr = timeInput.value;
        
        if (!dateStr) {
            showStatus('Please select a date', 'error');
            return;
        }
        
        const dateTime = new Date(`${dateStr}T${timeStr}`);
        if (isNaN(dateTime.getTime())) {
            showStatus('Invalid date or time', 'error');
            return;
        }
        
        addEventBtn.disabled = true;
        addEventBtn.textContent = 'Adding...';
        
        try {
            // Get access token
            const tokenResponse = await chrome.runtime.sendMessage({ action: 'getAccessToken' });
            if (!tokenResponse.success) {
                throw new Error(tokenResponse.error || 'Failed to authenticate');
            }
            
            const eventData = {
                title: title,
                fullDateTime: dateTime
            };
            
            // Create event
            const response = await chrome.runtime.sendMessage({
                action: 'createEvent',
                eventData: eventData
            });
            
            if (response.success) {
                showStatus('Event added to calendar successfully!', 'success');
                // Clear form after a delay
                setTimeout(() => {
                    titleInput.value = '';
                    // Reset to default date/time
                    const now = new Date();
                    dateInput.value = now.toISOString().split('T')[0];
                    const futureTime = new Date(now.getTime() + 60 * 60 * 1000);
                    const hours = String(futureTime.getHours()).padStart(2, '0');
                    const minutes = String(futureTime.getMinutes()).padStart(2, '0');
                    timeInput.value = `${hours}:${minutes}`;
                    statusDiv.className = 'status';
                }, 2000);
            } else {
                throw new Error(response.error || 'Failed to create event');
            }
        } catch (error) {
            showStatus(`Error: ${error.message}`, 'error');
        } finally {
            addEventBtn.disabled = false;
            addEventBtn.textContent = 'Add to Calendar';
        }
    });
    
    // Handle sign out button
    signOutBtn.addEventListener('click', async () => {
        try {
            chrome.identity.getAuthToken({ interactive: false }, (token) => {
                if (token) {
                    chrome.identity.removeCachedAuthToken({ token: token }, () => {
                        showStatus('Signed out successfully', 'success');
                    });
                } else {
                    showStatus('Not signed in', 'error');
                }
            });
        } catch (error) {
            showStatus(`Error signing out: ${error.message}`, 'error');
        }
    });
    
    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
    }
    
    // Handle .ics/.ical file drag and drop
    dropZone.addEventListener('click', () => {
        icsFileInput.click();
    });
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleICSFile(files[0]);
        }
    });
    
    icsFileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            handleICSFile(files[0]);
        }
    });
    
    async function handleICSFile(file) {
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.ics') && !fileName.endsWith('.ical')) {
            showStatus('Please select a .ics or .ical file', 'error');
            return;
        }
        
        showStatus('Reading file...', 'success');
        
        try {
            const text = await file.text();
            const events = parseICSFile(text);
            
            if (events.length === 0) {
                showStatus('No events found in calendar file', 'error');
                return;
            }
            
            showStatus(`Found ${events.length} event(s). Adding to calendar...`, 'success');
            
            // Get access token
            const tokenResponse = await chrome.runtime.sendMessage({ action: 'getAccessToken' });
            if (!tokenResponse.success) {
                throw new Error(tokenResponse.error || 'Failed to authenticate');
            }
            
            // Create all events
            let successCount = 0;
            let errorCount = 0;
            
            for (const event of events) {
                try {
                    if (!event.summary) {
                        event.summary = 'Imported Event';
                    }
                    
                    if (!event.start) {
                        console.warn('Event missing start time, skipping:', event);
                        errorCount++;
                        continue;
                    }
                    
                    // If no end time, default to 1 hour after start
                    if (!event.end) {
                        event.end = new Date(event.start.getTime() + 60 * 60 * 1000);
                    }
                    
                    const eventData = {
                        title: event.summary,
                        fullDateTime: event.start,
                        endDateTime: event.end,
                        description: event.description || '',
                        location: event.location || '',
                        allDay: event.allDay || false
                    };
                    
                    const response = await chrome.runtime.sendMessage({
                        action: 'createEvent',
                        eventData: eventData
                    });
                    
                    if (response.success) {
                        successCount++;
                    } else {
                        errorCount++;
                        console.error('Failed to create event:', response.error);
                    }
                } catch (error) {
                    errorCount++;
                    console.error('Error creating event:', error);
                }
            }
            
            if (successCount > 0) {
                showStatus(`Successfully added ${successCount} event(s) to calendar${errorCount > 0 ? ` (${errorCount} failed)` : ''}`, 'success');
            } else {
                showStatus(`Failed to add events: ${errorCount} error(s)`, 'error');
            }
            
            // Reset file input
            icsFileInput.value = '';
        } catch (error) {
            console.error('Error processing .ics file:', error);
            showStatus(`Error: ${error.message}`, 'error');
        }
    }
});

