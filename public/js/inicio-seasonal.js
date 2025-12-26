/**
 * RazoConnect - Inicio Seasonal Logic
 * Conecta el evento razo:themeChanged con el DOM de inicio.html
 * @version 2.0.0
 */

(function () {
  "use strict";

  // ============================================
  // DICCIONARIO DE CONFIGURACIÓN ESTACIONAL
  // ============================================

  const SEASONAL_CONFIG = {
    navidad: {
      hero: [
        {
          image: "https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=1600&h=900&fit=crop",
          eyebrow: "Temporada Especial",
          title: "Navidad",
          description: "Las cajas navideñas más exclusivas al mejor precio del mercado. Compra al mayoreo y maximiza tus ganancias.",
          ctaText: "Ver Catálogo Navideño",
          ctaLink: "/catalogo.html?categoria=7"
        },
        {
          image: "https://images.unsplash.com/photo-1512909006721-3d6018887383?w=1600&h=900&fit=crop",
          eyebrow: "Ofertas Navideñas",
          title: "Hasta 40% OFF",
          description: "Descuentos especiales en productos seleccionados para la temporada. Aprovecha nuestras ofertas flash.",
          ctaText: "Ver Ofertas",
          ctaLink: "/catalogo.html?oferta=true"
        }
      ],
      welcome: {
        icon: "🎄",
        title: "prepárate para la Navidad",
        subtitle: "Encuentra los regalos perfectos para la temporada más mágica"
      },
      countdown: {
        month: 12,
        day: 25,
        title: "Navidad",
        subtitle: "Prepárate para la temporada más importante del año",
        ctaText: "Ver Catálogo Navideño →"
      }
    },

    sanValentin: {
      hero: [
        {
          image: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=1600&h=900&fit=crop",
          eyebrow: "Temporada del Amor",
          title: "San Valentín",
          description: "Empaques románticos que expresan sentimientos especiales. Productos perfectos para el día del amor.",
          ctaText: "Explorar San Valentín",
          ctaLink: "/catalogo.html?categoria=san-valentin"
        },
        {
          image: "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=1600&h=900&fit=crop",
          eyebrow: "Ofertas Especiales",
          title: "Hasta 35% OFF",
          description: "Descuentos increíbles en productos seleccionados. Aprovecha nuestras ofertas flash antes de que terminen.",
          ctaText: "Ver Ofertas",
          ctaLink: "/catalogo.html?oferta=true"
        }
      ],
      welcome: {
        icon: "💝",
        title: "celebra el amor",
        subtitle: "Empaques románticos que expresan sentimientos especiales"
      },
      countdown: {
        month: 2,
        day: 14,
        title: "San Valentín",
        subtitle: "El día del amor está cerca, prepara tus productos",
        ctaText: "Explorar San Valentín →"
      }
    },

    diaMadre: {
      hero: [
        {
          image: "https://images.unsplash.com/photo-1529634806980-85c3dd6d34ac?w=1600&h=900&fit=crop",
          eyebrow: "Celebración Especial",
          title: "Día de la Madre",
          description: "Regalos especiales para las personas más importantes. Empaques elegantes que expresan amor y gratitud.",
          ctaText: "Ver Colección Día de la Madre",
          ctaLink: "/catalogo.html?categoria=dia-madre"
        },
        {
          image: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=1600&h=900&fit=crop",
          eyebrow: "Ofertas Especiales",
          title: "Hasta 30% OFF",
          description: "Descuentos increíbles en productos seleccionados. Aprovecha nuestras ofertas flash antes de que terminen.",
          ctaText: "Ver Ofertas",
          ctaLink: "/catalogo.html?oferta=true"
        }
      ],
      welcome: {
        icon: "👩‍👧‍👦",
        title: "celebra a las mamás",
        subtitle: "Regalos especiales para las personas más importantes"
      },
      countdown: {
        month: 5,
        day: 10,
        title: "Día de la Madre",
        subtitle: "Prepárate para honrar a las mamás del mundo",
        ctaText: "Ver Colección Día de la Madre →"
      }
    },

    diaPadre: {
      hero: [
        {
          image: "https://images.unsplash.com/photo-1520975682071-a0d3d8a4b6d3?w=1600&h=900&fit=crop",
          eyebrow: "Celebración Especial",
          title: "Día del Padre",
          description: "Empaques elegantes para los héroes del hogar. Productos premium que expresan admiración y respeto.",
          ctaText: "Descubrir Día del Padre",
          ctaLink: "/catalogo.html?categoria=dia-padre"
        },
        {
          image: "https://images.unsplash.com/photo-1513885535751-8b9238bd345a?w=1600&h=900&fit=crop",
          eyebrow: "Ofertas Especiales",
          title: "Hasta 30% OFF",
          description: "Descuentos increíbles en productos seleccionados. Aprovecha nuestras ofertas flash antes de que terminen.",
          ctaText: "Ver Ofertas",
          ctaLink: "/catalogo.html?oferta=true"
        }
      ],
      welcome: {
        icon: "👨‍👦",
        title: "honra a los padres",
        subtitle: "Empaques elegantes para los héroes del hogar"
      },
      countdown: {
        month: 6,
        day: 15,
        title: "Día del Padre",
        subtitle: "El día del padre se acerca, prepara tu inventario",
        ctaText: "Descubrir Día del Padre →"
      }
    },

    graduaciones: {
      hero: [
        {
          image: "https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?w=1600&h=900&fit=crop",
          eyebrow: "Temporada de Logros",
          title: "Graduaciones",
          description: "Empaques premium para momentos memorables. Celebra el éxito académico con productos de calidad.",
          ctaText: "Ver Colección Graduaciones",
          ctaLink: "/catalogo.html?categoria=graduaciones"
        },
        {
          image: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=1600&h=900&fit=crop",
          eyebrow: "Ofertas Especiales",
          title: "Hasta 25% OFF",
          description: "Descuentos increíbles en productos seleccionados. Aprovecha nuestras ofertas flash antes de que terminen.",
          ctaText: "Ver Ofertas",
          ctaLink: "/catalogo.html?oferta=true"
        }
      ],
      welcome: {
        icon: "🎓",
        title: "celebra el éxito académico",
        subtitle: "Empaques premium para momentos memorables"
      },
      countdown: {
        month: 7,
        day: 15,
        title: "Graduaciones",
        subtitle: "La temporada de graduaciones está por comenzar",
        ctaText: "Ver Colección Graduaciones →"
      }
    },

    todaOcasion: {
      hero: [
        {
          image: "https://images.unsplash.com/photo-1513885535751-8b9238bd345a?w=1600&h=900&fit=crop",
          eyebrow: "Ofertas Especiales",
          title: "Hasta 40% OFF",
          description: "Descuentos increíbles en productos seleccionados. Aprovecha nuestras ofertas flash antes de que terminen.",
          ctaText: "Ver Ofertas",
          ctaLink: "/catalogo.html?oferta=true"
        },
        {
          image: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=1600&h=900&fit=crop",
          eyebrow: "Nuevos Productos",
          title: "Recién Llegados",
          description: "Descubre las últimas novedades en nuestro catálogo. Productos frescos y tendencias del mercado.",
          ctaText: "Explorar Novedades",
          ctaLink: "/catalogo.html?sort=newest"
        }
      ],
      welcome: {
        icon: "🎁",
        title: "prepárate para toda ocasión",
        subtitle: "Encuentra los mejores productos para tu negocio"
      },
      countdown: "auto"
    }
  };

  // ============================================
  // VARIABLES GLOBALES
  // ============================================

  let countdownInterval = null;
  let currentTheme = null;

  // ============================================
  // ACTUALIZAR HERO SLIDER
  // ============================================

  function updateHeroSlider(config) {
    const heroSlides = document.querySelectorAll(".hero-slide");
    
    if (!heroSlides || heroSlides.length === 0) return;

    config.hero.forEach((slideConfig, index) => {
      const slide = heroSlides[index];
      if (!slide) return;

      slide.style.backgroundImage = `url('${slideConfig.image}')`;

      const eyebrow = slide.querySelector(".hero-eyebrow");
      const title = slide.querySelector(".hero-title");
      const description = slide.querySelector(".hero-description");
      const cta = slide.querySelector(".hero-cta");

      if (eyebrow) eyebrow.textContent = slideConfig.eyebrow;
      if (title) title.textContent = slideConfig.title;
      if (description) description.textContent = slideConfig.description;
      if (cta) {
        cta.textContent = slideConfig.ctaText;
        cta.href = slideConfig.ctaLink;
      }
    });
  }

  // ============================================
  // ACTUALIZAR BANNER DE BIENVENIDA
  // ============================================

  function updateWelcomeBanner(config) {
    const user = JSON.parse(localStorage.getItem("razoconnect_user") || "{}");
    const userName = user.nombre || "Cliente";

    const welcomeIcon = document.getElementById("welcomeIcon");
    const welcomeTitle = document.getElementById("welcomeTitle");
    const welcomeSubtitle = document.getElementById("welcomeSubtitle");

    if (welcomeIcon) {
      welcomeIcon.textContent = config.welcome.icon;
    }

    if (welcomeTitle) {
      welcomeTitle.innerHTML = `Hola <span id="userName">${userName}</span>, ${config.welcome.title}`;
    }

    if (welcomeSubtitle) {
      welcomeSubtitle.textContent = config.welcome.subtitle;
    }
  }

  // ============================================
  // CALCULAR SIGUIENTE TEMPORADA
  // ============================================

  function getNextSeasonalEvent() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    // Orden de temporadas con sus fechas
    const seasons = [
      { month: 2, day: 14, name: "sanValentin", icon: "💝", title: "San Valentín" },
      { month: 5, day: 10, name: "diaMadre", icon: "👩‍👧‍👦", title: "Día de la Madre" },
      { month: 6, day: 15, name: "diaPadre", icon: "👨‍👦", title: "Día del Padre" },
      { month: 7, day: 15, name: "graduaciones", icon: "🎓", title: "Graduaciones" },
      { month: 12, day: 25, name: "navidad", icon: "🎄", title: "Navidad" }
    ];

    // Buscar la siguiente temporada
    for (const season of seasons) {
      const seasonDate = new Date(now.getFullYear(), season.month - 1, season.day);
      
      if (seasonDate > now) {
        return {
          ...season,
          targetDate: seasonDate
        };
      }
    }

    // Si no hay ninguna temporada pendiente este año, la siguiente es San Valentín del próximo año
    return {
      month: 2,
      day: 14,
      name: "sanValentin",
      icon: "💝",
      title: "San Valentín",
      targetDate: new Date(now.getFullYear() + 1, 1, 14)
    };
  }

  // ============================================
  // ACTUALIZAR WIDGET DE CUENTA REGRESIVA
  // ============================================

  function updateCountdownWidget(config) {
    const widget = document.getElementById("countdownWidget");

    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    if (!config.countdown) {
      if (widget) {
        widget.style.display = "none";
      }
      return;
    }

    if (widget) {
      widget.style.display = "block";
    }

    let targetDate, eventIcon, eventTitle, eventSubtitle, countdownCTA;
    const eventIconEl = document.getElementById("eventIcon");
    const eventTitleEl = document.getElementById("eventTitle");
    const eventSubtitleEl = document.getElementById("eventSubtitle");
    const countdownCTAEl = document.getElementById("countdownCTA");

    // Si es "auto", calcular la siguiente temporada
    if (config.countdown === "auto") {
      const nextSeason = getNextSeasonalEvent();
      targetDate = nextSeason.targetDate;
      
      if (eventIconEl) eventIconEl.textContent = nextSeason.icon;
      if (eventTitleEl) eventTitleEl.textContent = `${nextSeason.title} ${targetDate.getFullYear()}`;
      if (eventSubtitleEl) eventSubtitleEl.textContent = "¡Prepárate para la siguiente temporada especial!";
      if (countdownCTAEl) countdownCTAEl.textContent = "Explorar Catálogo →";
    } else {
      // Calcular año dinámicamente para temporadas específicas
      const now = new Date();
      const currentYear = now.getFullYear();
      
      // Crear fecha objetivo para este año
      targetDate = new Date(currentYear, config.countdown.month - 1, config.countdown.day, 23, 59, 59);
      
      // Si la fecha ya pasó este año, usar el siguiente año
      if (targetDate < now) {
        targetDate.setFullYear(currentYear + 1);
      }

      if (eventIconEl) eventIconEl.textContent = config.welcome.icon;
      if (eventTitleEl) eventTitleEl.textContent = `${config.countdown.title} ${targetDate.getFullYear()}`;
      if (eventSubtitleEl) eventSubtitleEl.textContent = config.countdown.subtitle;
      if (countdownCTAEl) countdownCTAEl.textContent = config.countdown.ctaText;
    }

    startCountdown(targetDate);
  }

  // ============================================
  // LÓGICA DE CUENTA REGRESIVA
  // ============================================

  function startCountdown(targetDate) {
    function updateCounter() {
      const now = new Date();
      const diff = targetDate - now;

      if (diff <= 0) {
        const daysCount = document.getElementById("daysCount");
        const hoursCount = document.getElementById("hoursCount");
        const minutesCount = document.getElementById("minutesCount");

        if (daysCount) daysCount.textContent = "00";
        if (hoursCount) hoursCount.textContent = "00";
        if (minutesCount) minutesCount.textContent = "00";

        if (countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      const daysCount = document.getElementById("daysCount");
      const hoursCount = document.getElementById("hoursCount");
      const minutesCount = document.getElementById("minutesCount");

      if (daysCount) daysCount.textContent = days.toString().padStart(2, "0");
      if (hoursCount) hoursCount.textContent = hours.toString().padStart(2, "0");
      if (minutesCount) minutesCount.textContent = minutes.toString().padStart(2, "0");
    }

    updateCounter();
    countdownInterval = setInterval(updateCounter, 60000);
  }

  // ============================================
  // ACTUALIZAR TODO EL CONTENIDO
  // ============================================

  function updateSeasonalContent(themeName) {
    const config = SEASONAL_CONFIG[themeName] || SEASONAL_CONFIG.todaOcasion;
    currentTheme = themeName;

    updateHeroSlider(config);
    updateWelcomeBanner(config);
    updateCountdownWidget(config);

    console.log("🎯 Contenido estacional actualizado:", themeName);
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================

  document.addEventListener("razo:themeChanged", (event) => {
    console.log("🎨 Tema cambiado detectado:", event.detail.theme);
    updateSeasonalContent(event.detail.theme);
  });

  // ============================================
  // INICIALIZACIÓN
  // ============================================

  function initializeSeasonalContent() {
    if (window.RazoThemeManager && window.RazoThemeManager.getCurrentTheme()) {
      const theme = window.RazoThemeManager.getCurrentTheme();
      console.log("🚀 Inicializando con tema:", theme.name);
      updateSeasonalContent(theme.name);
    } else {
      setTimeout(initializeSeasonalContent, 50);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeSeasonalContent);
  } else {
    initializeSeasonalContent();
  }

  // ============================================
  // API GLOBAL PARA DEBUGGING
  // ============================================

  window.RazoSeasonalContent = {
    getCurrentTheme: () => currentTheme,
    getConfig: (themeName) => SEASONAL_CONFIG[themeName] || null,
    updateContent: (themeName) => updateSeasonalContent(themeName),
    getAllThemes: () => Object.keys(SEASONAL_CONFIG)
  };

  // ============================================
  // CLEANUP
  // ============================================

  window.addEventListener("beforeunload", () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }
  });
})();
