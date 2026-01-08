function formatCurrency(value) {
  const amount = Number.parseFloat(value ?? 0) || 0;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatearFrecuencia(dias) {
  if (!dias) return "Sin datos suficientes";
  if (dias < 1) return "Menos de un día";
  if (dias === 1) return "1 día";
  if (dias < 30) return `${dias} días`;
  const meses = Math.round(dias / 30);
  return `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
}

function formatearAntiguedad(meses) {
  if (meses < 1) return "Menos de un mes";
  if (meses === 1) return "1 mes";
  if (meses < 12) return `${meses} meses`;
  const años = Math.floor(meses / 12);
  const mesesRestantes = meses % 12;
  if (mesesRestantes === 0) return `${años} ${años === 1 ? 'año' : 'años'}`;
  return `${años} ${años === 1 ? 'año' : 'años'} y ${mesesRestantes} ${mesesRestantes === 1 ? 'mes' : 'meses'}`;
}

function getRiskConfig(nivelRiesgo) {
  switch (nivelRiesgo) {
    case 'BAJO':
      return {
        class: 'risk-bajo',
        icon: '✅',
        title: 'Riesgo Bajo',
        message: 'El perfil del cliente cumple con los criterios recomendados.'
      };
    case 'MEDIO':
      return {
        class: 'risk-medio',
        icon: '⚠️',
        title: 'Precaución - Riesgo Medio',
        message: 'Se recomienda revisar cuidadosamente los indicadores.'
      };
    case 'ALTO':
      return {
        class: 'risk-alto',
        icon: '⛔',
        title: 'Atención - Riesgo Alto',
        message: 'Se detectaron factores de riesgo significativos.'
      };
    default:
      return {
        class: 'risk-medio',
        icon: '❓',
        title: 'Análisis Pendiente',
        message: 'No se pudo determinar el nivel de riesgo.'
      };
  }
}

async function renderCreditScoreCard(solicitudId) {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/analisis-credito/${solicitudId}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('razoconnect_admin_token')}`,
      },
    });

    if (!response.ok) {
      throw new Error('Error al obtener análisis de crédito');
    }

    const { data: analisis } = await response.json();
    const riskConfig = getRiskConfig(analisis.analisis.nivel_riesgo);

    const html = `
      <div class="credit-score-card">
        <div class="credit-score-header">
          <h3 class="credit-score-title">${analisis.nombre_cliente}</h3>
          <p class="credit-score-subtitle">${formatCurrency(analisis.monto_solicitado)}</p>
        </div>

        <div class="credit-metrics-grid">
          <div class="credit-metric-card">
            <div class="credit-metric-label">Antigüedad como cliente</div>
            <div class="credit-metric-value">${formatearAntiguedad(analisis.metricas.antiguedad_meses)}</div>
          </div>

          <div class="credit-metric-card">
            <div class="credit-metric-label">Pedidos completados</div>
            <div class="credit-metric-value">${analisis.metricas.total_pedidos}</div>
          </div>

          <div class="credit-metric-card">
            <div class="credit-metric-label">Compra más grande</div>
            <div class="credit-metric-value">${formatCurrency(analisis.metricas.compra_maxima)}</div>
          </div>

          <div class="credit-metric-card">
            <div class="credit-metric-label">Frecuencia de compra</div>
            <div class="credit-metric-value">${formatearFrecuencia(analisis.metricas.frecuencia_dias)}</div>
          </div>
        </div>

        <div class="credit-risk-banner ${riskConfig.class}">
          <div class="credit-risk-icon">${riskConfig.icon}</div>
          <div class="credit-risk-content">
            <div class="credit-risk-title">${riskConfig.title}</div>
            <p class="credit-risk-message">${riskConfig.message}</p>
          </div>
        </div>

        ${analisis.analisis.advertencias.length > 0 ? `
          <ul class="credit-warnings-list">
            ${analisis.analisis.advertencias.map(adv => `
              <li class="credit-warning-item">${adv}</li>
            `).join('')}
          </ul>
        ` : ''}

        <div class="credit-actions">
          <button type="button" class="btn btn-outline" onclick="rechazarCambio(${solicitudId})">
            Rechazar
          </button>
          <button type="button" class="btn btn-primary" onclick="aprobarCambio(${solicitudId})">
            Aprobar
          </button>
        </div>
      </div>
    `;

    return html;
  } catch (error) {
    console.error('Error renderizando credit score card:', error);
    return `
      <div class="alert alert-danger">
        Error al cargar el análisis de crédito: ${error.message}
      </div>
    `;
  }
}
