/**
 * RazoConnect - Inicio Seasonal Logic
 * Lógica dinámica para adaptar la página de inicio según el tema estacional
 * @version 1.0.0
 */

(function () {
  "use strict";

  // ============================================
  // CONFIGURACIÓN DE EVENTOS ESTACIONALES
  // ============================================

  const SEASONAL_EVENTS = {
    navidad: {
      icon: "🎄",
      eventName: "Navidad",
      welcomeMessage: "prepárate para la Navidad",
      subtitle: "Encuentra los regalos perfectos para la temporada más mágica",
      targetMonth: 12, // Diciembre
      targetDay: 25, // 25 de diciembre
      ctaText: "Ver Catálogo Navideño →",
      countdownText: "Prepárate para la temporada más importante del año",
    },
    sanValentin: {
      icon: "💝",
      eventName: "San Valentín",
      welcomeMessage: "celebra el amor",
      subtitle: "Empaques románticos que expresan sentimientos especiales",
      targetMonth: 2, // Febrero
      targetDay: 14, // 14 de febrero
      ctaText: "Explorar San Valentín →",
      countdownText: "El día del amor está cerca, prepara tus productos",
    },
    diaMadre: {
      icon: "👩‍👧‍👦",
      eventName: "Día de la Madre",
      welcomeMessage: "celebra a las mamás",
      subtitle: "Regalos especiales para las personas más importantes",
      targetMonth: 5, // Mayo
      targetDay: 10, // 10 de mayo
      ctaText: "Ver Colección Día de la Madre →",
      countdownText: "Prepárate para honrar a las mamás del mundo",
    },
    diaPadre: {
      icon: "👨‍👦",
      eventName: "Día del Padre",
      welcomeMessage: "honra a los padres",
      subtitle: "Empaques elegantes para los héroes del hogar",
      targetMonth: 6, // Junio
      targetDay: 15, // 15 de junio (tercer domingo aproximado)
      ctaText: "Descubrir Día del Padre →",
      countdownText: "El día del padre se acerca, prepara tu inventario",
    },
    graduaciones: {
      icon: "🎓",
      eventName: "Graduaciones",
      welcomeMessage: "celebra el éxito académico",
      subtitle: "Empaques premium para momentos memorables",
      targetMonth: 7, // Julio
      targetDay: 15, // Mitad de temporada de graduaciones
      ctaText: "Ver Colección Graduaciones →",
      countdownText: "La temporada de graduaciones está por comenzar",
    },
    todaOcasion: {
      icon: "🎁",
      eventName: null, // No mostrar countdown
      welcomeMessage: "prepárate para toda ocasión",
      subtitle: "Encuentra los mejores productos para tu negocio",
      targetMonth: null,
      targetDay: null,
      ctaText: null,
      countdownText: null,
    },
  };

  // ============================================
  // VARIABLES GLOBALES
  // ============================================

  let countdownInterval = null;
  let currentTheme = null;

  // ============================================
  // ACTUALIZAR CONTENIDO SEGÚN TEMA
  // ============================================

  function updateSeasonalContent(themeName) {
    const event = SEASONAL_EVENTS[themeName] || SEASONAL_EVENTS.todaOcasion;
    currentTheme = themeName;

    // Actualizar mensaje de bienvenida
    updateWelcomeBanner(event);

    // Actualizar/ocultar widget de cuenta regresiva
    updateCountdownWidget(event);

    console.log("🎯 Contenido estacional actualizado:", themeName);
  }

  // ============================================
  // BANNER DE BIENVENIDA
  // ============================================

  function updateWelcomeBanner(event) {
    const user = JSON.parse(localStorage.getItem("razoconnect_user") || "{}");
    const userName = user.nombre || "Cliente";

    // Actualizar elementos
    const welcomeIcon = document.getElementById("welcomeIcon");
    const welcomeTitle = document.getElementById("welcomeTitle");
    const welcomeSubtitle = document.getElementById("welcomeSubtitle");
    const userNameSpan = document.getElementById("userName");

    if (welcomeIcon) welcomeIcon.textContent = event.icon;
    if (userNameSpan) userNameSpan.textContent = userName;

    if (welcomeTitle) {
      welcomeTitle.innerHTML = `Hola <span id="userName">${userName}</span>, ${event.welcomeMessage}`;
    }

    if (welcomeSubtitle) {
      welcomeSubtitle.textContent = event.subtitle;
    }
  }

  // ============================================
  // WIDGET DE CUENTA REGRESIVA
  // ============================================

  function updateCountdownWidget(event) {
    const widget = document.getElementById("countdownWidget");

    // Si es "Toda Ocasión", ocultar widget
    if (!event.eventName || !event.targetMonth || !event.targetDay) {
      if (widget) {
        widget.style.display = "none";
      }
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      return;
    }

    // Mostrar widget
    if (widget) {
      widget.style.display = "block";
    }

    // Calcular fecha objetivo
    const targetDate = calculateTargetDate(event.targetMonth, event.targetDay);

    // Actualizar contenido del widget
    const eventIcon = document.getElementById("eventIcon");
    const eventTitle = document.getElementById("eventTitle");
    const eventSubtitle = document.getElementById("eventSubtitle");
    const countdownCTA = document.getElementById("countdownCTA");

    if (eventIcon) eventIcon.textContent = event.icon;
    if (eventTitle)
      eventTitle.textContent = event.eventName + " " + targetDate.getFullYear();
    if (eventSubtitle) eventSubtitle.textContent = event.countdownText;
    if (countdownCTA) countdownCTA.textContent = event.ctaText;

    // Iniciar cuenta regresiva
    startCountdown(targetDate);
  }

  // ============================================
  // CALCULAR FECHA OBJETIVO
  // ============================================

  function calculateTargetDate(month, day) {
    const now = new Date();
    const currentYear = now.getFullYear();

    // Crear fecha objetivo para este año
    const targetDate = new Date(currentYear, month - 1, day, 23, 59, 59);

    // Si la fecha ya pasó este año, usar el siguiente año
    if (targetDate < now) {
      targetDate.setFullYear(currentYear + 1);
    }

    return targetDate;
  }

  // ============================================
  // LÓGICA DE CUENTA REGRESIVA
  // ============================================

  function startCountdown(targetDate) {
    // Limpiar intervalo anterior si existe
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }

    function updateCounter() {
      const now = new Date();
      const diff = targetDate - now;

      // Si llegó el día o pasó, no mostrar números negativos
      if (diff <= 0) {
        const daysCount = document.getElementById("daysCount");
        const hoursCount = document.getElementById("hoursCount");
        const minutesCount = document.getElementById("minutesCount");

        if (daysCount) daysCount.textContent = "00";
        if (hoursCount) hoursCount.textContent = "00";
        if (minutesCount) minutesCount.textContent = "00";

        // Detener el contador
        if (countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
        return;
      }

      // Calcular tiempo restante
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      // Actualizar display
      const daysCount = document.getElementById("daysCount");
      const hoursCount = document.getElementById("hoursCount");
      const minutesCount = document.getElementById("minutesCount");

      if (daysCount) daysCount.textContent = days.toString().padStart(2, "0");
      if (hoursCount)
        hoursCount.textContent = hours.toString().padStart(2, "0");
      if (minutesCount)
        minutesCount.textContent = minutes.toString().padStart(2, "0");
    }

    // Actualizar inmediatamente
    updateCounter();

    // Actualizar cada minuto (60 segundos)
    countdownInterval = setInterval(updateCounter, 60000);
  }

  // ============================================
  // CALCULAR DÍAS HASTA FESTIVIDAD
  // ============================================

  function getDaysUntilEvent(month, day) {
    if (!month || !day) return null;

    const targetDate = calculateTargetDate(month, day);
    const now = new Date();
    const diff = targetDate - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    return days;
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================

  // Escuchar cambios de tema
  document.addEventListener("razo:themeChanged", (event) => {
    console.log("🎨 Tema cambiado a:", event.detail.theme);
    updateSeasonalContent(event.detail.theme);
  });

  // Inicializar cuando el tema esté listo
  function initializeSeasonalContent() {
    if (window.RazoThemeManager) {
      const theme = window.RazoThemeManager.getCurrentTheme();
      if (theme) {
        updateSeasonalContent(theme.name);
      }
    } else {
      // Si aún no está listo, reintentar
      setTimeout(initializeSeasonalContent, 100);
    }
  }

  // Esperar a que el DOM esté listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(initializeSeasonalContent, 150);
    });
  } else {
    setTimeout(initializeSeasonalContent, 150);
  }

  // ============================================
  // API GLOBAL PARA DEBUGGING
  // ============================================

  window.RazoSeasonalContent = {
    getCurrentEvent: () => {
      if (currentTheme) {
        const event = SEASONAL_EVENTS[currentTheme];
        if (event && event.targetMonth && event.targetDay) {
          const targetDate = calculateTargetDate(
            event.targetMonth,
            event.targetDay
          );
          return {
            ...event,
            targetYear: targetDate.getFullYear(),
            targetDate: targetDate.toLocaleDateString("es-MX"),
            daysUntil: getDaysUntilEvent(event.targetMonth, event.targetDay),
          };
        }
        return event;
      }
      return null;
    },
    getDaysUntil: (themeName) => {
      const event = SEASONAL_EVENTS[themeName];
      if (event && event.targetMonth && event.targetDay) {
        return getDaysUntilEvent(event.targetMonth, event.targetDay);
      }
      return null;
    },
    updateContent: (themeName) => {
      updateSeasonalContent(themeName);
    },
  };

  // ============================================
  // CLEANUP AL SALIR DE LA PÁGINA
  // ============================================

  window.addEventListener("beforeunload", () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }
  });
})();
