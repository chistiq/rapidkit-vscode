import compatibility from '../../contracts/extension-cli-compatibility.v1.json';

export const EXTENSION_CLI_COMPATIBILITY_SCHEMA_VERSION = compatibility.schemaVersion;

/** Minimum linked CLI version — sourced from the npm-synced compatibility contract. */
export const MIN_RAPIDKIT_CLI_VERSION = compatibility.minimumVerifiedCliVersion;

export const PUBLISHED_CLI_CONTRACT_SCHEMAS = compatibility.publishedContractSchemas;
