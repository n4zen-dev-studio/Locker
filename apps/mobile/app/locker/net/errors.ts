export type ApiErrorKind =
  | "AUTH"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NETWORK"
  | "TIMEOUT"
  | "BAD_RESPONSE"
  | "UNKNOWN"

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  readonly details?: unknown

  constructor(kind: ApiErrorKind, message: string, options?: { status?: number; details?: unknown }) {
    super(message)
    this.name = "ApiError"
    this.kind = kind
    this.status = options?.status
    this.details = options?.details
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
}
