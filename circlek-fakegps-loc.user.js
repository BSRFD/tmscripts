// ==UserScript==
// @name         Circle K Fake GPS Location
// @namespace    http://tampermonkey.net/
// @version      0.7
// @description  Auto-default GPS spoofing with paste-friendly configuration
// @author       You
// @match        https://games.circlek.com/*
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    // Default coordinates (Circle K, 485 Queen St W, Toronto)
    const DEFAULT_COORDINATES = {
        latitude: 43.64819,
        longitude: -79.397972
    };

    // Initialize with default coordinates if not set
    if(!localStorage.getItem('fakeLatitude')) {
        localStorage.setItem('fakeLatitude', DEFAULT_COORDINATES.latitude);
        localStorage.setItem('fakeLongitude', DEFAULT_COORDINATES.longitude);
    }

    // Single-input coordinate parser
    function parseCoordinateInput(input) {
        try {
            const [lat, lon] = input.split(',').map(Number);
            if(!isNaN(lat) && !isNaN(lon)) {
                return {
                    latitude: lat,
                    longitude: lon
                };
            }
        } catch(e) {
            return null;
        }
        return null;
    }

    // Configuration handler
    function configureLocation() {
        const input = prompt(`Enter new coordinates (lat,lon):\nExample: ${DEFAULT_COORDINATES.latitude},${DEFAULT_COORDINATES.longitude}`, 
                            `${localStorage.getItem('fakeLatitude')},${localStorage.getItem('fakeLongitude')}`);
        
        if(!input) return;

        const coords = parseCoordinateInput(input);
        if(coords) {
            localStorage.setItem('fakeLatitude', coords.latitude);
            localStorage.setItem('fakeLongitude', coords.longitude);
            alert(`Location updated to:\nLat: ${coords.latitude}\nLon: ${coords.longitude}\nRefresh page to apply!`);
        } else {
            alert('Invalid format! Please use "latitude,longitude" format.\nExample: 30.1755249,-85.6243147');
        }
    }

    // Menu commands
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand("📍 Configure Location", configureLocation);
        GM_registerMenuCommand("🔄 Reset to Default", () => {
            localStorage.setItem('fakeLatitude', DEFAULT_COORDINATES.latitude);
            localStorage.setItem('fakeLongitude', DEFAULT_COORDINATES.longitude);
            alert('Default location restored!\nRefresh page to apply.');
        });
    }

    // Geolocation override
    Object.defineProperty(navigator, 'geolocation', {
        value: {
            getCurrentPosition: (success) => success({
                coords: {
                    latitude: parseFloat(localStorage.getItem('fakeLatitude')),
                    longitude: parseFloat(localStorage.getItem('fakeLongitude')),
                    accuracy: 20,
                    altitude: null,
                    altitudeAccuracy: null,
                    heading: null,
                    speed: null
                },
                timestamp: Date.now()
            }),
            watchPosition: (success) => {
                success({
                    coords: {
                        latitude: parseFloat(localStorage.getItem('fakeLatitude')),
                        longitude: parseFloat(localStorage.getItem('fakeLongitude')),
                        accuracy: 20
                    },
                    timestamp: Date.now()
                });
                return 1;
            },
            clearWatch: () => {}
        }
    });
})();
