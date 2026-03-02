#!/usr/bin/env node
// Shared utilities for Dataverse CLI scripts.

/**
 * Convert a string to PascalCase, stripping non-alphanumeric characters.
 * @param {string} input
 * @returns {string}
 */
function toPascalCase(input) {
    return String(input)
        .trim()
        .replace(/[^a-zA-Z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
}

/**
 * Parse command-line arguments into an object.
 * Supports `--key value` pairs and `--flag` booleans.
 * @param {string[]} argv - Arguments to parse (typically process.argv.slice(2)).
 * @returns {{ positional: string[], [key: string]: string | boolean | string[] }}
 */
function parseArgs(argv) {
    const parsed = { positional: [] };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (!arg.startsWith("--")) {
            parsed.positional.push(arg);
            continue;
        }

        const key = arg.slice(2);
        const value = argv[index + 1];

        if (!value || value.startsWith("--")) {
            parsed[key] = true;
            continue;
        }

        parsed[key] = value;
        index += 1;
    }

    return parsed;
}

/**
 * Convert a string to its lowercase form (for Dataverse logical names).
 * @param {string} name
 * @returns {string}
 */
function toLogicalName(name) {
    return String(name || "").trim().toLowerCase();
}

/**
 * Maximum allowed byte length for CLI JSON arguments (--schema-json) or file contents (--plans-file).
 */
const MAX_CLI_JSON_BYTES = 1_048_576; // 1 MB

/**
 * Parse a JSON string from a CLI argument with size validation.
 * @param {string} raw - The raw JSON string.
 * @param {string} argName - The argument name for error messages.
 * @returns {any}
 */
function parseCliJson(raw, argName) {
    const str = String(raw);
    if (str.length > MAX_CLI_JSON_BYTES) {
        throw new Error(`${argName} exceeds maximum allowed size of ${MAX_CLI_JSON_BYTES} bytes.`);
    }
    try {
        return JSON.parse(str);
    } catch (error) {
        throw new Error(`Invalid ${argName} payload. ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Regex for validating GUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).
 */
const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a properly formatted GUID.
 * @param {string} value
 * @param {string} [label] - label for error messages
 * @returns {string} the validated GUID
 */
function validateGuid(value, label = "value") {
    const str = String(value || "").trim();
    if (!GUID_REGEX.test(str)) {
        throw new Error(`${label} is not a valid GUID: "${str}"`);
    }
    return str;
}

export {
    toPascalCase,
    parseArgs,
    toLogicalName,
    MAX_CLI_JSON_BYTES,
    parseCliJson,
    GUID_REGEX,
    validateGuid
};
