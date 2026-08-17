import compatibility from '../../contracts/extension-cli-compatibility.v1.json';
import releasePolicy from '../../contracts/extension-cli-release-policy.v1.json';

export const EXTENSION_CLI_COMPATIBILITY_SCHEMA_VERSION = compatibility.schemaVersion;
export const EXTENSION_CLI_RELEASE_POLICY_SCHEMA_VERSION = releasePolicy.schemaVersion;
export const VERIFIED_RAPIDKIT_CLI_VERSION = releasePolicy.verifiedCliVersion;

/**
 * Minimum linked CLI version owned by this extension release.
 *
 * The CLI-owned compatibility contract supplies published schema identities.
 * It must not own this floor: doing so would require a new CLI publication
 * whenever a later extension starts consuming capabilities from an already
 * published CLI release.
 */
export const MIN_RAPIDKIT_CLI_VERSION = releasePolicy.minimumCliVersion;

export const PUBLISHED_CLI_CONTRACT_SCHEMAS = compatibility.publishedContractSchemas;
