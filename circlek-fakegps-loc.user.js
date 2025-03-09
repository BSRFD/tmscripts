// ==UserScript==
// @name         Circle K Fake GPS Location
// @namespace    http://tampermonkey.net/
// @version      0.6
// @description  GPS spoofing for Circle K website
// @author       You
// @match        https://games.circlek.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// ==/UserScript==

(function() {
    'use strict';

    const DEFAULT_COORDINATES = {
        latitude: 43.64819,
        longitude: -79.397972
    };

    // Added storage key to track first-run configuration
    const CONFIG_KEY = 'gpsLocationConfigured';

    function showConfiguration() {
        const useDefault = confirm(
            'GPS Location Configuration\n\n' +
            'OK = Use default location (Circle K, 485 Queen St W, Toronto)\n' +
            'Cancel = Enter custom coordinates'
        );

        if (useDefault) {
            localStorage.setItem('fakeLatitude', DEFAULT_COORDINATES.latitude);
            localStorage.setItem('fakeLongitude', DEFAULT_COORDINATES.longitude);
        } else {
            let lat = prompt(`Enter latitude (default: ${DEFAULT_COORDINATES.latitude}):`, DEFAULT_COORDINATES.latitude);
            let lon = prompt(`Enter longitude (default: ${DEFAULT_COORDINATES.longitude}):`, DEFAULT_COORDINATES.longitude);

            localStorage.setItem('fakeLatitude', lat || DEFAULT_COORDINATES.latitude);
            localStorage.setItem('fakeLongitude', lon || DEFAULT_COORDINATES.longitude);
        }

        localStorage.setItem(CONFIG_KEY, 'true');
        alert('Configuration saved! Please refresh the page.');
    }

    // Enhanced initialization check
    function initialize() {
        // First-run initialization
        if (!localStorage.getItem(CONFIG_KEY)) {
            showConfiguration();
            return;
        }

        // Verify existing coordinates
        const lat = localStorage.getItem('fakeLatitude');
        const lon = localStorage.getItem('fakeLongitude');
        
        if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
            localStorage.removeItem(CONFIG_KEY);
            localStorage.removeItem('fakeLatitude');
            localStorage.removeItem('fakeLongitude');
            showConfiguration();
        }
    }

    // Register menu command with force-reconfigure
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand("🔧 Configure Location", () => {
            localStorage.removeItem(CONFIG_KEY);
            showConfiguration();
        });
    }

    // Delay initialization to ensure proper execution context
    window.addEventListener('load', () => {
        // Check if we're in a frame
        if (window.self !== window.top) return;

        initialize();
        overrideGeolocation();
    });

    function overrideGeolocation() {
        Object.defineProperty(navigator, 'geolocation', {
            value: {
                getCurrentPosition: (success, error, options) => {
                    const coords = {
                        latitude: parseFloat(localStorage.getItem('fakeLatitude')),
                        longitude: parseFloat(localStorage.getItem('fakeLongitude')),
                        accuracy: 10,
                        altitude: null,
                        altitudeAccuracy: null,
                        heading: null,
                        speed: null
                    };
                    success({ coords, timestamp: Date.now() });
                },
                watchPosition: (success) => {
                    const interval = setInterval(() => {
                        success({
                            coords: {
                                latitude: parseFloat(localStorage.getItem('fakeLatitude')),
                                longitude: parseFloat(localStorage.getItem('fakeLongitude')),
                                accuracy: 10
                            },
                            timestamp: Date.now()
                        });
                    }, 1000);
                    return interval;
                },
                clearWatch: (id) => clearInterval(id)
            }
        });
    }
})();
