export class VaultDataError extends Error {
  constructor(message = "Vault data error") {
    super(message)
    this.name = "VaultDataError"
  }
}
