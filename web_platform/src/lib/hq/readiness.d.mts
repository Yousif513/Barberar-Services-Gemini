import type {HqAgent,HqSkill,HqSkillRequirement} from "./contracts";
export interface HqReadinessRow {skillId:string;requiredVersion:string|null;requiredSha256:string|null;currentVersion:string|null;currentSha256:string|null;instructionStatus:"met"|"missing"|"unknown";versionStatus:"met"|"failed"|"unknown";hashStatus:"met"|"failed"|"unknown";associationStatus:"proposed"|"missing"|"unknown";bindingStatus:"not-adopted";evidenceStatus:"unknown";permissionStatus:"not-granted";}
export interface HqReadinessAssessment {requirementsDeclared:boolean;executionStatus:"inactive-for-execution";rows:HqReadinessRow[];}
export function assessTaskSkills(task:{skillRequirements?:HqSkillRequirement[]}|undefined,agent:HqAgent|undefined,catalog?:HqSkill[]):HqReadinessAssessment;
