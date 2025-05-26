// ==UserScript==
// @name         VH NM Item Marker
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Marks Vine items (dbl-click). Ctrl+Click "Go to Marked" button to clear all marks (if marked item is hidden/truncated)
// @author       YourName
// @match        https://www.amazon.ca/vine/vine-items*
// @match        https://www.amazon.com/vine/vine-items*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const TARGET_PATHNAME = "/vine/vine-items";
    const TARGET_SEARCH = "?queue=encore";
    const TARGET_HASH = "#monitorLoadAllListerners";

    const ITEM_GRID_ID = 'vvp-items-grid';
    const ITEM_SELECTOR = '.vvp-item-tile.vh-gridview';
    const MARKED_ITEM_CLASS_BLUE = 'vh-nm-marked-item-blue'; // Class name remains, but its style is dynamic
    const GO_TO_MARKED_BUTTON_ID = 'vh-nm-go-to-marked-button';
    const STORAGE_KEY_MARKED_ASINS = `vhNmMarkedASINs_dblClick_v2.3_${window.location.hostname}`; // Key for marked ASINs
    const DOUBLE_CLICK_TIMEOUT = 300;

    const COLOR_SCHEMES = {
        "vibrant_blue": {
            name: "Vibrant Blue",
            markedItemBg: '#8ecae6',    // A brighter, slightly cerulean blue
            markedItemBorder: '#0077b6', // A strong, clear blue
            goToButtonBg: '#023e8a',     // A deep, rich navy blue
            goToButtonHoverBg: '#002855'  // Darker navy
        },
        "bold_charcoal": {
            name: "Bold Charcoal",
            markedItemBg: '#adb5bd',    // A noticeable light grey
            markedItemBorder: '#343a40', // Dark charcoal / almost black
            goToButtonBg: '#495057',     // A solid medium-dark grey
            goToButtonHoverBg: '#343a40'  // Darker charcoal
        },
        "electric_yellow": {
            name: "Electric Yellow",
            markedItemBg: '#fff352',    // A bright, almost neon yellow
            markedItemBorder: '#ffc300', // A strong, rich gold/yellow
            goToButtonBg: '#ffaa00',     // A vibrant orange-yellow
            goToButtonHoverBg: '#cc8400'  // Darker orange-yellow
        },
        "emerald_green": {
            name: "Emerald Green",
            markedItemBg: '#a7f3d0',    // A bright, minty green
            markedItemBorder: '#059669', // A rich emerald green
            goToButtonBg: '#047857',     // A deep tealish green
            goToButtonHoverBg: '#065f46'  // Darker tealish green
        },
        "fiery_red": {
            name: "Fiery Red",
            markedItemBg: '#ffccd5',    // Light pinkish red
            markedItemBorder: '#d90429', // Strong, vibrant red
            goToButtonBg: '#ef233c',     // Bright, slightly orangey red
            goToButtonHoverBg: '#bc1823'  // Darker red
        },
        "royal_purple": {
            name: "Royal Purple",
            markedItemBg: '#e0c3fc',    // Light lavender
            markedItemBorder: '#7b2cbf', // Rich royal purple
            goToButtonBg: '#5a189a',     // Deep violet
            goToButtonHoverBg: '#3c096c'  // Darker violet
        }
    };
    const CONFIG_KEY_SELECTED_SCHEME = `vhNmSelectedColorScheme_v2.3_${window.location.hostname}`; // Key for selected scheme
    let currentColorScheme = COLOR_SCHEMES["vibrant_blue"]; // Default, will be updated by loadConfig


    let currentMarkedItemIndex = 0;
    let isProgrammaticScroll = false;
    let persistedMarkedASINs = new Set();
    let clickTimers = {};
    let dynamicStyleTag = null;


    // --- STYLES (Static part) ---
    GM_addStyle(`
        .${MARKED_ITEM_CLASS_BLUE}::before { /* This can stay static or be made dynamic */
            content: '●';
            position: absolute;
            top: 2px;
            left: 2px;
            color: darkblue; /* Consider making this dynamic too if schemes vary a lot */
            font-size: 14px;
            z-index: 101;
        }
    `);

    // --- DYNAMIC STYLES & CONFIG ---
    function updateDynamicStyles() {
        if (!dynamicStyleTag) {
            dynamicStyleTag = document.createElement('style');
            dynamicStyleTag.id = 'vh-nm-marker-dynamic-styles';
            document.head.appendChild(dynamicStyleTag);
        }

        dynamicStyleTag.textContent = `
            .${MARKED_ITEM_CLASS_BLUE} {
                background-color: ${currentColorScheme.markedItemBg} !important;
                border: 2px solid ${currentColorScheme.markedItemBorder} !important;
                box-shadow: 0 0 10px ${currentColorScheme.markedItemBorder} !important;
            }
            #${GO_TO_MARKED_BUTTON_ID} {
                position: fixed;
                bottom: 20px;
                right: 20px;
                color: white;
                padding: 10px 15px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                z-index: 1001;
                display: none;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                background-color: ${currentColorScheme.goToButtonBg};
            }
            #${GO_TO_MARKED_BUTTON_ID}:hover {
                background-color: ${currentColorScheme.goToButtonHoverBg};
            }
        `;
        updateGoToButtonVisibility(); // Ensure button visibility/text is correct after style update
    }

    function loadConfig() {
        const savedSchemeName = GM_getValue(CONFIG_KEY_SELECTED_SCHEME, "vibrant_blue"); // Use new default key
        currentColorScheme = COLOR_SCHEMES[savedSchemeName] || COLOR_SCHEMES["vibrant_blue"]; // Fallback
        updateDynamicStyles();
    }

    // --- LOCALSTORAGE FUNCTIONS ---
    function loadMarksFromStorage() {
        const storedASINsJSON = localStorage.getItem(STORAGE_KEY_MARKED_ASINS);
        if (storedASINsJSON) {
            try { persistedMarkedASINs = new Set(JSON.parse(storedASINsJSON)); }
            catch (e) { console.error("VH NM Item Marker: Error parsing stored ASINs.", e); persistedMarkedASINs = new Set(); localStorage.removeItem(STORAGE_KEY_MARKED_ASINS); }
        } else { persistedMarkedASINs = new Set(); }
    }
    function saveMarksToStorage() { localStorage.setItem(STORAGE_KEY_MARKED_ASINS, JSON.stringify(Array.from(persistedMarkedASINs))); }

    // --- HELPER FUNCTIONS ---
    function updateGoToButtonVisibility() {
        const goToButton = document.getElementById(GO_TO_MARKED_BUTTON_ID);
        if (!goToButton) return;

        if (persistedMarkedASINs.size > 0) {
            goToButton.style.display = 'block';
            goToButton.textContent = `Go to Marked (${persistedMarkedASINs.size})`;
            goToButton.title = 'Click to go to next marked item. Ctrl+Click to clear all marks.';
        } else {
            goToButton.style.display = 'none';
            goToButton.title = '';
        }
    }
    function applyMarkToItemDOM(item, markClass = MARKED_ITEM_CLASS_BLUE) { item.classList.add(markClass); }
    function removeMarkFromItemDOM(item, markClass = MARKED_ITEM_CLASS_BLUE) { item.classList.remove(markClass); }

    function toggleMarkItem(item, markClass = MARKED_ITEM_CLASS_BLUE) {
        const asin = item.dataset.asin;
        if (!asin) return;
        if (persistedMarkedASINs.has(asin)) {
            persistedMarkedASINs.delete(asin); removeMarkFromItemDOM(item, markClass);
        } else {
            persistedMarkedASINs.add(asin); applyMarkToItemDOM(item, markClass);
        }
        saveMarksToStorage(); updateGoToButtonVisibility();
    }

    function setupDoubleClickMarking(item) {
        if (item.dataset.vhNmDblclickMarkingSetup === 'true') return;
        const asin = item.dataset.asin;
        if (asin && persistedMarkedASINs.has(asin)) { applyMarkToItemDOM(item); }
        item.addEventListener('click', function(event) {
            const asinForClick = this.dataset.asin;
            if (!asinForClick) return;
            if (event.target.tagName === 'A' || event.target.closest('A')) {}
            if (!clickTimers[asinForClick]) {
                clickTimers[asinForClick] = setTimeout(() => { delete clickTimers[asinForClick]; }, DOUBLE_CLICK_TIMEOUT);
            } else {
                clearTimeout(clickTimers[asinForClick]); delete clickTimers[asinForClick];
                toggleMarkItem(this); event.preventDefault(); event.stopPropagation();
            }
        });
        item.dataset.vhNmDblclickMarkingSetup = 'true';
    }

    function scrollToNextMarkedItem() {
        const visibleMarkedItems = [];
        persistedMarkedASINs.forEach(asin => {
            const item = document.querySelector(`${ITEM_SELECTOR}[data-asin="${asin}"]`);
            if (item && item.offsetParent !== null) { visibleMarkedItems.push(item); }
        });
        if (visibleMarkedItems.length === 0) {
            if (persistedMarkedASINs.size > 0) { alert("Marked items are not currently visible on the page."); }
            return;
        }
        visibleMarkedItems.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
        currentMarkedItemIndex = (currentMarkedItemIndex + visibleMarkedItems.length) % visibleMarkedItems.length;
        const itemToScrollTo = visibleMarkedItems[currentMarkedItemIndex];
        if (itemToScrollTo) {
            isProgrammaticScroll = true;
            itemToScrollTo.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const scrollAnimationTime = 700; const goldHighlightDuration = 500;
            itemToScrollTo.style.boxShadow = '0 0 15px 5px gold';
            setTimeout(() => {
                itemToScrollTo.style.boxShadow = '';
                isProgrammaticScroll = false;
            }, scrollAnimationTime + goldHighlightDuration);
        }
        currentMarkedItemIndex = (currentMarkedItemIndex + 1) % visibleMarkedItems.length;
        if (visibleMarkedItems.length === 0 && currentMarkedItemIndex > 0) currentMarkedItemIndex = 0;
    }

    // --- UTILITY FUNCTION for Clearing Marks ---
    function clearAllMarkedItems() {
        if (confirm("Are you sure you want to clear all marked items for " + window.location.hostname + "?")) {
            const currentlyMarkedDOMItems = document.querySelectorAll(`.${ITEM_SELECTOR}.${MARKED_ITEM_CLASS_BLUE}`);
            currentlyMarkedDOMItems.forEach(itemDOM => { removeMarkFromItemDOM(itemDOM, MARKED_ITEM_CLASS_BLUE); });
            persistedMarkedASINs.clear(); saveMarksToStorage();
            updateGoToButtonVisibility();
            alert("All marked items for ".concat(window.location.hostname, " have been cleared."));
        }
    }

    // --- Config Panel ---
    function showColorSchemeConfigPanel() {
        let panel = document.getElementById('vh-nm-scheme-config-panel');
        if (panel) {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            if (panel.style.display === 'block') {
                document.getElementById('cfgColorSchemeSelect').value = GM_getValue(CONFIG_KEY_SELECTED_SCHEME, "vibrant_blue"); // Use new default
            }
            return;
        }

        panel = document.createElement('div');
        panel.id = 'vh-nm-scheme-config-panel';
        panel.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background-color: #f0f0f0; border: 1px solid #ccc; padding: 20px;
            z-index: 2000; box-shadow: 0 0 15px rgba(0,0,0,0.3); border-radius: 5px;
            font-family: Arial, sans-serif; min-width: 300px;
        `;

        let selectHTML = '<select id="cfgColorSchemeSelect" style="padding: 8px; margin-bottom: 15px; width: 100%; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">';
        const currentSelectedKey = GM_getValue(CONFIG_KEY_SELECTED_SCHEME, "vibrant_blue"); // Use new default
        for (const key in COLOR_SCHEMES) {
            selectHTML += `<option value="${key}" ${key === currentSelectedKey ? 'selected' : ''}>${COLOR_SCHEMES[key].name}</option>`;
        }
        selectHTML += '</select>';

        panel.innerHTML = `
            <h3 style="margin-top:0; margin-bottom:15px; text-align:center; color: #333;">Select Color Scheme</h3>
            ${selectHTML}
            <div style="text-align: right;">
                <button id="cfgSaveScheme" style="padding: 8px 15px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">Save</button>
                <button id="cfgCloseSchemePanel" style="padding: 8px 15px; background-color: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
            </div>
        `;
        document.body.appendChild(panel);

        document.getElementById('cfgSaveScheme').addEventListener('click', () => {
            const selectedSchemeKey = document.getElementById('cfgColorSchemeSelect').value;
            GM_setValue(CONFIG_KEY_SELECTED_SCHEME, selectedSchemeKey);
            currentColorScheme = COLOR_SCHEMES[selectedSchemeKey] || COLOR_SCHEMES["vibrant_blue"]; // Fallback to new default
            updateDynamicStyles();
            panel.style.display = 'none';
            alert('Color scheme saved!');
        });

        document.getElementById('cfgCloseSchemePanel').addEventListener('click', () => {
            panel.style.display = 'none';
        });
    }

    // --- Event Handler for the "Go to Marked" Button ---
    function handleGoToMarkedButtonClick(event) {
        if (event.ctrlKey || event.metaKey) {
            event.preventDefault(); clearAllMarkedItems();
        } else { scrollToNextMarkedItem(); }
    }

    // --- INITIALIZATION ---
    function initializeItemMarker() {
        if (!((window.location.hostname === "www.amazon.ca" || window.location.hostname === "www.amazon.com") &&
            window.location.pathname === TARGET_PATHNAME && window.location.search === TARGET_SEARCH && window.location.hash === TARGET_HASH)) {
            return;
        }
        loadConfig();
        loadMarksFromStorage();

        let goToButton = document.getElementById(GO_TO_MARKED_BUTTON_ID);
        if (!goToButton) {
            goToButton = document.createElement('button'); goToButton.id = GO_TO_MARKED_BUTTON_ID;
            document.body.appendChild(goToButton);
            goToButton.addEventListener('click', handleGoToMarkedButtonClick);
        } else {
            goToButton.removeEventListener('click', scrollToNextMarkedItem);
            goToButton.removeEventListener('click', handleGoToMarkedButtonClick);
            goToButton.addEventListener('click', handleGoToMarkedButtonClick);
        }

        const initialItems = document.querySelectorAll(ITEM_SELECTOR);
        initialItems.forEach(setupDoubleClickMarking);
        // updateGoToButtonVisibility(); // updateDynamicStyles now calls this

        const gridContainer = document.getElementById(ITEM_GRID_ID);
        if (gridContainer) {
            const observer = new MutationObserver(mutationsList => {
                let itemsAddedOrRemoved = false;
                for (const mutation of mutationsList) {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                if (node.matches(ITEM_SELECTOR)) { setupDoubleClickMarking(node); itemsAddedOrRemoved = true; }
                                else { node.querySelectorAll(ITEM_SELECTOR).forEach(setupDoubleClickMarking); if (node.querySelector(ITEM_SELECTOR)) itemsAddedOrRemoved = true; }
                            }
                        });
                        mutation.removedNodes.forEach(node => { if (node.nodeType === Node.ELEMENT_NODE && node.dataset && persistedMarkedASINs.has(node.dataset.asin)) { itemsAddedOrRemoved = true; } });
                    }
                }
                if (itemsAddedOrRemoved) { updateGoToButtonVisibility(); }
            });
            observer.observe(gridContainer, { childList: true, subtree: true });
        } else { console.error("VH NM Item Marker: Item grid container not found for MutationObserver."); }
    }

    // Register Menu Commands
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand("Configure Color Scheme (VH NM)", showColorSchemeConfigPanel, "S");
        GM_registerMenuCommand("Clear All Marked Items (VH NM)", clearAllMarkedItems, "C");
    }

    // --- SCRIPT EXECUTION ---
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initializeItemMarker();
    } else { window.addEventListener('load', initializeItemMarker); }
})();
