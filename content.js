// Content script to handle text selection and the success check beside the pointer.
(function() {
    let selectedText = '';
    let pointer = { x: 24, y: 24 };

    document.addEventListener('mousemove', function(event) {
        pointer = { x: event.clientX, y: event.clientY };
    }, true);

    document.addEventListener('contextmenu', function(event) {
        pointer = { x: event.clientX, y: event.clientY };
    }, true);

    // Listen for text selection
    document.addEventListener('mouseup', function() {
        const text = window.getSelection().toString().trim();
        if (text.length > 0) {
            selectedText = text;
            // Store selected text for context menu
            chrome.storage.local.set({ selectedText: text });
        }
    });

    // Also handle keyboard selection
    document.addEventListener('keyup', function() {
        const text = window.getSelection().toString().trim();
        if (text.length > 0) {
            selectedText = text;
            chrome.storage.local.set({ selectedText: text });
        }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || message.action !== 'showCalendarCheck') return;
        showAddedCheck(pointer.x, pointer.y);
        sendResponse({ ok: true });
    });

    function showAddedCheck(x, y) {
        const previous = document.getElementById('calendar-quick-add-check');
        if (previous) previous.remove();

        const size = 22;
        const left = Math.min(window.innerWidth - size - 8, Math.max(8, x + 12));
        const top = Math.min(window.innerHeight - size - 8, Math.max(8, y - size - 8));
        const host = document.createElement('div');
        host.id = 'calendar-quick-add-check';
        host.style.cssText = [
            'all: initial',
            'position: fixed',
            'left: ' + left + 'px',
            'top: ' + top + 'px',
            'width: ' + size + 'px',
            'height: ' + size + 'px',
            'z-index: 2147483647',
            'pointer-events: none'
        ].join('; ');

        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = ''
            + '<style>'
            + '.box{width:22px;height:22px;border-radius:5px;background:#1f8a3b;box-shadow:0 2px 8px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;animation:pop .16s ease-out,fade 1.35s ease forwards;}'
            + 'svg{display:block;}'
            + '@keyframes pop{from{transform:scale(.55);opacity:0}to{transform:scale(1);opacity:1}}'
            + '@keyframes fade{0%,68%{opacity:1}100%{opacity:0}}'
            + '</style>'
            + '<div class="box" role="img" aria-label="Added to Google Calendar">'
            + '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">'
            + '<path d="M2.5 7.2 L5.6 10.2 L11.5 3.8" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
            + '</svg></div>';

        (document.documentElement || document.body).appendChild(host);
        setTimeout(() => host.remove(), 1400);
    }
})();


