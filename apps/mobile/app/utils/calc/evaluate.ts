export type BinaryOperator = "+" | "-" | "*" | "/" | "^" | "mod"
export type PrefixOperator = "sqrt"
export type PostfixOperator = "percent" | "square"

type Token =
  | { type: "number"; value: number }
  | { type: "op"; value: BinaryOperator }
  | { type: "prefix"; value: PrefixOperator }
  | { type: "postfix"; value: PostfixOperator }
  | { type: "lparen" }
  | { type: "rparen" }

const ADDITIVE_PRECEDENCE = 1
const MULTIPLICATIVE_PRECEDENCE = 2
const PREFIX_PRECEDENCE = 3
const POWER_PRECEDENCE = 4

function isDigit(char: string) {
  return char >= "0" && char <= "9"
}

function endsOperand(token: Token) {
  return token.type === "number" || token.type === "rparen" || token.type === "postfix"
}

function startsOperand(token: Token) {
  return token.type === "number" || token.type === "lparen" || token.type === "prefix"
}

export function evaluateExpression(expression: string): string {
  const tokens = tokenize(expression)
  if (!tokens) return "Error"
  if (tokens.length === 0) return "0"

  const parser = new Parser(tokens)
  const value = parser.parseExpression()
  if (value === null || !parser.isComplete()) return "Error"
  return formatNumber(value)
}

function tokenize(expression: string): Token[] | null {
  const tokens: Token[] = []
  const source = expression.replace(/\s+/g, "")
  let index = 0

  while (index < source.length) {
    const next = readToken(source, index)
    if (!next) return null

    if (tokens.length > 0) {
      const previous = tokens[tokens.length - 1]
      if (endsOperand(previous) && startsOperand(next.token)) {
        tokens.push({ type: "op", value: "*" })
      }
    }

    tokens.push(next.token)
    index = next.nextIndex
  }

  return tokens
}

function readToken(source: string, startIndex: number): { token: Token; nextIndex: number } | null {
  const char = source[startIndex]

  if (isDigit(char) || char === ".") {
    const parsed = readNumber(source, startIndex)
    return parsed ? { token: { type: "number", value: parsed.value }, nextIndex: parsed.nextIndex } : null
  }

  if (char === "(") return { token: { type: "lparen" }, nextIndex: startIndex + 1 }
  if (char === ")") return { token: { type: "rparen" }, nextIndex: startIndex + 1 }
  if (char === "%") return { token: { type: "postfix", value: "percent" }, nextIndex: startIndex + 1 }
  if (char === "²") return { token: { type: "postfix", value: "square" }, nextIndex: startIndex + 1 }
  if (char === "√") return { token: { type: "prefix", value: "sqrt" }, nextIndex: startIndex + 1 }
  if (char === "+") return { token: { type: "op", value: "+" }, nextIndex: startIndex + 1 }
  if (char === "-" || char === "−") return { token: { type: "op", value: "-" }, nextIndex: startIndex + 1 }
  if (char === "*" || char === "×") return { token: { type: "op", value: "*" }, nextIndex: startIndex + 1 }
  if (char === "/" || char === "÷") return { token: { type: "op", value: "/" }, nextIndex: startIndex + 1 }
  if (char === "^") return { token: { type: "op", value: "^" }, nextIndex: startIndex + 1 }

  if (source.startsWith("mod", startIndex)) {
    return { token: { type: "op", value: "mod" }, nextIndex: startIndex + 3 }
  }

  return null
}

type ParsedNumber = { value: number; nextIndex: number }

function readNumber(source: string, startIndex: number): ParsedNumber | null {
  let index = startIndex
  let hasDot = false
  let hasDigit = false

  while (index < source.length) {
    const char = source[index]
    if (isDigit(char)) {
      hasDigit = true
      index += 1
      continue
    }
    if (char === ".") {
      if (hasDot) return null
      hasDot = true
      index += 1
      continue
    }
    break
  }

  if (!hasDigit) return null

  const value = Number(source.slice(startIndex, index))
  if (!Number.isFinite(value)) return null

  return { value, nextIndex: index }
}

class Parser {
  private readonly tokens: Token[]
  private index = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  parseExpression(minPrecedence = 0): number | null {
    let left = this.parsePrefix()
    if (left === null) return null

    while (true) {
      const postfix = this.peek()
      if (postfix?.type === "postfix") {
        this.index += 1
        left = applyPostfix(postfix.value, left)
        if (left === null) return null
        continue
      }

      const token = this.peek()
      if (token?.type !== "op") break

      const precedence = getBinaryPrecedence(token.value)
      if (precedence < minPrecedence) break

      this.index += 1
      const nextMinPrecedence = token.value === "^" ? precedence : precedence + 1
      const right = this.parseExpression(nextMinPrecedence)
      if (right === null) return null

      left = applyBinary(token.value, left, right)
      if (left === null) return null
    }

    return left
  }

  isComplete() {
    return this.index >= this.tokens.length
  }

  private parsePrefix(): number | null {
    const token = this.peek()
    if (!token) return null

    if (token.type === "op" && (token.value === "+" || token.value === "-")) {
      this.index += 1
      const value = this.parseExpression(PREFIX_PRECEDENCE)
      if (value === null) return null
      return token.value === "-" ? -value : value
    }

    if (token.type === "prefix") {
      this.index += 1
      const value = this.parseExpression(PREFIX_PRECEDENCE)
      if (value === null) return null
      return applyPrefix(token.value, value)
    }

    if (token.type === "number") {
      this.index += 1
      return token.value
    }

    if (token.type === "lparen") {
      this.index += 1
      const value = this.parseExpression()
      if (value === null) return null
      if (this.peek()?.type !== "rparen") return null
      this.index += 1
      return value
    }

    return null
  }

  private peek() {
    return this.tokens[this.index] ?? null
  }
}

function getBinaryPrecedence(operator: BinaryOperator) {
  switch (operator) {
    case "+":
    case "-":
      return ADDITIVE_PRECEDENCE
    case "*":
    case "/":
    case "mod":
      return MULTIPLICATIVE_PRECEDENCE
    case "^":
      return POWER_PRECEDENCE
  }
}

function applyBinary(operator: BinaryOperator, left: number, right: number): number | null {
  switch (operator) {
    case "+":
      return left + right
    case "-":
      return left - right
    case "*":
      return left * right
    case "/":
      return right === 0 ? null : left / right
    case "mod":
      return right === 0 ? null : left % right
    case "^": {
      const result = left ** right
      return Number.isFinite(result) ? result : null
    }
  }
}

function applyPrefix(operator: PrefixOperator, value: number): number | null {
  switch (operator) {
    case "sqrt":
      if (value < 0) return null
      return Math.sqrt(value)
  }
}

function applyPostfix(operator: PostfixOperator, value: number): number | null {
  switch (operator) {
    case "percent":
      return value / 100
    case "square": {
      const result = value * value
      return Number.isFinite(result) ? result : null
    }
  }
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "Error"

  const rounded = Number(value.toPrecision(12))
  if (!Number.isFinite(rounded)) return "Error"
  if (Math.abs(rounded) < 1e-12 || Object.is(rounded, -0)) return "0"

  const text = rounded.toString()
  return text === "-0" ? "0" : text
}
