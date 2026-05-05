export type Operator = "+" | "-" | "*" | "/"
export type Token =
  | { type: "number"; value: number }
  | { type: "op"; value: Operator }

const operators: Operator[] = ["+", "-", "*", "/"]

function isDigit(char: string) {
  return char >= "0" && char <= "9"
}

export function parseTokens(expression: string): Token[] | null {
  const tokens: Token[] = []
  const expr = expression.replace(/\s+/g, "")
  let i = 0
  let expectingNumber = true

  while (i < expr.length) {
    const char = expr[i]

    if (operators.includes(char as Operator)) {
      if (expectingNumber) {
        if (char === "+") {
          i += 1
          continue
        }
        if (char === "-") {
          i += 1
          const parsed = readNumber(expr, i)
          if (!parsed) return null
          tokens.push({ type: "number", value: -parsed.value })
          i = parsed.nextIndex
          expectingNumber = false
          continue
        }
        return null
      }

      tokens.push({ type: "op", value: char as Operator })
      i += 1
      expectingNumber = true
      continue
    }

    const parsed = readNumber(expr, i)
    if (!parsed) return null
    tokens.push({ type: "number", value: parsed.value })
    i = parsed.nextIndex
    expectingNumber = false
  }

  if (expectingNumber && tokens.length > 0) return null
  return tokens
}

type ParsedNumber = { value: number; nextIndex: number }

function readNumber(source: string, startIndex: number): ParsedNumber | null {
  let i = startIndex
  let hasDot = false
  let hasDigit = false

  while (i < source.length) {
    const char = source[i]
    if (isDigit(char)) {
      hasDigit = true
      i += 1
      continue
    }
    if (char === ".") {
      if (hasDot) return null
      hasDot = true
      i += 1
      continue
    }
    break
  }

  if (!hasDigit) return null
  const raw = source.slice(startIndex, i)
  const value = Number(raw)
  if (!Number.isFinite(value)) return null

  return { value, nextIndex: i }
}

export function evaluateExpression(expression: string): string {
  const tokens = parseTokens(expression)
  if (!tokens || tokens.length === 0) return "0"

  const output: Token[] = []
  const stack: Operator[] = []

  const precedence: Record<Operator, number> = {
    "+": 1,
    "-": 1,
    "*": 2,
    "/": 2,
  }

  for (const token of tokens) {
    if (token.type === "number") {
      output.push(token)
      continue
    }

    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      if (precedence[top] >= precedence[token.value]) {
        output.push({ type: "op", value: stack.pop() as Operator })
      } else {
        break
      }
    }
    stack.push(token.value)
  }

  while (stack.length > 0) {
    output.push({ type: "op", value: stack.pop() as Operator })
  }

  const values: number[] = []
  for (const token of output) {
    if (token.type === "number") {
      values.push(token.value)
      continue
    }

    const right = values.pop()
    const left = values.pop()
    if (left === undefined || right === undefined) return "Error"

    let result = 0
    switch (token.value) {
      case "+":
        result = left + right
        break
      case "-":
        result = left - right
        break
      case "*":
        result = left * right
        break
      case "/":
        if (right === 0) return "Error"
        result = left / right
        break
      default:
        return "Error"
    }

    if (!Number.isFinite(result)) return "Error"
    values.push(result)
  }

  if (values.length !== 1) return "Error"
  return formatNumber(values[0])
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "Error"
  if (Object.is(value, -0)) return "0"

  const rounded = Number(value.toPrecision(12))
  return rounded.toString()
}
