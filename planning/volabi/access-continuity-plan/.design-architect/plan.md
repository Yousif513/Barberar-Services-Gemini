═══════════════════════════════════════════════════════════════════
  STITCH ARCHITECT — SCOPE PLAN
═══════════════════════════════════════════════════════════════════
  Project:    (unnamed)
  Area(s):    access-continuity
  Mode:       minimal
  Source:     BMAD docs + canonical templates + inference
  Pages: 4    Modals: 2    Drawers: 0    Popovers: 4    States: 3
  Total generations: 23

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
  ┌─ [UNCATEGORIZED]
  │  ▸ Local Founder Access and Recovery  /hq/access                          [bmad:front-end-spec.md:5]
  │     popover:  Date range                                [closure:depth-1:from:local-founder-access-and-recovery::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:local-founder-access-and-recovery::widget-menu]
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
  Vibe:       professional, warm

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