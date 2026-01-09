require("dotenv").config();
const nodemailer = require("nodemailer");
const handlebars = require("handlebars");
const fs = require("fs");
const path = require("path");
const db = require("../db");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
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

async function sendTemplatedEmail(to, subject, templateData) {
  try {
    const templatePath = path.join(__dirname, "../templates/master-email.hbs");
    const templateSource = fs.readFileSync(templatePath, "utf8");
    const template = handlebars.compile(templateSource);
    
    const data = {
      ...templateData,
      year: new Date().getFullYear(),
    };
    
    const htmlContent = template(data);
    
    return await enviarEmail(to, subject, htmlContent);
  } catch (error) {
    console.error("Error enviando correo con plantilla:", error);
    return false;
  }
}

async function enviarCorreoCambioEstatus(
  emailCliente,
  nombreCliente,
  pedidoId,
  nuevoEstatus
) {
  const frontendUrl = process.env.FRONTEND_BASE_URL || "https://razo.com.mx";
  const asunto = `Actualización de tu Pedido #${pedidoId}`;
  
  const estatusEmojis = {
    'Pendiente': '⏳',
    'Confirmado': '✅',
    'En Proceso': '📦',
    'Enviado': '🚚',
    'Entregado': '✨',
    'Cancelado': '❌',
    'Parcialmente Surtido': '⚠️'
  };
  
  const emoji = estatusEmojis[nuevoEstatus] || '📋';
  
  return sendTemplatedEmail(emailCliente, asunto, {
    title: 'Actualización de Pedido',
    name: nombreCliente,
    message: `Tu pedido <strong>#${pedidoId}</strong> ha sido actualizado.<br><br><div style="background: linear-gradient(135deg, #F97316 0%, #ea580c 100%); color: white; padding: 16px; border-radius: 8px; text-align: center; font-size: 18px; font-weight: 600; margin: 16px 0;">${emoji} ${nuevoEstatus}</div>`,
    buttonText: 'Ver Detalles del Pedido',
    buttonUrl: `${frontendUrl}/perfil/pedidos`,
    additionalInfo: 'Si no reconoces esta actualización o tienes alguna pregunta, no dudes en contactarnos.'
  });
}

module.exports = {
  enviarEmail,
  sendTemplatedEmail,
  enviarCorreoCambioEstatus,
};
