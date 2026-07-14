export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'modern' ? 'modern' : 'classic');
}
