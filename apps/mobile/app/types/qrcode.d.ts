declare module "qrcode" {
  const QRCode: {
    toString(input: string, options?: { type?: string; margin?: number; width?: number }): Promise<string>
  }

  export default QRCode
}
