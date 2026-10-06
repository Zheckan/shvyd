export function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {}

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, '')
    const match = /^([A-Z_][A-Z_0-9]*)\s*=\s*(.*)$/.exec(line)
    if (!match?.[1] || match[2] === undefined) {
      continue
    }

    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    } else {
      value = value.replace(/\s+#.*$/, '').trim()
    }

    values[match[1]] = value
  }

  return values
}
