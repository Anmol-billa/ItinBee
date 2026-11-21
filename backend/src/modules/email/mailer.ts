import nodemailer from 'nodemailer';
import { expandHostToOrigins, type AppEnv } from '../../config/env.js';

export function resolvePublicFrontendUrl(config: AppEnv): string {
  const appPub = config.APP_PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (
    appPub &&
    !(config.NODE_ENV === 'production' && appPub.startsWith('http://localhost'))
  ) {
    return appPub;
  }
  const fromHost = expandHostToOrigins(config.FRONTEND_HOST);
  if (fromHost.length > 0) {
    const preferred =
      fromHost.find((o) => o.includes('.onrender.com')) ?? fromHost[0]!;
    return preferred;
  }
  return appPub || 'http://localhost:3000';
}

export function isResendConfigured(config: AppEnv): boolean {
  return Boolean(config.RESEND_API_KEY?.trim());
}

export function isSmtpConfigured(config: AppEnv): boolean {
  return Boolean(
    config.SMTP_HOST?.trim() &&
      config.SMTP_USER?.trim() &&
      config.SMTP_PASS?.trim()
  );
}

export function isEmailConfigured(config: AppEnv): boolean {
  return isResendConfigured(config) || isSmtpConfigured(config);
}

async function sendViaResend(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  config: AppEnv;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const apiKey = params.config.RESEND_API_KEY?.trim();
  if (!apiKey) return false;
  const fetchFn = params.fetchImpl ?? fetch;
  try {
    const res = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: params.config.RESEND_FROM_EMAIL || 'Itinbee <onboarding@resend.dev>',
        to: [params.to],
        subject: params.subject,
        text: params.text,
        ...(params.html ? { html: params.html } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendViaSmtp(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  config: AppEnv;
}): Promise<boolean> {
  if (!isSmtpConfigured(params.config)) return false;
  try {
    const transporter = nodemailer.createTransport({
      host: params.config.SMTP_HOST!.trim(),
      port: params.config.SMTP_PORT ?? 587,
      secure: Boolean(params.config.SMTP_SECURE || params.config.SMTP_PORT === 465),
      auth: {
        user: params.config.SMTP_USER!.trim(),
        pass: params.config.SMTP_PASS!.trim(),
      },
      connectionTimeout: 10_000,
      socketTimeout: 10_000,
    });

    await transporter.sendMail({
      from:
        params.config.SMTP_FROM?.trim() ||
        `Itinbee <${params.config.SMTP_USER!.trim()}>`,
      to: params.to,
      subject: params.subject,
      text: params.text,
      ...(params.html ? { html: params.html } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

export interface SendMagicLinkResult {
  sent: boolean;
  provider: 'resend' | 'smtp' | 'dev_preview';
  errorCode?: 'email_unconfigured' | 'delivery_failed';
  message?: string;
}

export async function sendMagicLinkEmail(params: {
  to: string;
  code: string;
  verifyUrl: string;
  config: AppEnv;
  fetchImpl?: typeof fetch;
}): Promise<SendMagicLinkResult> {
  const { to, code, verifyUrl, config, fetchImpl } = params;
  const isProd = config.NODE_ENV === 'production';

  const subject = `${code} is your Itinbee sign-in code`;
  const text =
    `Your Itinbee sign-in code is ${code}.\n\n` +
    `Or click to sign in directly:\n${verifyUrl}\n\n` +
    `This code expires in 10 minutes.`;

  if (isResendConfigured(config)) {
    const ok = await sendViaResend({
      to,
      subject,
      text,
      config,
      fetchImpl,
    });
    if (ok) {
      return { sent: true, provider: 'resend' };
    }
    if (isSmtpConfigured(config)) {
      const smtpOk = await sendViaSmtp({ to, subject, text, config });
      if (smtpOk) return { sent: true, provider: 'smtp' };
    }
    if (isProd) {
      return {
        sent: false,
        provider: 'resend',
        errorCode: 'delivery_failed',
        message: 'Could not send sign-in email',
      };
    }
    return { sent: true, provider: 'dev_preview' };
  }

  if (isSmtpConfigured(config)) {
    const ok = await sendViaSmtp({ to, subject, text, config });
    if (ok) {
      return { sent: true, provider: 'smtp' };
    }
    if (isProd) {
      return {
        sent: false,
        provider: 'smtp',
        errorCode: 'delivery_failed',
        message: 'Could not send sign-in email',
      };
    }
    return { sent: true, provider: 'dev_preview' };
  }

  if (isProd) {
    return {
      sent: false,
      provider: 'dev_preview',
      errorCode: 'email_unconfigured',
      message:
        'Email sign-in is not configured yet. Configure SMTP or Resend credentials.',
    };
  }

  return { sent: true, provider: 'dev_preview' };
}

export async function sendTripInviteEmail(params: {
  to: string;
  inviterName: string;
  tripTitle: string;
  role: string;
  inviteUrl: string;
  config: AppEnv;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const { to, inviterName, tripTitle, role, inviteUrl, config, fetchImpl } = params;
  const subject = `${inviterName} invited you to collaborate on "${tripTitle}" (Itinbee)`;
  const text =
    `${inviterName} invited you as ${role} on "${tripTitle}" on Itinbee.\n\n` +
    `Open your invite link (valid for 7 days):\n${inviteUrl}\n`;

  if (isResendConfigured(config)) {
    const ok = await sendViaResend({ to, subject, text, config, fetchImpl });
    if (ok) return true;
  }
  if (isSmtpConfigured(config)) {
    return sendViaSmtp({ to, subject, text, config });
  }
  return false;
}
