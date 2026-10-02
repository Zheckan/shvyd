import { isRecord, parsePreferences, type Preferences } from "./settings";
import { parseTranslation, TranslationError, type Translation, type TranslationRequest } from "./translation";

export interface TranslationClient {
  preferences(): Promise<Preferences>;
  updatePreferences(value: Partial<Preferences>): Promise<Preferences>;
  translate(value: TranslationRequest): Promise<Translation>;
  openSettings(): Promise<void>;
}

export async function unwrapResponse(value: unknown): Promise<unknown> {
  if (!isRecord(value) || typeof value.ok !== "boolean") throw new Error("Shvyd could not connect. Reload this page and try again.");
  if (!value.ok) {
    const message = typeof value.message === "string" ? value.message : "Translation could not finish. Try again.";
    if (value.code === "selection" || value.code === "configuration" || value.code === "authentication"
      || value.code === "quota" || value.code === "network" || value.code === "provider") {
      throw new TranslationError(value.code, message);
    }
    throw new Error(message);
  }
  return value.data;
}

export function createClient(call: (request: unknown) => Promise<unknown>): TranslationClient {
  const send = async (request: unknown) => unwrapResponse(await call(request));
  return {
    preferences: async () => parsePreferences(await send({ kind: "preferences" })),
    updatePreferences: async value => parsePreferences(await send({ kind: "update-preferences", value })),
    translate: async value => parseTranslation(await send({ kind: "translate", ...value })),
    openSettings: async () => { await send({ kind: "open-settings" }); },
  };
}
