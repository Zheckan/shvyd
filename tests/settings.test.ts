import { expect, test } from "bun:test";
import { createSettingsStore } from "../src/settings-store";
import { DEFAULT_SETTINGS } from "../src/settings";

test("remembers the last target across restarts without exposing credentials to the popup", async () => {
  let persisted: unknown;
  const storage = {
    read: async () => persisted,
    write: async (value: unknown) => { persisted = structuredClone(value); },
    seed: async () => ({ ...DEFAULT_SETTINGS, azure: { key: "private-key", region: "" } }),
  };
  const first = createSettingsStore(storage);
  expect(await first.preferences()).toMatchObject({ target: "uk", provider: "azure", adaptToPage: true });
  await first.updatePreferences({ target: "pl" });
  const restarted = createSettingsStore(storage);
  expect(await restarted.preferences()).toMatchObject({ target: "pl", provider: "azure", adaptToPage: true });
  expect((await restarted.settings()).azure.key).toBe("private-key");
});

test("remembers preferred languages and whether additional languages are shown", async () => {
  let persisted: unknown;
  const storage = {
    read: async () => persisted,
    write: async (value: unknown) => { persisted = structuredClone(value); },
    seed: async () => structuredClone(DEFAULT_SETTINGS),
  };
  const first = createSettingsStore(storage);
  await first.updatePreferences({ favoriteLanguages: ["uk", "ko", "ar"], showOtherLanguages: false });
  const restarted = createSettingsStore(storage);
  expect(await restarted.preferences()).toMatchObject({
    favoriteLanguages: ["uk", "ko", "ar"], showOtherLanguages: false,
  });
});
