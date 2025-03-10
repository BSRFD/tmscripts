// ==UserScript==
// @name         HCC March Madness Random Vote
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Randomly selects a book in each match for HCC March Madness voting
// @author       Your Name
// @match        https://hccmarchmadness.ca/vote/
// @icon         https://hccmarchmadness.ca/favicon.ico
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    window.addEventListener('load', function() {
        // Select all book matches
        const matches = document.querySelectorAll('.book-match');

        // Process each match
        matches.forEach(match => {
            // Get left and right vote buttons
            const leftBtn = match.querySelector('.book-left label.vote-btn');
            const rightBtn = match.querySelector('.book-right label.vote-btn');

            // Randomly select one (50/50 chance)
            if (leftBtn && rightBtn) {
                Math.random() < 0.5 ? leftBtn.click() : rightBtn.click();
            }
        });
    });
})();