/**
 * RazoConnect - Sistema de Temas Estacionales Automáticos
 * Gestiona la aplicación de temas según la fecha actual
 * @version 1.0.0
 */

(function () {
  "use strict";

  // ============================================
  // CONFIGURACIÓN DE TEMAS Y RANGOS DE FECHAS
  // ============================================

  const THEMES = {
    navidad: {
      name: "navidad",
      displayName: "Navidad",
      className: "theme-navidad",
      icon: "🎄",
      dateRanges: [{ startMonth: 11, startDay: 1, endMonth: 12, endDay: 25 }],
    },
    sanValentin: {
      name: "sanValentin",
      displayName: "San Valentín",
      className: "theme-sanvalentin",
      icon: "💝",
      dateRanges: [{ startMonth: 1, startDay: 15, endMonth: 2, endDay: 14 }],
    },
    diaMadre: {
      name: "diaMadre",
      displayName: "Día de la Madre",
      className: "theme-diamadre",
      icon: "👩‍👧‍👦",
      dateRanges: [{ startMonth: 4, startDay: 15, endMonth: 5, endDay: 10 }],
    },
    diaPadre: {
      name: "diaPadre",
      displayName: "Día del Padre",
      className: "theme-diapadre",
      icon: "👨‍👦",
      dateRanges: [{ startMonth: 6, startDay: 1, endMonth: 6, endDay: 30 }],
    },
    graduaciones: {
      name: "graduaciones",
      displayName: "Graduaciones",
      className: "theme-graduaciones",
      icon: "🎓",
      dateRanges: [{ startMonth: 7, startDay: 1, endMonth: 7, endDay: 31 }],
    },
    todaOcasion: {
      name: "todaOcasion",
      displayName: "Toda Ocasión",
      className: "theme-todaocasion",
      icon: "🎁",
      // Default - se aplica cuando ningún otro tema coincide
      isDefault: true,
    },
  };

  // ============================================
  // CLASE PRINCIPAL: ThemeManager
  // ============================================

  class ThemeManager {
    constructor() {
      this.currentTheme = null;
      this.debugMode = false; // Cambiar a true para ver logs en consola
    }

    /**
     * Inicializa el gestor de temas
     */
    init() {
      // Aplicar tema inicial
      this.applyThemeBasedOnDate();

      // Opcional: Verificar cambio de tema cada hora
      // Útil para sitios que permanecen abiertos por mucho tiempo
      this.scheduleThemeCheck();

      // Exponer API global para debugging
      if (window) {
        window.RazoThemeManager = {
          getCurrentTheme: () => this.getCurrentTheme(),
          setTheme: (themeName) => this.setThemeManually(themeName),
          getAllThemes: () => Object.keys(THEMES),
          getThemeInfo: () => this.getThemeInfo(),
        };
      }

      this.log("✅ Theme Manager iniciado correctamente");
    }

    /**
     * Determina y aplica el tema correcto según la fecha actual
     */
    applyThemeBasedOnDate() {
      const now = new Date();
      const detectedTheme = this.detectThemeForDate(now);

      this.applyTheme(detectedTheme);
    }

    /**
     * Detecta qué tema debe aplicarse según una fecha dada
     * @param {Date} date - Fecha a evaluar
     * @returns {Object} - Objeto del tema correspondiente
     */
    detectThemeForDate(date) {
      const month = date.getMonth() + 1; // JavaScript months: 0-11, necesitamos 1-12
      const day = date.getDate();

      // Buscar tema que coincida con la fecha
      for (const [key, theme] of Object.entries(THEMES)) {
        if (theme.isDefault) continue; // Saltar el tema default

        if (this.isDateInTheme(month, day, theme)) {
          return theme;
        }
      }

      // Si ningún tema coincide, retornar el default
      return THEMES.todaOcasion;
    }

    /**
     * Verifica si una fecha cae dentro de los rangos de un tema
     * @param {number} month - Mes (1-12)
     * @param {number} day - Día del mes
     * @param {Object} theme - Objeto del tema con dateRanges
     * @returns {boolean}
     */
    isDateInTheme(month, day, theme) {
      if (!theme.dateRanges || theme.dateRanges.length === 0) {
        return false;
      }

      return theme.dateRanges.some((range) => {
        const afterStart =
          month > range.startMonth ||
          (month === range.startMonth && day >= range.startDay);

        const beforeEnd =
          month < range.endMonth ||
          (month === range.endMonth && day <= range.endDay);

        return afterStart && beforeEnd;
      });
    }

    /**
     * Aplica un tema al documento
     * @param {Object} theme - Tema a aplicar
     */
    applyTheme(theme) {
      const body = document.body;

      // Remover todas las clases de tema previas
      Object.values(THEMES).forEach((t) => {
        body.classList.remove(t.className);
      });

      // Aplicar nueva clase de tema
      body.classList.add(theme.className);

      // Guardar tema actual
      this.currentTheme = theme;

      // Guardar en localStorage para persistencia (opcional)
      localStorage.setItem("razoconnect_current_theme", theme.name);

      // Disparar evento personalizado para que otros scripts reaccionen
      this.dispatchThemeChangeEvent(theme);
    }

    /**
     * Permite establecer un tema manualmente (para testing o preferencias)
     * @param {string} themeName - Nombre del tema
     */
    setThemeManually(themeName) {
      const theme = THEMES[themeName];

      if (!theme) {
        console.error(`❌ Tema "${themeName}" no encontrado`);
        return false;
      }

      this.applyTheme(theme);
      return true;
    }

    /**
     * Obtiene el tema actual
     * @returns {Object|null}
     */
    getCurrentTheme() {
      return this.currentTheme;
    }

    /**
     * Obtiene información del tema actual
     * @returns {Object}
     */
    getThemeInfo() {
      if (!this.currentTheme) {
        return null;
      }

      return {
        name: this.currentTheme.name,
        displayName: this.currentTheme.displayName,
        icon: this.currentTheme.icon,
        className: this.currentTheme.className,
      };
    }

    /**
     * Programa verificaciones periódicas del tema
     */
    scheduleThemeCheck() {
      // Verificar tema cada hora
      setInterval(() => {
        this.applyThemeBasedOnDate();
      }, 60 * 60 * 1000); // 1 hora
    }

    /**
     * Dispara un evento personalizado cuando cambia el tema
     * @param {Object} theme - Tema aplicado
     */
    dispatchThemeChangeEvent(theme) {
      const event = new CustomEvent("razo:themeChanged", {
        detail: {
          theme: theme.name,
          displayName: theme.displayName,
          icon: theme.icon,
          className: theme.className,
        },
      });

      document.dispatchEvent(event);
    }

    /**
     * Log condicional para debugging
     * @param {string} message - Mensaje a mostrar
     */
    log(message) {
      if (this.debugMode) {
        console.log(`[ThemeManager] ${message}`);
      }
    }
  }

  // ============================================
  // UTILIDADES ADICIONALES
  // ============================================
  /**
   * Función helper: mostrar todos los temas y sus rangos
   */
  window.showAllThemes = function () {
    // Debug function - removed for production
  };

  // ============================================
  // AUTO-INICIALIZACIÓN
  // ============================================

  // Esperar a que el DOM esté listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      const manager = new ThemeManager();
      manager.init();
    });
  } else {
    // DOM ya está listo
    const manager = new ThemeManager();
    manager.init();
  }
})();
