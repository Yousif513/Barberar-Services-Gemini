═══════════════════════════════════════════════════════════════════
  STITCH ARCHITECT — SCOPE PLAN
═══════════════════════════════════════════════════════════════════
  Project:    Approved local Bangla/Urdu/Hindi booking/support pilot
  Area(s):    ecommerce, support
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
  │  ▸ Local booking and support pilot   /pilot/booking                      [bmad:front-end-spec.md:3]
  │     popover:  Date range                                [closure:depth-1:from:local-booking-and-support-pilot::date-range]
  │     popover:  Widget menu                               [closure:depth-1:from:local-booking-and-support-pilot::widget-menu]
  │     state:    loading
  │     state:    error
  │     state:    empty
  └─

═══════════════════════════════════════════════════════════════════
  THEME RESOLUTION
═══════════════════════════════════════════════════════════════════
  Source:     DESIGN.md (root)
  Path:       DESIGN.md
  Palette:    Unspecified (#f2eee6) · Unspecified (#171c1c) · Unspecified (#c29a4c)
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