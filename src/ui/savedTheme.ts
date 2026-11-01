const THEME_KEY = 'shvyd-settings-theme'

export type Theme = 'light' | 'dark' | 'auto'

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'auto'
}

/** The light, dark, or automatic look chosen on the settings page. */
export function readSavedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return isTheme(value) ? value : 'auto'
  } catch {
    return 'auto'
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Theme controls still work if the browser blocks local storage.
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}
