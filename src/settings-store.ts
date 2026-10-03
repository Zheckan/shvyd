import { DEFAULT_SETTINGS, isRecord, parseSettings, publicPreferences, type Settings } from "./settings";

export function createSettingsStore(storage: {
  read: () => Promise<unknown>;
  write: (settings: Settings) => Promise<void>;
  seed: () => Promise<unknown>;
}) {
  let current = structuredClone(DEFAULT_SETTINGS);
  let queue = Promise.resolve();
  const ready = (async () => {
    const persisted = await storage.read();
    if (persisted !== undefined) {
      current = parseSettings(persisted);
    } else {
      current = parseSettings(await storage.seed());
      await storage.write(current);
    }
  })();

  async function settings(): Promise<Settings> {
    await ready;
    await queue;
    return structuredClone(current);
  }

  function update(change: (current: Settings) => Settings): Promise<Settings> {
    const operation = queue.then(async () => {
      await ready;
      const next = change(structuredClone(current));
      await storage.write(next);
      current = next;
      return structuredClone(current);
    });
    queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  return {
    settings,
    preferences: async () => publicPreferences(await settings()),
    save: (value: unknown) => update(() => parseSettings(value)),
    updatePreferences: async (value: unknown) => {
      if (!isRecord(value)) throw new Error("Invalid preferences.");
      return publicPreferences(await update(current => parseSettings({
        ...current,
        provider: value.provider ?? current.provider,
        target: value.target ?? current.target,
        adaptToPage: value.adaptToPage ?? current.adaptToPage,
        favoriteLanguages: value.favoriteLanguages ?? current.favoriteLanguages,
        showOtherLanguages: value.showOtherLanguages ?? current.showOtherLanguages,
        targetMode: value.targetMode ?? current.targetMode,
        defaultTarget: value.defaultTarget ?? current.defaultTarget,
      })));
    },
  };
}
