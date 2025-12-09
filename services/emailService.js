require("dotenv").config();
const nodemailer = require("nodemailer");
const db = require("../db");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // Es false para el puerto 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function enviarEmail(destinatario, asunto, cuerpoHtml) {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: destinatario,
      subject: asunto,
      html: cuerpoHtml,
    });

    await db.query(
      `INSERT INTO CommunicationLogs (Timestamp, Destinatario, Asunto, EstatusEmail)
       VALUES (NOW(), $1, $2, 'Enviado')`,
      [destinatario, asunto]
    );

    return true;
  } catch (error) {
    console.error("Error enviando correo:", error);

    try {
      await db.query(
        `INSERT INTO CommunicationLogs (Timestamp, Destinatario, Asunto, EstatusEmail, ErrorMensaje)
         VALUES (NOW(), $1, $2, 'Fallido', $3)`,
        [destinatario, asunto, error.message]
      );
    } catch (logError) {
      console.error("Error registrando CommunicationLog:", logError);
    }

    return false;
  }
}

function buildCambioEstatusHtml(nombreCliente, pedidoId, nuevoEstatus) {
  const frontendUrl =
    process.env.FRONTEND_BASE_URL?.replace(/\/$/, "") ||
    "https://midominio.com";
  const pedidoUrl = `${frontendUrl}/perfil/pedidos`;

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; padding: 24px;">
      <h2 style="color:#111827; margin-bottom: 16px;">Actualización de tu pedido</h2>
      <p style="margin: 0 0 12px 0;">Hola ${nombreCliente || "cliente"},</p>
      <p style="margin: 0 0 16px 0;">
        Tu pedido <strong>#${pedidoId}</strong> ha cambiado de estado a:
        <strong>${nuevoEstatus}</strong>.
      </p>
      <a href="${pedidoUrl}"
        style="
          display: inline-block;
          padding: 12px 20px;
          background-color: #ff6b35;
          color: #ffffff;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          margin-top: 8px;
        ">
        Ver Pedido
      </a>
      <p style="margin-top: 24px; font-size: 0.9rem; color: #6b7280;">
        Si no reconoces esta actualización, por favor contáctanos.
      </p>
      <p style="margin-top: 6px; font-size: 0.9rem; color: #94a3b8;">
        Equipo RazoConnect
      </p>
    </div>
  `;
}

async function enviarCorreoCambioEstatus(
  emailCliente,
  nombreCliente,
  pedidoId,
  nuevoEstatus
) {
  const asunto = `Actualización de tu Pedido #${pedidoId}`;
  const cuerpoHtml = buildCambioEstatusHtml(
    nombreCliente,
    pedidoId,
    nuevoEstatus
  );
  return enviarEmail(emailCliente, asunto, cuerpoHtml);
}

module.exports = {
  enviarEmail,
  enviarCorreoCambioEstatus,
};
