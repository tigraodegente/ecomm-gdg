/**
 * Adaptado para uso com Cloudflare Workers
 * https://developers.cloudflare.com/workers/examples/send-email/
 */

type SendEmailOptions = {
  /** Email address of the recipient */
  to: string;
  /** Subject line of the email */
  subject: string;
  /** Message used for the body of the email */
  html: string;
};

// Definir uma flag para verificar se estamos no ambiente Cloudflare
const isCloudflare = typeof EdgeRuntime !== 'undefined';

// Verificar se temos as configurações de Sendgrid para Cloudflare
function hasSendgridConfig() {
  return (
    !!import.meta.env.SENDGRID_API_KEY &&
    !!import.meta.env.MAIL_FROM
  );
}

// Função para enviar email via Sendgrid em ambiente Cloudflare
async function sendEmailSendgrid(options: SendEmailOptions): Promise<any> {
  try {
    const { to, subject, html } = options;
    const from = import.meta.env.MAIL_FROM;
    
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject,
        content: [{ type: 'text/html', value: html }]
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Sendgrid API error: ${JSON.stringify(errorData)}`);
    }
    
    return { success: true, messageId: `sendgrid_${Date.now()}` };
  } catch (error) {
    console.error('Error sending email via Sendgrid:', error);
    throw error;
  }
}

// Função para enviar email via Mailchannels em ambiente Cloudflare
async function sendEmailMailchannels(options: SendEmailOptions): Promise<any> {
  try {
    const { to, subject, html } = options;
    const from = import.meta.env.MAIL_FROM;
    
    // Mailchannels é um serviço que permite enviar emails diretamente do Cloudflare Workers
    const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject,
        content: [{ type: 'text/html', value: html }]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mailchannels API error: ${errorText}`);
    }
    
    return { success: true, messageId: `mailchannels_${Date.now()}` };
  } catch (error) {
    console.error('Error sending email via Mailchannels:', error);
    throw error;
  }
}

// Implementação para Node.js (ambiente de desenvolvimento)
let nodemailerTransporter: any = null;

async function getNodemailerTransporter(): Promise<any> {
  // Se já temos um transporter, retorná-lo
  if (nodemailerTransporter) {
    return nodemailerTransporter;
  }
  
  // Em um ambiente de desenvolvimento, importar dynamicamente
  try {
    const nodemailer = await import('nodemailer');
    
    // Verificar variáveis de ambiente necessárias
    const requiredEnvVars = ["MAIL_HOST", "MAIL_PORT", "MAIL_SECURE", "MAIL_AUTH_USER", "MAIL_AUTH_PASS", "MAIL_FROM"];
    const missingEnvVars = requiredEnvVars.filter((envVar) => !import.meta.env[envVar]);
    
    if (missingEnvVars.length > 0) {
      throw new Error(`Missing mail configuration: ${missingEnvVars.join(", ")}`);
    }
    
    // Criar transporter
    nodemailerTransporter = nodemailer.createTransport({
      host: import.meta.env.MAIL_HOST,
      port: parseInt(import.meta.env.MAIL_PORT),
      secure: import.meta.env.MAIL_SECURE === "true",
      auth: {
        user: import.meta.env.MAIL_AUTH_USER,
        pass: import.meta.env.MAIL_AUTH_PASS
      }
    });
    
    return nodemailerTransporter;
  } catch (error) {
    console.error('Error initializing Nodemailer:', error);
    throw error;
  }
}

async function sendEmailNodemailer(options: SendEmailOptions): Promise<any> {
  try {
    const transporter = await getNodemailerTransporter();
    
    // Construir a mensagem
    const { to, subject, html } = options;
    const from = import.meta.env.MAIL_FROM;
    const message = { to, subject, html, from };
    
    // Enviar o email
    return new Promise((resolve, reject) => {
      transporter.sendMail(message, (err: any, info: any) => {
        if (err) {
          console.error(err);
          reject(err);
        }
        console.log("Message sent:", info.messageId);
        resolve(info);
      });
    });
  } catch (error) {
    console.error('Error sending email via Nodemailer:', error);
    throw error;
  }
}

// Função principal de envio de email que escolhe o método apropriado
export async function sendEmail(options: SendEmailOptions): Promise<any> {
  // Verificar ambiente
  if (isCloudflare) {
    // Em Cloudflare, tentar Sendgrid primeiro, depois Mailchannels
    if (hasSendgridConfig()) {
      return sendEmailSendgrid(options);
    } else {
      return sendEmailMailchannels(options);
    }
  } else {
    // Em ambiente de desenvolvimento, usar Nodemailer
    return sendEmailNodemailer(options);
  }
}