import type { Detector } from "../model.js";
import { nonexistentPackage } from "./nonexistent-package.js";

/** All built-in detectors. New detectors are registered here. */
export const builtinDetectors: Detector[] = [nonexistentPackage];
