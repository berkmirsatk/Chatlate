/**
 * Translation-provider contract shared by registration, settings and message translation.
 * @typedef {object} Provider
 * @property {string} id Stable storage and registration identifier.
 * @property {string} name Name displayed in the application's provider picker.
 * @property {(texts: readonly string[], to: string, signal: AbortSignal) => Promise<string[]>} translateParts
 * @property {(() => string)=} cacheContext
 * @property {(() => void)=} clearCache
 * @property {(() => string)=} cooldownMessage
 */
export {};
