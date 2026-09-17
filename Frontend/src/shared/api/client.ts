const API = import.meta.env.VITE_API_URL || '';

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('conectamente_token');
  const isForm = options.body instanceof FormData;
  const response = await fetch(API + path, {
    cache: 'no-store',
    ...options,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    let detail = '';
    try {
      const problem = await response.json();
      detail = problem.detail ?? problem.message ?? Object.values(problem.errors ?? {}).flat().find(Boolean) ?? '';
    } catch {
      // La respuesta puede no incluir JSON.
    }
    throw new Error(response.status === 401 ? 'Tu sesión ha expirado.' : String(detail || 'No pudimos completar esta acción.'));
  }

  return (response.status === 204 ? null : await response.json()) as T;
}

export { API };
