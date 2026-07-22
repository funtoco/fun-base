declare module "encoding-japanese" {
  type EncodingName = "UNICODE" | "SJIS" | "UTF8" | "EUCJP" | "JIS"

  const Encoding: {
    stringToCode(input: string): number[]
    convert(
      input: number[] | Uint8Array,
      options: {
        to: EncodingName
        from?: EncodingName
      }
    ): number[]
  }

  export default Encoding
}
