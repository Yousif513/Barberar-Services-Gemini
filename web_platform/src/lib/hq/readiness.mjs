// Planning evidence only: this module never grants authority or invokes an employee.
export function assessTaskSkills(task,agent,catalog) {
  const requirements=Array.isArray(task?.skillRequirements)?task.skillRequirements:[];
  const metadataAvailable=Array.isArray(catalog);
  const rows=requirements.map(required=>{
    const current=metadataAvailable?catalog.find(skill=>skill.id===required.skillId):undefined;
    const installed=current?.installed===true;
    const requiredVersion=required.version??null,requiredSha256=required.sha256??null;
    return {skillId:required.skillId,requiredVersion,requiredSha256,
      currentVersion:installed?(current.version??null):null,currentSha256:installed?(current.sha256??null):null,
      instructionStatus:metadataAvailable?(installed?"met":"missing"):"unknown",
      versionStatus:!installed||!requiredVersion||!current.version?"unknown":current.version===requiredVersion?"met":"failed",
      hashStatus:!installed||!requiredSha256||!current.sha256?"unknown":current.sha256===requiredSha256?"met":"failed",
      associationStatus:!agent?"unknown":agent.skills?.some(skill=>skill.id===required.skillId)?"proposed":"missing",
      bindingStatus:"not-adopted",evidenceStatus:"unknown",permissionStatus:"not-granted"};
  });
  return {requirementsDeclared:requirements.length>0,executionStatus:"inactive-for-execution",rows};
}
