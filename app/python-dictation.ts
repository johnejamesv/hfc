type TokenKind = "word" | "binaryOperator" | "comma" | "colon" | "dot" | "openingDelimiter" | "closingDelimiter" | "newLine" | "indent" | "dedent";

interface DictationToken {
  readonly kind: TokenKind;
  readonly text: string;
}

interface SpokenToken {
  readonly spoken: readonly string[];
  readonly token: DictationToken;
}

const spokenTokens: readonly SpokenToken[] = [
  { spoken: ["less", "than", "or", "equal"], token: { kind: "binaryOperator", text: "<=" } },
  { spoken: ["greater", "than", "or", "equal"], token: { kind: "binaryOperator", text: ">=" } },
  { spoken: ["double", "equals"], token: { kind: "binaryOperator", text: "==" } },
  { spoken: ["not", "equals"], token: { kind: "binaryOperator", text: "!=" } },
  { spoken: ["less", "than"], token: { kind: "binaryOperator", text: "<" } },
  { spoken: ["greater", "than"], token: { kind: "binaryOperator", text: ">" } },
  { spoken: ["divided", "by"], token: { kind: "binaryOperator", text: "/" } },
  { spoken: ["open", "paren"], token: { kind: "openingDelimiter", text: "(" } },
  { spoken: ["close", "paren"], token: { kind: "closingDelimiter", text: ")" } },
  { spoken: ["open", "bracket"], token: { kind: "openingDelimiter", text: "[" } },
  { spoken: ["close", "bracket"], token: { kind: "closingDelimiter", text: "]" } },
  { spoken: ["open", "brace"], token: { kind: "openingDelimiter", text: "{" } },
  { spoken: ["close", "brace"], token: { kind: "closingDelimiter", text: "}" } },
  { spoken: ["new", "line"], token: { kind: "newLine", text: "" } },
  { spoken: ["equals"], token: { kind: "binaryOperator", text: "=" } },
  { spoken: ["plus"], token: { kind: "binaryOperator", text: "+" } },
  { spoken: ["minus"], token: { kind: "binaryOperator", text: "-" } },
  { spoken: ["times"], token: { kind: "binaryOperator", text: "*" } },
  { spoken: ["modulo"], token: { kind: "binaryOperator", text: "%" } },
  { spoken: ["colon"], token: { kind: "colon", text: ":" } },
  { spoken: ["comma"], token: { kind: "comma", text: "," } },
  { spoken: ["dot"], token: { kind: "dot", text: "." } },
  { spoken: ["indent"], token: { kind: "indent", text: "" } },
  { spoken: ["dedent"], token: { kind: "dedent", text: "" } },
  { spoken: ["true"], token: { kind: "word", text: "True" } },
  { spoken: ["false"], token: { kind: "word", text: "False" } },
  { spoken: ["none"], token: { kind: "word", text: "None" } },
  ...["def", "return", "for", "while", "if", "elif", "else", "in", "range", "enumerate"].map((word) => ({
    spoken: [word],
    token: { kind: "word" as const, text: word },
  })),
];

const keywordsBeforeOpeningDelimiter = new Set(["def", "return", "for", "while", "if", "elif", "else", "in"]);

/**
 * Converts the documented literal-dictation vocabulary into predictable Python text. Unknown
 * words are deliberately emitted unchanged so this function never invents identifiers or logic.
 */
export function normalizePythonDictation(content: string, baseIndentation = ""): string {
  const tokens = tokenize(content);
  const lines: string[] = [];
  let line = "";
  let previous: DictationToken | undefined;
  let indentationLevel = 0;
  let lineIndentationLevel = 0;

  const finishLine = () => {
    lines.push(`${baseIndentation}${"    ".repeat(lineIndentationLevel)}${line.trimEnd()}`);
    line = "";
    previous = undefined;
    lineIndentationLevel = indentationLevel;
  };

  for (const token of tokens) {
    if (token.kind === "newLine") {
      finishLine();
      continue;
    }
    if (token.kind === "indent") {
      indentationLevel += 1;
      if (line === "") lineIndentationLevel = indentationLevel;
      continue;
    }
    if (token.kind === "dedent") {
      indentationLevel = Math.max(0, indentationLevel - 1);
      if (line === "") lineIndentationLevel = indentationLevel;
      continue;
    }

    line = appendToken(line, previous, token);
    previous = token;
  }

  if (tokens.length === 0) return "";
  finishLine();
  return lines.join("\n");
}

function tokenize(content: string): DictationToken[] {
  const words = content.match(/\S+/g) ?? [];
  const lowerWords = words.map((word) => word.toLowerCase());
  const tokens: DictationToken[] = [];

  for (let index = 0; index < words.length;) {
    const known = spokenTokens.find(({ spoken }) => spoken.every((word, offset) => lowerWords[index + offset] === word));
    if (known) {
      tokens.push(known.token);
      index += known.spoken.length;
      continue;
    }
    tokens.push({ kind: "word", text: words[index] });
    index += 1;
  }
  return tokens;
}

function appendToken(line: string, previous: DictationToken | undefined, token: DictationToken): string {
  if (token.kind === "binaryOperator") {
    return `${line.trimEnd()}${line.trimEnd() ? " " : ""}${token.text} `;
  }

  if (token.kind === "comma" || token.kind === "colon" || token.kind === "dot" || token.kind === "closingDelimiter") {
    return `${line.trimEnd()}${token.text}`;
  }

  if (line && needsSpaceBefore(previous, token)) return `${line} ${token.text}`;
  return `${line}${token.text}`;
}

function needsSpaceBefore(previous: DictationToken | undefined, token: DictationToken): boolean {
  if (!previous || previous.kind === "openingDelimiter" || previous.kind === "dot" || previous.kind === "binaryOperator") return false;
  if (token.kind === "openingDelimiter") {
    return previous.kind === "comma" || previous.kind === "colon" || (previous.kind === "word" && keywordsBeforeOpeningDelimiter.has(previous.text));
  }
  return true;
}
