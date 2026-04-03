type AngleMode = "rad" | "deg"

type Token =
  | { type: "number"; raw: string; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "^" | "root" }
  | { type: "postfix"; value: "!" | "%" }
  | { type: "lparen" }
  | { type: "rparen" }

type OperatorValue = Extract<Token, { type: "operator" }>["value"]

const ADDITIVE_PRECEDENCE = 1
const MULTIPLICATIVE_PRECEDENCE = 2
const PREFIX_PRECEDENCE = 3
const POWER_PRECEDENCE = 4

const functionLabels: Record<string, string> = {
  percent: "%",
  square: "x²",
  cube: "x³",
  sqrt: "²√",
  cbrt: "³√",
  inv: "1/x",
  exp: "eˣ",
  tenpow: "10ˣ",
  ln: "ln",
  log10: "log10",
  fact: "x!",
  sin: "sin",
  cos: "cos",
  tan: "tan",
  asin: "asin",
  acos: "acos",
  atan: "atan",
  sinh: "sinh",
  cosh: "cosh",
  tanh: "tanh",
  asinh: "asinh",
  acosh: "acosh",
  atanh: "atanh",
}

export function evaluateScientificExpression(
  expression: string,
  options: { angleMode: AngleMode },
): string {
  const tokens = tokenize(expression)
  if (!tokens) return "Error"
  if (tokens.length === 0) return "0"

  const parser = new Parser(tokens, options.angleMode)
  const value = parser.parseExpression()
  if (value === null || !parser.isComplete()) return "Error"

  return formatComputedNumber(value)
}

export function formatHeroValue(value: string) {
  if (value === "Error") return value
  return formatNumericString(value, true)
}

export function formatExpressionParts(expression: string) {
  const tokens = tokenize(expression)
  if (!tokens) {
    return [{ value: expression, isOperator: false }]
  }

  return tokens.map((token) => {
    switch (token.type) {
      case "number":
        return { value: formatNumericString(token.raw, false), isOperator: false }
      case "identifier":
        return {
          value: token.value === "pi" ? "π" : functionLabels[token.value] ?? token.value,
          isOperator: false,
        }
      case "operator":
        return {
          value:
            token.value === "*"
              ? "×"
              : token.value === "/"
                ? "÷"
                : token.value === "-"
                  ? "−"
                  : token.value === "root"
                    ? "ʸ√"
                    : token.value,
          isOperator: true,
        }
      case "postfix":
        return { value: token.value, isOperator: false }
      case "lparen":
        return { value: "(", isOperator: false }
      case "rparen":
        return { value: ")", isOperator: false }
    }
  })
}

function tokenize(source: string): Token[] | null {
  const tokens: Token[] = []
  let index = 0

  while (index < source.length) {
    const char = source[index]

    if (/\s/.test(char)) {
      index += 1
      continue
    }

    const numberMatch = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d+)?/)
    if (numberMatch) {
      const raw = numberMatch[0]
      const value = Number(raw)
      if (!Number.isFinite(value)) return null
      tokens.push({ type: "number", raw, value })
      index += raw.length
      continue
    }

    if (char === "(") {
      tokens.push({ type: "lparen" })
      index += 1
      continue
    }

    if (char === ")") {
      tokens.push({ type: "rparen" })
      index += 1
      continue
    }

    if (char === "!" || char === "%") {
      tokens.push({ type: "postfix", value: char })
      index += 1
      continue
    }

    if (char === "+" || char === "-" || char === "−") {
      tokens.push({ type: "operator", value: char === "+" ? "+" : "-" })
      index += 1
      continue
    }

    if (char === "*" || char === "×") {
      tokens.push({ type: "operator", value: "*" })
      index += 1
      continue
    }

    if (char === "/" || char === "÷") {
      tokens.push({ type: "operator", value: "/" })
      index += 1
      continue
    }

    if (char === "^") {
      tokens.push({ type: "operator", value: "^" })
      index += 1
      continue
    }

    if (char === "π") {
      tokens.push({ type: "identifier", value: "pi" })
      index += 1
      continue
    }

    const identifierMatch = source.slice(index).match(/^[A-Za-z][A-Za-z0-9]*/)
    if (identifierMatch) {
      const value = identifierMatch[0]
      if (value === "root") {
        tokens.push({ type: "operator", value: "root" })
      } else {
        tokens.push({ type: "identifier", value })
      }
      index += value.length
      continue
    }

    return null
  }

  return tokens
}

class Parser {
  private index = 0

  constructor(
    private readonly tokens: Token[],
    private readonly angleMode: AngleMode,
  ) {}

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
      if (token?.type !== "operator") break

      const precedence = getBinaryPrecedence(token.value)
      if (precedence < minPrecedence) break

      this.index += 1
      const nextMinPrecedence = token.value === "^" || token.value === "root" ? precedence : precedence + 1
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

    if (token.type === "operator" && (token.value === "+" || token.value === "-")) {
      this.index += 1
      const value = this.parseExpression(PREFIX_PRECEDENCE)
      if (value === null) return null
      return token.value === "-" ? -value : value
    }

    if (token.type === "number") {
      this.index += 1
      return token.value
    }

    if (token.type === "identifier") {
      this.index += 1

      if (token.value === "pi") return Math.PI
      if (token.value === "e") return Math.E

      const next = this.peek()
      if (next?.type !== "lparen") return null
      this.index += 1

      const value = this.parseExpression()
      if (value === null) return null
      if (this.peek()?.type !== "rparen") return null
      this.index += 1

      return applyFunction(token.value, value, this.angleMode)
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

function getBinaryPrecedence(operator: OperatorValue): number {
  switch (operator) {
    case "+":
    case "-":
      return ADDITIVE_PRECEDENCE
    case "*":
    case "/":
      return MULTIPLICATIVE_PRECEDENCE
    case "^":
    case "root":
      return POWER_PRECEDENCE
  }
}

function applyBinary(
  operator: OperatorValue,
  left: number,
  right: number,
): number | null {
  switch (operator) {
    case "+":
      return left + right
    case "-":
      return left - right
    case "*":
      return left * right
    case "/":
      return right === 0 ? null : left / right
    case "^": {
      const result = left ** right
      return Number.isFinite(result) ? result : null
    }
    case "root": {
      if (left === 0) return null
      const result = right ** (1 / left)
      if (!Number.isFinite(result)) return null
      if (Math.abs(result) < 1e-12) return 0
      return result
    }
  }
}

function applyPostfix(operator: "!" | "%", value: number) {
  switch (operator) {
    case "%":
      return value / 100
    case "!":
      return factorial(value)
  }
}

function applyFunction(name: string, value: number, angleMode: AngleMode) {
  switch (name) {
    case "percent":
      return value / 100
    case "square":
      return value * value
    case "cube":
      return value * value * value
    case "sqrt":
      return value < 0 ? null : Math.sqrt(value)
    case "cbrt":
      return Math.cbrt(value)
    case "inv":
      return value === 0 ? null : 1 / value
    case "exp":
      return safeNumber(Math.exp(value))
    case "tenpow":
      return safeNumber(10 ** value)
    case "ln":
      return value > 0 ? Math.log(value) : null
    case "log10":
      return value > 0 ? Math.log10(value) : null
    case "fact":
      return factorial(value)
    case "sin":
      return Math.sin(toRadians(value, angleMode))
    case "cos":
      return Math.cos(toRadians(value, angleMode))
    case "tan":
      return Math.tan(toRadians(value, angleMode))
    case "asin":
      return fromRadians(domainUnary(value, -1, 1, Math.asin), angleMode)
    case "acos":
      return fromRadians(domainUnary(value, -1, 1, Math.acos), angleMode)
    case "atan":
      return fromRadians(Math.atan(value), angleMode)
    case "sinh":
      return Math.sinh(value)
    case "cosh":
      return Math.cosh(value)
    case "tanh":
      return Math.tanh(value)
    case "asinh":
      return Math.asinh(value)
    case "acosh":
      return value >= 1 ? Math.acosh(value) : null
    case "atanh":
      return value > -1 && value < 1 ? Math.atanh(value) : null
    default:
      return null
  }
}

function factorial(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 170) return null
  let result = 1
  for (let index = 2; index <= value; index += 1) {
    result *= index
  }
  return result
}

function domainUnary(value: number, min: number, max: number, fn: (value: number) => number) {
  if (value < min || value > max) return null
  return fn(value)
}

function toRadians(value: number, angleMode: AngleMode) {
  return angleMode === "rad" ? value : (value * Math.PI) / 180
}

function fromRadians(value: number | null, angleMode: AngleMode) {
  if (value === null) return null
  return angleMode === "rad" ? value : (value * 180) / Math.PI
}

function safeNumber(value: number) {
  return Number.isFinite(value) ? value : null
}

export function formatComputedNumber(value: number) {
  if (!Number.isFinite(value)) return "Error"

  const rounded = Number(value.toPrecision(12))
  if (!Number.isFinite(rounded)) return "Error"
  if (Object.is(rounded, -0)) return "0"

  const absolute = Math.abs(rounded)
  if ((absolute >= 1e12 || (absolute > 0 && absolute < 1e-6)) && absolute !== 0) {
    return rounded
      .toExponential(6)
      .replace("e", "E")
      .replace(/(\.\d*?[1-9])0+E/, "$1E")
      .replace(/\.0+E/, "E")
  }

  return rounded.toString()
}

function formatNumericString(value: string, withGrouping: boolean) {
  if (value === "Error") return value
  if (value === "" || value === "-" || value === "+") return value

  const normalized = value.replace("−", "-")
  const exponentIndex = normalized.indexOf("E")
  const mantissa = exponentIndex >= 0 ? normalized.slice(0, exponentIndex) : normalized
  const exponent = exponentIndex >= 0 ? normalized.slice(exponentIndex) : ""
  const negative = mantissa.startsWith("-")
  const source = negative ? mantissa.slice(1) : mantissa
  const [whole, decimal] = source.split(".")

  const groupedWhole = withGrouping
    ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : whole

  const formattedMantissa = `${negative ? "-" : ""}${groupedWhole}${decimal !== undefined ? `.${decimal}` : ""}`
  return `${formattedMantissa}${exponent}`
}
