let googleIdentityPromise: Promise<void> | null = null;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

export function ensureGoogleIdentityScript() {
  if ((window as any).google?.accounts) return Promise.resolve();
  if (googleIdentityPromise) return googleIdentityPromise;
  googleIdentityPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity]');
    const script = existing ?? document.createElement('script');
    const loaded = () => resolve();
    const failed = () => reject(new Error('No pudimos conectar con Google.'));
    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', failed, { once: true });
    if (!existing) { 
      script.src = 'https://accounts.google.com/gsi/client'; 
      script.async = true; 
      script.dataset.googleIdentity = 'true'; 
      document.head.appendChild(script); 
    }
  });
  return googleIdentityPromise;
}

export async function requestGoogleCalendarAccess() {
  if (!GOOGLE_CLIENT_ID) throw new Error('Configura el Client ID de Google para crear reuniones.');
  await ensureGoogleIdentityScript();
  return new Promise<string>((resolve, reject) => {
    const google = (window as any).google;
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/calendar.events',
      callback: (response: any) => response?.access_token ? resolve(response.access_token) : reject(new Error(response?.error_description || 'No autorizaste el acceso a Google Calendar.')),
      error_callback: () => reject(new Error('Se cerró la autorización de Google Calendar.'))
    });
    client.requestAccessToken({ prompt: 'consent' });
  });
}
