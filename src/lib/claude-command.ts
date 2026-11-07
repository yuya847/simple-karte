/** Only a complete command at the start of a single note line is executable. */
export function claudeCommand(line: string): string | null {
  const match = line.match(/^[\/／]claude[ \t　]+([^\r\n]*)$/i);
  return match?.[1].trim() || null;
}

export function isClaudeLine(line: string): boolean {
  return /^[\/／]claude(?:[ \t　]|$)/i.test(line);
}

/** Remove the command line without inserting a newline. */
export function removeClaudeLine(text: string, index: number): string {
  return text.split("\n").filter((_, i) => i !== index).join("\n");
}
