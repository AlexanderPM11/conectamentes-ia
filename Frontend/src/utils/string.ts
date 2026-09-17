export function initials(name?: string) {
  return (name || 'CM').split(' ').slice(0, 2).map(part => part[0]).join('').toUpperCase();
}
