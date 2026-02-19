/**
 * INSTRUCTIONAL BANNER HELPER
 * Manages instructional banners that appear on each page load
 * and can be dismissed by the user
 * 
 * IMPORTANT: Banners always reappear on page reload (no localStorage persistence)
 * This ensures admins and agents always see the instructions when entering a page
 */

(function() {
  'use strict';

  // Initialize banner when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    const banner = document.getElementById('instructionalBanner');
    if (!banner) return;

    const closeBtn = banner.querySelector('.instructional-banner-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        banner.style.display = 'none';
      });
    }
  });
})();
