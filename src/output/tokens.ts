import { encode } from "gpt-tokenizer";

export function countTokens(value: string): number {
  return encode(value).length;
}
