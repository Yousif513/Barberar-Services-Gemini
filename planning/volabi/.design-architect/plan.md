═══════════════════════════════════════════════════════════════════
  STITCH ARCHITECT — SCOPE PLAN
═══════════════════════════════════════════════════════════════════
  Project:    Volabi / Primora AI Headquarters - proposed requirements
  Area(s):    hq
  Mode:       minimal
  Source:     BMAD docs + canonical templates + inference
  Pages: 23   Modals: 24   Drawers: 0    Popovers: 42   States: 60
  Total generations: 159

  PAGES (provenance shown)
  ┌─ []
  │  ▸ Profile                           /profile                            [closure:depth-2:from:shared-popover-user-menu::um-profile]
  │     popover:  Date range                                [closure:depth-3:from:profile::date-range]
  │     popover:  Widget menu                               [closure:depth-3:from:profile::widget-menu]
  │  ▸ Settings                          /settings                           [closure:depth-2:from:shared-popover-user-menu::um-settings]
  │     modal:    Danger zone action                        [closure:depth-3:from:settings::danger-zone]
  │  ▸ Notifications                     /settings/notifications             [closure:depth-2:from:shared-drawer-notifications::nt-settings]
  │     modal:    Danger zone action                        [closure:depth-3:from:settings-notifications::danger-zone]
  └─
  ┌─ [HQ]
  │  ▸ Agent Profile                     /hq/agents/[id]                     [bmad:front-end-spec.md:14]
  │     modal:    Request evaluation                        [closure:depth-1:from:hq-agent-profile::declared-overlay]
  │     modal:    Task readiness                            [closure:depth-1:from:hq-agent-profile::declared-inline]
  │     popover:  Date range                                [closure:depth-1:from:hq-agent-profile::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-agent-profile::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ Audit Event Detail                /hq/audit/[id]                      [bmad:front-end-spec.md:24]
  │     popover:  Date range                                [closure:depth-1:from:hq-audit-event-detail::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-audit-event-detail::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ CEO Command Center                /hq                                 [bmad:front-end-spec.md:7]
  │     popover:  Date range                                [closure:depth-1:from:hq-ceo-command-center::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-ceo-command-center::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ CEO Decision Detail               /hq/decisions/[id]                  [bmad:front-end-spec.md:12]
  │     modal:    Request changes                           [closure:depth-1:from:hq-ceo-decision-detail::declared-overlay]
  │     popover:  Date range                                [closure:depth-1:from:hq-ceo-decision-detail::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-ceo-decision-detail::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ CEO Decision Queue                /hq/decisions                       [bmad:front-end-spec.md:11]
  │     modal:    Filter                                    [closure:depth-1:from:hq-ceo-decision-queue::declared-overlay]
  │     popover:  Date range                                [closure:depth-1:from:hq-ceo-decision-queue::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-ceo-decision-queue::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ Capability Gap Matrix             /hq/capabilities                    [bmad:front-end-spec.md:17]
  │     modal:    Propose resolution                        [closure:depth-1:from:hq-capability-gap-matrix::declared-overlay]
  │     popover:  Date range                                [closure:depth-1:from:hq-capability-gap-matrix::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-capability-gap-matrix::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ Evaluation Detail                 /hq/evaluations/[id]                [bmad:front-end-spec.md:19]
  │     modal:    Propose correction                        [closure:depth-1:from:hq-evaluation-detail::declared-overlay]
  │     popover:  Date range                                [closure:depth-1:from:hq-evaluation-detail::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-evaluation-detail::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ Evaluation History                /hq/evaluations                     [bmad:front-end-spec.md:18]
  │     modal:    Request evaluation                        [closure:depth-1:from:hq-evaluation-history::declared-overlay]
  │     popover:  Date range                                [closure:depth-1:from:hq-evaluation-history::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-evaluation-history::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ HQ Workspace Settings             /hq/settings                        [bmad:front-end-spec.md:26]
  │     modal:    Locale and preferences                    [closure:depth-1:from:hq-hq-workspace-settings::declared-inline]
  │     modal:    Permission request                        [closure:depth-1:from:hq-hq-workspace-settings::declared-overlay]
  │     popover:  Date range                                [closure:depth-1:from:hq-hq-workspace-settings::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-hq-workspace-settings::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ Immutable Audit Timeline          /hq/audit                           [bmad:front-end-spec.md:23]
  │     modal:    Filter                                    [closure:depth-1:from:hq-immutable-audit-timeline::declared-overlay]
  │     popover:  Date range                                [closure:depth-1:from:hq-immutable-audit-timeline::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-immutable-audit-timeline::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ Knowledge Source Library          /hq/knowledge                       [bmad:front-end-spec.md:21]
  │     modal:    Filter                                    [closure:depth-1:from:hq-knowledge-source-library::declared-overlay]
  │     popover:  Date range                                [closure:depth-1:from:hq-knowledge-source-library::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-knowledge-source-library::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ Original Agent Directory          /hq/agents                          [bmad:front-end-spec.md:13]
  │     modal:    Filter                                    [closure:depth-1:from:hq-original-agent-directory::declared-overlay]
  │     popover:  Date range                                [closure:depth-1:from:hq-original-agent-directory::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-original-agent-directory::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ Persistent Task Queue             /hq/tasks                           [bmad:front-end-spec.md:8]
  │     modal:    Filter                                    [closure:depth-1:from:hq-persistent-task-queue::declared-overlay]
  │     popover:  Date range                                [closure:depth-1:from:hq-persistent-task-queue::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-persistent-task-queue::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ Skill Catalog                     /hq/skills                          [bmad:front-end-spec.md:15]
  │     modal:    Filter                                    [closure:depth-1:from:hq-skill-catalog::declared-overlay]
  │     popover:  Date range                                [closure:depth-1:from:hq-skill-catalog::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-skill-catalog::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ Skill Change Review               /hq/skill-changes/[id]              [bmad:front-end-spec.md:20]
  │     modal:    Compare versions                          [closure:depth-1:from:hq-skill-change-review::declared-overlay]
  │     modal:    Checked binding receipt                   [closure:depth-1:from:hq-skill-change-review::declared-inline]
  │     popover:  Date range                                [closure:depth-1:from:hq-skill-change-review::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-skill-change-review::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ Skill Detail                      /hq/skills/[id]                     [bmad:front-end-spec.md:16]
  │     modal:    Compare versions                          [closure:depth-1:from:hq-skill-detail::declared-overlay]
  │     popover:  Date range                                [closure:depth-1:from:hq-skill-detail::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-skill-detail::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ Source Evidence Detail            /hq/knowledge/[id]                  [bmad:front-end-spec.md:22]
  │     modal:    Correction proposal                       [closure:depth-1:from:hq-source-evidence-detail::declared-overlay]
  │     popover:  Date range                                [closure:depth-1:from:hq-source-evidence-detail::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-source-evidence-detail::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ Task Composer                     /hq/tasks/new                       [bmad:front-end-spec.md:9]
  │     modal:    Assess readiness                          [closure:depth-1:from:hq-task-composer::declared-inline]
  │     modal:    Attach sources                            [closure:depth-1:from:hq-task-composer::declared-overlay]
  │     popover:  Date range                                [closure:depth-1:from:hq-task-composer::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-task-composer::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ Task Workspace                    /hq/tasks/[id]                      [bmad:front-end-spec.md:10]
  │     modal:    Add source                                [closure:depth-1:from:hq-task-workspace::declared-overlay]
  │     popover:  Date range                                [closure:depth-1:from:hq-task-workspace::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-task-workspace::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  │  ▸ Tools and Connection Readiness    /hq/connections                     [bmad:front-end-spec.md:25]
  │     modal:    Request named setup                       [closure:depth-1:from:hq-tools-and-connection-readiness::declared-overlay]
  │     popover:  Date range                                [closure:depth-1:from:hq-tools-and-connection-readiness::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:hq-tools-and-connection-readiness::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  └─

═══════════════════════════════════════════════════════════════════
  THEME RESOLUTION
═══════════════════════════════════════════════════════════════════
  Source:     DESIGN.md (root)
  Path:       DESIGN.md
  Palette:    Gold (#d1af47) · Soft Gold (#f4e7b6) · Warm Ivory (#f7f3ea) · White (#ffffff) · Ink (#15120d) · Slate (#475467)
  Type:       body: Inter · heading: Georgia
  Shape:      buttons: 10px · cards: 16px
  Elevation:  soft
  Vibe:       warm

═══════════════════════════════════════════════════════════════════
  MAP VIEWS
═══════════════════════════════════════════════════════════════════
  Pick how you'd like to review the plan:

  • Text tree (what you're reading now) — always generated
  • Mermaid diagram — .stitch/architect/plan.mermaid
      renders inline in GitHub, VS Code, Obsidian
  • Interactive HTML — .stitch/architect/plan.html
      open in any browser, click to explore, filter, search
      [best for plans >80 nodes]

═══════════════════════════════════════════════════════════════════
  [A] Approve and continue
  [E] Edit — tell me what to add/remove
  [S] Scope down to MVP
  [X] Cancel
═══════════════════════════════════════════════════════════════════