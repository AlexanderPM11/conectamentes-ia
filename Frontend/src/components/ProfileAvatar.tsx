import { useState, useEffect } from 'react';
import { API } from '../shared/api/client';
import { initials } from '../utils/string';

export function ProfileAvatar({ userId, name, version, className = 'profile-avatar' }: { userId?: string; name?: string; version?: string; className?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (!userId) { setSrc(''); return; }
    let active = true;
    let objectUrl = '';
    const token = localStorage.getItem('conectamente_token');
    fetch(`${API}/api/usuarios/${userId}/avatar?v=${encodeURIComponent(version ?? Date.now().toString())}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(response => response.ok ? response.blob() : null)
      .then(blob => { if (!active || !blob) return; objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); })
      .catch(() => undefined);
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [userId, version]);
  return src ? <img className={className} src={src} alt={`Foto de ${name ?? 'perfil'}`} /> : <span className={`${className} avatar-fallback`}>{initials(name)}</span>;
}
