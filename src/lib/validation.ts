import { ApiError } from "./auth";
export function str(
  value: unknown,
  name: string,
  max = 4000,
  required = false,
): string {
  if (value === undefined || value === null) {
    if (required) throw new ApiError(400, `${name}を入力してください。`);
    return "";
  }
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new ApiError(400, `${name}を確認してください。`);
  return value;
}
export function id(value: unknown, name = "ID") {
  return str(value, name, 100, true);
}
export function oneOf(value: unknown, values: string[], name: string) {
  if (typeof value !== "string" || !values.includes(value))
    throw new ApiError(400, `${name}を確認してください。`);
  return value;
}
export function bool(value: unknown, name: string): boolean {
  if (typeof value !== "boolean")
    throw new ApiError(400, `${name}を確認してください。`);
  return value;
}
export function integer(
  value: unknown,
  min: number,
  max: number,
  name: string,
) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new ApiError(400, `${name}を確認してください。`);
  return value;
}
export function strings(value: unknown, name: string, maxCount = 40): string[] {
  if (!Array.isArray(value) || value.length > maxCount)
    throw new ApiError(400, `${name}を確認してください。`);
  return Array.from(new Set(value.map((v) => str(v, name, 150, true))));
}
export function date(value: unknown, name: string) {
  const text = str(value, name, 50, true);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime()))
    throw new ApiError(400, `${name}を確認してください。`);
  return parsed;
}
