const MODULE_SERIAL_REGEX = /^LMS-[A-Za-z0-9]{2}-[A-Za-z0-9]{2}-[A-Za-z0-9]{2}-[A-Za-z0-9]{2}-[A-Za-z0-9]{2}$/

export function isValidModuleSerial(value: string): boolean {
  return MODULE_SERIAL_REGEX.test(value.trim())
}
