const nodemailer = require("nodemailer");
const db = require("../db");

let cachedTransporter = null;

async function createTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    return cachedTransporter;
  }

  const testAccount = await nodemailer.createTestAccount();

  cachedTransporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  console.warn(
    "Usando credenciales temporales de Ethereal. Para producción usa un proveedor como SendGrid o Mailgun."
  );
  console.warn(`Usuario Ethereal: ${testAccount.user}`);
  console.warn(`Contraseña Ethereal: ${testAccount.pass}`);
  console.warn("Vista previa de correos: https://ethereal.email/messages");

  return cachedTransporter;
}

async function enviarEmail(destinatario, asunto, cuerpoHtml) {
  try {
    const transporter = await createTransporter();

    await transporter.sendMail({
      from: process.env.SMTP_FROM || "RazoConnect <no-reply@razoconnect.com>",
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
