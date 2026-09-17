import { useState, useRef, useEffect, FormEvent } from 'react';
import { Brand } from '../../components/Brand';
import { IsoBadge } from '../../components/IsoBadge';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

let googleIdentityPromise: Promise<void> | null = null;
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
    if (!existing) { script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.dataset.googleIdentity = 'true'; document.head.appendChild(script); }
  });
  return googleIdentityPromise;
}

export function GoogleButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!GOOGLE_CLIENT_ID) return; let cancelled = false; ensureGoogleIdentityScript().then(() => { const google = (window as any).google; if (cancelled || !target.current) return; google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (response: { credential: string }) => onCredential(response.credential) }); google.accounts.id.renderButton(target.current, { theme: 'outline', size: 'large', width: 340, text: 'continue_with', shape: 'pill' }); }).catch(() => undefined); return () => { cancelled = true; }; }, [onCredential]);
  if (!GOOGLE_CLIENT_ID) return <p className="google-note">Google estará disponible al configurar el Client ID.</p>;
  return <div className="google-wrap" ref={target} />;
}

export function Welcome({ mode, setMode, notice, busy, submit, googleLogin }: any) {
  if (mode === 'welcome') return <main className="welcome-screen"><Brand large /><section className="welcome-stage"><div className="landing-art"><img src="/illustrations/login-community.png" alt="Estudiantes compartiendo ideas y aprendiendo juntos" /></div><p className="eyebrow centered">UNA RED PARA APRENDER</p><h1>Aprender es mejor <em>en compañía.</em></h1><p className="welcome-lead">Encuentra apoyo académico entre compañeros, comparte lo que sabes y avanza con confianza.</p><div className="welcome-actions"><button className="button button-primary" onClick={() => setMode('register')}>Crear mi cuenta <span>↗</span></button><button className="button button-secondary" onClick={() => setMode('login')}>Ya tengo una cuenta</button></div><GoogleButton onCredential={googleLogin} /></section><footer className="welcome-footer"><IsoBadge kind="book" /><span>Aprendizaje entre pares</span><span className="footer-divider" /><IsoBadge kind="network" /><span>Privacidad desde el diseño</span></footer></main>;
  const register = mode === 'register';
  const [showPassword, setShowPassword] = useState(false);
  return <main className="auth-screen"><button className="back-link" onClick={() => setMode('welcome')}>← Volver al inicio</button><div className="auth-layout"><section className="auth-visual"><Brand light /><img src="/illustrations/login-community.png" alt="Comunidad de estudiantes conectados" /><div><p className="eyebrow">APRENDER JUNTOS</p><h2>Tu próxima conexión puede cambiar cómo entiendes un tema.</h2></div></section><section className="auth-panel"><p className="eyebrow">ACCESO SEGURO</p><h1>{register ? 'Crea tu espacio' : mode === 'login' ? 'Qué bueno verte' : 'Recupera tu acceso'}</h1><p className="form-intro">{register ? 'Cuéntanos lo esencial. Tu perfil académico se completa después.' : mode === 'login' ? 'Continúa aprendiendo y compartiendo con tu comunidad.' : 'Te enviaremos instrucciones si encontramos tu cuenta.'}</p><form onSubmit={submit}>{register && <div className="field-grid"><label>Nombre o alias<input name="displayName" autoComplete="name" required /></label></div>}<label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>{mode !== 'recover' && <label>Contraseña<div className="password-input-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}><input name="password" type={showPassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} minLength={8} required style={{ width: '100%', paddingRight: '40px' }} /><button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', padding: '0', display: 'flex', color: 'var(--text-muted)' }} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{showPassword ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></> : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}</svg></button></div></label>}<button className="button button-primary full-width" disabled={busy}>{busy ? 'Procesando…' : register ? 'Crear cuenta' : mode === 'login' ? 'Iniciar sesión' : 'Enviar instrucciones'}</button></form>{mode !== 'recover' && <><div className="or-divider"><span>o continúa con</span></div><GoogleButton onCredential={googleLogin} /></>}{notice && <p className="inline-message" role="alert">{notice}</p>}{mode === 'login' && <button className="text-button" onClick={() => setMode('recover')}>¿Olvidaste tu contraseña?</button>}</section></div></main>;
}
