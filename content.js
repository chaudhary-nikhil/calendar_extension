// Content script to handle text selection
(function() {
    let selectedText = '';
    
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
})();

