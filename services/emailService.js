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

module.exports = {
  enviarEmail,
};
