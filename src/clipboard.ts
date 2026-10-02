export async function copyTranslation({ text, clipboard }: {
  text: string;
  clipboard: Pick<Clipboard, "writeText"> | undefined;
}): Promise<"copied" | "manual"> {
  if (!clipboard) return "manual";
  try {
    await clipboard.writeText(text);
    return "copied";
  } catch { return "manual"; }
}
