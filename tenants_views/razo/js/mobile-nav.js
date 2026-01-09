/**
 * RazoConnect - Mobile Navigation Controller
 * Handles hamburger menu, sidebar toggle, and bottom navigation for mobile devices
 */

(function () {
  'use strict';

  let sidebarOverlay = null;
  let toggleButton = null;
  let sidebar = null;

  /**
   * Initialize mobile navigation on DOM ready
   */
  function initMobileNav() {
    // Only initialize on mobile devices
    if (window.innerWidth > 768) {
      return;
    }

    createSidebarToggleButton();
    createSidebarOverlay();
    attachEventListeners();
    addDataLabelsToTables();
  }

  /**
   * Create hamburger menu button
   */
  function createSidebarToggleButton() {
    // Check if button already exists
    if (document.querySelector('.sidebar-toggle-btn')) {
      toggleButton = document.querySelector('.sidebar-toggle-btn');
      return;
    }

    toggleButton = document.createElement('button');
    toggleButton.className = 'sidebar-toggle-btn';
    toggleButton.setAttribute('aria-label', 'Toggle navigation menu');
    toggleButton.innerHTML = '☰';
    
    document.body.appendChild(toggleButton);
  }

  /**
   * Create overlay backdrop for sidebar
   */
  function createSidebarOverlay() {
    // Check if overlay already exists
    if (document.querySelector('.sidebar-overlay')) {
      sidebarOverlay = document.querySelector('.sidebar-overlay');
      return;
    }

    sidebarOverlay = document.createElement('div');
    sidebarOverlay.className = 'sidebar-overlay';
    sidebarOverlay.setAttribute('aria-hidden', 'true');
    
    document.body.appendChild(sidebarOverlay);
  }

  /**
   * Attach event listeners for mobile navigation
   */
  function attachEventListeners() {
    sidebar = document.querySelector('.admin-sidebar');
    
    if (!sidebar || !toggleButton || !sidebarOverlay) {
      return;
    }

    // Toggle sidebar on button click
    toggleButton.addEventListener('click', toggleSidebar);

    // Close sidebar when clicking overlay
    sidebarOverlay.addEventListener('click', closeSidebar);

    // Close sidebar when clicking a navigation link
    const navLinks = sidebar.querySelectorAll('.admin-nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        // Small delay to allow navigation to start
        setTimeout(closeSidebar, 150);
      });
    });

    // Handle window resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (window.innerWidth > 768) {
          closeSidebar();
          if (toggleButton) toggleButton.style.display = 'none';
          if (sidebarOverlay) sidebarOverlay.style.display = 'none';
        } else {
          if (toggleButton) toggleButton.style.display = 'flex';
        }
      }, 250);
    });

    // Prevent body scroll when sidebar is open
    document.addEventListener('sidebarOpened', () => {
      document.body.style.overflow = 'hidden';
    });

    document.addEventListener('sidebarClosed', () => {
      document.body.style.overflow = '';
    });
  }

  /**
   * Toggle sidebar open/closed
   */
  function toggleSidebar() {
    if (!sidebar) return;

    const isActive = sidebar.classList.contains('active');
    
    if (isActive) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  /**
   * Open sidebar
   */
  function openSidebar() {
    if (!sidebar || !sidebarOverlay) return;

    sidebar.classList.add('active');
    sidebarOverlay.classList.add('active');
    toggleButton.innerHTML = '✕';
    toggleButton.setAttribute('aria-label', 'Close navigation menu');
    
    document.dispatchEvent(new CustomEvent('sidebarOpened'));
  }

  /**
   * Close sidebar
   */
  function closeSidebar() {
    if (!sidebar || !sidebarOverlay) return;

    sidebar.classList.remove('active');
    sidebarOverlay.classList.remove('active');
    toggleButton.innerHTML = '☰';
    toggleButton.setAttribute('aria-label', 'Open navigation menu');
    
    document.dispatchEvent(new CustomEvent('sidebarClosed'));
  }

  /**
   * Add data-label attributes to table cells for mobile card view
   * This allows CSS to display labels using ::before pseudo-element
   */
  function addDataLabelsToTables() {
    const tables = document.querySelectorAll('.admin-table');
    
    tables.forEach(table => {
      const headers = Array.from(table.querySelectorAll('thead th')).map(th => 
        th.textContent.trim()
      );

      const rows = table.querySelectorAll('tbody tr');
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        cells.forEach((cell, index) => {
          if (headers[index] && headers[index] !== '') {
            cell.setAttribute('data-label', headers[index]);
          }
        });
      });
    });
  }

  /**
   * Re-initialize data labels when table content changes
   * Call this function after dynamically updating table content
   */
  function refreshTableLabels() {
    addDataLabelsToTables();
  }

  /**
   * Initialize on DOM ready
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileNav);
  } else {
    initMobileNav();
  }

  // Re-initialize when sidebar is loaded dynamically
  window.addEventListener('sidebar:loaded', () => {
    setTimeout(() => {
      sidebar = document.querySelector('.admin-sidebar');
      if (sidebar && window.innerWidth <= 768) {
        attachEventListeners();
      }
    }, 100);
  });

  // Expose refresh function globally for dynamic table updates
  window.RazoMobileNav = {
    refreshTableLabels: refreshTableLabels,
    closeSidebar: closeSidebar,
    openSidebar: openSidebar
  };

})();
