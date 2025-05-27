// ==UserScript==
// @name         VH NM Item Marker
// @namespace    http://tampermonkey.net/
// @version      2.7
// @description  Marks Vine items (dbl-click). Configurable color schemes. Ctrl+Click "Go to Marked" to clear.
// @author       BSRFD
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
    const MARKED_ITEM_CLASS_BLUE = 'vh-nm-marked-item-blue';
    const GO_TO_MARKED_BUTTON_ID = 'vh-nm-go-to-marked-button';
    const STORAGE_KEY_MARKED_ASINS = `vhNmMarkedASINs_dblClick_v2.7_${window.location.hostname}`; // Version bump
    const DOUBLE_CLICK_TIMEOUT = 300;

    const COLOR_SCHEMES = {
        "vibrant_blue": { name: "Vibrant Blue", markedItemBg: '#8ecae6', markedItemBorder: '#0077b6', goToButtonBg: '#023e8a', goToButtonHoverBg: '#002855' },
        "bold_charcoal": { name: "Bold Charcoal", markedItemBg: '#adb5bd', markedItemBorder: '#343a40', goToButtonBg: '#495057', goToButtonHoverBg: '#343a40' },
        "electric_yellow": { name: "Electric Yellow", markedItemBg: '#fff352', markedItemBorder: '#ffc300', goToButtonBg: '#ffaa00', goToButtonHoverBg: '#cc8400' },
        "emerald_green": { name: "Emerald Green", markedItemBg: '#a7f3d0', markedItemBorder: '#059669', goToButtonBg: '#047857', goToButtonHoverBg: '#065f46' },
        "fiery_red": { name: "Fiery Red", markedItemBg: '#ffccd5', markedItemBorder: '#d90429', goToButtonBg: '#ef233c', goToButtonHoverBg: '#bc1823' },
        "royal_purple": { name: "Royal Purple", markedItemBg: '#e0c3fc', markedItemBorder: '#7b2cbf', goToButtonBg: '#5a189a', goToButtonHoverBg: '#3c096c' }
    };
    const CONFIG_KEY_SELECTED_SCHEME = `vhNmSelectedColorScheme_v2.7_${window.location.hostname}`; // Version bump
    let currentColorScheme = COLOR_SCHEMES["vibrant_blue"];
    let dynamicStyleTag = null;

    let currentMarkedItemIndex = 0;
    let isProgrammaticScroll = false;
    let persistedMarkedASINs = new Set();
    let clickTimers = {};

    // --- STYLES ---
    GM_addStyle(`
        .${MARKED_ITEM_CLASS_BLUE}::before {
            content: '●';
            position: absolute;
            top: 2px;
            left: 2px;
            color: darkblue;
            font-size: 14px;
            z-index: 101;
        }
    `);

    // --- DYNAMIC STYLES & CONFIG ---
    function updateDynamicStyles(schemeToApply) {
        const activeScheme = schemeToApply || currentColorScheme;

        if (!dynamicStyleTag) {
            dynamicStyleTag = document.createElement('style');
            dynamicStyleTag.id = 'vh-nm-marker-dynamic-styles';
            document.head.appendChild(dynamicStyleTag);
        }
        dynamicStyleTag.textContent = `
            .${MARKED_ITEM_CLASS_BLUE} {
                background-color: ${activeScheme.markedItemBg} !important;
                border: 2px solid ${activeScheme.markedItemBorder} !important;
                box-shadow: 0 0 10px ${activeScheme.markedItemBorder} !important;
                opacity: 1 !important;
                filter: brightness(1) !important;
            }
            ${ITEM_SELECTOR}.${MARKED_ITEM_CLASS_BLUE}[style*="opacity: 0.5"][style*="filter: brightness(0.7)"],
            ${ITEM_SELECTOR}.${MARKED_ITEM_CLASS_BLUE}[style*="opacity:0.5"][style*="filter:brightness(0.7)"] {
                opacity: 0.9 !important;
                filter: brightness(0.95) !important;
            }
            #${GO_TO_MARKED_BUTTON_ID} {
                position: fixed; bottom: 20px; right: 20px;
                color: white; padding: 10px 15px; border: none; border-radius: 5px;
                cursor: pointer; z-index: 1001; display: none;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                background-color: ${activeScheme.goToButtonBg};
            }
            #${GO_TO_MARKED_BUTTON_ID}:hover {
                background-color: ${activeScheme.goToButtonHoverBg};
            }
        `;
        if (activeScheme === currentColorScheme) {
            updateGoToButtonVisibility();
        }
    }

    function loadConfig() {
        const savedSchemeName = GM_getValue(CONFIG_KEY_SELECTED_SCHEME, "vibrant_blue");
        currentColorScheme = COLOR_SCHEMES[savedSchemeName] || COLOR_SCHEMES["vibrant_blue"];
        updateDynamicStyles(currentColorScheme);
    }

    // --- LOCALSTORAGE FUNCTIONS ---
    function loadMarksFromStorage() {
        const storedASINsJSON = localStorage.getItem(STORAGE_KEY_MARKED_ASINS);
        if (storedASINsJSON) {
            try { persistedMarkedASINs = new Set(JSON.parse(storedASINsJSON)); }
            catch (e) { persistedMarkedASINs = new Set(); localStorage.removeItem(STORAGE_KEY_MARKED_ASINS); }
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
    function applyMarkToItemDOM(item) { item.classList.add(MARKED_ITEM_CLASS_BLUE); }
    function removeMarkFromItemDOM(item) { item.classList.remove(MARKED_ITEM_CLASS_BLUE); }

    function toggleMarkItem(item) {
        const asin = item.dataset.asin;
        if (!asin) return;
        if (persistedMarkedASINs.has(asin)) {
            persistedMarkedASINs.delete(asin); removeMarkFromItemDOM(item);
        } else {
            persistedMarkedASINs.add(asin); applyMarkToItemDOM(item);
        }
        saveMarksToStorage(); updateGoToButtonVisibility();
    }

    // --- MODIFIED setupDoubleClickMarking ---
    function setupDoubleClickMarking(item) {
        if (!item || !item.dataset) {
            // console.warn("VH NM Item Marker: setupDoubleClickMarking called with invalid item.", item);
            return;
        }
        // Use a more specific dataset attribute to avoid conflict and ensure re-check if needed
        const setupFlag = 'vhNmProcessedForMarking';

        if (item.dataset[setupFlag] === 'true' && item.classList.contains(MARKED_ITEM_CLASS_BLUE) && persistedMarkedASINs.has(item.dataset.asin)) {
            // Already set up and correctly marked, nothing to do
            return;
        }
        // If it was marked as processed but isn't visually marked AND should be, we'll re-apply visual
        // Or if it was never processed.

        const asin = item.dataset.asin;
        if (!asin) {
            // console.warn("VH NM Item Marker: Item in setupDoubleClickMarking is missing data-asin.", item);
            item.dataset[setupFlag] = 'true'; // Mark as processed to avoid loops on bad items
            return;
        }

        // Apply visual mark if it's in persisted set
        if (persistedMarkedASINs.has(asin)) {
            if (!item.classList.contains(MARKED_ITEM_CLASS_BLUE)) {
                // console.log("VH NM Item Marker: Re-applying visual mark to ASIN:", asin);
                applyMarkToItemDOM(item);
            }
        } else {
            // Ensure it's not visually marked if it's not in our persisted set
            if (item.classList.contains(MARKED_ITEM_CLASS_BLUE)) {
                // console.log("VH NM Item Marker: Removing lingering visual mark from ASIN:", asin);
                removeMarkFromItemDOM(item);
            }
        }

        // Add event listener only if not already added (or if we want to ensure it's the correct one)
        // A simple way is to remove then add, or check for a specific listener if possible (hard)
        // For now, let's rely on the setupFlag for the initial pass,
        // but if an item is re-added, it might need listeners re-attached if the element is new.
        // The current MutationObserver logic will call this for new DOM elements.

        // If we are re-processing an item that somehow lost its listener but kept the flag,
        // it's safer to remove any old one and add anew, but that's complex.
        // Let's assume for now if the flag is set, the listener is also set.
        // The main goal here is to ensure visual consistency if an item is re-added.

        if (item.dataset[setupFlag] !== 'true') { // Only add listener once per DOM element instance
            item.addEventListener('click', function(event) {
                const asinForClick = this.dataset.asin;
                if (!asinForClick) return;
                if (event.target.tagName === 'A' || event.target.closest('A')) { return; }

                if (!clickTimers[asinForClick]) {
                    clickTimers[asinForClick] = setTimeout(() => { delete clickTimers[asinForClick]; }, DOUBLE_CLICK_TIMEOUT);
                } else {
                    clearTimeout(clickTimers[asinForClick]); delete clickTimers[asinForClick];
                    toggleMarkItem(this); event.preventDefault(); event.stopPropagation();
                }
            });
        }
        item.dataset[setupFlag] = 'true';
    }
    // --- END MODIFIED ---


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

    function clearAllMarkedItems() {
        if (confirm("Are you sure you want to clear all marked items for " + window.location.hostname + "?")) {
            const currentlyMarkedDOMItems = document.querySelectorAll(`${ITEM_SELECTOR}.${MARKED_ITEM_CLASS_BLUE}`);
            currentlyMarkedDOMItems.forEach(removeMarkFromItemDOM);
            persistedMarkedASINs.clear();
            localStorage.removeItem(STORAGE_KEY_MARKED_ASINS);
            updateGoToButtonVisibility();
            alert("All marked items for ".concat(window.location.hostname, " have been cleared."));
        }
    }

    function showColorSchemeConfigPanel() {
        let panel = document.getElementById('vh-nm-scheme-config-panel');
        let selectElement = null;
        const originalSavedSchemeKey = GM_getValue(CONFIG_KEY_SELECTED_SCHEME, "vibrant_blue");
        const originalSavedScheme = COLOR_SCHEMES[originalSavedSchemeKey] || COLOR_SCHEMES["vibrant_blue"];

        if (panel) {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            if (panel.style.display === 'block') {
                selectElement = document.getElementById('cfgColorSchemeSelect');
                if (selectElement) { selectElement.value = originalSavedSchemeKey; }
                updateDynamicStyles(originalSavedScheme);
            }
            return;
        }
        panel = document.createElement('div');
        panel.id = 'vh-nm-scheme-config-panel';
        panel.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background-color: #f0f0f0; border: 1px solid #ccc; padding: 20px; z-index: 2000; box-shadow: 0 0 15px rgba(0,0,0,0.3); border-radius: 5px; font-family: Arial, sans-serif; min-width: 300px;`;
        let selectHTML = '<select id="cfgColorSchemeSelect" style="padding: 8px; margin-bottom: 15px; width: 100%; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">';
        for (const key in COLOR_SCHEMES) { selectHTML += `<option value="${key}" ${key === originalSavedSchemeKey ? 'selected' : ''}>${COLOR_SCHEMES[key].name}</option>`; }
        selectHTML += '</select>';
        panel.innerHTML = `<h3 style="margin-top:0; margin-bottom:15px; text-align:center; color: #333;">Select Color Scheme (Live Preview)</h3> ${selectHTML} <div style="text-align: right;"> <button id="cfgSaveScheme" style="padding: 8px 15px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">Save</button> <button id="cfgCloseSchemePanel" style="padding: 8px 15px; background-color: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button> </div>`;
        document.body.appendChild(panel);
        selectElement = document.getElementById('cfgColorSchemeSelect');
        selectElement.addEventListener('change', () => {
            const previewSchemeKey = selectElement.value;
            const previewScheme = COLOR_SCHEMES[previewSchemeKey] || originalSavedScheme;
            updateDynamicStyles(previewScheme);
        });
        document.getElementById('cfgSaveScheme').addEventListener('click', () => {
            const selectedSchemeKey = selectElement.value;
            GM_setValue(CONFIG_KEY_SELECTED_SCHEME, selectedSchemeKey);
            currentColorScheme = COLOR_SCHEMES[selectedSchemeKey] || originalSavedScheme;
            updateDynamicStyles(currentColorScheme);
            panel.style.display = 'none';
        });
        document.getElementById('cfgCloseSchemePanel').addEventListener('click', () => {
            updateDynamicStyles(originalSavedScheme);
            panel.style.display = 'none';
        });
    }

    function handleGoToMarkedButtonClick(event) {
        if (event.ctrlKey || event.metaKey) { event.preventDefault(); clearAllMarkedItems(); }
        else { scrollToNextMarkedItem(); }
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

        // Process initially loaded items
        document.querySelectorAll(ITEM_SELECTOR).forEach(setupDoubleClickMarking);

        const gridContainer = document.getElementById(ITEM_GRID_ID);
        if (gridContainer) {
            // --- MODIFIED MutationObserver Callback ---
            const observer = new MutationObserver(mutationsList => {
                let itemsProcessedInThisMutation = false;
                for (const mutation of mutationsList) {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                // Check the node itself
                                if (node.matches(ITEM_SELECTOR)) {
                                    try {
                                        setupDoubleClickMarking(node);
                                        itemsProcessedInThisMutation = true;
                                    } catch (e) {
                                        console.error("VH NM Item Marker: Error in setupDoubleClickMarking for added node:", e, node);
                                    }
                                }
                                // Check descendants of the added node
                                node.querySelectorAll(ITEM_SELECTOR).forEach(itemNode => {
                                    try {
                                        setupDoubleClickMarking(itemNode);
                                        itemsProcessedInThisMutation = true;
                                    } catch (e) {
                                        console.error("VH NM Item Marker: Error in setupDoubleClickMarking for descendant node:", e, itemNode);
                                    }
                                });
                            }
                        });
                        // Check if a marked item was removed from DOM
                        mutation.removedNodes.forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE && node.dataset && persistedMarkedASINs.has(node.dataset.asin)) {
                                itemsProcessedInThisMutation = true; // To trigger button update
                            }
                        });
                    }
                }
                if (itemsProcessedInThisMutation) {
                    updateGoToButtonVisibility();
                }
            });
            // --- END MODIFIED ---
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
