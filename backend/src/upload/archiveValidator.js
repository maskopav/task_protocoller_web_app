// src/upload/archiveValidator.js — CONTRACT STUB (wave 0). Implemented by task B.
// Rules: docs/upload_management/specification.md §4.1.

/**
 * @typedef {'ok'|'bad'|'warn'|'skip'} CheckResult
 * @typedef {{key: 'zip_checksum'|'archive'|'manifest'|'ids'|'device'|'config_version'|'complete',
 *            result: CheckResult, detail?: string}} Check
 *
 * @typedef {Object} ParsedArchive    null members when the file is absent or unparsable
 * @property {object|null} manifest
 * @property {object|null} examination
 * @property {object|null} participant
 * @property {object|null} snapshot          task_configuration_snapshot.json
 * @property {object|null} timelineOriginal
 * @property {object|null} timelineEdited
 *
 * @typedef {Object} ValidationResult
 * @property {Check[]} checks                 always all seven keys, in spec order
 * @property {'valid'|'invalid'} status
 * @property {'manifest'|'malformed'|'unknown_device'|null} invalidReason
 * @property {ParsedArchive} parsed
 */

/**
 * Validates one stored session ZIP. It never throws for a bad archive, because
 * that is a result. It throws only for I/O failures on a file that should exist.
 *
 * @param {string} file  absolute path of the stored ZIP
 * @param {Object} ctx
 * @param {string} ctx.sessionId              from the upload form
 * @param {string} ctx.installationId         from the upload form
 * @param {boolean} ctx.siteKnown             false = quarantined (device check fails)
 * @param {string|null} ctx.currentConfigVersion  the site's current config version, if known
 * @returns {Promise<ValidationResult>}
 */
export async function validateArchive(file, ctx) {
  throw new Error("not implemented");
}
