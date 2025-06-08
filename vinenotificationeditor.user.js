// ==UserScript==
// @name         Vine Helper Notification Customizer
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  Customize Vine Helper notification size, position, spacing, and color with live preview.
// @author       You
// @match        https://www.amazon.ca/vine/vine-items*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_ID_PREFIX = 'vhNotifyCustom_';
    const STYLE_ELEMENT_ID = SCRIPT_ID_PREFIX + 'styles';
    const CONFIG_UI_ID = SCRIPT_ID_PREFIX + 'configUI';
    const CONFIG_UI_WINDOW_ID = SCRIPT_ID_PREFIX + 'configWindow';
    const FAKE_NOTIFICATION_CLASS = SCRIPT_ID_PREFIX + 'fakeNotificationPreview';
    const TRANSPARENT_CLASS = SCRIPT_ID_PREFIX + 'config-transparent';

    let fakeNotificationCounter = 0;
    let isConfigUIOpen = false;

    const ORIGINAL_WIDTH = 300;
    const ORIGINAL_HEIGHT = 90;
    const BASE_FONT_SIZE = 12;
    const DEFAULT_PREVIEW_COUNT = 3;

    const SVG_PLACEHOLDER_ICON = `
        <svg width="50" height="50" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block; background-color: #e0e0e0; border-radius: 3px;">
            <rect x="10" y="10" width="80" height="80" rx="5" ry="5" stroke="#b0b0b0" stroke-width="4" fill="#f0f0f0"/>
            <path d="M25 75L45 50L55 60L75 35L85 45" stroke="#909090" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="35" cy="35" r="7" fill="#a0a0a0"/>
        </svg>
    `;

    const DEFAULTS = {
        notificationScale: 100,
        relativeTextScale: 100,
        position: 'bottom-right',
        verticalPadding: 10,
        horizontalPadding: 10,
        spacingBetweenNotifications: 10,
        backgroundColor: '#FFFFFF',
        textColor: '#0F1111'
    };

    let currentConfig = {};
    let tempConfig = {};

    function isMobileView() { return window.innerWidth < 768; }
    function loadConfig() { /* ... same as v3.7.1 ... */
        currentConfig.notificationScale = GM_getValue('notificationScale', DEFAULTS.notificationScale);
        currentConfig.relativeTextScale = GM_getValue('relativeTextScale', DEFAULTS.relativeTextScale);
        currentConfig.position = GM_getValue('position', DEFAULTS.position);
        currentConfig.verticalPadding = GM_getValue('verticalPadding', DEFAULTS.verticalPadding);
        currentConfig.horizontalPadding = GM_getValue('horizontalPadding', DEFAULTS.horizontalPadding);
        currentConfig.spacingBetweenNotifications = GM_getValue('spacingBetweenNotifications', DEFAULTS.spacingBetweenNotifications);
        currentConfig.backgroundColor = GM_getValue('backgroundColor', DEFAULTS.backgroundColor);
        currentConfig.textColor = GM_getValue('textColor', DEFAULTS.textColor);
        tempConfig = { ...currentConfig };
    }
    function saveConfig(newConfig) { /* ... same as v3.7.1 ... */
        GM_setValue('notificationScale', parseInt(newConfig.notificationScale, 10));
        GM_setValue('relativeTextScale', parseInt(newConfig.relativeTextScale, 10));
        GM_setValue('position', newConfig.position);
        GM_setValue('verticalPadding', parseInt(newConfig.verticalPadding, 10));
        GM_setValue('horizontalPadding', parseInt(newConfig.horizontalPadding, 10));
        GM_setValue('spacingBetweenNotifications', parseInt(newConfig.spacingBetweenNotifications, 10));
        GM_setValue('backgroundColor', newConfig.backgroundColor);
        GM_setValue('textColor', newConfig.textColor);
        loadConfig();
        applyStyles(currentConfig);
    }

    function applyStyles(configToApply) {
        // ... (applyStyles function from v3.7.1, no changes needed here for this specific fix)
        const overallScaleFactor = parseInt(configToApply.notificationScale, 10) / 100;
        const textScaleFactor = parseInt(configToApply.relativeTextScale, 10) / 100;
        const containerWidth = ORIGINAL_WIDTH;
        const desiredVisualSpacing = parseInt(configToApply.spacingBetweenNotifications, 10);
        let layoutMargin = desiredVisualSpacing + (ORIGINAL_HEIGHT * (overallScaleFactor - 1));
        const calculatedFontSize = BASE_FONT_SIZE * textScaleFactor;
        const estimatedTitleMaxWidth = ORIGINAL_WIDTH - (6 + 16 + 5 + 30 + 10); // padd + icon + space + close + buffer

        let css = `
            #vh-notifications-container {
                width: ${containerWidth + parseInt(configToApply.horizontalPadding,10)}px !important;
                padding-right: ${configToApply.horizontalPadding}px !important;
                box-sizing: content-box !important;
            }
            #vh-notifications-container .vh-notification-box {
                width: ${ORIGINAL_WIDTH}px !important; min-height: ${ORIGINAL_HEIGHT}px !important;
                transform: scale(${overallScaleFactor}) !important;
                transform-origin: ${configToApply.position === 'top-right' ? 'top right' : 'bottom right'} !important;
                background-color: ${configToApply.backgroundColor} !important; color: ${configToApply.textColor} !important;
                border: 1px solid ${configToApply.textColor.toLowerCase() === '#ffffff' || configToApply.textColor.toLowerCase() === 'white' ? '#AAAAAA' : '#333333'} !important;
                box-shadow: 0 1px 3px rgba(0,0,0,0.15); box-sizing: border-box !important;
                margin-left: auto !important; margin-right: 0 !important;
            }
            #vh-notifications-container .vh-notification-toolbar { display: flex; align-items: center; padding: 4px 6px; border-bottom: 1px solid ${configToApply.textColor.toLowerCase() === '#ffffff' || configToApply.textColor.toLowerCase() === 'white' ? 'rgba(85,85,85,0.5)' : 'rgba(204,204,204,0.5)'}; }
            #vh-notifications-container .vh-notification-toggle { flex-shrink: 0; }
            #vh-notifications-container .vh-notification-title {
                flex-grow: 1; margin-left: 5px; margin-right: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                max-width: ${estimatedTitleMaxWidth}px; /* Approximate max width before overall scaling */
                font-size: ${calculatedFontSize}px !important; line-height: ${calculatedFontSize * 1.3}px !important;
                color: ${configToApply.textColor} !important; vertical-align: middle;
            }
            #vh-notifications-container .vh-notification-close { flex-shrink: 0; float: none; }
            #vh-notifications-container .vh-notification-close a { font-size: ${calculatedFontSize}px !important; line-height: ${calculatedFontSize * 1.3}px !important; color: ${configToApply.textColor.toLowerCase() === '#ffffff' || configToApply.textColor.toLowerCase() === 'white' ? '#DDDDDD' : '#555555'} !important; }
            #vh-notifications-container .vh-notification-content div,
            #vh-notifications-container .vh-notification-content span { font-size: ${calculatedFontSize}px !important; line-height: ${calculatedFontSize * 1.3}px !important; color: ${configToApply.textColor} !important; }
            #vh-notifications-container .vh-notification-box a:not(.${SCRIPT_ID_PREFIX}fake-close-btn) { color: ${configToApply.textColor} !important; font-size: ${calculatedFontSize}px !important; }
        `;
        if (configToApply.position === 'top-right') {
            css += `#vh-notifications-container { top: ${configToApply.verticalPadding}px !important; right: 0px !important; bottom: auto !important; left: auto !important; flex-direction: column !important; align-items: flex-end; }
                    #vh-notifications-container .vh-notification-box:not(:last-child) { margin-bottom: ${layoutMargin}px !important; margin-top: 0 !important; }`;
        } else { // bottom-right (using v2.6 selector as confirmed working)
            css += `#vh-notifications-container { top: auto !important; right: 0px !important; bottom: ${configToApply.verticalPadding}px !important; left: auto !important; flex-direction: column-reverse !important; align-items: flex-end; }
                    #vh-notifications-container .vh-notification-box:not(:last-child) { margin-top: ${layoutMargin}px !important; margin-bottom: 0 !important; }`;
        }
        css += `.${TRANSPARENT_CLASS} { opacity: 0.25 !important; pointer-events: none !important; }`;
        let styleElement = document.getElementById(STYLE_ELEMENT_ID);
        if (!styleElement) {
            styleElement = document.createElement('style'); styleElement.id = STYLE_ELEMENT_ID; document.head.appendChild(styleElement);
        }
        styleElement.textContent = css;
    }

    function createConfigUI() {
        isConfigUIOpen = true;
        if (document.getElementById(CONFIG_UI_ID)) document.getElementById(CONFIG_UI_ID).remove();
        if (Object.keys(currentConfig).length === 0) loadConfig();
        tempConfig = { ...currentConfig };

        const uiContainer = document.createElement('div');
        uiContainer.id = CONFIG_UI_ID;
        uiContainer.innerHTML = `
            <div id="${CONFIG_UI_WINDOW_ID}" class="${SCRIPT_ID_PREFIX}config-window">
                <h3 class="${SCRIPT_ID_PREFIX}config-title">Notification Customizer</h3>
                <div class="${SCRIPT_ID_PREFIX}control-group">
                    <label for="${SCRIPT_ID_PREFIX}scale" class="${SCRIPT_ID_PREFIX}label">Overall Scale (Window): <span id="${SCRIPT_ID_PREFIX}scaleValue">${tempConfig.notificationScale}%</span></label>
                    <input type="range" id="${SCRIPT_ID_PREFIX}scale" value="${tempConfig.notificationScale}" min="15" max="250" step="5" class="${SCRIPT_ID_PREFIX}slider">
                </div>
                <div class="${SCRIPT_ID_PREFIX}control-group">
                    <label for="${SCRIPT_ID_PREFIX}textScale" class="${SCRIPT_ID_PREFIX}label">Relative Text Scale: <span id="${SCRIPT_ID_PREFIX}textScaleValue">${tempConfig.relativeTextScale}%</span></label>
                    <input type="range" id="${SCRIPT_ID_PREFIX}textScale" value="${tempConfig.relativeTextScale}" min="50" max="250" step="5" class="${SCRIPT_ID_PREFIX}slider">
                </div>
                <div class="${SCRIPT_ID_PREFIX}control-group">
                    <label class="${SCRIPT_ID_PREFIX}label">Position:</label>
                    <div class="${SCRIPT_ID_PREFIX}radio-item">
                        <input type="radio" name="${SCRIPT_ID_PREFIX}position" value="bottom-right" id="${SCRIPT_ID_PREFIX}posBottom" ${tempConfig.position === 'bottom-right' ? 'checked' : ''}>
                        <label for="${SCRIPT_ID_PREFIX}posBottom">Bottom-Right (Stacks Up)</label>
                    </div>
                    <div class="${SCRIPT_ID_PREFIX}radio-item">
                        <input type="radio" name="${SCRIPT_ID_PREFIX}position" value="top-right" id="${SCRIPT_ID_PREFIX}posTop" ${tempConfig.position === 'top-right' ? 'checked' : ''}>
                        <label for="${SCRIPT_ID_PREFIX}posTop">Top-Right (Stacks Down)</label>
                    </div>
                </div>
                <div class="${SCRIPT_ID_PREFIX}control-group">
                    <label for="${SCRIPT_ID_PREFIX}spacing" class="${SCRIPT_ID_PREFIX}label">Desired Visual Spacing: <span id="${SCRIPT_ID_PREFIX}spacingValue">${tempConfig.spacingBetweenNotifications}px</span></label>
                    <input type="range" id="${SCRIPT_ID_PREFIX}spacing" value="${tempConfig.spacingBetweenNotifications}" min="-100" max="50" step="1" class="${SCRIPT_ID_PREFIX}slider">
                </div>
                <div class="${SCRIPT_ID_PREFIX}control-group">
                    <label for="${SCRIPT_ID_PREFIX}hPadding" class="${SCRIPT_ID_PREFIX}label">Horizontal Padding (from screen edge): <span id="${SCRIPT_ID_PREFIX}hPaddingValue">${tempConfig.horizontalPadding}px</span></label>
                    <input type="range" id="${SCRIPT_ID_PREFIX}hPadding" value="${tempConfig.horizontalPadding}" min="0" max="100" step="5" class="${SCRIPT_ID_PREFIX}slider">
                </div>
                <div class="${SCRIPT_ID_PREFIX}control-group">
                    <label for="${SCRIPT_ID_PREFIX}vPadding" class="${SCRIPT_ID_PREFIX}label">Vertical Padding (from screen edge): <span id="${SCRIPT_ID_PREFIX}vPaddingValue">${tempConfig.verticalPadding}px</span></label>
                    <input type="range" id="${SCRIPT_ID_PREFIX}vPadding" value="${tempConfig.verticalPadding}" min="0" max="100" step="5" class="${SCRIPT_ID_PREFIX}slider">
                </div>
                <div class="${SCRIPT_ID_PREFIX}control-group ${SCRIPT_ID_PREFIX}color-controls-wrapper">
                    <div class="${SCRIPT_ID_PREFIX}color-control-item">
                        <label for="${SCRIPT_ID_PREFIX}bgColor">Background:</label>
                        <input type="color" id="${SCRIPT_ID_PREFIX}bgColor" value="${tempConfig.backgroundColor}">
                        <button id="${SCRIPT_ID_PREFIX}resetBgColorBtn" class="${SCRIPT_ID_PREFIX}reset-btn-small">Reset</button>
                    </div>
                    <div class="${SCRIPT_ID_PREFIX}color-control-item">
                        <label for="${SCRIPT_ID_PREFIX}textColor">Text:</label>
                        <input type="color" id="${SCRIPT_ID_PREFIX}textColor" value="${tempConfig.textColor}">
                        <button id="${SCRIPT_ID_PREFIX}resetTextColorBtn" class="${SCRIPT_ID_PREFIX}reset-btn-small">Reset</button>
                    </div>
                </div>
                <div class="${SCRIPT_ID_PREFIX}button-bar">
                    <button id="${SCRIPT_ID_PREFIX}saveBtn" class="${SCRIPT_ID_PREFIX}action-btn ${SCRIPT_ID_PREFIX}btn-save">Save & Close</button>
                    <button id="${SCRIPT_ID_PREFIX}triggerPreviewBtn" class="${SCRIPT_ID_PREFIX}action-btn ${SCRIPT_ID_PREFIX}btn-preview">Add Another Preview</button>
                    <button id="${SCRIPT_ID_PREFIX}resetLayoutBtn" class="${SCRIPT_ID_PREFIX}action-btn ${SCRIPT_ID_PREFIX}btn-reset">Reset All Options</button>
                    <button id="${SCRIPT_ID_PREFIX}closeBtn" class="${SCRIPT_ID_PREFIX}action-btn ${SCRIPT_ID_PREFIX}btn-cancel">Cancel</button>
                </div>
                <p class="${SCRIPT_ID_PREFIX}help-text">
                    Input changes update live previews. "Add Another Preview" tests stacking further.
                </p>
            </div>
            <style> /* UI Styles from v3.4 */
                .${SCRIPT_ID_PREFIX}config-window {
                    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                    background: #f4f6f8; padding: 15px; border: 1px solid #d1d9e0;
                    z-index: 10001; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                    width: 90vw; max-width: 520px; max-height: calc(100vh - 40px);
                    overflow-y: auto; border-radius: 8px; font-size: 13px; color: #333; box-sizing: border-box;
                    transition: opacity 0.2s ease-in-out;
                }
                .${SCRIPT_ID_PREFIX}config-transparent { opacity: 0.25 !important; pointer-events: none !important; }
                .${SCRIPT_ID_PREFIX}config-title { text-align:center; margin-top:0; margin-bottom: 15px; color: #2c3e50; font-weight: 600; font-size: 1.3em;}
                .${SCRIPT_ID_PREFIX}control-group { margin-bottom: 12px; }
                .${SCRIPT_ID_PREFIX}label { display: block; margin-bottom: 4px; font-weight: 500; color: #4a5568; font-size: 0.9em; }
                .${SCRIPT_ID_PREFIX}slider { width: 100%; margin-top: 2px; accent-color: #3498db; cursor: grab; }
                .${SCRIPT_ID_PREFIX}slider:active { cursor: grabbing; }
                .${SCRIPT_ID_PREFIX}radio-item { display: flex; align-items: center; margin-bottom: 3px; }
                .${SCRIPT_ID_PREFIX}radio-item input[type="radio"] { margin-right: 5px; margin-top: 0; }
                .${SCRIPT_ID_PREFIX}radio-item label { font-weight: normal; margin-bottom: 0; color: #333; font-size: 0.9em;}
                .${SCRIPT_ID_PREFIX}color-controls-wrapper { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 15px; border: 1px solid #e0e0e0; padding: 10px; border-radius: 4px; background: #fff; margin-top: 8px;}
                .${SCRIPT_ID_PREFIX}color-control-item { display: flex; align-items: center; gap: 8px; }
                .${SCRIPT_ID_PREFIX}color-control-item label { margin-bottom: 0; flex-shrink: 0; margin-right: auto;}
                input[type="color"] { width: 32px; height: 24px; border: 1px solid #ccc; border-radius: 4px; padding: 0; cursor: pointer; vertical-align: middle;}
                .${SCRIPT_ID_PREFIX}reset-btn-small { margin-left: 5px; font-size:0.7em; padding: 3px 6px; vertical-align: middle; border: 1px solid #bdc3c7; background-color: #ecf0f1; color: #34495e; border-radius:3px; cursor:pointer;}
                .${SCRIPT_ID_PREFIX}reset-btn-small:hover { background-color: #dadedf; }
                .${SCRIPT_ID_PREFIX}button-bar { margin-top: 18px; text-align: center; border-top: 1px solid #dde2e7; padding-top: 15px; display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;}
                .${SCRIPT_ID_PREFIX}action-btn { padding: 8px 12px; font-size: 12px; border: none; border-radius: 5px; cursor: pointer; font-weight: 500; transition: background-color 0.2s ease, box-shadow 0.2s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.1);}
                .${SCRIPT_ID_PREFIX}action-btn:hover { box-shadow: 0 2px 4px rgba(0,0,0,0.15); }
                .${SCRIPT_ID_PREFIX}btn-save { background-color: #27ae60; color:white; }
                .${SCRIPT_ID_PREFIX}btn-preview { background-color: #007bff; color:white; }
                .${SCRIPT_ID_PREFIX}btn-reset { background-color: #e67e22; color:white; }
                .${SCRIPT_ID_PREFIX}btn-cancel { background-color: #95a5a6; color:white; }
                .${SCRIPT_ID_PREFIX}help-text { font-size:0.8em; text-align:center; margin-top:10px; color: #7f8c8d; line-height:1.3; }
                @media (max-width: 600px) {
                    .${SCRIPT_ID_PREFIX}config-window { width: 95vw; padding: 10px 15px;}
                    .${SCRIPT_ID_PREFIX}config-title { font-size: 1.2em; margin-bottom: 10px; }
                    .${SCRIPT_ID_PREFIX}action-btn { width: calc(50% - 6px); }
                     .${SCRIPT_ID_PREFIX}help-text { font-size:0.75em; }
                    .${SCRIPT_ID_PREFIX}color-controls-wrapper { grid-template-columns: 1fr; }
                }
            </style>
        `;
        document.body.appendChild(uiContainer);

        // --- Get Element References and Add Event Listeners (from v3.4) ---
        const configWindowDiv = document.getElementById(CONFIG_UI_WINDOW_ID);
        const scaleInput = document.getElementById(SCRIPT_ID_PREFIX + 'scale');
        const scaleValueDisplay = document.getElementById(SCRIPT_ID_PREFIX + 'scaleValue');
        const textScaleInput = document.getElementById(SCRIPT_ID_PREFIX + 'textScale');
        const textScaleValueDisplay = document.getElementById(SCRIPT_ID_PREFIX + 'textScaleValue');
        const posRadios = document.getElementsByName(SCRIPT_ID_PREFIX + 'position');
        const vPaddingInput = document.getElementById(SCRIPT_ID_PREFIX + 'vPadding');
        const vPaddingValueDisplay = document.getElementById(SCRIPT_ID_PREFIX + 'vPaddingValue');
        const hPaddingInput = document.getElementById(SCRIPT_ID_PREFIX + 'hPadding');
        const hPaddingValueDisplay = document.getElementById(SCRIPT_ID_PREFIX + 'hPaddingValue');
        const spacingInput = document.getElementById(SCRIPT_ID_PREFIX + 'spacing');
        const spacingValueDisplay = document.getElementById(SCRIPT_ID_PREFIX + 'spacingValue');
        const bgColorInput = document.getElementById(SCRIPT_ID_PREFIX + 'bgColor');
        const textColorInput = document.getElementById(SCRIPT_ID_PREFIX + 'textColor');
        const allSliders = [scaleInput, textScaleInput, vPaddingInput, hPaddingInput, spacingInput];
        let transparencyTimeout = null;

        const makeTransparent = () => { if (isMobileView() && configWindowDiv) { configWindowDiv.classList.add(TRANSPARENT_CLASS); clearTimeout(transparencyTimeout); transparencyTimeout = setTimeout(makeOpaque, 3500); } };
        const makeOpaque = () => { clearTimeout(transparencyTimeout); if (configWindowDiv) { configWindowDiv.classList.remove(TRANSPARENT_CLASS); } };

        allSliders.forEach(slider => { slider.addEventListener('mousedown', makeTransparent); slider.addEventListener('touchstart', makeTransparent, { passive: true }); });
        document.removeEventListener('mouseup', makeOpaque); document.removeEventListener('touchend', makeOpaque);
        document.addEventListener('mouseup', makeOpaque); document.addEventListener('touchend', makeOpaque);

        const updateTempConfigFromUI = () => { /* ... same as v3.6 ... */
            const selectedPositionEl = Array.from(posRadios).find(radio => radio.checked);
            tempConfig.notificationScale = scaleInput.value;
            tempConfig.relativeTextScale = textScaleInput.value;
            tempConfig.position = selectedPositionEl ? selectedPositionEl.value : DEFAULTS.position;
            tempConfig.verticalPadding = vPaddingInput.value;
            tempConfig.horizontalPadding = hPaddingInput.value;
            tempConfig.spacingBetweenNotifications = spacingInput.value;
            tempConfig.backgroundColor = bgColorInput.value;
            tempConfig.textColor = textColorInput.value;
        };

        const handleInputChange = (eventSource = null, isFinalChange = false) => { /* ... same as v3.4 ... */
            updateTempConfigFromUI();
            if (scaleValueDisplay) scaleValueDisplay.textContent = tempConfig.notificationScale + '%';
            if (textScaleValueDisplay) textScaleValueDisplay.textContent = tempConfig.relativeTextScale + '%';
            if (vPaddingValueDisplay) vPaddingValueDisplay.textContent = tempConfig.verticalPadding + 'px';
            if (hPaddingValueDisplay) hPaddingValueDisplay.textContent = tempConfig.horizontalPadding + 'px';
            if (spacingValueDisplay) spacingValueDisplay.textContent = tempConfig.spacingBetweenNotifications + 'px';
            applyStyles(tempConfig);
            if (isFinalChange) {
                cleanupAllNotifications();
                for (let i = 0; i < DEFAULT_PREVIEW_COUNT; i++) { triggerFakeNotification(false, tempConfig); }
                if (DEFAULT_PREVIEW_COUNT === 0 && document.querySelectorAll('.' + FAKE_NOTIFICATION_CLASS).length === 0) { triggerFakeNotification(true, tempConfig); }
                else if (DEFAULT_PREVIEW_COUNT === 1 && document.querySelectorAll('.' + FAKE_NOTIFICATION_CLASS).length !== 1){ cleanupAllNotifications(); triggerFakeNotification(true, tempConfig); }
            } else if (allSliders.includes(eventSource)) {
                 if (document.querySelectorAll('.' + FAKE_NOTIFICATION_CLASS).length === 0) { triggerFakeNotification(true, tempConfig); }
            }
            if(isFinalChange && isMobileView()){ makeOpaque(); }
        };

        bgColorInput.addEventListener('input', (e) => handleInputChange(e.target, true));
        textColorInput.addEventListener('input', (e) => handleInputChange(e.target, true));
        posRadios.forEach(radio => radio.addEventListener('change', (e) => handleInputChange(e.target, true)));
        allSliders.forEach(slider => { slider.addEventListener('input', (e) => handleInputChange(e.target, false)); slider.addEventListener('change', (e) => handleInputChange(e.target, true)); });

        document.getElementById(SCRIPT_ID_PREFIX + 'triggerPreviewBtn').addEventListener('click', () => { /* ... same as v3.4 ... */
            makeOpaque(); updateTempConfigFromUI(); applyStyles(tempConfig); triggerFakeNotification(false, tempConfig);
        });
        document.getElementById(SCRIPT_ID_PREFIX + 'resetLayoutBtn').addEventListener('click', () => { /* ... same as v3.6 ... */
            makeOpaque();
            scaleInput.value = DEFAULTS.notificationScale;
            textScaleInput.value = DEFAULTS.relativeTextScale;
            Array.from(posRadios).find(r => r.value === DEFAULTS.position).checked = true;
            vPaddingInput.value = DEFAULTS.verticalPadding;
            hPaddingInput.value = DEFAULTS.horizontalPadding;
            spacingInput.value = DEFAULTS.spacingBetweenNotifications;
            bgColorInput.value = DEFAULTS.backgroundColor;
            textColorInput.value = DEFAULTS.textColor;
            handleInputChange(null, true);
        });
         document.getElementById(SCRIPT_ID_PREFIX + 'resetBgColorBtn').addEventListener('click', () => { /* ... same as v3.4 ... */
            makeOpaque(); bgColorInput.value = DEFAULTS.backgroundColor; handleInputChange(bgColorInput, true);
        });
        document.getElementById(SCRIPT_ID_PREFIX + 'resetTextColorBtn').addEventListener('click', () => { /* ... same as v3.4 ... */
            makeOpaque(); textColorInput.value = DEFAULTS.textColor; handleInputChange(textColorInput, true);
        });
        document.getElementById(SCRIPT_ID_PREFIX + 'saveBtn').addEventListener('click', () => { /* ... same as v3.4 ... */
            makeOpaque(); updateTempConfigFromUI(); saveConfig(tempConfig); alert('Settings saved!');
            cleanupAllNotifications(); isConfigUIOpen = false; uiContainer.remove(); applyStyles(currentConfig);
        });
        document.getElementById(SCRIPT_ID_PREFIX + 'closeBtn').addEventListener('click', () => { /* ... same as v3.4 ... */
            makeOpaque(); cleanupAllNotifications(); isConfigUIOpen = false; uiContainer.remove(); applyStyles(currentConfig);
        });

        applyStyles(tempConfig); // Apply styles from tempConfig on UI open
        cleanupAllNotifications();
        for (let i = 0; i < DEFAULT_PREVIEW_COUNT; i++) { triggerFakeNotification(false, tempConfig); }
        if (DEFAULT_PREVIEW_COUNT > 0 && document.querySelectorAll('.' + FAKE_NOTIFICATION_CLASS).length === 0) { triggerFakeNotification(true, tempConfig); }
        else if (DEFAULT_PREVIEW_COUNT === 0 && document.querySelectorAll('.' + FAKE_NOTIFICATION_CLASS).length > 0) { cleanupAllNotifications(); }
    }

    // --- Fake Notification, Main, and Listeners (from v3.6) ---
    function cleanupAllNotifications() { /* ... same ... */
        document.querySelectorAll('.' + FAKE_NOTIFICATION_CLASS).forEach(el => el.remove());
        fakeNotificationCounter = 0;
    }
    function triggerFakeNotification(clearPrevious = false, configSource = tempConfig) { /* ... same as v3.6 ... */
        const notificationsContainer = document.getElementById("vh-notifications-container");
        if (!notificationsContainer) { if (!isConfigUIOpen && !clearPrevious && configSource !== tempConfig) alert("Vine Helper notification container not found."); return; }
        if (clearPrevious) { cleanupAllNotifications(); }
        const currentFakeNumForDisplay = fakeNotificationCounter;
        const fakeId = FAKE_NOTIFICATION_CLASS + '_' + fakeNotificationCounter;
        fakeNotificationCounter++;
        const overallScaleText = parseInt(configSource.notificationScale, 10);
        const textScaleText = parseInt(configSource.relativeTextScale, 10);
        const title = `Preview (Win: ${overallScaleText}%, Txt: ${textScaleText}%) #${currentFakeNumForDisplay + 1}`;
        let contentText = `Pos: ${configSource.position}<br>Spacing: ${configSource.spacingBetweenNotifications}px`;
        const iconInvert = (configSource.textColor.toLowerCase() === '#ffffff' || configSource.textColor.toLowerCase() === 'white') ? '1' : '0.3';
        const notificationHTML = `
            <div id="${fakeId}" class="vh-notification-box ${FAKE_NOTIFICATION_CLASS}">
                <div class="vh-notification-container">
                    <div class="vh-notification-toolbar">
                        <div class="vh-notification-toggle vh-toolbar-icon vh-icon-toggler-right" style="background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAhElEQVQ4jWNgoAL4//8/AwPDf0SUnADiUDAAEsADRLOcCERgD8AOKALRAIpBlBChA0QxIAgERVBLIMoAVRE0sJkCgYwYjIQBKjAaAaMbQHYgUsA0MBmBwASQQIEZkGAHEBWOBoKMBgNIQGGkIAYHEBWOAKV0IBsQpAEBBBgA5T0Jd9pTLvIAAAAASUVORK5CYII=); background-size: contain; width:16px; height:16px; display:inline-block; vertical-align: middle; filter: invert(${iconInvert}); flex-shrink: 0;"></div>
                        <span class="vh-notification-title">${title}</span>
                        <div class="vh-notification-close" style="float: right;">[<a href="#" class="${SCRIPT_ID_PREFIX}fake-close-btn" data-target-id="${fakeId}" style="text-decoration:none;">close</a>]</div>
                    </div>
                    <div class="vh-notification-content" style="padding: 8px; display: flex; align-items: center;">
                        <div style="flex-shrink: 0; width: 50px; height: 50px; margin-right: 8px;">${SVG_PLACEHOLDER_ICON}</div>
                        <div style="font-size: inherit; line-height: 1.3;">${contentText}</div>
                    </div>
                </div>
            </div>`;
        notificationsContainer.insertAdjacentHTML("afterbegin", notificationHTML);
        const fakeCloseBtn = document.querySelector(`.${SCRIPT_ID_PREFIX}fake-close-btn[data-target-id="${fakeId}"]`);
        if (fakeCloseBtn) {
            fakeCloseBtn.addEventListener('click', function(e) {
                e.preventDefault();
                const targetEl = document.getElementById(this.dataset.targetId);
                if (targetEl) targetEl.remove();
                if (isConfigUIOpen && document.querySelectorAll('.' + FAKE_NOTIFICATION_CLASS).length === 0) {
                    triggerFakeNotification(true, tempConfig);
                }
            });
        }
    }
    function main() { /* ... same as v3.6 ... */
        loadConfig(); applyStyles(currentConfig);
        const observer = new MutationObserver(() => {
            const container = document.getElementById('vh-notifications-container');
            if (container) { applyStyles(isConfigUIOpen ? tempConfig : currentConfig); }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        if (document.getElementById('vh-notifications-container')) {
            applyStyles(isConfigUIOpen ? tempConfig : currentConfig);
        }
    }

    GM_registerMenuCommand("Customize Vine Helper Notifications", createConfigUI);
    GM_registerMenuCommand("Trigger Stackable Fake VH Notification", () => {
        const configToUse = isConfigUIOpen ? tempConfig : currentConfig;
        applyStyles(configToUse); triggerFakeNotification(false, configToUse);
    });

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', main); }
    else { main(); }

})();