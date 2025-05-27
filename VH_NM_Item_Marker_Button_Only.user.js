// ==UserScript==
// @name         VH NM Item Marker (Button)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Marks Vine items within Vine Helper Notification Monitor. Configurable color schemes. Ctrl+Click "Go to Marked" to clear data.
// @author       BSRFD
// @match        https://www.amazon.ca/*
// @match        https://www.amazon.com/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const TARGET_PATHNAME = "/vine/vine-items";
    const TARGET_SEARCH_STARTS_WITH = "?queue=encore";
    const TARGET_HASH_OPTIONS = ["#monitorLoadAllListerners", "#monitorLoadAllListeners"]; // Accept known hash variations

    let scriptInitializedForView = false;
    let globalBodyObserver = null;

    const ITEM_GRID_ID = 'vvp-items-grid';
    const ITEM_SELECTOR = '.vvp-item-tile.vh-gridview';
    const MARKED_ITEM_CLASS = 'vh-nm-marked-item'; // Simplified class name
    const GO_TO_MARKED_BUTTON_ID = 'vh-nm-go-to-marked-button';
    const MARK_TILE_BUTTON_CLASS = 'vh-nm-mark-tile-btn';
    const IMAGE_CONTAINER_SELECTOR = '.vh-img-container';

    const STORAGE_KEY_MARKED_ASINS_PREFIX = `vhNmMarkedASINs_`;
    const CONFIG_KEY_SELECTED_SCHEME_PREFIX = `vhNmSelectedColorScheme_`;

    const COLOR_SCHEMES = {
        "vibrant_blue": { name: "Vibrant Blue", markedItemBg: '#8ecae6', markedItemBorder: '#0077b6', goToButtonBg: '#023e8a', goToButtonHoverBg: '#002855', titleTextColor: '#000000', goToButtonTextColor: '#FFFFFF' },
        "bold_charcoal": { name: "Bold Charcoal", markedItemBg: '#adb5bd', markedItemBorder: '#343a40', goToButtonBg: '#495057', goToButtonHoverBg: '#343a40', titleTextColor: '#FFFFFF', goToButtonTextColor: '#FFFFFF' },
        "electric_yellow": { name: "Electric Yellow", markedItemBg: '#fff352', markedItemBorder: '#ffc300', goToButtonBg: '#ffaa00', goToButtonHoverBg: '#cc8400', titleTextColor: '#212529', goToButtonTextColor: '#212529' },
        "emerald_green": { name: "Emerald Green", markedItemBg: '#a7f3d0', markedItemBorder: '#059669', goToButtonBg: '#047857', goToButtonHoverBg: '#065f46', titleTextColor: '#000000', goToButtonTextColor: '#FFFFFF' },
        "fiery_red": { name: "Fiery Red", markedItemBg: '#ffccd5', markedItemBorder: '#d90429', goToButtonBg: '#ef233c', goToButtonHoverBg: '#bc1823', titleTextColor: '#000000', goToButtonTextColor: '#FFFFFF' },
        "royal_purple": { name: "Royal Purple", markedItemBg: '#e0c3fc', markedItemBorder: '#7b2cbf', goToButtonBg: '#5a189a', goToButtonHoverBg: '#3c096c', titleTextColor: '#000000', goToButtonTextColor: '#FFFFFF' }
    };
    let currentColorScheme = COLOR_SCHEMES["vibrant_blue"];
    let dynamicStyleTag = null;
    let currentMarkedItemIndex = 0;
    let persistedMarkedASINs = new Set();

    function getStorageKeyMarkedASINs() {
        return `${STORAGE_KEY_MARKED_ASINS_PREFIX}${window.location.hostname}`;
    }
    function getConfigKeySelectedScheme() {
        return `${CONFIG_KEY_SELECTED_SCHEME_PREFIX}${window.location.hostname}`;
    }

    GM_addStyle(`
        .${MARKED_ITEM_CLASS}::before { content: '●'; position: absolute; top: 2px; left: 2px; color: darkblue; font-size: 14px; z-index: 101; }
        ${IMAGE_CONTAINER_SELECTOR} { position: relative; }
        .${MARK_TILE_BUTTON_CLASS} { position: absolute; bottom: -1px; right: 10px; background-color: rgba(0, 0, 0, 0.4); color: white; border: 1px solid rgba(255, 255, 255, 0.5); border-radius: 3px; padding: 2px 6px; font-size: 10px; cursor: pointer; z-index: 100; opacity: 0.7; transition: opacity 0.2s ease-in-out, background-color 0.2s ease-in-out; }
        .${MARK_TILE_BUTTON_CLASS}:hover { opacity: 1; background-color: rgba(0, 0, 0, 0.6); }
        .${MARK_TILE_BUTTON_CLASS}.marked { background-color: rgba(255, 0, 0, 0.6); border-color: rgba(255,255,255,0.7); }
        .${MARK_TILE_BUTTON_CLASS}.marked:hover { background-color: rgba(255, 0, 0, 0.8); }
    `);

    function updateDynamicStyles(schemeToApply) {
        const activeScheme = schemeToApply || currentColorScheme;
        if (!dynamicStyleTag) { dynamicStyleTag = document.createElement('style'); dynamicStyleTag.id = 'vh-nm-marker-dynamic-styles'; document.head.appendChild(dynamicStyleTag); }
        dynamicStyleTag.textContent = `
            .${MARKED_ITEM_CLASS} { background-color: ${activeScheme.markedItemBg} !important; border: 2px solid ${activeScheme.markedItemBorder} !important; box-shadow: 0 0 10px ${activeScheme.markedItemBorder} !important; opacity: 1 !important; filter: brightness(1) !important; }
            ${ITEM_SELECTOR}.${MARKED_ITEM_CLASS}[style*="opacity: 0.5"][style*="filter: brightness(0.7)"], ${ITEM_SELECTOR}.${MARKED_ITEM_CLASS}[style*="opacity:0.5"][style*="filter:brightness(0.7)"] { opacity: 0.9 !important; filter: brightness(0.95) !important; }
            .${MARKED_ITEM_CLASS} .vvp-item-product-title-container .a-link-normal { color: ${activeScheme.titleTextColor || 'inherit'} !important; text-shadow: none !important; }
            .${MARKED_ITEM_CLASS} .vvp-item-product-title-container .a-link-normal span[class*="a-truncate"] { color: ${activeScheme.titleTextColor || 'inherit'} !important; text-shadow: none !important; }
            #${GO_TO_MARKED_BUTTON_ID} { position: fixed; bottom: 20px; right: 20px; padding: 10px 15px; border: none; border-radius: 5px; cursor: pointer; z-index: 1001; display: none; box-shadow: 0 2px 5px rgba(0,0,0,0.2); background-color: ${activeScheme.goToButtonBg}; color: ${activeScheme.goToButtonTextColor || '#FFFFFF'} !important; }
            #${GO_TO_MARKED_BUTTON_ID}:hover { background-color: ${activeScheme.goToButtonHoverBg}; }
        `;
        if (activeScheme === currentColorScheme) { updateGoToButtonVisibility(); }
    }

    function loadConfig() {
        const savedSchemeName = GM_getValue(getConfigKeySelectedScheme(), "vibrant_blue");
        currentColorScheme = COLOR_SCHEMES[savedSchemeName] || COLOR_SCHEMES["vibrant_blue"];
        updateDynamicStyles(currentColorScheme);
    }

    function loadMarksFromStorage() {
        const storedASINsJSON = localStorage.getItem(getStorageKeyMarkedASINs());
        if (storedASINsJSON) { try { persistedMarkedASINs = new Set(JSON.parse(storedASINsJSON)); } catch (e) { persistedMarkedASINs = new Set(); localStorage.removeItem(getStorageKeyMarkedASINs()); } }
        else { persistedMarkedASINs = new Set(); }
    }

    function saveMarksToStorage() { localStorage.setItem(getStorageKeyMarkedASINs(), JSON.stringify(Array.from(persistedMarkedASINs))); }

    function updateGoToButtonVisibility() {
        const goToButton = document.getElementById(GO_TO_MARKED_BUTTON_ID); if (!goToButton) return;
        if (persistedMarkedASINs.size > 0) { goToButton.style.display = 'block'; goToButton.textContent = `Go to Marked (${persistedMarkedASINs.size})`; goToButton.title = 'Click to go to next marked item. Ctrl+Click to clear all marks.'; }
        else { goToButton.style.display = 'none'; goToButton.title = ''; }
    }

    function applyMarkToItemDOM(item) { item.classList.add(MARKED_ITEM_CLASS); }
    function removeMarkFromItemDOM(item) { item.classList.remove(MARKED_ITEM_CLASS); }

    function toggleMarkItem(item, buttonElement) {
        const asin = item.dataset.asin; if (!asin) return;
        if (persistedMarkedASINs.has(asin)) { persistedMarkedASINs.delete(asin); removeMarkFromItemDOM(item); if (buttonElement) { buttonElement.textContent = 'Mark'; buttonElement.classList.remove('marked'); } }
        else { persistedMarkedASINs.add(asin); applyMarkToItemDOM(item); if (buttonElement) { buttonElement.textContent = 'Unmark'; buttonElement.classList.add('marked'); } }
        saveMarksToStorage(); updateGoToButtonVisibility();
    }

    function addItemMarkButton(item) {
        if (!item || !item.dataset) { return; } const setupFlag = 'vhNmMarkButtonSetup'; if (item.dataset[setupFlag] === 'true') return;
        const asin = item.dataset.asin; if (!asin) { item.dataset[setupFlag] = 'true'; return; }
        const imgContainer = item.querySelector(IMAGE_CONTAINER_SELECTOR); if (!imgContainer) { item.dataset[setupFlag] = 'true'; return; }

        const markButton = document.createElement('button'); markButton.className = MARK_TILE_BUTTON_CLASS;
        if (persistedMarkedASINs.has(asin)) { applyMarkToItemDOM(item); markButton.textContent = 'Unmark'; markButton.classList.add('marked'); }
        else { removeMarkFromItemDOM(item); markButton.textContent = 'Mark'; markButton.classList.remove('marked'); }
        markButton.addEventListener('click', function(event) { event.preventDefault(); event.stopPropagation(); toggleMarkItem(item, this); });
        imgContainer.appendChild(markButton); item.dataset[setupFlag] = 'true';
    }

    function scrollToNextMarkedItem() {
        const visibleMarkedItems = Array.from(persistedMarkedASINs)
            .map(asin => document.querySelector(`${ITEM_SELECTOR}[data-asin="${asin}"]`))
            .filter(item => item && item.offsetParent !== null)
            .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);

        if (visibleMarkedItems.length === 0) { if (persistedMarkedASINs.size > 0) { alert("Marked items are not currently visible on the page."); } return; }

        currentMarkedItemIndex = (currentMarkedItemIndex % visibleMarkedItems.length); // Ensure index is valid before use
        const itemToScrollTo = visibleMarkedItems[currentMarkedItemIndex];
        if (itemToScrollTo) {
            itemToScrollTo.scrollIntoView({ behavior: 'smooth', block: 'center' });
            itemToScrollTo.style.boxShadow = '0 0 15px 5px gold';
            setTimeout(() => { itemToScrollTo.style.boxShadow = ''; }, 1200); // scroll + highlight duration
        }
        currentMarkedItemIndex = (currentMarkedItemIndex + 1) % visibleMarkedItems.length;
    }

    function clearAllMarkedItems() {
        if (confirm(`Are you sure you want to clear all marked items for ${window.location.hostname}?`)) {
            document.querySelectorAll(`${ITEM_SELECTOR}.${MARKED_ITEM_CLASS}`).forEach(itemDOM => {
                removeMarkFromItemDOM(itemDOM);
                const markButton = itemDOM.querySelector(`.${MARK_TILE_BUTTON_CLASS}`);
                if (markButton) { markButton.textContent = 'Mark'; markButton.classList.remove('marked'); }
            });
            persistedMarkedASINs.clear(); localStorage.removeItem(getStorageKeyMarkedASINs());
            updateGoToButtonVisibility();
            alert(`All marked items for ${window.location.hostname} have been cleared.`);
        }
    }

    function showColorSchemeConfigPanel() {
        let panel = document.getElementById('vh-nm-scheme-config-panel');
        const originalSavedSchemeKey = GM_getValue(getConfigKeySelectedScheme(), "vibrant_blue");
        const originalSavedScheme = COLOR_SCHEMES[originalSavedSchemeKey] || COLOR_SCHEMES["vibrant_blue"];

        if (panel) {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            if (panel.style.display === 'block') {
                const selectElement = document.getElementById('cfgColorSchemeSelect');
                if (selectElement) { selectElement.value = originalSavedSchemeKey; }
                updateDynamicStyles(originalSavedScheme);
            }
            return;
        }
        panel = document.createElement('div'); panel.id = 'vh-nm-scheme-config-panel';
        panel.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background-color: #f0f0f0; border: 1px solid #ccc; padding: 20px; z-index: 2000; box-shadow: 0 0 15px rgba(0,0,0,0.3); border-radius: 5px; font-family: Arial, sans-serif; min-width: 300px;`;
        let selectHTML = '<select id="cfgColorSchemeSelect" style="padding: 8px; margin-bottom: 15px; width: 100%; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">';
        Object.keys(COLOR_SCHEMES).forEach(key => { selectHTML += `<option value="${key}" ${key === originalSavedSchemeKey ? 'selected' : ''}>${COLOR_SCHEMES[key].name}</option>`; });
        selectHTML += '</select>';
        panel.innerHTML = `<h3 style="margin-top:0; margin-bottom:15px; text-align:center; color: #333;">Select Color Scheme (Live Preview)</h3> ${selectHTML} <div style="text-align: right;"> <button id="cfgSaveScheme" style="padding: 8px 15px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">Save</button> <button id="cfgCloseSchemePanel" style="padding: 8px 15px; background-color: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button> </div>`;
        document.body.appendChild(panel);

        const selectElement = document.getElementById('cfgColorSchemeSelect');
        selectElement.addEventListener('change', () => {
            const previewScheme = COLOR_SCHEMES[selectElement.value] || originalSavedScheme;
            updateDynamicStyles(previewScheme);
        });
        document.getElementById('cfgSaveScheme').addEventListener('click', () => {
            currentColorScheme = COLOR_SCHEMES[selectElement.value] || originalSavedScheme;
            GM_setValue(getConfigKeySelectedScheme(), selectElement.value);
            updateDynamicStyles(currentColorScheme); panel.style.display = 'none';
        });
        document.getElementById('cfgCloseSchemePanel').addEventListener('click', () => {
            updateDynamicStyles(originalSavedScheme); panel.style.display = 'none';
        });
    }

    function handleGoToMarkedButtonClick(event) {
        if (event.ctrlKey || event.metaKey) { event.preventDefault(); clearAllMarkedItems(); }
        else { scrollToNextMarkedItem(); }
    }

    function performScriptInitialization() {
        loadConfig();
        loadMarksFromStorage();

        let goToButton = document.getElementById(GO_TO_MARKED_BUTTON_ID);
        if (!goToButton) {
            goToButton = document.createElement('button'); goToButton.id = GO_TO_MARKED_BUTTON_ID;
            document.body.appendChild(goToButton);
            goToButton.addEventListener('click', handleGoToMarkedButtonClick);
        } else {
            goToButton.removeEventListener('click', handleGoToMarkedButtonClick);
            goToButton.addEventListener('click', handleGoToMarkedButtonClick);
        }

        document.querySelectorAll(ITEM_SELECTOR).forEach(addItemMarkButton);
        updateGoToButtonVisibility();

        const gridContainer = document.getElementById(ITEM_GRID_ID);
        if (gridContainer) {
            if (gridContainer.internalItemObserver) { gridContainer.internalItemObserver.disconnect(); delete gridContainer.internalItemObserver; }
            const itemObserver = new MutationObserver(mutationsList => {
                let itemsProcessed = false;
                for (const mutation of mutationsList) {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                if (node.matches(ITEM_SELECTOR)) { try { addItemMarkButton(node); itemsProcessed = true; } catch (e) { console.error("Error adding mark button (direct):", e, node); } }
                                else { node.querySelectorAll(ITEM_SELECTOR).forEach(itemNode => { try { addItemMarkButton(itemNode); itemsProcessed = true; } catch (e) { console.error("Error adding mark button (descendant):", e, itemNode); } }); }
                            }
                        });
                    }
                }
                if (itemsProcessed) { updateGoToButtonVisibility(); }
            });
            itemObserver.observe(gridContainer, { childList: true, subtree: true });
            gridContainer.internalItemObserver = itemObserver;
        } else {
            // console.warn("Item grid container not found during initialization.");
        }
        scriptInitializedForView = true;
    }

    function cleanupScriptEffects() {
        const goToButton = document.getElementById(GO_TO_MARKED_BUTTON_ID);
        if (goToButton) { goToButton.remove(); }

        const gridContainer = document.getElementById(ITEM_GRID_ID);
        if (gridContainer && gridContainer.internalItemObserver) {
            gridContainer.internalItemObserver.disconnect();
            delete gridContainer.internalItemObserver;
        }

        document.querySelectorAll('.' + MARK_TILE_BUTTON_CLASS).forEach(btn => btn.remove());
        document.querySelectorAll(ITEM_SELECTOR + '[data-vh-nm-mark-button-setup="true"]').forEach(item => {
            item.removeAttribute('data-vh-nm-mark-button-setup');
            removeMarkFromItemDOM(item);
        });

        persistedMarkedASINs.clear();
        scriptInitializedForView = false;
    }

    function checkUrlAndInitializeAppropriately() {
        const { hostname, pathname, search, hash } = window.location;

        const hostnameMatch = (hostname === "www.amazon.ca" || hostname === "www.amazon.com");
        const pathnameMatch = pathname === TARGET_PATHNAME;
        const searchMatch = search.startsWith(TARGET_SEARCH_STARTS_WITH);
        const hashMatch = TARGET_HASH_OPTIONS.includes(hash);

        if (hostnameMatch && pathnameMatch && searchMatch && hashMatch) {
            if (!scriptInitializedForView) {
                performScriptInitialization();
            }
        } else {
            if (scriptInitializedForView) {
                cleanupScriptEffects();
            }
        }
    }

    const bodyObserverCallback = () => { checkUrlAndInitializeAppropriately(); };
    globalBodyObserver = new MutationObserver(bodyObserverCallback);

    function startGlobalObservers() {
        if (document.body) {
            globalBodyObserver.observe(document.body, { childList: true, subtree: true });
        } else {
            window.addEventListener('DOMContentLoaded', () => {
                if (document.body) globalBodyObserver.observe(document.body, { childList: true, subtree: true });
            }, { once: true });
        }
    }

    (function(history){
        let lastHref = document.location.href;
        const dispatchLocationChange = () => {
            if (document.location.href !== lastHref) {
                window.dispatchEvent(new CustomEvent('locationchange'));
                lastHref = document.location.href;
            }
        };
        const originalPushState = history.pushState;
        history.pushState = function() { originalPushState.apply(history, arguments); dispatchLocationChange(); };
        const originalReplaceState = history.replaceState;
        history.replaceState = function() { originalReplaceState.apply(history, arguments); dispatchLocationChange(); };
        window.addEventListener('popstate', dispatchLocationChange);
        window.addEventListener('hashchange', dispatchLocationChange); // Catch direct hash changes too
        window.addEventListener('locationchange', checkUrlAndInitializeAppropriately);
    })(window.history);

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        checkUrlAndInitializeAppropriately();
        startGlobalObservers();
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            checkUrlAndInitializeAppropriately();
            startGlobalObservers();
        }, { once: true });
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand("Configure Color Scheme", showColorSchemeConfigPanel, "S");
        GM_registerMenuCommand("Clear All Marked Items", clearAllMarkedItems, "C");
    }
})();
