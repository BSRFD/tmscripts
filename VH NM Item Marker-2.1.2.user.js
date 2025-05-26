// ==UserScript==
// @name         VH NM Item Marker
// @namespace    http://tampermonkey.net/
// @version      2.1.2
// @description  Marks Vine items (dbl-click). Ctrl+Click "Go to Marked" button to clear all marks (if marked item is hidden/truncated)
// @author       BSRFD
// @match        https://www.amazon.ca/vine/vine-items*
// @match        https://www.amazon.com/vine/vine-items*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';
    console.log("VH NM Item Marker: Script starting..."); // INITIAL LOG

    const TARGET_PATHNAME = "/vine/vine-items";
    const TARGET_SEARCH = "?queue=encore";
    const TARGET_HASH = "#monitorLoadAllListerners";

    const ITEM_GRID_ID = 'vvp-items-grid';
    const ITEM_SELECTOR = '.vvp-item-tile.vh-gridview';
    const MARKED_ITEM_CLASS_BLUE = 'vh-nm-marked-item-blue';
    const GO_TO_MARKED_BUTTON_ID = 'vh-nm-go-to-marked-button';
    const STORAGE_KEY_MARKED_ASINS = `vhNmMarkedASINs_dblClick_simpleBtn_${window.location.hostname}`;
    const DOUBLE_CLICK_TIMEOUT = 300;

    let currentMarkedItemIndex = 0;
    let isProgrammaticScroll = false;
    let persistedMarkedASINs = new Set();
    let clickTimers = {};

    // --- STYLES ---
    GM_addStyle(`
        .${MARKED_ITEM_CLASS_BLUE} {
            background-color: lightblue !important;
            border: 2px solid blue !important;
            box-shadow: 0 0 10px blue !important;
        }
        .${MARKED_ITEM_CLASS_BLUE}::before {
            content: '●';
            position: absolute;
            top: 2px;
            left: 2px;
            color: darkblue;
            font-size: 14px;
            z-index: 101;
        }
        #${GO_TO_MARKED_BUTTON_ID} {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: #007bff;
            color: white;
            padding: 10px 15px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            z-index: 1001;
            display: none;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        #${GO_TO_MARKED_BUTTON_ID}:hover {
            background-color: #0056b3;
        }
    `);

    // --- LOCALSTORAGE FUNCTIONS ---
    function loadMarksFromStorage() {
        const currentStorageKey = STORAGE_KEY_MARKED_ASINS;
        const storedASINsJSON = localStorage.getItem(currentStorageKey);
        if (storedASINsJSON) {
            try {
                persistedMarkedASINs = new Set(JSON.parse(storedASINsJSON));
            } catch (e) {
                // console.error("VH NM Item Marker: Error parsing stored ASINs.", e);
                persistedMarkedASINs = new Set();
                localStorage.removeItem(currentStorageKey);
            }
        } else {
            persistedMarkedASINs = new Set();
        }
    }

    function saveMarksToStorage() {
        const currentStorageKey = STORAGE_KEY_MARKED_ASINS;
        localStorage.setItem(currentStorageKey, JSON.stringify(Array.from(persistedMarkedASINs)));
    }

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

    function applyMarkToItemDOM(item, markClass = MARKED_ITEM_CLASS_BLUE) {
        item.classList.add(markClass);
    }

    function removeMarkFromItemDOM(item, markClass = MARKED_ITEM_CLASS_BLUE) {
        item.classList.remove(markClass);
    }

    function toggleMarkItem(item, markClass = MARKED_ITEM_CLASS_BLUE) {
        const asin = item.dataset.asin;
        if (!asin) return;

        if (persistedMarkedASINs.has(asin)) {
            persistedMarkedASINs.delete(asin);
            removeMarkFromItemDOM(item, markClass);
        } else {
            persistedMarkedASINs.add(asin);
            applyMarkToItemDOM(item, markClass);
        }
        saveMarksToStorage();
        updateGoToButtonVisibility();
    }

    function setupDoubleClickMarking(item) {
        if (item.dataset.vhNmDblclickMarkingSetup === 'true') return; // Use the unique dataset attr
        const asin = item.dataset.asin;
        if (asin && persistedMarkedASINs.has(asin)) {
            applyMarkToItemDOM(item);
        }
        item.addEventListener('click', function(event) {
            const asinForClick = this.dataset.asin;
            if (!asinForClick) return;
            if (event.target.tagName === 'A' || event.target.closest('A')) {}
            if (!clickTimers[asinForClick]) {
                clickTimers[asinForClick] = setTimeout(() => { delete clickTimers[asinForClick]; }, DOUBLE_CLICK_TIMEOUT);
            } else {
                clearTimeout(clickTimers[asinForClick]);
                delete clickTimers[asinForClick];
                toggleMarkItem(this);
                event.preventDefault();
                event.stopPropagation();
            }
        });
        item.dataset.vhNmDblclickMarkingSetup = 'true'; // Use the unique dataset attr
    }

    function scrollToNextMarkedItem() {
        const visibleMarkedItems = [];
        persistedMarkedASINs.forEach(asin => {
            const item = document.querySelector(`${ITEM_SELECTOR}[data-asin="${asin}"]`);
            if (item && item.offsetParent !== null) { visibleMarkedItems.push(item); }
        });
        if (visibleMarkedItems.length === 0) {
            if (persistedMarkedASINs.size > 0) {
                 alert("Marked items are not currently visible on the page. They might be hidden or truncated.");
            }
            return;
        }
        visibleMarkedItems.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
        currentMarkedItemIndex = (currentMarkedItemIndex + visibleMarkedItems.length) % visibleMarkedItems.length;
        const itemToScrollTo = visibleMarkedItems[currentMarkedItemIndex];
        if (itemToScrollTo) {
            isProgrammaticScroll = true;
            itemToScrollTo.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const scrollAnimationTime = 700;
            const goldHighlightDuration = 500;
            itemToScrollTo.style.boxShadow = '0 0 15px 5px gold';
            setTimeout(() => {
                itemToScrollTo.style.boxShadow = '';
                isProgrammaticScroll = false;
            }, scrollAnimationTime + goldHighlightDuration);
        }
        currentMarkedItemIndex = (currentMarkedItemIndex + 1) % visibleMarkedItems.length;
        if (visibleMarkedItems.length === 0 && currentMarkedItemIndex > 0) currentMarkedItemIndex = 0;
    }

    // --- NEW UTILITY FUNCTION for Clearing Marks ---
    function clearAllMarkedItems() {
        console.log("VH NM Item Marker: clearAllMarkedItems called."); // LOG
        if (confirm("Are you sure you want to clear all marked items for " + window.location.hostname + "? This action cannot be undone.")) {
            // 1. Visually unmark items currently in the DOM.
            const currentlyMarkedDOMItems = document.querySelectorAll(`${ITEM_SELECTOR}.${MARKED_ITEM_CLASS_BLUE}`);
            currentlyMarkedDOMItems.forEach(itemDOM => {
                removeMarkFromItemDOM(itemDOM, MARKED_ITEM_CLASS_BLUE);
            });

            // 2. Clear the in-memory set.
            persistedMarkedASINs.clear();

            // 3. Explicitly remove the item from localStorage.
            const currentStorageKey = STORAGE_KEY_MARKED_ASINS;
            localStorage.removeItem(currentStorageKey);

            // 4. Update the "Go to Marked" button visibility (should hide it).
            updateGoToButtonVisibility();

            alert("All marked items for ".concat(window.location.hostname, " have been cleared."));
        }
    }

    // --- NEW Event Handler for the "Go to Marked" Button ---
    function handleGoToMarkedButtonClick(event) {
        if (event.ctrlKey || event.metaKey) { // metaKey for Command on Mac
            event.preventDefault();
            clearAllMarkedItems();
        } else {
            scrollToNextMarkedItem();
        }
    }

    // --- INITIALIZATION for VH NM Item Marker ---
    function initializeItemMarker() {
        // console.log("VH NM Item Marker: initializeItemMarker called."); // Can uncomment this if needed
        if (
            !( (window.location.hostname === "www.amazon.ca" || window.location.hostname === "www.amazon.com") &&
               window.location.pathname === TARGET_PATHNAME &&
               window.location.search === TARGET_SEARCH &&
               window.location.hash === TARGET_HASH
             )
        ) {
            return;
        }
        // console.log(`VH NM Item Marker: Script active on ${window.location.hostname}.`); // Can uncomment

        loadMarksFromStorage();

        let goToButton = document.getElementById(GO_TO_MARKED_BUTTON_ID);
        if (!goToButton) {
            goToButton = document.createElement('button');
            goToButton.id = GO_TO_MARKED_BUTTON_ID;
            document.body.appendChild(goToButton);
            goToButton.addEventListener('click', handleGoToMarkedButtonClick); // MODIFIED to use new handler
        } else {
            // If button somehow pre-existed, ensure correct listener
            goToButton.removeEventListener('click', scrollToNextMarkedItem); // Remove old one if present
            goToButton.removeEventListener('click', handleGoToMarkedButtonClick); // Remove this one if present
            goToButton.addEventListener('click', handleGoToMarkedButtonClick); // Add the correct one
        }

        const initialItems = document.querySelectorAll(ITEM_SELECTOR);
        initialItems.forEach(setupDoubleClickMarking);
        updateGoToButtonVisibility();

        const gridContainer = document.getElementById(ITEM_GRID_ID);
        if (gridContainer) {
            const observer = new MutationObserver(mutationsList => {
                let itemsAddedOrRemoved = false;
                for (const mutation of mutationsList) {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                if (node.matches(ITEM_SELECTOR)) {
                                    setupDoubleClickMarking(node); itemsAddedOrRemoved = true;
                                } else {
                                    node.querySelectorAll(ITEM_SELECTOR).forEach(setupDoubleClickMarking);
                                    if (node.querySelector(ITEM_SELECTOR)) itemsAddedOrRemoved = true;
                                }
                            }
                        });
                        mutation.removedNodes.forEach(node => {
                             if (node.nodeType === Node.ELEMENT_NODE && node.dataset && persistedMarkedASINs.has(node.dataset.asin)) {
                                itemsAddedOrRemoved = true;
                            }
                        });
                    }
                }
                if (itemsAddedOrRemoved) { updateGoToButtonVisibility(); }
            });
            observer.observe(gridContainer, { childList: true, subtree: true, });
        } else {
             // console.error("VH NM Item Marker: Item grid container not found for MutationObserver."); // Can uncomment
        }
    }

    // --- SCRIPT EXECUTION ---
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initializeItemMarker();
    } else {
        window.addEventListener('load', initializeItemMarker);
    }

})();