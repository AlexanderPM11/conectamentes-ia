import { IconName } from '../types';

export function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    home: 'M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6',
    profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0',
    request: 'M6 4h12v16H6zM9 8h6M9 12h6M9 16h3',
    tutor: 'M12 3a8 8 0 0 0-8 8v4a3 3 0 0 0 3 3h2v-6H6v-1a6 6 0 0 1 12 0v1h-3v6h2a3 3 0 0 0 3-3v-4a8 8 0 0 0-8-8Zm-2 18h4',
    match: 'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 0a4 4 0 1 0 0-8M2 20a6 6 0 0 1 12 0m-2-3a6 6 0 0 1 10 3',
    message: 'M4 5h16v11H8l-4 4V5Zm4 5h8m-8 3h5',
    bell: 'M6 17h12l-2-3V9a4 4 0 0 0-8 0v5l-2 3Zm4 3h4',
    search: 'm21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
    calendar: 'M4 7h16v13H4zM8 3v4m8-4v4M4 11h16m-5 3-3 3-2-2',
    shield: 'M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Zm-3 9 2 2 4-4',
    chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
    star: 'm12 3 2.7 5.47 6.03.88-4.36 4.25 1.03 6-5.4-2.84-5.4 2.84 1.03-6-4.36-4.25 6.03-.88L12 3Z',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    back: 'M19 12H5m7 7-7-7 7-7'
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
