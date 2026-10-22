# Component Map

The shared surfaces this system needs. Specified once, referenced everywhere —
this is both the design-system contract and the implementation checklist.

**14 components required · 8 worth generating · 58 variants in play**

## Data

| Component | Used by | Variants | Render | Code path |
|---|---:|---|:---:|---|
| **Chart Panel** | 5 | line, bar, area, donut, loading, empty | ✓ | `components/charts/ChartPanel` |
| **Stat Card** | 5 | default, with-trend, with-sparkline, loading, error | ✓ | `components/ui/StatCard` |

## Feedback

| Component | Used by | Variants | Render | Code path |
|---|---:|---|:---:|---|
| **Inline Alert / Banner** | 7 | info, warning, error, success, dismissible, with-action | — | `components/ui/Alert` |
| **Toast Stack** | 7 | success, warning, info, with-undo, stacked | ✓ | `components/ui/Toast` |
| **Empty State** | 5 | first-run, filtered-out, error | ✓ | `components/ui/EmptyState` |
| **Loading Skeleton** | 5 | card-grid | ✓ | `components/ui/Skeleton` |
| **Confirmation Dialog** | 2 | default, destructive, typed-confirm, with-consequences | ✓ | `components/ui/ConfirmDialog` |

## Input

| Component | Used by | Variants | Render | Code path |
|---|---:|---|:---:|---|
| **Date Range Picker** | 5 | presets, custom-calendar | — | `components/ui/DateRangePicker` |
| **Search Input** | 5 | default, focused, with-results, no-results | — | `components/ui/SearchInput` |
| **Form Field Set** | 2 | default, error, disabled, with-help, required, loading | ✓ | `components/ui/form` |

## Layout

| Component | Used by | Variants | Render | Code path |
|---|---:|---|:---:|---|
| **Navigation Shell** | 7 | expanded, collapsed, mobile-drawer | ✓ | `components/layout/AppShell` |
| **Page Header** | 7 | with-actions, with-tabs, with-breadcrumb, minimal | — | `components/layout/PageHeader` |

## Navigation

| Component | Used by | Variants | Render | Code path |
|---|---:|---|:---:|---|
| **Tab Bar** | 2 | underline, pill, with-counts | — | `components/ui/Tabs` |

## Overlay

| Component | Used by | Variants | Render | Code path |
|---|---:|---|:---:|---|
| **Modal Shell** | 0 | sm, md, lg, full, with-steps, scrollable-body | — | `components/ui/Dialog` |
