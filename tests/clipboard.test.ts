import { expect, test } from "bun:test";
import { copyTranslation } from "../src/clipboard";

test("offers manual copying when the browser has no clipboard API", async () => {
  expect(await copyTranslation({ text: "Привіт", clipboard: undefined })).toBe("manual");
});

test("offers manual copying when browser permission is denied", async () => {
  const clipboard = { writeText: async () => { throw new DOMException("Permission denied", "NotAllowedError"); } };
  expect(await copyTranslation({ text: "Привіт", clipboard })).toBe("manual");
});
