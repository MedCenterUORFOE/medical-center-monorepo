import { Resend } from 'resend';

// Safe fallback for Next.js CI/CD build step
const resendApiKey = process.env.RESEND_API_KEY || 're_dummy_key_for_build_step';
export const resend = new Resend(resendApiKey);