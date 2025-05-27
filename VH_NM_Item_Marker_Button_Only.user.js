// ==UserScript==
// @name         VH NM Item Marker
// @namespace    http://tampermonkey.net/
// @version      3.2.2-ColorSchemeDebug // Specific version for this debug
// @description  Marks Vine items with a button. Configurable color schemes. Ctrl+Click "Go to Marked" to clear.
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
    console.log("VH NM Item Marker (v3.2.2-ColorSchemeDebug): Script starting...");


    const TARGET_PATHNAME = "/vine/vine-items";
    const TARGET_SEARCH = "?queue=encore";
    const TARGET_HASH = "#monitorLoadAllListerners";

    const ITEM_GRID_ID = 'vvp-items-grid';
    const ITEM_SELECTOR = '.vvp-item-tile.vh-gridview';
    const MARKED_ITEM_CLASS_BLUE = 'vh-nm-marked-item-blue';
    const GO_TO_MARKED_BUTTON_ID = 'vh-nm-go-to-marked-button';
    const MARK_TILE_BUTTON_CLASS = 'vh-nm-mark-tile-btn';
    const IMAGE_CONTAINER_SELECTOR = '.vh-img-container';

    const STORAGE_KEY_MARKED_ASINS = `vhNmMarkedASINs_button_v3.2_${window.location.hostname}`; // Using your 3.2 key
    const CONFIG_KEY_SELECTED_SCHEME = `vhNmSelectedColorScheme_v3.2_${window.location.hostname}`; // Using your 3.2 key


    const COLOR_SCHEMES = {
        "vibrant_blue": { name: "Vibrant Blue", markedItemBg: '#8ecae6', markedItemBorder: '#0077b6', goToButtonBg: '#023e8a', goToButtonHoverBg: '#002855', titleTextColor: '#000000' },
        "bold_charcoal": { name: "Bold Charcoal", markedItemBg: '#adb5bd', markedItemBorder: '#343a40', goToButtonBg: '#495057', goToButtonHoverBg: '#343a40', titleTextColor: '#FFFFFF' },
        "electric_yellow": { name: "Electric Yellow", markedItemBg: '#fff352', markedItemBorder: '#ffc300', goToButtonBg: '#ffaa00', goToButtonHoverBg: '#cc8400', titleTextColor: '#212529' },
        "emerald_green": { name: "Emerald Green", markedItemBg: '#a7f3d0', markedItemBorder: '#059669', goToButtonBg: '#047857', goToButtonHoverBg: '#065f46', titleTextColor: '#000000' },
        "fiery_red": { name: "Fiery Red", markedItemBg: '#ffccd5', markedItemBorder: '#d90429', goToButtonBg: '#ef233c', goToButtonHoverBg: '#bc1823', titleTextColor: '#000000' },
        "royal_purple": { name: "Royal Purple", markedItemBg: '#e0c3fc', markedItemBorder: '#7b2cbf', goToButtonBg: '#5a189a', goToButtonHoverBg: '#3c096c', titleTextColor: '#000000' }
    };
    let currentColorScheme = COLOR_SCHEMES["vibrant_blue"]; // Default, overridden by loadConfig
    let dynamicStyleTag = null;

    let currentMarkedItemIndex = 0;
    let isProgrammaticScroll = false;
    let persistedMarkedASINs = new Set();


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
        ${IMAGE_CONTAINER_SELECTOR} {
            position: relative;
        }
        .${MARK_TILE_BUTTON_CLASS} {
            position: absolute;
            bottom: -1px;
            right: 10px;
            background-color: rgba(0, 0, 0, 0.4);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.5);
            border-radius: 3px;
            padding: 2px 6px;
            font-size: 10px;
            cursor: pointer;
            z-index: 100;
            opacity: 0.7;
            transition: opacity 0.2s ease-in-out, background-color 0.2s ease-in-out;
        }
        .${MARK_TILE_BUTTON_CLASS}:hover {
            opacity: 1;
            background-color: rgba(0, 0, 0, 0.6);
        }
        .${MARK_TILE_BUTTON_CLASS}.marked {
            background-color: rgba(255, 0, 0, 0.6);
            border-color: rgba(255,255,255,0.7);
        }
        .${MARK_TILE_BUTTON_CLASS}.marked:hover {
            background-color: rgba(255, 0, 0, 0.8);
        }
    `);

    // --- DYNAMIC STYLES & CONFIG ---
    function updateDynamicStyles(schemeToApply) {
        const activeScheme = schemeToApply || currentColorScheme;
        // console.log("VH NM Item Marker (DEBUG): updateDynamicStyles called. Applying scheme:", activeScheme.name);

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
                opacity: 1 !important; filter: brightness(1) !important;
            }
            ${ITEM_SELECTOR}.${MARKED_ITEM_CLASS_BLUE}[style*="opacity: 0.5"][style*="filter: brightness(0.7)"],
            ${ITEM_SELECTOR}.${MARKED_ITEM_CLASS_BLUE}[style*="opacity:0.5"][style*="filter:brightness(0.7)"] {
                opacity: 0.9 !important; filter: brightness(0.95) !important;
            }
            .${MARKED_ITEM_CLASS_BLUE} .vvp-item-product-title-container .a-link-normal {
                color: ${activeScheme.titleTextColor || 'inherit'} !important; text-shadow: none !important;
            }
            .${MARKED_ITEM_CLASS_BLUE} .vvp-item-product-title-container .a-link-normal span[class*="a-truncate"] {
                color: ${activeScheme.titleTextColor || 'inherit'} !important; text-shadow: none !important;
            }
            #${GO_TO_MARKED_BUTTON_ID} {
                position: fixed; bottom: 20px; right: 20px; color: white; padding: 10px 15px;
                border: none; border-radius: 5px; cursor: pointer; z-index: 1001; display: none;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2); background-color: ${activeScheme.goToButtonBg};
            }
            #${GO_TO_MARKED_BUTTON_ID}:hover { background-color: ${activeScheme.goToButtonHoverBg}; }
        `;
        if (activeScheme === currentColorScheme) { updateGoToButtonVisibility(); }
    }

    function loadConfig() {
        const savedSchemeName = GM_getValue(CONFIG_KEY_SELECTED_SCHEME, "vibrant_blue");
        currentColorScheme = COLOR_SCHEMES[savedSchemeName] || COLOR_SCHEMES["vibrant_blue"];
        console.log("VH NM Item Marker (DEBUG): Loaded config. Selected scheme:", currentColorScheme.name, "(key:", savedSchemeName, ")");
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
    function saveMarksToStorage() {
        localStorage.setItem(STORAGE_KEY_MARKED_ASINS, JSON.stringify(Array.from(persistedMarkedASINs)));
    }

    // --- HELPER FUNCTIONS ---
    function updateGoToButtonVisibility() {
        const goToButton = document.getElementById(GO_TO_MARKED_BUTTON_ID);
        if (!goToButton) return;
        if (persistedMarkedASINs.size > 0) {
            goToButton.style.display = 'block'; goToButton.textContent = `Go to Marked (${persistedMarkedASINs.size})`;
            goToButton.title = 'Click to go to next marked item. Ctrl+Click to clear all marks.';
        } else { goToButton.style.display = 'none'; goToButton.title = ''; }
    }
    function applyMarkToItemDOM(item) { item.classList.add(MARKED_ITEM_CLASS_BLUE); }
    function removeMarkFromItemDOM(item) { item.classList.remove(MARKED_ITEM_CLASS_BLUE); }

    function toggleMarkItem(item, buttonElement) {
        const asin = item.dataset.asin;
        if (!asin) return;
        const isCurrentlyMarked = persistedMarkedASINs.has(asin);
        if (isCurrentlyMarked) {
            persistedMarkedASINs.delete(asin); removeMarkFromItemDOM(item);
            if (buttonElement) { buttonElement.textContent = 'Mark'; buttonElement.classList.remove('marked'); }
        } else {
            persistedMarkedASINs.add(asin); applyMarkToItemDOM(item);
            if (buttonElement) { buttonElement.textContent = 'Unmark'; buttonElement.classList.add('marked'); }
        }
        saveMarksToStorage(); updateGoToButtonVisibility();
    }

    function addItemMarkButton(item) {
        if (!item || !item.dataset) { return; }
        const setupFlag = 'vhNmMarkButtonSetup';
        if (item.dataset[setupFlag] === 'true') return;

        const asin = item.dataset.asin;
        if (!asin) { item.dataset[setupFlag] = 'true'; return; }

        const imgContainer = item.querySelector(IMAGE_CONTAINER_SELECTOR);
        if (!imgContainer) { item.dataset[setupFlag] = 'true'; return; }

        const markButton = document.createElement('button');
        markButton.className = MARK_TILE_BUTTON_CLASS;

        if (persistedMarkedASINs.has(asin)) {
            applyMarkToItemDOM(item);
            markButton.textContent = 'Unmark';
            markButton.classList.add('marked');

            // DEBUG LOG: Check applied styles when item is re-added and should be marked
            if (document.contains(item)) { // Ensure item is in DOM before getComputedStyle
                const styles = window.getComputedStyle(item);
                console.log(`VH NM Item Marker (DEBUG): Item ${asin} processed by addItemMarkButton (should be marked). Current BG: ${styles.backgroundColor}, Current Scheme: ${currentColorScheme.name}, Expected Scheme BG: ${currentColorScheme.markedItemBg}`);
            }

        } else {
            removeMarkFromItemDOM(item);
            markButton.textContent = 'Mark';
            markButton.classList.remove('marked');
        }

        markButton.addEventListener('click', function(event) {
            event.preventDefault(); event.stopPropagation();
            toggleMarkItem(item, this);
        });

        imgContainer.appendChild(markButton);
        item.dataset[setupFlag] = 'true';
    }

    function scrollToNextMarkedItem() { /* ... same as your v3.2 ... */
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
            setTimeout(() => { itemToScrollTo.style.boxShadow = ''; isProgrammaticScroll = false; }, scrollAnimationTime + goldHighlightDuration);
        }
        currentMarkedItemIndex = (currentMarkedItemIndex + 1) % visibleMarkedItems.length;
        if (visibleMarkedItems.length === 0 && currentMarkedItemIndex > 0) currentMarkedItemIndex = 0;
    }
    function clearAllMarkedItems() { /* ... same as your v3.2 ... */
        if (confirm("Are you sure you want to clear all marked items for " + window.location.hostname + "?")) {
            const currentlyMarkedDOMItems = document.querySelectorAll(`${ITEM_SELECTOR}.${MARKED_ITEM_CLASS_BLUE}`);
            currentlyMarkedDOMItems.forEach(itemDOM => {
                removeMarkFromItemDOM(itemDOM);
                const markButton = itemDOM.querySelector(`.${MARK_TILE_BUTTON_CLASS}`);
                if (markButton) { markButton.textContent = 'Mark'; markButton.classList.remove('marked'); }
            });
            persistedMarkedASINs.clear(); localStorage.removeItem(STORAGE_KEY_MARKED_ASINS);
            updateGoToButtonVisibility();
            alert("All marked items for ".concat(window.location.hostname, " have been cleared."));
        }
    }
    function showColorSchemeConfigPanel() { /* ... same as your v3.2 ... */
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
            } return;
        }
        panel = document.createElement('div'); panel.id = 'vh-nm-scheme-config-panel';
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
            updateDynamicStyles(currentColorScheme); panel.style.display = 'none';
        });
        document.getElementById('cfgCloseSchemePanel').addEventListener('click', () => {
            updateDynamicStyles(originalSavedScheme); panel.style.display = 'none';
        });
    }
    function handleGoToMarkedButtonClick(event) { /* ... same as your v3.2 ... */
        if (event.ctrlKey || event.metaKey) { event.preventDefault(); clearAllMarkedItems(); }
        else { scrollToNextMarkedItem(); }
    }

    // --- INITIALIZATION ---
    function initializeItemMarker() {
        console.log("VH NM Item Marker (v3.2.2-ColorSchemeDebug): initializeItemMarker running.");
        if (!((window.location.hostname === "www.amazon.ca" || window.location.hostname === "www.amazon.com") &&
            window.location.pathname === TARGET_PATHNAME && window.location.search === TARGET_SEARCH && window.location.hash === TARGET_HASH)) {
            return;
        }
        loadConfig(); // Sets currentColorScheme and applies initial dynamic styles
        loadMarksFromStorage(); // Loads persisted ASINs

        let goToButton = document.getElementById(GO_TO_MARKED_BUTTON_ID);
        if (!goToButton) {
            goToButton = document.createElement('button'); goToButton.id = GO_TO_MARKED_BUTTON_ID;
            document.body.appendChild(goToButton); goToButton.addEventListener('click', handleGoToMarkedButtonClick);
        } else {
            goToButton.removeEventListener('click', scrollToNextMarkedItem);
            goToButton.removeEventListener('click', handleGoToMarkedButtonClick);
            goToButton.addEventListener('click', handleGoToMarkedButtonClick);
        }

        document.querySelectorAll(ITEM_SELECTOR).forEach(addItemMarkButton);
        // updateGoToButtonVisibility(); // Already called by updateDynamicStyles within loadConfig

        const gridContainer = document.getElementById(ITEM_GRID_ID);
        if (gridContainer) {
            const observer = new MutationObserver(mutationsList => {
                let itemsProcessedInThisMutation = false;
                for (const mutation of mutationsList) {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                if (node.matches(ITEM_SELECTOR)) { try { addItemMarkButton(node); itemsProcessedInThisMutation = true; } catch (e) { console.error("VH NM Item Marker: Error in addItemMarkButton (direct node):", e, node); } }
                                else { node.querySelectorAll(ITEM_SELECTOR).forEach(itemNode => { try { addItemMarkButton(itemNode); itemsProcessedInThisMutation = true; } catch (e) { console.error("VH NM Item Marker: Error in addItemMarkButton (descendant):", e, itemNode); } }); }
                            }
                        });
                        mutation.removedNodes.forEach(node => { if (node.nodeType === Node.ELEMENT_NODE && node.dataset && persistedMarkedASINs.has(node.dataset.asin)) { itemsProcessedInThisMutation = true; } });
                    }
                }
                if (itemsProcessedInThisMutation) { updateGoToButtonVisibility(); }
            });
            observer.observe(gridContainer, { childList: true, subtree: true });
        } else { console.error("VH NM Item Marker: Item grid container not found for MutationObserver."); }
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand("Configure Color Scheme (VH NM)", showColorSchemeConfigPanel, "S");
        GM_registerMenuCommand("Clear All Marked Items (VH NM)", clearAllMarkedItems, "C");
    }
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initializeItemMarker();
    } else { window.addEventListener('load', initializeItemMarker); }

})();
