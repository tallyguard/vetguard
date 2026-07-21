import type { Detector } from "../model.js";
import { nonexistentPackage } from "./nonexistent-package.js";
import { youngPackage } from "./young-package.js";
import { installScripts } from "./install-scripts.js";
import { unpublishedVersion } from "./unpublished-version.js";
import { typosquat } from "./typosquat.js";
import { hallucinationName } from "./hallucination-name.js";

/** All built-in detectors. New detectors are registered here. */
export const builtinDetectors: Detector[] = [
  nonexistentPackage,
  youngPackage,
  installScripts,
  unpublishedVersion,
  typosquat,
  hallucinationName,
];
