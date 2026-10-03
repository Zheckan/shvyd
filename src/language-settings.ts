import { LANGUAGES, languageTitle, supportedLanguages, supportsLanguage, type Language, type Provider } from "./languages";
import { DEFAULT_SETTINGS, initialTarget, parsePreferences, publicPreferences, type Preferences } from "./settings";

export function mountLanguageSettings(container: HTMLElement) {
  container.innerHTML = `
    <div class="row language-mode-row">
      <label>Starting language<select name="targetMode"><option value="last">Remember last used</option><option value="fixed">Always use a default</option></select></label>
      <label><span class="target-label">Translate to</span><select name="target"></select></label>
    </div>
    <p class="hint target-mode-hint"></p>
    <h3>Your preferred languages</h3>
    <p class="hint">These appear first in the popup. Search by name or language code. Choices for other providers stay saved.</p>
    <div class="preferred-chips" aria-label="Chosen languages"></div>
    <label>Find languages<input class="favorite-search" type="search" placeholder="Search languages" aria-label="Search preferred languages"></label>
    <div class="favorite-list" role="group" aria-label="Choose preferred languages"></div>
    <label class="toggle"><input name="showOtherLanguages" type="checkbox"><span>Show “More languages” in the popup<small>Keep access to the full list alongside your preferred languages.</small></span></label>
  `;
  function required<T extends Element>(selector: string, constructor: { new(...args: never[]): T }): T {
    const element = container.querySelector(selector);
    if (!(element instanceof constructor)) throw new Error("Language settings could not load.");
    return element;
  }
  const mode = required("[name=targetMode]", HTMLSelectElement);
  const target = required("[name=target]", HTMLSelectElement);
  const showOther = required("[name=showOtherLanguages]", HTMLInputElement);
  const search = required(".favorite-search", HTMLInputElement);
  const list = required(".favorite-list", HTMLDivElement);
  const chips = required(".preferred-chips", HTMLDivElement);
  const hint = required(".target-mode-hint", HTMLParagraphElement);
  const targetLabel = required(".target-label", HTMLSpanElement);
  let preferences: Preferences = publicPreferences(DEFAULT_SETTINGS);
  let favorites: Language[] = [];

  function renderTarget(): void {
    target.replaceChildren(...supportedLanguages(preferences.provider).map(language => {
      const option = document.createElement("option");
      option.value = language.code; option.textContent = languageTitle(language.code); return option;
    }));
    target.value = initialTarget(preferences);
    targetLabel.textContent = preferences.targetMode === "fixed" ? "Default language" : "Last used language";
    hint.textContent = preferences.targetMode === "fixed"
      ? "Every new popup starts with this default. A change inside the popup lasts until you close it."
      : "The popup remembers the last language you translated to.";
  }
  function choose(code: Language, selected: boolean): void {
    favorites = selected ? [...favorites, code] : favorites.filter(value => value !== code);
    favorites = [...new Set(favorites)];
    renderFavorites();
  }
  function renderFavorites(): void {
    chips.replaceChildren(...favorites.map(code => {
      const chip = document.createElement("button"); chip.type = "button"; chip.className = "language-chip";
      chip.textContent = `${languageTitle(code)} ×`;
      chip.setAttribute("aria-label", `Remove ${languageTitle(code)} from preferred languages`);
      chip.addEventListener("click", () => choose(code, false)); return chip;
    }));
    const query = search.value.trim().toLocaleLowerCase();
    const matches = LANGUAGES.filter(language => `${language.name} ${language.label} ${language.code}`.toLocaleLowerCase().includes(query));
    list.replaceChildren(...matches.map(language => {
      const label = document.createElement("label"); label.className = "favorite-choice";
      const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.value = language.code;
      checkbox.checked = favorites.includes(language.code);
      const text = document.createElement("span"); text.textContent = languageTitle(language.code);
      if (!supportsLanguage(language.code, preferences.provider)) {
        const note = document.createElement("small"); note.textContent = "Available with the other provider"; text.append(note);
      }
      checkbox.addEventListener("change", () => choose(language.code, checkbox.checked));
      label.append(checkbox, text); return label;
    }));
    if (!matches.length) list.textContent = "No matching languages.";
  }
  function syncTarget(): void {
    if (preferences.targetMode === "fixed") preferences.defaultTarget = target.value;
    else preferences.target = target.value;
  }
  function fill(value: Preferences): void {
    preferences = structuredClone(value); favorites = [...value.favoriteLanguages];
    mode.value = value.targetMode; showOther.checked = value.showOtherLanguages;
    renderTarget(); renderFavorites();
  }
  mode.addEventListener("change", () => {
    syncTarget();
    preferences.targetMode = mode.value === "fixed" ? "fixed" : "last";
    renderTarget();
  });
  target.addEventListener("change", syncTarget);
  search.addEventListener("input", renderFavorites);
  fill(preferences);
  return {
    fill,
    read(): Preferences {
      syncTarget();
      return parsePreferences({ ...preferences, favoriteLanguages: favorites, showOtherLanguages: showOther.checked });
    },
    setProvider(provider: Provider): void {
      syncTarget();
      preferences = parsePreferences({ ...preferences, provider, favoriteLanguages: favorites.length ? favorites : preferences.favoriteLanguages });
      renderTarget(); renderFavorites();
    },
  };
}
